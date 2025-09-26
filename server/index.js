const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
const { createClient: createDeepgramClient } = require('@deepgram/sdk');
const { v4: uuidv4 } = require('uuid');

require('dotenv').config();

// --- Server Setup ---
const app = express();
const server = createServer(app); // Create an HTTP server from the Express app
const wss = new WebSocketServer({ server }); // Attach the WebSocket server to the HTTP server
const port = process.env.PORT || 3001;

// --- Client Initializations ---
const supabase = createSupabaseClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const pollyClient = new PollyClient({ region: process.env.AWS_REGION });
const deepgram = createDeepgramClient(process.env.DEEPGRAM_API_KEY);

// --- Logger ---
const logger = {
  info: (message, context = {}) => console.log(JSON.stringify({ level: 'INFO', timestamp: new Date().toISOString(), message, ...context })),
  error: (message, context = {}) => console.error(JSON.stringify({ level: 'ERROR', timestamp: new Date().toISOString(), message, ...context }))
};

// --- Middleware ---
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

// --- WebSocket Server for Real-time Transcription ---
wss.on('connection', (ws) => {
  logger.info('Client connected via WebSocket');

  const deepgramConnection = deepgram.listen.live({
    model: 'nova-2',
    language: 'en-US',
    smart_format: true,
    interim_results: false,
    endpointing: '250',
    utterance_end_ms: '1000'
  });

  deepgramConnection.on('open', () => {
    logger.info('Deepgram connection opened');

    deepgramConnection.on('transcript', (data) => {
      const transcript = data.channel.alternatives[0].transcript;
      if (transcript && data.is_final) {
        logger.info('Received final transcript from Deepgram', { transcript });
        ws.send(JSON.stringify({ type: 'transcript', data: transcript }));
      }
    });

    deepgramConnection.on('error', (err) => logger.error('Deepgram error', { error: err }));
    deepgramConnection.on('close', () => logger.info('Deepgram connection closed'));

    ws.on('message', (message) => {
      if (deepgramConnection.getReadyState() === 1) {
        deepgramConnection.send(message);
      }
    });

    ws.on('close', () => {
      logger.info('Client disconnected from WebSocket');
      if (deepgramConnection.getReadyState() === 1) {
        deepgramConnection.finish();
      }
    });
  });
});

// --- Authentication and Utility Functions ---
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.get('X-API-Key');
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }
  next();
};
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
const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });

// --- Existing HTTP REST Endpoints ---
app.use('/api', apiKeyAuth);

app.get('/api/settings', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    logger.error('Error fetching settings:', { error });
    return res.status(500).json({ error: 'Failed to fetch settings.' });
  }
  res.json(data || {});
});

app.put('/api/settings', authenticate, async (req, res) => {
  const { user_id, ...settingsToUpdate } = req.body;
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ user_id: req.user.id, ...settingsToUpdate, updated_at: new Date() })
    .select()
    .single();

  if (error) {
    logger.error('Error updating settings:', { error });
    return res.status(500).json({ error: 'Failed to update settings.' });
  }
  res.json(data);
});

app.get('/api/history', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, timestamp:created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('Error fetching history:', { error });
    return res.status(500).json({ error: 'Failed to fetch conversation history.' });
  }
  res.json({ history: data });
});

app.post('/api/conversation/analyze', authenticate, async (req, res) => {
  const requestId = uuidv4();
  const { conversationHistory } = req.body;

  logger.info('Analysis request received', { requestId, userId: req.user.id });

  if (!conversationHistory || conversationHistory.length === 0) {
    return res.status(400).json({ error: 'Conversation history is required for analysis.' });
  }

  try {
    const transcript = conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    const modelId = 'anthropic.claude-3-sonnet-20240229-v1:0';
    const prompt = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      system: "You are an expert English language coach for USCIS interview preparation. Analyze the following conversation transcript. The user is practicing for their interview. Provide constructive feedback on their grammar, clarity, and word choice. Be encouraging and provide 2-3 specific, actionable suggestions for improvement. Respond in JSON format with two keys: 'summary' (a brief, encouraging paragraph) and 'suggestions' (an array of strings).",
      messages: [{ role: 'user', content: `Here is the transcript:\n\n${transcript}` }],
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      body: JSON.stringify(prompt),
      accept: 'application/json',
    });

    const apiResponse = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(apiResponse.body));
    const feedbackText = responseBody.content[0].text;

    logger.info('Analysis generated successfully', { requestId, userId: req.user.id });
    res.json(JSON.parse(feedbackText));

  } catch (err) {
    const errorDetails = { requestId, userId: req.user.id, errorMessage: err.message };
    logger.error('Error in /api/conversation/analyze', errorDetails);
    res.status(500).json({ error: 'Failed to analyze conversation.', errorId: requestId });
  }
});

app.post('/api/conversation', authenticate, async (req, res) => {
  const requestId = uuidv4();
  const { message, conversationHistory, voiceId } = req.body;

  logger.info('Conversation request received', { requestId, userId: req.user.id });

  const sanitizedMessage = sanitizeInput(message);
  if (!sanitizedMessage) {
    logger.error('Validation failed: Message content is required', { requestId, userId: req.user.id });
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

    logger.info('Bedrock stream finished', { requestId, responseLength: fullResponseText.length });

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

    logger.info('Polly synthesis finished', { requestId });

    await Promise.all([
      supabase.from('messages').insert({ user_id: req.user.id, role: 'user', content: sanitizedMessage }),
      supabase.from('messages').insert({ user_id: req.user.id, role: 'assistant', content: fullResponseText })
    ]);

    logger.info('Messages saved to Supabase', { requestId });

    res.end();

  } catch (err) {
    const errorDetails = {
      requestId,
      userId: req.user.id,
      errorMessage: err.message,
      stack: err.stack,
      name: err.name,
    };
    logger.error('Unhandled error in /api/conversation', errorDetails);

    if (!res.headersSent) {
      res.status(500).json({ error: 'An internal server error occurred. Please try again later.', errorId: requestId });
    } else {
      res.end();
    }
  }
});

// --- Start Server ---
server.listen(port, () => {
  console.log(`Server with WebSocket listening on port ${port}`);
});