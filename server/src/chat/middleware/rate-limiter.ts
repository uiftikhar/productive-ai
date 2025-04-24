/**
 * Rate limiting middleware for chat service
 * 
 * Provides protection against abuse by limiting the number of requests
 * that can be made within a specific time period.
 */

import { Request, Response, NextFunction } from 'express';
import { ChatErrorType, ChatServiceError } from '../chat.types';

// Advanced rate limit options
interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  standardHeaders?: boolean;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipIfAuthenticated?: boolean;
  tierLimits?: {
    [key: string]: number; // tier name -> request limit
  };
  endpointLimits?: {
    [key: string]: number; // endpoint pattern -> request limit
  };
  slidingWindow?: boolean; // Use sliding window algorithm instead of fixed window
  ipLimitMultiplier?: number; // Stricter limits for unauthenticated requests
}

// Bucket data for sliding window algorithm
interface RateLimitBucket {
  timestamp: number;
  count: number;
}

// Enhanced rate limit record
interface RateLimitRecord {
  count: number;
  resetTime: number;
  // For sliding window algorithm
  buckets?: RateLimitBucket[];
}

/**
 * Advanced rate limiter with multiple strategies
 * - Supports tiered rate limiting based on user roles/plans
 * - Supports endpoint-specific rate limits
 * - Supports sliding window algorithm for more accurate rate limiting
 */
export function createRateLimiter(options: RateLimitOptions) {
  const windowMs = options.windowMs || 60 * 1000; // Default: 1 minute
  const maxRequests = options.maxRequests || 100; // Default: 100 requests per minute
  const standardHeaders = options.standardHeaders !== false;
  const message = options.message || 'Too many requests, please try again later';
  const useSliding = options.slidingWindow || false;
  const bucketInterval = useSliding ? windowMs / 10 : windowMs; // 10 buckets per window
  const ipLimitMultiplier = options.ipLimitMultiplier || 0.5; // 50% limit for IPs by default
  
  // Store rate limit data in memory (in production, use Redis)
  const rateLimits = new Map<string, RateLimitRecord>();
  
  // Clean up old entries periodically
  // Call unref() to prevent the interval from keeping the process alive
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimits.entries()) {
      if (record.resetTime <= now) {
        rateLimits.delete(key);
      }
    }
  }, Math.min(windowMs, 60 * 1000)).unref(); // Clean up at least every minute
  
  // Custom key generator
  const keyGenerator = options.keyGenerator || ((req: Request): string => {
    // Get identifier (use IP address if no authenticated user)
    const userId = req.user ? 
      ((req.user as any).id || (req.user as any).userId || 'unknown-user') 
      : null;
    
    // If targeting specific endpoints, include the path in the key
    if (options.endpointLimits) {
      const path = req.baseUrl + req.path;
      return userId ? `user:${userId}:${path}` : `ip:${req.ip || 'unknown'}:${path}`;
    }
    
    return userId ? `user:${userId}` : `ip:${req.ip || 'unknown'}`;
  });
  
  // Get the tier for a request
  const getTier = (req: Request): string => {
    if (!req.user) return 'anonymous';
    
    // Extract tier from user object (customize this based on your user model)
    return (req.user as any).tier || 
           (req.user as any).plan || 
           (req.user as any).role || 
           'standard';
  };
  
  // Get the limit for a specific request
  const getLimit = (req: Request): number => {
    // Check for endpoint-specific limits first
    if (options.endpointLimits) {
      const path = req.baseUrl + req.path;
      
      // Find matching endpoint pattern
      for (const [pattern, limit] of Object.entries(options.endpointLimits)) {
        if (new RegExp(pattern).test(path)) {
          return limit;
        }
      }
    }
    
    // Then check for tier-based limits
    if (options.tierLimits && req.user) {
      const tier = getTier(req);
      if (options.tierLimits[tier]) {
        return options.tierLimits[tier];
      }
    }
    
    // Apply different limits for authenticated vs unauthenticated
    if (!req.user) {
      return Math.floor(maxRequests * ipLimitMultiplier);
    }
    
    // Default to global limit
    return maxRequests;
  };
  
  // Calculate sliding window count
  const getSlidingWindowCount = (buckets: RateLimitBucket[], now: number): number => {
    // Remove expired buckets (older than windowMs)
    const validBuckets = buckets.filter(b => now - b.timestamp < windowMs);
    
    // Sum the counts from the remaining buckets
    return validBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
  };
  
  // The middleware function
  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    // Skip rate limiting based on options
    if (options.skipIfAuthenticated && req.user) {
      return next();
    }
    
    // Get limit key
    const key = keyGenerator(req);
    
    // Get request-specific limit
    const limit = getLimit(req);
    
    // Get current timestamp
    const now = Date.now();
    
    // Get or create rate limit record
    let record = rateLimits.get(key);
    if (!record || (!useSliding && record.resetTime <= now)) {
      record = {
        count: 0,
        resetTime: now + windowMs,
        buckets: useSliding ? [] : undefined,
      };
    }
    
    let remaining: number;
    
    if (useSliding) {
      // Sliding window algorithm
      if (!record.buckets) {
        record.buckets = [];
      }
      
      // Add current request to the current time bucket
      const currentBucketTime = Math.floor(now / bucketInterval) * bucketInterval;
      let currentBucket = record.buckets.find(b => b.timestamp === currentBucketTime);
      
      if (!currentBucket) {
        currentBucket = { timestamp: currentBucketTime, count: 0 };
        record.buckets.push(currentBucket);
      }
      
      currentBucket.count++;
      
      // Calculate total requests in the sliding window
      const count = getSlidingWindowCount(record.buckets, now);
      remaining = Math.max(0, limit - count);
      
      // Update reset time
      record.resetTime = now + windowMs;
    } else {
      // Standard fixed window algorithm
      record.count += 1;
      remaining = Math.max(0, limit - record.count);
    }
    
    // Save updated record
    rateLimits.set(key, record);
    
    // Set standard headers if enabled
    if (standardHeaders) {
      res.setHeader('X-RateLimit-Limit', limit.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000).toString());
    }
    
    // Check if limit is exceeded
    const exceeded = useSliding ? 
      (remaining <= 0) : 
      (record.count > limit);
    
    if (exceeded) {
      const resetTime = Math.ceil((record.resetTime - now) / 1000);
      
      if (standardHeaders) {
        res.setHeader('Retry-After', resetTime.toString());
      }
      
      // Get the tier for the error message
      const tier = req.user ? getTier(req) : 'anonymous';
      
      const error = new ChatServiceError(
        `${message} (${tier} tier limit: ${limit} requests per ${windowMs/1000}s)`,
        ChatErrorType.RATE_LIMIT_EXCEEDED,
        { 
          retryAfter: resetTime,
          limit,
          tier,
          windowMs
        }
      );
      
      return next(error);
    }
    
    next();
  };
} 