/**
 * API Versioning Middleware
 * 
 * This middleware handles API versioning and compatibility
 */
import { Request, Response, NextFunction, Router } from 'express';
import { ApiErrorException, ErrorType, HttpStatus } from './types';

/**
 * API version configuration
 */
export interface ApiVersionConfig {
  prefix: string;          // URL prefix (e.g., 'v1', 'v2')
  deprecated?: boolean;    // Whether this version is deprecated
  sunset?: Date;           // When this version will be removed
  latest?: boolean;        // Whether this is the latest version
}

/**
 * Options for the API versioning middleware
 */
export interface ApiVersionOptions {
  versions: ApiVersionConfig[];  // Supported versions
  defaultVersion?: string;       // Default version to use if none specified
  headerKey?: string;            // Header key for version specification
}

/**
 * Get the current API version from a request
 * 
 * First checks the path, then headers, then query
 */
export function getApiVersion(req: Request, options: ApiVersionOptions): string | null {
  // First check if version is in the path
  const path = req.path;
  for (const version of options.versions) {
    if (path.startsWith(`/${version.prefix}`)) {
      return version.prefix;
    }
  }
  
  // Then check if version is in headers
  const headerKey = options.headerKey || 'x-api-version';
  const headerVersion = req.headers[headerKey];
  if (headerVersion) {
    return headerVersion.toString();
  }
  
  // Finally check if version is in query
  const queryVersion = req.query.version;
  if (queryVersion) {
    return queryVersion.toString();
  }
  
  // Return default version or null
  return options.defaultVersion || null;
}

/**
 * Check if a given API version is valid
 */
export function isValidVersion(version: string, options: ApiVersionOptions): boolean {
  return options.versions.some(v => v.prefix === version);
}

/**
 * API versioning middleware
 */
export function apiVersionMiddleware(options: ApiVersionOptions) {
  // Validate options
  if (!options.versions || options.versions.length === 0) {
    throw new Error('API versioning middleware requires at least one version');
  }
  
  // Set default version to the latest version if not specified
  if (!options.defaultVersion) {
    const latestVersion = options.versions.find(v => v.latest);
    if (latestVersion) {
      options.defaultVersion = latestVersion.prefix;
    } else {
      // Default to the last version in the array
      options.defaultVersion = options.versions[options.versions.length - 1].prefix;
    }
  }
  
  return function(req: Request, res: Response, next: NextFunction) {
    // Get API version from request
    const version = getApiVersion(req, options);
    
    // If no version found and no default, reject
    if (!version && !options.defaultVersion) {
      const err = new ApiErrorException(
        'API version not specified',
        ErrorType.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'ERR_API_VERSION_REQUIRED'
      );
      return next(err);
    }
    
    // If version is invalid, reject
    if (version && !isValidVersion(version, options)) {
      const err = new ApiErrorException(
        `Invalid API version: ${version}`,
        ErrorType.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        'ERR_INVALID_API_VERSION'
      );
      return next(err);
    }
    
    // Get the version configuration
    const versionConfig = options.versions.find(v => 
      v.prefix === (version || options.defaultVersion)
    );
    
    // Add warning header for deprecated version
    if (versionConfig?.deprecated) {
      res.set('Warning', '299 - "This API version is deprecated"');
      
      // Add Sunset header if applicable
      if (versionConfig.sunset) {
        res.set('Sunset', versionConfig.sunset.toISOString());
      }
    }
    
    // Store API version in request for later use
    req.apiVersion = version || options.defaultVersion;
    
    next();
  };
}

/**
 * Create a versioned router
 * 
 * This function creates a router that only applies to a specific API version
 */
export function versionedRouter(version: string, options: ApiVersionOptions) {
  const router = Router();
  
  router.use((req: Request, res: Response, next: NextFunction) => {
    const reqVersion = req.apiVersion || getApiVersion(req, options);
    
    // Skip if version doesn't match
    if (reqVersion !== version) {
      return next('router');
    }
    
    next();
  });
  
  return router;
}

// Extend Express Request type to include apiVersion
declare global {
  namespace Express {
    interface Request {
      apiVersion?: string;
    }
  }
} 