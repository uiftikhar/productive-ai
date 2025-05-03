import { v4 as uuidv4 } from 'uuid';
import { ComplexityLevel, ResourceRequirement, TaskDependency } from './task-analysis.interface';

/**
 * Task status enum
 */
export enum TaskStatus {
  DRAFT = 'draft',
  PLANNED = 'planned',
  READY = 'ready',
  BLOCKED = 'blocked',
  IN_PROGRESS = 'in_progress',
  REVIEWING = 'reviewing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Task priority enum
 */
export enum TaskPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  OPTIONAL = 'optional',
}

/**
 * Milestone type enum
 */
export enum MilestoneType {
  START = 'start',
  CHECKPOINT = 'checkpoint',
  DELIVERABLE = 'deliverable',
  INTEGRATION_POINT = 'integration_point',
  COMPLETION = 'completion',
}

/**
 * The relationship between a parent and child task
 */
export enum ParentChildRelationship {
  DECOMPOSITION = 'decomposition', // Child is a smaller part of parent
  REFINEMENT = 'refinement', // Child is a more detailed version of parent
  IMPLEMENTATION = 'implementation', // Child implements parent concept
  EXTENSION = 'extension', // Child extends parent functionality
  ALTERNATIVE = 'alternative', // Child is an alternative approach to parent
}

/**
 * Milestone definition for tracking progress
 */
export interface TaskMilestone {
  id: string;
  taskId: string;
  name: string;
  description: string;
  type: MilestoneType;
  criteria: string; // Criteria to meet for this milestone
  status: 'pending' | 'in_progress' | 'achieved' | 'missed';
  dueDate?: number; // Timestamp for when milestone should be reached
  achievedAt?: number; // Timestamp when milestone was achieved
  progress: number; // 0-100 percentage complete
  metadata?: Record<string, any>;
}

/**
 * Subtask assignment details
 */
export interface SubtaskAssignment {
  id: string;
  parentTaskId: string;
  childTaskId: string;
  assignedAgentId?: string;
  relationshipType: ParentChildRelationship;
  assignedAt: number;
  acceptedAt?: number;
  startedAt?: number;
  completedAt?: number;
  status: 'pending' | 'accepted' | 'rejected' | 'in_progress' | 'completed' | 'failed';
  priority: TaskPriority;
  metadata?: Record<string, any>;
}

/**
 * Hierarchical task structure supporting parent-child relationships
 */
export interface HierarchicalTask {
  id: string;
  name: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  complexity: ComplexityLevel;
  parentTaskId?: string;
  childTaskIds: string[];
  dependencies: TaskDependency[];
  resourceRequirements: ResourceRequirement[];
  milestones: TaskMilestone[];
  assignedAgentId?: string;
  assignedTeamId?: string;
  deadlineTimestamp?: number;
  estimatedDuration: number; // In milliseconds
  startedAt?: number;
  completedAt?: number;
  progress: number; // 0-100 percentage complete
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
}

/**
 * Task hierarchy interface for managing parent-child relationships
 */
export interface TaskHierarchyManager {
  createTask(details: Omit<HierarchicalTask, 'id' | 'childTaskIds' | 'createdAt' | 'updatedAt' | 'progress'>): Promise<HierarchicalTask>;
  getTask(taskId: string): Promise<HierarchicalTask | null>;
  updateTask(taskId: string, updates: Partial<HierarchicalTask>): Promise<HierarchicalTask>;
  deleteTask(taskId: string): Promise<boolean>;
  
  // Parent-child relationship management
  addChildTask(parentTaskId: string, childTask: Omit<HierarchicalTask, 'id' | 'parentTaskId' | 'childTaskIds' | 'createdAt' | 'updatedAt' | 'progress'>, 
              relationshipType: ParentChildRelationship): Promise<SubtaskAssignment>;
  removeChildTask(parentTaskId: string, childTaskId: string): Promise<boolean>;
  getChildTasks(parentTaskId: string): Promise<HierarchicalTask[]>;
  getParentTask(childTaskId: string): Promise<HierarchicalTask | null>;
  getTaskHierarchy(rootTaskId: string): Promise<HierarchicalTask[]>;
  
  // Milestone management
  addMilestone(taskId: string, milestone: Omit<TaskMilestone, 'id' | 'taskId'>): Promise<TaskMilestone>;
  updateMilestone(milestoneId: string, updates: Partial<TaskMilestone>): Promise<TaskMilestone>;
  getMilestones(taskId: string): Promise<TaskMilestone[]>;
  achieveMilestone(milestoneId: string): Promise<TaskMilestone>;
  
  // Task delegation
  assignTask(taskId: string, agentId: string): Promise<HierarchicalTask>;
  reassignTask(taskId: string, newAgentId: string): Promise<HierarchicalTask>;
  delegateSubtasks(parentTaskId: string, assignments: Array<{childTaskId: string, agentId: string}>): Promise<SubtaskAssignment[]>;
}

/**
 * Factory function to create a new Hierarchical Task
 */
export function createHierarchicalTask(
  name: string,
  description: string,
  priority: TaskPriority,
  complexity: ComplexityLevel,
  estimatedDuration: number,
  parentTaskId?: string,
): HierarchicalTask {
  return {
    id: uuidv4(),
    name,
    description,
    status: TaskStatus.DRAFT,
    priority,
    complexity,
    parentTaskId,
    childTaskIds: [],
    dependencies: [],
    resourceRequirements: [],
    milestones: [],
    estimatedDuration,
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {},
  };
}

/**
 * Factory function to create a new Task Milestone
 */
export function createTaskMilestone(
  name: string,
  description: string,
  type: MilestoneType,
  criteria: string,
): Omit<TaskMilestone, 'id' | 'taskId'> {
  return {
    name,
    description,
    type,
    criteria,
    status: 'pending',
    progress: 0,
    metadata: {},
  };
} 