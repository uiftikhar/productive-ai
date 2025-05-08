/**
 * Logger Interface
 * Used by human-in-the-loop components for consistent logging
 */

/**
 * Standard log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * Logger interface for consistent logging across services
 */
export interface Logger {
  /**
   * Log at debug level
   */
  debug(message: string, meta?: Record<string, any>): void;
  
  /**
   * Log at info level
   */
  info(message: string, meta?: Record<string, any>): void;
  
  /**
   * Log at warning level
   */
  warn(message: string, meta?: Record<string, any>): void;
  
  /**
   * Log at error level
   */
  error(message: string, meta?: Record<string, any>): void;
  
  /**
   * Log at specified level
   */
  log(level: LogLevel, message: string, meta?: Record<string, any>): void;
}
