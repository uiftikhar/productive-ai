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
  TaskDependency,
  DependencyType,
  TaskAnalyzer,
  createTaskDependency,
} from './interfaces/task-analysis.interface';
import { HierarchicalTask } from './interfaces/hierarchical-task.interface';

/**
 * Service configuration
 */
export interface DependencyDetectionConfig {
  logger?: Logger;
  llmModel?: string;
  llmTemperature?: number;
  maxDependenciesToDetect?: number;
}

/**
 * Service for detecting dependencies between tasks
 */
export class DependencyDetectionService
  implements Pick<TaskAnalyzer, 'detectDependencies'>
{
  private static instance: DependencyDetectionService;
  private logger: Logger;
  private llm: ChatOpenAI;
  private maxDependenciesToDetect: number;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: DependencyDetectionConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.maxDependenciesToDetect = config.maxDependenciesToDetect || 10;

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: config.llmModel || LangChainConfig.llm.model,
      temperature: config.llmTemperature || 0.3,
      verbose: false,
    });

    this.logger.info('DependencyDetectionService initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    config: DependencyDetectionConfig = {},
  ): DependencyDetectionService {
    if (!DependencyDetectionService.instance) {
      DependencyDetectionService.instance = new DependencyDetectionService(
        config,
      );
    }
    return DependencyDetectionService.instance;
  }

  /**
   * Detect dependencies between a task and other tasks
   */
  public async detectDependencies(
    taskId: string,
    otherTaskIds: string[],
    context: Record<string, any> = {},
  ): Promise<TaskDependency[]> {
    if (!context.tasks || otherTaskIds.length === 0) {
      this.logger.info(
        `No tasks to analyze for dependencies with task ${taskId}`,
      );
      return [];
    }

    try {
      const mainTask = context.tasks[taskId];

      if (!mainTask) {
        this.logger.warn(`Task ${taskId} not found in context`);
        return [];
      }

      // Filter other tasks to only those in the context
      const otherTasks = otherTaskIds
        .filter((id) => id !== taskId && context.tasks[id])
        .map((id) => context.tasks[id]);

      if (otherTasks.length === 0) {
        this.logger.info(
          `No other tasks found in context for dependency analysis with task ${taskId}`,
        );
        return [];
      }

      // Generate dependencies using LLM
      const dependencies = await this.generateDependencies(
        mainTask,
        otherTasks,
      );

      return dependencies;
    } catch (error) {
      this.logger.error(`Error detecting dependencies for task ${taskId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Batch detect dependencies between all tasks in a set
   */
  public async batchDetectDependencies(
    tasks: Record<string, HierarchicalTask>,
  ): Promise<TaskDependency[]> {
    const allDependencies: TaskDependency[] = [];
    const taskIds = Object.keys(tasks);

    this.logger.info(
      `Batch detecting dependencies among ${taskIds.length} tasks`,
    );

    for (const taskId of taskIds) {
      const otherTaskIds = taskIds.filter((id) => id !== taskId);
      const dependencies = await this.detectDependencies(taskId, otherTaskIds, {
        tasks,
      });
      allDependencies.push(...dependencies);
    }

    return allDependencies;
  }

  /**
   * Generate dependencies between tasks using an LLM
   */
  private async generateDependencies(
    mainTask: any,
    otherTasks: any[],
  ): Promise<TaskDependency[]> {
    const dependencyTypesStr = Object.values(DependencyType)
      .map((type) => `- ${type}: ${this.describeDependencyType(type)}`)
      .join('\n');

    const systemPrompt = `You are an expert task dependency analyzer. Identify dependencies between the main task and other tasks.

Dependency types:
${dependencyTypesStr}

For each dependency you identify, provide:
1. The type of dependency
2. A brief description of why this dependency exists
3. The criticality level (low, medium, high, blocking)

Format your response as JSON:
[
  {
    "sourceTaskId": "ID of the task that must be completed first",
    "targetTaskId": "ID of the task that depends on the source task",
    "type": "SEQUENTIAL",
    "description": "Task X must be completed before Task Y because...",
    "criticality": "high"
  }
]

Only include actual dependencies. If there are no dependencies, return an empty array. Focus on identifying the most important ${this.maxDependenciesToDetect} dependencies.`;

    const tasksString = otherTasks
      .map(
        (task) =>
          `Task ID: ${task.id}\nName: ${task.name}\nDescription: ${task.description}`,
      )
      .join('\n\n');

    const humanMessage = `Main Task:
ID: ${mainTask.id}
Name: ${mainTask.name}
Description: ${mainTask.description}

Other Tasks:
${tasksString}

Identify all dependencies between the main task and the other tasks. Remember to include dependencies in both directions (tasks the main task depends on, and tasks that depend on the main task).`;

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(humanMessage),
    ];

    try {
      const parser = new JsonOutputParser();
      const response = await this.llm.pipe(parser).invoke(messages);

      // Validate and map the response to proper TaskDependency objects
      const dependencies: TaskDependency[] = Array.isArray(response)
        ? response
            .filter(
              (dep) =>
                dep &&
                dep.sourceTaskId &&
                dep.targetTaskId &&
                dep.type &&
                dep.description &&
                dep.criticality,
            )
            .map((dep) =>
              createTaskDependency(
                dep.sourceTaskId,
                dep.targetTaskId,
                this.mapDependencyType(dep.type),
                dep.description,
                this.validateCriticality(dep.criticality),
              ),
            )
        : [];

      return dependencies;
    } catch (error) {
      this.logger.error('Error generating dependencies', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Map a string dependency type to the enum
   */
  private mapDependencyType(type: string): DependencyType {
    type = type.toUpperCase();
    switch (type) {
      case 'SEQUENTIAL':
        return DependencyType.SEQUENTIAL;
      case 'TEMPORAL':
        return DependencyType.TEMPORAL;
      case 'INFORMATIONAL':
        return DependencyType.INFORMATIONAL;
      case 'RESOURCE':
        return DependencyType.RESOURCE;
      case 'ENVIRONMENTAL':
        return DependencyType.ENVIRONMENTAL;
      default:
        return DependencyType.INFORMATIONAL; // Default to informational when unsure
    }
  }

  /**
   * Validate criticality level
   */
  private validateCriticality(
    criticality: string,
  ): 'low' | 'medium' | 'high' | 'blocking' {
    criticality = criticality.toLowerCase();
    switch (criticality) {
      case 'low':
        return 'low';
      case 'medium':
        return 'medium';
      case 'high':
        return 'high';
      case 'blocking':
        return 'blocking';
      default:
        return 'medium'; // Default to medium when unsure
    }
  }

  /**
   * Describe a dependency type
   */
  private describeDependencyType(type: DependencyType): string {
    switch (type) {
      case DependencyType.SEQUENTIAL:
        return 'The target task cannot start until the source task is complete';
      case DependencyType.TEMPORAL:
        return 'Time-based relationship where tasks must occur in a specific chronological order';
      case DependencyType.INFORMATIONAL:
        return 'The target task needs information or output from the source task';
      case DependencyType.RESOURCE:
        return 'Tasks share or compete for the same resources';
      case DependencyType.ENVIRONMENTAL:
        return 'Tasks share external dependencies or environmental constraints';
      default:
        return 'Undefined dependency type';
    }
  }
}
