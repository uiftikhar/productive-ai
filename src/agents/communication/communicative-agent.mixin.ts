import { v4 as uuidv4 } from 'uuid';
import { BaseAgentInterface } from '../interfaces/base-agent.interface';
import { MessagingService } from './messaging-service.interface';
import { InMemoryMessagingService } from './in-memory-messaging.service';
import { MessageFactory } from './message-factory';
import {
  AgentMessage,
  MessageFilter,
  MessageHandler,
  MessagePriority,
  MessageType,
  SubscriptionOptions,
} from './types';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Type of the class constructor that this mixin can be applied to
 */
type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * Interface for agent with minimal capabilities needed for registerCapability
 */
interface AgentWithRegisterCapability extends BaseAgentInterface {
  registerCapability?: (capability: {
    name: string;
    description: string;
  }) => void;
}

/**
 * Interface for communicative agent capabilities
 */
export interface CommunicativeAgentCapabilities {
  // Messaging capabilities
  sendMessageToAgent(
    recipientId: string,
    content: any,
    options?: any,
  ): Promise<string>;
  broadcastMessage(
    content: any,
    recipientIds?: string[],
    options?: any,
  ): Promise<string[]>;

  // Task-specific messaging
  sendTaskToAgent(
    recipientId: string,
    taskDescription: string,
    options?: any,
  ): Promise<string>;
  respondToTask(
    messageId: string,
    result: any,
    success?: boolean,
    error?: string,
  ): Promise<string>;

  // Query capabilities
  queryAgent(
    recipientId: string,
    query: string,
    context?: any,
  ): Promise<string>;

  // Notification capabilities
  sendNotification(
    recipientId: string,
    title: string,
    body: string,
    options?: any,
  ): Promise<string>;

  // Status updates
  sendStatusUpdate(
    recipientId: string,
    status: string,
    options?: any,
  ): Promise<string>;

  // Subscription management
  subscribeToMessages(
    handler: MessageHandler,
    options?: SubscriptionOptions,
  ): string;
  unsubscribeFromMessages(subscriptionId: string): boolean;

  // Channel management
  createChannel(
    name: string,
    description?: string,
    participantIds?: string[],
  ): Promise<string>;
  joinChannel(channelId: string): void;
  leaveChannel(channelId: string): void;
  sendToChannel(
    channelId: string,
    content: any,
    options?: any,
  ): Promise<string[]>;

  // History and query
  getMessageHistory(filter?: MessageFilter): Promise<AgentMessage[]>;
  clearMessageHistory(withAgentId?: string): Promise<number>;
}

/**
 * Mixin to add communication capabilities to any BaseAgent
 * @param Base The base class to extend with communication capabilities
 * @returns A new class that extends the base with communication capabilities
 */
export function CommunicativeAgent<
  TBase extends Constructor<AgentWithRegisterCapability>,
>(Base: TBase) {
  return class extends Base implements CommunicativeAgentCapabilities {
    // These properties should be accessible from child classes
    public readonly messagingService: MessagingService;
    public readonly subscriptions: Set<string> = new Set();
    public readonly subscribedChannels: Set<string> = new Set();
    public readonly commLogger: Logger;

    constructor(...args: any[]) {
      super(...args);
      this.commLogger = new ConsoleLogger();
      this.messagingService = InMemoryMessagingService.getInstance(
        this.commLogger,
      );

      // Register communication capability if the base agent supports it
      if (typeof this.registerCapability === 'function') {
        this.registerCapability({
          name: 'agent-communication',
          description:
            'Communicate with other agents via messages and channels',
        });
      }
    }

    /**
     * Initialize the agent with messaging capabilities
     */
    async initialize(config?: Record<string, any>): Promise<void> {
      await super.initialize?.(config);

      // Any specific initialization for communication
      this.commLogger.info(
        `Initializing communication capabilities for agent ${this.id}`,
      );
    }

    /**
     * Clean up resources when terminating
     */
    async terminate(): Promise<void> {
      // Clean up subscriptions
      for (const subId of this.subscriptions) {
        this.messagingService.unsubscribe(subId);
      }
      this.subscriptions.clear();

      await super.terminate?.();
    }

    /**
     * Send a message to another agent
     */
    async sendMessageToAgent(
      recipientId: string,
      content: any,
      options: {
        type?: MessageType;
        priority?: MessagePriority;
        correlationId?: string;
        metadata?: Record<string, any>;
      } = {},
    ): Promise<string> {
      const message = MessageFactory.createMessage(this.id, content, {
        recipientId,
        messageType: options.type,
        priority: options.priority,
        correlationId: options.correlationId,
        metadata: options.metadata,
      });

      const result = await this.messagingService.sendMessage(message);

      if (!result.success) {
        throw new Error(`Failed to send message: ${result.error}`);
      }

      return result.messageId;
    }

    /**
     * Broadcast a message to multiple agents
     */
    async broadcastMessage(
      content: any,
      recipientIds?: string[],
      options: {
        priority?: MessagePriority;
        correlationId?: string;
        metadata?: Record<string, any>;
        category?: string;
      } = {},
    ): Promise<string[]> {
      // If no recipients specified, create a true broadcast message
      if (!recipientIds || recipientIds.length === 0) {
        const message = MessageFactory.createBroadcastMessage(
          this.id,
          content,
          {
            importance: options.priority,
            correlationId: options.correlationId,
            metadata: options.metadata,
            category: options.category,
          },
        );

        const result = await this.messagingService.sendMessage(message);
        return result.success ? [result.messageId] : [];
      }

      // Otherwise, send to specific recipients
      const baseMessage = MessageFactory.createMessage(this.id, content, {
        priority: options.priority,
        correlationId: options.correlationId,
        metadata: options.metadata,
      });

      const results = await this.messagingService.broadcastMessage(
        baseMessage,
        recipientIds,
      );

      return results
        .filter((result) => result.success)
        .map((result) => result.messageId);
    }

    /**
     * Send a task to another agent
     */
    async sendTaskToAgent(
      recipientId: string,
      taskDescription: string,
      options: {
        priority?: MessagePriority;
        deadline?: number;
        requiredCapabilities?: string[];
        correlationId?: string;
        metadata?: Record<string, any>;
      } = {},
    ): Promise<string> {
      const message = MessageFactory.createTaskMessage(
        this.id,
        recipientId,
        taskDescription,
        options,
      );

      const result = await this.messagingService.sendMessage(message);

      if (!result.success) {
        throw new Error(`Failed to send task: ${result.error}`);
      }

      return result.messageId;
    }

    /**
     * Respond to a task
     */
    async respondToTask(
      messageId: string,
      result: any,
      success: boolean = true,
      error?: string,
    ): Promise<string> {
      // Find the original message to get the sender and correlation ID
      const originalMessages = await this.messagingService.queryMessages({
        correlationId: messageId,
      });

      if (originalMessages.length === 0) {
        throw new Error(`Original message not found: ${messageId}`);
      }

      const originalMessage = originalMessages[0];

      const message = MessageFactory.createResponseMessage(
        this.id,
        originalMessage.senderId,
        result,
        messageId,
        {
          success,
          error,
        },
      );

      const sendResult = await this.messagingService.sendMessage(message);

      if (!sendResult.success) {
        throw new Error(`Failed to send response: ${sendResult.error}`);
      }

      return sendResult.messageId;
    }

    /**
     * Query another agent
     */
    async queryAgent(
      recipientId: string,
      query: string,
      context?: any,
    ): Promise<string> {
      const message = MessageFactory.createQueryMessage(
        this.id,
        recipientId,
        query,
        { context },
      );

      const result = await this.messagingService.sendMessage(message);

      if (!result.success) {
        throw new Error(`Failed to send query: ${result.error}`);
      }

      return result.messageId;
    }

    /**
     * Send a notification to another agent
     */
    async sendNotification(
      recipientId: string,
      title: string,
      body: string,
      options: {
        category?: string;
        priority?: MessagePriority;
        correlationId?: string;
        metadata?: Record<string, any>;
      } = {},
    ): Promise<string> {
      const message = MessageFactory.createNotificationMessage(
        this.id,
        recipientId,
        title,
        body,
        options,
      );

      const result = await this.messagingService.sendMessage(message);

      if (!result.success) {
        throw new Error(`Failed to send notification: ${result.error}`);
      }

      return result.messageId;
    }

    /**
     * Send a status update
     */
    async sendStatusUpdate(
      recipientId: string,
      status: string,
      options: {
        progress?: number;
        estimatedCompletionTime?: number;
        details?: string;
        priority?: MessagePriority;
        correlationId?: string;
        metadata?: Record<string, any>;
      } = {},
    ): Promise<string> {
      const message = MessageFactory.createStatusUpdateMessage(
        this.id,
        recipientId,
        status,
        options,
      );

      const result = await this.messagingService.sendMessage(message);

      if (!result.success) {
        throw new Error(`Failed to send status update: ${result.error}`);
      }

      return result.messageId;
    }

    /**
     * Subscribe to messages
     */
    subscribeToMessages(
      handler: MessageHandler,
      options?: SubscriptionOptions,
    ): string {
      const subId = this.messagingService.subscribeToMessages(
        this.id,
        handler,
        options,
      );

      this.subscriptions.add(subId);
      return subId;
    }

    /**
     * Unsubscribe from messages
     */
    unsubscribeFromMessages(subscriptionId: string): boolean {
      const result = this.messagingService.unsubscribe(subscriptionId);

      if (result) {
        this.subscriptions.delete(subscriptionId);
      }

      return result;
    }

    /**
     * Create a communication channel
     */
    async createChannel(
      name: string,
      description?: string,
      participantIds?: string[],
    ): Promise<string> {
      // Always include self as a participant
      const allParticipants = participantIds
        ? Array.from(new Set([this.id, ...participantIds]))
        : [this.id];

      const channel = await this.messagingService.createChannel(
        name,
        description,
        allParticipants,
      );

      this.subscribedChannels.add(channel.id);
      return channel.id;
    }

    /**
     * Join a channel
     */
    joinChannel(channelId: string): void {
      const channel = this.messagingService.getChannel(channelId);

      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      channel.addParticipant(this.id);
      this.subscribedChannels.add(channelId);
    }

    /**
     * Leave a channel
     */
    leaveChannel(channelId: string): void {
      const channel = this.messagingService.getChannel(channelId);

      if (!channel) {
        throw new Error(`Channel not found: ${channelId}`);
      }

      channel.removeParticipant(this.id);
      this.subscribedChannels.delete(channelId);
    }

    /**
     * Send a message to a channel
     */
    async sendToChannel(
      channelId: string,
      content: any,
      options: {
        type?: MessageType;
        priority?: MessagePriority;
        correlationId?: string;
        metadata?: Record<string, any>;
      } = {},
    ): Promise<string[]> {
      const message = MessageFactory.createMessage(this.id, content, {
        messageType: options.type,
        priority: options.priority,
        correlationId: options.correlationId,
        metadata: options.metadata,
      });

      const results = await this.messagingService.sendToChannel(
        channelId,
        message,
      );

      return results
        .filter((result) => result.success)
        .map((result) => result.messageId);
    }

    /**
     * Get message history
     */
    async getMessageHistory(filter?: MessageFilter): Promise<AgentMessage[]> {
      // Ensure we only get messages for this agent
      const fullFilter: MessageFilter = {
        ...filter,
        senderIds: filter?.senderIds || [this.id],
      };

      return this.messagingService.queryMessages(fullFilter);
    }

    /**
     * Clear message history
     */
    async clearMessageHistory(withAgentId?: string): Promise<number> {
      return this.messagingService.clearMessages(this.id, withAgentId);
    }
  };
}
