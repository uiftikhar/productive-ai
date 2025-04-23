import { BaseAgentInterface } from '../interfaces/base-agent.interface';

/**
 * Message types for inter-agent communication
 */
export enum MessageType {
  TASK = 'task',
  RESPONSE = 'response',
  NOTIFICATION = 'notification',
  STATUS_UPDATE = 'status_update',
  QUERY = 'query',
  ERROR = 'error',
  BROADCAST = 'broadcast',
}

/**
 * Message priority levels
 */
export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3,
}

/**
 * Base message interface for agent communication
 */
export interface AgentMessage {
  id: string;
  type: MessageType;
  senderId: string;
  recipientId?: string; // If undefined, it's a broadcast message
  content: any;
  timestamp: number;
  priority: MessagePriority;
  correlationId?: string; // For tracking conversation threads
  metadata?: Record<string, any>;
}

/**
 * Task message sent to request work from another agent
 */
export interface TaskMessage extends AgentMessage {
  type: MessageType.TASK;
  content: {
    taskDescription: string;
    deadline?: number; // Timestamp when the task should be completed
    requiredCapabilities?: string[];
  };
}

/**
 * Response message containing results from a task
 */
export interface ResponseMessage extends AgentMessage {
  type: MessageType.RESPONSE;
  correlationId: string; // Must reference a TaskMessage
  content: {
    result: any;
    success: boolean;
    error?: string;
  };
}

/**
 * Status update sent by agents to inform about their progress
 */
export interface StatusUpdateMessage extends AgentMessage {
  type: MessageType.STATUS_UPDATE;
  correlationId?: string;
  content: {
    status: string;
    progress?: number; // 0-100
    estimatedCompletionTime?: number;
    details?: string;
  };
}

/**
 * Notification message for general purpose communication
 */
export interface NotificationMessage extends AgentMessage {
  type: MessageType.NOTIFICATION;
  content: {
    title: string;
    body: string;
    category?: string;
  };
}

/**
 * Query message for asking questions to other agents
 */
export interface QueryMessage extends AgentMessage {
  type: MessageType.QUERY;
  content: {
    query: string;
    context?: any;
  };
}

/**
 * Error message for reporting errors to other agents
 */
export interface ErrorMessage extends AgentMessage {
  type: MessageType.ERROR;
  correlationId?: string;
  content: {
    error: string;
    stackTrace?: string;
    context?: any;
  };
}

/**
 * Broadcast message sent to all agents
 */
export interface BroadcastMessage extends AgentMessage {
  type: MessageType.BROADCAST;
  recipientId: undefined; // Always undefined for broadcast
  content: {
    announcement: string;
    category?: string;
    importance: MessagePriority;
  };
}

/**
 * Message handler callback type
 */
export type MessageHandler = (message: AgentMessage) => Promise<void>;

/**
 * Message filter options
 */
export interface MessageFilter {
  senderIds?: string[];
  types?: MessageType[];
  priorities?: MessagePriority[];
  after?: number; // Timestamp
  before?: number; // Timestamp
  correlationId?: string;
  metadata?: Record<string, any>;
}

/**
 * Subscription options for channel listeners
 */
export interface SubscriptionOptions {
  filter?: MessageFilter;
  maxMessages?: number; // Maximum number of messages to receive
  expiresAt?: number; // Timestamp when the subscription expires
}

/**
 * Result of sending a message
 */
export interface SendResult {
  success: boolean;
  messageId: string;
  timestamp: number;
  error?: string;
}

/**
 * Communication channel interface
 */
export interface CommunicationChannel {
  id: string;
  name: string;
  description?: string;
  participants: Set<string>; // Agent IDs
  addParticipant(agentId: string): void;
  removeParticipant(agentId: string): void;
  hasParticipant(agentId: string): boolean;
  getParticipants(): string[];
}
