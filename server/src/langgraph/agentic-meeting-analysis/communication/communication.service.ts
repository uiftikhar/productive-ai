/**
 * Communication service implementation for the Agentic Meeting Analysis System
 */
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  ICommunicationService,
  CommunicationChannel,
  ChannelType,
  MessageDeliveryStatus,
  MessageDeliveryReceipt,
  TopicSubscriptionOptions,
  MessagePriority,
  MessagePublishOptions,
} from '../interfaces/communication.interface';
import { AgentMessage, MessageType } from '../interfaces/agent.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * Configuration options for CommunicationService
 */
export interface CommunicationServiceConfig {
  logger?: Logger;
  deliveryTimeout?: number;
  retainMessageHistory?: boolean;
  maxMessageHistory?: number;
}

/**
 * Implementation of agent communication service
 */
export class CommunicationService
  extends EventEmitter
  implements ICommunicationService
{
  private channels: Map<string, CommunicationChannel> = new Map();
  private messageHistory: AgentMessage[] = [];
  private pendingMessages: Map<
    string,
    {
      message: AgentMessage;
      options?: MessagePublishOptions;
      deliveryStatus: Record<string, MessageDeliveryStatus>;
      expiresAt?: number;
    }
  > = new Map();

  private agentCallbacks: Map<
    string,
    (message: AgentMessage) => Promise<void>
  > = new Map();
  private topicSubscriptions: Map<string, TopicSubscriptionOptions[]> =
    new Map();

  private logger: Logger;
  private deliveryTimeout: number;
  private retainMessageHistory: boolean;
  private maxMessageHistory: number;
  private messageProcessingInterval?: NodeJS.Timeout;

  /**
   * Create a new communication service
   */
  constructor(config: CommunicationServiceConfig = {}) {
    super();

    this.logger = config.logger || new ConsoleLogger();
    this.deliveryTimeout = config.deliveryTimeout || 30000; // Default 30 seconds
    this.retainMessageHistory = config.retainMessageHistory || true;
    this.maxMessageHistory = config.maxMessageHistory || 1000;

    this.logger.info('Initialized CommunicationService');
  }

  /**
   * Initialize the communication service
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing communication service');

    // Create the default system channel
    await this.createChannel({
      name: 'System',
      type: ChannelType.SYSTEM,
      description: 'System-wide announcements and notifications',
      participants: [],
    });

    // Create the default broadcast channel
    await this.createChannel({
      name: 'Broadcast',
      type: ChannelType.BROADCAST,
      description: 'Broadcast messages to all agents',
      participants: [],
    });

    // Start background processing
    this.messageProcessingInterval = setInterval(() => this.processExpiredMessages(), 5000);

    this.logger.info('Communication service initialized');
  }

  /**
   * Send a message to specific agents
   */
  async sendMessage(
    message: AgentMessage,
    options?: MessagePublishOptions,
  ): Promise<string> {
    this.logger.debug(
      `Sending message ${message.id} from ${message.sender} to ${Array.isArray(message.recipients) ? message.recipients.join(', ') : message.recipients}`,
    );

    // Ensure message has an ID
    if (!message.id) {
      message.id = `msg-${uuidv4()}`;
    }

    // Ensure message has a timestamp
    if (!message.timestamp) {
      message.timestamp = Date.now();
    }

    // Initialize delivery status tracking
    const deliveryStatus: Record<string, MessageDeliveryStatus> = {};

    if (message.recipients === 'broadcast') {
      // For broadcast, we'll deliver to all registered agents
      const agents = Array.from(this.agentCallbacks.keys());

      for (const agentId of agents) {
        if (agentId !== message.sender) {
          // Don't deliver to self
          deliveryStatus[agentId] = MessageDeliveryStatus.PENDING;
        }
      }
    } else if (Array.isArray(message.recipients)) {
      // For specific recipients
      for (const recipientId of message.recipients) {
        deliveryStatus[recipientId] = MessageDeliveryStatus.PENDING;
      }
    }

    // Calculate expiration if needed
    let expiresAt: number | undefined = undefined;
    if (options?.expiration) {
      expiresAt = options.expiration;
    } else if (options?.deliveryTimeout) {
      expiresAt = Date.now() + options.deliveryTimeout;
    } else if (options?.priority === MessagePriority.URGENT) {
      expiresAt = Date.now() + this.deliveryTimeout / 2; // Shorter timeout for urgent messages
    } else {
      expiresAt = Date.now() + this.deliveryTimeout;
    }

    // Store in pending messages
    this.pendingMessages.set(message.id, {
      message,
      options,
      deliveryStatus,
      expiresAt,
    });

    // Add to message history if enabled
    if (this.retainMessageHistory) {
      this.messageHistory.push(message);

      // Trim history if needed
      if (this.messageHistory.length > this.maxMessageHistory) {
        this.messageHistory = this.messageHistory.slice(
          -this.maxMessageHistory,
        );
      }
    }

    // Attempt immediate delivery
    await this.deliverMessage(message);

    return message.id;
  }

  /**
   * Broadcast a message to all agents
   */
  async broadcastMessage(
    message: Omit<AgentMessage, 'recipients'>,
    options?: MessagePublishOptions,
  ): Promise<string> {
    const fullMessage: AgentMessage = {
      ...message,
      recipients: 'broadcast',
    };

    return this.sendMessage(fullMessage, options);
  }

  /**
   * Create a new communication channel
   */
  async createChannel(
    channelDefinition: Omit<CommunicationChannel, 'id' | 'created'>,
  ): Promise<string> {
    const id = `channel-${uuidv4()}`;

    const channel: CommunicationChannel = {
      id,
      ...channelDefinition,
      created: Date.now(),
    };

    this.channels.set(id, channel);

    this.logger.info(`Created communication channel: ${channel.name} (${id})`);

    return id;
  }

  /**
   * Get a channel by ID
   */
  async getChannel(channelId: string): Promise<CommunicationChannel | null> {
    return this.channels.get(channelId) || null;
  }

  /**
   * Add a participant to a channel
   */
  async addParticipantToChannel(
    channelId: string,
    agentId: string,
  ): Promise<void> {
    const channel = this.channels.get(channelId);

    if (!channel) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    if (!channel.participants.includes(agentId)) {
      channel.participants.push(agentId);
      this.logger.debug(`Added agent ${agentId} to channel ${channel.name}`);
    }
  }

  /**
   * Remove a participant from a channel
   */
  async removeParticipantFromChannel(
    channelId: string,
    agentId: string,
  ): Promise<void> {
    const channel = this.channels.get(channelId);

    if (!channel) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    channel.participants = channel.participants.filter((id) => id !== agentId);
    this.logger.debug(`Removed agent ${agentId} from channel ${channel.name}`);
  }

  /**
   * Publish a message to a topic
   */
  async publishToTopic(
    topic: string,
    message: Omit<AgentMessage, 'recipients'>,
    options?: MessagePublishOptions,
  ): Promise<string> {
    this.logger.debug(`Publishing message to topic: ${topic}`);

    // Get all subscribers to this topic
    const subscribers = await this.getTopicSubscribers(topic);

    if (subscribers.length === 0) {
      this.logger.debug(`No subscribers for topic: ${topic}`);
      return `msg-${uuidv4()}`; // Return a dummy ID since no one is listening
    }

    // Create full message with recipients
    const fullMessage: AgentMessage = {
      ...message,
      recipients: subscribers,
      metadata: {
        ...(message.metadata || {}),
        topic,
      },
    };

    return this.sendMessage(fullMessage, options);
  }

  /**
   * Subscribe to a topic
   */
  async subscribeToTopic(options: TopicSubscriptionOptions): Promise<void> {
    this.logger.debug(
      `Agent ${options.agentId} subscribing to topic: ${options.topic}`,
    );

    if (!this.topicSubscriptions.has(options.topic)) {
      this.topicSubscriptions.set(options.topic, []);
    }

    const subscriptions = this.topicSubscriptions.get(options.topic) || [];

    // Remove any existing subscription for this agent to this topic
    const filteredSubscriptions = subscriptions.filter(
      (sub) => sub.agentId !== options.agentId,
    );

    // Add the new subscription
    filteredSubscriptions.push(options);

    // Sort by priority if specified
    filteredSubscriptions.sort((a, b) => {
      const priorityA = a.priority ?? 0;
      const priorityB = b.priority ?? 0;
      return priorityB - priorityA; // Higher priority first
    });

    this.topicSubscriptions.set(options.topic, filteredSubscriptions);
  }

  /**
   * Unsubscribe from a topic
   */
  async unsubscribeFromTopic(agentId: string, topic: string): Promise<void> {
    this.logger.debug(`Agent ${agentId} unsubscribing from topic: ${topic}`);

    if (!this.topicSubscriptions.has(topic)) {
      return;
    }

    const subscriptions = this.topicSubscriptions.get(topic) || [];
    const filteredSubscriptions = subscriptions.filter(
      (sub) => sub.agentId !== agentId,
    );

    if (filteredSubscriptions.length === 0) {
      this.topicSubscriptions.delete(topic);
    } else {
      this.topicSubscriptions.set(topic, filteredSubscriptions);
    }
  }

  /**
   * Get message delivery status
   */
  async getMessageDeliveryStatus(
    messageId: string,
  ): Promise<Record<string, MessageDeliveryStatus>> {
    const pendingMessage = this.pendingMessages.get(messageId);

    if (!pendingMessage) {
      throw new Error(`Message not found: ${messageId}`);
    }

    return pendingMessage.deliveryStatus;
  }

  /**
   * Confirm message receipt
   */
  async confirmMessageReceipt(
    messageId: string,
    agentId: string,
    status: MessageDeliveryStatus,
  ): Promise<void> {
    this.logger.debug(
      `Confirming message ${messageId} receipt by agent ${agentId} with status: ${status}`,
    );

    const pendingMessage = this.pendingMessages.get(messageId);

    if (!pendingMessage) {
      this.logger.warn(
        `Cannot confirm receipt: message ${messageId} not found in pending messages`,
      );
      return;
    }

    if (pendingMessage.deliveryStatus[agentId]) {
      pendingMessage.deliveryStatus[agentId] = status;

      // If all recipients have received the message, we can remove it from pending
      const allDelivered = Object.values(pendingMessage.deliveryStatus).every(
        (s) =>
          s === MessageDeliveryStatus.DELIVERED ||
          s === MessageDeliveryStatus.READ,
      );

      if (allDelivered && !pendingMessage.options?.requireConfirmation) {
        this.pendingMessages.delete(messageId);
      }
    }
  }

  /**
   * Register an agent to receive messages
   */
  async registerAgent(
    agentId: string,
    callback: (message: AgentMessage) => Promise<void>,
  ): Promise<void> {
    this.logger.info(`Registering agent: ${agentId}`);

    this.agentCallbacks.set(agentId, callback);

    // Check for any pending messages for this agent
    for (const [messageId, pendingMessage] of this.pendingMessages.entries()) {
      const { message, deliveryStatus } = pendingMessage;

      // If this agent is a recipient and message is still pending
      if (deliveryStatus[agentId] === MessageDeliveryStatus.PENDING) {
        try {
          // Message is for a specific agent
          if (
            Array.isArray(message.recipients) &&
            message.recipients.includes(agentId)
          ) {
            await callback(message);
            deliveryStatus[agentId] = MessageDeliveryStatus.DELIVERED;
          }
          // Message is a broadcast
          else if (
            message.recipients === 'broadcast' &&
            message.sender !== agentId
          ) {
            await callback(message);
            deliveryStatus[agentId] = MessageDeliveryStatus.DELIVERED;
          }
        } catch (error) {
          this.logger.error(
            `Error delivering pending message ${messageId} to agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`,
          );
          deliveryStatus[agentId] = MessageDeliveryStatus.FAILED;
        }
      }
    }
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    this.logger.info(`Unregistering agent: ${agentId}`);

    this.agentCallbacks.delete(agentId);

    // Remove from all topic subscriptions
    for (const [topic, subscriptions] of this.topicSubscriptions.entries()) {
      const filteredSubscriptions = subscriptions.filter(
        (sub) => sub.agentId !== agentId,
      );

      if (filteredSubscriptions.length === 0) {
        this.topicSubscriptions.delete(topic);
      } else {
        this.topicSubscriptions.set(topic, filteredSubscriptions);
      }
    }

    // Remove from all channels
    for (const channel of this.channels.values()) {
      channel.participants = channel.participants.filter(
        (id) => id !== agentId,
      );
    }

    // Update pending message delivery status
    for (const pendingMessage of this.pendingMessages.values()) {
      if (pendingMessage.deliveryStatus[agentId]) {
        pendingMessage.deliveryStatus[agentId] = MessageDeliveryStatus.FAILED;
      }
    }
  }

  /**
   * Get message history with filtering options
   * @param options Options object with filtering criteria or an agent ID string
   */
  async getMessageHistory(
    options: string | {
      agentId?: string;
      channelId?: string;
      topic?: string;
      limit?: number;
      before?: number;
      after?: number;
      types?: MessageType[];
    }
  ): Promise<AgentMessage[]> {
    // If options is a string, treat it as agentId for backward compatibility
    const isAgentIdString = typeof options === 'string';
    
    if (isAgentIdString) {
      this.logger.debug(`Getting message history for agent ${options}`);
      
      // Filter messages for this agent (sent or received)
      let messages = this.messageHistory.filter(
        (msg) =>
          msg.sender === options ||
          (Array.isArray(msg.recipients) && msg.recipients.includes(options)) ||
          msg.recipients === 'broadcast',
      );
      
      // Sort messages by timestamp to ensure chronological order (oldest first)
      messages.sort((a, b) => a.timestamp - b.timestamp);
      
      return messages;
    }
    
    // Normal options object processing
    if (!this.retainMessageHistory) {
      this.logger.warn('Message history retention is disabled');
      return [];
    }

    let messages = [...this.messageHistory];

    // Apply filtering options
    if (options.agentId) {
      messages = messages.filter(
        (msg) =>
          msg.sender === options.agentId ||
          (Array.isArray(msg.recipients) &&
            msg.recipients.includes(options.agentId!)) ||
          msg.recipients === 'broadcast',
      );
    }

    if (options.channelId) {
      const channel = this.channels.get(options.channelId);
      if (channel) {
        messages = messages.filter((msg) => {
          if (Array.isArray(msg.recipients)) {
            // Check if all recipients are in the channel
            return (
              msg.recipients.every((r) => channel.participants.includes(r)) &&
              channel.participants.includes(msg.sender)
            );
          }
          return false;
        });
      }
    }

    if (options.topic) {
      messages = messages.filter(
        (msg) => msg.metadata?.topic === options.topic,
      );
    }

    if (options.before) {
      messages = messages.filter((msg) => msg.timestamp < options.before!);
    }

    if (options.after) {
      messages = messages.filter((msg) => msg.timestamp > options.after!);
    }

    if (options.types && options.types.length > 0) {
      messages = messages.filter((msg) => options.types!.includes(msg.type));
    }

    // Sort by timestamp chronologically (oldest to newest)
    messages.sort((a, b) => a.timestamp - b.timestamp);

    // Apply limit
    if (options.limit && options.limit > 0) {
      messages = messages.slice(0, options.limit);
    }

    return messages;
  }

  /**
   * Get undelivered messages for an agent
   */
  async getUndeliveredMessages(agentId: string): Promise<AgentMessage[]> {
    const undelivered: AgentMessage[] = [];

    for (const pendingMessage of this.pendingMessages.values()) {
      const { message, deliveryStatus } = pendingMessage;

      // Check if this agent is a recipient and message is pending or failed
      if (
        (deliveryStatus[agentId] === MessageDeliveryStatus.PENDING ||
          deliveryStatus[agentId] === MessageDeliveryStatus.FAILED) &&
        ((Array.isArray(message.recipients) &&
          message.recipients.includes(agentId)) ||
          (message.recipients === 'broadcast' && message.sender !== agentId))
      ) {
        undelivered.push(message);
      }
    }

    return undelivered;
  }

  /**
   * Get all channels an agent is participating in
   */
  async getAgentChannels(agentId: string): Promise<CommunicationChannel[]> {
    return Array.from(this.channels.values()).filter((channel) =>
      channel.participants.includes(agentId),
    );
  }

  /**
   * Get all participants in a channel
   */
  async getChannelParticipants(channelId: string): Promise<string[]> {
    const channel = this.channels.get(channelId);

    if (!channel) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    return [...channel.participants];
  }

  /**
   * Get all subscribers to a topic
   */
  async getTopicSubscribers(topic: string): Promise<string[]> {
    const subscriptions = this.topicSubscriptions.get(topic) || [];
    return subscriptions.map((sub) => sub.agentId);
  }

  /**
   * Get metrics about message delivery and channels
   */
  async getMetrics(): Promise<{
    messagesSent: number;
    messagesByType: Record<MessageType, number>;
    messagesByChannel: Record<string, number>;
    messagesByTopic: Record<string, number>;
    activeChannels: number;
    activeTopics: number;
    registeredAgents: number;
  }> {
    const messagesByType: Record<MessageType, number> = {
      [MessageType.REQUEST]: 0,
      [MessageType.RESPONSE]: 0,
      [MessageType.NOTIFICATION]: 0,
      [MessageType.UPDATE]: 0,
      [MessageType.QUERY]: 0,
    };

    const messagesByChannel: Record<string, number> = {};
    const messagesByTopic: Record<string, number> = {};

    // Count messages by type
    for (const message of this.messageHistory) {
      messagesByType[message.type] = (messagesByType[message.type] || 0) + 1;

      // Count by topic if present
      if (message.metadata?.topic) {
        const topic = message.metadata.topic as string;
        messagesByTopic[topic] = (messagesByTopic[topic] || 0) + 1;
      }
    }

    // Count messages by channel
    for (const channel of this.channels.values()) {
      const channelMessages = await this.getMessageHistory({
        channelId: channel.id,
      });
      messagesByChannel[channel.id] = channelMessages.length;
    }

    return {
      messagesSent: this.messageHistory.length,
      messagesByType,
      messagesByChannel,
      messagesByTopic,
      activeChannels: this.channels.size,
      activeTopics: this.topicSubscriptions.size,
      registeredAgents: this.agentCallbacks.size,
    };
  }

  /**
   * Process and deliver a message to recipients
   */
  private async deliverMessage(message: AgentMessage): Promise<void> {
    const pendingMessage = this.pendingMessages.get(message.id);

    if (!pendingMessage) {
      return;
    }

    if (Array.isArray(message.recipients)) {
      // Deliver to specific recipients
      for (const recipientId of message.recipients) {
        if (
          pendingMessage.deliveryStatus[recipientId] ===
          MessageDeliveryStatus.PENDING
        ) {
          const callback = this.agentCallbacks.get(recipientId);

          if (callback) {
            try {
              await callback(message);
              pendingMessage.deliveryStatus[recipientId] =
                MessageDeliveryStatus.DELIVERED;
            } catch (error) {
              this.logger.error(
                `Error delivering message ${message.id} to agent ${recipientId}: ${error instanceof Error ? error.message : String(error)}`,
              );
              pendingMessage.deliveryStatus[recipientId] =
                MessageDeliveryStatus.FAILED;
            }
          }
        }
      }
    } else if (message.recipients === 'broadcast') {
      // Deliver to all registered agents except sender
      for (const [agentId, callback] of this.agentCallbacks.entries()) {
        if (
          agentId !== message.sender &&
          pendingMessage.deliveryStatus[agentId] ===
            MessageDeliveryStatus.PENDING
        ) {
          try {
            await callback(message);
            pendingMessage.deliveryStatus[agentId] =
              MessageDeliveryStatus.DELIVERED;
          } catch (error) {
            this.logger.error(
              `Error broadcasting message ${message.id} to agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`,
            );
            pendingMessage.deliveryStatus[agentId] =
              MessageDeliveryStatus.FAILED;
          }
        }
      }
    }

    // Check if all recipients have received the message
    const allDelivered = Object.values(pendingMessage.deliveryStatus).every(
      (status) =>
        status === MessageDeliveryStatus.DELIVERED ||
        status === MessageDeliveryStatus.READ,
    );

    if (allDelivered && !pendingMessage.options?.requireConfirmation) {
      this.pendingMessages.delete(message.id);
    }
  }

  /**
   * Process expired messages
   */
  private processExpiredMessages(): void {
    const now = Date.now();

    for (const [messageId, pendingMessage] of this.pendingMessages.entries()) {
      if (pendingMessage.expiresAt && pendingMessage.expiresAt < now) {
        // Mark all pending deliveries as failed
        for (const [recipientId, status] of Object.entries(
          pendingMessage.deliveryStatus,
        )) {
          if (status === MessageDeliveryStatus.PENDING) {
            pendingMessage.deliveryStatus[recipientId] =
              MessageDeliveryStatus.FAILED;
          }
        }

        this.logger.warn(
          `Message ${messageId} expired before delivery to all recipients`,
        );

        // If confirmation is not required, remove the message
        if (!pendingMessage.options?.requireConfirmation) {
          this.pendingMessages.delete(messageId);
        }
      }
    }
  }

  /**
   * Clear all message history
   * Useful for testing and resetting state
   */
  async clearMessageHistory(): Promise<void> {
    this.logger.debug('Clearing message history');
    this.messageHistory = [];
    
    // Also clear pending messages
    this.pendingMessages.clear();
    
    this.logger.info('Message history cleared');
  }
  
  /**
   * Clean up resources used by the communication service
   * This should be called before shutting down the service
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up communication service resources');
    
    // Clear the interval that processes expired messages
    if (this.messageProcessingInterval) {
      clearInterval(this.messageProcessingInterval);
      this.messageProcessingInterval = undefined;
    }
    
    // Clear data structures
    this.channels.clear();
    this.messageHistory = [];
    this.pendingMessages.clear();
    this.agentCallbacks.clear();
    this.topicSubscriptions.clear();
    
    // Remove all event listeners
    this.removeAllListeners();
    
    this.logger.info('Communication service cleanup completed');
  }
}
