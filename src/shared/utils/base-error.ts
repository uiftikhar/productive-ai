/**
 * Base error class for the application
 * Extends the native Error class with additional properties
 */
export class BaseError extends Error {
  public readonly name: string;
  public readonly cause?: Error;
  public readonly statusCode?: number;

  constructor(message: string, options?: {
    cause?: Error;
    statusCode?: number;
    name?: string;
  }) {
    super(message);
    
    this.name = options?.name || this.constructor.name;
    this.cause = options?.cause;
    this.statusCode = options?.statusCode;
    
    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * NotFoundError - Used when a requested resource cannot be found
 */
export class NotFoundError extends BaseError {
  constructor(message: string, options?: Omit<ConstructorParameters<typeof BaseError>[1], 'statusCode'>) {
    super(message, { 
      ...options,
      statusCode: 404
    });
  }
}

/**
 * ValidationError - Used for validation failures
 */
export class ValidationError extends BaseError {
  constructor(message: string, options?: Omit<ConstructorParameters<typeof BaseError>[1], 'statusCode'>) {
    super(message, { 
      ...options,
      statusCode: 400
    });
  }
}

/**
 * ConfigurationError - Used when there's an issue with configuration
 */
export class ConfigurationError extends BaseError {
  constructor(message: string, options?: Omit<ConstructorParameters<typeof BaseError>[1], 'statusCode'>) {
    super(message, { 
      ...options,
      statusCode: 500
    });
  }
}

/**
 * ServiceError - Used for errors in service implementations
 */
export class ServiceError extends BaseError {
  constructor(message: string, options?: Omit<ConstructorParameters<typeof BaseError>[1], 'statusCode'>) {
    super(message, { 
      ...options,
      statusCode: 500
    });
  }
} 