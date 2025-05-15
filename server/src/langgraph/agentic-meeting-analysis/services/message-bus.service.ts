/**
 * Message Bus Service
 * 
 * Implements the message bus interface for agent communication
 * in the hierarchical multi-agent system.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { AgentMessage, MessageType } from '../interfaces/agent.interface';
import {
  BaseMessageBus,
  MessageBus,
  MessageDeliveryReceipt,
  MessageDeliveryStatus,
  MessageRouteOptions,
  MessageSubscriptionOptions
} from '../interfaces/message-bus.interface';

/**
 * Subscription information
 */
interface Subscription {
  id: string;
  agentId: string;
  handler: (message: AgentMessage) => void | Promise<void>;
  options: MessageSubscriptionOptions;
}

/**
 * In-memory implementation of the message bus
 */
export class InMemoryMessageBus extends BaseMessageBus implements MessageBus {
  private messages: Map<string, AgentMessage> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private agentSubscriptions: Map<string, Set<string>> = new Map();
  private receipts: Map<string, MessageDeliveryReceipt[]> = new Map();
  private logger: Logger;
  
  /**
   * Create a new in-memory message bus
   */
  constructor(options: { logger?: Logger } = {}) {
    super();
    this.logger = options.logger || new ConsoleLogger();
  }
  
  /**
   * Subscribe to messages
   */
  public subscribe(
    agentId: string,
    handler: (message: AgentMessage) => void | Promise<void>,
    options: MessageSubscriptionOptions = {}
  ): string {
    const subscriptionId = `sub-${uuidv4()}`;
    
    // Store subscription
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      agentId,
      handler,
      options: {
        messageTypes: options.messageTypes || [],
        senders: options.senders || [],
        receiveBroadcast: options.receiveBroadcast ?? true,
        filter: options.filter
      }
    });
    
    // Track agent subscriptions
    if (!this.agentSubscriptions.has(agentId)) {
      this.agentSubscriptions.set(agentId, new Set());
    }
    this.agentSubscriptions.get(agentId)?.add(subscriptionId);
    
    this.logger.debug(`Agent ${agentId} subscribed to messages`, {
      subscriptionId,
      options
    });
    
    return subscriptionId;
  }
  
  /**
   * Unsubscribe from messages
   */
  public unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    
    if (subscription) {
      // Remove from agent subscriptions
      const agentSubs = this.agentSubscriptions.get(subscription.agentId);
      if (agentSubs) {
        agentSubs.delete(subscriptionId);
        
        if (agentSubs.size === 0) {
          this.agentSubscriptions.delete(subscription.agentId);
        }
      }
      
      // Remove subscription
      this.subscriptions.delete(subscriptionId);
      
      this.logger.debug(`Unsubscribed from messages`, {
        subscriptionId,
        agentId: subscription.agentId
      });
    }
  }
  
  /**
   * Publish a message to the bus
   */
  public async publish(
    message: AgentMessage,
    options: MessageRouteOptions = {}
  ): Promise<MessageDeliveryReceipt[]> {
    // Store the message
    this.messages.set(message.id, message);
    
    const deliveryReceipts: MessageDeliveryReceipt[] = [];
    const isBroadcast = options.broadcast || message.recipients.includes('broadcast');
    
    // Create a set of recipient IDs
    const recipients = new Set<string>();
    
    // Add specific recipients from message
    if (!isBroadcast && Array.isArray(message.recipients)) {
      message.recipients.forEach(id => recipients.add(id));
    }
    
    // Add recipients from options
    if (options.recipients) {
      options.recipients.forEach(id => recipients.add(id));
    }
    
    // Send to all relevant subscribers
    for (const subscription of this.subscriptions.values()) {
      const { agentId, handler, options: subOptions } = subscription;
      
      // Skip if sender is also the recipient
      if (message.sender === agentId) {
        continue;
      }
      
      // Determine if this subscriber should receive the message
      let shouldReceiveByRecipient = false;
      
      // Check if this is a broadcast message and subscriber accepts broadcasts
      if (isBroadcast && subOptions.receiveBroadcast === true) {
        shouldReceiveByRecipient = true;
      }
      
      // Check if this is a specific recipient
      if (recipients.has(agentId)) {
        shouldReceiveByRecipient = true;
      }
      
      // Apply message type filter
      const messageTypeFilter = subOptions.messageTypes || [];
      const passesTypeFilter = messageTypeFilter.length === 0 || 
        messageTypeFilter.includes(message.type);
      
      // Apply sender filter
      const senderFilter = subOptions.senders || [];
      const passesSenderFilter = senderFilter.length === 0 || 
        senderFilter.includes(message.sender);
      
      // Apply custom filter if provided
      const passesCustomFilter = !subOptions.filter || subOptions.filter(message);
      
      // Final determination if subscriber should receive message
      const shouldReceive = shouldReceiveByRecipient && 
        passesTypeFilter && 
        passesSenderFilter && 
        passesCustomFilter;
      
      if (shouldReceive) {
        try {
          // Deliver the message
          await handler(message);
          
          // Create receipt
          const receipt: MessageDeliveryReceipt = {
            messageId: message.id,
            recipientId: agentId,
            status: MessageDeliveryStatus.DELIVERED,
            timestamp: new Date()
          };
          
          deliveryReceipts.push(receipt);
          this.storeReceipt(receipt);
          this.emitDelivery(receipt);
          
          this.logger.debug(`Delivered message ${message.id} to agent ${agentId}`);
        } catch (error) {
          // Create failed receipt
          const receipt: MessageDeliveryReceipt = {
            messageId: message.id,
            recipientId: agentId,
            status: MessageDeliveryStatus.FAILED,
            timestamp: new Date(),
            error: error instanceof Error ? error.message : String(error)
          };
          
          deliveryReceipts.push(receipt);
          this.storeReceipt(receipt);
          this.emitDelivery(receipt);
          
          this.logger.error(`Failed to deliver message ${message.id} to agent ${agentId}`, {
            error
          });
        }
      }
    }
    
    return deliveryReceipts;
  }
  
  /**
   * Get message by ID
   */
  public async getMessage(messageId: string): Promise<AgentMessage | null> {
    return this.messages.get(messageId) || null;
  }
  
  /**
   * Get messages for a specific agent
   */
  public async getMessages(
    agentId: string,
    options: {
      since?: Date;
      until?: Date;
      limit?: number;
      offset?: number;
      types?: string[];
      senders?: string[];
    } = {}
  ): Promise<AgentMessage[]> {
    const { 
      since, 
      until, 
      limit = 100, 
      offset = 0, 
      types = [], 
      senders = [] 
    } = options;
    
    // Filter messages for this agent
    const filtered = Array.from(this.messages.values())
      .filter(message => {
        // Message is addressed to this agent or is a broadcast
        const isRecipient = Array.isArray(message.recipients) && 
          (message.recipients.includes(agentId) || message.recipients.includes('broadcast'));
        
        // Check time filters
        const timestamp = message.timestamp;
        const afterSince = !since || timestamp >= since.getTime();
        const beforeUntil = !until || timestamp <= until.getTime();
        
        // Check type filter
        const matchesType = types.length === 0 || types.includes(message.type);
        
        // Check sender filter
        const matchesSender = senders.length === 0 || senders.includes(message.sender);
        
        return isRecipient && afterSince && beforeUntil && matchesType && matchesSender;
      })
      // Sort by timestamp (newest first)
      .sort((a, b) => b.timestamp - a.timestamp)
      // Apply offset and limit
      .slice(offset, offset + limit);
      
    return filtered;
  }
  
  /**
   * Acknowledge receipt of a message
   */
  public async acknowledgeMessage(
    messageId: string,
    agentId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    // Find existing receipt
    const allReceipts = this.receipts.get(messageId) || [];
    const existingReceiptIndex = allReceipts.findIndex(
      r => r.recipientId === agentId && 
          (r.status === MessageDeliveryStatus.DELIVERED || r.status === MessageDeliveryStatus.PENDING)
    );
    
    if (existingReceiptIndex >= 0) {
      // Update receipt
      const updatedReceipt: MessageDeliveryReceipt = {
        ...allReceipts[existingReceiptIndex],
        status: MessageDeliveryStatus.ACKNOWLEDGED,
        timestamp: new Date(),
        metadata: {
          ...allReceipts[existingReceiptIndex].metadata,
          ...metadata
        }
      };
      
      allReceipts[existingReceiptIndex] = updatedReceipt;
      this.receipts.set(messageId, allReceipts);
      
      // Emit acknowledge event
      this.emitAcknowledge(messageId, agentId, metadata);
      
      this.logger.debug(`Message ${messageId} acknowledged by agent ${agentId}`);
    } else {
      // Create new receipt
      const receipt: MessageDeliveryReceipt = {
        messageId,
        recipientId: agentId,
        status: MessageDeliveryStatus.ACKNOWLEDGED,
        timestamp: new Date(),
        metadata
      };
      
      this.storeReceipt(receipt);
      this.emitAcknowledge(messageId, agentId, metadata);
      
      this.logger.debug(`Message ${messageId} acknowledged by agent ${agentId} (no prior receipt)`);
    }
  }
  
  /**
   * Clear all messages
   */
  public async clear(): Promise<void> {
    this.messages.clear();
    this.receipts.clear();
    this.logger.info('Cleared all messages from bus');
  }
  
  /**
   * Store a delivery receipt
   */
  private storeReceipt(receipt: MessageDeliveryReceipt): void {
    const messageReceipts = this.receipts.get(receipt.messageId) || [];
    messageReceipts.push(receipt);
    this.receipts.set(receipt.messageId, messageReceipts);
  }
  
  /**
   * Get all receipts for a message
   */
  public getReceipts(messageId: string): MessageDeliveryReceipt[] {
    return this.receipts.get(messageId) || [];
  }
  
  /**
   * Unsubscribe all agent subscriptions
   */
  public unsubscribeAgent(agentId: string): void {
    const subscriptionIds = this.agentSubscriptions.get(agentId);
    
    if (subscriptionIds) {
      for (const subId of subscriptionIds) {
        this.subscriptions.delete(subId);
      }
      
      this.agentSubscriptions.delete(agentId);
      this.logger.debug(`Unsubscribed all subscriptions for agent ${agentId}`);
    }
  }
} 