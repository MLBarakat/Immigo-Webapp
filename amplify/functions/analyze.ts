import http from 'http';
import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';
import { Router } from 'express';

const analyzeRouter = Router();

// Analysis endpoint
analyzeRouter.post('/analyze', async (req, res) => {
  const { conversationHistory } = req.body;
  
  if (!conversationHistory || conversationHistory.length === 0) {
    return res.status(400).json({ error: 'Conversation history is required for analysis.' });
  }

  try {
    // Implementation moved from conversation.ts
    res.json({ analysis: 'Analysis functionality moved to dedicated endpoint' });
  } catch {
    res.status(500).json({ error: 'Failed to analyze conversation.' });
  }
});

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '2mb' })); // Reduced for analysis only

app.use('/api', analyzeRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export const handler = serverless(app, {
  binary: ['application/json'],
  request: (request: http.IncomingMessage) => {
    console.log(`[Analysis] ${request.method} ${request.path}`);
    return request;
  }
});