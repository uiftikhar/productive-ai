/**
 * Utilities for standardized error handling and detailed logging
 */
import { Logger } from '../logger/logger.interface';

/**
 * Standard format for error details to ensure consistent error reporting
 */
export interface ErrorDetails {
  message: string;
  stack?: string;
  name?: string;
  code?: string;
  component?: string;
  operation?: string;
  context?: Record<string, any>;
  originalError?: any;
}

/**
 * Creates an enhanced error with detailed information for better debugging
 */
export function createEnhancedError(
  message: string,
  originalError: any,
  context?: Record<string, any>
): Error {
  const enhancedError = new Error(message);
  
  // Add detailed error information
  (enhancedError as any).originalError = originalError;
  (enhancedError as any).context = context;
  (enhancedError as any).timestamp = new Date().toISOString();
  
  return enhancedError;
}

/**
 * Extracts detailed error information from any error object
 */
export function extractErrorDetails(error: any, context?: Record<string, any>): ErrorDetails {
  return {
    message: error.message || 'Unknown error',
    stack: error.stack,
    name: error.name,
    code: error.code,
    originalError: error,
    context: {
      ...context,
      ...(error.context || {})
    }
  };
}

/**
 * Logs error details with standardized format
 */
export function logDetailedError(
  logger: Logger,
  errorMessage: string,
  error: any,
  component: string,
  operation: string,
  context?: Record<string, any>
): void {
  const errorDetails: ErrorDetails = {
    message: error.message || 'Unknown error',
    stack: error.stack,
    name: error.name,
    code: error.code,
    component,
    operation,
    context: {
      ...context,
      ...(error.context || {})
    }
  };
  
  logger.error(`${errorMessage}: ${errorDetails.message}`, { error: errorDetails });
}

/**
 * Utility to wrap async functions with standardized error handling
 */
export function withErrorHandling<T>(
  fn: (...args: any[]) => Promise<T>,
  logger: Logger,
  component: string,
  operation: string
): (...args: any[]) => Promise<T> {
  return async (...args: any[]): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error: any) {
      // Log error with detailed information
      logDetailedError(logger, `Error in ${component}.${operation}`, error, component, operation, {
        arguments: args.map(arg => {
          // Don't try to stringify complex objects or functions
          if (arg === null || arg === undefined) return arg;
          if (typeof arg === 'function') return '[Function]';
          if (typeof arg === 'object') {
            try {
              // Try to get a simplified version of the object
              return Object.keys(arg);
            } catch (e) {
              return '[Object]';
            }
          }
          return arg;
        })
      });
      
      // Create and throw enhanced error
      const enhancedError = createEnhancedError(
        `Error in ${component}.${operation}: ${error.message}`,
        error,
        { component, operation }
      );
      
      throw enhancedError;
    }
  };
} 