import { BaseMessage } from '@langchain/core/messages';

/**
 * Agent capability descriptor
 */
export interface AgentCapability {
  name: string;
  description: string;
  parameters?: Record<string, any>;
}

/**
 * Agent execution context
 */
export interface AgentContext {
  userId?: string;
  conversationId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

/**
 * Agent execution request
 */
export interface AgentRequest {
  input: string | BaseMessage[];
  context?: AgentContext;
  capability?: string;
  parameters?: Record<string, any>;
}

/**
 * Agent execution response
 */
export interface AgentResponse {
  output: string | BaseMessage;
  artifacts?: Record<string, any>;
  metrics?: {
    tokensUsed?: number;
    executionTimeMs?: number;
    stepCount?: number;
  };
}

/**
 * Core agent interface - all agents must implement this
 */
export interface AgentInterface {
  /**
   * Unique identifier for this agent
   */
  readonly id: string;

  /**
   * Descriptive name of this agent
   */
  readonly name: string;

  /**
   * Agent description
   */
  readonly description: string;

  /**
   * List of capabilities this agent provides
   */
  getCapabilities(): AgentCapability[];

  /**
   * Check if agent can handle a specific capability
   */
  canHandle(capability: string): boolean;

  /**
   * Initialize the agent with runtime configuration
   */
  initialize(config?: Record<string, any>): Promise<void>;

  /**
   * Execute the agent with the given request
   */
  execute(request: AgentRequest): Promise<AgentResponse>;
}
