import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { LangChainConfig } from '../../langchain/config';
import { BaseAgentInterface } from '../interfaces/base-agent.interface';
import { AgentRegistryService } from './agent-registry.service';
import { AgentDiscoveryService } from './agent-discovery.service';

/**
 * Task structure representing a unit of work in the system
 */
export interface PlannedTask {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  priority: number;
  dependencies?: string[]; // IDs of tasks this task depends on
  estimatedDuration?: number; // Estimated time in milliseconds
  deadline?: number; // Timestamp when task should be completed
  assignedTo?: string; // Agent ID
  requiredCapabilities?: string[]; // Required capabilities to perform this task
  result?: any;
  metadata?: Record<string, any>;
  parentTaskId?: string; // ID of parent task if this is a subtask
  subtasks?: PlannedTask[]; // Child tasks if this is a parent task
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  failureReason?: string;
}

/**
 * Structure to represent a fully decomposed workflow
 */
export interface TaskPlan {
  id: string;
  name: string;
  description: string;
  tasks: PlannedTask[];
  rootTaskIds: string[]; // IDs of top-level tasks
  context?: Record<string, any>; // Additional context for the plan
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  metadata?: Record<string, any>;
}

/**
 * Configuration for the TaskPlanningService
 */
export interface TaskPlanningConfig {
  logger?: Logger;
  llm?: ChatOpenAI;
  agentRegistry?: AgentRegistryService;
  agentDiscovery?: AgentDiscoveryService;
  defaultMaxSubtasks?: number;
  defaultMaxDepth?: number;
}

/**
 * Options for task decomposition
 */
export interface TaskDecompositionOptions {
  maxDepth?: number; // Maximum depth of subtask decomposition
  maxSubtasks?: number; // Maximum number of subtasks per task
  context?: Record<string, any>; // Additional context for decomposition
  targetCapabilities?: string[]; // Target capabilities to consider
  preferredAgentIds?: string[]; // Preferred agents to assign tasks to
}

/**
 * Service for task planning, decomposition, and management
 */
export class TaskPlanningService {
  private static instance: TaskPlanningService;
  private logger: Logger;
  private llm: ChatOpenAI;
  private agentRegistry: AgentRegistryService;
  private agentDiscovery: AgentDiscoveryService;
  private taskPlans: Map<string, TaskPlan> = new Map();
  private defaultMaxSubtasks: number = 5;
  private defaultMaxDepth: number = 3;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: TaskPlanningConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.llm = config.llm || new ChatOpenAI({
      modelName: LangChainConfig.llm.model,
      temperature: 0.2, // Lower temperature for more precise planning
      maxTokens: LangChainConfig.llm.maxTokens,
    });
    
    this.agentRegistry = config.agentRegistry || AgentRegistryService.getInstance();
    this.agentDiscovery = config.agentDiscovery || AgentDiscoveryService.getInstance();
    
    if (config.defaultMaxSubtasks) {
      this.defaultMaxSubtasks = config.defaultMaxSubtasks;
    }
    
    if (config.defaultMaxDepth) {
      this.defaultMaxDepth = config.defaultMaxDepth;
    }
    
    this.logger.info('Initialized TaskPlanningService');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(config: TaskPlanningConfig = {}): TaskPlanningService {
    if (!TaskPlanningService.instance) {
      TaskPlanningService.instance = new TaskPlanningService(config);
    }
    return TaskPlanningService.instance;
  }

  /**
   * Create a new task plan from a high-level task description
   */
  async createTaskPlan(
    name: string,
    description: string,
    options: TaskDecompositionOptions = {},
  ): Promise<TaskPlan> {
    this.logger.info(`Creating task plan: ${name}`);
    
    // Create the root task
    const rootTask: PlannedTask = {
      id: uuidv4(),
      name,
      description,
      status: 'pending',
      priority: 5, // Default medium priority
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    // Create the plan structure
    const plan: TaskPlan = {
      id: uuidv4(),
      name,
      description,
      tasks: [rootTask],
      rootTaskIds: [rootTask.id],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'pending',
      context: options.context,
    };
    
    // Decompose the root task
    await this.decomposeTask(plan, rootTask.id, options);
    
    // Store the plan
    this.taskPlans.set(plan.id, plan);
    
    return plan;
  }

  /**
   * Decompose a task into subtasks
   */
  async decomposeTask(
    plan: TaskPlan,
    taskId: string,
    options: TaskDecompositionOptions = {},
  ): Promise<PlannedTask[]> {
    const taskIndex = plan.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    const task = plan.tasks[taskIndex];
    const maxDepth = options.maxDepth || this.defaultMaxDepth;
    const maxSubtasks = options.maxSubtasks || this.defaultMaxSubtasks;
    
    // Skip decomposition if we've reached the maximum depth
    const currentDepth = this.calculateTaskDepth(plan, task);
    if (currentDepth >= maxDepth) {
      this.logger.debug(`Maximum decomposition depth reached for task: ${task.id}`);
      return [];
    }
    
    this.logger.info(`Decomposing task: ${task.name} (${task.id})`);
    
    // Get available agents and their capabilities
    const availableAgents = this.agentRegistry.listAgents();
    const agentCapabilities = availableAgents.map(agent => {
      return {
        id: agent.id,
        name: agent.name,
        capabilities: agent.getCapabilities().map(cap => cap.name),
      };
    });
    
    // Create a system prompt for decomposition
    const systemPrompt = `
You are a task planning system that decomposes complex tasks into smaller, more manageable subtasks.
Your goal is to create a logical decomposition that breaks the main task into steps that can be handled by specialized agents.

AVAILABLE AGENTS AND CAPABILITIES:
${JSON.stringify(agentCapabilities, null, 2)}

TASK TO DECOMPOSE:
Name: ${task.name}
Description: ${task.description}
${task.metadata ? `Context: ${JSON.stringify(task.metadata)}` : ''}

INSTRUCTIONS:
1. Break down the task into a maximum of ${maxSubtasks} subtasks
2. Each subtask should be a logical step toward completing the parent task
3. For each subtask, provide:
   - A clear, concise name (max 60 chars)
   - A detailed description of what needs to be done
   - Required capabilities from the available agent capabilities
   - Estimated completion time in minutes
   - Dependencies on other subtasks (if any)
   - Priority (1-10, where 10 is highest)

Respond with a JSON array where each object represents a subtask with these properties:
- name (string)
- description (string)
- requiredCapabilities (string[])
- estimatedDuration (number, in minutes)
- dependencies (string[], names of other subtasks this depends on)
- priority (number, 1-10)
`;

    // Get the decomposition from the LLM
    const response = await this.llm.invoke([new SystemMessage(systemPrompt)]);
    let subtasksData: any[] = [];
    
    try {
      // Extract the JSON from the response
      const content = response.content.toString();
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        subtasksData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not extract JSON array from LLM response');
      }
    } catch (error) {
      this.logger.error('Error parsing subtasks JSON', { error });
      // Fallback: create a simple subtask for manual handling
      subtasksData = [{
        name: `Manual handling: ${task.name}`,
        description: `This task requires manual handling: ${task.description}`,
        requiredCapabilities: ['manual-processing'],
        estimatedDuration: 60,
        dependencies: [],
        priority: task.priority,
      }];
    }
    
    // Convert the raw data into PlannedTask objects
    const subtasks: PlannedTask[] = subtasksData.map(data => {
      const subtaskId = uuidv4();
      return {
        id: subtaskId,
        name: data.name,
        description: data.description,
        status: 'pending',
        priority: data.priority || task.priority,
        requiredCapabilities: data.requiredCapabilities || [],
        estimatedDuration: (data.estimatedDuration || 30) * 60 * 1000, // Convert minutes to ms
        parentTaskId: task.id,
        metadata: {
          ...task.metadata,
          fromDecomposition: true,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });
    
    // Update the plan with the new subtasks
    plan.tasks.push(...subtasks);
    
    // Update the parent task with references to subtasks
    plan.tasks[taskIndex] = {
      ...task,
      subtasks: subtasks.map(st => ({ ...st })),
      updatedAt: Date.now(),
    };
    
    // Set up dependencies between subtasks
    this.establishTaskDependencies(plan, task, subtasksData, subtasks);
    
    // Try to assign agents to subtasks
    await this.assignAgentsToTasks(plan, subtasks, options);
    
    return subtasks;
  }

  /**
   * Set up dependencies between subtasks based on decomposition
   */
  private establishTaskDependencies(
    plan: TaskPlan,
    parentTask: PlannedTask,
    subtasksData: any[],
    subtasks: PlannedTask[],
  ): void {
    // Create a map of subtask names to IDs for quick lookup
    const subtaskNameToId = new Map<string, string>();
    subtasks.forEach((st, index) => {
      subtaskNameToId.set(subtasksData[index].name, st.id);
    });
    
    // Establish dependencies based on the raw data
    subtasks.forEach((subtask, index) => {
      const rawDependencies = subtasksData[index].dependencies || [];
      
      if (rawDependencies.length > 0) {
        const dependencyIds: string[] = [];
        
        for (const depName of rawDependencies) {
          const depId = subtaskNameToId.get(depName);
          if (depId) {
            dependencyIds.push(depId);
          }
        }
        
        if (dependencyIds.length > 0) {
          // Update the subtask in the plan
          const stIndex = plan.tasks.findIndex(t => t.id === subtask.id);
          if (stIndex !== -1) {
            plan.tasks[stIndex].dependencies = dependencyIds;
          }
        }
      }
    });
  }

  /**
   * Calculate the depth of a task in the task hierarchy
   */
  private calculateTaskDepth(plan: TaskPlan, task: PlannedTask): number {
    if (!task.parentTaskId) {
      return 0;
    }
    
    let depth = 1;
    let currentTaskId = task.parentTaskId;
    
    while (currentTaskId) {
      depth++;
      const parentTask = plan.tasks.find(t => t.id === currentTaskId);
      if (!parentTask || !parentTask.parentTaskId) {
        break;
      }
      currentTaskId = parentTask.parentTaskId;
    }
    
    return depth;
  }

  /**
   * Assign agents to tasks based on capabilities
   */
  async assignAgentsToTasks(
    plan: TaskPlan,
    tasks: PlannedTask[],
    options: TaskDecompositionOptions = {},
  ): Promise<void> {
    for (const task of tasks) {
      // Skip tasks that already have an assigned agent
      if (task.assignedTo) {
        continue;
      }
      
      let assignedAgentId: string | undefined;
      
      // Try to find an agent with the required capabilities
      if (task.requiredCapabilities && task.requiredCapabilities.length > 0) {
        // First check preferred agents if specified
        if (options.preferredAgentIds && options.preferredAgentIds.length > 0) {
          for (const agentId of options.preferredAgentIds) {
            const agent = this.agentRegistry.getAgent(agentId);
            if (agent) {
              const capabilities = agent.getCapabilities().map(cap => cap.name);
              const hasAllRequired = task.requiredCapabilities.every(reqCap => 
                capabilities.some(cap => cap.toLowerCase().includes(reqCap.toLowerCase()))
              );
              
              if (hasAllRequired) {
                assignedAgentId = agentId;
                break;
              }
            }
          }
        }
        
        // If no preferred agent found, use agent discovery service
        if (!assignedAgentId) {
          const discoveryResult = this.agentDiscovery.discoverAgent({
            capability: task.requiredCapabilities[0]
          });
          
          if (discoveryResult) {
            assignedAgentId = discoveryResult.agentId;
          }
        }
      }
      
      // If an agent was found, update the task
      if (assignedAgentId) {
        const taskIndex = plan.tasks.findIndex(t => t.id === task.id);
        if (taskIndex !== -1) {
          plan.tasks[taskIndex].assignedTo = assignedAgentId;
          plan.tasks[taskIndex].updatedAt = Date.now();
        }
      }
    }
  }

  /**
   * Get a task plan by ID
   */
  getTaskPlan(planId: string): TaskPlan | undefined {
    return this.taskPlans.get(planId);
  }

  /**
   * List all task plans
   */
  listTaskPlans(): TaskPlan[] {
    return Array.from(this.taskPlans.values());
  }

  /**
   * Add a task to an existing plan
   */
  addTask(
    planId: string,
    task: PlannedTask,
  ): boolean {
    const plan = this.taskPlans.get(planId);
    if (!plan) {
      return false;
    }
    
    // Update the plan with the new task
    plan.tasks.push(task);
    
    // If this is a top-level task (no parent), add to rootTaskIds
    if (!task.parentTaskId) {
      plan.rootTaskIds.push(task.id);
    } else {
      // If this is a subtask, update the parent task
      const parentIndex = plan.tasks.findIndex(t => t.id === task.parentTaskId);
      if (parentIndex !== -1) {
        const parent = plan.tasks[parentIndex];
        plan.tasks[parentIndex] = {
          ...parent,
          subtasks: [...(parent.subtasks || []), task],
          updatedAt: Date.now(),
        };
      }
    }
    
    // Update the plan
    plan.updatedAt = Date.now();
    this.taskPlans.set(planId, plan);
    
    return true;
  }

  /**
   * Update the status of a task
   */
  updateTaskStatus(
    planId: string,
    taskId: string,
    status: 'pending' | 'in-progress' | 'completed' | 'failed',
    result?: any,
    failureReason?: string,
    assignedTo?: string,
  ): boolean {
    const plan = this.taskPlans.get(planId);
    if (!plan) {
      return false;
    }
    
    const taskIndex = plan.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      return false;
    }
    
    const task = plan.tasks[taskIndex];
    
    // Update the task
    plan.tasks[taskIndex] = {
      ...task,
      status,
      ...(assignedTo !== undefined ? { assignedTo } : {}),
      updatedAt: Date.now(),
      ...(status === 'completed' ? { completedAt: Date.now(), result } : {}),
      ...(status === 'failed' ? { failureReason } : {}),
    };
    
    // Update the plan
    this.taskPlans.set(planId, {
      ...plan,
      updatedAt: Date.now(),
    });
    
    // If this is a parent task, propagate status to parent
    this.propagateStatusToParent(plan, task);
    
    // Update the overall plan status
    this.updatePlanStatus(plan);
    
    return true;
  }

  /**
   * Propagate task status changes to parent tasks
   */
  private propagateStatusToParent(plan: TaskPlan, task: PlannedTask): void {
    if (!task.parentTaskId) {
      return;
    }
    
    const parentIndex = plan.tasks.findIndex(t => t.id === task.parentTaskId);
    if (parentIndex === -1) {
      return;
    }
    
    const parent = plan.tasks[parentIndex];
    if (!parent.subtasks || parent.subtasks.length === 0) {
      return;
    }
    
    // Get the statuses of all subtasks
    const subtaskIds = parent.subtasks.map(st => st.id);
    const subtasks = plan.tasks.filter(t => subtaskIds.includes(t.id));
    
    // Determine the parent status based on subtasks
    let parentStatus = parent.status;
    
    const allCompleted = subtasks.every(t => t.status === 'completed');
    const anyFailed = subtasks.some(t => t.status === 'failed');
    const anyInProgress = subtasks.some(t => t.status === 'in-progress');
    
    if (allCompleted) {
      parentStatus = 'completed';
    } else if (anyFailed) {
      parentStatus = 'failed';
    } else if (anyInProgress) {
      parentStatus = 'in-progress';
    } else {
      parentStatus = 'pending';
    }
    
    // Update the parent task status if it changed
    if (parentStatus !== parent.status) {
      plan.tasks[parentIndex] = {
        ...parent,
        status: parentStatus,
        updatedAt: Date.now(),
        ...(parentStatus === 'completed' ? {
          completedAt: Date.now(),
          result: subtasks
            .filter(t => t.result)
            .map(t => t.result),
        } : {}),
      };
      
      // Recursively propagate to higher-level parents
      this.propagateStatusToParent(plan, parent);
    }
  }

  /**
   * Update the overall status of a task plan
   */
  private updatePlanStatus(plan: TaskPlan): void {
    const rootTasks = plan.tasks.filter(t => plan.rootTaskIds.includes(t.id));
    
    // Determine plan status based on root tasks
    let planStatus = plan.status;
    
    const allCompleted = rootTasks.every(t => t.status === 'completed');
    const anyFailed = rootTasks.some(t => t.status === 'failed');
    const anyInProgress = rootTasks.some(t => t.status === 'in-progress');
    
    if (allCompleted) {
      planStatus = 'completed';
    } else if (anyFailed) {
      planStatus = 'failed';
    } else if (anyInProgress) {
      planStatus = 'in-progress';
    } else {
      planStatus = 'pending';
    }
    
    // Update the plan status
    if (planStatus !== plan.status) {
      plan.status = planStatus;
      plan.updatedAt = Date.now();
      
      if (planStatus === 'completed') {
        plan.completedAt = Date.now();
      }
      
      this.taskPlans.set(plan.id, plan);
    }
  }

  /**
   * Get tasks that are ready to be executed (all dependencies satisfied)
   */
  getReadyTasks(planId: string): PlannedTask[] {
    const plan = this.taskPlans.get(planId);
    if (!plan) {
      return [];
    }
    
    return plan.tasks.filter(task => {
      // Skip tasks that are not pending
      if (task.status !== 'pending') {
        return false;
      }
      
      // Tasks with no dependencies are ready
      if (!task.dependencies || task.dependencies.length === 0) {
        return true;
      }
      
      // Check if all dependencies are completed
      const dependencies = plan.tasks.filter(t => 
        task.dependencies!.includes(t.id)
      );
      
      return dependencies.every(dep => dep.status === 'completed');
    });
  }

  /**
   * Delete a task plan
   */
  deleteTaskPlan(planId: string): boolean {
    return this.taskPlans.delete(planId);
  }
}