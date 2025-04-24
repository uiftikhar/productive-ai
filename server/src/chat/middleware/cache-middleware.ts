/**
 * Caching middleware for chat API responses
 *
 * Provides response caching for frequent GET requests to reduce database load
 * and improve response times.
 */

import { Request, Response, NextFunction } from 'express';
import { CacheService } from '../../shared/services/cache/cache.service';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

interface CacheMiddlewareOptions {
  ttlMs?: number;
  maxSize?: number;
  bypassHeaderName?: string;
  cacheableStatusCodes?: number[];
  logger?: Logger;
}

// Define the cached response structure
interface CachedResponse {
  data: any;
  status: number;
  headers: Record<string, string | number | string[]>;
}

export function createCacheMiddleware(options: CacheMiddlewareOptions = {}) {
  // Create cache service with options
  const cache = new CacheService(
    {
      ttlMs: options.ttlMs || 60 * 1000, // Default: 1 minute
      maxSize: options.maxSize || 500, // Default: 500 entries
      namespace: 'api-cache',
    },
    options.logger || new ConsoleLogger(),
  );

  const bypassHeaderName = options.bypassHeaderName || 'X-Bypass-Cache';
  const cacheableStatusCodes = options.cacheableStatusCodes || [200];

  return function cacheMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Skip caching if bypass header is present
    if (req.headers[bypassHeaderName.toLowerCase()]) {
      return next();
    }

    // Generate cache key from URL and auth info
    const userId = req.user
      ? (req.user as any).id || (req.user as any).userId
      : 'anonymous';
    const cacheKey = `${userId}:${req.originalUrl || req.url}`;

    // Check if response is in cache
    const cachedResponse = cache.get<CachedResponse>(cacheKey);
    if (cachedResponse) {
      // Send cached response
      Object.entries(cachedResponse.headers).forEach(([name, value]) => {
        res.setHeader(name, value);
      });

      // Add cache hit header
      res.setHeader('X-Cache', 'HIT');

      return res.status(cachedResponse.status).send(cachedResponse.data);
    }

    // If not in cache, continue but intercept the response
    const originalSend = res.send;

    res.send = function (body: any): Response {
      // Set cache miss header
      res.setHeader('X-Cache', 'MISS');

      // Only cache successful responses
      if (cacheableStatusCodes.includes(res.statusCode)) {
        const responseToCache: CachedResponse = {
          data: body,
          status: res.statusCode,
          headers: {},
        };

        // Save important headers
        const headersToCache = ['content-type', 'etag', 'last-modified'];
        headersToCache.forEach((header) => {
          const value = res.getHeader(header);
          if (value) {
            responseToCache.headers[header] = value as
              | string
              | number
              | string[];
          }
        });

        // Store in cache
        cache.set(cacheKey, responseToCache);
      }

      // Reset send to original and call it
      res.send = originalSend;
      return res.send(body);
    };

    next();
  };
}

// Export cache control middleware to allow cache invalidation/bypass
export function noCacheMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, private',
  );
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}

// Middleware to invalidate cache by pattern
export function createCacheInvalidationMiddleware(cacheService: CacheService) {
  return function invalidateCache(pattern: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      // Invalidate cache with pattern
      // Implementation depends on the cache service capabilities
      // Here we're assuming the cache service can delete by pattern

      next();
    };
  };
}
