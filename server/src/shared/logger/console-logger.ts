/**
 * Console Logger Implementation
 * Standard console logger that implements the Logger interface
 */
import { Logger, LogLevel } from './logger.interface';

/**
 * Configuration for console logger
 */
export interface ConsoleLoggerConfig {
  level?: LogLevel;
  includeTimestamps?: boolean;
  includeNamespace?: boolean;
  namespace?: string;
  colorize?: boolean;
}

/**
 * Console-based logger implementation
 */
export class ConsoleLogger implements Logger {
  private level: LogLevel;
  private includeTimestamps: boolean;
  private includeNamespace: boolean;
  private namespace: string;
  private colorize: boolean;
  
  /**
   * Create a new console logger
   */
  constructor(config: ConsoleLoggerConfig = {}) {
    this.level = config.level || LogLevel.INFO;
    this.includeTimestamps = config.includeTimestamps !== false;
    this.includeNamespace = config.includeNamespace !== false;
    this.namespace = config.namespace || 'app';
    this.colorize = config.colorize !== false;
  }
  
  /**
   * Log at debug level
   */
  debug(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, meta);
  }
  
  /**
   * Log at info level
   */
  info(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, meta);
  }
  
  /**
   * Log at warning level
   */
  warn(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, meta);
  }
  
  /**
   * Log at error level
   */
  error(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, meta);
  }
  
  /**
   * Log at specified level
   */
  log(level: LogLevel, message: string, meta?: Record<string, any>): void {
    // Check if we should log at this level
    if (!this.shouldLog(level)) {
      return;
    }
    
    const timestamp = this.includeTimestamps ? new Date().toISOString() : '';
    const namespace = this.includeNamespace ? this.namespace : '';
    
    // Build log prefix
    let prefix = '';
    if (timestamp) {
      prefix += `[${timestamp}] `;
    }
    if (namespace) {
      prefix += `[${namespace}] `;
    }
    prefix += `[${level.toUpperCase()}]`;
    
    // Build the log message
    let logMessage = `${prefix} ${message}`;
    
    // Add metadata if provided
    if (meta && Object.keys(meta).length > 0) {
      try {
        const metaString = JSON.stringify(meta, this.safeStringify);
        logMessage += ` ${metaString}`;
      } catch (error) {
        logMessage += ' [Error serializing metadata]';
      }
    }
    
    // Log to console with appropriate method
    switch (level) {
      case LogLevel.DEBUG:
        if (this.colorize) {
          console.debug('\x1b[90m%s\x1b[0m', logMessage); // Gray
        } else {
          console.debug(logMessage);
        }
        break;
      case LogLevel.INFO:
        if (this.colorize) {
          console.info('\x1b[32m%s\x1b[0m', logMessage); // Green
        } else {
          console.info(logMessage);
        }
        break;
      case LogLevel.WARN:
        if (this.colorize) {
          console.warn('\x1b[33m%s\x1b[0m', logMessage); // Yellow
        } else {
          console.warn(logMessage);
        }
        break;
      case LogLevel.ERROR:
        if (this.colorize) {
          console.error('\x1b[31m%s\x1b[0m', logMessage); // Red
        } else {
          console.error(logMessage);
        }
        break;
      default:
        console.log(logMessage);
    }
  }
  
  /**
   * Set the logger's minimum log level
   */
  setLogLevel(level: LogLevel): void {
    this.level = level;
  }
  
  /**
   * Check if a level should be logged based on the logger's minimum level
   */
  private shouldLog(level: LogLevel): boolean {
    const levelPriority: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3
    };
    
    return levelPriority[level] >= levelPriority[this.level];
  }
  
  /**
   * Safe JSON.stringify replacer that handles circular references
   */
  private safeStringify(_key: string, value: any): any {
    const seen = new Set();
    return (function replacer(_key: string, value: any): any {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    })('', value);
  }
}
