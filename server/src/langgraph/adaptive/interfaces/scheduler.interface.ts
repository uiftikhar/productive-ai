/**
 * Interfaces for the Priority-Based Scheduler
 * 
 * These interfaces define the core types and structures for priority-based,
 * context-aware, and dependency-aware task scheduling.
 */

/**
 * Priority level for tasks
 */
export enum PriorityLevel {
  CRITICAL = 'critical',   // Must be executed immediately
  HIGH = 'high',           // Should be executed soon
  MEDIUM = 'medium',       // Standard priority
  LOW = 'low',             // Can be delayed if needed
  BACKGROUND = 'background' // Execute when resources are available
}

/**
 * Task status in the scheduling system
 */
export enum TaskScheduleStatus {
  QUEUED = 'queued',           // Waiting in priority queue
  SCHEDULED = 'scheduled',     // Scheduled but not yet running
  RUNNING = 'running',         // Currently executing
  BLOCKED = 'blocked',         // Blocked by dependency or resource
  COMPLETED = 'completed',     // Successfully completed
  FAILED = 'failed',           // Failed execution
  CANCELED = 'canceled'        // Explicitly canceled
}

/**
 * Deadline specification for tasks
 */
export interface TaskDeadline {
  type: 'absolute' | 'relative';
  value: number; // Timestamp or duration in ms
  flexibility: number; // How flexible is this deadline (0-1)
  critical: boolean; // Is meeting this deadline critical
}

/**
 * Contextual factors that influence scheduling decisions
 */
export interface SchedulingContext {
  urgency: number; // 0-1 scale of urgency
  importance: number; // 0-1 scale of task importance
  userExpectation: number; // 0-1 scale of user expectation for quick execution
  systemLoad: number; // 0-1 scale of system load
  timeOfDay?: Date; // Current time, for time-sensitive scheduling
  environmentFactors?: Record<string, any>; // Additional environmental context
}

/**
 * Definition of task dependencies
 */
export interface TaskDependency {
  taskId: string; // ID of the dependent task
  type: 'hard' | 'soft'; // Hard: must complete before, Soft: preferable but not required
  condition?: (dependentTaskResult: any) => boolean; // Optional condition for dependency
  dataMapping?: Record<string, string>; // Mapping of data from dependency to this task
}

/**
 * A schedulable task with priority and dependency information
 */
export interface SchedulableTask {
  id: string;
  name: string;
  description?: string;
  priority: PriorityLevel;
  estimatedDuration: number; // In milliseconds
  deadline?: TaskDeadline;
  dependencies: TaskDependency[];
  resourceRequirements: string[]; // IDs of required resources/capabilities
  context?: Record<string, any>; // Task-specific context
  payload: any; // The actual data/task to execute
  status: TaskScheduleStatus;
  weight?: number; // Calculated priority weight (higher = more priority)
  insertedAt: Date; // When the task was added to the scheduler
  scheduledAt?: Date; // When the task was scheduled
  startedAt?: Date; // When the task started execution
  completedAt?: Date; // When the task completed/failed/canceled
}

/**
 * Task queue interface for the scheduler
 */
export interface TaskQueue {
  enqueue(task: SchedulableTask): void;
  dequeue(): SchedulableTask | undefined;
  peek(): SchedulableTask | undefined;
  update(taskId: string, updates: Partial<SchedulableTask>): boolean;
  remove(taskId: string): boolean;
  getAll(): SchedulableTask[];
  getById(taskId: string): SchedulableTask | undefined;
  size(): number;
  isEmpty(): boolean;
}

/**
 * Interface for the main priority-based scheduler
 */
export interface PriorityScheduler {
  addTask(task: Omit<SchedulableTask, 'status' | 'insertedAt' | 'weight'>): string;
  updateTaskPriority(taskId: string, priority: PriorityLevel): boolean;
  cancelTask(taskId: string): boolean;
  getNextTask(): SchedulableTask | undefined;
  scheduleTask(taskId: string): boolean;
  markTaskRunning(taskId: string): boolean;
  markTaskCompleted(taskId: string, result?: any): boolean;
  markTaskFailed(taskId: string, error?: any): boolean;
  getReadyTasks(): SchedulableTask[];
  getTaskById(taskId: string): SchedulableTask | undefined;
  getAllTasks(): SchedulableTask[];
  updateSchedulingContext(context: Partial<SchedulingContext>): void;
  getCurrentContext(): SchedulingContext;
  recalculatePriorities(): void;
}

/**
 * Interface for context-aware scheduling logic
 */
export interface ContextAwareScheduler {
  evaluateContext(task: SchedulableTask, context: SchedulingContext): number;
  adaptToContextChange(context: Partial<SchedulingContext>): void;
  getSituationalPriority(task: SchedulableTask): number;
  getContextualInsights(): Record<string, any>;
}

/**
 * Interface for the dependency-aware queue
 */
export interface DependencyAwareQueue extends TaskQueue {
  getDependents(taskId: string): SchedulableTask[];
  getDependencies(taskId: string): SchedulableTask[];
  isBlocked(taskId: string): boolean;
  isReadyToExecute(taskId: string): boolean;
  updateTaskStatus(taskId: string, status: TaskScheduleStatus, result?: any): void;
  optimizeExecutionOrder(): SchedulableTask[];
} 