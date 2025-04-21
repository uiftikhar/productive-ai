/**
 * Conversation History Item Interface
 * 
 * Defines the structure for items in conversation history
 */

/**
 * Represents a single turn in a conversation
 */
export interface ConversationHistoryItem {
  /**
   * Unique identifier for this conversation turn
   */
  id: string;
  
  /**
   * User ID this conversation belongs to
   */
  userId: string;
  
  /**
   * Conversation ID this turn belongs to
   */
  conversationId: string;
  
  /**
   * Message content
   */
  content: string;
  
  /**
   * Role of the entity that created this message
   */
  role: 'user' | 'assistant' | 'system';
  
  /**
   * Unix timestamp (ms) when this message was created
   */
  timestamp: number;
  
  /**
   * Segment ID if this message belongs to a specific segment
   */
  segmentId?: string;
  
  /**
   * Agent ID if this message was created by an agent
   */
  agentId?: string;
  
  /**
   * ID of the parent message this is responding to
   */
  parentId?: string;
  
  /**
   * Vector embeddings for this message
   */
  embeddings?: number[];
  
  /**
   * Additional metadata for this conversation turn
   */
  metadata?: Record<string, any>;
}

/**
 * Options for retrieving conversation history
 */
export interface ConversationHistoryOptions {
  /**
   * Maximum number of history items to retrieve
   */
  limit?: number;
  
  /**
   * Only retrieve items after this timestamp
   */
  afterTimestamp?: number;
  
  /**
   * Only retrieve items before this timestamp
   */
  beforeTimestamp?: number;
  
  /**
   * Only retrieve items from this segment
   */
  segmentId?: string;
  
  /**
   * Only retrieve items from this agent
   */
  agentId?: string;
  
  /**
   * Only retrieve items with this role
   */
  role?: 'user' | 'assistant' | 'system';
  
  /**
   * Whether to include metadata in the response
   */
  includeMetadata?: boolean;
  
  /**
   * Whether to include embeddings in the response
   */
  includeEmbeddings?: boolean;
} 