/**
 * Model Selection Service
 *
 * This service provides sophisticated model selection capabilities based on:
 * - Task complexity analysis
 * - Cost/capability awareness
 * - Runtime requirements (streaming, context size)
 */

import {
  ModelConfig,
  ModelSelectionCriteria,
  ModelRouterService,
} from './model-router.service.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';

/**
 * Task analysis result
 */
export interface TaskAnalysisResult {
  complexity: 'simple' | 'medium' | 'complex';
  requiredCapabilities: string[];
  estimatedContextSize: number;
  requiresStreaming: boolean;
  suggestedResponseTime: 'fast' | 'balanced' | 'thorough';
}

/**
 * Model Selection Service
 */
export class ModelSelectionService {
  private logger: Logger;
  private modelRouter: ModelRouterService;

  // Capability keywords that help identify task requirements
  private capabilityKeywords = {
    code: [
      'code',
      'programming',
      'function',
      'algorithm',
      'implement',
      'debug',
      'framework',
      'library',
      'repository',
      'git',
      'compile',
      'execution',
      'runtime',
      'syntax',
      'developer',
    ],
    reasoning: [
      'reason',
      'logic',
      'analyze',
      'evaluate',
      'consider',
      'implication',
      'complex',
      'nuanced',
      'deduce',
      'infer',
      'critical thinking',
      'rational',
      'hypothesis',
    ],
    creative: [
      'creative',
      'generate',
      'imagine',
      'story',
      'innovative',
      'design',
      'artwork',
      'write',
      'novel',
      'unique',
      'original',
      'brainstorm',
      'ideation',
    ],
    summarization: [
      'summarize',
      'summary',
      'condense',
      'brief',
      'extract',
      'key points',
      'tldr',
      'synopsis',
      'essence',
      'digest',
      'outline',
    ],
    extraction: [
      'extract',
      'identify',
      'find',
      'locate',
      'pull out',
      'retrieve',
      'parse',
      'scrape',
      'isolate',
      'detect',
    ],
    classification: [
      'classify',
      'categorize',
      'sort',
      'group',
      'label',
      'identify type',
      'bucket',
      'segment',
      'taxonomize',
    ],
    mathematical: [
      'calculate',
      'compute',
      'equation',
      'solve',
      'math',
      'formula',
      'numeric',
      'arithmetic',
      'algebraic',
    ],
    contextual: [
      'context',
      'situation',
      'environment',
      'circumstance',
      'setting',
      'backdrop',
      'framework',
      'historical',
    ],
    data_analysis: [
      'data',
      'analysis',
      'chart',
      'graph',
      'dataset',
      'statistics',
      'metric',
      'trend',
      'pattern',
      'insight',
    ],
  };

  /**
   * Task complexity profiles that map complexity to requirements
   */
  private complexityProfiles: Record<'simple' | 'medium' | 'complex', {
    minContextSize: number;
    recommendedContextSize: number;
    preferredModels: string[];
    costSensitivity: 'low' | 'medium' | 'high';
    responseTime: 'fast' | 'balanced' | 'thorough';
  }> = {
    simple: {
      minContextSize: 2000,
      recommendedContextSize: 4000,
      preferredModels: ['gpt-3.5-turbo', 'mpt-7b'],
      costSensitivity: 'high',
      responseTime: 'fast',
    },
    medium: {
      minContextSize: 4000,
      recommendedContextSize: 8000,
      preferredModels: ['gpt-3.5-turbo-16k', 'claude-instant'],
      costSensitivity: 'medium',
      responseTime: 'balanced',
    },
    complex: {
      minContextSize: 8000,
      recommendedContextSize: 16000,
      preferredModels: ['gpt-4', 'claude-2'],
      costSensitivity: 'low',
      responseTime: 'thorough',
    }
  };

  constructor(
    options: {
      logger?: Logger;
      modelRouter?: ModelRouterService;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.modelRouter = options.modelRouter || ModelRouterService.getInstance();
  }

  /**
   * Select the optimal model based on task analysis with enhanced logic
   */
  public selectModelForTask(
    task: string,
    options: {
      costSensitivity?: 'low' | 'medium' | 'high';
      responseSpeed?: 'fast' | 'balanced' | 'thorough';
      requiresStreaming?: boolean;
      estimatedContextSize?: number;
      preferredCapabilities?: string[];
      taskHistory?: {
        previousTasks: string[];
        successRates: Record<string, number>; // Model -> success rate
      };
      budgetConstraints?: {
        maxTokenCost?: number;
        totalBudget?: number;
      };
    } = {},
  ): ModelConfig {
    this.logger.info('Selecting model for task', {
      task: task.substring(0, 100),
    });

    // Analyze task complexity and requirements
    const analysis = this.analyzeTask(task, options.preferredCapabilities);

    // Apply complexity profile recommendations if not explicitly overridden
    const complexityProfile = this.complexityProfiles[analysis.complexity];
    
    // Create selection criteria
    const criteria: ModelSelectionCriteria = {
      taskComplexity: analysis.complexity,
      responseTime: options.responseSpeed || analysis.suggestedResponseTime || complexityProfile.responseTime,
      costSensitivity: options.costSensitivity || complexityProfile.costSensitivity,
      streamingRequired: options.requiresStreaming || analysis.requiresStreaming,
      contextSize: options.estimatedContextSize || 
                  analysis.estimatedContextSize || 
                  complexityProfile.recommendedContextSize,
      requiresSpecialCapabilities: analysis.requiredCapabilities,
      budgetConstraints: options.budgetConstraints,
      adaptiveLearning: {
        taskHistory: options.taskHistory
      }
    };

    this.logger.debug('Model selection criteria', { criteria });

    // Use the model router to select the model
    return this.modelRouter.selectModel(criteria);
  }

  /**
   * Analyze task complexity and requirements
   */
  public analyzeTask(
    task: string,
    preferredCapabilities?: string[],
  ): TaskAnalysisResult {
    const lowerTask = task.toLowerCase();

    // Analyze complexity
    const complexity = this.analyzeTaskComplexity(lowerTask);

    // Determine required capabilities
    const requiredCapabilities = this.determineRequiredCapabilities(
      lowerTask,
      preferredCapabilities,
    );

    // Estimate context size requirements
    const estimatedContextSize = this.estimateContextSize(
      lowerTask,
      complexity,
    );

    // Determine if streaming is beneficial
    const requiresStreaming = this.determineStreamingRequirement(
      lowerTask,
      complexity,
    );

    // Suggest optimal response time
    const suggestedResponseTime = this.suggestResponseTime(
      lowerTask,
      complexity,
    );

    return {
      complexity,
      requiredCapabilities,
      estimatedContextSize,
      requiresStreaming,
      suggestedResponseTime,
    };
  }

  /**
   * Analyze the complexity of a task
   */
  private analyzeTaskComplexity(task: string): 'simple' | 'medium' | 'complex' {
    // Check for complex task indicators
    const complexIndicators = [
      'complex',
      'analyze',
      'evaluate',
      'synthesize',
      'research',
      'compare and contrast',
      'design',
      'create',
      'develop',
      'implement',
      'debug',
      'optimize',
      'refactor',
      'architect',
      'nuanced',
      'multi-step',
      'multi-part',
      'comprehensive',
      'implications',
      'geopolitical',
      'philosophical',
      'architecture',
      'transitioning',
      'scalable',
      'system architecture'
    ];

    // Check for medium complexity indicators
    const mediumIndicators = [
      'explain',
      'how does',
      'what are',
      'factors',
      'challenges',
      'works',
      'contributed',
      'help with',
      'fusion',
      'therapy',
      'planning',
      'financial',
      'crisis'
    ];

    // Check for simple task indicators
    const simpleIndicators = [
      'simple',
      'basic',
      'easy',
      'quick',
      'short',
      'list',
      'define',
      'what is',
      'tell me',
      'brief',
      'summarize',
      'yes or no',
      'true or false',
      'check',
      'verify',
    ];

    // Count indicators
    const complexCount = complexIndicators.filter((indicator) =>
      task.includes(indicator),
    ).length;

    const mediumCount = mediumIndicators.filter((indicator) =>
      task.includes(indicator),
    ).length;

    const simpleCount = simpleIndicators.filter((indicator) =>
      task.includes(indicator),
    ).length;

    // Determine complexity based on indicators and task length
    if (complexCount >= 1 || task.length > 150) {
      return 'complex';
    } else if (mediumCount >= 1 || (task.length >= 50 && task.length <= 150)) {
      return 'medium';
    } else {
      return 'simple';
    }
  }

  /**
   * Determine required model capabilities based on the task
   */
  private determineRequiredCapabilities(
    task: string,
    preferredCapabilities?: string[],
  ): string[] {
    const capabilities: string[] = [];
    const lowerTask = task.toLowerCase();

    // Check for specific capability requirements in the task
    for (const [capability, keywords] of Object.entries(
      this.capabilityKeywords,
    )) {
      if (keywords.some((keyword) => lowerTask.includes(keyword))) {
        capabilities.push(capability);
      }
    }

    // Additional checks for creative tasks
    if (
      lowerTask.includes('story') ||
      lowerTask.includes('poem') ||
      lowerTask.includes('marketing campaign') ||
      lowerTask.includes('logo') ||
      lowerTask.includes('design') ||
      lowerTask.includes('write') && (lowerTask.includes('story') || lowerTask.includes('poem')) ||
      lowerTask.includes('generate') && !lowerTask.includes('code')
    ) {
      if (!capabilities.includes('creative')) {
        capabilities.push('creative');
      }
    }

    // Add preferred capabilities if specified
    if (preferredCapabilities && preferredCapabilities.length > 0) {
      preferredCapabilities.forEach((cap) => {
        if (!capabilities.includes(cap)) {
          capabilities.push(cap);
        }
      });
    }

    // If no specific capabilities detected, add a default
    if (capabilities.length === 0) {
      capabilities.push('reasoning');
    }

    return capabilities;
  }

  /**
   * Estimate the context size needed for the task
   */
  private estimateContextSize(
    task: string,
    complexity: 'simple' | 'medium' | 'complex',
  ): number {
    // Base size on complexity
    let baseSize = 0;
    switch (complexity) {
      case 'simple':
        baseSize = 2000;
        break;
      case 'medium':
        baseSize = 4000;
        break;
      case 'complex':
        baseSize = 8000;
        break;
    }

    // Adjust based on specific indicators in the task
    if (task.includes('summarize') || task.includes('summary')) {
      baseSize += 2000; // Summarization needs more context
    }

    if (task.includes('code') || task.includes('implement')) {
      baseSize += 3000; // Code generation needs more context
    }

    if (task.includes('research') || task.includes('analyze')) {
      baseSize += 4000; // Research tasks need substantial context
    }

    return baseSize;
  }

  /**
   * Determine if streaming would be beneficial for this task
   */
  private determineStreamingRequirement(
    task: string,
    complexity: 'simple' | 'medium' | 'complex',
  ): boolean {
    // Complex tasks with long expected outputs benefit from streaming
    if (complexity === 'complex') {
      return true;
    }

    // Check for indicators that suggest a long response
    const longResponseIndicators = [
      'detailed',
      'comprehensive',
      'explain',
      'step by step',
      'write',
      'generate',
      'create',
      'develop',
      'list',
    ];

    return longResponseIndicators.some((indicator) => task.includes(indicator));
  }

  /**
   * Suggest optimal response time based on task
   */
  private suggestResponseTime(
    task: string,
    complexity: 'simple' | 'medium' | 'complex',
  ): 'fast' | 'balanced' | 'thorough' {
    // By default, base on complexity
    if (complexity === 'simple') {
      return 'fast';
    } else if (complexity === 'complex') {
      return 'thorough';
    }

    // Check for specific indicators
    const thoroughIndicators = [
      'detailed',
      'comprehensive',
      'thorough',
      'in-depth',
      'analyze',
      'research',
      'extensive',
    ];

    const fastIndicators = [
      'quick',
      'brief',
      'simple',
      'fast',
      'short',
      'summarize',
      'tldr',
      'concise',
    ];

    if (thoroughIndicators.some((indicator) => task.includes(indicator))) {
      return 'thorough';
    } else if (fastIndicators.some((indicator) => task.includes(indicator))) {
      return 'fast';
    }

    // Default to balanced
    return 'balanced';
  }

  /**
   * Calculate the cost of using a specific model for a task
   */
  public estimateModelCost(
    modelConfig: ModelConfig,
    estimatedTokens: number
  ): { cost: number; tokenLimit: number; withinBudget: boolean } {
    const inputCost = modelConfig.costPerInputToken || modelConfig.costPerToken;
    const outputCost = modelConfig.costPerOutputToken || modelConfig.costPerToken;
    
    // Estimate output tokens (typically 25-40% of input for most tasks)
    const estimatedOutputTokens = Math.ceil(estimatedTokens * 0.3);
    
    // Calculate total cost
    const totalCost = (estimatedTokens * inputCost) + 
                      (estimatedOutputTokens * outputCost);
    
    return {
      cost: totalCost,
      tokenLimit: modelConfig.contextWindow,
      withinBudget: true // Default to true unless we have budget constraints
    };
  }

  /**
   * Use feedback to improve model selection over time
   */
  public recordTaskOutcome(
    task: string,
    selectedModel: string,
    outcome: {
      success: boolean;
      executionTimeMs: number;
      tokensUsed: number;
      cost: number;
      feedback?: string;
    }
  ): void {
    // Store outcome for adaptive learning
    // This would be connected to a persistent store in a production system
    this.logger.info('Recording task outcome for adaptive learning', {
      model: selectedModel,
      success: outcome.success,
      tokens: outcome.tokensUsed,
      executionTime: outcome.executionTimeMs,
    });
    
    // In a real implementation, this would update a model performance database
    // that would be used to inform future model selections
  }

  /**
   * Get model recommendations for a task without actually making a selection
   */
  public getModelRecommendations(
    task: string,
    options: {
      count?: number;
      includeCostEstimates?: boolean;
      includeReasoning?: boolean;
    } = {}
  ): Array<{
    model: ModelConfig;
    score: number;
    estimatedCost?: number;
    reasoning?: string;
  }> {
    const count = options.count || 3;
    const analysis = this.analyzeTask(task);
    
    const criteria: ModelSelectionCriteria = {
      taskComplexity: analysis.complexity,
      responseTime: analysis.suggestedResponseTime,
      costSensitivity: 'medium',
      streamingRequired: analysis.requiresStreaming,
      contextSize: analysis.estimatedContextSize,
      requiresSpecialCapabilities: analysis.requiredCapabilities,
    };
    
    // Get eligible models directly from the router
    const eligibleModels = this.modelRouter.getEligibleModels(criteria);
    
    // Score the models ourselves
    const scoredModels = eligibleModels.map((model: ModelConfig) => {
      let score = 0;
      
      // Score based on task complexity
      if (criteria.taskComplexity === 'complex' && model.contextWindow > 16000) {
        score += 10;
      } else if (criteria.taskComplexity === 'simple' && model.costPerToken < 0.00005) {
        score += 10;
      }
      
      // Score based on capabilities match
      if (criteria.requiresSpecialCapabilities) {
        const matchingCapabilities = criteria.requiresSpecialCapabilities.filter(
          cap => model.capabilities.includes(cap)
        );
        score += matchingCapabilities.length * 5;
      }
      
      return { model, score };
    });
    
    // Take top N models
    return scoredModels
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, count)
      .map(({ model, score }: { model: ModelConfig; score: number }) => {
        const result: {
          model: ModelConfig;
          score: number;
          estimatedCost?: number;
          reasoning?: string;
        } = { model, score };
        
        if (options.includeCostEstimates) {
          const costEstimate = this.estimateModelCost(
            model, 
            analysis.estimatedContextSize
          );
          result.estimatedCost = costEstimate.cost;
        }
        
        if (options.includeReasoning) {
          result.reasoning = this.generateSelectionReasoning(model, analysis, criteria);
        }
        
        return result;
      });
  }

  /**
   * Generate an explanation for why a particular model was selected
   */
  private generateSelectionReasoning(
    model: ModelConfig,
    analysis: TaskAnalysisResult,
    criteria: ModelSelectionCriteria
  ): string {
    const reasons = [
      `Model ${model.modelName} selected based on the following factors:`,
    ];
    
    if (analysis.complexity === 'complex') {
      reasons.push(`- Task complexity is high, requiring advanced reasoning capabilities`);
    }
    
    if (analysis.requiredCapabilities.length > 0) {
      reasons.push(`- Task requires specialized capabilities: ${analysis.requiredCapabilities.join(', ')}`);
    }
    
    if (criteria.streamingRequired) {
      reasons.push(`- Streaming support is required for real-time responses`);
    }
    
    if (analysis.estimatedContextSize > 8000) {
      reasons.push(`- Large context window (${model.contextWindow} tokens) needed for this task`);
    }
    
    if (criteria.costSensitivity === 'high') {
      reasons.push(`- Cost efficiency is prioritized (${model.costPerToken} per token)`);
    }
    
    return reasons.join('\n');
  }
}
