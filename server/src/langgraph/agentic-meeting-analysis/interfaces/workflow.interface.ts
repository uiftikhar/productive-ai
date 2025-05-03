/**
 * Workflow interfaces for the Agentic Meeting Analysis System
 */
import { AgenticMeetingAnalysisState } from './state.interface';
import { AnalysisGoalType, AnalysisTaskStatus } from './agent.interface';

/**
 * Workflow node types
 */
export enum WorkflowNodeType {
  START = 'start',
  END = 'end',
  TASK = 'task',
  DECISION = 'decision',
  BRANCH = 'branch',
  MERGE = 'merge',
  LOOP = 'loop',
  SUBPROCESS = 'subprocess',
  AGENT = 'agent',
  TEAM = 'team',
}

/**
 * Workflow edge types
 */
export enum WorkflowEdgeType {
  STANDARD = 'standard',
  CONDITIONAL = 'conditional',
  DEFAULT = 'default',
  ERROR = 'error',
  TIMEOUT = 'timeout',
}

/**
 * Node definition in a workflow
 */
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  description?: string;
  handler?: string; // Function or method name to execute
  agentId?: string; // ID of agent if agent node
  teamId?: string; // ID of team if team node
  parameters?: Record<string, any>;
  timeout?: number; // Timeout in milliseconds
  retries?: number;
  metadata?: Record<string, any>;
}

/**
 * Edge definition in a workflow
 */
export interface WorkflowEdge {
  id: string;
  source: string; // Source node ID
  target: string; // Target node ID
  type: WorkflowEdgeType;
  condition?: string; // JavaScript condition or reference to condition function
  label?: string;
  metadata?: Record<string, any>;
}

/**
 * Complete workflow definition
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: Record<string, any>;
  created: number;
  updated: number;
}

/**
 * Workflow execution status
 */
export enum WorkflowExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

/**
 * Node execution status
 */
export enum NodeExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  TIMEOUT = 'timeout',
}

/**
 * Node execution record
 */
export interface NodeExecution {
  nodeId: string;
  status: NodeExecutionStatus;
  input?: any;
  output?: any;
  error?: any;
  startTime: number;
  endTime?: number;
  duration?: number;
  retryCount: number;
  metadata?: Record<string, any>;
}

/**
 * Workflow execution record
 */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: WorkflowExecutionStatus;
  currentNodeId?: string;
  nodeExecutions: Record<string, NodeExecution>;
  input: any;
  output?: any;
  startTime: number;
  endTime?: number;
  duration?: number;
  error?: any;
  metadata?: Record<string, any>;
}

/**
 * Workflow execution event
 */
export interface WorkflowExecutionEvent {
  executionId: string;
  eventType:
    | 'workflow_started'
    | 'workflow_completed'
    | 'workflow_failed'
    | 'node_started'
    | 'node_completed'
    | 'node_failed'
    | 'edge_traversed';
  entityId?: string; // Node or edge ID
  data?: any;
  timestamp: number;
}

/**
 * Workflow service interface
 */
export interface IWorkflowService {
  // Core operations
  initialize(): Promise<void>;

  // Workflow definition management
  createWorkflow(
    definition: Omit<WorkflowDefinition, 'id' | 'created' | 'updated'>,
  ): Promise<string>;
  getWorkflow(id: string): Promise<WorkflowDefinition | null>;
  updateWorkflow(
    id: string,
    updates: Partial<Omit<WorkflowDefinition, 'id' | 'created' | 'updated'>>,
  ): Promise<void>;
  deleteWorkflow(id: string): Promise<void>;

  // Template operations
  createWorkflowFromTemplate(
    templateId: string,
    parameters: Record<string, any>,
  ): Promise<string>;
  saveAsTemplate(
    workflowId: string,
    templateName: string,
    description?: string,
  ): Promise<string>;

  // Dynamically generated workflow for meeting analysis
  generateAnalysisWorkflow(
    meetingId: string,
    goals: AnalysisGoalType[],
  ): Promise<string>;

  // Workflow execution
  executeWorkflow(
    workflowId: string,
    input: any,
    options?: {
      synchronous?: boolean;
      timeout?: number;
      metadata?: Record<string, any>;
    },
  ): Promise<string>; // Returns execution ID

  // Execution control
  pauseExecution(executionId: string): Promise<void>;
  resumeExecution(executionId: string): Promise<void>;
  cancelExecution(executionId: string): Promise<void>;

  // Execution inspection
  getExecution(executionId: string): Promise<WorkflowExecution | null>;
  getExecutionEvents(
    executionId: string,
    options?: {
      eventTypes?: string[];
      fromTimestamp?: number;
      limit?: number;
    },
  ): Promise<WorkflowExecutionEvent[]>;

  // Execution monitoring
  subscribeToExecutionEvents(
    executionId: string,
    callback: (event: WorkflowExecutionEvent) => void,
  ): void;
  unsubscribeFromExecutionEvents(
    executionId: string,
    callback: (event: WorkflowExecutionEvent) => void,
  ): void;

  // LangGraph integration
  createStateGraph(workflowId: string): Promise<any>; // Returns LangGraph StateGraph
  mapStateToLangGraph(state: AgenticMeetingAnalysisState): Promise<any>; // Maps to LangGraph state

  // Workflow validation
  validateWorkflow(workflowId: string): Promise<{
    valid: boolean;
    errors?: string[];
    warnings?: string[];
  }>;

  // Workflow listing and search
  listWorkflows(options?: {
    limit?: number;
    offset?: number;
    name?: string;
    version?: string;
  }): Promise<
    {
      id: string;
      name: string;
      version: string;
      created: number;
    }[]
  >;
}
