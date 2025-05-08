/**
 * Conversation Context Manager for Short-Term Memory
 * Part of Milestone 2.2: Agent Memory System
 */
import { v4 as uuidv4 } from 'uuid';
import {
  Memory,
  MemoryType,
  ConversationMemory,
  ConversationMessage,
  MemoryRepository,
  MemoryQueryParams,
  MemoryQueryResults
} from '../interfaces/memory.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Configuration options for the conversation context manager
 */
export interface ConversationContextConfig {
  maxMessagesInContext?: number;
  defaultImportance?: number;
  defaultConfidence?: number;
  summarizeThreshold?: number;
  expireAfter?: number; // in milliseconds
  summarizationProvider?: ConversationSummarizer;
  logger?: Logger;
}

/**
 * Interface for conversation summarization
 */
export interface ConversationSummarizer {
  summarizeConversation(messages: ConversationMessage[]): Promise<string>;
}

/**
 * Conversation manager for maintaining short-term contextual memory
 */
export class ConversationContextManager {
  private config: ConversationContextConfig;
  private logger: Logger;
  private memoryRepository: MemoryRepository<ConversationMemory>;
  private activeConversations: Map<string, string> = new Map(); // conversationId -> memoryId
  private expirationTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Create a new conversation context manager
   */
  constructor(
    memoryRepository: MemoryRepository<ConversationMemory>,
    config: ConversationContextConfig = {}
  ) {
    this.memoryRepository = memoryRepository;
    this.logger = config.logger || new ConsoleLogger();
    
    // Set default configuration
    this.config = {
      maxMessagesInContext: 50,
      defaultImportance: 0.7,
      defaultConfidence: 0.9,
      summarizeThreshold: 100,
      expireAfter: 24 * 60 * 60 * 1000, // 24 hours
      ...config
    };
  }

  /**
   * Create a new conversation context
   */
  async createConversation(
    agentId: string,
    participants: string[],
    topic?: string
  ): Promise<ConversationMemory> {
    // Create conversation memory
    const conversationId = uuidv4();
    const startTime = new Date();
    
    const conversationMemory: Omit<ConversationMemory, 'id' | 'createdAt' | 'updatedAt'> = {
      type: MemoryType.SHORT_TERM,
      agentId,
      content: {
        messages: [],
        participants: [agentId, ...participants.filter(p => p !== agentId)],
        topic,
        startTime
      },
      metadata: {
        importance: this.config.defaultImportance || 0.7,
        confidence: this.config.defaultConfidence || 0.9,
        sessionId: conversationId,
        tags: ['conversation', 'short-term']
      }
    };
    
    // Store in memory repository
    const memory = await this.memoryRepository.store(conversationMemory);
    
    // Set as active conversation
    this.activeConversations.set(conversationId, memory.id);
    
    // Set expiration timer
    if (this.config.expireAfter) {
      this.setExpirationTimer(conversationId, memory.id);
    }
    
    this.logger.info(`Created conversation: ${conversationId}`, {
      memoryId: memory.id,
      agentId,
      participants
    });
    
    return memory;
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(
    conversationId: string,
    message: Omit<ConversationMessage, 'id' | 'timestamp'>
  ): Promise<ConversationMemory> {
    // Get memory ID for this conversation
    const memoryId = this.activeConversations.get(conversationId);
    
    if (!memoryId) {
      throw new Error(`Conversation ${conversationId} not found or expired`);
    }
    
    // Get conversation memory
    const memory = await this.memoryRepository.getById(memoryId);
    
    if (!memory) {
      throw new Error(`Memory ${memoryId} not found for conversation ${conversationId}`);
    }
    
    // Create message with ID and timestamp
    const completeMessage: ConversationMessage = {
      ...message,
      id: uuidv4(),
      timestamp: new Date()
    };
    
    // Add to conversation memory
    const updatedMessages = [...memory.content.messages, completeMessage];
    
    // Check if we need to summarize
    let updatedContent: ConversationMemory['content'];
    
    if (
      this.config.summarizationProvider && 
      this.config.summarizeThreshold &&
      updatedMessages.length > this.config.summarizeThreshold
    ) {
      // Summarize older messages
      const summary = await this.summarizeMessages(updatedMessages);
      
      // Keep only recent messages
      const recentMessages = updatedMessages.slice(-this.config.maxMessagesInContext!);
      
      // Create a system message with the summary
      const summaryMessage: ConversationMessage = {
        id: uuidv4(),
        sender: 'system',
        content: `[Previous conversation summary: ${summary}]`,
        timestamp: new Date(),
        type: 'system',
        metadata: {
          isConversationSummary: true,
          summarizedMessages: updatedMessages.length - recentMessages.length
        }
      };
      
      updatedContent = {
        ...memory.content,
        messages: [summaryMessage, ...recentMessages]
      };
    } else if (this.config.maxMessagesInContext && updatedMessages.length > this.config.maxMessagesInContext) {
      // Trim to max messages without summarization
      updatedContent = {
        ...memory.content,
        messages: updatedMessages.slice(-this.config.maxMessagesInContext)
      };
    } else {
      // No trimming needed
      updatedContent = {
        ...memory.content,
        messages: updatedMessages
      };
    }
    
    // Update conversation memory
    const updatedMemory = await this.memoryRepository.update(memoryId, {
      content: updatedContent,
      updatedAt: new Date()
    } as Partial<ConversationMemory>);
    
    // Refresh expiration timer
    if (this.config.expireAfter) {
      this.refreshExpirationTimer(conversationId, memoryId);
    }
    
    this.logger.debug(`Added message to conversation: ${conversationId}`, {
      memoryId,
      messageId: completeMessage.id,
      sender: completeMessage.sender
    });
    
    return updatedMemory;
  }

  /**
   * Get conversation memory by ID
   */
  async getConversation(conversationId: string): Promise<ConversationMemory | null> {
    const memoryId = this.activeConversations.get(conversationId);
    
    if (!memoryId) {
      return null;
    }
    
    const memory = await this.memoryRepository.getById(memoryId);
    
    if (memory && this.config.expireAfter) {
      this.refreshExpirationTimer(conversationId, memoryId);
    }
    
    return memory;
  }

  /**
   * Get all messages in a conversation
   */
  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    const memory = await this.getConversation(conversationId);
    
    if (!memory) {
      throw new Error(`Conversation ${conversationId} not found or expired`);
    }
    
    return memory.content.messages;
  }

  /**
   * End a conversation
   */
  async endConversation(conversationId: string): Promise<ConversationMemory> {
    const memoryId = this.activeConversations.get(conversationId);
    
    if (!memoryId) {
      throw new Error(`Conversation ${conversationId} not found or expired`);
    }
    
    // Get conversation memory
    const memory = await this.memoryRepository.getById(memoryId);
    
    if (!memory) {
      throw new Error(`Memory ${memoryId} not found for conversation ${conversationId}`);
    }
    
    // Update end time
    const updatedMemory = await this.memoryRepository.update(memoryId, {
      content: {
        ...memory.content,
        endTime: new Date()
      }
    } as Partial<ConversationMemory>);
    
    // Remove expiration timer
    this.removeExpirationTimer(conversationId);
    
    // Keep the mapping for later retrieval
    // (not removing from activeConversations to allow retrieval by ID)
    
    this.logger.info(`Ended conversation: ${conversationId}`, {
      memoryId,
      duration: updatedMemory.content.endTime 
        ? updatedMemory.content.endTime.getTime() - updatedMemory.content.startTime.getTime() 
        : undefined,
      messageCount: updatedMemory.content.messages.length
    });
    
    return updatedMemory;
  }

  /**
   * Find conversations by agent or participant
   */
  async findConversations(
    agentId?: string,
    participantId?: string,
    limit: number = 10,
    offset: number = 0
  ): Promise<MemoryQueryResults<ConversationMemory>> {
    // Build query parameters
    const queryParams: MemoryQueryParams = {
      type: MemoryType.SHORT_TERM,
      limit,
      offset,
      sortBy: 'updatedAt',
      sortDirection: 'desc'
    };
    
    if (agentId) {
      queryParams.agentId = agentId;
    }
    
    // Fetch conversations
    const result = await this.memoryRepository.query(queryParams);
    
    // If participant filtering is required, do it manually
    // since our repository interface doesn't support content filtering
    if (participantId) {
      const filteredItems = result.items.filter(memory => 
        memory.content.participants.includes(participantId)
      );
      
      // Adjust total count and hasMore flag
      return {
        items: filteredItems.slice(0, limit),
        totalCount: filteredItems.length,
        hasMore: filteredItems.length > limit,
        metadata: result.metadata
      };
    }
    
    return result;
  }

  /**
   * Get all active conversation IDs
   */
  getActiveConversationIds(): string[] {
    return Array.from(this.activeConversations.keys());
  }

  /**
   * Check if a conversation is active
   */
  isConversationActive(conversationId: string): boolean {
    return this.activeConversations.has(conversationId);
  }

  /**
   * Set expiration timer for a conversation
   */
  private setExpirationTimer(conversationId: string, memoryId: string): void {
    // Clear existing timer
    this.removeExpirationTimer(conversationId);
    
    // Set new timer
    const timer = setTimeout(() => {
      this.expireConversation(conversationId, memoryId);
    }, this.config.expireAfter!);
    
    this.expirationTimers.set(conversationId, timer);
  }

  /**
   * Refresh expiration timer for a conversation
   */
  private refreshExpirationTimer(conversationId: string, memoryId: string): void {
    if (this.config.expireAfter) {
      this.setExpirationTimer(conversationId, memoryId);
    }
  }

  /**
   * Remove expiration timer for a conversation
   */
  private removeExpirationTimer(conversationId: string): void {
    const timer = this.expirationTimers.get(conversationId);
    
    if (timer) {
      clearTimeout(timer);
      this.expirationTimers.delete(conversationId);
    }
  }

  /**
   * Handle conversation expiration
   */
  private async expireConversation(conversationId: string, memoryId: string): Promise<void> {
    try {
      this.logger.info(`Expiring conversation: ${conversationId}`, { memoryId });
      
      // Get conversation memory
      const memory = await this.memoryRepository.getById(memoryId);
      
      if (memory) {
        // Update end time if not already set
        if (!memory.content.endTime) {
          await this.memoryRepository.update(memoryId, {
            content: {
              ...memory.content,
              endTime: new Date()
            }
          } as Partial<ConversationMemory>);
        }
      }
      
      // Remove from active conversations
      this.activeConversations.delete(conversationId);
      this.expirationTimers.delete(conversationId);
    } catch (error) {
      this.logger.error(`Error expiring conversation: ${conversationId}`, {
        error: error instanceof Error ? error.message : String(error),
        memoryId
      });
    }
  }

  /**
   * Summarize messages using summarization provider
   */
  private async summarizeMessages(messages: ConversationMessage[]): Promise<string> {
    if (!this.config.summarizationProvider) {
      return `[${messages.length} previous messages]`;
    }
    
    try {
      return await this.config.summarizationProvider.summarizeConversation(messages);
    } catch (error) {
      this.logger.error('Error summarizing conversation', {
        error: error instanceof Error ? error.message : String(error),
        messageCount: messages.length
      });
      
      return `[${messages.length} previous messages - summarization failed]`;
    }
  }
} 