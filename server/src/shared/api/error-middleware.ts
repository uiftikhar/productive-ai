/**
 * API Error Handling Middleware
 */
import { Request, Response, NextFunction } from 'express';
import { ApiErrorException, ErrorType, HttpStatus } from './types';
import { Logger } from '../logger/logger.interface';
import { ConsoleLogger } from '../logger/console-logger';
import { sendError } from './response';
import { getRequestId } from './request-id';

// Types for our error context
interface ErrorContext {
  requestId: string;
  path: string;
  method: string;
  ip: string;
  timestamp: string;
  userId?: string;
  body?: any;
  query?: any;
}

/**
 * Extract safe context information for logging from a request
 */
function extractErrorContext(req: Request): ErrorContext {
  // Get or generate a request ID
  const requestId = getRequestId(req);
  
  // Sanitize request body to avoid logging sensitive info
  const sanitizeBody = (body: any) => {
    if (!body) return undefined;
    
    // Create a shallow copy
    const sanitized = { ...body };
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'creditCard'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  };
  
  return {
    requestId,
    path: req.path,
    method: req.method,
    ip: req.ip || 'unknown',
    timestamp: new Date().toISOString(),
    userId: (req as any).user?.id, // Get user ID if authentication is present
    body: sanitizeBody(req.body),
    query: req.query
  };
}

/**
 * Format an error for logging with full context
 */
function formatErrorForLogging(err: any, context: ErrorContext) {
  const errorDetails = {
    message: err.message || 'Unknown error',
    stack: err.stack,
    type: err instanceof ApiErrorException ? err.type : ErrorType.INTERNAL_SERVER_ERROR,
    status: err instanceof ApiErrorException ? err.status : HttpStatus.INTERNAL_SERVER_ERROR,
    code: err instanceof ApiErrorException ? err.code : 'ERR_INTERNAL',
    details: err instanceof ApiErrorException ? err.details : undefined,
    context
  };
  
  return errorDetails;
}

/**
 * Error handling middleware factory
 */
export function errorHandlerMiddleware(logger: Logger = new ConsoleLogger()) {
  return (err: any, req: Request, res: Response, next: NextFunction) => {
    // Extract context for logging
    const context = extractErrorContext(req);
    
    // Format error for logging with context
    const errorDetails = formatErrorForLogging(err, context);
    
    // Log error with appropriate severity
    const status = err instanceof ApiErrorException ? err.status : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500) {
      logger.error('API Error', errorDetails);
    } else if (status >= 400) {
      logger.warn('API Error', errorDetails);
    } else {
      logger.info('API Error', errorDetails);
    }
    
    // Add request ID to response headers for correlation
    res.set('X-Request-ID', context.requestId);
    
    // Send standardized error response
    sendError(res, err, status, { requestId: context.requestId });
  };
}

/**
 * Not found (404) middleware for unmatched routes
 */
export function notFoundMiddleware() {
  return (req: Request, res: Response) => {
    const err = new ApiErrorException(
      `Route not found: ${req.method} ${req.path}`,
      ErrorType.RESOURCE_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'ERR_ROUTE_NOT_FOUND'
    );
    
    // Generate request ID if not already present
    const requestId = getRequestId(req);
    res.set('X-Request-ID', requestId);
    
    sendError(res, err, HttpStatus.NOT_FOUND, { requestId });
  };
}

/**
 * Uncaught exception handler for the process
 */
export function setupUncaughtExceptionHandler(logger: Logger = new ConsoleLogger()) {
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', {
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });
    
    // Give logger time to flush, then exit
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
      reason,
      promise,
      timestamp: new Date().toISOString()
    });
  });
} 