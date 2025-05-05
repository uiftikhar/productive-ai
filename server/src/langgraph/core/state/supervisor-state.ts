import { BaseAgentState, AgentMessage } from './base-agent-state';
import { AgentStatus } from './base-agent-state';
import { AnalysisTaskStatus, AgentExpertise } from '../../agentic-meeting-analysis/interfaces/agent.interface';
import { ISharedMemory } from '../../agentic-meeting-analysis/interfaces/memory.interface';

/**
 * Status of a supervised task
 */
export enum SupervisedTaskStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REASSIGNED = 'reassigned',
}

/**
 * Status of a supervised agent
 */
export enum SupervisedAgentStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  ERROR = 'error',
  UNAVAILABLE = 'unavailable',
}

/**
 * Represents a task within the supervisor workflow
 */
export interface SupervisedTask {
  id: string;
  name: string;
  description: string;
  status: SupervisedTaskStatus;
  priority: number;
  assignedTo?: string; // The agent ID
  previouslyAssignedTo?: string[]; // History of agent assignments
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  failureReason?: string;
  attempts: number;
  result?: any;
  dependencies?: string[]; // IDs of tasks this depends on
  metadata?: Record<string, any>;
}

/**
 * Represents an agent managed by the supervisor
 */
export interface SupervisedAgent {
  id: string;
  name: string;
  status: SupervisedAgentStatus;
  capabilities: string[]; // Agent capabilities
  expertise: AgentExpertise[];
  currentTaskId?: string;
  completedTaskIds: string[];
  failedTaskIds: string[];
  lastActiveTime?: number;
  performance?: {
    successRate: number;
    averageExecutionTimeMs: number;
    tasksCompleted: number;
    tasksFailed: number;
  };
  metadata?: Record<string, any>;
}

/**
 * Coordination message between agents and supervisor
 */
export interface CoordinationMessage {
  id: string;
  senderId: string;
  recipientId?: string;
  content: string;
  timestamp: number;
  type: 'task-assignment' | 'status-update' | 'result' | 'error' | 'command';
  metadata?: Record<string, any>;
}

/**
 * Type of the phases in supervisor workflow
 */
export type SupervisorPhase =
  | 'planning' // Initial task planning
  | 'delegation' // Assigning tasks to agents
  | 'execution' // Executing tasks
  | 'monitoring' // Checking task status
  | 'completion'; // Finalizing execution

/**
 * Type of execution strategies
 */
export type ExecutionStrategy = 'sequential' | 'parallel' | 'prioritized';

/**
 * Overall execution status
 */
export type ExecutionStatus = 'success' | 'partial' | 'failed';

/**
 * Task assignment mapping
 */
export interface TaskAssignment {
  taskId: string;
  agentId: string;
  timestamp: number;
  retryCount?: number;
}

/**
 * Supervisor state interface for multi-agent coordination
 * Extends the base agent state with supervisor-specific fields
 */
export interface SupervisorState extends BaseAgentState {
  // Team and agent management
  meetingId: string;
  teamMembers: SupervisedAgent[]; // Team member agents
  
  // Task management
  tasks: Record<string, SupervisedTask>; // Tasks mapped by task ID
  taskAssignments: Record<string, string>; // Task ID to Agent ID mapping
  taskStatus: Record<string, SupervisedTaskStatus>; // Status updates for tasks
  taskResults: Record<string, any>; // Results from completed tasks
  taskErrors: Record<string, string>; // Errors from failed tasks
  taskDependencyGraph: Record<string, string[]>; // Task ID to its dependencies

  // Workflow control
  currentPhase: SupervisorPhase;
  executionStrategy: ExecutionStrategy;
  supervisorMemory?: ISharedMemory; // Reference to shared memory for coordination
  
  // Progress tracking
  progressSummary: {
    totalTasks: number;
    pendingTasks: number;
    inProgressTasks: number;
    completedTasks: number;
    failedTasks: number;
    successRate: number;
    startTime: number;
    lastUpdateTime: number;
    estimatedCompletionTime?: number;
  };

  // Error handling and recovery
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
  recoveryStrategy: 'reassign' | 'retry' | 'skip';

  // Result aggregation
  aggregatedResults?: Record<string, any>;
  overallStatus: ExecutionStatus;
  completionSummary?: string;
  
  // Coordination
  coordinationMessages: CoordinationMessage[];
  lastCoordinationTimestamp?: number;
  
  // Execution metadata
  executionId: string;
  startTime: number;
  endTime?: number;
}

/**
 * Create a new supervisor state
 */
export function createSupervisorState(
  overrides: Partial<SupervisorState> = {},
): SupervisorState {
  // First create a base state
  const baseState = {
    agentId: overrides.agentId || 'supervisor-agent',
    runId: overrides.runId || crypto.randomUUID(),
    status: overrides.status || AgentStatus.INITIALIZING,
    errorCount: overrides.errorCount || 0,
    executionCount: overrides.executionCount || 0,
    messages: overrides.messages || [],
    metadata: overrides.metadata || {},
  };

  const now = Date.now();
  
  // Create the supervisor state
  const supervisorState: SupervisorState = {
    ...baseState,
    meetingId: overrides.meetingId || `meeting-${baseState.runId}`,
    teamMembers: overrides.teamMembers || [],
    tasks: overrides.tasks || {},
    taskAssignments: overrides.taskAssignments || {},
    taskStatus: overrides.taskStatus || {},
    taskResults: overrides.taskResults || {},
    taskErrors: overrides.taskErrors || {},
    taskDependencyGraph: overrides.taskDependencyGraph || {},
    currentPhase: overrides.currentPhase || 'planning',
    executionStrategy: overrides.executionStrategy || 'parallel',
    supervisorMemory: overrides.supervisorMemory,
    progressSummary: overrides.progressSummary || {
      totalTasks: 0,
      pendingTasks: 0,
      inProgressTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      successRate: 0,
      startTime: now,
      lastUpdateTime: now,
    },
    recoveryAttempts: overrides.recoveryAttempts || 0,
    maxRecoveryAttempts: overrides.maxRecoveryAttempts || 3,
    recoveryStrategy: overrides.recoveryStrategy || 'retry',
    aggregatedResults: overrides.aggregatedResults,
    overallStatus: overrides.overallStatus || 'partial',
    completionSummary: overrides.completionSummary,
    coordinationMessages: overrides.coordinationMessages || [],
    lastCoordinationTimestamp: overrides.lastCoordinationTimestamp,
    executionId: overrides.executionId || `exec-${baseState.runId}`,
    startTime: overrides.startTime || now,
    endTime: overrides.endTime,
  };
  
  return supervisorState;
}

/**
 * Add a task to the supervisor state
 */
export function addTask(
  state: SupervisorState,
  task: Omit<SupervisedTask, 'createdAt' | 'attempts' | 'status'>,
): SupervisorState {
  const now = Date.now();
  const taskId = task.id;
  
  const newTask: SupervisedTask = {
    ...task,
    createdAt: now,
    attempts: 0,
    status: SupervisedTaskStatus.PENDING,
  };
  
  const updatedTasks = {
    ...state.tasks,
    [taskId]: newTask,
  };
  
  const updatedTaskStatus = {
    ...state.taskStatus,
    [taskId]: SupervisedTaskStatus.PENDING,
  };
  
  // Update progress summary
  const updatedProgressSummary = {
    ...state.progressSummary,
    totalTasks: Object.keys(updatedTasks).length,
    pendingTasks: Object.values(updatedTasks).filter(
      t => t.status === SupervisedTaskStatus.PENDING
    ).length,
    lastUpdateTime: now,
  };
  
  return {
    ...state,
    tasks: updatedTasks,
    taskStatus: updatedTaskStatus,
    progressSummary: updatedProgressSummary,
  };
}

/**
 * Assign a task to an agent
 */
export function assignTask(
  state: SupervisorState,
  taskId: string,
  agentId: string,
): SupervisorState {
  const now = Date.now();
  
  // Update the task
  const updatedTasks = { ...state.tasks };
  if (!updatedTasks[taskId]) {
    throw new Error(`Task ${taskId} not found`);
  }
  
  const previouslyAssignedTo = updatedTasks[taskId].previouslyAssignedTo || [];
  updatedTasks[taskId] = {
    ...updatedTasks[taskId],
    status: SupervisedTaskStatus.ASSIGNED,
    assignedTo: agentId,
    previouslyAssignedTo: [
      ...previouslyAssignedTo,
      ...(updatedTasks[taskId].assignedTo && !previouslyAssignedTo.includes(updatedTasks[taskId].assignedTo as string) 
        ? [updatedTasks[taskId].assignedTo as string] 
        : []),
    ],
  };
  
  // Update task assignment map
  const updatedTaskAssignments = {
    ...state.taskAssignments,
    [taskId]: agentId,
  };
  
  // Update task status
  const updatedTaskStatus = {
    ...state.taskStatus,
    [taskId]: SupervisedTaskStatus.ASSIGNED,
  };
  
  // Update agent status
  const updatedTeamMembers = state.teamMembers.map(agent => {
    if (agent.id === agentId) {
      return {
        ...agent,
        status: SupervisedAgentStatus.BUSY,
        currentTaskId: taskId,
        lastActiveTime: now,
      };
    }
    return agent;
  });
  
  // Add coordination message
  const assignmentMessage: CoordinationMessage = {
    id: crypto.randomUUID(),
    senderId: state.agentId,
    recipientId: agentId,
    content: `Task ${taskId} assigned to agent ${agentId}`,
    timestamp: now,
    type: 'task-assignment',
    metadata: {
      taskId,
      agentId,
    },
  };
  
  const updatedCoordinationMessages = [
    ...state.coordinationMessages,
    assignmentMessage,
  ];
  
  // Update progress summary
  const updatedProgressSummary = {
    ...state.progressSummary,
    pendingTasks: Object.values(updatedTasks).filter(
      t => t.status === SupervisedTaskStatus.PENDING
    ).length,
    lastUpdateTime: now,
  };
  
  return {
    ...state,
    tasks: updatedTasks,
    taskAssignments: updatedTaskAssignments,
    taskStatus: updatedTaskStatus,
    teamMembers: updatedTeamMembers,
    coordinationMessages: updatedCoordinationMessages,
    lastCoordinationTimestamp: now,
    progressSummary: updatedProgressSummary,
    currentPhase: 'delegation',
  };
}
