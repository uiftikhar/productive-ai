/**
 * API Response Utilities
 * 
 * This file contains utility functions for creating standardized API responses
 */

import { Response } from 'express';
import { ApiResponse, ApiError, HttpStatus, ErrorType, ApiErrorException } from './types';

/**
 * Create a standardized successful API response
 * 
 * @param data Response data
 * @param meta Additional metadata
 * @returns Standardized success response object
 */
export function createSuccessResponse<T>(data?: T, meta?: any): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * Create a standardized error response
 * 
 * @param error Error information
 * @param meta Additional metadata
 * @returns Standardized error response object
 */
export function createErrorResponse(error: ApiError, meta?: any): ApiResponse {
  return {
    success: false,
    error,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
}

/**
 * Format error details for an API error response
 * 
 * @param err Error object
 * @param isDev Whether running in development mode
 * @returns Formatted API error
 */
export function formatApiError(err: any, isDev: boolean = process.env.NODE_ENV === 'development'): ApiError {
  // If it's already an ApiErrorException, use its properties
  if (err instanceof ApiErrorException) {
    const error: ApiError = {
      type: err.type,
      code: err.code,
      message: err.message,
      details: err.details
    };
    
    // Only include stack trace in development
    if (isDev) {
      error.stack = err.stack;
    }
    
    return error;
  }
  
  // For standard errors, create a generic format
  const error: ApiError = {
    type: ErrorType.INTERNAL_SERVER_ERROR,
    code: 'ERR_INTERNAL',
    message: err.message || 'An unexpected error occurred'
  };
  
  // Only include stack trace in development
  if (isDev) {
    error.stack = err.stack;
  }
  
  return error;
}

/**
 * Send success response
 * 
 * @param res Express response object
 * @param data Response data
 * @param status HTTP status code (default 200)
 * @param meta Additional metadata
 */
export function sendSuccess<T>(
  res: Response, 
  data?: T, 
  status: number = HttpStatus.OK, 
  meta?: any
): void {
  res.status(status).json(createSuccessResponse(data, meta));
}

/**
 * Send error response
 * 
 * @param res Express response object
 * @param err Error object
 * @param status HTTP status code (default derived from error or 500)
 * @param meta Additional metadata
 */
export function sendError(
  res: Response, 
  err: any, 
  status?: number, 
  meta?: any
): void {
  // Determine status code
  const statusCode = status || 
    (err instanceof ApiErrorException ? err.status : HttpStatus.INTERNAL_SERVER_ERROR);
  
  // Format error and send response
  const isDev = process.env.NODE_ENV === 'development';
  const apiError = formatApiError(err, isDev);
  
  res.status(statusCode).json(createErrorResponse(apiError, meta));
}

/**
 * Create an API response middleware for Express
 * 
 * Attaches methods for standard responses to the Express response object
 */
export function apiResponseMiddleware() {
  return (req: any, res: Response, next: Function) => {
    // Add response helpers to res object
    res.sendSuccess = function<T>(data?: T, status: number = HttpStatus.OK, meta?: any) {
      sendSuccess(this, data, status, meta);
    };
    
    res.sendError = function(err: any, status?: number, meta?: any) {
      sendError(this, err, status, meta);
    };
    
    res.sendCreated = function<T>(data?: T, meta?: any) {
      sendSuccess(this, data, HttpStatus.CREATED, meta);
    };
    
    res.sendNoContent = function() {
      this.status(HttpStatus.NO_CONTENT).end();
    };
    
    res.sendBadRequest = function(message?: string, details?: any) {
      const err = new ApiErrorException(
        message || 'Bad request',
        ErrorType.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'ERR_BAD_REQUEST',
        details
      );
      sendError(this, err);
    };
    
    res.sendNotFound = function(resource?: string, id?: string) {
      const message = resource 
        ? (id ? `${resource} with ID ${id} not found` : `${resource} not found`)
        : 'Resource not found';
        
      const err = new ApiErrorException(
        message,
        ErrorType.RESOURCE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'ERR_NOT_FOUND'
      );
      sendError(this, err);
    };
    
    next();
  };
}

// Extend Express Response interface to include our custom methods
declare global {
  namespace Express {
    interface Response {
      sendSuccess<T>(data?: T, status?: number, meta?: any): void;
      sendError(err: any, status?: number, meta?: any): void;
      sendCreated<T>(data?: T, meta?: any): void;
      sendNoContent(): void;
      sendBadRequest(message?: string, details?: any): void;
      sendNotFound(resource?: string, id?: string): void;
    }
  }
} 