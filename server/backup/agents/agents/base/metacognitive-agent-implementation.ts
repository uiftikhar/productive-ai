/**
 * @deprecated This module is deprecated and will be removed in a future version.
 * Use the new agentic meeting analysis system in /langgraph/agentic-meeting-analysis instead.
 */

import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  HumanMessage,
  AIMessage,
} from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';

import { MetacognitiveBaseAgent } from './metacognitive-base-agent';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

import {
  AgentCapability,
  AgentResponse,
  AgentRequest,
} from '../interfaces/base-agent.interface';

import {
  CapabilityAssessment,
  ConfidenceLevel,
  ReflectionPointType,
  ReflectionRecord,
  SelfAssessmentRequest,
  SelfAssessmentResponse,
  SelfReflectionRequest,
  SelfReflectionResponse,
  StrategyFormulationRequest,
  StrategyFormulationResponse,
  TaskStrategy,
} from '../interfaces/metacognition.interface';

/**
 * Default implementation of the MetacognitiveBaseAgent
 * Provides concrete implementations of self-reflection, assessment, and strategy formulation
 */
export class MetacognitiveAgentImplementation extends MetacognitiveBaseAgent {
  constructor(
    name: string,
    description: string,
    options: {
      id?: string;
      logger?: Logger;
      llm?: ChatOpenAI;
    } = {},
  ) {
    super(name, description, options);
  }

  /**
   * Execute internal implementation with confidence prediction tracking
   */
  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    // Check if the request has a capability
    if (request.capability) {
      try {
        // Assess capability confidence
        const assessmentResult = await this.assessCapability({
          capability: request.capability,
          taskDescription:
            typeof request.input === 'string'
              ? request.input.substring(0, 500)
              : undefined,
        });

        // If assessment contains a prediction ID, add it to context
        if (assessmentResult.metadata?.confidencePredictionId) {
          // Ensure context exists
          if (!request.context) {
            request.context = {};
          }

          // Add prediction ID to context for later updating
          request.context.confidencePredictionId =
            assessmentResult.metadata.confidencePredictionId;
        }
      } catch (error) {
        this.logger.warn('Failed to assess capability before execution', {
          error,
        });
      }
    }

    // This is a simple implementation that will be enhanced in specialized metacognitive agents
    return {
      success: true,
      output: `Executed ${request.capability || 'default capability'} with input: ${typeof request.input === 'string' ? request.input : JSON.stringify(request.input)}`,
      metrics: {
        executionTimeMs: 100,
        tokensUsed: 50,
      },
    };
  }

  /**
   * Perform capability assessment with improved confidence calibration
   */
  async assessCapability(
    request: SelfAssessmentRequest,
  ): Promise<SelfAssessmentResponse> {
    const { capability, taskDescription, context, complexityEstimate } =
      request;

    // Check if capability exists
    const capabilityDetails = this.capabilities.get(capability);
    if (!capabilityDetails) {
      return {
        capability,
        canHandle: false,
        assessment: {
          capabilityName: capability,
          confidence: ConfidenceLevel.VERY_LOW,
          confidenceScore: 0,
          reasoning: `Capability '${capability}' is not supported by this agent`,
        },
      };
    }

    // If we have a previous assessment and no specific task, return that
    if (
      this.metacognitiveState.capabilityAssessments[capability] &&
      !taskDescription
    ) {
      return {
        capability,
        canHandle: true,
        assessment: this.metacognitiveState.capabilityAssessments[capability],
      };
    }

    // Generate or use a system prompt for capability assessment
    const systemPrompt = `You are the self-assessment module for the AI agent named "${this.name}". Your job is to assess the agent's capability to handle a specific task.

Agent description: ${this.description}
Capability being assessed: ${capability}
${capabilityDetails ? `Capability description: ${capabilityDetails.description}` : ''}
${complexityEstimate ? `Estimated complexity: ${complexityEstimate}/10` : ''}

${context ? `Additional context: ${JSON.stringify(context)}` : ''}

Based on the agent's description and the capability details, assess:
1. Can the agent handle this capability? (yes/no)
2. What is the confidence level? (very_low, low, moderate, high, very_high)
3. What is the numerical confidence score? (0-1)
4. What is the reasoning behind this assessment?
5. What alternative capabilities might be better suited, if any?

Provide your assessment in the following JSON format:
{
  "canHandle": true/false,
  "assessment": {
    "capabilityName": "${capability}",
    "confidence": "confidence_level",
    "confidenceScore": 0.0-1.0,
    "reasoning": "your detailed reasoning",
    "alternativeCapabilities": ["alternative1", "alternative2"]
  }
}`;

    const userMessage = `Assess agent's capability:
${taskDescription ? `Task description: ${taskDescription}` : ''}
Capability: ${capability}`;

    try {
      // Call the LLM for capability assessment
      const messages = this.prepareMessages(systemPrompt, userMessage);
      const response = await this.llm.invoke(messages);

      // Parse the response
      let assessment: SelfAssessmentResponse;

      try {
        // Try to parse JSON from the response
        const responseText = response.content as string;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          assessment = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (error) {
        // Fallback if parsing fails
        this.logger.warn('Failed to parse assessment response', { error });

        // Create a default assessment
        assessment = {
          capability,
          canHandle: true,
          assessment: {
            capabilityName: capability,
            confidence: ConfidenceLevel.MODERATE,
            confidenceScore: 0.5,
            reasoning: 'Default assessment due to parsing failure',
          },
        };
      }

      // Apply confidence calibration
      const rawConfidence = assessment.assessment.confidenceScore;

      // Calibrate confidence score
      const calibratedConfidence = this.calibrateConfidence(
        rawConfidence,
        capability,
        this.name,
      );

      // Update confidence level based on calibrated score
      const calibratedConfidenceLevel =
        this.getConfidenceLevelFromScore(calibratedConfidence);

      // Register this prediction for later updating with actual outcome
      const predictionId = this.registerConfidencePrediction(
        calibratedConfidence,
        capability,
        {
          taskDescription,
          originalConfidence: rawConfidence,
        },
      );

      // Log calibration adjustment
      if (Math.abs(rawConfidence - calibratedConfidence) > 0.1) {
        this.logger.info('Confidence calibration applied', {
          capability,
          originalConfidence: rawConfidence,
          calibratedConfidence,
          adjustmentAmount: calibratedConfidence - rawConfidence,
        });
      }

      // Update the assessment with calibrated confidence
      assessment.assessment.confidenceScore = calibratedConfidence;
      assessment.assessment.confidence = calibratedConfidenceLevel;

      // Store the predictionId for later updating
      if (!assessment.metadata) {
        assessment.metadata = {};
      }
      assessment.metadata.confidencePredictionId = predictionId;

      // Store the assessment for future reference
      this.metacognitiveState.capabilityAssessments[capability] =
        assessment.assessment;

      return assessment;
    } catch (error) {
      // If LLM call fails, use a default assessment
      this.logger.error('Capability assessment failed', { error });

      const defaultAssessment: SelfAssessmentResponse = {
        capability,
        canHandle: true,
        assessment: {
          capabilityName: capability,
          confidence: ConfidenceLevel.MODERATE,
          confidenceScore: 0.5,
          reasoning: 'Default assessment due to LLM failure',
        },
      };

      return defaultAssessment;
    }
  }

  /**
   * Perform self-reflection during execution
   */
  async reflect(
    request: SelfReflectionRequest,
  ): Promise<SelfReflectionResponse> {
    const { type, context, focusAreas } = request;

    // Increment consecutive reflections counter
    this.consecutiveReflections++;

    // If we've exceeded the maximum consecutive reflections, limit reflection depth
    const reflectionDepth =
      this.consecutiveReflections >=
      this.reflectionConfig.maxConsecutiveReflections
        ? 'shallow'
        : this.reflectionConfig.reflectionDepth;

    // Create a system prompt for reflection
    const systemPrompt = `You are the self-reflection module for the AI agent named "${this.name}". Your job is to help the agent reflect on its current state and make decisions about how to proceed.

Agent description: ${this.description}
Reflection type: ${type}
Reflection depth: ${reflectionDepth}

${context.capability ? `Current capability: ${context.capability}` : ''}
${context.progress !== undefined ? `Current progress: ${context.progress * 100}%` : ''}
${context.error ? `Error encountered: ${context.error.message}` : ''}

${focusAreas ? `Focus areas for reflection: ${focusAreas.join(', ')}` : ''}

${
  this.metacognitiveState.progress
    ? `Current progress:
- Completed steps: ${this.metacognitiveState.progress.completedSteps}/${this.metacognitiveState.progress.totalSteps}
- Estimated completion: ${Math.round(this.metacognitiveState.progress.estimatedCompletion * 100)}%`
    : ''
}

Provide your reflection in the following JSON format:
{
  "overallConfidence": "very_low"/"low"/"moderate"/"high"/"very_high",
  "overallProgress": 0.0-1.0,
  "identifiedRisks": ["risk1", "risk2"],
  "suggestedAdjustments": ["adjustment1", "adjustment2"],
  "suggestedAction": "continue"/"adjust"/"escalate"/"delegate"/"abort",
  "actionReasoning": "Reasoning for suggested action",
  "adjustments": {
    // Any specific adjustments to make
  }
}`;

    const userMessage = `Reflect on current state:
Type: ${type}
${context.capability ? `Capability: ${context.capability}` : ''}
${context.input ? `Input: ${typeof context.input === 'string' ? context.input.substring(0, 200) + '...' : 'Complex input'}` : ''}
${context.error ? `Error: ${context.error.message}` : ''}`;

    try {
      // Create reflection record ID
      const reflectionId = uuidv4();

      // Call the LLM for reflection
      const messages = this.prepareMessages(systemPrompt, userMessage);
      const response = await this.llm.invoke(messages);

      // Parse the response
      let assessment: any = {};
      let suggestedAction: SelfReflectionResponse['suggestedAction'] =
        'continue';
      let adjustments: Record<string, any> | undefined;

      try {
        // Try to parse JSON from the response
        const responseText = response.content as string;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const parsedResponse = JSON.parse(jsonMatch[0]);

          assessment = {
            overallConfidence:
              parsedResponse.overallConfidence || ConfidenceLevel.MODERATE,
            overallProgress:
              parsedResponse.overallProgress ||
              this.metacognitiveState.progress?.estimatedCompletion ||
              0,
            identifiedRisks: parsedResponse.identifiedRisks || [],
            suggestedAdjustments: parsedResponse.suggestedAdjustments || [],
          };

          suggestedAction = parsedResponse.suggestedAction || 'continue';
          adjustments = parsedResponse.adjustments;
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (error) {
        // Fallback if parsing fails
        this.logger.warn('Failed to parse reflection response', { error });

        assessment = {
          overallConfidence: ConfidenceLevel.MODERATE,
          overallProgress:
            this.metacognitiveState.progress?.estimatedCompletion || 0,
          identifiedRisks: ['Reflection parsing failed'],
          suggestedAdjustments: [],
        };
      }

      // Create reflection record
      const reflectionRecord: ReflectionRecord = {
        id: reflectionId,
        timestamp: Date.now(),
        type,
        context: {
          capability: context.capability,
          executionStage: type,
          triggerReason: context.error ? 'error' : 'scheduled',
        },
        assessment,
        decision: {
          action: suggestedAction,
          reasoning: assessment.actionReasoning || 'No reasoning provided',
          adjustments,
        },
      };

      // Store the reflection
      this.metacognitiveState.reflectionHistory.unshift(reflectionRecord);

      // Limit history size
      if (this.metacognitiveState.reflectionHistory.length > 100) {
        this.metacognitiveState.reflectionHistory =
          this.metacognitiveState.reflectionHistory.slice(0, 100);
      }

      // Update current confidence
      this.metacognitiveState.currentConfidence = assessment.overallConfidence;

      // Update metrics
      const metrics = this.getMetrics();
      this.updateMetrics({
        ...metrics,
        reflectionCount: (metrics.reflectionCount || 0) + 1,
      });

      return {
        reflectionRecord,
        shouldAdjustStrategy: suggestedAction !== 'continue',
        suggestedAction,
        adjustments,
        confidence: assessment.overallConfidence,
      };
    } catch (error) {
      // If LLM call fails, use default reflection
      this.logger.error('Self-reflection failed', { error });

      // Create a simple reflection record
      const reflectionRecord: ReflectionRecord = {
        id: uuidv4(),
        timestamp: Date.now(),
        type,
        context: {
          capability: context.capability,
          executionStage: type,
          triggerReason: 'error in reflection',
        },
        assessment: {
          overallConfidence: ConfidenceLevel.LOW,
          overallProgress:
            this.metacognitiveState.progress?.estimatedCompletion || 0,
          identifiedRisks: ['Reflection system failed'],
        },
      };

      // Store the reflection
      this.metacognitiveState.reflectionHistory.unshift(reflectionRecord);

      return {
        reflectionRecord,
        shouldAdjustStrategy: false,
        suggestedAction: 'continue',
        confidence: ConfidenceLevel.LOW,
      };
    }
  }

  /**
   * Formulate a strategy for approaching a task
   */
  async formulateStrategy(
    request: StrategyFormulationRequest,
  ): Promise<StrategyFormulationResponse> {
    const { taskDescription, capability, context, constraints, preferences } =
      request;

    // Get capability details
    const capabilityDetails = this.capabilities.get(capability);

    // Create a system prompt for strategy formulation
    const systemPrompt = `You are the strategy formulation module for the AI agent named "${this.name}". Your job is to develop a strategy for approaching a specific task.

Agent description: ${this.description}
Task: ${taskDescription}
Capability to use: ${capability}
${capabilityDetails ? `Capability description: ${capabilityDetails.description}` : ''}
${constraints ? `Constraints: ${constraints.join(', ')}` : ''}

${context ? `Additional context: ${JSON.stringify(context)}` : ''}

Develop a detailed strategy with the following components:
1. High-level approach
2. Step-by-step breakdown
3. Required capabilities
4. Potential challenges and mitigations
5. Success criteria

Provide your strategy in the following JSON format:
{
  "primaryStrategy": {
    "id": "unique-id",
    "name": "Strategy name",
    "description": "Strategy description",
    "applicabilityScore": 0.0-1.0,
    "estimatedEffort": 1-10,
    "estimatedSuccess": 0.0-1.0,
    "steps": ["step1", "step2", ...],
    "requiredCapabilities": ["capability1", "capability2", ...]
  },
  "alternativeStrategies": [
    {
      // same structure as primaryStrategy
    }
  ],
  "estimatedSuccess": 0.0-1.0,
  "reasoning": "Your detailed reasoning"
}`;

    const userMessage = `Formulate strategy for:
Task: ${taskDescription}
Capability: ${capability}
${preferences ? `Preferences: ${JSON.stringify(preferences)}` : ''}`;

    try {
      // Call the LLM for strategy formulation
      const messages = this.prepareMessages(systemPrompt, userMessage);
      const response = await this.llm.invoke(messages);

      // Parse the response
      let primaryStrategy: TaskStrategy;
      let alternativeStrategies: TaskStrategy[] = [];
      let estimatedSuccess: number = 0.5;
      let reasoning: string = '';

      try {
        // Try to parse JSON from the response
        const responseText = response.content as string;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const parsedResponse = JSON.parse(jsonMatch[0]);

          primaryStrategy = parsedResponse.primaryStrategy;
          alternativeStrategies = parsedResponse.alternativeStrategies || [];
          estimatedSuccess = parsedResponse.estimatedSuccess || 0.5;
          reasoning = parsedResponse.reasoning || 'No reasoning provided';
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (error) {
        // Fallback if parsing fails
        this.logger.warn('Failed to parse strategy response', { error });

        // Create a default strategy
        primaryStrategy = {
          id: uuidv4(),
          name: `Default strategy for ${capability}`,
          description: `A simple approach to ${taskDescription}`,
          applicabilityScore: 0.5,
          estimatedEffort: 5,
          estimatedSuccess: 0.5,
          steps: [
            'Analyze the task',
            'Execute the capability',
            'Verify results',
          ],
          requiredCapabilities: [capability],
        };

        reasoning = 'Default strategy due to parsing failure';
      }

      // Store the strategy
      this.metacognitiveState.currentStrategy = primaryStrategy;
      this.metacognitiveState.alternativeStrategies = alternativeStrategies;

      // Store as a learned approach if it's a new strategy
      const strategyKey = `${capability}-${primaryStrategy.id}`;
      if (!this.metacognitiveState.learnedApproaches[strategyKey]) {
        this.metacognitiveState.learnedApproaches[strategyKey] = {
          capability,
          pattern: JSON.stringify(primaryStrategy),
          effectiveness: estimatedSuccess,
          usageCount: 0,
        };
      }

      return {
        primaryStrategy,
        alternativeStrategies,
        estimatedSuccess,
        reasoning,
      };
    } catch (error) {
      // If LLM call fails, use default strategy
      this.logger.error('Strategy formulation failed', { error });

      const defaultStrategy: TaskStrategy = {
        id: uuidv4(),
        name: `Default strategy for ${capability}`,
        description: `A simple approach to ${taskDescription}`,
        applicabilityScore: 0.5,
        estimatedEffort: 5,
        estimatedSuccess: 0.5,
        steps: ['Analyze the task', 'Execute the capability', 'Verify results'],
        requiredCapabilities: [capability],
      };

      return {
        primaryStrategy: defaultStrategy,
        estimatedSuccess: 0.5,
        reasoning: 'Default strategy due to LLM failure',
      };
    }
  }

  /**
   * Get the agent's confidence level for a specific capability with calibration
   */
  async getConfidence(
    capability: string,
    taskDescription?: string,
  ): Promise<ConfidenceLevel> {
    // If we have a stored assessment, use that
    if (this.metacognitiveState.capabilityAssessments[capability]) {
      const assessment =
        this.metacognitiveState.capabilityAssessments[capability];

      // Apply additional calibration if the assessment is older than 1 hour
      const oneHour = 60 * 60 * 1000;
      if (assessment.timestamp && Date.now() - assessment.timestamp > oneHour) {
        const calibratedConfidence = this.calibrateConfidence(
          assessment.confidenceScore,
          capability,
          this.name,
        );

        const calibratedConfidenceLevel =
          this.getConfidenceLevelFromScore(calibratedConfidence);

        // Return the calibrated confidence level
        return calibratedConfidenceLevel;
      }

      return assessment.confidence;
    }

    // Otherwise, perform an assessment
    const assessment = await this.assessCapability({
      capability,
      taskDescription,
    });

    return assessment.assessment.confidence;
  }
}
