/**
 * @deprecated This module is deprecated and will be removed in a future version.
 * Use the new agentic meeting analysis system in /langgraph/agentic-meeting-analysis instead.
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentRegistryService } from './agent-registry.service';
import {
  TaskPlanningService,
  PlannedTask,
  TaskPlan,
} from './task-planning.service';
import {
  BaseAgentInterface,
  AgentRequest,
  AgentResponse,
} from '../interfaces/base-agent.interface';
import { EventEmitter } from 'events';

/**
 * Types of task execution events
 */
export enum TaskExecutionEventType {
  TASK_STARTED = 'task-started',
  TASK_COMPLETED = 'task-completed',
  TASK_FAILED = 'task-failed',
  TASK_STATUS_CHANGED = 'task-status-changed',
  PLAN_COMPLETED = 'plan-completed',
}

/**
 * Structure for task execution events
 */
export interface TaskExecutionEvent {
  type: TaskExecutionEventType;
  planId: string;
  taskId?: string;
  status?: string;
  result?: any;
  error?: string;
  timestamp: number;
}

/**
 * Task execution options
 */
export interface TaskExecutionOptions {
  parallelLimit?: number; // Maximum number of tasks to execute in parallel
  timeout?: number; // Execution timeout in milliseconds
  retryCount?: number; // Number of times to retry a failed task
  retryDelay?: number; // Delay between retries in milliseconds
  context?: Record<string, any>; // Additional context for execution
}

/**
 * Execution result for a single task
 */
export interface TaskExecutionResult {
  taskId: string;
  status: 'completed' | 'failed';
  result?: any;
  error?: string;
  executionTimeMs: number;
}

/**
 * Execution result for a task plan
 */
export interface PlanExecutionResult {
  planId: string;
  status: 'completed' | 'failed' | 'partial';
  results: TaskExecutionResult[];
  completedTasks: number;
  failedTasks: number;
  totalTasks: number;
  executionTimeMs: number;
}

/**
 * Configuration for the AgentTaskExecutorService
 */
export interface AgentTaskExecutorConfig {
  logger?: Logger;
  agentRegistry?: AgentRegistryService;
  taskPlanningService?: TaskPlanningService;
  defaultParallelLimit?: number;
  defaultTimeout?: number;
  defaultRetryCount?: number;
  defaultRetryDelay?: number;
}

/**
 * Service for executing tasks using agents
 */
export class AgentTaskExecutorService {
  private static instance: AgentTaskExecutorService;
  private logger: Logger;
  private agentRegistry: AgentRegistryService;
  private taskPlanningService: TaskPlanningService;
  private eventEmitter: EventEmitter = new EventEmitter();
  private activeExecutions: Map<string, NodeJS.Timeout> = new Map();
  private eventHandlers: Map<string, (event: TaskExecutionEvent) => void> =
    new Map();
  private defaultParallelLimit: number = 3;
  private defaultTimeout: number = 5 * 60 * 1000; // 5 minutes
  private defaultRetryCount: number = 2;
  private defaultRetryDelay: number = 1000; // 1 second

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: AgentTaskExecutorConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.agentRegistry =
      config.agentRegistry || AgentRegistryService.getInstance();
    this.taskPlanningService =
      config.taskPlanningService || TaskPlanningService.getInstance();

    if (config.defaultParallelLimit) {
      this.defaultParallelLimit = config.defaultParallelLimit;
    }

    if (config.defaultTimeout) {
      this.defaultTimeout = config.defaultTimeout;
    }

    if (config.defaultRetryCount) {
      this.defaultRetryCount = config.defaultRetryCount;
    }

    if (config.defaultRetryDelay) {
      this.defaultRetryDelay = config.defaultRetryDelay;
    }

    this.logger.info('Initialized AgentTaskExecutorService');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    config: AgentTaskExecutorConfig = {},
  ): AgentTaskExecutorService {
    if (!AgentTaskExecutorService.instance) {
      AgentTaskExecutorService.instance = new AgentTaskExecutorService(config);
    }
    return AgentTaskExecutorService.instance;
  }

  /**
   * Execute a task plan
   */
  async executePlan(
    planId: string,
    options: TaskExecutionOptions = {},
  ): Promise<PlanExecutionResult> {
    const plan = this.taskPlanningService.getTaskPlan(planId);
    if (!plan) {
      throw new Error(`Task plan not found: ${planId}`);
    }

    this.logger.info(`Executing task plan: ${plan.name} (${planId})`);

    const startTime = Date.now();
    const results: TaskExecutionResult[] = [];
    const executionMap = new Map<string, Promise<TaskExecutionResult>>();
    const parallelLimit = options.parallelLimit || this.defaultParallelLimit;

    // Create a unique execution ID for this plan
    const executionId = uuidv4();

    // Set a timeout for the overall execution
    const timeout = options.timeout || this.defaultTimeout;
    const timeoutId = setTimeout(() => {
      this.cancelExecution(executionId);
    }, timeout);

    this.activeExecutions.set(executionId, timeoutId);

    try {
      // Execute tasks in topological order (respecting dependencies)
      while (true) {
        // Get tasks that are ready to execute
        const readyTasks = this.taskPlanningService.getReadyTasks(planId);

        if (readyTasks.length === 0) {
          // If no ready tasks and no running tasks, we're done
          if (executionMap.size === 0) {
            break;
          }

          // Wait for at least one running task to complete
          const [taskId, result] =
            await this.waitForNextCompletion(executionMap);
          results.push(result);
          executionMap.delete(taskId);
          continue;
        }

        // Execute as many ready tasks as allowed by parallel limit
        while (readyTasks.length > 0 && executionMap.size < parallelLimit) {
          const task = readyTasks.shift()!;

          // Start task execution
          const taskPromise = this.executeTask(plan, task, options);
          executionMap.set(task.id, taskPromise);
        }

        // If we have running tasks, wait for at least one to complete
        if (executionMap.size > 0) {
          const [taskId, result] =
            await this.waitForNextCompletion(executionMap);
          results.push(result);
          executionMap.delete(taskId);
        }
      }

      // Calculate statistics
      const completedTasks = results.filter(
        (r) => r.status === 'completed',
      ).length;
      const failedTasks = results.filter((r) => r.status === 'failed').length;
      const totalTasks = plan.tasks.length;

      // Determine overall status
      let status: 'completed' | 'failed' | 'partial' = 'completed';
      if (failedTasks === totalTasks) {
        status = 'failed';
      } else if (failedTasks > 0) {
        status = 'partial';
      }

      const executionTime = Date.now() - startTime;

      // Emit plan completed event
      this.emitEvent({
        type: TaskExecutionEventType.PLAN_COMPLETED,
        planId,
        status,
        timestamp: Date.now(),
      });

      return {
        planId,
        status,
        results,
        completedTasks,
        failedTasks,
        totalTasks,
        executionTimeMs: executionTime,
      };
    } finally {
      // Clean up timeout
      clearTimeout(timeoutId);
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Wait for the next task to complete from a set of running tasks
   */
  private async waitForNextCompletion(
    executionMap: Map<string, Promise<TaskExecutionResult>>,
  ): Promise<[string, TaskExecutionResult]> {
    // Convert the map to an array of promises with task IDs
    const promises = Array.from(executionMap.entries()).map(
      ([taskId, promise]) =>
        promise.then(
          (result) => [taskId, result] as [string, TaskExecutionResult],
        ),
    );

    // Wait for the first task to complete
    const result = await Promise.race(promises);
    return result;
  }

  /**
   * Execute a single task using the assigned agent
   */
  private async executeTask(
    plan: TaskPlan,
    task: PlannedTask,
    options: TaskExecutionOptions = {},
  ): Promise<TaskExecutionResult> {
    const taskId = task.id;
    const startTime = Date.now();

    this.logger.info(`Executing task: ${task.name} (${taskId})`);

    // Update task status to in-progress
    this.taskPlanningService.updateTaskStatus(plan.id, taskId, 'in-progress');

    // Emit task started event
    this.emitEvent({
      type: TaskExecutionEventType.TASK_STARTED,
      planId: plan.id,
      taskId,
      timestamp: startTime,
    });

    try {
      // Get the assigned agent
      if (!task.assignedTo) {
        throw new Error(`No agent assigned for task: ${taskId}`);
      }

      const agent = this.agentRegistry.getAgent(task.assignedTo);
      if (!agent) {
        throw new Error(`Agent not found: ${task.assignedTo}`);
      }

      let result: AgentResponse | null = null;
      let error: Error | null = null;
      let retryCount = options.retryCount ?? this.defaultRetryCount;

      // Execute with retries
      for (let attempt = 0; attempt <= retryCount; attempt++) {
        try {
          // Prepare agent request
          const request: AgentRequest = {
            input: task.description,
            context: {
              metadata: {
                taskId,
                planId: plan.id,
                ...(task.metadata || {}),
                ...(options.context || {}),
              },
            },
          };

          // Execute the agent
          result = await agent.execute(request);
          error = null;
          break;
        } catch (err) {
          error = err instanceof Error ? err : new Error(String(err));

          if (attempt < retryCount) {
            const delay = options.retryDelay ?? this.defaultRetryDelay;
            this.logger.warn(
              `Task execution failed, retrying in ${delay}ms: ${taskId}`,
              {
                error: error.message,
                attempt: attempt + 1,
                maxAttempts: retryCount + 1,
              },
            );

            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // Handle final result
      if (error) {
        const executionTime = Date.now() - startTime;

        // Update task status to failed
        this.taskPlanningService.updateTaskStatus(
          plan.id,
          taskId,
          'failed',
          null,
          error.message,
        );

        // Emit task failed event
        this.emitEvent({
          type: TaskExecutionEventType.TASK_FAILED,
          planId: plan.id,
          taskId,
          error: error.message,
          timestamp: Date.now(),
        });

        return {
          taskId,
          status: 'failed',
          error: error.message,
          executionTimeMs: executionTime,
        };
      }

      if (!result) {
        throw new Error('Unexpected: No result after successful execution');
      }

      const executionTime = Date.now() - startTime;

      // Update task status to completed
      this.taskPlanningService.updateTaskStatus(
        plan.id,
        taskId,
        'completed',
        result.output,
      );

      // Emit task completed event
      this.emitEvent({
        type: TaskExecutionEventType.TASK_COMPLETED,
        planId: plan.id,
        taskId,
        result: result.output,
        timestamp: Date.now(),
      });

      return {
        taskId,
        status: 'completed',
        result: result.output,
        executionTimeMs: executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`Error executing task: ${taskId}`, {
        error: errorMessage,
      });

      // Update task status to failed
      this.taskPlanningService.updateTaskStatus(
        plan.id,
        taskId,
        'failed',
        null,
        errorMessage,
      );

      // Emit task failed event
      this.emitEvent({
        type: TaskExecutionEventType.TASK_FAILED,
        planId: plan.id,
        taskId,
        error: errorMessage,
        timestamp: Date.now(),
      });

      return {
        taskId,
        status: 'failed',
        error: errorMessage,
        executionTimeMs: executionTime,
      };
    }
  }

  /**
   * Execute a single task directly using the assigned agent
   */
  async executeTaskDirectly(
    planId: string,
    taskId: string,
    options: TaskExecutionOptions = {},
  ): Promise<TaskExecutionResult> {
    const plan = this.taskPlanningService.getTaskPlan(planId);
    if (!plan) {
      throw new Error(`Task plan not found: ${planId}`);
    }

    const task = plan.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return this.executeTask(plan, task, options);
  }

  /**
   * Cancel execution by ID
   */
  cancelExecution(executionId: string): void {
    const timeoutId = this.activeExecutions.get(executionId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.activeExecutions.delete(executionId);
      this.logger.info(`Cancelled execution: ${executionId}`);
    }
  }

  /**
   * Subscribe to task execution events
   */
  subscribe(
    callback: (event: TaskExecutionEvent) => void,
    eventTypes?: TaskExecutionEventType[],
  ): string {
    const subscriptionId = uuidv4();

    const handler = (event: TaskExecutionEvent) => {
      if (!eventTypes || eventTypes.includes(event.type)) {
        callback(event);
      }
    };

    // Store the handler with the subscription ID
    this.eventEmitter.on('task-event', handler);

    // Save the handler reference so we can remove it later
    this.eventHandlers.set(subscriptionId, handler);

    return subscriptionId;
  }

  /**
   * Unsubscribe from task execution events
   */
  unsubscribe(subscriptionId: string): void {
    // Get the stored handler for this subscription
    const handler = this.eventHandlers.get(subscriptionId);

    if (handler) {
      // Remove only this specific listener
      this.eventEmitter.off('task-event', handler);

      // Clean up the reference
      this.eventHandlers.delete(subscriptionId);
    }
  }

  /**
   * Emit a task execution event
   */
  private emitEvent(event: TaskExecutionEvent): void {
    this.eventEmitter.emit('task-event', event);
  }

  /**
   * Clean up resources used by the service.
   * Should be called when the service is no longer needed.
   */
  cleanup(): void {
    // Clear all active executions
    for (const [executionId, timeoutId] of this.activeExecutions.entries()) {
      clearTimeout(timeoutId);
      this.activeExecutions.delete(executionId);
    }

    // Remove all event listeners
    this.eventEmitter.removeAllListeners();

    // Clear event handler references
    this.eventHandlers.clear();

    this.logger.info('AgentTaskExecutorService resources cleaned up');
  }

  /**
   * Reset the singleton instance (for testing purposes)
   */
  static resetInstance(): void {
    if (AgentTaskExecutorService.instance) {
      AgentTaskExecutorService.instance.cleanup();
      AgentTaskExecutorService.instance = undefined as any;
    }
  }
}
