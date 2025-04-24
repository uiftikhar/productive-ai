/**
 * User Context Facade
 * Provides a unified interface to all user context services
 */

import { PineconeConnectionService } from '../../../pinecone/pinecone-connection.service';
import { Logger } from '../../logger/logger.interface';
import { BaseContextService } from './base-context.service';
import { ConversationContextService } from './conversation-context.service';
import { DocumentContextService } from './document-context.service';
import { IntegrationService } from './integration.service';
import { MemoryManagementService } from './memory-management.service';
import { MetadataValidationService } from './metadata-validation.service';
import { BaseContextMetadata, ContextType } from './types/context.types';
import {
  EpisodicContext,
  SemanticStructure,
  ProceduralSteps,
} from './types/memory.types';
import { ConsoleLogger } from '../../logger/console-logger';

/**
 * Configuration options for UserContextFacade
 */
export interface UserContextFacadeOptions {
  pineconeService?: PineconeConnectionService;
  logger?: Logger;
  gracefulDegradation?: boolean;
  retryOptions?: {
    maxRetries: number;
    retryDelayMs: number;
  };
  fallbackEnabled?: boolean;
}

/**
 * Facade service that provides a unified interface to all user context services
 * This maintains backward compatibility while allowing for a more modular architecture
 */
export class UserContextFacade {
  private baseContextService: BaseContextService;
  private conversationContextService: ConversationContextService;
  private documentContextService: DocumentContextService;
  private memoryManagementService: MemoryManagementService;
  private metadataValidator: MetadataValidationService;
  private integrationService: IntegrationService;
  private initialized: boolean = false;
  private gracefulDegradation: boolean = false;
  private retryOptions = {
    maxRetries: 3,
    retryDelayMs: 1000,
  };
  private fallbackEnabled: boolean = false;
  private logger: Logger;

  constructor(options: UserContextFacadeOptions = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.gracefulDegradation = options.gracefulDegradation ?? true;
    this.fallbackEnabled = options.fallbackEnabled ?? true;

    if (options.retryOptions) {
      this.retryOptions = {
        ...this.retryOptions,
        ...options.retryOptions,
      };
    }

    this.baseContextService = new BaseContextService(options);
    this.conversationContextService = new ConversationContextService(options);
    this.documentContextService = new DocumentContextService(options);
    this.memoryManagementService = new MemoryManagementService(options);
    this.metadataValidator = new MetadataValidationService();
    this.integrationService = new IntegrationService(options);
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    try {
      await this.baseContextService.initialize();
      this.initialized = true;
      this.logger.info('UserContextFacade initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize UserContextFacade', {
        error: error instanceof Error ? error.message : String(error),
      });

      if (!this.gracefulDegradation) {
        throw error;
      }

      // If graceful degradation is enabled, we'll continue with limited functionality
      this.logger.warn(
        'Continuing with limited functionality due to initialization failure',
      );
    }
  }

  /**
   * Check if the facade is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Helper method to run operations with retries
   * @private
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    serviceName: string,
    methodName: string,
    fallbackValue?: T,
  ): Promise<T> {
    if (!this.initialized && !this.gracefulDegradation) {
      throw new Error(
        `UserContextFacade not initialized. Call initialize() first`,
      );
    }

    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.retryOptions.maxRetries) {
      try {
        return await operation();
      } catch (error) {
        attempts++;
        lastError = error instanceof Error ? error : new Error(String(error));

        this.logger.warn(
          `Operation failed (attempt ${attempts}/${this.retryOptions.maxRetries})`,
          {
            service: serviceName,
            method: methodName,
            error: lastError.message,
          },
        );

        if (attempts < this.retryOptions.maxRetries) {
          // Wait before retrying
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryOptions.retryDelayMs),
          );
        }
      }
    }

    // All attempts failed
    this.logger.error(`Operation failed after maximum retry attempts`, {
      service: serviceName,
      method: methodName,
      error: lastError?.message,
    });

    // If fallback is enabled and a fallback value was provided, return it
    if (this.fallbackEnabled && fallbackValue !== undefined) {
      this.logger.info(`Using fallback value for failed operation`, {
        service: serviceName,
        method: methodName,
      });
      return fallbackValue;
    }

    // Otherwise throw the error
    throw lastError || new Error(`Operation failed with unknown error`);
  }

  // #region Base Context Operations

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
    return this.withRetry(
      () =>
        this.baseContextService.storeUserContext(
          userId,
          contextData,
          embeddings,
          metadata,
        ),
      'baseContextService',
      'storeUserContext',
      // No fallback value for storing - we need the operation to succeed
    );
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
    return this.baseContextService.batchStoreUserContext(userId, entries);
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
    return this.withRetry(
      () =>
        this.baseContextService.retrieveUserContext(
          userId,
          queryEmbedding,
          options,
        ),
      'baseContextService',
      'retrieveUserContext',
      // Fallback to empty array if retrieval fails and fallback is enabled
      [],
    );
  }

  /**
   * Retrieve context specialized for RAG applications
   * @param userId User identifier
   * @param queryEmbedding Embedding of the query
   * @param options Advanced retrieval options
   * @returns Matches ordered by relevance
   */
  async retrieveRagContext(
    userId: string,
    queryEmbedding: number[],
    options: {
      topK?: number;
      minScore?: number;
      contextTypes?: ContextType[];
      conversationId?: string;
      documentIds?: string[];
      timeRangeStart?: number;
      timeRangeEnd?: number;
      includeEmbeddings?: boolean;
    } = {},
  ) {
    // We'll try a more complex strategy here - try the method as implemented first,
    // but if that fails, fall back to a simpler version of retrieveUserContext
    try {
      // Already using withRetry internally with complex filter construction
      const filter: Record<string, any> = {};

      // Filter by context types if specified
      if (options.contextTypes && options.contextTypes.length > 0) {
        filter.contextType = { $in: options.contextTypes };
      }

      // Filter by conversation if specified
      if (options.conversationId) {
        filter.conversationId = options.conversationId;
      }

      // Filter by documents if specified
      if (options.documentIds && options.documentIds.length > 0) {
        filter.documentId = { $in: options.documentIds };
      }

      // Filter by time range if specified
      if (options.timeRangeStart || options.timeRangeEnd) {
        filter.timestamp = {};
        if (options.timeRangeStart) {
          filter.timestamp.$gte = options.timeRangeStart;
        }
        if (options.timeRangeEnd) {
          filter.timestamp.$lte = options.timeRangeEnd;
        }
      }

      const result = await this.retrieveUserContext(userId, queryEmbedding, {
        topK: options.topK || 10,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        includeEmbeddings: options.includeEmbeddings || false,
      });

      // Filter by minimum score if specified
      if (options.minScore) {
        return result.filter(
          (match) => match.score && match.score >= (options.minScore || 0),
        );
      }

      return result;
    } catch (error) {
      this.logger.error('Error in retrieveRagContext, attempting fallback', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });

      // If fallback is enabled, try a simpler retrieval
      if (this.fallbackEnabled) {
        try {
          return await this.retrieveUserContext(userId, queryEmbedding, {
            topK: options.topK || 5,
          });
        } catch (fallbackError) {
          this.logger.error('Fallback retrieval also failed', {
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
          });
          // If we're here and graceful degradation is enabled, return empty array
          if (this.gracefulDegradation) {
            return [];
          }
          // Otherwise re-throw the original error
          throw error;
        }
      }

      // If fallback is not enabled, re-throw the error
      throw error;
    }
  }

  /**
   * Clear all context for a user
   * @param userId The user ID
   */
  async clearUserContext(userId: string): Promise<void> {
    return this.baseContextService.clearUserContext(userId);
  }

  /**
   * Delete expired context for a user
   * @param userId The user ID
   * @returns Number of records deleted
   */
  async deleteExpiredContext(userId: string): Promise<number> {
    return this.baseContextService.deleteExpiredContext(userId);
  }

  /**
   * Get context statistics for a user
   * @param userId The user ID
   * @returns Statistics about the user's context
   */
  async getUserContextStats(userId: string) {
    return this.baseContextService.getUserContextStats(userId);
  }

  /**
   * Record a view/access of a context item
   * @param userId User identifier
   * @param contextId Context item identifier
   */
  async recordContextAccess(userId: string, contextId: string): Promise<void> {
    return this.baseContextService.recordContextAccess(userId, contextId);
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
    return this.baseContextService.provideRelevanceFeedback(
      userId,
      contextId,
      relevanceFeedback,
    );
  }

  // #endregion

  // #region Conversation Context Operations

  /**
   * Store a conversation turn (message) in the context database
   * @param userId User identifier
   * @param conversationId Unique conversation identifier
   * @param message The message text content
   * @param embeddings Vector embeddings for the message
   * @param role Who said the message (user, assistant, system)
   * @param turnId Optional turn/message ID
   * @param additionalMetadata Any additional metadata to store
   * @returns The ID of the stored turn
   */
  async storeConversationTurn(
    userId: string,
    conversationId: string,
    message: string,
    embeddings: number[],
    role: 'user' | 'assistant' | 'system',
    turnId?: string,
    additionalMetadata: Partial<BaseContextMetadata> = {},
  ): Promise<string> {
    return this.conversationContextService.storeConversationTurn(
      userId,
      conversationId,
      message,
      embeddings,
      role,
      turnId,
      additionalMetadata as any,
    );
  }

  /**
   * Store a conversation turn with agent-specific information
   * @param userId User identifier
   * @param conversationId Unique conversation identifier
   * @param message The message text content
   * @param embeddings Vector embeddings for the message
   * @param role Who said the message (user, assistant, system)
   * @param options Enhanced storage options including agent data and retention policy
   * @returns The ID of the stored turn
   */
  async storeAgentConversationTurn(
    userId: string,
    conversationId: string,
    message: string,
    embeddings: number[],
    role: 'user' | 'assistant' | 'system',
    options: {
      agentId?: string;
      agentName?: string;
      capability?: string;
      retentionPolicy?: string;
      segmentId?: string;
      segmentTopic?: string;
      isSegmentStart?: boolean;
      [key: string]: any;
    } = {},
  ): Promise<string> {
    const turnId = options.turnId || `turn-${Date.now()}`;
    return this.conversationContextService.storeConversationTurn(
      userId,
      conversationId,
      message,
      embeddings,
      role,
      turnId,
      options as any,
    );
  }

  /**
   * Retrieve conversation history for a specific conversation with enhanced filtering
   * @param userId User identifier
   * @param conversationId Conversation identifier
   * @param limit Maximum number of turns to retrieve
   * @param options Additional options for filtering
   * @returns Conversation turns ordered chronologically
   */
  async getConversationHistory(
    userId: string,
    conversationId: string,
    limit: number = 20,
    options: {
      beforeTimestamp?: number;
      afterTimestamp?: number;
      segmentId?: string;
      agentId?: string;
      role?: 'user' | 'assistant' | 'system';
      includeMetadata?: boolean;
    } = {},
  ): Promise<any[]> {
    return this.withRetry(
      () =>
        this.conversationContextService.getConversationHistory(
          userId,
          conversationId,
          limit,
          options,
        ),
      'conversationContextService',
      'getConversationHistory',
      // Fallback to empty array if retrieval fails and fallback is enabled
      [],
    );
  }

  /**
   * Get conversation segments
   * @param userId User identifier
   * @param conversationId Conversation identifier
   * @returns Array of segments in the conversation
   */
  async getConversationSegments(
    userId: string,
    conversationId: string,
  ): Promise<any[]> {
    return this.conversationContextService.getConversationSegments(
      userId,
      conversationId,
    );
  }

  /**
   * Get conversations by agent
   * @param userId User identifier
   * @param agentId Agent identifier
   * @param limit Maximum number of conversations to retrieve
   * @returns Array of conversations handled by the agent
   */
  async getConversationsByAgent(
    userId: string,
    agentId: string,
    limit: number = 10,
  ): Promise<any[]> {
    return this.conversationContextService.getConversationsByAgent(
      userId,
      agentId,
      limit,
    );
  }

  /**
   * Update the retention policy for a conversation or specific turns
   * @param userId User identifier
   * @param conversationId Conversation identifier
   * @param policy Retention policy to apply
   * @param options Additional options for filtering which turns to update
   * @returns Number of turns updated
   */
  async updateRetentionPolicy(
    userId: string,
    conversationId: string,
    policy: string,
    options: {
      turnIds?: string[];
      segmentId?: string;
      retentionPriority?: number;
      retentionTags?: string[];
      isHighValue?: boolean;
    } = {},
  ): Promise<number> {
    return this.conversationContextService.updateRetentionPolicy(
      userId,
      conversationId,
      policy as any,
      options,
    );
  }

  /**
   * Delete a specific conversation and all its turns
   * @param userId User identifier
   * @param conversationId Conversation identifier
   * @returns Number of turns deleted
   */
  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<number> {
    return this.conversationContextService.deleteConversation(
      userId,
      conversationId,
    );
  }

  /**
   * List all conversations for a user
   * @param userId User identifier
   * @returns List of conversation summaries
   */
  async listUserConversations(userId: string) {
    return this.conversationContextService.listUserConversations(userId);
  }

  /**
   * Search conversations by semantic similarity
   * @param userId User identifier
   * @param queryEmbedding Query embedding vector
   * @param options Search options
   * @returns Matching conversation turns
   */
  async searchConversations(
    userId: string,
    queryEmbedding: number[],
    options: {
      conversationIds?: string[];
      role?: 'user' | 'assistant' | 'system';
      minRelevanceScore?: number;
      maxResults?: number;
      timeRangeStart?: number;
      timeRangeEnd?: number;
    } = {},
  ) {
    return this.conversationContextService.searchConversations(
      userId,
      queryEmbedding,
      options,
    );
  }

  // #endregion

  // #region Document Context Operations

  /**
   * Store a document or document chunk in the context database
   * @param userId User identifier
   * @param documentId Unique document identifier
   * @param documentTitle Title of the document
   * @param content The document content
   * @param embeddings Vector embeddings for the content
   * @param chunkIndex Index of this chunk within the document
   * @param totalChunks Total number of chunks in the document
   * @param metadata Additional metadata about the document
   * @returns The ID of the stored document chunk
   */
  async storeDocumentChunk(
    userId: string,
    documentId: string,
    documentTitle: string,
    content: string,
    embeddings: number[],
    chunkIndex: number = 0,
    totalChunks: number = 1,
    metadata: Partial<BaseContextMetadata> = {},
  ): Promise<string> {
    return this.documentContextService.storeDocumentChunk(
      userId,
      documentId,
      documentTitle,
      content,
      embeddings,
      chunkIndex,
      totalChunks,
      metadata,
    );
  }

  /**
   * Retrieve all chunks of a specific document
   * @param userId User identifier
   * @param documentId Document identifier
   * @returns Document chunks ordered by chunkIndex
   */
  async getDocumentChunks(userId: string, documentId: string) {
    return this.documentContextService.getDocumentChunks(userId, documentId);
  }

  /**
   * Delete a specific document and all its chunks
   * @param userId User identifier
   * @param documentId Document identifier
   * @returns Number of chunks deleted
   */
  async deleteDocument(userId: string, documentId: string): Promise<number> {
    return this.documentContextService.deleteDocument(userId, documentId);
  }

  /**
   * Search document content by semantic similarity
   * @param userId User identifier
   * @param queryEmbedding Query embedding vector
   * @param options Search options
   * @returns Matching document chunks
   */
  async searchDocumentContent(
    userId: string,
    queryEmbedding: number[],
    options: {
      documentIds?: string[];
      minRelevanceScore?: number;
      maxResults?: number;
      includeContent?: boolean;
    } = {},
  ) {
    return this.documentContextService.searchDocumentContent(
      userId,
      queryEmbedding,
      options,
    );
  }

  /**
   * Get a list of all documents for a user
   * @param userId User identifier
   * @returns List of document metadata
   */
  async listUserDocuments(userId: string) {
    return this.documentContextService.listUserDocuments(userId);
  }

  // #endregion

  // #region Memory Management Operations

  /**
   * Add episodic memory context to an existing context item
   * @param userId User identifier
   * @param contextId Context item identifier
   * @param episodicContext Episodic memory context information
   */
  async addEpisodicMemoryContext(
    userId: string,
    contextId: string,
    episodicContext: EpisodicContext,
  ): Promise<void> {
    return this.memoryManagementService.addEpisodicMemoryContext(
      userId,
      contextId,
      episodicContext,
    );
  }

  /**
   * Add semantic memory structure to an existing context item
   * @param userId User identifier
   * @param contextId Context item identifier
   * @param semanticStructure Semantic memory structure information
   */
  async addSemanticMemoryStructure(
    userId: string,
    contextId: string,
    semanticStructure: SemanticStructure,
  ): Promise<void> {
    return this.memoryManagementService.addSemanticMemoryStructure(
      userId,
      contextId,
      semanticStructure,
    );
  }

  /**
   * Add procedural memory steps to an existing context item
   * @param userId User identifier
   * @param contextId Context item identifier
   * @param proceduralSteps Procedural memory steps information
   */
  async addProceduralMemorySteps(
    userId: string,
    contextId: string,
    proceduralSteps: ProceduralSteps,
  ): Promise<void> {
    return this.memoryManagementService.addProceduralMemorySteps(
      userId,
      contextId,
      proceduralSteps,
    );
  }

  /**
   * Reinforces a memory to increase its strength
   * @param userId User ID
   * @param contextId Context item ID
   * @param reinforcementStrength Strength of reinforcement (0-1)
   */
  async reinforceMemory(
    userId: string,
    contextId: string,
    reinforcementStrength: number = 0.1,
  ): Promise<void> {
    return this.memoryManagementService.reinforceMemory(
      userId,
      contextId,
      reinforcementStrength,
    );
  }

  /**
   * Connect two memories together
   * @param userId User identifier
   * @param sourceContextId Source context item identifier
   * @param targetContextId Target context item identifier
   * @param connectionStrength Strength of the connection (0-1)
   */
  async connectMemories(
    userId: string,
    sourceContextId: string,
    targetContextId: string,
    connectionStrength: number = 0.5,
  ): Promise<void> {
    return this.memoryManagementService.connectMemories(
      userId,
      sourceContextId,
      targetContextId,
      connectionStrength,
    );
  }

  /**
   * Find related memories based on memory connections
   * @param userId User identifier
   * @param contextId Starting context item identifier
   * @param depth Depth of traversal (1-3)
   * @param minStrength Minimum connection strength to include
   * @returns Connected memories with their relationships
   */
  async findConnectedMemories(
    userId: string,
    contextId: string,
    depth: number = 1,
    minStrength: number = 0.3,
  ) {
    return this.memoryManagementService.findConnectedMemories(
      userId,
      contextId,
      depth,
      minStrength,
    );
  }

  // #endregion

  // #region Integration Operations

  /**
   * Integrate an action item with an external system
   * @param userId User identifier
   * @param actionItemId Action item identifier
   * @param externalSystem The external system to integrate with (e.g., 'jira', 'trello')
   * @param externalSystemId Optional existing ID in the external system
   * @param externalSystemData Additional data for the external system
   * @returns The external system ID
   */
  async integrateActionItemWithExternalSystem(
    userId: string,
    actionItemId: string,
    externalSystem: string,
    externalSystemId?: string,
    externalSystemData: Record<string, any> = {},
  ): Promise<string> {
    return this.integrationService.integrateActionItemWithExternalSystem(
      userId,
      actionItemId,
      externalSystem,
      externalSystemId,
      externalSystemData,
    );
  }

  /**
   * Synchronize external system statuses with local action items
   * @param userId User identifier
   * @param externalSystem The external system to synchronize with
   * @returns Number of items synchronized
   */
  async syncExternalSystemStatuses(
    userId: string,
    externalSystem: string,
  ): Promise<number> {
    return this.integrationService.syncExternalSystemStatuses(
      userId,
      externalSystem,
    );
  }

  /**
   * Get all action items integrated with an external system
   * @param userId User identifier
   * @param externalSystem The external system to query
   * @returns List of integrated action items
   */
  async getExternalSystemItems(
    userId: string,
    externalSystem: string,
  ): Promise<any[]> {
    return this.integrationService.getExternalSystemItems(
      userId,
      externalSystem,
    );
  }

  /**
   * Remove integration with an external system for an action item
   * @param userId User identifier
   * @param actionItemId Action item identifier
   * @param externalSystem The external system to disconnect from
   * @returns True if successfully disconnected
   */
  async removeExternalIntegration(
    userId: string,
    actionItemId: string,
    externalSystem: string,
  ): Promise<boolean> {
    return this.integrationService.removeExternalIntegration(
      userId,
      actionItemId,
      externalSystem,
    );
  }

  // #endregion

  /**
   * Gracefully shut down all services
   */
  async shutdown(): Promise<void> {
    try {
      // Add shutdown logic for services if they support it
      this.logger.info('Shutting down UserContextFacade');
      this.initialized = false;
    } catch (error) {
      this.logger.error('Error during UserContextFacade shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check the health of all underlying services
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    services: Record<string, { healthy: boolean; message?: string }>;
  }> {
    const result = {
      healthy: true,
      services: {} as Record<string, { healthy: boolean; message?: string }>,
    };

    // Check each service
    try {
      // For example, check if we can retrieve basic stats
      await this.baseContextService.getUserContextStats('health-check');
      result.services.baseContextService = { healthy: true };
    } catch (error) {
      result.healthy = false;
      result.services.baseContextService = {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }

    // Could add more service health checks here

    return result;
  }
}
