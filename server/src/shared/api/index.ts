/**
 * API Utilities Module
 * 
 * Exports all API-related utilities for standardized API development.
 */

// Types and error models
export * from './types';

// Response utilities
export * from './response';

// Error handling middleware
export * from './error-middleware';

// Request ID handling
export * from './request-id';

// API versioning
export * from './version-middleware';

// API configuration defaults
export const DEFAULT_API_VERSIONS = [
  { prefix: 'v1', latest: true }
];

/**
 * Configure the Express application with standard API middleware
 * @param app Express application
 * @param options Configuration options
 */
export function configureApiMiddleware(app: any, options: any = {}) {
  const { logger } = options;
  
  // Import middleware
  const { apiResponseMiddleware } = require('./response');
  const { errorHandlerMiddleware, notFoundMiddleware, setupUncaughtExceptionHandler } = require('./error-middleware');
  const { apiVersionMiddleware } = require('./version-middleware');
  
  // Apply response utilities middleware
  app.use(apiResponseMiddleware());
  
  // Apply API versioning middleware
  if (options.enableVersioning !== false) {
    app.use(apiVersionMiddleware({
      versions: options.apiVersions || DEFAULT_API_VERSIONS,
      defaultVersion: options.defaultApiVersion,
      headerKey: options.apiVersionHeader
    }));
  }
  
  // Set up global uncaught exception handler
  if (options.handleUncaughtExceptions !== false) {
    setupUncaughtExceptionHandler(logger);
  }
  
  // Store middleware for later use at the end of the pipeline
  app.use(function storeErrorHandlers(req: any, res: any, next: any) {
    // Attach middleware to the app for use after routes are defined
    if (!app._errorHandler) {
      app._errorHandler = errorHandlerMiddleware(logger);
      app._notFoundHandler = notFoundMiddleware();
    }
    next();
  });
  
  // Return a function to apply the error handlers at the end of the pipeline
  return function applyErrorHandlers() {
    // Add 404 handler for unmatched routes
    app.use(app._notFoundHandler);
    
    // Add the error handling middleware
    app.use(app._errorHandler);
  };
} 