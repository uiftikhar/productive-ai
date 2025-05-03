/**
 * Interfaces for Execution Monitoring & Adaptation
 *
 * These interfaces define the core types and structures for performance monitoring,
 * runtime plan adjustment, and failure recovery with alternative path selection.
 */

/**
 * Execution status levels for performance monitoring
 */
export enum ExecutionStatusLevel {
  OPTIMAL = 'optimal', // Execution is proceeding optimally
  GOOD = 'good', // Execution is proceeding well
  ACCEPTABLE = 'acceptable', // Execution is acceptable but could be improved
  CONCERNING = 'concerning', // Execution shows some concerning patterns
  PROBLEMATIC = 'problematic', // Execution has significant issues
  CRITICAL = 'critical', // Execution has critical issues requiring immediate action
  FAILED = 'failed', // Execution has failed
}

/**
 * Adaptation action type
 */
export enum AdaptationActionType {
  RESOURCE_ADJUSTMENT = 'resource_adjustment', // Change resource allocation
  PRIORITY_CHANGE = 'priority_change', // Change task priority
  STRATEGY_SWITCH = 'strategy_switch', // Switch to alternative strategy
  TASK_REORDERING = 'task_reordering', // Change task execution order
  TASK_CANCELLATION = 'task_cancellation', // Cancel specific tasks
  PARALLEL_EXECUTION = 'parallel_execution', // Execute tasks in parallel
  PARAMETER_TUNING = 'parameter_tuning', // Adjust execution parameters
  ERROR_RECOVERY = 'error_recovery', // Recover from error state
  WORKFLOW_RESTRUCTURING = 'workflow_restructuring', // Restructure the workflow
}

/**
 * Task status enum
 */
export enum TaskStatus {
  PENDING = 'pending', // Task is waiting to be executed
  RUNNING = 'running', // Task is currently running
  COMPLETED = 'completed', // Task has completed successfully
  FAILED = 'failed', // Task has failed
  CANCELLED = 'cancelled', // Task was cancelled
  BLOCKED = 'blocked', // Task is blocked on a dependency
  RETRYING = 'retrying', // Task is being retried after failure
}

/**
 * Recovery phases enum
 */
export enum RecoveryPhase {
  PLANNED = 'planned', // Recovery plan created but not executed
  EXECUTING = 'executing', // Recovery plan is currently executing
  SUCCEEDED = 'succeeded', // Recovery plan executed successfully
  FAILED = 'failed', // Recovery plan failed
  CANCELLED = 'cancelled', // Recovery plan was cancelled
}

/**
 * Failure recovery action enum
 */
export enum FailureRecoveryAction {
  EXECUTION_STARTED = 'execution_started', // Recovery plan execution started
  STRATEGY_STARTED = 'strategy_started', // Recovery strategy started
  STRATEGY_ATTEMPT = 'strategy_attempt', // Individual strategy attempt
  STRATEGY_ERROR = 'strategy_error', // Error during strategy execution
  STRATEGY_COMPLETED = 'strategy_completed', // Recovery strategy completed
  EXECUTION_COMPLETED = 'execution_completed', // Recovery plan execution completed
  CANCELLED = 'cancelled', // Recovery plan was cancelled
}

/**
 * Adjustment type enum
 */
export enum AdjustmentType {
  TIMEOUT_EXTENSION = 'timeout_extension', // Extend task timeout
  PRIORITY_BOOST = 'priority_boost', // Boost task priority
  RESOURCE_REALLOCATION = 'resource_reallocation', // Reallocate resources
  TASK_SPLIT = 'task_split', // Split task into subtasks
  PARALLELIZATION = 'parallelization', // Parallelize task execution
  RETRY = 'retry', // Retry failed steps
  FALLBACK = 'fallback', // Use fallback mechanism
  EARLY_TERMINATION = 'early_termination', // Terminate task early
}

/**
 * Task plan interface
 */
export interface TaskPlan {
  taskId: string;
  name?: string;
  steps: {
    id: string;
    name?: string;
    status: TaskStatus;
    dependencies?: string[];
    retryCount?: number;
  }[];
  expectedDuration?: number;
  priority?: number;
  metadata?: Record<string, any>;
  status?: TaskStatus;
}

/**
 * Plan adjustment interface
 */
export interface PlanAdjustment {
  id: string;
  taskId: string;
  type: AdjustmentType;
  timestamp: Date;
  reason: string;
  applied: boolean;
  result?: string;
  metadata?: Record<string, any>;
}

/**
 * Recovery strategy interface
 */
export interface RecoveryStrategy {
  id: string;
  name: string;
  description: string;
  applicableFailureTypes: string[];
  maxRetries: number;
  backoffFactor: number;
  priority: number;
  execute: (context: RecoveryContext) => Promise<boolean>;
}

/**
 * Recovery context interface
 */
export interface RecoveryContext {
  recoveryPlanId: string;
  failureId: string;
  failureType: string;
  affectedComponent: string;
  failureDetails?: Record<string, any>;
  retryCount: number;
  maxRetries?: number;
  backoffFactor?: number;
  additionalData?: Record<string, any>;
}

/**
 * Recovery plan interface
 */
export interface RecoveryPlan {
  id: string;
  failureId: string;
  failureType: string;
  affectedComponent: string;
  details: Record<string, any>;
  createdAt: Date;
  strategies: {
    strategyId: string;
    name: string;
    priority: number;
    maxRetries: number;
    backoffFactor: number;
  }[];
  executionOrder: string[];
  currentPhase: RecoveryPhase;
  executionStartedAt?: Date;
  executionCompletedAt?: Date;
  result?: string | Record<string, any>;
  systemStatusAtFailure: ExecutionStatusLevel;
  waitingThreads: string[];
}

/**
 * Performance metric and threshold
 */
export interface PerformanceMetric {
  id: string;
  name: string;
  description?: string;
  value: number;
  unit: string;
  timestamp: Date;
  thresholds: {
    optimal: number;
    good: number;
    acceptable: number;
    concerning: number;
    problematic: number;
    critical: number;
  };
  trendData?: {
    timestamps: Date[];
    values: number[];
  };
  metadata?: Record<string, any>;
}

/**
 * Task execution metrics
 */
export interface TaskExecutionMetrics {
  taskId: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  status: string;
  progress: number;
  resourceUtilization: Record<string, number>; // resourceId -> utilization (0-1)
  metrics: Record<string, PerformanceMetric>;
  events: {
    timestamp: Date;
    type: string;
    description: string;
    data?: Record<string, any>;
  }[];
  statusHistory: {
    timestamp: Date;
    status: string;
    reason?: string;
  }[];
}

/**
 * Adaptation plan for execution adjustment
 */
export interface AdaptationPlan {
  id: string;
  createdAt: Date;
  trigger: {
    metricId?: string;
    threshold?: number;
    condition?: string;
    source: string;
  };
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  priority: number; // 0-10 scale
  actions: {
    type: AdaptationActionType;
    target: string; // ID of task, resource, etc.
    description: string;
    parameters: Record<string, any>;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    result?: any;
  }[];
  appliedAt?: Date;
  completedAt?: Date;
  success?: boolean;
  impact?: {
    metricsBefore: Record<string, number>;
    metricsAfter: Record<string, number>;
    improvement: Record<string, number>; // Percentage improvement
  };
}

/**
 * Alternative execution path for failure recovery
 */
export interface AlternativePath {
  id: string;
  name: string;
  description?: string;
  targetTask: string;
  triggerConditions: {
    errorType?: string;
    metricId?: string;
    threshold?: number;
    customCondition?: string;
  }[];
  strategy: string;
  estimatedSuccess: number; // 0-1 probability of success
  estimatedCost: number;
  estimatedDuration: number;
  steps: {
    id: string;
    description: string;
    action: string;
    parameters: Record<string, any>;
  }[];
  previousAttempts: {
    timestamp: Date;
    result: 'success' | 'failure';
    reason?: string;
  }[];
}

/**
 * Interface for performance monitoring service
 */
export interface PerformanceMonitorService {
  registerMetric(
    metric: Omit<PerformanceMetric, 'timestamp' | 'trendData'>,
  ): string;
  updateMetric(metricId: string, value: number): boolean;
  getMetric(metricId: string): PerformanceMetric | undefined;
  getAllMetrics(): Record<string, PerformanceMetric>;
  getExecutionStatus(): ExecutionStatusLevel;
  getTaskMetrics(taskId: string): TaskExecutionMetrics | undefined;
  updateTaskMetrics(
    taskId: string,
    metrics: Partial<TaskExecutionMetrics>,
  ): boolean;
  getSystemPerformanceReport(): Record<string, any>;
  detectAnomalies(): {
    metricId: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    value: number;
    threshold: number;
  }[];
  subscribeToMetricChanges(
    metricId: string,
    callback: (metric: PerformanceMetric) => void,
  ): () => void;
}

/**
 * Interface for plan adjustment service
 */
export interface PlanAdjustmentService {
  createAdaptationPlan(
    trigger: {
      metricId?: string;
      threshold?: number;
      condition?: string;
      source: string;
    },
    priority?: number,
  ): string;
  addAction(
    planId: string,
    action: {
      type: AdaptationActionType;
      target: string;
      description: string;
      parameters: Record<string, any>;
    },
  ): boolean;
  executeAdaptationPlan(planId: string): Promise<boolean>;
  cancelAdaptationPlan(planId: string): boolean;
  getPendingPlans(): AdaptationPlan[];
  getCompletedPlans(): AdaptationPlan[];
  getAdaptationPlanById(planId: string): AdaptationPlan | undefined;
  getAdaptationHistoryForTask(taskId: string): AdaptationPlan[];
  evaluateAdaptationImpact(planId: string): Record<string, any>;
  getMostEffectiveAdaptations(): Record<string, number>; // adaptationType -> success rate
}

/**
 * Interface for failure recovery service
 */
export interface FailureRecoveryService {
  registerAlternativePath(
    path: Omit<AlternativePath, 'id' | 'previousAttempts'>,
  ): string;
  getAlternativePaths(taskId: string): AlternativePath[];
  selectBestAlternativePath(
    taskId: string,
    context?: Record<string, any>,
  ): AlternativePath | undefined;
  executeAlternativePath(pathId: string): Promise<boolean>;
  recordPathAttempt(pathId: string, success: boolean, reason?: string): boolean;
  getSuccessfulPaths(): AlternativePath[];
  getFailedPaths(): AlternativePath[];
  getPathSuccessRate(pathId: string): number;
  suggestNewAlternatives(
    taskId: string,
    failedPathIds: string[],
  ): Promise<AlternativePath[]>;
  getRecoveryStrategies(): {
    strategyId: string;
    name: string;
    description: string;
    successRate: number;
  }[];
}
