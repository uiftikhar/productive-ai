import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { JsonOutputParser } from "@langchain/core/output_parsers";

import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { LangChainConfig } from '../../../langchain/config';

import {
  ResourceRequirement,
  ResourceType,
  TaskAnalyzer,
  createResourceRequirement,
} from './interfaces/task-analysis.interface';

/**
 * Service configuration
 */
export interface ResourceEstimationConfig {
  logger?: Logger;
  llmModel?: string;
  llmTemperature?: number;
}

/**
 * Service for estimating resource requirements for tasks
 */
export class ResourceEstimationService implements Pick<TaskAnalyzer, 'estimateResources'> {
  private static instance: ResourceEstimationService;
  private logger: Logger;
  private llm: ChatOpenAI;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: ResourceEstimationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: config.llmModel || LangChainConfig.llm.model,
      temperature: config.llmTemperature || 0.3,
      verbose: false,
    });

    this.logger.info('ResourceEstimationService initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(config: ResourceEstimationConfig = {}): ResourceEstimationService {
    if (!ResourceEstimationService.instance) {
      ResourceEstimationService.instance = new ResourceEstimationService(config);
    }
    return ResourceEstimationService.instance;
  }

  /**
   * Estimate resource requirements for a task
   */
  public async estimateResources(
    taskId: string,
    description: string,
    context: Record<string, any> = {},
  ): Promise<ResourceRequirement[]> {
    this.logger.info(`Estimating resources for task: ${taskId}`);

    try {
      // Generate resource requirements using LLM
      const resourceRequirements = await this.generateResourceRequirements(description, context);
      
      return resourceRequirements;
    } catch (error) {
      this.logger.error(`Error estimating resources for task ${taskId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Return basic resource requirements as fallback
      return this.generateFallbackResourceRequirements();
    }
  }

  /**
   * Generate resource requirements using an LLM
   */
  private async generateResourceRequirements(
    description: string,
    context: Record<string, any> = {},
  ): Promise<ResourceRequirement[]> {
    const resourceTypesStr = Object.values(ResourceType)
      .map(type => `- ${type}: ${this.describeResourceType(type)}`)
      .join('\n');

    const systemPrompt = `You are an expert task resource analyzer. Analyze the provided task description and estimate its resource requirements.

Resource types:
${resourceTypesStr}

For each resource requirement you identify, provide:
1. The resource type
2. A quantity (from 0-100)
3. A brief description of why this resource is needed
4. Whether this resource is required (true) or optional (false)
5. Alternative resources that could substitute (if any)

Format your response as JSON:
[
  {
    "resourceType": "COMPUTATION",
    "quantity": 70,
    "description": "Requires significant computational resources for...",
    "isRequired": true,
    "alternatives": ["MEMORY", "API_ACCESS"]
  }
]

Focus on the most important resource requirements. Only include resources that are actually needed for the task.`;

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
      const parser = new JsonOutputParser();
      const response = await this.llm.pipe(parser).invoke(messages);

      // Validate and map the response to proper ResourceRequirement objects
      const resourceRequirements: ResourceRequirement[] = Array.isArray(response)
        ? response
            .filter(req => 
              req &&
              req.resourceType && 
              req.quantity !== undefined &&
              req.description)
            .map(req => createResourceRequirement(
              this.mapResourceType(req.resourceType),
              req.quantity,
              req.description,
              req.isRequired !== undefined ? req.isRequired : true
            ))
        : [];

      return resourceRequirements;
    } catch (error) {
      this.logger.error('Error generating resource requirements', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate fallback resource requirements when the LLM fails
   */
  private generateFallbackResourceRequirements(): ResourceRequirement[] {
    return [
      createResourceRequirement(
        ResourceType.COMPUTATION,
        50,
        'Default computation requirement estimation',
        true
      ),
      createResourceRequirement(
        ResourceType.MEMORY,
        50,
        'Default memory requirement estimation',
        true
      ),
      createResourceRequirement(
        ResourceType.TIME,
        50,
        'Default time requirement estimation',
        true
      ),
    ];
  }

  /**
   * Map a string resource type to the enum
   */
  private mapResourceType(type: string): ResourceType {
    type = type.toUpperCase();
    switch (type) {
      case 'COMPUTATION':
        return ResourceType.COMPUTATION;
      case 'MEMORY':
        return ResourceType.MEMORY;
      case 'TIME':
        return ResourceType.TIME;
      case 'KNOWLEDGE':
        return ResourceType.KNOWLEDGE;
      case 'TOKENS':
        return ResourceType.TOKENS;
      case 'TOOL_ACCESS':
        return ResourceType.TOOL_ACCESS;
      case 'API_ACCESS':
        return ResourceType.API_ACCESS;
      case 'DATA_ACCESS':
        return ResourceType.DATA_ACCESS;
      case 'COORDINATION':
        return ResourceType.COORDINATION;
      default:
        // Try partial matching if exact match fails
        if (type.includes('COMPUTATION')) return ResourceType.COMPUTATION;
        if (type.includes('MEMORY')) return ResourceType.MEMORY;
        if (type.includes('TIME')) return ResourceType.TIME;
        if (type.includes('KNOWLEDGE')) return ResourceType.KNOWLEDGE;
        if (type.includes('TOKEN')) return ResourceType.TOKENS;
        if (type.includes('TOOL')) return ResourceType.TOOL_ACCESS;
        if (type.includes('API')) return ResourceType.API_ACCESS;
        if (type.includes('DATA')) return ResourceType.DATA_ACCESS;
        if (type.includes('COORDINATION')) return ResourceType.COORDINATION;
        
        return ResourceType.TIME; // Default to time when unsure
    }
  }

  /**
   * Describe a resource type
   */
  private describeResourceType(type: ResourceType): string {
    switch (type) {
      case ResourceType.COMPUTATION:
        return 'Processing power needed for the task';
      case ResourceType.MEMORY:
        return 'Working memory or storage requirements';
      case ResourceType.TIME:
        return 'Time required to complete the task';
      case ResourceType.KNOWLEDGE:
        return 'Specific knowledge or expertise required';
      case ResourceType.TOKENS:
        return 'LLM token consumption';
      case ResourceType.TOOL_ACCESS:
        return 'Access to specific tools or utilities';
      case ResourceType.API_ACCESS:
        return 'Access to external APIs or services';
      case ResourceType.DATA_ACCESS:
        return 'Access to specific data sources';
      case ResourceType.COORDINATION:
        return 'Coordination requirements with other agents';
      default:
        return 'Undefined resource type';
    }
  }
} 