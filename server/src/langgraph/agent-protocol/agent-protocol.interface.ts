/**
 * Agent Protocol Interfaces
 * Based on the LangGraph/LangChain Agent Protocol
 * @see https://blog.langchain.dev/agent-protocol-interoperability-for-llm-agents/
 */

/**
 * Standard Agent Protocol API response structure
 */
export interface AgentProtocolResponse<T> {
  /**
   * Response content
   */
  data: T;
  
  /**
   * Error details (if any)
   */
  error?: {
    message: string;
    code: string;
    details?: any;
  };
}

/**
 * Agent run status
 */
export enum RunStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
  REQUIRES_ACTION = 'requires_action',
}

/**
 * Message role in a conversation
 */
export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  TOOL = 'tool',
}

/**
 * Message content type
 */
export enum ContentType {
  TEXT = 'text',
  IMAGE = 'image',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
}

/**
 * Base content structure
 */
export interface Content {
  type: ContentType;
}

/**
 * Text content
 */
export interface TextContent extends Content {
  type: ContentType.TEXT;
  text: string;
}

/**
 * Tool call content
 */
export interface ToolCallContent extends Content {
  type: ContentType.TOOL_CALL;
  tool_call: {
    name: string;
    arguments: Record<string, any>;
  };
}

/**
 * Tool result content
 */
export interface ToolResultContent extends Content {
  type: ContentType.TOOL_RESULT;
  tool_result: {
    tool_name: string;
    result: any;
  };
}

/**
 * Message in a thread
 */
export interface Message {
  id: string;
  role: MessageRole;
  content: (TextContent | ToolCallContent | ToolResultContent)[];
  created_at: string;
}

/**
 * Thread to organize multi-turn executions
 */
export interface Thread {
  id: string;
  created_at: string;
  metadata?: Record<string, any>;
}

/**
 * Agent run
 */
export interface Run {
  id: string;
  thread_id: string;
  assistant_id: string;
  status: RunStatus;
  required_action?: {
    type: string;
    tool_calls: ToolCallContent['tool_call'][];
  };
  last_error?: {
    code: string;
    message: string;
  };
  created_at: string;
  started_at?: string;
  completed_at?: string;
  metadata?: Record<string, any>;
}

/**
 * Request to create a thread
 */
export interface CreateThreadRequest {
  messages?: Omit<Message, 'id' | 'created_at'>[];
  metadata?: Record<string, any>;
}

/**
 * Request to create a message
 */
export interface CreateMessageRequest {
  role: MessageRole;
  content: (TextContent | ToolCallContent | ToolResultContent)[];
  metadata?: Record<string, any>;
}

/**
 * Request to create a run
 */
export interface CreateRunRequest {
  assistant_id: string;
  thread_id: string;
  model?: string;
  instructions?: string;
  tools?: {
    name: string;
    description?: string;
    parameters: Record<string, any>;
  }[];
  metadata?: Record<string, any>;
}

/**
 * Request to submit tool outputs
 */
export interface SubmitToolOutputsRequest {
  tool_outputs: {
    tool_call_id: string;
    output: any;
  }[];
}

/**
 * Tool definition 
 */
export interface Tool {
  name: string;
  description?: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Assistant definition
 */
export interface Assistant {
  id: string;
  name: string;
  description?: string;
  model: string;
  instructions?: string;
  tools?: Tool[];
  metadata?: Record<string, any>;
} 