import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { MessagingService } from '../communication/messaging-service.interface';
import {
  AgentMessage,
  MessageFilter,
  MessageHandler,
  MessagePriority,
  MessageType,
  SendResult,
  SubscriptionOptions,
} from '../communication/types';
import { AgentRegistryService } from './agent-registry.service';
import {
  CommunicationCompetencyLevel,
  CommunicationModality,
  CommunicationProtocol,
  ConversationContext,
  DeliveryConfirmationType,
  IntentClassification,
  MessageDeliveryStatus,
  MessageIntent,
  MessageTransformationStrategy,
  NaturalAgentMessage,
  RecipientPreferences,
} from '../interfaces/message-protocol.interface';

/**
 * Service for natural agent-to-agent communication
 */
export class AgentMessagingService {
  private readonly conversations: Map<string, ConversationContext> = new Map();
  private readonly messageStore: Map<string, NaturalAgentMessage> = new Map();
  private readonly deliveryStatus: Map<string, MessageDeliveryStatus[]> =
    new Map();
  private readonly subscriptions: Map<
    string,
    {
      agentId: string;
      handler: (message: NaturalAgentMessage) => Promise<void>;
      filter?: Partial<NaturalAgentMessage>;
    }
  > = new Map();
  private readonly recipientPreferences: Map<string, RecipientPreferences> =
    new Map();

  // Map of agents to their communication competency levels
  private readonly competencyLevels: Map<string, CommunicationCompetencyLevel> =
    new Map();

  // Event emitter for messaging
  private readonly eventEmitter: EventEmitter;

  // Services
  private readonly legacyMessaging: MessagingService;
  private readonly agentRegistry: AgentRegistryService;

  constructor(
    legacyMessaging: MessagingService,
    agentRegistry: AgentRegistryService,
  ) {
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100); // Increase max listeners to handle many subscribers
    this.legacyMessaging = legacyMessaging;
    this.agentRegistry = agentRegistry;
  }

  /**
   * Send a natural message from one agent to another
   */
  async sendMessage(
    message: NaturalAgentMessage,
    confirmationType: DeliveryConfirmationType = DeliveryConfirmationType.RECEIVED,
  ): Promise<MessageDeliveryStatus> {
    // Generate ID if not provided
    if (!message.id) {
      message.id = uuidv4();
    }

    // Set timestamp if not provided
    if (!message.timestamp) {
      message.timestamp = Date.now();
    }

    // Store the message
    this.messageStore.set(message.id, message);

    // Create initial delivery status
    const deliveryStatus: MessageDeliveryStatus = {
      messageId: message.id,
      recipientId: message.recipientId || 'broadcast',
      status: 'sent',
      timestamp: Date.now(),
    };

    // Track delivery status
    if (!this.deliveryStatus.has(message.id)) {
      this.deliveryStatus.set(message.id, []);
    }
    this.deliveryStatus.get(message.id)?.push(deliveryStatus);

    // Update conversation context
    this.updateConversationContext(message);

    // If agent has low competency level, transform message
    if (message.recipientId) {
      const recipientCompetency =
        this.competencyLevels.get(message.recipientId) ||
        CommunicationCompetencyLevel.STANDARD;
      const recipientPreferences = this.recipientPreferences.get(
        message.recipientId,
      );

      if (recipientCompetency !== CommunicationCompetencyLevel.EXPERT) {
        this.transformMessageForRecipient(
          message,
          recipientCompetency,
          recipientPreferences,
        );
      }
    }

    // Emit event for subscribers
    this.eventEmitter.emit(
      `agent.message.${message.recipientId || 'broadcast'}`,
      message,
    );

    // Handle delivery confirmation if needed
    if (confirmationType !== DeliveryConfirmationType.NONE) {
      // For broadcast messages, don't wait for confirmation
      if (!message.recipientId) {
        return deliveryStatus;
      }

      // Update delivery status to delivered
      deliveryStatus.status = 'delivered';
      deliveryStatus.timestamp = Date.now();

      // For higher confirmation levels, we should wait for recipient confirmation
      if (
        confirmationType === DeliveryConfirmationType.READ ||
        confirmationType === DeliveryConfirmationType.UNDERSTOOD ||
        confirmationType === DeliveryConfirmationType.ACTIONED
      ) {
        // This would be implemented by having the recipient call confirmDelivery
        // We're just setting up the infrastructure here
      }
    }

    return deliveryStatus;
  }

  /**
   * Broadcast a message to multiple recipients
   */
  async broadcastMessage(
    message: Omit<NaturalAgentMessage, 'recipientId'>,
    recipientIds: string[],
  ): Promise<MessageDeliveryStatus[]> {
    const results: MessageDeliveryStatus[] = [];

    for (const recipientId of recipientIds) {
      const individualMessage: NaturalAgentMessage = {
        ...message,
        recipientId,
        id: uuidv4(), // Each message gets a unique ID
      };

      const status = await this.sendMessage(individualMessage);
      results.push(status);
    }

    return results;
  }

  /**
   * Send a message to all agents
   */
  async sendGlobalBroadcast(
    message: Omit<NaturalAgentMessage, 'recipientId'>,
  ): Promise<MessageDeliveryStatus> {
    const broadcastMessage: NaturalAgentMessage = {
      ...message,
      recipientId: undefined,
      id: uuidv4(),
    };

    return this.sendMessage(broadcastMessage);
  }

  /**
   * Subscribe to messages
   */
  subscribeToMessages(
    agentId: string,
    handler: (message: NaturalAgentMessage) => Promise<void>,
    filter?: Partial<NaturalAgentMessage>,
  ): string {
    const subscriptionId = uuidv4();

    this.subscriptions.set(subscriptionId, {
      agentId,
      handler,
      filter,
    });

    // Subscribe to direct messages
    this.eventEmitter.on(
      `agent.message.${agentId}`,
      async (message: NaturalAgentMessage) => {
        if (this.matchesFilter(message, filter)) {
          await handler(message);

          // Update delivery status
          const deliveryStatuses = this.deliveryStatus.get(message.id) || [];
          const existingStatus = deliveryStatuses.find(
            (s) => s.recipientId === agentId,
          );

          if (existingStatus) {
            existingStatus.status = 'read';
            existingStatus.timestamp = Date.now();
          }
        }
      },
    );

    // Subscribe to broadcasts
    this.eventEmitter.on(
      'agent.message.broadcast',
      async (message: NaturalAgentMessage) => {
        if (this.matchesFilter(message, filter)) {
          await handler(message);
        }
      },
    );

    return subscriptionId;
  }

  /**
   * Unsubscribe from messages
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      return false;
    }

    // Remove subscription handlers
    this.eventEmitter.removeAllListeners(
      `agent.message.${subscription.agentId}`,
    );
    this.eventEmitter.removeAllListeners('agent.message.broadcast');

    // Remove subscription record
    this.subscriptions.delete(subscriptionId);

    return true;
  }

  /**
   * Create a new conversation context
   */
  createConversation(
    participants: string[],
    topic?: string,
  ): ConversationContext {
    const conversationId = uuidv4();
    const now = Date.now();

    const context: ConversationContext = {
      conversationId,
      topic,
      participants,
      startTime: now,
      lastUpdateTime: now,
      status: 'active',
      history: [],
    };

    this.conversations.set(conversationId, context);
    return context;
  }

  /**
   * Get conversation by ID
   */
  getConversation(conversationId: string): ConversationContext | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Get message by ID
   */
  getMessage(messageId: string): NaturalAgentMessage | undefined {
    return this.messageStore.get(messageId);
  }

  /**
   * Get all messages in a conversation
   */
  getConversationMessages(conversationId: string): NaturalAgentMessage[] {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || !conversation.history) {
      return [];
    }

    return conversation.history
      .map((messageId) => this.messageStore.get(messageId))
      .filter((message) => message !== undefined) as NaturalAgentMessage[];
  }

  /**
   * Update delivery status for a message
   */
  confirmDelivery(
    messageId: string,
    recipientId: string,
    status: 'delivered' | 'read' | 'understood' | 'actioned',
  ): boolean {
    const deliveryStatuses = this.deliveryStatus.get(messageId);

    if (!deliveryStatuses) {
      return false;
    }

    const statusRecord = deliveryStatuses.find(
      (s) => s.recipientId === recipientId,
    );

    if (!statusRecord) {
      return false;
    }

    statusRecord.status = status;
    statusRecord.timestamp = Date.now();

    return true;
  }

  /**
   * Set communication competency level for an agent
   */
  setAgentCompetencyLevel(
    agentId: string,
    level: CommunicationCompetencyLevel,
  ): void {
    this.competencyLevels.set(agentId, level);
  }

  /**
   * Get communication competency level for an agent
   */
  getAgentCompetencyLevel(agentId: string): CommunicationCompetencyLevel {
    return (
      this.competencyLevels.get(agentId) ||
      CommunicationCompetencyLevel.STANDARD
    );
  }

  /**
   * Set recipient preferences
   */
  setRecipientPreferences(preferences: RecipientPreferences): void {
    this.recipientPreferences.set(preferences.agentId, preferences);
  }

  /**
   * Get recipient preferences
   */
  getRecipientPreferences(agentId: string): RecipientPreferences | undefined {
    return this.recipientPreferences.get(agentId);
  }

  /**
   * Classify the intent of a message
   * Note: In a real implementation, this would use a language model
   */
  classifyIntent(message: string | any): IntentClassification {
    // This is a placeholder that would be replaced with actual intent classification
    // Potentially using a language model or rules-based system

    // Very basic classification for demo purposes
    const messageStr =
      typeof message === 'string' ? message : JSON.stringify(message);

    const classification: IntentClassification = {
      message,
      intents: [],
      primaryIntent: MessageIntent.INFORM,
      confidence: 0.7,
    };

    if (messageStr.match(/\?$/)) {
      classification.primaryIntent = MessageIntent.ASK;
      classification.intents.push({
        intent: MessageIntent.ASK,
        confidence: 0.8,
      });
      classification.intents.push({
        intent: MessageIntent.CLARIFY,
        confidence: 0.5,
      });
    } else if (messageStr.match(/^please|could you/i)) {
      classification.primaryIntent = MessageIntent.REQUEST;
      classification.intents.push({
        intent: MessageIntent.REQUEST,
        confidence: 0.9,
      });
    } else if (messageStr.match(/^i suggest|recommend/i)) {
      classification.primaryIntent = MessageIntent.SUGGEST;
      classification.intents.push({
        intent: MessageIntent.SUGGEST,
        confidence: 0.85,
      });
    }

    // Always add INFORM as a fallback with lower confidence
    classification.intents.push({
      intent: MessageIntent.INFORM,
      confidence: 0.6,
    });

    return classification;
  }

  /**
   * Create a response to a message
   */
  createResponse(
    originalMessage: NaturalAgentMessage,
    responderId: string,
    responderName: string,
    content: any,
    intent: MessageIntent = MessageIntent.ACKNOWLEDGE,
    modality: CommunicationModality = CommunicationModality.TEXT,
  ): NaturalAgentMessage {
    return {
      id: uuidv4(),
      conversationId: originalMessage.conversationId,
      senderId: responderId,
      senderName: responderName,
      recipientId: originalMessage.senderId,
      recipientName: originalMessage.senderName,
      intent,
      modality,
      content,
      timestamp: Date.now(),
      priority: originalMessage.priority,
      referencedMessageIds: [originalMessage.id],
    };
  }

  /**
   * Bridge between legacy messaging and natural messaging
   */
  async bridgeFromLegacy(
    legacyMessage: AgentMessage,
  ): Promise<NaturalAgentMessage> {
    // Map legacy message type to intent
    let intent: MessageIntent;
    switch (legacyMessage.type) {
      case MessageType.TASK:
        intent = MessageIntent.REQUEST;
        break;
      case MessageType.RESPONSE:
        intent = MessageIntent.INFORM;
        break;
      case MessageType.NOTIFICATION:
        intent = MessageIntent.NOTIFY;
        break;
      case MessageType.STATUS_UPDATE:
        intent = MessageIntent.REPORT;
        break;
      case MessageType.QUERY:
        intent = MessageIntent.ASK;
        break;
      case MessageType.ERROR:
        intent = MessageIntent.INFORM;
        break;
      case MessageType.BROADCAST:
        intent = MessageIntent.NOTIFY;
        break;
      default:
        intent = MessageIntent.INFORM;
    }

    // Get agent names
    const sender = await this.agentRegistry.getAgent(legacyMessage.senderId);
    const recipient = legacyMessage.recipientId
      ? await this.agentRegistry.getAgent(legacyMessage.recipientId)
      : undefined;

    // Create conversation if needed
    let conversationId = legacyMessage.correlationId;
    if (!conversationId) {
      const conversation = this.createConversation([
        legacyMessage.senderId,
        legacyMessage.recipientId || 'broadcast',
      ]);
      conversationId = conversation.conversationId;
    }

    // Create natural message
    const naturalMessage: NaturalAgentMessage = {
      id: legacyMessage.id,
      conversationId,
      senderId: legacyMessage.senderId,
      senderName: sender?.name || 'Unknown Agent',
      recipientId: legacyMessage.recipientId,
      recipientName: recipient?.name,
      intent,
      modality: CommunicationModality.STRUCTURED_DATA,
      content: legacyMessage.content,
      timestamp: legacyMessage.timestamp,
      priority: legacyMessage.priority,
      metadata: {
        originalType: legacyMessage.type,
        ...legacyMessage.metadata,
      },
    };

    return naturalMessage;
  }

  /**
   * Bridge from natural messaging to legacy messaging
   */
  async bridgeToLegacy(
    naturalMessage: NaturalAgentMessage,
  ): Promise<SendResult> {
    // Map intent to legacy message type
    let type: MessageType;
    switch (naturalMessage.intent) {
      case MessageIntent.REQUEST:
      case MessageIntent.INSTRUCT:
        type = MessageType.TASK;
        break;
      case MessageIntent.INFORM:
      case MessageIntent.ACKNOWLEDGE:
      case MessageIntent.AGREE:
      case MessageIntent.DISAGREE:
        type = MessageType.RESPONSE;
        break;
      case MessageIntent.NOTIFY:
        type = MessageType.NOTIFICATION;
        break;
      case MessageIntent.REPORT:
        type = MessageType.STATUS_UPDATE;
        break;
      case MessageIntent.ASK:
      case MessageIntent.CLARIFY:
      case MessageIntent.CONFIRM:
        type = MessageType.QUERY;
        break;
      default:
        type = MessageType.NOTIFICATION;
    }

    // Create legacy message
    const legacyMessage: AgentMessage = {
      id: naturalMessage.id,
      type,
      senderId: naturalMessage.senderId,
      recipientId: naturalMessage.recipientId,
      content: naturalMessage.content,
      timestamp: naturalMessage.timestamp,
      priority: naturalMessage.priority,
      correlationId: naturalMessage.conversationId,
      metadata: {
        intent: naturalMessage.intent,
        ...naturalMessage.metadata,
      },
    };

    // Send through legacy messaging service
    return this.legacyMessaging.sendMessage(legacyMessage);
  }

  // Private helper methods

  private updateConversationContext(message: NaturalAgentMessage): void {
    let conversation = this.conversations.get(message.conversationId);

    if (!conversation) {
      // Create new conversation if it doesn't exist
      conversation = this.createConversation(
        [message.senderId, message.recipientId || 'broadcast'].filter(
          Boolean,
        ) as string[],
        message.metadata?.topic as string,
      );
    }

    // Update conversation history
    if (!conversation.history) {
      conversation.history = [];
    }
    conversation.history.push(message.id);
    conversation.lastUpdateTime = Date.now();

    // Ensure both participants are included
    if (
      message.recipientId &&
      !conversation.participants.includes(message.recipientId)
    ) {
      conversation.participants.push(message.recipientId);
    }
    if (!conversation.participants.includes(message.senderId)) {
      conversation.participants.push(message.senderId);
    }

    this.conversations.set(message.conversationId, conversation);
  }

  private matchesFilter(
    message: NaturalAgentMessage,
    filter?: Partial<NaturalAgentMessage>,
  ): boolean {
    if (!filter) {
      return true;
    }

    // Check each filter property
    for (const [key, value] of Object.entries(filter)) {
      const messageValue = (message as any)[key];

      if (Array.isArray(value)) {
        // For array filters, check if any value matches
        if (!value.includes(messageValue)) {
          return false;
        }
      } else if (messageValue !== value) {
        return false;
      }
    }

    return true;
  }

  private transformMessageForRecipient(
    message: NaturalAgentMessage,
    recipientCompetency: CommunicationCompetencyLevel,
    recipientPreferences?: RecipientPreferences,
  ): void {
    if (!message.recipientId) {
      return; // Don't transform broadcast messages
    }

    // Apply transformations based on competency level
    if (recipientCompetency === CommunicationCompetencyLevel.BASIC) {
      // For basic competency, simplify the message
      this.applyTransformation(message, MessageTransformationStrategy.SIMPLIFY);
    } else if (recipientCompetency === CommunicationCompetencyLevel.STANDARD) {
      // For standard competency, ensure contextualization if needed
      if (message.referencedMessageIds?.length) {
        this.applyTransformation(
          message,
          MessageTransformationStrategy.CONTEXTUALIZE,
        );
      }
    }

    // Apply modality transformations based on preferences
    if (recipientPreferences?.preferredModalities?.length) {
      if (
        !recipientPreferences.preferredModalities.includes(message.modality)
      ) {
        // Transform to preferred modality
        this.applyTransformation(
          message,
          MessageTransformationStrategy.TRANSLATE,
        );
        message.modality = recipientPreferences.preferredModalities[0];
      }
    }

    // Apply detail level transformations
    if (recipientPreferences?.detailLevel === 'minimal') {
      this.applyTransformation(
        message,
        MessageTransformationStrategy.SUMMARIZE,
      );
    } else if (
      recipientPreferences?.detailLevel === 'detailed' &&
      message.modality === CommunicationModality.TEXT
    ) {
      this.applyTransformation(message, MessageTransformationStrategy.EXPAND);
    }
  }

  private applyTransformation(
    message: NaturalAgentMessage,
    strategy: MessageTransformationStrategy,
  ): void {
    // This is a placeholder for actual transformations that would use LLMs or rules
    // In a full implementation, we would have specific logic for each strategy

    switch (strategy) {
      case MessageTransformationStrategy.SIMPLIFY:
        if (typeof message.content === 'string') {
          // Simplify text by shortening and using simpler language
          message.content = message.content.split('.')[0] + '.'; // Just first sentence
        }
        break;

      case MessageTransformationStrategy.CONTEXTUALIZE:
        if (
          typeof message.content === 'string' &&
          message.referencedMessageIds?.length
        ) {
          // Add context about what this is responding to
          const referencedId = message.referencedMessageIds[0];
          const referenced = this.messageStore.get(referencedId);

          if (referenced && typeof referenced.content === 'string') {
            message.content = `Regarding "${referenced.content.substring(0, 50)}...": ${message.content}`;
          }
        }
        break;

      case MessageTransformationStrategy.SUMMARIZE:
        if (
          typeof message.content === 'string' &&
          message.content.length > 100
        ) {
          // Create a simple summary
          message.content = message.content.substring(0, 97) + '...';
        }
        break;

      // Other transformations would be implemented similarly
    }
  }
}
