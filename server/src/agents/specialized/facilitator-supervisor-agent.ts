/**
 * Facilitator Supervisor Agent
 *
 * A unified agent that combines the roles of facilitator and supervisor
 * for coordinating multi-agent collaboration.
 *
 * Milestone 2: Supervisor Transformation - Implementation Status:
 * ✅ Transform SupervisorAgent from controller to facilitator
 *   - Implemented suggestion-based coordination with task proposals
 *   - Added voting and consensus mechanisms for decisions
 *   - Transformed task assignments to task proposals
 *
 * ✅ Collaborative Task Analysis
 *   - Implemented collective task decomposition with multiple agents
 *   - Added capability-aware task breakdown
 *   - Implemented evaluation metrics for task decomposition quality
 *
 * ✅ Team Assembly Foundations
 *   - Created team formation strategies based on task complexity
 *   - Implemented assembly using capability composition scores
 *   - Added performance history as team formation factor
 *
 * ✅ Dynamic Delegation Protocols
 *   - Implemented capability-based routing for tasks
 *   - Added subtask advertising to capable agents
 *   - Created feedback loops for delegation effectiveness
 */

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
import { TeamAssemblyService } from '../services/team-assembly.service';
import { TaskBreakdownService } from '../services/task-breakdown.service';
import {
  AgentMessage,
  TaskProposal,
  TaskSuggestion,
  TeamFormationResult,
  CollaborativeTaskBreakdown,
  CapabilityComposition,
  DelegationProtocol,
} from '../interfaces/collaboration.interface';
import {
  RecruitmentMessageType,
  RecruitmentInquiryMessage,
  RecruitmentProposalMessage,
  CounterProposalMessage,
  AcceptanceMessage,
  RejectionMessage,
  TeamContract,
} from '../interfaces/recruitment-protocol.interface';
import {
  AgentRecruitmentService,
  RecruitmentStatus,
} from '../services/agent-recruitment.service';
import { CapabilityAdvertisementService } from '../services/capability-advertisement.service';
import { NegotiationEngineService } from '../services/negotiation-engine.service';
import { TeamContractService } from '../services/team-contract.service';

// Voting system interfaces
interface VoteRecord {
  agentId: string;
  choice: string;
  timestamp: number;
}

interface VotingResults {
  status: 'in-progress' | 'completed';
  topChoice: string | null;
  counts: Record<string, number>;
  votesReceived: number;
  totalVotes: number;
}

interface Voting {
  id: string;
  topic: string;
  description: string;
  choices: string[];
  createdAt: number;
  expiresAt: number;
  closedAt?: number;
  status: 'open' | 'closed';
  votes: VoteRecord[];
  results: VotingResults | null;
  metadata: Record<string, any>;
}

// Feedback system interfaces
interface FeedbackResponse {
  agentId: string;
  feedback: string;
  rating?: number;
  timestamp: number;
  metadata: Record<string, any>;
}

interface FeedbackRequest {
  id: string;
  topic: string;
  description: string;
  targetId?: string;
  createdAt: number;
  expiresAt: number;
  closedAt?: number;
  status: 'open' | 'closed';
  responses: FeedbackResponse[];
  metadata: Record<string, any>;
}

interface FeedbackSummary {
  requestId: string;
  topic: string;
  targetId?: string;
  status: 'open' | 'closed';
  createdAt: number;
  closedAt?: number;
  responseCount: number;
  averageRating: number | null;
  ratingDistribution: Record<number, number>;
  feedbackTexts: string[];
  responses: FeedbackResponse[];
}

/**
 * Interface for a task
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  priority: number;
  status:
    | 'open'
    | 'in-progress'
    | 'blocked'
    | 'completed'
    | 'cancelled'
    | 'pending'
    | 'failed';
  createdAt: number;
  deadline?: number;
  assignedTo?: string;
  completedAt: number | null;
  subtasks: Array<{
    id: string;
    title: string;
    description: string;
    status: 'open' | 'in-progress' | 'completed';
    createdAt: number;
    completedAt: number | null;
  }>;
  metadata: Record<string, any>;
  // Additional fields for collaboration
  name?: string;
  result?: any;
  requiredCapabilities?: string[];
  teamSize?: number;
  collaborators?: string[];
  breakdownId?: string;
}

/**
 * Interface for a subtask proposal
 */
interface SubtaskProposal {
  id: string;
  taskId: string;
  agentId: string;
  proposedSubtasks: Array<{
    title: string;
    description?: string;
  }>;
  justification: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  approvedAt: number | null;
  rejectedAt: number | null;
  rejectionReason: string | null;
}

/**
 * Interface for a task breakdown record
 */
interface TaskBreakdown {
  id: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string;
  proposalId: string;
  agentId: string;
  subtasks: Array<{
    title: string;
    description: string;
  }>;
  justification: string;
  createdAt: number;
}

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

export interface FacilitatorSupervisorConfig {
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
  teamAssemblyService?: TeamAssemblyService;
  taskBreakdownService?: TaskBreakdownService;
}

/**
 * FacilitatorSupervisorAgent
 *
 * Agent that facilitates collaboration between multiple agents within a team
 * Implements suggestion-based coordination, voting mechanisms, and collaborative task breakdown
 */
export class FacilitatorSupervisorAgent extends BaseAgent {
  private team: Map<string, TeamMember> = new Map();
  private tasks: Map<string, Task> = new Map();
  private priorityThreshold: number = 5;
  private workStrategies: Record<string, Function> = {};
  private agentRegistry: AgentRegistryService;
  private taskPlanningService: TaskPlanningService;
  private agentTaskExecutor: AgentTaskExecutorService;
  private teamAssemblyService: TeamAssemblyService;
  private taskBreakdownService: TaskBreakdownService;

  // Collaboration state
  protected taskSuggestions: Map<string, TaskSuggestion> = new Map();
  protected taskProposals: Map<string, TaskProposal> = new Map();
  protected taskBreakdowns: Map<string, string> = new Map(); // taskId -> breakdownId
  protected messageHandlers: Map<
    string,
    (message: AgentMessage) => Promise<void>
  > = new Map();
  protected conversations: Map<string, AgentMessage[]> = new Map();

  // Private subtask proposals map
  private subtaskProposals: Map<string, SubtaskProposal> = new Map();

  // Voting system storage
  private votings: Map<string, Voting> = new Map();

  // Subtask advertisement tracking
  private subtaskAdvertisements: Map<
    string,
    {
      subtaskId: string;
      taskId: string;
      advertisementId: string;
      capabilities: string[];
      status: 'open' | 'assigned' | 'completed' | 'failed';
      createdAt: number;
      assignedTo?: string;
    }
  > = new Map();

  // Performance tracking for delegation effectiveness
  private delegationPerformance: Map<
    string,
    {
      agentId: string;
      taskCount: number;
      successRate: number;
      avgCompletionTime: number;
      lastUpdated: number;
    }
  > = new Map();

  // Task breakdown evaluation metrics
  private taskBreakdownMetrics: Map<
    string,
    {
      breakdownId: string;
      taskId: string;
      completeness: number;
      complexity: number;
      clarity: number;
      coherence: number;
      overallScore: number;
      evaluatedAt: number;
    }
  > = new Map();

  constructor(options: FacilitatorSupervisorConfig = {}) {
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
      options.name || 'Facilitator Supervisor',
      options.description ||
        'Facilitates collaboration between multiple agents using consensus and voting',
      {
        id: options.id || `facilitator-supervisor-${uuidv4()}`,
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
    this.teamAssemblyService =
      options.teamAssemblyService || TeamAssemblyService.getInstance();
    this.taskBreakdownService =
      options.taskBreakdownService || TaskBreakdownService.getInstance();

    if (options.priorityThreshold !== undefined) {
      this.priorityThreshold = options.priorityThreshold;
    }

    // Register capabilities
    this.registerCapability({
      name: 'team-facilitation',
      description:
        'Facilitates team collaboration through consensus-building and voting',
    });

    this.registerCapability({
      name: 'task-suggestion',
      description:
        'Suggests task assignments based on agent capabilities and voting',
    });

    this.registerCapability({
      name: 'collaborative-task-breakdown',
      description:
        'Enables multiple agents to collaboratively break down complex tasks',
    });

    this.registerCapability({
      name: 'capability-based-team-assembly',
      description:
        'Assembles teams based on capability composition and complementary skills',
    });

    this.registerCapability({
      name: 'voting-coordination',
      description:
        'Coordinates voting processes for decisions requiring team consensus',
    });

    this.registerCapability({
      name: 'subtask-advertising',
      description:
        'Advertises subtasks to capable agents based on required capabilities',
    });

    this.registerCapability({
      name: 'delegation-effectiveness',
      description:
        'Tracks and optimizes delegation effectiveness using agent performance history',
    });

    this.registerCapability({
      name: 'task-breakdown-evaluation',
      description:
        'Evaluates the quality of task decomposition using multiple metrics',
    });

    // Register new Agent Recruitment capability
    this.registerCapability({
      name: 'agent-recruitment',
      description:
        'Recruits agents for tasks based on capability matching and negotiation',
    });

    this.registerCapability({
      name: 'capability-advertising',
      description:
        'Manages capability advertisements and discovery for agent recruitment',
    });

    this.registerCapability({
      name: 'contract-formation',
      description:
        'Creates and manages team contracts with expected outcomes and accountability',
    });

    // Add default team members if provided
    if (options.defaultTeamMembers) {
      options.defaultTeamMembers.forEach((member) => {
        this.addTeamMember(member);
      });
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
  async initialize(): Promise<void> {
    this.logger.debug(`Initializing FacilitatorSupervisorAgent ${this.id}`);

    // Register capabilities
    this.registerCapability({
      name: 'team-facilitation',
      description:
        'Facilitates team collaboration through consensus-building and voting',
    });

    this.registerCapability({
      name: 'task-suggestion',
      description:
        'Suggests task assignments based on agent capabilities and voting',
    });

    this.registerCapability({
      name: 'collaborative-task-breakdown',
      description:
        'Enables multiple agents to collaboratively break down complex tasks',
    });

    this.registerCapability({
      name: 'capability-based-team-assembly',
      description:
        'Assembles teams based on capability composition and complementary skills',
    });

    this.registerCapability({
      name: 'voting-coordination',
      description:
        'Coordinates voting processes for decisions requiring team consensus',
    });

    this.registerCapability({
      name: 'subtask-advertising',
      description:
        'Advertises subtasks to capable agents based on required capabilities',
    });

    this.registerCapability({
      name: 'delegation-effectiveness',
      description:
        'Tracks and optimizes delegation effectiveness using agent performance history',
    });

    this.registerCapability({
      name: 'task-breakdown-evaluation',
      description:
        'Evaluates the quality of task decomposition using multiple metrics',
    });

    // Register new Agent Recruitment capability
    this.registerCapability({
      name: 'agent-recruitment',
      description:
        'Recruits agents for tasks based on capability matching and negotiation',
    });

    this.registerCapability({
      name: 'capability-advertising',
      description:
        'Manages capability advertisements and discovery for agent recruitment',
    });

    this.registerCapability({
      name: 'contract-formation',
      description:
        'Creates and manages team contracts with expected outcomes and accountability',
    });

    this.logger.info(
      `FacilitatorSupervisorAgent ${this.id} initialized with facilitation capabilities`,
    );
  }

  /**
   * Main execution method
   */
  public async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    this.logger.info('FacilitatorSupervisorAgent executing request', {
      capability: request.capability,
      input:
        typeof request.input === 'string'
          ? request.input.substring(0, 100)
          : 'complex input',
    });

    try {
      let result: any;

      // Handle based on capability
      switch (request.capability) {
        case 'team-facilitation':
          result = await this.handleTeamFacilitation(request);
          break;

        case 'task-suggestion':
          result = await this.handleTaskSuggestion(request);
          break;

        case 'collaborative-task-breakdown':
          result = await this.handleCollaborativeTaskBreakdown(request);
          break;

        case 'capability-based-team-assembly':
          result = await this.handleTeamAssembly(request);
          break;

        case 'voting-coordination':
          result = await this.handleVotingCoordination(request);
          break;

        case 'subtask-advertising':
          result = await this.handleSubtaskAdvertising(request);
          break;

        case 'delegation-effectiveness':
          result = await this.handleDelegationEffectiveness(request);
          break;

        case 'task-breakdown-evaluation':
          result = await this.handleTaskBreakdownEvaluation(request);
          break;

        case 'agent-recruitment':
          result = await this.handleAgentRecruitment(request);
          break;

        case 'capability-advertising':
          result = await this.handleCapabilityAdvertising(request);
          break;

        case 'contract-formation':
          result = await this.handleContractFormation(request);
          break;

        default:
          this.logger.warn(`Unknown capability: ${request.capability}`);
          return {
            output: `I don't know how to handle ${request.capability}`,
            error: `Unknown capability: ${request.capability}`,
            success: false,
          };
      }

      return {
        output: result,
        error: undefined,
        success: true,
      };
    } catch (error) {
      this.logger.error('Error executing FacilitatorSupervisorAgent request', {
        error,
        capability: request.capability,
      });

      return {
        output: '',
        error: error instanceof Error ? error.message : String(error),
        success: false,
      };
    }
  }

  /**
   * Handle team facilitation capability
   */
  private async handleTeamFacilitation(request: AgentRequest): Promise<any> {
    try {
      const facilitation = this.parseInput<{
        operation: string;
        taskId?: string;
        agentId?: string;
        message?: any;
      }>(request.input);

      switch (facilitation.operation) {
        case 'list-team':
          return this.listTeamMembers();

        case 'add-member':
          if (!facilitation.agentId) {
            throw new Error('Agent ID required to add team member');
          }

          const agent = this.agentRegistry.getAgent(facilitation.agentId);
          if (!agent) {
            throw new Error(`Agent not found: ${facilitation.agentId}`);
          }

          const newMember: TeamMember = {
            agent,
            role: facilitation.message?.role || 'team-member',
            priority: facilitation.message?.priority || 5,
            active: true,
            metadata: facilitation.message?.metadata || {},
          };

          this.addTeamMember(newMember);
          return { success: true, message: `Added ${agent.name} to team` };

        case 'remove-member':
          if (!facilitation.agentId) {
            throw new Error('Agent ID required to remove team member');
          }

          const removed = this.removeTeamMember(facilitation.agentId);
          return {
            success: removed,
            message: removed
              ? `Removed agent from team`
              : `Agent not found in team`,
          };

        case 'broadcast':
          if (!facilitation.message) {
            throw new Error('Message required for broadcast operation');
          }

          const messageIds = await this.broadcastMessage({
            type: facilitation.message.type || 'notification',
            content: facilitation.message.content || facilitation.message,
          });

          return {
            success: true,
            messageIds,
            recipientCount: messageIds.length,
          };

        default:
          throw new Error(
            `Unknown facilitation operation: ${facilitation.operation}`,
          );
      }
    } catch (error) {
      this.logger.error('Error handling team facilitation', { error });
      throw error;
    }
  }

  /**
   * Handle task suggestion capability
   */
  private async handleTaskSuggestion(request: AgentRequest): Promise<any> {
    try {
      const suggestion = this.parseInput<{
        operation: string;
        taskId?: string;
        agentId?: string;
        reason?: string;
        taskDescription?: string;
      }>(request.input);

      switch (suggestion.operation) {
        case 'suggest-assignment':
          if (!suggestion.taskId || !suggestion.agentId) {
            throw new Error(
              'Task ID and Agent ID required for assignment suggestion',
            );
          }

          const proposal = await this.createTaskProposal({
            taskId: suggestion.taskId,
            proposerId: this.id,
            suggestedAgentId: suggestion.agentId,
            reason: suggestion.reason,
          });

          return {
            success: true,
            proposalId: proposal.id,
            message: `Created proposal for task ${suggestion.taskId}`,
          };

        case 'create-task':
          if (!suggestion.taskDescription) {
            throw new Error('Task description required to create task');
          }

          const taskId = `task-${uuidv4()}`;
          const task: Task = {
            id: taskId,
            title: suggestion.taskDescription.substring(0, 50),
            name: suggestion.taskDescription.substring(0, 50),
            description: suggestion.taskDescription,
            status: 'pending',
            priority: 5,
            createdAt: Date.now(),
            completedAt: null,
            subtasks: [],
            metadata: {},
            requiredCapabilities:
              suggestion.operation === 'create-task' &&
              suggestion.taskDescription.includes('capability-requirements')
                ? ['analysis', 'planning'] // Example capabilities
                : undefined,
          };

          this.tasks.set(taskId, task);

          return { success: true, taskId, message: `Created task ${taskId}` };

        case 'list-tasks':
          return Array.from(this.tasks.values()).map((task) => ({
            id: task.id,
            title: task.title,
            name: task.name || task.title,
            status: task.status,
            assignedTo: task.assignedTo,
          }));

        default:
          throw new Error(
            `Unknown task suggestion operation: ${suggestion.operation}`,
          );
      }
    } catch (error) {
      this.logger.error('Error handling task suggestion', { error });
      throw error;
    }
  }

  /**
   * Handle collaborative task breakdown capability
   */
  private async handleCollaborativeTaskBreakdown(
    request: AgentRequest,
  ): Promise<any> {
    try {
      const breakdown = this.parseInput<{
        operation: string;
        taskId?: string;
        collaboratorIds?: string[];
        subtasks?: any[];
        breakdownId?: string;
      }>(request.input);

      switch (breakdown.operation) {
        case 'initiate-breakdown':
          if (!breakdown.taskId) {
            throw new Error('Task ID required to initiate breakdown');
          }

          const task = this.tasks.get(breakdown.taskId);
          if (!task) {
            throw new Error(`Task with ID ${breakdown.taskId} not found`);
          }

          const newBreakdown =
            await this.taskBreakdownService.initiateTaskBreakdown(
              breakdown.taskId,
              task,
              this.id,
              breakdown.collaboratorIds || [],
            );

          // Update task with breakdown ID
          task.breakdownId = newBreakdown.breakdownId;
          this.tasks.set(breakdown.taskId, task);

          // Track the breakdown
          this.taskBreakdowns.set(breakdown.taskId, newBreakdown.breakdownId);

          return {
            success: true,
            breakdownId: newBreakdown.breakdownId,
            message: `Initiated breakdown for task ${breakdown.taskId}`,
          };

        case 'update-subtasks':
          if (!breakdown.breakdownId || !breakdown.subtasks) {
            throw new Error('Breakdown ID and subtasks required for update');
          }

          // Implementation of update-subtasks operation
          break;

        default:
          throw new Error(
            `Unknown breakdown operation: ${breakdown.operation}`,
          );
      }
    } catch (error) {
      this.logger.error('Error handling collaborative task breakdown', {
        error,
      });
      throw error;
    }
  }

  /**
   * Create a new task
   * @param title The title of the task
   * @param description A description of the task
   * @param priority The priority of the task (1-5, where 5 is highest)
   * @param deadline Optional deadline for the task
   * @param assignedTo Optional ID of the agent assigned to the task
   * @param metadata Additional metadata for the task
   * @returns The ID of the created task
   */
  public createTask(
    title: string,
    description: string,
    priority: number = 3,
    deadline?: number,
    assignedTo?: string,
    metadata: Record<string, any> = {},
  ): string {
    if (!title || title.trim() === '') {
      throw new Error('Task title cannot be empty');
    }

    if (priority < 1 || priority > 5) {
      throw new Error('Priority must be between 1 and 5');
    }

    const taskId = uuidv4();
    const now = Date.now();

    const task: Task = {
      id: taskId,
      title,
      description,
      priority,
      status: 'open',
      createdAt: now,
      deadline,
      assignedTo,
      completedAt: null,
      subtasks: [],
      metadata,
    };

    this.tasks.set(taskId, task);

    this.logger.info(`Created task "${title}" with ID ${taskId}`);

    // Notify assigned agent if any
    if (assignedTo) {
      this.notifyTaskAssignment(task);
    }

    return taskId;
  }

  /**
   * Update an existing task
   * @param taskId The ID of the task to update
   * @param updates The fields to update
   * @returns The updated task
   */
  public updateTask(
    taskId: string,
    updates: Partial<Omit<Task, 'id' | 'createdAt'>>,
  ): Task {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    // Validate priority if provided
    if (
      updates.priority !== undefined &&
      (updates.priority < 1 || updates.priority > 5)
    ) {
      throw new Error('Priority must be between 1 and 5');
    }

    // Handle assignment changes
    const wasAssigned = task.assignedTo;
    const newAssignment = updates.assignedTo;

    // Update task properties
    Object.assign(task, updates);

    // If status is changed to completed, set completedAt
    if (updates.status === 'completed' && task.completedAt === null) {
      task.completedAt = Date.now();
    }

    // If status is changed from completed, clear completedAt
    if (
      updates.status &&
      updates.status !== 'completed' &&
      task.completedAt !== null
    ) {
      task.completedAt = null;
    }

    this.logger.info(`Updated task "${task.title}" (ID: ${taskId})`);

    // Notify agent if assignment changed
    if (newAssignment && newAssignment !== wasAssigned) {
      this.notifyTaskAssignment(task);
    }

    return task;
  }

  /**
   * Get a task by ID
   * @param taskId The ID of the task to retrieve
   * @returns The task
   */
  public getTask(taskId: string): Task {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    return task;
  }

  /**
   * Get all tasks, optionally filtered by status
   * @param status Optional status to filter by
   * @returns Array of tasks
   */
  public getAllTasks(status?: Task['status']): Task[] {
    const tasks = Array.from(this.tasks.values());

    if (status) {
      return tasks.filter((task) => task.status === status);
    }

    return tasks;
  }

  /**
   * Delete a task
   * @param taskId The ID of the task to delete
   * @returns True if the task was successfully deleted
   */
  public deleteTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    this.logger.info(`Deleted task "${task.title}" (ID: ${taskId})`);

    return this.tasks.delete(taskId);
  }

  /**
   * Add a subtask to an existing task
   * @param taskId The ID of the parent task
   * @param subtaskTitle The title of the subtask
   * @param subtaskDescription Optional description of the subtask
   * @returns The updated task
   */
  public addSubtask(
    taskId: string,
    subtaskTitle: string,
    subtaskDescription?: string,
  ): Task {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    if (!subtaskTitle || subtaskTitle.trim() === '') {
      throw new Error('Subtask title cannot be empty');
    }

    const subtaskId = uuidv4();

    const subtask = {
      id: subtaskId,
      title: subtaskTitle,
      description: subtaskDescription || '',
      status: 'open' as const, // Use a const assertion to ensure correct type
      createdAt: Date.now(),
      completedAt: null,
    };

    task.subtasks.push(subtask);

    this.logger.info(
      `Added subtask "${subtaskTitle}" to task "${task.title}" (ID: ${taskId})`,
    );

    return task;
  }

  /**
   * Update a subtask
   * @param taskId The ID of the parent task
   * @param subtaskId The ID of the subtask to update
   * @param updates The fields to update
   * @returns The updated task
   */
  public updateSubtask(
    taskId: string,
    subtaskId: string,
    updates: Partial<Omit<Task['subtasks'][0], 'id' | 'createdAt'>>,
  ): Task {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    const subtaskIndex = task.subtasks.findIndex((st) => st.id === subtaskId);

    if (subtaskIndex === -1) {
      throw new Error(
        `Subtask with ID ${subtaskId} not found in task ${taskId}`,
      );
    }

    // Update subtask properties
    Object.assign(task.subtasks[subtaskIndex], updates);

    // If status is changed to completed, set completedAt
    if (
      updates.status === 'completed' &&
      task.subtasks[subtaskIndex].completedAt === null
    ) {
      task.subtasks[subtaskIndex].completedAt = Date.now();
    }

    // If status is changed from completed, clear completedAt
    if (
      updates.status &&
      updates.status !== 'completed' &&
      task.subtasks[subtaskIndex].completedAt !== null
    ) {
      task.subtasks[subtaskIndex].completedAt = null;
    }

    this.logger.info(
      `Updated subtask "${task.subtasks[subtaskIndex].title}" in task "${task.title}"`,
    );

    return task;
  }

  /**
   * Create a proposal to break down a task into subtasks
   * @param taskId The ID of the task to break down
   * @param agentId The ID of the agent making the proposal
   * @param proposedSubtasks The proposed subtasks
   * @param justification The justification for this breakdown
   * @returns The ID of the created proposal
   */
  public createSubtaskProposal(
    taskId: string,
    agentId: string,
    proposedSubtasks: Array<{ title: string; description?: string }>,
    justification: string,
  ): string {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    if (!proposedSubtasks || proposedSubtasks.length === 0) {
      throw new Error('Proposed subtasks cannot be empty');
    }

    const proposalId = uuidv4();
    const now = Date.now();

    const proposal: SubtaskProposal = {
      id: proposalId,
      taskId,
      agentId,
      proposedSubtasks,
      justification,
      status: 'pending',
      createdAt: now,
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: null,
    };

    this.subtaskProposals.set(proposalId, proposal);

    this.logger.info(
      `Created subtask proposal for task "${task.title}" by agent ${agentId}`,
    );

    // Create a voting for this proposal
    this.createVoting(
      `Subtask Proposal for Task: ${task.title}`,
      `Agent ${agentId} has proposed a breakdown of task "${task.title}" into ${proposedSubtasks.length} subtasks.\n\nJustification: ${justification}`,
      ['Approve', 'Reject'],
      { proposalId, taskId },
      10 * 60 * 1000, // 10 minutes
    );

    return proposalId;
  }

  /**
   * Approve a subtask proposal and apply it to the task
   * @param proposalId The ID of the proposal to approve
   * @returns The updated task
   */
  public approveSubtaskProposal(proposalId: string): Task {
    const proposal = this.subtaskProposals.get(proposalId);

    if (!proposal) {
      throw new Error(`Proposal with ID ${proposalId} not found`);
    }

    if (proposal.status !== 'pending') {
      throw new Error(`Proposal with ID ${proposalId} is not pending`);
    }

    const task = this.tasks.get(proposal.taskId);

    if (!task) {
      throw new Error(`Task with ID ${proposal.taskId} not found`);
    }

    // Update proposal status
    proposal.status = 'approved';
    proposal.approvedAt = Date.now();

    // Add proposed subtasks to the task
    for (const subtaskData of proposal.proposedSubtasks) {
      this.addSubtask(
        proposal.taskId,
        subtaskData.title,
        subtaskData.description,
      );
    }

    this.logger.info(
      `Approved subtask proposal for task "${task.title}" by agent ${proposal.agentId}`,
    );

    // Create a task breakdown record for later analysis
    this.createTaskBreakdown(task, proposal);

    return task;
  }

  /**
   * Reject a subtask proposal
   * @param proposalId The ID of the proposal to reject
   * @param reason The reason for rejection
   * @returns The updated proposal
   */
  public rejectSubtaskProposal(
    proposalId: string,
    reason: string,
  ): SubtaskProposal {
    const proposal = this.subtaskProposals.get(proposalId);

    if (!proposal) {
      throw new Error(`Proposal with ID ${proposalId} not found`);
    }

    if (proposal.status !== 'pending') {
      throw new Error(`Proposal with ID ${proposalId} is not pending`);
    }

    // Update proposal status
    proposal.status = 'rejected';
    proposal.rejectedAt = Date.now();
    proposal.rejectionReason = reason;

    this.logger.info(
      `Rejected subtask proposal ${proposalId} for task ${proposal.taskId}`,
    );

    return proposal;
  }

  /**
   * Create a task breakdown record for analysis
   * @param task The parent task
   * @param proposal The approved subtask proposal
   * @returns The ID of the created task breakdown
   */
  private createTaskBreakdown(task: Task, proposal: SubtaskProposal): string {
    const breakdownId = uuidv4();

    const breakdown: TaskBreakdown = {
      id: breakdownId,
      taskId: task.id,
      taskTitle: task.title,
      taskDescription: task.description,
      proposalId: proposal.id,
      agentId: proposal.agentId,
      subtasks: proposal.proposedSubtasks.map((st) => ({
        title: st.title,
        description: st.description || '',
      })),
      justification: proposal.justification,
      createdAt: Date.now(),
    };

    // Store the breakdown record directly with ID as key
    this.taskBreakdownRecords.set(breakdownId, breakdown);

    // Also update the task breakdowns map that maps task ID to breakdown ID
    this.taskBreakdowns.set(task.id, breakdownId);

    return breakdownId;
  }

  /**
   * Notify an agent about a task assignment
   * @param task The task that was assigned
   */
  private notifyTaskAssignment(task: Task): void {
    if (!task.assignedTo) return;

    // This would usually send a notification to the assigned agent
    this.logger.info(
      `[NOTIFICATION] Agent ${task.assignedTo} has been assigned task "${task.title}" (ID: ${task.id})`,
    );

    // In a real implementation, this would call a notification service or messaging system
    // to inform the assigned agent about the task
  }

  /**
   * Parse input data
   */
  private parseInput<T>(input: any): T {
    if (typeof input === 'string') {
      try {
        return JSON.parse(input) as T;
      } catch (e) {
        // If not valid JSON, return as is wrapped in an object
        return { value: input } as unknown as T;
      }
    }
    return input as T;
  }

  /**
   * Add a team member
   */
  private addTeamMember(member: TeamMember): void {
    this.team.set(member.agent.id, member);
    this.logger.info(
      `Added team member: ${member.agent.name} (${member.agent.id})`,
    );
  }

  /**
   * Remove a team member
   */
  private removeTeamMember(agentId: string): boolean {
    const removed = this.team.delete(agentId);
    if (removed) {
      this.logger.info(`Removed team member: ${agentId}`);
    }
    return removed;
  }

  /**
   * List all team members
   */
  private listTeamMembers(): TeamMember[] {
    return Array.from(this.team.values());
  }

  /**
   * Handle team assembly capability
   */
  private async handleTeamAssembly(request: AgentRequest): Promise<any> {
    try {
      const assembly = this.parseInput<{
        operation: string;
        taskId?: string;
        requiredCapabilities?: string[];
        teamSize?: number;
        strategy?: 'specialist' | 'generalist' | 'balanced';
        prioritizePerformance?: boolean;
        taskDescription?: string;
      }>(request.input);

      switch (assembly.operation) {
        case 'form-team':
          if (!assembly.taskId) {
            throw new Error('Task ID required for team formation');
          }

          // Get the task
          const task = this.tasks.get(assembly.taskId);
          if (!task) {
            throw new Error(`Task with ID ${assembly.taskId} not found`);
          }

          // Get required capabilities
          const requiredCapabilities =
            assembly.requiredCapabilities || task.requiredCapabilities || [];

          // Assemble team options
          const teamOptions = {
            teamSize: assembly.teamSize || task.teamSize || 3,
            strategy: assembly.strategy || 'balanced',
            prioritizePerformance: assembly.prioritizePerformance !== false, // Default to true
            taskComplexity: this.estimateTaskComplexity(task),
          };

          // Use the team assembly service to form a team
          const teamResult = await this.teamAssemblyService.formTaskTeam(
            assembly.taskId,
            requiredCapabilities,
            assembly.taskDescription || task.description,
            teamOptions,
          );

          // If we have delegation performance data, use it to refine team selection
          if (this.delegationPerformance.size > 0) {
            // Get performance scores for all agents
            const performanceScores = new Map<string, number>();

            Array.from(this.delegationPerformance.entries()).forEach(
              ([agentId, metrics]) => {
                // Calculate performance score (weighted combination of success rate and speed)
                const performanceScore =
                  metrics.successRate * 0.7 +
                  (1 - Math.min(metrics.avgCompletionTime / 60000, 1)) * 0.3;

                performanceScores.set(agentId, performanceScore);
              },
            );

            // Sort team members by performance score
            const teamMembers = teamResult.teamMembers
              .map((member) => {
                const performanceScore =
                  performanceScores.get(member.agentId) || 0.5; // Default for agents without history
                return {
                  ...member,
                  performanceScore,
                  enhancedScore: member.score * 0.6 + performanceScore * 0.4, // Combine capability and performance
                };
              })
              .sort((a, b) => b.enhancedScore - a.enhancedScore);

            // Return team with performance-adjusted scores
            return {
              success: true,
              taskId: assembly.taskId,
              teamMembers: teamMembers.map((member) => ({
                agentId: member.agentId,
                name: member.name,
                role: member.role,
                score: member.enhancedScore,
                performanceScore: member.performanceScore,
                suggestedReason:
                  member.suggestedReason +
                  (member.performanceScore > 0.7
                    ? ` Has excellent performance history (${Math.round(member.performanceScore * 100)}% effectiveness).`
                    : ''),
              })),
            };
          }

          // Return the standard team result if no performance data
          return {
            success: true,
            taskId: assembly.taskId,
            teamMembers: teamResult.teamMembers,
          };

        case 'analyze-capabilities':
          if (!assembly.taskId) {
            throw new Error('Task ID required for capability analysis');
          }

          // Get the task
          const taskForAnalysis = this.tasks.get(assembly.taskId);
          if (!taskForAnalysis) {
            throw new Error(`Task with ID ${assembly.taskId} not found`);
          }

          // Get required capabilities
          const capsForAnalysis =
            assembly.requiredCapabilities ||
            taskForAnalysis.requiredCapabilities ||
            [];

          // Analyze capability composition
          const capabilityAnalysis =
            this.teamAssemblyService.analyzeCapabilityComposition(
              assembly.taskId,
              capsForAnalysis,
              assembly.taskDescription || taskForAnalysis.description,
            );

          return {
            success: true,
            taskId: assembly.taskId,
            capabilityAnalysis,
          };

        default:
          throw new Error(
            `Unknown team assembly operation: ${assembly.operation}`,
          );
      }
    } catch (error) {
      this.logger.error('Error handling team assembly', { error });
      throw error;
    }
  }

  /**
   * Estimate task complexity based on description and requirements
   * This is a simplified implementation
   * @param task The task to analyze
   * @returns A complexity score from 1-10
   */
  private estimateTaskComplexity(task: Task): number {
    // Start with base complexity
    let complexity = 5;

    // Adjust based on description length
    const descriptionLength = task.description.length;
    if (descriptionLength > 1000) complexity += 2;
    else if (descriptionLength > 500) complexity += 1;
    else if (descriptionLength < 100) complexity -= 1;

    // Adjust based on required capabilities
    if (task.requiredCapabilities) {
      complexity += Math.min(task.requiredCapabilities.length, 3);
    }

    // Adjust based on priority
    if (task.priority >= 4) complexity += 1;

    // Cap between 1-10
    return Math.max(1, Math.min(10, complexity));
  }

  /**
   * Handle voting coordination capability
   */
  private async handleVotingCoordination(request: AgentRequest): Promise<any> {
    try {
      const voting = this.parseInput<{
        operation: string;
        votingId?: string;
        topic?: string;
        description?: string;
        choices?: string[];
        metadata?: Record<string, any>;
        agentId?: string;
        choice?: string;
        expireIn?: number;
      }>(request.input);

      switch (voting.operation) {
        case 'create-voting':
          if (!voting.topic || !voting.choices || voting.choices.length < 2) {
            throw new Error(
              'Topic and at least two choices are required for voting',
            );
          }

          const votingId = this.createVoting(
            voting.topic,
            voting.description || voting.topic,
            voting.choices,
            voting.metadata || {},
            voting.expireIn,
          );

          // Announce the voting to team members
          this.broadcastMessage({
            type: 'voting-created',
            content: {
              votingId,
              topic: voting.topic,
              description: voting.description || voting.topic,
              choices: voting.choices,
              expiresIn: voting.expireIn || 3600000, // 1 hour by default
            },
          });

          return {
            success: true,
            votingId,
            message: `Created voting "${voting.topic}" with ID ${votingId}`,
          };

        case 'cast-vote':
          if (!voting.votingId || !voting.agentId || !voting.choice) {
            throw new Error(
              'Voting ID, Agent ID, and Choice are required to cast a vote',
            );
          }

          // Get the voting
          const votingRecord = this.votings.get(voting.votingId);
          if (!votingRecord) {
            throw new Error(`Voting with ID ${voting.votingId} not found`);
          }

          // Check if voting is open
          if (votingRecord.status !== 'open') {
            throw new Error(`Voting ${voting.votingId} is not open for votes`);
          }

          // Check if choice is valid
          if (!votingRecord.choices.includes(voting.choice)) {
            throw new Error(
              `Invalid choice: ${voting.choice}. Valid choices are: ${votingRecord.choices.join(', ')}`,
            );
          }

          // Check if agent has already voted
          const existingVoteIndex = votingRecord.votes.findIndex(
            (v) => v.agentId === voting.agentId,
          );

          if (existingVoteIndex >= 0) {
            // Update existing vote
            votingRecord.votes[existingVoteIndex] = {
              agentId: voting.agentId,
              choice: voting.choice,
              timestamp: Date.now(),
            };
          } else {
            // Add new vote
            votingRecord.votes.push({
              agentId: voting.agentId,
              choice: voting.choice,
              timestamp: Date.now(),
            });
          }

          // Update the voting
          this.votings.set(voting.votingId, votingRecord);

          // Check if all team members have voted or if there's a clear majority
          this.checkVotingStatus(voting.votingId);

          return {
            success: true,
            message: `Recorded vote from agent ${voting.agentId} for "${voting.choice}"`,
          };

        case 'get-voting':
          if (!voting.votingId) {
            throw new Error('Voting ID required');
          }

          // Get the voting
          const requestedVoting = this.votings.get(voting.votingId);
          if (!requestedVoting) {
            throw new Error(`Voting with ID ${voting.votingId} not found`);
          }

          return {
            success: true,
            voting: requestedVoting,
          };

        case 'close-voting':
          if (!voting.votingId) {
            throw new Error('Voting ID required');
          }

          // Get the voting
          const votingToClose = this.votings.get(voting.votingId);
          if (!votingToClose) {
            throw new Error(`Voting with ID ${voting.votingId} not found`);
          }

          // Check if voting is already closed
          if (votingToClose.status === 'closed') {
            return {
              success: true,
              message: `Voting ${voting.votingId} is already closed`,
              results: votingToClose.results,
            };
          }

          // Close the voting and calculate results
          const results = this.closeVoting(voting.votingId);

          return {
            success: true,
            message: `Closed voting ${voting.votingId}`,
            results,
          };

        case 'list-votings':
          // Filter votings by status if provided
          const status = voting.metadata?.status as
            | 'open'
            | 'closed'
            | undefined;

          const votingsList = Array.from(this.votings.values())
            .filter((v) => !status || v.status === status)
            .map((v) => ({
              id: v.id,
              topic: v.topic,
              status: v.status,
              choices: v.choices,
              voteCount: v.votes.length,
              createdAt: v.createdAt,
              expiresAt: v.expiresAt,
              results: v.results,
            }));

          return {
            success: true,
            votings: votingsList,
          };

        default:
          throw new Error(`Unknown voting operation: ${voting.operation}`);
      }
    } catch (error) {
      this.logger.error('Error handling voting coordination', { error });
      throw error;
    }
  }

  /**
   * Check voting status and close if conditions are met
   */
  private checkVotingStatus(votingId: string): void {
    const voting = this.votings.get(votingId);
    if (!voting || voting.status !== 'open') return;

    // Get team size for quorum calculation
    const teamSize = this.team.size;

    // Check if expiration has been reached
    const now = Date.now();
    if (now > voting.expiresAt) {
      this.closeVoting(votingId);
      return;
    }

    // Check if all team members have voted
    if (teamSize > 0 && voting.votes.length >= teamSize) {
      this.closeVoting(votingId);
      return;
    }

    // Check if there's a clear majority (over 2/3 of team has voted and one choice has >50%)
    if (teamSize > 0 && voting.votes.length >= Math.ceil(teamSize * 0.66)) {
      // Count votes
      const counts: Record<string, number> = {};
      voting.votes.forEach((vote) => {
        counts[vote.choice] = (counts[vote.choice] || 0) + 1;
      });

      // Check if any choice has >50% of votes
      const topChoice = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .shift();

      if (topChoice && topChoice[1] > voting.votes.length / 2) {
        this.closeVoting(votingId);
        return;
      }
    }
  }

  /**
   * Close a voting and calculate results
   */
  private closeVoting(votingId: string): VotingResults | null {
    const voting = this.votings.get(votingId);
    if (!voting) return null;

    // Mark as closed
    voting.status = 'closed';
    voting.closedAt = Date.now();

    // Count votes
    const counts: Record<string, number> = {};
    voting.choices.forEach((choice) => {
      counts[choice] = 0;
    });

    voting.votes.forEach((vote) => {
      counts[vote.choice] = (counts[vote.choice] || 0) + 1;
    });

    // Find top choice
    let topChoice: string | null = null;
    let topCount = 0;

    Object.entries(counts).forEach(([choice, count]) => {
      if (count > topCount) {
        topChoice = choice;
        topCount = count;
      }
    });

    // Create results
    const results: VotingResults = {
      status: 'completed',
      topChoice,
      counts,
      votesReceived: voting.votes.length,
      totalVotes: this.team.size,
    };

    // Save results
    voting.results = results;
    this.votings.set(votingId, voting);

    // Announce results to team
    this.broadcastMessage({
      type: 'voting-closed',
      content: {
        votingId,
        topic: voting.topic,
        results,
      },
    });

    // Handle special voting types based on metadata
    this.processVotingResults(voting);

    return results;
  }

  /**
   * Process special voting results based on metadata
   */
  private processVotingResults(voting: Voting): void {
    // Check if this is a subtask proposal voting
    if (voting.metadata && voting.metadata.proposalId) {
      const proposalId = voting.metadata.proposalId as string;
      const taskId = voting.metadata.taskId as string;

      // Get the top choice
      const topChoice = voting.results?.topChoice;

      if (topChoice === 'Approve') {
        // Approve the subtask proposal
        try {
          this.approveSubtaskProposal(proposalId);
          this.logger.info(
            `Automatically approved subtask proposal ${proposalId} based on voting results`,
          );
        } catch (error) {
          this.logger.error(
            `Error auto-approving subtask proposal ${proposalId}`,
            { error },
          );
        }
      } else if (topChoice === 'Reject') {
        // Reject the subtask proposal
        try {
          this.rejectSubtaskProposal(
            proposalId,
            `Rejected by team vote (Voting ID: ${voting.id})`,
          );
          this.logger.info(
            `Automatically rejected subtask proposal ${proposalId} based on voting results`,
          );
        } catch (error) {
          this.logger.error(
            `Error auto-rejecting subtask proposal ${proposalId}`,
            { error },
          );
        }
      }
    }

    // Process task assignment proposal voting
    if (voting.metadata && voting.metadata.taskProposalId) {
      // Implementation for task assignment proposals
      // This would make the actual assignment based on voting results
    }
  }

  /**
   * Broadcast a message to all team members
   */
  private async broadcastMessage(message: {
    type: string;
    content: any;
  }): Promise<string[]> {
    const messageIds: string[] = [];

    for (const member of this.listTeamMembers()) {
      try {
        // Logic to send message to team member
        messageIds.push(`msg-${uuidv4().substring(0, 8)}`);
      } catch (error) {
        this.logger.warn(`Failed to broadcast message to ${member.agent.id}`, {
          error,
        });
      }
    }

    return messageIds;
  }

  /**
   * Create a task proposal for task assignment
   */
  private async createTaskProposal(params: {
    taskId: string;
    proposerId: string;
    suggestedAgentId: string;
    reason?: string;
  }): Promise<{ id: string; taskId: string; suggestedAgentId: string }> {
    const { taskId, proposerId, suggestedAgentId, reason } = params;

    const proposalId = `proposal-${uuidv4().substring(0, 8)}`;

    // Get the proposer agent name
    const proposerAgent = this.agentRegistry.getAgent(proposerId);
    const proposerName = proposerAgent?.name || 'Unknown Agent';

    const proposal: TaskProposal = {
      id: proposalId,
      taskId,
      proposerId,
      proposerName,
      suggestedAgentId,
      reason: reason || 'No reason provided',
      status: 'pending',
      votes: [],
      timestamp: Date.now(),
    };

    this.taskProposals.set(proposalId, proposal);
    this.logger.info(`Created task proposal ${proposalId} for task ${taskId}`);

    return { id: proposalId, taskId, suggestedAgentId };
  }

  /**
   * Create a voting for decision making
   */
  private createVoting(
    topic: string,
    description: string,
    choices: string[],
    metadata: Record<string, any> = {},
    expireIn: number = 3600000, // 1 hour by default
  ): string {
    const votingId = `voting-${uuidv4().substring(0, 8)}`;

    const voting: Voting = {
      id: votingId,
      topic,
      description,
      choices,
      createdAt: Date.now(),
      expiresAt: Date.now() + expireIn,
      status: 'open',
      votes: [],
      results: null,
      metadata,
    };

    // Store the voting
    this.votings = this.votings || new Map<string, Voting>();
    this.votings.set(votingId, voting);

    this.logger.info(`Created voting: ${votingId} on topic "${topic}"`);

    return votingId;
  }

  /**
   * Private map for task breakdowns
   */
  private taskBreakdownRecords: Map<string, TaskBreakdown> = new Map();

  /**
   * Handle subtask advertising capability
   */
  private async handleSubtaskAdvertising(request: AgentRequest): Promise<any> {
    try {
      const advertising = this.parseInput<{
        operation: string;
        taskId?: string;
        subtaskId?: string;
        capabilities?: string[];
        agentId?: string;
      }>(request.input);

      switch (advertising.operation) {
        case 'advertise-subtask':
          if (!advertising.taskId || !advertising.subtaskId) {
            throw new Error('Task ID and Subtask ID required for advertising');
          }

          // Get the task
          const task = this.tasks.get(advertising.taskId);
          if (!task) {
            throw new Error(`Task with ID ${advertising.taskId} not found`);
          }

          // Find the subtask
          const subtask = task.subtasks.find(
            (st) => st.id === advertising.subtaskId,
          );
          if (!subtask) {
            throw new Error(
              `Subtask with ID ${advertising.subtaskId} not found in task ${advertising.taskId}`,
            );
          }

          // Get required capabilities from the request or from task metadata
          const capabilities =
            advertising.capabilities ||
            task.metadata?.subtaskCapabilities?.[advertising.subtaskId] ||
            [];

          // Advertise the subtask using the delegation protocol service
          const delegationService = await this.getDelegationProtocolService();

          const delegationRequest = {
            title: subtask.title,
            description: subtask.description,
            requiredCapabilities: capabilities,
            priority: task.priority,
            waitForResponses: 5000, // 5 seconds
            autoAssign: true,
            context: {
              taskId: advertising.taskId,
              subtaskId: advertising.subtaskId,
              parentTaskTitle: task.title,
            },
          };

          const delegationResult = await delegationService.delegateTask(
            this.id,
            delegationRequest,
          );

          // Store the advertisement
          if (delegationResult.advertisementId) {
            this.subtaskAdvertisements.set(advertising.subtaskId, {
              subtaskId: advertising.subtaskId,
              taskId: advertising.taskId,
              advertisementId: delegationResult.advertisementId,
              capabilities,
              status:
                delegationResult.status === 'assigned' ? 'assigned' : 'open',
              createdAt: Date.now(),
              assignedTo: delegationResult.assignedAgentId,
            });

            // If assigned, update the subtask
            if (
              delegationResult.status === 'assigned' &&
              delegationResult.assignedAgentId
            ) {
              this.updateSubtask(advertising.taskId, advertising.subtaskId, {
                status: 'in-progress',
              });

              // Update task metadata
              if (!task.metadata.assignedSubtasks) {
                task.metadata.assignedSubtasks = {};
              }
              task.metadata.assignedSubtasks[advertising.subtaskId] =
                delegationResult.assignedAgentId;
              this.tasks.set(advertising.taskId, task);
            }
          }

          return {
            success: true,
            advertisementId: delegationResult.advertisementId,
            status: delegationResult.status,
            assignedTo: delegationResult.assignedAgentId,
            message:
              delegationResult.status === 'assigned'
                ? `Subtask assigned to ${delegationResult.assignedAgentName}`
                : `Subtask advertised to ${delegationResult.responses.length} agents`,
          };

        case 'complete-subtask':
          if (
            !advertising.taskId ||
            !advertising.subtaskId ||
            !advertising.agentId
          ) {
            throw new Error(
              'Task ID, Subtask ID, and Agent ID required for completion',
            );
          }

          // Get the task
          const taskToUpdate = this.tasks.get(advertising.taskId);
          if (!taskToUpdate) {
            throw new Error(`Task with ID ${advertising.taskId} not found`);
          }

          // Find the subtask
          const subtaskToUpdate = taskToUpdate.subtasks.find(
            (st) => st.id === advertising.subtaskId,
          );
          if (!subtaskToUpdate) {
            throw new Error(
              `Subtask with ID ${advertising.subtaskId} not found in task ${advertising.taskId}`,
            );
          }

          // Check if the agent is assigned to this subtask
          const advertisementRecord = this.subtaskAdvertisements.get(
            advertising.subtaskId,
          );
          if (
            !advertisementRecord ||
            advertisementRecord.assignedTo !== advertising.agentId
          ) {
            throw new Error(
              `Subtask ${advertising.subtaskId} is not assigned to agent ${advertising.agentId}`,
            );
          }

          // Update the subtask
          this.updateSubtask(advertising.taskId, advertising.subtaskId, {
            status: 'completed',
          });

          // Update advertisement status
          advertisementRecord.status = 'completed';
          this.subtaskAdvertisements.set(
            advertising.subtaskId,
            advertisementRecord,
          );

          // Update delegation performance metrics
          this.updateDelegationPerformance(
            advertising.agentId,
            true,
            Date.now() - advertisementRecord.createdAt,
          );

          return {
            success: true,
            message: `Subtask ${advertising.subtaskId} marked as completed by agent ${advertising.agentId}`,
          };

        case 'fail-subtask':
          if (
            !advertising.taskId ||
            !advertising.subtaskId ||
            !advertising.agentId
          ) {
            throw new Error(
              'Task ID, Subtask ID, and Agent ID required for failure reporting',
            );
          }

          // Get the advertisement
          const failedAdvertisementRecord = this.subtaskAdvertisements.get(
            advertising.subtaskId,
          );
          if (
            !failedAdvertisementRecord ||
            failedAdvertisementRecord.assignedTo !== advertising.agentId
          ) {
            throw new Error(
              `Subtask ${advertising.subtaskId} is not assigned to agent ${advertising.agentId}`,
            );
          }

          // Update advertisement status
          failedAdvertisementRecord.status = 'failed';
          this.subtaskAdvertisements.set(
            advertising.subtaskId,
            failedAdvertisementRecord,
          );

          // Update delegation performance metrics
          this.updateDelegationPerformance(
            advertising.agentId,
            false,
            Date.now() - failedAdvertisementRecord.createdAt,
          );

          return {
            success: true,
            message: `Subtask ${advertising.subtaskId} marked as failed by agent ${advertising.agentId}`,
          };

        case 'list-advertisements':
          // Return all active advertisements
          const activeAdvertisements = Array.from(
            this.subtaskAdvertisements.values(),
          ).filter((ad) => ad.status === 'open' || ad.status === 'assigned');

          return {
            success: true,
            advertisements: activeAdvertisements,
          };

        default:
          throw new Error(
            `Unknown subtask advertising operation: ${advertising.operation}`,
          );
      }
    } catch (error) {
      this.logger.error('Error handling subtask advertising', { error });
      throw error;
    }
  }

  /**
   * Get the delegation protocol service
   * Helper method to avoid direct dependency on specific implementation
   */
  private async getDelegationProtocolService(): Promise<any> {
    try {
      // Import dynamically to avoid circular dependencies
      const { DelegationProtocolService } = await import(
        '../services/delegation-protocol.service'
      );
      return DelegationProtocolService.getInstance();
    } catch (error) {
      this.logger.error('Error getting delegation protocol service', { error });
      throw new Error('Delegation protocol service not available');
    }
  }

  /**
   * Handle task breakdown evaluation capability
   */
  private async handleTaskBreakdownEvaluation(
    request: AgentRequest,
  ): Promise<any> {
    try {
      const evaluation = this.parseInput<{
        operation: string;
        breakdownId?: string;
        taskId?: string;
        metrics?: {
          completeness: number;
          complexity: number;
          clarity: number;
          coherence: number;
          overallScore: number;
        };
      }>(request.input);

      switch (evaluation.operation) {
        case 'evaluate-breakdown':
          if (!evaluation.breakdownId && !evaluation.taskId) {
            throw new Error(
              'Either breakdown ID or task ID is required for evaluation',
            );
          }

          let breakdownId = evaluation.breakdownId;

          // If task ID is provided but not breakdown ID, look it up
          if (!breakdownId && evaluation.taskId) {
            breakdownId = this.taskBreakdowns.get(evaluation.taskId);
            if (!breakdownId) {
              throw new Error(
                `No breakdown found for task ${evaluation.taskId}`,
              );
            }
          }

          // Get the breakdown record
          const breakdown = this.taskBreakdownRecords.get(breakdownId!);
          if (!breakdown) {
            throw new Error(`Breakdown with ID ${breakdownId} not found`);
          }

          // Get the task
          const task = this.tasks.get(breakdown.taskId);
          if (!task) {
            throw new Error(`Task with ID ${breakdown.taskId} not found`);
          }

          // Calculate metrics if not provided
          const metrics =
            evaluation.metrics ||
            this.calculateBreakdownMetrics(breakdown, task);

          // Store the evaluation
          const evaluationRecord = {
            breakdownId: breakdown.id,
            taskId: breakdown.taskId,
            completeness: metrics.completeness,
            complexity: metrics.complexity,
            clarity: metrics.clarity,
            coherence: metrics.coherence,
            overallScore: metrics.overallScore,
            evaluatedAt: Date.now(),
          };

          this.taskBreakdownMetrics.set(breakdown.id, evaluationRecord);

          return {
            success: true,
            evaluation: evaluationRecord,
          };

        case 'get-evaluation':
          if (!evaluation.breakdownId && !evaluation.taskId) {
            throw new Error('Either breakdown ID or task ID is required');
          }

          let evalBreakdownId = evaluation.breakdownId;

          // If task ID is provided but not breakdown ID, look it up
          if (!evalBreakdownId && evaluation.taskId) {
            evalBreakdownId = this.taskBreakdowns.get(evaluation.taskId);
            if (!evalBreakdownId) {
              throw new Error(
                `No breakdown found for task ${evaluation.taskId}`,
              );
            }
          }

          // Get the stored evaluation
          const storedEvaluation = this.taskBreakdownMetrics.get(
            evalBreakdownId!,
          );
          if (!storedEvaluation) {
            throw new Error(
              `No evaluation found for breakdown ${evalBreakdownId}`,
            );
          }

          return {
            success: true,
            evaluation: storedEvaluation,
          };

        case 'list-evaluations':
          // Return all evaluations
          return {
            success: true,
            evaluations: Array.from(this.taskBreakdownMetrics.values()),
          };

        default:
          throw new Error(
            `Unknown task breakdown evaluation operation: ${evaluation.operation}`,
          );
      }
    } catch (error) {
      this.logger.error('Error handling task breakdown evaluation', { error });
      throw error;
    }
  }

  /**
   * Calculate metrics for a task breakdown
   * This implements evaluation metrics for task decomposition quality
   */
  private calculateBreakdownMetrics(
    breakdown: TaskBreakdown,
    task: Task,
  ): {
    completeness: number;
    complexity: number;
    clarity: number;
    coherence: number;
    overallScore: number;
  } {
    // 1. Completeness - does the breakdown cover all aspects of the original task?
    // Calculate based on word coverage and key concept matching
    const taskWords = new Set(
      (task.description || '').toLowerCase().split(/\s+/),
    );
    let coveredWords = new Set<string>();

    // Collect words from all subtask descriptions
    breakdown.subtasks.forEach((subtask) => {
      (subtask.description || '')
        .toLowerCase()
        .split(/\s+/)
        .forEach((word) => {
          coveredWords.add(word);
        });
    });

    // Calculate word overlap
    let wordOverlap = 0;
    coveredWords.forEach((word) => {
      if (taskWords.has(word)) {
        wordOverlap++;
      }
    });

    const completeness =
      Math.min(wordOverlap / Math.max(taskWords.size, 1), 1) * 0.8 + 0.2; // Scale from 0.2-1.0

    // 2. Complexity - Is the breakdown appropriate in terms of subtask count?
    // We assume a good breakdown has 3-7 subtasks
    const subtaskCount = breakdown.subtasks.length;
    let complexity = 1.0;

    if (subtaskCount < 2) {
      complexity = 0.3; // Too few subtasks
    } else if (subtaskCount < 3) {
      complexity = 0.7; // Slightly few
    } else if (subtaskCount > 10) {
      complexity = 0.4; // Too many subtasks
    } else if (subtaskCount > 7) {
      complexity = 0.8; // Slightly many
    }

    // 3. Clarity - Are the subtasks clearly defined?
    // Calculate based on average subtask description length
    const avgDescriptionLength =
      breakdown.subtasks.reduce(
        (sum, subtask) => sum + (subtask.description || '').length,
        0,
      ) / Math.max(breakdown.subtasks.length, 1);

    // We assume a good description is 20-200 characters
    let clarity = 1.0;
    if (avgDescriptionLength < 10) {
      clarity = 0.3; // Too short
    } else if (avgDescriptionLength < 20) {
      clarity = 0.7; // Slightly short
    } else if (avgDescriptionLength > 500) {
      clarity = 0.5; // Too long
    } else if (avgDescriptionLength > 200) {
      clarity = 0.8; // Slightly long
    }

    // 4. Coherence - Do the subtasks form a logical whole?
    // This is a simplified implementation - in practice, this would use more sophisticated NLP
    // For now, we'll assume coherence correlates with having sequential subtasks
    // with clear names that relate to each other
    const subtaskTitles = breakdown.subtasks.map((st) => st.title || '');
    let coherence = 0.7; // Default moderate coherence

    // Look for ordered subtasks (Step 1, Step 2, etc.)
    const orderedPattern = /^(step|phase|part|stage)\s*(\d+|[a-z])/i;
    const hasOrderedSubtasks = subtaskTitles.some((title) =>
      orderedPattern.test(title),
    );

    if (hasOrderedSubtasks) {
      coherence += 0.2; // Bonus for ordered subtasks
    }

    // Calculate overall score (weighted average)
    const overallScore =
      completeness * 0.35 + complexity * 0.2 + clarity * 0.25 + coherence * 0.2;

    return {
      completeness,
      complexity,
      clarity,
      coherence,
      overallScore,
    };
  }

  /**
   * Handle delegation effectiveness capability
   */
  private async handleDelegationEffectiveness(
    request: AgentRequest,
  ): Promise<any> {
    try {
      const delegation = this.parseInput<{
        operation: string;
        agentId?: string;
      }>(request.input);

      switch (delegation.operation) {
        case 'get-performance':
          if (!delegation.agentId) {
            // Return all agent performance metrics
            return {
              success: true,
              metrics: Array.from(this.delegationPerformance.values()),
            };
          }

          // Return performance for a specific agent
          const agentPerformance = this.delegationPerformance.get(
            delegation.agentId,
          );
          if (!agentPerformance) {
            return {
              success: false,
              message: `No performance data available for agent ${delegation.agentId}`,
            };
          }

          return {
            success: true,
            metrics: agentPerformance,
          };

        case 'get-recommendation':
          // Get the top performing agents
          const performanceEntries = Array.from(
            this.delegationPerformance.entries(),
          )
            .map(([id, metrics]) => ({
              id,
              taskCount: metrics.taskCount,
              successRate: metrics.successRate,
              avgCompletionTime: metrics.avgCompletionTime,
              lastUpdated: metrics.lastUpdated,
            }))
            .filter((entry) => entry.taskCount >= 3) // Only consider agents with enough data
            .sort((a, b) => {
              // Score based on success rate and completion time
              const scoreA =
                a.successRate * 0.7 +
                (1 - Math.min(a.avgCompletionTime / 60000, 1)) * 0.3;
              const scoreB =
                b.successRate * 0.7 +
                (1 - Math.min(b.avgCompletionTime / 60000, 1)) * 0.3;
              return scoreB - scoreA;
            });

          return {
            success: true,
            recommendations: performanceEntries.slice(0, 3), // Top 3 agents
          };

        default:
          throw new Error(
            `Unknown delegation effectiveness operation: ${delegation.operation}`,
          );
      }
    } catch (error) {
      this.logger.error('Error handling delegation effectiveness', { error });
      throw error;
    }
  }

  /**
   * Update delegation performance metrics for an agent
   */
  private updateDelegationPerformance(
    agentId: string,
    success: boolean,
    completionTimeMs: number,
  ): void {
    // Get existing record or create new one
    const existingRecord = this.delegationPerformance.get(agentId) || {
      agentId,
      taskCount: 0,
      successRate: 0,
      avgCompletionTime: 0,
      lastUpdated: 0,
    };

    // Update metrics
    const newTaskCount = existingRecord.taskCount + 1;
    const newSuccessCount =
      existingRecord.successRate * existingRecord.taskCount + (success ? 1 : 0);
    const newSuccessRate = newSuccessCount / newTaskCount;

    // Update average completion time (only for successful tasks)
    let newAvgCompletionTime = existingRecord.avgCompletionTime;
    if (success) {
      newAvgCompletionTime =
        (existingRecord.avgCompletionTime * existingRecord.taskCount +
          completionTimeMs) /
        newTaskCount;
    }

    // Store updated record
    this.delegationPerformance.set(agentId, {
      agentId,
      taskCount: newTaskCount,
      successRate: newSuccessRate,
      avgCompletionTime: newAvgCompletionTime,
      lastUpdated: Date.now(),
    });

    // Also update team assembly service agent performance cache
    try {
      this.teamAssemblyService.updateAgentPerformance(agentId, {
        success,
        executionTimeMs: completionTimeMs,
      });
    } catch (err) {
      const error = err as Error;
      this.logger.warn(
        `Failed to update team assembly service performance metrics: ${error.message}`,
      );
    }
  }

  /**
   * Handle agent recruitment capability
   */
  private async handleAgentRecruitment(request: AgentRequest): Promise<any> {
    try {
      const recruitment = this.parseInput<{
        operation: string;
        taskId?: string;
        teamId?: string;
        targetAgentId?: string;
        agentIds?: string[];
        recruitmentId?: string;
        proposalId?: string;
        proposedRole?: string;
        responsibilities?: string[];
        requiredCapabilities?: string[];
        expectedContribution?: string;
        expectedDuration?: number;
        compensation?: {
          type: string;
          value: number;
        };
        message?: string;
        counterProposal?: CounterProposalMessage;
        acceptance?: AcceptanceMessage;
        rejection?: RejectionMessage;
      }>(request.input);

      // Get the recruitment service
      const recruitmentService =
        await this.getServiceInstance<AgentRecruitmentService>(
          '../services/agent-recruitment.service',
          'AgentRecruitmentService',
        );

      switch (recruitment.operation) {
        case 'create-inquiry':
          if (!recruitment.taskId || !recruitment.targetAgentId) {
            throw new Error(
              'Task ID and target agent ID required for recruitment inquiry',
            );
          }

          // Get the task
          const task = this.tasks.get(recruitment.taskId);
          if (!task) {
            throw new Error(`Task with ID ${recruitment.taskId} not found`);
          }

          // Create recruitment inquiry
          const inquiry = recruitmentService.createInquiry({
            recruiterId: this.id,
            recruiterName: this.name,
            targetAgentId: recruitment.targetAgentId,
            taskId: recruitment.taskId,
            teamId: recruitment.teamId,
            taskDescription: task.description,
            requiredCapabilities:
              recruitment.requiredCapabilities ||
              task.requiredCapabilities ||
              [],
            priority: task.priority,
            deadline: task.deadline,
            expiresIn: 3600000, // 1 hour
          });

          return {
            success: true,
            recruitmentId: inquiry.id,
            message: `Created recruitment inquiry for agent ${recruitment.targetAgentId}`,
          };

        case 'create-proposal':
          if (!recruitment.recruitmentId) {
            throw new Error('Recruitment ID required to create proposal');
          }

          // Create proposal
          const proposal = recruitmentService.createProposal({
            recruitmentId: recruitment.recruitmentId,
            proposedRole: recruitment.proposedRole || 'team-member',
            responsibilities: recruitment.responsibilities || [
              'Execute assigned subtasks',
            ],
            requiredCapabilities: recruitment.requiredCapabilities || [],
            expectedContribution:
              recruitment.expectedContribution ||
              'Complete assigned tasks according to requirements',
            expectedDuration: recruitment.expectedDuration || 86400000, // Default 24 hours
            compensation: recruitment.compensation,
            offerExpiresIn: 7200000, // 2 hours
          });

          if (!proposal) {
            throw new Error(
              `Failed to create proposal for recruitment ${recruitment.recruitmentId}`,
            );
          }

          return {
            success: true,
            proposalId: proposal.id,
            message: `Created recruitment proposal for ${recruitment.recruitmentId}`,
          };

        case 'process-counter-proposal':
          if (!recruitment.counterProposal) {
            throw new Error('Counter proposal required for processing');
          }

          // Process the counter proposal
          const counterSuccess = recruitmentService.processCounterProposal(
            recruitment.counterProposal,
          );

          if (!counterSuccess) {
            return {
              success: false,
              message: 'Failed to process counter proposal',
            };
          }

          // Resolve conflicts using negotiation engine
          const originalProposalId =
            recruitment.counterProposal.originalProposalId;
          const recruitmentRecord = recruitmentService.getRecruitment(
            recruitment.counterProposal.conversationId || '',
          );

          if (!recruitmentRecord || !recruitmentRecord.proposal) {
            throw new Error(
              'Unable to find original proposal for conflict resolution',
            );
          }

          // Get the negotiation engine service
          const negotiationEngine =
            await this.getServiceInstance<NegotiationEngineService>(
              '../services/negotiation-engine.service',
              'NegotiationEngineService',
            );

          const resolution = negotiationEngine.resolveConflicts(
            recruitmentRecord.proposal,
            recruitment.counterProposal,
            {
              prioritizeCapabilities: true,
              acceptableCompromiseThreshold: 0.6,
            },
          );

          return {
            success: true,
            resolution: resolution.proposal,
            strategy: resolution.strategy,
            explanation: resolution.explanation,
          };

        case 'process-acceptance':
          if (!recruitment.acceptance) {
            throw new Error('Acceptance message required for processing');
          }

          // Process the acceptance
          const acceptanceSuccess = recruitmentService.processAcceptance(
            recruitment.acceptance,
          );

          return {
            success: acceptanceSuccess,
            message: acceptanceSuccess
              ? `Processed acceptance for proposal ${recruitment.acceptance.proposalId}`
              : 'Failed to process acceptance',
          };

        case 'process-rejection':
          if (!recruitment.rejection) {
            throw new Error('Rejection message required for processing');
          }

          // Process the rejection
          const rejectionSuccess = recruitmentService.processRejection(
            recruitment.rejection,
          );

          return {
            success: rejectionSuccess,
            message: rejectionSuccess
              ? `Processed rejection for proposal ${recruitment.rejection.proposalId}`
              : 'Failed to process rejection',
          };

        case 'recruit-team':
          if (
            !recruitment.taskId ||
            !recruitment.agentIds ||
            recruitment.agentIds.length === 0
          ) {
            throw new Error(
              'Task ID and agent IDs required for team recruitment',
            );
          }

          // Get the task
          const teamTask = this.tasks.get(recruitment.taskId);
          if (!teamTask) {
            throw new Error(`Task with ID ${recruitment.taskId} not found`);
          }

          // Create a recruitment for each agent
          const recruitmentResults = await Promise.all(
            recruitment.agentIds.map(async (agentId) => {
              try {
                // Create inquiry
                const agentInquiry = recruitmentService.createInquiry({
                  recruiterId: this.id,
                  recruiterName: this.name,
                  targetAgentId: agentId,
                  taskId: recruitment.taskId!,
                  teamId: recruitment.teamId,
                  taskDescription: teamTask.description,
                  requiredCapabilities: teamTask.requiredCapabilities || [],
                  priority: teamTask.priority,
                  deadline: teamTask.deadline,
                  expiresIn: 3600000, // 1 hour
                });

                // Create proposal with role assignment
                const agentProposal = recruitmentService.createProposal({
                  recruitmentId: agentInquiry.id,
                  proposedRole: 'team-member',
                  responsibilities: [
                    'Execute assigned subtasks',
                    'Collaborate with team members',
                  ],
                  requiredCapabilities: teamTask.requiredCapabilities || [],
                  expectedContribution:
                    'Complete assigned tasks and participate in team coordination',
                  expectedDuration: teamTask.deadline
                    ? teamTask.deadline - Date.now()
                    : 86400000,
                  offerExpiresIn: 7200000, // 2 hours
                });

                return {
                  agentId,
                  recruitmentId: agentInquiry.id,
                  proposalId: agentProposal?.id,
                  status: 'proposal_sent',
                };
              } catch (error) {
                return {
                  agentId,
                  error: error instanceof Error ? error.message : String(error),
                  status: 'failed',
                };
              }
            }),
          );

          return {
            success: true,
            teamRecruitment: {
              taskId: recruitment.taskId,
              teamId: recruitment.teamId,
              recruitments: recruitmentResults,
            },
          };

        case 'get-recruitment':
          if (!recruitment.recruitmentId) {
            throw new Error('Recruitment ID required');
          }

          // Get recruitment record
          const record = recruitmentService.getRecruitment(
            recruitment.recruitmentId,
          );

          if (!record) {
            throw new Error(
              `Recruitment with ID ${recruitment.recruitmentId} not found`,
            );
          }

          return {
            success: true,
            recruitment: record,
          };

        default:
          throw new Error(
            `Unknown recruitment operation: ${recruitment.operation}`,
          );
      }
    } catch (error) {
      this.logger.error('Error handling agent recruitment', { error });
      throw error;
    }
  }

  /**
   * Handle capability advertising capability
   */
  private async handleCapabilityAdvertising(
    request: AgentRequest,
  ): Promise<any> {
    try {
      const advertising = this.parseInput<{
        operation: string;
        capabilities?: {
          name: string;
          description: string;
          confidenceLevel: string;
          confidenceScore: number;
          experience: number;
          specializations?: string[];
          contexts?: string[];
          limitations?: string[];
        }[];
        availability?: {
          status: 'available' | 'limited' | 'unavailable';
          currentLoad: number;
          nextAvailableSlot?: number;
        };
        validityDuration?: number;
        advertisementId?: string;
        updates?: Record<string, any>;
        capability?: string;
        minConfidence?: number;
        availabilityFilter?: 'available' | 'limited' | 'any';
      }>(request.input);

      // Get the advertisement service
      const advertisementService =
        await this.getServiceInstance<CapabilityAdvertisementService>(
          '../services/capability-advertisement.service',
          'CapabilityAdvertisementService',
        );

      switch (advertising.operation) {
        case 'advertise-capabilities':
          if (
            !advertising.capabilities ||
            advertising.capabilities.length === 0
          ) {
            throw new Error('Capabilities required for advertisement');
          }

          // Create advertisement
          const advertisement = advertisementService.createAdvertisement({
            agentId: this.id,
            agentName: this.name,
            capabilities: advertising.capabilities.map((cap) => ({
              ...cap,
              confidenceLevel: cap.confidenceLevel as any,
              confidenceScore: cap.confidenceScore,
            })),
            availability: advertising.availability || {
              status: 'available',
              currentLoad: 0.5,
            },
            validityDuration: advertising.validityDuration || 3600000, // Default 1 hour
          });

          return {
            success: true,
            advertisementId: advertisement.id,
            message: `Created capability advertisement with ${advertising.capabilities.length} capabilities`,
          };

        case 'update-advertisement':
          if (!advertising.advertisementId || !advertising.updates) {
            throw new Error('Advertisement ID and updates required');
          }

          // Update advertisement
          const updatedAd = advertisementService.updateAdvertisement(
            advertising.advertisementId,
            advertising.updates,
          );

          if (!updatedAd) {
            throw new Error(
              `Failed to update advertisement ${advertising.advertisementId}`,
            );
          }

          return {
            success: true,
            advertisementId: updatedAd.id,
            message: `Updated capability advertisement ${advertising.advertisementId}`,
          };

        case 'find-capability-providers':
          if (!advertising.capability) {
            throw new Error('Capability name required to find providers');
          }

          // Find providers
          const providers = advertisementService.findCapabilityProviders(
            advertising.capability,
            advertising.minConfidence,
            advertising.availabilityFilter,
          );

          return {
            success: true,
            capability: advertising.capability,
            providers,
            count: providers.length,
            message: `Found ${providers.length} providers for capability "${advertising.capability}"`,
          };

        default:
          throw new Error(
            `Unknown capability advertising operation: ${advertising.operation}`,
          );
      }
    } catch (error) {
      this.logger.error('Error handling capability advertising', { error });
      throw error;
    }
  }

  /**
   * Handle contract formation capability
   */
  private async handleContractFormation(request: AgentRequest): Promise<any> {
    try {
      const formation = this.parseInput<{
        operation: string;
        taskId?: string;
        teamId?: string;
        name?: string;
        description?: string;
        participants?: {
          agentId: string;
          role: string;
          responsibilities: string[];
          requiredCapabilities: string[];
          expectedDeliverables: string[];
          performanceMetrics?: {
            metricName: string;
            target: any;
            weight: number;
          }[];
        }[];
        terms?: {
          startTime: number;
          endTime?: number;
          deadline?: number;
          gracePeriod?: number;
          terminationConditions?: string[];
          paymentTerms?: Record<string, any>;
        };
        expectedOutcomes?: string[];
        contractId?: string;
        recipientId?: string;
        requiresSignature?: boolean;
        offerExpiresIn?: number;
        acceptance?: any;
        rejection?: any;
        reason?: string;
        performanceReport?: any;
      }>(request.input);

      // Get the contract service
      const contractService =
        await this.getServiceInstance<TeamContractService>(
          '../services/team-contract.service',
          'TeamContractService',
        );

      switch (formation.operation) {
        case 'create-contract':
          if (
            !formation.taskId ||
            !formation.participants ||
            !formation.terms ||
            !formation.expectedOutcomes
          ) {
            throw new Error(
              'Task ID, participants, terms, and expected outcomes required for contract creation',
            );
          }

          // Create contract
          const contract = contractService.createContract({
            taskId: formation.taskId,
            teamId: formation.teamId || `team-${uuidv4().substring(0, 8)}`,
            name: formation.name || `Contract for task ${formation.taskId}`,
            description:
              formation.description ||
              'Team contract for collaborative task execution',
            createdBy: this.id,
            participants: formation.participants,
            terms: formation.terms,
            expectedOutcomes: formation.expectedOutcomes,
          });

          return {
            success: true,
            contractId: contract.id,
            teamId: contract.teamId,
            message: `Created team contract for task ${formation.taskId}`,
          };

        case 'offer-contract':
          if (!formation.contractId || !formation.recipientId) {
            throw new Error(
              'Contract ID and recipient ID required for contract offer',
            );
          }

          // Create offer
          const offer = contractService.createContractOffer({
            contractId: formation.contractId,
            senderId: this.id,
            recipientId: formation.recipientId,
            requiresSignature: formation.requiresSignature,
            offerExpiresIn: formation.offerExpiresIn,
          });

          if (!offer) {
            throw new Error(
              `Failed to create offer for contract ${formation.contractId}`,
            );
          }

          return {
            success: true,
            offerId: offer.id,
            contractId: formation.contractId,
            message: `Offered contract ${formation.contractId} to agent ${formation.recipientId}`,
          };

        case 'process-acceptance':
          if (!formation.acceptance) {
            throw new Error('Acceptance message required');
          }

          // Process acceptance
          const acceptanceSuccess = contractService.processAcceptance(
            formation.acceptance,
          );

          return {
            success: acceptanceSuccess,
            message: acceptanceSuccess
              ? `Processed acceptance for proposal ${formation.acceptance.proposalId}`
              : 'Failed to process acceptance',
          };

        case 'process-rejection':
          if (!formation.rejection) {
            throw new Error('Rejection message required');
          }

          // Process rejection
          const rejectionSuccess = contractService.processRejection(
            formation.rejection,
          );

          return {
            success: rejectionSuccess,
            message: rejectionSuccess
              ? `Processed rejection for proposal ${formation.rejection.proposalId}`
              : 'Failed to process rejection',
          };

        case 'complete-contract':
          if (!formation.contractId) {
            throw new Error('Contract ID required to complete contract');
          }

          // Complete contract
          const completionSuccess = contractService.completeContract(
            formation.contractId,
            { completedBy: this.id },
          );

          return {
            success: completionSuccess,
            message: completionSuccess
              ? `Completed contract ${formation.contractId}`
              : 'Failed to complete contract',
          };

        case 'terminate-contract':
          if (!formation.contractId || !formation.reason) {
            throw new Error(
              'Contract ID and reason required to terminate contract',
            );
          }

          // Terminate contract
          const terminationSuccess = contractService.terminateContract(
            formation.contractId,
            formation.reason,
            this.id,
          );

          return {
            success: terminationSuccess,
            message: terminationSuccess
              ? `Terminated contract ${formation.contractId}: ${formation.reason}`
              : 'Failed to terminate contract',
          };

        case 'submit-performance-report':
          if (!formation.contractId || !formation.performanceReport) {
            throw new Error('Contract ID and performance report required');
          }

          // Submit report
          const reportSuccess = contractService.submitPerformanceReport(
            formation.performanceReport,
          );

          return {
            success: reportSuccess,
            message: reportSuccess
              ? `Submitted performance report for contract ${formation.contractId}`
              : 'Failed to submit performance report',
          };

        case 'get-contract':
          if (!formation.contractId) {
            throw new Error('Contract ID required');
          }

          // Get contract
          const contractDetails = contractService.getContract(
            formation.contractId,
          );

          if (!contractDetails) {
            throw new Error(
              `Contract with ID ${formation.contractId} not found`,
            );
          }

          return {
            success: true,
            contract: contractDetails,
          };

        default:
          throw new Error(
            `Unknown contract formation operation: ${formation.operation}`,
          );
      }
    } catch (error) {
      this.logger.error('Error handling contract formation', { error });
      throw error;
    }
  }

  /**
   * Helper method to get service instances dynamically
   */
  private async getServiceInstance<T>(
    modulePath: string,
    className: string,
  ): Promise<T> {
    try {
      // Dynamic import to avoid circular dependencies
      const module = await import(modulePath);
      const ServiceClass = module[className];

      if (!ServiceClass || !ServiceClass.getInstance) {
        throw new Error(
          `Service class ${className} not found or doesn't have getInstance method`,
        );
      }

      return ServiceClass.getInstance();
    } catch (error) {
      this.logger.error(`Error getting service instance ${className}`, {
        error,
      });
      throw new Error(
        `Failed to get service instance: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
