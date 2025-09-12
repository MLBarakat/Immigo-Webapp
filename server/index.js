const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } = require('@aws-sdk/client-bedrock-runtime');
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Initialize Supabase Admin Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api', limiter);

// AWS Clients
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const pollyClient = new PollyClient({ region: process.env.AWS_REGION });

// --- Security: Basic Input Sanitization ---
const sanitizeInput = (text) => {
    // Remove characters that could be used for prompt injection attacks.
    // This is a basic example; a production system might use a more robust library.
    if (!text) return '';
    return text.replace(/[<>{}[\]|`~@#$%^&*_+=]/g, '');
};


// Secure Authentication Middleware
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token is required.' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  req.user = user;
  next();
};

// API Routes
app.get('/api/history', authenticate, async (req, res) => {
  const { data, error } = await supabase
   .from('messages')
   .select('role, content, created_at')
   .eq('user_id', req.user.id)
   .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching history:', error);
    return res.status(500).json({ error: 'Failed to fetch conversation history.' });
  }
  res.json(data);
});

app.post('/api/conversation', authenticate, async (req, res) => {
    const { message, conversationHistory, voiceId } = req.body;
    const sanitizedMessage = sanitizeInput(message);

    if (!sanitizedMessage) {
        return res.status(400).json({ error: 'Message content is required.' });
    }

    try {
        const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
        const prompt = {
            anthropic_version: 'bedrock-2023-05-31',
            max_tokens: 2048,
            messages: [
                ...conversationHistory.map(msg => ({ role: msg.role, content: msg.content })),
                { role: 'user', content: sanitizedMessage },
            ],
        };

        const command = new InvokeModelWithResponseStreamCommand({
            modelId,
            contentType: 'application/json',
            body: JSON.stringify(prompt),
        });

        const bedrockResponseStream = await bedrockClient.send(command);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Transfer-Encoding', 'chunked');

        let fullResponseText = "";
        for await (const event of bedrockResponseStream.body) {
            if (event.chunk) {
                const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
                if (chunk.type === 'content_block_delta') {
                    const textChunk = chunk.delta.text;
                    fullResponseText += textChunk;
                    res.write(JSON.stringify({ type: 'text_chunk', data: textChunk }) + '\n');
                }
            }
        }

        // Once text is complete, generate audio and send it
        const pollyCommand = new SynthesizeSpeechCommand({
            Engine: 'neural',
            OutputFormat: 'mp3',
            Text: fullResponseText,
            VoiceId: voiceId || 'Joanna',
        });
        const pollyResponse = await pollyClient.send(pollyCommand);
        const audioBuffer = await streamToBuffer(pollyResponse.AudioStream);
        const responseAudio = audioBuffer.toString('base64');
        res.write(JSON.stringify({ type: 'audio_chunk', data: responseAudio }) + '\n');


        // Persist conversation turn to DB concurrently
        await Promise.all([
            supabase.from('messages').insert({ user_id: req.user.id, role: 'user', content: sanitizedMessage }),
            supabase.from('messages').insert({ user_id: req.user.id, role: 'assistant', content: fullResponseText })
        ]);

        res.end();

    } catch (error) {
        console.error('Error in /api/conversation:', error);
        // Ensure response is properly ended on error
        if (!res.headersSent) {
            res.status(500).json({ error: 'An error occurred while processing your request.' });
        } else {
            res.end();
        }
    }
});

const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});