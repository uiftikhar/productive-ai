/**
 * Self-Prompted Planning Service
 *
 * Provides pre-execution analysis, approach selection, and resource estimation
 * @deprecated Will be replaced by agentic self-organizing behavior
 */

import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { LangChainConfig } from '../../langchain/config';
import {
  PlanningContext,
  RequirementAnalysis,
  ResourceEstimate,
  PotentialBottleneck,
  ApproachComparison,
  PlanValidation,
  SelfPlanningResult,
} from '../interfaces/self-planning.interface';
import { TaskStrategy } from '../interfaces/metacognition.interface';
import { StrategyAdjustmentService } from './strategy-adjustment.service';
import { ExecutionMemoryService } from './execution-memory.service';

/**
 * Service for pre-execution planning, approach selection, and resource estimation
 */
export class SelfPlanningService {
  private static instance: SelfPlanningService;
  private logger: Logger;
  private llm: ChatOpenAI;
  private strategyService: StrategyAdjustmentService;
  private executionMemoryService?: ExecutionMemoryService;

  // Cache for planning results to avoid repeated analysis
  private planningCache: Map<string, SelfPlanningResult> = new Map();

  /**
   * Private constructor for singleton pattern
   */
  private constructor(
    options: {
      logger?: Logger;
      llm?: ChatOpenAI;
      strategyService?: StrategyAdjustmentService;
      executionMemoryService?: ExecutionMemoryService;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.llm =
      options.llm ||
      new ChatOpenAI({
        modelName: LangChainConfig.llm.model,
        temperature: 0.1, // Low temperature for analytical tasks
        maxTokens: LangChainConfig.llm.maxTokens,
      });

    this.strategyService =
      options.strategyService ||
      StrategyAdjustmentService.getInstance({ logger: this.logger });

    this.executionMemoryService = options.executionMemoryService;

    this.logger.info('SelfPlanningService initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    options: {
      logger?: Logger;
      llm?: ChatOpenAI;
      strategyService?: StrategyAdjustmentService;
      executionMemoryService?: ExecutionMemoryService;
    } = {},
  ): SelfPlanningService {
    if (!SelfPlanningService.instance) {
      SelfPlanningService.instance = new SelfPlanningService(options);
    }
    return SelfPlanningService.instance;
  }

  /**
   * Create a comprehensive execution plan for a task
   */
  public async createExecutionPlan(
    context: PlanningContext,
  ): Promise<SelfPlanningResult> {
    const { taskDescription, capability, input, quickPlan } = context;

    // Generate a task ID if not provided
    const taskId = context.taskId || `task-${uuidv4()}`;

    // Check cache for existing planning result
    const cacheKey = `${capability}-${taskId}`;
    if (this.planningCache.has(cacheKey)) {
      return this.planningCache.get(cacheKey)!;
    }

    this.logger.info(`Creating execution plan for task ${taskId}`, {
      capability,
      quickPlan: quickPlan || false,
    });

    // If quick planning is requested, use a simplified approach
    if (quickPlan) {
      return this.createQuickPlan(context, taskId);
    }

    // Step 1: Analyze requirements
    const requirementAnalysis = await this.analyzeRequirements(context);

    // Step 2: Estimate resources
    const resourceEstimate = await this.estimateResources(
      context,
      requirementAnalysis,
    );

    // Step 3: Identify potential bottlenecks
    const potentialBottlenecks = await this.identifyBottlenecks(
      context,
      requirementAnalysis,
      resourceEstimate,
    );

    // Step 4: Compare approaches
    const approachComparison = await this.compareApproaches(
      context,
      requirementAnalysis,
      resourceEstimate,
    );

    // Step 5: Select strategy
    const selectedStrategy = await this.selectStrategy(
      context,
      approachComparison,
    );

    // Find alternative strategies based on our strategy service
    const alternativeStrategies = await this.getAlternativeStrategies(
      context,
      selectedStrategy.id,
    );

    // Step 6: Validate the plan
    const planValidation = await this.validatePlan(
      context,
      selectedStrategy,
      requirementAnalysis,
      resourceEstimate,
      potentialBottlenecks,
    );

    // Combine results
    const shouldProceed =
      planValidation.isValid &&
      planValidation.confidence >= 0.6 &&
      potentialBottlenecks.every((b) => b.severity < 8);

    const planningResult: SelfPlanningResult = {
      taskId,
      requirementAnalysis,
      resourceEstimate,
      potentialBottlenecks,
      approachComparison,
      selectedStrategy,
      alternativeStrategies,
      planValidation,
      shouldProceed,
      proceedReasoning: shouldProceed
        ? 'Plan validation passed with sufficient confidence'
        : 'Plan validation failed or high severity bottlenecks detected',
    };

    // Cache the result
    this.planningCache.set(cacheKey, planningResult);

    this.logger.info(`Execution plan created for task ${taskId}`, {
      shouldProceed,
      confidence: planValidation.confidence,
      bottlenecksCount: potentialBottlenecks.length,
    });

    return planningResult;
  }

  /**
   * Create a quick plan with less analysis
   */
  private async createQuickPlan(
    context: PlanningContext,
    taskId: string,
  ): Promise<SelfPlanningResult> {
    const { capability, taskDescription } = context;

    // Use simplified LLM prompts for quick planning

    // Check if we have an experience repository to learn from past executions
    let selectedStrategy: TaskStrategy;
    let alternativeStrategies: TaskStrategy[] = [];

    if (this.executionMemoryService) {
      // Try to find similar executions in the past
      const similarResults =
        await this.executionMemoryService.findSimilarExecutions({
          capability,
          taskDescription,
          limit: 5,
          filters: {
            onlySuccessful: true,
          },
        });

      if (similarResults.recommendedStrategies.length > 0) {
        // Use the top recommended strategy from similar executions
        selectedStrategy = similarResults.recommendedStrategies[0].strategy;
        alternativeStrategies = similarResults.recommendedStrategies
          .slice(1)
          .map((rec) => rec.strategy);
      } else {
        // No similar executions, get strategy from strategy service
        const strategyRepo = this.strategyService.getRepository(capability);
        if (strategyRepo && strategyRepo.strategies.length > 0) {
          selectedStrategy = strategyRepo.strategies[0];
          alternativeStrategies = strategyRepo.strategies.slice(1);
        } else {
          // Create a default strategy
          selectedStrategy = this.createDefaultStrategy(
            capability,
            taskDescription,
          );
        }
      }
    } else {
      // No execution memory service, use strategy adjustment service
      const strategyResult = this.strategyService.selectStrategy({
        capability,
        taskDescription,
      });

      if (strategyResult) {
        selectedStrategy = strategyResult.selectedStrategy;
        alternativeStrategies = strategyResult.alternativeStrategies;
      } else {
        // Create a default strategy
        selectedStrategy = this.createDefaultStrategy(
          capability,
          taskDescription,
        );
      }
    }

    // Create simplified planning result
    const planningResult: SelfPlanningResult = {
      taskId,
      requirementAnalysis: {
        primaryRequirements: [taskDescription],
        secondaryRequirements: [],
        constraints: [],
        expectedInputs: [],
        expectedOutputs: [],
        knowledgeDomains: [capability],
        complexityEstimate: 5, // Medium complexity as default
      },
      resourceEstimate: {
        estimatedTimeMs: 30000, // Default 30s
        estimatedTokens: 2000,
        estimatedMemoryUsage: 0.3,
        estimatedCpuUsage: 0.2,
        confidence: 0.5, // Medium confidence for quick estimates
      },
      potentialBottlenecks: [],
      approachComparison: {
        approaches: [
          {
            name: selectedStrategy.name,
            description: selectedStrategy.description,
            strengths: ['Quick execution', 'Reliable approach'],
            weaknesses: ['May not be optimal'],
            resourceRequirements: {
              estimatedTimeMs: 30000,
            },
            successProbability: 0.7,
          },
        ],
        recommendedApproach: selectedStrategy.name,
        recommendationReasoning:
          'Selected based on quick assessment of task requirements',
      },
      selectedStrategy,
      alternativeStrategies,
      planValidation: {
        isValid: true,
        validationChecks: [
          {
            check: 'Basic feasibility check',
            passed: true,
            details: 'Task appears feasible based on quick assessment',
          },
        ],
        confidence: 0.7,
      },
      shouldProceed: true,
      proceedReasoning: 'Quick plan assessment indicates task can proceed',
    };

    this.logger.info(`Quick execution plan created for task ${taskId}`);
    return planningResult;
  }

  /**
   * Create a default strategy when none are available
   */
  private createDefaultStrategy(
    capability: string,
    taskDescription: string,
  ): TaskStrategy {
    return {
      id: `default-strategy-${uuidv4()}`,
      name: `Default ${capability} Strategy`,
      description: `General approach for ${capability} tasks`,
      applicabilityScore: 0.5,
      estimatedEffort: 5,
      estimatedSuccess: 0.6,
      steps: [
        'Analyze input requirements',
        'Process core functionality',
        'Validate results',
        'Return processed output',
      ],
      requiredCapabilities: [capability],
    };
  }

  /**
   * Analyze requirements for a task
   */
  private async analyzeRequirements(
    context: PlanningContext,
  ): Promise<RequirementAnalysis> {
    const { taskDescription, capability, input } = context;

    try {
      const systemPrompt = `You are an expert requirements analyst for AI agents. Analyze the following task and extract structured requirements.
      
Task description: ${taskDescription}
Capability: ${capability}
Input: ${typeof input === 'string' ? input : JSON.stringify(input)}

Provide your analysis in the following JSON format:
{
  "primaryRequirements": ["list of essential requirements"],
  "secondaryRequirements": ["list of optional requirements"],
  "constraints": ["list of constraints that must be respected"],
  "expectedInputs": ["list of expected inputs needed"],
  "expectedOutputs": ["list of expected outputs to be produced"],
  "knowledgeDomains": ["list of knowledge domains relevant to the task"],
  "complexityEstimate": number from 1-10 representing task complexity
}`;

      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage('Analyze the requirements for this task.'),
      ]);

      // Parse LLM response
      const responseText = response.content as string;
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const analysisJson = JSON.parse(jsonMatch[0]);

        // Validate and return
        return {
          primaryRequirements: analysisJson.primaryRequirements || [],
          secondaryRequirements: analysisJson.secondaryRequirements || [],
          constraints: analysisJson.constraints || [],
          expectedInputs: analysisJson.expectedInputs || [],
          expectedOutputs: analysisJson.expectedOutputs || [],
          knowledgeDomains: analysisJson.knowledgeDomains || [capability],
          complexityEstimate: analysisJson.complexityEstimate || 5,
        };
      } else {
        // Fallback if parsing fails
        this.logger.warn('Failed to parse requirements analysis response', {
          responseText,
        });

        return {
          primaryRequirements: [taskDescription],
          secondaryRequirements: [],
          constraints: [],
          expectedInputs: [],
          expectedOutputs: [],
          knowledgeDomains: [capability],
          complexityEstimate: 5, // Default to medium complexity
        };
      }
    } catch (error) {
      this.logger.error('Error in requirements analysis', { error });

      // Return fallback analysis
      return {
        primaryRequirements: [taskDescription],
        secondaryRequirements: [],
        constraints: [],
        expectedInputs: [],
        expectedOutputs: [],
        knowledgeDomains: [capability],
        complexityEstimate: 5,
      };
    }
  }

  /**
   * Estimate resources required for a task
   */
  private async estimateResources(
    context: PlanningContext,
    requirementAnalysis: RequirementAnalysis,
  ): Promise<ResourceEstimate> {
    // Base resource estimates on complexity
    const complexity = requirementAnalysis.complexityEstimate;

    // Calculate resource estimates based on complexity
    const estimatedTimeMs = Math.min(5000 + complexity * 10000, 120000); // 5s to 2m based on complexity
    const estimatedTokens = Math.min(500 + complexity * 500, 5000); // 500 to 5000 tokens
    const estimatedMemoryUsage = Math.min(0.1 + complexity * 0.08, 0.9); // 0.1 to 0.9 scale
    const estimatedCpuUsage = Math.min(0.1 + complexity * 0.06, 0.7); // 0.1 to 0.7 scale

    // Confidence inversely related to complexity
    const confidence = Math.max(0.3, 1 - complexity / 15);

    return {
      estimatedTimeMs,
      estimatedTokens,
      estimatedMemoryUsage,
      estimatedCpuUsage,
      confidence,
    };
  }

  /**
   * Identify potential bottlenecks in execution
   */
  private async identifyBottlenecks(
    context: PlanningContext,
    requirementAnalysis: RequirementAnalysis,
    resourceEstimate: ResourceEstimate,
  ): Promise<PotentialBottleneck[]> {
    const bottlenecks: PotentialBottleneck[] = [];
    const { capability, input } = context;
    const complexity = requirementAnalysis.complexityEstimate;

    // Check for complexity bottlenecks
    if (complexity >= 8) {
      bottlenecks.push({
        type: 'complexity',
        description: 'Task has high inherent complexity',
        severity: complexity,
        likelihood: 0.8,
        mitigationStrategies: [
          'Break down into smaller subtasks',
          'Apply divide-and-conquer approach',
          'Limit scope to essential requirements',
        ],
      });
    }

    // Check for computational bottlenecks
    if (resourceEstimate.estimatedTokens > 4000) {
      bottlenecks.push({
        type: 'computational',
        description: 'High token usage may exceed model context limits',
        severity: 7,
        likelihood: 0.7,
        mitigationStrategies: [
          'Implement chunking strategy',
          'Summarize intermediate results',
          'Use more efficient prompts',
        ],
      });
    }

    // Check for data bottlenecks
    if (typeof input === 'string' && input.length > 10000) {
      bottlenecks.push({
        type: 'data',
        description: 'Large input data size may cause processing delays',
        severity: 6,
        likelihood: 0.8,
        mitigationStrategies: [
          'Implement data preprocessing',
          'Apply chunking to process in batches',
          'Extract key information before processing',
        ],
      });
    } else if (
      typeof input === 'object' &&
      JSON.stringify(input).length > 5000
    ) {
      bottlenecks.push({
        type: 'data',
        description: 'Complex input structure may be difficult to process',
        severity: 5,
        likelihood: 0.6,
        mitigationStrategies: [
          'Flatten data structure where possible',
          'Process only relevant fields',
          'Apply schema validation before processing',
        ],
      });
    }

    // Check for resource bottlenecks
    if (resourceEstimate.estimatedTimeMs > 60000) {
      bottlenecks.push({
        type: 'resource',
        description: 'Execution may exceed time limits',
        severity: 6,
        likelihood: 0.5,
        mitigationStrategies: [
          'Implement progress tracking',
          'Add checkpoints for partial results',
          'Optimize processing efficiency',
        ],
      });
    }

    return bottlenecks;
  }

  /**
   * Compare different approaches for a task
   */
  private async compareApproaches(
    context: PlanningContext,
    requirementAnalysis: RequirementAnalysis,
    resourceEstimate: ResourceEstimate,
  ): Promise<ApproachComparison> {
    const { capability, availableStrategies } = context;

    // Get available strategies from the strategy service if not provided
    let strategies = availableStrategies || [];
    if (strategies.length === 0) {
      const repository = this.strategyService.getRepository(capability);
      if (repository) {
        strategies = repository.strategies.slice(0, 3); // Get top 3 strategies
      }
    }

    // If we still don't have strategies, create default approaches
    if (strategies.length === 0) {
      return this.createDefaultApproachComparison(context, requirementAnalysis);
    }

    // Convert strategies to approach comparison
    const approaches = strategies.map((strategy) => ({
      name: strategy.name,
      description: strategy.description,
      strengths: [`Specifically designed for ${capability}`],
      weaknesses: [],
      resourceRequirements: {
        estimatedTimeMs:
          resourceEstimate.estimatedTimeMs *
          (1 + (10 - strategy.estimatedSuccess) * 0.5), // Adjust time based on estimated success
      },
      successProbability: strategy.estimatedSuccess,
    }));

    // Find the approach with highest success probability
    const recommendedIndex = approaches
      .map((a, index) => ({ index, probability: a.successProbability }))
      .sort((a, b) => b.probability - a.probability)[0].index;

    return {
      approaches,
      recommendedApproach: approaches[recommendedIndex].name,
      recommendationReasoning: `Selected based on highest estimated success probability (${approaches[recommendedIndex].successProbability.toFixed(2)})`,
    };
  }

  /**
   * Create default approach comparison when no strategies are available
   */
  private createDefaultApproachComparison(
    context: PlanningContext,
    requirementAnalysis: RequirementAnalysis,
  ): ApproachComparison {
    const { capability } = context;
    const complexity = requirementAnalysis.complexityEstimate;

    // Create three general approaches
    const approaches = [
      {
        name: 'Direct Processing Approach',
        description: 'Process the input directly in a single pass',
        strengths: ['Fast execution for simple tasks', 'Low overhead'],
        weaknesses: [
          'May struggle with complex inputs',
          'Limited error recovery',
        ],
        resourceRequirements: {
          estimatedTimeMs: 15000,
        },
        successProbability: complexity <= 5 ? 0.8 : 0.5,
      },
      {
        name: 'Iterative Processing Approach',
        description: 'Process the input in multiple passes with refinement',
        strengths: ['Handles complex tasks well', 'Better error correction'],
        weaknesses: ['Slower execution', 'Higher resource usage'],
        resourceRequirements: {
          estimatedTimeMs: 30000,
        },
        successProbability: complexity >= 5 ? 0.75 : 0.6,
      },
      {
        name: 'Divide and Conquer Approach',
        description:
          'Break down the task into subtasks and process independently',
        strengths: [
          'Excellent for complex tasks',
          'Parallel processing possible',
        ],
        weaknesses: ['Overhead for simple tasks', 'May fragment context'],
        resourceRequirements: {
          estimatedTimeMs: 45000,
        },
        successProbability: complexity >= 7 ? 0.85 : 0.55,
      },
    ];

    // Select recommended approach based on task complexity
    let recommendedApproach: string;
    let recommendationReasoning: string;

    if (complexity <= 4) {
      recommendedApproach = approaches[0].name;
      recommendationReasoning =
        'Direct processing is sufficient for this simple task';
    } else if (complexity <= 7) {
      recommendedApproach = approaches[1].name;
      recommendationReasoning =
        'Iterative approach balances efficiency and robustness for this moderately complex task';
    } else {
      recommendedApproach = approaches[2].name;
      recommendationReasoning =
        'Divide and conquer is necessary for this complex task';
    }

    return {
      approaches,
      recommendedApproach,
      recommendationReasoning,
    };
  }

  /**
   * Select the best strategy for execution
   */
  private async selectStrategy(
    context: PlanningContext,
    approachComparison: ApproachComparison,
  ): Promise<TaskStrategy> {
    const { capability, taskDescription } = context;

    // Try to get strategy from the strategy service
    const strategyResult = this.strategyService.selectStrategy({
      capability,
      taskDescription,
    });

    if (strategyResult) {
      return strategyResult.selectedStrategy;
    }

    // If no strategies found, create a new one based on the selected approach
    const recommendedApproach = approachComparison.approaches.find(
      (a) => a.name === approachComparison.recommendedApproach,
    );

    // If no approach found (shouldn't happen), create a default strategy
    if (!recommendedApproach) {
      return this.createDefaultStrategy(capability, taskDescription);
    }

    // Create a new strategy based on the recommended approach
    return this.strategyService.createStrategy(
      capability,
      recommendedApproach.name,
      recommendedApproach.description,
      [
        'Analyze input',
        'Process according to requirements',
        'Handle edge cases',
        'Validate output',
        'Return results',
      ],
      {
        applicabilityScore: 0.7,
        estimatedEffort: 5,
        estimatedSuccess: recommendedApproach.successProbability,
      },
    );
  }

  /**
   * Get alternative strategies
   */
  private async getAlternativeStrategies(
    context: PlanningContext,
    primaryStrategyId: string,
  ): Promise<TaskStrategy[]> {
    const { capability } = context;

    // Get strategies from the repository
    const repository = this.strategyService.getRepository(capability);
    if (!repository) {
      return [];
    }

    // Filter out the primary strategy and sort by estimated success
    return repository.strategies
      .filter((s) => s.id !== primaryStrategyId)
      .sort((a, b) => b.estimatedSuccess - a.estimatedSuccess)
      .slice(0, 3); // Return top 3 alternatives
  }

  /**
   * Validate the execution plan
   */
  private async validatePlan(
    context: PlanningContext,
    selectedStrategy: TaskStrategy,
    requirementAnalysis: RequirementAnalysis,
    resourceEstimate: ResourceEstimate,
    potentialBottlenecks: PotentialBottleneck[],
  ): Promise<PlanValidation> {
    const validationChecks = [];
    let isValid = true;
    let confidence = 0.8; // Start with high confidence
    const recommendedModifications = [];

    // Check 1: Strategy has sufficient steps
    const hasDetailedSteps = selectedStrategy.steps.length >= 3;
    if (!hasDetailedSteps) {
      isValid = false;
      confidence -= 0.2;
      recommendedModifications.push('Add more detailed steps to the strategy');
    }
    validationChecks.push({
      check: 'Strategy has sufficient steps',
      passed: hasDetailedSteps,
      details: hasDetailedSteps
        ? `Strategy has ${selectedStrategy.steps.length} steps`
        : 'Strategy has too few steps',
    });

    // Check 2: Resources are within limits
    const resourcesWithinLimits =
      resourceEstimate.estimatedTimeMs <= 120000 && // 2 minutes
      resourceEstimate.estimatedTokens <= 6000;
    if (!resourcesWithinLimits) {
      confidence -= 0.15;
      recommendedModifications.push('Consider optimizing resource usage');
    }
    validationChecks.push({
      check: 'Resources are within reasonable limits',
      passed: resourcesWithinLimits,
      details: resourcesWithinLimits
        ? 'Resource estimates are acceptable'
        : 'Resource estimates exceed recommended limits',
    });

    // Check 3: No critical bottlenecks
    const noCriticalBottlenecks = potentialBottlenecks.every(
      (b) => b.severity < 9,
    );
    if (!noCriticalBottlenecks) {
      isValid = false;
      confidence -= 0.3;
      recommendedModifications.push(
        'Address critical bottlenecks before proceeding',
      );
    }
    validationChecks.push({
      check: 'No critical bottlenecks',
      passed: noCriticalBottlenecks,
      details: noCriticalBottlenecks
        ? 'No critical bottlenecks detected'
        : 'Critical bottlenecks must be addressed',
    });

    // Check 4: Primary requirements are addressed
    const requirementsCovered = this.checkRequirementsCoverage(
      requirementAnalysis.primaryRequirements,
      selectedStrategy.steps,
    );
    if (requirementsCovered < 0.7) {
      confidence -= 0.2;
      recommendedModifications.push(
        'Ensure strategy addresses all primary requirements',
      );
    }
    validationChecks.push({
      check: 'Primary requirements are addressed',
      passed: requirementsCovered >= 0.7,
      details: `Approximately ${Math.round(requirementsCovered * 100)}% of requirements covered`,
    });

    // Final validation result
    return {
      isValid,
      validationChecks,
      confidence: Math.max(0.1, confidence),
      recommendedModifications:
        recommendedModifications.length > 0
          ? recommendedModifications
          : undefined,
    };
  }

  /**
   * Check how well strategy steps cover requirements
   */
  private checkRequirementsCoverage(
    requirements: string[],
    steps: string[],
  ): number {
    if (requirements.length === 0) {
      return 1.0; // No requirements to cover
    }

    // Simple keyword matching implementation
    let matchedRequirements = 0;

    requirements.forEach((req) => {
      const reqWords = req.toLowerCase().split(/\s+/);
      const reqKeywords = reqWords.filter((word) => word.length > 3);

      // Check if any step contains the keywords
      const foundInSteps = steps.some((step) => {
        const stepLower = step.toLowerCase();
        return reqKeywords.some((keyword) => stepLower.includes(keyword));
      });

      if (foundInSteps) {
        matchedRequirements += 1;
      }
    });

    return matchedRequirements / requirements.length;
  }

  /**
   * Clear the planning cache
   */
  public clearCache(): void {
    this.planningCache.clear();
    this.logger.info('Planning cache cleared');
  }
}
