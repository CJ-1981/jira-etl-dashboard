/**
 * Centralized logging utility
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  data?: unknown;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs in memory

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private log(level: LogLevel, message: string, context?: string, data?: unknown, error?: Error): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: this.formatTimestamp(),
      context,
      data,
      error: error ? {
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined,
        name: error.name
      } : undefined
    };

    // Store in memory (circular buffer)
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output with colors
    const colors = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m',  // green
      warn: '\x1b[33m',  // yellow
      error: '\x1b[31m'  // red
    };
    const reset = '\x1b[0m';

    const prefix = `${colors[level]}[${level.toUpperCase()}]${reset} ${entry.timestamp}`;
    const contextStr = context ? ` [${context}]` : '';
    const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : '';
    const errorStr = error ? `\n${error.stack || error.message}` : '';
    const formattedMessage = `${prefix}${contextStr}: ${message}${dataStr}${errorStr}`;

    // Use the appropriate console method so errors appear in stderr and
    // get proper stack trace formatting in terminal/browser environments
    switch (level) {
      case 'error':
        console.error(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'debug':
        console.debug(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  debug(message: string, context?: string, data?: unknown): void {
    if (this.isDevelopment) {
      this.log('debug', message, context, data);
    }
  }

  info(message: string, context?: string, data?: unknown): void {
    this.log('info', message, context, data);
  }

  warn(message: string, context?: string, data?: unknown): void {
    this.log('warn', message, context, data);
  }

  error(message: string, context?: string, error?: Error, data?: unknown): void {
    this.log('error', message, context, data, error);
  }

  // Get recent logs
  getLogs(level?: LogLevel, limit = 100): LogEntry[] {
    let filtered = this.logs;
    if (level) {
      filtered = filtered.filter(log => log.level === level);
    }
    return filtered.slice(-limit);
  }

  // Clear logs
  clearLogs(): void {
    this.logs = [];
  }

  // Export logs as JSON
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

// Singleton instance
export const logger = new Logger();

// Convenience functions
export const log = {
  debug: (message: string, context?: string, data?: unknown) => logger.debug(message, context, data),
  info: (message: string, context?: string, data?: unknown) => logger.info(message, context, data),
  warn: (message: string, context?: string, data?: unknown) => logger.warn(message, context, data),
  error: (message: string, context?: string, error?: Error, data?: unknown) => logger.error(message, context, error, data)
};

// Export types
export type { LogLevel, LogEntry };