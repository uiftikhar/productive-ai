/**
 * Strategy Adjustment Service
 *
 * Manages strategy repositories, selection, and runtime adaptations
 * @deprecated Will be replaced by agentic self-organizing behavior
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ConfidenceLevel,
  TaskStrategy,
} from '../interfaces/metacognition.interface';
import {
  ParameterAdjustment,
  RecoveryStrategy,
  StrategyAdjustmentRecommendation,
  StrategyRepository,
  StrategySelectionContext,
  StrategySelectionResult,
} from '../interfaces/strategy-adjustment.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { ExperienceRepository } from '../interfaces/execution-memory.interface';

/**
 * Service for managing strategy repositories and runtime adjustments
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export class StrategyAdjustmentService {
  private static instance: StrategyAdjustmentService;
  private logger: Logger;

  // Strategy repositories by capability
  private repositories: Map<string, StrategyRepository> = new Map();

  // Reference to experience repository for learning
  private experienceRepository?: ExperienceRepository;

  private constructor(
    options: {
      logger?: Logger;
      experienceRepository?: ExperienceRepository;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.experienceRepository = options.experienceRepository;

    this.logger.info('StrategyAdjustmentService initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    options: {
      logger?: Logger;
      experienceRepository?: ExperienceRepository;
    } = {},
  ): StrategyAdjustmentService {
    if (!StrategyAdjustmentService.instance) {
      StrategyAdjustmentService.instance = new StrategyAdjustmentService(
        options,
      );
    }
    return StrategyAdjustmentService.instance;
  }

  /**
   * Register a strategy repository for a capability
   */
  public registerRepository(repository: StrategyRepository): void {
    this.repositories.set(repository.capability, repository);
    this.logger.info(
      `Registered strategy repository for capability: ${repository.capability}`,
    );
  }

  /**
   * Get a strategy repository for a capability
   */
  public getRepository(capability: string): StrategyRepository | undefined {
    return this.repositories.get(capability);
  }

  /**
   * Create a new repository for a capability if it doesn't exist
   */
  public createRepository(
    capability: string,
    initialStrategies: TaskStrategy[] = [],
  ): StrategyRepository {
    if (this.repositories.has(capability)) {
      return this.repositories.get(capability)!;
    }

    const repository: StrategyRepository = {
      capability,
      strategies: initialStrategies,
      recoveryStrategies: [],
      parameterRanges: {},
      effectivenessHistory: {},
    };

    this.repositories.set(capability, repository);
    this.logger.info(
      `Created new strategy repository for capability: ${capability}`,
    );

    return repository;
  }

  /**
   * Add a strategy to a repository
   */
  public addStrategy(capability: string, strategy: TaskStrategy): void {
    let repository = this.repositories.get(capability);

    if (!repository) {
      repository = this.createRepository(capability);
    }

    // Check if strategy already exists
    const existingIndex = repository.strategies.findIndex(
      (s) => s.id === strategy.id,
    );

    if (existingIndex >= 0) {
      // Update existing strategy
      repository.strategies[existingIndex] = strategy;
      this.logger.info(
        `Updated strategy ${strategy.id} for capability ${capability}`,
      );
    } else {
      // Add new strategy
      repository.strategies.push(strategy);
      this.logger.info(
        `Added new strategy ${strategy.id} for capability ${capability}`,
      );
    }
  }

  /**
   * Add a recovery strategy
   */
  public addRecoveryStrategy(
    capability: string,
    recoveryStrategy: RecoveryStrategy,
  ): void {
    let repository = this.repositories.get(capability);

    if (!repository) {
      repository = this.createRepository(capability);
    }

    // Check if recovery strategy already exists
    const existingIndex = repository.recoveryStrategies.findIndex(
      (s) => s.id === recoveryStrategy.id,
    );

    if (existingIndex >= 0) {
      // Update existing strategy
      repository.recoveryStrategies[existingIndex] = recoveryStrategy;
    } else {
      // Add new strategy
      repository.recoveryStrategies.push(recoveryStrategy);
    }

    this.logger.info(
      `Added/updated recovery strategy ${recoveryStrategy.id} for capability ${capability}`,
    );
  }

  /**
   * Configure parameter ranges for a capability
   */
  public configureParameterRanges(
    capability: string,
    parameterRanges: Record<
      string,
      {
        min: number;
        max: number;
        default: number;
        step: number;
        description: string;
      }
    >,
  ): void {
    let repository = this.repositories.get(capability);

    if (!repository) {
      repository = this.createRepository(capability);
    }

    repository.parameterRanges = {
      ...repository.parameterRanges,
      ...parameterRanges,
    };

    this.logger.info(
      `Configured parameter ranges for capability ${capability}`,
    );
  }

  /**
   * Select the best strategy for a given context
   */
  public selectStrategy(
    context: StrategySelectionContext,
  ): StrategySelectionResult | null {
    const { capability } = context;
    const repository = this.repositories.get(capability);

    if (!repository || repository.strategies.length === 0) {
      this.logger.warn(`No strategies available for capability ${capability}`);
      return null;
    }

    // Scoring factors
    const scores: Record<
      string,
      {
        strategy: TaskStrategy;
        score: number;
        reasons: string[];
      }
    > = {};

    // Initialize scores for all strategies
    repository.strategies.forEach((strategy) => {
      scores[strategy.id] = {
        strategy,
        score: strategy.applicabilityScore * 0.5, // Start with base applicability
        reasons: [
          `Base applicability: ${strategy.applicabilityScore.toFixed(2)}`,
        ],
      };
    });

    // Factor 1: Previous outcomes
    if (context.previousOutcomes && context.previousOutcomes.length > 0) {
      context.previousOutcomes.forEach((outcome) => {
        const scoreEntry = scores[outcome.strategyId];
        if (scoreEntry) {
          const successFactor = outcome.success ? 0.2 : -0.3;
          const timeFactor =
            outcome.executionTimeMs < 5000
              ? 0.1
              : outcome.executionTimeMs < 15000
                ? 0.05
                : 0;

          scoreEntry.score += successFactor + timeFactor;
          scoreEntry.reasons.push(
            `Previous ${outcome.success ? 'successful' : 'failed'} execution: ${(successFactor + timeFactor).toFixed(2)}`,
          );
        }
      });
    }

    // Factor 2: Input characteristics
    if (context.inputCharacteristics) {
      repository.strategies.forEach((strategy) => {
        const scoreEntry = scores[strategy.id];
        let characteristicScore = 0;

        // Size-based scoring
        if (
          context.inputCharacteristics?.size === 'large' &&
          strategy.name.toLowerCase().includes('chunk')
        ) {
          characteristicScore += 0.2;
          scoreEntry.reasons.push(
            'Input size is large, chunking strategy preferred: +0.20',
          );
        }

        // Structure-based scoring
        if (
          context.inputCharacteristics?.structure === 'complex' &&
          strategy.name.toLowerCase().includes('detail')
        ) {
          characteristicScore += 0.15;
          scoreEntry.reasons.push(
            'Input structure is complex, detailed analysis preferred: +0.15',
          );
        }

        scoreEntry.score += characteristicScore;
      });
    }

    // Factor 3: Constraints
    if (context.constraints) {
      repository.strategies.forEach((strategy) => {
        const scoreEntry = scores[strategy.id];
        let constraintScore = 0;

        // Time constraints
        if (
          (context.constraints?.maxTimeMs &&
            context.constraints.maxTimeMs < 10000 &&
            strategy.name.toLowerCase().includes('fast')) ||
          strategy.name.toLowerCase().includes('quick')
        ) {
          constraintScore += 0.25;
          scoreEntry.reasons.push(
            'Tight time constraint, fast strategy preferred: +0.25',
          );
        }

        // Output format
        if (
          context.constraints?.outputFormat &&
          strategy.description
            .toLowerCase()
            .includes(context.constraints.outputFormat.toLowerCase())
        ) {
          constraintScore += 0.2;
          scoreEntry.reasons.push(
            `Output format ${context.constraints.outputFormat} supported: +0.20`,
          );
        }

        scoreEntry.score += constraintScore;
      });
    }

    // Get strategies sorted by score
    const sortedStrategies = Object.values(scores).sort(
      (a, b) => b.score - a.score,
    );

    if (sortedStrategies.length === 0) {
      return null;
    }

    const primaryStrategy = sortedStrategies[0];
    const alternativeStrategies = sortedStrategies
      .slice(1)
      .map((s) => s.strategy);

    // Calculate confidence based on score difference
    const confidence =
      primaryStrategy.score > 0.8
        ? 0.9
        : primaryStrategy.score > 0.6
          ? 0.7
          : primaryStrategy.score > 0.4
            ? 0.5
            : 0.3;

    // Generate parameters based on recommended defaults
    const parameters: Record<string, any> = {};
    Object.keys(repository.parameterRanges).forEach((param) => {
      parameters[param] = repository.parameterRanges[param].default;
    });

    // Determine switching conditions
    const switchingConditions = {
      timeThresholdMs: 30000, // Default to 30s
      errorPatterns: ['timeout', 'rate_limit', 'token_limit'],
      progressThresholds: [0.25, 0.5, 0.75],
    };

    const result: StrategySelectionResult = {
      selectedStrategy: primaryStrategy.strategy,
      alternativeStrategies,
      selectionReasoning: `Selected strategy "${primaryStrategy.strategy.name}" based on: ${primaryStrategy.reasons.join(', ')}`,
      confidence,
      parameters,
      switchingConditions,
    };

    this.logger.info(
      `Strategy selection for ${capability}: selected ${primaryStrategy.strategy.name} with confidence ${confidence}`,
    );

    return result;
  }

  /**
   * Create a new task strategy
   */
  public createStrategy(
    capability: string,
    name: string,
    description: string,
    steps: string[],
    options: {
      applicabilityScore?: number;
      estimatedEffort?: number;
      estimatedSuccess?: number;
      requiredCapabilities?: string[];
      fallbackStrategies?: string[];
    } = {},
  ): TaskStrategy {
    const strategy: TaskStrategy = {
      id: `strategy-${uuidv4()}`,
      name,
      description,
      steps,
      applicabilityScore: options.applicabilityScore || 0.5,
      estimatedEffort: options.estimatedEffort || 5,
      estimatedSuccess: options.estimatedSuccess || 0.5,
      requiredCapabilities: options.requiredCapabilities || [capability],
      fallbackStrategies: options.fallbackStrategies || [],
    };

    this.addStrategy(capability, strategy);

    return strategy;
  }

  /**
   * Create a recovery strategy
   */
  public createRecoveryStrategy(
    capability: string,
    name: string,
    applicableToErrors: string[],
    recoverySteps: string[],
  ): RecoveryStrategy {
    const recoveryStrategy: RecoveryStrategy = {
      id: `recovery-${uuidv4()}`,
      name,
      applicableToErrors,
      recoverySteps,
      historicalSuccessRate: 0.5, // Start with neutral rating
      usageCount: 0,
    };

    this.addRecoveryStrategy(capability, recoveryStrategy);

    return recoveryStrategy;
  }

  /**
   * Adjust parameters during execution
   */
  public adjustParameters(
    capability: string,
    currentParameters: Record<string, any>,
    currentProgress: number,
    executionTimeMs: number,
    issues?: string[],
  ): ParameterAdjustment[] {
    const repository = this.repositories.get(capability);

    if (!repository) {
      return [];
    }

    const adjustments: ParameterAdjustment[] = [];

    // Analyze the current situation and adjust parameters
    const parameterRanges = repository.parameterRanges;

    // Adjust parameters based on execution time
    if (executionTimeMs > 30000 && parameterRanges['chunkSize']) {
      // Execution taking too long, reduce chunk size
      const originalValue =
        currentParameters['chunkSize'] || parameterRanges['chunkSize'].default;
      const newValue = Math.max(
        originalValue * 0.7,
        parameterRanges['chunkSize'].min,
      );

      adjustments.push({
        parameter: 'chunkSize',
        originalValue,
        newValue,
        reason: 'Execution taking too long, reducing chunk size',
        expectedImpact: 'Reduce processing time per chunk',
      });
    }

    // Adjust parameters based on reported issues
    if (
      issues &&
      issues.includes('memory_limit') &&
      parameterRanges['maxTokens']
    ) {
      // Memory issues reported, reduce token usage
      const originalValue =
        currentParameters['maxTokens'] || parameterRanges['maxTokens'].default;
      const newValue = Math.max(
        originalValue * 0.8,
        parameterRanges['maxTokens'].min,
      );

      adjustments.push({
        parameter: 'maxTokens',
        originalValue,
        newValue,
        reason: 'Memory limit issues detected, reducing token usage',
        expectedImpact: 'Lower memory consumption',
      });
    }

    // Adjust detail level based on progress
    if (currentProgress >= 0.7 && parameterRanges['detailLevel']) {
      // Near completion, can increase detail if needed
      const originalValue =
        currentParameters['detailLevel'] ||
        parameterRanges['detailLevel'].default;

      // Only increase if we're not already at max
      if (originalValue < parameterRanges['detailLevel'].max) {
        const newValue = Math.min(
          originalValue + parameterRanges['detailLevel'].step,
          parameterRanges['detailLevel'].max,
        );

        adjustments.push({
          parameter: 'detailLevel',
          originalValue,
          newValue,
          reason: 'Approaching completion, increasing detail level',
          expectedImpact: 'Improved output quality for final stages',
        });
      }
    }

    if (adjustments.length > 0) {
      this.logger.info(
        `Made ${adjustments.length} parameter adjustments for ${capability}`,
      );
    }

    return adjustments;
  }

  /**
   * Recommend strategy adjustments during execution
   */
  public recommendStrategyAdjustment(
    capability: string,
    currentStrategyId: string,
    progress: number,
    executionTimeMs: number,
    errorEncountered?: Error,
    performanceMetrics?: Record<string, number>,
  ): StrategyAdjustmentRecommendation {
    const repository = this.repositories.get(capability);

    if (!repository) {
      return {
        currentStrategyId,
        recommendedAction: 'continue',
        reasoning: 'No repository found for this capability',
        confidence: 0.5,
      };
    }

    // Find the current strategy
    const currentStrategy = repository.strategies.find(
      (s) => s.id === currentStrategyId,
    );

    if (!currentStrategy) {
      return {
        currentStrategyId,
        recommendedAction: 'continue',
        reasoning: 'Current strategy not found in repository',
        confidence: 0.5,
      };
    }

    // Default response
    let recommendation: StrategyAdjustmentRecommendation = {
      currentStrategyId,
      recommendedAction: 'continue',
      reasoning: 'Current strategy is performing adequately',
      confidence: 0.7,
    };

    // Case 1: Error encountered
    if (errorEncountered) {
      const errorMessage = errorEncountered.message.toLowerCase();

      // Find a recovery strategy for this error
      const applicableRecoveryStrategies = repository.recoveryStrategies.filter(
        (rs) =>
          rs.applicableToErrors.some((pattern) =>
            errorMessage.includes(pattern),
          ),
      );

      if (applicableRecoveryStrategies.length > 0) {
        // Sort by success rate
        const bestRecovery = applicableRecoveryStrategies.sort(
          (a, b) => b.historicalSuccessRate - a.historicalSuccessRate,
        )[0];

        recommendation = {
          currentStrategyId,
          recommendedAction: 'adjust_parameters',
          reasoning: `Error encountered: "${errorEncountered.message}". Applying recovery strategy: ${bestRecovery.name}`,
          parameterAdjustments: [
            {
              parameter: 'recoveryMode',
              originalValue: false,
              newValue: true,
              reason: 'Activating error recovery mode',
              expectedImpact: 'Allow recovery steps to execute',
            },
            {
              parameter: 'recoveryStrategy',
              originalValue: null,
              newValue: bestRecovery.id,
              reason: `Selected recovery strategy: ${bestRecovery.name}`,
              expectedImpact: 'Apply specialized recovery steps',
            },
          ],
          confidence: 0.8,
        };
      } else {
        // Find an alternative strategy that might work better
        const alternativeStrategies = repository.strategies.filter(
          (s) =>
            s.id !== currentStrategyId &&
            s.fallbackStrategies &&
            s.fallbackStrategies.includes(currentStrategyId),
        );

        if (alternativeStrategies.length > 0) {
          // Find the one with highest estimated success
          const bestAlternative = alternativeStrategies.sort(
            (a, b) => b.estimatedSuccess - a.estimatedSuccess,
          )[0];

          recommendation = {
            currentStrategyId,
            recommendedAction: 'switch_strategy',
            reasoning: `Error encountered: "${errorEncountered.message}". Current strategy is not effective. Switching to alternative approach: ${bestAlternative.name}`,
            newStrategy: bestAlternative,
            confidence: 0.7,
          };
        } else {
          // No good alternatives, recommend retry with adjusted parameters
          recommendation = {
            currentStrategyId,
            recommendedAction: 'retry',
            reasoning: `Error encountered: "${errorEncountered.message}". No suitable recovery strategies found. Recommending retry with caution.`,
            confidence: 0.5,
          };
        }
      }
    }
    // Case 2: Slow progress
    else if (progress < 0.3 && executionTimeMs > 60000) {
      // Find a faster strategy
      const alternativeStrategies = repository.strategies.filter(
        (s) =>
          s.id !== currentStrategyId &&
          s.estimatedEffort < currentStrategy.estimatedEffort,
      );

      if (alternativeStrategies.length > 0) {
        // Find the one with lowest effort
        const fastestAlternative = alternativeStrategies.sort(
          (a, b) => a.estimatedEffort - b.estimatedEffort,
        )[0];

        recommendation = {
          currentStrategyId,
          recommendedAction: 'switch_strategy',
          reasoning: `Slow progress detected (${Math.round(progress * 100)}% after ${Math.round(executionTimeMs / 1000)}s). Switching to faster approach: ${fastestAlternative.name}`,
          newStrategy: fastestAlternative,
          confidence: 0.6,
        };
      } else {
        // No faster alternatives, adjust parameters
        recommendation = {
          currentStrategyId,
          recommendedAction: 'adjust_parameters',
          reasoning:
            'Slow progress detected. Adjusting parameters to speed up execution.',
          parameterAdjustments: [
            {
              parameter: 'optimizeForSpeed',
              originalValue: false,
              newValue: true,
              reason: 'Enabling speed optimization',
              expectedImpact: 'Prioritize speed over quality',
            },
          ],
          confidence: 0.6,
        };
      }
    }
    // Case 3: Performance issues detected in metrics
    else if (performanceMetrics) {
      const hasPerformanceIssues =
        (performanceMetrics.tokenUsage &&
          performanceMetrics.tokenUsage > 10000) ||
        (performanceMetrics.memoryUsage &&
          performanceMetrics.memoryUsage > 0.8);

      if (hasPerformanceIssues) {
        recommendation = {
          currentStrategyId,
          recommendedAction: 'adjust_parameters',
          reasoning: 'Performance metrics indicate resource constraints.',
          parameterAdjustments: [
            {
              parameter: 'resourceEfficient',
              originalValue: false,
              newValue: true,
              reason: 'Enabling resource efficiency mode',
              expectedImpact: 'Reduce resource consumption',
            },
          ],
          confidence: 0.65,
        };
      }
    }

    return recommendation;
  }

  /**
   * Update strategy effectiveness after execution
   */
  public updateStrategyEffectiveness(
    capability: string,
    strategyId: string,
    success: boolean,
    executionTimeMs: number,
  ): void {
    const repository = this.repositories.get(capability);

    if (!repository) {
      return;
    }

    // Update effectiveness history
    if (!repository.effectivenessHistory[strategyId]) {
      repository.effectivenessHistory[strategyId] = {
        strategyId,
        successRate: success ? 1 : 0,
        averageExecutionTimeMs: executionTimeMs,
        usageCount: 1,
      };
    } else {
      const history = repository.effectivenessHistory[strategyId];

      // Update success rate using weighted average
      history.successRate =
        (history.successRate * history.usageCount + (success ? 1 : 0)) /
        (history.usageCount + 1);

      // Update average execution time
      history.averageExecutionTimeMs =
        (history.averageExecutionTimeMs * history.usageCount +
          executionTimeMs) /
        (history.usageCount + 1);

      // Increment usage count
      history.usageCount++;
    }

    this.logger.info(
      `Updated effectiveness for strategy ${strategyId} in capability ${capability}`,
    );
  }

  /**
   * Update recovery strategy success rate
   */
  public updateRecoveryEffectiveness(
    capability: string,
    recoveryId: string,
    success: boolean,
  ): void {
    const repository = this.repositories.get(capability);

    if (!repository) {
      return;
    }

    const recoveryStrategy = repository.recoveryStrategies.find(
      (rs) => rs.id === recoveryId,
    );

    if (!recoveryStrategy) {
      return;
    }

    // Update success rate using weighted average
    recoveryStrategy.historicalSuccessRate =
      (recoveryStrategy.historicalSuccessRate * recoveryStrategy.usageCount +
        (success ? 1 : 0)) /
      (recoveryStrategy.usageCount + 1);

    // Increment usage count
    recoveryStrategy.usageCount++;

    this.logger.info(
      `Updated effectiveness for recovery strategy ${recoveryId} in capability ${capability}`,
    );
  }
}
