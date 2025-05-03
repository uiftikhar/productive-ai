import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  PriorityLevel,
  SchedulableTask,
  SchedulingContext,
  TaskQueue,
  TaskScheduleStatus,
} from '../interfaces/scheduler.interface';

/**
 * Priority calculator function type
 */
export type PriorityCalculatorFn = (
  task: SchedulableTask,
  context: SchedulingContext,
) => number;

/**
 * Default priority weights for different priority levels
 */
const DEFAULT_PRIORITY_WEIGHTS: Record<PriorityLevel, number> = {
  [PriorityLevel.CRITICAL]: 100,
  [PriorityLevel.HIGH]: 80,
  [PriorityLevel.MEDIUM]: 60,
  [PriorityLevel.LOW]: 40,
  [PriorityLevel.BACKGROUND]: 20,
};

/**
 * A task queue implementation that prioritizes tasks based on their weight
 */
export class PriorityTaskQueue implements TaskQueue {
  private tasks: Map<string, SchedulableTask> = new Map();
  private logger: Logger;
  private sortedTaskIds: string[] = [];
  private needsResorting: boolean = true;

  constructor(options: { logger?: Logger } = {}) {
    this.logger = options.logger || new ConsoleLogger();
  }

  /**
   * Add a task to the queue
   */
  enqueue(task: SchedulableTask): void {
    this.tasks.set(task.id, task);
    this.needsResorting = true;
    this.logger.debug(`Task ${task.id} added to priority queue`, {
      taskId: task.id,
      priority: task.priority,
      weight: task.weight,
    });
  }

  /**
   * Remove and return the highest priority task
   */
  dequeue(): SchedulableTask | undefined {
    if (this.isEmpty()) {
      return undefined;
    }

    if (this.needsResorting) {
      this.resort();
    }

    const taskId = this.sortedTaskIds.shift();
    if (!taskId) {
      return undefined;
    }

    const task = this.tasks.get(taskId);
    if (task) {
      this.tasks.delete(taskId);
      this.logger.debug(`Task ${taskId} removed from priority queue`, {
        taskId,
        priority: task.priority,
        weight: task.weight,
      });
    }
    return task;
  }

  /**
   * Look at the highest priority task without removing it
   */
  peek(): SchedulableTask | undefined {
    if (this.isEmpty()) {
      return undefined;
    }

    if (this.needsResorting) {
      this.resort();
    }

    const taskId = this.sortedTaskIds[0];
    return taskId ? this.tasks.get(taskId) : undefined;
  }

  /**
   * Update a task in the queue
   */
  update(taskId: string, updates: Partial<SchedulableTask>): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    this.tasks.set(taskId, { ...task, ...updates });
    this.needsResorting = true;
    this.logger.debug(`Task ${taskId} updated in priority queue`, {
      taskId,
      updates,
    });
    return true;
  }

  /**
   * Remove a task from the queue
   */
  remove(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    this.tasks.delete(taskId);
    this.needsResorting = true;
    this.logger.debug(`Task ${taskId} removed from priority queue`, { taskId });
    return true;
  }

  /**
   * Get all tasks in the queue
   */
  getAll(): SchedulableTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get a task by its ID
   */
  getById(taskId: string): SchedulableTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get the number of tasks in the queue
   */
  size(): number {
    return this.tasks.size;
  }

  /**
   * Check if the queue is empty
   */
  isEmpty(): boolean {
    return this.tasks.size === 0;
  }

  /**
   * Resort the tasks based on their weight
   */
  private resort(): void {
    this.sortedTaskIds = Array.from(this.tasks.keys()).sort((a, b) => {
      const taskA = this.tasks.get(a);
      const taskB = this.tasks.get(b);
      if (!taskA || !taskB) {
        return 0;
      }

      // Sort by weight (higher first), then by insertion time (earlier first)
      const weightA = taskA.weight || 0;
      const weightB = taskB.weight || 0;
      if (weightB !== weightA) {
        return weightB - weightA;
      }

      // If weights are equal, sort by insertion time
      return taskA.insertedAt.getTime() - taskB.insertedAt.getTime();
    });
    this.needsResorting = false;
  }
}

/**
 * Dynamic prioritization service for adaptive task scheduling
 */
export class DynamicPrioritizationService {
  private logger: Logger;
  private taskQueue: PriorityTaskQueue;
  private currentContext: SchedulingContext;
  private priorityCalculator: PriorityCalculatorFn;
  private priorityWeights: Record<PriorityLevel, number>;

  constructor(
    options: {
      logger?: Logger;
      initialContext?: Partial<SchedulingContext>;
      priorityCalculator?: PriorityCalculatorFn;
      priorityWeights?: Partial<Record<PriorityLevel, number>>;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.taskQueue = new PriorityTaskQueue({ logger: this.logger });
    this.priorityWeights = {
      ...DEFAULT_PRIORITY_WEIGHTS,
      ...(options.priorityWeights || {}),
    };

    // Initialize current context with default values
    this.currentContext = {
      urgency: 0.5,
      importance: 0.5,
      userExpectation: 0.5,
      systemLoad: 0.5,
      ...(options.initialContext || {}),
    };

    // Use custom or default priority calculator
    this.priorityCalculator =
      options.priorityCalculator || this.defaultPriorityCalculator.bind(this);

    this.logger.info('Dynamic prioritization service initialized', {
      initialContext: this.currentContext,
      priorityWeights: this.priorityWeights,
    });
  }

  /**
   * Default priority calculator function
   */
  private defaultPriorityCalculator(
    task: SchedulableTask,
    context: SchedulingContext,
  ): number {
    // Start with base priority weight
    let weight =
      this.priorityWeights[task.priority] ||
      DEFAULT_PRIORITY_WEIGHTS[PriorityLevel.MEDIUM];

    // Adjust for urgency
    if (task.deadline) {
      const now = Date.now();
      const deadline =
        task.deadline.type === 'absolute'
          ? task.deadline.value
          : now + task.deadline.value;

      // Calculate time remaining as percentage of estimated duration
      const timeRemaining = deadline - now;
      const urgencyFactor = Math.max(
        0,
        Math.min(1, task.estimatedDuration / (timeRemaining || 1)),
      );

      // Critical deadlines get higher weight boost
      const deadlineBoost = task.deadline.critical ? 1.5 : 1;

      // Adjust weight based on urgency and deadline criticality
      weight +=
        weight *
        urgencyFactor *
        deadlineBoost *
        (1 - task.deadline.flexibility);
    }

    // Adjust for context factors
    weight += weight * 0.2 * context.urgency; // Up to 20% boost for system urgency
    weight += weight * 0.2 * context.importance; // Up to 20% boost for importance
    weight += weight * 0.1 * context.userExpectation; // Up to 10% boost for user expectation

    // Penalize weight if system is under high load, except for critical tasks
    if (task.priority !== PriorityLevel.CRITICAL) {
      weight -= weight * 0.1 * context.systemLoad; // Up to 10% reduction under load
    }

    // Adjust weight based on dependencies
    const dependencyCount = task.dependencies.length;
    if (dependencyCount > 0) {
      // Tasks with more dependencies get lower priority (they'll likely have to wait)
      weight -= weight * 0.05 * dependencyCount; // 5% reduction per dependency
    }

    // Adjust weight based on resource requirements
    const resourceCount = task.resourceRequirements.length;
    if (resourceCount > 0) {
      // Tasks with more resource requirements might be harder to schedule
      weight -= weight * 0.02 * resourceCount; // 2% reduction per required resource
    }

    // Ensure weight is positive
    return Math.max(1, weight);
  }

  /**
   * Add a task to be prioritized
   */
  addTask(
    task: Omit<SchedulableTask, 'status' | 'insertedAt' | 'weight'>,
  ): string {
    const taskId = task.id || uuidv4();
    const now = new Date();

    // Create complete task object
    const completeTask: SchedulableTask = {
      ...task,
      id: taskId,
      status: TaskScheduleStatus.QUEUED,
      insertedAt: now,
      weight: 0, // Will be calculated
      dependencies: task.dependencies || [],
      resourceRequirements: task.resourceRequirements || [],
    };

    // Calculate initial priority weight
    completeTask.weight = this.priorityCalculator(
      completeTask,
      this.currentContext,
    );

    // Add to queue
    this.taskQueue.enqueue(completeTask);

    this.logger.info('Task added to dynamic prioritization', {
      taskId,
      priority: completeTask.priority,
      weight: completeTask.weight,
    });

    return taskId;
  }

  /**
   * Update a task's priority
   */
  updateTaskPriority(taskId: string, priority: PriorityLevel): boolean {
    const task = this.taskQueue.getById(taskId);
    if (!task) {
      this.logger.warn(
        `Cannot update priority for non-existent task ${taskId}`,
      );
      return false;
    }

    const updatedTask = { ...task, priority };
    updatedTask.weight = this.priorityCalculator(
      updatedTask,
      this.currentContext,
    );

    const result = this.taskQueue.update(taskId, updatedTask);

    this.logger.info('Task priority updated', {
      taskId,
      oldPriority: task.priority,
      newPriority: priority,
      newWeight: updatedTask.weight,
    });

    return result;
  }

  /**
   * Update the scheduling context and recalculate priorities
   */
  updateContext(context: Partial<SchedulingContext>): void {
    this.currentContext = { ...this.currentContext, ...context };
    this.logger.info('Scheduling context updated', {
      context: this.currentContext,
    });
    this.recalculateAllPriorities();
  }

  /**
   * Get the current scheduling context
   */
  getContext(): SchedulingContext {
    return { ...this.currentContext };
  }

  /**
   * Recalculate priorities for all tasks
   */
  recalculateAllPriorities(): void {
    for (const task of this.taskQueue.getAll()) {
      const updatedWeight = this.priorityCalculator(task, this.currentContext);
      if (updatedWeight !== task.weight) {
        this.taskQueue.update(task.id, { ...task, weight: updatedWeight });
      }
    }

    this.logger.info('Recalculated all task priorities', {
      taskCount: this.taskQueue.size(),
    });
  }

  /**
   * Get the next highest priority task without removing it
   */
  peekNextTask(): SchedulableTask | undefined {
    return this.taskQueue.peek();
  }

  /**
   * Remove and return the next highest priority task
   */
  getNextTask(): SchedulableTask | undefined {
    return this.taskQueue.dequeue();
  }

  /**
   * Get all tasks sorted by priority
   */
  getAllTasks(): SchedulableTask[] {
    return this.taskQueue
      .getAll()
      .sort((a, b) => (b.weight || 0) - (a.weight || 0));
  }

  /**
   * Get a specific task by ID
   */
  getTaskById(taskId: string): SchedulableTask | undefined {
    return this.taskQueue.getById(taskId);
  }

  /**
   * Update a task in the queue
   */
  updateTask(taskId: string, updates: Partial<SchedulableTask>): boolean {
    const task = this.taskQueue.getById(taskId);
    if (!task) {
      return false;
    }

    const updatedTask = { ...task, ...updates };

    // If anything that affects priority was changed, recalculate the weight
    if (
      updates.priority !== undefined ||
      updates.deadline !== undefined ||
      updates.dependencies !== undefined ||
      updates.resourceRequirements !== undefined
    ) {
      updatedTask.weight = this.priorityCalculator(
        updatedTask,
        this.currentContext,
      );
    }

    return this.taskQueue.update(taskId, updatedTask);
  }

  /**
   * Remove a task from the queue
   */
  removeTask(taskId: string): boolean {
    return this.taskQueue.remove(taskId);
  }

  /**
   * Get the current size of the task queue
   */
  getQueueSize(): number {
    return this.taskQueue.size();
  }

  /**
   * Check if the task queue is empty
   */
  isQueueEmpty(): boolean {
    return this.taskQueue.isEmpty();
  }

  /**
   * Set custom priority weights
   */
  setPriorityWeights(weights: Partial<Record<PriorityLevel, number>>): void {
    this.priorityWeights = { ...this.priorityWeights, ...weights };
    this.logger.info('Priority weights updated', {
      priorityWeights: this.priorityWeights,
    });
    this.recalculateAllPriorities();
  }

  /**
   * Get current priority weights
   */
  getPriorityWeights(): Record<PriorityLevel, number> {
    return { ...this.priorityWeights };
  }

  /**
   * Set a custom priority calculator function
   */
  setPriorityCalculator(calculator: PriorityCalculatorFn): void {
    this.priorityCalculator = calculator;
    this.logger.info('Priority calculator function updated');
    this.recalculateAllPriorities();
  }
}
