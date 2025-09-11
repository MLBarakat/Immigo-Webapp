const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } = require('@aws-sdk/client-bedrock-runtime');
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
  },
});

app.use('/api', limiter);

// AWS Clients
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const pollyClient = new PollyClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

// Auth middleware
const authenticateRequest = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header',
    });
  }

  const token = authHeader.substring(7);
  
  // In production, validate JWT token here
  if (token !== process.env.API_KEY && token !== 'demo-key') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
  }

  next();
};

// Logging middleware
app.use((req, res, next) => {
  const requestId = uuidv4();
  req.requestId = requestId;
  
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  }));
  
  next();
});

// Utility functions
function sanitizeInput(text) {
  if (typeof text !== 'string') return '';
  
  // Basic sanitization - remove potential prompt injection attempts
  const sanitized = text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\bsystem\b|\bassistant\b|\buser\b/gi, '') // Remove role-like keywords
    .trim();
    
  // Limit length
  return sanitized.substring(0, 1000);
}

async function streamBedrockResponse(message, conversationHistory) {
  const messages = [
    ...conversationHistory.slice(-5).map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
    {
      role: 'user',
      content: message,
    },
  ];

  const params = {
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1000,
      temperature: 0.7,
      messages,
      system: 'You are a helpful AI assistant. Keep responses conversational and concise for voice interaction. Respond in 1-3 sentences unless more detail is specifically requested.',
    }),
  };

  const command = new InvokeModelWithResponseStreamCommand(params);
  const response = await bedrockClient.send(command);

  let fullResponse = '';
  const decoder = new TextDecoder();

  for await (const chunk of response.body) {
    if (chunk.chunk?.bytes) {
      const chunkStr = decoder.decode(chunk.chunk.bytes);
      const lines = chunkStr.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'content_block_delta' && data.delta?.text) {
              fullResponse += data.delta.text;
            }
          } catch (error) {
            console.error('Error parsing streaming chunk:', error);
          }
        }
      }
    }
  }

  return fullResponse.trim();
}

async function synthesizeSpeech(text) {
  const params = {
    Text: text,
    OutputFormat: 'mp3',
    VoiceId: 'Joanna',
    Engine: 'neural',
  };

  try {
    const command = new SynthesizeSpeechCommand(params);
    const response = await pollyClient.send(command);
    
    const audioStream = response.AudioStream;
    const audioBuffer = Buffer.concat(await audioStream.toArray());
    return audioBuffer.toString('base64');
  } catch (error) {
    console.error('Polly synthesis error:', error);
    throw new Error('Text-to-speech synthesis failed');
  }
}

// Routes
app.get('/health', authenticateRequest, (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.post('/api/conversation', authenticateRequest, async (req, res) => {
  const startTime = Date.now();
  const { requestId } = req;
  
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message is required and must be a string',
      });
    }

    const sanitizedMessage = sanitizeInput(message);
    if (!sanitizedMessage) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message cannot be empty after sanitization',
      });
    }

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId,
      event: 'conversation_start',
      messageLength: sanitizedMessage.length,
      historyLength: conversationHistory.length,
    }));

    // Stream response from Bedrock
    const bedrockStartTime = Date.now();
    const responseText = await streamBedrockResponse(sanitizedMessage, conversationHistory);
    const bedrockLatency = Date.now() - bedrockStartTime;

    if (!responseText) {
      throw new Error('Empty response from Bedrock');
    }

    // Synthesize speech
    const ttsStartTime = Date.now();
    let responseAudio = '';
    
    try {
      responseAudio = await synthesizeSpeech(responseText);
    } catch (ttsError) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        event: 'tts_error',
        error: ttsError.message,
      }));
      
      // Continue without audio for graceful degradation
    }
    
    const ttsLatency = Date.now() - ttsStartTime;
    const totalLatency = Date.now() - startTime;

    // Log metrics
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId,
      event: 'conversation_complete',
      metrics: {
        totalLatency,
        bedrockLatency,
        ttsLatency,
        responseLength: responseText.length,
        audioGenerated: !!responseAudio,
      },
    }));

    res.json({
      responseText,
      responseAudio,
    });

  } catch (error) {
    const totalLatency = Date.now() - startTime;
    
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId,
      event: 'conversation_error',
      error: error.message,
      stack: error.stack,
      latency: totalLatency,
    }));

    if (error.name === 'AbortError') {
      return res.status(499).json({
        error: 'Request Cancelled',
        message: 'Request was cancelled by client',
      });
    }

    res.status(502).json({
      error: 'Service Error',
      message: 'Failed to process conversation request',
      requestId,
    });
  }
});

// Error handler
app.use((error, req, res, next) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    requestId: req.requestId || 'unknown',
    event: 'unhandled_error',
    error: error.message,
    stack: error.stack,
  }));

  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    requestId: req.requestId,
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
  });
});

app.listen(port, () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'server_start',
    port,
    env: process.env.NODE_ENV || 'development',
  }));
});

module.exports = app;