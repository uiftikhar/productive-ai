import { StorageAdapter, StateFilter } from './storage-adapters/storage-adapter.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { deepClone, deepMerge } from '../utils/object-utils';

/**
 * Options for persistent state manager
 */
export interface PersistentStateOptions {
  /**
   * Storage adapter to use for persistence
   */
  storageAdapter: StorageAdapter;
  
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
  private storageAdapter: StorageAdapter;
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
      ...options
    };
    
    this.storageAdapter = options.storageAdapter;
    this.logger = options.logger;
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
        this.getStateKey(stateId),
        dataToStore,
        options?.ttl !== undefined ? options.ttl : this.options.ttl
      );
      
      this.logger?.debug(`Saved state for ID: ${stateId}`);
    } catch (error) {
      this.logger?.error(`Failed to save state for ID ${stateId}: ${(error as Error).message}`);
      throw new Error(`Failed to save state: ${(error as Error).message}`);
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
      // Retrieve from adapter
      const rawData = await this.storageAdapter.get(this.getStateKey(stateId));
      
      if (!rawData) {
        this.logger?.debug(`No state found for ID: ${stateId}`);
        return null;
      }
      
      // Deserialize if needed
      const stateEntry = this.options.autoSerialize 
        ? this.deserializeState(rawData)
        : rawData as PersistentStateEntry;
      
      this.logger?.debug(`Loaded state for ID: ${stateId} (version: ${stateEntry.metadata.version})`);
      return stateEntry.data as T;
    } catch (error) {
      this.logger?.error(`Failed to load state for ID ${stateId}: ${(error as Error).message}`);
      throw new Error(`Failed to load state: ${(error as Error).message}`);
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
      return await this.storageAdapter.has(this.getStateKey(stateId));
    } catch (error) {
      this.logger?.error(`Failed to check state existence for ID ${stateId}: ${(error as Error).message}`);
      throw new Error(`Failed to check state existence: ${(error as Error).message}`);
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
      await this.storageAdapter.clear();
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
} 