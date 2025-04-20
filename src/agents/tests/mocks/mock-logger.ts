import { Logger } from '../../../shared/logger/logger.interface';
import { LogLevel } from '../../../shared/logger/console-logger';

interface LogMessage {
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
}

/**
 * Mock logger for testing
 */
export class MockLogger implements Logger {
  public messages: LogMessage[] = [];
  private logLevel: LogLevel = 'info';
  
  // Added for backward compatibility with existing tests
  public get currentLogLevel(): LogLevel {
    return this.logLevel;
  }
  
  public set currentLogLevel(level: LogLevel) {
    this.logLevel = level;
  }

  /**
   * Set the log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.currentLogLevel = level; // Update for backward compatibility
  }

  /**
   * Clear all logged messages
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * Get logs of a specific level
   */
  getLogsByLevel(level: LogLevel): LogMessage[] {
    return this.messages.filter(msg => msg.level === level);
  }

  /**
   * Check if a specific message was logged
   */
  hasMessage(messageSubstring: string, level?: LogLevel): boolean {
    return this.messages.some(
      (log) =>
        log.message.includes(messageSubstring) &&
        (level === undefined || log.level === level),
    );
  }

  log(level: LogLevel, message: string, context?: any): void {
    this.messages.push({ level, message, context });
  }

  setContext?(context: Record<string, any>): void {
    // No-op for mock
  }

  clearContext?(): void {
    // No-op for mock
  }

  debug(message: string, context?: Record<string, any>): void {
    this.messages.push({ level: 'debug', message, context });
  }

  info(message: string, context?: Record<string, any>): void {
    this.messages.push({ level: 'info', message, context });
  }

  warn(message: string, context?: Record<string, any>): void {
    this.messages.push({ level: 'warn', message, context });
  }

  error(message: string, context?: Record<string, any>): void {
    this.messages.push({ level: 'error', message, context });
  }

  /**
   * Get all messages
   */
  getMessages(): LogMessage[] {
    return this.messages;
  }

  getLogs(level?: LogLevel): LogMessage[] {
    if (level) {
      return this.messages.filter((log) => log.level === level);
    }
    return this.messages;
  }
}
