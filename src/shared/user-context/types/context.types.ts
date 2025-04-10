/**
 * Base types for the context system
 */

/**
 * Custom error types for UserContextService
 */
export class UserContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserContextError';
  }
}

export class UserContextNotFoundError extends UserContextError {
  constructor(contextId: string, userId: string) {
    super(`Context record ${contextId} not found for user ${userId}`);
    this.name = 'UserContextNotFoundError';
  }
}

export class UserContextValidationError extends UserContextError {
  constructor(message: string) {
    super(message);
    this.name = 'UserContextValidationError';
  }
}

/**
 * The index name for user context data in Pinecone
 */
export const USER_CONTEXT_INDEX = 'user-context';

/**
 * Different types of context data that can be stored
 */
export enum ContextType {
  CONVERSATION = 'conversation',
  DOCUMENT = 'document',
  PREFERENCE = 'preference',
  TASK = 'task',
  CUSTOM = 'custom',
  MEETING = 'meeting', // Meeting transcripts/content
  DECISION = 'decision', // Decisions made in meetings
  ACTION_ITEM = 'action_item', // Action items assigned in meetings
  TOPIC = 'topic', // Topics discussed across meetings
  AGENDA_ITEM = 'agenda_item', // Meeting agenda items
  QUESTION = 'question', // Questions asked in meetings
  KNOWLEDGE_GAP = 'knowledge_gap', // Knowledge gaps and misalignments
}

/**
 * Status for action items
 */
export enum ActionItemStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/**
 * Knowledge gap types
 */
export enum KnowledgeGapType {
  MISALIGNMENT = 'misalignment',
  MISSING_INFORMATION = 'missing-information',
  UNANSWERED_QUESTION = 'unanswered-question',
}

/**
 * Standard user roles in the organization
 */
export enum UserRole {
  PRODUCT_OWNER = 'product-owner',
  DEVELOPER = 'developer',
  DESIGNER = 'designer',
  QA = 'qa',
  LEGAL = 'legal',
  MARKETING = 'marketing',
  SALES = 'sales',
  EXECUTIVE = 'executive',
  SUPPORT = 'support',
  OPERATIONS = 'operations',
  CUSTOM = 'custom',
}

/**
 * Structure of base user context metadata
 */
export interface BaseContextMetadata {
  userId: string;
  timestamp: number;
  source?: string;
  category?: string;
  relevanceScore?: number;
  expiresAt?: number;
  contextType?: ContextType;

  // Document fields
  documentId?: string;
  documentTitle?: string;
  chunkIndex?: number;
  totalChunks?: number;

  // Conversation fields
  conversationId?: string;
  turnId?: string;
  role?: 'user' | 'assistant' | 'system';

  // Meeting fields
  meetingId?: string;
  meetingTitle?: string;
  meetingStartTime?: number;
  meetingEndTime?: number;
  participantIds?: string[];

  // Topic fields
  topicId?: string;
  topicName?: string;
  relatedMeetingIds?: string[];

  // Agenda item fields
  agendaItemId?: string;
  agendaItemTitle?: string;

  // Decision fields
  isDecision?: boolean;
  decisionId?: string;
  decisionSummary?: string;

  // Action item fields
  isActionItem?: boolean;
  actionItemId?: string;
  assigneeId?: string;
  dueDate?: number;
  status?: ActionItemStatus;
  externalSystemId?: string;
  externalSystem?: string;

  // Question fields
  isQuestion?: boolean;
  questionId?: string;
  isAnswered?: boolean;
  answerContextId?: string;

  // Usage statistics
  viewCount?: number;
  lastAccessedAt?: number;
  explicitRelevanceFeedback?: number;

  // Relevance and recency
  recency?: number; // Higher values indicate more recent/relevant content
  
  // Allow any other properties to be added
  [key: string]: any;
}
