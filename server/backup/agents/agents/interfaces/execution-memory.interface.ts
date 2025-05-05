/**
 * Execution Memory Interfaces
 *
 * Provides interfaces for storing execution history, pattern recognition, and learning
 * @deprecated Will be replaced by agentic self-organizing behavior
 */

import { TaskStrategy } from './metacognition.interface';
import { RecoveryStrategy } from './strategy-adjustment.interface';

/**
 * Execution record - stores details about a single execution
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface ExecutionRecord {
  /**
   * Unique identifier for this execution
   */
  id: string;

  /**
   * When this execution occurred
   */
  timestamp: number;

  /**
   * Capability that was executed
   */
  capability: string;

  /**
   * Task description
   */
  taskDescription?: string;

  /**
   * Input metadata (not the full input, just characteristics)
   */
  inputMetadata: {
    type: string;
    size?: number;
    format?: string;
    domain?: string;
    summary?: string;
    [key: string]: any;
  };

  /**
   * Strategy that was used
   */
  strategyUsed: TaskStrategy;

  /**
   * Parameters that were used
   */
  parametersUsed: Record<string, any>;

  /**
   * Execution outcome
   */
  outcome: {
    /**
     * Whether execution was successful
     */
    success: boolean;

    /**
     * Execution time in milliseconds
     */
    executionTimeMs: number;

    /**
     * Error message if unsuccessful
     */
    error?: string;

    /**
     * Error type if unsuccessful
     */
    errorType?: string;

    /**
     * Performance metrics
     */
    metrics: Record<string, number>;
  };

  /**
   * Adaptations made during execution
   */
  adaptations: Array<{
    /**
     * Type of adaptation
     */
    type: 'parameter_adjustment' | 'strategy_switch' | 'recovery_attempt';

    /**
     * When this adaptation occurred
     */
    timestampOffset: number;

    /**
     * Details about the adaptation
     */
    details: Record<string, any>;

    /**
     * Whether the adaptation was successful
     */
    success: boolean;
  }>;

  /**
   * Number of steps completed
   */
  stepsCompleted: number;

  /**
   * Total number of steps
   */
  totalSteps: number;

  /**
   * Additional context
   */
  context?: Record<string, any>;
}

/**
 * Pattern - a recognized pattern in executions
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface ExecutionPattern {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Name of this pattern
   */
  name: string;

  /**
   * Description of this pattern
   */
  description: string;

  /**
   * Capability this pattern applies to
   */
  capability: string;

  /**
   * Situations where this pattern applies
   */
  triggerConditions: {
    /**
     * Input characteristics
     */
    inputCharacteristics?: Record<string, any>;

    /**
     * Error patterns
     */
    errorPatterns?: string[];

    /**
     * Performance thresholds
     */
    performanceThresholds?: Record<string, number>;

    /**
     * Custom conditions
     */
    customConditions?: string[];
  };

  /**
   * Recommendations when this pattern is detected
   */
  recommendations: {
    /**
     * Recommended strategies
     */
    preferredStrategies: string[];

    /**
     * Parameter adjustments
     */
    parameterAdjustments?: Record<string, any>;

    /**
     * Recovery strategies
     */
    recoveryStrategies?: string[];
  };

  /**
   * Confidence in this pattern (0-1)
   */
  confidence: number;

  /**
   * Number of times this pattern was observed
   */
  observationCount: number;

  /**
   * Number of times recommendations from this pattern were followed
   */
  applicationCount: number;

  /**
   * Success rate when recommendations were followed (0-1)
   */
  successRate: number;
}

/**
 * Experience repository - stores execution history and recognized patterns
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface ExperienceRepository {
  /**
   * All execution records
   */
  executionRecords: ExecutionRecord[];

  /**
   * Recognized patterns
   */
  patterns: ExecutionPattern[];

  /**
   * Performance metrics by capability
   */
  capabilityMetrics: Record<
    string,
    {
      /**
       * Average execution time
       */
      averageExecutionTimeMs: number;

      /**
       * Success rate
       */
      successRate: number;

      /**
       * Error frequency by type
       */
      errorFrequency: Record<string, number>;

      /**
       * Most successful strategies
       */
      topStrategies: Array<{
        id: string;
        name: string;
        successRate: number;
        averageExecutionTimeMs: number;
        usageCount: number;
      }>;
    }
  >;

  /**
   * Learning progress
   */
  learningProgress: {
    /**
     * How many patterns have been identified
     */
    patternCount: number;

    /**
     * Whether learning is enabled
     */
    learningEnabled: boolean;

    /**
     * Last learning update
     */
    lastUpdateTimestamp: number;

    /**
     * Overall improvement in success rate
     */
    successRateImprovement: number;

    /**
     * Overall improvement in execution time
     */
    executionTimeImprovement: number;
  };
}

/**
 * Similarity search query for finding similar past executions
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface SimilarityQuery {
  /**
   * Capability to search for
   */
  capability: string;

  /**
   * Task description
   */
  taskDescription?: string;

  /**
   * Input characteristics
   */
  inputCharacteristics?: Record<string, any>;

  /**
   * Error to match (for recovery search)
   */
  errorType?: string;

  /**
   * Additional filters
   */
  filters?: {
    /**
     * Only include successful executions
     */
    onlySuccessful?: boolean;

    /**
     * Minimum success rate
     */
    minSuccessRate?: number;

    /**
     * Maximum execution time
     */
    maxExecutionTimeMs?: number;

    /**
     * Include specific strategies
     */
    includeStrategies?: string[];

    /**
     * Exclude specific strategies
     */
    excludeStrategies?: string[];
  };

  /**
   * Maximum number of results
   */
  limit?: number;
}

/**
 * Similarity search result
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface SimilarityResult {
  /**
   * Matching execution records
   */
  matchingExecutions: ExecutionRecord[];

  /**
   * Applicable patterns
   */
  relevantPatterns: ExecutionPattern[];

  /**
   * Recommended strategies based on similar executions
   */
  recommendedStrategies: Array<{
    strategy: TaskStrategy;
    confidence: number;
    reasoning: string;
  }>;

  /**
   * Parameter recommendations
   */
  parameterRecommendations?: Record<string, any>;

  /**
   * Recovery strategies for error cases
   */
  recoveryStrategies?: RecoveryStrategy[];
}

/**
 * Learning update - represents a learned insight
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface LearningUpdate {
  /**
   * Type of learning update
   */
  type:
    | 'new_pattern'
    | 'strategy_adjustment'
    | 'parameter_tuning'
    | 'recovery_improvement';

  /**
   * Description of the learning
   */
  description: string;

  /**
   * Impact on performance
   */
  impact: {
    /**
     * Success rate change
     */
    successRateChange?: number;

    /**
     * Execution time change
     */
    executionTimeChange?: number;

    /**
     * Other improvements
     */
    otherImprovements?: Record<string, any>;
  };

  /**
   * Evidence for this learning
   */
  evidence: {
    /**
     * Sample size
     */
    sampleSize: number;

    /**
     * Confidence level
     */
    confidence: number;

    /**
     * Key observations
     */
    observations: string[];
  };

  /**
   * What changed due to this learning
   */
  changes: Record<string, any>;
}
