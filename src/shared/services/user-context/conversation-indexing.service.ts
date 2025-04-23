/**
 * Conversation Indexing Service
 *
 * Provides optimized indexing and retrieval capabilities for conversations,
 * improving search performance and enabling more complex queries.
 */

import { Logger } from '../../logger/logger.interface';
import { ConversationContextService } from './conversation-context.service';
import { PineconeConnectionService } from '../../../pinecone/pinecone-connection.service';
import { ConsoleLogger } from '../../logger/console-logger';
import { v4 as uuidv4 } from 'uuid';
import { RetentionPolicy } from './conversation-context.service';
import { USER_CONTEXT_INDEX } from './types/context.types';

/**
 * Configuration for conversation indexing
 */
export interface IndexingConfig {
  enableMetadataIndexing?: boolean;
  enableContentIndexing?: boolean;
  enableHybridSearch?: boolean;
  chunkSize?: number;
  chunkOverlap?: number;
  maxIndexingBatchSize?: number;
  indexRefreshIntervalMs?: number;
  cacheExpirationMs?: number;
}

/**
 * Interface for index metadata
 */
export interface IndexMetadata {
  indexId: string;
  userId: string;
  conversations: string[];
  lastUpdated: number;
  documentCount: number;
  status: 'building' | 'ready' | 'error';
  error?: string;
}

/**
 * Search configuration options
 */
export interface SearchOptions {
  conversationIds?: string[];
  agentIds?: string[];
  segmentIds?: string[];
  timeRange?: {
    start?: number;
    end?: number;
  };
  limit?: number;
  minScore?: number;
  includeMetadata?: boolean;
  useHybridSearch?: boolean;
  searchMode?: 'semantic' | 'keyword' | 'hybrid';
  filterOptions?: Record<string, any>;
}

/**
 * Search result interface
 */
export interface SearchResult {
  id: string;
  score: number;
  content: string;
  metadata: {
    conversationId: string;
    turnId: string;
    timestamp: number;
    segmentId?: string;
    segmentTopic?: string;
    agentId?: string;
    role: 'user' | 'assistant' | 'system';
    [key: string]: any;
  };
}

/**
 * Interface for cached search results
 */
interface CachedSearchResult {
  query: string;
  options: SearchOptions;
  results: SearchResult[];
  timestamp: number;
}

/**
 * Service for optimized conversation indexing and retrieval
 */
export class ConversationIndexingService {
  private logger: Logger;
  private conversationService: ConversationContextService;
  private pineconeService: PineconeConnectionService;
  private config: Required<IndexingConfig>;
  private indexMetadata: Map<string, IndexMetadata> = new Map();
  private searchCache: Map<string, CachedSearchResult> = new Map();
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(
    options: {
      conversationService?: ConversationContextService;
      pineconeService?: PineconeConnectionService;
      logger?: Logger;
      config?: IndexingConfig;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();

    // Store or create the Pinecone service
    this.pineconeService =
      options.pineconeService ||
      new PineconeConnectionService({
        logger: this.logger,
      });

    // Store or create the conversation service
    this.conversationService =
      options.conversationService ||
      new ConversationContextService({
        pineconeService: this.pineconeService,
        logger: this.logger,
      });

    // Set default configuration with sensible defaults
    this.config = {
      enableMetadataIndexing: options.config?.enableMetadataIndexing ?? true,
      enableContentIndexing: options.config?.enableContentIndexing ?? true,
      enableHybridSearch: options.config?.enableHybridSearch ?? true,
      chunkSize: options.config?.chunkSize ?? 1000, // Characters per chunk
      chunkOverlap: options.config?.chunkOverlap ?? 200, // Overlap between chunks
      maxIndexingBatchSize: options.config?.maxIndexingBatchSize ?? 100,
      indexRefreshIntervalMs:
        options.config?.indexRefreshIntervalMs ?? 5 * 60 * 1000, // 5 minutes
      cacheExpirationMs: options.config?.cacheExpirationMs ?? 5 * 60 * 1000, // 5 minutes
    };

    // Start the index refresh timer
    this.startRefreshTimer();
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing ConversationIndexingService');
      // Any initialization logic would go here
    } catch (error) {
      this.logger.error('Failed to initialize ConversationIndexingService', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cleanup resources before shutdown
   */
  async shutdown(): Promise<void> {
    this.stopRefreshTimer();
    this.searchCache.clear();
  }

  /**
   * Create a new index for a user's conversations
   *
   * @param userId User identifier
   * @param options Options for indexing
   * @returns Metadata for the created index
   */
  async createIndex(
    userId: string,
    options: {
      conversationIds?: string[];
      timeRange?: {
        start?: number;
        end?: number;
      };
      indexName?: string;
    } = {},
  ): Promise<IndexMetadata> {
    const indexId = options.indexName || `conv-idx-${uuidv4()}`;

    try {
      // Create initial metadata
      const metadata: IndexMetadata = {
        indexId,
        userId,
        conversations: [],
        lastUpdated: Date.now(),
        documentCount: 0,
        status: 'building',
      };

      // Store metadata
      this.indexMetadata.set(indexId, metadata);

      // Start building index
      this.logger.info('Creating conversation index', { userId, indexId });

      // Get user conversations
      let conversations: any[];

      if (options.conversationIds && options.conversationIds.length > 0) {
        // Filter to specific conversations
        const userConversations =
          await this.conversationService.listUserConversations(userId);
        conversations = userConversations.filter((conv) =>
          options.conversationIds?.includes(conv.conversationId),
        );
      } else if (options.timeRange) {
        // Filter by time range
        const userConversations =
          await this.conversationService.listUserConversations(userId);
        const start = options.timeRange.start || 0;
        const end = options.timeRange.end || Date.now();

        conversations = userConversations.filter(
          (conv) => conv.lastTimestamp >= start && conv.firstTimestamp <= end,
        );
      } else {
        // Get all conversations
        conversations =
          await this.conversationService.listUserConversations(userId);
      }

      // Update metadata with conversation IDs
      metadata.conversations = conversations.map((conv) => conv.conversationId);
      this.indexMetadata.set(indexId, metadata);

      // Build the index (in a real implementation, this might be done asynchronously)
      await this.buildIndex(userId, indexId, conversations);

      // Return the metadata
      return this.indexMetadata.get(indexId) as IndexMetadata;
    } catch (error) {
      // Update metadata with error
      const metadata = this.indexMetadata.get(indexId);
      if (metadata) {
        metadata.status = 'error';
        metadata.error = error instanceof Error ? error.message : String(error);
        this.indexMetadata.set(indexId, metadata);
      }

      this.logger.error('Error creating conversation index', {
        userId,
        indexId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Build the actual index from conversation data
   * @private
   */
  private async buildIndex(
    userId: string,
    indexId: string,
    conversations: any[],
  ): Promise<void> {
    try {
      let totalDocuments = 0;

      // Process each conversation
      for (const conversation of conversations) {
        const conversationId = conversation.conversationId;

        // Get conversation history
        const history = await this.conversationService.getConversationHistory(
          userId,
          conversationId,
          1000, // Large limit to get all messages
          { includeMetadata: true },
        );

        // Our actual vectors are already stored in Pinecone via ConversationContextService
        // This method would create additional specialized indices if needed

        totalDocuments += history.length;
      }

      // Update metadata
      const metadata = this.indexMetadata.get(indexId);
      if (metadata) {
        metadata.documentCount = totalDocuments;
        metadata.status = 'ready';
        metadata.lastUpdated = Date.now();
        this.indexMetadata.set(indexId, metadata);
      }

      this.logger.info('Successfully built conversation index', {
        userId,
        indexId,
        conversations: conversations.length,
        documents: totalDocuments,
      });
    } catch (error) {
      this.logger.error('Error building conversation index', {
        userId,
        indexId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Update metadata with error
      const metadata = this.indexMetadata.get(indexId);
      if (metadata) {
        metadata.status = 'error';
        metadata.error = error instanceof Error ? error.message : String(error);
        this.indexMetadata.set(indexId, metadata);
      }

      throw error;
    }
  }

  /**
   * Search for conversations using the optimized index
   *
   * @param userId User identifier
   * @param query Search query
   * @param options Search options
   * @returns Array of search results
   */
  async search(
    userId: string,
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    // Check cache first
    const cacheKey = `${userId}-${query}-${JSON.stringify(options)}`;
    const cachedResult = this.searchCache.get(cacheKey);

    if (
      cachedResult &&
      Date.now() - cachedResult.timestamp < this.config.cacheExpirationMs
    ) {
      this.logger.debug('Returning cached search results', { userId, query });
      return cachedResult.results;
    }

    try {
      this.logger.info('Searching conversation index', { userId, query });

      // Get embeddings for the query (assuming this method exists)
      // In a real implementation, we would use an embedding model
      const queryEmbedding = Array(3072)
        .fill(0)
        .map(() => Math.random() - 0.5);

      // Build search filter
      const filter: Record<string, any> = {};

      if (options.conversationIds && options.conversationIds.length > 0) {
        filter.conversationId = { $in: options.conversationIds };
      }

      if (options.agentIds && options.agentIds.length > 0) {
        filter.agentId = { $in: options.agentIds };
      }

      if (options.segmentIds && options.segmentIds.length > 0) {
        filter.segmentId = { $in: options.segmentIds };
      }

      if (options.timeRange) {
        filter.timestamp = {};

        if (options.timeRange.start !== undefined) {
          filter.timestamp.$gte = options.timeRange.start;
        }

        if (options.timeRange.end !== undefined) {
          filter.timestamp.$lte = options.timeRange.end;
        }
      }

      // Add any additional filter options
      if (options.filterOptions) {
        Object.assign(filter, options.filterOptions);
      }

      // Set limit
      const limit = options.limit || 10;

      // Perform search using Pinecone
      const searchResults = await this.pineconeService.queryVectors(
        USER_CONTEXT_INDEX,
        queryEmbedding,
        {
          topK: limit,
          filter,
          includeValues: false,
          includeMetadata: options.includeMetadata !== false,
        },
        userId,
      );

      // Transform results
      const results: SearchResult[] = (searchResults.matches || [])
        .filter(
          (match) =>
            (typeof match.score === 'number' ? match.score : 0) >=
            (options.minScore || 0),
        )
        .map((match) => ({
          id: match.id,
          score: match.score || 0,
          content: (match.metadata?.message as string) || '',
          metadata: {
            conversationId: match.metadata?.conversationId as string,
            turnId: match.metadata?.turnId as string,
            timestamp: (match.metadata?.timestamp as number) || 0,
            segmentId: match.metadata?.segmentId as string,
            segmentTopic: match.metadata?.segmentTopic as string,
            agentId: match.metadata?.agentId as string,
            role: match.metadata?.role as 'user' | 'assistant' | 'system',
            ...match.metadata,
          },
        }));

      // Cache results
      this.searchCache.set(cacheKey, {
        query,
        options,
        results,
        timestamp: Date.now(),
      });

      return results;
    } catch (error) {
      this.logger.error('Error searching conversation index', {
        userId,
        query,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Get the status of an index
   *
   * @param indexId Index identifier
   * @returns Index metadata or null if not found
   */
  getIndexStatus(indexId: string): IndexMetadata | null {
    return this.indexMetadata.get(indexId) || null;
  }

  /**
   * List all indices for a user
   *
   * @param userId User identifier
   * @returns Array of index metadata
   */
  listIndices(userId: string): IndexMetadata[] {
    return Array.from(this.indexMetadata.values()).filter(
      (metadata) => metadata.userId === userId,
    );
  }

  /**
   * Update an existing index with new conversations
   *
   * @param indexId Index identifier
   * @param options Update options
   * @returns Updated index metadata
   */
  async updateIndex(
    indexId: string,
    options: {
      addConversations?: string[];
      removeConversations?: string[];
    } = {},
  ): Promise<IndexMetadata | null> {
    const metadata = this.indexMetadata.get(indexId);

    if (!metadata) {
      this.logger.warn('Index not found', { indexId });
      return null;
    }

    try {
      this.logger.info('Updating conversation index', { indexId });

      // Update conversation list
      let conversations = [...metadata.conversations];

      if (
        options.removeConversations &&
        options.removeConversations.length > 0
      ) {
        conversations = conversations.filter(
          (convId) => !options.removeConversations?.includes(convId),
        );
      }

      if (options.addConversations && options.addConversations.length > 0) {
        for (const convId of options.addConversations) {
          if (!conversations.includes(convId)) {
            conversations.push(convId);
          }
        }
      }

      // Update metadata
      metadata.conversations = conversations;
      metadata.status = 'building';
      metadata.lastUpdated = Date.now();
      this.indexMetadata.set(indexId, metadata);

      // Get conversations that were added
      const addedConversations = options.addConversations || [];

      if (addedConversations.length > 0) {
        // Get conversation data for added conversations
        const userConversations =
          await this.conversationService.listUserConversations(metadata.userId);
        const conversationsToAdd = userConversations.filter((conv) =>
          addedConversations.includes(conv.conversationId),
        );

        // Update the index with the new conversations
        await this.updateIndexWithConversations(
          metadata.userId,
          indexId,
          conversationsToAdd,
        );
      }

      // Update status
      metadata.status = 'ready';
      metadata.lastUpdated = Date.now();
      this.indexMetadata.set(indexId, metadata);

      return metadata;
    } catch (error) {
      // Update metadata with error
      metadata.status = 'error';
      metadata.error = error instanceof Error ? error.message : String(error);
      this.indexMetadata.set(indexId, metadata);

      this.logger.error('Error updating conversation index', {
        indexId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Update index with new conversations
   * @private
   */
  private async updateIndexWithConversations(
    userId: string,
    indexId: string,
    conversations: any[],
  ): Promise<void> {
    // In a real implementation, this would update the optimized index
    // For now, we'll just count the documents

    let addedDocuments = 0;

    for (const conversation of conversations) {
      const history = await this.conversationService.getConversationHistory(
        userId,
        conversation.conversationId,
        1000,
        { includeMetadata: true },
      );

      addedDocuments += history.length;
    }

    // Update document count in metadata
    const metadata = this.indexMetadata.get(indexId);
    if (metadata) {
      metadata.documentCount += addedDocuments;
      this.indexMetadata.set(indexId, metadata);
    }
  }

  /**
   * Delete an index
   *
   * @param indexId Index identifier
   * @returns True if the index was deleted, false otherwise
   */
  deleteIndex(indexId: string): boolean {
    const result = this.indexMetadata.delete(indexId);

    if (result) {
      this.logger.info('Deleted conversation index', { indexId });
    } else {
      this.logger.warn('Index not found for deletion', { indexId });
    }

    return result;
  }

  /**
   * Refresh the index to ensure it's up-to-date
   *
   * @param indexId Index identifier
   */
  async refreshIndex(indexId: string): Promise<void> {
    const metadata = this.indexMetadata.get(indexId);

    if (!metadata) {
      this.logger.warn('Index not found for refresh', { indexId });
      return;
    }

    try {
      this.logger.info('Refreshing conversation index', { indexId });

      // Get latest conversations
      const userId = metadata.userId;
      const userConversations =
        await this.conversationService.listUserConversations(userId);

      // Find conversations in the list that are not in the index
      const currentConversationIds = new Set(metadata.conversations);
      const newConversations = userConversations.filter(
        (conv) => !currentConversationIds.has(conv.conversationId),
      );

      if (newConversations.length > 0) {
        // Update the index with new conversations
        await this.updateIndexWithConversations(
          userId,
          indexId,
          newConversations,
        );

        // Update metadata
        metadata.conversations = [
          ...metadata.conversations,
          ...newConversations.map((conv) => conv.conversationId),
        ];
        metadata.lastUpdated = Date.now();
        this.indexMetadata.set(indexId, metadata);
      }
    } catch (error) {
      this.logger.error('Error refreshing conversation index', {
        indexId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start the index refresh timer
   * @private
   */
  private startRefreshTimer(): void {
    if (this.refreshTimer) {
      return;
    }

    this.refreshTimer = setInterval(() => {
      this.refreshAllIndices();
    }, this.config.indexRefreshIntervalMs).unref();
  }

  /**
   * Stop the index refresh timer
   * @private
   */
  private stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Refresh all indices
   * @private
   */
  private async refreshAllIndices(): Promise<void> {
    for (const metadata of this.indexMetadata.values()) {
      if (metadata.status === 'ready') {
        try {
          await this.refreshIndex(metadata.indexId);
        } catch (error) {
          this.logger.error('Error during automatic index refresh', {
            indexId: metadata.indexId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Clean up resources used by the service
   */
  public cleanup(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    this.logger.info('Conversation indexing service resources cleaned up');
  }
}
