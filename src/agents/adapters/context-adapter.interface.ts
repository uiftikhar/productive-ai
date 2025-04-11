// src/agents/adapters/context-adapter.interface.ts

import { AgentContext } from '../interfaces/agent.interface.ts';

/**
 * Interface for context adapters that provide standardized access
 * to various context services within the agent framework
 */
export interface ContextAdapter {
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
    }
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
    metadata?: Record<string, any>
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
    }
  ): Promise<void>;
}

/**
 * Base context adapter types for specific context services
 */
export interface ConversationContextAdapter extends ContextAdapter {
  /**
   * Get conversation history
   * @param userId User identifier 
   * @param conversationId Conversation identifier
   * @param limit Maximum number of turns to retrieve
   */
  getConversationHistory(
    userId: string,
    conversationId: string,
    limit?: number
  ): Promise<any[]>;

  /**
   * Store a new conversation turn
   * @param userId User identifier
   * @param conversationId Conversation identifier
   * @param message The message content
   * @param role Who sent the message (user, assistant, system)
   */
  storeConversationTurn(
    userId: string,
    conversationId: string,
    message: string,
    role: 'user' | 'assistant' | 'system'
  ): Promise<string>;
}

export interface DocumentContextAdapter extends ContextAdapter {
  /**
   * Get relevant documents based on a query
   * @param userId User identifier
   * @param query Search query
   * @param limit Maximum number of documents to retrieve
   */
  getRelevantDocuments(
    userId: string,
    query: string,
    limit?: number
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
    metadata?: Record<string, any>
  ): Promise<string>;
}

export interface MemoryContextAdapter extends ContextAdapter {
  /**
   * Get memories related to a query
   * @param userId User identifier
   * @param query Memory query
   * @param options Retrieval options
   */
  retrieveMemories(
    userId: string,
    query: string,
    options?: Record<string, any>
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
    metadata?: Record<string, any>
  ): Promise<string>;
} 