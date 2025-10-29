interface LogEntry {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  timestamp: string;
  message: string;
  [key: string]: any;
}

const log = (entry: LogEntry) => {
  // In a real-world scenario, you might integrate with a logging service.
  // For now, we'll just use console.log but with structured JSON.
  console.log(JSON.stringify(entry));
};

const isDev = process.env.NODE_ENV === 'DEV';

export const logger = {
  debug: (message: string, context?: object) => {
    if (isDev) {
      log({ level: 'DEBUG', timestamp: new Date().toISOString(), message, ...context });
    }
  },
  info: (message: string, context?: object) => {
    if (isDev) {
      log({ level: 'INFO', timestamp: new Date().toISOString(), message, ...context });
    }
  },
  warn: (message: string, context?: object) => {
    log({ level: 'WARN', timestamp: new Date().toISOString(), message, ...context });
  },
  error: (message: string, error?: Error, context?: object) => {
    const logEntry: LogEntry = {
      level: 'ERROR',
      timestamp: new Date().toISOString(),
      message,
      ...context,
    };
    if (error) {
      logEntry.errorMessage = error.message;
      if (isDev) {
        logEntry.stack = error.stack;
      }
    }
    log(logEntry);
  },
};
