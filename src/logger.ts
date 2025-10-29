const isDev = import.meta.env.DEV;

interface LogContext {
  [key: string]: any;
}

const log = (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string, context?: LogContext) => {
  // In development, log all levels. In production, only log warnings and errors.
  if (!isDev && (level === 'DEBUG' || level === 'INFO')) {
    return;
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  switch (level) {
    case 'ERROR':
      console.error('[ERROR]', logEntry);
      // In a real app, you would send this to a logging service (Sentry, Datadog, etc.)
      break;
    case 'WARN':
      console.warn('[WARN]', logEntry);
      break;
    case 'INFO':
      // Use console.log for info to avoid verbose browser UI
      console.log('[INFO]', logEntry);
      break;
    case 'DEBUG':
    default:
      console.log('[DEBUG]', logEntry);
      break;
  }
};

export const logger = {
  debug: (message: string, context?: LogContext) => log('DEBUG', message, context),
  info: (message: string, context?: LogContext) => log('INFO', message, context),
  warn: (message: string, context?: LogContext) => log('WARN', message, context),
  error: (message: string, error?: any, context?: LogContext) => {
    const errorContext: LogContext = {
      ...context,
    };

    if (error instanceof Error) {
        errorContext.errorMessage = error.message;
        // Stack traces are invaluable for debugging, but can be large. Only log in dev.
        if (isDev) {
            errorContext.stack = error.stack;
        }
    } else if (typeof error === 'string') {
        errorContext.errorMessage = error;
    }

    log('ERROR', message, errorContext);
  },
};
