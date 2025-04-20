import { Logger, LogLevel } from './logger.interface';

export class ConsoleLogger implements Logger {
  private logLevel: LogLevel = 'info';

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  debug(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('debug')) {
      console.debug(message, context || '');
    }
  }

  info(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('info')) {
      console.info(message, context || '');
    }
  }

  warn(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('warn')) {
      console.warn(message, context || '');
    }
  }

  error(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('error')) {
      console.error(message, context || '');
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const logLevels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'none'];
    const currentLevelIndex = logLevels.indexOf(this.logLevel);
    const messageLevelIndex = logLevels.indexOf(level);
    
    return messageLevelIndex >= currentLevelIndex;
  }
}
