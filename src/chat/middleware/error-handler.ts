/**
 * Error handling middleware for chat service
 */

import { Request, Response, NextFunction } from 'express';
import { ChatServiceError, ChatErrorType } from '../chat.types';

/**
 * Map of error types to HTTP status codes
 */
const ERROR_STATUS_MAP: Record<ChatErrorType, number> = {
  [ChatErrorType.SESSION_NOT_FOUND]: 404,
  [ChatErrorType.USER_NOT_FOUND]: 404,
  [ChatErrorType.INVALID_REQUEST]: 400,
  [ChatErrorType.GENERATION_FAILED]: 500,
  [ChatErrorType.SERVICE_UNAVAILABLE]: 503,
  [ChatErrorType.RATE_LIMIT_EXCEEDED]: 429
};

/**
 * Express middleware to handle chat service errors and convert them to
 * appropriate HTTP responses
 */
export function chatErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If headers already sent, let Express default error handler deal with it
  if (res.headersSent) {
    return next(err);
  }
  
  // Determine status code and format the error response
  if (err instanceof ChatServiceError) {
    const statusCode = ERROR_STATUS_MAP[err.type] || 500;
    
    res.status(statusCode).json({
      error: {
        type: err.type,
        message: err.message,
        details: err.details
      }
    });
  } else {
    // For unknown errors, return a generic response
    console.error('Unhandled error in chat service:', err);
    
    res.status(500).json({
      error: {
        type: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred'
      }
    });
  }
} 