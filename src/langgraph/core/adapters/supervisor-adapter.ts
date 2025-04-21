import { SupervisorAgent } from '../../../agents/specialized/supervisor-agent';
import { SupervisorWorkflow } from '../workflows/supervisor-workflow';
import { AgentRequest, AgentResponse } from '../../../agents/interfaces/base-agent.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * Configuration for SupervisorAdapter
 */
export interface SupervisorAdapterConfig {
  logger?: Logger;
  tracingEnabled?: boolean;
  maxRecoveryAttempts?: number;
  includeStateInLogs?: boolean;
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
    
    // Initialize the workflow
    this.workflow = new SupervisorWorkflow(agent, {
      tracingEnabled: config.tracingEnabled,
      includeStateInLogs: config.includeStateInLogs,
      logger: this.logger,
    });
    
    this.logger.info(`Initialized SupervisorAdapter for agent: ${agent.id}`);
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
    } = {},
  ): Promise<AgentResponse> {
    this.logger.info(`Executing through SupervisorAdapter: ${input.substring(0, 50)}...`);
    
    const request: AgentRequest = {
      input,
      capability: options.capability || 'work-coordination',
      parameters: options.parameters,
      context: options.context,
    };
    
    return this.workflow.execute(request);
  }
  
  /**
   * Execute a coordinated task with multiple subtasks
   * @param taskDescription Overall task description
   * @param subtasks Array of subtask descriptions
   * @param executionStrategy How to execute the tasks (sequential, parallel, prioritized)
   */
  async executeCoordinatedTask(
    taskDescription: string,
    subtasks: Array<{
      description: string;
      priority?: number;
      requiredCapabilities?: string[];
    }>,
    executionStrategy: 'sequential' | 'parallel' | 'prioritized' = 'sequential',
  ): Promise<AgentResponse> {
    this.logger.info(`Executing coordinated task: ${taskDescription}`);
    
    // Convert subtasks to task assignments
    const tasks = subtasks.map(subtask => ({
      taskDescription: subtask.description,
      priority: subtask.priority || 5,
      requiredCapabilities: subtask.requiredCapabilities || [],
    }));
    
    const request: AgentRequest = {
      input: taskDescription,
      capability: 'work-coordination',
      parameters: {
        tasks,
        executionStrategy,
        useTaskPlanningService: true,
        planName: taskDescription,
        planDescription: `Coordinated execution of ${tasks.length} subtasks`,
      },
    };
    
    return this.workflow.execute(request);
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
} 