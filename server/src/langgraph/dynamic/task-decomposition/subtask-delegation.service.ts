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
  SubtaskAssignment,
  HierarchicalTask,
  TaskHierarchyManager,
  TaskPriority,
  ParentChildRelationship,
} from './interfaces/hierarchical-task.interface';

/**
 * Agent capability representation
 */
export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  confidenceScore: number; // 0-1
}

/**
 * Agent representation for matching
 */
export interface AgentForMatching {
  id: string;
  name: string;
  capabilities: AgentCapability[];
  currentLoad?: number; // Number of tasks currently assigned
  successRate?: number; // 0-1 success rate on similar tasks
  availability?: number; // 0-1 availability score
}

/**
 * Service configuration
 */
export interface SubtaskDelegationConfig {
  logger?: Logger;
  llmModel?: string;
  llmTemperature?: number;
  taskHierarchyManager?: TaskHierarchyManager;
  maxAgentsToAssign?: number;
}

/**
 * Service for delegating subtasks to appropriate agents
 */
export class SubtaskDelegationService {
  private static instance: SubtaskDelegationService;
  private logger: Logger;
  private llm: ChatOpenAI;
  private taskHierarchyManager: TaskHierarchyManager | null;
  private maxAgentsToAssign: number;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: SubtaskDelegationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.taskHierarchyManager = config.taskHierarchyManager || null;
    this.maxAgentsToAssign = config.maxAgentsToAssign || 10;

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: config.llmModel || LangChainConfig.llm.model,
      temperature: config.llmTemperature || 0.2,
      verbose: false,
    });

    this.logger.info('SubtaskDelegationService initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    config: SubtaskDelegationConfig = {},
  ): SubtaskDelegationService {
    if (!SubtaskDelegationService.instance) {
      SubtaskDelegationService.instance = new SubtaskDelegationService(config);
    }
    return SubtaskDelegationService.instance;
  }

  /**
   * Delegate subtasks to agents
   */
  public async delegateSubtasks(
    parentTaskId: string,
    subtaskIds: string[] = [],
    availableAgents: AgentForMatching[],
    options: {
      autoExecute?: boolean;
      context?: Record<string, any>;
      hierarchyManager?: TaskHierarchyManager;
    } = {},
  ): Promise<SubtaskAssignment[]> {
    this.logger.info(`Delegating subtasks for parent task: ${parentTaskId}`);

    const hierarchyManager =
      options.hierarchyManager || this.taskHierarchyManager;
    if (!hierarchyManager) {
      throw new Error('No task hierarchy manager available for delegation');
    }

    try {
      // Get the parent task
      const parentTask = await hierarchyManager.getTask(parentTaskId);
      if (!parentTask) {
        throw new Error(`Parent task not found: ${parentTaskId}`);
      }

      // If no specific subtasks provided, use all child tasks
      let childTaskIds =
        subtaskIds.length > 0 ? subtaskIds : parentTask.childTaskIds;

      // Filter to only include actual child tasks
      childTaskIds = childTaskIds.filter((id) =>
        parentTask.childTaskIds.includes(id),
      );

      if (childTaskIds.length === 0) {
        this.logger.info(`No subtasks found for parent task: ${parentTaskId}`);
        return [];
      }

      // Get all child tasks
      const childTasks: HierarchicalTask[] = [];
      for (const childId of childTaskIds) {
        const childTask = await hierarchyManager.getTask(childId);
        if (childTask) {
          childTasks.push(childTask);
        }
      }

      if (childTasks.length === 0) {
        this.logger.info(
          `No valid subtasks found for parent task: ${parentTaskId}`,
        );
        return [];
      }

      // Generate agent assignments using LLM
      const assignments = await this.generateAgentAssignments(
        parentTask,
        childTasks,
        availableAgents,
        options.context || {},
      );

      // Apply the assignments
      const subtaskAssignments: SubtaskAssignment[] = [];

      for (const assignment of assignments) {
        try {
          const childTask = childTasks.find(
            (task) => task.id === assignment.childTaskId,
          );
          if (!childTask) continue;

          // Update the task with agent assignment
          await hierarchyManager.assignTask(
            assignment.childTaskId,
            assignment.agentId,
          );

          // Create the assignment record
          const subtaskAssignment: SubtaskAssignment = {
            id: uuidv4(),
            parentTaskId,
            childTaskId: assignment.childTaskId,
            assignedAgentId: assignment.agentId,
            relationshipType: ParentChildRelationship.DECOMPOSITION, // Default
            assignedAt: Date.now(),
            status: 'pending',
            priority: childTask.priority,
            metadata: {
              matchingScore: assignment.matchingScore,
              reasoning: assignment.reasoning,
            },
          };

          subtaskAssignments.push(subtaskAssignment);
        } catch (error) {
          this.logger.error(
            `Error applying assignment for subtask ${assignment.childTaskId}`,
            {
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }
      }

      // Execute the tasks if requested
      if (options.autoExecute && subtaskAssignments.length > 0) {
        this.logger.info(
          `Auto-executing ${subtaskAssignments.length} delegated subtasks`,
        );
        // This would call the task execution service, not implemented here
      }

      return subtaskAssignments;
    } catch (error) {
      this.logger.error(
        `Error delegating subtasks for parent task ${parentTaskId}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }
  }

  /**
   * Match an agent with a task based on capabilities
   */
  public async matchAgentForTask(
    task: HierarchicalTask,
    availableAgents: AgentForMatching[],
    context: Record<string, any> = {},
  ): Promise<{
    agentId: string;
    matchingScore: number;
    reasoning: string;
  } | null> {
    if (availableAgents.length === 0) {
      return null;
    }

    try {
      // Use the first agent as a default if there's only one
      if (availableAgents.length === 1) {
        return {
          agentId: availableAgents[0].id,
          matchingScore: 0.5, // Medium confidence by default
          reasoning: 'Only one agent available',
        };
      }

      // Generate the match using the LLM
      const matches = await this.generateAgentAssignments(
        { name: 'Parent', description: 'Parent task' } as HierarchicalTask,
        [task],
        availableAgents,
        context,
      );

      if (matches.length > 0) {
        return matches[0];
      }

      return null;
    } catch (error) {
      this.logger.error(`Error matching agent for task ${task.id}`, {
        error: error instanceof Error ? error.message : String(error),
      });

      // Default to the first agent if error occurs
      if (availableAgents.length > 0) {
        return {
          agentId: availableAgents[0].id,
          matchingScore: 0.3, // Low confidence
          reasoning: 'Default assignment due to matching error',
        };
      }

      return null;
    }
  }

  /**
   * Generate agent assignments using an LLM
   */
  private async generateAgentAssignments(
    parentTask: HierarchicalTask,
    childTasks: HierarchicalTask[],
    availableAgents: AgentForMatching[],
    context: Record<string, any> = {},
  ): Promise<
    Array<{
      childTaskId: string;
      agentId: string;
      matchingScore: number; // 0-1 match confidence
      reasoning: string;
    }>
  > {
    const systemPrompt = `You are an expert task delegation system. Assign the most appropriate agent to each subtask based on agent capabilities and task requirements.

For each task assignment, provide:
1. The subtask ID
2. The most appropriate agent ID
3. A matching score (0-1) indicating how well the agent's capabilities match the task requirements
4. Brief reasoning for why this agent is the best match

Format your response as JSON:
[
  {
    "childTaskId": "task123",
    "agentId": "agent456",
    "matchingScore": 0.85,
    "reasoning": "Agent has strong capabilities in data analysis which is the primary requirement for this task"
  }
]

Optimize for the best overall task-agent fit. Consider:
- Agent capabilities matching task requirements
- Agent current workload and availability
- Task priority and complexity
- Prior agent performance on similar tasks`;

    // Format task information
    const tasksInfo = childTasks
      .map(
        (task) =>
          `Task ID: ${task.id}
Name: ${task.name}
Description: ${task.description}
Priority: ${task.priority}
Complexity: ${task.complexity}
Required Capabilities: ${task.resourceRequirements.map((r) => r.resourceType).join(', ') || 'Not specified'}`,
      )
      .join('\n\n');

    // Format agent information
    const agentsInfo = availableAgents
      .map(
        (agent) =>
          `Agent ID: ${agent.id}
Name: ${agent.name}
Capabilities: ${agent.capabilities.map((c) => `${c.name} (${c.confidenceScore.toFixed(2)})`).join(', ')}
Current Load: ${agent.currentLoad !== undefined ? agent.currentLoad : 'Unknown'}
Success Rate: ${agent.successRate !== undefined ? (agent.successRate * 100).toFixed(1) + '%' : 'Unknown'}
Availability: ${agent.availability !== undefined ? (agent.availability * 100).toFixed(1) + '%' : 'Unknown'}`,
      )
      .join('\n\n');

    // Format context if available
    let contextInfo = '';
    if (Object.keys(context).length > 0) {
      contextInfo =
        '\n\nAdditional Context:\n' +
        Object.entries(context)
          .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
          .join('\n');
    }

    const humanMessage = `Parent Task: ${parentTask.name}
Description: ${parentTask.description}

Available Agents:
${agentsInfo}

Subtasks:
${tasksInfo}${contextInfo}

Please assign the most appropriate agent to each subtask. Focus on matching agent capabilities to task requirements.`;

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(humanMessage),
    ];

    try {
      const parser = new JsonOutputParser();
      const response = await this.llm.pipe(parser).invoke(messages);

      // Validate assignments
      const assignments = Array.isArray(response)
        ? response
            .filter(
              (assignment) =>
                assignment &&
                assignment.childTaskId &&
                assignment.agentId &&
                typeof assignment.matchingScore === 'number' &&
                assignment.reasoning &&
                // Check if the assigned agent and task exist
                availableAgents.some((a) => a.id === assignment.agentId) &&
                childTasks.some((t) => t.id === assignment.childTaskId),
            )
            // Ensure matching score is between 0 and 1
            .map((assignment) => ({
              ...assignment,
              matchingScore: Math.min(Math.max(assignment.matchingScore, 0), 1),
            }))
            // Sort by matching score (highest first)
            .sort((a, b) => b.matchingScore - a.matchingScore)
            // Limit assignments to maxAgentsToAssign
            .slice(0, this.maxAgentsToAssign)
        : [];

      return assignments;
    } catch (error) {
      this.logger.error('Error generating agent assignments', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get assignment status for a subtask
   */
  public async getAssignmentStatus(
    childTaskId: string,
    options: {
      hierarchyManager?: TaskHierarchyManager;
    } = {},
  ): Promise<SubtaskAssignment | null> {
    const hierarchyManager =
      options.hierarchyManager || this.taskHierarchyManager;
    if (!hierarchyManager) {
      throw new Error('No task hierarchy manager available');
    }

    try {
      // Get the child task
      const childTask = await hierarchyManager.getTask(childTaskId);
      if (!childTask || !childTask.parentTaskId) {
        return null;
      }

      // Get all assignments for the parent task
      const parentTaskId = childTask.parentTaskId;
      const assignments = await hierarchyManager.delegateSubtasks(
        parentTaskId,
        [{ childTaskId, agentId: childTask.assignedAgentId || '' }],
      );

      // Find the assignment for this child task
      return assignments.find((a) => a.childTaskId === childTaskId) || null;
    } catch (error) {
      this.logger.error(
        `Error getting assignment status for task ${childTaskId}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return null;
    }
  }
}
