/**
 * @deprecated This module is deprecated and will be removed in a future version.
 * Use the new agentic meeting analysis system in /langgraph/agentic-meeting-analysis instead.
 */

/**
 * Message Protocol Interface
 *
 * Defines standardized message formats for natural agent-to-agent communication.
 * This extends the basic messaging system with more natural language capabilities,
 * conversation management, and intent-based communication.
 */

import { MessagePriority, MessageType } from '../communication/types';

/**
 * Contextual intent of the message
 */
export enum MessageIntent {
  // Information sharing
  INFORM = 'inform',
  REPORT = 'report',
  NOTIFY = 'notify',
  NARRATE = 'narrate',

  // Questions and clarifications
  ASK = 'ask',
  CLARIFY = 'clarify',
  CONFIRM = 'confirm',
  VERIFY = 'verify',

  // Requests and directives
  REQUEST = 'request',
  SUGGEST = 'suggest',
  INSTRUCT = 'instruct',

  // Responses
  AGREE = 'agree',
  DISAGREE = 'disagree',
  ACKNOWLEDGE = 'acknowledge',

  // Negotiations
  PROPOSE = 'propose',
  COUNTER_PROPOSE = 'counter_propose',
  ACCEPT = 'accept',
  REJECT = 'reject',

  // Social
  GREET = 'greet',
  FAREWELL = 'farewell',
  THANK = 'thank',
  APOLOGIZE = 'apologize',

  // Meta-communication
  META_DISCUSS = 'meta_discuss',
  FEEDBACK = 'feedback',
  REFLECT = 'reflect',
}

/**
 * Communication modality
 */
export enum CommunicationModality {
  TEXT = 'text',
  STRUCTURED_DATA = 'structured_data',
  REFERENCE = 'reference',
  CODE = 'code',
  VISUALIZATION = 'visualization',
  MIXED = 'mixed',
}

/**
 * Conversation context tracking
 */
export interface ConversationContext {
  conversationId: string;
  topic?: string;
  participants: string[];
  startTime: number;
  lastUpdateTime: number;
  status: 'active' | 'paused' | 'completed';
  metadata?: Record<string, any>;
  history?: string[]; // References to message IDs in this conversation
}

/**
 * Natural language message for agent communication
 */
export interface NaturalAgentMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  recipientId?: string; // Undefined for broadcasts
  recipientName?: string;
  intent: MessageIntent;
  modality: CommunicationModality;
  content: any;
  timestamp: number;
  priority: MessagePriority;
  referencedMessageIds?: string[]; // Messages this one references or responds to
  expectations?: {
    responseRequired: boolean;
    responseType?: MessageIntent[];
    responseDeadline?: number;
  };
  metadata?: Record<string, any>;

  // For multi-modal messages
  attachments?: Array<{
    id: string;
    type: CommunicationModality;
    content: any;
    description?: string;
  }>;
}

/**
 * Wrapper for legacy message types to be used in the natural communication system
 */
export interface LegacyMessageWrapper {
  originalMessage: {
    type: MessageType;
    content: any;
    id: string;
    senderId: string;
    recipientId?: string;
  };
  transformedMessage: NaturalAgentMessage;
}

/**
 * Intent classifier result
 */
export interface IntentClassification {
  message: string | any;
  intents: Array<{
    intent: MessageIntent;
    confidence: number; // 0-1
  }>;
  primaryIntent: MessageIntent;
  confidence: number;
  extractedEntities?: Record<string, any>;
}

/**
 * Message formatting preferences for recipients
 */
export interface RecipientPreferences {
  agentId: string;
  preferredModalities: CommunicationModality[];
  detailLevel: 'minimal' | 'standard' | 'detailed';
  formatPreferences?: Record<string, any>;
  contextRequirements?: string[];
}

/**
 * Context reference for shared knowledge
 */
export interface ContextReference {
  id: string;
  type: 'knowledge' | 'conversation' | 'task' | 'artifact' | 'agent';
  path?: string;
  description?: string;
  timestamp: number;
  accessConstraints?: {
    requiredCapabilities?: string[];
    allowedAgentIds?: string[];
  };
}

/**
 * Message transformation strategies for cross-agent compatibility
 */
export enum MessageTransformationStrategy {
  SIMPLIFY = 'simplify',
  EXPAND = 'expand',
  CONTEXTUALIZE = 'contextualize',
  TRANSLATE = 'translate', // Between different modalities
  SUMMARIZE = 'summarize',
}

/**
 * Communication competency level of an agent
 */
export enum CommunicationCompetencyLevel {
  BASIC = 'basic', // Simple direct communication only
  STANDARD = 'standard', // Can handle multi-turn conversations
  ADVANCED = 'advanced', // Complex negotiations and context management
  EXPERT = 'expert', // Full natural language with subtlety and nuance
}

/**
 * Protocol used for message exchange
 */
export enum CommunicationProtocol {
  DIRECT = 'direct', // One-to-one
  GROUP = 'group', // Targeted group
  BROADCAST = 'broadcast', // Everyone
  PUBLISH_SUBSCRIBE = 'publish_subscribe', // Topic-based
  REQUEST_RESPONSE = 'request_response', // Awaiting specific response
}

/**
 * Delivery confirmation request types
 */
export enum DeliveryConfirmationType {
  NONE = 'none',
  RECEIVED = 'received', // Confirm receipt only
  READ = 'read', // Confirm message was processed
  UNDERSTOOD = 'understood', // Confirm message was understood
  ACTIONED = 'actioned', // Confirm action was taken
}

/**
 * Message delivery status
 */
export interface MessageDeliveryStatus {
  messageId: string;
  recipientId: string;
  status: 'sent' | 'delivered' | 'read' | 'understood' | 'actioned' | 'failed';
  timestamp: number;
  error?: string;
}

/**
 * Creator function for natural agent messages
 */
export function createNaturalMessage(
  senderId: string,
  senderName: string,
  recipientId: string | undefined,
  recipientName: string | undefined,
  conversationId: string,
  intent: MessageIntent,
  content: any,
  modality: CommunicationModality = CommunicationModality.TEXT,
  priority: MessagePriority = MessagePriority.NORMAL,
  referencedMessageIds?: string[],
  expectations?: NaturalAgentMessage['expectations'],
): NaturalAgentMessage {
  return {
    id: generateId(),
    conversationId,
    senderId,
    senderName,
    recipientId,
    recipientName,
    intent,
    modality,
    content,
    timestamp: Date.now(),
    priority,
    referencedMessageIds,
    expectations,
  };
}

// Helper function to generate IDs
function generateId(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}
