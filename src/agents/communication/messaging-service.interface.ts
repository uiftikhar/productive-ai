import {
  AgentMessage,
  CommunicationChannel,
  MessageFilter,
  MessageHandler,
  SendResult,
  SubscriptionOptions,
} from './types';

/**
 * The MessagingService interface defines the contract for handling
 * communication between agents in the system.
 */
export interface MessagingService {
  /**
   * Send a message from one agent to another
   * @param message The message to send
   * @returns A promise resolving to the result of the send operation
   */
  sendMessage(message: AgentMessage): Promise<SendResult>;

  /**
   * Send a message to multiple recipients
   * @param message The message to send (recipientId should be undefined)
   * @param recipientIds Array of recipient agent IDs
   * @returns A promise resolving to an array of results, one per recipient
   */
  broadcastMessage(
    message: Omit<AgentMessage, 'recipientId'>,
    recipientIds: string[],
  ): Promise<SendResult[]>;

  /**
   * Subscribe to messages matching the filter
   * @param agentId The ID of the agent subscribing to messages
   * @param handler The callback function to handle received messages
   * @param options Optional filtering and subscription settings
   * @returns A subscription ID that can be used to unsubscribe later
   */
  subscribeToMessages(
    agentId: string,
    handler: MessageHandler,
    options?: SubscriptionOptions,
  ): string;

  /**
   * Cancel a message subscription
   * @param subscriptionId The ID of the subscription to cancel
   * @returns True if successfully unsubscribed, false otherwise
   */
  unsubscribe(subscriptionId: string): boolean;

  /**
   * Query messages based on filter criteria
   * @param filter Filter criteria for messages
   * @returns A promise resolving to an array of matching messages
   */
  queryMessages(filter: MessageFilter): Promise<AgentMessage[]>;

  /**
   * Create a new communication channel
   * @param name Channel name
   * @param description Optional channel description
   * @param participantIds Optional initial list of participant agent IDs
   * @returns A promise resolving to the created channel
   */
  createChannel(
    name: string,
    description?: string,
    participantIds?: string[],
  ): Promise<CommunicationChannel>;

  /**
   * Get a channel by ID
   * @param channelId The ID of the channel to retrieve
   * @returns The channel if found, undefined otherwise
   */
  getChannel(channelId: string): CommunicationChannel | undefined;

  /**
   * List all channels
   * @returns Array of all communication channels
   */
  listChannels(): CommunicationChannel[];

  /**
   * Send a message to a specific channel
   * @param channelId The ID of the channel to send to
   * @param message The message to send
   * @returns A promise resolving to an array of send results, one per recipient in the channel
   */
  sendToChannel(
    channelId: string,
    message: Omit<AgentMessage, 'recipientId'>,
  ): Promise<SendResult[]>;

  /**
   * Subscribe to messages in a specific channel
   * @param agentId The ID of the agent subscribing to the channel
   * @param channelId The ID of the channel to subscribe to
   * @param handler The callback function to handle received messages
   * @param options Optional filtering and subscription settings
   * @returns A subscription ID that can be used to unsubscribe later
   */
  subscribeToChannel(
    agentId: string,
    channelId: string,
    handler: MessageHandler,
    options?: SubscriptionOptions,
  ): string;

  /**
   * Get all active subscriptions for an agent
   * @param agentId The ID of the agent
   * @returns An array of subscription IDs for the agent
   */
  getAgentSubscriptions(agentId: string): string[];

  /**
   * Clear all messages for an agent or a specific sender-recipient pair
   * @param agentId The ID of the agent whose messages to clear
   * @param senderId Optional sender ID to filter messages
   * @returns A promise resolving to the number of messages cleared
   */
  clearMessages(agentId: string, senderId?: string): Promise<number>;
} 