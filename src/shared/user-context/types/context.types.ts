/**
 * Base types for the context system
 */
import { ContextType, ActionItemStatus, KnowledgeGapType } from '../context-types.ts';

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

// Re-export the enums
export { ContextType, ActionItemStatus, KnowledgeGapType };

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
