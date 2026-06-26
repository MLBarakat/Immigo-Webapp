// amplify/functions/conversation.ts

import express, { Request, Response, NextFunction } from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './logger';
import { AppError } from './errors';
import conversationRouter from './routes/conversation';
import analyzeRouter from './routes/analyze';

const app = express();

// Core Global Request Pipeline Middleware Configuration
app.use(cors());
app.use(helmet());
app.use(express.json()); // Fix 2: Explicit json body-parsing middleware injected

// Direct incoming requests to their respective Express sub-routers
app.use('/api', conversationRouter);
app.use('/api', analyzeRouter);

// Fallback Route for dead-end requests
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Resource route not found in conversation microservice: ${req.method} ${req.path}`, 404));
});

// Centralized Stage 1 Compliant Error Handling Middleware
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const appError = err instanceof AppError
    ? err
    : new AppError('An unexpected server error occurred in conversation engine.', 500, false);

  logger.error(appError.message, appError, { path: req.path, method: req.method });

  const isDevelopment = process.env.NODE_ENV === 'DEV' || process.env.NODE_ENV === 'development';
  const errorMessage = isDevelopment || appError.isOperational
    ? appError.message
    : 'An internal server error occurred.';

  res.status(appError.statusCode).json({ error: errorMessage });
});

export const handler = serverless(app);