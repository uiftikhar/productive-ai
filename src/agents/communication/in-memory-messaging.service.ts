import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { MessagingService } from './messaging-service.interface';
import {
  AgentMessage,
  CommunicationChannel,
  MessageFilter,
  MessageHandler,
  MessagePriority,
  SendResult,
  SubscriptionOptions,
} from './types';

/**
 * Implementation of the channel interface
 */
class Channel implements CommunicationChannel {
  public id: string;
  public participants: Set<string> = new Set();

  constructor(
    public name: string,
    public description?: string,
  ) {
    this.id = `channel-${uuidv4()}`;
  }

  addParticipant(agentId: string): void {
    this.participants.add(agentId);
  }

  removeParticipant(agentId: string): void {
    this.participants.delete(agentId);
  }

  hasParticipant(agentId: string): boolean {
    return this.participants.has(agentId);
  }

  getParticipants(): string[] {
    return Array.from(this.participants);
  }
}

/**
 * Subscription model for messaging
 */
interface Subscription {
  id: string;
  agentId: string;
  handler: MessageHandler;
  options?: SubscriptionOptions;
  channelId?: string;
}

/**
 * In-memory implementation of the messaging service
 * Useful for testing and development, can be replaced with a persistent
 * implementation for production use
 */
export class InMemoryMessagingService implements MessagingService {
  private static instance: InMemoryMessagingService;
  private messages: AgentMessage[] = [];
  private channels: Map<string, Channel> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private logger: Logger;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
    this.logger.info('Initializing InMemoryMessagingService');

    // Create a default broadcast channel
    this.createDefaultChannel();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(logger?: Logger): InMemoryMessagingService {
    if (!InMemoryMessagingService.instance) {
      InMemoryMessagingService.instance = new InMemoryMessagingService(logger);
    }
    return InMemoryMessagingService.instance;
  }

  /**
   * Create a default broadcast channel
   */
  private createDefaultChannel(): void {
    const broadcastChannel = new Channel(
      'broadcast',
      'Default channel for broadcasting messages to all agents',
    );
    this.channels.set(broadcastChannel.id, broadcastChannel);
    this.logger.debug(`Created default broadcast channel: ${broadcastChannel.id}`);
  }

  /**
   * Send a message from one agent to another
   */
  async sendMessage(message: AgentMessage): Promise<SendResult> {
    try {
      // Ensure message has required fields
      const finalMessage: AgentMessage = {
        ...message,
        id: message.id || uuidv4(),
        timestamp: message.timestamp || Date.now(),
        priority: message.priority ?? MessagePriority.NORMAL,
      };

      // Store the message
      this.messages.push(finalMessage);

      // Check if any subscribers should receive this message
      this.notifySubscribers(finalMessage);

      this.logger.debug(`Message sent: ${finalMessage.id}`, {
        sender: finalMessage.senderId,
        recipient: finalMessage.recipientId,
        type: finalMessage.type,
      });

      return {
        success: true,
        messageId: finalMessage.id,
        timestamp: finalMessage.timestamp,
      };
    } catch (error) {
      this.logger.error('Error sending message', { error });
      return {
        success: false,
        messageId: message.id || uuidv4(),
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send a message to multiple recipients
   */
  async broadcastMessage(
    message: Omit<AgentMessage, 'recipientId'>,
    recipientIds: string[],
  ): Promise<SendResult[]> {
    const results: SendResult[] = [];

    for (const recipientId of recipientIds) {
      const result = await this.sendMessage({
        ...message,
        recipientId,
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Subscribe to messages matching the filter
   */
  subscribeToMessages(
    agentId: string,
    handler: MessageHandler,
    options?: SubscriptionOptions,
  ): string {
    const subscriptionId = `sub-${uuidv4()}`;
    
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      agentId,
      handler,
      options,
    });

    this.logger.debug(`Agent ${agentId} subscribed to messages: ${subscriptionId}`);
    return subscriptionId;
  }

  /**
   * Cancel a message subscription
   */
  unsubscribe(subscriptionId: string): boolean {
    const removed = this.subscriptions.delete(subscriptionId);
    if (removed) {
      this.logger.debug(`Unsubscribed: ${subscriptionId}`);
    }
    return removed;
  }

  /**
   * Query messages based on filter criteria
   */
  async queryMessages(filter: MessageFilter): Promise<AgentMessage[]> {
    return this.messages.filter((message) => this.matchesFilter(message, filter));
  }

  /**
   * Create a new communication channel
   */
  async createChannel(
    name: string,
    description?: string,
    participantIds?: string[],
  ): Promise<CommunicationChannel> {
    const channel = new Channel(name, description);
    
    // Add initial participants if provided
    if (participantIds) {
      for (const agentId of participantIds) {
        channel.addParticipant(agentId);
      }
    }

    this.channels.set(channel.id, channel);
    this.logger.debug(`Created channel: ${channel.id}`, { name });
    
    return channel;
  }

  /**
   * Get a channel by ID
   */
  getChannel(channelId: string): CommunicationChannel | undefined {
    return this.channels.get(channelId);
  }

  /**
   * List all channels
   */
  listChannels(): CommunicationChannel[] {
    return Array.from(this.channels.values());
  }

  /**
   * Send a message to a specific channel
   */
  async sendToChannel(
    channelId: string,
    message: Omit<AgentMessage, 'recipientId'>,
  ): Promise<SendResult[]> {
    const channel = this.channels.get(channelId);
    
    if (!channel) {
      const error = `Channel not found: ${channelId}`;
      this.logger.error(error);
      return [{
        success: false,
        messageId: uuidv4(),
        timestamp: Date.now(),
        error,
      }];
    }

    // Send to all participants
    return this.broadcastMessage(message, channel.getParticipants());
  }

  /**
   * Subscribe to messages in a specific channel
   */
  subscribeToChannel(
    agentId: string,
    channelId: string,
    handler: MessageHandler,
    options?: SubscriptionOptions,
  ): string {
    const channel = this.channels.get(channelId);
    
    if (!channel) {
      this.logger.error(`Channel not found: ${channelId}`);
      throw new Error(`Channel not found: ${channelId}`);
    }

    // Add agent to channel participants if not already there
    if (!channel.hasParticipant(agentId)) {
      channel.addParticipant(agentId);
    }

    const subscriptionId = `ch-sub-${uuidv4()}`;
    
    this.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      agentId,
      handler,
      options,
      channelId,
    });

    this.logger.debug(
      `Agent ${agentId} subscribed to channel ${channelId}: ${subscriptionId}`,
    );
    
    return subscriptionId;
  }

  /**
   * Get all active subscriptions for an agent
   */
  getAgentSubscriptions(agentId: string): string[] {
    return Array.from(this.subscriptions.entries())
      .filter(([_, subscription]) => subscription.agentId === agentId)
      .map(([id, _]) => id);
  }

  /**
   * Clear all messages for an agent or a specific sender-recipient pair
   */
  async clearMessages(agentId: string, senderId?: string): Promise<number> {
    const initialCount = this.messages.length;
    
    this.messages = this.messages.filter((message) => {
      // Keep messages that don't involve this agent
      if (message.senderId !== agentId && message.recipientId !== agentId) {
        return true;
      }

      // If senderId is specified, only remove messages from that sender to this agent
      if (senderId && message.senderId !== senderId) {
        return true;
      }

      // Remove the message
      return false;
    });

    const removedCount = initialCount - this.messages.length;
    this.logger.debug(`Cleared ${removedCount} messages for agent ${agentId}`);
    
    return removedCount;
  }

  /**
   * Notify subscribers of a new message
   */
  private async notifySubscribers(message: AgentMessage): Promise<void> {
    for (const [id, subscription] of this.subscriptions.entries()) {
      try {
        // Check if subscription should receive this message
        if (this.shouldReceiveMessage(subscription, message)) {
          await subscription.handler(message);
        }
      } catch (error) {
        this.logger.error(`Error in subscription handler ${id}`, { error });
      }
    }
  }

  /**
   * Determine if a subscription should receive a message
   */
  private shouldReceiveMessage(
    subscription: Subscription,
    message: AgentMessage,
  ): boolean {
    // Always check that the recipient matches or it's a broadcast
    if (
      message.recipientId !== subscription.agentId &&
      message.recipientId !== undefined
    ) {
      return false;
    }

    // If it's a channel subscription, check if the message is for this channel
    if (subscription.channelId) {
      const channel = this.channels.get(subscription.channelId);
      if (!channel) return false;

      // For channel subscriptions, both the sender and recipient must be participants
      if (
        !channel.hasParticipant(message.senderId) ||
        (message.recipientId && !channel.hasParticipant(message.recipientId))
      ) {
        return false;
      }
    }

    // Apply additional filters from subscription options
    if (subscription.options?.filter) {
      return this.matchesFilter(message, subscription.options.filter);
    }

    return true;
  }

  /**
   * Check if a message matches a filter
   */
  private matchesFilter(message: AgentMessage, filter: MessageFilter): boolean {
    // Check sender IDs filter
    if (filter.senderIds && filter.senderIds.length > 0) {
      if (!filter.senderIds.includes(message.senderId)) {
        return false;
      }
    }

    // Check message types filter
    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(message.type)) {
        return false;
      }
    }

    // Check priority filter
    if (filter.priorities && filter.priorities.length > 0) {
      if (!filter.priorities.includes(message.priority)) {
        return false;
      }
    }

    // Check timestamp range
    if (filter.after && message.timestamp < filter.after) {
      return false;
    }

    if (filter.before && message.timestamp > filter.before) {
      return false;
    }

    // Check correlation ID
    if (filter.correlationId && message.correlationId !== filter.correlationId) {
      return false;
    }

    // Check metadata
    if (filter.metadata) {
      // If message has no metadata, it can't match
      if (!message.metadata) {
        return false;
      }

      // Check if all filter metadata keys are present in message metadata with matching values
      for (const [key, value] of Object.entries(filter.metadata)) {
        if (message.metadata[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }
} 