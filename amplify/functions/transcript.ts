// amplify/functions/transcript.ts
import express, { Request, Response, NextFunction } from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './logger';
import { AppError } from './errors';
import transcriptRouter from './routes/transcript';

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use('/api', transcriptRouter);

// 404 handler for unmatched routes
app.use((req: Request, res: Response) => {
  logger.warn('404 Not Found', { path: req.path });
  res.status(404).json({ error: 'Not Found' });
});

// Centralized error handling middleware
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const appError = err instanceof AppError ? err : new AppError('An unexpected error occurred in the transcript service.', 500, false);
  logger.error(appError.message, { error: appError, path: req.path });
  
  // Do not expose detailed error messages in production
  const errorMessage = process.env.NODE_ENV === 'development' || appError.isOperational
    ? appError.message
    : 'An internal server error occurred.';
    
  res.status(appError.statusCode).json({ error: errorMessage });
});

export const handler = serverless(app);