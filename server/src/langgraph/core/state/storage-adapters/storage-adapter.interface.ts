/**
 * Storage adapter interface for persistent state management
 * 
 * This interface defines the contract that all storage adapters must implement.
 * It provides basic CRUD operations for state persistence with optional TTL support.
 */

export interface StorageOptions {
  /**
   * Optional namespace to segregate stored data
   */
  namespace?: string;
  
  /**
   * Optional prefix for keys
   */
  keyPrefix?: string;
  
  /**
   * Default time-to-live in seconds for stored data, if supported
   * A value of 0 means no expiration
   */
  defaultTtl?: number;
}

/**
 * Filter for listing state entries
 */
export interface StateFilter {
  /**
   * Key pattern to match (can include * wildcards)
   */
  keyPattern?: string;
  
  /**
   * Key prefix to match
   */
  keyPrefix?: string;
  
  /**
   * Minimum timestamp for creation time
   */
  minCreatedAt?: number;
  
  /**
   * Maximum timestamp for creation time
   */
  maxCreatedAt?: number;
  
  /**
   * Limit number of results
   */
  limit?: number;
  
  /**
   * Offset for pagination
   */
  offset?: number;
  
  /**
   * Custom filter function for additional filtering
   */
  filterFn?: (key: string) => boolean;
}

/**
 * Interface for storage adapters
 * Provides a consistent interface for different storage backends
 */
export interface StorageAdapter {
  /**
   * Initialize the storage adapter
   */
  initialize(): Promise<void>;
  
  /**
   * Store a state entry
   * 
   * @param key - Unique key for the state entry
   * @param value - State data to store (will be serialized if needed)
   * @param ttl - Optional time-to-live in seconds (0 = no expiration)
   */
  set(key: string, value: any, ttl?: number): Promise<void>;
  
  /**
   * Retrieve a state entry
   * 
   * @param key - Unique key for the state entry
   * @returns State data, or null if not found
   */
  get(key: string): Promise<any | null>;
  
  /**
   * Check if a state entry exists
   * 
   * @param key - Unique key for the state entry
   * @returns True if the entry exists, false otherwise
   */
  has(key: string): Promise<boolean>;
  
  /**
   * Delete a state entry
   * 
   * @param key - Unique key for the state entry
   */
  delete(key: string): Promise<void>;
  
  /**
   * List keys matching a pattern or filter
   * 
   * @param pattern - String pattern or filter object to match keys
   * @returns Array of matching keys
   */
  listKeys(pattern: string | StateFilter): Promise<string[]>;
  
  /**
   * Update existing data (partial update)
   * 
   * @param key - Unique key for the state entry
   * @param partialData - Data to merge with existing data
   * @param ttl - Optional time-to-live in seconds (0 = no expiration)
   */
  update?(key: string, partialData: any, ttl?: number): Promise<void>;
  
  /**
   * Clear all data in the adapter's namespace
   */
  clear?(): Promise<void>;
} 