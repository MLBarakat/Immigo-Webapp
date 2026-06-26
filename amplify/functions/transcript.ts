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
app.use(express.json()); // Body parsing layer attached

app.use('/api', transcriptRouter);

app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Resource route not found in transcript container: ${req.method} ${req.path}`, 404));
});

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const appError = err instanceof AppError
    ? err
    : new AppError('An unexpected error transpired in transcript capture handler.', 500, false);

  logger.error(appError.message, appError, { path: req.path, method: req.method });

  const isDevelopment = process.env.NODE_ENV === 'DEV' || process.env.NODE_ENV === 'development';
  const errorMessage = isDevelopment || appError.isOperational
    ? appError.message
    : 'An internal server error occurred.';

  res.status(appError.statusCode).json({ error: errorMessage });
});

export const handler = serverless(app);