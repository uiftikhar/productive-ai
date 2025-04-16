import { Logger } from './logger.interface';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

export class ConsoleLogger implements Logger {
  private logLevel: LogLevel = 'info';

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  debug(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}`, context || '');
    }
  }

  info(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, context || '');
    }
  }

  warn(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, context || '');
    }
  }

  error(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, context || '');
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error', 'none'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const requestedLevelIndex = levels.indexOf(level);
    return requestedLevelIndex >= currentLevelIndex;
  }
}
