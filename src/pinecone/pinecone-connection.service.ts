import { Index, RecordMetadata } from '@pinecone-database/pinecone';
import {
  PineconeIndexService,
  VectorIndexes,
} from './pinecone-index.service.ts';
import { Logger } from '../shared/logger/logger.interface.ts';
import { ConsoleLogger } from '../shared/logger/console-logger.ts';
import {
  PineconeConnectionConfig,
  DEFAULT_CONFIG,
} from './pinecone-connection.config.ts';
import { VectorRecord, QueryOptions, QueryResponse } from './pinecone.type.ts';

export class PineconeConnectionService {
  private indexService: PineconeIndexService;
  private indexCache: Map<string, { index: Index; timestamp: number }> =
    new Map();
  private config: Required<PineconeConnectionConfig>;
  private logger: Logger;

  constructor(
    options: {
      indexService?: PineconeIndexService;
      logger?: Logger;
      config?: PineconeConnectionConfig;
    } = {},
  ) {
    this.indexService = options.indexService || new PineconeIndexService();
    this.logger = options.logger || new ConsoleLogger();
    this.config = {
      ...DEFAULT_CONFIG,
      ...options.config,
    } as Required<PineconeConnectionConfig>;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing PineconeConnectionService');
    // Any initialization logic can go here
    return Promise.resolve();
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up PineconeConnectionService', {
      cachedIndexes: this.indexCache.size,
    });

    // Clear the cache
    this.indexCache.clear();

    return Promise.resolve();
  }

  /**
   * Execute an operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    retries: number = this.config.maxRetries,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries <= 0) {
        this.logger.error(
          `Max retries reached for Pinecone operation: ${operationName}`,
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            operation: operationName,
          },
        );
        throw error;
      }

      // Exponential backoff
      const delay = Math.pow(2, this.config.maxRetries - retries) * 1000;
      this.logger.warn(`Retrying Pinecone operation ${operationName}`, {
        retriesLeft: retries - 1,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.executeWithRetry(operation, operationName, retries - 1);
    }
  }

  /**
   * Get an index with caching
   * @param indexName The name of the index
   */
  async getIndex(
    indexName: VectorIndexes | string,
  ): Promise<Index<RecordMetadata>> {
    const cacheKey = indexName;
    const now = Date.now();
    if (this.indexCache.has(cacheKey)) {
      const cached = this.indexCache.get(cacheKey)!;
      if (now - cached.timestamp < this.config.cacheExpirationMs) {
        return cached.index;
      }
      // Expired entry
      this.indexCache.delete(cacheKey);
    }

    // Manage cache size
    if (this.indexCache.size >= this.config.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = [...this.indexCache.entries()].sort(
        (a, b) => a[1].timestamp - b[1].timestamp,
      )[0][0];
      this.indexCache.delete(oldestKey);
    }
    // Check if index exists
    const exists = await this.indexService.indexExists(indexName);

    if (!exists) {
      throw new Error(
        `Index ${indexName} does not exist. Please create it first.`,
      );
    }

    // Get the index
    const index = this.indexService.getIndex(indexName);
    this.indexCache.set(cacheKey, { index, timestamp: now });
    return index;
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
    namespace?: string,
    options?: {
      batchSize?: number;
    },
  ): Promise<void> {
    const batchSize = options?.batchSize || this.config.batchSize;

    this.logger.info(`Upserting vectors to index`, {
      indexName,
      recordCount: records.length,
      namespace: namespace || 'default',
      batchSize,
    });
    // Get the base index without namespace to follow the official pattern
    let index = this.indexService.getIndex(indexName);

    // If namespace is provided, use the namespace() method directly
    if (namespace) {
      index = index.namespace(namespace);
    }

    // Split into batches to avoid size limits (100 vectors per batch)
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(records.length / batchSize);

      this.logger.debug(`Processing batch ${batchNumber}/${totalBatches}`, {
        batchSize: batch.length,
        indexName,
        namespace: namespace || 'default',
      });
      await this.executeWithRetry(async () => {
        await index.upsert(batch);
      }, `upsertVectors:${indexName}:batch${batchNumber}`);

      this.logger.info(`Successfully upserted vectors`, {
        indexName,
        recordCount: records.length,
        namespace: namespace || 'default',
      });
    }
  }

  private getTypedIndex<T extends RecordMetadata>(
    indexName: string | VectorIndexes,
    namespace?: string,
  ): Promise<Index<T>> {
    return this.getIndex(indexName).then((index) => {
      return namespace
        ? (index.namespace(namespace) as Index<T>)
        : (index as Index<T>);
    });
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
    namespace?: string,
  ): Promise<QueryResponse<T>> {
    // Get the base index without namespace
    const index = await this.getTypedIndex<T>(indexName, namespace);

    return this.executeWithRetry<QueryResponse<T>>(
      async () => {
        return await index.query({
          vector: queryVector,
          topK: options.topK || 10,
          filter: options.filter,
          includeMetadata: options.includeMetadata !== false,
          includeValues: options.includeValues || false,
        });
      },
      `queryVectors:${indexName}`,
      3,
    );
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
    namespace?: string,
  ): Promise<void> {
    // Get the base index without namespace
    let index = this.indexService.getIndex(indexName);

    // If namespace is provided, use the namespace() method directly
    if (namespace) {
      index = index.namespace(namespace);
    }

    await this.executeWithRetry(
      async () => {
        await index.deleteMany(ids);
      },
      `deleteVectors:${indexName}`,
      3,
    );

    this.logger.info(`Successfully Deleted vectors by ids`, {
      totalIds: ids.length,
      ids: ids.toString(),
      indexName,
      namespace: namespace || 'default',
    });
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
    namespace?: string,
  ): Promise<void> {
    // Get the base index without namespace
    let index = this.indexService.getIndex(indexName);

    // If namespace is provided, use the namespace() method directly
    if (namespace) {
      index = index.namespace(namespace);
    }

    await this.executeWithRetry(
      async () => {
        await index.deleteMany(filter);
      },
      `deleteVectorsByFilter:${indexName}`,
      3,
    );

    this.logger.info(`Successfully Deleted vectors by filter`, {
      indexName,
      namespace: namespace || 'default',
    });
  }

  /**
   * Delete all vectors in a namespace
   * @param indexName The name of the index
   * @param namespace The namespace to clear (required - be explicit about clearing namespaces)
   */
  async deleteAllVectorsInNamespace(
    indexName: VectorIndexes | string,
    namespace: string,
  ): Promise<void> {
    // Get the base index and apply namespace directly
    const index = this.indexService.getIndex(indexName).namespace(namespace);

    await this.executeWithRetry(
      async () => {
        await index.deleteAll();
      },
      `deleteAllVectorsInNamespace:${indexName}`,
      3,
    );

    this.logger.info(`Successfully Deleted all vectors from namespace`, {
      indexName,
      namespace: namespace || 'default',
    });
  }

  /**
   * Get index statistics
   * @param indexName The name of the index
   */
  async describeIndexStats(indexName: VectorIndexes | string): Promise<any> {
    const index = this.indexService.getIndex(indexName);

    return this.executeWithRetry(
      async () => {
        return await index.describeIndexStats();
      },
      `describeIndexStats:${indexName}`,
      3,
    );
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
    namespace?: string,
  ) {
    // Get the base index without namespace
    let index = this.indexService.getIndex(indexName);

    // If namespace is provided, use the namespace() method directly
    if (namespace) {
      index = index.namespace(namespace);
    }

    return this.executeWithRetry(
      async () => {
        return await index.fetch(ids);
      },
      `fetchVectors:${indexName}`,
      3,
    );
  }

  /**
   * Find similar vectors using similarity search
   * @param indexName The name of the index
   * @param vector The query vector
   * @param topK Number of results to return
   * @param namespace Optional namespace to search in
   */
  async findSimilar<T extends RecordMetadata = RecordMetadata>(
    indexName: VectorIndexes | string,
    vector: number[],
    topK = 10,
    namespace?: string,
  ): Promise<QueryResponse<T>> {
    return this.queryVectors<T>(
      indexName,
      vector,
      { topK, includeMetadata: true },
      namespace,
    );
  }

  /**
   * Check if a namespace exists
   * @param indexName The name of the index
   * @param namespace The namespace to check
   */
  async namespaceExists(
    indexName: VectorIndexes | string,
    namespace: string,
  ): Promise<boolean> {
    const stats = await this.describeIndexStats(indexName);
    return !!stats.namespaces && namespace in stats.namespaces;
  }

  /**
   * List all namespaces in an index
   * @param indexName The name of the index
   */
  async listNamespaces(indexName: VectorIndexes | string): Promise<string[]> {
    const stats = await this.describeIndexStats(indexName);
    return stats.namespaces ? Object.keys(stats.namespaces) : [];
  }

  /**
   * Get vector count for a namespace
   * @param indexName The name of the index
   * @param namespace The namespace to check
   */
  async getNamespaceVectorCount(
    indexName: VectorIndexes | string,
    namespace: string,
  ): Promise<number> {
    const stats = await this.describeIndexStats(indexName);
    return stats.namespaces && stats.namespaces[namespace]
      ? stats.namespaces[namespace].vectorCount
      : 0;
  }
}
