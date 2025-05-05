/**
 * Strategy Adjustment Interfaces
 *
 * Provides interfaces for strategy selection, adjustment, and learning
 * @deprecated Will be replaced by agentic self-organizing behavior
 */

import { TaskStrategy } from './metacognition.interface';

/**
 * Strategy selection context - information needed to select appropriate strategies
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface StrategySelectionContext {
  /**
   * Capability being executed
   */
  capability: string;

  /**
   * Task description
   */
  taskDescription?: string;

  /**
   * Input data characteristics
   */
  inputCharacteristics?: {
    /**
     * Size or complexity of input
     */
    size?: 'small' | 'medium' | 'large' | 'very_large';

    /**
     * Structure of input
     */
    structure?: 'simple' | 'structured' | 'complex' | 'unstructured';

    /**
     * Domain of input
     */
    domain?: string;

    /**
     * Other relevant characteristics
     */
    [key: string]: any;
  };

  /**
   * Execution constraints
   */
  constraints?: {
    /**
     * Maximum time allowed for execution (ms)
     */
    maxTimeMs?: number;

    /**
     * Maximum resources allowed (e.g., tokens, memory)
     */
    maxResources?: Record<string, number>;

    /**
     * Required output format
     */
    outputFormat?: string;

    /**
     * Other constraints
     */
    [key: string]: any;
  };

  /**
   * Previous execution outcomes for similar tasks
   */
  previousOutcomes?: Array<{
    /**
     * Strategy ID used
     */
    strategyId: string;

    /**
     * Whether it was successful
     */
    success: boolean;

    /**
     * Execution time in ms
     */
    executionTimeMs: number;

    /**
     * Any issues encountered
     */
    issues?: string[];
  }>;

  /**
   * Current execution state
   */
  currentState?: Record<string, any>;
}

/**
 * Result of strategy selection
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface StrategySelectionResult {
  /**
   * Primary strategy to use
   */
  selectedStrategy: TaskStrategy;

  /**
   * Alternative strategies in order of preference
   */
  alternativeStrategies: TaskStrategy[];

  /**
   * Reasons for selecting this strategy
   */
  selectionReasoning: string;

  /**
   * Confidence in this selection (0-1)
   */
  confidence: number;

  /**
   * Parameters to use with this strategy
   */
  parameters?: Record<string, any>;

  /**
   * When to consider switching to an alternative strategy
   */
  switchingConditions?: {
    /**
     * Time threshold in ms
     */
    timeThresholdMs?: number;

    /**
     * Error patterns that should trigger a switch
     */
    errorPatterns?: string[];

    /**
     * Progress thresholds that should trigger a switch
     */
    progressThresholds?: number[];
  };
}

/**
 * Recovery strategy for handling execution failures
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface RecoveryStrategy {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Name of this recovery strategy
   */
  name: string;

  /**
   * When this recovery should be applied
   */
  applicableToErrors: string[];

  /**
   * Recovery action steps
   */
  recoverySteps: string[];

  /**
   * Success rate of this recovery (0-1)
   */
  historicalSuccessRate: number;

  /**
   * Number of times this recovery was used
   */
  usageCount: number;

  /**
   * Parameters for this recovery strategy
   */
  parameters?: Record<string, any>;
}

/**
 * Repository of strategies for a specific capability
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface StrategyRepository {
  /**
   * Capability this repository is for
   */
  capability: string;

  /**
   * Available strategies for this capability
   */
  strategies: TaskStrategy[];

  /**
   * Recovery strategies for this capability
   */
  recoveryStrategies: RecoveryStrategy[];

  /**
   * Parameter adjustment ranges for this capability
   */
  parameterRanges: Record<
    string,
    {
      min: number;
      max: number;
      default: number;
      step: number;
      description: string;
    }
  >;

  /**
   * Strategy effectiveness history
   */
  effectivenessHistory: Record<
    string,
    {
      strategyId: string;
      successRate: number;
      averageExecutionTimeMs: number;
      usageCount: number;
    }
  >;
}

/**
 * Parameter adjustment for runtime strategy tuning
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface ParameterAdjustment {
  /**
   * Parameter being adjusted
   */
  parameter: string;

  /**
   * Original value
   */
  originalValue: any;

  /**
   * New value
   */
  newValue: any;

  /**
   * Reason for adjustment
   */
  reason: string;

  /**
   * Expected impact
   */
  expectedImpact: string;
}

/**
 * Strategy adjustment recommendation
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface StrategyAdjustmentRecommendation {
  /**
   * Current strategy ID
   */
  currentStrategyId: string;

  /**
   * Recommended action
   */
  recommendedAction:
    | 'continue'
    | 'adjust_parameters'
    | 'switch_strategy'
    | 'retry'
    | 'abort';

  /**
   * Reasoning for this recommendation
   */
  reasoning: string;

  /**
   * Parameter adjustments (if action is adjust_parameters)
   */
  parameterAdjustments?: ParameterAdjustment[];

  /**
   * New strategy to switch to (if action is switch_strategy)
   */
  newStrategy?: TaskStrategy;

  /**
   * Confidence in this recommendation (0-1)
   */
  confidence: number;
}
