const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } = require('@aws-sdk/client-bedrock-runtime');
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
require('dotenv').config();

const app = express();
const port = process.env.PORT |

| 3001;

// Initialize Supabase Admin Client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN |

| 'http://localhost:5173' }));
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

// Secure Authentication Middleware
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader ||!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token is required.' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error ||!user) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
  req.user = user;
  next();
};

// API Routes
app.get('/api/history', authenticate, async (req, res) => {
  const { data, error } = await supabase
   .from('messages')
   .select('role, content')
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

  try {
    // Bedrock and Polly logic remains here...
    // For brevity, this is a placeholder for the AI interaction
    const fullResponseText = `This is a simulated response to: "${message}"`;

    // Persist the conversation turn to the database
    const { error: userMessageError } = await supabase
     .from('messages')
     .insert({ user_id: req.user.id, role: 'user', content: message });

    const { error: assistantMessageError } = await supabase
     .from('messages')
     .insert({ user_id: req.user.id, role: 'assistant', content: fullResponseText });

    if (userMessageError |

| assistantMessageError) {
      throw new Error('Failed to save conversation to database.');
    }

    // Polly TTS generation
    const pollyCommand = new SynthesizeSpeechCommand({
        Engine: 'neural',
        OutputFormat: 'mp3',
        Text: fullResponseText,
        VoiceId: voiceId |

| 'Joanna',
    });
    const pollyResponse = await pollyClient.send(pollyCommand);
    const audioStream = pollyResponse.AudioStream;
    const audioBuffer = await streamToBuffer(audioStream);
    const responseAudio = audioBuffer.toString('base64');

    res.json({ responseText: fullResponseText, responseAudio });

  } catch (error) {
    console.error('Error in /api/conversation:', error);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});

const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks =;
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});