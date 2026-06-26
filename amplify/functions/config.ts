import express, { Request, Response, NextFunction } from 'express';
import serverless from 'serverless-http';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './logger';
import { AppError } from './errors';
import configRouter from './routes/config';

const app = express();

// Global Security & Request Parsing Middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// Request logging middleware for debugging traceability
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.debug(`Incoming request to config service: ${req.method} ${req.path}`);
  next();
});

// Route Registration (Maps /api/config cleanly)
app.use('/api', configRouter);

// 404 Fallback Handler for undefined resources inside this function container
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Route not found in config service: ${req.method} ${req.path}`, 404));
});

// Centralized Stage 1 Compliant Error Handling Middleware
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const appError = err instanceof AppError
    ? err
    : new AppError('An unexpected error occurred in the config service.', 500, false);

  logger.error(appError.message, appError, {
    isOperational: appError.isOperational,
    context: appError.context,
    path: req.path,
    method: req.method,
  });

  // Safe error masking - hide detailed stack metrics in production environments
  const isDevelopment = process.env.NODE_ENV === 'DEV' || process.env.NODE_ENV === 'development';
  const errorMessage = isDevelopment || appError.isOperational
    ? appError.message
    : 'An internal server error occurred.';

  res.status(appError.statusCode).json({ error: errorMessage });
});

// Export serverless wrapper handler for AWS Amplify pipeline deployment integration
export const handler = serverless(app);