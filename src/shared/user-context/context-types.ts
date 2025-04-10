/**
 * Types of context that can be stored and retrieved
 */
export enum ContextType {
  DOCUMENT = 'document',
  MEETING = 'meeting',
  TOPIC = 'topic',
  CONVERSATION = 'conversation',
  QUESTION = 'question',
  ANSWER = 'answer',
  THEME = 'theme',
  ACTION_ITEM = 'action_item',
  KNOWLEDGE_GAP = 'knowledge_gap',
  INTEGRATION = 'integration',
  MEMORY = 'memory'
}

/**
 * Types of knowledge gaps that can be detected
 */
export enum KnowledgeGapType {
  UNANSWERED_QUESTION = 'unanswered_question',
  TEAM_MISALIGNMENT = 'team_misalignment',
  MISSING_INFORMATION = 'missing_information',
  EXPERTISE_GAP = 'expertise_gap'
}

/**
 * Status of action items
 */
export enum ActionItemStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress', 
  COMPLETED = 'completed',
  CLOSED = 'closed',
  REJECTED = 'rejected'
} 