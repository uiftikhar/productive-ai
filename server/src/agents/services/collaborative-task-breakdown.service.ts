/**
 * Collaborative Task Breakdown Service
 * 
 * Facilitates collaborative task breakdown between multiple agents.
 * Agents propose subtask structures, evaluate proposals, and reach consensus.
 * @deprecated Will be replaced by agentic self-organizing behavior
 */

import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { LangChainConfig } from '../../langchain/config';
import { BaseAgentInterface, AgentRequest, AgentResponse } from '../interfaces/base-agent.interface';
import { AgentRegistryService } from './agent-registry.service';
import { AgentDiscoveryService } from './agent-discovery.service';
import { TaskPlanningService, TaskPlan, PlannedTask, TaskDecompositionOptions } from './task-planning.service';

// Input/output interfaces for collaborative task breakdown
interface TaskBreakdownInput {
  taskName: string;
  taskDescription: string;
  planDescription: string;
  planContext?: Record<string, any>;
  taskContext?: Record<string, any>;
  maxSubtasks: number;
  additionalContext?: Record<string, any>;
}

interface TaskEvaluationInput {
  proposalsToEvaluate: Array<{
    id: string;
    agentName: string;
    proposedSubtasks: Partial<PlannedTask>[];
    reasoning: string;
  }>;
  evaluationCriteria: string[];
  taskContext?: Record<string, any>;
}

interface TaskBreakdownOutput {
  subtasks: Partial<PlannedTask>[];
  reasoning: string;
}

interface TaskEvaluationOutput {
  votes: ProposalVote[];
}

/**
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface SubtaskProposal {
  id: string;
  agentId: string;
  agentName: string;
  parentTaskId: string;
  proposedSubtasks: Partial<PlannedTask>[];
  reasoning: string;
  timestamp: number;
  score?: number; // Assigned during evaluation
  metadata?: Record<string, any>;
}

/**
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface ProposalVote {
  id: string;
  proposalId: string;
  agentId: string;
  agentName: string;
  vote: 'approve' | 'reject' | 'abstain';
  score: number; // 0-10 score
  feedback: string;
  timestamp: number;
}

/**
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface ProposalEvaluation {
  proposalId: string;
  votes: ProposalVote[];
  averageScore: number;
  consensusReached: boolean;
  selectedProposal: boolean;
  feedback: string[];
}

/**
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface CollaborativeBreakdownOptions extends TaskDecompositionOptions {
  contributingAgentIds?: string[];
  minContributors?: number;
  maxContributors?: number;
  consensusThreshold?: number; 
  minEvaluators?: number;
  evaluationCriteria?: string[];
  timeLimit?: number;
  facilitatorId?: string;
  context?: Record<string, any>; // Added context field
}

/**
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export interface CollaborativeTaskBreakdownConfig {
  logger?: Logger;
  llm?: any;
  agentRegistry?: AgentRegistryService;
  agentDiscovery?: AgentDiscoveryService;
  taskPlanningService?: TaskPlanningService;
  defaultConsensusThreshold?: number;
  defaultMinContributors?: number;
  defaultMaxContributors?: number;
  defaultMinEvaluators?: number;
}

/**
 * Service for collaborative task breakdown and consensus building
 */
export class CollaborativeTaskBreakdownService {
  private static instance: CollaborativeTaskBreakdownService;
  private logger: Logger;
  private llm: ChatOpenAI;
  private agentRegistry: AgentRegistryService;
  private agentDiscovery: AgentDiscoveryService;
  private taskPlanningService: TaskPlanningService;
  
  // Settings
  private defaultConsensusThreshold: number = 0.7;
  private defaultMinContributors: number = 2;
  private defaultMaxContributors: number = 5;
  private defaultMinEvaluators: number = 2;
  
  // Storage
  private proposals: Map<string, SubtaskProposal> = new Map();
  private evaluations: Map<string, ProposalEvaluation> = new Map();
  private sessions: Map<string, {
    planId: string;
    taskId: string;
    proposals: string[];
    contributors: string[];
    evaluators: string[];
    status: 'gathering' | 'evaluating' | 'completed' | 'failed';
    startTime: number;
    endTime?: number;
    result?: string; // ID of winning proposal
  }> = new Map();

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: CollaborativeTaskBreakdownConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.llm = config.llm || new ChatOpenAI({
      modelName: LangChainConfig.llm.model,
      temperature: 0.3,
      maxTokens: LangChainConfig.llm.maxTokens,
    });
    
    this.agentRegistry = config.agentRegistry || AgentRegistryService.getInstance();
    this.agentDiscovery = config.agentDiscovery || AgentDiscoveryService.getInstance();
    this.taskPlanningService = config.taskPlanningService || TaskPlanningService.getInstance();
    
    if (config.defaultConsensusThreshold) {
      this.defaultConsensusThreshold = config.defaultConsensusThreshold;
    }
    
    if (config.defaultMinContributors) {
      this.defaultMinContributors = config.defaultMinContributors;
    }
    
    if (config.defaultMaxContributors) {
      this.defaultMaxContributors = config.defaultMaxContributors;
    }
    
    if (config.defaultMinEvaluators) {
      this.defaultMinEvaluators = config.defaultMinEvaluators;
    }
    
    this.logger.info('Initialized CollaborativeTaskBreakdownService');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    config: CollaborativeTaskBreakdownConfig = {},
  ): CollaborativeTaskBreakdownService {
    if (!CollaborativeTaskBreakdownService.instance) {
      CollaborativeTaskBreakdownService.instance = new CollaborativeTaskBreakdownService(config);
    }
    return CollaborativeTaskBreakdownService.instance;
  }

  /**
   * Start a collaborative task breakdown session
   * @param planId ID of the task plan
   * @param taskId ID of the task to break down
   * @param options Options for the collaborative breakdown
   * @returns Session ID
   */
  async startCollaborativeBreakdown(
    planId: string,
    taskId: string,
    options: CollaborativeBreakdownOptions = {},
  ): Promise<string> {
    const plan = this.taskPlanningService.getTaskPlan(planId);
    if (!plan) {
      throw new Error(`Task plan not found: ${planId}`);
    }
    
    const task = plan.tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    
    this.logger.info(`Starting collaborative breakdown for task: ${task.name}`);
    
    // Create a session ID
    const sessionId = uuidv4();
    
    // Select contributing agents
    const contributingAgents = await this.selectContributingAgents(task, options);
    if (contributingAgents.length < (options.minContributors || this.defaultMinContributors)) {
      throw new Error(`Not enough contributing agents available for task breakdown`);
    }
    
    // Create session
    this.sessions.set(sessionId, {
      planId,
      taskId,
      proposals: [],
      contributors: contributingAgents.map(a => a.id),
      evaluators: [], // Will be populated during evaluation phase
      status: 'gathering',
      startTime: Date.now(),
    });
    
    // Request proposals from each contributor asynchronously
    const proposalPromises = contributingAgents.map(agent => 
      this.requestProposal(sessionId, agent, plan, task, options)
    );
    
    // Wait for all proposals to complete
    await Promise.all(proposalPromises);
    
    // Move to evaluation phase
    await this.evaluateProposals(sessionId, options);
    
    return sessionId;
  }

  /**
   * Select agents to contribute to task breakdown
   */
  private async selectContributingAgents(
    task: PlannedTask,
    options: CollaborativeBreakdownOptions,
  ): Promise<BaseAgentInterface[]> {
    let candidates: BaseAgentInterface[] = [];
    
    // If specific agent IDs are provided, use those
    if (options.contributingAgentIds && options.contributingAgentIds.length > 0) {
      for (const agentId of options.contributingAgentIds) {
        const agent = this.agentRegistry.getAgent(agentId);
        if (agent) {
          candidates.push(agent);
        }
      }
    } else {
      // Otherwise, find agents with relevant capabilities
      const requiredCapabilities = task.requiredCapabilities || [];
      if (requiredCapabilities.length > 0) {
        // Find agents with relevant capabilities
        candidates = this.findAgentsByCapabilities(requiredCapabilities);
      } else {
        // If no capabilities specified, use all available agents
        candidates = this.agentRegistry.listAgents();
      }
    }
    
    // Apply limits
    const maxContributors = options.maxContributors || this.defaultMaxContributors;
    return candidates.slice(0, maxContributors);
  }

  /**
   * Find agents that have any of the specified capabilities
   */
  private findAgentsByCapabilities(capabilities: string[]): BaseAgentInterface[] {
    const agents = this.agentRegistry.listAgents();
    
    return agents.filter(agent => {
      const agentCapabilities = agent.getCapabilities().map(c => c.name);
      return capabilities.some(cap => agentCapabilities.includes(cap));
    });
  }

  /**
   * Request a proposal from an agent
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private async requestProposal(
    sessionId: string,
    agent: BaseAgentInterface,
    plan: TaskPlan,
    task: PlannedTask,
    options: CollaborativeBreakdownOptions,
  ): Promise<SubtaskProposal> {
    const proposalId = uuidv4();
    
    try {
      // Prepare context for the agent
      const context = JSON.stringify({
        taskName: task.name,
        taskDescription: task.description,
        planDescription: plan.description,
        planContext: plan.context,
        taskContext: task.metadata,
        maxSubtasks: options.maxSubtasks || 10,
        additionalContext: options.context,
      });
      
      // Request proposal from the agent
      const response = await agent.execute({
        capability: 'task-breakdown',
        input: context,
        parameters: {
          collaborative: true,
          sessionId,
        },
      });
      
      // Parse the response
      let proposedSubtasks: Partial<PlannedTask>[] = [];
      let reasoning = '';
      
      if (response.success) {
        if (Array.isArray(response.output)) {
          proposedSubtasks = response.output as Partial<PlannedTask>[];
        } else if (typeof response.output === 'object' && response.output !== null) {
          // Handle structured output with subtasks
          const outputObj = response.output as any;
          if (outputObj.subtasks && Array.isArray(outputObj.subtasks)) {
            proposedSubtasks = outputObj.subtasks;
            reasoning = outputObj.reasoning || '';
          }
        }
      }
      
      // Create the proposal object
      const proposal: SubtaskProposal = {
        id: proposalId,
        agentId: agent.id,
        agentName: agent.name,
        parentTaskId: task.id,
        proposedSubtasks,
        reasoning,
        timestamp: Date.now(),
        metadata: response.metrics || {},
      };
      
      this.proposals.set(proposal.id, proposal);
      
      return proposal;
    } catch (error) {
      this.logger.error(`Error requesting proposal from agent ${agent.id}`, {
        error,
        sessionId,
      });
      
      // Return an empty proposal on error
      return {
        id: proposalId,
        agentId: agent.id,
        agentName: agent.name,
        parentTaskId: task.id,
        proposedSubtasks: [],
        reasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Evaluate proposals and build consensus
   */
  private async evaluateProposals(
    sessionId: string,
    options: CollaborativeBreakdownOptions,
  ): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    if (session.proposals.length === 0) {
      throw new Error(`No proposals received for session: ${sessionId}`);
    }
    
    // Update session status
    session.status = 'evaluating';
    this.sessions.set(sessionId, session);
    
    this.logger.info(`Evaluating ${session.proposals.length} proposals for session: ${sessionId}`);
    
    // If only one proposal, skip voting
    if (session.proposals.length === 1) {
      const proposalId = session.proposals[0];
      
      // Create evaluation record
      const evaluation: ProposalEvaluation = {
        proposalId,
        votes: [],
        averageScore: 10, // Perfect score for sole proposal
        consensusReached: true,
        selectedProposal: true,
        feedback: ['Only proposal available, automatically selected'],
      };
      
      this.evaluations.set(proposalId, evaluation);
      
      // Update session
      session.status = 'completed';
      session.result = proposalId;
      session.endTime = Date.now();
      this.sessions.set(sessionId, session);
      
      return proposalId;
    }
    
    // Select evaluating agents (different from the contributors if possible)
    const evaluatingAgents = await this.selectEvaluatingAgents(session, options);
    if (evaluatingAgents.length < (options.minEvaluators || this.defaultMinEvaluators)) {
      throw new Error(`Not enough evaluating agents available`);
    }
    
    // Update session with evaluators
    session.evaluators = evaluatingAgents.map(a => a.id);
    this.sessions.set(sessionId, session);
    
    // Get proposals
    const proposals = session.proposals.map(id => this.proposals.get(id)!);
    
    // Request votes from each evaluator
    const votePromises = evaluatingAgents.map(agent => 
      this.requestVotes(agent, proposals, options)
    );
    
    // Wait for all votes
    const allVotes = await Promise.all(votePromises);
    
    // Flatten votes and group by proposal
    const votesByProposal = new Map<string, ProposalVote[]>();
    for (const votes of allVotes) {
      for (const vote of votes) {
        if (!votesByProposal.has(vote.proposalId)) {
          votesByProposal.set(vote.proposalId, []);
        }
        votesByProposal.get(vote.proposalId)!.push(vote);
      }
    }
    
    // Calculate scores and select the winning proposal
    const evaluations: ProposalEvaluation[] = [];
    let bestProposal: { id: string; score: number } = { id: '', score: -1 };
    
    for (const proposal of proposals) {
      const votes = votesByProposal.get(proposal.id) || [];
      const totalScore = votes.reduce((sum, vote) => sum + vote.score, 0);
      const averageScore = votes.length > 0 ? totalScore / votes.length : 0;
      
      // Calculate consensus metrics
      const approvalCount = votes.filter(v => v.vote === 'approve').length;
      const consensusReached = approvalCount / votes.length >= (options.consensusThreshold || this.defaultConsensusThreshold);
      
      // Gather feedback
      const feedback = votes.map(v => `${v.agentName}: ${v.feedback}`);
      
      const evaluation: ProposalEvaluation = {
        proposalId: proposal.id,
        votes,
        averageScore,
        consensusReached,
        selectedProposal: false, // Will update after finding the best
        feedback,
      };
      
      evaluations.push(evaluation);
      
      // Check if this is the best proposal so far
      if (averageScore > bestProposal.score) {
        bestProposal = { id: proposal.id, score: averageScore };
      }
    }
    
    // Mark the winning proposal
    if (bestProposal.id) {
      const winningEvaluation = evaluations.find(e => e.proposalId === bestProposal.id);
      if (winningEvaluation) {
        winningEvaluation.selectedProposal = true;
      }
    }
    
    // Store evaluations
    for (const evaluation of evaluations) {
      this.evaluations.set(evaluation.proposalId, evaluation);
    }
    
    // Update session
    session.status = 'completed';
    session.result = bestProposal.id;
    session.endTime = Date.now();
    this.sessions.set(sessionId, session);
    
    return bestProposal.id;
  }

  /**
   * Select agents to evaluate proposals
   */
  private async selectEvaluatingAgents(
    session: {
      contributors: string[];
      [key: string]: any;
    },
    options: CollaborativeBreakdownOptions,
  ): Promise<BaseAgentInterface[]> {
    const contributors = new Set(session.contributors);
    const minEvaluators = options.minEvaluators || this.defaultMinEvaluators;
    const allAgents = this.agentRegistry.listAgents();
    
    // Prefer agents that weren't contributors
    const nonContributors = allAgents.filter(agent => !contributors.has(agent.id));
    
    if (nonContributors.length >= minEvaluators) {
      // If we have enough non-contributors, use them
      return nonContributors.slice(0, minEvaluators);
    }
    
    // Otherwise, use a mix of non-contributors and contributors
    const evaluators = [...nonContributors];
    const contributorAgents = allAgents.filter(agent => contributors.has(agent.id));
    
    // Add contributors until we reach the minimum
    while (evaluators.length < minEvaluators && contributorAgents.length > 0) {
      evaluators.push(contributorAgents.shift()!);
    }
    
    return evaluators;
  }

  /**
   * Request votes from an agent
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private async requestVotes(
    agent: BaseAgentInterface,
    proposals: SubtaskProposal[],
    options: CollaborativeBreakdownOptions,
  ): Promise<ProposalVote[]> {
    try {
      // Prepare evaluation context
      const context = JSON.stringify({
        proposalsToEvaluate: proposals.map(p => ({
          id: p.id,
          agentName: p.agentName,
          proposedSubtasks: p.proposedSubtasks,
          reasoning: p.reasoning,
        })),
        evaluationCriteria: options.evaluationCriteria || [
          'Completeness',
          'Efficiency',
          'Clarity',
          'Appropriateness',
        ],
        taskContext: options.context,
      });
      
      // Request evaluation from agent
      const response = await agent.execute({
        capability: 'task-evaluation',
        input: context,
        parameters: {
          collaborative: true,
          proposalIds: proposals.map(p => p.id),
        },
      });
      
      // Parse votes from response
      let votes: ProposalVote[] = [];
      
      if (response.success) {
        if (Array.isArray(response.output)) {
          votes = response.output as ProposalVote[];
        } else if (typeof response.output === 'object' && response.output !== null) {
          // Handle structured output with votes
          const outputObj = response.output as any;
          if (outputObj.votes && Array.isArray(outputObj.votes)) {
            votes = outputObj.votes;
          }
        }
      }
      
      // Validate and fix votes
      return votes
        .filter(vote => {
          // Ensure required fields exist
          const valid = 
            !!vote.proposalId && 
            (vote.vote === 'approve' || vote.vote === 'reject' || vote.vote === 'abstain') &&
            typeof vote.score === 'number';
          
          if (!valid) {
            this.logger.warn(`Invalid vote structure received from ${agent.id}`, { vote });
          }
          
          return valid;
        })
        .map(vote => ({
          ...vote,
          id: vote.id || uuidv4(),
          agentId: agent.id,
          agentName: agent.name,
          timestamp: vote.timestamp || Date.now(),
        }));
    } catch (error) {
      this.logger.error(`Error requesting votes from agent ${agent.id}`, {
        error,
      });
      
      return [];
    }
  }

  /**
   * Get the results of a collaborative breakdown session
   */
  getSessionResult(sessionId: string): {
    status: string;
    proposals: SubtaskProposal[];
    evaluations: ProposalEvaluation[];
    winningProposal?: SubtaskProposal;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    const proposals = session.proposals.map(id => this.proposals.get(id)!);
    const evaluations = proposals.map(p => this.evaluations.get(p.id));
    
    let winningProposal: SubtaskProposal | undefined;
    if (session.result) {
      winningProposal = this.proposals.get(session.result);
    }
    
    return {
      status: session.status,
      proposals,
      evaluations: evaluations.filter(e => e !== undefined) as ProposalEvaluation[],
      winningProposal,
    };
  }

  /**
   * Apply the winning proposal to the task plan
   */
  async applyWinningProposal(
    sessionId: string,
  ): Promise<PlannedTask[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    
    if (session.status !== 'completed') {
      throw new Error(`Session not completed: ${sessionId}`);
    }
    
    if (!session.result) {
      throw new Error(`No winning proposal for session: ${sessionId}`);
    }
    
    const winningProposal = this.proposals.get(session.result);
    if (!winningProposal) {
      throw new Error(`Winning proposal not found: ${session.result}`);
    }
    
    // Convert proposed subtasks to PlannedTask objects
    const subtasks: Partial<PlannedTask>[] = winningProposal.proposedSubtasks.map(subtask => ({
      ...subtask,
      id: subtask.id || uuidv4(),
      status: 'pending',
      parentTaskId: winningProposal.parentTaskId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {
        ...subtask.metadata,
        proposedBy: winningProposal.agentId,
        sessionId,
        collaborative: true,
      },
    }));
    
    // Add the subtasks to the plan
    const plan = this.taskPlanningService.getTaskPlan(session.planId);
    if (!plan) {
      throw new Error(`Task plan not found: ${session.planId}`);
    }
    
    const addedSubtasks: PlannedTask[] = [];
    for (const subtask of subtasks) {
      const fullSubtask: PlannedTask = {
        id: subtask.id!,
        name: subtask.name!,
        description: subtask.description!,
        status: subtask.status!,
        priority: subtask.priority || 5,
        dependencies: subtask.dependencies || [],
        requiredCapabilities: subtask.requiredCapabilities || [],
        parentTaskId: subtask.parentTaskId,
        createdAt: subtask.createdAt!,
        updatedAt: subtask.updatedAt!,
        metadata: subtask.metadata || {},
      };
      
      // Add to plan
      if (this.taskPlanningService.addTask(session.planId, fullSubtask)) {
        addedSubtasks.push(fullSubtask);
      }
    }
    
    return addedSubtasks;
  }

  /**
   * Get an agent by ID - helper for facilitator-supervisor
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  public getAgent(agentId: string): BaseAgentInterface | undefined {
    return this.agentRegistry.getAgent(agentId);
  }
  
  /**
   * Store task - helper for facilitator-supervisor
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  public storeTask(task: any): void {
    this.logger.info(`Storing task via collaborative service: ${task.id}`);
    // Implementation would depend on the specific requirements
  }
} 