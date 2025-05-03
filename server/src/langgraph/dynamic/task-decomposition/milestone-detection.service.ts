import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { JsonOutputParser } from '@langchain/core/output_parsers';

import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { LangChainConfig } from '../../../langchain/config';

import {
  TaskMilestone,
  MilestoneType,
  HierarchicalTask,
  createTaskMilestone,
} from './interfaces/hierarchical-task.interface';

/**
 * Service configuration
 */
export interface MilestoneDetectionConfig {
  logger?: Logger;
  llmModel?: string;
  llmTemperature?: number;
  defaultMilestoneCount?: number;
}

/**
 * Service for detecting and suggesting milestones for tasks
 */
export class MilestoneDetectionService {
  private static instance: MilestoneDetectionService;
  private logger: Logger;
  private llm: ChatOpenAI;
  private defaultMilestoneCount: number;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: MilestoneDetectionConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.defaultMilestoneCount = config.defaultMilestoneCount || 5;

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: config.llmModel || LangChainConfig.llm.model,
      temperature: config.llmTemperature || 0.3,
      verbose: false,
    });

    this.logger.info('MilestoneDetectionService initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    config: MilestoneDetectionConfig = {},
  ): MilestoneDetectionService {
    if (!MilestoneDetectionService.instance) {
      MilestoneDetectionService.instance = new MilestoneDetectionService(
        config,
      );
    }
    return MilestoneDetectionService.instance;
  }

  /**
   * Detect appropriate milestones for a task
   */
  public async detectMilestones(
    task: HierarchicalTask,
    options: {
      preferredCount?: number;
      includeSubtasks?: boolean;
      context?: Record<string, any>;
    } = {},
  ): Promise<TaskMilestone[]> {
    this.logger.info(
      `Detecting milestones for task: ${task.id} - ${task.name}`,
    );

    const milestoneCount = options.preferredCount || this.defaultMilestoneCount;
    let childTasksInfo = '';

    if (
      options.includeSubtasks &&
      task.childTaskIds.length > 0 &&
      options.context?.tasks
    ) {
      // Include information about subtasks if available
      const childTasks = task.childTaskIds
        .map((id) => options.context?.tasks[id])
        .filter(Boolean);

      if (childTasks.length > 0) {
        childTasksInfo =
          `\n\nThis task has ${childTasks.length} subtasks:\n` +
          childTasks
            .map(
              (childTask, index) =>
                `${index + 1}. ${childTask.name}: ${childTask.description}`,
            )
            .join('\n');
      }
    }

    try {
      // Generate milestones using LLM
      const suggestedMilestones = await this.generateMilestones(
        task.name,
        task.description,
        childTasksInfo,
        milestoneCount,
      );

      // Convert to TaskMilestone objects
      const milestones = suggestedMilestones.map((suggestion) => ({
        id: uuidv4(),
        taskId: task.id,
        name: suggestion.name,
        description: suggestion.description,
        type: this.mapMilestoneType(suggestion.type),
        criteria: suggestion.criteria,
        status: 'pending' as const,
        progress: 0,
        metadata: {},
      }));

      return milestones;
    } catch (error) {
      this.logger.error(`Error detecting milestones for task ${task.id}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return default milestones as fallback
      return this.generateDefaultMilestones(task.id, task.name);
    }
  }

  /**
   * Generate milestones for a task using an LLM
   */
  private async generateMilestones(
    taskName: string,
    taskDescription: string,
    childTasksInfo: string = '',
    milestoneCount: number = 5,
  ): Promise<
    Array<{
      name: string;
      description: string;
      type: string;
      criteria: string;
      sequence: number;
    }>
  > {
    const milestoneTypesStr = Object.values(MilestoneType)
      .map((type) => `- ${type}: ${this.describeMilestoneType(type)}`)
      .join('\n');

    const systemPrompt = `You are an expert task planning assistant. Based on the provided task description, suggest appropriate milestones that mark significant points in the task's execution.

Milestone types:
${milestoneTypesStr}

For each milestone you suggest, provide:
1. A concise name
2. A brief description
3. The milestone type
4. Clear criteria for determining when the milestone is achieved
5. A sequence number (starting from 1) indicating the order in which the milestones should be achieved

Format your response as JSON:
[
  {
    "name": "Initial Research Complete",
    "description": "All background research and information gathering is complete",
    "type": "CHECKPOINT",
    "criteria": "All necessary information has been collected and documented",
    "sequence": 1
  }
]

Suggest exactly ${milestoneCount} milestones that cover the entire task execution process. Include at least one START milestone and one COMPLETION milestone.
The milestones should be logically ordered and help track meaningful progress.`;

    const humanMessage = `Task Name: ${taskName}
Task Description: ${taskDescription}${childTasksInfo}

Please suggest ${milestoneCount} appropriate milestones for this task.`;

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(humanMessage),
    ];

    try {
      const parser = new JsonOutputParser();
      const response = await this.llm.pipe(parser).invoke(messages);

      // Validate and sort by sequence
      const milestones = Array.isArray(response)
        ? response
            .filter(
              (m) =>
                m &&
                m.name &&
                m.description &&
                m.type &&
                m.criteria &&
                m.sequence !== undefined,
            )
            .sort((a, b) => a.sequence - b.sequence)
        : [];

      return milestones;
    } catch (error) {
      this.logger.error('Error generating milestones', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate default milestones when the LLM fails
   */
  private generateDefaultMilestones(
    taskId: string,
    taskName: string,
  ): TaskMilestone[] {
    return [
      {
        id: uuidv4(),
        taskId,
        name: 'Task Started',
        description: `${taskName} has been initiated`,
        type: MilestoneType.START,
        criteria: 'Task has been assigned and work has begun',
        status: 'pending',
        progress: 0,
        metadata: {},
      },
      {
        id: uuidv4(),
        taskId,
        name: '25% Complete',
        description: 'Initial progress made on the task',
        type: MilestoneType.CHECKPOINT,
        criteria: 'The task is 25% complete',
        status: 'pending',
        progress: 0,
        metadata: {},
      },
      {
        id: uuidv4(),
        taskId,
        name: '50% Complete',
        description: 'Halfway point reached',
        type: MilestoneType.CHECKPOINT,
        criteria: 'The task is 50% complete',
        status: 'pending',
        progress: 0,
        metadata: {},
      },
      {
        id: uuidv4(),
        taskId,
        name: '75% Complete',
        description: 'Substantial progress made',
        type: MilestoneType.CHECKPOINT,
        criteria: 'The task is 75% complete',
        status: 'pending',
        progress: 0,
        metadata: {},
      },
      {
        id: uuidv4(),
        taskId,
        name: 'Task Completed',
        description: `${taskName} has been completed`,
        type: MilestoneType.COMPLETION,
        criteria: 'All requirements have been met and the task is finished',
        status: 'pending',
        progress: 0,
        metadata: {},
      },
    ];
  }

  /**
   * Check if a milestone has been reached based on its criteria and task state
   */
  public async checkMilestoneStatus(
    milestone: TaskMilestone,
    task: HierarchicalTask,
    context: Record<string, any> = {},
  ): Promise<{
    isAchieved: boolean;
    confidence: number;
    reasoning: string;
  }> {
    // Simple heuristics for common milestone types
    if (
      milestone.type === MilestoneType.START &&
      task.status !== 'draft' &&
      task.status !== 'planned'
    ) {
      return {
        isAchieved: true,
        confidence: 0.9,
        reasoning: 'Task has started execution',
      };
    }

    if (
      milestone.type === MilestoneType.COMPLETION &&
      task.status === 'completed'
    ) {
      return {
        isAchieved: true,
        confidence: 1.0,
        reasoning: 'Task is marked as completed',
      };
    }

    // Check progress-based milestones
    if (milestone.type === MilestoneType.CHECKPOINT) {
      const milestoneName = milestone.name.toLowerCase();

      // Parse percentage from name if present
      const percentageMatch = milestoneName.match(/(\d+)%/);
      if (percentageMatch) {
        const targetPercentage = parseInt(percentageMatch[1], 10);
        if (!isNaN(targetPercentage) && task.progress >= targetPercentage) {
          return {
            isAchieved: true,
            confidence: 0.8,
            reasoning: `Task progress (${task.progress}%) exceeds the milestone target (${targetPercentage}%)`,
          };
        }
      }
    }

    // For other cases, use LLM to evaluate if the criteria is met
    return this.evaluateMilestone(milestone, task, context);
  }

  /**
   * Evaluate if a milestone has been achieved using an LLM
   */
  private async evaluateMilestone(
    milestone: TaskMilestone,
    task: HierarchicalTask,
    context: Record<string, any> = {},
  ): Promise<{
    isAchieved: boolean;
    confidence: number;
    reasoning: string;
  }> {
    const systemPrompt = `You are an expert task assessor. Evaluate whether a milestone has been achieved based on the milestone criteria and the current task state.

Your evaluation should be logical and based on the evidence provided.

Format your response as JSON:
{
  "isAchieved": false,
  "confidence": 0.7,
  "reasoning": "Detailed reasoning for your assessment"
}

The confidence should be a number between 0 and 1, representing how sure you are about your assessment.`;

    // Format task state and context
    const taskStateStr = `Task State:
- Name: ${task.name}
- Description: ${task.description}
- Status: ${task.status}
- Progress: ${task.progress}%
- Started At: ${task.startedAt ? new Date(task.startedAt).toISOString() : 'N/A'}
- Completed At: ${task.completedAt ? new Date(task.completedAt).toISOString() : 'N/A'}
`;

    // Format context
    let contextStr = '';
    if (Object.keys(context).length > 0) {
      contextStr =
        '\nAdditional Context:\n' +
        Object.entries(context)
          .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
          .join('\n');
    }

    const humanMessage = `Milestone:
- Name: ${milestone.name}
- Description: ${milestone.description}
- Type: ${milestone.type}
- Criteria for Achievement: ${milestone.criteria}

${taskStateStr}${contextStr}

Has this milestone been achieved? Explain your reasoning.`;

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(humanMessage),
    ];

    try {
      const parser = new JsonOutputParser();
      const response = await this.llm.pipe(parser).invoke(messages);

      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response format');
      }

      return {
        isAchieved: !!response.isAchieved,
        confidence:
          typeof response.confidence === 'number' ? response.confidence : 0.5,
        reasoning:
          typeof response.reasoning === 'string'
            ? response.reasoning
            : 'No reasoning provided',
      };
    } catch (error) {
      this.logger.error('Error evaluating milestone', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Default to not achieved with low confidence when evaluation fails
      return {
        isAchieved: false,
        confidence: 0.3,
        reasoning:
          'Failed to evaluate milestone: ' +
          (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  /**
   * Map a string milestone type to the enum
   */
  private mapMilestoneType(type: string): MilestoneType {
    type = type.toUpperCase();
    switch (type) {
      case 'START':
        return MilestoneType.START;
      case 'CHECKPOINT':
        return MilestoneType.CHECKPOINT;
      case 'DELIVERABLE':
        return MilestoneType.DELIVERABLE;
      case 'INTEGRATION_POINT':
      case 'INTEGRATION POINT':
        return MilestoneType.INTEGRATION_POINT;
      case 'COMPLETION':
        return MilestoneType.COMPLETION;
      default:
        return MilestoneType.CHECKPOINT; // Default to checkpoint when unsure
    }
  }

  /**
   * Describe a milestone type
   */
  private describeMilestoneType(type: MilestoneType): string {
    switch (type) {
      case MilestoneType.START:
        return 'Marks the beginning of the task';
      case MilestoneType.CHECKPOINT:
        return 'Indicates a significant point of progress';
      case MilestoneType.DELIVERABLE:
        return 'Represents a tangible output or deliverable';
      case MilestoneType.INTEGRATION_POINT:
        return 'Marks a point where integration with other tasks occurs';
      case MilestoneType.COMPLETION:
        return 'Indicates the successful completion of the task';
      default:
        return 'Undefined milestone type';
    }
  }
}
