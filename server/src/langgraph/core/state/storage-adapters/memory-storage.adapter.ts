import { StorageAdapter, StorageOptions, StateFilter } from './storage-adapter.interface';
import { Logger } from '../../../../shared/logger/logger.interface';
import { deepMerge } from '../../utils/object-utils';

/**
 * Options for the memory storage adapter
 */
export interface MemoryStorageOptions extends StorageOptions {
  /**
   * Optional logger instance
   */
  logger?: Logger;
  
  /**
   * Whether to simulate network delays (useful for testing)
   */
  simulateNetworkDelay?: boolean;
  
  /**
   * Min simulated delay in ms (if simulateNetworkDelay is true)
   */
  minDelay?: number;
  
  /**
   * Max simulated delay in ms (if simulateNetworkDelay is true)
   */
  maxDelay?: number;
}

/**
 * Interface for a stored item with TTL
 */
interface StoredItem {
  /**
   * The stored data
   */
  data: any;
  
  /**
   * Expiration timestamp (milliseconds since epoch)
   * A value of 0 means no expiration
   */
  expiresAt: number;
}

/**
 * In-memory storage adapter implementation
 * Useful for testing and development
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private storage: Map<string, StoredItem> = new Map();
  private options: MemoryStorageOptions;
  private logger?: Logger;
  private initialized = false;
  
  /**
   * Create a new memory storage adapter
   */
  constructor(options: MemoryStorageOptions = {}) {
    this.options = {
      namespace: 'memory',
      keyPrefix: '',
      defaultTtl: 0, // No expiration by default
      simulateNetworkDelay: false,
      minDelay: 5,
      maxDelay: 20,
      ...options
    };
    
    this.logger = options.logger;
  }
  
  /**
   * Initialize the storage adapter
   */
  async initialize(): Promise<void> {
    await this.simulateDelay();
    this.initialized = true;
    this.logger?.debug(`MemoryStorageAdapter initialized with namespace '${this.options.namespace}'`);
  }
  
  /**
   * Store data with an optional TTL override
   */
  async set(key: string, data: any, ttl?: number): Promise<void> {
    this.ensureInitialized();
    await this.simulateDelay();
    
    const fullKey = this.getFullKey(key);
    const expiresAt = this.calculateExpiration(ttl);
    
    this.storage.set(fullKey, { data, expiresAt });
    this.logger?.debug(`Set data for key '${fullKey}'`, { ttl, expiresAt });
  }
  
  /**
   * Retrieve data by key
   */
  async get(key: string): Promise<any | null> {
    this.ensureInitialized();
    await this.simulateDelay();
    
    const fullKey = this.getFullKey(key);
    const item = this.storage.get(fullKey);
    
    if (!item) {
      this.logger?.debug(`No data found for key '${fullKey}'`);
      return null;
    }
    
    // Check if expired
    if (item.expiresAt > 0 && item.expiresAt < Date.now()) {
      this.logger?.debug(`Data for key '${fullKey}' has expired`);
      this.storage.delete(fullKey);
      return null;
    }
    
    this.logger?.debug(`Retrieved data for key '${fullKey}'`);
    return item.data;
  }
  
  /**
   * Update existing data (partial update)
   */
  async update(key: string, partialData: any, ttl?: number): Promise<void> {
    this.ensureInitialized();
    await this.simulateDelay();
    
    const fullKey = this.getFullKey(key);
    const existingItem = this.storage.get(fullKey);
    
    if (!existingItem) {
      this.logger?.debug(`No existing data to update for key '${fullKey}'`);
      return this.set(key, partialData, ttl);
    }
    
    // Check if expired
    if (existingItem.expiresAt > 0 && existingItem.expiresAt < Date.now()) {
      this.logger?.debug(`Data for key '${fullKey}' has expired, creating new entry`);
      return this.set(key, partialData, ttl);
    }
    
    // Merge data
    const updatedData = deepMerge(existingItem.data, partialData);
    const expiresAt = this.calculateExpiration(ttl);
    
    this.storage.set(fullKey, {
      data: updatedData,
      expiresAt: expiresAt
    });
    
    this.logger?.debug(`Updated data for key '${fullKey}'`);
  }
  
  /**
   * Delete data by key
   */
  async delete(key: string): Promise<void> {
    this.ensureInitialized();
    await this.simulateDelay();
    
    const fullKey = this.getFullKey(key);
    const deleted = this.storage.delete(fullKey);
    
    if (deleted) {
      this.logger?.debug(`Deleted data for key '${fullKey}'`);
    } else {
      this.logger?.debug(`No data found to delete for key '${fullKey}'`);
    }
  }
  
  /**
   * List keys according to filter criteria
   */
  async listKeys(filter?: StateFilter): Promise<string[]> {
    this.ensureInitialized();
    await this.simulateDelay();
    
    // Get all keys (removing expired ones)
    const now = Date.now();
    const allKeys: string[] = [];
    
    for (const [key, item] of this.storage.entries()) {
      // Skip expired items
      if (item.expiresAt > 0 && item.expiresAt < now) {
        this.storage.delete(key);
        continue;
      }
      
      // Extract the key without the namespace and prefix
      const originalKey = this.extractOriginalKey(key);
      if (originalKey) {
        allKeys.push(originalKey);
      }
    }
    
    // Apply filters
    let filteredKeys = allKeys;
    
    if (filter) {
      // Apply key prefix filter
      if (filter.keyPrefix && filter.keyPrefix.length > 0) {
        filteredKeys = filteredKeys.filter(key => 
          key.startsWith(filter.keyPrefix as string)
        );
      }
      
      // Apply custom filter function
      if (filter.filterFn) {
        filteredKeys = filteredKeys.filter(filter.filterFn);
      }
      
      // Apply pagination
      if (filter.offset !== undefined || filter.limit !== undefined) {
        const offset = filter.offset || 0;
        const limit = filter.limit || filteredKeys.length;
        filteredKeys = filteredKeys.slice(offset, offset + limit);
      }
    }
    
    this.logger?.debug(`Listed ${filteredKeys.length} keys matching filter`, { filter });
    return filteredKeys;
  }
  
  /**
   * Clear all data in this adapter's namespace
   */
  async clear(): Promise<void> {
    this.ensureInitialized();
    await this.simulateDelay();
    
    // Only clear keys in our namespace
    const keysToDelete: string[] = [];
    
    for (const key of this.storage.keys()) {
      if (key.startsWith(`${this.options.namespace}:`)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.storage.delete(key);
    }
    
    this.logger?.debug(`Cleared ${keysToDelete.length} keys from namespace '${this.options.namespace}'`);
  }
  
  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    this.ensureInitialized();
    await this.simulateDelay();
    
    const fullKey = this.getFullKey(key);
    const item = this.storage.get(fullKey);
    
    if (!item) {
      return false;
    }
    
    // Check if expired
    if (item.expiresAt > 0 && item.expiresAt < Date.now()) {
      this.storage.delete(fullKey);
      return false;
    }
    
    return true;
  }
  
  /**
   * Get the full key with namespace and prefix
   */
  private getFullKey(key: string): string {
    const { namespace, keyPrefix } = this.options;
    const prefixedKey = keyPrefix ? `${keyPrefix}:${key}` : key;
    return `${namespace}:${prefixedKey}`;
  }
  
  /**
   * Extract the original key from a full key
   */
  private extractOriginalKey(fullKey: string): string | null {
    const { namespace, keyPrefix } = this.options;
    const namespacePrefix = `${namespace}:`;
    
    if (!fullKey.startsWith(namespacePrefix)) {
      return null;
    }
    
    let key = fullKey.substring(namespacePrefix.length);
    
    if (keyPrefix) {
      const keyPrefixFull = `${keyPrefix}:`;
      if (key.startsWith(keyPrefixFull)) {
        key = key.substring(keyPrefixFull.length);
      } else {
        return null;
      }
    }
    
    return key;
  }
  
  /**
   * Calculate expiration timestamp from TTL
   */
  private calculateExpiration(ttl?: number): number {
    const effectiveTtl = ttl !== undefined ? ttl : this.options.defaultTtl;
    
    if (!effectiveTtl || effectiveTtl <= 0) {
      return 0; // No expiration
    }
    
    return Date.now() + (effectiveTtl * 1000);
  }
  
  /**
   * Ensure the adapter is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('MemoryStorageAdapter is not initialized. Call initialize() first.');
    }
  }
  
  /**
   * Simulate network delay if configured
   */
  private async simulateDelay(): Promise<void> {
    if (!this.options.simulateNetworkDelay) {
      return;
    }
    
    const { minDelay, maxDelay } = this.options;
    const delay = Math.floor(Math.random() * ((maxDelay || 20) - (minDelay || 5) + 1)) + (minDelay || 5);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
} 