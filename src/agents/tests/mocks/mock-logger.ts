import { Logger } from '../../../shared/logger/logger.interface';

/**
 * Mock logger for testing
 */
export class MockLogger implements Logger {
  public logs: Array<{
    level: string;
    message: string;
    meta?: Record<string, any>;
  }> = [];

  public currentLogLevel: string = 'info';

  debug(message: string, meta?: Record<string, any>): void {
    this.logs.push({ level: 'debug', message, meta });
  }

  info(message: string, meta?: Record<string, any>): void {
    this.logs.push({ level: 'info', message, meta });
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.logs.push({ level: 'warn', message, meta });
  }

  error(message: string, meta?: Record<string, any>): void {
    this.logs.push({ level: 'error', message, meta });
  }

  /**
   * Set the log level
   */
  setLogLevel(level: string): void {
    this.currentLogLevel = level;
  }

  /**
   * Clear all logged messages
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Get logs of a specific level
   */
  getLogsByLevel(level: string): Array<{
    level: string;
    message: string;
    meta?: Record<string, any>;
  }> {
    return this.logs.filter((log) => log.level === level);
  }

  /**
   * Check if a specific message was logged
   */
  hasMessage(messageSubstring: string, level?: string): boolean {
    return this.logs.some(
      (log) =>
        log.message.includes(messageSubstring) &&
        (level === undefined || log.level === level),
    );
  }
}
