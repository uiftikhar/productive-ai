/**
 * @deprecated These interfaces are deprecated and will be removed in a future version.
 * Use the new agentic meeting analysis system in /langgraph/agentic-meeting-analysis instead.
 */
import { BaseMessage } from '@langchain/core/messages';
import {
  CapabilityAssessment,
  ConfidenceLevel,
  MetacognitiveState,
  ReflectionConfig,
  ReflectionPointType,
  ReflectionRecord,
  SelfAssessmentRequest,
  SelfAssessmentResponse,
  SelfReflectionRequest,
  SelfReflectionResponse,
  StrategyFormulationRequest,
  StrategyFormulationResponse,
  TaskStrategy,
} from './metacognition.interface';

/**
 * Agent capability descriptor
 */
export interface AgentCapability {
  name: string;
  description: string;
  parameters?: Record<string, any>;
}

/**
 * Context information for agent execution
 */
export interface AgentContext {
  userId?: string;
  runId?: string;
  conversationId?: string;
  sessionId?: string;
  /**
   * Unique identifier for the current task being executed
   * Used for progress tracking and monitoring
   * @deprecated Will be replaced by agentic self-organizing behavior where tasks are emergent
   */
  taskId?: string;
  metadata?: Record<string, any>;
  /**
   * Planning result from self-planning service
   */
  planningResult?: any;
  /**
   * Error information if an error occurred during execution
   */
  error?: Error;
  /**
   * ID of a registered confidence prediction for calibration
   * Used to track and update confidence predictions with actual outcomes
   */
  confidencePredictionId?: string;
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
  id?: string;
  agentId?: string;
  runId?: string;
  success: boolean;
  output?: string;
  error?: string;
  artifacts?: Record<string, any>;
  executionTimeMs?: number;
  metrics?: Record<string, any>;
  visualizationUrl?: string;
}

/**
 * Agent state types
 */
export enum AgentStatus {
  INITIALIZING = 'initializing',
  READY = 'ready',
  EXECUTING = 'executing',
  ERROR = 'error',
  TERMINATED = 'terminated',
}

/**
 * Agent state interface
 */
export interface AgentState {
  status: AgentStatus;
  lastExecutionTime?: number;
  errorCount: number;
  executionCount: number;
  metadata: Record<string, any>;
  metacognition?: Partial<MetacognitiveState>;
}

/**
 * Agent metrics interface
 */
export interface AgentMetrics {
  totalExecutions: number;
  totalExecutionTimeMs: number;
  averageExecutionTimeMs: number;
  tokensUsed: number;
  errorRate: number;
  lastExecutionTimeMs?: number;
  reflectionCount?: number;
  adaptationCount?: number;
  confidenceScores?: {
    average: number;
    trend: 'improving' | 'stable' | 'declining';
  };
}

/**
 * Core agent interface - all agents must implement this
 */
export interface BaseAgentInterface {
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

  /**
   * Get the current agent state
   */
  getState(): AgentState;

  /**
   * Get initialization status
   */
  getInitializationStatus(): boolean;

  /**
   * Clean up any resources used by the agent
   */
  terminate(): Promise<void>;

  /**
   * Get agent metrics
   */
  getMetrics(): AgentMetrics;

  /**
   * Self-reflection methods
   */

  /**
   * Perform self-assessment on whether the agent can handle a specific capability
   * This provides more detailed assessment than the simple canHandle method
   */
  assessCapability(
    request: SelfAssessmentRequest,
  ): Promise<SelfAssessmentResponse>;

  /**
   * Perform self-reflection at a specific point in execution
   */
  reflect(request: SelfReflectionRequest): Promise<SelfReflectionResponse>;

  /**
   * Formulate a strategy for approaching a task
   */
  formulateStrategy(
    request: StrategyFormulationRequest,
  ): Promise<StrategyFormulationResponse>;

  /**
   * Get the agent's confidence level for a specific capability or task
   */
  getConfidence(
    capability: string,
    taskDescription?: string,
  ): Promise<ConfidenceLevel>;

  /**
   * Get the metacognitive state of the agent
   */
  getMetacognitiveState(): Partial<MetacognitiveState>;

  /**
   * Configure reflection behavior
   */
  configureReflection(config: Partial<ReflectionConfig>): void;

  /**
   * Report progress update during execution
   * This allows the agent to update its progress tracking
   */
  reportProgress(progressUpdate: {
    capability: string;
    taskId?: string;
    completedSteps: number;
    totalSteps: number;
    milestone?: string;
    blocker?: { description: string; severity: 'low' | 'medium' | 'high' };
  }): void;
}

/**
 * Extended interface for agents that are compatible with workflow execution.
 * This interface exposes the internal execution method to prevent circular
 * execution patterns when using workflows.
 */
export interface WorkflowCompatibleAgent extends BaseAgentInterface {
  /**
   * Internal execution logic for the agent
   * This method is exposed for direct usage by workflows to prevent circular execution
   */
  executeInternal(request: AgentRequest): Promise<AgentResponse>;
}

/**
 * Extended interface for agents with metacognitive capabilities
 */
export interface MetacognitiveAgent extends BaseAgentInterface {
  /**
   * Access the full reflection history
   */
  getReflectionHistory(): ReflectionRecord[];

  /**
   * Get learned strategies for a specific capability
   */
  getLearnedStrategies(capability: string): TaskStrategy[];

  /**
   * Update metacognitive state after external events
   * (such as feedback from users or other agents)
   */
  updateMetacognitiveState(updates: Partial<MetacognitiveState>): void;

  /**
   * Transfer knowledge to another agent
   */
  transferKnowledge(
    targetAgentId: string,
    capabilityFilter?: string[],
  ): Promise<{
    transferredStrategies: number;
    transferredPatterns: number;
    success: boolean;
  }>;
}

/**
 * Legacy interface name for backward compatibility
 * @deprecated Use BaseAgentInterface instead
 */
export type AgentInterface = BaseAgentInterface;
