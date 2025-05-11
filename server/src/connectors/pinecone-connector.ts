/**
 * Pinecone Vector Database Connector
 *
 * This connector provides simplified access to the Pinecone vector database for storing
 * and retrieving vector embeddings. It follows the modern connector pattern rather than
 * the legacy adapter pattern.
 */

import { RecordMetadata } from '@pinecone-database/pinecone';
import { Logger } from '../shared/logger/logger.interface';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { PineconeConnectionService } from '../pinecone/pinecone-connection.service';
import { VectorIndexes } from '../pinecone/pinecone-index.service';
import { VectorRecord, QueryOptions } from '../pinecone/pinecone.type';
import { performance } from 'perf_hooks';

// Add interface for vector stats tracking
interface PineconeStats {
  totalUpserts: number;
  totalQueries: number;
  totalDeletes: number;
  lastBatchSize: number;
  lastQueryResults: number;
  totalLatency: number;
  queryCount: number;
  averageQueryLatency: number;
}

/**
 * Connector for PineconeConnectionService that provides a simplified interface
 * for use within the agent framework
 */
export class PineconeConnector {
  private pineconeService: PineconeConnectionService;
  private logger: Logger;
  private defaultNamespace: string;
  private stats: PineconeStats = {
    totalUpserts: 0,
    totalQueries: 0,
    totalDeletes: 0,
    lastBatchSize: 0,
    lastQueryResults: 0,
    totalLatency: 0,
    queryCount: 0,
    averageQueryLatency: 0
  };

  constructor(
    options: {
      pineconeService?: PineconeConnectionService;
      logger?: Logger;
      defaultNamespace?: string;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.pineconeService =
      options.pineconeService || new PineconeConnectionService();
    this.defaultNamespace = options.defaultNamespace || 'agent-data';
  }

  /**
   * Initialize the Pinecone adapter
   * This now only logs the initialization and doesn't actually initialize the indexes
   * since that's now handled centrally in index.ts
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing PineconeConnector connection');
    // We don't call pineconeService.initialize() here anymore since
    // initialization is now handled in index.ts

    // Just verify the connection by checking if an index exists
    try {
      // Check if at least one of our indexes exists to verify connection
      const indexExists = await this.pineconeService.getIndex(
        VectorIndexes.USER_CONTEXT,
      );
      this.logger.info('Connected to Pinecone successfully');
    } catch (error) {
      this.logger.warn('Could not verify Pinecone connection', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw here, as the central initialization might still be in progress
    }
  }

  /**
   * Store a vector in the index
   * @param indexName Index name
   * @param id Vector record ID
   * @param vector Vector data
   * @param metadata Associated metadata
   * @param namespace Optional namespace
   */
  async storeVector<T extends RecordMetadata = RecordMetadata>(
    indexName: string,
    id: string,
    vector: number[],
    metadata: T = {} as T,
    namespace?: string,
  ): Promise<void> {
    const ns = namespace || this.defaultNamespace;

    const record: VectorRecord<T> = {
      id,
      values: vector,
      metadata,
    };

    this.logger.debug('Storing vector', { indexName, id, namespace: ns });

    await this.pineconeService.upsertVectors(indexName, [record], ns);
  }

  /**
   * Store multiple vectors in the index
   * @param indexName Index name
   * @param records Vector records
   * @param namespace Optional namespace
   */
  async storeVectors<T extends RecordMetadata = RecordMetadata>(
    indexName: string,
    records: Array<{
      id: string;
      vector: number[];
      metadata?: T;
    }>,
    namespace?: string,
  ): Promise<void> {
    const ns = namespace || this.defaultNamespace;

    const vectorRecords: VectorRecord<T>[] = records.map((record) => ({
      id: record.id,
      values: record.vector,
      metadata: record.metadata || ({} as T),
    }));

    this.logger.debug('Storing multiple vectors', {
      indexName,
      count: records.length,
      namespace: ns,
    });

    await this.pineconeService.upsertVectors(indexName, vectorRecords, ns);
  }

  /**
   * Query for similar vectors
   * @param indexName Index name
   * @param queryVector Query vector
   * @param options Query options
   * @param namespace Optional namespace
   */
  async querySimilar<T extends RecordMetadata = RecordMetadata>(
    indexName: string,
    queryVector: number[],
    options: {
      topK?: number;
      filter?: Record<string, any>;
      includeValues?: boolean;
      minScore?: number;
    } = {},
    namespace?: string,
  ): Promise<
    Array<{
      id: string;
      score: number;
      metadata: T;
      values?: number[];
    }>
  > {
    const ns = namespace || this.defaultNamespace;

    this.logger.debug('Querying similar vectors', {
      indexName,
      namespace: ns,
      topK: options.topK,
    });

    const queryOptions: QueryOptions = {
      topK: options.topK || 10,
      filter: options.filter,
      includeValues: options.includeValues || false,
      includeMetadata: true,
    };

    const response = await this.pineconeService.queryVectors<T>(
      indexName,
      queryVector,
      queryOptions,
      ns,
    );

    // Filter results by minimum score if specified
    let matches = response.matches || [];
    if (options.minScore !== undefined) {
      matches = matches.filter(
        (match) =>
          match.score !== undefined && match.score >= (options.minScore || 0),
      );
    }

    // Transform to simplified format
    return matches.map((match) => ({
      id: match.id,
      score: match.score || 0,
      metadata: match.metadata as T,
      values: match.values,
    }));
  }

  /**
   * Delete vectors by ID
   * @param indexName Index name
   * @param ids Vector IDs to delete
   * @param namespace Optional namespace
   */
  async deleteVectors(
    indexName: string,
    ids: string[],
    namespace?: string,
  ): Promise<void> {
    const ns = namespace || this.defaultNamespace;

    this.logger.debug('Deleting vectors', {
      indexName,
      count: ids.length,
      namespace: ns,
    });

    await this.pineconeService.deleteVectors(indexName, ids, ns);
  }

  /**
   * Delete vectors by filter
   * @param indexName Index name
   * @param filter Filter to apply
   * @param namespace Optional namespace
   */
  async deleteVectorsByFilter(
    indexName: string,
    filter: Record<string, any>,
    namespace?: string,
  ): Promise<void> {
    const ns = namespace || this.defaultNamespace;

    this.logger.debug('Deleting vectors by filter', {
      indexName,
      filter,
      namespace: ns,
    });

    await this.pineconeService.deleteVectorsByFilter(indexName, filter, ns);
  }

  /**
   * Fetch specific vectors by ID
   * @param indexName Index name
   * @param ids Vector IDs to fetch
   * @param namespace Optional namespace
   */
  async fetchVectors<T extends RecordMetadata = RecordMetadata>(
    indexName: string,
    ids: string[],
    namespace?: string,
  ): Promise<
    Record<
      string,
      {
        id: string;
        values: number[];
        metadata: T;
      }
    >
  > {
    const ns = namespace || this.defaultNamespace;

    this.logger.debug('Fetching vectors', {
      indexName,
      count: ids.length,
      namespace: ns,
    });

    const response = await this.pineconeService.fetchVectors<T>(
      indexName,
      ids,
      ns,
    );

    // Transform to better typed records
    const result: Record<
      string,
      {
        id: string;
        values: number[];
        metadata: T;
      }
    > = {};

    if (response.records) {
      for (const [id, record] of Object.entries(response.records)) {
        result[id] = {
          id,
          values: record.values || [],
          metadata: record.metadata as T,
        };
      }
    }

    return result;
  }

  /**
   * Check if namespace exists
   * @param indexName Index name
   * @param namespace Namespace to check
   */
  async namespaceExists(
    indexName: string,
    namespace: string,
  ): Promise<boolean> {
    return this.pineconeService.namespaceExists(indexName, namespace);
  }

  // Add method to query vectors with enhanced logging
  async queryVectors(
    indexName: string,
    queryEmbedding: number[],
    topK: number = 5,
    namespace: string = '',
    filter: Record<string, any> = {},
    includeMetadata: boolean = true
  ): Promise<any> {
    const startTime = performance.now();

    try {
      this.logger.info('Pinecone query request', {
        indexName,
        namespace: namespace || 'default',
        topK,
        hasFilter: Object.keys(filter).length > 0,
        vectorDimension: queryEmbedding.length,
        includeMetadata
      });
      
      // Log detailed query parameters
      this.logger.debug('Pinecone query details', {
        filterParams: JSON.stringify(filter),
        embeddingPreview: queryEmbedding.slice(0, 5),
        embeddingNorm: this.calculateNorm(queryEmbedding)
      });

      // Use the pineconeService's queryVectors method instead of direct index access
      const queryOptions = {
        topK,
        filter,
        includeMetadata,
        includeValues: false
      };
      
      const queryResponse = await this.pineconeService.queryVectors(
        indexName,
        queryEmbedding,
        queryOptions,
        namespace
      );

      const endTime = performance.now();
      const latency = endTime - startTime;
      
      // Update stats
      this.stats.totalQueries += 1;
      this.stats.lastQueryResults = queryResponse.matches?.length || 0;
      this.stats.totalLatency += latency;
      this.stats.queryCount += 1;
      this.stats.averageQueryLatency = this.stats.totalLatency / this.stats.queryCount;

      // Log response details
      this.logger.info('Pinecone query response', {
        indexName,
        namespace: namespace || 'default',
        matchCount: queryResponse.matches?.length || 0,
        latency: `${latency.toFixed(2)}ms`,
        topScore: queryResponse.matches?.[0]?.score || 'N/A'
      });

      // Log some sample matches if available
      if (queryResponse.matches && queryResponse.matches.length > 0) {
        this.logger.debug('Pinecone query sample matches', {
          topMatches: queryResponse.matches.slice(0, 3).map((match: { id: string, score?: number, metadata?: any }) => ({
            id: match.id,
            score: match.score,
            metadata: match.metadata ? JSON.stringify(match.metadata).substring(0, 100) + '...' : 'none'
          }))
        });
      }

      return queryResponse;
    } catch (error) {
      const endTime = performance.now();
      const latency = endTime - startTime;

      this.logger.error('Pinecone query error', {
        indexName,
        namespace: namespace || 'default',
        latency: `${latency.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  // Add method for upsert with enhanced logging
  async upsertVectors(
    indexName: string,
    vectors: Array<{
      id: string;
      values: number[];
      metadata?: Record<string, any>;
    }>,
    namespace: string = ''
  ): Promise<any> {
    const startTime = performance.now();

    try {
      this.logger.info('Pinecone upsert request', {
        indexName,
        namespace: namespace || 'default',
        vectorCount: vectors.length,
        vectorDimension: vectors[0]?.values.length || 0
      });

      // Log detailed operation info
      this.logger.debug('Pinecone upsert details', {
        vectorIds: vectors.slice(0, 5).map(v => v.id),
        metadataSample: vectors[0]?.metadata ? 
          JSON.stringify(vectors[0].metadata).substring(0, 100) + '...' : 'none',
        vectorSizeBytes: this.estimateVectorSizeBytes(vectors)
      });

      // Use the pineconeService's upsertVectors method directly
      await this.pineconeService.upsertVectors(
        indexName,
        vectors,
        namespace
      );

      const endTime = performance.now();
      const latency = endTime - startTime;
      
      // Update stats
      this.stats.totalUpserts += vectors.length;
      this.stats.lastBatchSize = vectors.length;

      // Log response
      this.logger.info('Pinecone upsert complete', {
        indexName,
        namespace: namespace || 'default',
        vectorCount: vectors.length,
        latency: `${latency.toFixed(2)}ms`
      });

      return { upsertedCount: vectors.length };
    } catch (error) {
      const endTime = performance.now();
      const latency = endTime - startTime;

      this.logger.error('Pinecone upsert error', {
        indexName,
        namespace: namespace || 'default',
        vectorCount: vectors.length,
        latency: `${latency.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
        firstVector: vectors.length > 0 ? vectors[0].id : 'none'
      });

      throw error;
    }
  }

  // Add method to get usage statistics
  getStats(): PineconeStats {
    return { ...this.stats };
  }

  // Utility methods
  private calculateNorm(vector: number[]): number {
    return Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  }

  private estimateVectorSizeBytes(vectors: Array<{
    id: string;
    values: number[];
    metadata?: Record<string, any>;
  }>): number {
    // Rough estimation: 4 bytes per float + id (avg ~20 bytes) + metadata
    let totalSize = 0;
    for (const vector of vectors) {
      const valuesSize = vector.values.length * 4; // 4 bytes per float
      const idSize = vector.id.length * 2; // approximate string size
      const metadataSize = vector.metadata ? 
        JSON.stringify(vector.metadata).length * 2 : 0;
      
      totalSize += valuesSize + idSize + metadataSize;
    }
    return totalSize;
  }
}
