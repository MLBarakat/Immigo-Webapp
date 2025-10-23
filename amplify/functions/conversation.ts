import http from 'http';
import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';
import conversationRouter from './routes/conversation';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '5mb' })); // Reduced from 10mb for streaming

app.use('/api', conversationRouter);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export const handler = serverless(app, {
  binary: ['application/json', 'application/octet-stream'],
  request: (request: http.IncomingMessage) => {
    console.log(`[Conversation] ${request.method} ${request.path}`);
    return request;
  }
});