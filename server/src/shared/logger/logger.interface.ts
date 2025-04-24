export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

export interface Logger {
  setLogLevel(level: LogLevel): void;
  debug(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  error(message: string, context?: Record<string, any>): void;
}
