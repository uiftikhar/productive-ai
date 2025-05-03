import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  MultiTaskProgressService,
  TaskProgress,
} from '../interfaces/parallel-execution.interface';

/**
 * Implementation of the multi-task progress tracking service
 */
export class MultiTaskProgressServiceImpl implements MultiTaskProgressService {
  private logger: Logger;
  private taskProgress: Map<string, TaskProgress> = new Map();
  private threadTasks: Map<string, Set<string>> = new Map(); // threadId -> set of taskIds
  private progressTimelines: Map<
    string,
    {
      timestamp: Date;
      progress: number;
      stage?: string;
    }[]
  > = new Map();
  private progressListeners: Map<string, ((progress: TaskProgress) => void)[]> =
    new Map();
  private stageWeights: Map<string, Record<string, number>> = new Map(); // taskId -> stage weights

  constructor(options: { logger?: Logger } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.logger.info('Multi-task progress service initialized');
  }

  /**
   * Register a task for progress tracking
   */
  registerTask(
    taskId: string,
    threadId: string,
    metadata?: Record<string, any>,
  ): boolean {
    // Check if task already registered
    if (this.taskProgress.has(taskId)) {
      this.logger.warn(
        `Task ${taskId} is already registered for progress tracking`,
      );
      return false;
    }

    const now = new Date();

    // Create initial task progress
    const initialProgress: TaskProgress = {
      taskId,
      progress: 0,
      status: 'pending',
      startTime: now,
      currentStage: 'initialization',
      message: 'Task registered',
      metrics: metadata || {},
    };

    // Store task progress
    this.taskProgress.set(taskId, initialProgress);

    // Initialize progress timeline
    this.progressTimelines.set(taskId, [
      {
        timestamp: now,
        progress: 0,
        stage: 'initialization',
      },
    ]);

    // Associate task with thread
    if (!this.threadTasks.has(threadId)) {
      this.threadTasks.set(threadId, new Set<string>());
    }
    this.threadTasks.get(threadId)?.add(taskId);

    this.logger.info(
      `Task ${taskId} registered for progress tracking in thread ${threadId}`,
      {
        taskId,
        threadId,
        metadata,
      },
    );

    return true;
  }

  /**
   * Update a task's progress
   */
  updateTaskProgress(
    taskId: string,
    progress: number,
    status?: string,
    message?: string,
  ): boolean {
    const task = this.taskProgress.get(taskId);
    if (!task) {
      this.logger.warn(`Cannot update progress for unknown task: ${taskId}`);
      return false;
    }

    // Normalize progress value
    const normalizedProgress = Math.max(0, Math.min(1, progress));

    // Get current time
    const now = new Date();

    // Create updated task progress
    const updatedTask: TaskProgress = {
      ...task,
      progress: normalizedProgress,
      status: status || task.status,
      message: message || task.message,
    };

    // Store updated progress
    this.taskProgress.set(taskId, updatedTask);

    // Add to timeline if progress changed
    if (normalizedProgress !== task.progress) {
      const timeline = this.progressTimelines.get(taskId) || [];
      timeline.push({
        timestamp: now,
        progress: normalizedProgress,
        stage: task.currentStage,
      });
      this.progressTimelines.set(taskId, timeline);
    }

    this.logger.debug(
      `Updated progress for task ${taskId}: ${normalizedProgress * 100}%`,
      {
        taskId,
        progress: normalizedProgress,
        status: updatedTask.status,
        message: updatedTask.message,
      },
    );

    // Notify progress listeners
    this.notifyProgressListeners(taskId, updatedTask);

    return true;
  }

  /**
   * Update a task's stage
   */
  updateTaskStage(taskId: string, stage: string, progress?: number): boolean {
    const task = this.taskProgress.get(taskId);
    if (!task) {
      this.logger.warn(`Cannot update stage for unknown task: ${taskId}`);
      return false;
    }

    // Determine progress if not specified
    let stageProgress = progress;
    if (stageProgress === undefined) {
      // Try to use stage weights if available
      const weights = this.stageWeights.get(taskId);
      if (weights && weights[stage] !== undefined) {
        stageProgress = weights[stage];
      }
    }

    // Get current time
    const now = new Date();

    // Create updated task progress
    const updatedTask: TaskProgress = {
      ...task,
      currentStage: stage,
    };

    // Update progress if specified
    if (stageProgress !== undefined) {
      updatedTask.progress = Math.max(0, Math.min(1, stageProgress));
    }

    // Store updated progress
    this.taskProgress.set(taskId, updatedTask);

    // Add to timeline
    const timeline = this.progressTimelines.get(taskId) || [];
    timeline.push({
      timestamp: now,
      progress: updatedTask.progress,
      stage,
    });
    this.progressTimelines.set(taskId, timeline);

    this.logger.info(
      `Task ${taskId} moved to stage "${stage}" with progress ${updatedTask.progress * 100}%`,
      {
        taskId,
        stage,
        progress: updatedTask.progress,
      },
    );

    // Notify progress listeners
    this.notifyProgressListeners(taskId, updatedTask);

    return true;
  }

  /**
   * Get progress details for a specific task
   */
  getTaskProgress(taskId: string): TaskProgress | undefined {
    return this.taskProgress.get(taskId);
  }

  /**
   * Calculate the overall progress for a thread
   */
  getThreadProgress(threadId: string): number {
    const taskIds = this.threadTasks.get(threadId);
    if (!taskIds || taskIds.size === 0) {
      return 0;
    }

    let totalProgress = 0;
    let taskCount = 0;

    for (const taskId of taskIds) {
      const task = this.taskProgress.get(taskId);
      if (task) {
        totalProgress += task.progress;
        taskCount++;
      }
    }

    return taskCount > 0 ? totalProgress / taskCount : 0;
  }

  /**
   * Calculate the overall progress across all tasks
   */
  getOverallProgress(): number {
    const tasks = Array.from(this.taskProgress.values());
    if (tasks.length === 0) {
      return 0;
    }

    const totalProgress = tasks.reduce((sum, task) => sum + task.progress, 0);
    return totalProgress / tasks.length;
  }

  /**
   * Get the progress timeline for a task
   */
  getProgressTimeline(taskId: string): {
    timestamp: Date;
    progress: number;
    stage?: string;
  }[] {
    return this.progressTimelines.get(taskId) || [];
  }

  /**
   * Set the estimated completion time for a task
   */
  setEstimatedCompletion(taskId: string, estimatedCompletion: Date): boolean {
    const task = this.taskProgress.get(taskId);
    if (!task) {
      this.logger.warn(
        `Cannot set estimated completion for unknown task: ${taskId}`,
      );
      return false;
    }

    // Update task with estimated completion
    const updatedTask: TaskProgress = {
      ...task,
      estimatedCompletion,
    };

    // Store updated task
    this.taskProgress.set(taskId, updatedTask);

    this.logger.info(
      `Set estimated completion for task ${taskId}: ${estimatedCompletion}`,
      {
        taskId,
        estimatedCompletion,
      },
    );

    // Notify progress listeners
    this.notifyProgressListeners(taskId, updatedTask);

    return true;
  }

  /**
   * Get a comprehensive progress report
   */
  getProgressReport(): Record<string, any> {
    const tasks = Array.from(this.taskProgress.entries());
    const threads = Array.from(this.threadTasks.entries());

    // Calculate progress by thread
    const threadProgress: Record<string, number> = {};
    for (const [threadId] of threads) {
      threadProgress[threadId] = this.getThreadProgress(threadId);
    }

    // Calculate overall progress
    const overallProgress = this.getOverallProgress();

    // Get tasks by status
    const tasksByStatus: Record<string, string[]> = {};
    for (const [taskId, task] of tasks) {
      if (!tasksByStatus[task.status]) {
        tasksByStatus[task.status] = [];
      }
      tasksByStatus[task.status].push(taskId);
    }

    // Count tasks by stage
    const tasksByStage: Record<string, number> = {};
    for (const [, task] of tasks) {
      if (task.currentStage) {
        tasksByStage[task.currentStage] =
          (tasksByStage[task.currentStage] || 0) + 1;
      }
    }

    // Find slowest and fastest tasks
    let slowestTask: { taskId: string; progress: number } | undefined;
    let fastestTask: { taskId: string; progress: number } | undefined;

    for (const [taskId, task] of tasks) {
      if (!task.startTime) continue;

      // Skip completed tasks
      if (task.status === 'completed') continue;

      // Calculate progress velocity (progress per millisecond)
      const timeElapsed = Date.now() - task.startTime.getTime();
      const velocity = timeElapsed > 0 ? task.progress / timeElapsed : 0;

      if (!slowestTask || velocity < slowestTask.progress) {
        slowestTask = { taskId, progress: velocity };
      }

      if (!fastestTask || velocity > fastestTask.progress) {
        fastestTask = { taskId, progress: velocity };
      }
    }

    return {
      timestamp: new Date(),
      overallProgress,
      threadProgress,
      taskCount: tasks.length,
      completedTasks: tasksByStatus['completed']?.length || 0,
      runningTasks: tasksByStatus['running']?.length || 0,
      pendingTasks: tasksByStatus['pending']?.length || 0,
      failedTasks: tasksByStatus['failed']?.length || 0,
      tasksByStatus,
      tasksByStage,
      slowestTask: slowestTask?.taskId,
      fastestTask: fastestTask?.taskId,
    };
  }

  /**
   * Set stage weights for calculating progress
   */
  setTaskStageWeights(
    taskId: string,
    stageWeights: Record<string, number>,
  ): boolean {
    // Validate that weights are between 0 and 1
    for (const [stage, weight] of Object.entries(stageWeights)) {
      if (weight < 0 || weight > 1) {
        this.logger.warn(
          `Invalid weight for stage "${stage}": ${weight}. Weights must be between 0 and 1.`,
        );
        return false;
      }
    }

    // Store stage weights
    this.stageWeights.set(taskId, { ...stageWeights });

    this.logger.info(`Set stage weights for task ${taskId}`, {
      taskId,
      stageWeights,
    });

    return true;
  }

  /**
   * Subscribe to progress updates for a task
   */
  subscribeToTaskProgress(
    taskId: string,
    callback: (progress: TaskProgress) => void,
  ): () => void {
    if (!this.progressListeners.has(taskId)) {
      this.progressListeners.set(taskId, []);
    }

    this.progressListeners.get(taskId)?.push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.progressListeners.get(taskId);
      if (listeners) {
        this.progressListeners.set(
          taskId,
          listeners.filter((cb) => cb !== callback),
        );
      }
    };
  }

  /**
   * Notify progress listeners about task updates
   */
  private notifyProgressListeners(
    taskId: string,
    progress: TaskProgress,
  ): void {
    const listeners = this.progressListeners.get(taskId) || [];

    for (const listener of listeners) {
      try {
        listener(progress);
      } catch (error) {
        this.logger.error(`Error in progress listener for task ${taskId}`, {
          error,
        });
      }
    }
  }

  /**
   * Mark a task as completed
   */
  completeTask(taskId: string, finalMetrics?: Record<string, any>): boolean {
    const task = this.taskProgress.get(taskId);
    if (!task) {
      this.logger.warn(`Cannot complete unknown task: ${taskId}`);
      return false;
    }

    // Create completed task progress
    const completedTask: TaskProgress = {
      ...task,
      progress: 1,
      status: 'completed',
      message: 'Task completed successfully',
      metrics: {
        ...task.metrics,
        ...finalMetrics,
        completedAt: new Date(),
      },
    };

    // Store completed task
    this.taskProgress.set(taskId, completedTask);

    // Add final entry to timeline
    const timeline = this.progressTimelines.get(taskId) || [];
    timeline.push({
      timestamp: new Date(),
      progress: 1,
      stage: 'completed',
    });
    this.progressTimelines.set(taskId, timeline);

    this.logger.info(`Task ${taskId} completed`, {
      taskId,
      metrics: finalMetrics,
    });

    // Notify progress listeners
    this.notifyProgressListeners(taskId, completedTask);

    return true;
  }

  /**
   * Mark a task as failed
   */
  failTask(taskId: string, error?: any): boolean {
    const task = this.taskProgress.get(taskId);
    if (!task) {
      this.logger.warn(`Cannot fail unknown task: ${taskId}`);
      return false;
    }

    // Create failed task progress
    const failedTask: TaskProgress = {
      ...task,
      status: 'failed',
      message: error ? `Task failed: ${error}` : 'Task failed',
      metrics: {
        ...task.metrics,
        error,
        failedAt: new Date(),
      },
    };

    // Store failed task
    this.taskProgress.set(taskId, failedTask);

    // Add failure entry to timeline
    const timeline = this.progressTimelines.get(taskId) || [];
    timeline.push({
      timestamp: new Date(),
      progress: task.progress,
      stage: 'failed',
    });
    this.progressTimelines.set(taskId, timeline);

    this.logger.warn(`Task ${taskId} failed`, {
      taskId,
      error,
    });

    // Notify progress listeners
    this.notifyProgressListeners(taskId, failedTask);

    return true;
  }

  /**
   * Get all tasks for a thread
   */
  getThreadTasks(threadId: string): TaskProgress[] {
    const taskIds = this.threadTasks.get(threadId) || new Set<string>();

    return Array.from(taskIds)
      .map((taskId) => this.taskProgress.get(taskId))
      .filter((task): task is TaskProgress => task !== undefined);
  }

  /**
   * Get all registered tasks
   */
  getAllTasks(): TaskProgress[] {
    return Array.from(this.taskProgress.values());
  }
}
