/**
 * Base Context Service
 * Core service for handling context storage and retrieval operations
 */

import {
  RecordMetadata,
  RecordMetadataValue,
} from '@pinecone-database/pinecone';
import { PineconeConnectionService } from '../../../pinecone/pinecone-connection.service';
import { VectorRecord } from '../../../pinecone/pinecone.type';
import { Logger } from '../../logger/logger.interface';
import { ConsoleLogger } from '../../logger/console-logger';
import {
  USER_CONTEXT_INDEX,
  UserContextError,
  UserContextNotFoundError,
  UserContextValidationError,
  BaseContextMetadata,
} from './types/context.types';

/**
 * Base service for managing user context data in vector databases
 * Handles core functionality for storing, retrieving and managing context data
 */
export class BaseContextService {
  protected pineconeService: PineconeConnectionService;
  protected logger: Logger;
  protected maxRetries = 3;
  protected retryDelay = 1000; // ms

  constructor(
    options: {
      pineconeService?: PineconeConnectionService;
      logger?: Logger;
    } = {},
  ) {
    this.pineconeService =
      options.pineconeService || new PineconeConnectionService();
    this.logger = options.logger || new ConsoleLogger();
  }

  /**
   * Initialize the service and ensure the index exists
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing BaseContextService');
    await this.pineconeService.initialize();

    // Check if the index exists, log but don't throw
    try {
      const exists = await this.indexExists();
      if (!exists) {
        this.logger.warn(
          `User context index "${USER_CONTEXT_INDEX}" doesn't exist - some operations may fail`,
        );
      }
    } catch (error) {
      this.logger.error('Error checking user context index', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Checks if the user context index exists
   */
  protected async indexExists(): Promise<boolean> {
    try {
      await this.pineconeService.getIndex(USER_CONTEXT_INDEX);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Execute an operation with retry logic
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    retries: number = this.maxRetries,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries <= 0) {
        this.logger.error(
          `Max retries reached for UserContextService operation: ${operationName}`,
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            operation: operationName,
          },
        );
        throw error;
      }

      // Exponential backoff
      const delay = this.retryDelay * Math.pow(2, this.maxRetries - retries);
      this.logger.warn(
        `Retrying UserContextService operation ${operationName}`,
        {
          retriesLeft: retries - 1,
          delayMs: delay,
          error: error instanceof Error ? error.message : String(error),
        },
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.executeWithRetry(operation, operationName, retries - 1);
    }
  }

  /**
   * Generate a unique ID for context entries
   */
  protected generateContextId(userId: string, prefix: string = ''): string {
    return `${prefix}${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Ensures that a value is a number array
   */
  protected ensureNumberArray(values?: any): number[] {
    if (!values) return [];
    return Array.isArray(values) ? values : [];
  }

  /**
   * Remove duplicate objects from an array based on a property value
   */
  protected removeDuplicatesByProperty<T>(array: T[], prop: string): T[] {
    const seen = new Set();
    return array.filter((item: any) => {
      const value = item[prop];
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  protected calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    return dotProduct / (mag1 * mag2);
  }

  /**
   * Prepares metadata for Pinecone by serializing complex objects
   */
  protected prepareMetadataForStorage(
    metadata: Partial<BaseContextMetadata>,
  ): RecordMetadata {
    const result: RecordMetadata = {};

    for (const [key, value] of Object.entries(metadata)) {
      // Serialize complex objects to strings
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        result[key] = JSON.stringify(value);
      } else {
        result[key] = value as RecordMetadataValue;
      }
    }

    return result;
  }

  /**
   * Store context data for a user
   * @param userId The user ID
   * @param contextData Text or data to be vectorized and stored
   * @param embeddings Vector embeddings of the context data
   * @param metadata Additional metadata for the context
   * @returns The ID of the stored context record
   */
  async storeUserContext(
    userId: string,
    contextData: string,
    embeddings: number[],
    metadata: Partial<BaseContextMetadata> = {},
  ): Promise<string> {
    if (!userId) {
      throw new UserContextValidationError('User ID is required');
    }

    if (!embeddings || embeddings.length === 0) {
      throw new UserContextValidationError('Embeddings array cannot be empty');
    }

    // Generate a unique ID for this context entry
    const contextId = this.generateContextId(userId);

    const record: VectorRecord<RecordMetadata> = {
      id: contextId,
      values: embeddings,
      metadata: this.prepareMetadataForStorage({
        userId,
        timestamp: Date.now(),
        ...metadata,
      }),
    };

    try {
      // Store the vector in the user's namespace
      await this.executeWithRetry(
        () =>
          this.pineconeService.upsertVectors<RecordMetadata>(
            USER_CONTEXT_INDEX,
            [record],
            userId, // Using userId as the namespace
          ),
        `storeUserContext:${userId}`,
      );

      this.logger.debug('Stored user context', {
        userId,
        contextId,
        contextType: metadata.contextType,
      });

      return contextId;
    } catch (error) {
      this.logger.error('Failed to store user context', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new UserContextError(
        'Failed to store user context: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  /**
   * Add multiple context entries in batch
   * @param userId The user ID
   * @param entries Array of context entries to add
   * @returns Array of created context IDs
   */
  async batchStoreUserContext(
    userId: string,
    entries: Array<{
      contextData: string;
      embeddings: number[];
      metadata?: Partial<BaseContextMetadata>;
    }>,
  ): Promise<string[]> {
    const records: VectorRecord<RecordMetadata>[] = entries.map((entry) => {
      const contextId = this.generateContextId(userId);

      return {
        id: contextId,
        values: entry.embeddings,
        metadata: this.prepareMetadataForStorage({
          userId,
          timestamp: Date.now(),
          ...entry.metadata,
        }),
      };
    });

    // Store all vectors in a single operation
    await this.pineconeService.upsertVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      records,
      userId,
    );

    return records.map((record) => record.id);
  }

  /**
   * Retrieve similar context for a user based on a query embedding
   * @param userId The user ID
   * @param queryEmbedding Vector embedding of the query
   * @param options Query options like topK, filters
   * @returns Array of matching context items
   */
  async retrieveUserContext(
    userId: string,
    queryEmbedding: number[],
    options: {
      topK?: number;
      filter?: Record<string, any>;
      includeEmbeddings?: boolean;
    } = {},
  ) {
    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      queryEmbedding,
      {
        topK: options.topK || 5,
        filter: options.filter,
        includeValues: options.includeEmbeddings || false,
        includeMetadata: true,
      },
      userId, // Using userId as the namespace
    );

    return result.matches || [];
  }

  /**
   * Clear all context for a user
   * @param userId The user ID
   */
  async clearUserContext(userId: string): Promise<void> {
    await this.pineconeService.deleteAllVectorsInNamespace(
      USER_CONTEXT_INDEX,
      userId,
    );
  }

  /**
   * Delete expired context for a user
   * @param userId The user ID
   * @returns Number of records deleted
   */
  async deleteExpiredContext(userId: string): Promise<number> {
    const now = Date.now();

    // Find expired records
    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      Array(3072).fill(0),
      {
        topK: 1000, // Fetch a large number to check for expiration
        filter: {
          expiresAt: { $lt: now },
        },
        includeValues: false,
        includeMetadata: true,
      },
      userId,
    );

    if (!result.matches || result.matches.length === 0) {
      return 0;
    }

    // Extract IDs of expired records
    const expiredIds = result.matches.map((match: any) => match.id);

    // Delete the expired records
    await this.pineconeService.deleteVectors(
      USER_CONTEXT_INDEX,
      expiredIds,
      userId,
    );

    return expiredIds.length;
  }

  /**
   * Get context statistics for a user
   * @param userId The user ID
   * @returns Statistics about the user's context
   */
  async getUserContextStats(userId: string): Promise<{
    totalContextEntries: number;
    categoryCounts: Record<string, number>;
    contextTypeCounts: Record<string, number>;
    documentCounts: Record<string, number>;
    conversationCounts: Record<string, number>;
    oldestEntry?: number;
    newestEntry?: number;
  }> {
    const stats =
      await this.pineconeService.describeIndexStats(USER_CONTEXT_INDEX);

    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      Array(3072).fill(0),
      {
        topK: 1000, // Fetch a large number to analyze
        includeValues: false,
        includeMetadata: true,
      },
      userId,
    );

    const matches = result.matches || [];
    const categoryCounts: Record<string, number> = {};
    const contextTypeCounts: Record<string, number> = {};
    const documentCounts: Record<string, number> = {};
    const conversationCounts: Record<string, number> = {};
    let oldestTimestamp: number | undefined;
    let newestTimestamp: number | undefined;

    // Analyze the entries
    matches.forEach((match: any) => {
      if (match.metadata) {
        // Count by category
        const category = match.metadata.category || 'uncategorized';
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;

        // Count by context type
        const contextType = match.metadata.contextType || 'unknown';
        contextTypeCounts[contextType] =
          (contextTypeCounts[contextType] || 0) + 1;

        // Count by document id
        if (match.metadata.documentId) {
          const docId = match.metadata.documentId;
          documentCounts[docId] = (documentCounts[docId] || 0) + 1;
        }

        // Count by conversation id
        if (match.metadata.conversationId) {
          const convId = match.metadata.conversationId;
          conversationCounts[convId] = (conversationCounts[convId] || 0) + 1;
        }

        // Track oldest and newest
        const timestamp = match.metadata.timestamp;
        if (timestamp) {
          if (!oldestTimestamp || timestamp < oldestTimestamp) {
            oldestTimestamp = timestamp;
          }
          if (!newestTimestamp || timestamp > newestTimestamp) {
            newestTimestamp = timestamp;
          }
        }
      }
    });

    return {
      totalContextEntries: matches.length,
      categoryCounts,
      contextTypeCounts,
      documentCounts,
      conversationCounts,
      oldestEntry: oldestTimestamp,
      newestEntry: newestTimestamp,
    };
  }

  /**
   * Record a view/access of a context item to update usage statistics
   * @param userId User identifier
   * @param contextId Context item identifier
   */
  async recordContextAccess(userId: string, contextId: string): Promise<void> {
    try {
      // Fetch the existing record
      const result = await this.pineconeService.fetchVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [contextId],
        userId,
      );

      const record = result.records[contextId];
      if (!record) {
        throw new UserContextNotFoundError(contextId, userId);
      }

      // Increment view count and update last accessed timestamp
      const viewCount = ((record.metadata?.viewCount as number) || 0) + 1;

      const updatedRecord: VectorRecord<RecordMetadata> = {
        id: contextId,
        values: this.ensureNumberArray(record.values),
        metadata: {
          ...record.metadata,
          viewCount,
          lastAccessedAt: Date.now(),
        },
      };

      await this.pineconeService.upsertVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [updatedRecord],
        userId,
      );

      this.logger.debug('Recorded context access', {
        userId,
        contextId,
        viewCount,
      });
    } catch (error) {
      // Log but don't throw for this non-critical operation
      this.logger.error('Failed to record context access', {
        userId,
        contextId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Provide explicit relevance feedback for a context item
   * @param userId User identifier
   * @param contextId Context item identifier
   * @param relevanceFeedback Relevance score from user feedback (0 to 1)
   */
  async provideRelevanceFeedback(
    userId: string,
    contextId: string,
    relevanceFeedback: number,
  ): Promise<void> {
    if (relevanceFeedback < 0 || relevanceFeedback > 1) {
      throw new UserContextValidationError(
        'Relevance feedback must be between 0 and 1',
      );
    }

    try {
      // Fetch the existing record
      const result = await this.pineconeService.fetchVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [contextId],
        userId,
      );

      const record = result.records[contextId];
      if (!record) {
        throw new UserContextNotFoundError(contextId, userId);
      }

      const updatedRecord: VectorRecord<RecordMetadata> = {
        id: contextId,
        values: this.ensureNumberArray(record.values),
        metadata: {
          ...record.metadata,
          explicitRelevanceFeedback: relevanceFeedback,
          lastUpdatedAt: Date.now(),
        },
      };

      await this.pineconeService.upsertVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [updatedRecord],
        userId,
      );

      this.logger.debug('Recorded relevance feedback', {
        userId,
        contextId,
        relevanceFeedback,
      });
    } catch (error) {
      this.logger.error('Failed to record relevance feedback', {
        userId,
        contextId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new UserContextError(
        'Failed to record relevance feedback: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }
}
