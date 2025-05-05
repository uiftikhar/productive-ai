/**
 * Pinecone Vector Database Connector
 *
 * This connector provides simplified access to the Pinecone vector database for storing
 * and retrieving vector embeddings. It follows the modern connector pattern rather than
 * the legacy adapter pattern.
 */

import { RecordMetadata } from '@pinecone-database/pinecone';
import { PineconeConnectionService } from '../../../../src/pinecone/pinecone-connection.service';
import { VectorIndexes } from '../../../../src/pinecone/pinecone-index.service';
import { VectorRecord, QueryOptions } from '../../../../src/pinecone/pinecone.type';
import { Logger } from '../../../../src/shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../src/shared/logger/console-logger';

/**
 * Connector for PineconeConnectionService that provides a simplified interface
 * for use within the agent framework
 */
export class PineconeConnector {
  private pineconeService: PineconeConnectionService;
  private logger: Logger;
  private defaultNamespace: string;

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
}
