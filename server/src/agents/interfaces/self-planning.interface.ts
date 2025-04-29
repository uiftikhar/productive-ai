/**
 * Self-Prompted Planning Interfaces
 *
 * Provides interfaces for pre-execution analysis, approach selection, and resource estimation
 */

import { TaskStrategy } from './metacognition.interface';

/**
 * Resources required for task execution
 */
export interface ResourceEstimate {
  /**
   * Estimated time to completion in milliseconds
   */
  estimatedTimeMs: number;

  /**
   * Estimated token usage
   */
  estimatedTokens: number;

  /**
   * Estimated memory usage (0-1 scale)
   */
  estimatedMemoryUsage: number;

  /**
   * Estimated CPU usage (0-1 scale)
   */
  estimatedCpuUsage: number;

  /**
   * Confidence in the estimate (0-1)
   */
  confidence: number;

  /**
   * Additional resource estimates
   */
  [key: string]: any;
}

/**
 * Result of requirement analysis
 */
export interface RequirementAnalysis {
  /**
   * Primary requirements identified
   */
  primaryRequirements: string[];

  /**
   * Secondary/optional requirements
   */
  secondaryRequirements: string[];

  /**
   * Constraints that must be respected
   */
  constraints: string[];

  /**
   * Expected inputs needed
   */
  expectedInputs: string[];

  /**
   * Expected outputs to be produced
   */
  expectedOutputs: string[];

  /**
   * Knowledge domains relevant to the task
   */
  knowledgeDomains: string[];

  /**
   * Task complexity estimate (1-10)
   */
  complexityEstimate: number;
}

/**
 * Potential bottleneck in task execution
 */
export interface PotentialBottleneck {
  /**
   * Type of bottleneck
   */
  type:
    | 'computational'
    | 'data'
    | 'complexity'
    | 'dependency'
    | 'resource'
    | 'other';

  /**
   * Description of the bottleneck
   */
  description: string;

  /**
   * Severity level (1-10)
   */
  severity: number;

  /**
   * Likelihood of occurrence (0-1)
   */
  likelihood: number;

  /**
   * Potential mitigation strategies
   */
  mitigationStrategies: string[];
}

/**
 * Approach comparison for a task
 */
export interface ApproachComparison {
  /**
   * Approaches being compared
   */
  approaches: {
    /**
     * Name of the approach
     */
    name: string;

    /**
     * Description of the approach
     */
    description: string;

    /**
     * Strengths of this approach
     */
    strengths: string[];

    /**
     * Weaknesses of this approach
     */
    weaknesses: string[];

    /**
     * Resource requirements
     */
    resourceRequirements: Partial<ResourceEstimate>;

    /**
     * Estimated success probability (0-1)
     */
    successProbability: number;
  }[];

  /**
   * Recommended approach name
   */
  recommendedApproach: string;

  /**
   * Reasoning for recommendation
   */
  recommendationReasoning: string;
}

/**
 * Plan validation result
 */
export interface PlanValidation {
  /**
   * Whether the plan is valid
   */
  isValid: boolean;

  /**
   * Validation checks performed
   */
  validationChecks: {
    /**
     * Check description
     */
    check: string;

    /**
     * Whether the check passed
     */
    passed: boolean;

    /**
     * Details about check results
     */
    details?: string;
  }[];

  /**
   * Overall confidence in plan (0-1)
   */
  confidence: number;

  /**
   * Recommended modifications to improve the plan
   */
  recommendedModifications?: string[];
}

/**
 * Complete self-planning result
 */
export interface SelfPlanningResult {
  /**
   * Task ID
   */
  taskId: string;

  /**
   * Requirement analysis
   */
  requirementAnalysis: RequirementAnalysis;

  /**
   * Resource estimate
   */
  resourceEstimate: ResourceEstimate;

  /**
   * Potential bottlenecks identified
   */
  potentialBottlenecks: PotentialBottleneck[];

  /**
   * Approach comparison
   */
  approachComparison: ApproachComparison;

  /**
   * Selected task strategy
   */
  selectedStrategy: TaskStrategy;

  /**
   * Alternative strategies in preference order
   */
  alternativeStrategies: TaskStrategy[];

  /**
   * Execution plan validation
   */
  planValidation: PlanValidation;

  /**
   * Preparation steps to take before execution
   */
  preparationSteps?: string[];

  /**
   * Whether execution should proceed
   */
  shouldProceed: boolean;

  /**
   * Reasons for proceed/not proceed decision
   */
  proceedReasoning: string;
}

/**
 * Context for self-planning
 */
export interface PlanningContext {
  /**
   * Task description
   */
  taskDescription: string;

  /**
   * Capability being used
   */
  capability: string;

  /**
   * Input data or reference
   */
  input: any;

  /**
   * Task deadline (if any)
   */
  deadline?: number;

  /**
   * Available strategies to consider
   */
  availableStrategies?: TaskStrategy[];

  /**
   * Resource constraints to respect
   */
  resourceConstraints?: Partial<ResourceEstimate>;

  /**
   * Whether quick planning should be used (less thorough)
   */
  quickPlan?: boolean;

  /**
   * Additional context info
   */
  [key: string]: any;
}
