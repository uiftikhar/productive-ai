/**
 * Rate limiting middleware for chat service
 * 
 * Provides protection against abuse by limiting the number of requests
 * that can be made within a specific time period.
 */

import { Request, Response, NextFunction } from 'express';
import { ChatErrorType, ChatServiceError } from '../chat.types';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  standardHeaders?: boolean;
  message?: string;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

/**
 * Simple in-memory rate limiter
 * For production use, consider using redis-based rate limiting
 */
export function createRateLimiter(options: RateLimitOptions) {
  const windowMs = options.windowMs || 60 * 1000; // Default: 1 minute
  const maxRequests = options.maxRequests || 100; // Default: 100 requests per minute
  const standardHeaders = options.standardHeaders !== false;
  const message = options.message || 'Too many requests, please try again later';
  
  // Store rate limit data in memory
  const rateLimits = new Map<string, RateLimitRecord>();
  
  // Clean up old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimits.entries()) {
      if (record.resetTime <= now) {
        rateLimits.delete(key);
      }
    }
  }, windowMs);
  
  // The middleware function
  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    // Get identifier (use IP address if no authenticated user)
    // Use the user object if available, or fallback to IP address
    const identifier = req.user ? 
      ((req.user as any).id || (req.user as any).userId || 'unknown-user') 
      : (req.ip || 'unknown-ip');
    
    // Get current timestamp
    const now = Date.now();
    
    // Get or create rate limit record
    let record = rateLimits.get(identifier);
    if (!record || record.resetTime <= now) {
      record = {
        count: 0,
        resetTime: now + windowMs
      };
    }
    
    // Increment request count
    record.count += 1;
    rateLimits.set(identifier, record);
    
    // Set standard headers if enabled
    if (standardHeaders) {
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count).toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000).toString());
    }
    
    // Check if limit is exceeded
    if (record.count > maxRequests) {
      const resetTime = Math.ceil((record.resetTime - now) / 1000);
      
      if (standardHeaders) {
        res.setHeader('Retry-After', resetTime.toString());
      }
      
      const error = new ChatServiceError(
        message,
        ChatErrorType.RATE_LIMIT_EXCEEDED,
        { retryAfter: resetTime }
      );
      
      return next(error);
    }
    
    next();
  };
} 