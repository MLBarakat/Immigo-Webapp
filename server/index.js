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

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const pollyClient = new PollyClient({ region: process.env.AWS_REGION });

const allowedOrigins = [process.env.CORS_ORIGIN, 'http://127.0.0.1:5173', 'http://localhost:5173'];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));

app.use(helmet());
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api', limiter);

const apiKeyAuth = (req, res, next) => {
  const apiKey = req.get('X-API-Key');
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }
  next();
};
app.use('/api', apiKeyAuth);

const sanitizeInput = (text) => {
  if (!text) return '';
  return text.replace(/[<>{}[\]|`~@#$%^&*_+=]/g, '');
};

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

app.get('/api/settings', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  if (error && error.code !== 'PGRST116') { // Ignore 'no rows' error, it's not a failure
    console.error('Error fetching settings:', error);
    return res.status(500).json({ error: 'Failed to fetch settings.' });
  }
  res.json(data || {}); // Return empty object if no settings found yet
});

app.put('/api/settings', authenticate, async (req, res) => {
  // Prevent user from updating the user_id
  const { user_id, ...settingsToUpdate } = req.body;

  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ user_id: req.user.id, ...settingsToUpdate, updated_at: new Date() })
    .select()
    .single();

  if (error) {
    console.error('Error updating settings:', error);
    return res.status(500).json({ error: 'Failed to update settings.' });
  }
  res.json(data);
});

app.get('/api/history', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, timestamp:created_at') // CORRECTED QUERY
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching history:', error);
    return res.status(500).json({ error: 'Failed to fetch conversation history.' });
  }
  res.json({ history: data }); // Return as { history: [...] }
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
        ...(conversationHistory || []).map(msg => ({ role: msg.role, content: msg.content })),
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
          res.write(JSON.stringify({ type: 'text', data: textChunk }) + '\n');
        }
      }
    }

    const pollyCommand = new SynthesizeSpeechCommand({
      Engine: 'neural',
      OutputFormat: 'mp3',
      Text: fullResponseText,
      VoiceId: voiceId || 'Joanna',
    });
    const pollyResponse = await pollyClient.send(pollyCommand);
    const audioBuffer = await streamToBuffer(pollyResponse.AudioStream);
    const responseAudio = audioBuffer.toString('base64');
    res.write(JSON.stringify({ type: 'audio', data: responseAudio }) + '\n');

    await Promise.all([
      supabase.from('messages').insert({ user_id: req.user.id, role: 'user', content: sanitizedMessage }),
      supabase.from('messages').insert({ user_id: req.user.id, role: 'assistant', content: fullResponseText })
    ]);

    res.end();

  } catch (error) {
    console.error('Error in /api/conversation:', error);
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