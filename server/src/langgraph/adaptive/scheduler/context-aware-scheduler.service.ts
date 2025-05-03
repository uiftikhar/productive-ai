import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  ContextAwareScheduler,
  PriorityLevel,
  PriorityScheduler,
  SchedulableTask,
  SchedulingContext,
  TaskDeadline,
  TaskQueue,
  TaskScheduleStatus,
} from '../interfaces/scheduler.interface';
import { DynamicPrioritizationService } from './dynamic-prioritization.service';

/**
 * Contextual insight to influence scheduling
 */
export interface ContextualInsight {
  id: string;
  type: 'observation' | 'recommendation' | 'warning' | 'prediction';
  source: string;
  description: string;
  relevantTaskIds: string[];
  relevantContextFactors: string[];
  confidence: number; // 0-1
  impact: number; // 0-1 significance of this insight
  timestamp: Date;
  expiresAt?: Date; // When this insight is no longer relevant
  metadata?: Record<string, any>;
}

/**
 * Context pattern for pattern-matching
 */
export interface ContextPattern {
  id: string;
  name: string;
  description: string;
  contextConditions: {
    factor: string;
    operator:
      | 'eq'
      | 'ne'
      | 'gt'
      | 'lt'
      | 'gte'
      | 'lte'
      | 'between'
      | 'contains';
    value: any;
    value2?: any; // For 'between' operator
  }[];
  taskConditions?: {
    property: string;
    operator:
      | 'eq'
      | 'ne'
      | 'gt'
      | 'lt'
      | 'gte'
      | 'lte'
      | 'between'
      | 'contains';
    value: any;
    value2?: any; // For 'between' operator
  }[];
  priorityAdjustment?: number; // Multiplicative factor for priority
  recommendedAction?: {
    type: string;
    parameters: Record<string, any>;
  };
  patternWeight: number; // How important is this pattern (0-1)
}

/**
 * Context-aware scheduler service for situational execution
 */
export class ContextAwareSchedulerService
  implements ContextAwareScheduler, PriorityScheduler
{
  private logger: Logger;
  private prioritizationService: DynamicPrioritizationService;
  private insights: ContextualInsight[] = [];
  private contextPatterns: ContextPattern[] = [];
  private taskCompletionCallbacks: Map<
    string,
    ((task: SchedulableTask) => void)[]
  > = new Map();
  private schedulingHistory: {
    timestamp: Date;
    action: string;
    taskId?: string;
    context: Partial<SchedulingContext>;
    result?: any;
  }[] = [];

  constructor(
    options: {
      logger?: Logger;
      initialContext?: Partial<SchedulingContext>;
      prioritizationService?: DynamicPrioritizationService;
      contextPatterns?: ContextPattern[];
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();

    // Use provided prioritization service or create a new one
    this.prioritizationService =
      options.prioritizationService ||
      new DynamicPrioritizationService({
        logger: this.logger,
        initialContext: options.initialContext,
      });

    // Initialize context patterns
    if (options.contextPatterns && options.contextPatterns.length > 0) {
      this.contextPatterns = [...options.contextPatterns];
    } else {
      this.initializeDefaultPatterns();
    }

    this.logger.info('Context-aware scheduler service initialized', {
      patternCount: this.contextPatterns.length,
    });
  }

  /**
   * Initialize default context patterns
   */
  private initializeDefaultPatterns(): void {
    // High system load pattern
    this.contextPatterns.push({
      id: uuidv4(),
      name: 'High System Load',
      description:
        'System is under high load, prioritize critical tasks and delay background tasks',
      contextConditions: [{ factor: 'systemLoad', operator: 'gt', value: 0.8 }],
      taskConditions: [
        {
          property: 'priority',
          operator: 'eq',
          value: PriorityLevel.BACKGROUND,
        },
      ],
      priorityAdjustment: 0.5, // Reduce priority by half
      recommendedAction: {
        type: 'delay',
        parameters: { delayMs: 5000 },
      },
      patternWeight: 0.8,
    });

    // High urgency pattern
    this.contextPatterns.push({
      id: uuidv4(),
      name: 'High Urgency',
      description: 'System urgency is high, boost priority of all tasks',
      contextConditions: [{ factor: 'urgency', operator: 'gt', value: 0.7 }],
      priorityAdjustment: 1.3, // Boost priority by 30%
      patternWeight: 0.7,
    });

    // Approaching deadline pattern
    this.contextPatterns.push({
      id: uuidv4(),
      name: 'Approaching Deadline',
      description: 'Task deadline is approaching, boost priority',
      contextConditions: [], // Empty, applies to all contexts
      taskConditions: [
        { property: 'deadline', operator: 'contains', value: true },
      ],
      priorityAdjustment: 1.5, // Boost priority by 50%
      patternWeight: 0.9,
    });

    this.logger.debug('Initialized default context patterns', {
      patternCount: this.contextPatterns.length,
    });
  }

  /**
   * Evaluate context for a specific task
   */
  evaluateContext(task: SchedulableTask, context: SchedulingContext): number {
    // Base priority weight from the dynamic prioritization service
    const baseWeight =
      this.prioritizationService.getTaskById(task.id)?.weight || 0;

    // Apply context patterns
    let adjustedWeight = baseWeight;
    const matchedPatterns: ContextPattern[] = [];

    for (const pattern of this.contextPatterns) {
      if (this.matchesContextPattern(task, context, pattern)) {
        matchedPatterns.push(pattern);

        // Apply priority adjustment if specified
        if (pattern.priorityAdjustment !== undefined) {
          adjustedWeight *= pattern.priorityAdjustment;
        }
      }
    }

    // Generate insights from matched patterns
    if (matchedPatterns.length > 0) {
      this.logger.debug(
        `Task ${task.id} matched ${matchedPatterns.length} context patterns`,
        {
          taskId: task.id,
          patterns: matchedPatterns.map((p) => p.name),
        },
      );

      // Add insight for significant adjustments
      if (Math.abs(adjustedWeight - baseWeight) / baseWeight > 0.2) {
        this.addInsight({
          type: 'observation',
          source: 'context-pattern-matching',
          description: `Task priority significantly adjusted due to context patterns: ${matchedPatterns.map((p) => p.name).join(', ')}`,
          relevantTaskIds: [task.id],
          relevantContextFactors: matchedPatterns.flatMap((p) =>
            p.contextConditions.map((c) => c.factor),
          ),
          confidence: 0.8,
          impact: 0.7,
          metadata: {
            baseWeight,
            adjustedWeight,
            patterns: matchedPatterns.map((p) => p.id),
          },
        });
      }
    }

    return Math.max(1, adjustedWeight);
  }

  /**
   * Check if a task matches a context pattern
   */
  private matchesContextPattern(
    task: SchedulableTask,
    context: SchedulingContext,
    pattern: ContextPattern,
  ): boolean {
    // Check context conditions
    for (const condition of pattern.contextConditions) {
      const contextValue = context[condition.factor as keyof SchedulingContext];

      if (
        !this.evaluateCondition(
          contextValue,
          condition.operator,
          condition.value,
          condition.value2,
        )
      ) {
        return false;
      }
    }

    // Check task conditions if present
    if (pattern.taskConditions && pattern.taskConditions.length > 0) {
      for (const condition of pattern.taskConditions) {
        // Handle special case for deadline
        if (
          condition.property === 'deadline' &&
          condition.operator === 'contains'
        ) {
          // Check if deadline exists (or doesn't if value is false)
          if (condition.value && !task.deadline) {
            return false;
          } else if (!condition.value && task.deadline) {
            return false;
          }
          continue;
        }

        // Regular property check
        const propertyValue = this.getNestedProperty(task, condition.property);
        if (
          !this.evaluateCondition(
            propertyValue,
            condition.operator,
            condition.value,
            condition.value2,
          )
        ) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Helper to get a nested property using dot notation
   */
  private getNestedProperty(obj: any, path: string): any {
    return path
      .split('.')
      .reduce((o, p) => (o && o[p] !== undefined ? o[p] : undefined), obj);
  }

  /**
   * Evaluate a condition with various operators
   */
  private evaluateCondition(
    actual: any,
    operator: string,
    expected: any,
    expected2?: any,
  ): boolean {
    switch (operator) {
      case 'eq':
        return actual === expected;
      case 'ne':
        return actual !== expected;
      case 'gt':
        return actual > expected;
      case 'lt':
        return actual < expected;
      case 'gte':
        return actual >= expected;
      case 'lte':
        return actual <= expected;
      case 'between':
        return (
          actual >= expected &&
          actual <= (expected2 !== undefined ? expected2 : expected)
        );
      case 'contains':
        if (typeof actual === 'string') {
          return actual.includes(expected);
        } else if (Array.isArray(actual)) {
          return actual.includes(expected);
        } else if (typeof actual === 'object' && actual !== null) {
          return expected in actual;
        }
        return false;
      default:
        return false;
    }
  }

  /**
   * Adapt scheduler to context changes
   */
  adaptToContextChange(context: Partial<SchedulingContext>): void {
    // Log the context change
    this.logger.info('Adapting to context change', { context });

    // Record in scheduling history
    this.schedulingHistory.push({
      timestamp: new Date(),
      action: 'context_change',
      context,
    });

    // Update the context in the prioritization service
    this.prioritizationService.updateContext(context);

    // Check for matching patterns and generate insights
    this.analyzeContextChange(context);
  }

  /**
   * Analyze a context change for patterns and insights
   */
  private analyzeContextChange(
    contextChange: Partial<SchedulingContext>,
  ): void {
    const currentContext = this.getCurrentContext();
    const tasks = this.getAllTasks();
    const matchingPatterns: { pattern: ContextPattern; taskIds: string[] }[] =
      [];

    // Find patterns that match the current context
    for (const pattern of this.contextPatterns) {
      const matchingTasks: string[] = [];

      // Check just the context conditions first
      let contextConditionsMatch = true;
      for (const condition of pattern.contextConditions) {
        const contextValue =
          currentContext[condition.factor as keyof SchedulingContext];
        if (
          !this.evaluateCondition(
            contextValue,
            condition.operator,
            condition.value,
            condition.value2,
          )
        ) {
          contextConditionsMatch = false;
          break;
        }
      }

      // If context conditions match, find matching tasks
      if (contextConditionsMatch) {
        if (!pattern.taskConditions || pattern.taskConditions.length === 0) {
          // Pattern applies to all tasks
          matchingTasks.push(...tasks.map((t) => t.id));
        } else {
          // Check which tasks match the task conditions
          for (const task of tasks) {
            let taskMatches = true;
            for (const condition of pattern.taskConditions) {
              const propertyValue = this.getNestedProperty(
                task,
                condition.property,
              );
              if (
                !this.evaluateCondition(
                  propertyValue,
                  condition.operator,
                  condition.value,
                  condition.value2,
                )
              ) {
                taskMatches = false;
                break;
              }
            }
            if (taskMatches) {
              matchingTasks.push(task.id);
            }
          }
        }

        if (matchingTasks.length > 0) {
          matchingPatterns.push({ pattern, taskIds: matchingTasks });
        }
      }
    }

    // Generate insights from matching patterns
    for (const { pattern, taskIds } of matchingPatterns) {
      if (pattern.recommendedAction) {
        this.addInsight({
          type: 'recommendation',
          source: 'context-pattern-matching',
          description: `Pattern "${pattern.name}" suggests action: ${pattern.recommendedAction.type}`,
          relevantTaskIds: taskIds,
          relevantContextFactors: pattern.contextConditions.map(
            (c) => c.factor,
          ),
          confidence: 0.75,
          impact: pattern.patternWeight,
          metadata: {
            patternId: pattern.id,
            action: pattern.recommendedAction,
          },
        });
      } else {
        this.addInsight({
          type: 'observation',
          source: 'context-pattern-matching',
          description: `Pattern "${pattern.name}" detected: ${pattern.description}`,
          relevantTaskIds: taskIds,
          relevantContextFactors: pattern.contextConditions.map(
            (c) => c.factor,
          ),
          confidence: 0.8,
          impact: pattern.patternWeight,
          metadata: {
            patternId: pattern.id,
          },
        });
      }
    }
  }

  /**
   * Calculate situational priority for a task
   */
  getSituationalPriority(task: SchedulableTask): number {
    return this.evaluateContext(task, this.getCurrentContext());
  }

  /**
   * Get contextual insights affecting scheduling
   */
  getContextualInsights(): Record<string, any> {
    // Clean up expired insights
    const now = new Date();
    this.insights = this.insights.filter(
      (insight) => !insight.expiresAt || insight.expiresAt > now,
    );

    // Group insights by type
    const groupedInsights = {
      observations: this.insights.filter((i) => i.type === 'observation'),
      recommendations: this.insights.filter((i) => i.type === 'recommendation'),
      warnings: this.insights.filter((i) => i.type === 'warning'),
      predictions: this.insights.filter((i) => i.type === 'prediction'),
    };

    // Get most relevant insights by impact
    const mostRelevant = [...this.insights]
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 5);

    // Get insights affecting each task
    const taskInsights: Record<string, ContextualInsight[]> = {};
    const allTasks = this.getAllTasks();

    for (const task of allTasks) {
      taskInsights[task.id] = this.insights.filter((insight) =>
        insight.relevantTaskIds.includes(task.id),
      );
    }

    return {
      byType: groupedInsights,
      mostRelevant,
      byTask: taskInsights,
      count: this.insights.length,
      timestamp: new Date(),
    };
  }

  /**
   * Add a new contextual insight
   */
  private addInsight(
    insightData: Omit<ContextualInsight, 'id' | 'timestamp'>,
  ): string {
    const id = uuidv4();
    const insight: ContextualInsight = {
      ...insightData,
      id,
      timestamp: new Date(),
    };

    this.insights.push(insight);
    this.logger.debug('Added contextual insight', {
      insightId: id,
      type: insight.type,
    });

    // Limit the number of insights to prevent memory issues
    if (this.insights.length > 100) {
      // Remove oldest insights
      this.insights.sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );
      this.insights = this.insights.slice(-100);
    }

    return id;
  }

  /**
   * Add a new context pattern
   */
  addContextPattern(pattern: Omit<ContextPattern, 'id'>): string {
    const id = uuidv4();
    const newPattern: ContextPattern = {
      ...pattern,
      id,
    };

    this.contextPatterns.push(newPattern);
    this.logger.info('Added new context pattern', {
      patternId: id,
      name: pattern.name,
    });

    return id;
  }

  /**
   * Remove a context pattern
   */
  removeContextPattern(patternId: string): boolean {
    const initialLength = this.contextPatterns.length;
    this.contextPatterns = this.contextPatterns.filter(
      (p) => p.id !== patternId,
    );

    const removed = initialLength > this.contextPatterns.length;
    if (removed) {
      this.logger.info('Removed context pattern', { patternId });
    }

    return removed;
  }

  /**
   * Get all registered context patterns
   */
  getContextPatterns(): ContextPattern[] {
    return [...this.contextPatterns];
  }

  /**
   * Register a callback for when a task completes
   */
  onTaskComplete(
    taskId: string,
    callback: (task: SchedulableTask) => void,
  ): void {
    if (!this.taskCompletionCallbacks.has(taskId)) {
      this.taskCompletionCallbacks.set(taskId, []);
    }
    this.taskCompletionCallbacks.get(taskId)?.push(callback);
  }

  /**
   * Get scheduling history
   */
  getSchedulingHistory(): any[] {
    return [...this.schedulingHistory];
  }

  // --- Implementation of PriorityScheduler interface ---

  /**
   * Add a task to the scheduler
   */
  addTask(
    task: Omit<SchedulableTask, 'status' | 'insertedAt' | 'weight'>,
  ): string {
    const taskId = this.prioritizationService.addTask(task);

    // Record in scheduling history
    this.schedulingHistory.push({
      timestamp: new Date(),
      action: 'add_task',
      taskId,
      context: this.getCurrentContext(),
    });

    return taskId;
  }

  /**
   * Update a task's priority
   */
  updateTaskPriority(taskId: string, priority: PriorityLevel): boolean {
    const result = this.prioritizationService.updateTaskPriority(
      taskId,
      priority,
    );

    if (result) {
      // Record in scheduling history
      this.schedulingHistory.push({
        timestamp: new Date(),
        action: 'update_priority',
        taskId,
        context: {
          importance:
            priority === PriorityLevel.CRITICAL
              ? 1.0
              : priority === PriorityLevel.HIGH
                ? 0.8
                : priority === PriorityLevel.MEDIUM
                  ? 0.6
                  : priority === PriorityLevel.LOW
                    ? 0.4
                    : 0.2,
        },
      });
    }

    return result;
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): boolean {
    const task = this.getTaskById(taskId);
    if (!task) {
      return false;
    }

    const result = this.prioritizationService.updateTask(taskId, {
      status: TaskScheduleStatus.CANCELED,
      completedAt: new Date(),
    });

    if (result) {
      // Record in scheduling history
      this.schedulingHistory.push({
        timestamp: new Date(),
        action: 'cancel_task',
        taskId,
        context: this.getCurrentContext(),
      });
    }

    return result;
  }

  /**
   * Get the next task to execute
   */
  getNextTask(): SchedulableTask | undefined {
    const task = this.prioritizationService.getNextTask();

    if (task) {
      // Record in scheduling history
      this.schedulingHistory.push({
        timestamp: new Date(),
        action: 'get_next_task',
        taskId: task.id,
        context: this.getCurrentContext(),
        result: {
          taskId: task.id,
          priority: task.priority,
          weight: task.weight,
        },
      });
    }

    return task;
  }

  /**
   * Schedule a task for execution
   */
  scheduleTask(taskId: string): boolean {
    const task = this.getTaskById(taskId);
    if (!task) {
      return false;
    }

    const result = this.prioritizationService.updateTask(taskId, {
      status: TaskScheduleStatus.SCHEDULED,
      scheduledAt: new Date(),
    });

    if (result) {
      // Record in scheduling history
      this.schedulingHistory.push({
        timestamp: new Date(),
        action: 'schedule_task',
        taskId,
        context: this.getCurrentContext(),
      });
    }

    return result;
  }

  /**
   * Mark a task as running
   */
  markTaskRunning(taskId: string): boolean {
    const task = this.getTaskById(taskId);
    if (!task) {
      return false;
    }

    const result = this.prioritizationService.updateTask(taskId, {
      status: TaskScheduleStatus.RUNNING,
      startedAt: new Date(),
    });

    if (result) {
      // Record in scheduling history
      this.schedulingHistory.push({
        timestamp: new Date(),
        action: 'mark_task_running',
        taskId,
        context: this.getCurrentContext(),
      });
    }

    return result;
  }

  /**
   * Mark a task as completed
   */
  markTaskCompleted(taskId: string, result?: any): boolean {
    const task = this.getTaskById(taskId);
    if (!task) {
      return false;
    }

    const updated = this.prioritizationService.updateTask(taskId, {
      status: TaskScheduleStatus.COMPLETED,
      completedAt: new Date(),
    });

    if (updated) {
      // Execute completion callbacks
      const callbacks = this.taskCompletionCallbacks.get(taskId) || [];
      for (const callback of callbacks) {
        try {
          callback({
            ...task,
            status: TaskScheduleStatus.COMPLETED,
            completedAt: new Date(),
          });
        } catch (err) {
          this.logger.error('Error in task completion callback', {
            taskId,
            error: err,
          });
        }
      }

      // Record in scheduling history
      this.schedulingHistory.push({
        timestamp: new Date(),
        action: 'mark_task_completed',
        taskId,
        context: this.getCurrentContext(),
        result,
      });

      // Clear callbacks
      this.taskCompletionCallbacks.delete(taskId);
    }

    return updated;
  }

  /**
   * Mark a task as failed
   */
  markTaskFailed(taskId: string, error?: any): boolean {
    const task = this.getTaskById(taskId);
    if (!task) {
      return false;
    }

    const updated = this.prioritizationService.updateTask(taskId, {
      status: TaskScheduleStatus.FAILED,
      completedAt: new Date(),
    });

    if (updated) {
      // Record in scheduling history
      this.schedulingHistory.push({
        timestamp: new Date(),
        action: 'mark_task_failed',
        taskId,
        context: this.getCurrentContext(),
        result: { error },
      });

      // Add a warning insight
      this.addInsight({
        type: 'warning',
        source: 'task-execution',
        description: `Task ${task.name} (${taskId}) failed: ${error ? String(error) : 'Unknown error'}`,
        relevantTaskIds: [taskId],
        relevantContextFactors: [],
        confidence: 1.0,
        impact: 0.8,
        metadata: { error },
      });

      // Clear callbacks
      this.taskCompletionCallbacks.delete(taskId);
    }

    return updated;
  }

  /**
   * Get all tasks that are ready to execute
   */
  getReadyTasks(): SchedulableTask[] {
    return this.prioritizationService
      .getAllTasks()
      .filter((task) => task.status === TaskScheduleStatus.SCHEDULED);
  }

  /**
   * Get a task by ID
   */
  getTaskById(taskId: string): SchedulableTask | undefined {
    return this.prioritizationService.getTaskById(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): SchedulableTask[] {
    return this.prioritizationService.getAllTasks();
  }

  /**
   * Update the scheduling context
   */
  updateSchedulingContext(context: Partial<SchedulingContext>): void {
    this.adaptToContextChange(context);
  }

  /**
   * Get the current scheduling context
   */
  getCurrentContext(): SchedulingContext {
    return this.prioritizationService.getContext();
  }

  /**
   * Recalculate priorities for all tasks
   */
  recalculatePriorities(): void {
    this.prioritizationService.recalculateAllPriorities();

    // Record in scheduling history
    this.schedulingHistory.push({
      timestamp: new Date(),
      action: 'recalculate_priorities',
      context: this.getCurrentContext(),
    });
  }
}
