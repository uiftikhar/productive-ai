import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  PlanAdjustmentService,
  AdjustmentType,
  PlanAdjustment,
  TaskPlan,
  TaskStatus,
  AdaptationActionType,
} from '../interfaces/execution-monitoring.interface';
import { PerformanceMonitorServiceImpl } from './performance-monitor.service';

/**
 * Implementation of the plan adjustment service
 */
export class PlanAdjustmentServiceImpl implements PlanAdjustmentService {
  private logger: Logger;
  private taskPlans: Map<string, TaskPlan> = new Map();
  private adjustmentHistory: Map<string, PlanAdjustment[]> = new Map(); // taskId -> adjustments
  private adjustmentListeners: Map<
    string,
    ((adjustment: PlanAdjustment) => void)[]
  > = new Map();
  private performanceMonitor?: PerformanceMonitorServiceImpl;
  private adjustmentStrategies: Map<
    AdjustmentType,
    (taskId: string, reason: string) => boolean
  > = new Map();

  constructor(
    options: {
      logger?: Logger;
      performanceMonitor?: PerformanceMonitorServiceImpl;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.performanceMonitor = options.performanceMonitor;

    // Initialize adjustment strategies
    this.initializeAdjustmentStrategies();

    this.logger.info('Plan adjustment service initialized');
  }

  /**
   * Initialize the predefined adjustment strategies
   */
  private initializeAdjustmentStrategies(): void {
    // Register strategies for each adjustment type
    this.adjustmentStrategies.set(
      AdjustmentType.TIMEOUT_EXTENSION,
      this.applyTimeoutExtension.bind(this),
    );
    this.adjustmentStrategies.set(
      AdjustmentType.PRIORITY_BOOST,
      this.applyPriorityBoost.bind(this),
    );
    this.adjustmentStrategies.set(
      AdjustmentType.RESOURCE_REALLOCATION,
      this.applyResourceReallocation.bind(this),
    );
    this.adjustmentStrategies.set(
      AdjustmentType.TASK_SPLIT,
      this.applyTaskSplit.bind(this),
    );
    this.adjustmentStrategies.set(
      AdjustmentType.PARALLELIZATION,
      this.applyParallelization.bind(this),
    );
    this.adjustmentStrategies.set(
      AdjustmentType.RETRY,
      this.applyRetry.bind(this),
    );
    this.adjustmentStrategies.set(
      AdjustmentType.FALLBACK,
      this.applyFallback.bind(this),
    );
    this.adjustmentStrategies.set(
      AdjustmentType.EARLY_TERMINATION,
      this.applyEarlyTermination.bind(this),
    );
  }

  /**
   * Register a task plan for potential adjustments
   */
  registerTaskPlan(plan: TaskPlan): boolean {
    const { taskId } = plan;

    // Check if plan already exists
    if (this.taskPlans.has(taskId)) {
      this.logger.warn(`Task plan for task ${taskId} already exists`);
      return false;
    }

    // Store the plan
    this.taskPlans.set(taskId, plan);

    // Initialize adjustment history
    this.adjustmentHistory.set(taskId, []);

    this.logger.info(`Registered task plan for task ${taskId}`, {
      taskId,
      steps: plan.steps.length,
      expectedDuration: plan.expectedDuration,
    });

    return true;
  }

  /**
   * Update an existing task plan
   */
  updateTaskPlan(taskId: string, updates: Partial<TaskPlan>): boolean {
    const plan = this.taskPlans.get(taskId);
    if (!plan) {
      this.logger.warn(
        `Cannot update non-existent task plan for task ${taskId}`,
      );
      return false;
    }

    // Create updated plan
    const updatedPlan: TaskPlan = {
      ...plan,
      ...updates,
      taskId, // Ensure taskId is not changed
    };

    // Update steps if provided
    if (updates.steps) {
      updatedPlan.steps = [...updates.steps];
    }

    // Store updated plan
    this.taskPlans.set(taskId, updatedPlan);

    this.logger.info(`Updated task plan for task ${taskId}`, {
      taskId,
      updatedFields: Object.keys(updates),
    });

    return true;
  }

  /**
   * Get a task plan by ID
   */
  getTaskPlan(taskId: string): TaskPlan | undefined {
    return this.taskPlans.get(taskId);
  }

  /**
   * Check if adjustments are needed for a task
   */
  checkForAdjustments(taskId: string): PlanAdjustment[] {
    const plan = this.taskPlans.get(taskId);
    if (!plan) {
      this.logger.warn(
        `Cannot check adjustments for non-existent task plan: ${taskId}`,
      );
      return [];
    }

    // Get task metrics from performance monitor if available
    const taskMetrics = this.performanceMonitor?.getTaskMetrics(taskId);

    // Initialize potential adjustments
    const potentialAdjustments: PlanAdjustment[] = [];

    // Check for timeout extension
    if (
      taskMetrics &&
      plan.expectedDuration &&
      taskMetrics.startTime &&
      !taskMetrics.endTime
    ) {
      const elapsed = Date.now() - taskMetrics.startTime.getTime();
      const nearingTimeout = elapsed > plan.expectedDuration * 0.8;

      if (nearingTimeout) {
        potentialAdjustments.push({
          id: uuidv4(),
          taskId,
          type: AdjustmentType.TIMEOUT_EXTENSION,
          timestamp: new Date(),
          reason: `Task is approaching timeout (${Math.round(elapsed / 1000)}s/${Math.round(plan.expectedDuration / 1000)}s)`,
          applied: false,
        });
      }
    }

    // Check for resource reallocation if tasks are going slower than expected
    if (taskMetrics && taskMetrics.progress < 0.5 && taskMetrics.startTime) {
      const elapsed = Date.now() - taskMetrics.startTime.getTime();
      const expectedProgress = plan.expectedDuration
        ? elapsed / plan.expectedDuration
        : 0.5;

      if (
        expectedProgress > 0.6 &&
        taskMetrics.progress < expectedProgress * 0.7
      ) {
        potentialAdjustments.push({
          id: uuidv4(),
          taskId,
          type: AdjustmentType.RESOURCE_REALLOCATION,
          timestamp: new Date(),
          reason: `Task progress (${Math.round(taskMetrics.progress * 100)}%) significantly behind expected (${Math.round(expectedProgress * 100)}%)`,
          applied: false,
        });
      }
    }

    // Check for priority boost for important tasks taking too long
    if (plan.priority && plan.priority > 7) {
      // High priority tasks
      potentialAdjustments.push({
        id: uuidv4(),
        taskId,
        type: AdjustmentType.PRIORITY_BOOST,
        timestamp: new Date(),
        reason: `High priority task (${plan.priority}) needs acceleration`,
        applied: false,
      });
    }

    // Check if task should be split (for long-running tasks with many steps)
    if (
      plan.steps.length > 5 && // Complex task with many steps
      taskMetrics?.progress &&
      taskMetrics.progress < 0.3 && // Early in execution
      plan.expectedDuration &&
      plan.expectedDuration > 60000 // Long running task (> 1 minute)
    ) {
      potentialAdjustments.push({
        id: uuidv4(),
        taskId,
        type: AdjustmentType.TASK_SPLIT,
        timestamp: new Date(),
        reason: `Complex task with ${plan.steps.length} steps could be split for better progress tracking`,
        applied: false,
      });
    }

    // Check for parallelization opportunities
    if (
      plan.steps.length > 3 && // Multiple steps
      plan.steps.some(
        (step: any) => !step.dependencies || step.dependencies.length === 0,
      ) // Some steps have no dependencies
    ) {
      potentialAdjustments.push({
        id: uuidv4(),
        taskId,
        type: AdjustmentType.PARALLELIZATION,
        timestamp: new Date(),
        reason: `Task has independent steps that could be parallelized`,
        applied: false,
      });
    }

    // Check for retry if the task has failed steps
    if (
      plan.steps.some((step: any) => step.status === TaskStatus.FAILED) &&
      !plan.steps.every((step: any) => step.status === TaskStatus.FAILED) // Not all steps failed
    ) {
      potentialAdjustments.push({
        id: uuidv4(),
        taskId,
        type: AdjustmentType.RETRY,
        timestamp: new Date(),
        reason: `Some steps have failed and could be retried`,
        applied: false,
      });
    }

    // Check for fallback if all steps have failed
    if (plan.steps.every((step: any) => step.status === TaskStatus.FAILED)) {
      potentialAdjustments.push({
        id: uuidv4(),
        taskId,
        type: AdjustmentType.FALLBACK,
        timestamp: new Date(),
        reason: `All steps have failed, fallback mechanism needed`,
        applied: false,
      });
    }

    // Check for early termination if the task is stuck or not progressing
    if (
      taskMetrics &&
      taskMetrics.startTime &&
      taskMetrics.status === 'running' &&
      taskMetrics.events.length > 2
    ) {
      const elapsed = Date.now() - taskMetrics.startTime.getTime();
      const lastEventTime =
        taskMetrics.events[taskMetrics.events.length - 1].timestamp.getTime();
      const timeSinceLastEvent = Date.now() - lastEventTime;

      // If no progress for more than 30% of total elapsed time and at least 30 seconds
      if (timeSinceLastEvent > Math.max(elapsed * 0.3, 30000)) {
        potentialAdjustments.push({
          id: uuidv4(),
          taskId,
          type: AdjustmentType.EARLY_TERMINATION,
          timestamp: new Date(),
          reason: `Task appears stuck with no progress for ${Math.round(timeSinceLastEvent / 1000)}s`,
          applied: false,
        });
      }
    }

    return potentialAdjustments;
  }

  /**
   * Apply a specific adjustment to a task
   */
  applyAdjustment(
    taskId: string,
    adjustmentType: AdjustmentType,
    reason: string,
  ): boolean {
    const plan = this.taskPlans.get(taskId);
    if (!plan) {
      this.logger.warn(
        `Cannot apply adjustment to non-existent task plan: ${taskId}`,
      );
      return false;
    }

    // Get the strategy for this adjustment type
    const strategy = this.adjustmentStrategies.get(adjustmentType);
    if (!strategy) {
      this.logger.warn(
        `No strategy found for adjustment type: ${adjustmentType}`,
      );
      return false;
    }

    // Apply the strategy
    const success = strategy(taskId, reason);

    if (success) {
      // Create adjustment record
      const adjustment: PlanAdjustment = {
        id: uuidv4(),
        taskId,
        type: adjustmentType,
        timestamp: new Date(),
        reason,
        applied: true,
      };

      // Add to history
      const history = this.adjustmentHistory.get(taskId) || [];
      history.push(adjustment);
      this.adjustmentHistory.set(taskId, history);

      // Notify listeners
      this.notifyAdjustmentListeners(taskId, adjustment);

      this.logger.info(
        `Applied ${adjustmentType} adjustment to task ${taskId}`,
        {
          taskId,
          adjustmentType,
          reason,
        },
      );
    } else {
      this.logger.warn(
        `Failed to apply ${adjustmentType} adjustment to task ${taskId}`,
      );
    }

    return success;
  }

  /**
   * Get adjustment history for a task
   */
  getAdjustmentHistory(taskId: string): PlanAdjustment[] {
    return this.adjustmentHistory.get(taskId) || [];
  }

  /**
   * Subscribe to adjustment events for a task
   */
  subscribeToAdjustments(
    taskId: string,
    callback: (adjustment: PlanAdjustment) => void,
  ): () => void {
    if (!this.adjustmentListeners.has(taskId)) {
      this.adjustmentListeners.set(taskId, []);
    }

    this.adjustmentListeners.get(taskId)?.push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.adjustmentListeners.get(taskId);
      if (listeners) {
        this.adjustmentListeners.set(
          taskId,
          listeners.filter((cb) => cb !== callback),
        );
      }
    };
  }

  /**
   * Notify adjustment listeners
   */
  private notifyAdjustmentListeners(
    taskId: string,
    adjustment: PlanAdjustment,
  ): void {
    const listeners = this.adjustmentListeners.get(taskId) || [];

    for (const listener of listeners) {
      try {
        listener(adjustment);
      } catch (error) {
        this.logger.error(`Error in adjustment listener for task ${taskId}`, {
          error,
        });
      }
    }
  }

  /**
   * Apply timeout extension adjustment
   */
  private applyTimeoutExtension(taskId: string, reason: string): boolean {
    const plan = this.taskPlans.get(taskId);
    if (!plan || !plan.expectedDuration) {
      return false;
    }

    // Extend the timeout by 50%
    const newDuration = plan.expectedDuration * 1.5;

    return this.updateTaskPlan(taskId, {
      expectedDuration: newDuration,
      metadata: {
        ...plan.metadata,
        timeoutExtended: true,
        originalDuration: plan.expectedDuration,
        extensionReason: reason,
      },
    });
  }

  /**
   * Apply priority boost adjustment
   */
  private applyPriorityBoost(taskId: string, reason: string): boolean {
    const plan = this.taskPlans.get(taskId);
    if (!plan) {
      return false;
    }

    // Boost priority by 2 levels, max 10
    const currentPriority = plan.priority || 5;
    const newPriority = Math.min(10, currentPriority + 2);

    return this.updateTaskPlan(taskId, {
      priority: newPriority,
      metadata: {
        ...plan.metadata,
        priorityBoosted: true,
        originalPriority: currentPriority,
        boostReason: reason,
      },
    });
  }

  /**
   * Apply resource reallocation adjustment
   */
  private applyResourceReallocation(taskId: string, reason: string): boolean {
    const plan = this.taskPlans.get(taskId);
    if (!plan) {
      return false;
    }

    // In a real implementation, this would communicate with a resource allocation service
    // For this implementation, we'll just mark the plan as needing reallocation
    return this.updateTaskPlan(taskId, {
      metadata: {
        ...plan.metadata,
        needsReallocation: true,
        reallocationReason: reason,
        reallocationRequested: new Date().toISOString(),
      },
    });
  }

  /**
   * Apply task split adjustment
   */
  private applyTaskSplit(taskId: string, reason: string): boolean {
    const plan = this.taskPlans.get(taskId);
    if (!plan || plan.steps.length <= 1) {
      return false;
    }

    // In a real implementation, this would create sub-tasks
    // For this implementation, we'll just mark the plan as ready for splitting
    return this.updateTaskPlan(taskId, {
      metadata: {
        ...plan.metadata,
        readyForSplit: true,
        splitReason: reason,
        splitRequested: new Date().toISOString(),
      },
    });
  }

  /**
   * Apply parallelization adjustment
   */
  private applyParallelization(taskId: string, reason: string): boolean {
    const plan = this.taskPlans.get(taskId);
    if (!plan) {
      return false;
    }

    // Identify steps that can be run in parallel (those without dependencies)
    const parallelizableSteps = plan.steps
      .filter(
        (step: any) => !step.dependencies || step.dependencies.length === 0,
      )
      .map((step: any) => step.id);

    if (parallelizableSteps.length <= 1) {
      return false;
    }

    // In a real implementation, this would restructure the execution plan
    // For this implementation, we'll just mark the steps as parallelizable
    return this.updateTaskPlan(taskId, {
      metadata: {
        ...plan.metadata,
        parallelizableSteps,
        parallelizationReason: reason,
        parallelizationRequested: new Date().toISOString(),
      },
    });
  }

  /**
   * Apply retry adjustment
   */
  private applyRetry(taskId: string, reason: string): boolean {
    const plan = this.taskPlans.get(taskId);
    if (!plan) {
      return false;
    }

    // Find failed steps
    const failedSteps = plan.steps
      .filter((step: any) => step.status === TaskStatus.FAILED)
      .map((step: any) => step.id);

    if (failedSteps.length === 0) {
      return false;
    }

    // Update the status of failed steps to PENDING for retry
    const updatedSteps = plan.steps.map((step: any) => {
      if (step.status === TaskStatus.FAILED) {
        return {
          ...step,
          status: TaskStatus.PENDING,
          retried: true,
          retryCount: (step.retryCount || 0) + 1,
        };
      }
      return step;
    });

    return this.updateTaskPlan(taskId, {
      steps: updatedSteps,
      metadata: {
        ...plan.metadata,
        retriedSteps: failedSteps,
        retryReason: reason,
        lastRetryAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Apply fallback adjustment
   */
  private applyFallback(taskId: string, reason: string): boolean {
    const plan = this.taskPlans.get(taskId);
    if (!plan) {
      return false;
    }

    // In a real implementation, this would activate a fallback mechanism
    // For this implementation, we'll just mark the plan for fallback
    return this.updateTaskPlan(taskId, {
      metadata: {
        ...plan.metadata,
        needsFallback: true,
        fallbackReason: reason,
        fallbackRequested: new Date().toISOString(),
      },
    });
  }

  /**
   * Apply early termination adjustment
   */
  private applyEarlyTermination(taskId: string, reason: string): boolean {
    const plan = this.taskPlans.get(taskId);
    if (!plan) {
      return false;
    }

    // Mark all non-completed steps as CANCELLED
    const updatedSteps = plan.steps.map((step: any) => {
      if (step.status !== TaskStatus.COMPLETED) {
        return {
          ...step,
          status: TaskStatus.CANCELLED,
        };
      }
      return step;
    });

    return this.updateTaskPlan(taskId, {
      steps: updatedSteps,
      status: TaskStatus.CANCELLED,
      metadata: {
        ...plan.metadata,
        earlyTermination: true,
        terminationReason: reason,
        terminatedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Update task step status
   */
  updateStepStatus(
    taskId: string,
    stepId: string,
    status: TaskStatus,
  ): boolean {
    const plan = this.taskPlans.get(taskId);
    if (!plan) {
      this.logger.warn(
        `Cannot update step in non-existent task plan: ${taskId}`,
      );
      return false;
    }

    // Find the step
    const stepIndex = plan.steps.findIndex((step: any) => step.id === stepId);
    if (stepIndex === -1) {
      this.logger.warn(`Step ${stepId} not found in task ${taskId}`);
      return false;
    }

    // Update the step
    const updatedSteps = [...plan.steps];
    updatedSteps[stepIndex] = {
      ...updatedSteps[stepIndex],
      status,
    };

    // Update the task plan
    return this.updateTaskPlan(taskId, { steps: updatedSteps });
  }

  /**
   * Get recommended adjustments for all tasks
   */
  getRecommendedAdjustments(): Record<string, PlanAdjustment[]> {
    const recommendations: Record<string, PlanAdjustment[]> = {};

    for (const taskId of this.taskPlans.keys()) {
      const adjustments = this.checkForAdjustments(taskId);
      if (adjustments.length > 0) {
        recommendations[taskId] = adjustments;
      }
    }

    return recommendations;
  }

  /**
   * Delete a task plan
   */
  deleteTaskPlan(taskId: string): boolean {
    const exists = this.taskPlans.has(taskId);
    if (!exists) {
      return false;
    }

    this.taskPlans.delete(taskId);
    this.adjustmentHistory.delete(taskId);
    this.adjustmentListeners.delete(taskId);

    this.logger.info(`Deleted task plan for task ${taskId}`);

    return true;
  }

  /**
   * Implementation of required interface methods from PlanAdjustmentService
   * These methods are required by the interface but not used in our current implementation
   *
   * NOTE: These are stub implementations to satisfy the interface contract.
   * The current implementation uses a task-plan-based approach instead of adaptation plans.
   * These methods will be fully implemented in Milestone 4 (Emergent Workflow Visualization)
   * when we enhance the system with interactive visualization capabilities that require
   * more sophisticated adaptation plans and impact tracking.
   */
  createAdaptationPlan(
    trigger: {
      metricId?: string;
      threshold?: number;
      condition?: string;
      source: string;
    },
    priority?: number,
  ): string {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires adaptation plan tracking
    return '';
  }

  addAction(
    planId: string,
    action: {
      type: AdaptationActionType;
      target: string;
      description: string;
      parameters: Record<string, any>;
    },
  ): boolean {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires adaptation action tracking
    return false;
  }

  async executeAdaptationPlan(planId: string): Promise<boolean> {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires adaptation execution tracking
    return Promise.resolve(false);
  }

  cancelAdaptationPlan(planId: string): boolean {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires adaptation cancellation tracking
    return false;
  }

  getPendingPlans(): any[] {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires pending adaptation plan listing
    return [];
  }

  getCompletedPlans(): any[] {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires completed adaptation plan history
    return [];
  }

  getAdaptationPlanById(planId: string): any {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires detailed adaptation plan inspection
    return undefined;
  }

  getAdaptationHistoryForTask(taskId: string): any[] {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires task-specific adaptation history
    return [];
  }

  evaluateAdaptationImpact(planId: string): Record<string, any> {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires adaptation impact metrics
    return {};
  }

  getMostEffectiveAdaptations(): Record<string, number> {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires adaptation effectiveness analytics
    return {};
  }
}
