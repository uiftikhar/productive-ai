/**
 * Message priority levels
 */
export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

/**
 * Message types for different communication scenarios
 */
export enum MessageType {
  // Basic communication
  REQUEST = 'request',
  RESPONSE = 'response',
  NOTIFICATION = 'notification',
  
  // Agent lifecycle
  AGENT_READY = 'agent_ready',
  AGENT_SHUTDOWN = 'agent_shutdown',
  
  // Task management
  TASK_CREATED = 'task_created',
  TASK_ASSIGNED = 'task_assigned',
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_CANCELLED = 'task_cancelled',
  
  // Workflow management
  WORKFLOW_STARTED = 'workflow_started',
  WORKFLOW_STEP_COMPLETED = 'workflow_step_completed',
  WORKFLOW_COMPLETED = 'workflow_completed',
  WORKFLOW_FAILED = 'workflow_failed',
  
  // Knowledge sharing
  KNOWLEDGE_QUERY = 'knowledge_query',
  KNOWLEDGE_RESPONSE = 'knowledge_response',
  KNOWLEDGE_UPDATE = 'knowledge_update',
  
  // Model routing
  MODEL_REQUEST = 'model_request',
  MODEL_RESPONSE = 'model_response',
  
  // System messages
  SYSTEM_INFO = 'system_info',
  SYSTEM_WARNING = 'system_warning',
  SYSTEM_ERROR = 'system_error',
  
  // User interaction
  USER_MESSAGE = 'user_message',
  USER_FEEDBACK = 'user_feedback',
  
  // Debugging
  DEBUG = 'debug'
}

/**
 * Structure of an agent message
 */
export interface AgentMessage {
  // Message identification
  id: string;
  correlationId?: string;
  
  // Routing information
  sourceId: string;
  targetId?: string;
  
  // Message classification
  type: MessageType;
  topic?: string;
  priority?: MessagePriority;
  
  // Timing
  timestamp: number;
  expiresAt?: number;
  
  // Content
  content: any;
  contentType?: string;
  
  // Metadata
  metadata?: Record<string, any>;
}

/**
 * Options for message handling
 */
export interface MessageHandlingOptions {
  // Request-response handling
  requireResponse?: boolean;
  responseTimeoutMs?: number;
  
  // Message processing
  retries?: number;
  retryDelayMs?: number;
  
  // Delivery options
  deliveryGuarantee?: 'at-least-once' | 'at-most-once' | 'exactly-once';
  
  // Other options
  tracingId?: string;
}

/**
 * Task message content
 */
export interface TaskMessageContent {
  taskId: string;
  taskType: string;
  parameters?: Record<string, any>;
  deadline?: number;
  contextData?: Record<string, any>;
  assignedAgentId?: string;
  result?: any;
  error?: string;
}

/**
 * Knowledge message content
 */
export interface KnowledgeMessageContent {
  query?: string;
  queryEmbedding?: number[];
  results?: Array<{
    id: string;
    content: string;
    metadata?: Record<string, any>;
    score?: number;
  }>;
  operation?: 'create' | 'read' | 'update' | 'delete';
  entity?: {
    id?: string;
    content: string;
    metadata?: Record<string, any>;
  };
}

/**
 * Model routing message content
 */
export interface ModelRequestContent {
  modelId?: string;
  provider?: string;
  prompt: string | Array<{role: string; content: string}>;
  parameters?: Record<string, any>;
  streaming?: boolean;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

/**
 * User message content
 */
export interface UserMessageContent {
  userId: string;
  messageText: string;
  messageType?: 'text' | 'command' | 'feedback';
  attachments?: Array<{
    type: string;
    url?: string;
    data?: any;
  }>;
}

/**
 * Create a request message
 */
export function createRequestMessage(
  sourceId: string,
  targetId: string,
  content: any,
  options?: {
    topic?: string;
    priority?: MessagePriority;
    metadata?: Record<string, any>;
    contentType?: string;
  }
): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    sourceId,
    targetId,
    type: MessageType.REQUEST,
    content,
    topic: options?.topic,
    priority: options?.priority ?? MessagePriority.NORMAL,
    metadata: options?.metadata,
    contentType: options?.contentType
  };
}

/**
 * Create a response message
 */
export function createResponseMessage(
  sourceId: string,
  targetId: string,
  content: any,
  correlationId: string,
  options?: {
    topic?: string;
    priority?: MessagePriority;
    metadata?: Record<string, any>;
    contentType?: string;
  }
): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    sourceId,
    targetId,
    type: MessageType.RESPONSE,
    content,
    correlationId,
    topic: options?.topic,
    priority: options?.priority ?? MessagePriority.NORMAL,
    metadata: options?.metadata,
    contentType: options?.contentType
  };
}

/**
 * Create a task message
 */
export function createTaskMessage(
  sourceId: string,
  targetId: string,
  taskType: MessageType,
  content: TaskMessageContent,
  options?: {
    correlationId?: string;
    priority?: MessagePriority;
    metadata?: Record<string, any>;
  }
): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    sourceId,
    targetId,
    type: taskType,
    content,
    correlationId: options?.correlationId,
    priority: options?.priority ?? MessagePriority.NORMAL,
    metadata: options?.metadata,
    contentType: 'application/json+task'
  };
}

/**
 * Create a notification message
 */
export function createNotificationMessage(
  sourceId: string,
  targetId: string | undefined,
  content: any,
  options?: {
    topic?: string;
    priority?: MessagePriority;
    metadata?: Record<string, any>;
    contentType?: string;
  }
): Omit<AgentMessage, 'id' | 'timestamp'> {
  return {
    sourceId,
    targetId,
    type: MessageType.NOTIFICATION,
    content,
    topic: options?.topic,
    priority: options?.priority ?? MessagePriority.NORMAL,
    metadata: options?.metadata,
    contentType: options?.contentType
  };
} 