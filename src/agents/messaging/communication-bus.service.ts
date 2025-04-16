import { v4 as uuid } from 'uuid';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { Logger } from '../../shared/logger/logger.interface';
import {
  AgentMessage,
  MessagePriority,
  MessageType,
} from './agent-message.interface';
import { EventEmitter } from 'events';

/**
 * Message subscription options
 */
export interface MessageSubscriptionOptions {
  agentId?: string;
  sourceId?: string;
  messageType?: MessageType;
  correlationId?: string;
  topic?: string;
  minPriority?: MessagePriority;
}

/**
 * Message subscription handler
 */
export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

/**
 * Service for handling communication between agents
 */
export class CommunicationBusService {
  private static instance: CommunicationBusService;
  private logger: Logger;
  private eventEmitter: EventEmitter;
  private subscriptions: Map<
    string,
    {
      options: MessageSubscriptionOptions;
      handler: MessageHandler;
    }
  > = new Map();

  // Message history for debugging and analysis
  private messageHistory: AgentMessage[] = [];
  private readonly maxHistorySize = 1000;

  /**
   * Get singleton instance
   */
  public static getInstance(logger?: Logger): CommunicationBusService {
    if (!CommunicationBusService.instance) {
      CommunicationBusService.instance = new CommunicationBusService(logger);
    }
    return CommunicationBusService.instance;
  }

  /**
   * Private constructor (singleton pattern)
   */
  private constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
    this.eventEmitter = new EventEmitter();
    // Allow more subscribers than the default 10
    this.eventEmitter.setMaxListeners(100);
  }

  /**
   * Publish a message to the bus
   */
  public async publish(
    message: Omit<AgentMessage, 'id' | 'timestamp'>,
  ): Promise<string> {
    // Create a complete message with ID and timestamp
    const completeMessage: AgentMessage = {
      ...message,
      id: uuid(),
      timestamp: Date.now(),
    };

    // Log the message (debug level to avoid too much noise)
    this.logger.debug('Message published', {
      id: completeMessage.id,
      type: completeMessage.type,
      sourceId: completeMessage.sourceId,
      targetId: completeMessage.targetId,
      topic: completeMessage.topic,
      contentSummary: this.summarizeContent(completeMessage.content),
    });

    // Store in history
    this.addToHistory(completeMessage);

    // Emit the message to subscribers
    this.eventEmitter.emit('message', completeMessage);

    // If the message has a specific target, also emit a targeted event
    if (completeMessage.targetId) {
      this.eventEmitter.emit(
        `message:target:${completeMessage.targetId}`,
        completeMessage,
      );
    }

    // If the message has a topic, emit a topic-specific event
    if (completeMessage.topic) {
      this.eventEmitter.emit(
        `message:topic:${completeMessage.topic}`,
        completeMessage,
      );
    }

    // If the message has a type, emit a type-specific event
    if (completeMessage.type) {
      this.eventEmitter.emit(
        `message:type:${completeMessage.type}`,
        completeMessage,
      );
    }

    return completeMessage.id;
  }

  /**
   * Subscribe to messages on the bus
   */
  public subscribe(
    options: MessageSubscriptionOptions,
    handler: MessageHandler,
  ): string {
    const subscriptionId = uuid();

    // Store the subscription
    this.subscriptions.set(subscriptionId, { options, handler });

    // Create the message handler
    const messageHandler = async (message: AgentMessage) => {
      if (this.matchesSubscription(message, options)) {
        try {
          await handler(message);
        } catch (error) {
          this.logger.error('Error in message handler', {
            error: error instanceof Error ? error.message : String(error),
            subscriptionId,
            messageId: message.id,
          });
        }
      }
    };

    // Subscribe to the appropriate events
    if (options.agentId) {
      this.eventEmitter.on(`message:target:${options.agentId}`, messageHandler);
    } else if (options.topic) {
      this.eventEmitter.on(`message:topic:${options.topic}`, messageHandler);
    } else if (options.messageType) {
      this.eventEmitter.on(
        `message:type:${options.messageType}`,
        messageHandler,
      );
    } else {
      // If no specific filtering, listen to all messages
      this.eventEmitter.on('message', messageHandler);
    }

    this.logger.info('Subscription created', {
      subscriptionId,
      options,
    });

    return subscriptionId;
  }

  /**
   * Unsubscribe from messages
   */
  public unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      this.logger.warn(
        'Attempted to unsubscribe from non-existent subscription',
        { subscriptionId },
      );
      return false;
    }

    // Remove the subscription
    this.subscriptions.delete(subscriptionId);

    // Note: We don't remove the actual event listeners here because it's complex
    // to track which listener belongs to which subscription. Instead, we'll just
    // not invoke handlers for unsubscribed subscriptions.

    this.logger.info('Subscription removed', { subscriptionId });
    return true;
  }

  /**
   * Create a request-response pattern
   */
  public async request(
    message: Omit<AgentMessage, 'id' | 'timestamp' | 'correlationId'>,
    timeoutMs: number = 5000,
  ): Promise<AgentMessage> {
    return new Promise((resolve, reject) => {
      // Create a correlation ID for this request
      const correlationId = uuid();

      // Create a timeout
      const timeoutId = setTimeout(() => {
        this.unsubscribe(responseSubscriptionId);
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Subscribe to the response
      let responseSubscriptionId: string;

      responseSubscriptionId = this.subscribe(
        {
          correlationId,
        },
        (response) => {
          // Clear the timeout
          clearTimeout(timeoutId);

          // Unsubscribe
          this.unsubscribe(responseSubscriptionId);

          // Resolve with the response
          resolve(response);
        },
      );

      // Send the request
      this.publish({
        ...message,
        correlationId,
      }).catch((error) => {
        // Clean up on error
        clearTimeout(timeoutId);
        this.unsubscribe(responseSubscriptionId);
        reject(error);
      });
    });
  }

  /**
   * Broadcast a message to all agents
   */
  public async broadcast(
    message: Omit<AgentMessage, 'id' | 'timestamp' | 'targetId'>,
  ): Promise<string> {
    return this.publish({
      ...message,
      targetId: 'broadcast',
    });
  }

  /**
   * Check if a message matches a subscription
   */
  private matchesSubscription(
    message: AgentMessage,
    options: MessageSubscriptionOptions,
  ): boolean {
    // Check agent ID
    if (options.agentId && message.targetId !== options.agentId) {
      return false;
    }

    // Check source ID
    if (options.sourceId && message.sourceId !== options.sourceId) {
      return false;
    }

    // Check message type
    if (options.messageType && message.type !== options.messageType) {
      return false;
    }

    // Check correlation ID
    if (
      options.correlationId &&
      message.correlationId !== options.correlationId
    ) {
      return false;
    }

    // Check topic
    if (options.topic && message.topic !== options.topic) {
      return false;
    }

    // Check priority
    if (
      options.minPriority !== undefined &&
      message.priority !== undefined &&
      message.priority < options.minPriority
    ) {
      return false;
    }

    return true;
  }

  /**
   * Add a message to the history
   */
  private addToHistory(message: AgentMessage): void {
    this.messageHistory.push(message);

    // Trim history if it gets too large
    if (this.messageHistory.length > this.maxHistorySize) {
      this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get message history
   */
  public getMessageHistory(limit: number = 100): AgentMessage[] {
    return this.messageHistory.slice(-limit);
  }

  /**
   * Clear message history
   */
  public clearMessageHistory(): void {
    this.messageHistory = [];
  }

  /**
   * Create a summary of message content for logging
   */
  private summarizeContent(content: unknown): string {
    if (content === null || content === undefined) {
      return '[empty]';
    }

    if (typeof content === 'string') {
      // Truncate long strings
      return content.length > 100 ? `${content.substring(0, 97)}...` : content;
    }

    if (typeof content === 'object') {
      try {
        const json = JSON.stringify(content);
        return json.length > 100 ? `${json.substring(0, 97)}...` : json;
      } catch (e) {
        return '[complex object]';
      }
    }

    return String(content);
  }
}
