import { StorageAdapter, StorageOptions, StateFilter } from './storage-adapter.interface';
import { Logger } from '../../../../shared/logger/logger.interface';
import { deepMerge } from '../../utils/object-utils';

// Define these types to avoid requiring mongodb as a direct dependency
// This allows the file to be compiled even if mongodb is not installed
type MongoClientType = any;
type MongoClientOptions = any;
type Collection = any;
type Db = any;

/**
 * Options for MongoDB storage adapter
 */
export interface MongoStorageOptions extends StorageOptions {
  /**
   * MongoDB connection URI
   */
  uri: string;
  
  /**
   * Database name
   */
  database: string;
  
  /**
   * Collection name
   */
  collection: string;
  
  /**
   * MongoDB client options
   */
  clientOptions?: MongoClientOptions;
  
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Whether to create indexes automatically (default: true)
   */
  createIndexes?: boolean;
  
  /**
   * Whether to validate the connection on initialization (default: true)
   */
  validateConnection?: boolean;
}

/**
 * Document structure stored in MongoDB
 */
interface MongoDocument {
  /**
   * Document key
   */
  key: string;
  
  /**
   * Namespace for grouping
   */
  namespace: string;
  
  /**
   * Optional prefix for grouping
   */
  prefix?: string;
  
  /**
   * Actual data
   */
  data: any;
  
  /**
   * Creation timestamp
   */
  createdAt: Date;
  
  /**
   * Last update timestamp
   */
  updatedAt: Date;
  
  /**
   * Expiration timestamp
   */
  expiresAt?: Date;
}

/**
 * MongoDB storage adapter implementation
 * Provides persistent storage using MongoDB
 */
export class MongoStorageAdapter implements StorageAdapter {
  private options: MongoStorageOptions;
  private logger?: Logger;
  private initialized = false;
  private collection?: Collection;
  private client?: MongoClientType;
  private db?: Db;
  
  /**
   * Create a new MongoDB storage adapter
   */
  constructor(options: MongoStorageOptions) {
    this.options = {
      namespace: 'mongo-storage',
      keyPrefix: '',
      defaultTtl: 0, // No expiration by default
      createIndexes: true,
      validateConnection: true,
      ...options
    };
    
    if (!this.options.uri) {
      throw new Error('MongoStorageAdapter requires uri option');
    }
    
    if (!this.options.database) {
      throw new Error('MongoStorageAdapter requires database option');
    }
    
    if (!this.options.collection) {
      throw new Error('MongoStorageAdapter requires collection option');
    }
    
    this.logger = options.logger;
  }
  
  /**
   * Initialize the storage adapter
   */
  async initialize(): Promise<void> {
    try {
      // Dynamically import MongoDB to avoid direct dependency
      const { MongoClient } = await import('mongodb');
      
      this.client = new MongoClient(this.options.uri, this.options.clientOptions);
      await this.client.connect();
      
      this.db = this.client.db(this.options.database);
      this.collection = this.db.collection(this.options.collection);
      
      // Validate connection if required
      if (this.options.validateConnection) {
        const ping = await this.db.command({ ping: 1 });
        if (!ping || !ping.ok) {
          throw new Error('Failed to ping MongoDB');
        }
      }
      
      // Create indexes if required
      if (this.options.createIndexes) {
        await this.createIndexes();
      }
      
      this.initialized = true;
      this.logger?.debug(`MongoStorageAdapter initialized with collection: ${this.options.collection}`);
    } catch (error) {
      this.logger?.error(`Failed to initialize MongoStorageAdapter: ${(error as Error).message}`);
      throw new Error(`Failed to initialize MongoDB storage: ${(error as Error).message}`);
    }
  }
  
  /**
   * Store data with an optional TTL override
   */
  async set(key: string, data: any, ttl?: number): Promise<void> {
    this.ensureInitialized();
    
    try {
      const now = new Date();
      const expiresAt = this.calculateExpiration(ttl);
      const namespace = this.options.namespace || 'default';
      
      const document: MongoDocument = {
        key,
        namespace,
        prefix: this.options.keyPrefix || undefined,
        data,
        createdAt: now,
        updatedAt: now,
        ...(expiresAt ? { expiresAt } : {})
      };
      
      await this.collection!.updateOne(
        this.createKeyFilter(key),
        { $set: document },
        { upsert: true }
      );
      
      this.logger?.debug(`Successfully stored data for key: ${key}`);
    } catch (error) {
      this.logger?.error(`Failed to set data for key ${key}: ${(error as Error).message}`);
      throw new Error(`Failed to store data: ${(error as Error).message}`);
    }
  }
  
  /**
   * Retrieve data by key
   */
  async get(key: string): Promise<any | null> {
    this.ensureInitialized();
    
    try {
      const document = await this.collection!.findOne(this.createKeyFilter(key));
      
      if (!document) {
        this.logger?.debug(`No data found for key: ${key}`);
        return null;
      }
      
      // Check if data has expired
      if (document.expiresAt && document.expiresAt < new Date()) {
        this.logger?.debug(`Data for key ${key} has expired`);
        await this.delete(key).catch(err => {
          this.logger?.warn(`Failed to delete expired data for key ${key}: ${err.message}`);
        });
        return null;
      }
      
      this.logger?.debug(`Retrieved data for key: ${key}`);
      return document.data;
    } catch (error) {
      this.logger?.error(`Failed to get data for key ${key}: ${(error as Error).message}`);
      throw new Error(`Failed to retrieve data: ${(error as Error).message}`);
    }
  }
  
  /**
   * Update existing data (partial update)
   */
  async update(key: string, partialData: any, ttl?: number): Promise<void> {
    this.ensureInitialized();
    
    try {
      // Check if document exists
      const document = await this.collection!.findOne(this.createKeyFilter(key));
      
      if (!document) {
        this.logger?.debug(`No existing data to update for key: ${key}`);
        return this.set(key, partialData, ttl);
      }
      
      // Check if data has expired
      if (document.expiresAt && document.expiresAt < new Date()) {
        this.logger?.debug(`Data for key ${key} has expired, creating new data`);
        return this.set(key, partialData, ttl);
      }
      
      // Merge data
      const now = new Date();
      const expiresAt = this.calculateExpiration(ttl);
      const mergedData = deepMerge(document.data, partialData);
      
      const updateData: Partial<MongoDocument> = {
        data: mergedData,
        updatedAt: now,
        ...(expiresAt ? { expiresAt } : {})
      };
      
      await this.collection!.updateOne(
        this.createKeyFilter(key),
        { $set: updateData }
      );
      
      this.logger?.debug(`Successfully updated data for key: ${key}`);
    } catch (error) {
      this.logger?.error(`Failed to update data for key ${key}: ${(error as Error).message}`);
      throw new Error(`Failed to update data: ${(error as Error).message}`);
    }
  }
  
  /**
   * Delete data by key
   */
  async delete(key: string): Promise<void> {
    this.ensureInitialized();
    
    try {
      const result = await this.collection!.deleteOne(this.createKeyFilter(key));
      
      if (result.deletedCount) {
        this.logger?.debug(`Deleted data for key: ${key}`);
      } else {
        this.logger?.debug(`No data found to delete for key: ${key}`);
      }
    } catch (error) {
      this.logger?.error(`Failed to delete data for key ${key}: ${(error as Error).message}`);
      throw new Error(`Failed to delete data: ${(error as Error).message}`);
    }
  }
  
  /**
   * List keys according to filter criteria
   */
  async listKeys(filter?: StateFilter): Promise<string[]> {
    this.ensureInitialized();
    
    try {
      // Create the MongoDB query
      const namespace = this.options.namespace || 'default';
      
      const query: Record<string, any> = {
        namespace
      };
      
      // Add prefix filter if specified
      if (this.options.keyPrefix) {
        query.prefix = this.options.keyPrefix;
      }
      
      // Add key prefix filter if specified in filter
      if (filter?.keyPrefix) {
        query.key = { $regex: `^${this.escapeRegExp(filter.keyPrefix)}` };
      }
      
      // Add expiration check
      query.$or = [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ];
      
      // Configure options
      const options: Record<string, any> = {
        projection: { key: 1 }
      };
      
      // Add pagination
      if (filter?.offset !== undefined) {
        options.skip = filter.offset;
      }
      
      if (filter?.limit !== undefined) {
        options.limit = filter.limit;
      }
      
      // Execute query
      const cursor = this.collection!.find(query, options);
      const documents = await cursor.toArray();
      
      // Extract keys
      let keys = documents.map((doc: MongoDocument) => doc.key);
      
      // Apply custom filter function if provided
      if (filter?.filterFn) {
        keys = keys.filter(filter.filterFn);
      }
      
      this.logger?.debug(`Listed ${keys.length} keys matching filter`, { filter });
      return keys;
    } catch (error) {
      this.logger?.error(`Failed to list keys: ${(error as Error).message}`);
      throw new Error(`Failed to list keys: ${(error as Error).message}`);
    }
  }
  
  /**
   * Clear all data in this adapter's namespace
   */
  async clear(): Promise<void> {
    this.ensureInitialized();
    
    try {
      const namespace = this.options.namespace || 'default';
      
      const query: Record<string, any> = {
        namespace
      };
      
      // Add prefix filter if specified
      if (this.options.keyPrefix) {
        query.prefix = this.options.keyPrefix;
      }
      
      const result = await this.collection!.deleteMany(query);
      
      this.logger?.debug(`Cleared ${result.deletedCount} documents from namespace '${namespace}'`);
    } catch (error) {
      this.logger?.error(`Failed to clear storage: ${(error as Error).message}`);
      throw new Error(`Failed to clear storage: ${(error as Error).message}`);
    }
  }
  
  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const query = {
        ...this.createKeyFilter(key),
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: { $gt: new Date() } }
        ]
      };
      
      const count = await this.collection!.countDocuments(query, { limit: 1 });
      return count > 0;
    } catch (error) {
      this.logger?.error(`Failed to check existence for key ${key}: ${(error as Error).message}`);
      throw new Error(`Failed to check existence: ${(error as Error).message}`);
    }
  }
  
  /**
   * Create required indexes
   */
  private async createIndexes(): Promise<void> {
    try {
      // Compound index for quick lookups by namespace, prefix, and key
      await this.collection!.createIndex(
        { namespace: 1, prefix: 1, key: 1 },
        { name: 'namespace_prefix_key_idx', background: true }
      );
      
      // TTL index for automatic document expiration
      await this.collection!.createIndex(
        { expiresAt: 1 },
        { name: 'expiresAt_idx', expireAfterSeconds: 0, background: true }
      );
      
      this.logger?.debug('Created indexes for MongoDB collection');
    } catch (error) {
      this.logger?.warn(`Failed to create indexes: ${(error as Error).message}`);
      // Don't throw here, continue even if indexes fail
    }
  }
  
  /**
   * Create a MongoDB filter for a key
   */
  private createKeyFilter(key: string): Record<string, any> {
    const namespace = this.options.namespace || 'default';
    
    const filter: Record<string, any> = {
      namespace,
      key
    };
    
    if (this.options.keyPrefix) {
      filter.prefix = this.options.keyPrefix;
    }
    
    return filter;
  }
  
  /**
   * Calculate expiration date from TTL
   */
  private calculateExpiration(ttl?: number): Date | undefined {
    const effectiveTtl = ttl !== undefined ? ttl : this.options.defaultTtl;
    
    if (!effectiveTtl || effectiveTtl <= 0) {
      return undefined; // No expiration
    }
    
    return new Date(Date.now() + (effectiveTtl * 1000));
  }
  
  /**
   * Ensure the adapter is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('MongoStorageAdapter is not initialized. Call initialize() first.');
    }
  }
  
  /**
   * Escape special characters in RegExp
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
} 