import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  ExecutionStatusLevel,
  FailureRecoveryService,
  FailureRecoveryAction,
  RecoveryContext,
  RecoveryPhase,
  RecoveryPlan,
  RecoveryStrategy,
} from '../interfaces/execution-monitoring.interface';
import { PerformanceMonitorServiceImpl } from './performance-monitor.service';

/**
 * Implementation of the failure recovery service
 */
export class FailureRecoveryServiceImpl implements FailureRecoveryService {
  private logger: Logger;
  private recoveryPlans: Map<string, RecoveryPlan> = new Map();
  private recoveryStrategies: Map<string, RecoveryStrategy> = new Map();
  private recoveryListeners: Map<string, ((plan: RecoveryPlan) => void)[]> =
    new Map();
  private performanceMonitor?: PerformanceMonitorServiceImpl;
  private executionHistory: Map<
    string,
    {
      timestamp: Date;
      action: FailureRecoveryAction;
      result: boolean;
      details?: string;
    }[]
  > = new Map();

  constructor(
    options: {
      logger?: Logger;
      performanceMonitor?: PerformanceMonitorServiceImpl;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.performanceMonitor = options.performanceMonitor;

    // Register default recovery strategies
    this.registerDefaultStrategies();

    this.logger.info('Failure recovery service initialized');
  }

  /**
   * Register default recovery strategies
   */
  private registerDefaultStrategies(): void {
    // Simple retry strategy
    this.registerRecoveryStrategy({
      id: 'simple-retry',
      name: 'Simple Retry',
      description: 'Retry the failed task with the same parameters',
      applicableFailureTypes: [
        'timeout',
        'temporary-error',
        'connection-error',
      ],
      maxRetries: 3,
      backoffFactor: 2,
      priority: 10,
      execute: (context: RecoveryContext) => this.executeRetryStrategy(context),
    });

    // Circuit breaker strategy
    this.registerRecoveryStrategy({
      id: 'circuit-breaker',
      name: 'Circuit Breaker',
      description:
        'Stop retrying after multiple failures to prevent cascading failures',
      applicableFailureTypes: [
        'system-overload',
        'rate-limit',
        'resource-exhaustion',
      ],
      maxRetries: 1,
      backoffFactor: 5,
      priority: 20,
      execute: (context: RecoveryContext) =>
        this.executeCircuitBreakerStrategy(context),
    });

    // Fallback strategy
    this.registerRecoveryStrategy({
      id: 'fallback-execution',
      name: 'Fallback Execution',
      description: 'Execute an alternative implementation or path',
      applicableFailureTypes: [
        'permanent-error',
        'validation-error',
        'unsupported-operation',
      ],
      maxRetries: 1,
      backoffFactor: 1,
      priority: 30,
      execute: (context: RecoveryContext) =>
        this.executeFallbackStrategy(context),
    });

    // Compensating action strategy
    this.registerRecoveryStrategy({
      id: 'compensating-action',
      name: 'Compensating Action',
      description:
        'Perform a compensating action to restore system to a consistent state',
      applicableFailureTypes: [
        'partial-completion',
        'inconsistent-state',
        'transaction-error',
      ],
      maxRetries: 2,
      backoffFactor: 1,
      priority: 40,
      execute: (context: RecoveryContext) =>
        this.executeCompensatingStrategy(context),
    });

    // Graceful degradation strategy
    this.registerRecoveryStrategy({
      id: 'graceful-degradation',
      name: 'Graceful Degradation',
      description: 'Continue with reduced functionality',
      applicableFailureTypes: [
        'dependency-failure',
        'partial-failure',
        'performance-degradation',
      ],
      maxRetries: 0,
      backoffFactor: 0,
      priority: 50,
      execute: (context: RecoveryContext) =>
        this.executeGracefulDegradationStrategy(context),
    });
  }

  /**
   * Execute simple retry strategy
   */
  private executeRetryStrategy(context: RecoveryContext): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const { failureId, retryCount, maxRetries = 3 } = context;

      if (retryCount >= maxRetries) {
        this.logger.warn(
          `Retry limit reached for failure ${failureId}, giving up after ${retryCount} attempts`,
        );
        resolve(false);
        return;
      }

      const backoffMs = context.backoffFactor
        ? Math.pow(context.backoffFactor, retryCount) * 1000
        : retryCount * 1000;

      this.logger.info(
        `Retrying operation for failure ${failureId}, attempt ${retryCount + 1} after ${backoffMs}ms backoff`,
      );

      // In a real implementation, we would actually retry the operation
      // For this implementation, we'll just simulate success most of the time
      setTimeout(() => {
        // Simulate 80% success rate for retries
        const success = Math.random() < 0.8;

        if (success) {
          this.logger.info(
            `Retry succeeded for failure ${failureId} on attempt ${retryCount + 1}`,
          );
        } else {
          this.logger.warn(
            `Retry failed for failure ${failureId} on attempt ${retryCount + 1}`,
          );
        }

        resolve(success);
      }, backoffMs);
    });
  }

  /**
   * Execute circuit breaker strategy
   */
  private executeCircuitBreakerStrategy(
    context: RecoveryContext,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const { failureId, failureType, affectedComponent } = context;

      // In a real implementation, we would check if circuit is already open for this component
      // For simplicity, we'll simulate the circuit breaker state

      this.logger.info(
        `Executing circuit breaker strategy for ${failureType} in ${affectedComponent}`,
      );

      // Simulate opening the circuit for the component
      setTimeout(() => {
        this.logger.info(
          `Opened circuit for ${affectedComponent} due to ${failureType}`,
        );

        // Simulate success (successfully prevented further calls)
        resolve(true);
      }, 500);
    });
  }

  /**
   * Execute fallback strategy
   */
  private executeFallbackStrategy(context: RecoveryContext): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const { failureId, failureDetails, affectedComponent } = context;

      this.logger.info(`Executing fallback strategy for ${affectedComponent}`, {
        failureId,
        details: failureDetails,
      });

      // In a real implementation, we would route to an alternative implementation
      // For this implementation, simulate a fallback operation
      setTimeout(() => {
        this.logger.info(
          `Fallback executed successfully for ${affectedComponent}`,
        );

        // Simulate high success rate for fallbacks
        const success = Math.random() < 0.9;
        resolve(success);
      }, 1000);
    });
  }

  /**
   * Execute compensating strategy
   */
  private executeCompensatingStrategy(
    context: RecoveryContext,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const { failureId, failureDetails, affectedComponent, additionalData } =
        context;

      this.logger.info(
        `Executing compensating actions for ${affectedComponent}`,
        {
          failureId,
          details: failureDetails,
        },
      );

      // In a real implementation, we would perform operations to restore consistency
      // For this implementation, simulate compensating actions
      setTimeout(() => {
        // Perform "rollback" or compensation actions
        const transactionId = additionalData?.transactionId;

        if (transactionId) {
          this.logger.info(
            `Rolling back transaction ${transactionId} for ${affectedComponent}`,
          );
          // Simulate rollback operations
        }

        this.logger.info(
          `Compensating actions completed for ${affectedComponent}`,
        );

        // Compensation has decent success rate
        const success = Math.random() < 0.85;
        resolve(success);
      }, 1500);
    });
  }

  /**
   * Execute graceful degradation strategy
   */
  private executeGracefulDegradationStrategy(
    context: RecoveryContext,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const { failureId, affectedComponent, additionalData } = context;

      this.logger.info(
        `Executing graceful degradation for ${affectedComponent}`,
        {
          failureId,
          features: additionalData?.features,
        },
      );

      // In a real implementation, we would disable certain features or use simpler alternatives
      // For this implementation, simulate degradation
      setTimeout(() => {
        // Disable affected features
        const features = additionalData?.features || [];

        if (features.length > 0) {
          this.logger.info(
            `Disabled features for ${affectedComponent}: ${features.join(', ')}`,
          );
        } else {
          this.logger.info(`Degraded functionality for ${affectedComponent}`);
        }

        // Degradation almost always succeeds since it's just disabling functionality
        resolve(true);
      }, 500);
    });
  }

  /**
   * Register a recovery strategy
   */
  registerRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.set(strategy.id, strategy);

    this.logger.info(
      `Registered recovery strategy: ${strategy.name} (${strategy.id})`,
      {
        applicableFailures: strategy.applicableFailureTypes,
        priority: strategy.priority,
      },
    );
  }

  /**
   * Create a recovery plan for a failure
   */
  createRecoveryPlan(
    failureId: string,
    failureType: string,
    affectedComponent: string,
    details?: Record<string, any>,
  ): RecoveryPlan {
    // Find applicable strategies for this failure type
    const applicableStrategies = Array.from(this.recoveryStrategies.values())
      .filter(
        (strategy) =>
          strategy.applicableFailureTypes.includes(failureType) ||
          strategy.applicableFailureTypes.includes('*'), // Wildcard for any failure
      )
      .sort((a, b) => a.priority - b.priority); // Sort by priority (lower = higher priority)

    if (applicableStrategies.length === 0) {
      this.logger.warn(
        `No recovery strategies found for failure type: ${failureType}`,
      );
    }

    // Get metrics if available
    const systemStatus =
      this.performanceMonitor?.getExecutionStatus() ||
      ExecutionStatusLevel.GOOD;

    // Create recovery plan
    const plan: RecoveryPlan = {
      id: uuidv4(),
      failureId,
      failureType,
      affectedComponent,
      details: details || {},
      createdAt: new Date(),
      strategies: applicableStrategies.map((strategy) => ({
        strategyId: strategy.id,
        name: strategy.name,
        priority: strategy.priority,
        maxRetries: strategy.maxRetries,
        backoffFactor: strategy.backoffFactor,
      })),
      currentPhase: RecoveryPhase.PLANNED,
      executionOrder: applicableStrategies.map((s) => s.id),
      systemStatusAtFailure: systemStatus,
      waitingThreads: [],
    };

    // Store the plan
    this.recoveryPlans.set(plan.id, plan);

    // Initialize execution history
    this.executionHistory.set(plan.id, []);

    this.logger.info(
      `Created recovery plan ${plan.id} for failure: ${failureType} in ${affectedComponent}`,
      {
        planId: plan.id,
        strategies: plan.strategies.length,
      },
    );

    return plan;
  }

  /**
   * Execute a recovery plan
   */
  async executeRecoveryPlan(planId: string): Promise<boolean> {
    const plan = this.recoveryPlans.get(planId);
    if (!plan) {
      this.logger.warn(`Cannot execute non-existent recovery plan: ${planId}`);
      return false;
    }

    // Check if plan is already completed or executing
    if (
      plan.currentPhase === RecoveryPhase.SUCCEEDED ||
      plan.currentPhase === RecoveryPhase.FAILED
    ) {
      this.logger.warn(
        `Recovery plan ${planId} already completed with phase: ${plan.currentPhase}`,
      );
      return plan.currentPhase === RecoveryPhase.SUCCEEDED;
    }

    if (plan.currentPhase === RecoveryPhase.EXECUTING) {
      this.logger.warn(`Recovery plan ${planId} is already executing`);
      return false;
    }

    // Update plan to executing
    const updatedPlan: RecoveryPlan = {
      ...plan,
      currentPhase: RecoveryPhase.EXECUTING,
      executionStartedAt: new Date(),
    };

    this.recoveryPlans.set(planId, updatedPlan);
    this.notifyRecoveryListeners(planId, updatedPlan);

    // Track execution history
    const history = this.executionHistory.get(planId) || [];
    history.push({
      timestamp: new Date(),
      action: FailureRecoveryAction.EXECUTION_STARTED,
      result: true,
    });
    this.executionHistory.set(planId, history);

    // Execute strategies in order
    let success = false;

    for (const strategyId of plan.executionOrder) {
      const strategy = this.recoveryStrategies.get(strategyId);
      if (!strategy) {
        this.logger.warn(
          `Strategy ${strategyId} not found for recovery plan ${planId}`,
        );
        continue;
      }

      // Create context for the strategy
      const context: RecoveryContext = {
        recoveryPlanId: planId,
        failureId: plan.failureId,
        failureType: plan.failureType,
        affectedComponent: plan.affectedComponent,
        failureDetails: plan.details,
        retryCount: 0, // Start with attempt 0
        maxRetries: strategy.maxRetries,
        backoffFactor: strategy.backoffFactor,
        additionalData: plan.details,
      };

      // Record strategy start
      history.push({
        timestamp: new Date(),
        action: FailureRecoveryAction.STRATEGY_STARTED,
        result: true,
        details: `Strategy: ${strategy.name}`,
      });

      this.logger.info(
        `Executing recovery strategy ${strategy.name} for plan ${planId}`,
      );

      // Try the strategy with retries
      let strategySuccess = false;
      let attemptCount = 0;

      while (attemptCount <= strategy.maxRetries) {
        context.retryCount = attemptCount;

        try {
          strategySuccess = await strategy.execute(context);

          // Record attempt result
          history.push({
            timestamp: new Date(),
            action: FailureRecoveryAction.STRATEGY_ATTEMPT,
            result: strategySuccess,
            details: `Strategy: ${strategy.name}, Attempt: ${attemptCount + 1}`,
          });

          if (strategySuccess) {
            this.logger.info(
              `Strategy ${strategy.name} succeeded for plan ${planId}`,
            );
            break;
          } else {
            this.logger.warn(
              `Strategy ${strategy.name} attempt ${attemptCount + 1} failed for plan ${planId}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error executing strategy ${strategy.name} for plan ${planId}`,
            { error },
          );

          // Record error
          history.push({
            timestamp: new Date(),
            action: FailureRecoveryAction.STRATEGY_ERROR,
            result: false,
            details: `Strategy: ${strategy.name}, Error: ${error}`,
          });
        }

        attemptCount++;

        if (strategySuccess || attemptCount > strategy.maxRetries) {
          break;
        }
      }

      // Record strategy completion
      history.push({
        timestamp: new Date(),
        action: FailureRecoveryAction.STRATEGY_COMPLETED,
        result: strategySuccess,
        details: `Strategy: ${strategy.name}, Success: ${strategySuccess}`,
      });

      if (strategySuccess) {
        success = true;
        break; // Stop trying other strategies if one succeeds
      }
    }

    // Update plan to completed
    const completedPlan: RecoveryPlan = {
      ...updatedPlan,
      currentPhase: success ? RecoveryPhase.SUCCEEDED : RecoveryPhase.FAILED,
      executionCompletedAt: new Date(),
      result: success ? 'Successfully recovered' : 'Failed to recover',
    };

    this.recoveryPlans.set(planId, completedPlan);

    // Record completion
    history.push({
      timestamp: new Date(),
      action: FailureRecoveryAction.EXECUTION_COMPLETED,
      result: success,
      details: success ? 'Recovery succeeded' : 'Recovery failed',
    });

    this.logger.info(
      `Recovery plan ${planId} execution completed with result: ${success ? 'SUCCESS' : 'FAILURE'}`,
    );

    // Notify listeners
    this.notifyRecoveryListeners(planId, completedPlan);

    return success;
  }

  /**
   * Get a recovery plan by ID
   */
  getRecoveryPlan(planId: string): RecoveryPlan | undefined {
    return this.recoveryPlans.get(planId);
  }

  /**
   * Subscribe to recovery plan updates
   */
  subscribeToRecoveryPlanUpdates(
    planId: string,
    callback: (plan: RecoveryPlan) => void,
  ): () => void {
    if (!this.recoveryListeners.has(planId)) {
      this.recoveryListeners.set(planId, []);
    }

    this.recoveryListeners.get(planId)?.push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.recoveryListeners.get(planId);
      if (listeners) {
        this.recoveryListeners.set(
          planId,
          listeners.filter((cb) => cb !== callback),
        );
      }
    };
  }

  /**
   * Notify recovery plan listeners about updates
   */
  private notifyRecoveryListeners(planId: string, plan: RecoveryPlan): void {
    const listeners = this.recoveryListeners.get(planId) || [];

    for (const listener of listeners) {
      try {
        listener(plan);
      } catch (error) {
        this.logger.error(`Error in recovery plan listener for ${planId}`, {
          error,
        });
      }
    }
  }

  /**
   * Get execution history for a recovery plan
   */
  getExecutionHistory(planId: string): {
    timestamp: Date;
    action: FailureRecoveryAction;
    result: boolean;
    details?: string;
  }[] {
    return this.executionHistory.get(planId) || [];
  }

  /**
   * Cancel an executing recovery plan
   */
  cancelRecoveryPlan(planId: string, reason: string): boolean {
    const plan = this.recoveryPlans.get(planId);
    if (!plan) {
      this.logger.warn(`Cannot cancel non-existent recovery plan: ${planId}`);
      return false;
    }

    // Can only cancel plans that are planned or executing
    if (
      plan.currentPhase !== RecoveryPhase.PLANNED &&
      plan.currentPhase !== RecoveryPhase.EXECUTING
    ) {
      this.logger.warn(
        `Cannot cancel recovery plan ${planId} in phase: ${plan.currentPhase}`,
      );
      return false;
    }

    // Update plan to cancelled
    const cancelledPlan: RecoveryPlan = {
      ...plan,
      currentPhase: RecoveryPhase.CANCELLED,
      executionCompletedAt: new Date(),
      result: `Cancelled: ${reason}`,
    };

    this.recoveryPlans.set(planId, cancelledPlan);

    // Record cancellation
    const history = this.executionHistory.get(planId) || [];
    history.push({
      timestamp: new Date(),
      action: FailureRecoveryAction.CANCELLED,
      result: true,
      details: reason,
    });

    this.logger.info(`Recovery plan ${planId} cancelled: ${reason}`);

    // Notify listeners
    this.notifyRecoveryListeners(planId, cancelledPlan);

    return true;
  }

  /**
   * Get recovery plans for a specific component
   */
  getRecoveryPlansForComponent(component: string): RecoveryPlan[] {
    return Array.from(this.recoveryPlans.values()).filter(
      (plan) => plan.affectedComponent === component,
    );
  }

  /**
   * Delete a recovery plan
   */
  deleteRecoveryPlan(planId: string): boolean {
    const exists = this.recoveryPlans.has(planId);
    if (!exists) {
      return false;
    }

    this.recoveryPlans.delete(planId);
    this.executionHistory.delete(planId);
    this.recoveryListeners.delete(planId);

    this.logger.info(`Deleted recovery plan ${planId}`);

    return true;
  }

  /**
   * Implementation of required interface methods from FailureRecoveryService
   * These methods are required by the interface but not needed in our current implementation
   *
   * NOTE: These are stub implementations to satisfy the interface contract.
   * The current implementation uses a recovery-plan-based approach instead of alternative paths.
   * These methods will be fully implemented in Milestone 4 (Emergent Workflow Visualization)
   * when we enhance the system with visualizing alternative execution paths and providing
   * interactive exploration of recovery options.
   */
  registerAlternativePath(): string {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires alternative path tracking
    return '';
  }

  getAlternativePaths(): any[] {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires alternative path listing
    return [];
  }

  selectBestAlternativePath(): any {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires path selection visualization
    return undefined;
  }

  executeAlternativePath(): Promise<boolean> {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires path execution tracking
    return Promise.resolve(false);
  }

  recordPathAttempt(): boolean {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires path attempt history
    return false;
  }

  getSuccessfulPaths(): any[] {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires successful path analytics
    return [];
  }

  getFailedPaths(): any[] {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires failed path analytics
    return [];
  }

  getPathSuccessRate(): number {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires path success metrics
    return 0;
  }

  suggestNewAlternatives(): Promise<any[]> {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires alternative suggestion tracking
    return Promise.resolve([]);
  }

  getRecoveryStrategies(): any[] {
    // Implementation not needed for current functionality
    // Will be implemented in Milestone 4 when visualization requires strategy listing
    return [];
  }
}
