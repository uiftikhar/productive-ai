import { Logger } from './logger.interface.ts';

export class ConsoleLogger implements Logger {
  debug(message: string, context?: Record<string, any>): void {
    console.debug(`[DEBUG] ${message}`, context || '');
  }

  info(message: string, context?: Record<string, any>): void {
    console.log(`[INFO] ${message}`, context || '');
  }

  warn(message: string, context?: Record<string, any>): void {
    console.warn(`[WARN] ${message}`, context || '');
  }

  error(message: string, context?: Record<string, any>): void {
    console.error(`[ERROR] ${message}`, context || '');
  }
}
