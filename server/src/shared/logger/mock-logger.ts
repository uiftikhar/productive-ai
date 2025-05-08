import { LogLevel, Logger } from './logger.interface';

/**
 * Mock implementation of the Logger interface for testing
 */
export class MockLogger implements Logger {
  public logs: {
    level: string;
    message: string;
    meta?: Record<string, any>;
  }[] = [];
  
  private logLevel: LogLevel = LogLevel.DEBUG;

  /**
   * Set the minimum log level to record
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }


  debug(message: string, meta?: Record<string, any>): void {
    if (['debug', 'info', 'warn', 'error'].includes(this.logLevel)) {
      this.logs.push({ level: 'debug', message, meta });
    }
  }
  
  log(level: LogLevel, message: string, meta?: Record<string, any>): void {
    if (['debug', 'info', 'warn', 'error'].includes(this.logLevel)) {
      this.logs.push({ level: 'debug', message, meta });
    }
  }

  info(message: string, meta?: Record<string, any>): void {
    if (['info', 'warn', 'error'].includes(this.logLevel)) {
      this.logs.push({ level: 'info', message, meta });
    }
  }

  warn(message: string, meta?: Record<string, any>): void {
    // For testing, always log warnings regardless of log level
    this.logs.push({ level: 'warn', message, meta });
  }

  error(message: string, meta?: Record<string, any>): void {
    // For testing, always log errors regardless of log level
    this.logs.push({ level: 'error', message, meta });
  }

  /**
   * Get logs of a specific level
   */
  getLogs(level?: string): Array<{ level: string; message: string; meta?: Record<string, any> }> {
    if (level) {
      return this.logs.filter((log) => log.level === level);
    }
    return this.logs;
  }

  /**
   * Check if a specific message was logged
   */
  hasMessage(message: string, level?: string): boolean {
    return this.logs.some(
      (log) => log.message.includes(message) && (!level || log.level === level)
    );
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
  }
} 