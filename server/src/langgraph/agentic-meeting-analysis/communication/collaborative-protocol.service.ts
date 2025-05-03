/**
 * Collaborative Protocol Service for the Agentic Meeting Analysis System
 *
 * This service implements collaborative protocols for agent interaction:
 * - Defined analysis phases workflow
 * - Direct request mechanism between agents
 * - Broadcast communication channels
 * - Consensus building protocols
 * - Progressive disclosure mechanisms
 */
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import {
  AgentMessage,
  MessageType,
  AnalysisGoalType,
  AnalysisTask,
  AnalysisTaskStatus,
  AgentExpertise,
  AgentOutput,
  ConfidenceLevel,
} from '../interfaces/agent.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  ICommunicationService,
  MessagePriority,
  ChannelType,
} from '../interfaces/communication.interface';
import { StateManager } from '../state/state.manager';

/**
 * Configuration options for CollaborativeProtocolService
 */
export interface CollaborativeProtocolConfig {
  communicationService: ICommunicationService;
  stateManager: StateManager;
  logger?: Logger;
  consensusThreshold?: number; // 0-1 value indicating agreement level needed
  maxRounds?: number; // Maximum rounds of deliberation
  timeoutMs?: number; // Timeout for consensus rounds
}

/**
 * Analysis workflow phases
 */
export enum AnalysisPhase {
  INITIALIZATION = 'initialization',
  DATA_GATHERING = 'data_gathering',
  INDIVIDUAL_ANALYSIS = 'individual_analysis',
  CROSS_VALIDATION = 'cross_validation',
  CONSENSUS_BUILDING = 'consensus_building',
  SYNTHESIS = 'synthesis',
  REFINEMENT = 'refinement',
  FINALIZATION = 'finalization',
}

/**
 * Protocol message types extending basic message types
 */
export enum ProtocolMessageType {
  PHASE_TRANSITION = 'phase_transition',
  CONSENSUS_PROPOSAL = 'consensus_proposal',
  CONSENSUS_VOTE = 'consensus_vote',
  KNOWLEDGE_SHARING = 'knowledge_sharing',
  CLARIFICATION_REQUEST = 'clarification_request',
  CLARIFICATION_RESPONSE = 'clarification_response',
  CONFLICT_NOTIFICATION = 'conflict_notification',
  CONFLICT_RESOLUTION = 'conflict_resolution',
  PROGRESSIVE_DISCLOSURE = 'progressive_disclosure',
}

/**
 * Protocol state tracking
 */
interface ProtocolState {
  currentPhase: AnalysisPhase;
  activeAgents: Set<string>;
  phaseStartTime: number;
  phaseDeadline?: number;
  consensusTopics: Map<
    string,
    {
      topic: string;
      proposal: any;
      votes: Map<
        string,
        {
          agentId: string;
          vote: 'agree' | 'disagree' | 'abstain';
          confidence: ConfidenceLevel;
          reasoning?: string;
        }
      >;
      status: 'pending' | 'achieved' | 'failed';
      round: number;
    }
  >;
  conflicts: Map<
    string,
    {
      id: string;
      topic: string;
      agentA: string;
      agentB: string;
      claimA: any;
      claimB: any;
      status: 'identified' | 'discussing' | 'resolved' | 'escalated';
      resolution?: any;
    }
  >;
  workflowStatus: Map<
    AnalysisPhase,
    {
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      startTime?: number;
      endTime?: number;
      participating: string[];
    }
  >;
}

/**
 * Implementation of the collaborative protocol service
 */
export class CollaborativeProtocolService extends EventEmitter {
  private communicationService: ICommunicationService;
  private stateManager: StateManager;
  private logger: Logger;
  private consensusThreshold: number;
  private maxRounds: number;
  private timeoutMs: number;
  private protocolState: ProtocolState;

  /**
   * Create a new collaborative protocol service
   */
  constructor(config: CollaborativeProtocolConfig) {
    super();

    this.communicationService = config.communicationService;
    this.stateManager = config.stateManager;
    this.logger = config.logger || new ConsoleLogger();
    this.consensusThreshold = config.consensusThreshold || 0.7; // Default 70% agreement
    this.maxRounds = config.maxRounds || 3;
    this.timeoutMs = config.timeoutMs || 30000; // Default 30 seconds

    // Initialize protocol state
    this.protocolState = {
      currentPhase: AnalysisPhase.INITIALIZATION,
      activeAgents: new Set<string>(),
      phaseStartTime: Date.now(),
      consensusTopics: new Map(),
      conflicts: new Map(),
      workflowStatus: new Map([
        [
          AnalysisPhase.INITIALIZATION,
          { status: 'pending', participating: [] },
        ],
        [
          AnalysisPhase.DATA_GATHERING,
          { status: 'pending', participating: [] },
        ],
        [
          AnalysisPhase.INDIVIDUAL_ANALYSIS,
          { status: 'pending', participating: [] },
        ],
        [
          AnalysisPhase.CROSS_VALIDATION,
          { status: 'pending', participating: [] },
        ],
        [
          AnalysisPhase.CONSENSUS_BUILDING,
          { status: 'pending', participating: [] },
        ],
        [AnalysisPhase.SYNTHESIS, { status: 'pending', participating: [] }],
        [AnalysisPhase.REFINEMENT, { status: 'pending', participating: [] }],
        [AnalysisPhase.FINALIZATION, { status: 'pending', participating: [] }],
      ]),
    };

    this.logger.info('Initialized CollaborativeProtocolService');
  }

  /**
   * Initialize the collaborative protocol
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing collaborative protocol');

      // Subscribe to agent messages
      await this.setupMessageHandlers();

      // Create communication channels
      await this.createCollaborationChannels();

      // Set protocol to initialization phase
      await this.transitionToPhase(AnalysisPhase.INITIALIZATION);

      this.logger.info('Collaborative protocol initialized successfully');
    } catch (error) {
      this.logger.error(
        `Error initializing collaborative protocol: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Register an agent with the protocol
   */
  async registerAgent(
    agentId: string,
    expertise: AgentExpertise[],
  ): Promise<void> {
    this.logger.info(
      `Registering agent ${agentId} with expertise: ${expertise.join(', ')}`,
    );

    // Add to active agents
    this.protocolState.activeAgents.add(agentId);

    // Add to appropriate channels based on expertise
    for (const area of expertise) {
      await this.communicationService.addParticipantToChannel(
        `expertise-${area}`,
        agentId,
      );
    }

    // Add to all-agents channel
    await this.communicationService.addParticipantToChannel(
      'all-agents',
      agentId,
    );

    // Add to workflow phase channels
    for (const phase of Object.values(AnalysisPhase)) {
      await this.communicationService.addParticipantToChannel(
        `phase-${phase}`,
        agentId,
      );
    }

    // Notify all agents about the new participant
    await this.communicationService.broadcastMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.NOTIFICATION,
      sender: 'protocol',
      content: {
        event: 'agent_joined',
        agentId,
        expertise,
      },
      timestamp: Date.now(),
    });

    this.logger.info(`Agent ${agentId} registered successfully`);
  }

  /**
   * Start the analysis workflow
   */
  async startWorkflow(
    analysisGoal: AnalysisGoalType,
    meetingId: string,
  ): Promise<void> {
    this.logger.info(
      `Starting analysis workflow for meeting ${meetingId}, goal: ${analysisGoal}`,
    );

    // Reset protocol state
    this.protocolState.currentPhase = AnalysisPhase.INITIALIZATION;
    this.protocolState.phaseStartTime = Date.now();

    // Store workflow information in state manager
    await this.stateManager.setState('currentWorkflow', {
      meetingId,
      analysisGoal,
      startTime: Date.now(),
      phases: [],
      status: 'in_progress',
    });

    // Notify all agents about workflow start
    await this.communicationService.broadcastMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.NOTIFICATION,
      sender: 'protocol',
      content: {
        event: 'workflow_started',
        meetingId,
        analysisGoal,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    });

    // Transition to the first real phase
    await this.transitionToPhase(AnalysisPhase.DATA_GATHERING);

    this.logger.info('Workflow started successfully');
  }

  /**
   * Transition to a new workflow phase
   */
  async transitionToPhase(newPhase: AnalysisPhase): Promise<void> {
    const prevPhase = this.protocolState.currentPhase;
    this.logger.info(`Transitioning from ${prevPhase} to ${newPhase} phase`);

    // Update workflow status for previous phase
    const prevPhaseStatus = this.protocolState.workflowStatus.get(prevPhase);
    if (prevPhaseStatus) {
      prevPhaseStatus.status = 'completed';
      prevPhaseStatus.endTime = Date.now();
      this.protocolState.workflowStatus.set(prevPhase, prevPhaseStatus);
    }

    // Update current phase
    this.protocolState.currentPhase = newPhase;
    this.protocolState.phaseStartTime = Date.now();

    // Update workflow status for new phase
    const newPhaseStatus = this.protocolState.workflowStatus.get(newPhase);
    if (newPhaseStatus) {
      newPhaseStatus.status = 'in_progress';
      newPhaseStatus.startTime = Date.now();
      newPhaseStatus.participating = Array.from(
        this.protocolState.activeAgents,
      );
      this.protocolState.workflowStatus.set(newPhase, newPhaseStatus);
    }

    // Notify all agents about phase transition
    await this.communicationService.publishToTopic(
      `phase-${newPhase}`,
      {
        id: `msg-${uuidv4()}`,
        type: MessageType.NOTIFICATION,
        sender: 'protocol',
        content: {
          event: 'phase_transition',
          prevPhase,
          newPhase,
          timestamp: Date.now(),
          phaseInstructions: this.getPhaseInstructions(newPhase),
        },
        timestamp: Date.now(),
      },
      {
        priority: MessagePriority.HIGH,
      },
    );

    // Update state manager
    const workflow = await this.stateManager.getState('currentWorkflow');
    if (workflow) {
      workflow.phases.push({
        phase: newPhase,
        startTime: Date.now(),
        status: 'in_progress',
      });
      await this.stateManager.setState('currentWorkflow', workflow);
    }

    this.logger.info(`Successfully transitioned to ${newPhase} phase`);
  }

  /**
   * Create a direct request between agents
   */
  async createDirectRequest(
    senderId: string,
    recipientId: string,
    requestType: string,
    content: any,
  ): Promise<string> {
    this.logger.info(
      `Creating direct request from ${senderId} to ${recipientId}`,
    );

    const requestId = `req-${uuidv4()}`;

    // Create and send the message
    const message: AgentMessage = {
      id: requestId,
      type: MessageType.REQUEST,
      sender: senderId,
      recipients: [recipientId],
      content: {
        requestType,
        data: content,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };

    await this.communicationService.sendMessage(message, {
      priority: MessagePriority.HIGH,
      requireConfirmation: true,
    });

    this.logger.info(`Direct request ${requestId} created successfully`);

    return requestId;
  }

  /**
   * Start consensus building on a specific topic
   */
  async initiateConsensusBuilding(
    initiatorId: string,
    topic: string,
    proposal: any,
    participantIds?: string[],
  ): Promise<string> {
    this.logger.info(`Initiating consensus building on topic: ${topic}`);

    const consensusId = `consensus-${uuidv4()}`;

    // Determine participants - either specific agents or all active agents
    const participants =
      participantIds || Array.from(this.protocolState.activeAgents);

    // Create consensus topic
    this.protocolState.consensusTopics.set(consensusId, {
      topic,
      proposal,
      votes: new Map(),
      status: 'pending',
      round: 1,
    });

    // Send consensus proposal to all participants
    await this.communicationService.sendMessage(
      {
        id: `msg-${uuidv4()}`,
        type: MessageType.REQUEST,
        sender: initiatorId,
        recipients: participants,
        content: {
          type: ProtocolMessageType.CONSENSUS_PROPOSAL,
          consensusId,
          topic,
          proposal,
          round: 1,
          deadline: Date.now() + this.timeoutMs,
          initiator: initiatorId,
        },
        timestamp: Date.now(),
      },
      {
        priority: MessagePriority.HIGH,
      },
    );

    // Set timeout for consensus round
    setTimeout(() => this.processConsensusRound(consensusId), this.timeoutMs);

    this.logger.info(
      `Consensus building ${consensusId} initiated successfully`,
    );

    return consensusId;
  }

  /**
   * Submit a vote in a consensus building process
   */
  async submitConsensusVote(
    consensusId: string,
    agentId: string,
    vote: 'agree' | 'disagree' | 'abstain',
    confidence: ConfidenceLevel,
    reasoning?: string,
  ): Promise<void> {
    this.logger.info(`Agent ${agentId} submitting consensus vote: ${vote}`);

    // Verify consensus exists
    const consensus = this.protocolState.consensusTopics.get(consensusId);
    if (!consensus) {
      throw new Error(`Consensus topic not found: ${consensusId}`);
    }

    // Record vote
    consensus.votes.set(agentId, {
      agentId,
      vote,
      confidence,
      reasoning,
    });

    // Update consensus record
    this.protocolState.consensusTopics.set(consensusId, consensus);

    this.logger.info(`Consensus vote recorded for ${consensusId}`);
  }

  /**
   * Implement progressive disclosure of information
   */
  async progressivelyDisclose(
    senderId: string,
    recipientIds: string[],
    topic: string,
    stage: number,
    content: any,
  ): Promise<void> {
    this.logger.info(`Progressive disclosure stage ${stage} for ${topic}`);

    // Send the progressive disclosure message
    await this.communicationService.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.UPDATE,
      sender: senderId,
      recipients: recipientIds,
      content: {
        type: ProtocolMessageType.PROGRESSIVE_DISCLOSURE,
        topic,
        stage,
        data: content,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    });

    this.logger.info(`Progressive disclosure for ${topic} stage ${stage} sent`);
  }

  /**
   * Get the current phase of the workflow
   */
  getCurrentPhase(): AnalysisPhase {
    return this.protocolState.currentPhase;
  }

  /**
   * Get the status of the entire workflow
   */
  getWorkflowStatus(): Map<
    AnalysisPhase,
    {
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      startTime?: number;
      endTime?: number;
      participating: string[];
    }
  > {
    return this.protocolState.workflowStatus;
  }

  /**
   * Get consensus status for a specific topic
   */
  getConsensusStatus(consensusId: string): any {
    return this.protocolState.consensusTopics.get(consensusId);
  }

  /**
   * Private methods
   */

  /**
   * Process a completed consensus round
   */
  private async processConsensusRound(consensusId: string): Promise<void> {
    this.logger.info(`Processing consensus round for ${consensusId}`);

    // Get consensus topic
    const consensus = this.protocolState.consensusTopics.get(consensusId);
    if (!consensus) {
      this.logger.warn(`Consensus topic not found: ${consensusId}`);
      return;
    }

    // Calculate current agreement level
    let agrees = 0;
    let disagrees = 0;
    let abstains = 0;

    for (const [_, vote] of consensus.votes) {
      if (vote.vote === 'agree') agrees++;
      else if (vote.vote === 'disagree') disagrees++;
      else abstains++;
    }

    const totalVotes = agrees + disagrees + abstains;
    const agreementLevel = totalVotes > 0 ? agrees / totalVotes : 0;

    // Check if consensus is reached
    if (agreementLevel >= this.consensusThreshold) {
      // Consensus achieved
      consensus.status = 'achieved';
      this.protocolState.consensusTopics.set(consensusId, consensus);

      // Notify all participants
      await this.communicationService.broadcastMessage({
        id: `msg-${uuidv4()}`,
        type: MessageType.NOTIFICATION,
        sender: 'protocol',
        content: {
          type: ProtocolMessageType.CONSENSUS_VOTE,
          event: 'consensus_achieved',
          consensusId,
          topic: consensus.topic,
          agreementLevel,
          finalProposal: consensus.proposal,
        },
        timestamp: Date.now(),
      });

      this.logger.info(
        `Consensus achieved for ${consensusId} with agreement level ${agreementLevel}`,
      );
    } else if (consensus.round >= this.maxRounds) {
      // Max rounds reached without consensus
      consensus.status = 'failed';
      this.protocolState.consensusTopics.set(consensusId, consensus);

      // Notify all participants
      await this.communicationService.broadcastMessage({
        id: `msg-${uuidv4()}`,
        type: MessageType.NOTIFICATION,
        sender: 'protocol',
        content: {
          type: ProtocolMessageType.CONSENSUS_VOTE,
          event: 'consensus_failed',
          consensusId,
          topic: consensus.topic,
          agreementLevel,
          reason: 'Max rounds reached',
        },
        timestamp: Date.now(),
      });

      this.logger.info(
        `Consensus failed for ${consensusId} after ${consensus.round} rounds`,
      );
    } else {
      // Start new round
      consensus.round++;
      this.protocolState.consensusTopics.set(consensusId, consensus);

      // Notify all participants
      const participants = Array.from(this.protocolState.activeAgents);

      await this.communicationService.sendMessage({
        id: `msg-${uuidv4()}`,
        type: MessageType.REQUEST,
        sender: 'protocol',
        recipients: participants,
        content: {
          type: ProtocolMessageType.CONSENSUS_PROPOSAL,
          consensusId,
          topic: consensus.topic,
          proposal: consensus.proposal,
          round: consensus.round,
          deadline: Date.now() + this.timeoutMs,
          previousVotes: Array.from(consensus.votes.values()),
          agreementLevel,
        },
        timestamp: Date.now(),
      });

      // Set timeout for next round
      setTimeout(() => this.processConsensusRound(consensusId), this.timeoutMs);

      this.logger.info(
        `Started round ${consensus.round} for consensus ${consensusId}`,
      );
    }
  }

  /**
   * Create collaboration channels based on expertise and workflow phases
   */
  private async createCollaborationChannels(): Promise<void> {
    this.logger.info('Creating collaboration channels');

    // Create all-agents channel
    await this.communicationService.createChannel({
      name: 'All Agents',
      type: ChannelType.BROADCAST,
      description: 'All agents participating in the analysis',
      participants: [],
    });

    // Create expertise-based channels
    for (const expertise of Object.values(AgentExpertise)) {
      await this.communicationService.createChannel({
        name: `Expertise: ${expertise}`,
        type: ChannelType.TOPIC,
        description: `Channel for agents with ${expertise} expertise`,
        participants: [],
      });
    }

    // Create workflow phase channels
    for (const phase of Object.values(AnalysisPhase)) {
      await this.communicationService.createChannel({
        name: `Phase: ${phase}`,
        type: ChannelType.TOPIC,
        description: `Channel for ${phase} phase coordination`,
        participants: [],
      });
    }

    this.logger.info('Collaboration channels created successfully');
  }

  /**
   * Set up message handlers for protocol events
   */
  private async setupMessageHandlers(): Promise<void> {
    // Set up handlers for different message types
    this.communicationService.on('message', async (message: AgentMessage) => {
      // Handle based on content.type
      const contentType = message.content?.type;

      if (contentType === ProtocolMessageType.CONSENSUS_VOTE) {
        // Handle consensus vote
        await this.handleConsensusVote(message);
      } else if (contentType === ProtocolMessageType.CONSENSUS_PROPOSAL) {
        // Handle consensus proposal
        await this.handleConsensusProposal(message);
      } else if (contentType === ProtocolMessageType.KNOWLEDGE_SHARING) {
        // Handle knowledge sharing
        await this.handleKnowledgeSharing(message);
      } else if (contentType === ProtocolMessageType.CONFLICT_NOTIFICATION) {
        // Handle conflict notification
        await this.handleConflictNotification(message);
      }
    });
  }

  /**
   * Handle a consensus vote message
   */
  private async handleConsensusVote(message: AgentMessage): Promise<void> {
    const { consensusId, vote, confidence, reasoning } = message.content;

    this.logger.debug(
      `Handling consensus vote for ${consensusId} from ${message.sender}`,
    );

    // Record the vote
    await this.submitConsensusVote(
      consensusId,
      message.sender,
      vote,
      confidence,
      reasoning,
    );
  }

  /**
   * Handle a consensus proposal message
   */
  private async handleConsensusProposal(message: AgentMessage): Promise<void> {
    // This is handled by individual agents
    this.logger.debug(`Received consensus proposal message: ${message.id}`);
  }

  /**
   * Handle a knowledge sharing message
   */
  private async handleKnowledgeSharing(message: AgentMessage): Promise<void> {
    // This is handled by individual agents
    this.logger.debug(`Received knowledge sharing message: ${message.id}`);
  }

  /**
   * Handle a conflict notification message
   */
  private async handleConflictNotification(
    message: AgentMessage,
  ): Promise<void> {
    const { conflictId, topic, counterparty, claim } = message.content;

    this.logger.debug(
      `Handling conflict notification ${conflictId} from ${message.sender}`,
    );

    // Forward to conflict resolution service
    this.emit('conflict_detected', {
      conflictId,
      topic,
      agentA: message.sender,
      agentB: counterparty,
      claimA: claim,
      timestamp: message.timestamp,
    });
  }

  /**
   * Get instructions specific to a workflow phase
   */
  private getPhaseInstructions(phase: AnalysisPhase): string {
    switch (phase) {
      case AnalysisPhase.INITIALIZATION:
        return 'Register capabilities and prepare for analysis.';

      case AnalysisPhase.DATA_GATHERING:
        return 'Collect and process all necessary data from the meeting transcript.';

      case AnalysisPhase.INDIVIDUAL_ANALYSIS:
        return 'Perform specialized analysis based on agent expertise.';

      case AnalysisPhase.CROSS_VALIDATION:
        return 'Share and validate findings with other agents.';

      case AnalysisPhase.CONSENSUS_BUILDING:
        return 'Work toward consensus on key findings and interpretations.';

      case AnalysisPhase.SYNTHESIS:
        return 'Combine validated analyses into cohesive outputs.';

      case AnalysisPhase.REFINEMENT:
        return 'Review and improve the quality of synthesized outputs.';

      case AnalysisPhase.FINALIZATION:
        return 'Finalize and prepare deliverables for the user.';

      default:
        return 'Process according to standard protocol.';
    }
  }
}
