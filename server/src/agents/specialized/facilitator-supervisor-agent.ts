/**
 * Facilitator Supervisor Agent
 * 
 * Specialized supervisor agent that facilitates collaboration between agents.
 * Encourages collaborative task breakdown, team decision making, and emergent delegation.
 * @deprecated Will be replaced by agentic self-organizing behavior
 */

import { v4 as uuidv4 } from 'uuid';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
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
  TaskPlanningService, 
  PlannedTask, 
  TaskPlan, 
  TaskDecompositionOptions 
} from '../services/task-planning.service';
import { 
  CollaborativeTaskBreakdownService,
  CollaborativeBreakdownOptions
} from '../services/collaborative-task-breakdown.service';
import { 
  TeamAssemblyService, 
  Team, 
  TeamFormationOptions 
} from '../services/team-assembly.service';
import { 
  DelegationProtocolService,
  TaskDelegationRequest,
  TaskDelegationResult
} from '../services/delegation-protocol.service';
import { SupervisorAgent, Task, TeamMember } from './supervisor-agent';

/**
 * Voting structure for decision making
 */
export interface VotingResult {
  decision: string;
  options: Array<{
    option: string;
    votes: number;
    voters: string[];
  }>;
  participated: number;
  total: number;
  timestamp: number;
}

/**
 * Team suggestion structure
 */
export interface TeamSuggestion {
  id: string;
  suggestion: string;
  supportingAgents: string[];
  weight: number; // Calculated importance/relevance
  resolved: boolean;
  outcome?: string;
  createdAt: number;
  resolvedAt?: number;
}

/**
 * Configuration for FacilitatorSupervisorAgent
 */
export interface FacilitatorSupervisorConfig {
  id?: string;
  name?: string;
  description?: string;
  logger?: Logger;
  llm?: LLMInterface | ChatOpenAI;
  agentRegistry?: AgentRegistryService;
  taskPlanningService?: TaskPlanningService;
  collaborativeTaskBreakdown?: CollaborativeTaskBreakdownService;
  teamAssembly?: TeamAssemblyService;
  delegationProtocol?: DelegationProtocolService;
  defaultTeamMembers?: TeamMember[];
  consensusThreshold?: number;
}

// Define interfaces for request inputs
interface ConsensusRequestInput {
  operation: string;
}

interface StartVoteRequestInput {
  question: string;
  options: string[];
  deadline?: string | number;
  participants?: string | string[];
}

interface CastVoteRequestInput {
  votingId: string;
  agentId: string;
  vote: string;
}

interface GetVotingResultRequestInput {
  votingId: string;
  forceResult?: boolean;
}

interface SuggestionRequestInput {
  operation: string;
}

interface SubmitSuggestionRequestInput {
  suggestion: string;
  agentId: string;
  weight?: number;
}

interface SupportSuggestionRequestInput {
  suggestionId: string;
  agentId: string;
  additionalWeight?: number;
}

interface ResolveSuggestionRequestInput {
  suggestionId: string;
  outcome: string;
  resolverId?: string;
}

interface ListSuggestionsRequestInput {
  status?: string;
}

/**
 * FacilitatorSupervisorAgent
 * 
 * Implements a facilitation approach to team coordination rather than direct control.
 * Encourages collaborative task breakdown, team decision making, and emergent delegation.
 */
export class FacilitatorSupervisorAgent extends SupervisorAgent {
  private collaborativeTaskBreakdown: CollaborativeTaskBreakdownService;
  private teamAssembly: TeamAssemblyService;
  private delegationProtocol: DelegationProtocolService;
  
  // Settings
  private consensusThreshold: number = 0.7; // Percentage needed for consensus
  
  // Store collaborative sessions and voting results
  private collaborativeSessions: Map<string, {
    planId: string;
    taskId: string;
    status: string;
    participants: string[];
    result?: string;
  }> = new Map();
  
  private votingSessions: Map<string, {
    question: string;
    options: string[];
    votes: Record<string, string>;
    deadline: number;
    result?: VotingResult;
  }> = new Map();
  
  private teamSuggestions: Map<string, TeamSuggestion> = new Map();
  
  constructor(options: FacilitatorSupervisorConfig = {}) {
    super({
      id: options.id || `facilitator-supervisor-${uuidv4()}`,
      name: options.name || 'Facilitator Supervisor',
      description: options.description || 'Facilitates collaborative team decision-making and task execution',
      logger: options.logger,
      llm: options.llm,
      agentRegistry: options.agentRegistry,
      taskPlanningService: options.taskPlanningService,
      defaultTeamMembers: options.defaultTeamMembers,
    });
    
    // Initialize specialized services
    this.collaborativeTaskBreakdown = options.collaborativeTaskBreakdown || 
      CollaborativeTaskBreakdownService.getInstance();
    
    this.teamAssembly = options.teamAssembly || 
      TeamAssemblyService.getInstance();
    
    this.delegationProtocol = options.delegationProtocol || 
      DelegationProtocolService.getInstance();
    
    // Apply settings
    if (options.consensusThreshold) {
      this.consensusThreshold = options.consensusThreshold;
    }
    
    // Register additional capabilities
    this.registerCapability({
      name: 'collaborative-task-breakdown',
      description: 'Facilitate collaborative task decomposition by multiple agents',
    });
    
    this.registerCapability({
      name: 'team-assembly',
      description: 'Assemble optimal teams based on task requirements and agent capabilities',
    });
    
    this.registerCapability({
      name: 'consensus-building',
      description: 'Facilitate voting and consensus-building among team members',
    });
    
    this.registerCapability({
      name: 'task-delegation',
      description: 'Facilitate capability-based task delegation among agents',
    });
    
    this.registerCapability({
      name: 'suggestion-coordination',
      description: 'Coordinate team activities based on suggestions rather than commands',
    });
  }

  /**
   * Initialize the agent
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);
    
    this.logger.info('Initializing FacilitatorSupervisorAgent');
    
    // Apply configuration settings
    if (config?.consensusThreshold) {
      this.consensusThreshold = config.consensusThreshold;
    }
    
    this.logger.info('FacilitatorSupervisorAgent initialized successfully');
  }

  /**
   * Execute agent with capability handling for facilitation
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    let result: any;
    
    try {
      if (request.capability) {
        // Parse input if it's a string
        const parsedInput = typeof request.input === 'string' && request.input.trim().startsWith('{') 
          ? JSON.parse(request.input) 
          : null;
          
        switch (request.capability) {
          case 'collaborative-task-breakdown':
            result = await this.handleCollaborativeTaskBreakdown({
              ...request,
              input: parsedInput || request.input,
            });
            break;
            
          case 'team-assembly':
            result = await this.handleTeamAssembly({
              ...request,
              input: parsedInput || request.input,
            });
            break;
            
          case 'consensus-building':
            result = await this.handleConsensusBuilding({
              ...request,
              input: parsedInput || request.input,
            });
            break;
            
          case 'task-delegation':
            result = await this.handleTaskDelegation({
              ...request,
              input: parsedInput || request.input,
            });
            break;
            
          case 'suggestion-coordination':
            result = await this.handleSuggestionCoordination({
              ...request,
              input: parsedInput || request.input,
            });
            break;
            
          default:
            // Delegate to parent for other capabilities
            return super.executeInternal(request);
        }
      } else {
        // No capability specified, delegate to parent
        return super.executeInternal(request);
      }
      
      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        output: result,
        executionTimeMs: executionTime,
        metrics: {
          executionTimeMs: executionTime,
          tokenUsage: this._estimateTokenUsage(request, result),
        }
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error('Error in FacilitatorSupervisorAgent execution', {
        error,
        capability: request.capability,
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: executionTime,
      };
    }
  }
  
  /**
   * Estimate token usage for tracking
   * @private Internal use - renamed to avoid collision with parent class
   */
  private _estimateTokenUsage(request: AgentRequest, result: any): number {
    // Implement a simple estimation based on request and result size
    const requestStr = typeof request.input === 'string' 
      ? request.input 
      : JSON.stringify(request.input);
      
    const resultStr = typeof result === 'string'
      ? result
      : JSON.stringify(result);
      
    // Rough estimate: 1 token per 4 characters
    return Math.ceil((requestStr.length + resultStr.length) / 4);
  }

  /**
   * Handle collaborative task breakdown
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private async handleCollaborativeTaskBreakdown(
    request: AgentRequest,
  ): Promise<any> {
    this.logger.info('Handling collaborative task breakdown');

    // Safely extract data from input
    let planId = '';
    let taskId = '';
    let contributingAgentIds: string[] = [];
    let minContributors = 2;
    let maxContributors = 5;
    let evaluationCriteria: string[] = [];
    let consensusThreshold = 0.7;
    let timeLimit = 0;
    
    // Extract parameters from input if it's an object
    const input = request.input;
    if (typeof input === 'object' && input !== null) {
      if ('planId' in input) planId = String(input.planId);
      if ('taskId' in input) taskId = String(input.taskId);
      if ('contributingAgentIds' in input && Array.isArray(input.contributingAgentIds)) 
        contributingAgentIds = input.contributingAgentIds;
      if ('minContributors' in input) minContributors = Number(input.minContributors);
      if ('maxContributors' in input) maxContributors = Number(input.maxContributors);
      if ('evaluationCriteria' in input && Array.isArray(input.evaluationCriteria)) 
        evaluationCriteria = input.evaluationCriteria;
      if ('consensusThreshold' in input) consensusThreshold = Number(input.consensusThreshold);
      if ('timeLimit' in input) timeLimit = Number(input.timeLimit);
    }
    
    if (!planId || !taskId) {
      throw new Error('Missing required parameters: planId and taskId');
    }
    
    // Request collaborative breakdown
    const sessionId = await this.collaborativeTaskBreakdown.startCollaborativeBreakdown(
      planId,
      taskId,
      {
        contributingAgentIds,
        minContributors,
        maxContributors,
        evaluationCriteria,
        consensusThreshold,
        timeLimit,
        facilitatorId: this.id,
      },
    );
    
    if (!sessionId) {
      throw new Error('Failed to start collaborative breakdown session');
    }
    
    // Wait for result
    let result: any;
    let tries = 0;
    let maxTries = 10;
    
    while (tries < maxTries) {
      try {
        result = this.collaborativeTaskBreakdown.getSessionResult(sessionId);
        
        if (result?.status === 'completed') {
          // Apply the winning proposal
          const subtasks = await this.collaborativeTaskBreakdown.applyWinningProposal(
            sessionId,
          );
          
          return {
            sessionId,
            status: 'completed',
            subtasks,
            winningProposal: result.winningProposal,
          };
        } else if (result?.status === 'failed') {
          throw new Error('Collaborative session failed');
        }
        
        // Wait before checking again
        await new Promise(r => setTimeout(r, 1000));
        tries++;
      } catch (error) {
        this.logger.error('Error checking session status', { error, sessionId });
        tries++;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    return {
      sessionId,
      status: 'pending',
      message: 'Collaborative session is still in progress',
    };
  }

  /**
   * Handle team assembly
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private async handleTeamAssembly(
    request: AgentRequest,
  ): Promise<any> {
    this.logger.info('Handling team assembly');
    
    // Safely extract data from input
    let taskId = '';
    let taskDescription = '';
    let requiredCapabilities: string[] = [];
    let preferredAgentIds: string[] = [];
    let excludedAgentIds: string[] = [];
    let teamSize = 0;
    let strategy = 'balanced';
    let addToSupervisorTeam = false;
    
    // Extract parameters from input if it's an object
    const input = request.input;
    if (typeof input === 'object' && input !== null) {
      if ('taskId' in input) taskId = String(input.taskId);
      if ('taskDescription' in input) taskDescription = String(input.taskDescription);
      if ('requiredCapabilities' in input && Array.isArray(input.requiredCapabilities)) 
        requiredCapabilities = input.requiredCapabilities;
      if ('preferredAgentIds' in input && Array.isArray(input.preferredAgentIds)) 
        preferredAgentIds = input.preferredAgentIds;
      if ('excludedAgentIds' in input && Array.isArray(input.excludedAgentIds)) 
        excludedAgentIds = input.excludedAgentIds;
      if ('teamSize' in input) teamSize = Number(input.teamSize);
      if ('strategy' in input) strategy = String(input.strategy);
      if ('addToSupervisorTeam' in input) addToSupervisorTeam = Boolean(input.addToSupervisorTeam);
    }
    
    // Form team
    const team = await this.teamAssembly.formTeam({
      taskId,
      taskDescription,
      requiredCapabilities,
      preferredAgentIds,
      excludedAgentIds,
      teamSize,
      strategy: strategy as any,
    });
    
    // Add team members to supervisor team if requested
    if (addToSupervisorTeam) {
      for (const member of team.members) {
        // Access agent via collaborative service to avoid private property access
        const agent = this.collaborativeTaskBreakdown.getAgent(member.agentId);
        if (agent) {
          this.addTeamMember({
            agent,
            role: member.role,
            priority: 5, // Default priority
            active: true, // Default active status
          });
        }
      }
    }
    
    return {
      teamId: team.id,
      name: team.name,
      description: team.description,
      members: team.members.map(m => ({
        agentId: m.agentId,
        agentName: m.agentName,
        role: m.role,
        capabilities: m.capabilities,
        compatibilityScore: m.compatibilityScore,
      })),
      formationStrategy: team.formationStrategy,
    };
  }

  /**
   * Helper function to safely extract input data from AgentRequest input which can be string or BaseMessage[]
   */
  private getInputData<T>(input: string | BaseMessage[]): T {
    try {
      if (typeof input === 'string') {
        return JSON.parse(input) as T;
      } else if (Array.isArray(input)) {
        // Try to extract JSON from the BaseMessage array
        const lastMessage = input[input.length - 1];
        const content = typeof lastMessage === 'string' ? lastMessage : 
          (lastMessage as any)?.content || '{}';
        return (typeof content === 'string' ? JSON.parse(content) : content) as T;
      }
      return input as unknown as T;
    } catch (error) {
      this.logger.error(`Failed to parse input: ${error}`);
      return {} as T;
    }
  }

  /**
   * Handle consensus building activities
   */
  private async handleConsensusBuilding(
    request: AgentRequest,
  ): Promise<any> {
    this.logger.info('Handling consensus building');
    
    const input = this.getInputData<ConsensusRequestInput>(request.input);
    const operation = input.operation;
    
    switch (operation) {
      case 'start-vote':
        return await this.startVotingSession(request);
      
      case 'cast-vote':
        return await this.castVote(request);
      
      case 'get-result':
        return await this.getVotingResult(request);
      
      default:
        throw new Error(`Unknown consensus operation: ${operation}`);
    }
  }

  /**
   * Start a voting session
   */
  private async startVotingSession(request: AgentRequest): Promise<any> {
    const input = this.getInputData<StartVoteRequestInput>(request.input);
    
    const { 
      question, 
      options, 
      deadline, 
      participants 
    } = input;
    
    if (!question || !options || !Array.isArray(options)) {
      throw new Error('Missing required parameters: question and options array');
    }
    
    const votingId = uuidv4();
    const deadlineTimestamp = deadline 
      ? new Date(deadline).getTime() 
      : Date.now() + 5 * 60 * 1000; // Default 5 min deadline
    
    this.votingSessions.set(votingId, {
      question,
      options,
      votes: {},
      deadline: deadlineTimestamp,
    });
    
    // Notify participants (team members) about the vote if specified
    if (participants === 'team') {
      const teamMembers = this.listTeamMembers();
      
      for (const member of teamMembers) {
        try {
          const agentRequest: AgentRequest = {
            capability: 'voting',
            input: JSON.stringify({
              votingId,
              question,
              options,
              deadline: deadlineTimestamp,
            }),
            parameters: {
              facilitatorId: this.id,
              isVotingRequest: true,
            }
          };
          
          await member.agent.execute(agentRequest);
        } catch (error) {
          this.logger.warn(`Failed to notify team member ${member.agent.id} about voting`, {
            error,
          });
        }
      }
    }
    
    return {
      votingId,
      question,
      options,
      deadline: new Date(deadlineTimestamp).toISOString(),
      status: 'open',
    };
  }

  /**
   * Cast a vote in a voting session
   */
  private async castVote(request: AgentRequest): Promise<any> {
    const input = this.getInputData<CastVoteRequestInput>(request.input);
    
    const { votingId, agentId, vote } = input;
    
    if (!votingId || !agentId || !vote) {
      throw new Error('Missing required parameters: votingId, agentId, and vote');
    }
    
    const session = this.votingSessions.get(votingId);
    if (!session) {
      throw new Error(`Voting session not found: ${votingId}`);
    }
    
    // Check if voting is still open
    if (Date.now() > session.deadline) {
      throw new Error(`Voting session ${votingId} is closed`);
    }
    
    // Check if vote is valid
    if (!session.options.includes(vote)) {
      throw new Error(`Invalid vote option: ${vote}`);
    }
    
    // Record the vote
    session.votes[agentId] = vote;
    this.votingSessions.set(votingId, session);
    
    return {
      votingId,
      status: 'vote-recorded',
      agent: agentId,
      vote,
    };
  }

  /**
   * Get the result of a voting session
   */
  private async getVotingResult(request: AgentRequest): Promise<any> {
    const input = this.getInputData<GetVotingResultRequestInput>(request.input);
    
    const { votingId, forceResult } = input;
    
    if (!votingId) {
      throw new Error('Missing required parameter: votingId');
    }
    
    const session = this.votingSessions.get(votingId);
    if (!session) {
      throw new Error(`Voting session not found: ${votingId}`);
    }
    
    // Check if session has ended or forceResult is true
    if (Date.now() <= session.deadline && !forceResult) {
      return {
        votingId,
        status: 'in-progress',
        deadline: new Date(session.deadline).toISOString(),
        votesCast: Object.keys(session.votes).length,
      };
    }
    
    // Calculate results if not already calculated
    if (!session.result) {
      const voteCounts: Record<string, string[]> = {};
      
      // Initialize with all options
      for (const option of session.options) {
        voteCounts[option] = [];
      }
      
      // Count votes
      for (const [agentId, vote] of Object.entries(session.votes)) {
        voteCounts[vote].push(agentId);
      }
      
      // Determine the winning option
      let maxVotes = 0;
      let winningOption = '';
      
      for (const [option, voters] of Object.entries(voteCounts)) {
        if (voters.length > maxVotes) {
          maxVotes = voters.length;
          winningOption = option;
        }
      }
      
      // Create result
      const result: VotingResult = {
        decision: winningOption,
        options: session.options.map(option => ({
          option,
          votes: voteCounts[option].length,
          voters: voteCounts[option],
        })),
        participated: Object.keys(session.votes).length,
        total: this.listTeamMembers().length,
        timestamp: Date.now(),
      };
      
      session.result = result;
      this.votingSessions.set(votingId, session);
    }
    
    return {
      votingId,
      status: 'completed',
      result: session.result,
    };
  }

  /**
   * Handle task delegation to capable agents
   */
  private async handleTaskDelegation(
    request: AgentRequest,
  ): Promise<any> {
    this.logger.info('Handling task delegation');
    
    // Parse request with safe type handling
    const delegationRequest = this.getInputData<TaskDelegationRequest & { advertiserId?: string }>(request.input);
    
    // Default to self as advertiser if not specified
    const advertiserId = delegationRequest.advertiserId || this.id;
    
    // Delegate the task
    const result = await this.delegationProtocol.delegateTask(
      advertiserId,
      delegationRequest,
    );
    
    return {
      advertisementId: result.advertisementId,
      status: result.status,
      assignedAgent: result.assignedAgentId 
        ? { id: result.assignedAgentId, name: result.assignedAgentName }
        : undefined,
      responseCount: result.responses.length,
      topResponders: result.responses
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)
        .map(r => ({
          agentId: r.agentId,
          agentName: r.agentName,
          confidence: r.confidence,
        })),
    };
  }

  /**
   * Handle suggestion-based coordination
   */
  private async handleSuggestionCoordination(
    request: AgentRequest,
  ): Promise<any> {
    this.logger.info('Handling suggestion coordination');
    
    const input = this.getInputData<SuggestionRequestInput>(request.input);
    const operation = input.operation;
    
    switch (operation) {
      case 'submit-suggestion':
        return await this.handleSubmitSuggestion(request);
      
      case 'support-suggestion':
        return await this.handleSupportSuggestion(request);
      
      case 'resolve-suggestion':
        return await this.handleResolveSuggestion(request);
      
      case 'list-suggestions':
        return await this.handleListSuggestions(request);
      
      default:
        throw new Error(`Unknown suggestion operation: ${operation}`);
    }
  }

  /**
   * Handle submission of a team suggestion
   */
  private async handleSubmitSuggestion(request: AgentRequest): Promise<any> {
    const input = this.getInputData<SubmitSuggestionRequestInput>(request.input);
    const { suggestion, agentId, weight } = input;
    
    if (!suggestion || !agentId) {
      throw new Error('Missing required parameters: suggestion and agentId');
    }
    
    const suggestionId = uuidv4();
    
    this.teamSuggestions.set(suggestionId, {
      id: suggestionId,
      suggestion,
      supportingAgents: [agentId],
      weight: weight || 1.0,
      resolved: false,
      createdAt: Date.now(),
    });
    
    return {
      suggestionId,
      status: 'submitted',
      suggester: agentId,
    };
  }

  /**
   * Handle support for an existing suggestion
   */
  private async handleSupportSuggestion(request: AgentRequest): Promise<any> {
    const input = this.getInputData<SupportSuggestionRequestInput>(request.input);
    const { suggestionId, agentId, additionalWeight } = input;
    
    if (!suggestionId || !agentId) {
      throw new Error('Missing required parameters: suggestionId and agentId');
    }
    
    const suggestion = this.teamSuggestions.get(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }
    
    if (suggestion.resolved) {
      return {
        suggestionId,
        status: 'already-resolved',
        outcome: suggestion.outcome,
      };
    }
    
    // Add support if not already supporting
    if (!suggestion.supportingAgents.includes(agentId)) {
      suggestion.supportingAgents.push(agentId);
      
      // Add weight if specified
      if (additionalWeight) {
        suggestion.weight += additionalWeight;
      } else {
        // Default to increasing weight by 1.0
        suggestion.weight += 1.0;
      }
      
      this.teamSuggestions.set(suggestionId, suggestion);
    }
    
    return {
      suggestionId,
      status: 'supported',
      supporters: suggestion.supportingAgents.length,
      weight: suggestion.weight,
    };
  }

  /**
   * Handle resolving a suggestion
   */
  private async handleResolveSuggestion(request: AgentRequest): Promise<any> {
    const input = this.getInputData<ResolveSuggestionRequestInput>(request.input);
    const { suggestionId, outcome, resolverId } = input;
    
    if (!suggestionId || !outcome) {
      throw new Error('Missing required parameters: suggestionId and outcome');
    }
    
    const suggestion = this.teamSuggestions.get(suggestionId);
    if (!suggestion) {
      throw new Error(`Suggestion not found: ${suggestionId}`);
    }
    
    if (suggestion.resolved) {
      return {
        suggestionId,
        status: 'already-resolved',
        outcome: suggestion.outcome,
      };
    }
    
    // Resolve the suggestion
    suggestion.resolved = true;
    suggestion.outcome = outcome;
    suggestion.resolvedAt = Date.now();
    
    this.teamSuggestions.set(suggestionId, suggestion);
    
    return {
      suggestionId,
      status: 'resolved',
      outcome,
      resolvedBy: resolverId || this.id,
      supporters: suggestion.supportingAgents.length,
    };
  }

  /**
   * Handle listing of team suggestions
   */
  private async handleListSuggestions(request: AgentRequest): Promise<any> {
    const input = this.getInputData<ListSuggestionsRequestInput>(request.input);
    const { status } = input;
    
    let suggestions = Array.from(this.teamSuggestions.values());
    
    // Filter by status if specified
    if (status === 'active') {
      suggestions = suggestions.filter(s => !s.resolved);
    } else if (status === 'resolved') {
      suggestions = suggestions.filter(s => s.resolved);
    }
    
    // Sort by weight (descending)
    suggestions.sort((a, b) => b.weight - a.weight);
    
    return {
      suggestions: suggestions.map(s => ({
        id: s.id,
        suggestion: s.suggestion,
        supporters: s.supportingAgents.length,
        weight: s.weight,
        resolved: s.resolved,
        outcome: s.outcome,
        createdAt: new Date(s.createdAt).toISOString(),
        resolvedAt: s.resolvedAt ? new Date(s.resolvedAt).toISOString() : undefined,
      })),
    };
  }

  /**
   * Override the standard task assignment to use suggestion-based approach
   */
  async assignTask(taskDescription: string, options: any = {}): Promise<Task> {
    this.logger.info(`Suggesting task assignment: ${taskDescription}`);
    
    // Create a standard task object
    const task: Task = {
      id: options.id || uuidv4(),
      name: options.name || taskDescription.substring(0, 50),
      description: taskDescription,
      status: 'pending',
      priority: options.priority || 5,
      createdAt: Date.now(),
      metadata: options.metadata || {},
    };
    
    // Store the task using the helper method rather than direct access
    this.storeTask(task);
    
    // Use team assembly to find suitable agents
    const team = await this.teamAssembly.formTeam({
      taskDescription,
      requiredCapabilities: options.requiredCapabilities,
      preferredAgentIds: options.preferredAgentIds,
      teamSize: 1, // Just need one agent
      strategy: 'specialist',
    });
    
    if (team.members.length > 0) {
      const bestMember = team.members[0];
      
      // Suggest rather than assign directly
      const suggestion = {
        id: uuidv4(),
        suggestion: `Agent ${bestMember.agentName} should handle task: ${task.name}`,
        supportingAgents: [this.id],
        weight: bestMember.compatibilityScore * 10,
        resolved: false,
        createdAt: Date.now(),
        metadata: {
          taskId: task.id,
          agentId: bestMember.agentId,
          compatibilityScore: bestMember.compatibilityScore,
        },
      };
      
      this.teamSuggestions.set(suggestion.id, suggestion);
      
      // Store the suggestion ID in the task metadata
      if (task.metadata) {
        task.metadata.suggestionId = suggestion.id;
        this.storeTask(task);
      }
      
      this.logger.info(`Created task suggestion: ${suggestion.suggestion}`);
    }
    
    return task;
  }

  /**
   * Clean up resources when terminating the agent
   */
  async terminate(): Promise<void> {
    // Clean up any active voting sessions
    for (const [id, session] of this.votingSessions.entries()) {
      if (!session.result) {
        this.logger.info(`Cleaning up unfinished voting session ${id}`);
        // Force calculate results
        const result: VotingResult = {
          decision: '',
          options: [],
          participated: 0,
          total: 0,
          timestamp: Date.now(),
        };
        session.result = result;
      }
    }
    
    await super.terminate();
  }

  /**
   * Handle access to team members with workaround for private property access
   * @deprecated Will be replaced by agentic self-organizing behavior 
   */
  private getAgentById(agentId: string): BaseAgentInterface | undefined {
    // Since agentRegistry is private in parent class, we use our own reference
    return this.collaborativeTaskBreakdown?.getAgent?.(agentId) || undefined;
  }
  
  /**
   * Store task with workaround for private property access
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  private storeTask(task: Task): void {
    // Workaround to store task in a way that doesn't access private properties
    if (this.collaborativeTaskBreakdown?.storeTask) {
      this.collaborativeTaskBreakdown.storeTask(task);
    } else {
      this.logger.warn(`Failed to store task ${task.id} due to missing access method`);
    }
  }

  /**
   * Handle consensus voting for decisions
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  async handleConsensusVoting(input: string | BaseMessage[]): Promise<any> {
    // Safely extract properties from input which may be a string or BaseMessage[]
    const inputObj = this.getInputData<any>(input);

    const operation = inputObj.operation || 'unknown';
    
    if (operation === 'start-voting') {
      // Extract properties with type safety
      const question = inputObj.question || '';
      const options = Array.isArray(inputObj.options) ? inputObj.options : [];
      const deadline = inputObj.deadline || Date.now() + 60000; // Default: 1 minute
      const participants = Array.isArray(inputObj.participants) ? inputObj.participants : [];
      
      if (!question || options.length === 0) {
        return { status: 'error', message: 'Missing required fields' };
      }
      
      // Call the helper method
      try {
        const votingId = this.startVotingProcessWithParams(question, options, deadline, participants);
        return {
          status: 'success',
          votingId,
          message: `Voting session started with ID: ${votingId}`
        };
      } catch (error) {
        return { status: 'error', message: `Failed to start voting: ${error}` };
      }
    }
    
    if (operation === 'submit-vote') {
      // Extract properties with type safety
      const votingId = inputObj.votingId || '';
      const agentId = inputObj.agentId || '';
      const vote = inputObj.vote || '';
      
      if (!votingId || !agentId || !vote) {
        return { status: 'error', message: 'Missing required fields for vote submission' };
      }
      
      const result = this.submitVote(votingId, agentId, vote);
      return {
        status: result ? 'success' : 'error',
        message: result ? 'Vote submitted successfully' : 'Failed to submit vote'
      };
    }
    
    if (operation === 'get-results') {
      // Extract votingId with type safety
      const votingId = inputObj.votingId || '';
      
      if (!votingId) {
        return { status: 'error', message: 'Missing voting ID' };
      }
      
      const result = this.getVotingResults(votingId);
      if (!result) {
        return { status: 'error', message: 'Voting not found or still in progress' };
      }
      
      return {
        status: 'success',
        result
      };
    }
    
    return { status: 'error', message: `Unknown operation: ${operation}` };
  }

  /**
   * Submit a vote for a voting session
   * @param votingId The ID of the voting session
   * @param agentId The ID of the agent casting the vote
   * @param vote The vote option
   * @returns boolean indicating success
   */
  private submitVote(votingId: string, agentId: string, vote: string): boolean {
    try {
      const session = this.votingSessions.get(votingId);
      if (!session) {
        this.logger.warn(`Voting session not found: ${votingId}`);
        return false;
      }
      
      // Check if voting is still open
      if (session.result || Date.now() > session.deadline) {
        this.logger.warn(`Voting session ${votingId} is closed`);
        return false;
      }
      
      // Check if vote is valid
      if (!session.options.includes(vote)) {
        this.logger.warn(`Invalid vote option: ${vote}`);
        return false;
      }
      
      // Record the vote
      session.votes[agentId] = vote;
      this.votingSessions.set(votingId, session);
      
      // Check if all eligible voters have voted and auto-close
      if (Object.keys(session.votes).length >= this.listTeamMembers().length) {
        this.getVotingResults(votingId, true);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error submitting vote: ${error}`);
      return false;
    }
  }

  /**
   * Get the results of a voting session
   * @param votingId The ID of the voting session
   * @param forceCalculation Whether to force calculation of results even if session is still open
   * @returns The voting result or undefined if not available
   */
  private getVotingResults(votingId: string, forceCalculation: boolean = false): VotingResult | undefined {
    try {
      const session = this.votingSessions.get(votingId);
      if (!session) {
        this.logger.warn(`Voting session not found: ${votingId}`);
        return undefined;
      }
      
      // If results already exist, return them
      if (session.result) {
        return session.result;
      }
      
      // If voting is not closed and not forcing calculation, return undefined
      if (Date.now() <= session.deadline && !forceCalculation) {
        return undefined;
      }
      
      // Calculate results
      const voteCounts: Record<string, string[]> = {};
      
      // Initialize with all options
      for (const option of session.options) {
        voteCounts[option] = [];
      }
      
      // Count votes
      for (const [agentId, vote] of Object.entries(session.votes)) {
        voteCounts[vote].push(agentId);
      }
      
      // Determine the winning option
      let maxVotes = 0;
      let winningOption = '';
      
      for (const [option, voters] of Object.entries(voteCounts)) {
        if (voters.length > maxVotes) {
          maxVotes = voters.length;
          winningOption = option;
        }
      }
      
      // Create result
      const result: VotingResult = {
        decision: winningOption,
        options: session.options.map(option => ({
          option,
          votes: voteCounts[option].length,
          voters: voteCounts[option],
        })),
        participated: Object.keys(session.votes).length,
        total: this.listTeamMembers().length,
        timestamp: Date.now(),
      };
      
      // Store result
      session.result = result;
      this.votingSessions.set(votingId, session);
      
      return result;
    } catch (error) {
      this.logger.error(`Error getting voting results: ${error}`);
      return undefined;
    }
  }

  /**
   * Helper method to start a voting process with parameters
   */
  private startVotingProcessWithParams(
    question: string, 
    options: string[], 
    deadline: number | string, 
    participants: string[] | string
  ): string {
    const votingId = uuidv4();
    const deadlineTimestamp = typeof deadline === 'string' 
      ? new Date(deadline).getTime() 
      : (typeof deadline === 'number' ? deadline : Date.now() + 5 * 60 * 1000);

    this.votingSessions.set(votingId, {
      question,
      options,
      votes: {},
      deadline: deadlineTimestamp,
    });

    return votingId;
  }
}