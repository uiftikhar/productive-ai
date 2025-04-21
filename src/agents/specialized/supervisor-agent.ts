import { v4 as uuidv4 } from 'uuid';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { BaseAgent } from '../base/base-agent';
import {
  AgentCapability,
  AgentRequest,
  AgentResponse,
  BaseAgentInterface,
} from '../interfaces/base-agent.interface';
import { LLMInterface } from '../../shared/llm/llm.interface';
import { AgentRegistryService } from '../services/agent-registry.service';
import {
  AgentTaskExecutorService,
  TaskExecutionOptions,
  TaskExecutionEventType,
} from '../services/agent-task-executor.service';
import {
  TaskPlanningService,
  PlannedTask,
  TaskPlan,
  TaskDecompositionOptions,
} from '../services/task-planning.service';

// TODO: Update BaseAgent to support LLMInterface directly instead of requiring ChatOpenAI
// This would provide better flexibility to use various model providers in the future

/**
 * Team management interfaces
 */
export interface TeamMember {
  agent: BaseAgentInterface;
  role: string;
  priority: number;
  active: boolean;
  metadata?: Record<string, any>;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  assignedTo?: string; // agent ID
  priority: number;
  createdAt: number;
  completedAt?: number;
  result?: any;
  metadata?: Record<string, any>;
}

export interface TaskAssignmentRequest {
  taskDescription?: string;
  description?: string; // Added to support workflow format
  priority?: number;
  requiredCapabilities?: string[];
  preferredAgentId?: string;
  deadline?: number;
  metadata?: Record<string, any>;
}

export interface WorkCoordinationRequest {
  tasks: TaskAssignmentRequest[];
  teamContext?: Record<string, any>;
  executionStrategy?: 'sequential' | 'parallel' | 'prioritized';
  useTaskPlanningService?: boolean;
  planName?: string;
  planDescription?: string;
  parallelLimit?: number;
  timeout?: number;
}

export interface SupervisorAgentConfig {
  id?: string;
  name?: string;
  description?: string;
  logger?: Logger;
  llm?: LLMInterface | ChatOpenAI;
  defaultTeamMembers?: TeamMember[];
  priorityThreshold?: number;
  agentRegistry?: AgentRegistryService;
  taskPlanningService?: TaskPlanningService;
  agentTaskExecutor?: AgentTaskExecutorService;
}

/**
 * SupervisorAgent
 *
 * Specialized agent responsible for coordinating multiple agents within a team
 * Facilitates task allocation, progress tracking, and manages execution flow
 */
export class SupervisorAgent extends BaseAgent {
  private team: Map<string, TeamMember> = new Map();
  private tasks: Map<string, Task> = new Map();
  private priorityThreshold: number = 5;
  private workStrategies: Record<string, Function> = {};
  private agentRegistry: AgentRegistryService;
  private taskPlanningService: TaskPlanningService;
  private agentTaskExecutor: AgentTaskExecutorService;

  constructor(options: SupervisorAgentConfig = {}) {
    // Convert LLMInterface to ChatOpenAI if needed
    let chatLLM: ChatOpenAI | undefined = undefined;
    const logger = options.logger || new ConsoleLogger();

    if (options.llm) {
      // If it's already a ChatOpenAI instance, use it directly
      if (options.llm instanceof ChatOpenAI) {
        chatLLM = options.llm;
      } else {
        // For now, we don't have a way to properly convert a generic LLMInterface to ChatOpenAI
        // This is a temporary solution until BaseAgent supports LLMInterface directly
        logger.warn(
          'LLMInterface provided but ChatOpenAI expected. Using default LLM.',
        );
        // We'll let BaseAgent create a default ChatOpenAI instance
      }
    }

    super(
      options.name || 'Supervisor Agent',
      options.description ||
        'Coordinates multiple agents for complex multi-step tasks',
      {
        id: options.id || `supervisor-agent-${uuidv4()}`,
        logger: logger,
        llm: chatLLM,
      },
    );

    // Initialize services
    this.agentRegistry =
      options.agentRegistry || AgentRegistryService.getInstance();
    this.taskPlanningService =
      options.taskPlanningService || TaskPlanningService.getInstance();
    this.agentTaskExecutor =
      options.agentTaskExecutor || AgentTaskExecutorService.getInstance();

    if (options.priorityThreshold !== undefined) {
      this.priorityThreshold = options.priorityThreshold;
    }

    // Register capabilities
    this.registerCapability({
      name: 'team-management',
      description: 'Add, remove, and configure team members',
    });

    this.registerCapability({
      name: 'task-assignment',
      description: 'Assign tasks to appropriate team members',
    });

    this.registerCapability({
      name: 'work-coordination',
      description: 'Coordinate execution of multiple tasks across team members',
    });

    this.registerCapability({
      name: 'progress-tracking',
      description: 'Track progress of tasks and overall goals',
    });

    // Register additional capabilities
    this.registerCapability({
      name: 'task-planning',
      description: 'Create and manage task plans with dependencies',
    });

    // Initialize work strategies
    this.workStrategies = {
      sequential: this.executeSequentially.bind(this),
      parallel: this.executeInParallel.bind(this),
      prioritized: this.executeByPriority.bind(this),
    };

    // Add any default team members
    if (options.defaultTeamMembers) {
      for (const member of options.defaultTeamMembers) {
        this.addTeamMember(member);
      }
    }
  }

  // Make registerCapability public to support the CommunicativeAgent mixin
  public registerCapability(capability: {
    name: string;
    description: string;
  }): void {
    super.registerCapability(capability);
  }

  /**
   * Initialize the agent
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);
    this.logger.info('Initializing SupervisorAgent');

    // Apply any configuration settings
    if (config?.priorityThreshold) {
      this.priorityThreshold = config.priorityThreshold;
    }

    // Initialize team members if they need initialization
    for (const [id, member] of this.team.entries()) {
      if (!member.agent.getInitializationStatus()) {
        await member.agent.initialize();
      }
    }

    this.logger.info('SupervisorAgent initialized successfully');
  }

  /**
   * Execute the agent with the given request
   */
  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    this.logger.info('Executing SupervisorAgent', {
      capability: request.capability,
    });

    const startTime = Date.now();

    try {
      let result: any;

      // Route to appropriate handler based on capability
      switch (request.capability) {
        case 'team-management':
          result = await this.handleTeamManagement(request);
          break;
        case 'task-assignment':
          result = await this.handleTaskAssignment(request);
          break;
        case 'work-coordination':
          result = await this.handleWorkCoordination(request);
          break;
        case 'progress-tracking':
          result = await this.handleProgressTracking(request);
          break;
        case 'task-planning':
          result = await this.handleTaskPlanning(request);
          break;
        default:
          // If no specific capability is provided, treat as general coordination request
          result = await this.coordinateTeam(request);
      }

      const executionTime = Date.now() - startTime;

      return {
        output: result,
        metrics: {
          executionTimeMs: executionTime,
          // Estimate token usage based on input and output size
          tokensUsed: this.estimateTokenUsage(request, result),
        },
      };
    } catch (error) {
      this.logger.error('Error executing SupervisorAgent', {
        error: error instanceof Error ? error.message : String(error),
        capability: request.capability,
      });

      throw error;
    }
  }

  /**
   * Handle team management operations
   */
  private async handleTeamManagement(request: AgentRequest): Promise<any> {
    const { operation, member, agentId } = request.parameters || {};

    switch (operation) {
      case 'add':
        if (!member) {
          throw new Error('Missing team member data');
        }
        return this.addTeamMember(member);
      case 'remove':
        if (!agentId) {
          throw new Error('Missing agent ID');
        }
        return this.removeTeamMember(agentId);
      case 'update':
        if (!agentId || !member) {
          throw new Error('Missing agent ID or update data');
        }
        return this.updateTeamMember(agentId, member);
      case 'list':
        return this.listTeamMembers();
      default:
        throw new Error(`Unsupported team management operation: ${operation}`);
    }
  }

  /**
   * Handle task assignment
   */
  private async handleTaskAssignment(
    request: AgentRequest,
  ): Promise<Task | Record<string, string>> {
    try {
      // Check if this is a batch task assignment request from the workflow
      if (typeof request.input === 'string' && request.input.startsWith('[{')) {
        try {
          const taskRequests = JSON.parse(request.input);

          if (
            Array.isArray(taskRequests) &&
            taskRequests.length > 0 &&
            'taskId' in taskRequests[0]
          ) {
            this.logger.info(
              `Processing batch task assignment for ${taskRequests.length} tasks from workflow`,
            );

            // This is a batch request from the workflow
            const assignments: Record<string, string> = {};

            // Process each task in the batch
            for (const taskReq of taskRequests) {
              const taskId = taskReq.taskId;
              const requiredCapabilities = taskReq.requiredCapabilities || [];
              const priority = taskReq.priority || 5;

              // Find the best agent for this task based on capabilities
              const bestTeamMember =
                this.findBestTeamMemberByCapabilities(requiredCapabilities);

              if (bestTeamMember && bestTeamMember.agent) {
                assignments[taskId] = bestTeamMember.agent.id;
                this.logger.debug(
                  `Assigned task ${taskId} to agent ${bestTeamMember.agent.id}`,
                );
              } else {
                this.logger.warn(`No suitable agent found for task ${taskId}`);
              }
            }

            return assignments;
          }
        } catch (e) {
          this.logger.warn(
            'Failed to parse batch task assignment input as JSON',
            { error: e },
          );
          // Continue with single task assignment
        }
      }

      // Standard single task assignment
      const taskRequest = request.parameters as TaskAssignmentRequest;

      // Support both taskDescription and direct description field
      const description =
        taskRequest?.taskDescription ||
        (taskRequest && 'description' in taskRequest
          ? taskRequest.description
          : null) ||
        (typeof request.input === 'string' ? request.input : null);

      if (!taskRequest || !description) {
        throw new Error('Missing task description');
      }

      // Create a new task
      const task: Task = {
        id: uuidv4(),
        name: description.slice(0, 50), // Use first 50 chars as name
        description: description,
        status: 'pending',
        priority: taskRequest.priority || 5, // Default priority
        createdAt: Date.now(),
        metadata: taskRequest.metadata || {},
      };

      // Find the best agent for this task
      const bestAgentId = await this.findBestAgentForTask(task, {
        ...taskRequest,
        taskDescription: description, // Ensure taskDescription is set for findBestAgentForTask
      });

      if (bestAgentId) {
        task.assignedTo = bestAgentId;
      } else {
        this.logger.warn('No suitable agent found for task', { task });
      }

      // Store the task
      this.tasks.set(task.id, task);

      return task;
    } catch (error) {
      this.logger.error('Error in handleTaskAssignment', { error });
      throw error;
    }
  }

  /**
   * Find the best team member based on required capabilities
   */
  private findBestTeamMemberByCapabilities(
    requiredCapabilities: string[],
  ): TeamMember | undefined {
    // If no specific capabilities required, just return any available agent
    if (!requiredCapabilities || requiredCapabilities.length === 0) {
      const activeMembers = Array.from(this.team.values()).filter(
        (m) => m.active,
      );
      return activeMembers.length > 0 ? activeMembers[0] : undefined;
    }

    // Score each team member based on how many required capabilities they have
    const scoredMembers = Array.from(this.team.values())
      .filter((member) => member.active)
      .map((member) => {
        const agentCapabilities = member.agent
          .getCapabilities()
          .map((c) => c.name);
        const matchingCapabilities = requiredCapabilities.filter((rc) =>
          agentCapabilities.includes(rc),
        );

        return {
          member,
          score: matchingCapabilities.length * 10 + member.priority,
        };
      })
      .sort((a, b) => b.score - a.score); // Sort by highest score

    return scoredMembers.length > 0 ? scoredMembers[0].member : undefined;
  }

  /**
   * Handle work coordination across multiple agents
   */
  private async handleWorkCoordination(request: AgentRequest): Promise<any> {
    const coordinationRequest = request.parameters as WorkCoordinationRequest;

    if (!coordinationRequest || !coordinationRequest.tasks) {
      throw new Error('Missing tasks for coordination');
    }

    // Determine if we should use the task planning service
    const usePlanning = coordinationRequest.useTaskPlanningService === true;

    if (usePlanning) {
      // Create a task plan using the task planning service
      const tasks = coordinationRequest.tasks.map((taskRequest) => {
        // Support both taskDescription and description fields
        const description =
          taskRequest.taskDescription ||
          ('description' in taskRequest ? taskRequest.description : '');

        if (!description) {
          throw new Error('Missing task description in one or more tasks');
        }

        return {
          name: description.slice(0, 50),
          description: description,
          priority: taskRequest.priority || 5,
          requiredCapabilities: taskRequest.requiredCapabilities || [],
          dependencies: [],
          status: 'pending' as 'pending', // Explicitly typed as 'pending'
          metadata: taskRequest.metadata || {},
        };
      });

      const planName = coordinationRequest.planName || 'Task Plan';
      const planDescription =
        coordinationRequest.planDescription || 'Generated task plan';

      // Create the plan
      const plan = await this.createTaskPlan(planName, planDescription, tasks);

      // Execute the plan
      const executionOptions: TaskExecutionOptions = {
        parallelLimit: coordinationRequest.parallelLimit,
        timeout: coordinationRequest.timeout,
        context: coordinationRequest.teamContext,
      };

      return this.executeTaskPlan(plan.id, executionOptions);
    } else {
      // Use the original implementation
      // Create tasks for each requested task
      const taskPromises = coordinationRequest.tasks.map((taskRequest) =>
        this.handleTaskAssignment({ ...request, parameters: taskRequest }),
      );

      const createdTasks = await Promise.all(taskPromises);

      // Execute the tasks according to the requested strategy
      const strategy = coordinationRequest.executionStrategy || 'sequential';
      const executionStrategy = this.workStrategies[strategy];

      if (!executionStrategy) {
        throw new Error(`Unsupported execution strategy: ${strategy}`);
      }

      return executionStrategy(createdTasks, coordinationRequest.teamContext);
    }
  }

  /**
   * Handle progress tracking
   */
  private async handleProgressTracking(request: AgentRequest): Promise<any> {
    const { taskId, status } = request.parameters || {};

    if (taskId) {
      // Return information about a specific task
      const task = this.tasks.get(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
      return task;
    } else {
      // Return summary of all tasks
      return {
        total: this.tasks.size,
        pending: Array.from(this.tasks.values()).filter(
          (t) => t.status === 'pending',
        ).length,
        inProgress: Array.from(this.tasks.values()).filter(
          (t) => t.status === 'in-progress',
        ).length,
        completed: Array.from(this.tasks.values()).filter(
          (t) => t.status === 'completed',
        ).length,
        failed: Array.from(this.tasks.values()).filter(
          (t) => t.status === 'failed',
        ).length,
        tasks: Array.from(this.tasks.values()).map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status,
          assignedTo: t.assignedTo,
          priority: t.priority,
        })),
      };
    }
  }

  /**
   * Handle task planning
   */
  private async handleTaskPlanning(request: AgentRequest): Promise<any> {
    const { name, description, tasks } = request.parameters as {
      name: string;
      description: string;
      tasks: Partial<PlannedTask>[];
    };

    if (!name || !description || !tasks || tasks.length === 0) {
      throw new Error('Missing task plan details');
    }

    // Create a task plan using the task planning service
    const plan = await this.createTaskPlan(name, description, tasks);

    return plan;
  }

  /**
   * General team coordination using LLM
   */
  private async coordinateTeam(request: AgentRequest): Promise<string> {
    // Create a system prompt that describes the team and current state
    const teamDescription = this.createTeamDescription();
    const taskStatus = this.createTaskStatusDescription();

    const systemPrompt = `
You are a Supervisor Agent coordinating a team of specialized AI agents. 
Your goal is to achieve objectives by delegating tasks to the most appropriate team members.

TEAM INFORMATION:
${teamDescription}

CURRENT TASKS:
${taskStatus}

INSTRUCTIONS:
Based on the user's request, determine the best course of action, including:
1. Which agents should be involved
2. What tasks should be assigned to each agent
3. In what order tasks should be executed
4. How outputs from different agents should be combined

Provide a clear, step-by-step coordination plan.
    `;

    // Process the request using the LLM
    const messages = this.prepareMessages(systemPrompt, request.input);
    const response = await this.llm.invoke(messages);

    return response.content as string;
  }

  /**
   * Add a new team member
   */
  public addTeamMember(member: TeamMember): void {
    const agentId = member.agent.id;

    if (this.team.has(agentId)) {
      this.logger.warn(`Agent already exists in team: ${agentId}`);
      return;
    }

    this.team.set(agentId, { ...member });
    this.logger.info(`Added team member: ${agentId} with role ${member.role}`);
  }

  /**
   * Remove a team member
   */
  public removeTeamMember(agentId: string): boolean {
    const removed = this.team.delete(agentId);

    if (removed) {
      this.logger.info(`Removed team member: ${agentId}`);

      // Update any tasks assigned to this agent
      for (const [taskId, task] of this.tasks.entries()) {
        if (task.assignedTo === agentId && task.status !== 'completed') {
          task.status = 'pending';
          task.assignedTo = undefined;
          this.tasks.set(taskId, task);
        }
      }
    } else {
      this.logger.warn(`Agent not found in team: ${agentId}`);
    }

    return removed;
  }

  /**
   * Update a team member
   */
  public updateTeamMember(
    agentId: string,
    update: Partial<TeamMember>,
  ): boolean {
    const member = this.team.get(agentId);

    if (!member) {
      this.logger.warn(`Agent not found in team: ${agentId}`);
      return false;
    }

    // Update the member (don't replace the agent instance)
    const updatedMember = {
      ...member,
      ...update,
      agent: member.agent, // Keep the original agent instance
    };

    this.team.set(agentId, updatedMember);
    this.logger.info(`Updated team member: ${agentId}`);

    return true;
  }

  /**
   * List all team members
   */
  public listTeamMembers(): TeamMember[] {
    return Array.from(this.team.values()).map((member) => ({
      ...member,
      // Include basic agent info but not the actual agent instance to avoid circular references
      agent: {
        id: member.agent.id,
        name: member.agent.name,
        description: member.agent.description,
      } as BaseAgentInterface,
    }));
  }

  /**
   * Find the best agent for a given task
   */
  private async findBestAgentForTask(
    task: Task,
    request: TaskAssignmentRequest,
  ): Promise<string | undefined> {
    // If a preferred agent is specified and exists in the team, use it
    if (request.preferredAgentId && this.team.has(request.preferredAgentId)) {
      const preferredAgent = this.team.get(request.preferredAgentId);
      if (preferredAgent && preferredAgent.active) {
        return request.preferredAgentId;
      }
    }

    // Filter active agents that have the required capabilities
    let eligibleAgents = Array.from(this.team.values()).filter(
      (member) => member.active,
    );

    if (
      request.requiredCapabilities &&
      request.requiredCapabilities.length > 0
    ) {
      eligibleAgents = eligibleAgents.filter((member) => {
        const agentCapabilities = member.agent
          .getCapabilities()
          .map((cap) => cap.name);
        return request.requiredCapabilities!.every((reqCap) =>
          agentCapabilities.some((agentCap) =>
            agentCap.toLowerCase().includes(reqCap.toLowerCase()),
          ),
        );
      });
    }

    if (eligibleAgents.length === 0) {
      return undefined;
    }

    // If we have just one eligible agent, use it
    if (eligibleAgents.length === 1) {
      return eligibleAgents[0].agent.id;
    }

    // Rank agents by priority and select the highest priority one
    eligibleAgents.sort((a, b) => b.priority - a.priority);
    return eligibleAgents[0].agent.id;
  }

  /**
   * Execute tasks sequentially
   */
  private async executeSequentially(
    tasks: Task[],
    context?: Record<string, any>,
    useTaskExecutor: boolean = false,
  ): Promise<any[]> {
    if (useTaskExecutor) {
      // Convert internal tasks to a task plan
      const plan = await this.convertToTaskPlan(
        tasks,
        'Sequential Execution Plan',
        'Tasks to be executed sequentially',
      );

      // Execute the plan with sequential settings
      const executionOptions: TaskExecutionOptions = {
        parallelLimit: 1, // Ensure sequential execution
        context,
      };

      const result = await this.executeTaskPlan(plan.id, executionOptions);
      return result.results.map((r: any) => r.result);
    } else {
      // Use the original implementation
      return this._executeSequentiallyOriginal(tasks, context);
    }
  }

  // Renamed original implementation for backward compatibility
  private async _executeSequentiallyOriginal(
    tasks: Task[],
    context?: Record<string, any>,
  ): Promise<any[]> {
    const results = [];

    for (const task of tasks) {
      try {
        const agent = this.getAssignedAgent(task);
        if (!agent) {
          throw new Error(`No agent assigned for task: ${task.id}`);
        }

        // Update task status
        task.status = 'in-progress';
        this.tasks.set(task.id, task);

        // Execute the task
        const result = await agent.execute({
          input: task.description,
          context: context ? { metadata: context } : undefined,
        });

        // Update task with result
        task.status = 'completed';
        task.completedAt = Date.now();
        task.result = result.output;
        this.tasks.set(task.id, task);

        results.push(result.output);
      } catch (error) {
        this.logger.error(`Error executing task ${task.id}`, { error });

        // Update task status
        task.status = 'failed';
        task.metadata = {
          ...(task.metadata || {}),
          error: error instanceof Error ? error.message : String(error),
        };
        this.tasks.set(task.id, task);

        results.push(null);
      }
    }

    return results;
  }

  /**
   * Execute tasks in parallel
   */
  private async executeInParallel(
    tasks: Task[],
    context?: Record<string, any>,
    useTaskExecutor: boolean = false,
  ): Promise<any[]> {
    if (useTaskExecutor) {
      // Convert internal tasks to a task plan
      const plan = await this.convertToTaskPlan(
        tasks,
        'Parallel Execution Plan',
        'Tasks to be executed in parallel',
      );

      // Execute the plan with parallel settings
      const executionOptions: TaskExecutionOptions = {
        parallelLimit: tasks.length, // Allow maximum parallelism
        context,
      };

      const result = await this.executeTaskPlan(plan.id, executionOptions);
      return result.results.map((r: any) => r.result);
    } else {
      // Use the original implementation
      return this._executeInParallelOriginal(tasks, context);
    }
  }

  // Renamed original implementation for backward compatibility
  private async _executeInParallelOriginal(
    tasks: Task[],
    context?: Record<string, any>,
  ): Promise<any[]> {
    const taskPromises = tasks.map(async (task) => {
      try {
        const agent = this.getAssignedAgent(task);
        if (!agent) {
          throw new Error(`No agent assigned for task: ${task.id}`);
        }

        // Update task status
        task.status = 'in-progress';
        this.tasks.set(task.id, task);

        // Execute the task
        const result = await agent.execute({
          input: task.description,
          context: context ? { metadata: context } : undefined,
        });

        // Update task with result
        task.status = 'completed';
        task.completedAt = Date.now();
        task.result = result.output;
        this.tasks.set(task.id, task);

        return result.output;
      } catch (error) {
        this.logger.error(`Error executing task ${task.id}`, { error });

        // Update task status
        task.status = 'failed';
        task.metadata = {
          ...(task.metadata || {}),
          error: error instanceof Error ? error.message : String(error),
        };
        this.tasks.set(task.id, task);

        return null;
      }
    });

    return Promise.all(taskPromises);
  }

  /**
   * Execute tasks by priority
   */
  private async executeByPriority(
    tasks: Task[],
    context?: Record<string, any>,
    useTaskExecutor: boolean = false,
  ): Promise<any[]> {
    if (useTaskExecutor) {
      // Convert internal tasks to a task plan with priority information preserved
      const plan = await this.convertToTaskPlan(
        tasks,
        'Priority-based Execution Plan',
        'Tasks to be executed based on priority',
      );

      // We'll let the task executor handle execution based on task priorities
      const executionOptions: TaskExecutionOptions = {
        context,
      };

      const result = await this.executeTaskPlan(plan.id, executionOptions);

      // Ensure results are returned in the original task order
      const resultMap = new Map<string, any>();
      result.results.forEach((r: any) => {
        resultMap.set(r.taskId, r.result);
      });

      // Map back to original task IDs
      return plan.tasks.map((t) => resultMap.get(t.id));
    } else {
      // Use the original implementation
      return this._executeByPriorityOriginal(tasks, context);
    }
  }

  // Renamed original implementation for backward compatibility
  private async _executeByPriorityOriginal(
    tasks: Task[],
    context?: Record<string, any>,
  ): Promise<any[]> {
    // Sort tasks by priority (highest first)
    const sortedTasks = [...tasks].sort((a, b) => b.priority - a.priority);

    // Group tasks by priority threshold
    const highPriorityTasks = sortedTasks.filter(
      (t) => t.priority >= this.priorityThreshold,
    );
    const lowPriorityTasks = sortedTasks.filter(
      (t) => t.priority < this.priorityThreshold,
    );

    // Execute high priority tasks in parallel
    const highPriorityResults = await this._executeInParallelOriginal(
      highPriorityTasks,
      context,
    );

    // Execute low priority tasks sequentially
    const lowPriorityResults = await this._executeSequentiallyOriginal(
      lowPriorityTasks,
      context,
    );

    // Reconstruct results in the original task order
    const resultMap = new Map<string, any>();

    // Add high priority results
    highPriorityTasks.forEach((task, index) => {
      resultMap.set(task.id, highPriorityResults[index]);
    });

    // Add low priority results
    lowPriorityTasks.forEach((task, index) => {
      resultMap.set(task.id, lowPriorityResults[index]);
    });

    // Return results in original order
    return tasks.map((task) => resultMap.get(task.id));
  }

  /**
   * Get the agent assigned to a task
   */
  private getAssignedAgent(task: Task): BaseAgentInterface | undefined {
    if (!task.assignedTo) {
      return undefined;
    }

    const teamMember = this.team.get(task.assignedTo);
    return teamMember?.agent;
  }

  /**
   * Create a description of the team for LLM prompts
   */
  private createTeamDescription(): string {
    return Array.from(this.team.values())
      .filter((member) => member.active)
      .map((member) => {
        const capabilities = member.agent
          .getCapabilities()
          .map((cap) => `- ${cap.name}: ${cap.description}`)
          .join('\n');

        return `Agent: ${member.agent.name} (ID: ${member.agent.id})
Role: ${member.role}
Priority: ${member.priority}
Description: ${member.agent.description}
Capabilities:
${capabilities}
`;
      })
      .join('\n');
  }

  /**
   * Create a description of task status for LLM prompts
   */
  private createTaskStatusDescription(): string {
    return Array.from(this.tasks.values())
      .map((task) => {
        const assignedAgent = task.assignedTo
          ? this.team.get(task.assignedTo)?.agent.name || task.assignedTo
          : 'Unassigned';

        return `Task: ${task.name} (ID: ${task.id})
Status: ${task.status}
Priority: ${task.priority}
Assigned to: ${assignedAgent}
Description: ${task.description}
`;
      })
      .join('\n');
  }

  /**
   * Estimate token usage for metrics
   */
  private estimateTokenUsage(request: AgentRequest, result: any): number {
    // Simple estimation based on input and output content length
    const inputLength =
      typeof request.input === 'string'
        ? request.input.length
        : JSON.stringify(request.input).length;

    const outputLength =
      typeof result === 'string'
        ? result.length
        : JSON.stringify(result).length;

    // Rough estimate based on average token length of 4 characters
    return Math.ceil((inputLength + outputLength) / 4);
  }

  /**
   * Create a task plan in the task planning service
   */
  async createTaskPlan(
    name: string,
    description: string,
    tasks: Partial<PlannedTask>[],
  ): Promise<TaskPlan> {
    // Create task decomposition options with the tasks provided as context
    const options: TaskDecompositionOptions = {
      context: {
        predefinedTasks: tasks,
      },
    };

    // Create the plan using the TaskPlanningService
    const plan = await this.taskPlanningService.createTaskPlan(
      name,
      description,
      options,
    );

    // If predefined tasks were provided, add them to the plan
    if (tasks && tasks.length > 0) {
      for (const taskData of tasks) {
        // Ensure status is one of the allowed values
        const status =
          taskData.status &&
          ['pending', 'in-progress', 'completed', 'failed'].includes(
            taskData.status,
          )
            ? (taskData.status as
                | 'pending'
                | 'in-progress'
                | 'completed'
                | 'failed')
            : 'pending';

        // Create the task with required fields
        const task: PlannedTask = {
          id: uuidv4(),
          name: taskData.name || 'Unnamed Task',
          description: taskData.description || '',
          status: status,
          priority: taskData.priority || 5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          ...taskData,
        };

        // Add the task to the plan
        this.taskPlanningService.addTask(plan.id, task);
      }
    }

    return plan;
  }

  /**
   * Execute a task plan using the AgentTaskExecutorService
   */
  async executeTaskPlan(
    planId: string,
    options: TaskExecutionOptions = {},
  ): Promise<any> {
    this.logger.info(`Executing task plan: ${planId}`);
    return this.agentTaskExecutor.executePlan(planId, options);
  }

  /**
   * Execute a specific task from a plan
   */
  async executeTaskFromPlan(
    planId: string,
    taskId: string,
    options: TaskExecutionOptions = {},
  ): Promise<any> {
    this.logger.info(`Executing specific task: ${taskId} from plan: ${planId}`);
    return this.agentTaskExecutor.executeTaskDirectly(planId, taskId, options);
  }

  /**
   * Subscribe to task execution events
   */
  subscribeToTaskEvents(
    callback: (event: any) => void,
    eventTypes?: TaskExecutionEventType[],
  ): string {
    return this.agentTaskExecutor.subscribe(callback, eventTypes);
  }

  /**
   * Unsubscribe from task execution events
   */
  unsubscribeFromTaskEvents(subscriptionId: string): void {
    this.agentTaskExecutor.unsubscribe(subscriptionId);
  }

  /**
   * Convert internal tasks to task planning format
   */
  async convertToTaskPlan(
    tasks: Task[],
    name: string,
    description: string,
  ): Promise<TaskPlan> {
    const plannedTasks = tasks.map((task) => {
      // Convert the status to the proper type
      const status =
        task.status &&
        ['pending', 'in-progress', 'completed', 'failed'].includes(task.status)
          ? (task.status as 'pending' | 'in-progress' | 'completed' | 'failed')
          : 'pending';

      return {
        name: task.name,
        description: task.description,
        assignedTo: task.assignedTo,
        status: status,
        priority: task.priority,
        metadata: task.metadata,
        dependencies: [],
        requiredCapabilities: [],
      };
    });

    return this.createTaskPlan(name, description, plannedTasks);
  }
}
