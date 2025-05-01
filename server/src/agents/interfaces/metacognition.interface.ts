/**
 * Metacognition interfaces for agent self-reflection capabilities
 */

/**
 * Reflection point types that define when reflection should occur
 */
export enum ReflectionPointType {
  PRE_EXECUTION = 'pre_execution', // Before execution begins
  DURING_EXECUTION = 'during_execution', // During execution (checkpoints)
  POST_EXECUTION = 'post_execution', // After execution completes
  ERROR = 'error', // When errors occur
  MILESTONE = 'milestone', // When reaching specific milestones
  THRESHOLD = 'threshold', // When metrics cross thresholds
  MANUAL = 'manual', // Manually triggered reflection
  STRATEGY_REVISION = 'strategy_revision', // When strategy is revised
}

/**
 * Confidence level for agent self-assessment
 */
export enum ConfidenceLevel {
  VERY_LOW = 'very_low', // 0-20% confidence
  LOW = 'low', // 20-40% confidence
  MODERATE = 'moderate', // 40-60% confidence
  HIGH = 'high', // 60-80% confidence
  VERY_HIGH = 'very_high', // 80-100% confidence
}

/**
 * Capability assessment result
 */
export interface CapabilityAssessment {
  capabilityName: string; // Name of the capability
  confidence: ConfidenceLevel; // Confidence level
  confidenceScore: number; // Numerical confidence (0-1)
  reasoning: string; // Reasoning behind assessment
  alternativeCapabilities?: string[]; // Other capabilities that might help
  timestamp?: number; // When this assessment was made
}

/**
 * Strategy for approaching a task
 */
export interface TaskStrategy {
  id: string; // Unique strategy ID
  name: string; // Strategy name
  description: string; // Strategy description
  applicabilityScore: number; // How applicable is this strategy (0-1)
  estimatedEffort: number; // Estimated effort required (1-10)
  estimatedSuccess: number; // Estimated success probability (0-1)
  steps: string[]; // High-level steps for this strategy
  requiredCapabilities: string[]; // Capabilities required
  fallbackStrategies?: string[]; // IDs of fallback strategies
  parentStrategyId?: string; // ID of the strategy this was derived from
  revisionAttempt?: number; // Current revision attempt number
  revisionReason?: string; // Reason for this revision
  strategyMetrics?: {
    executionTimeHistory?: number[]; // Execution times from past runs
    successRateHistory?: number[]; // Success rates from past runs
    adaptationCount?: number; // Number of times strategy was adapted
    averageCompletionPercentage?: number; // Average completion percentage
  }; // Metrics about the strategy's historical performance
}

/**
 * Task progress tracking
 */
export interface TaskProgress {
  totalSteps: number; // Total steps in the task
  completedSteps: number; // Completed steps
  currentStepIndex: number; // Current step index
  estimatedCompletion: number; // Estimated completion percentage
  milestones: {
    // Key milestones
    [key: string]: {
      description: string;
      completed: boolean;
      completedAt?: number;
    };
  };
  blockers: {
    // Current blockers
    description: string;
    severity: 'low' | 'medium' | 'high';
    workarounds?: string[];
  }[];
  startTime: number; // When task started
  estimatedRemainingTime?: number; // Estimated time remaining (ms)
}

/**
 * Reflection record - stores a single reflection event
 */
export interface ReflectionRecord {
  id: string; // Unique reflection ID
  timestamp: number; // When reflection occurred
  type: ReflectionPointType; // Type of reflection point
  context: {
    // Context when reflection occurred
    taskId?: string;
    capability?: string;
    executionStage?: string;
    triggerReason?: string;
    errorType?: string; // Error type if reflection was triggered by an error
    errorMessage?: string; // Error message if reflection was triggered by an error
    originalStrategy?: string; // Original strategy ID if reflection was for strategy revision
    revisedStrategy?: string; // Revised strategy ID if reflection was for strategy revision
  };
  assessment: {
    // Self-assessment
    overallConfidence: ConfidenceLevel;
    overallProgress: number; // 0-1 completion estimate
    capabilityAssessments?: CapabilityAssessment[];
    identifiedRisks?: string[];
    suggestedAdjustments?: string[];
  };
  decision?: {
    // Decision made during reflection
    action: 'continue' | 'adjust' | 'escalate' | 'delegate' | 'abort';
    reasoning: string;
    adjustments?: Record<string, any>;
  };
}

/**
 * Complete metacognitive state for an agent
 */
export interface MetacognitiveState {
  // Self-awareness
  capabilityAssessments: Record<string, CapabilityAssessment>;
  currentConfidence: ConfidenceLevel;

  // Task understanding
  currentTaskId?: string;
  currentStrategy?: TaskStrategy;
  alternativeStrategies: TaskStrategy[];

  // Progress tracking
  progress?: TaskProgress;

  // Historical data
  reflectionHistory: ReflectionRecord[];
  pastTaskPerformance: Record<
    string,
    {
      taskId: string;
      capability: string;
      success: boolean;
      reflectionCount: number;
      adaptationCount: number;
      executionTimeMs: number;
    }
  >;

  // Learned patterns
  learnedApproaches: Record<
    string,
    {
      capability: string;
      pattern: string;
      effectiveness: number;
      usageCount: number;
    }
  >;
}

/**
 * Configuration for reflection behavior
 */
export interface ReflectionConfig {
  // When to reflect
  reflectionPoints: ReflectionPointType[];

  // Progress thresholds that trigger reflection
  progressCheckpoints: number[]; // e.g. [0.25, 0.5, 0.75]

  // Time-based reflection triggers
  timeCheckpoints: {
    absolute?: number[]; // Absolute time in ms
    relative?: number[]; // Percentage of estimated time
  };

  // Confidence thresholds
  confidenceThresholds: {
    low: number; // Threshold for low confidence
    high: number; // Threshold for high confidence
  };

  // Adaptation settings
  adaptationThreshold: number; // Confidence below which to adapt
  maxConsecutiveReflections: number; // Prevent reflection loops
  reflectionDepth: 'shallow' | 'normal' | 'deep'; // Controls reflection detail
}

/**
 * Self-reflection request for triggering reflection
 */
export interface SelfReflectionRequest {
  type: ReflectionPointType;
  context: {
    taskId?: string;
    capability?: string;
    input?: string | any;
    currentState?: any;
    progress?: number;
    executionTimeMs?: number;
    error?: Error;
    errorType?: string; // Type of error that occurred
    errorMessage?: string; // Error message that occurred
  };
  focusAreas?: string[];
}

/**
 * Self-reflection response
 */
export interface SelfReflectionResponse {
  reflectionRecord: ReflectionRecord;
  shouldAdjustStrategy: boolean;
  suggestedAction: 'continue' | 'adjust' | 'escalate' | 'delegate' | 'abort';
  adjustments?: Record<string, any>;
  confidence: ConfidenceLevel;
  insight?: string; // High-level insight gained from reflection
}

/**
 * Self-assessment request
 */
export interface SelfAssessmentRequest {
  capability: string;
  context?: any;
  taskDescription?: string;
  complexityEstimate?: number;
}

/**
 * Self-assessment response with capability and confidence information
 */
export interface SelfAssessmentResponse {
  capability: string;
  canHandle: boolean;
  assessment: CapabilityAssessment;
  suggestedApproach?: TaskStrategy;
  alternativeApproaches?: TaskStrategy[];
  metadata?: Record<string, any>; // Additional metadata including confidence prediction ID
  [x: string]: any; // Changed from 'number | PromiseLike<number>' to 'any' to allow different property types
}

/**
 * Strategy formulation request
 */
export interface StrategyFormulationRequest {
  taskDescription: string;
  capability: string;
  context?: any;
  constraints?: string[];
  preferences?: Record<string, any>;
}

/**
 * Strategy formulation response
 */
export interface StrategyFormulationResponse {
  primaryStrategy: TaskStrategy;
  alternativeStrategies?: TaskStrategy[];
  estimatedSuccess: number;
  reasoning: string;
}

/**
 * Enhanced task progress tracking
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface EnhancedTaskProgress extends TaskProgress {
  /**
   * Milestones reached during execution
   */
  milestones: Record<
    string,
    {
      description: string;
      completed: boolean;
      completedAt?: number;
    }
  >;

  /**
   * Blockers encountered during execution
   */
  blockers: Array<{
    description: string;
    severity: 'low' | 'medium' | 'high';
    timestamp?: number;
    resolved?: boolean;
    workarounds?: string[];
  }>;

  /**
   * Time when execution started
   */
  startTime: number;

  /**
   * Time of last progress update
   */
  lastUpdateTime: number;

  /**
   * Threshold for detecting stalls (ms)
   */
  stallThresholdMs: number;

  /**
   * Whether execution is currently stalled
   */
  isStalled: boolean;

  /**
   * History of stalled periods
   */
  stallHistory: Array<{
    startTime: number;
    endTime?: number;
    duration?: number;
    reason?: string;
    recoveryAction?: string;
  }>;

  /**
   * Number of adaptations made during execution
   */
  adaptationCount: number;

  /**
   * Expected completion rate (steps per minute)
   */
  expectedCompletionRate?: number;

  /**
   * Actual completion rate (steps per minute)
   */
  actualCompletionRate?: number;

  /**
   * Estimated remaining time (ms)
   */
  estimatedRemainingTime?: number;

  /**
   * Current step being executed
   */
  currentStep?: string;
}

/**
 * Progress monitoring configuration
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface ProgressMonitoringConfig {
  /**
   * Threshold for stalled execution detection (ms)
   */
  stallThresholdMs: number;

  /**
   * Percentage deviation from expected completion rate that triggers adaptation
   */
  rateDeviationThreshold: number;

  /**
   * Check interval for progress monitoring (ms)
   */
  monitoringIntervalMs: number;

  /**
   * Maximum time spent on a single step before triggering adaptation (ms)
   */
  maxTimePerStepMs: number;

  /**
   * Whether to automatically attempt recovery from stalls
   */
  autoRecoveryEnabled: boolean;

  /**
   * Recovery strategies in preferred order
   */
  recoveryStrategies: (
    | 'retry'
    | 'simplify'
    | 'delegate'
    | 'decompose'
    | 'abort'
  )[];
}

/**
 * Progress update notification with detailed status
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface ProgressUpdateNotification {
  /**
   * Current task ID
   */
  taskId: string;

  /**
   * Current capability being executed
   */
  capability: string;

  /**
   * Current progress with completeness information
   */
  progress: EnhancedTaskProgress;

  /**
   * Detected anomalies in progress
   */
  anomalies?: {
    type: 'stall' | 'slowdown' | 'acceleration' | 'deviation';
    severity: 'low' | 'medium' | 'high';
    details: string;
    suggestedAction?: string;
  }[];

  /**
   * Whether adaptation is recommended
   */
  adaptationRecommended: boolean;

  /**
   * Reasons for recommending adaptation
   */
  adaptationReasons?: string[];

  /**
   * Suggested adaptations
   */
  suggestedAdaptations?: {
    type: string;
    description: string;
    confidence: number;
  }[];
}

/**
 * Enhanced reflection config with progress monitoring settings
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface EnhancedReflectionConfig extends ReflectionConfig {
  /**
   * Progress monitoring configuration
   */
  progressMonitoring: ProgressMonitoringConfig;

  /**
   * Criteria that would trigger an adaptation
   */
  adaptationTriggers: {
    /**
     * Elapsed time triggers in ms
     */
    elapsedTime?: number[];

    /**
     * Progress rate deviation thresholds (percentage)
     */
    progressRateDeviations?: number[];

    /**
     * Consecutive blocker count that triggers adaptation
     */
    consecutiveBlockerThreshold?: number;

    /**
     * Consecutive failed steps that trigger adaptation
     */
    consecutiveFailuresThreshold?: number;
  };

  /**
   * Whether to enable strategy revision on errors
   */
  enableStrategyRevision?: boolean;

  /**
   * Maximum number of strategy revision attempts
   */
  maxRevisionAttempts?: number;

  /**
   * Whether to perform reflections on errors
   */
  reflectOnErrors?: boolean;
}
