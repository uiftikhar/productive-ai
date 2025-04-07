import { RecordMetadata } from '@pinecone-database/pinecone';
import {
  PineconeConnectionService,
} from '../../pinecone/pinecone-connection.service.ts';
import { VectorRecord } from '../../pinecone/pinecone.type.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';

/**
 * Custom error types for UserContextService
 */
export class UserContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserContextError';
  }
}

export class UserContextNotFoundError extends UserContextError {
  constructor(contextId: string, userId: string) {
    super(`Context record ${contextId} not found for user ${userId}`);
    this.name = 'UserContextNotFoundError';
  }
}

export class UserContextValidationError extends UserContextError {
  constructor(message: string) {
    super(message);
    this.name = 'UserContextValidationError';
  }
}

/**
 * The index name for user context data in Pinecone
 */
export const USER_CONTEXT_INDEX = 'user-context';

/**
 * Different types of context data that can be stored
 */
export enum ContextType {
  CONVERSATION = 'conversation',
  DOCUMENT = 'document',
  PREFERENCE = 'preference',
  TASK = 'task',
  CUSTOM = 'custom',
  MEETING = 'meeting',        // New: Meeting transcripts/content
  DECISION = 'decision',      // New: Decisions made in meetings
  ACTION_ITEM = 'action_item', // New: Action items assigned in meetings
  TOPIC = 'topic',            // New: Topics discussed across meetings
  AGENDA_ITEM = 'agenda_item', // New: Meeting agenda items
  QUESTION = 'question',      // New: Questions asked in meetings
}

/**
 * Status for action items
 */
export enum ActionItemStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/**
 * Knowledge gap types
 */
export enum KnowledgeGapType {
  MISALIGNMENT = 'misalignment',
  MISSING_INFORMATION = 'missing-information',
  UNANSWERED_QUESTION = 'unanswered-question',
}

/**
 * Structure of user context metadata
 */
export interface UserContextMetadata {
  userId: string;
  timestamp: number;
  source?: string;
  category?: string;
  relevanceScore?: number;
  expiresAt?: number;
  contextType?: ContextType;

  // Document fields
  documentId?: string;
  documentTitle?: string;
  chunkIndex?: number;
  totalChunks?: number;

  // Conversation fields
  conversationId?: string;
  turnId?: string;
  role?: 'user' | 'assistant' | 'system';

  // Meeting fields
  meetingId?: string;
  meetingTitle?: string;
  meetingStartTime?: number;
  meetingEndTime?: number;
  participantIds?: string[];

  // Topic fields
  topicId?: string;
  topicName?: string;
  relatedMeetingIds?: string[];

  // Agenda item fields
  agendaItemId?: string;
  agendaItemTitle?: string;

  // Decision fields
  isDecision?: boolean;
  decisionId?: string;
  decisionSummary?: string;

  // Action item fields
  isActionItem?: boolean;
  actionItemId?: string;
  assigneeId?: string;
  dueDate?: number;
  status?: ActionItemStatus;
  externalSystemId?: string;
  externalSystem?: string;

  // Question fields
  isQuestion?: boolean;
  questionId?: string;
  isAnswered?: boolean;
  answerContextId?: string;

  // Usage statistics
  viewCount?: number;
  lastAccessedAt?: number;
  explicitRelevanceFeedback?: number;

  // Relevance and recency
  recency?: number; // Higher values indicate more recent/relevant content

  // Add any other metadata properties here
  [key: string]: string | number | boolean | string[] | undefined;
}

/**
 * Service for managing user context data in Pinecone
 * This allows storing, retrieving, and maintaining user-specific contextual data
 * for RAG (Retrieval Augmented Generation) applications
 */
export class UserContextService {
  private pineconeService: PineconeConnectionService;
  private logger: Logger;
  private maxRetries = 3;
  private retryDelay = 1000; // ms

  constructor(options: {
    pineconeService?: PineconeConnectionService;
    logger?: Logger;
  } = {}) {
    this.pineconeService = options.pineconeService || new PineconeConnectionService();
    this.logger = options.logger || new ConsoleLogger();
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing UserContextService');
    await this.pineconeService.initialize();

    // Check if the index exists, log but don't throw
    try {
      const exists = await this.indexExists();
      if (!exists) {
        this.logger.warn(`User context index "${USER_CONTEXT_INDEX}" doesn't exist - some operations may fail`);
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
  private async indexExists(): Promise<boolean> {
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
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    retries: number = this.maxRetries,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries <= 0) {
        this.logger.error(`Max retries reached for UserContextService operation: ${operationName}`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          operation: operationName,
        });
        throw error;
      }

      // Exponential backoff
      const delay = this.retryDelay * Math.pow(2, this.maxRetries - retries);
      this.logger.warn(`Retrying UserContextService operation ${operationName}`, {
        retriesLeft: retries - 1,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.executeWithRetry(operation, operationName, retries - 1);
    }
  }

  /**
   * Validate that required fields are present in metadata
   */
  private validateMetadata(metadata: Partial<UserContextMetadata>, requiredFields: string[]): void {
    for (const field of requiredFields) {
      if (metadata[field] === undefined) {
        throw new UserContextValidationError(`Required metadata field "${field}" is missing`);
      }
    }
  }

  /**
   * Generate a unique ID for context entries
   */
  private generateContextId(userId: string, prefix: string = ''): string {
    return `${prefix}${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
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
    metadata: Partial<UserContextMetadata> = {},
  ): Promise<string> {
    if (!userId) {
      throw new UserContextValidationError('User ID is required');
    }

    if (!embeddings || embeddings.length === 0) {
      throw new UserContextValidationError('Embeddings array cannot be empty');
    }

    // Generate a unique ID for this context entry
    const contextId = this.generateContextId(userId);

    // Create the record with complete metadata
    const record: VectorRecord<RecordMetadata> = {
      id: contextId,
      values: embeddings,
      metadata: {
        userId,
        timestamp: Date.now(),
        ...metadata,
      },
    };

    try {
      // Store the vector in the user's namespace
      await this.executeWithRetry(
        () => this.pineconeService.upsertVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [record],
          userId, // Using userId as the namespace
        ),
        `storeUserContext:${userId}`
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
      throw new UserContextError('Failed to store user context: ' +
        (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Store a conversation turn (message) in the context database
   * @param userId User identifier
   * @param conversationId Unique conversation identifier
   * @param turnId Optional turn/message ID
   * @param message The message text content
   * @param embeddings Vector embeddings for the message
   * @param role Who said the message (user, assistant, system)
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
    additionalMetadata: Partial<UserContextMetadata> = {},
  ): Promise<string> {
    if (!conversationId) {
      throw new UserContextValidationError('Conversation ID is required');
    }

    // Calculate recency - newer messages should have higher recency scores
    const recency = Date.now();

    return this.storeUserContext(userId, message, embeddings, {
      contextType: ContextType.CONVERSATION,
      conversationId,
      turnId: turnId || `turn-${Date.now()}`,
      role,
      recency,
      ...additionalMetadata,
    });
  }

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
    metadata: Partial<UserContextMetadata> = {},
  ): Promise<string> {
    if (!documentId) {
      throw new UserContextValidationError('Document ID is required');
    }

    return this.storeUserContext(userId, content, embeddings, {
      contextType: ContextType.DOCUMENT,
      documentId,
      documentTitle,
      chunkIndex,
      totalChunks,
      timestamp: Date.now(),
      ...metadata,
    });
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
    // Build filter based on options
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

    // Retrieve matches
    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      queryEmbedding,
      {
        topK: options.topK || 10,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        includeValues: options.includeEmbeddings || false,
        includeMetadata: true,
      },
      userId,
    );

    // Filter by minimum score if specified
    let matches = result.matches || [];
    if (options.minScore) {
      matches = matches.filter(
        (match) => match.score && match.score >= (options.minScore || 0),
      );
    }

    return matches;
  }

  /**
   * Retrieve conversation history for a specific conversation
   * @param userId User identifier
   * @param conversationId Conversation identifier
   * @param limit Maximum number of turns to retrieve
   * @param beforeTimestamp Only retrieve turns before this timestamp
   * @returns Conversation turns ordered chronologically
   */
  async getConversationHistory(
    userId: string,
    conversationId: string,
    limit: number = 20,
    beforeTimestamp?: number,
  ) {
    const filter: Record<string, any> = {
      contextType: ContextType.CONVERSATION,
      conversationId,
    };

    if (beforeTimestamp) {
      filter.timestamp = { $lt: beforeTimestamp };
    }

    // Use an empty vector for a metadata-only search
    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [], // Empty vector for metadata-only query
      {
        topK: limit,
        filter,
        includeValues: false,
        includeMetadata: true,
      },
      userId,
    );

    const turns = result.matches || [];

    // Sort turns by timestamp
    return turns.sort((a, b) => {
      const timestampA = (a.metadata?.timestamp as number) || 0;
      const timestampB = (b.metadata?.timestamp as number) || 0;
      return timestampA - timestampB;
    });
  }

  /**
   * Retrieve all chunks of a specific document
   * @param userId User identifier
   * @param documentId Document identifier
   * @returns Document chunks ordered by chunkIndex
   */
  async getDocumentChunks(userId: string, documentId: string) {
    const filter = {
      contextType: ContextType.DOCUMENT,
      documentId,
    };

    // Use an empty vector for a metadata-only search
    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [], // Empty vector for metadata-only query
      {
        topK: 1000, // Assuming no document has more than 1000 chunks
        filter,
        includeValues: false,
        includeMetadata: true,
      },
      userId,
    );

    const chunks = result.matches || [];

    // Sort chunks by index
    return chunks.sort((a, b) => {
      const indexA = (a.metadata?.chunkIndex as number) || 0;
      const indexB = (b.metadata?.chunkIndex as number) || 0;
      return indexA - indexB;
    });
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
      [], // Empty vector for metadata-only query
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
   * Delete a specific conversation and all its turns
   * @param userId User identifier
   * @param conversationId Conversation identifier
   * @returns Number of turns deleted
   */
  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<number> {
    // Find all turns in this conversation
    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [], // Empty vector for metadata-only query
      {
        topK: 1000,
        filter: {
          contextType: ContextType.CONVERSATION,
          conversationId,
        },
        includeValues: false,
        includeMetadata: false,
      },
      userId,
    );

    if (!result.matches || result.matches.length === 0) {
      return 0;
    }

    // Extract IDs of turns
    const turnIds = result.matches.map((match: any) => match.id);

    // Delete the turns
    await this.pineconeService.deleteVectors(
      USER_CONTEXT_INDEX,
      turnIds,
      userId,
    );

    return turnIds.length;
  }

  /**
   * Delete a specific document and all its chunks
   * @param userId User identifier
   * @param documentId Document identifier
   * @returns Number of chunks deleted
   */
  async deleteDocument(userId: string, documentId: string): Promise<number> {
    // Find all chunks in this document
    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [], // Empty vector for metadata-only query
      {
        topK: 1000,
        filter: {
          contextType: ContextType.DOCUMENT,
          documentId,
        },
        includeValues: false,
        includeMetadata: false,
      },
      userId,
    );

    if (!result.matches || result.matches.length === 0) {
      return 0;
    }

    // Extract IDs of chunks
    const chunkIds = result.matches.map((match: any) => match.id);

    // Delete the chunks
    await this.pineconeService.deleteVectors(
      USER_CONTEXT_INDEX,
      chunkIds,
      userId,
    );

    return chunkIds.length;
  }

  /**
   * Update relevance scores for user context
   * @param userId The user ID
   * @param contextId The context entry ID
   * @param relevanceScore New relevance score
   */
  async updateContextRelevance(
    userId: string,
    contextId: string,
    relevanceScore: number,
  ): Promise<void> {
    // Fetch the existing record to preserve other metadata
    const result = await this.pineconeService.fetchVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [contextId],
      userId,
    );

    const record = result.records[contextId];
    if (!record) {
      throw new Error(
        `Context record ${contextId} not found for user ${userId}`,
      );
    }

    // Create an updated record with the new relevance score
    const updatedRecord: VectorRecord<RecordMetadata> = {
      id: contextId,
      values: record.values || [],
      metadata: {
        ...record.metadata,
        relevanceScore,
      },
    };

    // Update the record
    await this.pineconeService.upsertVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [updatedRecord],
      userId,
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
      metadata?: Partial<UserContextMetadata>;
    }>,
  ): Promise<string[]> {
    // Create records for all entries
    const records: VectorRecord<RecordMetadata>[] = entries.map((entry) => {
      const contextId = `${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      return {
        id: contextId,
        values: entry.embeddings,
        metadata: {
          userId,
          timestamp: Date.now(),
          ...entry.metadata,
        },
      };
    });

    // Store all vectors in a single operation
    await this.pineconeService.upsertVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      records,
      userId,
    );

    // Return all created IDs
    return records.map((record) => record.id);
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
    // Get the index stats
    const stats =
      await this.pineconeService.describeIndexStats(USER_CONTEXT_INDEX);

    // Get all entries for this namespace to analyze
    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [], // Empty vector for metadata-only query
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
 * Store meeting content in the context database
 * @param userId User identifier
 * @param meetingId Unique meeting identifier
 * @param meetingTitle Title of the meeting
 * @param content Meeting content or transcript
 * @param embeddings Vector embeddings for the content
 * @param participantIds IDs of meeting participants
 * @param meetingStartTime Start time of the meeting
 * @param meetingEndTime End time of the meeting
 * @param metadata Additional metadata
 * @returns The ID of the stored meeting content
 */
  async storeMeetingContent(
    userId: string,
    meetingId: string,
    meetingTitle: string,
    content: string,
    embeddings: number[],
    participantIds: string[] = [],
    meetingStartTime?: number,
    meetingEndTime?: number,
    metadata: Partial<UserContextMetadata> = {},
  ): Promise<string> {
    if (!meetingId) {
      throw new UserContextValidationError('Meeting ID is required');
    }

    const now = Date.now();

    return this.storeUserContext(userId, content, embeddings, {
      contextType: ContextType.MEETING,
      meetingId,
      meetingTitle,
      participantIds,
      meetingStartTime: meetingStartTime || now,
      meetingEndTime: meetingEndTime,
      timestamp: now,
      ...metadata,
    });
  }

  /**
   * Store a meeting agenda item
   * @param userId User identifier
   * @param meetingId Meeting identifier
   * @param agendaItemId Unique agenda item identifier
   * @param agendaItemTitle Title of the agenda item
   * @param content Content or description of the agenda item
   * @param embeddings Vector embeddings for the content
   * @param metadata Additional metadata
   * @returns The ID of the stored agenda item
   */
  async storeAgendaItem(
    userId: string,
    meetingId: string,
    agendaItemId: string,
    agendaItemTitle: string,
    content: string,
    embeddings: number[],
    metadata: Partial<UserContextMetadata> = {},
  ): Promise<string> {
    if (!meetingId || !agendaItemId) {
      throw new UserContextValidationError('Meeting ID and Agenda Item ID are required');
    }

    return this.storeUserContext(userId, content, embeddings, {
      contextType: ContextType.AGENDA_ITEM,
      meetingId,
      agendaItemId,
      agendaItemTitle,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Store a decision made in a meeting
   * @param userId User identifier
   * @param meetingId Meeting identifier
   * @param decisionId Unique decision identifier
   * @param decision Decision text content
   * @param decisionSummary Optional summary of the decision
   * @param embeddings Vector embeddings for the decision
   * @param metadata Additional metadata
   * @returns The ID of the stored decision
   */
  async storeDecision(
    userId: string,
    meetingId: string,
    decisionId: string,
    decision: string,
    decisionSummary: string | null,
    embeddings: number[],
    metadata: Partial<UserContextMetadata> = {},
  ): Promise<string> {
    if (!meetingId || !decisionId) {
      throw new UserContextValidationError('Meeting ID and Decision ID are required');
    }

    return this.storeUserContext(userId, decision, embeddings, {
      contextType: ContextType.DECISION,
      meetingId,
      decisionId,
      decisionSummary: decisionSummary || undefined,
      isDecision: true,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Store an action item from a meeting
   * @param userId User identifier
   * @param meetingId Meeting identifier
   * @param actionItemId Unique action item identifier
   * @param actionItem Action item text content
   * @param assigneeId ID of the person assigned to the action item
   * @param dueDate Due date timestamp for the action item
   * @param embeddings Vector embeddings for the action item
   * @param metadata Additional metadata
   * @returns The ID of the stored action item
   */
  async storeActionItem(
    userId: string,
    meetingId: string,
    actionItemId: string,
    actionItem: string,
    assigneeId: string,
    dueDate: number | null,
    embeddings: number[],
    metadata: Partial<UserContextMetadata> = {},
  ): Promise<string> {
    if (!meetingId || !actionItemId) {
      throw new UserContextValidationError('Meeting ID and Action Item ID are required');
    }

    return this.storeUserContext(userId, actionItem, embeddings, {
      contextType: ContextType.ACTION_ITEM,
      meetingId,
      actionItemId,
      assigneeId,
      dueDate: dueDate || undefined,
      isActionItem: true,
      status: ActionItemStatus.PENDING,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Update the status of an action item
   * @param userId User identifier
   * @param actionItemId Action item identifier
   * @param status New status of the action item
   * @returns True if successful
   */
  async updateActionItemStatus(
    userId: string,
    actionItemId: string,
    status: ActionItemStatus,
  ): Promise<boolean> {
    if (!actionItemId) {
      throw new UserContextValidationError('Action Item ID is required');
    }

    // Find the action item
    const result = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [],
        {
          topK: 1,
          filter: {
            actionItemId,
            contextType: ContextType.ACTION_ITEM,
          },
          includeValues: true,
          includeMetadata: true,
        },
        userId
      ),
      `findActionItem:${userId}:${actionItemId}`
    );

    if (!result.matches || result.matches.length === 0) {
      throw new UserContextNotFoundError(actionItemId, userId);
    }

    const actionItem = result.matches[0];
    if (!actionItem.metadata) {
      throw new UserContextError(`Action item ${actionItemId} has no metadata`);
    }

    // Update the action item status
    const updatedRecord: VectorRecord<RecordMetadata> = {
      id: actionItem.id,
      values: actionItem.values || [],
      metadata: {
        ...actionItem.metadata,
        status,
        lastUpdatedAt: Date.now(),
      },
    };

    await this.executeWithRetry(
      () => this.pineconeService.upsertVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [updatedRecord],
        userId
      ),
      `updateActionItemStatus:${userId}:${actionItemId}`
    );

    this.logger.debug('Updated action item status', {
      userId,
      actionItemId,
      status,
    });

    return true;
  }

  /**
   * Store a question asked in a meeting
   * @param userId User identifier
   * @param meetingId Meeting identifier
   * @param questionId Unique question identifier
   * @param question Question text content
   * @param embeddings Vector embeddings for the question
   * @param isAnswered Whether the question has been answered
   * @param answerContextId ID of the context entry containing the answer
   * @param metadata Additional metadata
   * @returns The ID of the stored question
   */
  async storeQuestion(
    userId: string,
    meetingId: string,
    questionId: string,
    question: string,
    embeddings: number[],
    isAnswered: boolean = false,
    answerContextId?: string,
    metadata: Partial<UserContextMetadata> = {},
  ): Promise<string> {
    if (!meetingId || !questionId) {
      throw new UserContextValidationError('Meeting ID and Question ID are required');
    }

    return this.storeUserContext(userId, question, embeddings, {
      contextType: ContextType.QUESTION,
      meetingId,
      questionId,
      isQuestion: true,
      isAnswered,
      answerContextId,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Mark a question as answered
   * @param userId User identifier
   * @param questionId Question identifier
   * @param answerContextId ID of the context entry containing the answer
   * @returns True if successful
   */
  async markQuestionAsAnswered(
    userId: string,
    questionId: string,
    answerContextId: string,
  ): Promise<boolean> {
    if (!questionId || !answerContextId) {
      throw new UserContextValidationError('Question ID and Answer Context ID are required');
    }

    // Find the question
    const result = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [],
        {
          topK: 1,
          filter: {
            questionId,
            contextType: ContextType.QUESTION,
          },
          includeValues: true,
          includeMetadata: true,
        },
        userId
      ),
      `findQuestion:${userId}:${questionId}`
    );

    if (!result.matches || result.matches.length === 0) {
      throw new UserContextNotFoundError(questionId, userId);
    }

    const question = result.matches[0];
    if (!question.metadata) {
      throw new UserContextError(`Question ${questionId} has no metadata`);
    }

    // Update the question
    const updatedRecord: VectorRecord<RecordMetadata> = {
      id: question.id,
      values: question.values || [],
      metadata: {
        ...question.metadata,
        isAnswered: true,
        answerContextId,
        lastUpdatedAt: Date.now(),
      },
    };

    await this.executeWithRetry(
      () => this.pineconeService.upsertVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [updatedRecord],
        userId
      ),
      `markQuestionAsAnswered:${userId}:${questionId}`
    );

    this.logger.debug('Marked question as answered', {
      userId,
      questionId,
      answerContextId,
    });

    return true;
  }

  /**
 * Track a topic across multiple meetings
 * @param userId User identifier
 * @param topicId Unique topic identifier
 * @param topicName Name or description of the topic
 * @param meetingIds IDs of meetings where the topic was discussed
 * @param topicEmbeddings Vector embeddings for the topic
 * @param metadata Additional metadata
 * @returns The ID of the stored topic entry
 */
  async trackTopicAcrossMeetings(
    userId: string,
    topicId: string,
    topicName: string,
    meetingIds: string[],
    topicEmbeddings: number[],
    metadata: Partial<UserContextMetadata> = {},
  ): Promise<string> {
    if (!topicId || !topicName) {
      throw new UserContextValidationError('Topic ID and name are required');
    }

    if (!meetingIds || meetingIds.length === 0) {
      throw new UserContextValidationError('At least one meeting ID is required');
    }

    return this.storeUserContext(userId, topicName, topicEmbeddings, {
      contextType: ContextType.TOPIC,
      topicId,
      topicName,
      relatedMeetingIds: meetingIds,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Update a topic with additional meetings
   * @param userId User identifier
   * @param topicId Topic identifier
   * @param additionalMeetingIds IDs of additional meetings to add
   * @returns The updated topic record
   */
  async updateTopicMeetings(
    userId: string,
    topicId: string,
    additionalMeetingIds: string[],
  ): Promise<VectorRecord<RecordMetadata>> {
    if (!topicId) {
      throw new UserContextValidationError('Topic ID is required');
    }

    if (!additionalMeetingIds || additionalMeetingIds.length === 0) {
      throw new UserContextValidationError('At least one meeting ID is required');
    }

    // Find the topic
    const result = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [],
        {
          topK: 1,
          filter: {
            topicId,
            contextType: ContextType.TOPIC,
          },
          includeValues: true,
          includeMetadata: true,
        },
        userId
      ),
      `findTopic:${userId}:${topicId}`
    );

    if (!result.matches || result.matches.length === 0) {
      throw new UserContextNotFoundError(topicId, userId);
    }

    const topic = result.matches[0];
    if (!topic.metadata) {
      throw new UserContextError(`Topic ${topicId} has no metadata`);
    }

    // Get existing meeting IDs
    const existingMeetingIds = topic.metadata.relatedMeetingIds as string[] || [];

    // Combine without duplicates
    const allMeetingIds = Array.from(new Set([...existingMeetingIds, ...additionalMeetingIds]));

    // Update the topic
    const updatedRecord: VectorRecord<RecordMetadata> = {
      id: topic.id,
      values: topic.values || [],
      metadata: {
        ...topic.metadata,
        relatedMeetingIds: allMeetingIds,
        lastUpdatedAt: Date.now(),
      },
    };

    await this.executeWithRetry(
      () => this.pineconeService.upsertVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [updatedRecord],
        userId
      ),
      `updateTopicMeetings:${userId}:${topicId}`
    );

    this.logger.debug('Updated topic meetings', {
      userId,
      topicId,
      addedMeetings: additionalMeetingIds.length,
      totalMeetings: allMeetingIds.length,
    });

    return updatedRecord;
  }

  /**
   * Get the evolution of a topic across meetings
   * @param userId User identifier
   * @param topicId Topic identifier
   * @param timeRangeStart Optional start of time range
   * @param timeRangeEnd Optional end of time range
   * @returns Timeline of the topic across meetings
   */
  async getTopicEvolution(
    userId: string,
    topicId: string,
    timeRangeStart?: number,
    timeRangeEnd?: number,
  ): Promise<{
    topicInfo: any;
    timelineEntries: any[];
  }> {
    if (!topicId) {
      throw new UserContextValidationError('Topic ID is required');
    }

    // Find the topic record
    const topicResult = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [],
        {
          topK: 1,
          filter: {
            topicId,
            contextType: ContextType.TOPIC,
          },
          includeValues: false,
          includeMetadata: true,
        },
        userId
      ),
      `findTopic:${userId}:${topicId}`
    );

    if (!topicResult.matches || topicResult.matches.length === 0) {
      throw new UserContextNotFoundError(topicId, userId);
    }

    const topicInfo = topicResult.matches[0].metadata;
    if (!topicInfo) {
      throw new UserContextError(`Topic ${topicId} has no metadata`);
    }

    const relatedMeetingIds = topicInfo.relatedMeetingIds as string[] || [];

    if (relatedMeetingIds.length === 0) {
      return {
        topicInfo,
        timelineEntries: [],
      };
    }

    // Build filter for timeline entries
    const filter: Record<string, any> = {
      meetingId: { $in: relatedMeetingIds },
    };

    // Add time range if specified
    if (timeRangeStart || timeRangeEnd) {
      filter.timestamp = {};
      if (timeRangeStart) {
        filter.timestamp.$gte = timeRangeStart;
      }
      if (timeRangeEnd) {
        filter.timestamp.$lte = timeRangeEnd;
      }
    }

    // Get all related entries
    const entriesResult = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [],
        {
          topK: 1000, // Fetch a large number to get a complete timeline
          filter,
          includeValues: false,
          includeMetadata: true,
        },
        userId
      ),
      `getTopicTimeline:${userId}:${topicId}`
    );

    const timelineEntries = entriesResult.matches || [];

    // Sort entries by timestamp
    timelineEntries.sort((a, b) => {
      const timestampA = (a.metadata?.timestamp as number) || 0;
      const timestampB = (b.metadata?.timestamp as number) || 0;
      return timestampA - timestampB;
    });

    return {
      topicInfo,
      timelineEntries,
    };
  }

  /**
   * Detect knowledge gaps between teams regarding specific topics
   * @param userId User identifier
   * @param teamIds IDs of teams to compare
   * @param topicEmbeddings Vector embeddings of topics to check for gaps
   * @param topicNames Names of topics being compared
   * @param threshold Similarity threshold below which a gap is detected
   * @returns Detected knowledge gaps
   */
  async detectKnowledgeGaps(
    userId: string,
    teamIds: string[],
    topicEmbeddings: number[][],
    topicNames: string[],
    threshold: number = 0.7,
  ): Promise<Array<{
    gapType: KnowledgeGapType;
    topicName: string;
    topicIndex: number;
    teamId1: string;
    teamId2: string;
    similarityScore: number;
    description: string;
  }>> {
    if (teamIds.length < 2) {
      throw new UserContextValidationError('At least two team IDs are required for gap detection');
    }
    
    if (topicEmbeddings.length !== topicNames.length) {
      throw new UserContextValidationError('Topic embeddings and names arrays must have the same length');
    }
    
    const gaps: Array<{
      gapType: KnowledgeGapType;
      topicName: string;
      topicIndex: number;
      teamId1: string;
      teamId2: string;
      similarityScore: number;
      description: string;
    }> = [];
    
    try {
      // For each team combination
      for (let i = 0; i < teamIds.length; i++) {
        for (let j = i + 1; j < teamIds.length; j++) {
          const teamId1 = teamIds[i];
          const teamId2 = teamIds[j];
          
          // For each topic
          for (let t = 0; t < topicEmbeddings.length; t++) {
            const topicEmbedding = topicEmbeddings[t];
            const topicName = topicNames[t];
            
            // Get team 1's context on this topic
            const team1Context = await this.executeWithRetry(
              () => this.pineconeService.queryVectors<RecordMetadata>(
                USER_CONTEXT_INDEX,
                topicEmbedding,
                {
                  topK: 10,
                  filter: {
                    participantIds: teamId1,
                  },
                  includeValues: true,
                  includeMetadata: true,
                },
                userId
              ),
              `getTeamContext:${userId}:${teamId1}:${topicName}`
            );
            
            // Get team 2's context on this topic
            const team2Context = await this.executeWithRetry(
              () => this.pineconeService.queryVectors<RecordMetadata>(
                USER_CONTEXT_INDEX,
                topicEmbedding,
                {
                  topK: 10,
                  filter: {
                    participantIds: teamId2,
                  },
                  includeValues: true,
                  includeMetadata: true,
                },
                userId
              ),
              `getTeamContext:${userId}:${teamId2}:${topicName}`
            );
            
            // Calculate average similarity score between team contexts
            let totalSimilarity = 0;
            let comparisons = 0;
            
            const team1Matches = team1Context.matches || [];
            const team2Matches = team2Context.matches || [];
            
            // If either team has no context on this topic, it's a knowledge gap
            if (team1Matches.length === 0 || team2Matches.length === 0) {
              gaps.push({
                gapType: KnowledgeGapType.MISSING_INFORMATION,
                topicName,
                topicIndex: t,
                teamId1,
                teamId2,
                similarityScore: 0,
                description: `${team1Matches.length === 0 ? teamId1 : teamId2} has no context on topic "${topicName}"`,
              });
              continue;
            }
            
            // Compare each context item between teams
            for (const match1 of team1Matches) {
              for (const match2 of team2Matches) {
                if (match1.values && match2.values) {
                  // Calculate cosine similarity between embeddings
                  const similarity = this.calculateCosineSimilarity(match1.values, match2.values);
                  totalSimilarity += similarity;
                  comparisons++;
                }
              }
            }
            
            const avgSimilarity = comparisons > 0 ? totalSimilarity / comparisons : 0;
            
            // If average similarity is below threshold, it's a misalignment
            if (avgSimilarity < threshold) {
              gaps.push({
                gapType: KnowledgeGapType.MISALIGNMENT,
                topicName,
                topicIndex: t,
                teamId1,
                teamId2,
                similarityScore: avgSimilarity,
                description: `Teams ${teamId1} and ${teamId2} have different understandings of "${topicName}" (similarity: ${avgSimilarity.toFixed(2)})`,
              });
            }
          }
        }
      }
      
      this.logger.debug('Detected knowledge gaps', {
        userId,
        teamCount: teamIds.length,
        topicCount: topicNames.length,
        gapsFound: gaps.length,
      });
      
      return gaps;
    } catch (error) {
      this.logger.error('Error detecting knowledge gaps', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new UserContextError('Failed to detect knowledge gaps: ' + 
        (error instanceof Error ? error.message : String(error)));
    }
  }
  
  /**
   * Calculate cosine similarity between two vectors
   * @private
   */
  private calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
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
   * Find unanswered questions for a specific topic or meeting
   * @param userId User identifier
   * @param options Search options
   * @returns Array of unanswered questions
   */
  async findUnansweredQuestions(
    userId: string,
    options: {
      meetingId?: string;
      topicId?: string;
      timeRangeStart?: number;
      timeRangeEnd?: number;
    } = {},
  ): Promise<any[]> {
    // Build filter for unanswered questions
    const filter: Record<string, any> = {
      contextType: ContextType.QUESTION,
      isQuestion: true,
      isAnswered: false,
    };
    
    // Add meeting filter if specified
    if (options.meetingId) {
      filter.meetingId = options.meetingId;
    }
    
    // Add time range filter if specified
    if (options.timeRangeStart || options.timeRangeEnd) {
      filter.timestamp = {};
      if (options.timeRangeStart) {
        filter.timestamp.$gte = options.timeRangeStart;
      }
      if (options.timeRangeEnd) {
        filter.timestamp.$lte = options.timeRangeEnd;
      }
    }
    
    // If topic ID is specified, we need to get related meetings first
    if (options.topicId) {
      const topicResult = await this.executeWithRetry(
        () => this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [],
          {
            topK: 1,
            filter: {
              topicId: options.topicId,
              contextType: ContextType.TOPIC,
            },
            includeValues: false,
            includeMetadata: true,
          },
          userId
        ),
        `findTopic:${userId}:${options.topicId}`
      );
      
      if (topicResult.matches && topicResult.matches.length > 0 && topicResult.matches[0].metadata) {
        const relatedMeetingIds = topicResult.matches[0].metadata.relatedMeetingIds as string[] || [];
        if (relatedMeetingIds.length > 0) {
          filter.meetingId = { $in: relatedMeetingIds };
        }
      }
    }
    
    // Get unanswered questions
    const result = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [],
        {
          topK: 100,
          filter,
          includeValues: false,
          includeMetadata: true,
        },
        userId
      ),
      `findUnansweredQuestions:${userId}`
    );
    
    return result.matches || [];
  }

  /**
   * Generate a pre-meeting context briefing
   * @param userId User identifier
   * @param meetingId Meeting identifier
   * @param participantIds IDs of meeting participants
   * @param agenda Meeting agenda items
   * @returns Briefing with relevant context
   */
  async generatePreMeetingContext(
    userId: string,
    meetingId: string,
    participantIds: string[],
    agenda: Array<{
      agendaItemId: string;
      title: string;
      description: string;
      embeddings: number[];
    }>,
  ): Promise<{
    relatedTopics: any[];
    previousDecisions: any[];
    openActionItems: any[];
    unansweredQuestions: any[];
    recentMeetings: any[];
    participantStats: Record<string, any>;
  }> {
    if (!meetingId) {
      throw new UserContextValidationError('Meeting ID is required');
    }
    
    if (!agenda || agenda.length === 0) {
      throw new UserContextValidationError('At least one agenda item is required');
    }
    
    try {
      // Process each agenda item in parallel
      const contextPromises = agenda.map(async (item) => {
        // Find related topics based on agenda item embeddings
        const topicsResult = await this.executeWithRetry(
          () => this.pineconeService.queryVectors<RecordMetadata>(
            USER_CONTEXT_INDEX,
            item.embeddings,
            {
              topK: 5,
              filter: {
                contextType: ContextType.TOPIC,
              },
              includeValues: false,
              includeMetadata: true,
            },
            userId
          ),
          `findRelatedTopics:${userId}:${item.agendaItemId}`
        );
        
        // Find previous decisions related to this agenda item
        const decisionsResult = await this.executeWithRetry(
          () => this.pineconeService.queryVectors<RecordMetadata>(
            USER_CONTEXT_INDEX,
            item.embeddings,
            {
              topK: 10,
              filter: {
                contextType: ContextType.DECISION,
                isDecision: true,
              },
              includeValues: false,
              includeMetadata: true,
            },
            userId
          ),
          `findRelatedDecisions:${userId}:${item.agendaItemId}`
        );
        
        return {
          agendaItemId: item.agendaItemId,
          relatedTopics: topicsResult.matches || [],
          previousDecisions: decisionsResult.matches || [],
        };
      });
      
      const agendaContext = await Promise.all(contextPromises);
      
      // Find open action items assigned to meeting participants
      const actionItemsResult = await this.executeWithRetry(
        () => this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [],
          {
            topK: 50,
            filter: {
              contextType: ContextType.ACTION_ITEM,
              isActionItem: true,
              status: ActionItemStatus.PENDING,
              assigneeId: { $in: participantIds },
            },
            includeValues: false,
            includeMetadata: true,
          },
          userId
        ),
        `findOpenActionItems:${userId}`
      );
      
      // Find unanswered questions from previous meetings
      const questionsResult = await this.findUnansweredQuestions(userId, {
        timeRangeEnd: Date.now(), // Only questions before now
      });
      
      // Find recent meetings with the same participants
      const recentMeetingsResult = await this.executeWithRetry(
        () => this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [],
          {
            topK: 5,
            filter: {
              contextType: ContextType.MEETING,
              meetingEndTime: { $lt: Date.now() }, // Only past meetings
            },
            includeValues: false,
            includeMetadata: true,
          },
          userId
        ),
        `findRecentMeetings:${userId}`
      );
      
      // Filter meetings that have at least one common participant
      const recentMeetings = (recentMeetingsResult.matches || []).filter((meeting) => {
        if (!meeting.metadata || !meeting.metadata.participantIds) return false;
        const meetingParticipants = meeting.metadata.participantIds as string[];
        return meetingParticipants.some(id => participantIds.includes(id));
      });
      
      // Get statistics for each participant
      const participantStats: Record<string, any> = {};
      
      for (const participantId of participantIds) {
        const stats = await this.getUserContextStats(participantId);
        participantStats[participantId] = stats;
      }
      
      // Combine all context
      const relatedTopics = agendaContext.flatMap(item => item.relatedTopics);
      const previousDecisions = agendaContext.flatMap(item => item.previousDecisions);
      
      // Remove duplicates from topics and decisions
      const uniqueTopics = this.removeDuplicatesByProperty(relatedTopics, 'id');
      const uniqueDecisions = this.removeDuplicatesByProperty(previousDecisions, 'id');
      
      return {
        relatedTopics: uniqueTopics,
        previousDecisions: uniqueDecisions,
        openActionItems: actionItemsResult.matches || [],
        unansweredQuestions: questionsResult,
        recentMeetings,
        participantStats,
      };
    } catch (error) {
      this.logger.error('Error generating pre-meeting context', {
        userId,
        meetingId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new UserContextError('Failed to generate pre-meeting context: ' + 
        (error instanceof Error ? error.message : String(error)));
    }
  }
  
  /**
   * Remove duplicate objects from an array based on a property value
   * @private
   */
  private removeDuplicatesByProperty<T>(array: T[], prop: string): T[] {
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
   * Integrate with external systems for action items
   * @param userId User identifier
   * @param actionItemId The action item ID
   * @param externalSystem The external system to integrate with
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
    if (!actionItemId || !externalSystem) {
      throw new UserContextValidationError('Action Item ID and External System are required');
    }
    
    // Find the action item
    const result = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [],
        {
          topK: 1,
          filter: {
            actionItemId,
            contextType: ContextType.ACTION_ITEM,
          },
          includeValues: true,
          includeMetadata: true,
        },
        userId
      ),
      `findActionItem:${userId}:${actionItemId}`
    );

    if (!result.matches || result.matches.length === 0) {
      throw new UserContextNotFoundError(actionItemId, userId);
    }

    const actionItem = result.matches[0];
    if (!actionItem.metadata) {
      throw new UserContextError(`Action item ${actionItemId} has no metadata`);
    }
    
    // In a real implementation, this would call the API of the external system
    // For this implementation, we'll just simulate the integration
    const newExternalId = externalSystemId || `ext-${externalSystem}-${Date.now()}`;
    
    // Update the action item with external system information
    const updatedRecord: VectorRecord<RecordMetadata> = {
      id: actionItem.id,
      values: actionItem.values || [],
      metadata: {
        ...actionItem.metadata,
        externalSystem,
        externalSystemId: newExternalId,
        externalSystemData: JSON.stringify(externalSystemData),
        lastUpdatedAt: Date.now(),
      },
    };

    await this.executeWithRetry(
      () => this.pineconeService.upsertVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [updatedRecord],
        userId
      ),
      `updateActionItemExternal:${userId}:${actionItemId}`
    );

    this.logger.debug('Integrated action item with external system', {
      userId,
      actionItemId,
      externalSystem,
      externalSystemId: newExternalId,
    });

    return newExternalId;
  }

  /**
   * Retrieve context with pagination and advanced relevance scoring
   * @param userId User identifier
   * @param queryEmbedding Query embedding
   * @param options Advanced query options
   * @returns Paginated results with enhanced relevance scores
   */
  async retrieveContextWithPagination(
    userId: string,
    queryEmbedding: number[],
    options: {
      contextTypes?: ContextType[];
      pageSize?: number;
      pageNumber?: number;
      timeWeightFactor?: number;
      usageWeightFactor?: number;
      filter?: Record<string, any>;
    } = {},
  ): Promise<{
    results: any[];
    totalCount: number;
    pageCount: number;
    currentPage: number;
  }> {
    const pageSize = options.pageSize || 10;
    const pageNumber = options.pageNumber || 1;
    const timeWeightFactor = options.timeWeightFactor || 0.3;
    const usageWeightFactor = options.usageWeightFactor || 0.2;
    
    // Build filter
    const filter: Record<string, any> = { ...options.filter };
    
    // Add context type filter if specified
    if (options.contextTypes && options.contextTypes.length > 0) {
      filter.contextType = { $in: options.contextTypes };
    }
    
    // First get the total count by querying with a high limit
    const countResult = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        queryEmbedding,
        {
          topK: 1000, // High limit to get approximate count
          filter,
          includeValues: false,
          includeMetadata: false,
        },
        userId
      ),
      `countContext:${userId}`
    );
    
    const totalCount = countResult.matches?.length || 0;
    const pageCount = Math.ceil(totalCount / pageSize);
    
    // Calculate the effective topK for this page
    const effectiveTopK = pageSize * pageNumber;
    
    if (effectiveTopK > 1000) {
      this.logger.warn('Requested page exceeds maximum query size', {
        userId,
        pageSize,
        pageNumber,
        effectiveTopK,
      });
    }
    
    // Get actual results for this page
    const queryResult = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        queryEmbedding,
        {
          topK: Math.min(effectiveTopK, 1000),
          filter,
          includeValues: true,
          includeMetadata: true,
        },
        userId
      ),
      `retrieveContextPage:${userId}:${pageNumber}`
    );
    
    let matches = queryResult.matches || [];
    
    // Get only the records for the current page
    const startIdx = (pageNumber - 1) * pageSize;
    matches = matches.slice(startIdx, startIdx + pageSize);
    
    // Enhance relevance scoring with recency and usage information
    const now = Date.now();
    const enhancedMatches = matches.map(match => {
      let enhancedScore = match.score || 0;
      
      if (match.metadata) {
        // Factor in recency (newer = higher score)
        if (match.metadata.timestamp) {
          const ageInDays = (now - (match.metadata.timestamp as number)) / (1000 * 60 * 60 * 24);
          const recencyBoost = Math.max(0, 1 - (ageInDays / 30)) * timeWeightFactor;
          enhancedScore += recencyBoost;
        }
        
        // Factor in usage statistics
        if (match.metadata.viewCount) {
          const viewCount = match.metadata.viewCount as number;
          const usageBoost = Math.min(1, viewCount / 10) * usageWeightFactor;
          enhancedScore += usageBoost;
        }
        
        // Factor in explicit relevance feedback if available
        if (match.metadata.explicitRelevanceFeedback) {
          enhancedScore += (match.metadata.explicitRelevanceFeedback as number) * 0.5;
        }
      }
      
      return {
        ...match,
        originalScore: match.score,
        score: enhancedScore,
      };
    });
    
    // Sort by enhanced score
    enhancedMatches.sort((a, b) => (b.score || 0) - (a.score || 0));
    
    return {
      results: enhancedMatches,
      totalCount,
      pageCount,
      currentPage: pageNumber,
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
      
      // Create an updated record
      const updatedRecord: VectorRecord<RecordMetadata> = {
        id: contextId,
        values: record.values || [],
        metadata: {
          ...record.metadata,
          viewCount,
          lastAccessedAt: Date.now(),
        },
      };

      // Update the record
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
      throw new UserContextValidationError('Relevance feedback must be between 0 and 1');
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
      
      // Create an updated record with the feedback
      const updatedRecord: VectorRecord<RecordMetadata> = {
        id: contextId,
        values: record.values || [],
        metadata: {
          ...record.metadata,
          explicitRelevanceFeedback: relevanceFeedback,
          lastUpdatedAt: Date.now(),
        },
      };

      // Update the record
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
      throw new UserContextError('Failed to record relevance feedback: ' + 
        (error instanceof Error ? error.message : String(error)));
    }
  }
}
