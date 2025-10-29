import express, { Request, Response, NextFunction } from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';

import { logger } from './logger';
import { AppError } from './errors';
import settingsRouter from './routes/settings';

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.debug(`Incoming request to settings service: ${req.method} ${req.path}`)
  next();
});

// Use the router for the actual logic
app.use('/api', settingsRouter);

// 404 handler for routes not found within this service
app.use((req: Request, res: Response, _next: NextFunction) => {
  const message = `Route not found in settings service: ${req.method} ${req.path}`;
  logger.warn(message, { path: req.path, method: req.method });
  res.status(404).json({ error: 'Not Found', message });
});

// Centralized error handling middleware for the settings service
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  const appError = err instanceof AppError ? err : new AppError('An unexpected error occurred in the settings service.', 500, false);

  logger.error(appError.message, appError, {
    isOperational: appError.isOperational,
    context: appError.context,
    path: req.path,
    method: req.method,
  });

  const errorMessage = process.env.NODE_ENV === 'development' || appError.isOperational
    ? appError.message
    : 'An internal server error occurred.';

  res.status(appError.statusCode).json({ error: errorMessage });
});

export const handler = serverless(app);
