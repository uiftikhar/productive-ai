import { z } from 'zod';

/**
 * Base state definition for all agent graphs
 * This serves as the foundation for all agent-specific states
 */

// Agent status enum aligned with existing BaseAgent
export enum AgentStatus {
  INITIALIZING = 'initializing',
  READY = 'ready',
  EXECUTING = 'executing',
  ERROR = 'error',
  TERMINATED = 'terminated',
}

// Zod schema for agent status
export const AgentStatusSchema = z.nativeEnum(AgentStatus);

// Message interface and schema
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export const AgentMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'function']),
  content: z.string(),
  timestamp: z.string(),
  metadata: z.record(z.any()).optional(),
});

// Error interface and schema
export interface AgentError {
  type: string;
  message: string;
  node?: string;
  timestamp: string;
  details?: any;
}

export const AgentErrorSchema = z.object({
  type: z.string(),
  message: z.string(),
  node: z.string().optional(),
  timestamp: z.string(),
  details: z.any().optional(),
});

// Metrics interface and schema (aligned with existing AgentMetrics)
export interface AgentMetrics {
  totalExecutions: number;
  totalExecutionTimeMs: number;
  averageExecutionTimeMs: number;
  tokensUsed: number;
  errorRate: number;
  lastExecutionTimeMs?: number;
}

export const AgentMetricsSchema = z.object({
  totalExecutions: z.number(),
  totalExecutionTimeMs: z.number(),
  averageExecutionTimeMs: z.number(),
  tokensUsed: z.number(),
  errorRate: z.number(),
  lastExecutionTimeMs: z.number().optional(),
});

// Base agent state interface
export interface BaseAgentState {
  // Core identifiers
  agentId: string;
  runId: string;
  
  // Status tracking
  status: AgentStatus;
  lastExecutionTime?: number;
  errorCount: number;
  executionCount: number;
  
  // Messages and interactions
  messages: AgentMessage[];
  errors?: AgentError[];
  
  // Request data
  input?: string;
  capability?: string;
  parameters?: Record<string, any>;
  
  // Response data
  output?: string;
  artifacts?: Record<string, any>;
  
  // Metrics and metadata
  metrics?: AgentMetrics;
  metadata: Record<string, any>;
}

// Zod schema for base agent state
export const BaseAgentStateSchema = z.object({
  // Core identifiers
  agentId: z.string(),
  runId: z.string().uuid(),
  
  // Status tracking
  status: AgentStatusSchema,
  lastExecutionTime: z.number().optional(),
  errorCount: z.number(),
  executionCount: z.number(),
  
  // Messages and interactions
  messages: z.array(AgentMessageSchema),
  errors: z.array(AgentErrorSchema).optional(),
  
  // Request data
  input: z.string().optional(),
  capability: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  
  // Response data
  output: z.string().optional(),
  artifacts: z.record(z.any()).optional(),
  
  // Metrics and metadata
  metrics: AgentMetricsSchema.optional(),
  metadata: z.record(z.any()),
});

// Helper to create a new base agent state
export function createBaseAgentState(overrides: Partial<BaseAgentState> = {}): BaseAgentState {
  const baseState: BaseAgentState = {
    agentId: overrides.agentId || crypto.randomUUID(),
    runId: overrides.runId || crypto.randomUUID(),
    status: overrides.status || AgentStatus.INITIALIZING,
    errorCount: overrides.errorCount || 0,
    executionCount: overrides.executionCount || 0,
    messages: overrides.messages || [],
    metadata: overrides.metadata || {},
  };
  
  return {
    ...baseState,
    ...overrides,
  };
}

// Helper to add a message to state
export function addMessage(
  state: BaseAgentState,
  role: AgentMessage['role'],
  content: string,
  metadata?: Record<string, any>
): BaseAgentState {
  const message: AgentMessage = {
    role,
    content,
    timestamp: new Date().toISOString(),
    metadata,
  };

  return {
    ...state,
    messages: [...state.messages, message],
  };
}

// Helper to add an error to state
export function addError(
  state: BaseAgentState,
  type: string,
  message: string,
  node?: string,
  details?: any
): BaseAgentState {
  const error: AgentError = {
    type,
    message,
    node,
    timestamp: new Date().toISOString(),
    details,
  };

  return {
    ...state,
    errors: [...(state.errors || []), error],
    errorCount: state.errorCount + 1,
  };
}

// Helper to update state status
export function updateStatus(
  state: BaseAgentState, 
  status: AgentStatus
): BaseAgentState {
  return {
    ...state,
    status,
    lastExecutionTime: status === AgentStatus.EXECUTING ? Date.now() : state.lastExecutionTime,
  };
}

// Helper to increment execution count
export function incrementExecutionCount(state: BaseAgentState): BaseAgentState {
  return {
    ...state,
    executionCount: state.executionCount + 1,
  };
} 