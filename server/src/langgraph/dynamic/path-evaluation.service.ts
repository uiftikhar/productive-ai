import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
// Note: Future implementation will likely use LLM-based path evaluation
// with imports such as ChatOpenAI, BaseMessage, SystemMessage, JsonOutputParser.

import { DynamicGraphState } from './dynamic-graph.service';
import {
  ParallelExecutionState,
  ExecutionBranch,
  BranchStatus,
} from './parallel-exploration.service';

/**
 * Evaluation results for a path
 */
export interface PathEvaluationResult {
  id: string;
  pathId: string;
  timestamp: number;
  metrics: Record<string, number>;
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  metadata: Record<string, any>;
}

/**
 * Configuration for path evaluation
 */
export interface PathEvaluationConfig {
  metrics?: Array<{
    name: string;
    weight: number;
    evaluator: (path: string[], state: DynamicGraphState) => number;
  }>;
  thresholds?: {
    excellent: number;
    good: number;
    acceptable: number;
    poor: number;
  };
  evaluationInterval?: number;
  autoGenerateRecommendations?: boolean;
}

/**
 * Service for evaluating and comparing different execution paths
 */
export class PathEvaluationService {
  private readonly logger: Logger;
  private readonly config: PathEvaluationConfig;
  private readonly evaluationHistory: Map<string, PathEvaluationResult[]> =
    new Map();

  /**
   * Create a new path evaluation service
   */
  constructor(
    options: {
      config?: PathEvaluationConfig;
      logger?: Logger;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();

    // Default metrics for path evaluation
    const defaultMetrics = [
      {
        name: 'uniqueness',
        weight: 0.3,
        evaluator: this.evaluateUniqueness.bind(this),
      },
      {
        name: 'progress',
        weight: 0.3,
        evaluator: this.evaluateProgress.bind(this),
      },
      {
        name: 'efficiency',
        weight: 0.2,
        evaluator: this.evaluateEfficiency.bind(this),
      },
      {
        name: 'errorRate',
        weight: 0.2,
        evaluator: this.evaluateErrorRate.bind(this),
      },
    ];

    // Set default configuration
    this.config = {
      metrics: defaultMetrics,
      thresholds: {
        excellent: 0.8,
        good: 0.6,
        acceptable: 0.4,
        poor: 0.2,
      },
      evaluationInterval: 5,
      autoGenerateRecommendations: true,
      ...options.config,
    };
  }

  /**
   * Evaluate a branch from a parallel execution
   */
  public evaluateBranch(
    branch: ExecutionBranch<ParallelExecutionState>,
  ): PathEvaluationResult {
    const state = branch.state;
    const path = state.executionPath;

    this.logger.info('Evaluating execution branch', {
      branchId: branch.id,
      pathLength: path.length,
      status: branch.status,
    });

    // Calculate metrics
    const metricsResults = this.calculateMetrics(path, state);

    // Calculate overall score
    const overallScore = this.calculateOverallScore(metricsResults);

    // Generate strengths and weaknesses
    const { strengths, weaknesses } = this.generateStrengthsAndWeaknesses(
      metricsResults,
      overallScore,
    );

    // Generate recommendations
    const recommendations = this.config.autoGenerateRecommendations
      ? this.generateRecommendations(metricsResults, branch)
      : [];

    // Create the evaluation result
    const result: PathEvaluationResult = {
      id: uuidv4(),
      pathId: branch.id,
      timestamp: Date.now(),
      metrics: metricsResults,
      overallScore,
      strengths,
      weaknesses,
      recommendations,
      metadata: {
        branchStatus: branch.status,
        pathLength: path.length,
        nodeCount: new Set(path).size,
        completedNodeCount: state.completedNodeIds.length,
      },
    };

    // Add to history
    this.addToHistory(branch.id, result);

    this.logger.info('Branch evaluation completed', {
      branchId: branch.id,
      score: overallScore,
      metrics: Object.entries(metricsResults)
        .map(([key, value]) => `${key}: ${value.toFixed(2)}`)
        .join(', '),
    });

    return result;
  }

  /**
   * Calculate metrics for a path
   */
  private calculateMetrics(
    path: string[],
    state: DynamicGraphState,
  ): Record<string, number> {
    const results: Record<string, number> = {};

    // Apply each metric evaluator
    for (const metric of this.config.metrics || []) {
      try {
        results[metric.name] = metric.evaluator(path, state);
      } catch (error) {
        this.logger.error(`Error calculating metric ${metric.name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        results[metric.name] = 0;
      }
    }

    return results;
  }

  /**
   * Calculate overall score from metrics
   */
  private calculateOverallScore(metrics: Record<string, number>): number {
    let totalScore = 0;
    let totalWeight = 0;

    // Apply weights to each metric
    for (const metric of this.config.metrics || []) {
      if (metrics[metric.name] !== undefined) {
        totalScore += metrics[metric.name] * metric.weight;
        totalWeight += metric.weight;
      }
    }

    // Normalize score
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Generate strengths and weaknesses based on metrics
   */
  private generateStrengthsAndWeaknesses(
    metrics: Record<string, number>,
    overallScore: number,
  ): { strengths: string[]; weaknesses: string[] } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const thresholds = this.config.thresholds || {
      excellent: 0.8,
      good: 0.6,
      acceptable: 0.4,
      poor: 0.2,
    };

    // Analyze each metric
    for (const [name, score] of Object.entries(metrics)) {
      const displayName = name.charAt(0).toUpperCase() + name.slice(1);

      if (score >= thresholds.excellent) {
        strengths.push(
          `Excellent ${displayName}: ${(score * 100).toFixed(0)}%`,
        );
      } else if (score >= thresholds.good) {
        strengths.push(`Good ${displayName}: ${(score * 100).toFixed(0)}%`);
      } else if (score <= thresholds.poor) {
        weaknesses.push(`Poor ${displayName}: ${(score * 100).toFixed(0)}%`);
      } else if (score < thresholds.acceptable) {
        weaknesses.push(
          `Below average ${displayName}: ${(score * 100).toFixed(0)}%`,
        );
      }
    }

    // Add overall assessment
    if (overallScore >= thresholds.excellent) {
      strengths.push('Excellent overall performance');
    } else if (overallScore >= thresholds.good) {
      strengths.push('Good overall performance');
    } else if (overallScore <= thresholds.poor) {
      weaknesses.push('Poor overall performance');
    } else if (overallScore < thresholds.acceptable) {
      weaknesses.push('Below average overall performance');
    }

    return { strengths, weaknesses };
  }

  /**
   * Generate recommendations based on evaluation
   */
  private generateRecommendations(
    metrics: Record<string, number>,
    branch: ExecutionBranch<ParallelExecutionState>,
  ): string[] {
    const recommendations: string[] = [];
    const thresholds = this.config.thresholds || {
      excellent: 0.8,
      good: 0.6,
      acceptable: 0.4,
      poor: 0.2,
    };

    // Skip for completed branches
    if (
      branch.status === BranchStatus.COMPLETED ||
      branch.status === BranchStatus.MERGED
    ) {
      return recommendations;
    }

    // Add recommendations based on metrics
    if (metrics.uniqueness && metrics.uniqueness < thresholds.acceptable) {
      recommendations.push('Explore more diverse paths to increase uniqueness');
    }

    if (metrics.progress && metrics.progress < thresholds.acceptable) {
      recommendations.push('Focus on advancing toward goal completion');
    }

    if (metrics.efficiency && metrics.efficiency < thresholds.acceptable) {
      recommendations.push('Reduce redundant steps to improve efficiency');
    }

    if (metrics.errorRate && metrics.errorRate < thresholds.acceptable) {
      recommendations.push('Address error sources to improve reliability');
    }

    // Add branch-specific recommendations
    if (
      branch.state.executionPath.length > 30 &&
      !branch.state.executionPath.includes('__end__')
    ) {
      recommendations.push(
        'Consider terminating this branch if no progress is made soon',
      );
    }

    return recommendations;
  }

  /**
   * Add an evaluation result to history
   */
  private addToHistory(branchId: string, result: PathEvaluationResult): void {
    let history = this.evaluationHistory.get(branchId);

    if (!history) {
      history = [];
      this.evaluationHistory.set(branchId, history);
    }

    history.push(result);

    // Keep history from growing too large
    if (history.length > 10) {
      history.shift();
    }
  }

  /**
   * Compare two branches
   */
  public compareBranches(
    branchA: ExecutionBranch<ParallelExecutionState>,
    branchB: ExecutionBranch<ParallelExecutionState>,
  ): {
    winner: string;
    scoreDifference: number;
    comparison: Record<
      string,
      {
        branchA: number;
        branchB: number;
        difference: number;
        winner: string;
      }
    >;
  } {
    const evaluationA = this.evaluateBranch(branchA);
    const evaluationB = this.evaluateBranch(branchB);

    // Compare metrics
    const comparison: Record<string, any> = {};

    for (const metricName of Object.keys({
      ...evaluationA.metrics,
      ...evaluationB.metrics,
    })) {
      const valueA = evaluationA.metrics[metricName] || 0;
      const valueB = evaluationB.metrics[metricName] || 0;
      const difference = valueA - valueB;

      comparison[metricName] = {
        branchA: valueA,
        branchB: valueB,
        difference,
        winner:
          difference > 0 ? branchA.id : difference < 0 ? branchB.id : 'tie',
      };
    }

    // Determine overall winner
    const scoreDifference = evaluationA.overallScore - evaluationB.overallScore;
    const winner =
      scoreDifference > 0
        ? branchA.id
        : scoreDifference < 0
          ? branchB.id
          : 'tie';

    this.logger.info('Branch comparison completed', {
      branchA: branchA.id,
      branchB: branchB.id,
      winner,
      scoreDifference: Math.abs(scoreDifference).toFixed(2),
    });

    return {
      winner,
      scoreDifference: Math.abs(scoreDifference),
      comparison,
    };
  }

  /**
   * Get evaluation history for a branch
   */
  public getEvaluationHistory(branchId: string): PathEvaluationResult[] {
    return this.evaluationHistory.get(branchId) || [];
  }

  /**
   * Calculate the uniqueness of a path
   */
  private evaluateUniqueness(path: string[], state: DynamicGraphState): number {
    if (path.length === 0) {
      return 0;
    }

    // Calculate ratio of unique nodes to total path length
    const uniqueNodes = new Set(path).size;
    return uniqueNodes / path.length;
  }

  /**
   * Calculate the progress of a path
   */
  private evaluateProgress(path: string[], state: DynamicGraphState): number {
    if (path.length === 0) {
      return 0;
    }

    // Simple measure: how many nodes have been completed
    const totalNodes = state.nodes.size;
    if (totalNodes === 0) {
      return 0;
    }

    // Check for successful completion
    if (path.includes('__end__')) {
      return 1.0;
    }

    // Otherwise, calculate progress based on completed nodes
    const completedNodeIds =
      'completedNodeIds' in state
        ? (state as any).completedNodeIds.length
        : new Set(path).size;

    return Math.min(1.0, completedNodeIds / totalNodes);
  }

  /**
   * Calculate the efficiency of a path
   */
  private evaluateEfficiency(path: string[], state: DynamicGraphState): number {
    if (path.length === 0) {
      return 0;
    }

    // Check for repetitions in the path
    let repetitionCount = 0;
    const nodeCounts = new Map<string, number>();

    for (const nodeId of path) {
      const count = (nodeCounts.get(nodeId) || 0) + 1;
      nodeCounts.set(nodeId, count);

      if (count > 1) {
        repetitionCount++;
      }
    }

    // Efficiency decreases with repetitions
    const repetitionRatio = repetitionCount / path.length;
    return 1 - repetitionRatio;
  }

  /**
   * Calculate the error rate of a path
   */
  private evaluateErrorRate(path: string[], state: DynamicGraphState): number {
    // Count errors in state metadata
    const errorCount = state.metadata.errorCount || 0;

    if (path.length === 0) {
      return errorCount > 0 ? 0 : 1;
    }

    // Calculate error rate (inverse for score)
    const errorRate = errorCount / path.length;
    return 1 - Math.min(1, errorRate);
  }
}
