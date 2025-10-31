type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  [key: string]: any;
}

const LOG_LEVEL_HIERARCHY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Default to INFO if LOG_LEVEL is not set or is an invalid value
const configuredLogLevel = (process.env.LOG_LEVEL?.toUpperCase() as LogLevel) || 'INFO';
const currentLogLevelNumber = LOG_LEVEL_HIERARCHY[configuredLogLevel] ?? LOG_LEVEL_HIERARCHY.INFO;

const log = (level: LogLevel, message: string, context?: object) => {
  // Only log if the message's level is at or above the configured level
  if (LOG_LEVEL_HIERARCHY[level] < currentLogLevelNumber) {
    return;
  }

  const logEntry: LogEntry = {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...context,
  };

  // Use console.error for ERROR level to ensure it appears correctly in CloudWatch
  if (level === 'ERROR') {
    console.error(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
};

export const logger = {
  debug: (message: string, context?: object) => log('DEBUG', message, context),
  info: (message: string, context?: object) => log('INFO', message, context),
  warn: (message: string, context?: object) => log('WARN', message, context),
  error: (message: string, error?: any, context?: object) => {
    const errorContext: { [key: string]: any } = { ...context };

    if (error instanceof Error) {
      errorContext.errorMessage = error.message;
      // Only include stack traces in DEBUG mode for brevity in production logs
      if (currentLogLevelNumber === LOG_LEVEL_HIERARCHY.DEBUG) {
        errorContext.stack = error.stack;
      }
    } else if (typeof error === 'string') {
      errorContext.errorMessage = error;
    }

    log('ERROR', message, errorContext);
  },
};