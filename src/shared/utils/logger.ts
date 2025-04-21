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
  loggerInstance.setLogLevel('debug');
} else if (process.env.NODE_ENV === 'test') {
  loggerInstance.setLogLevel('warn');
} else {
  loggerInstance.setLogLevel('info');
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
  logger.setLogLevel(level);
}

/**
 * Create a new logger with a specific context
 * @param context - Context to attach to all logs
 * @returns Logger instance with context
 */
export function createContextLogger(context: string): Logger {
  return {
    setLogLevel: (level: LogLevel) => logger.setLogLevel(level),
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