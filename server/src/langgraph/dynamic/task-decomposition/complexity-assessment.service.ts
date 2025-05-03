import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { LangChainConfig } from '../../../langchain/config';

import {
  ComplexityAssessment,
  ComplexityFactor,
  ComplexityLevel,
  TaskAnalyzer,
  createComplexityAssessment,
} from './interfaces/task-analysis.interface';

/**
 * Service configuration
 */
export interface ComplexityAssessmentConfig {
  logger?: Logger;
  llmModel?: string;
  llmTemperature?: number;
  confidenceThreshold?: number;
  complexityFactors?: string[];
}

/**
 * Service for assessing task complexity and determining if decomposition is needed
 */
export class ComplexityAssessmentService implements Pick<TaskAnalyzer, 'assessComplexity'> {
  private static instance: ComplexityAssessmentService;
  private logger: Logger;
  private llm: ChatOpenAI;
  private confidenceThreshold: number;
  private complexityFactors: string[];

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: ComplexityAssessmentConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.confidenceThreshold = config.confidenceThreshold || 0.7;
    
    // Complexity factors to consider in assessment
    this.complexityFactors = config.complexityFactors || [
      'Cognitive complexity',
      'Domain knowledge required',
      'Number of steps or subtasks',
      'Interactions with external systems',
      'Ambiguity level',
      'Time pressure',
      'Risk factors',
      'Dependencies on other tasks',
      'Novel vs. routine nature',
      'Tool or resource requirements',
    ];

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: config.llmModel || LangChainConfig.llm.model,
      temperature: config.llmTemperature || 0.2,
      verbose: false,
    });

    this.logger.info('ComplexityAssessmentService initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(config: ComplexityAssessmentConfig = {}): ComplexityAssessmentService {
    if (!ComplexityAssessmentService.instance) {
      ComplexityAssessmentService.instance = new ComplexityAssessmentService(config);
    }
    return ComplexityAssessmentService.instance;
  }

  /**
   * Assess the complexity of a task
   */
  public async assessComplexity(
    taskId: string,
    description: string,
    context: Record<string, any> = {},
  ): Promise<ComplexityAssessment> {
    this.logger.info(`Assessing complexity for task: ${taskId}`);

    try {
      // Generate assessment using LLM
      const assessmentResult = await this.generateComplexityAssessment(description, context);

      // Create the complexity assessment
      const complexityAssessment = createComplexityAssessment(
        taskId,
        assessmentResult.overallComplexity,
        assessmentResult.factors,
        assessmentResult.confidenceScore,
      );

      return complexityAssessment;
    } catch (error) {
      this.logger.error(`Error assessing complexity for task ${taskId}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      // Provide a fallback assessment
      return createComplexityAssessment(
        taskId,
        ComplexityLevel.MODERATE, // Default to moderate when unsure
        [
          {
            id: uuidv4(),
            name: 'Fallback assessment',
            description: 'Assessment generated as fallback due to error',
            weight: 1,
            score: 50,
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
        ],
        0.5, // Low confidence in fallback
      );
    }
  }

  /**
   * Generate a complexity assessment using an LLM
   */
  private async generateComplexityAssessment(
    description: string,
    context: Record<string, any> = {},
  ): Promise<{
    overallComplexity: ComplexityLevel;
    factors: ComplexityFactor[];
    confidenceScore: number;
  }> {
    const factorsString = this.complexityFactors.map(f => `- ${f}`).join('\n');
    
    const systemPrompt = `You are an expert task complexity analyzer. Analyze the provided task description and assess its complexity.
Consider the following complexity factors:
${factorsString}

Rate the overall complexity as one of:
- TRIVIAL: Simple, straightforward tasks requiring minimal effort and expertise
- SIMPLE: Well-defined tasks with clear steps and minimal challenges
- MODERATE: Tasks with some complexity requiring careful attention
- COMPLEX: Challenging tasks with multiple considerations and potential complications
- VERY_COMPLEX: Highly complex tasks requiring significant expertise, planning, and resources

For each factor, provide:
1. A score (0-100)
2. A brief justification

Then provide an overall complexity level, recommended decomposition (yes/no), and your confidence score (0-1).

Format your response as valid JSON:
{
  "overallComplexity": "MODERATE",
  "factors": [
    {
      "name": "Factor name",
      "description": "Justification for the score",
      "weight": 0.8,
      "score": 65
    }
  ],
  "recommendedDecomposition": true,
  "recommendedAgentCount": 2,
  "confidenceScore": 0.85
}`;

    // Add context to the human message if available
    let contextInfo = '';
    if (Object.keys(context).length > 0) {
      contextInfo = '\n\nAdditional context:\n' + 
        Object.entries(context)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join('\n');
    }

    const humanMessage = `Task description: ${description}${contextInfo}`;

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(humanMessage),
    ];

    try {
      const response = await this.llm.call(messages);
      const responseContent = response.content.toString();
      
      // Extract JSON from response
      const jsonMatch = responseContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                       responseContent.match(/{[\s\S]*}/);
      
      let jsonContent = '';
      if (jsonMatch && jsonMatch[1]) {
        jsonContent = jsonMatch[1];
      } else if (jsonMatch) {
        jsonContent = jsonMatch[0];
      } else {
        jsonContent = responseContent;
      }

      // Parse the JSON
      const parsedResponse = JSON.parse(jsonContent);

      // Map the response to our expected format
      const factors: ComplexityFactor[] = parsedResponse.factors.map((factor: any) => ({
        id: uuidv4(),
        name: factor.name,
        description: factor.description,
        weight: factor.weight ?? 1.0,
        score: factor.score,
        metadata: {},
      }));

      // Map the complexity level
      const overallComplexity = this.mapComplexityLevel(parsedResponse.overallComplexity);

      return {
        overallComplexity,
        factors,
        confidenceScore: parsedResponse.confidenceScore || 0.7,
      };
    } catch (error) {
      this.logger.error('Error generating complexity assessment', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Map a string complexity level to the enum
   */
  private mapComplexityLevel(level: string): ComplexityLevel {
    level = level.toUpperCase();
    switch (level) {
      case 'TRIVIAL':
        return ComplexityLevel.TRIVIAL;
      case 'SIMPLE':
        return ComplexityLevel.SIMPLE;
      case 'MODERATE':
        return ComplexityLevel.MODERATE;
      case 'COMPLEX':
        return ComplexityLevel.COMPLEX;
      case 'VERY_COMPLEX':
      case 'VERY COMPLEX':
        return ComplexityLevel.VERY_COMPLEX;
      default:
        return ComplexityLevel.MODERATE; // Default to moderate when unsure
    }
  }
} 