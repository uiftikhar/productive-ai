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
 * Filter criteria for listing stored states
 */
export interface StateFilter {
  /**
   * Optional prefix that keys must match
   */
  keyPrefix?: string;
  
  /**
   * Optional filter function for more complex filtering
   */
  filterFn?: (key: string) => boolean;
  
  /**
   * Maximum number of items to return
   */
  limit?: number;
  
  /**
   * Number of items to skip
   */
  offset?: number;
}

/**
 * Storage adapter interface
 */
export interface StorageAdapter {
  /**
   * Initialize the storage adapter
   */
  initialize(): Promise<void>;
  
  /**
   * Store data with an optional TTL override
   * 
   * @param key - Unique identifier for the data
   * @param data - The data to store
   * @param ttl - Optional TTL in seconds, overrides the default
   */
  set(key: string, data: any, ttl?: number): Promise<void>;
  
  /**
   * Retrieve data by key
   * 
   * @param key - Unique identifier for the data
   * @returns The stored data, or null if not found
   */
  get(key: string): Promise<any | null>;
  
  /**
   * Update existing data (partial update)
   * This should perform a shallow merge of the new data with existing data
   * 
   * @param key - Unique identifier for the data
   * @param partialData - Partial data to update
   * @param ttl - Optional TTL in seconds, overrides the default
   */
  update(key: string, partialData: any, ttl?: number): Promise<void>;
  
  /**
   * Delete data by key
   * 
   * @param key - Unique identifier for the data to delete
   */
  delete(key: string): Promise<void>;
  
  /**
   * List keys according to filter criteria
   * 
   * @param filter - Optional filter criteria
   * @returns Array of keys
   */
  listKeys(filter?: StateFilter): Promise<string[]>;
  
  /**
   * Clear all data in this adapter's namespace
   */
  clear(): Promise<void>;
  
  /**
   * Check if key exists
   * 
   * @param key - Key to check
   * @returns True if key exists, false otherwise
   */
  has(key: string): Promise<boolean>;
} 