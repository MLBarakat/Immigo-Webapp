import http from 'http';
import express from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';
import settingsRouter from './routes/settings';
import historyRouter from './routes/history';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json({ limit: '1mb' })); // Reduced for utility endpoints

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', settingsRouter);
app.use('/api', historyRouter);

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
  binary: ['application/json'],
  request: (request: http.IncomingMessage) => {
    console.log(`[Utility] ${request.method} ${request.path}`);
    return request;
  }
});