/**
 * Execution Memory Service
 *
 * Implements learning mechanism and experience repository for agent execution history
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import {
  ExecutionRecord,
  ExecutionPattern,
  ExperienceRepository,
  LearningUpdate,
  SimilarityQuery,
  SimilarityResult,
} from '../interfaces/execution-memory.interface';
import { TaskStrategy } from '../interfaces/metacognition.interface';
import { RecoveryStrategy } from '../interfaces/strategy-adjustment.interface';
import { IEmbeddingService } from '../../shared/services/embedding.interface';
import { EmbeddingServiceFactory } from '../../shared/services/embedding.factory';

/**
 * Service for managing execution history, pattern recognition, and learning
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export class ExecutionMemoryService {
  private static instance: ExecutionMemoryService;
  private logger: Logger;
  private embeddingService: IEmbeddingService;
  private repository: ExperienceRepository;
  private learningEnabled: boolean = true;
  private patternDetectionThreshold: number = 3; // Minimum occurrences to detect a pattern
  private similarityThreshold: number = 0.7; // Threshold for similarity detection

  /**
   * Private constructor for singleton pattern
   */
  private constructor(options: {
    logger?: Logger;
    embeddingService: IEmbeddingService;
    learningEnabled?: boolean;
  }) {
    this.logger = options.logger || new ConsoleLogger();
    this.embeddingService = options.embeddingService;

    if (options.learningEnabled !== undefined) {
      this.learningEnabled = options.learningEnabled;
    }

    // Initialize repository
    this.repository = this.initializeRepository();

    this.logger.info('ExecutionMemoryService initialized', {
      learningEnabled: this.learningEnabled,
    });
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(options: {
    logger?: Logger;
    embeddingService: IEmbeddingService;
    learningEnabled?: boolean;
  }): ExecutionMemoryService {
    if (!ExecutionMemoryService.instance) {
      ExecutionMemoryService.instance = new ExecutionMemoryService(options);
    }
    return ExecutionMemoryService.instance;
  }

  /**
   * Initialize a new repository
   */
  private initializeRepository(): ExperienceRepository {
    return {
      executionRecords: [],
      patterns: [],
      capabilityMetrics: {},
      learningProgress: {
        patternCount: 0,
        learningEnabled: this.learningEnabled,
        lastUpdateTimestamp: Date.now(),
        successRateImprovement: 0,
        executionTimeImprovement: 0,
      },
    };
  }

  /**
   * Record an execution in the repository
   */
  public recordExecution(
    record: Omit<ExecutionRecord, 'id' | 'timestamp'>,
  ): string {
    const id = uuidv4();
    const timestamp = Date.now();

    const executionRecord: ExecutionRecord = {
      id,
      timestamp,
      ...record,
    };

    // Add to repository
    this.repository.executionRecords.push(executionRecord);

    // Update capability metrics
    this.updateCapabilityMetrics(executionRecord);

    // If learning is enabled, analyze for patterns
    if (this.learningEnabled) {
      this.analyzeForPatterns(executionRecord);
    }

    this.logger.info(
      `Recorded execution: ${id} for capability: ${record.capability}`,
      {
        success: record.outcome.success,
        executionTimeMs: record.outcome.executionTimeMs,
      },
    );

    return id;
  }

  /**
   * Update metrics for a capability
   */
  private updateCapabilityMetrics(record: ExecutionRecord): void {
    const { capability } = record;

    // Initialize metrics if not already present
    if (!this.repository.capabilityMetrics[capability]) {
      this.repository.capabilityMetrics[capability] = {
        averageExecutionTimeMs: 0,
        successRate: 0,
        errorFrequency: {},
        topStrategies: [],
      };
    }

    const metrics = this.repository.capabilityMetrics[capability];
    const executionRecordsForCapability =
      this.repository.executionRecords.filter(
        (r) => r.capability === capability,
      );
    const count = executionRecordsForCapability.length;

    // Update average execution time
    metrics.averageExecutionTimeMs =
      (metrics.averageExecutionTimeMs * (count - 1) +
        record.outcome.executionTimeMs) /
      count;

    // Update success rate
    const successCount = executionRecordsForCapability.filter(
      (r) => r.outcome.success,
    ).length;
    metrics.successRate = successCount / count;

    // Update error frequency
    if (!record.outcome.success && record.outcome.errorType) {
      metrics.errorFrequency[record.outcome.errorType] =
        (metrics.errorFrequency[record.outcome.errorType] || 0) + 1;
    }

    // Update top strategies
    this.updateTopStrategies(capability);
  }

  /**
   * Update the top strategies for a capability
   */
  private updateTopStrategies(capability: string): void {
    const executionRecordsForCapability =
      this.repository.executionRecords.filter(
        (r) => r.capability === capability,
      );

    // Group by strategy
    const strategyGroups = new Map<
      string,
      {
        id: string;
        name: string;
        successCount: number;
        totalCount: number;
        totalExecutionTimeMs: number;
      }
    >();

    executionRecordsForCapability.forEach((record) => {
      const strategyId = record.strategyUsed.id;
      const entry = strategyGroups.get(strategyId) || {
        id: strategyId,
        name: record.strategyUsed.name,
        successCount: 0,
        totalCount: 0,
        totalExecutionTimeMs: 0,
      };

      entry.totalCount += 1;
      if (record.outcome.success) {
        entry.successCount += 1;
      }
      entry.totalExecutionTimeMs += record.outcome.executionTimeMs;

      strategyGroups.set(strategyId, entry);
    });

    // Convert to top strategies array
    const topStrategies = Array.from(strategyGroups.values())
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        successRate: entry.successCount / entry.totalCount,
        averageExecutionTimeMs: entry.totalExecutionTimeMs / entry.totalCount,
        usageCount: entry.totalCount,
      }))
      .sort((a, b) => {
        // Sort by success rate first, then by average execution time
        if (Math.abs(a.successRate - b.successRate) > 0.1) {
          return b.successRate - a.successRate;
        }
        return a.averageExecutionTimeMs - b.averageExecutionTimeMs;
      })
      .slice(0, 5); // Keep top 5

    this.repository.capabilityMetrics[capability].topStrategies = topStrategies;
  }

  /**
   * Analyze execution for patterns
   */
  private analyzeForPatterns(record: ExecutionRecord): void {
    // Only analyze successful executions for patterns
    if (!record.outcome.success) {
      return;
    }

    const { capability, inputMetadata, strategyUsed, parametersUsed, outcome } =
      record;

    // Get similar executions for this capability
    const similarExecutions = this.repository.executionRecords.filter(
      (r) =>
        r.capability === capability &&
        r.outcome.success &&
        r.id !== record.id &&
        this.calculateInputSimilarity(r.inputMetadata, inputMetadata) >
          this.similarityThreshold,
    );

    // If we have enough similar executions, detect patterns
    if (similarExecutions.length >= this.patternDetectionThreshold) {
      // Check if a similar pattern already exists
      const existingPatternIndex = this.repository.patterns.findIndex(
        (p) =>
          p.capability === capability &&
          this.calculatePatternSimilarity(p, record, inputMetadata) >
            this.similarityThreshold,
      );

      if (existingPatternIndex >= 0) {
        // Update existing pattern
        const pattern = this.repository.patterns[existingPatternIndex];
        pattern.observationCount += 1;

        // Update success rate
        const newApplicationCount = pattern.applicationCount + 1;
        pattern.successRate =
          (pattern.successRate * pattern.applicationCount + 1) /
          newApplicationCount;
        pattern.applicationCount = newApplicationCount;

        // Update confidence based on observation count
        pattern.confidence = Math.min(
          0.5 + pattern.observationCount * 0.05,
          0.95,
        );

        this.repository.patterns[existingPatternIndex] = pattern;
      } else {
        // Create a new pattern
        const newPattern: ExecutionPattern = {
          id: uuidv4(),
          name: `Pattern for ${capability} with ${strategyUsed.name}`,
          description: `Pattern identified for ${capability} executions with similar input characteristics`,
          capability,
          triggerConditions: {
            inputCharacteristics: this.extractCommonCharacteristics(
              [record, ...similarExecutions].map((r) => r.inputMetadata),
            ),
            performanceThresholds: {
              maxExecutionTimeMs: outcome.executionTimeMs * 1.5, // Allow 50% more time
            },
          },
          recommendations: {
            preferredStrategies: [strategyUsed.id],
            parameterAdjustments: parametersUsed,
          },
          confidence: 0.5 + similarExecutions.length * 0.05, // Start with moderate confidence
          observationCount: similarExecutions.length + 1,
          applicationCount: 1,
          successRate: 1, // First observation is successful
        };

        this.repository.patterns.push(newPattern);
        this.repository.learningProgress.patternCount += 1;

        // Generate learning update for this pattern
        this.generateLearningUpdate(
          'new_pattern',
          `New pattern discovered for ${capability}`,
          {
            patternId: newPattern.id,
          },
        );

        this.logger.info(`New pattern detected for capability ${capability}`, {
          patternId: newPattern.id,
          observationCount: newPattern.observationCount,
          confidence: newPattern.confidence,
        });
      }
    }
  }

  /**
   * Calculate similarity between input metadata
   */
  private calculateInputSimilarity(
    a: Record<string, any>,
    b: Record<string, any>,
  ): number {
    // Simple implementation - check exact matches on common fields
    let matchingFields = 0;
    let totalFields = 0;

    // Get all unique keys
    const allKeys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);

    for (const key of allKeys) {
      totalFields++;
      if (a[key] !== undefined && b[key] !== undefined) {
        // For objects, do shallow comparison
        if (typeof a[key] === 'object' && typeof b[key] === 'object') {
          // Convert to string for comparison
          if (JSON.stringify(a[key]) === JSON.stringify(b[key])) {
            matchingFields++;
          }
        } else if (a[key] === b[key]) {
          matchingFields++;
        }
      }
    }

    return totalFields > 0 ? matchingFields / totalFields : 0;
  }

  /**
   * Calculate similarity between a pattern and an execution
   */
  private calculatePatternSimilarity(
    pattern: ExecutionPattern,
    record: ExecutionRecord,
    inputMetadata: Record<string, any>,
  ): number {
    if (pattern.capability !== record.capability) {
      return 0;
    }

    let matches = 0;
    let totalChecks = 0;

    // Check input characteristics
    if (pattern.triggerConditions.inputCharacteristics) {
      totalChecks++;
      const inputSimilarity = this.calculateInputSimilarity(
        pattern.triggerConditions.inputCharacteristics,
        inputMetadata,
      );
      if (inputSimilarity > this.similarityThreshold) {
        matches++;
      }
    }

    // Check preferred strategies
    if (
      pattern.recommendations.preferredStrategies.includes(
        record.strategyUsed.id,
      )
    ) {
      matches++;
    }
    totalChecks++;

    return totalChecks > 0 ? matches / totalChecks : 0;
  }

  /**
   * Extract common characteristics from multiple input metadata objects
   */
  private extractCommonCharacteristics(
    metadataList: Record<string, any>[],
  ): Record<string, any> {
    if (metadataList.length === 0) {
      return {};
    }

    const result: Record<string, any> = {};
    const allKeys = new Set<string>();

    // Collect all keys
    metadataList.forEach((metadata) => {
      Object.keys(metadata).forEach((key) => allKeys.add(key));
    });

    // Find common values
    for (const key of allKeys) {
      const values = metadataList
        .map((metadata) => metadata[key])
        .filter((value) => value !== undefined);

      // If all have the same value, include it
      if (values.length === metadataList.length) {
        const allEqual = values.every(
          (v) => JSON.stringify(v) === JSON.stringify(values[0]),
        );
        if (allEqual) {
          result[key] = values[0];
        }
      }
    }

    return result;
  }

  /**
   * Get the repository
   */
  public getRepository(): ExperienceRepository {
    return { ...this.repository };
  }

  /**
   * Get execution records for a capability
   */
  public getExecutionRecords(capability: string): ExecutionRecord[] {
    return this.repository.executionRecords.filter(
      (r) => r.capability === capability,
    );
  }

  /**
   * Get patterns for a capability
   */
  public getPatterns(capability: string): ExecutionPattern[] {
    return this.repository.patterns.filter((p) => p.capability === capability);
  }

  /**
   * Find similar executions with semantic search
   */
  public async findSimilarExecutions(
    query: SimilarityQuery,
  ): Promise<SimilarityResult> {
    const {
      capability,
      taskDescription,
      inputCharacteristics,
      errorType,
      filters,
      limit,
    } = query;
    const maxResults = limit || 10;

    // Filter execution records by capability
    let matchingExecutions = this.repository.executionRecords.filter(
      (r) => r.capability === capability,
    );

    // Apply additional filters
    if (filters) {
      if (filters.onlySuccessful) {
        matchingExecutions = matchingExecutions.filter(
          (r) => r.outcome.success,
        );
      }

      if (filters.minSuccessRate) {
        // Look up strategies with success rate above threshold
        const validStrategies = this.repository.capabilityMetrics[
          capability
        ]?.topStrategies
          .filter((s) => s.successRate >= (filters.minSuccessRate || 0))
          .map((s) => s.id);

        matchingExecutions = matchingExecutions.filter((r) =>
          validStrategies.includes(r.strategyUsed.id),
        );
      }

      if (filters.maxExecutionTimeMs) {
        matchingExecutions = matchingExecutions.filter(
          (r) =>
            r.outcome.executionTimeMs <=
            (filters.maxExecutionTimeMs || Infinity),
        );
      }

      if (filters.includeStrategies && filters.includeStrategies.length > 0) {
        matchingExecutions = matchingExecutions.filter((r) =>
          filters.includeStrategies?.includes(r.strategyUsed.id),
        );
      }

      if (filters.excludeStrategies && filters.excludeStrategies.length > 0) {
        matchingExecutions = matchingExecutions.filter(
          (r) => !filters.excludeStrategies?.includes(r.strategyUsed.id),
        );
      }
    }

    // If error type is specified, filter by error type
    if (errorType) {
      matchingExecutions = matchingExecutions.filter(
        (r) => !r.outcome.success && r.outcome.errorType === errorType,
      );
    }

    // If inputCharacteristics provided, calculate similarity
    if (inputCharacteristics) {
      matchingExecutions = matchingExecutions
        .map((record) => ({
          record,
          similarity: this.calculateInputSimilarity(
            record.inputMetadata,
            inputCharacteristics,
          ),
        }))
        .filter((item) => item.similarity >= this.similarityThreshold)
        .sort((a, b) => b.similarity - a.similarity)
        .map((item) => item.record);
    }

    // Semantic search with embedding if task description provided
    if (taskDescription) {
      try {
        // The embedding service is now a required property, so we can use it directly
        const queryEmbedding =
          await this.embeddingService.embedText(taskDescription);

        // If we could embed the records, we would compare here
        // For now, simplify by using exact matches in descriptions
        matchingExecutions = matchingExecutions
          .filter(
            (r) =>
              r.taskDescription && r.taskDescription.includes(taskDescription),
          )
          .slice(0, maxResults);
      } catch (error) {
        this.logger.warn('Error performing semantic search', { error });
      }
    }

    // Limit results
    matchingExecutions = matchingExecutions.slice(0, maxResults);

    // Find patterns that apply to these executions
    const relevantPatterns = this.repository.patterns.filter((pattern) => {
      return (
        pattern.capability === capability &&
        matchingExecutions.some(
          (record) =>
            this.calculatePatternSimilarity(
              pattern,
              record,
              record.inputMetadata,
            ) > this.similarityThreshold,
        )
      );
    });

    // Generate strategy recommendations based on matching executions and patterns
    const recommendedStrategies = this.generateStrategyRecommendations(
      matchingExecutions,
      relevantPatterns,
    );

    // Generate parameter recommendations
    const parameterRecommendations = this.generateParameterRecommendations(
      matchingExecutions,
      relevantPatterns,
    );

    // Generate recovery strategies for error cases
    const recoveryStrategies = this.generateRecoveryRecommendations(
      matchingExecutions,
      errorType,
    );

    return {
      matchingExecutions,
      relevantPatterns,
      recommendedStrategies,
      parameterRecommendations,
      recoveryStrategies,
    };
  }

  /**
   * Generate strategy recommendations based on executions and patterns
   */
  private generateStrategyRecommendations(
    executions: ExecutionRecord[],
    patterns: ExecutionPattern[],
  ): Array<{
    strategy: TaskStrategy;
    confidence: number;
    reasoning: string;
  }> {
    // Track strategies and their scores
    const strategyScores = new Map<
      string,
      {
        strategy: TaskStrategy;
        score: number;
        successCount: number;
        totalCount: number;
        reasons: string[];
      }
    >();

    // First, analyze execution records
    executions.forEach((record) => {
      const { strategyUsed, outcome } = record;
      const key = strategyUsed.id;

      const entry = strategyScores.get(key) || {
        strategy: strategyUsed,
        score: 0,
        successCount: 0,
        totalCount: 0,
        reasons: [],
      };

      entry.totalCount++;
      if (outcome.success) {
        entry.successCount++;
        entry.score += 1;
        entry.reasons.push('Successful execution');
      } else {
        entry.score -= 0.5;
        entry.reasons.push(
          `Failed execution: ${outcome.errorType || 'unknown error'}`,
        );
      }

      // Score based on execution time
      if (outcome.executionTimeMs < 5000) {
        entry.score += 0.5;
        entry.reasons.push('Fast execution time');
      }

      strategyScores.set(key, entry);
    });

    // Then, incorporate pattern recommendations
    patterns.forEach((pattern) => {
      pattern.recommendations.preferredStrategies.forEach((strategyId) => {
        const strategy = executions.find(
          (r) => r.strategyUsed.id === strategyId,
        )?.strategyUsed;
        if (!strategy) return;

        const key = strategyId;
        const entry = strategyScores.get(key) || {
          strategy,
          score: 0,
          successCount: 0,
          totalCount: 0,
          reasons: [],
        };

        // Add score based on pattern confidence and success rate
        const patternScore = pattern.confidence * pattern.successRate * 2;
        entry.score += patternScore;
        entry.reasons.push(
          `Recommended by pattern "${pattern.name}" (confidence: ${pattern.confidence.toFixed(2)}, success rate: ${pattern.successRate.toFixed(2)})`,
        );

        strategyScores.set(key, entry);
      });
    });

    // Convert to recommendations
    return Array.from(strategyScores.values())
      .map((entry) => {
        const successRate =
          entry.totalCount > 0 ? entry.successCount / entry.totalCount : 0;
        const confidence = Math.min(
          0.3 + entry.totalCount * 0.1 + successRate * 0.5,
          0.95,
        );

        return {
          strategy: entry.strategy,
          confidence,
          reasoning: entry.reasons.join('; '),
        };
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Generate parameter recommendations based on executions and patterns
   */
  private generateParameterRecommendations(
    executions: ExecutionRecord[],
    patterns: ExecutionPattern[],
  ): Record<string, any> {
    const parameterValues: Record<string, number[]> = {};
    const parameterCounts: Record<string, number> = {};

    // Collect parameter values from successful executions
    executions
      .filter((r) => r.outcome.success)
      .forEach((record) => {
        Object.entries(record.parametersUsed).forEach(([key, value]) => {
          // Only handle numeric parameters for now
          if (typeof value === 'number') {
            if (!parameterValues[key]) {
              parameterValues[key] = [];
            }
            parameterValues[key].push(value);
            parameterCounts[key] = (parameterCounts[key] || 0) + 1;
          }
        });
      });

    // Collect parameter adjustments from patterns
    patterns.forEach((pattern) => {
      if (pattern.recommendations.parameterAdjustments) {
        Object.entries(pattern.recommendations.parameterAdjustments).forEach(
          ([key, value]) => {
            if (typeof value === 'number') {
              if (!parameterValues[key]) {
                parameterValues[key] = [];
              }
              // Weight pattern recommendations based on confidence and success rate
              const weight = Math.max(
                1,
                Math.round(pattern.confidence * pattern.successRate * 5),
              );
              for (let i = 0; i < weight; i++) {
                parameterValues[key].push(value);
                parameterCounts[key] = (parameterCounts[key] || 0) + 1;
              }
            }
          },
        );
      }
    });

    // Generate recommendations based on average values
    const recommendations: Record<string, any> = {};
    Object.entries(parameterValues).forEach(([key, values]) => {
      // Only recommend if we have enough data points
      if (values.length >= 3) {
        const sum = values.reduce((acc, val) => acc + val, 0);
        recommendations[key] = sum / values.length;
      }
    });

    return recommendations;
  }

  /**
   * Generate recovery recommendations based on execution records
   */
  private generateRecoveryRecommendations(
    executions: ExecutionRecord[],
    errorType?: string,
  ): RecoveryStrategy[] {
    if (!errorType) {
      return [];
    }

    // Look for successful adaptations after errors of this type
    const successfulRecoveries = executions
      .filter((r) => !r.outcome.success && r.outcome.errorType === errorType)
      .map((record) => {
        // Look for adaptations that led to success
        const successfulAdaptations = record.adaptations.filter(
          (a) => a.success,
        );
        return {
          record,
          successfulAdaptations,
        };
      })
      .filter((item) => item.successfulAdaptations.length > 0);

    // Group by adaptation type
    const recoveryStrategies = new Map<
      string,
      {
        name: string;
        steps: string[];
        successCount: number;
        totalCount: number;
      }
    >();

    successfulRecoveries.forEach((item) => {
      item.successfulAdaptations.forEach((adaptation) => {
        const key = `${adaptation.type}-${JSON.stringify(adaptation.details)}`;

        const entry = recoveryStrategies.get(key) || {
          name: `${adaptation.type} for ${errorType}`,
          steps: [],
          successCount: 0,
          totalCount: 0,
        };

        entry.successCount++;
        entry.totalCount++;

        // Extract steps if available
        if (adaptation.details.steps) {
          entry.steps = adaptation.details.steps;
        } else {
          entry.steps = [
            `Apply ${adaptation.type} with ${JSON.stringify(adaptation.details)}`,
          ];
        }

        recoveryStrategies.set(key, entry);
      });
    });

    // Convert to recovery strategies
    return Array.from(recoveryStrategies.entries())
      .map(([id, entry]) => {
        return {
          id,
          name: entry.name,
          applicableToErrors: [errorType],
          recoverySteps: entry.steps,
          historicalSuccessRate:
            entry.totalCount > 0 ? entry.successCount / entry.totalCount : 0.5,
          usageCount: entry.totalCount,
        };
      })
      .sort((a, b) => b.historicalSuccessRate - a.historicalSuccessRate);
  }

  /**
   * Generate a learning update
   */
  private generateLearningUpdate(
    type:
      | 'new_pattern'
      | 'strategy_adjustment'
      | 'parameter_tuning'
      | 'recovery_improvement',
    description: string,
    changes: Record<string, any>,
  ): LearningUpdate {
    const update: LearningUpdate = {
      type,
      description,
      impact: {
        successRateChange: 0,
        executionTimeChange: 0,
      },
      evidence: {
        sampleSize: 1,
        confidence: 0.5,
        observations: [description],
      },
      changes,
    };

    // Update learning progress
    this.repository.learningProgress.lastUpdateTimestamp = Date.now();

    this.logger.info(`Generated learning update: ${description}`, {
      type,
      changes: Object.keys(changes),
    });

    return update;
  }

  /**
   * Enable or disable learning
   */
  public setLearningEnabled(enabled: boolean): void {
    this.learningEnabled = enabled;
    this.repository.learningProgress.learningEnabled = enabled;

    this.logger.info(`Learning ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Clear all execution records (for testing/development)
   */
  public clearRepository(): void {
    this.repository = this.initializeRepository();
    this.logger.info('Cleared execution memory repository');
  }
}
