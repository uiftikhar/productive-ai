import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { JsonOutputParser } from "@langchain/core/output_parsers";

import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { LangChainConfig } from '../../../langchain/config';

import {
  CollaborativeTask,
  TaskBoundaryProposal,
  ConsensusStrategy,
  TaskVote,
  VoteType,
  createTaskProposal,
  createCollaborativeTask,
} from './interfaces/peer-task.interface';
import { 
  HierarchicalTask, 
  TaskPriority, 
  TaskStatus, 
  createHierarchicalTask, 
} from './interfaces/hierarchical-task.interface';
import { ComplexityLevel } from './interfaces/task-analysis.interface';

/**
 * Agent representation for collaboration
 */
export interface AgentForCollaboration {
  id: string;
  name: string;
  expertise: string[];
  perspective?: string;
  communicationStyle?: string;
}

/**
 * Service configuration
 */
export interface CollaborativeTaskDefinitionConfig {
  logger?: Logger;
  llmModel?: string;
  llmTemperature?: number;
  defaultConsensusThreshold?: number;
}

/**
 * Service for enabling collaborative task definition between agents
 */
export class CollaborativeTaskDefinitionService {
  private static instance: CollaborativeTaskDefinitionService;
  private logger: Logger;
  private llm: ChatOpenAI;
  private defaultConsensusThreshold: number;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: CollaborativeTaskDefinitionConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.defaultConsensusThreshold = config.defaultConsensusThreshold || 0.66; // Two-thirds by default

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: config.llmModel || LangChainConfig.llm.model,
      temperature: config.llmTemperature || 0.3,
      verbose: false,
    });

    this.logger.info('CollaborativeTaskDefinitionService initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(config: CollaborativeTaskDefinitionConfig = {}): CollaborativeTaskDefinitionService {
    if (!CollaborativeTaskDefinitionService.instance) {
      CollaborativeTaskDefinitionService.instance = new CollaborativeTaskDefinitionService(config);
    }
    return CollaborativeTaskDefinitionService.instance;
  }

  /**
   * Initiate a collaborative task definition process
   */
  public async initiateCollaborativeTaskDefinition(
    taskName: string,
    initialDescription: string,
    collaboratingAgents: AgentForCollaboration[],
    options: {
      initiatorId?: string;
      consensusStrategy?: ConsensusStrategy;
      consensusThreshold?: number;
      priority?: TaskPriority;
      context?: Record<string, any>;
    } = {},
  ): Promise<CollaborativeTask> {
    this.logger.info(`Initiating collaborative task definition for: ${taskName}`);

    // Set initiator to the first agent if not specified
    const initiatorId = options.initiatorId || collaboratingAgents[0].id;
    
    // Create the initial collaborative task
    const task: CollaborativeTask = {
      ...createHierarchicalTask(
        taskName,
        initialDescription,
        options.priority || TaskPriority.MEDIUM,
        ComplexityLevel.MODERATE,
        3600000, // 1 hour default
      ),
      initiatedBy: initiatorId,
      collaborators: collaboratingAgents.map(a => a.id),
      proposalHistory: [],
      responsibilities: [],
      consensusStrategy: options.consensusStrategy || ConsensusStrategy.SUPER_MAJORITY,
      consensusThreshold: options.consensusThreshold || this.defaultConsensusThreshold,
      consensusReached: false,
      lastActivity: Date.now(),
    };
    
    // Generate initial task proposal
    const initialProposal = await this.generateInitialProposal(
      task,
      collaboratingAgents.find(a => a.id === initiatorId) || collaboratingAgents[0],
      collaboratingAgents,
      options.context || {},
    );
    
    // Add the proposal to the task history
    task.proposalHistory.push(initialProposal);
    task.currentProposal = initialProposal.id;
    
    this.logger.info(`Created collaborative task: ${task.id} with initial proposal: ${initialProposal.id}`);
    
    return task;
  }

  /**
   * Generate an initial task proposal
   */
  private async generateInitialProposal(
    task: CollaborativeTask,
    initiator: AgentForCollaboration,
    collaborators: AgentForCollaboration[],
    context: Record<string, any> = {},
  ): Promise<TaskBoundaryProposal> {
    // Generate proposal content using LLM
    const proposalContent = await this.generateProposalWithLLM(
      task.name,
      task.description,
      initiator,
      collaborators,
      context,
    );
    
    // Create the proposal object
    const proposal: TaskBoundaryProposal = {
      id: uuidv4(),
      taskId: task.id,
      proposedBy: initiator.id,
      proposedAt: Date.now(),
      name: proposalContent.name || task.name,
      description: proposalContent.description || task.description,
      scope: proposalContent.scope || '',
      outOfScope: proposalContent.outOfScope || [],
      complexity: this.mapComplexityLevel(proposalContent.complexity),
      estimatedDuration: proposalContent.estimatedDuration || 3600000,
      resourceNeeds: proposalContent.resourceNeeds || [],
      expectedOutcomes: proposalContent.expectedOutcomes || [],
      status: 'proposed',
      votes: [],
      consensusStrategy: task.consensusStrategy,
      requiredVoteCount: Math.ceil(collaborators.length * task.consensusThreshold),
      metadata: {},
    };
    
    // Add initiator's vote as approval
    proposal.votes.push({
      id: uuidv4(),
      taskId: task.id,
      proposalId: proposal.id,
      agentId: initiator.id,
      vote: VoteType.APPROVE,
      reasoning: 'Initial proposal created by me',
      timestamp: Date.now(),
      metadata: {},
    });
    
    return proposal;
  }

  /**
   * Generate a task proposal using an LLM
   */
  private async generateProposalWithLLM(
    taskName: string,
    initialDescription: string,
    initiator: AgentForCollaboration,
    collaborators: AgentForCollaboration[],
    context: Record<string, any> = {},
  ): Promise<{
    name: string;
    description: string;
    scope: string;
    outOfScope: string[];
    complexity: string;
    estimatedDuration: number;
    resourceNeeds: string[];
    expectedOutcomes: string[];
  }> {
    const systemPrompt = `You are an expert task definition assistant. Help formulate a comprehensive task proposal that will be shared with collaborating agents.

The proposal should include:
1. Task name: A clear, concise title
2. Description: A thorough description of the task
3. Scope: What is included in this task
4. Out of scope: What is explicitly excluded
5. Complexity: The level of difficulty (TRIVIAL, SIMPLE, MODERATE, COMPLEX, VERY_COMPLEX)
6. Estimated duration: Time needed in milliseconds
7. Resource needs: Required skills, tools, or other resources
8. Expected outcomes: Clear deliverables or results

Format your response as valid JSON:
{
  "name": "Implement User Authentication System",
  "description": "Design and implement a secure user authentication system...",
  "scope": "The system will handle user registration, login, password recovery, and session management",
  "outOfScope": ["Single sign-on integration", "Biometric authentication"],
  "complexity": "MODERATE",
  "estimatedDuration": 604800000,
  "resourceNeeds": ["Authentication expertise", "Database knowledge", "Security testing capabilities"],
  "expectedOutcomes": ["Working authentication API", "User registration flow", "Password reset functionality"]
}

The proposal should be clear, specific, and actionable. Consider the expertise and perspectives of all collaborating agents.`;

    // Format collaborator information
    const collaboratorsInfo = collaborators.map(agent => 
      `Agent ID: ${agent.id}
Name: ${agent.name}
Expertise: ${agent.expertise.join(', ')}
${agent.perspective ? `Perspective: ${agent.perspective}` : ''}
${agent.communicationStyle ? `Communication Style: ${agent.communicationStyle}` : ''}`
    ).join('\n\n');

    // Format context if available
    let contextInfo = '';
    if (Object.keys(context).length > 0) {
      contextInfo = '\n\nAdditional Context:\n' + 
        Object.entries(context)
          .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
          .join('\n');
    }

    const humanMessage = `Task Name: ${taskName}
Initial Description: ${initialDescription}

Initiator:
${collaborators.find(a => a.id === initiator.id) ? 
  `Agent ID: ${initiator.id}
Name: ${initiator.name}
Expertise: ${initiator.expertise.join(', ')}
${initiator.perspective ? `Perspective: ${initiator.perspective}` : ''}` : 
  `Agent ID: ${initiator.id}
Name: ${initiator.name}`}

Collaborating Agents:
${collaboratorsInfo}${contextInfo}

Please create a comprehensive task proposal that the initiator would propose for this collaborative task.`;

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
      
      // Apply reasonable defaults for missing fields
      return {
        name: response.name || taskName,
        description: response.description || initialDescription,
        scope: response.scope || '',
        outOfScope: Array.isArray(response.outOfScope) ? response.outOfScope : [],
        complexity: response.complexity || 'MODERATE',
        estimatedDuration: response.estimatedDuration || 3600000, // 1 hour default
        resourceNeeds: Array.isArray(response.resourceNeeds) ? response.resourceNeeds : [],
        expectedOutcomes: Array.isArray(response.expectedOutcomes) ? response.expectedOutcomes : [],
      };
    } catch (error) {
      this.logger.error('Error generating task proposal', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Return a basic proposal if generation fails
      return {
        name: taskName,
        description: initialDescription,
        scope: 'To be defined',
        outOfScope: [],
        complexity: 'MODERATE',
        estimatedDuration: 3600000, // 1 hour default
        resourceNeeds: [],
        expectedOutcomes: ['Successfully completed task'],
      };
    }
  }

  /**
   * Submit a vote on a task proposal
   */
  public async submitVote(
    task: CollaborativeTask,
    proposalId: string,
    agentId: string,
    vote: VoteType,
    reasoning: string,
    suggestedChanges?: Record<string, any>,
  ): Promise<{
    task: CollaborativeTask;
    vote: TaskVote;
    consensusReached: boolean;
    voteStats: Record<string, number>;
  }> {
    // Find the proposal
    const proposalIndex = task.proposalHistory.findIndex(p => p.id === proposalId);
    if (proposalIndex === -1) {
      throw new Error(`Proposal ${proposalId} not found for task ${task.id}`);
    }
    
    const proposal = task.proposalHistory[proposalIndex];
    
    // Check if agent has already voted
    const existingVoteIndex = proposal.votes.findIndex(v => v.agentId === agentId);
    
    // Create the vote
    const taskVote: TaskVote = {
      id: uuidv4(),
      taskId: task.id,
      proposalId: proposal.id,
      agentId,
      vote,
      reasoning,
      timestamp: Date.now(),
      suggestedChanges,
      metadata: {},
    };
    
    // Update proposal with the new vote
    if (existingVoteIndex >= 0) {
      proposal.votes[existingVoteIndex] = taskVote;
    } else {
      proposal.votes.push(taskVote);
    }
    
    // Count votes
    const voteStats = this.countVotes(proposal.votes);
    
    // Check if consensus is reached
    const consensusReached = this.checkConsensus(
      proposal.votes,
      task.consensusStrategy,
      task.consensusThreshold,
      task.collaborators.length,
    );
    
    // Update task state
    task.lastActivity = Date.now();
    task.consensusReached = consensusReached;
    task.proposalHistory[proposalIndex] = proposal;
    
    // If consensus is reached, update task details with proposal content
    if (consensusReached) {
      this.applyProposalToTask(task, proposal);
    }
    
    return {
      task,
      vote: taskVote,
      consensusReached,
      voteStats,
    };
  }

  /**
   * Generate a counter-proposal based on vote feedback
   */
  public async generateCounterProposal(
    task: CollaborativeTask,
    proposalId: string,
    counterProposingAgentId: string,
    options: {
      context?: Record<string, any>;
      focusAreas?: string[];
    } = {},
  ): Promise<{
    task: CollaborativeTask;
    counterProposal: TaskBoundaryProposal;
  }> {
    // Find the original proposal
    const originalProposal = task.proposalHistory.find(p => p.id === proposalId);
    if (!originalProposal) {
      throw new Error(`Proposal ${proposalId} not found for task ${task.id}`);
    }
    
    // Get the agent that is making the counter-proposal
    const agent = options.context?.agents?.[counterProposingAgentId];
    if (!agent) {
      this.logger.warn(`Agent ${counterProposingAgentId} not found in context, using minimal info`);
    }
    
    // Generate counter-proposal using LLM
    const counterProposalContent = await this.generateCounterProposalWithLLM(
      task,
      originalProposal,
      counterProposingAgentId,
      agent,
      options.context || {},
      options.focusAreas || [],
    );
    
    // Create the counter-proposal
    const counterProposal: TaskBoundaryProposal = {
      id: uuidv4(),
      taskId: task.id,
      proposedBy: counterProposingAgentId,
      proposedAt: Date.now(),
      name: counterProposalContent.name || originalProposal.name,
      description: counterProposalContent.description || originalProposal.description,
      scope: counterProposalContent.scope || originalProposal.scope,
      outOfScope: counterProposalContent.outOfScope || originalProposal.outOfScope,
      complexity: this.mapComplexityLevel(counterProposalContent.complexity),
      estimatedDuration: counterProposalContent.estimatedDuration || originalProposal.estimatedDuration,
      resourceNeeds: counterProposalContent.resourceNeeds || originalProposal.resourceNeeds,
      expectedOutcomes: counterProposalContent.expectedOutcomes || originalProposal.expectedOutcomes,
      status: 'proposed',
      votes: [{
        id: uuidv4(),
        taskId: task.id,
        proposalId: '', // Will be set after creation
        agentId: counterProposingAgentId,
        vote: VoteType.APPROVE,
        reasoning: counterProposalContent.reasoning || 'I am proposing this counter-proposal',
        timestamp: Date.now(),
        metadata: {},
      }],
      consensusStrategy: originalProposal.consensusStrategy,
      requiredVoteCount: originalProposal.requiredVoteCount,
      metadata: {
        counterToProposalId: originalProposal.id,
        changesFrom: options.focusAreas || [],
        changeRationale: counterProposalContent.reasoning || '',
      },
    };
    
    // Update proposal ID in the vote
    counterProposal.votes[0].proposalId = counterProposal.id;
    
    // Add the counter-proposal to the task
    task.proposalHistory.push(counterProposal);
    task.currentProposal = counterProposal.id;
    task.lastActivity = Date.now();
    
    return {
      task,
      counterProposal,
    };
  }

  /**
   * Generate a counter-proposal using an LLM
   */
  private async generateCounterProposalWithLLM(
    task: CollaborativeTask,
    originalProposal: TaskBoundaryProposal,
    counterProposingAgentId: string,
    agent: any,
    context: Record<string, any> = {},
    focusAreas: string[] = [],
  ): Promise<{
    name: string;
    description: string;
    scope: string;
    outOfScope: string[];
    complexity: string;
    estimatedDuration: number;
    resourceNeeds: string[];
    expectedOutcomes: string[];
    reasoning: string;
  }> {
    // Get votes with suggestions or rejections
    const criticalVotes = originalProposal.votes.filter(vote => 
      vote.vote === VoteType.REJECT || 
      vote.vote === VoteType.SUGGEST_CHANGES ||
      (vote.vote === VoteType.APPROVE && vote.suggestedChanges)
    );
    
    const systemPrompt = `You are an expert task negotiation assistant. Help formulate a counter-proposal that addresses feedback from collaborators.

Based on the original proposal and the feedback from other agents, create an improved counter-proposal.

The counter-proposal should include:
1. Task name: A clear, concise title
2. Description: A thorough description of the task
3. Scope: What is included in this task
4. Out of scope: What is explicitly excluded
5. Complexity: The level of difficulty (TRIVIAL, SIMPLE, MODERATE, COMPLEX, VERY_COMPLEX)
6. Estimated duration: Time needed in milliseconds
7. Resource needs: Required skills, tools, or other resources
8. Expected outcomes: Clear deliverables or results
9. Reasoning: Explanation of how this counter-proposal addresses the feedback

Format your response as valid JSON:
{
  "name": "Implement User Authentication System",
  "description": "Design and implement a secure user authentication system...",
  "scope": "The system will handle user registration, login, password recovery...",
  "outOfScope": ["Single sign-on integration", "Biometric authentication"],
  "complexity": "MODERATE",
  "estimatedDuration": 604800000,
  "resourceNeeds": ["Authentication expertise", "Database knowledge", "Security testing"],
  "expectedOutcomes": ["Working authentication API", "User registration flow"],
  "reasoning": "This counter-proposal addresses concerns about scope and timeline by..."
}

Focus on addressing the concerns raised in the feedback, finding a middle ground that everyone can agree on.`;

    // Format original proposal
    const originalProposalInfo = `Original Proposal (by ${originalProposal.proposedBy}):
- Name: ${originalProposal.name}
- Description: ${originalProposal.description}
- Scope: ${originalProposal.scope}
- Out of Scope: ${originalProposal.outOfScope.join(', ')}
- Complexity: ${originalProposal.complexity}
- Estimated Duration: ${originalProposal.estimatedDuration} ms
- Resource Needs: ${originalProposal.resourceNeeds.join(', ')}
- Expected Outcomes: ${originalProposal.expectedOutcomes.join(', ')}`;

    // Format votes and feedback
    const votesInfo = criticalVotes.map(vote => 
      `Vote from ${vote.agentId}:
- Vote: ${vote.vote}
- Reasoning: ${vote.reasoning}
${vote.suggestedChanges ? `- Suggested Changes: ${JSON.stringify(vote.suggestedChanges)}` : ''}`
    ).join('\n\n');

    // Format counterproposing agent info
    const agentInfo = agent ? 
      `Your expertise: ${agent.expertise ? agent.expertise.join(', ') : 'Not specified'}
Your perspective: ${agent.perspective || 'Not specified'}` :
      `You are agent ${counterProposingAgentId}`;

    // Format focus areas if any
    const focusAreasInfo = focusAreas.length > 0 ?
      `\nFocus particularly on improving these aspects: ${focusAreas.join(', ')}` :
      '\nAddress all relevant concerns from the feedback';

    const humanMessage = `Task: ${task.name}

${originalProposalInfo}

Feedback on Original Proposal:
${votesInfo || 'No specific feedback provided'}

${agentInfo}
${focusAreasInfo}

Please create a counter-proposal that addresses the feedback and concerns while maintaining the core purpose of the task.`;

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
        name: response.name || originalProposal.name,
        description: response.description || originalProposal.description,
        scope: response.scope || originalProposal.scope,
        outOfScope: Array.isArray(response.outOfScope) ? response.outOfScope : originalProposal.outOfScope,
        complexity: response.complexity || originalProposal.complexity,
        estimatedDuration: response.estimatedDuration || originalProposal.estimatedDuration,
        resourceNeeds: Array.isArray(response.resourceNeeds) ? response.resourceNeeds : originalProposal.resourceNeeds,
        expectedOutcomes: Array.isArray(response.expectedOutcomes) ? response.expectedOutcomes : originalProposal.expectedOutcomes,
        reasoning: response.reasoning || 'Counter-proposal based on feedback',
      };
    } catch (error) {
      this.logger.error('Error generating counter-proposal', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Return a basic counter-proposal preserving most of the original
      return {
        name: originalProposal.name,
        description: originalProposal.description,
        scope: originalProposal.scope,
        outOfScope: originalProposal.outOfScope,
        complexity: originalProposal.complexity,
        estimatedDuration: originalProposal.estimatedDuration,
        resourceNeeds: originalProposal.resourceNeeds,
        expectedOutcomes: originalProposal.expectedOutcomes,
        reasoning: 'Counter-proposal with minimal changes due to error in generation',
      };
    }
  }

  /**
   * Count votes by type
   */
  private countVotes(votes: TaskVote[]): Record<string, number> {
    const counts: Record<string, number> = {
      [VoteType.APPROVE]: 0,
      [VoteType.REJECT]: 0,
      [VoteType.ABSTAIN]: 0,
      [VoteType.SUGGEST_CHANGES]: 0,
      total: votes.length,
    };
    
    for (const vote of votes) {
      counts[vote.vote] = (counts[vote.vote] || 0) + 1;
    }
    
    return counts;
  }

  /**
   * Check if consensus has been reached
   */
  private checkConsensus(
    votes: TaskVote[],
    strategy: ConsensusStrategy,
    threshold: number,
    totalParticipants: number,
  ): boolean {
    const counts = this.countVotes(votes);
    
    // Calculate approval rate
    const approvalsNeeded = Math.ceil(totalParticipants * threshold);
    const approvalCount = counts[VoteType.APPROVE] || 0;
    
    // Check against the strategy
    switch (strategy) {
      case ConsensusStrategy.UNANIMOUS:
        // Everyone must approve
        return approvalCount === totalParticipants;
        
      case ConsensusStrategy.SUPER_MAJORITY:
        // Super majority (typically 2/3)
        return approvalCount >= Math.ceil(totalParticipants * 2/3);
        
      case ConsensusStrategy.MAJORITY:
        // Simple majority
        return approvalCount > Math.floor(totalParticipants / 2);
        
      case ConsensusStrategy.THRESHOLD:
        // Custom threshold
        return approvalCount >= approvalsNeeded;
        
      case ConsensusStrategy.WEIGHTED:
        // Weighted voting would require agent weights, not implemented here
        return approvalCount >= approvalsNeeded;
        
      default:
        // Default to threshold
        return approvalCount >= approvalsNeeded;
    }
  }

  /**
   * Apply an accepted proposal to the task
   */
  private applyProposalToTask(task: CollaborativeTask, proposal: TaskBoundaryProposal): void {
    task.name = proposal.name;
    task.description = proposal.description;
    task.complexity = proposal.complexity;
    task.status = TaskStatus.PLANNED; // Move from draft to planned
    
    // Update metadata with scope information
    task.metadata = {
      ...task.metadata,
      scope: proposal.scope,
      outOfScope: proposal.outOfScope,
      resourceNeeds: proposal.resourceNeeds,
      expectedOutcomes: proposal.expectedOutcomes,
      consensusReachedAt: Date.now(),
      acceptedProposalId: proposal.id,
    };
    
    // Update estimated duration
    task.estimatedDuration = proposal.estimatedDuration;
  }

  /**
   * Map a string complexity level to the enum
   */
  private mapComplexityLevel(level: string): ComplexityLevel {
    level = (level || '').toUpperCase();
    switch (level) {
      case 'TRIVIAL':
        return ComplexityLevel.TRIVIAL;
      case 'SIMPLE':
        return ComplexityLevel.SIMPLE;
      case 'MODERATE':
        return ComplexityLevel.MODERATE;
      case 'COMPLEX':
        return ComplexityLevel.COMPLEX;
      case 'VERY_COMPLEX':
      case 'VERY COMPLEX':
        return ComplexityLevel.VERY_COMPLEX;
      default:
        return ComplexityLevel.MODERATE; // Default to moderate when unsure
    }
  }
} 