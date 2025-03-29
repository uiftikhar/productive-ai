import { Index, RecordMetadata, FetchOptions } from '@pinecone-database/pinecone';
import { PineconeIndexService, VectorIndexes } from './pinecone-index.service.ts';

export interface VectorRecord<T extends RecordMetadata = RecordMetadata> {
  id: string;
  values: number[];
  metadata?: T;
}

export interface QueryOptions {
  topK?: number;
  filter?: Record<string, any>;
  includeMetadata?: boolean;
  includeValues?: boolean;
}

export class PineconeConnectionService {
  private indexService: PineconeIndexService;
  private indexCache: Map<string, Index> = new Map();
  private maxRetries = 3;
  
  constructor() {
    this.indexService = new PineconeIndexService();
  }
  
  /**
   * Execute an operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>, 
    retries: number = this.maxRetries
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries <= 0) {
        console.error('Max retries reached for Pinecone operation:', error);
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.pow(2, this.maxRetries - retries) * 1000;
      console.log(`Retrying Pinecone operation in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.executeWithRetry(operation, retries - 1);
    }
  }
  
  /**
   * Get an index with caching
   * @param indexName The name of the index
   */
  async getIndex(indexName: VectorIndexes | string): Promise<Index> {
    const cacheKey = indexName;
    
    if (!this.indexCache.has(cacheKey)) {
      // Check if index exists
      const exists = await this.indexService.indexExists(indexName);
      
      if (!exists) {
        throw new Error(`Index ${indexName} does not exist. Please create it first.`);
      }
      
      // Get the index
      const index = this.indexService.getIndex(indexName);
      this.indexCache.set(cacheKey, index);
    }
    
    return this.indexCache.get(cacheKey)!;
  }
  
  /**
   * Upsert vectors to an index
   * @param indexName The name of the index
   * @param records The vector records to upsert
   * @param namespace Optional namespace to upsert into
   */
  async upsertVectors<T extends RecordMetadata = RecordMetadata>(
    indexName: VectorIndexes | string,
    records: VectorRecord<T>[],
    namespace?: string
  ): Promise<void> {
    // Get the base index without namespace to follow the official pattern
    let index = this.indexService.getIndex(indexName);
    
    // If namespace is provided, use the namespace() method directly
    if (namespace) {
      index = index.namespace(namespace);
    }
    
    // Split into batches to avoid size limits (100 vectors per batch)
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      await this.executeWithRetry(async () => {
        await index.upsert(batch);
      });
    }
    
    const namespaceStr = namespace ? ` to namespace '${namespace}'` : '';
    console.log(`Upserted ${records.length} vectors to ${indexName}${namespaceStr}`);
  }
  
  /**
   * Query vectors from an index
   * @param indexName The name of the index
   * @param queryVector The vector to query with
   * @param options Query options
   * @param namespace Optional namespace to query within
   */
  async queryVectors<T extends RecordMetadata = RecordMetadata>(
    indexName: VectorIndexes | string,
    queryVector: number[],
    options: QueryOptions = {},
    namespace?: string
  ) {
    // Get the base index without namespace
    let index = this.indexService.getIndex(indexName);
    
    // If namespace is provided, use the namespace() method directly
    if (namespace) {
      index = index.namespace(namespace);
    }
    
    return this.executeWithRetry(async () => {
      return await index.query({
        vector: queryVector,
        topK: options.topK || 10,
        filter: options.filter,
        includeMetadata: options.includeMetadata !== false,
        includeValues: options.includeValues || false
      });
    });
  }
  
  /**
   * Delete vectors by ID
   * @param indexName The name of the index
   * @param ids The IDs of the vectors to delete
   * @param namespace Optional namespace to delete from
   */
  async deleteVectors(
    indexName: VectorIndexes | string,
    ids: string[],
    namespace?: string
  ): Promise<void> {
    // Get the base index without namespace
    let index = this.indexService.getIndex(indexName);
    
    // If namespace is provided, use the namespace() method directly
    if (namespace) {
      index = index.namespace(namespace);
    }
    
    await this.executeWithRetry(async () => {
      await index.deleteMany(ids);
    });
    
    const namespaceStr = namespace ? ` from namespace '${namespace}'` : '';
    console.log(`Deleted ${ids.length} vectors from ${indexName}${namespaceStr}`);
  }
  
  /**
   * Delete vectors by filter
   * @param indexName The name of the index
   * @param filter The filter to apply
   * @param namespace Optional namespace to delete from
   */
  async deleteVectorsByFilter(
    indexName: VectorIndexes | string,
    filter: Record<string, any>,
    namespace?: string
  ): Promise<void> {
    // Get the base index without namespace
    let index = this.indexService.getIndex(indexName);
    
    // If namespace is provided, use the namespace() method directly
    if (namespace) {
      index = index.namespace(namespace);
    }
    
    await this.executeWithRetry(async () => {
      await index.deleteMany(filter);
    });
    
    const namespaceStr = namespace ? ` from namespace '${namespace}'` : '';
    console.log(`Deleted vectors by filter from ${indexName}${namespaceStr}`);
  }
  
  /**
   * Delete all vectors in a namespace
   * @param indexName The name of the index
   * @param namespace The namespace to clear (required - be explicit about clearing namespaces)
   */
  async deleteAllVectorsInNamespace(
    indexName: VectorIndexes | string,
    namespace: string
  ): Promise<void> {
    // Get the base index and apply namespace directly
    const index = this.indexService.getIndex(indexName).namespace(namespace);
    
    await this.executeWithRetry(async () => {
      await index.deleteAll();
    });
    
    console.log(`Deleted all vectors from namespace '${namespace}' in index ${indexName}`);
  }
  
  /**
   * Get index statistics
   * @param indexName The name of the index
   */
  async describeIndexStats(indexName: VectorIndexes | string): Promise<any> {
    const index = this.indexService.getIndex(indexName);
    
    return this.executeWithRetry(async () => {
      return await index.describeIndexStats();
    });
  }
  
  /**
   * Fetch specific vectors by ID
   * @param indexName The name of the index
   * @param ids The IDs to fetch
   * @param namespace Optional namespace to fetch from
   */
  async fetchVectors<T extends RecordMetadata = RecordMetadata>(
    indexName: VectorIndexes | string,
    ids: string[],
    namespace?: string
  ) {
    // Get the base index without namespace
    let index = this.indexService.getIndex(indexName);
    
    // If namespace is provided, use the namespace() method directly
    if (namespace) {
      index = index.namespace(namespace);
    }
    
    return this.executeWithRetry(async () => {
      // FetchOptions is actually defined as an array of IDs, not an object
      return await index.fetch(ids);
    });
  }
}