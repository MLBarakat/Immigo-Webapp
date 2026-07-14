/**
 * Authoritative Log Severity Thresholds.
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * Enforces predictable JSON metadata structures for system aggregation tools.
 */
export interface LogContext {
  readonly component?: string;
  readonly durationMs?: number;
  readonly traceId?: string;
  readonly errorDetail?: unknown;
  readonly [key: string]: unknown;
}

interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: LogContext;
}

class ProductionTelemetryLogger {
  private readonly minLevel: LogLevel = 'INFO';
  private readonly isDevelopment: boolean;
  private readonly severityWeights: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  };

  constructor() {
    // Safely evaluate environment targets using polyfilled environment structures
    const runtimeEnv = typeof process !== 'undefined' && process.env?.NODE_ENV;
    this.isDevelopment = runtimeEnv === 'development' || runtimeEnv === 'test';
    
    if (this.isDevelopment) {
      this.minLevel = 'DEBUG';
    }
  }

  /**
   * Evaluates if an active event clears the minimum logging severity threshold.
   */
  private shouldLog(level: LogLevel): boolean {
    return this.severityWeights[level] >= this.severityWeights[this.minLevel];
  }

  /**
   * FIXED: Internal output routing channel explicitly declared as a bound property
   * to guarantee the compiler never drops context execution bindings.
   */
  private readonly emitProductionTelemetry = (entry: LogEntry): void => {
    console.log(JSON.stringify(entry));
  };

  /**
   * FIXED: Local development console formatter declared as a bound property.
   */
  private readonly renderDevelopmentConsole = (entry: LogEntry): void => {
    const styleMap: Record<LogLevel, string> = {
      DEBUG: 'color: #00b4d8; font-weight: bold;',
      INFO: 'color: #2a9d8f; font-weight: bold;',
      WARN: 'color: #e9c46a; font-weight: bold;',
      ERROR: 'color: #e76f51; font-weight: bold; background-color: #fdad9e; padding: 1px 4px; border-radius: 2px;'
    };

    const contextPayload = entry.context ? entry.context : '';
    const outputStringTemplate = `%c[${entry.level}]%c [${entry.timestamp}] ${entry.message}`;

    if (entry.level === 'ERROR') {
      console.error(outputStringTemplate, styleMap.ERROR, 'color: inherit;', contextPayload);
    } else if (entry.level === 'WARN') {
      console.warn(outputStringTemplate, styleMap.WARN, 'color: inherit;', contextPayload);
    } else if (entry.level === 'DEBUG') {
      console.debug(outputStringTemplate, styleMap.DEBUG, 'color: inherit;', contextPayload);
    } else {
      console.log(outputStringTemplate, styleMap.INFO, 'color: inherit;', contextPayload);
    }
  };

  /**
   * Strips circular references and cleans up context structures before serialization.
   */
  private sanitizeContext(context?: LogContext): LogContext | undefined {
    if (!context) return undefined;
    
    try {
      const seen = new WeakSet();
      const stringified = JSON.stringify(context, (_, value: unknown) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular Reference]';
          seen.add(value);
        }
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack,
          };
        }
        return value;
      });
      return JSON.parse(stringified) as LogContext;
    } catch {
      return { warning: 'Context data sanitization failed due to complex object layout signatures.' };
    }
  }

  /**
   * Asynchronously groups logging actions to avoid locking up main layout paint drops.
   */
  private queueWrite(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: message.trim(),
      context: this.sanitizeContext(context),
    };

    // Defers trace string execution to protect heavy animation frames
    Promise.resolve().then(() => {
      if (this.isDevelopment) {
        this.renderDevelopmentConsole(entry);
      } else {
        this.emitProductionTelemetry(entry);
      }
    }).catch((loggerError) => {
      console.error('[Telemetry-Logger-Internal-Failure]', loggerError);
    });
  }

  public debug(message: string, component?: string, context?: LogContext): void {
    this.queueWrite('DEBUG', message, { component, ...context });
  }

  public info(message: string, component?: string, context?: LogContext): void {
    this.queueWrite('INFO', message, { component, ...context });
  }

  public warn(message: string, component?: string, context?: LogContext): void {
    this.queueWrite('WARN', message, { component, ...context });
  }

  public error(message: string, component?: string, context?: LogContext): void {
    this.queueWrite('ERROR', message, { component, ...context });
  }
}

export const logger = new ProductionTelemetryLogger();