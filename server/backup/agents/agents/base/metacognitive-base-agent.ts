/**
 * @deprecated This module is deprecated and will be removed in a future version.
 * Use the new agentic meeting analysis system in /langgraph/agentic-meeting-analysis instead.
 */

import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  HumanMessage,
  AIMessage,
} from '@langchain/core/messages';

import { BaseAgent } from './base-agent';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { EmbeddingServiceFactory } from '../../shared/services/embedding.factory';
import { ConfidenceCalibrationService } from '../services/confidence-calibration.service';

import {
  AgentCapability,
  AgentResponse,
  AgentRequest,
  AgentContext,
  AgentState,
  AgentStatus,
  AgentMetrics,
  MetacognitiveAgent,
} from '../interfaces/base-agent.interface';

import {
  CapabilityAssessment,
  ConfidenceLevel,
  MetacognitiveState,
  ReflectionConfig,
  ReflectionPointType,
  ReflectionRecord,
  SelfAssessmentRequest,
  SelfAssessmentResponse,
  SelfReflectionRequest,
  SelfReflectionResponse,
  StrategyFormulationRequest,
  StrategyFormulationResponse,
  TaskProgress,
  TaskStrategy,
  EnhancedReflectionConfig,
  EnhancedTaskProgress,
  ProgressMonitoringConfig,
  ProgressUpdateNotification,
} from '../interfaces/metacognition.interface';

import {
  ProgressMonitoringService,
  ProgressMonitoringEvent,
} from '../services/progress-monitoring.service';

import { MetacognitiveAgentResponse } from '../interfaces/agent-response.interface';

/**
 * Helper function to detect the format of input text
 */
function detectInputFormat(input: string): string {
  if (input.trim().startsWith('{') && input.trim().endsWith('}')) {
    try {
      JSON.parse(input);
      return 'json';
    } catch (e) {
      // Not valid JSON
    }
  }

  if (input.trim().startsWith('<') && input.trim().endsWith('>')) {
    return 'xml';
  }

  if (input.includes('```')) {
    return 'markdown';
  }

  if (input.split('\n').length > 5) {
    return 'multiline_text';
  }

  return 'text';
}

/**
 * Base agent class with metacognitive capabilities
 * Provides self-reflection, strategy formulation, and progress monitoring
 */
export abstract class MetacognitiveBaseAgent
  extends BaseAgent
  implements MetacognitiveAgent
{
  // Metacognitive state
  protected metacognitiveState: MetacognitiveState;

  // Reflection configuration
  protected reflectionConfig: EnhancedReflectionConfig;

  // Progress monitoring service
  protected progressMonitor: ProgressMonitoringService;

  // Confidence calibration service
  protected confidenceCalibration: ConfidenceCalibrationService;

  // Track consecutive reflections to prevent reflection loops
  protected consecutiveReflections: number = 0;

  constructor(
    name: string,
    description: string,
    options: {
      id?: string;
      logger?: Logger;
      llm?: ChatOpenAI;
      reflectionConfig?: Partial<EnhancedReflectionConfig>;
    } = {},
  ) {
    super(name, description, options);

    // Initialize metacognitive state
    this.metacognitiveState = this.initializeMetacognitiveState();

    // Initialize reflection configuration with defaults
    this.reflectionConfig = this.initializeEnhancedReflectionConfig(
      options.reflectionConfig,
    );

    // Get the progress monitoring service
    this.progressMonitor = ProgressMonitoringService.getInstance({
      logger: this.logger,
      config: this.reflectionConfig.progressMonitoring,
    });

    // Initialize the confidence calibration service
    this.confidenceCalibration = ConfidenceCalibrationService.getInstance({
      logger: this.logger,
    });

    // Set up event listeners for progress monitoring
    this.setupProgressMonitoringListeners();

    // Update the agent state to include metacognition
    this.state.metacognition = this.metacognitiveState;

    this.logger.info(`Initialized MetacognitiveBaseAgent: ${this.name}`);
  }

  /**
   * Initialize the metacognitive state with default values
   */
  private initializeMetacognitiveState(): MetacognitiveState {
    return {
      capabilityAssessments: {},
      currentConfidence: ConfidenceLevel.MODERATE,
      alternativeStrategies: [],
      reflectionHistory: [],
      pastTaskPerformance: {},
      learnedApproaches: {},
    };
  }

  /**
   * Initialize enhanced reflection configuration with defaults
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private initializeEnhancedReflectionConfig(
    config?: Partial<EnhancedReflectionConfig>,
  ): EnhancedReflectionConfig {
    const defaultConfig: EnhancedReflectionConfig = {
      reflectionPoints: [
        ReflectionPointType.PRE_EXECUTION,
        ReflectionPointType.POST_EXECUTION,
        ReflectionPointType.ERROR,
      ],
      progressCheckpoints: [0.25, 0.5, 0.75],
      timeCheckpoints: {
        relative: [0.5, 0.75],
      },
      confidenceThresholds: {
        low: 0.4,
        high: 0.8,
      },
      adaptationThreshold: 0.5,
      maxConsecutiveReflections: 3,
      reflectionDepth: 'normal',
      progressMonitoring: {
        stallThresholdMs: 60000, // 1 minute
        rateDeviationThreshold: 0.3, // 30% deviation
        monitoringIntervalMs: 10000, // 10 seconds
        maxTimePerStepMs: 300000, // 5 minutes
        autoRecoveryEnabled: true,
        recoveryStrategies: [
          'retry',
          'simplify',
          'decompose',
          'delegate',
          'abort',
        ],
      },
      adaptationTriggers: {
        elapsedTime: [300000], // 5 minutes
        progressRateDeviations: [0.5], // 50% deviation
        consecutiveBlockerThreshold: 2,
        consecutiveFailuresThreshold: 2,
      },
    };

    // Merge with provided config
    const mergedConfig = {
      ...defaultConfig,
      ...config,
    };

    // Ensure progressMonitoring is properly merged
    if (config?.progressMonitoring) {
      mergedConfig.progressMonitoring = {
        ...defaultConfig.progressMonitoring,
        ...config.progressMonitoring,
      };
    }

    // Ensure adaptationTriggers is properly merged
    if (config?.adaptationTriggers) {
      mergedConfig.adaptationTriggers = {
        ...defaultConfig.adaptationTriggers,
        ...config.adaptationTriggers,
      };
    }

    return mergedConfig;
  }

  /**
   * Set up event listeners for progress monitoring
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private setupProgressMonitoringListeners(): void {
    // Listen for stall detection
    this.progressMonitor.on(
      ProgressMonitoringEvent.STALL_DETECTED,
      async (notification: ProgressUpdateNotification) => {
        // Only handle events for this agent's tasks
        if (!notification.taskId.startsWith(this.id)) return;

        this.logger.warn(`Stall detected in task ${notification.taskId}`, {
          capability: notification.capability,
          stallDuration: Date.now() - notification.progress.lastUpdateTime,
        });

        // Trigger reflection for stall
        try {
          await this.reflect({
            type: ReflectionPointType.THRESHOLD,
            context: {
              taskId: notification.taskId,
              capability: notification.capability,
              progress: notification.progress.estimatedCompletion,
              error: new Error(
                `Execution stalled: ${notification.anomalies?.[0]?.details}`,
              ),
            },
            focusAreas: ['execution_stall', 'strategy_adjustment'],
          });
        } catch (error) {
          this.logger.error('Failed to reflect on stalled execution', {
            error,
          });
        }
      },
    );

    // Listen for adaptation recommendations
    this.progressMonitor.on(
      ProgressMonitoringEvent.ADAPTATION_RECOMMENDED,
      async (notification: ProgressUpdateNotification) => {
        // Only handle events for this agent's tasks
        if (!notification.taskId.startsWith(this.id)) return;

        this.logger.info(
          `Adaptation recommended for task ${notification.taskId}`,
          {
            reasons: notification.adaptationReasons,
          },
        );

        // Only proceed if we have a current task strategy
        if (!this.metacognitiveState.currentStrategy) return;

        // Trigger strategy reformulation
        try {
          const capability = notification.capability;
          const taskId = notification.taskId;

          const context = {
            anomalies: notification.anomalies,
            adaptationReasons: notification.adaptationReasons,
            progress: notification.progress,
          };

          // Get any input from context
          let taskDescription = `Task execution for capability ${capability}`;
          if (this.metacognitiveState.currentStrategy.description) {
            taskDescription =
              this.metacognitiveState.currentStrategy.description;
          }

          // Reformulate strategy with adaptation context
          const strategyResult = await this.formulateStrategy({
            taskDescription,
            capability,
            context,
            constraints: [
              'adapt_to_current_situation',
              ...(notification.adaptationReasons || []),
            ],
          });

          // Record the adaptation
          this.progressMonitor.recordAdaptation(
            taskId,
            capability,
            notification.adaptationReasons?.[0] ||
              'progress_monitoring_recommendation',
          );

          // Update the strategy
          this.metacognitiveState.currentStrategy =
            strategyResult.primaryStrategy;
          this.metacognitiveState.alternativeStrategies =
            strategyResult.alternativeStrategies || [];

          this.logger.info(`Adapted strategy for task ${taskId}`, {
            newStrategy: strategyResult.primaryStrategy.name,
            estimatedSuccess: strategyResult.estimatedSuccess,
          });
        } catch (error) {
          this.logger.error('Failed to adapt strategy', { error });
        }
      },
    );
  }

  /**
   * Override initialize to add metacognitive initialization
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);

    // Initialize capability assessments for all registered capabilities
    const capabilities = this.getCapabilities();

    for (const capability of capabilities) {
      // Only initialize if not already assessed
      if (!this.metacognitiveState.capabilityAssessments[capability.name]) {
        this.metacognitiveState.capabilityAssessments[capability.name] = {
          capabilityName: capability.name,
          confidence: ConfidenceLevel.MODERATE,
          confidenceScore: 0.6, // Default moderate confidence
          reasoning: `Initial default confidence for capability ${capability.name}`,
        };
      }
    }

    this.logger.info(
      `Metacognitive systems initialized with ${capabilities.length} capabilities`,
    );
  }

  /**
   * Get the metacognitive state
   */
  getMetacognitiveState(): Partial<MetacognitiveState> {
    return { ...this.metacognitiveState };
  }

  /**
   * Configure reflection behavior
   */
  configureReflection(config: Partial<EnhancedReflectionConfig>): void {
    this.reflectionConfig = {
      ...this.reflectionConfig,
      ...config,
    };

    this.logger.info('Updated reflection configuration', {
      reflectionPoints: this.reflectionConfig.reflectionPoints,
      reflectionDepth: this.reflectionConfig.reflectionDepth,
    });
  }

  /**
   * Get the full reflection history
   */
  getReflectionHistory(): ReflectionRecord[] {
    return [...this.metacognitiveState.reflectionHistory];
  }

  /**
   * Get learned strategies for a capability
   */
  getLearnedStrategies(capability: string): TaskStrategy[] {
    const strategies: TaskStrategy[] = [];

    // Extract strategies from learned approaches
    Object.values(this.metacognitiveState.learnedApproaches)
      .filter((approach) => approach.capability === capability)
      .forEach((approach) => {
        try {
          // Try to parse the pattern as a strategy
          const strategyData = JSON.parse(approach.pattern);
          if (strategyData.id && strategyData.steps) {
            strategies.push(strategyData as TaskStrategy);
          }
        } catch (e) {
          // Not a valid strategy pattern
        }
      });

    return strategies;
  }

  /**
   * Update metacognitive state with external feedback
   */
  updateMetacognitiveState(updates: Partial<MetacognitiveState>): void {
    // Update specific fields that are provided
    if (updates.capabilityAssessments) {
      this.metacognitiveState.capabilityAssessments = {
        ...this.metacognitiveState.capabilityAssessments,
        ...updates.capabilityAssessments,
      };
    }

    if (updates.currentConfidence) {
      this.metacognitiveState.currentConfidence = updates.currentConfidence;
    }

    if (updates.currentStrategy) {
      this.metacognitiveState.currentStrategy = updates.currentStrategy;
    }

    if (updates.alternativeStrategies) {
      this.metacognitiveState.alternativeStrategies =
        updates.alternativeStrategies;
    }

    if (updates.progress) {
      this.metacognitiveState.progress = updates.progress;
    }

    // Update agent state to include updated metacognition
    this.state.metacognition = this.metacognitiveState;

    this.logger.info('Updated metacognitive state from external feedback');
  }

  /**
   * Transfer knowledge to another agent
   */
  async transferKnowledge(
    targetAgentId: string,
    capabilityFilter?: string[],
  ): Promise<{
    transferredStrategies: number;
    transferredPatterns: number;
    success: boolean;
  }> {
    this.logger.info(`Transferring knowledge to agent ${targetAgentId}`);

    // For now, we just return a placeholder implementation
    // In a real implementation, this would involve agent-to-agent communication
    return {
      transferredStrategies: 0,
      transferredPatterns: 0,
      success: true,
    };
  }

  /**
   * Enhanced progress reporting with monitoring
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  reportProgress(progressUpdate: {
    capability: string;
    taskId?: string;
    completedSteps: number;
    totalSteps: number;
    milestone?: string;
    blocker?: { description: string; severity: 'low' | 'medium' | 'high' };
  }): void {
    const taskId = progressUpdate.taskId || `task-${this.id}-${Date.now()}`;

    // Check if we're already monitoring this task
    const existingProgress = this.progressMonitor.getTaskProgress(taskId);

    if (existingProgress) {
      // Update existing monitored task
      this.progressMonitor.updateProgress(taskId, progressUpdate.capability, {
        completedSteps: progressUpdate.completedSteps,
        totalSteps: progressUpdate.totalSteps,
        milestone: progressUpdate.milestone
          ? {
              description: progressUpdate.milestone,
              completed: true,
            }
          : undefined,
        blocker: progressUpdate.blocker,
      });
    } else {
      // Start monitoring a new task
      this.progressMonitor.startMonitoring(taskId, progressUpdate.capability, {
        totalSteps: progressUpdate.totalSteps,
        completedSteps: progressUpdate.completedSteps,
        currentStepIndex: progressUpdate.completedSteps,
      });

      // Add milestone if provided
      if (progressUpdate.milestone) {
        this.progressMonitor.updateProgress(taskId, progressUpdate.capability, {
          milestone: {
            description: progressUpdate.milestone,
            completed: true,
          },
        });
      }

      // Add blocker if provided
      if (progressUpdate.blocker) {
        this.progressMonitor.updateProgress(taskId, progressUpdate.capability, {
          blocker: progressUpdate.blocker,
        });
      }
    }

    // Legacy progress tracking for backward compatibility
    // Update the progress in the metacognitive state
    if (!this.metacognitiveState.progress) {
      // Initialize progress if not yet created
      this.metacognitiveState.progress = {
        totalSteps: progressUpdate.totalSteps,
        completedSteps: progressUpdate.completedSteps,
        currentStepIndex: progressUpdate.completedSteps,
        estimatedCompletion:
          progressUpdate.completedSteps / progressUpdate.totalSteps,
        milestones: {},
        blockers: [],
        startTime: Date.now(),
      };
    } else {
      // Update existing progress
      this.metacognitiveState.progress.completedSteps =
        progressUpdate.completedSteps;
      this.metacognitiveState.progress.totalSteps = progressUpdate.totalSteps;
      this.metacognitiveState.progress.currentStepIndex =
        progressUpdate.completedSteps;
      this.metacognitiveState.progress.estimatedCompletion =
        progressUpdate.completedSteps / progressUpdate.totalSteps;
    }

    // Add milestone if provided
    if (progressUpdate.milestone) {
      this.metacognitiveState.progress.milestones[progressUpdate.milestone] = {
        description: progressUpdate.milestone,
        completed: true,
        completedAt: Date.now(),
      };
    }

    // Add blocker if provided
    if (progressUpdate.blocker) {
      this.metacognitiveState.progress.blockers.push({
        description: progressUpdate.blocker.description,
        severity: progressUpdate.blocker.severity,
      });
    }

    // Check if we should trigger reflection based on progress
    const completion = this.metacognitiveState.progress.estimatedCompletion;
    if (
      this.reflectionConfig.progressCheckpoints.includes(completion) &&
      this.reflectionConfig.reflectionPoints.includes(
        ReflectionPointType.MILESTONE,
      )
    ) {
      // Trigger reflection asynchronously
      this.reflect({
        type: ReflectionPointType.MILESTONE,
        context: {
          capability: progressUpdate.capability,
          progress: completion,
        },
      }).catch((error) => {
        this.logger.warn('Progress-based reflection failed', { error });
      });
    }
  }

  /**
   * Calibrate a raw confidence score using the confidence calibration service
   * This helps prevent overconfidence by adjusting scores based on historical accuracy
   */
  protected calibrateConfidence(
    rawConfidence: number,
    capability: string,
    domain: string = 'default',
  ): number {
    return this.confidenceCalibration.calibrateConfidence({
      domain,
      capability,
      rawConfidence,
    });
  }

  /**
   * Register a confidence prediction for later calibration
   * @returns The prediction ID for updating with actual outcome
   */
  protected registerConfidencePrediction(
    confidence: number,
    capability: string,
    metadata?: Record<string, any>,
  ): string {
    return this.confidenceCalibration.registerPrediction({
      domain: this.name,
      capability,
      predictedConfidence: confidence,
      metadata,
    });
  }

  /**
   * Update a confidence prediction with the actual outcome
   */
  protected updateConfidencePrediction(
    id: string,
    actualSuccess: boolean,
  ): boolean {
    return this.confidenceCalibration.updatePredictionOutcome(
      id,
      actualSuccess,
    );
  }

  /**
   * Get the confidence level from a calibrated confidence score
   */
  protected getConfidenceLevelFromScore(score: number): ConfidenceLevel {
    return this.confidenceCalibration.confidenceScoreToLevel(score);
  }

  // The core metacognitive capabilities will be implemented in the next sections

  /**
   * Abstract methods that must be implemented by subclasses
   */
  abstract assessCapability(
    request: SelfAssessmentRequest,
  ): Promise<SelfAssessmentResponse>;
  abstract reflect(
    request: SelfReflectionRequest,
  ): Promise<SelfReflectionResponse>;
  abstract formulateStrategy(
    request: StrategyFormulationRequest,
  ): Promise<StrategyFormulationResponse>;
  abstract getConfidence(
    capability: string,
    taskDescription?: string,
  ): Promise<ConfidenceLevel>;

  /**
   * Override the preExecute method to add pre-execution reflection and monitoring
   */
  protected async preExecute(request: AgentRequest): Promise<void> {
    // Call the parent preExecute first
    await super.preExecute(request);

    // Generate a task ID if not provided
    const taskId = request.context?.taskId || `task-${this.id}-${Date.now()}`;

    // Ensure context exists and has a taskId
    if (!request.context) {
      request.context = { taskId };
    } else if (!request.context.taskId) {
      request.context.taskId = taskId;
    }

    // Apply the self-prompted planning service if available and the request has a capability
    if (request.capability) {
      try {
        const SelfPlanningService = (
          await import('../services/self-planning.service')
        ).SelfPlanningService;
        const planningService = SelfPlanningService.getInstance();

        // Create execution plan
        const planningResult = await planningService.createExecutionPlan({
          taskId,
          taskDescription:
            typeof request.input === 'string'
              ? request.input.substring(0, 1000) // Limit length for planning
              : JSON.stringify(request.input).substring(0, 1000),
          capability: request.capability,
          input: request.input,
          quickPlan: this.reflectionConfig.reflectionDepth === 'shallow', // Use quick planning for shallow reflection
        });

        // Store planning result in context
        if (request.context) {
          request.context.planningResult = planningResult;
        }

        // If plan suggests not to proceed, handle accordingly
        if (!planningResult.shouldProceed) {
          this.logger.warn(
            `Pre-execution planning suggests not to proceed with task ${taskId}`,
            {
              reason: planningResult.proceedReasoning,
              bottlenecks: planningResult.potentialBottlenecks
                .map((b) => b.description)
                .join('; '),
            },
          );

          // We will still proceed with reflection, which might also suggest cancellation
        } else {
          // Use the selected strategy from planning
          this.metacognitiveState.currentStrategy =
            planningResult.selectedStrategy;
          this.metacognitiveState.alternativeStrategies =
            planningResult.alternativeStrategies;

          // Initialize progress tracking with enhanced monitoring
          const steps = planningResult.selectedStrategy.steps;

          // Start progress monitoring
          this.progressMonitor.startMonitoring(taskId, request.capability, {
            totalSteps: steps.length,
            completedSteps: 0,
            currentStepIndex: 0,
          });

          // Legacy progress tracking (to be deprecated)
          this.metacognitiveState.progress = {
            totalSteps: steps.length,
            completedSteps: 0,
            currentStepIndex: 0,
            estimatedCompletion: 0,
            milestones: {},
            blockers: [],
            startTime: Date.now(),
          };
        }
      } catch (error) {
        this.logger.warn('Self-prompted planning failed', { error });
        // Continue with regular metacognitive process
      }
    }

    // Should we reflect before execution?
    if (
      this.reflectionConfig.reflectionPoints.includes(
        ReflectionPointType.PRE_EXECUTION,
      )
    ) {
      try {
        const reflectionResult = await this.reflect({
          type: ReflectionPointType.PRE_EXECUTION,
          context: {
            taskId,
            capability: request.capability,
            input: request.input,
          },
        });

        // If the reflection suggests we shouldn't proceed, handle accordingly
        if (reflectionResult.suggestedAction !== 'continue') {
          this.handleReflectionSuggestion(reflectionResult, request);
        }
      } catch (error) {
        this.logger.warn('Pre-execution reflection failed', { error });
        // Continue execution despite reflection failure
      }
    }

    // If the request has a capability, perform capability assessment
    if (request.capability) {
      try {
        const assessmentResult = await this.assessCapability({
          capability: request.capability,
          taskDescription:
            typeof request.input === 'string'
              ? request.input.substring(0, 500)
              : undefined,
        });

        // If confidence is below adaptation threshold, formulate a strategy
        if (
          assessmentResult.assessment.confidenceScore <
            this.reflectionConfig.adaptationThreshold &&
          assessmentResult.canHandle
        ) {
          try {
            const strategyResult = await this.formulateStrategy({
              taskDescription:
                typeof request.input === 'string'
                  ? request.input
                  : JSON.stringify(request.input),
              capability: request.capability,
              context: request.context,
            });

            // Store the strategy in the metacognitive state
            this.metacognitiveState.currentStrategy =
              strategyResult.primaryStrategy;
            this.metacognitiveState.alternativeStrategies =
              strategyResult.alternativeStrategies || [];

            // Initialize progress tracking with enhanced monitoring
            const steps = strategyResult.primaryStrategy.steps;

            // Start progress monitoring
            this.progressMonitor.startMonitoring(taskId, request.capability, {
              totalSteps: steps.length,
              completedSteps: 0,
              currentStepIndex: 0,
            });

            // Legacy progress tracking (to be deprecated)
            this.metacognitiveState.progress = {
              totalSteps: steps.length,
              completedSteps: 0,
              currentStepIndex: 0,
              estimatedCompletion: 0,
              milestones: {},
              blockers: [],
              startTime: Date.now(),
            };

            // Optionally: add strategy to context
            if (request.context) {
              request.context.metadata = {
                ...request.context.metadata,
                strategy: strategyResult.primaryStrategy.id,
              };
            }
          } catch (error) {
            this.logger.warn('Strategy formulation failed', { error });
            // Continue execution without a strategy
          }
        }
      } catch (error) {
        this.logger.warn('Capability assessment failed', { error });
        // Continue execution despite assessment failure
      }
    }
  }

  /**
   * Override the postExecute method to include learning from execution
   */
  protected async postExecute(
    request: AgentRequest,
    response: AgentResponse,
    executionTimeMs: number,
  ): Promise<void> {
    // Call the parent postExecute first
    await super.postExecute(request, response, executionTimeMs);

    // Get task ID from context
    const taskId = request.context?.taskId || 'unknown';

    // If confidence prediction ID exists in context, update with actual outcome
    if (request.context?.confidencePredictionId) {
      this.updateConfidencePrediction(
        request.context.confidencePredictionId,
        response.success,
      );
    }

    // Should we reflect after execution?
    if (
      this.reflectionConfig.reflectionPoints.includes(
        ReflectionPointType.POST_EXECUTION,
      )
    ) {
      try {
        await this.reflect({
          type: ReflectionPointType.POST_EXECUTION,
          context: {
            taskId,
            capability: request.capability,
            executionTimeMs,
            input: request.input,
          },
        });
      } catch (error) {
        this.logger.warn('Post-execution reflection failed', { error });
        // Continue despite reflection failure
      }
    }

    // Update metrics and learned patterns based on execution result
    if (request.capability) {
      // Update task performance record
      this.metacognitiveState.pastTaskPerformance[taskId] = {
        taskId,
        capability: request.capability,
        success: response.success,
        reflectionCount: this.metacognitiveState.reflectionHistory.filter(
          (r) => r.context.taskId === taskId,
        ).length,
        adaptationCount:
          this.progressMonitor.getTaskProgress(taskId)?.adaptationCount || 0,
        executionTimeMs,
      };

      // If we had a strategy, update its effectiveness
      if (this.metacognitiveState.currentStrategy) {
        const strategyKey = `${request.capability}-${this.metacognitiveState.currentStrategy.id}`;

        if (this.metacognitiveState.learnedApproaches[strategyKey]) {
          const approach =
            this.metacognitiveState.learnedApproaches[strategyKey];

          // Update effectiveness using weighted average
          approach.effectiveness =
            (approach.effectiveness * approach.usageCount +
              (response.success ? 1 : 0)) /
            (approach.usageCount + 1);

          approach.usageCount++;

          this.metacognitiveState.learnedApproaches[strategyKey] = approach;
        }

        // Record execution in the execution memory service if available
        const metacognitiveResponse = response as MetacognitiveAgentResponse;

        if (metacognitiveResponse.reflection) {
          try {
            // Get execution memory service
            const { ExecutionMemoryService } = await import(
              '../services/execution-memory.service'
            );
            const embeddingService = await EmbeddingServiceFactory.getService();
            const memoryService = ExecutionMemoryService.getInstance({
              logger: this.logger,
              embeddingService,
            });

            // Extract metadata from input for pattern analysis
            const inputMetadata = {
              type: typeof request.input === 'string' ? 'text' : 'object',
              size:
                typeof request.input === 'string'
                  ? request.input.length
                  : Object.keys(request.input).length,
              format:
                typeof request.input === 'string'
                  ? detectInputFormat(request.input)
                  : 'object',
              domain: request.context?.metadata?.domain || undefined,
              summary:
                typeof request.input === 'string'
                  ? request.input.substring(0, 200)
                  : undefined,
            };

            // Record the execution
            memoryService.recordExecution({
              capability: request.capability,
              taskDescription:
                typeof request.input === 'string'
                  ? request.input.substring(0, 200)
                  : undefined,
              inputMetadata,
              strategyUsed: this.metacognitiveState.currentStrategy,
              parametersUsed:
                (request.context?.metadata?.parameters as Record<
                  string,
                  any
                >) || {},
              outcome: {
                success: response.success,
                executionTimeMs,
                error: request.context?.error?.message,
                errorType: request.context?.error?.name,
                metrics: {
                  reflectionCount:
                    this.metacognitiveState.reflectionHistory.filter(
                      (r) => r.context.taskId === taskId,
                    ).length,
                  adaptationCount:
                    this.progressMonitor.getTaskProgress(taskId)
                      ?.adaptationCount || 0,
                },
              },
              adaptations:
                this.progressMonitor
                  .getTaskProgress(taskId)
                  ?.stallHistory.map((stall) => ({
                    type: stall.recoveryAction?.startsWith(
                      'strategy_adaptation',
                    )
                      ? 'strategy_switch'
                      : 'parameter_adjustment',
                    timestampOffset:
                      stall.startTime -
                      (this.metacognitiveState.progress?.startTime || 0),
                    details: {
                      duration: stall.duration,
                      reason: stall.reason,
                      recoveryAction: stall.recoveryAction,
                    },
                    success: true, // Assuming recovery was successful if execution completed
                  })) || [],
              stepsCompleted:
                this.metacognitiveState.progress?.completedSteps || 0,
              totalSteps: this.metacognitiveState.progress?.totalSteps || 1,
            });

            this.logger.debug('Recorded execution in memory service', {
              taskId,
              capability: request.capability,
              success: response.success,
            });
          } catch (error) {
            this.logger.warn('Failed to record execution in memory service', {
              error,
            });
          }
        }
      }

      // Clear current strategy and progress
      delete this.metacognitiveState.currentStrategy;
      delete this.metacognitiveState.progress;
    }
  }

  /**
   * Handle reflection suggestions other than 'continue'
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private handleReflectionSuggestion(
    reflection: SelfReflectionResponse,
    request: AgentRequest,
  ): void {
    switch (reflection.suggestedAction) {
      case 'adjust':
        // Apply adjustments to the request or strategy
        if (reflection.adjustments) {
          // Update parameters if they exist
          if (request.parameters && reflection.adjustments.parameters) {
            request.parameters = {
              ...request.parameters,
              ...reflection.adjustments.parameters,
            };
          }
        }
        break;

      case 'escalate':
        // Log that this should be escalated
        this.logger.warn('Agent suggests escalation', {
          reflection: reflection.reflectionRecord,
          capability: request.capability,
        });
        break;

      case 'delegate':
        // Log that this should be delegated
        this.logger.warn('Agent suggests delegation', {
          reflection: reflection.reflectionRecord,
          capability: request.capability,
        });
        break;

      case 'abort':
        // Log that this should be aborted
        this.logger.warn('Agent suggests aborting the request', {
          reflection: reflection.reflectionRecord,
          capability: request.capability,
        });
        break;
    }
  }

  /**
   * Revise a strategy based on execution failures
   *
   * Enhanced with better heuristics for abandonment decisions and more robust plan revision
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  protected async reviseStrategy(
    currentStrategy: TaskStrategy,
    errorContext: {
      errorType: string;
      errorMessage: string;
      failedStep?: string;
      capability: string;
      originalInput: any;
    },
    attemptCount: number = 0,
  ): Promise<TaskStrategy | null> {
    try {
      this.logger.info('Revising strategy due to execution failure', {
        strategy: currentStrategy.name,
        errorType: errorContext.errorType,
        attemptCount,
      });

      // Check if we've made too many revision attempts
      const maxAttempts = this.reflectionConfig.maxRevisionAttempts || 3;
      if (attemptCount >= maxAttempts) {
        this.logger.warn('Maximum strategy revision attempts reached', {
          maxAttempts,
        });
        return null;
      }

      // Determine if the strategy is still viable through comprehensive assessment
      const viabilityAssessment = await this.assessStrategyViability(
        currentStrategy,
        errorContext,
        attemptCount,
      );

      // Enhanced abandonment heuristics:
      // 1. If confidence is very low (<= 0.2), abandon immediately
      // 2. If we've seen the same error multiple times with this strategy, abandon
      // 3. If the error indicates a fundamental incompatibility, abandon
      if (
        !viabilityAssessment.isViable ||
        viabilityAssessment.confidenceScore <= 0.2 ||
        viabilityAssessment.fundamentalIncompatibility
      ) {
        this.logger.info('Strategy deemed non-viable, abandoning', {
          strategy: currentStrategy.name,
          reason: viabilityAssessment.reason,
          confidenceScore: viabilityAssessment.confidenceScore,
          fundamentalIncompatibility:
            viabilityAssessment.fundamentalIncompatibility,
        });

        // If we detect a fundamental incompatibility, record this for future learning
        if (viabilityAssessment.fundamentalIncompatibility) {
          this.recordReflection({
            type: ReflectionPointType.ERROR,
            content: `Strategy '${currentStrategy.name}' has fundamental incompatibility: ${viabilityAssessment.reason}`,
            confidence: ConfidenceLevel.HIGH,
            context: {
              capability: errorContext.capability,
              errorType: errorContext.errorType,
              errorMessage: errorContext.errorMessage,
            },
          });
        }

        return null;
      }

      // Use the recommended action from viability assessment
      switch (viabilityAssessment.recommendedAction) {
        case 'retry':
          // Don't change the strategy, just return it as-is for retrying
          this.logger.info('Recommending retry with same strategy', {
            strategy: currentStrategy.name,
            reason: viabilityAssessment.reason,
          });

          // Return the same strategy with a new ID to track the retry
          return {
            ...currentStrategy,
            id: uuidv4(),
            name: `${currentStrategy.name} (retry)`,
            parentStrategyId: currentStrategy.id,
            revisionAttempt: attemptCount + 1,
            revisionReason: 'retry_transient_error',
          };

        case 'simplify':
          // Simplify the strategy by removing or consolidating steps
          this.logger.info('Recommending simplification of strategy', {
            strategy: currentStrategy.name,
            reason: viabilityAssessment.reason,
          });

          // Create a simplified version of the strategy
          return this.createSimplifiedStrategy(
            currentStrategy,
            errorContext,
            attemptCount,
          );

        case 'revise':
          // If this is the first attempt and we have reasonable confidence, try a single-step adjustment
          if (attemptCount === 0 && viabilityAssessment.confidenceScore > 0.4) {
            const adjustedStrategy = await this.adjustStrategySingleStep(
              currentStrategy,
              errorContext,
            );

            if (adjustedStrategy) {
              return adjustedStrategy;
            }
          }

          // Otherwise, do a more significant revision with the LLM
          return await this.createRevisedStrategy(
            currentStrategy,
            errorContext,
            attemptCount,
          );

        case 'abandon':
        default:
          // Strategy should be abandoned
          this.logger.info('Strategy should be abandoned', {
            strategy: currentStrategy.name,
            reason: viabilityAssessment.reason,
          });
          return null;
      }
    } catch (error) {
      this.logger.error('Failed to revise strategy', { error });

      // Provide a fallback revision with basic error handling
      const fallbackStrategy: TaskStrategy = {
        id: uuidv4(),
        name: `${currentStrategy.name} (with error handling)`,
        description: `Error-hardened version of "${currentStrategy.name}" strategy with additional fallbacks and error recovery mechanisms`,
        steps: [
          'Validate input data and preconditions',
          ...currentStrategy.steps.map((step) => `${step} with error handling`),
          'Implement recovery mechanisms for known failure points',
          'Add validation checks after each major step',
          'Include fallback mechanisms for unreliable components',
        ],
        applicabilityScore: Math.max(
          0.3,
          currentStrategy.applicabilityScore - 0.2,
        ),
        estimatedEffort: 7,
        estimatedSuccess: 0.3,
        parentStrategyId: currentStrategy.id,
        revisionAttempt: attemptCount + 1,
        revisionReason: 'revision_error',
        requiredCapabilities: currentStrategy.requiredCapabilities,
      };

      return fallbackStrategy;
    }
  }

  /**
   * Create a simplified strategy by consolidating or removing steps
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private createSimplifiedStrategy(
    strategy: TaskStrategy,
    errorContext: {
      errorType: string;
      errorMessage: string;
      failedStep?: string;
      capability: string;
    },
    attemptCount: number,
  ): TaskStrategy {
    // Create a new strategy based on the current one
    const simplifiedStrategy: TaskStrategy = {
      ...strategy,
      id: uuidv4(),
      name: `${strategy.name} (simplified)`,
      parentStrategyId: strategy.id,
      revisionAttempt: attemptCount + 1,
      revisionReason: 'simplification',
      // Start with empty steps array, we'll populate it
      steps: [],
    };

    // Flag the problematic step if it exists
    let problematicStepIndex = -1;
    if (errorContext.failedStep) {
      problematicStepIndex = strategy.steps.findIndex(
        (step) => step === errorContext.failedStep,
      );
    }

    // Simplify the strategy by:
    // 1. Consolidating consecutive similar steps
    // 2. Removing excessive validation/preparation steps
    // 3. Focusing on core functionality

    const coreSteps: string[] = [];
    const setupSteps: string[] = [];
    const validationSteps: string[] = [];
    const cleanupSteps: string[] = [];

    // Categorize steps
    strategy.steps.forEach((step, index) => {
      const lowerStep = step.toLowerCase();

      // Skip the problematic step
      if (index === problematicStepIndex) {
        return;
      }

      if (
        lowerStep.includes('validate') ||
        lowerStep.includes('check') ||
        lowerStep.includes('verify')
      ) {
        validationSteps.push(step);
      } else if (
        lowerStep.includes('prepare') ||
        lowerStep.includes('setup') ||
        lowerStep.includes('initialize')
      ) {
        setupSteps.push(step);
      } else if (
        lowerStep.includes('cleanup') ||
        lowerStep.includes('finalize') ||
        lowerStep.includes('release')
      ) {
        cleanupSteps.push(step);
      } else {
        coreSteps.push(step);
      }
    });

    // Consolidate setup steps
    if (setupSteps.length > 1) {
      simplifiedStrategy.steps.push(
        'Prepare necessary resources and initialize',
      );
    } else if (setupSteps.length === 1) {
      simplifiedStrategy.steps.push(setupSteps[0]);
    }

    // Consolidate validation into one step if there are multiple
    if (validationSteps.length > 1) {
      simplifiedStrategy.steps.push('Validate inputs and preconditions');
    } else if (validationSteps.length === 1) {
      simplifiedStrategy.steps.push(validationSteps[0]);
    }

    // Add core steps (these are most important)
    simplifiedStrategy.steps.push(...coreSteps);

    // If there was a problematic step, add a simplified version
    if (problematicStepIndex >= 0) {
      const originalStep = strategy.steps[problematicStepIndex];
      const simplifiedStep = `${originalStep} (simplified - focus only on essential functionality)`;
      simplifiedStrategy.steps.push(simplifiedStep);
    }

    // Add a single cleanup step if needed
    if (cleanupSteps.length > 0) {
      simplifiedStrategy.steps.push('Clean up resources when done');
    }

    // Add error handling
    simplifiedStrategy.steps.push(
      'Implement robust error handling throughout execution',
    );

    // Update description
    simplifiedStrategy.description = `Simplified version of "${strategy.name}" strategy that focuses on core functionality and reduces complexity`;

    // Adjust effort and success estimates
    simplifiedStrategy.estimatedEffort = Math.max(
      3,
      (strategy.estimatedEffort || 5) - 1,
    );
    simplifiedStrategy.estimatedSuccess = Math.min(
      0.7,
      (strategy.estimatedSuccess || 0.5) + 0.1,
    );

    this.logger.info('Created simplified strategy', {
      originalStepCount: strategy.steps.length,
      simplifiedStepCount: simplifiedStrategy.steps.length,
    });

    return simplifiedStrategy;
  }

  /**
   * Create a revised strategy using the LLM
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private async createRevisedStrategy(
    currentStrategy: TaskStrategy,
    errorContext: {
      errorType: string;
      errorMessage: string;
      failedStep?: string;
      capability: string;
      originalInput: any;
    },
    attemptCount: number,
  ): Promise<TaskStrategy> {
    // Formulate a new strategy based on the error
    const formulationResult = await this.formulateStrategy({
      taskDescription: `Revise strategy for "${errorContext.capability}" that failed with error: ${errorContext.errorMessage}`,
      capability: errorContext.capability,
      context: {
        originalStrategy: currentStrategy,
        error: {
          type: errorContext.errorType,
          message: errorContext.errorMessage,
          failedStep: errorContext.failedStep || 'unknown step',
        },
        previousReflections: this.metacognitiveState.reflectionHistory
          .slice(0, 3)
          .map((r) => r.assessment.identifiedRisks?.join('. ') || ''),
      },
      constraints: [
        'Must address the specific error that occurred',
        'Should leverage successful parts of the original strategy',
        'Must be more robust than the original strategy',
        'Should include error handling mechanisms',
      ],
    });

    // Create a revised strategy that maintains lineage to the original
    const revisedStrategy: TaskStrategy = {
      ...formulationResult.primaryStrategy,
      id: uuidv4(),
      parentStrategyId: currentStrategy.id,
      revisionAttempt: attemptCount + 1,
      revisionReason: errorContext.errorType,
    };

    this.logger.info('Successfully formulated revised strategy', {
      originalStrategy: currentStrategy.name,
      revisedStrategy: revisedStrategy.name,
      estimatedSuccess: revisedStrategy.estimatedSuccess,
    });

    return revisedStrategy;
  }

  /**
   * Assess whether a strategy is viable to continue using after an error
   *
   * Enhanced with better abandonment heuristics and pattern recognition.
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  protected async assessStrategyViability(
    strategy: TaskStrategy,
    errorContext: {
      errorType: string;
      errorMessage: string;
      failedStep?: string;
      capability: string;
    },
    attemptCount: number,
  ): Promise<{
    isViable: boolean;
    confidenceScore: number;
    reason: string;
    fundamentalIncompatibility: boolean;
    recommendedAction: 'revise' | 'abandon' | 'simplify' | 'retry';
  }> {
    // Expanded fatal error types that indicate a strategy should be abandoned
    const fatalErrorTypes = [
      'AuthorizationError',
      'UnsupportedCapabilityError',
      'InvalidStrategyError',
      'ResourceExhaustedError',
      'CriticalDependencyError',
      'PermissionDeniedError',
      'UnsupportedOperationError',
      'IncompatibleInputError',
      'CapabilityConstraintViolationError',
      'ContentFilterError',
      'InvalidArgumentError',
      'CapabilityNotAvailableError',
      'UnsatisfiableConstraintError',
      'InvalidContextError',
      'InvalidStateError',
    ];

    // Critical semantic patterns that indicate abandonment rather than revision
    const criticalErrorPatterns = [
      'not possible',
      'cannot be done',
      'impossible to',
      'fundamentally incompatible',
      'violates constraints',
      'incorrect approach',
      'wrong strategy',
      'invalid assumption',
      'not supported',
      'not allowed',
      'missing required',
      'exceeds maximum',
      'insufficient permission',
    ];

    // Check if error message contains critical patterns
    const hasCriticalPattern = criticalErrorPatterns.some((pattern) =>
      errorContext.errorMessage.toLowerCase().includes(pattern.toLowerCase()),
    );

    // Check if this is a fatal error type
    if (
      fatalErrorTypes.includes(errorContext.errorType) ||
      hasCriticalPattern
    ) {
      return {
        isViable: false,
        confidenceScore: 0.1,
        reason: hasCriticalPattern
          ? `Error indicates fundamental approach problem: ${errorContext.errorMessage}`
          : `Fatal error type: ${errorContext.errorType}`,
        fundamentalIncompatibility: true,
        recommendedAction: 'abandon',
      };
    }

    // Check maximum revision attempts
    const maxAttempts = this.reflectionConfig.maxRevisionAttempts || 3;
    if (attemptCount >= maxAttempts) {
      return {
        isViable: false,
        confidenceScore: 0.1,
        reason: `Maximum revision attempts (${maxAttempts}) reached`,
        fundamentalIncompatibility: false,
        recommendedAction: 'abandon',
      };
    }

    // Get historical error data for this strategy and error type
    const sameTypeErrors = this.getErrorHistoryByType(errorContext.errorType);
    const sameStepErrors = this.getErrorHistoryByStep(errorContext.failedStep);

    // Get execution history for this capability
    const executionHistory = this.getExecutionHistoryForCapability(
      errorContext.capability,
    );

    // Check for repeated errors of the same type
    const sameErrorCount = sameTypeErrors.length;
    const sameStepErrorCount = sameStepErrors.length;

    // If we've seen this exact error type multiple times, abandon
    if (sameErrorCount >= 3) {
      return {
        isViable: false,
        confidenceScore: 0.2,
        reason: `Same error type has occurred ${sameErrorCount} times`,
        fundamentalIncompatibility: sameErrorCount >= 4,
        recommendedAction: 'abandon',
      };
    }

    // If the same step has failed multiple times, that's a strong signal
    if (sameStepErrorCount >= 2) {
      // If it's the same step but occurred multiple times, consider the step problematic
      // but potentially fixable with simplification
      return {
        isViable: sameStepErrorCount < 3,
        confidenceScore: 0.3,
        reason: `Same step has failed ${sameStepErrorCount} times`,
        fundamentalIncompatibility: false,
        recommendedAction: sameStepErrorCount >= 3 ? 'abandon' : 'simplify',
      };
    }

    // Analyze if the error indicates temporary issues or permanent incompatibility
    // Check for transient error indicators
    const transientErrorTerms = [
      'timeout',
      'connection',
      'network',
      'temporary',
      'overloaded',
      'rate limit',
      'throttled',
      'momentary',
      'try again',
      'intermittent',
      'too many requests',
      'service unavailable',
      'retry',
    ];

    const isLikelyTransient = transientErrorTerms.some((term) =>
      errorContext.errorMessage.toLowerCase().includes(term),
    );

    // For transient errors, we should usually retry rather than revise
    if (isLikelyTransient) {
      return {
        isViable: true,
        confidenceScore: 0.7,
        reason: 'Error appears to be transient and strategy is worth retrying',
        fundamentalIncompatibility: false,
        recommendedAction: 'retry',
      };
    }

    // Check for fundamental incompatibility indicators
    const fundamentalErrorTerms = [
      'incompatible',
      'impossible',
      'cannot',
      'unable to',
      'not supported',
      'invalid',
      'permission denied',
      'unauthorized',
      'not allowed',
      'must not',
      'invalid format',
      'invalid input',
      'requirements not met',
      'precondition failed',
      'unsatisfiable',
      'contradiction',
    ];

    const hasFundamentalIssue = fundamentalErrorTerms.some((term) =>
      errorContext.errorMessage.toLowerCase().includes(term),
    );

    // Enhanced: Check if the strategy's success rate is consistently poor
    const successRate = this.calculateStrategySuccessRate(
      strategy,
      errorContext.capability,
    );

    // Enhanced: Check for increasing complexity over revisions
    const isComplexityIncreasing =
      strategy.revisionAttempt &&
      strategy.revisionAttempt > 0 &&
      strategy.steps.length >
        (strategy.steps.length / (strategy.revisionAttempt + 1)) * 1.5;

    // Enhanced: Check for diminishing estimated success over revisions
    const isSuccessRateDiminishing =
      strategy.revisionAttempt &&
      strategy.revisionAttempt > 0 &&
      strategy.estimatedSuccess < 0.5;

    // Check for strategy complexity exceeding reasonable limits
    const isExcessivelyComplex =
      strategy.steps.length > 15 || strategy.steps.join(' ').length > 2000;

    // Weigh all factors to determine overall viability
    const isViable = !(
      hasFundamentalIssue ||
      fatalErrorTypes.includes(errorContext.errorType) ||
      sameErrorCount >= 3 ||
      sameStepErrorCount >= 3 ||
      successRate < 0.2 ||
      (isComplexityIncreasing && isSuccessRateDiminishing) ||
      isExcessivelyComplex ||
      attemptCount >= maxAttempts
    );

    let confidenceScore = 0.5; // Start with neutral confidence

    // Adjust based on strategy history and error analysis
    if (isLikelyTransient) confidenceScore += 0.2;
    if (hasFundamentalIssue) confidenceScore -= 0.3;
    if (sameErrorCount > 0) confidenceScore -= 0.1 * sameErrorCount;
    if (sameStepErrorCount > 0) confidenceScore -= 0.1 * sameStepErrorCount;
    if (successRate < 0.5) confidenceScore -= 0.5 - successRate;
    if (isComplexityIncreasing) confidenceScore -= 0.1;
    if (isSuccessRateDiminishing) confidenceScore -= 0.2;
    if (isExcessivelyComplex) confidenceScore -= 0.2;

    // Ensure confidence is within bounds
    confidenceScore = Math.max(0, Math.min(1, confidenceScore));

    // Determine recommended action based on analysis
    let recommendedAction: 'revise' | 'abandon' | 'simplify' | 'retry' =
      'revise';

    if (!isViable) {
      recommendedAction = 'abandon';
    } else if (isComplexityIncreasing || isExcessivelyComplex) {
      recommendedAction = 'simplify';
    } else if (isLikelyTransient) {
      recommendedAction = 'retry';
    }

    return {
      isViable,
      confidenceScore,
      reason: isViable
        ? isLikelyTransient
          ? 'Error appears to be transient and strategy is worth retrying'
          : isComplexityIncreasing || isExcessivelyComplex
            ? 'Strategy is becoming too complex but may be salvageable with simplification'
            : 'Strategy still viable despite error'
        : hasFundamentalIssue
          ? 'Error indicates fundamental incompatibility with strategy'
          : successRate < 0.2
            ? 'Historical success rate is too low'
            : sameErrorCount >= 2
              ? `Same error has occurred ${sameErrorCount} times`
              : isExcessivelyComplex
                ? 'Strategy has become excessively complex'
                : isComplexityIncreasing && isSuccessRateDiminishing
                  ? 'Strategy is getting more complex while becoming less effective'
                  : 'Multiple factors indicate strategy should be abandoned',
      fundamentalIncompatibility:
        hasFundamentalIssue ||
        hasCriticalPattern ||
        fatalErrorTypes.includes(errorContext.errorType) ||
        sameErrorCount >= 3 ||
        successRate < 0.1,
      recommendedAction,
    };
  }

  /**
   * Calculate the success rate for a given strategy and capability
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private calculateStrategySuccessRate(
    strategy: TaskStrategy,
    capability: string,
  ): number {
    // Default to neutral if no data
    if (!strategy.id) return 0.5;

    // Check if we have stored the strategy in learned approaches
    const strategyKey = `${capability}-${strategy.id}`;
    if (this.metacognitiveState.learnedApproaches[strategyKey]) {
      return this.metacognitiveState.learnedApproaches[strategyKey]
        .effectiveness;
    }

    // Check if we have a parent strategy to use for reference
    if (strategy.parentStrategyId) {
      const parentKey = `${capability}-${strategy.parentStrategyId}`;
      if (this.metacognitiveState.learnedApproaches[parentKey]) {
        // Discount the parent's effectiveness slightly
        return Math.max(
          0.1,
          this.metacognitiveState.learnedApproaches[parentKey].effectiveness -
            0.1,
        );
      }
    }

    // If strategy has a revision attempt number, calculate progressive discount
    if (strategy.revisionAttempt && strategy.revisionAttempt > 0) {
      // Start with 0.6 and reduce by 0.1 for each revision, to a minimum of 0.2
      return Math.max(0.2, 0.6 - strategy.revisionAttempt * 0.1);
    }

    // Default case - return moderate success probability
    return 0.5;
  }

  /**
   * Get error history for a specific error type
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private getErrorHistoryByType(errorType: string): Array<ReflectionRecord> {
    if (!errorType) return [];

    return this.metacognitiveState.reflectionHistory.filter(
      (record) =>
        record.type === ReflectionPointType.ERROR &&
        record.context.errorType === errorType,
    );
  }

  /**
   * Get error history for a specific execution step
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private getErrorHistoryByStep(step?: string): Array<ReflectionRecord> {
    if (!step) return [];

    return this.metacognitiveState.reflectionHistory.filter(
      (record) =>
        record.type === ReflectionPointType.ERROR &&
        record.context.executionStage === step,
    );
  }

  /**
   * Get execution history for a specific capability
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private getExecutionHistoryForCapability(
    capability: string,
  ): Array<{ taskId: string; success: boolean }> {
    if (!capability) return [];

    return Object.values(this.metacognitiveState.pastTaskPerformance)
      .filter((record) => record.capability === capability)
      .map((record) => ({
        taskId: record.taskId,
        success: record.success,
      }));
  }

  /**
   * Handle errors that occur during execution
   */
  protected async handleError(
    error: Error,
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const taskId = request.context?.taskId || `task-${this.id}-${Date.now()}`;
    const executionTimeMs = 0; // Default value

    // Log the error
    this.logger.error(`Error executing capability ${request.capability}`, {
      error,
      capability: request.capability,
      taskId,
    });

    // If confidence prediction ID exists in context, update with failure outcome
    if (request.context?.confidencePredictionId) {
      this.updateConfidencePrediction(
        request.context.confidencePredictionId,
        false,
      );
    }

    // Basic error response
    const response: AgentResponse = {
      success: false,
      output: `Error: ${error.message}`,
      metrics: {
        executionTimeMs,
      },
    };

    // Cast to any to add custom properties
    const enhancedResponse = response as any;
    enhancedResponse.errorType = error.name || 'UnknownError';

    // Only update progress if the service is available
    if (this.progressMonitor) {
      // We need to send a properly typed update here
      const update: any = {
        completedSteps: this.metacognitiveState.progress?.completedSteps,
        blocker: {
          description: error.message,
          severity: 'high',
        },
      };

      this.progressMonitor.updateProgress(
        taskId,
        request.capability || 'unknown',
        update,
      );
    }

    // Check if we can attempt strategy revision
    let shouldReviseStrategy = false;
    let revisionAttempt = 0;

    // Only attempt revision if we have a current strategy
    if (this.metacognitiveState.currentStrategy) {
      const currentStrategy = this.metacognitiveState.currentStrategy;

      // Check if this strategy was already a revision
      if (currentStrategy.revisionAttempt !== undefined) {
        revisionAttempt = currentStrategy.revisionAttempt;
      }

      // Check if revision is enabled and we haven't exceeded max attempts
      const maxAttempts = this.reflectionConfig.maxRevisionAttempts || 3;
      shouldReviseStrategy =
        this.reflectionConfig.enableStrategyRevision === true &&
        revisionAttempt < maxAttempts;
    }

    // Attempt strategy revision if appropriate
    if (shouldReviseStrategy && this.metacognitiveState.currentStrategy) {
      try {
        // Cast to any to avoid strict type checking
        const currentStep = (this.metacognitiveState.progress as any)
          ?.currentStep;

        // Track whether we had a strategy before revision for visualization
        const hadStrategyBeforeRevision =
          !!this.metacognitiveState.currentStrategy;
        const originalStrategy = this.metacognitiveState.currentStrategy;

        const revisedStrategy = await this.reviseStrategy(
          this.metacognitiveState.currentStrategy,
          {
            errorType: error.name || 'UnknownError',
            errorMessage: error.message,
            capability: request.capability || 'unknown',
            originalInput: request.input,
            failedStep: currentStep,
          },
          revisionAttempt,
        );

        if (revisedStrategy) {
          // Store the revised strategy
          this.metacognitiveState.currentStrategy = revisedStrategy;

          // Generate visualization for the strategy revision if possible
          try {
            const vizService = await this.getVisualizationService();
            if (vizService) {
              const vizUrl =
                await vizService.generateStrategyRevisionVisualization({
                  taskId,
                  originalStrategy,
                  revisedStrategy,
                  errorInfo: {
                    type: error.name || 'UnknownError',
                    message: error.message,
                    failedStep: currentStep,
                  },
                  agent: {
                    id: this.id,
                    name: this.name,
                  },
                  timestamp: Date.now(),
                });

              if (vizUrl) {
                enhancedResponse.visualizationUrl = vizUrl;
              }
            }
          } catch (vizError) {
            this.logger.warn(
              'Failed to generate strategy revision visualization',
              { error: vizError },
            );
          }

          // Add custom property to response
          enhancedResponse.revisionStrategy = {
            name: revisedStrategy.name,
            description: revisedStrategy.description,
            steps: revisedStrategy.steps,
            estimatedSuccess: revisedStrategy.estimatedSuccess || 0.5,
          };

          // Add a reflection for the revision
          this.recordReflection({
            type: ReflectionPointType.STRATEGY_REVISION,
            content: `Revised strategy from "${originalStrategy.name}" to "${revisedStrategy.name}" after error: ${error.message}`,
            confidence:
              revisedStrategy.estimatedSuccess > 0.7
                ? ConfidenceLevel.HIGH
                : revisedStrategy.estimatedSuccess > 0.4
                  ? ConfidenceLevel.MODERATE
                  : ConfidenceLevel.LOW,
            context: {
              taskId,
              capability: request.capability,
              originalStrategy: originalStrategy.id,
              revisedStrategy: revisedStrategy.id,
              errorType: error.name || 'UnknownError',
              errorMessage: error.message,
            },
          });

          this.logger.info('Successfully revised strategy after error', {
            taskId,
            originalStrategy: originalStrategy.name,
            revisedStrategy: revisedStrategy.name,
          });
        }
      } catch (revisionError) {
        this.logger.error('Error during strategy revision', {
          error: revisionError,
          taskId,
        });
      }
    }

    // Perform reflection if enabled
    if (this.reflectionConfig.reflectOnErrors === true) {
      try {
        const reflectionResult = await this.reflect({
          type: ReflectionPointType.ERROR,
          context: {
            taskId,
            capability: request.capability,
            input:
              typeof request.input === 'string'
                ? request.input.substring(0, 200)
                : 'complex input',
            errorType: error.name || 'UnknownError',
            errorMessage: error.message,
            executionTimeMs,
          },
        });

        // Use insight from reflection or default
        const insight =
          reflectionResult.insight || 'Error occurred during execution';

        this.recordReflection({
          type: ReflectionPointType.ERROR,
          content: insight,
          confidence: reflectionResult.confidence,
          context: {
            taskId,
            capability: request.capability,
            errorType: error.name || 'UnknownError',
            errorMessage: error.message,
          },
        });

        // Add reflection to response
        enhancedResponse.reflection = {
          insight,
          confidence: reflectionResult.confidence,
        };
      } catch (reflectionError) {
        this.logger.warn('Failed to reflect on error', {
          error: reflectionError,
          originalError: error,
        });
      }
    }

    // Update error count in the agent's state
    const stateMetrics = (this.state as any).metrics || {};
    stateMetrics.errorCount = (stateMetrics.errorCount || 0) + 1;
    (this.state as any).metrics = stateMetrics;

    return response;
  }

  /**
   * Helper method to get visualization service if available
   * @returns Visualization service or null if not available
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private async getVisualizationService(): Promise<any | null> {
    try {
      // Dynamic import to avoid circular dependencies
      const visualizationModule = await import(
        '../services/visualization.service.js'
      );
      return visualizationModule.VisualizationService.getInstance({
        logger: this.logger,
      });
    } catch (error) {
      this.logger.debug('Visualization service not available', { error });
      return null;
    }
  }

  /**
   * Record a reflection in the agent's history
   */
  protected recordReflection(params: {
    type: ReflectionPointType;
    content: string;
    confidence: ConfidenceLevel;
    context: {
      taskId?: string;
      capability?: string;
      executionStage?: string;
      triggerReason?: string;
      errorType?: string;
      errorMessage?: string;
      originalStrategy?: string;
      revisedStrategy?: string;
    };
  }): void {
    const { type, content, confidence, context } = params;

    // Create a new reflection record
    const reflection: ReflectionRecord = {
      id: uuidv4(),
      timestamp: Date.now(),
      type,
      context,
      assessment: {
        overallConfidence: confidence,
        overallProgress:
          this.metacognitiveState.progress?.estimatedCompletion || 0,
        identifiedRisks: [content], // Store content as an identified risk for compatibility
      },
    };

    // Add to history (most recent first)
    this.metacognitiveState.reflectionHistory.unshift(reflection);

    // Prevent history from growing too large
    if (this.metacognitiveState.reflectionHistory.length > 100) {
      this.metacognitiveState.reflectionHistory =
        this.metacognitiveState.reflectionHistory.slice(0, 100);
    }

    this.logger.debug(`Recorded reflection of type ${type}`, {
      confidence,
      taskId: context.taskId,
    });
  }

  /**
   * Make a single-step adjustment to a strategy
   *
   * Creates a lightweight revision of a strategy by addressing specific
   * issues identified in the error context.
   *
   * @param strategy The current strategy to adjust
   * @param errorContext Error information
   * @returns Adjusted strategy or null if no simple adjustment is possible
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  protected async adjustStrategySingleStep(
    strategy: TaskStrategy,
    errorContext: {
      errorType: string;
      errorMessage: string;
      failedStep?: string;
      capability: string;
    },
  ): Promise<TaskStrategy | null> {
    try {
      const { errorType, errorMessage, failedStep } = errorContext;

      // Create a copy of the strategy to adjust
      const adjustedStrategy: TaskStrategy = {
        ...strategy,
        id: uuidv4(),
        name: `${strategy.name} (adjusted)`,
        parentStrategyId: strategy.id,
        revisionAttempt: 1,
        revisionReason: 'targeted_adjustment',
        steps: [...strategy.steps],
      };

      // Determine what kind of adjustment to make
      let adjustmentMade = false;

      // Handle timeout errors by breaking steps into smaller parts
      if (errorType === 'timeout' || errorType === 'execution_timeout') {
        if (failedStep && adjustedStrategy.steps.includes(failedStep)) {
          const stepIndex = adjustedStrategy.steps.indexOf(failedStep);
          const revisedSteps = failedStep.split(': ');

          if (revisedSteps.length > 1) {
            // Replace the step with more granular steps
            adjustedStrategy.steps.splice(
              stepIndex,
              1,
              `${revisedSteps[0]}: Focus on essential elements`,
              `${revisedSteps[0]}: Process remaining elements incrementally`,
            );
            adjustmentMade = true;
          } else {
            // Add a step for handling timeouts
            adjustedStrategy.steps.splice(
              stepIndex + 1,
              0,
              'Implement timeout handling with partial results',
            );
            adjustmentMade = true;
          }
        } else {
          // Add general timeout handling
          adjustedStrategy.steps.push('Handle timeouts gracefully');
          adjustmentMade = true;
        }
      }

      // Handle parsing or format errors
      if (errorType.includes('parse') || errorType.includes('format')) {
        adjustedStrategy.steps.push(
          'Validate and sanitize inputs before processing',
        );
        adjustedStrategy.steps.push(
          'Add robust error handling for malformed data',
        );
        adjustmentMade = true;
      }

      // Handle resource errors
      if (errorType.includes('resource') || errorMessage.includes('resource')) {
        adjustedStrategy.steps.push(
          'Implement resource management and cleanup',
        );
        adjustedStrategy.steps.push('Add retry logic with exponential backoff');
        adjustmentMade = true;
      }

      // If no specific adjustment was made, return null
      if (!adjustmentMade) {
        return null;
      }

      // Update strategy metadata
      adjustedStrategy.description = `${strategy.description} - Adjusted to handle ${errorType} errors`;

      // Update effort and success estimates
      adjustedStrategy.estimatedEffort = Math.min(
        (strategy.estimatedEffort || 5) + 1,
        10,
      );
      adjustedStrategy.estimatedSuccess = Math.min(
        (strategy.estimatedSuccess || 0.5) + 0.1,
        0.9,
      );

      this.logger.info('Made simple adjustment to strategy', {
        strategy: strategy.name,
        errorType,
        adjustmentType: 'single_step',
      });

      return adjustedStrategy;
    } catch (error) {
      this.logger.warn('Error during strategy adjustment', { error });
      return null;
    }
  }
}
