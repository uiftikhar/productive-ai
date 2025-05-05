import { AgentContext } from './base-agent.interface';

/**
 * Interface for context providers that provide standardized access
 * to various context services within the agent framework
 */
export interface ContextProvider {
  /**
   * Get context data for an agent request
   * @param userId User identifier
   * @param input Query or input to get context for
   * @param options Additional options for context retrieval
   */
  getContext(
    userId: string,
    input: string,
    options?: {
      conversationId?: string;
      sessionId?: string;
      contextTypes?: string[];
      maxResults?: number;
      [key: string]: any;
    },
  ): Promise<AgentContext>;

  /**
   * Store context data from an agent's execution
   * @param userId User identifier
   * @param content Content to store
   * @param metadata Additional metadata
   */
  storeContext(
    userId: string,
    content: string,
    metadata?: Record<string, any>,
  ): Promise<string>;

  /**
   * Clear context data for a user
   * @param userId User identifier
   * @param options Options for what context to clear
   */
  clearContext(
    userId: string,
    options?: {
      contextTypes?: string[];
      olderThan?: number;
      [key: string]: any;
    },
  ): Promise<void>;
}

/**
 * Retention policy options for conversations
 */
export enum ConversationRetentionPolicy {
  STANDARD = 'standard', // Default retention (30 days)
  EXTENDED = 'extended', // Extended retention (90 days)
  PERMANENT = 'permanent', // Permanent retention (no deletion)
}

/**
 * Enhanced conversation storage options
 */
export interface ConversationStorageOptions {
  retentionPolicy?: ConversationRetentionPolicy;
  retentionPriority?: number;
  retentionTags?: string[];
  isHighValue?: boolean;
  segmentId?: string;
  segmentTopic?: string;
  isSegmentStart?: boolean;
  agentId?: string;
  agentName?: string;
  capability?: string;
  agentVersion?: string;
  [key: string]: any;
}

/**
 * Base context provider types for specific context services
 */
export interface ConversationContextProvider extends ContextProvider {
  /**
   * Get conversation history
   * @param userId User identifier
   * @param conversationId Conversation identifier
   * @param limit Maximum number of turns to retrieve
   * @param options Additional options for filtering
   */
  getConversationHistory(
    userId: string,
    conversationId: string,
    limit?: number,
    options?: {
      beforeTimestamp?: number;
      afterTimestamp?: number;
      segmentId?: string;
      agentId?: string;
      role?: 'user' | 'assistant' | 'system';
      includeMetadata?: boolean;
    },
  ): Promise<any[]>;

  /**
   * Store a new conversation turn
   * @param userId User identifier
   * @param conversationId Conversation identifier
   * @param message The message content
   * @param role Who sent the message (user, assistant, system)
   * @param options Enhanced storage options for agent-specific data and retention
   */
  storeConversationTurn(
    userId: string,
    conversationId: string,
    message: string,
    role: 'user' | 'assistant' | 'system',
    options?: ConversationStorageOptions,
  ): Promise<string>;

  /**
   * Get conversation segments
   * @param userId User identifier
   * @param conversationId Conversation identifier
   */
  getConversationSegments?(
    userId: string,
    conversationId: string,
  ): Promise<any[]>;

  /**
   * Update retention policy for conversation
   * @param userId User identifier
   * @param conversationId Conversation identifier
   * @param policy Retention policy to apply
   * @param options Additional options for filtering which turns to update
   */
  updateRetentionPolicy?(
    userId: string,
    conversationId: string,
    policy: ConversationRetentionPolicy,
    options?: {
      turnIds?: string[];
      segmentId?: string;
      retentionPriority?: number;
      retentionTags?: string[];
      isHighValue?: boolean;
    },
  ): Promise<number>;

  /**
   * Get conversations by agent
   * @param userId User identifier
   * @param agentId Agent identifier
   * @param limit Maximum number of conversations to retrieve
   */
  getConversationsByAgent?(
    userId: string,
    agentId: string,
    limit?: number,
  ): Promise<any[]>;

  /**
   * Delete expired conversations based on retention policy
   * @param userId Optional user identifier (if not provided, clean up for all users)
   */
  pruneExpiredConversations?(userId?: string): Promise<number>;
}

export interface DocumentContextProvider extends ContextProvider {
  /**
   * Get relevant documents based on a query
   * @param userId User identifier
   * @param query Search query
   * @param limit Maximum number of documents to retrieve
   */
  getRelevantDocuments(
    userId: string,
    query: string,
    limit?: number,
  ): Promise<any[]>;

  /**
   * Store a document for a user
   * @param userId User identifier
   * @param document Document content
   * @param metadata Document metadata
   */
  storeDocument(
    userId: string,
    document: string,
    metadata?: Record<string, any>,
  ): Promise<string>;
}

export interface MemoryContextProvider extends ContextProvider {
  /**
   * Get memories related to a query
   * @param userId User identifier
   * @param query Memory query
   * @param options Retrieval options
   */
  retrieveMemories(
    userId: string,
    query: string,
    options?: Record<string, any>,
  ): Promise<any[]>;

  /**
   * Store a memory for a user
   * @param userId User identifier
   * @param memory Memory content
   * @param importance Memory importance (0-1)
   */
  storeMemory(
    userId: string,
    memory: string,
    importance?: number,
    metadata?: Record<string, any>,
  ): Promise<string>;
}
