/**
 * Message Bus Interface for Agent Communication
 * 
 * Defines the interfaces for a message bus system that facilitates
 * communication between agents in the hierarchical multi-agent system.
 */
import { EventEmitter } from 'events';
import { AgentMessage } from './agent.interface';

/**
 * Message routing options
 */
export interface MessageRouteOptions {
  /**
   * Whether to broadcast the message to all subscribers
   */
  broadcast?: boolean;
  
  /**
   * Specific recipients for the message
   */
  recipients?: string[];
  
  /**
   * Optional message priority (higher is more important)
   */
  priority?: number;
  
  /**
   * Message delivery deadline
   */
  deadline?: Date;
  
  /**
   * Time-to-live for message persistence
   */
  ttl?: number;
  
  /**
   * Whether acknowledgment is required from recipients
   */
  requireAck?: boolean;
  
  /**
   * Whether to persist the message in storage
   */
  persist?: boolean;
  
  /**
   * Message context for routing decisions
   */
  context?: Record<string, any>;
}

/**
 * Message delivery status
 */
export enum MessageDeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  ACKNOWLEDGED = 'acknowledged',
  FAILED = 'failed',
  EXPIRED = 'expired'
}

/**
 * Message delivery receipt
 */
export interface MessageDeliveryReceipt {
  /**
   * Message ID
   */
  messageId: string;
  
  /**
   * Recipient ID
   */
  recipientId: string;
  
  /**
   * Delivery status
   */
  status: MessageDeliveryStatus;
  
  /**
   * Timestamp of delivery attempt
   */
  timestamp: Date;
  
  /**
   * Error message if delivery failed
   */
  error?: string;
  
  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Message subscription options
 */
export interface MessageSubscriptionOptions {
  /**
   * Message types to subscribe to
   */
  messageTypes?: string[];
  
  /**
   * Sender IDs to filter by
   */
  senders?: string[];
  
  /**
   * Whether to receive broadcast messages
   */
  receiveBroadcast?: boolean;
  
  /**
   * Filter function for message selection
   */
  filter?: (message: AgentMessage) => boolean;
}

/**
 * Interface for message bus implementation
 */
export interface MessageBus {
  /**
   * Subscribe to messages
   * @param agentId Agent ID to subscribe
   * @param handler Message handler callback
   * @param options Subscription options
   * @returns Subscription ID
   */
  subscribe(
    agentId: string,
    handler: (message: AgentMessage) => void | Promise<void>,
    options?: MessageSubscriptionOptions
  ): string;
  
  /**
   * Unsubscribe from messages
   * @param subscriptionId Subscription ID to unsubscribe
   */
  unsubscribe(subscriptionId: string): void;
  
  /**
   * Publish a message to the bus
   * @param message Message to publish
   * @param options Routing options
   * @returns Delivery receipts
   */
  publish(
    message: AgentMessage,
    options?: MessageRouteOptions
  ): Promise<MessageDeliveryReceipt[]>;
  
  /**
   * Get message by ID
   * @param messageId Message ID to retrieve
   */
  getMessage(messageId: string): Promise<AgentMessage | null>;
  
  /**
   * Get messages for a specific agent
   * @param agentId Agent ID to get messages for
   * @param options Filter options
   */
  getMessages(
    agentId: string,
    options?: {
      since?: Date;
      until?: Date;
      limit?: number;
      offset?: number;
      types?: string[];
      senders?: string[];
    }
  ): Promise<AgentMessage[]>;
  
  /**
   * Acknowledge receipt of a message
   * @param messageId Message ID to acknowledge
   * @param agentId Agent ID acknowledging the message
   * @param metadata Additional metadata
   */
  acknowledgeMessage(
    messageId: string,
    agentId: string,
    metadata?: Record<string, any>
  ): Promise<void>;
  
  /**
   * Clear all messages
   */
  clear(): Promise<void>;
}

/**
 * Base class for message bus implementations
 */
export abstract class BaseMessageBus extends EventEmitter implements MessageBus {
  /**
   * Subscribe to messages
   */
  public abstract subscribe(
    agentId: string,
    handler: (message: AgentMessage) => void | Promise<void>,
    options?: MessageSubscriptionOptions
  ): string;
  
  /**
   * Unsubscribe from messages
   */
  public abstract unsubscribe(subscriptionId: string): void;
  
  /**
   * Publish a message to the bus
   */
  public abstract publish(
    message: AgentMessage,
    options?: MessageRouteOptions
  ): Promise<MessageDeliveryReceipt[]>;
  
  /**
   * Get message by ID
   */
  public abstract getMessage(messageId: string): Promise<AgentMessage | null>;
  
  /**
   * Get messages for a specific agent
   */
  public abstract getMessages(
    agentId: string,
    options?: {
      since?: Date;
      until?: Date;
      limit?: number;
      offset?: number;
      types?: string[];
      senders?: string[];
    }
  ): Promise<AgentMessage[]>;
  
  /**
   * Acknowledge receipt of a message
   */
  public abstract acknowledgeMessage(
    messageId: string,
    agentId: string,
    metadata?: Record<string, any>
  ): Promise<void>;
  
  /**
   * Clear all messages
   */
  public abstract clear(): Promise<void>;
  
  /**
   * Emit message event
   */
  protected emitMessage(recipientId: string, message: AgentMessage): void {
    this.emit(`message:${recipientId}`, message);
    this.emit('message', recipientId, message);
  }
  
  /**
   * Emit delivery event
   */
  protected emitDelivery(receipt: MessageDeliveryReceipt): void {
    this.emit(`delivery:${receipt.messageId}`, receipt);
    this.emit(`delivery:${receipt.recipientId}`, receipt);
    this.emit('delivery', receipt);
  }
  
  /**
   * Emit acknowledge event
   */
  protected emitAcknowledge(messageId: string, agentId: string, metadata?: Record<string, any>): void {
    this.emit(`ack:${messageId}`, agentId, metadata);
    this.emit(`ack:${agentId}`, messageId, metadata);
    this.emit('ack', messageId, agentId, metadata);
  }
} 