/**
 * Progress Monitoring Service
 *
 * Handles task progress tracking, stall detection, and adaptation triggers
 * @deprecated Will be replaced by agentic self-organizing behavior
 */

import { EventEmitter } from 'events';
import {
  EnhancedTaskProgress,
  ProgressMonitoringConfig,
  ProgressUpdateNotification,
  ReflectionPointType,
} from '../interfaces/metacognition.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Default progress monitoring configuration
 */
const DEFAULT_PROGRESS_MONITORING_CONFIG: ProgressMonitoringConfig = {
  stallThresholdMs: 60000, // 1 minute
  rateDeviationThreshold: 0.3, // 30% deviation
  monitoringIntervalMs: 10000, // 10 seconds
  maxTimePerStepMs: 300000, // 5 minutes
  autoRecoveryEnabled: true,
  recoveryStrategies: ['retry', 'simplify', 'decompose', 'delegate', 'abort'],
};

/**
 * Events emitted by the progress monitoring service
 */
export enum ProgressMonitoringEvent {
  PROGRESS_UPDATE = 'progress_update',
  STALL_DETECTED = 'stall_detected',
  STALL_RESOLVED = 'stall_resolved',
  ADAPTATION_RECOMMENDED = 'adaptation_recommended',
  ANOMALY_DETECTED = 'anomaly_detected',
  TASK_COMPLETED = 'task_completed',
}

/**
 * Service to monitor task execution progress
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export class ProgressMonitoringService extends EventEmitter {
  private static instance: ProgressMonitoringService;
  private logger: Logger;
  private config: ProgressMonitoringConfig;

  // Active task progress trackers by taskId
  private activeTasks: Map<string, EnhancedTaskProgress> = new Map();

  // Monitoring intervals by taskId
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  private constructor(
    options: {
      logger?: Logger;
      config?: Partial<ProgressMonitoringConfig>;
    } = {},
  ) {
    super();

    this.logger = options.logger || new ConsoleLogger();
    this.config = {
      ...DEFAULT_PROGRESS_MONITORING_CONFIG,
      ...options.config,
    };

    this.logger.info('ProgressMonitoringService initialized', {
      stallThreshold: this.config.stallThresholdMs,
      monitoringInterval: this.config.monitoringIntervalMs,
    });
  }

  /**
   * Get the singleton instance of the progress monitoring service
   */
  public static getInstance(
    options: {
      logger?: Logger;
      config?: Partial<ProgressMonitoringConfig>;
    } = {},
  ): ProgressMonitoringService {
    if (!ProgressMonitoringService.instance) {
      ProgressMonitoringService.instance = new ProgressMonitoringService(
        options,
      );
    }
    return ProgressMonitoringService.instance;
  }

  /**
   * Start monitoring a task
   */
  public startMonitoring(
    taskId: string,
    capability: string,
    initialProgress:
      | EnhancedTaskProgress
      | {
          totalSteps: number;
          completedSteps: number;
          currentStepIndex: number;
        },
  ): EnhancedTaskProgress {
    // Check if task is already being monitored
    if (this.activeTasks.has(taskId)) {
      this.logger.warn(`Task ${taskId} is already being monitored`);
      return this.activeTasks.get(taskId)!;
    }

    // Initialize enhanced progress
    const now = Date.now();
    const enhancedProgress: EnhancedTaskProgress = {
      totalSteps: initialProgress.totalSteps,
      completedSteps: initialProgress.completedSteps,
      currentStepIndex:
        initialProgress.currentStepIndex || initialProgress.completedSteps,
      estimatedCompletion:
        initialProgress.completedSteps /
        Math.max(1, initialProgress.totalSteps),
      milestones: {},
      blockers: [],
      startTime: now,
      lastUpdateTime: now,
      stallThresholdMs: this.config.stallThresholdMs,
      isStalled: false,
      stallHistory: [],
      adaptationCount: 0,
      expectedCompletionRate: 1, // 1 step per minute as default
      actualCompletionRate: 0,
    };

    // Store in active tasks
    this.activeTasks.set(taskId, enhancedProgress);

    // Start monitoring interval
    const interval = setInterval(() => {
      this.checkTaskProgress(taskId, capability);
    }, this.config.monitoringIntervalMs);

    this.monitoringIntervals.set(taskId, interval);

    this.logger.info(
      `Started monitoring task ${taskId} for capability ${capability}`,
      {
        steps: `${enhancedProgress.completedSteps}/${enhancedProgress.totalSteps}`,
      },
    );

    return enhancedProgress;
  }

  /**
   * Update task progress
   */
  public updateProgress(
    taskId: string,
    capability: string,
    update: {
      completedSteps?: number;
      totalSteps?: number;
      currentStepIndex?: number;
      milestone?: {
        description: string;
        completed: boolean;
      };
      blocker?: {
        description: string;
        severity: 'low' | 'medium' | 'high';
        workarounds?: string[];
      };
    },
  ): EnhancedTaskProgress | null {
    // Check if task is being monitored
    if (!this.activeTasks.has(taskId)) {
      this.logger.warn(`Cannot update task ${taskId} - not being monitored`);
      return null;
    }

    const progress = this.activeTasks.get(taskId)!;
    const now = Date.now();
    const timeSinceLastUpdate = now - progress.lastUpdateTime;

    // Update progress values
    if (update.completedSteps !== undefined) {
      progress.completedSteps = update.completedSteps;
    }

    if (update.totalSteps !== undefined) {
      progress.totalSteps = update.totalSteps;
    }

    if (update.currentStepIndex !== undefined) {
      progress.currentStepIndex = update.currentStepIndex;
    }

    // Update estimated completion
    progress.estimatedCompletion =
      progress.completedSteps / Math.max(1, progress.totalSteps);

    // Calculate completion rate (steps per minute)
    if (
      timeSinceLastUpdate > 0 &&
      progress.lastUpdateTime !== progress.startTime
    ) {
      const stepsDelta =
        progress.completedSteps -
        (progress.actualCompletionRate || 0) *
          ((progress.lastUpdateTime - progress.startTime) / 60000);

      const minutesSinceLastUpdate = timeSinceLastUpdate / 60000;
      const currentRate = stepsDelta / minutesSinceLastUpdate;

      // Smooth the rate using weighted average
      progress.actualCompletionRate = progress.actualCompletionRate
        ? 0.7 * progress.actualCompletionRate + 0.3 * currentRate
        : currentRate;
    }

    // Add milestone if provided
    if (update.milestone) {
      progress.milestones[update.milestone.description] = {
        description: update.milestone.description,
        completed: update.milestone.completed,
        completedAt: update.milestone.completed ? now : undefined,
      };
    }

    // Add blocker if provided
    if (update.blocker) {
      progress.blockers.push({
        description: update.blocker.description,
        severity: update.blocker.severity,
        workarounds: update.blocker.workarounds,
      });
    }

    // Check if the task was stalled and is now resuming
    if (progress.isStalled) {
      // Mark stall as resolved
      const lastStall = progress.stallHistory[progress.stallHistory.length - 1];
      if (lastStall && !lastStall.endTime) {
        lastStall.endTime = now;
        lastStall.duration = now - lastStall.startTime;
        lastStall.recoveryAction = 'resumed_naturally';
      }

      progress.isStalled = false;

      this.emit(ProgressMonitoringEvent.STALL_RESOLVED, {
        taskId,
        capability,
        progress,
      });
    }

    // Update last update time
    progress.lastUpdateTime = now;

    // Store updated progress
    this.activeTasks.set(taskId, progress);

    // Calculate estimated remaining time
    if (progress.actualCompletionRate && progress.actualCompletionRate > 0) {
      const remainingSteps = progress.totalSteps - progress.completedSteps;
      progress.estimatedRemainingTime =
        (remainingSteps / progress.actualCompletionRate) * 60000;
    }

    // Check if task is completed
    if (progress.completedSteps >= progress.totalSteps) {
      this.completeTask(taskId, capability);
    }

    // Emit progress update event
    this.emit(ProgressMonitoringEvent.PROGRESS_UPDATE, {
      taskId,
      capability,
      progress,
    });

    return progress;
  }

  /**
   * Check task progress for stalls or anomalies
   */
  private checkTaskProgress(taskId: string, capability: string): void {
    if (!this.activeTasks.has(taskId)) return;

    const progress = this.activeTasks.get(taskId)!;
    const now = Date.now();
    const timeSinceLastUpdate = now - progress.lastUpdateTime;

    // Detect stalled execution
    if (
      timeSinceLastUpdate >= progress.stallThresholdMs &&
      !progress.isStalled
    ) {
      progress.isStalled = true;

      // Add to stall history
      progress.stallHistory.push({
        startTime: progress.lastUpdateTime,
        reason: 'no_progress_updates',
      });

      // Store updated progress
      this.activeTasks.set(taskId, progress);

      // Create notification
      const notification: ProgressUpdateNotification = {
        taskId,
        capability,
        progress,
        anomalies: [
          {
            type: 'stall',
            severity: 'medium',
            details: `Execution stalled for ${Math.round(timeSinceLastUpdate / 1000)} seconds without updates`,
            suggestedAction: 'investigate_and_resume',
          },
        ],
        adaptationRecommended: true,
        adaptationReasons: ['execution_stalled'],
        suggestedAdaptations: [
          {
            type: 'retry',
            description: 'Retry the current step',
            confidence: 0.7,
          },
          {
            type: 'simplify',
            description: 'Simplify the current approach',
            confidence: 0.6,
          },
        ],
      };

      // Emit events
      this.emit(ProgressMonitoringEvent.STALL_DETECTED, notification);
      this.emit(ProgressMonitoringEvent.ADAPTATION_RECOMMENDED, notification);

      this.logger.warn(
        `Task ${taskId} is stalled - no updates for ${Math.round(timeSinceLastUpdate / 1000)} seconds`,
      );
    }

    // Detect progress rate anomalies
    if (progress.expectedCompletionRate && progress.actualCompletionRate) {
      const deviation = Math.abs(
        (progress.actualCompletionRate - progress.expectedCompletionRate) /
          progress.expectedCompletionRate,
      );

      if (deviation > this.config.rateDeviationThreshold) {
        const anomalyType =
          progress.actualCompletionRate < progress.expectedCompletionRate
            ? 'slowdown'
            : 'acceleration';

        const severity =
          deviation > 0.5 ? 'high' : deviation > 0.3 ? 'medium' : 'low';

        const notification: ProgressUpdateNotification = {
          taskId,
          capability,
          progress,
          anomalies: [
            {
              type: anomalyType,
              severity,
              details: `Progress rate deviation of ${Math.round(deviation * 100)}% from expected`,
              suggestedAction:
                anomalyType === 'slowdown'
                  ? 'investigate_bottleneck'
                  : 'adjust_expectations',
            },
          ],
          adaptationRecommended:
            anomalyType === 'slowdown' && severity !== 'low',
          adaptationReasons:
            anomalyType === 'slowdown' ? ['progress_rate_below_expected'] : [],
          suggestedAdaptations:
            anomalyType === 'slowdown'
              ? [
                  {
                    type: 'simplify',
                    description: 'Simplify approach to increase progress rate',
                    confidence: 0.6,
                  },
                ]
              : [],
        };

        // Emit anomaly event
        this.emit(ProgressMonitoringEvent.ANOMALY_DETECTED, notification);

        // Emit adaptation recommendation for slowdowns
        if (anomalyType === 'slowdown' && severity !== 'low') {
          this.emit(
            ProgressMonitoringEvent.ADAPTATION_RECOMMENDED,
            notification,
          );
        }

        this.logger.info(`Task ${taskId} progress rate anomaly detected`, {
          type: anomalyType,
          expected: progress.expectedCompletionRate,
          actual: progress.actualCompletionRate,
          deviation: `${Math.round(deviation * 100)}%`,
        });
      }
    }
  }

  /**
   * Mark a task as completed and stop monitoring
   */
  public completeTask(taskId: string, capability: string): void {
    if (!this.activeTasks.has(taskId)) return;

    const progress = this.activeTasks.get(taskId)!;

    // Ensure completion values are set correctly
    progress.completedSteps = progress.totalSteps;
    progress.estimatedCompletion = 1;
    progress.lastUpdateTime = Date.now();

    // Clear monitoring interval
    if (this.monitoringIntervals.has(taskId)) {
      clearInterval(this.monitoringIntervals.get(taskId)!);
      this.monitoringIntervals.delete(taskId);
    }

    // Emit completion event
    this.emit(ProgressMonitoringEvent.TASK_COMPLETED, {
      taskId,
      capability,
      progress,
      executionTime: progress.lastUpdateTime - progress.startTime,
      adaptationCount: progress.adaptationCount,
      stallCount: progress.stallHistory.length,
    });

    // Remove from active tasks
    this.activeTasks.delete(taskId);

    this.logger.info(`Task ${taskId} monitoring completed`, {
      executionTime: `${Math.round((progress.lastUpdateTime - progress.startTime) / 1000)} seconds`,
      stallCount: progress.stallHistory.length,
      adaptationCount: progress.adaptationCount,
    });
  }

  /**
   * Record a strategy adaptation for a task
   */
  public recordAdaptation(
    taskId: string,
    capability: string,
    reason: string,
  ): void {
    if (!this.activeTasks.has(taskId)) return;

    const progress = this.activeTasks.get(taskId)!;

    // Increment adaptation count
    progress.adaptationCount++;

    // If currently stalled, mark stall as resolved
    if (progress.isStalled) {
      const lastStall = progress.stallHistory[progress.stallHistory.length - 1];
      if (lastStall && !lastStall.endTime) {
        lastStall.endTime = Date.now();
        lastStall.duration = lastStall.endTime - lastStall.startTime;
        lastStall.recoveryAction = `strategy_adaptation_${reason}`;
      }

      progress.isStalled = false;

      this.emit(ProgressMonitoringEvent.STALL_RESOLVED, {
        taskId,
        capability,
        progress,
        adaptationReason: reason,
      });
    }

    // Store updated progress
    this.activeTasks.set(taskId, progress);

    this.logger.info(`Task ${taskId} strategy adaptation recorded`, {
      reason,
      adaptationCount: progress.adaptationCount,
    });
  }

  /**
   * Get the current progress for a task
   */
  public getTaskProgress(taskId: string): EnhancedTaskProgress | null {
    return this.activeTasks.get(taskId) || null;
  }

  /**
   * Get all active task IDs being monitored
   */
  public getActiveTasks(): string[] {
    return Array.from(this.activeTasks.keys());
  }

  /**
   * Force an adaptation recommendation for a task
   */
  public recommendAdaptation(
    taskId: string,
    capability: string,
    reason: string,
    suggestedAdaptations: {
      type: string;
      description: string;
      confidence: number;
    }[],
  ): void {
    if (!this.activeTasks.has(taskId)) return;

    const progress = this.activeTasks.get(taskId)!;

    const notification: ProgressUpdateNotification = {
      taskId,
      capability,
      progress,
      adaptationRecommended: true,
      adaptationReasons: [reason],
      suggestedAdaptations,
    };

    this.emit(ProgressMonitoringEvent.ADAPTATION_RECOMMENDED, notification);

    this.logger.info(`Task ${taskId} adaptation recommended`, { reason });
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<ProgressMonitoringConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    this.logger.info('ProgressMonitoringService configuration updated', {
      stallThreshold: this.config.stallThresholdMs,
      monitoringInterval: this.config.monitoringIntervalMs,
    });
  }
}
