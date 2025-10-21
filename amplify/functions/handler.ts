import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';

import settingsRouter from './routes/settings';
import historyRouter from './routes/history';
import conversationRouter from './routes/conversation';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', settingsRouter);
app.use('/api', historyRouter);
app.use('/api', conversationRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

export const handler = serverless(app, {
  binary: ['application/json', 'application/octet-stream'],
  request: (request: any) => {
    // Log incoming requests in CloudWatch
    console.log(`${request.method} ${request.path}`);
    return request;
  }
});