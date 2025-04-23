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
  [ChatErrorType.RATE_LIMIT_EXCEEDED]: 429,
  [ChatErrorType.CONTEXT_STORAGE_ERROR]: 500,
  [ChatErrorType.CONTEXT_RETRIEVAL_ERROR]: 500,
  [ChatErrorType.CONTEXT_MANAGEMENT_ERROR]: 500,
  [ChatErrorType.FILE_UPLOAD_ERROR]: 500,
  [ChatErrorType.FILE_PROCESSING_ERROR]: 500,
  [ChatErrorType.MULTI_AGENT_ERROR]: 500,
  [ChatErrorType.PRESENCE_UPDATE_ERROR]: 500,
  [ChatErrorType.ANALYTICS_ERROR]: 500
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