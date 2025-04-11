/**
 * Types of context that can be stored and retrieved
 */
export enum ContextType {
  DOCUMENT = 'document',
  MEETING = 'meeting',
  TOPIC = 'topic',
  CONVERSATION = 'conversation',
  QUESTION = 'question',
  ACTION_ITEM = 'action_item',
  KNOWLEDGE_GAP = 'knowledge_gap',
  PREFERENCE = 'preference',
  TASK = 'task',
  CUSTOM = 'custom',
  DECISION = 'decision',
  AGENDA_ITEM = 'agenda_item',
  ANSWER = 'answer',
  THEME = 'theme',
  INTEGRATION = 'integration',
  MEMORY = 'memory',
  NOTE = 'note',
}

/**
 * Types of knowledge gaps that can be detected
 */
export enum KnowledgeGapType {
  UNANSWERED_QUESTION = 'unanswered_question',
  TEAM_MISALIGNMENT = 'team_misalignment',
  MISSING_INFORMATION = 'missing_information',
  EXPERTISE_GAP = 'expertise_gap',
  MISALIGNMENT = 'misalignment',
  MISSING_INFORMATION_ALT = 'missing-information',
  UNANSWERED_QUESTION_ALT = 'unanswered-question',
}

/**
 * Status of action items
 */
export enum ActionItemStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CLOSED = 'closed',
  REJECTED = 'rejected',
  PENDING = 'pending',
  IN_PROGRESS_ALT = 'in-progress',
  CANCELLED = 'cancelled',
}
