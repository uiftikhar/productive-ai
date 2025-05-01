/**
 * Dialogue System Interface
 *
 * Defines interfaces for advanced agent dialogue capabilities, including structured
 * conversations, request/response patterns, and negotiation protocols.
 */

import {
  MessageIntent,
  NaturalAgentMessage,
  ConversationContext,
} from './message-protocol.interface';

/**
 * Types of dialogues that can occur between agents
 */
export enum DialogueType {
  INFORMATION_EXCHANGE = 'information_exchange',
  TASK_DELEGATION = 'task_delegation',
  NEGOTIATION = 'negotiation',
  PROBLEM_SOLVING = 'problem_solving',
  CLARIFICATION = 'clarification',
  BRAINSTORMING = 'brainstorming',
  DECISION_MAKING = 'decision_making',
}

/**
 * Current phase of a dialogue
 */
export enum DialoguePhase {
  INITIATION = 'initiation',
  EXPLORATION = 'exploration',
  PROPOSAL = 'proposal',
  NEGOTIATION = 'negotiation',
  RESOLUTION = 'resolution',
  CONFIRMATION = 'confirmation',
  CONCLUSION = 'conclusion',
}

/**
 * Structure for tracking dialogue state and progress
 */
export interface DialogueState {
  dialogueId: string;
  conversationId: string;
  type: DialogueType;
  currentPhase: DialoguePhase;
  participants: string[];
  initiator: string;
  topic: string;
  startTime: number;
  lastUpdateTime: number;
  expectedOutcome?: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  successCriteria?: any;
  phaseHistory: Array<{
    phase: DialoguePhase;
    enteredAt: number;
    exitedAt?: number;
    summary?: string;
  }>;
  metadata?: Record<string, any>;
}

/**
 * Specific request patterns that agents can recognize and handle
 */
export enum RequestPattern {
  INFORMATION_REQUEST = 'information_request',
  ACTION_REQUEST = 'action_request',
  CLARIFICATION_REQUEST = 'clarification_request',
  PROPOSAL_REQUEST = 'proposal_request',
  FEEDBACK_REQUEST = 'feedback_request',
  ASSISTANCE_REQUEST = 'assistance_request',
  COORDINATION_REQUEST = 'coordination_request',
  PERMISSION_REQUEST = 'permission_request',
}

/**
 * Structured request format for clearer agent communication
 */
export interface StructuredRequest {
  id: string;
  pattern: RequestPattern;
  content: any;
  context?: any;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  deadline?: number; // Timestamp
  responseFormat?: any;
  fallbackOptions?: any[];
  validation?: {
    required?: string[];
    constraints?: Record<string, any>;
  };
}

/**
 * Structured response format
 */
export interface StructuredResponse {
  requestId: string;
  status: 'success' | 'partial' | 'failure' | 'pending';
  content: any;
  completeness: number; // 0-1
  confidence: number; // 0-1
  followUpNeeded: boolean;
  suggestedActions?: any[];
  metadata?: Record<string, any>;
}

/**
 * Types of clarification that might be needed
 */
export enum ClarificationType {
  AMBIGUITY = 'ambiguity',
  MISSING_INFORMATION = 'missing_information',
  CONTEXTUAL_CONFUSION = 'contextual_confusion',
  TERMINOLOGY = 'terminology',
  CONTRADICTORY_INFORMATION = 'contradictory_information',
  SCOPE_UNCERTAINTY = 'scope_uncertainty',
}

/**
 * A request for clarification when information is incomplete or ambiguous
 */
export interface ClarificationRequest {
  id: string;
  originalMessageId: string;
  type: ClarificationType;
  description: string;
  specificQuestions?: string[];
  options?: any[];
  suggestedResolutions?: any[];
  priority: 'low' | 'medium' | 'high';
}

/**
 * Tracks the state of a negotiation between agents
 */
export interface NegotiationState {
  negotiationId: string;
  dialogueId: string;
  topic: string;
  parties: string[];
  startTime: number;
  lastUpdateTime: number;
  status: 'proposed' | 'active' | 'resolved' | 'abandoned';
  currentProposal?: any;
  proposalHistory: Array<{
    proposerId: string;
    proposal: any;
    timestamp: number;
    status: 'proposed' | 'accepted' | 'rejected' | 'countered';
  }>;
  agreements: any[];
  disagreements: any[];
  deadline?: number;
  resolutionStrategy: 'consensus' | 'majority' | 'authority' | 'compromise';
  priorities?: Record<string, Record<string, number>>;
}

/**
 * Extended conversation context with dialogue capabilities
 */
export interface DialogueEnabledConversation extends ConversationContext {
  activeDialogues: string[]; // IDs of active dialogues in this conversation
  dialogueHistory: string[]; // IDs of all dialogues in this conversation
  analysis?: {
    dominantParticipants: string[];
    topicEvolution: Array<{
      topic: string;
      startTime: number;
      endTime?: number;
    }>;
    sentimentByParticipant?: Record<string, number>;
    unaddressedQuestions?: string[];
  };
}

/**
 * Interface for dialogue state transitions
 */
export interface DialogueTransition {
  from: DialoguePhase;
  to: DialoguePhase;
  triggeredBy: {
    agentId: string;
    messageId: string;
    intent: MessageIntent;
  };
  timestamp: number;
  reason: string;
  contextSnapshot?: any;
}

/**
 * Predefined dialogue templates for common interaction patterns
 */
export interface DialogueTemplate {
  id: string;
  name: string;
  type: DialogueType;
  description: string;
  phases: DialoguePhase[];
  expectedMessages: Array<{
    phase: DialoguePhase;
    sender: 'initiator' | 'responder' | 'any';
    intents: MessageIntent[];
    required: boolean;
    description: string;
  }>;
  successCriteria: any;
  estimatedDuration?: number; // In milliseconds
}
