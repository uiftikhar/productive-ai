/**
 * Conversation Context Service
 * Handles conversation history storage and retrieval
 */

import { RecordMetadata } from '@pinecone-database/pinecone';
import { BaseContextService } from './base-context.service';
import { MetadataValidationService } from './metadata-validation.service';
import {
  BaseContextMetadata,
  ContextType,
  USER_CONTEXT_INDEX,
  UserContextValidationError,
} from '../types/context.types';

/**
 * Service for managing conversation context operations
 */
export class ConversationContextService extends BaseContextService {
  private metadataValidator: MetadataValidationService;

  constructor(options: any = {}) {
    super(options);
    this.metadataValidator = new MetadataValidationService();
  }

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

    // Use a proper placeholder vector for a metadata-only search
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          Array(3072).fill(0), // Placeholder vector filled with zeros - matching index dimension
          {
            topK: limit,
            filter,
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `getConversationHistory:${userId}:${conversationId}`,
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
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          Array(3072).fill(0), // Placeholder vector filled with zeros - matching index dimension
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
        ),
      `findConversationTurns:${userId}:${conversationId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      return 0;
    }

    // Extract IDs of turns
    const turnIds = result.matches.map((match: any) => match.id);

    // Delete the turns
    await this.executeWithRetry(
      () =>
        this.pineconeService.deleteVectors(USER_CONTEXT_INDEX, turnIds, userId),
      `deleteConversationTurns:${userId}:${conversationId}`,
    );

    return turnIds.length;
  }

  /**
   * List all conversations for a user
   * @param userId User identifier
   * @returns List of conversation summaries
   */
  async listUserConversations(userId: string): Promise<
    Array<{
      conversationId: string;
      turnCount: number;
      firstTimestamp: number;
      lastTimestamp: number;
    }>
  > {
    // Get all conversation turns
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          Array(3072).fill(0), // Placeholder vector filled with zeros - matching index dimension
          {
            topK: 10000,
            filter: {
              contextType: ContextType.CONVERSATION,
            },
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `listUserConversations:${userId}`,
    );

    const turns = result.matches || [];

    // Group by conversation ID
    const convMap = new Map<
      string,
      {
        conversationId: string;
        turnCount: number;
        firstTimestamp: number;
        lastTimestamp: number;
      }
    >();

    for (const turn of turns) {
      const convId = turn.metadata?.conversationId as string;
      const timestamp = (turn.metadata?.timestamp as number) || 0;

      if (convId) {
        const existing = convMap.get(convId);
        if (existing) {
          existing.turnCount++;
          existing.firstTimestamp = Math.min(
            existing.firstTimestamp,
            timestamp,
          );
          existing.lastTimestamp = Math.max(existing.lastTimestamp, timestamp);
        } else {
          convMap.set(convId, {
            conversationId: convId,
            turnCount: 1,
            firstTimestamp: timestamp,
            lastTimestamp: timestamp,
          });
        }
      }
    }

    // Convert map to array and sort by most recent
    return Array.from(convMap.values()).sort(
      (a, b) => b.lastTimestamp - a.lastTimestamp,
    );
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
    const filter: Record<string, any> = {
      contextType: ContextType.CONVERSATION,
    };

    if (options.conversationIds && options.conversationIds.length > 0) {
      filter.conversationId = { $in: options.conversationIds };
    }

    if (options.role) {
      filter.role = options.role;
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

    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          queryEmbedding,
          {
            topK: options.maxResults || 10,
            filter,
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `searchConversations:${userId}`,
    );

    let matches = result.matches || [];

    // Filter by minimum score if specified
    if (options.minRelevanceScore !== undefined) {
      matches = matches.filter(
        (match) =>
          match.score !== undefined &&
          match.score >= (options.minRelevanceScore || 0),
      );
    }

    // Format the results
    return matches.map((match) => ({
      id: match.id,
      score: match.score,
      conversationId: match.metadata?.conversationId,
      turnId: match.metadata?.turnId,
      role: match.metadata?.role,
      message: match.metadata?.message || match.metadata?.content,
      timestamp: match.metadata?.timestamp,
      metadata: match.metadata,
    }));
  }
}
