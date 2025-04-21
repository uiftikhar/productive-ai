import {
  SupervisorAgent,
  Task,
} from '../../../agents/specialized/supervisor-agent';
import { SupervisorWorkflow } from '../workflows/supervisor-workflow';
import {
  AgentRequest,
  AgentResponse,
} from '../../../agents/interfaces/base-agent.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { v4 as uuidv4 } from 'uuid';
import { UserContextFacade } from '../../../shared/services/user-context/user-context.facade';

/**
 * Configuration for SupervisorAdapter
 */
export interface SupervisorAdapterConfig {
  logger?: Logger;
  tracingEnabled?: boolean;
  maxRecoveryAttempts?: number;
  includeStateInLogs?: boolean;
  userContext?: UserContextFacade;
  workflowId?: string;
  retryDelayMs?: number;
  errorHandlingLevel?: 'basic' | 'advanced';
}

/**
 * SupervisorAdapter
 *
 * Adapter to connect SupervisorAgent with LangGraph workflows
 * Provides a simplified interface for using the SupervisorWorkflow
 */
export class SupervisorAdapter {
  private workflow: SupervisorWorkflow;
  private logger: Logger;
  private maxRecoveryAttempts: number;
  private retryDelayMs: number;
  private errorHandlingLevel: 'basic' | 'advanced';
  private userContext?: UserContextFacade;

  /**
   * Create a new supervisor adapter
   * @param agent SupervisorAgent instance
   * @param config Configuration options
   */
  constructor(
    private readonly agent: SupervisorAgent,
    config: SupervisorAdapterConfig = {},
  ) {
    this.logger = config.logger || new ConsoleLogger();
    this.maxRecoveryAttempts = config.maxRecoveryAttempts || 3;
    this.retryDelayMs = config.retryDelayMs || 1000;
    this.errorHandlingLevel = config.errorHandlingLevel || 'advanced';
    this.userContext = config.userContext;

    // Initialize the workflow
    this.workflow = new SupervisorWorkflow(agent, {
      tracingEnabled: config.tracingEnabled,
      includeStateInLogs: config.includeStateInLogs,
      logger: this.logger,
      userContext: this.userContext,
      id: config.workflowId || `supervisor-workflow-${uuidv4()}`,
    });

    this.logger.info(`Initialized SupervisorAdapter for agent: ${agent.id}`, {
      workflowId: this.workflow.id,
      tracingEnabled: config.tracingEnabled,
      errorHandlingLevel: this.errorHandlingLevel,
    });
  }

  /**
   * Execute a task through the supervisor workflow
   * @param input Input for the supervisor
   * @param options Execution options
   */
  async execute(
    input: string,
    options: {
      capability?: string;
      parameters?: Record<string, any>;
      context?: Record<string, any>;
      userId?: string;
      conversationId?: string;
    } = {},
  ): Promise<AgentResponse> {
    try {
      this.logger.info(
        `Executing through SupervisorAdapter: ${input.substring(0, 100)}...`,
      );

      // Prepare the request with context for context tracking if available
      const enrichedContext = options.context || {};

      // Add user and conversation IDs for context tracking if available
      if (options.userId) {
        enrichedContext.userId = options.userId;
      }

      if (options.conversationId) {
        enrichedContext.conversationId = options.conversationId;
      }

      const request: AgentRequest = {
        input,
        capability: options.capability || 'work-coordination',
        parameters: options.parameters,
        context: enrichedContext,
      };

      // Execute with retry support
      let attempts = 0;
      let lastError: Error | null = null;

      while (attempts < this.maxRecoveryAttempts) {
        try {
          const response = await this.workflow.execute(request);

          // Log successful execution
          this.logger.info(`SupervisorAdapter execution successful`, {
            capability: options.capability || 'work-coordination',
            executionTimeMs: response.metrics?.executionTimeMs,
            outputLength:
              typeof response.output === 'string'
                ? response.output.length
                : 'non-string',
          });

          return response;
        } catch (error) {
          attempts++;
          lastError = error instanceof Error ? error : new Error(String(error));

          this.logger.warn(
            `SupervisorAdapter execution failed (attempt ${attempts}/${this.maxRecoveryAttempts})`,
            {
              error: lastError.message,
              capability: options.capability || 'work-coordination',
            },
          );

          if (attempts < this.maxRecoveryAttempts) {
            // Wait before retrying
            await new Promise((resolve) =>
              setTimeout(resolve, this.retryDelayMs),
            );
          }
        }
      }

      // If we get here, all attempts failed
      throw (
        lastError || new Error('Execution failed after maximum retry attempts')
      );
    } catch (error) {
      // Final error handling
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`SupervisorAdapter execution failed: ${errorMessage}`, {
        workflowId: this.workflow.id,
        agentId: this.agent.id,
        input: input.substring(0, 100),
        error,
      });

      return {
        output: `Error: ${errorMessage}`,
        metrics: {
          executionTimeMs: 0,
          tokensUsed: 0,
        },
        artifacts: {
          error: true,
          errorMessage,
          errorType:
            error instanceof Error ? error.constructor.name : 'UnknownError',
        },
      };
    }
  }

  /**
   * Execute a coordinated task with multiple subtasks
   * @param taskDescription Overall task description
   * @param subtasks Array of subtask descriptions
   * @param options Execution options
   */
  async executeCoordinatedTask(
    taskDescription: string,
    subtasks: Array<{
      description: string;
      name?: string;
      priority?: number;
      requiredCapabilities?: string[];
      metadata?: Record<string, any>;
    }>,
    options: {
      executionStrategy?: 'sequential' | 'parallel' | 'prioritized';
      userId?: string;
      conversationId?: string;
      context?: Record<string, any>;
      enableRecovery?: boolean;
    } = {},
  ): Promise<AgentResponse> {
    try {
      this.logger.info(`Executing coordinated task: ${taskDescription}`, {
        subtaskCount: subtasks.length,
        strategy: options.executionStrategy || 'sequential',
      });

      // Create properly formatted tasks for the workflow
      const formattedTasks = subtasks.map((subtask) => {
        const id = uuidv4();
        const name =
          subtask.name || subtask.description.split('\n')[0].slice(0, 50);

        // Create a properly formatted Task object
        const task: Task = {
          id,
          name,
          description: subtask.description,
          priority: subtask.priority || 5,
          status: 'pending',
          createdAt: Date.now(),
          metadata: {
            ...subtask.metadata,
            requiredCapabilities: subtask.requiredCapabilities || [],
          },
        };

        return task;
      });

      // Prepare context for context tracking
      const enrichedContext = options.context || {};

      // Add user and conversation IDs for context tracking if available
      if (options.userId) {
        enrichedContext.userId = options.userId;
      }

      if (options.conversationId) {
        enrichedContext.conversationId = options.conversationId;
      }

      const request: AgentRequest = {
        input: taskDescription,
        capability: 'work-coordination',
        parameters: {
          tasks: formattedTasks,
          executionStrategy: options.executionStrategy || 'sequential',
          // Set to false to use direct task execution
          useTaskPlanningService: false,
          enableRecovery: options.enableRecovery !== false,
        },
        context: enrichedContext,
      };

      const response = await this.workflow.execute(request);

      // Log task execution results
      const totalTasks = formattedTasks.length;
      const completedTasks = response.artifacts?.completedTaskCount || 0;
      const failedTasks = response.artifacts?.failedTaskCount || 0;

      this.logger.info(`Coordinated task execution completed`, {
        totalTasks,
        completedTasks,
        failedTasks,
        successRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
        executionTimeMs: response.metrics?.executionTimeMs,
      });

      return response;
    } catch (error) {
      // Error handling
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Coordinated task execution failed: ${errorMessage}`, {
        workflowId: this.workflow.id,
        agentId: this.agent.id,
        taskDescription: taskDescription.substring(0, 100),
        subtaskCount: subtasks.length,
        error,
      });

      return {
        output: `Error executing coordinated task: ${errorMessage}`,
        metrics: {
          executionTimeMs: 0,
          tokensUsed: 0,
        },
        artifacts: {
          error: true,
          errorMessage,
          errorType:
            error instanceof Error ? error.constructor.name : 'UnknownError',
          subtaskCount: subtasks.length,
        },
      };
    }
  }

  /**
   * Get the underlying SupervisorWorkflow instance
   */
  getWorkflow(): SupervisorWorkflow {
    return this.workflow;
  }

  /**
   * Get the SupervisorAgent instance
   */
  getAgent(): SupervisorAgent {
    return this.agent;
  }

  /**
   * Get the workflow ID
   */
  getWorkflowId(): string {
    return this.workflow.id;
  }
}
