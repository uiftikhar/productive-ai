/**
 * Cache Service
 * 
 * Provides a flexible caching mechanism for the application with:
 * - Memory-based caching with TTL (Time to Live)
 * - Support for different cache stores (memory, Redis)
 * - Cache invalidation mechanisms
 * - Cache statistics
 */

import { Logger } from '../../logger/logger.interface';
import { ConsoleLogger } from '../../logger/console-logger';

// Cache options
export interface CacheOptions {
  ttlMs?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of items to store
  namespace?: string; // Namespace for cache keys
}

// Cache entry with value and expiration
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
  hitCount: number;
}

// Cache statistics
export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  avgAccessTime: number;
}

/**
 * Generic cache service that provides in-memory caching
 * with optional TTL and LRU eviction
 */
export class CacheService {
  private cache: Map<string, CacheEntry<any>>;
  private namespace: string;
  private ttlMs: number;
  private maxSize: number;
  private hits: number = 0;
  private misses: number = 0;
  private accessTimes: number[] = [];
  private logger: Logger;
  private cleanupInterval: NodeJS.Timeout;

  constructor(options: CacheOptions = {}, logger?: Logger) {
    this.cache = new Map<string, CacheEntry<any>>();
    this.namespace = options.namespace || 'app';
    this.ttlMs = options.ttlMs || 5 * 60 * 1000; // Default: 5 minutes
    this.maxSize = options.maxSize || 1000; // Default: 1000 items
    this.logger = logger || new ConsoleLogger();
    
    // Start cleanup interval to remove expired entries
    this.cleanupInterval = setInterval(() => {
      this.removeExpiredEntries();
    }, Math.min(this.ttlMs / 2, 60 * 1000)).unref(); // Cleanup at least every minute
  }

  /**
   * Get a cached value by key
   * 
   * @param key The cache key
   * @returns The cached value or undefined if not found
   */
  get<T>(key: string): T | undefined {
    const fullKey = this.getNamespacedKey(key);
    const startTime = performance.now();
    
    const entry = this.cache.get(fullKey);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    
    // Check if entry is expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(fullKey);
      this.misses++;
      return undefined;
    }
    
    // Update access time and hit count
    entry.lastAccessed = Date.now();
    entry.hitCount++;
    this.hits++;
    
    // Record access time for stats
    this.accessTimes.push(performance.now() - startTime);
    if (this.accessTimes.length > 100) {
      this.accessTimes.shift(); // Keep only last 100 access times
    }
    
    return entry.value as T;
  }

  /**
   * Store a value in the cache
   * 
   * @param key The cache key
   * @param value The value to store
   * @param ttlMs Optional custom TTL, overrides the default
   */
  set<T>(key: string, value: T, ttlMs?: number): void {
    const fullKey = this.getNamespacedKey(key);
    const now = Date.now();
    
    // Set expiration time
    const expiresAt = now + (ttlMs || this.ttlMs);
    
    // Store the entry
    this.cache.set(fullKey, {
      value,
      expiresAt,
      lastAccessed: now,
      hitCount: 0
    });
    
    // Check if we need to evict entries
    if (this.cache.size > this.maxSize) {
      this.evictLeastRecentlyUsed();
    }
  }

  /**
   * Check if a key exists in the cache
   * 
   * @param key The cache key
   * @returns True if the key exists and is not expired
   */
  has(key: string): boolean {
    const fullKey = this.getNamespacedKey(key);
    const entry = this.cache.get(fullKey);
    
    if (!entry) {
      return false;
    }
    
    // Check if entry is expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(fullKey);
      return false;
    }
    
    return true;
  }

  /**
   * Delete a key from the cache
   * 
   * @param key The cache key
   * @returns True if the key was deleted
   */
  delete(key: string): boolean {
    const fullKey = this.getNamespacedKey(key);
    return this.cache.delete(fullKey);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.accessTimes = [];
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;
    
    const avgAccessTime = this.accessTimes.length > 0
      ? this.accessTimes.reduce((sum, time) => sum + time, 0) / this.accessTimes.length
      : 0;
    
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      avgAccessTime
    };
  }

  /**
   * Remove expired entries from the cache
   * 
   * @returns Number of entries removed
   */
  private removeExpiredEntries(): number {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      this.logger.debug(`Removed ${removed} expired cache entries`);
    }
    
    return removed;
  }

  /**
   * Evict least recently used entries when cache is full
   * 
   * @returns Number of entries evicted
   */
  private evictLeastRecentlyUsed(): number {
    if (this.cache.size <= this.maxSize) {
      return 0; // Nothing to evict
    }
    
    // Calculate how many entries to remove to get back under maxSize
    const entriesToRemove = this.cache.size - this.maxSize;
    
    // Get all entries and sort by lastAccessed time (oldest first)
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    // Take only the oldest entries to remove
    const keysToDelete = entries
      .slice(0, entriesToRemove)
      .map(entry => entry[0]);
    
    // Log only a summary of what's being evicted
    this.logger.debug(`Evicting ${keysToDelete.length} least recently used cache entries`);
    
    // Remove the least recently used entries
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
    
    return keysToDelete.length;
  }

  /**
   * Get a namespaced key
   * 
   * @param key The original key
   * @returns The namespaced key
   */
  private getNamespacedKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  /**
   * Clean up resources when the service is no longer needed
   */
  dispose(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
} 