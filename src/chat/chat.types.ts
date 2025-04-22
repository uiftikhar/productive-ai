/**
 * Chat Service Type Definitions
 * 
 * Contains all interfaces and types used in the chat module
 */

/**
 * Represents a chat session between a user and the AI
 */
export interface ChatSession {
  sessionId: string;
  userId: string;
  conversationId: string;
  createdAt: Date;
  lastActive: Date;
  agentId?: string;
  metadata?: Record<string, any>;
}

/**
 * Represents a single message in a chat conversation
 */
export interface ChatMessage {
  id: string;
  sessionId: string;
  content: string;
  role: "user" | "assistant" | "system";
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Options for retrieving chat history
 */
export interface HistoryOptions {
  limit?: number;
  beforeTimestamp?: Date;
  afterTimestamp?: Date;
  includeMetadata?: boolean;
}

/**
 * Request to create a new chat session
 */
export interface CreateSessionRequest {
  userId: string;
  conversationId?: string;
  agentId?: string;
  metadata?: Record<string, any>;
}

/**
 * Request to send a new message
 */
export interface SendMessageRequest {
  sessionId: string;
  content: string;
  metadata?: Record<string, any>;
}

/**
 * Response from the message generation process
 */
export interface MessageGenerationResult {
  message: ChatMessage;
  agentsInvolved?: string[];
  primaryAgent?: string;
  executionTimeMs?: number;
  tokenCount?: number;
  segmentInfo?: {
    isNewSegment: boolean;
    segmentTitle?: string;
    segmentSummary?: string;
  };
}

/**
 * Error types specific to the chat service
 */
export enum ChatErrorType {
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  INVALID_REQUEST = 'INVALID_REQUEST',
  GENERATION_FAILED = 'GENERATION_FAILED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}

/**
 * Structured error for chat service
 */
export class ChatServiceError extends Error {
  type: ChatErrorType;
  details?: Record<string, any>;

  constructor(message: string, type: ChatErrorType, details?: Record<string, any>) {
    super(message);
    this.name = 'ChatServiceError';
    this.type = type;
    this.details = details;
  }
}

/**
 * Options for StreamHandler when streaming responses
 */
export interface StreamOptions {
  onToken: (token: string) => void;
  onComplete: (fullMessage: ChatMessage) => void;
  onError: (error: Error) => void;
} 