import { v4 as uuidv4 } from 'uuid';
import { PersistentStateManager } from '../../core/state/persistent-state-manager';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * Chat message interface
 */
export interface ChatMessage {
  /**
   * Message ID
   */
  id: string;
  
  /**
   * Session ID
   */
  sessionId: string;
  
  /**
   * Message content
   */
  content: string;
  
  /**
   * Message role (user or assistant)
   */
  role: 'user' | 'assistant' | 'system';
  
  /**
   * Timestamp when the message was created
   */
  timestamp: number;
  
  /**
   * Optional attachments
   */
  attachments?: Array<{
    /**
     * Attachment type
     */
    type: string;
    
    /**
     * Attachment data
     */
    data: any;
    
    /**
     * Optional metadata
     */
    metadata?: Record<string, any>;
  }>;
  
  /**
   * Optional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Message store options
 */
interface MessageStoreOptions {
  /**
   * Persistent state manager for storing messages
   */
  stateManager: PersistentStateManager;
  
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Message retention time in milliseconds (default: 30 days)
   */
  messageRetentionMs?: number;
}

/**
 * Service for storing and retrieving chat messages
 */
export class MessageStore {
  private stateManager: PersistentStateManager;
  private logger: Logger;
  private messageRetentionMs: number;
  
  /**
   * Namespace prefix for message keys in the state manager
   */
  private readonly MESSAGE_PREFIX = 'chat_message:';
  
  /**
   * Namespace prefix for session message index in the state manager
   */
  private readonly SESSION_MESSAGES_PREFIX = 'chat_session_messages:';
  
  /**
   * Create a new message store
   */
  constructor(options: MessageStoreOptions) {
    this.stateManager = options.stateManager;
    this.logger = options.logger || new ConsoleLogger();
    this.messageRetentionMs = options.messageRetentionMs || 30 * 24 * 60 * 60 * 1000; // 30 days default
  }
  
  /**
   * Create a new message
   */
  async createMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<ChatMessage> {
    try {
      const id = uuidv4();
      const timestamp = Date.now();
      
      const fullMessage: ChatMessage = {
        ...message,
        id,
        timestamp
      };
      
      // Save message
      await this.stateManager.saveState(
        `${this.MESSAGE_PREFIX}${id}`,
        fullMessage,
        {
          ttl: this.messageRetentionMs / 1000, // Convert to seconds for TTL
          description: 'Chat message storage'
        }
      );
      
      // Add message to session index
      await this.addMessageToSessionIndex(fullMessage.sessionId, id, timestamp);
      
      this.logger.debug(`Created message ${id} for session ${fullMessage.sessionId}`);
      
      return fullMessage;
    } catch (error: any) {
      this.logger.error('Failed to create message', { error });
      throw new Error(`Failed to create message: ${error.message}`);
    }
  }
  
  /**
   * Get a message by ID
   */
  async getMessage(messageId: string): Promise<ChatMessage | null> {
    try {
      const stateKey = `${this.MESSAGE_PREFIX}${messageId}`;
      const exists = await this.stateManager.hasState(stateKey);
      
      if (!exists) {
        return null;
      }
      
      // Get the message data using the standardized loadState method
      const message = await this.stateManager.loadState<ChatMessage>(stateKey);
      
      if (!message) {
        return null;
      }
      
      // Ensure all required fields are present
      const completeMessage: ChatMessage = {
        id: message.id || messageId,
        sessionId: message.sessionId || '',
        content: message.content || '',
        role: message.role || 'system',
        timestamp: message.timestamp || Date.now(),
        attachments: message.attachments || [],
        metadata: message.metadata || {}
      };
      
      return completeMessage;
    } catch (error: any) {
      this.logger.error(`Failed to get message ${messageId}`, { error });
      return null;
    }
  }
  
  /**
   * Get the session message index
   */
  private async getSessionMessageIndex(sessionId: string): Promise<{ messageIds: Array<{ id: string; timestamp: number }> }> {
    // Make sure the state manager is initialized
    if (typeof this.stateManager['ensureInitialized'] === 'function') {
      this.stateManager['ensureInitialized']();
    }
    
    const stateKey = `${this.SESSION_MESSAGES_PREFIX}${sessionId}`;
    const exists = await this.stateManager.hasState(stateKey);
    
    if (!exists) {
      return { messageIds: [] };
    }
    
    try {
      // Get existing index
      const rawData = await this.stateManager.loadState(stateKey);
      
      // Handle string format (serialized JSON)
      if (typeof rawData === 'string') {
        try {
          const parsed = JSON.parse(rawData);
          const messageIndex = parsed.data || parsed;
          
          if (messageIndex && messageIndex.messageIds && Array.isArray(messageIndex.messageIds)) {
            return messageIndex;
          }
        } catch (parseError) {
          this.logger.error(`Error parsing message index for session ${sessionId}`, { error: parseError });
        }
        return { messageIds: [] };
      }
      
      // Handle object format
      if (rawData && typeof rawData === 'object') {
        // Initialize messageIds if not exists or not an array
        const messageIndex = rawData as { messageIds: Array<{ id: string; timestamp: number }> };
        if (!messageIndex.messageIds || !Array.isArray(messageIndex.messageIds)) {
          messageIndex.messageIds = [];
        }
        return messageIndex;
      }
      
      // Fallback to empty index
      return { messageIds: [] };
    } catch (error) {
      this.logger.error(`Failed to get message index for session ${sessionId}`, { error });
      return { messageIds: [] };
    }
  }
  
  /**
   * Get messages for a session with pagination
   */
  async getMessagesForSession(
    sessionId: string,
    options: {
      limit?: number;
      before?: number;
      after?: number;
      order?: 'asc' | 'desc';
    } = {}
  ): Promise<ChatMessage[]> {
    try {
      // Get the message index
      const messageIndex = await this.getSessionMessageIndex(sessionId);
      
      if (messageIndex.messageIds.length === 0) {
        return [];
      }
      
      // Sort by timestamp
      const sortedIds = [...messageIndex.messageIds].sort((a, b) => 
        options.order === 'asc' ? a.timestamp - b.timestamp : b.timestamp - a.timestamp
      );
      
      // Apply before/after filters
      let filteredIds = sortedIds;
      if (options.before) {
        filteredIds = filteredIds.filter(item => item.timestamp < options.before!);
      }
      if (options.after) {
        filteredIds = filteredIds.filter(item => item.timestamp > options.after!);
      }
      
      // Apply limit
      const limitedIds = options.limit ? filteredIds.slice(0, options.limit) : filteredIds;
      
      // Batch load messages
      const messages: ChatMessage[] = [];
      for (const { id } of limitedIds) {
        try {
          const message = await this.getMessage(id);
          if (message) {
            messages.push(message);
          }
        } catch (messageError) {
          this.logger.warn(`Failed to load message ${id} for session ${sessionId}`, { error: messageError });
        }
      }
      
      return messages;
    } catch (error) {
      this.logger.error(`Error getting messages for session ${sessionId}`, { error });
      return [];
    }
  }
  
  /**
   * Add a message ID to the session message index
   */
  private async addMessageToSessionIndex(sessionId: string, messageId: string, timestamp: number): Promise<void> {
    try {
      // Ensure the state manager is initialized
      if (typeof this.stateManager['ensureInitialized'] === 'function') {
        this.stateManager['ensureInitialized']();
      }
      
      const stateKey = `${this.SESSION_MESSAGES_PREFIX}${sessionId}`;
      
      // Create a fresh messageIndex object
      let messageIndex = { messageIds: [] as Array<{ id: string; timestamp: number }> };
      
      // Check if we already have an index for this session
      const exists = await this.stateManager.hasState(stateKey);
      
      if (exists) {
        try {
          // Try to load existing message index using loadState
          const existingIndex = await this.stateManager.loadState(stateKey);
          
          if (existingIndex && typeof existingIndex === 'object' && 
              existingIndex.messageIds && Array.isArray(existingIndex.messageIds)) {
            messageIndex.messageIds = [...existingIndex.messageIds];
          }
        } catch (loadError) {
          this.logger.warn(`Could not load existing message index for session ${sessionId}, creating new index`, { error: loadError });
          // Continue with the empty message index we created
        }
      }
      
      // Add the new message ID to the index
      messageIndex.messageIds.push({ id: messageId, timestamp });
      
      // Save the updated index
      await this.stateManager.saveState(
        stateKey,
        messageIndex,
        {
          ttl: this.messageRetentionMs / 1000,
          description: 'Chat session message index'
        }
      );
      
      this.logger.debug(`Added message ${messageId} to session index for ${sessionId}`);
    } catch (error) {
      this.logger.error(`Failed to add message ${messageId} to session index for ${sessionId}`, { error });
      // Don't throw here - better to continue with the message creation even if indexing fails
    }
  }
} 