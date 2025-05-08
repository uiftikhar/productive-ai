/**
 * Logger Utility
 *
 * Provides a simple logger instance that delegates to the appropriate
 * logging mechanism based on the environment.
 */

import { Logger, LogLevel } from '../logger/logger.interface';
import { ConsoleLogger } from '../logger/console-logger';

// Create default logger instance
const loggerInstance: Logger = new ConsoleLogger();

// Set default log level based on environment
if (process.env.NODE_ENV === 'development') {
  loggerInstance.log(LogLevel.DEBUG, 'Setting global log level');
} else if (process.env.NODE_ENV === 'test') {
  loggerInstance.log(LogLevel.WARN, 'Setting global log level');
} else {
  loggerInstance.log(LogLevel.INFO, 'Setting global log level');
}

/**
 * Global logger instance for use throughout the application
 */
export const logger: Logger = loggerInstance;

/**
 * Set the global log level
 * @param level - Log level to set
 */
export function setGlobalLogLevel(level: LogLevel): void {
  logger.log(level, 'Setting global log level');
}

/**
 * Create a new logger with a specific context
 * @param context - Context to attach to all logs
 * @returns Logger instance with context
 */
export function createContextLogger(context: string): Logger {
  return {
    log: (level: LogLevel, message: string, ctx?: Record<string, any>) =>
      logger.log(level, message, { ...ctx, context }),
    debug: (message: string, ctx?: Record<string, any>) =>
      logger.debug(message, { ...ctx, context }),
    info: (message: string, ctx?: Record<string, any>) =>
      logger.info(message, { ...ctx, context }),
    warn: (message: string, ctx?: Record<string, any>) =>
      logger.warn(message, { ...ctx, context }),
    error: (message: string, ctx?: Record<string, any>) =>
      logger.error(message, { ...ctx, context }),
  };
}
