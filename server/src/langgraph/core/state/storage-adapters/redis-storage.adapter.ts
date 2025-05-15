import { StorageAdapter, StorageOptions, StateFilter } from './storage-adapter.interface';
import { Logger } from '../../../../shared/logger/logger.interface';
import { createClient } from 'redis';

/**
 * Options for Redis storage adapter
 */
export interface RedisStorageOptions extends StorageOptions {
  /**
   * Redis connection URI or options
   */
  redisConnection?: string | Record<string, any>;
  
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Custom Redis instance (if not provided, new connection will be created)
   */
  redisClient?: any;
}

/**
 * Redis-based storage adapter implementation
 * Provides persistent storage using Redis
 */
export class RedisStorageAdapter implements StorageAdapter {
  private options: RedisStorageOptions;
  private logger?: Logger;
  private redis: any;
  private initialized = false;
  private namespace: string;
  
  /**
   * Create a new Redis storage adapter
   */
  constructor(options: RedisStorageOptions) {
    this.options = {
      namespace: 'redis-storage',
      keyPrefix: '',
      defaultTtl: 0, // No expiration by default
      ...options
    };
    
    this.logger = options.logger;
    this.namespace = options.namespace || 'redis-storage';
    
    // Use provided Redis client or create new one
    if (options.redisClient) {
      this.redis = options.redisClient;
    } else {
      try {
        // Initialize Redis client
        const redisOptions = typeof options.redisConnection === 'string' 
          ? { url: options.redisConnection }
          : options.redisConnection || {};
          
        this.redis = createClient(redisOptions);
        
        // Handle connection errors
        this.redis.on('error', (err: Error) => {
          this.logger?.error(`Redis connection error: ${err.message}`);
        });
      } catch (error) {
        this.logger?.error(`Error initializing Redis client: ${error instanceof Error ? error.message : String(error)}`);
        throw new Error(`Failed to initialize Redis client: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  
  /**
   * Initialize the storage adapter
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    try {
      // Connect to Redis if not already connected
      if (!this.redis.isOpen) {
        await this.redis.connect();
      }
      
      // Test Redis connection
      await this.redis.ping();
      this.initialized = true;
      this.logger?.debug(`RedisStorageAdapter initialized with namespace: ${this.options.namespace}`);
    } catch (error) {
      this.logger?.error(`Failed to initialize RedisStorageAdapter: ${(error as Error).message}`);
      throw new Error(`Failed to initialize Redis storage: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get the full key with namespace and prefix
   */
  private getFullKey(key: string): string {
    // Add namespace and prefix if specified
    let fullKey = `${this.namespace}:${key}`;
    
    if (this.options.keyPrefix) {
      fullKey = `${this.options.keyPrefix}:${fullKey}`;
    }
    
    return fullKey;
  }
  
  /**
   * Store data with an optional TTL override
   */
  async set(key: string, data: any, ttl?: number): Promise<void> {
    const fullKey = this.getFullKey(key);
    
    try {
      this.logger?.debug(`Storing data for key: ${key}`, { fullKey });
      
      // Serialize data if it's an object
      const serializedData = typeof data === 'object' ? 
        JSON.stringify(data) : 
        String(data);
      
      // Calculate TTL in seconds
      const ttlSeconds = ttl !== undefined 
        ? ttl 
        : this.options.defaultTtl || 0;
      
      if (ttlSeconds > 0) {
        await this.redis.setEx(fullKey, ttlSeconds, serializedData);
      } else {
        await this.redis.set(fullKey, serializedData);
      }
      
      this.logger?.debug(`Successfully stored data for key: ${key}`, { fullKey, ttl: ttlSeconds });
    } catch (error) {
      this.logger?.error(`Failed to set data for key ${key}:`, { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        fullKey
      });
      throw new Error(`Failed to store data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Retrieve data by key
   */
  async get(key: string): Promise<any | null> {
    const fullKey = this.getFullKey(key);
    
    try {
      this.logger?.debug(`Retrieving data for key: ${key}`, { fullKey });
      
      const data = await this.redis.get(fullKey);
      
      if (data === null) {
        this.logger?.debug(`No data found for key: ${key}`, { fullKey });
        return null;
      }
      
      // Try to parse as JSON, fallback to raw data if not valid JSON
      try {
        const parsedData = JSON.parse(data);
        this.logger?.debug(`Successfully retrieved and parsed data for key: ${key}`, { fullKey });
        return parsedData;
      } catch (parseError) {
        // If not valid JSON, return as is
        this.logger?.debug(`Retrieved non-JSON data for key: ${key}`, { fullKey });
        return data;
      }
    } catch (error) {
      this.logger?.error(`Failed to get data for key ${key}:`, { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        fullKey
      });
      throw new Error(`Failed to get data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Update existing data (partial update)
   * In Redis, we need to get, merge, and set
   */
  async update(key: string, partialData: any, ttl?: number): Promise<void> {
    const fullKey = this.getFullKey(key);
    
    try {
      this.logger?.debug(`Updating data for key: ${key}`, { fullKey });
      
      // Get existing data
      const existingData = await this.get(key);
      
      if (existingData === null) {
        // If no existing data, just set the partial data
        this.logger?.debug(`No existing data for key ${key}, creating new entry`, { fullKey });
        await this.set(key, partialData, ttl);
        return;
      }
      
      // Merge data
      let mergedData: any;
      
      if (typeof existingData === 'object' && existingData !== null && 
          typeof partialData === 'object' && partialData !== null) {
        // Deep merge objects
        mergedData = { ...existingData };
        
        // Recursive merge function
        const deepMerge = (target: any, source: any) => {
          for (const key in source) {
            if (source[key] !== null && typeof source[key] === 'object' && 
                target[key] !== null && typeof target[key] === 'object') {
              deepMerge(target[key], source[key]);
            } else {
              target[key] = source[key];
            }
          }
        };
        
        deepMerge(mergedData, partialData);
      } else {
        // For non-objects, just replace
        mergedData = partialData;
      }
      
      // Set merged data with TTL
      await this.set(key, mergedData, ttl);
      
      this.logger?.debug(`Successfully updated data for key: ${key}`, { fullKey });
    } catch (error) {
      this.logger?.error(`Failed to update data for key ${key}:`, { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        fullKey
      });
      throw new Error(`Failed to update data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Delete data by key
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    
    try {
      this.logger?.debug(`Deleting data for key: ${key}`, { fullKey });
      
      await this.redis.del(fullKey);
      
      this.logger?.debug(`Successfully deleted data for key: ${key}`, { fullKey });
    } catch (error) {
      this.logger?.error(`Failed to delete data for key ${key}:`, { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        fullKey
      });
      throw new Error(`Failed to delete data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    
    try {
      this.logger?.debug(`Checking if key exists: ${key}`, { fullKey });
      
      const exists = await this.redis.exists(fullKey);
      const result = exists > 0;
      
      this.logger?.debug(`Key exists check for ${key}: ${result ? 'Found' : 'Not found'}`, { fullKey });
      return result;
    } catch (error) {
      this.logger?.error(`Failed to check if key ${key} exists:`, { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        fullKey
      });
      return false; // Return false on error to be safe
    }
  }
  
  /**
   * List all keys matching a pattern (uses Redis SCAN)
   */
  async listKeys(pattern: string | StateFilter): Promise<string[]> {
    try {
      let keyPattern: string;
      let filterFn: ((key: string) => boolean) | undefined;
      let offsetLimit: { offset?: number; limit?: number } | undefined;
      
      // Handle string pattern case
      if (typeof pattern === 'string') {
        // Convert glob pattern to Redis pattern
        keyPattern = this.getFullKey(pattern.replace(/\*/g, '*'));
      } else {
        // Handle StateFilter object
        const filter = pattern as StateFilter;
        
        // Convert key prefix to Redis pattern
        if (filter.keyPrefix) {
          keyPattern = this.getFullKey(`${filter.keyPrefix}*`);
        } else {
          // If no prefix, match all keys in our namespace
          keyPattern = this.getFullKey('*');
        }
        
        // Keep any custom filter function
        filterFn = filter.filterFn;
        
        // Keep pagination options
        if (filter.offset !== undefined || filter.limit !== undefined) {
          offsetLimit = {
            offset: filter.offset,
            limit: filter.limit
          };
        }
      }
      
      this.logger?.debug(`Listing keys with pattern: ${keyPattern}`);
      
      // Use Redis SCAN to get keys
      const keys: string[] = [];
      let cursor = 0;
      
      do {
        // SCAN returns [nextCursor, keys]
        const result = await this.redis.scan(cursor, {
          MATCH: keyPattern,
          COUNT: 1000 // Fetch in batches of 1000
        });
        
        cursor = result.cursor;
        const batchKeys = result.keys;
        
        // Convert keys back to our format (remove namespace)
        for (const key of batchKeys) {
          // Remove namespace prefix from the key
          const namespace = this.namespace;
          let cleanKey = key;
          
          if (namespace && key.startsWith(`${namespace}:`)) {
            cleanKey = key.substring(namespace.length + 1);
          }
          
          // Remove key prefix if it was added
          if (this.options.keyPrefix && cleanKey.startsWith(`${this.options.keyPrefix}:`)) {
            cleanKey = cleanKey.substring(this.options.keyPrefix.length + 1);
          }
          
          // Apply custom filter if provided
          if (!filterFn || filterFn(cleanKey)) {
            keys.push(cleanKey);
          }
        }
      } while (cursor !== 0);
      
      // Apply pagination if needed
      let resultKeys = keys;
      if (offsetLimit) {
        const offset = offsetLimit.offset || 0;
        const limit = offsetLimit.limit !== undefined 
          ? offsetLimit.limit 
          : keys.length - offset;
        
        resultKeys = keys.slice(offset, offset + limit);
      }
      
      this.logger?.debug(`Listed ${resultKeys.length} keys matching pattern: ${keyPattern}`);
      return resultKeys;
    } catch (error) {
      this.logger?.error(`Failed to list keys with pattern ${pattern}:`, { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return [];
    }
  }
  
  /**
   * Clear all data in this adapter's namespace
   */
  async clear(): Promise<void> {
    try {
      this.logger?.debug(`Clearing all data in namespace: ${this.namespace}`);
      
      // Get all keys in our namespace
      const pattern = this.getFullKey('*');
      const keys = await this.listKeys(pattern);
      
      if (keys.length === 0) {
        this.logger?.debug('No keys to clear');
        return;
      }
      
      // Delete all keys
      for (const key of keys) {
        await this.delete(key);
      }
      
      this.logger?.debug(`Cleared ${keys.length} keys from namespace '${this.namespace}'`);
    } catch (error) {
      this.logger?.error(`Failed to clear storage:`, { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        namespace: this.namespace
      });
      throw new Error(`Failed to clear storage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Close Redis connection when done
   */
  async dispose(): Promise<void> {
    try {
      if (this.redis && this.redis.isOpen) {
        await this.redis.quit();
      }
      this.logger?.debug('Redis connection closed');
    } catch (error) {
      this.logger?.error(`Error closing Redis connection:`, { 
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
} 