/**
 * Input Sanitization Middleware
 *
 * Sanitizes request inputs to prevent security vulnerabilities like
 * XSS, SQL Injection, and other injection attacks.
 */

import { Request, Response, NextFunction } from 'express';
import xss from 'xss';

interface SanitizationOptions {
  sanitizeBody?: boolean;
  sanitizeQuery?: boolean;
  sanitizeParams?: boolean;
  sanitizeHeaders?: string[];
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
  skipPaths?: string[];
  excludeKeys?: string[];
}

/**
 * Creates a middleware function that sanitizes request inputs
 */
export function createSanitizationMiddleware(
  options: SanitizationOptions = {},
) {
  // Default options
  const sanitizeBody = options.sanitizeBody !== false;
  const sanitizeQuery = options.sanitizeQuery !== false;
  const sanitizeParams = options.sanitizeParams !== false;
  const sanitizeHeaders = options.sanitizeHeaders || [];
  const skipPaths = options.skipPaths || [];
  const excludeKeys = options.excludeKeys || [];

  // Create custom XSS filter options
  const xssOptions = {
    whiteList: options.allowedTags
      ? ({} as Record<string, string[]>)
      : undefined,
    onTag: undefined as any,
    onTagAttr: undefined as any,
    onIgnoreTag: undefined as any,
    onIgnoreTagAttr: undefined as any,
  };

  // If allowed tags specified, configure them
  if (options.allowedTags && options.allowedTags.length > 0) {
    for (const tag of options.allowedTags) {
      xssOptions.whiteList![tag] = options.allowedAttributes?.[tag] || [];
    }
  }

  // Create XSS filter instance
  const xssFilter = new (xss as any).FilterXSS(xssOptions);

  // Sanitize a single value
  const sanitizeValue = (value: any): any => {
    if (value === null || value === undefined) {
      return value;
    }

    // Handle different types
    if (typeof value === 'string') {
      return xssFilter.process(value);
    } else if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item));
    } else if (typeof value === 'object') {
      return sanitizeObject(value);
    }

    // Return as is for numbers, booleans, etc.
    return value;
  };

  // Sanitize an object recursively
  const sanitizeObject = (obj: Record<string, any>): Record<string, any> => {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Skip excluded keys
      if (excludeKeys.includes(key)) {
        result[key] = value;
        continue;
      }

      result[key] = sanitizeValue(value);
    }

    return result;
  };

  // The middleware function
  return function sanitizationMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    // Skip specific paths if configured
    if (
      skipPaths.some((pattern) => {
        const regex = new RegExp(pattern);
        return regex.test(req.path);
      })
    ) {
      return next();
    }

    try {
      // Sanitize body
      if (sanitizeBody && req.body) {
        req.body = sanitizeObject(req.body);
      }

      // Sanitize query parameters
      if (sanitizeQuery && req.query) {
        req.query = sanitizeObject(req.query);
      }

      // Sanitize route parameters
      if (sanitizeParams && req.params) {
        req.params = sanitizeObject(req.params);
      }

      // Sanitize specific headers if required
      if (sanitizeHeaders.length > 0 && req.headers) {
        for (const header of sanitizeHeaders) {
          const headerValue = req.headers[header.toLowerCase()];
          if (headerValue) {
            if (typeof headerValue === 'string') {
              req.headers[header.toLowerCase()] =
                xssFilter.process(headerValue);
            } else if (Array.isArray(headerValue)) {
              req.headers[header.toLowerCase()] = headerValue.map((v) =>
                xssFilter.process(v),
              );
            }
          }
        }
      }

      next();
    } catch (error) {
      // In case of errors in sanitization, log and continue
      console.error('Error in input sanitization:', error);
      next();
    }
  };
}
