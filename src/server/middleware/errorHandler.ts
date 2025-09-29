import { Request, Response, NextFunction } from 'express';

interface AppError extends Error {
statusCode?: number;
}

const errorHandler = (
    err: AppError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
// Log the error for developers, but don't expose it to the client
console.error(err.stack);

  // If headers have already been sent, delegate to the default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Send a generic, non-descriptive error message to the client
  res.status(err.statusCode || 500).json({
    message: err.message || 'An internal server error occurred.',
  });
};

export default errorHandler;