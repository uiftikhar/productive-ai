/**
 * Communication interfaces for the Agentic Meeting Analysis System
 */
import { EventEmitter } from 'events';
import { AgentMessage, MessageType } from './agent.interface';

/**
 * Communication channel types
 */
export enum ChannelType {
  DIRECT = 'direct',
  BROADCAST = 'broadcast',
  TOPIC = 'topic',
  SYSTEM = 'system'
}

/**
 * Communication channel definition
 */
export interface CommunicationChannel {
  id: string;
  name: string;
  type: ChannelType;
  description?: string;
  participants: string[]; // Agent IDs
  metadata?: Record<string, any>;
  created: number;
}

/**
 * Message delivery status 
 */
export enum MessageDeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

/**
 * Message delivery receipt
 */
export interface MessageDeliveryReceipt {
  messageId: string;
  recipientId: string;
  status: MessageDeliveryStatus;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Topic subscription options
 */
export interface TopicSubscriptionOptions {
  agentId: string;
  topic: string;
  priority?: number;
  filter?: (message: AgentMessage) => boolean;
  metadata?: Record<string, any>;
}

/**
 * Message priority levels
 */
export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3
}

/**
 * Message publishing options
 */
export interface MessagePublishOptions {
  priority?: MessagePriority;
  expiration?: number; // Timestamp when message expires
  deliveryTimeout?: number; // Milliseconds to wait for delivery
  requireConfirmation?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Agent communication service interface
 */
export interface ICommunicationService extends EventEmitter {
  // Core operations
  initialize(): Promise<void>;
  
  // Message operations
  sendMessage(message: AgentMessage, options?: MessagePublishOptions): Promise<string>; // Returns message ID
  broadcastMessage(message: Omit<AgentMessage, 'recipients'>, options?: MessagePublishOptions): Promise<string>;
  
  // Channel operations
  createChannel(channelDefinition: Omit<CommunicationChannel, 'id' | 'created'>): Promise<string>; // Returns channel ID
  getChannel(channelId: string): Promise<CommunicationChannel | null>;
  addParticipantToChannel(channelId: string, agentId: string): Promise<void>;
  removeParticipantFromChannel(channelId: string, agentId: string): Promise<void>;
  
  // Topic operations
  publishToTopic(topic: string, message: Omit<AgentMessage, 'recipients'>, options?: MessagePublishOptions): Promise<string>;
  subscribeToTopic(options: TopicSubscriptionOptions): Promise<void>;
  unsubscribeFromTopic(agentId: string, topic: string): Promise<void>;
  
  // Delivery management
  getMessageDeliveryStatus(messageId: string): Promise<Record<string, MessageDeliveryStatus>>;
  confirmMessageReceipt(messageId: string, agentId: string, status: MessageDeliveryStatus): Promise<void>;
  
  // Agent registration
  registerAgent(agentId: string, callback: (message: AgentMessage) => Promise<void>): Promise<void>;
  unregisterAgent(agentId: string): Promise<void>;
  
  // Message retrieval
  getMessageHistory(options: {
    agentId?: string;
    channelId?: string;
    topic?: string;
    limit?: number;
    before?: number;
    after?: number;
    types?: MessageType[];
  }): Promise<AgentMessage[]>;
  
  getUndeliveredMessages(agentId: string): Promise<AgentMessage[]>;
  
  // Utilities
  getAgentChannels(agentId: string): Promise<CommunicationChannel[]>;
  getChannelParticipants(channelId: string): Promise<string[]>;
  getTopicSubscribers(topic: string): Promise<string[]>;
  
  // Metrics
  getMetrics(): Promise<{
    messagesSent: number;
    messagesByType: Record<MessageType, number>;
    messagesByChannel: Record<string, number>;
    messagesByTopic: Record<string, number>;
    activeChannels: number;
    activeTopics: number;
    registeredAgents: number;
  }>;
} 