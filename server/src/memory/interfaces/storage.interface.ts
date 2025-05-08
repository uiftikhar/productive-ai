// We have pinecope and vector embeddings, can that be used here? what purpose does this serve?
/**
 * Memory Storage Interfaces
 * Part of Milestone 2.2: Agent Memory System
 */
import { Memory, MemoryQueryParams, MemoryQueryResults } from './memory.interface';

/**
 * Storage configuration options
 */
export interface MemoryStorageConfig {
  connectionString?: string;
  apiKey?: string;
  dataDirectory?: string;
  collectionName?: string;
  namespace?: string;
  indexName?: string;
  dimensions?: number;
  maxConnections?: number;
  ttl?: number; // Time to live in milliseconds
  compressionEnabled?: boolean;
  encryptionEnabled?: boolean;
  encryptionKey?: string;
  retentionPolicy?: RetentionPolicy;
  syncInterval?: number; // Sync interval in milliseconds
  [key: string]: any;
}

/**
 * Retention policy for memory storage
 */
export interface RetentionPolicy {
  maxAge?: number; // Maximum age in milliseconds
  maxItems?: number; // Maximum number of items to store
  prunePriority?: 'oldest' | 'least_important' | 'least_accessed' | 'lowest_confidence';
  excludedTags?: string[]; // Tags that should never be pruned
  archiveInsteadOfDelete?: boolean; // Whether to archive instead of delete
}

/**
 * Base interface for memory storage providers
 */
export interface MemoryStorageProvider<T extends Memory = Memory> {
  /**
   * Initialize the storage provider
   */
  initialize(): Promise<void>;
  
  /**
   * Store a memory in the storage
   */
  store(memory: T): Promise<T>;
  
  /**
   * Retrieve a memory by ID
   */
  retrieve(id: string): Promise<T | null>;
  
  /**
   * Update an existing memory
   */
  update(id: string, updates: Partial<T>): Promise<T>;
  
  /**
   * Delete a memory by ID
   */
  delete(id: string): Promise<boolean>;
  
  /**
   * Perform a query against the stored memories
   */
  query(params: MemoryQueryParams): Promise<MemoryQueryResults<T>>;
  
  /**
   * Perform a similarity search for memories
   */
  similaritySearch(
    query: string,
    params?: Partial<MemoryQueryParams>
  ): Promise<MemoryQueryResults<T>>;
  
  /**
   * Get memories by vector similarity to an embedding
   */
  vectorSearch(
    embedding: number[],
    params?: Partial<MemoryQueryParams>
  ): Promise<MemoryQueryResults<T>>;
  
  /**
   * Increment the access count for a memory
   */
  recordAccess(id: string): Promise<void>;
  
  /**
   * Apply the retention policy
   */
  applyRetentionPolicy(): Promise<number>; // Returns number of pruned memories
  
  /**
   * Get storage statistics
   */
  getStats(): Promise<StorageStats>;
  
  /**
   * Close the storage provider
   */
  close(): Promise<void>;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  totalMemories: number;
  usedStorage: number; // in bytes
  indexSize?: number; // in bytes
  oldestMemory?: Date;
  newestMemory?: Date;
  averageSize?: number; // in bytes
  memoryTypeDistribution?: Record<string, number>;
  agentDistribution?: Record<string, number>;
  accessStats?: {
    totalAccesses: number;
    averageAccessesPerMemory: number;
    mostAccessedMemoryId?: string;
    mostAccessedCount?: number;
  };
}

/**
 * Vector database specific configuration
 */
export interface VectorStorageConfig extends MemoryStorageConfig {
  dimensions: number;
  metadataIndexed?: string[]; // Fields to index for fast filtering
  distanceMetric?: 'cosine' | 'euclidean' | 'dot';
  maxElements?: number;
  pqEnabled?: boolean; // Product quantization for compression
  efConstruction?: number; // Index build-time quality parameter
  m?: number; // Index build-time parameter
}

/**
 * Key-value storage specific configuration
 */
export interface KeyValueStorageConfig extends MemoryStorageConfig {
  useCompression?: boolean;
  indexedFields?: string[];
  cacheTTL?: number; // TTL for cache in milliseconds
  maxKeySize?: number;
  maxValueSize?: number;
}

/**
 * Document database specific configuration
 */
export interface DocumentStorageConfig extends MemoryStorageConfig {
  sharded?: boolean;
  indexedFields?: Record<string, string>; // field name -> index type
  fullTextSearchEnabled?: boolean;
  fullTextSearchFields?: string[];
  schemaValidation?: boolean;
  schemaDefinition?: object;
}

/**
 * A specialized interface for working with vector embeddings
 */
export interface VectorEmbeddingProvider {
  /**
   * Generate an embedding vector for text
   */
  embedText(text: string): Promise<number[]>;
  
  /**
   * Generate an embedding vector for structured data
   */
  embedData(data: any): Promise<number[]>;
  
  /**
   * Calculate similarity between two embeddings
   */
  calculateSimilarity(
    embedding1: number[],
    embedding2: number[],
    metric?: 'cosine' | 'euclidean' | 'dot'
  ): number;
  
  /**
   * Get the model's embedding dimensions
   */
  getDimensions(): number;
  
  /**
   * Check if the provider is ready
   */
  isReady(): Promise<boolean>;
}

/**
 * Storage provider factory for creating appropriate storage providers
 */
export interface StorageProviderFactory {
  /**
   * Create a memory storage provider
   */
  createProvider<T extends Memory>(
    config: MemoryStorageConfig
  ): Promise<MemoryStorageProvider<T>>;
  
  /**
   * Create a vector embedding provider
   */
  createEmbeddingProvider(
    config?: Partial<VectorStorageConfig>
  ): Promise<VectorEmbeddingProvider>;
  
  /**
   * Get available storage provider types
   */
  getAvailableProviders(): string[];
  
  /**
   * Get default configuration for a provider type
   */
  getDefaultConfig(providerType: string): MemoryStorageConfig;
} 