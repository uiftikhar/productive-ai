/**
 * Standard API response types
 */

// HTTP status codes with descriptions
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  TOO_MANY_REQUESTS = 429,
  UNPROCESSABLE_ENTITY = 422,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

// Error types for API responses
export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  CONFLICT_ERROR = 'CONFLICT_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_INPUT = 'INVALID_INPUT',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
}

// Base API response interface
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    timestamp: string;
    requestId?: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    [key: string]: any;
  };
}

// Error response details
export interface ApiError {
  type: ErrorType;
  code: string;
  message: string;
  details?: any;
  stack?: string; // Only in development
}

// Standard API error
export class ApiErrorException extends Error {
  type: ErrorType;
  status: HttpStatus;
  code: string;
  details?: any;
  
  constructor(
    message: string, 
    type: ErrorType = ErrorType.INTERNAL_SERVER_ERROR, 
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    code: string = 'ERR_INTERNAL',
    details?: any
  ) {
    super(message);
    this.name = 'ApiErrorException';
    this.type = type;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Validation error
export class ValidationErrorException extends ApiErrorException {
  constructor(message: string = 'Validation failed', details?: any) {
    super(
      message,
      ErrorType.VALIDATION_ERROR,
      HttpStatus.BAD_REQUEST,
      'ERR_VALIDATION',
      details
    );
    this.name = 'ValidationErrorException';
  }
}

// Resource not found error
export class NotFoundErrorException extends ApiErrorException {
  constructor(resource: string = 'Resource', resourceId?: string) {
    const message = resourceId 
      ? `${resource} with ID ${resourceId} was not found` 
      : `${resource} not found`;
    
    super(
      message,
      ErrorType.RESOURCE_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'ERR_NOT_FOUND'
    );
    this.name = 'NotFoundErrorException';
  }
}

// Authentication error
export class AuthenticationErrorException extends ApiErrorException {
  constructor(message: string = 'Authentication failed') {
    super(
      message,
      ErrorType.AUTHENTICATION_ERROR,
      HttpStatus.UNAUTHORIZED,
      'ERR_AUTHENTICATION'
    );
    this.name = 'AuthenticationErrorException';
  }
}

// Authorization error
export class AuthorizationErrorException extends ApiErrorException {
  constructor(message: string = 'You are not authorized to access this resource') {
    super(
      message,
      ErrorType.AUTHORIZATION_ERROR,
      HttpStatus.FORBIDDEN,
      'ERR_AUTHORIZATION'
    );
    this.name = 'AuthorizationErrorException';
  }
}

// Rate limit error
export class RateLimitErrorException extends ApiErrorException {
  constructor(message: string = 'Rate limit exceeded') {
    super(
      message,
      ErrorType.RATE_LIMIT_EXCEEDED,
      HttpStatus.TOO_MANY_REQUESTS,
      'ERR_RATE_LIMIT'
    );
    this.name = 'RateLimitErrorException';
  }
} 