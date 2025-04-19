import { v4 as uuidv4 } from 'uuid';

/**
 * Standard message types that can be exchanged between agents
 */
export enum MessageType {
  TEXT = 'text',
  SYSTEM = 'system',
  FUNCTION_CALL = 'function_call',
  FUNCTION_RESPONSE = 'function_response',
  ERROR = 'error',
  ACTION = 'action',
  RESULT = 'result',
  STATE_UPDATE = 'state_update',
}

/**
 * Message roles in a conversation
 */
export enum MessageRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
  FUNCTION = 'function',
  AGENT = 'agent',
}

/**
 * Common interface for all message types
 */
export interface BaseAgentMessage {
  id: string;
  type: MessageType;
  role: MessageRole;
  timestamp: string;
  sender?: string;
  recipient?: string;
  metadata?: Record<string, any>;
}

/**
 * Text message (standard chat messages)
 */
export interface TextMessage extends BaseAgentMessage {
  type: MessageType.TEXT;
  content: string;
}

/**
 * System message (instructions, guidelines)
 */
export interface SystemMessage extends BaseAgentMessage {
  type: MessageType.SYSTEM;
  content: string;
}

/**
 * Function call message
 */
export interface FunctionCallMessage extends BaseAgentMessage {
  type: MessageType.FUNCTION_CALL;
  functionName: string;
  arguments: Record<string, any>;
}

/**
 * Function response message
 */
export interface FunctionResponseMessage extends BaseAgentMessage {
  type: MessageType.FUNCTION_RESPONSE;
  functionName: string;
  result: any;
  error?: string;
}

/**
 * Error message
 */
export interface ErrorMessage extends BaseAgentMessage {
  type: MessageType.ERROR;
  error: string;
  errorCode?: string;
  stackTrace?: string;
}

/**
 * Action message (agent taking an action)
 */
export interface ActionMessage extends BaseAgentMessage {
  type: MessageType.ACTION;
  action: string;
  parameters: Record<string, any>;
}

/**
 * Result message (outcome of an action)
 */
export interface ResultMessage extends BaseAgentMessage {
  type: MessageType.RESULT;
  action: string;
  success: boolean;
  result: any;
}

/**
 * State update message (agent state changes)
 */
export interface StateUpdateMessage extends BaseAgentMessage {
  type: MessageType.STATE_UPDATE;
  stateDelta: Record<string, any>;
}

/**
 * Union type of all possible message types
 */
export type AgentMessage =
  | TextMessage
  | SystemMessage
  | FunctionCallMessage
  | FunctionResponseMessage
  | ErrorMessage
  | ActionMessage
  | ResultMessage
  | StateUpdateMessage;

/**
 * Helper functions to create message instances
 */
export const Messages = {
  /**
   * Create a text message
   */
  text(
    content: string,
    role: MessageRole,
    options: Partial<Omit<TextMessage, 'type' | 'content' | 'role' | 'timestamp'>> = {},
  ): TextMessage {
    return {
      id: options.id || uuidv4(),
      type: MessageType.TEXT,
      role,
      content,
      timestamp: new Date().toISOString(),
      sender: options.sender,
      recipient: options.recipient,
      metadata: options.metadata,
    };
  },

  /**
   * Create a system message
   */
  system(
    content: string,
    options: Partial<Omit<SystemMessage, 'type' | 'content' | 'role' | 'timestamp'>> = {},
  ): SystemMessage {
    return {
      id: options.id || uuidv4(),
      type: MessageType.SYSTEM,
      role: MessageRole.SYSTEM,
      content,
      timestamp: new Date().toISOString(),
      sender: options.sender,
      recipient: options.recipient,
      metadata: options.metadata,
    };
  },

  /**
   * Create a function call message
   */
  functionCall(
    functionName: string,
    args: Record<string, any>,
    options: Partial<Omit<FunctionCallMessage, 'type' | 'functionName' | 'arguments' | 'timestamp'>> = {},
  ): FunctionCallMessage {
    return {
      id: options.id || uuidv4(),
      type: MessageType.FUNCTION_CALL,
      role: options.role || MessageRole.ASSISTANT,
      functionName,
      arguments: args,
      timestamp: new Date().toISOString(),
      sender: options.sender,
      recipient: options.recipient,
      metadata: options.metadata,
    };
  },

  /**
   * Create a function response message
   */
  functionResponse(
    functionName: string,
    result: any,
    options: Partial<Omit<FunctionResponseMessage, 'type' | 'functionName' | 'result' | 'timestamp'>> = {},
  ): FunctionResponseMessage {
    return {
      id: options.id || uuidv4(),
      type: MessageType.FUNCTION_RESPONSE,
      role: MessageRole.FUNCTION,
      functionName,
      result,
      error: options.error,
      timestamp: new Date().toISOString(),
      sender: options.sender,
      recipient: options.recipient,
      metadata: options.metadata,
    };
  },

  /**
   * Create an error message
   */
  error(
    error: string | Error,
    options: Partial<Omit<ErrorMessage, 'type' | 'error' | 'timestamp'>> = {},
  ): ErrorMessage {
    const errorStr = error instanceof Error ? error.message : error;
    const stackTrace = error instanceof Error ? error.stack : undefined;
    
    return {
      id: options.id || uuidv4(),
      type: MessageType.ERROR,
      role: options.role || MessageRole.SYSTEM,
      error: errorStr,
      errorCode: options.errorCode,
      stackTrace,
      timestamp: new Date().toISOString(),
      sender: options.sender,
      recipient: options.recipient,
      metadata: options.metadata,
    };
  },

  /**
   * Create an action message
   */
  action(
    action: string,
    parameters: Record<string, any>,
    options: Partial<Omit<ActionMessage, 'type' | 'action' | 'parameters' | 'timestamp'>> = {},
  ): ActionMessage {
    return {
      id: options.id || uuidv4(),
      type: MessageType.ACTION,
      role: options.role || MessageRole.AGENT,
      action,
      parameters,
      timestamp: new Date().toISOString(),
      sender: options.sender,
      recipient: options.recipient,
      metadata: options.metadata,
    };
  },

  /**
   * Create a result message
   */
  result(
    action: string,
    success: boolean,
    result: any,
    options: Partial<Omit<ResultMessage, 'type' | 'action' | 'success' | 'result' | 'timestamp'>> = {},
  ): ResultMessage {
    return {
      id: options.id || uuidv4(),
      type: MessageType.RESULT,
      role: options.role || MessageRole.SYSTEM,
      action,
      success,
      result,
      timestamp: new Date().toISOString(),
      sender: options.sender,
      recipient: options.recipient,
      metadata: options.metadata,
    };
  },

  /**
   * Create a state update message
   */
  stateUpdate(
    stateDelta: Record<string, any>,
    options: Partial<Omit<StateUpdateMessage, 'type' | 'stateDelta' | 'timestamp'>> = {},
  ): StateUpdateMessage {
    return {
      id: options.id || uuidv4(),
      type: MessageType.STATE_UPDATE,
      role: options.role || MessageRole.SYSTEM,
      stateDelta,
      timestamp: new Date().toISOString(),
      sender: options.sender,
      recipient: options.recipient,
      metadata: options.metadata,
    };
  },
}; 