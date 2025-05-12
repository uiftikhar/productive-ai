/**
 * Conversation Memory Service
 * 
 * Provides conversation history storage and retrieval for RAG context enhancement.
 * Maintains a record of interactions to provide additional context for queries.
 */

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { ContentChunk } from '../core/chunking.interface';
import { performance } from 'perf_hooks';

export interface MessageEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface ConversationEntry {
  id: string;
  userId: string;
  messages: MessageEntry[];
  title?: string;
  summary?: string;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, any>;
}

export interface ConversationSearchOptions {
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
  withSummary?: boolean;
}

export class ConversationMemoryService {
  private logger: Logger;
  private openAiConnector: OpenAIConnector;
  private conversations: Map<string, ConversationEntry> = new Map();
  private userConversations: Map<string, Set<string>> = new Map();
  
  constructor(options: {
    logger?: Logger;
    openAiConnector?: OpenAIConnector;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.openAiConnector = options.openAiConnector || new OpenAIConnector({ logger: this.logger });
  }

  /**
   * Create a new conversation
   * @param userId User identifier
   * @param initialMessage Optional initial message
   * @param metadata Additional metadata
   * @returns Conversation ID
   */
  createConversation(
    userId: string,
    initialMessage?: string,
    metadata: Record<string, any> = {}
  ): string {
    const conversationId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    const conversation: ConversationEntry = {
      id: conversationId,
      userId,
      messages: [],
      createdAt: now,
      updatedAt: now,
      metadata
    };
    
    // Add initial message if provided
    if (initialMessage) {
      conversation.messages.push({
        role: 'user',
        content: initialMessage,
        timestamp: now
      });
    }
    
    // Store the conversation
    this.conversations.set(conversationId, conversation);
    
    // Add to user's conversations
    if (!this.userConversations.has(userId)) {
      this.userConversations.set(userId, new Set());
    }
    this.userConversations.get(userId)!.add(conversationId);
    
    this.logger.info('Created new conversation', {
      conversationId,
      userId
    });
    
    return conversationId;
  }

  /**
   * Add a message to a conversation
   * @param conversationId Conversation identifier
   * @param role Message role (user/assistant/system)
   * @param content Message content
   * @param metadata Additional metadata
   * @returns Updated conversation
   */
  addMessage(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata: Record<string, any> = {}
  ): ConversationEntry | null {
    if (!this.conversations.has(conversationId)) {
      this.logger.warn('Attempted to add message to nonexistent conversation', {
        conversationId
      });
      return null;
    }
    
    const conversation = this.conversations.get(conversationId)!;
    const now = Date.now();
    
    // Add the new message
    conversation.messages.push({
      role,
      content,
      timestamp: now,
      metadata
    });
    
    // Update the conversation
    conversation.updatedAt = now;
    this.conversations.set(conversationId, conversation);
    
    this.logger.debug('Added message to conversation', {
      conversationId,
      role,
      messageCount: conversation.messages.length
    });
    
    return conversation;
  }

  /**
   * Get a conversation by ID
   * @param conversationId Conversation identifier
   * @returns Conversation or null if not found
   */
  getConversation(conversationId: string): ConversationEntry | null {
    return this.conversations.get(conversationId) || null;
  }

  /**
   * Get all conversations for a user
   * @param userId User identifier
   * @param options Search options
   * @returns Array of conversations
   */
  getUserConversations(
    userId: string,
    options: ConversationSearchOptions = {}
  ): ConversationEntry[] {
    if (!this.userConversations.has(userId)) {
      return [];
    }
    
    const conversationIds = Array.from(this.userConversations.get(userId)!);
    let conversations = conversationIds
      .map(id => this.conversations.get(id)!)
      .filter(conv => !!conv);
    
    // Filter by date range if specified
    if (options.startDate) {
      conversations = conversations.filter(
        conv => conv.createdAt >= options.startDate!.getTime()
      );
    }
    
    if (options.endDate) {
      conversations = conversations.filter(
        conv => conv.createdAt <= options.endDate!.getTime()
      );
    }
    
    // Sort by most recent first
    conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    
    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || conversations.length;
    
    return conversations.slice(offset, offset + limit);
  }

  /**
   * Delete a conversation
   * @param conversationId Conversation identifier
   * @returns Whether deletion was successful
   */
  deleteConversation(conversationId: string): boolean {
    if (!this.conversations.has(conversationId)) {
      return false;
    }
    
    const conversation = this.conversations.get(conversationId)!;
    
    // Remove from user's conversations
    const userConvs = this.userConversations.get(conversation.userId);
    if (userConvs) {
      userConvs.delete(conversationId);
    }
    
    // Remove the conversation
    this.conversations.delete(conversationId);
    
    this.logger.info('Deleted conversation', {
      conversationId,
      userId: conversation.userId
    });
    
    return true;
  }

  /**
   * Generate a conversation summary
   * @param conversationId Conversation identifier
   * @returns Updated conversation with summary
   */
  async generateSummary(conversationId: string): Promise<ConversationEntry | null> {
    if (!this.conversations.has(conversationId)) {
      return null;
    }
    
    const conversation = this.conversations.get(conversationId)!;
    
    // Only summarize if there are enough messages
    if (conversation.messages.length < 3) {
      return conversation;
    }
    
    try {
      const messagesText = conversation.messages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n\n');
      
      const summaryPrompt = `
      Summarize the following conversation in a concise paragraph:
      
      ${messagesText}
      
      Summary:
      `;
      
      const summary = await this.openAiConnector.generateResponse([
        { role: 'system', content: 'You are a helpful assistant that summarizes conversations.' },
        { role: 'user', content: summaryPrompt }
      ], {
        temperature: 0.3,
        maxTokens: 150
      });
      
      // Update the conversation with the summary
      conversation.summary = String(summary).trim();
      conversation.updatedAt = Date.now();
      this.conversations.set(conversationId, conversation);
      
      this.logger.info('Generated conversation summary', {
        conversationId,
        summaryLength: conversation.summary.length
      });
      
      return conversation;
    } catch (error) {
      this.logger.error('Error generating conversation summary', {
        error: error instanceof Error ? error.message : String(error),
        conversationId
      });
      return conversation;
    }
  }

  /**
   * Get recent conversation context
   * @param conversationId Conversation identifier
   * @param messageLimit Maximum number of messages to include
   * @returns Formatted conversation context
   */
  getRecentContext(conversationId: string, messageLimit: number = 10): string {
    if (!this.conversations.has(conversationId)) {
      return '';
    }
    
    const conversation = this.conversations.get(conversationId)!;
    const messages = conversation.messages;
    
    // Get the most recent messages up to the limit
    const recentMessages = messages.slice(-messageLimit);
    
    // Format as context
    return recentMessages.map(msg => 
      `${msg.role.toUpperCase()}: ${msg.content}`
    ).join('\n\n');
  }

  /**
   * Get conversation context as chunks
   * @param conversationId Conversation identifier
   * @returns Array of content chunks
   */
  getConversationChunks(conversationId: string): ContentChunk[] {
    if (!this.conversations.has(conversationId)) {
      return [];
    }
    
    const conversation = this.conversations.get(conversationId)!;
    const chunks: ContentChunk[] = [];
    
    // Create a chunk for each message
    conversation.messages.forEach((msg, index) => {
      chunks.push({
        content: msg.content,
        metadata: {
          index,
          sourceId: conversationId,
          sourceType: 'conversation',
          role: msg.role,
          timestamp: String(msg.timestamp),
          ...msg.metadata
        }
      });
    });
    
    // Add summary as a separate chunk if available
    if (conversation.summary) {
      chunks.push({
        content: conversation.summary,
        metadata: {
          index: -1, // Special index for summary
          sourceId: conversationId,
          sourceType: 'conversation_summary',
          timestamp: String(conversation.updatedAt)
        }
      });
    }
    
    return chunks;
  }

  /**
   * Search conversations by content
   * @param userId User identifier
   * @param query Search query
   * @param limit Maximum number of results
   * @returns Matching conversations
   */
  async searchConversations(
    userId: string,
    query: string,
    limit: number = 5
  ): Promise<ConversationEntry[]> {
    const startTime = performance.now();
    
    if (!this.userConversations.has(userId)) {
      return [];
    }
    
    try {
      // Get the user's conversations
      const userConvs = Array.from(this.userConversations.get(userId)!)
        .map(id => this.conversations.get(id)!)
        .filter(conv => !!conv);
      
      if (userConvs.length === 0) {
        return [];
      }
      
      // Generate an embedding for the query
      const queryEmbedding = await this.openAiConnector.generateEmbedding(query);
      
      // For each conversation, calculate a relevance score
      const scoredConversations = await Promise.all(
        userConvs.map(async (conv) => {
          // Get conversation text (latest messages and summary)
          const conversationText = this.getConversationSearchText(conv);
          
          // Generate embedding for conversation text
          const convEmbedding = await this.openAiConnector.generateEmbedding(conversationText);
          
          // Calculate cosine similarity
          const similarity = this.calculateCosineSimilarity(queryEmbedding, convEmbedding);
          
          return {
            conversation: conv,
            score: similarity
          };
        })
      );
      
      // Sort by score and take top results
      scoredConversations.sort((a, b) => b.score - a.score);
      const results = scoredConversations
        .slice(0, limit)
        .map(item => item.conversation);
      
      const endTime = performance.now();
      this.logger.info('Searched conversations', {
        userId,
        query: query.substring(0, 50),
        resultCount: results.length,
        processingTimeMs: (endTime - startTime).toFixed(2)
      });
      
      return results;
    } catch (error) {
      this.logger.error('Error searching conversations', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        query: query.substring(0, 50)
      });
      
      // Fall back to basic text search
      return this.basicTextSearch(userId, query, limit);
    }
  }

  /**
   * Get conversation text for search
   * @param conversation Conversation entry
   * @returns Conversation text
   */
  private getConversationSearchText(conversation: ConversationEntry): string {
    // Start with the summary if available
    const textParts: string[] = [];
    
    if (conversation.summary) {
      textParts.push(`SUMMARY: ${conversation.summary}`);
    }
    
    // Add the last 5 messages
    const recentMessages = conversation.messages.slice(-5);
    recentMessages.forEach(msg => {
      textParts.push(`${msg.role.toUpperCase()}: ${msg.content}`);
    });
    
    return textParts.join('\n\n');
  }

  /**
   * Basic text search for conversations (fallback)
   * @param userId User identifier
   * @param query Search query
   * @param limit Maximum number of results
   * @returns Matching conversations
   */
  private basicTextSearch(
    userId: string, 
    query: string, 
    limit: number
  ): ConversationEntry[] {
    const terms = query.toLowerCase().split(/\s+/);
    
    // Get all user conversations
    const userConvs = Array.from(this.userConversations.get(userId) || [])
      .map(id => this.conversations.get(id)!)
      .filter(conv => !!conv);
    
    // Score each conversation by term matches
    const scoredConvs = userConvs.map(conv => {
      const text = this.getConversationSearchText(conv).toLowerCase();
      let score = 0;
      
      // Count term occurrences
      terms.forEach(term => {
        const regex = new RegExp(term, 'g');
        const matches = text.match(regex);
        if (matches) {
          score += matches.length;
        }
      });
      
      return { conversation: conv, score };
    });
    
    // Sort by score and take top results
    scoredConvs.sort((a, b) => b.score - a.score);
    return scoredConvs
      .filter(item => item.score > 0)
      .slice(0, limit)
      .map(item => item.conversation);
  }

  /**
   * Calculate cosine similarity between two embeddings
   * @param embedding1 First embedding
   * @param embedding2 Second embedding
   * @returns Similarity score between 0 and 1
   */
  private calculateCosineSimilarity(
    embedding1: number[],
    embedding2: number[]
  ): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions');
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }
    
    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);
    
    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }
    
    return dotProduct / (norm1 * norm2);
  }

  /**
   * Get recent messages from the conversation
   * @param conversationId Conversation identifier
   * @param messageLimit Maximum number of messages to return
   * @returns Array of recent messages or empty array if conversation not found
   */
  getRecentMessages(conversationId: string, messageLimit: number = 5): MessageEntry[] {
    if (!this.conversations.has(conversationId)) {
      this.logger.warn('Attempted to get recent messages from nonexistent conversation', {
        conversationId
      });
      return [];
    }
    
    const conversation = this.conversations.get(conversationId)!;
    
    // Get the most recent messages up to the limit
    return conversation.messages.slice(-messageLimit);
  }

  /**
   * Get the OpenAI connector instance used by this service
   * @returns OpenAI connector instance
   */
  getOpenAIConnector(): OpenAIConnector {
    return this.openAiConnector;
  }
} 