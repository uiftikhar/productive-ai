/**
 * Types for conversation messages and history
 */

/**
 * Roles of participants in a conversation
 */
export enum ParticipantRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system'
}

/**
 * A single message in a conversation
 */
export interface ConversationMessage {
  /**
   * Who sent the message (user, assistant, system)
   */
  role: ParticipantRole;
  
  /**
   * Content of the message
   */
  content: string;
  
  /**
   * Optional timestamp when the message was created
   */
  timestamp?: string | number;
  
  /**
   * Optional ID of the agent that processed this message (for assistant messages)
   */
  agentId?: string;
  
  /**
   * Optional metadata for the message
   */
  metadata?: Record<string, any>;
}

/**
 * A conversation turn consisting of a user message and assistant response
 */
export interface ConversationTurn {
  /**
   * The user's message
   */
  userMessage: ConversationMessage;
  
  /**
   * The assistant's response
   */
  assistantMessage: ConversationMessage;
  
  /**
   * When this turn occurred
   */
  timestamp: number;
  
  /**
   * ID of the agent that handled this turn
   */
  agentId?: string;
  
  /**
   * Optional metadata for the turn
   */
  metadata?: Record<string, any>;
}

/**
 * Options for retrieving conversation history
 */
export interface ConversationHistoryOptions {
  /**
   * Maximum number of messages to retrieve
   */
  limit?: number;
  
  /**
   * Filter by role
   */
  role?: ParticipantRole;
  
  /**
   * Filter by agent ID
   */
  agentId?: string;
  
  /**
   * Whether to sort messages in chronological order (true) or reverse chronological order (false)
   */
  chronological?: boolean;
  
  /**
   * Only include messages after this timestamp
   */
  after?: number;
  
  /**
   * Only include messages before this timestamp
   */
  before?: number;
} 