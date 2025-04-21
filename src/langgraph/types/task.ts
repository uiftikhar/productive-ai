/**
 * Task Interface
 * 
 * Defines the structure for tasks in the LangGraph system.
 * Tasks represent units of work that can be assigned to agents in a workflow.
 */

import { AgentCapabilities } from './agent-capabilities.enum';

/**
 * Task priority levels
 */
export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Task status states
 */
export enum TaskStatus {
  PENDING = 'pending',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled'
}

/**
 * Task dependency type
 */
export interface TaskDependency {
  taskId: string;
  type: 'required' | 'optional';
}

/**
 * Task interface defining the structure of workflow tasks
 */
export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  agentId?: string;
  requiredCapabilities?: AgentCapabilities[];
  dependencies?: TaskDependency[];
  parentTaskId?: string;
  subtasks?: string[];
  metadata?: Record<string, any>;
  input?: any;
  output?: any;
  error?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  timeoutMs?: number;
  retryCount?: number;
  maxRetries?: number;
}

/**
 * Task creation options
 */
export interface TaskCreationOptions {
  description: string;
  priority?: TaskPriority;
  requiredCapabilities?: AgentCapabilities[];
  dependencies?: TaskDependency[];
  parentTaskId?: string;
  metadata?: Record<string, any>;
  input?: any;
  timeoutMs?: number;
  maxRetries?: number;
} 