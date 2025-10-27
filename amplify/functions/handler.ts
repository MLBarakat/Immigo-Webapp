import http from 'http';
import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';
import expressWs from 'express-ws';

import settingsRouter from './routes/settings';
import historyRouter from './routes/history';
import conversationRouter from './routes/conversation';
import { setupWebSocketProxy } from './routes/websocket';

const app = express();
const wsInstance = expressWs(app);

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
setupWebSocketProxy(wsInstance);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
  request: (request: http.IncomingMessage) => {
    // Log incoming requests in CloudWatch
    console.log(`${request.method} ${request.url}`);
    return request;
  }
});