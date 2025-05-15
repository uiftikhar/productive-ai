import { StorageAdapter, StateFilter } from './storage-adapters/storage-adapter.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { deepClone, deepMerge } from '../utils/object-utils';
import { RedisStorageAdapter } from './storage-adapters/redis-storage.adapter';

/**
 * Redis connection configuration options
 */
export interface RedisConnectionOptions {
  /**
   * Redis server host
   */
  host?: string;
  
  /**
   * Redis server port
   */
  port?: number;
  
  /**
   * Redis server password
   */
  password?: string;
  
  /**
   * Database number
   */
  db?: number;
  
  /**
   * Connection URI (alternative to host/port/password)
   */
  uri?: string;
}

/**
 * Options for persistent state manager
 */
export interface PersistentStateOptions {
  /**
   * Storage adapter to use for persistence
   * If not provided, RedisStorageAdapter will be used by default
   */
  storageAdapter?: StorageAdapter;
  
  /**
   * Storage type to use ('redis' or 'file')
   * Default is 'redis'
   */
  storageType?: 'redis' | 'file' | 'memory';
  
  /**
   * Redis connection options (when using Redis storage)
   */
  redisOptions?: RedisConnectionOptions;
  
  /**
   * Optional namespace for the state
   */
  namespace?: string;
  
  /**
   * Default time-to-live in seconds
   * A value of 0 means no expiration
   */
  ttl?: number;
  
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Whether to compress state data before storing
   */
  compress?: boolean;
  
  /**
   * Whether to enable automatic serialization/deserialization
   */
  autoSerialize?: boolean;
  
  /**
   * Storage directory path (when using file storage)
   */
  storagePath?: string;
}

/**
 * State metadata for tracking versions and history
 */
export interface StateMetadata {
  /**
   * Unique identifier for the state
   */
  id: string;
  
  /**
   * Version number of the state
   */
  version: number;
  
  /**
   * When the state was created
   */
  createdAt: number;
  
  /**
   * When the state was last updated
   */
  updatedAt: number;
  
  /**
   * Entity that last updated the state
   */
  updatedBy?: string;
  
  /**
   * History entries of state changes
   */
  history?: {
    /**
     * Version number
     */
    version: number;
    
    /**
     * Timestamp of the change
     */
    timestamp: number;
    
    /**
     * Entity that made the change
     */
    updatedBy?: string;
    
    /**
     * Optional description of the change
     */
    description?: string;
  }[];
}

/**
 * Persistent state entry combining data and metadata
 */
interface PersistentStateEntry<T = any> {
  /**
   * The actual state data
   */
  data: T;
  
  /**
   * Metadata about the state
   */
  metadata: StateMetadata;
}

/**
 * Options for serialization
 */
interface SerializationOptions {
  /**
   * Whether to compress the serialized data
   */
  compress?: boolean;
}

/**
 * Core persistent state manager with pluggable storage backends
 * Handles the persistence, retrieval, and management of state data with
 * optional time-to-live functionality.
 */
export class PersistentStateManager {
  private storageAdapter!: StorageAdapter; // Using definite assignment assertion
  private options: PersistentStateOptions;
  private logger?: Logger;
  private initialized = false;
  
  /**
   * Create a new persistent state manager
   */
  constructor(options: PersistentStateOptions) {
    this.options = {
      namespace: 'persistent-state',
      ttl: 0, // No expiration by default
      compress: false,
      autoSerialize: true, // Set autoSerialize to true by default
      storageType: 'redis', // Default to Redis
      ...options
    };
    
    this.logger = options.logger;
    
    // Initialize storage adapter based on type if not explicitly provided
    if (options.storageAdapter) {
      this.storageAdapter = options.storageAdapter;
    } else {
      // Create storage adapter based on type
      switch (this.options.storageType) {
        case 'redis':
          this.initializeRedisAdapter(options);
          break;
        case 'file':
          this.initializeFileAdapter(options);
          break;
        case 'memory':
          this.initializeMemoryAdapter();
          break;
        default:
          // Default to Redis
          this.initializeRedisAdapter(options);
      }
    }
    
    if (!this.storageAdapter) {
      throw new Error('Failed to initialize storage adapter');
    }
  }
  
  /**
   * Initialize a Redis storage adapter
   */
  private initializeRedisAdapter(options: PersistentStateOptions): void {
    try {
      // Configure Redis connection
      let redisConfig: any = {};
      
      if (options.redisOptions?.uri) {
        // If URI is provided, use it directly
        redisConfig = options.redisOptions.uri;
      } else if (options.redisOptions) {
        // Otherwise use individual connection params
        redisConfig = {
          host: options.redisOptions.host || 'localhost',
          port: options.redisOptions.port || 6379,
          password: options.redisOptions.password,
          db: options.redisOptions.db || 0
        };
      }
      
      // Create Redis adapter
      this.storageAdapter = new RedisStorageAdapter({
        namespace: this.options.namespace,
        defaultTtl: this.options.ttl,
        logger: this.logger,
        redisConnection: redisConfig
      });
      
      this.logger?.debug('Redis storage adapter initialized');
    } catch (error) {
      this.logger?.error(`Failed to initialize Redis adapter: ${(error as Error).message}`);
      throw new Error(`Failed to initialize Redis adapter: ${(error as Error).message}`);
    }
  }
  
  /**
   * Initialize a file storage adapter
   */
  private initializeFileAdapter(options: PersistentStateOptions): void {
    try {
      // Import FileStorageAdapter dynamically to avoid circular dependencies
      const { FileStorageAdapter } = require('./storage-adapters/file-storage.adapter');
      
      if (!options.storagePath) {
        throw new Error('storagePath is required for file storage');
      }
      
      this.storageAdapter = new FileStorageAdapter({
        storageDir: options.storagePath,
        namespace: this.options.namespace,
        defaultTtl: this.options.ttl,
        logger: this.logger
      });
      
      this.logger?.debug(`File storage adapter initialized with path: ${options.storagePath}`);
    } catch (error) {
      this.logger?.error(`Failed to initialize file adapter: ${(error as Error).message}`);
      throw new Error(`Failed to initialize file adapter: ${(error as Error).message}`);
    }
  }
  
  /**
   * Initialize a memory storage adapter
   */
  private initializeMemoryAdapter(): void {
    try {
      // Import MemoryStorageAdapter dynamically to avoid circular dependencies
      const { MemoryStorageAdapter } = require('./storage-adapters/memory-storage.adapter');
      
      this.storageAdapter = new MemoryStorageAdapter({
        namespace: this.options.namespace,
        defaultTtl: this.options.ttl,
        logger: this.logger
      });
      
      this.logger?.debug('Memory storage adapter initialized');
    } catch (error) {
      this.logger?.error(`Failed to initialize memory adapter: ${(error as Error).message}`);
      throw new Error(`Failed to initialize memory adapter: ${(error as Error).message}`);
    }
  }
  
  /**
   * Initialize the state manager
   */
  async initialize(): Promise<void> {
    if (!this.initialized) {
      try {
        await this.storageAdapter.initialize();
        this.initialized = true;
        this.logger?.debug('PersistentStateManager initialized');
      } catch (error) {
        this.logger?.error(`Failed to initialize PersistentStateManager: ${(error as Error).message}`);
        throw new Error(`Failed to initialize state manager: ${(error as Error).message}`);
      }
    }
  }
  
  /**
   * Save state data with associated ID
   * 
   * @param stateId - Unique identifier for the state (e.g., meetingId)
   * @param stateData - The state data to save
   * @param options - Optional settings for this operation
   */
  async saveState(
    stateId: string,
    stateData: any,
    options?: {
      ttl?: number;
      updatedBy?: string;
      description?: string;
    }
  ): Promise<void> {
    this.ensureInitialized();
    
    try {
      const now = Date.now();
      const stateKey = this.getStateKey(stateId);
      
      this.logger?.debug(`Saving state for ID: ${stateId} with key: ${stateKey}`, {
        description: options?.description || 'State save operation'
      });
      
      // Create new state entry
      const stateEntry: PersistentStateEntry = {
        data: deepClone(stateData),
        metadata: {
          id: stateId,
          version: 1,
          createdAt: now,
          updatedAt: now,
          updatedBy: options?.updatedBy,
          history: [
            {
              version: 1,
              timestamp: now,
              updatedBy: options?.updatedBy,
              description: options?.description || 'Initial state creation'
            }
          ]
        }
      };
      
      // Serialize if needed
      const dataToStore = this.options.autoSerialize 
        ? this.serializeState(stateEntry, { compress: this.options.compress })
        : stateEntry;
      
      // Store in adapter
      await this.storageAdapter.set(
        stateKey,
        dataToStore,
        options?.ttl !== undefined ? options.ttl : this.options.ttl
      );
      
      this.logger?.debug(`Successfully saved state for ID: ${stateId}`);
      
      // Verify state was saved if we're in debug mode
      if (this.logger) {
        try {
          const exists = await this.storageAdapter.has(stateKey);
          if (exists) {
            this.logger?.debug(`Verified state exists after save: ${stateId}`);
          } else {
            this.logger?.warn(`State verification failed - state not found after save: ${stateId}`);
          }
        } catch (verifyError) {
          // Ignore verification errors
          this.logger?.debug(`Unable to verify state save: ${verifyError}`);
        }
      }
    } catch (error) {
      const err = error as Error;
      this.logger?.error(`Failed to save state for ID ${stateId}:`, { 
        error: err.message,
        stack: err.stack,
        stateId,
        stateDataSummary: JSON.stringify({
          type: typeof stateData,
          isNull: stateData === null,
          keys: stateData && typeof stateData === 'object' ? Object.keys(stateData) : null
        })
      });
      throw new Error(`Failed to save state: ${err.message}`);
    }
  }
  
  /**
   * Load state data by ID
   * 
   * @param stateId - Unique identifier for the state to load
   * @returns The state data, or null if not found
   */
  async loadState<T = any>(stateId: string): Promise<T | null> {
    this.ensureInitialized();
    
    try {
      const stateKey = this.getStateKey(stateId);
      this.logger?.debug(`Loading state for ID: ${stateId} with key: ${stateKey}`);
      
      // Check if state exists first
      const exists = await this.storageAdapter.has(stateKey);
      if (!exists) {
        this.logger?.debug(`No state found for ID: ${stateId} (key: ${stateKey})`);
        return null;
      }
      
      // Retrieve from adapter
      const rawData = await this.storageAdapter.get(stateKey);
      
      if (!rawData) {
        this.logger?.warn(`State exists but get returned null/undefined for ID: ${stateId} (key: ${stateKey})`);
        return null;
      }
      
      // Log raw data type for debugging
      this.logger?.debug(`Raw data retrieved for ${stateId}:`, {
        type: typeof rawData,
        isNull: rawData === null,
        isString: typeof rawData === 'string',
        isObject: typeof rawData === 'object' && rawData !== null,
        length: typeof rawData === 'string' ? rawData.length : null
      });
      
      // Deserialize if needed
      try {
        const stateEntry = this.options.autoSerialize 
          ? this.deserializeState(rawData)
          : rawData as PersistentStateEntry;
        
        if (!stateEntry || !stateEntry.data) {
          this.logger?.warn(`Deserialized data is invalid for ID: ${stateId}`, {
            hasData: !!stateEntry?.data,
            stateEntry: stateEntry ? JSON.stringify(stateEntry).substring(0, 200) + '...' : null
          });
          return null;
        }
        
        this.logger?.debug(`Successfully loaded state for ID: ${stateId} (version: ${stateEntry.metadata?.version || 'unknown'})`);
        return stateEntry.data as T;
      } catch (deserializeError) {
        this.logger?.error(`Error deserializing state for ID ${stateId}:`, {
          error: deserializeError instanceof Error ? deserializeError.stack : deserializeError,
          rawDataType: typeof rawData,
          rawDataPreview: typeof rawData === 'string' ? rawData.substring(0, 100) + '...' : null
        });
        throw deserializeError;
      }
    } catch (error) {
      const err = error as Error;
      this.logger?.error(`Failed to load state for ID ${stateId}:`, {
        error: err.message,
        stack: err.stack,
        stateId
      });
      throw new Error(`Failed to load state: ${err.message}`);
    }
  }
  
  /**
   * Load state data with metadata by ID
   * 
   * @param stateId - Unique identifier for the state to load
   * @returns The state entry including data and metadata, or null if not found
   */
  async loadStateWithMetadata<T = any>(stateId: string): Promise<{ data: T; metadata: StateMetadata } | null> {
    this.ensureInitialized();
    
    try {
      // Retrieve from adapter
      const rawData = await this.storageAdapter.get(this.getStateKey(stateId));
      
      if (!rawData) {
        this.logger?.debug(`No state found for ID: ${stateId}`);
        return null;
      }
      
      // Deserialize if needed
      const stateEntry = this.options.autoSerialize 
        ? this.deserializeState(rawData)
        : rawData as PersistentStateEntry<T>;
      
      this.logger?.debug(`Loaded state with metadata for ID: ${stateId} (version: ${stateEntry.metadata.version})`);
      return {
        data: stateEntry.data,
        metadata: stateEntry.metadata
      };
    } catch (error) {
      this.logger?.error(`Failed to load state with metadata for ID ${stateId}: ${(error as Error).message}`);
      throw new Error(`Failed to load state with metadata: ${(error as Error).message}`);
    }
  }
  
  /**
   * Update existing state data (partial update)
   * 
   * @param stateId - Unique identifier for the state to update
   * @param partialState - Partial state data to update
   * @param options - Optional settings for this operation
   * @returns Promise<void>
   */
  async updateState(
    stateId: string,
    partialState: any,
    options?: {
      ttl?: number;
      updatedBy?: string;
      description?: string;
    }
  ): Promise<void> {
    this.ensureInitialized();
    
    try {
      // First check if state exists
      const exists = await this.storageAdapter.has(this.getStateKey(stateId));
      
      if (!exists) {
        // If state doesn't exist, create it instead
        return this.saveState(stateId, partialState, options);
      }
      
      // Retrieve current state
      const rawData = await this.storageAdapter.get(this.getStateKey(stateId));
      
      if (!rawData) {
        // This shouldn't happen if 'has' returned true, but just in case
        return this.saveState(stateId, partialState, options);
      }
      
      // Deserialize if needed
      const stateEntry = this.options.autoSerialize 
        ? this.deserializeState(rawData)
        : rawData as PersistentStateEntry;
      
      const now = Date.now();
      
      // Merge the new data with existing data
      const mergedData = deepMerge(stateEntry.data, partialState);
      
      // Update state entry
      const updatedStateEntry: PersistentStateEntry = {
        // Use the merged data
        data: mergedData,
        metadata: {
          ...stateEntry.metadata,
          version: stateEntry.metadata.version + 1,
          updatedAt: now,
          updatedBy: options?.updatedBy || stateEntry.metadata.updatedBy,
          history: [
            ...(stateEntry.metadata.history || []),
            {
              version: stateEntry.metadata.version + 1,
              timestamp: now,
              updatedBy: options?.updatedBy,
              description: options?.description || 'State update'
            }
          ]
        }
      };
      
      // Serialize if needed
      const dataToStore = this.options.autoSerialize 
        ? this.serializeState(updatedStateEntry, { compress: this.options.compress })
        : updatedStateEntry;
      
      // Use set instead of update to ensure complete replacement
      await this.storageAdapter.set(
        this.getStateKey(stateId),
        dataToStore,
        options?.ttl !== undefined ? options.ttl : this.options.ttl
      );
      
      this.logger?.debug(`Updated state for ID: ${stateId} (new version: ${updatedStateEntry.metadata.version})`);
    } catch (error) {
      this.logger?.error(`Failed to update state for ID ${stateId}: ${(error as Error).message}`);
      throw new Error(`Failed to update state: ${(error as Error).message}`);
    }
  }
  
  /**
   * Delete state data by ID
   * 
   * @param stateId - Unique identifier for the state to delete
   */
  async deleteState(stateId: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      await this.storageAdapter.delete(this.getStateKey(stateId));
      this.logger?.debug(`Deleted state for ID: ${stateId}`);
    } catch (error) {
      this.logger?.error(`Failed to delete state for ID ${stateId}: ${(error as Error).message}`);
      throw new Error(`Failed to delete state: ${(error as Error).message}`);
    }
  }
  
  /**
   * Check if state exists
   * 
   * @param stateId - Unique identifier for the state to check
   * @returns True if state exists, false otherwise
   */
  async hasState(stateId: string): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const stateKey = this.getStateKey(stateId);
      this.logger?.debug(`Checking if state exists for ID: ${stateId} with key: ${stateKey}`);
      
      const exists = await this.storageAdapter.has(stateKey);
      
      this.logger?.debug(`State exists check for ID ${stateId}: ${exists ? 'Found' : 'Not found'}`);
      return exists;
    } catch (error) {
      const err = error as Error;
      this.logger?.error(`Failed to check state existence for ID ${stateId}:`, {
        error: err.message,
        stack: err.stack,
        stateId
      });
      throw new Error(`Failed to check state existence: ${err.message}`);
    }
  }
  
  /**
   * Get state metadata without loading the full state
   * 
   * @param stateId - Unique identifier for the state
   * @returns The state metadata, or null if not found
   */
  async getStateMetadata(stateId: string): Promise<StateMetadata | null> {
    this.ensureInitialized();
    
    try {
      const result = await this.loadStateWithMetadata(stateId);
      return result ? result.metadata : null;
    } catch (error) {
      this.logger?.error(`Failed to get metadata for ID ${stateId}: ${(error as Error).message}`);
      throw new Error(`Failed to get state metadata: ${(error as Error).message}`);
    }
  }
  
  /**
   * List all state IDs according to filter criteria
   * 
   * @param filter - Optional filter criteria
   * @returns Array of state IDs
   */
  async listStates(filter?: StateFilter): Promise<string[]> {
    this.ensureInitialized();
    
    try {
      // For listing states, we need to modify the filter to account for our key prefixing
      const adjustedFilter: StateFilter = { ...filter };
      
      // Adjust the key prefix to account for our "state:" prefix
      if (filter?.keyPrefix) {
        adjustedFilter.keyPrefix = `state:${filter.keyPrefix}`;
      } else {
        // If no specific prefix is provided, filter to only include our state keys
        adjustedFilter.keyPrefix = 'state:';
      }
      
      // Get keys from the storage adapter
      const stateKeys = await this.storageAdapter.listKeys(adjustedFilter);
      
      // Convert storage keys back to state IDs
      return stateKeys.map(key => this.extractStateId(key));
    } catch (error) {
      this.logger?.error(`Failed to list states: ${(error as Error).message}`);
      throw new Error(`Failed to list states: ${(error as Error).message}`);
    }
  }
  
  /**
   * Clear all states in this manager's namespace
   */
  async clearAllStates(): Promise<void> {
    this.ensureInitialized();
    
    try {
      // Check if the storage adapter supports the clear method
      if (typeof this.storageAdapter.clear === 'function') {
        await this.storageAdapter.clear();
      } else {
        // Fallback: delete all keys with our namespace
        const keys = await this.storageAdapter.listKeys('state:*');
        for (const key of keys) {
          await this.storageAdapter.delete(key);
        }
      }
      this.logger?.debug('Cleared all states');
    } catch (error) {
      this.logger?.error(`Failed to clear states: ${(error as Error).message}`);
      throw new Error(`Failed to clear states: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get storage key for a state ID
   */
  private getStateKey(stateId: string): string {
    return `state:${stateId}`;
  }
  
  /**
   * Extract state ID from storage key
   */
  private extractStateId(key: string): string {
    // Remove the 'state:' prefix
    return key.startsWith('state:') ? key.substring(6) : key;
  }
  
  /**
   * Ensure the manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('PersistentStateManager is not initialized. Call initialize() first.');
    }
  }
  
  /**
   * Serialize state for storage
   */
  private serializeState(
    state: PersistentStateEntry,
    options: SerializationOptions = {}
  ): string {
    try {
      const serialized = JSON.stringify(state);
      
      if (options.compress) {
        // In a real implementation, we would compress the string here
        // For simplicity, we're not implementing compression in this example
        return serialized;
      }
      
      return serialized;
    } catch (error) {
      this.logger?.error(`Failed to serialize state: ${(error as Error).message}`);
      throw new Error(`Failed to serialize state: ${(error as Error).message}`);
    }
  }
  
  /**
   * Deserialize state from storage
   */
  private deserializeState(serialized: any): PersistentStateEntry {
    try {
      // Check if the data is already an object (might not be serialized)
      if (typeof serialized === 'object' && serialized !== null) {
        return serialized;
      }
      
      // Otherwise, parse from JSON string
      if (typeof serialized === 'string') {
        // In a real implementation, we would check for and decompress if needed
        return JSON.parse(serialized);
      }
      
      throw new Error('Invalid serialized state format');
    } catch (error) {
      this.logger?.error(`Failed to deserialize state: ${(error as Error).message}`);
      throw new Error(`Failed to deserialize state: ${(error as Error).message}`);
    }
  }
  
  /**
   * List state keys matching a pattern
   * 
   * @param pattern - Pattern to match (supports * wildcards)
   * @returns Array of state keys
   */
  async listKeys(pattern: string): Promise<string[]> {
    this.ensureInitialized();
    
    try {
      // Check if the storage adapter supports listing keys
      if (typeof this.storageAdapter.listKeys === 'function') {
        const fullPattern = this.getStateKey(pattern);
        const keys = await this.storageAdapter.listKeys(fullPattern);
        
        // Extract the state IDs from the keys
        return keys.map(key => this.extractStateId(key));
      } else {
        this.logger?.warn('Storage adapter does not support listing keys');
        return [];
      }
    } catch (error) {
      this.logger?.error(`Failed to list keys for pattern ${pattern}`, { error });
      throw new Error(`Failed to list keys: ${(error as Error).message}`);
    }
  }
  
  /**
   * Close all resources and connections
   */
  async dispose(): Promise<void> {
    try {
      // If the storage adapter has a dispose method, call it
      if (this.storageAdapter && typeof (this.storageAdapter as any).dispose === 'function') {
        await (this.storageAdapter as any).dispose();
        this.logger?.debug('Storage adapter disposed');
      }
      
      this.initialized = false;
      this.logger?.debug('PersistentStateManager disposed');
    } catch (error) {
      this.logger?.error(`Error disposing PersistentStateManager: ${(error as Error).message}`);
    }
  }
} 