import { RecordMetadata } from '@pinecone-database/pinecone';
import { PineconeConnectionService, VectorRecord } from '../../pinecone/pinecone-connection.service.ts';

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
  CUSTOM = 'custom'
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
  documentId?: string;
  conversationId?: string;
  turnId?: string;
  role?: 'user' | 'assistant' | 'system';
  recency?: number; // Higher values indicate more recent/relevant content
  chunkIndex?: number;
  totalChunks?: number;
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
  
  constructor() {
    this.pineconeService = new PineconeConnectionService();
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
    metadata: Partial<UserContextMetadata> = {}
  ): Promise<string> {
    // Generate a unique ID for this context entry
    const contextId = `${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Create the record with complete metadata
    const record: VectorRecord<RecordMetadata> = {
      id: contextId,
      values: embeddings,
      metadata: {
        userId,
        timestamp: Date.now(),
        ...metadata
      }
    };
    
    // Store the vector in the user's namespace
    await this.pineconeService.upsertVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [record],
      userId // Using userId as the namespace
    );
    
    return contextId;
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
    additionalMetadata: Partial<UserContextMetadata> = {}
  ): Promise<string> {
    // Calculate recency - newer messages should have higher recency scores
    const recency = Date.now();
    
    return this.storeUserContext(
      userId,
      message,
      embeddings,
      {
        contextType: ContextType.CONVERSATION,
        conversationId,
        turnId: turnId || `turn-${Date.now()}`,
        role,
        recency,
        ...additionalMetadata
      }
    );
  }
  
  /**
   * Store a document or document chunk in the context database
   * @param userId User identifier
   * @param documentId Unique document identifier
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
    content: string,
    embeddings: number[],
    chunkIndex: number = 0,
    totalChunks: number = 1,
    metadata: Partial<UserContextMetadata> = {}
  ): Promise<string> {
    return this.storeUserContext(
      userId,
      content,
      embeddings,
      {
        contextType: ContextType.DOCUMENT,
        documentId,
        chunkIndex,
        totalChunks,
        timestamp: Date.now(),
        ...metadata
      }
    );
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
    } = {}
  ) {
    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      queryEmbedding,
      {
        topK: options.topK || 5,
        filter: options.filter,
        includeValues: options.includeEmbeddings || false,
        includeMetadata: true
      },
      userId // Using userId as the namespace
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
    } = {}
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
        includeMetadata: true
      },
      userId
    );
    
    // Filter by minimum score if specified
    let matches = result.matches || [];
    if (options.minScore) {
      matches = matches.filter(match => match.score && match.score >= (options.minScore || 0));
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
    beforeTimestamp?: number
  ) {
    const filter: Record<string, any> = {
      contextType: ContextType.CONVERSATION,
      conversationId
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
        includeMetadata: true
      },
      userId
    );
    
    const turns = result.matches || [];
    
    // Sort turns by timestamp
    return turns.sort((a, b) => {
      const timestampA = a.metadata?.timestamp as number || 0;
      const timestampB = b.metadata?.timestamp as number || 0;
      return timestampA - timestampB;
    });
  }
  
  /**
   * Retrieve all chunks of a specific document
   * @param userId User identifier
   * @param documentId Document identifier
   * @returns Document chunks ordered by chunkIndex
   */
  async getDocumentChunks(
    userId: string,
    documentId: string
  ) {
    const filter = {
      contextType: ContextType.DOCUMENT,
      documentId
    };
    
    // Use an empty vector for a metadata-only search
    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [], // Empty vector for metadata-only query
      {
        topK: 1000, // Assuming no document has more than 1000 chunks
        filter,
        includeValues: false,
        includeMetadata: true
      },
      userId
    );
    
    const chunks = result.matches || [];
    
    // Sort chunks by index
    return chunks.sort((a, b) => {
      const indexA = a.metadata?.chunkIndex as number || 0;
      const indexB = b.metadata?.chunkIndex as number || 0;
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
        includeMetadata: true
      },
      userId
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
      userId
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
      userId
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
    conversationId: string
  ): Promise<number> {
    // Find all turns in this conversation
    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [], // Empty vector for metadata-only query
      {
        topK: 1000, 
        filter: {
          contextType: ContextType.CONVERSATION,
          conversationId
        },
        includeValues: false,
        includeMetadata: false
      },
      userId
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
      userId
    );
    
    return turnIds.length;
  }
  
  /**
   * Delete a specific document and all its chunks
   * @param userId User identifier
   * @param documentId Document identifier
   * @returns Number of chunks deleted
   */
  async deleteDocument(
    userId: string,
    documentId: string
  ): Promise<number> {
    // Find all chunks in this document
    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [], // Empty vector for metadata-only query
      {
        topK: 1000,
        filter: {
          contextType: ContextType.DOCUMENT,
          documentId
        },
        includeValues: false,
        includeMetadata: false
      },
      userId
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
      userId
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
    relevanceScore: number
  ): Promise<void> {
    // Fetch the existing record to preserve other metadata
    const result = await this.pineconeService.fetchVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [contextId],
      userId
    );
    
    const record = result.records[contextId];
    if (!record) {
      throw new Error(`Context record ${contextId} not found for user ${userId}`);
    }
    
    // Create an updated record with the new relevance score
    const updatedRecord: VectorRecord<RecordMetadata> = {
      id: contextId,
      values: record.values || [],
      metadata: {
        ...record.metadata,
        relevanceScore
      }
    };
    
    // Update the record
    await this.pineconeService.upsertVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [updatedRecord],
      userId
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
    }>
  ): Promise<string[]> {
    // Create records for all entries
    const records: VectorRecord<RecordMetadata>[] = entries.map(entry => {
      const contextId = `${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      return {
        id: contextId,
        values: entry.embeddings,
        metadata: {
          userId,
          timestamp: Date.now(),
          ...entry.metadata
        }
      };
    });
    
    // Store all vectors in a single operation
    await this.pineconeService.upsertVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      records,
      userId
    );
    
    // Return all created IDs
    return records.map(record => record.id);
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
    const stats = await this.pineconeService.describeIndexStats(USER_CONTEXT_INDEX);
    
    // Get all entries for this namespace to analyze
    const result = await this.pineconeService.queryVectors<RecordMetadata>(
      USER_CONTEXT_INDEX,
      [], // Empty vector for metadata-only query
      {
        topK: 1000, // Fetch a large number to analyze
        includeValues: false,
        includeMetadata: true
      },
      userId
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
        contextTypeCounts[contextType] = (contextTypeCounts[contextType] || 0) + 1;
        
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
      newestEntry: newestTimestamp
    };
  }
} 