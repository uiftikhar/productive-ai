import { BaseAgentState, AgentMessage } from './base-agent-state';
import { AgentStatus } from '../../../agents/interfaces/base-agent.interface';
import { Task } from '../../../agents/specialized/supervisor-agent';

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
  REASSIGNED = 'reassigned'
}

/**
 * Status of a supervised agent
 */
export enum SupervisedAgentStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  ERROR = 'error',
  UNAVAILABLE = 'unavailable'
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
  capabilities: string[];
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
  | 'planning'    // Initial task planning
  | 'delegation'  // Assigning tasks to agents
  | 'execution'   // Executing tasks
  | 'monitoring'  // Checking task status
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
  // Team and task management
  teamMembers: string[]; // IDs of team member agents
  tasks: Record<string, Task>; // Tasks mapped by task ID
  taskAssignments: Record<string, string>; // Task ID to Agent ID mapping
  taskStatus: Record<string, string>; // Status updates for tasks
  taskResults: Record<string, any>; // Results from completed tasks
  taskErrors: Record<string, string>; // Errors from failed tasks
  
  // Workflow control
  currentPhase: SupervisorPhase;
  executionStrategy?: ExecutionStrategy;
  planId?: string; // ID of the task plan when using TaskPlanningService
  
  // Progress tracking
  progressSummary?: {
    totalTasks: number;
    pendingTasks: number;
    inProgressTasks: number;
    completedTasks: number;
    failedTasks: number;
    successRate: number;
  };
  
  // Error handling and recovery
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
  recoveryStrategy?: 'reassign' | 'retry' | 'skip';
  
  // Result aggregation
  aggregatedResults?: Record<string, any>;
  overallStatus?: ExecutionStatus;
  completionSummary?: string;
} 