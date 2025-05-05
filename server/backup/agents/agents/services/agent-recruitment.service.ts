/**
 * Agent Recruitment Service
 *
 * Implements the multi-stage recruitment protocol for agent team formation
 * including inquiry, proposal, and acceptance phases.
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentRegistryService } from './agent-registry.service';
import { EventEmitter } from 'events';
import {
  RecruitmentMessageType,
  RecruitmentBaseMessage,
  RecruitmentInquiryMessage,
  RecruitmentProposalMessage,
  CounterProposalMessage,
  AcceptanceMessage,
  RejectionMessage,
  TeamContract,
  CapabilityAdvertisement,
  NegotiationStrategy,
  CommitmentRecord,
  createBaseMessage,
} from '../interfaces/recruitment-protocol.interface';
import { BaseAgentInterface } from '../interfaces/base-agent.interface';

/**
 * Recruitment workflow status
 */
export enum RecruitmentStatus {
  INQUIRY_SENT = 'inquiry_sent',
  PROPOSAL_SENT = 'proposal_sent',
  COUNTER_PROPOSED = 'counter_proposed',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

/**
 * Recruitment record tracking the full recruitment workflow
 */
interface RecruitmentRecord {
  id: string;
  taskId: string;
  teamId?: string;
  recruiterId: string;
  targetAgentId: string;
  status: RecruitmentStatus;
  inquiry?: RecruitmentInquiryMessage;
  proposal?: RecruitmentProposalMessage;
  counterProposal?: CounterProposalMessage;
  acceptance?: AcceptanceMessage;
  rejection?: RejectionMessage;
  commitment?: CommitmentRecord;
  history: {
    timestamp: number;
    status: RecruitmentStatus;
    message: string;
  }[];
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

/**
 * Events emitted by the recruitment service
 */
export enum RecruitmentEventType {
  INQUIRY_SENT = 'inquiry_sent',
  PROPOSAL_SENT = 'proposal_sent',
  COUNTER_PROPOSAL_RECEIVED = 'counter_proposal_received',
  PROPOSAL_ACCEPTED = 'proposal_accepted',
  PROPOSAL_REJECTED = 'proposal_rejected',
  RECRUITMENT_EXPIRED = 'recruitment_expired',
  RECRUITMENT_CANCELLED = 'recruitment_cancelled',
  COMMITMENT_CREATED = 'commitment_created',
  COMMITMENT_UPDATED = 'commitment_updated',
}

/**
 * Simple MessageBus interface
 */
interface MessageBus {
  publish(topic: string, message: any): Promise<void>;
  subscribe(topic: string, handler: (message: any) => void): void;
}

/**
 * Event-based MessageBus implementation
 */
class EventMessageBus implements MessageBus {
  private emitter = new EventEmitter();

  async publish(topic: string, message: any): Promise<void> {
    this.emitter.emit(topic, message);
  }

  subscribe(topic: string, handler: (message: any) => void): void {
    this.emitter.on(topic, handler);
  }
}

/**
 * Agent Recruitment Service - handles agent team formation
 */
export class AgentRecruitmentService {
  private static instance: AgentRecruitmentService;
  private logger: Logger;
  private agentRegistry: AgentRegistryService;
  private eventEmitter: EventEmitter;
  private messageBus: MessageBus;

  // Storage
  private recruitmentRecords: Map<string, RecruitmentRecord> = new Map();
  private commitmentRecords: Map<string, CommitmentRecord> = new Map();
  private agentRecruitmentHistory: Map<string, string[]> = new Map(); // agentId -> recruitmentIds
  private activeRecruitments: Map<string, RecruitmentProposalMessage> =
    new Map();
  private activeContracts: Map<string, TeamContract> = new Map();
  private capabilityRegistry: Map<string, CapabilityAdvertisement> = new Map();
  private negotiationHistory: Map<string, RecruitmentBaseMessage[]> = new Map();

  /**
   * Private constructor (singleton pattern)
   */
  private constructor(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
      messageBus?: MessageBus;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.agentRegistry =
      options.agentRegistry || AgentRegistryService.getInstance();
    this.eventEmitter = new EventEmitter();
    this.messageBus = options.messageBus || new EventMessageBus();

    // Start cleanup of expired recruitments
    setInterval(() => this.cleanupExpiredRecruitments(), 60000); // Run every minute

    this.logger.info('AgentRecruitmentService initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    options: {
      logger?: Logger;
      agentRegistry?: AgentRegistryService;
      messageBus?: MessageBus;
    } = {},
  ): AgentRecruitmentService {
    if (!AgentRecruitmentService.instance) {
      AgentRecruitmentService.instance = new AgentRecruitmentService(options);
    }
    return AgentRecruitmentService.instance;
  }

  /**
   * Track a negotiation message in the conversation history
   */
  private trackNegotiationMessage(
    conversationId: string,
    message: RecruitmentBaseMessage,
  ): void {
    const messages = this.negotiationHistory.get(conversationId) || [];
    messages.push(message);
    this.negotiationHistory.set(conversationId, messages);
  }

  /**
   * Create a basic recruitment inquiry
   */
  public createInquiry(params: {
    recruiterId: string;
    recruiterName?: string;
    targetAgentId: string;
    taskId: string;
    teamId?: string;
    taskDescription: string;
    requiredCapabilities: string[];
    priority: number;
    deadline?: number;
    expiresIn?: number; // milliseconds
  }): RecruitmentInquiryMessage {
    const timestamp = Date.now();
    const expiresAt = params.expiresIn
      ? timestamp + params.expiresIn
      : timestamp + 86400000; // Default 24 hours

    const inquiry: RecruitmentInquiryMessage = {
      id: uuidv4(),
      type: RecruitmentMessageType.INQUIRY,
      timestamp,
      senderAgentId: params.recruiterId,
      senderAgentName: params.recruiterName,
      recipientAgentId: params.targetAgentId,
      taskId: params.taskId,
      teamId: params.teamId,
      conversationId: uuidv4(),
      taskDescription: params.taskDescription,
      requiredCapabilities: params.requiredCapabilities,
      priority: params.priority,
      deadline: params.deadline,
      expiration: expiresAt,
    };

    // Create a recruitment record
    const recruitmentId = uuidv4();
    const record: RecruitmentRecord = {
      id: recruitmentId,
      taskId: params.taskId,
      teamId: params.teamId,
      recruiterId: params.recruiterId,
      targetAgentId: params.targetAgentId,
      status: RecruitmentStatus.INQUIRY_SENT,
      inquiry,
      history: [
        {
          timestamp,
          status: RecruitmentStatus.INQUIRY_SENT,
          message: `Recruitment inquiry sent to ${params.targetAgentId}`,
        },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt,
    };

    this.recruitmentRecords.set(recruitmentId, record);
    this.trackAgentRecruitment(params.targetAgentId, recruitmentId);

    // Track conversation
    this.trackNegotiationMessage(inquiry.conversationId!, inquiry);

    // Emit event
    this.emitEvent({
      type: RecruitmentEventType.INQUIRY_SENT,
      recruitmentId,
      inquiry,
      senderAgentId: params.recruiterId,
      recipientAgentId: params.targetAgentId,
      timestamp,
    });

    return inquiry;
  }

  /**
   * Create a proposal
   */
  public createProposal(params: {
    recruitmentId: string;
    proposedRole: string;
    responsibilities: string[];
    requiredCapabilities: string[];
    expectedContribution: string;
    expectedDuration: number;
    expectedStart?: number;
    expectedEnd?: number;
    compensation?: {
      type: string;
      value: number;
    };
    offerExpiresIn?: number; // milliseconds until expiration
    utilityScore?: number;
  }): RecruitmentProposalMessage | null {
    // Get the recruitment record
    const record = this.recruitmentRecords.get(params.recruitmentId);
    if (!record) {
      this.logger.warn(`Recruitment record ${params.recruitmentId} not found`);
      return null;
    }

    const timestamp = Date.now();
    const expiration = params.offerExpiresIn
      ? timestamp + params.offerExpiresIn
      : timestamp + 86400000; // Default 24 hours

    // Create the proposal
    const proposal: RecruitmentProposalMessage = {
      id: uuidv4(),
      type: RecruitmentMessageType.PROPOSAL,
      timestamp,
      senderAgentId: record.recruiterId,
      recipientAgentId: record.targetAgentId,
      conversationId: record.inquiry?.conversationId,
      replyToId: record.inquiry?.id,
      taskId: record.taskId,
      teamId: record.teamId,
      proposalId: uuidv4(),
      proposedRole: params.proposedRole,
      responsibilities: params.responsibilities,
      requiredCapabilities: params.requiredCapabilities,
      expectedContribution: params.expectedContribution,
      expectedDuration: params.expectedDuration,
      compensation: params.compensation,
      expiration,
    };

    // Update the recruitment record
    record.proposal = proposal;
    record.status = RecruitmentStatus.PROPOSAL_SENT;
    record.updatedAt = timestamp;

    // Add history entry
    record.history.push({
      timestamp,
      status: RecruitmentStatus.PROPOSAL_SENT,
      message: `Recruitment proposal sent to ${record.targetAgentId}`,
    });

    this.recruitmentRecords.set(params.recruitmentId, record);

    // Track active recruitment
    this.activeRecruitments.set(proposal.proposalId, proposal);

    // Track in conversation
    if (proposal.conversationId) {
      this.trackNegotiationMessage(proposal.conversationId, proposal);
    }

    // Emit event
    this.emitEvent({
      type: RecruitmentEventType.PROPOSAL_SENT,
      recruitmentId: params.recruitmentId,
      proposal,
      senderAgentId: record.recruiterId,
      recipientAgentId: record.targetAgentId,
      timestamp,
    });

    return proposal;
  }

  /**
   * Create and send a recruitment inquiry to a target agent
   */
  public async createRecruitmentInquiry(
    senderAgent: BaseAgentInterface,
    targetAgentId: string,
    taskId: string,
    taskDescription: string,
    requiredCapabilities: string[],
    priority: number,
    deadline?: number,
    teamId?: string,
  ): Promise<RecruitmentInquiryMessage> {
    try {
      const targetAgent = this.agentRegistry.getAgent(targetAgentId);

      if (!targetAgent) {
        throw new Error(`Target agent with ID ${targetAgentId} not found`);
      }

      const timestamp = Date.now();
      const conversationId = uuidv4();

      const inquiry: RecruitmentInquiryMessage = {
        id: uuidv4(),
        type: RecruitmentMessageType.INQUIRY,
        timestamp,
        senderAgentId: senderAgent.id,
        senderAgentName: senderAgent.name,
        recipientAgentId: targetAgentId,
        conversationId,
        taskId,
        teamId,
        taskDescription,
        requiredCapabilities,
        priority,
        deadline,
      };

      // Create recruitment record
      const recruitmentId = uuidv4();
      const recruitmentRecord: RecruitmentRecord = {
        id: recruitmentId,
        taskId,
        teamId,
        recruiterId: senderAgent.id,
        targetAgentId,
        status: RecruitmentStatus.INQUIRY_SENT,
        inquiry,
        history: [
          {
            timestamp,
            status: RecruitmentStatus.INQUIRY_SENT,
            message: `Recruitment inquiry sent from ${senderAgent.name} to agent ${targetAgentId}`,
          },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
        expiresAt: timestamp + 86400000, // 24 hours
      };

      this.recruitmentRecords.set(recruitmentId, recruitmentRecord);
      this.trackAgentRecruitment(targetAgentId, recruitmentId);

      // Track the conversation
      this.trackNegotiationMessage(conversationId, inquiry);

      // Emit event
      this.emitEvent({
        type: RecruitmentEventType.INQUIRY_SENT,
        recruitmentId,
        inquiry,
        senderAgentId: senderAgent.id,
        recipientAgentId: targetAgentId,
        timestamp,
      });

      this.logger.info(
        `Recruitment inquiry sent from ${senderAgent.name} to agent ${targetAgentId}`,
      );
      return inquiry;
    } catch (error) {
      this.logger.error(
        `Error creating recruitment inquiry: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Create and send a formal recruitment proposal to a target agent
   */
  public async createRecruitmentProposal(
    senderAgent: BaseAgentInterface,
    targetAgentId: string,
    taskId: string,
    proposedRole: string,
    responsibilities: string[],
    requiredCapabilities: string[],
    expectedContribution: string,
    expectedDuration: number,
    conversationId?: string,
    teamId?: string,
    compensation?: { type: string; value: number },
  ): Promise<RecruitmentProposalMessage> {
    try {
      const targetAgent = this.agentRegistry.getAgent(targetAgentId);

      if (!targetAgent) {
        throw new Error(`Target agent with ID ${targetAgentId} not found`);
      }

      const timestamp = Date.now();
      const proposalId = uuidv4();

      // Generate a new conversation ID if none provided
      const useConversationId = conversationId || uuidv4();

      const proposal: RecruitmentProposalMessage = {
        id: uuidv4(),
        type: RecruitmentMessageType.PROPOSAL,
        timestamp,
        senderAgentId: senderAgent.id,
        senderAgentName: senderAgent.name,
        recipientAgentId: targetAgentId,
        conversationId: useConversationId,
        taskId,
        teamId,
        proposalId,
        proposedRole,
        responsibilities,
        requiredCapabilities,
        expectedContribution,
        expectedDuration,
        compensation,
        expiration: timestamp + 86400000, // 24 hours
      };

      // Find existing recruitment or create new one
      let recruitmentRecord = Array.from(this.recruitmentRecords.values()).find(
        (r) =>
          r.taskId === taskId &&
          r.recruiterId === senderAgent.id &&
          r.targetAgentId === targetAgentId,
      );

      if (!recruitmentRecord) {
        // Create new recruitment record
        const recruitmentId = uuidv4();
        recruitmentRecord = {
          id: recruitmentId,
          taskId,
          teamId,
          recruiterId: senderAgent.id,
          targetAgentId,
          status: RecruitmentStatus.PROPOSAL_SENT,
          proposal,
          history: [],
          createdAt: timestamp,
          updatedAt: timestamp,
          expiresAt: timestamp + 86400000, // 24 hours
        };

        this.recruitmentRecords.set(recruitmentId, recruitmentRecord);
        this.trackAgentRecruitment(targetAgentId, recruitmentId);
      } else {
        // Update existing record
        recruitmentRecord.proposal = proposal;
        recruitmentRecord.status = RecruitmentStatus.PROPOSAL_SENT;
        recruitmentRecord.updatedAt = timestamp;
      }

      // Add history entry
      recruitmentRecord.history.push({
        timestamp,
        status: RecruitmentStatus.PROPOSAL_SENT,
        message: `Recruitment proposal sent from ${senderAgent.name} to agent ${targetAgentId}`,
      });

      // Track the active proposal
      this.activeRecruitments.set(proposalId, proposal);

      // Track in negotiation history
      this.trackNegotiationMessage(useConversationId, proposal);

      // Emit event
      this.emitEvent({
        type: RecruitmentEventType.PROPOSAL_SENT,
        recruitmentId: recruitmentRecord.id,
        proposal,
        senderAgentId: senderAgent.id,
        recipientAgentId: targetAgentId,
        timestamp,
      });

      this.logger.info(
        `Recruitment proposal sent from ${senderAgent.name} to agent ${targetAgentId}`,
      );
      return proposal;
    } catch (error) {
      this.logger.error(
        `Error creating recruitment proposal: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Create a counter proposal in response to an original proposal
   */
  public async createCounterProposal(
    senderAgent: BaseAgentInterface,
    originalProposal: RecruitmentProposalMessage,
    proposedRole: string,
    responsibilities: string[],
    expectedDuration: number,
    changes: {
      role?: boolean;
      responsibilities?: boolean;
      duration?: boolean;
      compensation?: boolean;
    },
    justification: string,
    compensation?: { type: string; value: number },
  ): Promise<CounterProposalMessage> {
    try {
      const timestamp = Date.now();

      const counterProposal: CounterProposalMessage = {
        id: uuidv4(),
        type: RecruitmentMessageType.COUNTER_PROPOSAL,
        timestamp,
        senderAgentId: senderAgent.id,
        senderAgentName: senderAgent.name,
        recipientAgentId: originalProposal.senderAgentId,
        conversationId: originalProposal.conversationId,
        taskId: originalProposal.taskId,
        teamId: originalProposal.teamId,
        originalProposalId: originalProposal.id,
        proposedRole,
        responsibilities,
        requiredCapabilities: originalProposal.requiredCapabilities,
        expectedContribution: originalProposal.expectedContribution,
        expectedDuration,
        changes,
        justification,
        compensation,
        expiration: timestamp + 86400000, // 24 hours
        modifiedTerms: [
          // Add modified terms based on changes
          ...(changes.role
            ? [
                {
                  field: 'proposedRole',
                  originalValue: originalProposal.proposedRole,
                  proposedValue: proposedRole,
                  justification: `Agent prefers the role of ${proposedRole}`,
                },
              ]
            : []),
          ...(changes.responsibilities
            ? [
                {
                  field: 'responsibilities',
                  originalValue: originalProposal.responsibilities,
                  proposedValue: responsibilities,
                  justification:
                    'Agent has different preferred responsibilities',
                },
              ]
            : []),
          ...(changes.duration
            ? [
                {
                  field: 'expectedDuration',
                  originalValue: originalProposal.expectedDuration,
                  proposedValue: expectedDuration,
                  justification: 'Agent suggests different timeline',
                },
              ]
            : []),
          ...(changes.compensation &&
          compensation &&
          originalProposal.compensation
            ? [
                {
                  field: 'compensation',
                  originalValue: originalProposal.compensation,
                  proposedValue: compensation,
                  justification: 'Agent requests different compensation',
                },
              ]
            : []),
        ],
      };

      // Find the recruitment record
      const recruitmentRecord = this.getRecruitmentByProposal(
        originalProposal.id,
      );

      if (!recruitmentRecord) {
        throw new Error(
          `No recruitment record found for proposal ${originalProposal.id}`,
        );
      }

      // Update the recruitment record
      recruitmentRecord.counterProposal = counterProposal;
      recruitmentRecord.status = RecruitmentStatus.COUNTER_PROPOSED;
      recruitmentRecord.updatedAt = timestamp;

      // Add history entry
      recruitmentRecord.history.push({
        timestamp,
        status: RecruitmentStatus.COUNTER_PROPOSED,
        message: `Counter proposal sent from ${senderAgent.name} to agent ${originalProposal.senderAgentId}`,
      });

      // Track in negotiation history
      if (counterProposal.conversationId) {
        this.trackNegotiationMessage(
          counterProposal.conversationId,
          counterProposal,
        );
      }

      // Emit event
      this.emitEvent({
        type: RecruitmentEventType.COUNTER_PROPOSAL_RECEIVED,
        recruitmentId: recruitmentRecord.id,
        counterProposal,
        originalProposal,
        senderAgentId: senderAgent.id,
        recipientAgentId: originalProposal.senderAgentId,
        timestamp,
      });

      this.logger.info(
        `Counter proposal sent from ${senderAgent.name} to agent ${originalProposal.senderAgentId}`,
      );
      return counterProposal;
    } catch (error) {
      this.logger.error(
        `Error creating counter proposal: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Accept a recruitment proposal
   */
  public async acceptProposal(
    senderAgent: BaseAgentInterface,
    proposal: RecruitmentProposalMessage | CounterProposalMessage,
    startTime: number,
    endTime?: number,
    additionalNotes?: string,
  ): Promise<AcceptanceMessage> {
    try {
      const timestamp = Date.now();
      const proposalId =
        'proposalId' in proposal
          ? proposal.proposalId
          : proposal.originalProposalId;

      const acceptance: AcceptanceMessage = {
        id: uuidv4(),
        type: RecruitmentMessageType.ACCEPTANCE,
        timestamp,
        senderAgentId: senderAgent.id,
        senderAgentName: senderAgent.name,
        recipientAgentId: proposal.senderAgentId,
        conversationId: proposal.conversationId,
        taskId: proposal.taskId,
        teamId: proposal.teamId,
        proposalId,
        acceptedTerms: {
          role: proposal.proposedRole,
          responsibilities: proposal.responsibilities,
          duration: proposal.expectedDuration,
          compensation: proposal.compensation,
        },
        availability: {
          startTime,
          endTime,
        },
        availableStartTime: startTime,
        expectedCompletionTime: endTime,
        commitmentLevel: 'firm',
        additionalNotes,
      };

      // Find the recruitment record
      const recruitmentRecord = this.getRecruitmentByProposal(proposalId);

      if (!recruitmentRecord) {
        throw new Error(
          `No recruitment record found for proposal ${proposalId}`,
        );
      }

      // Update the recruitment record
      recruitmentRecord.acceptance = acceptance;
      recruitmentRecord.status = RecruitmentStatus.ACCEPTED;
      recruitmentRecord.updatedAt = timestamp;

      // Add history entry
      recruitmentRecord.history.push({
        timestamp,
        status: RecruitmentStatus.ACCEPTED,
        message: `Proposal accepted by ${senderAgent.name}`,
      });

      // Process the acceptance
      const acceptanceResult = this.processAcceptance(acceptance);

      // Track in negotiation history
      if (acceptance.conversationId) {
        this.trackNegotiationMessage(acceptance.conversationId, acceptance);
      }

      // Emit event
      this.emitEvent({
        type: RecruitmentEventType.PROPOSAL_ACCEPTED,
        recruitmentId: recruitmentRecord.id,
        acceptance,
        proposal,
        senderAgentId: senderAgent.id,
        recipientAgentId: proposal.senderAgentId,
        timestamp,
      });

      this.logger.info(`Proposal accepted by ${senderAgent.name}`);
      return acceptance;
    } catch (error) {
      this.logger.error(
        `Error accepting proposal: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Reject a recruitment proposal
   */
  public async rejectProposal(
    senderAgent: BaseAgentInterface,
    proposal: RecruitmentProposalMessage | CounterProposalMessage,
    reason: string,
    alternativeAvailability?: { startTime: number; endTime?: number },
    additionalNotes?: string,
  ): Promise<RejectionMessage> {
    try {
      const timestamp = Date.now();
      const proposalId =
        'proposalId' in proposal
          ? proposal.proposalId
          : proposal.originalProposalId;

      const rejection: RejectionMessage = {
        id: uuidv4(),
        type: RecruitmentMessageType.REJECTION,
        timestamp,
        senderAgentId: senderAgent.id,
        senderAgentName: senderAgent.name,
        recipientAgentId: proposal.senderAgentId,
        conversationId: proposal.conversationId,
        taskId: proposal.taskId,
        teamId: proposal.teamId,
        proposalId,
        reason,
        alternativeAvailability,
        additionalNotes,
      };

      // Find the recruitment record
      const recruitmentRecord = this.getRecruitmentByProposal(proposalId);

      if (!recruitmentRecord) {
        throw new Error(
          `No recruitment record found for proposal ${proposalId}`,
        );
      }

      // Update the recruitment record
      recruitmentRecord.rejection = rejection;
      recruitmentRecord.status = RecruitmentStatus.REJECTED;
      recruitmentRecord.updatedAt = timestamp;

      // Add history entry
      recruitmentRecord.history.push({
        timestamp,
        status: RecruitmentStatus.REJECTED,
        message: `Proposal rejected by ${senderAgent.name}: ${reason}`,
      });

      // Process the rejection
      const rejectionResult = this.processRejection(rejection);

      // Track in negotiation history
      if (rejection.conversationId) {
        this.trackNegotiationMessage(rejection.conversationId, rejection);
      }

      // Emit event
      this.emitEvent({
        type: RecruitmentEventType.PROPOSAL_REJECTED,
        recruitmentId: recruitmentRecord.id,
        rejection,
        proposal,
        reason,
        senderAgentId: senderAgent.id,
        recipientAgentId: proposal.senderAgentId,
        timestamp,
      });

      this.logger.info(`Proposal rejected by ${senderAgent.name}: ${reason}`);
      return rejection;
    } catch (error) {
      this.logger.error(
        `Error rejecting proposal: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Create a team contract after successful recruitment
   */
  public async createTeamContract(
    initiatorAgent: BaseAgentInterface,
    taskId: string,
    contractName: string,
    description: string,
    participants: {
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
    }[],
    terms: {
      startTime: number;
      endTime?: number;
      deadline?: number;
      gracePeriod?: number;
      terminationConditions?: string[];
      paymentTerms?: Record<string, any>;
    },
    expectedOutcomes: string[],
    teamId?: string,
  ): Promise<TeamContract> {
    try {
      const contractId = uuidv4();
      const teamIdToUse = teamId || uuidv4();
      const timestamp = Date.now();

      const contract: TeamContract = {
        ...createBaseMessage(
          RecruitmentMessageType.CONTRACT,
          initiatorAgent.id,
          initiatorAgent.name,
          'team', // Special recipient indicating broadcast to team
          taskId,
          teamIdToUse,
        ),
        type: RecruitmentMessageType.CONTRACT, // Explicitly set correct type
        contractId,
        name: contractName,
        description,
        participants,
        terms,
        expectedOutcomes,
        signatures: [
          {
            agentId: initiatorAgent.id,
            timestamp: timestamp,
          },
        ],
        status: 'draft',
        statusHistory: [
          {
            status: 'draft',
            timestamp: timestamp,
            updatedBy: initiatorAgent.id,
          },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: initiatorAgent.id,
        metadata: {},
      };

      await this.messageBus.publish('agent.recruitment.contract', contract);

      // Store the contract
      this.activeContracts.set(contractId, contract);

      this.logger.info(
        `Team contract created by ${initiatorAgent.name} for task ${taskId}`,
      );
      return contract;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error creating team contract: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Sign an existing team contract
   */
  public async signTeamContract(
    agentId: string,
    contractId: string,
  ): Promise<TeamContract | null> {
    try {
      const contract = this.activeContracts.get(contractId);

      if (!contract) {
        throw new Error(`Contract with ID ${contractId} not found`);
      }

      // Check if agent is already a signatory
      if (contract.signatures.some((sig) => sig.agentId === agentId)) {
        this.logger.info(
          `Agent ${agentId} has already signed contract ${contractId}`,
        );
        return contract;
      }

      // Add signature
      contract.signatures.push({
        agentId,
        timestamp: Date.now(),
      });

      // Check if all participants have signed
      const allParticipantIds = contract.participants.map((p) => p.agentId);
      const allSigned = allParticipantIds.every((id) =>
        contract.signatures.some((sig) => sig.agentId === id),
      );

      if (allSigned && contract.status === 'draft') {
        contract.status = 'active';
        contract.statusHistory.push({
          status: 'active',
          timestamp: Date.now(),
          updatedBy: agentId,
          reason: 'All participants signed the contract',
        });
      }

      // Update the contract
      this.activeContracts.set(contractId, contract);

      // Notify team members
      await this.messageBus.publish('agent.recruitment.contract', contract);

      this.logger.info(`Agent ${agentId} signed contract ${contractId}`);
      return contract;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error signing team contract: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Process an acceptance message
   */
  public processAcceptance(acceptance: AcceptanceMessage): boolean {
    try {
      // Find the recruitment record
      const record = this.getRecruitmentByProposal(acceptance.proposalId);

      if (!record) {
        this.logger.warn(
          `No recruitment found for proposal ${acceptance.proposalId}`,
        );
        return false;
      }

      // Update record status
      record.status = RecruitmentStatus.ACCEPTED;
      record.acceptance = acceptance;
      record.updatedAt = Date.now();

      // Create a commitment record
      const commitmentId = uuidv4();
      const timestamp = Date.now();
      const commitment: CommitmentRecord = {
        id: commitmentId,
        agentId: record.targetAgentId,
        contractId: '', // Will be set when contract is created
        taskId: record.taskId,
        commitmentType:
          acceptance.commitmentLevel === 'guaranteed'
            ? 'full'
            : acceptance.commitmentLevel === 'firm'
              ? 'partial'
              : 'tentative',
        startTime: acceptance.availability.startTime,
        endTime: acceptance.availability.endTime,
        status: 'active',
        history: [
          {
            status: 'active',
            timestamp,
            details: {
              message: `Commitment created from accepted proposal ${acceptance.proposalId}`,
              proposalId: acceptance.proposalId,
            },
          },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      // Store the commitment
      this.commitmentRecords.set(commitmentId, commitment);

      // Link commitment to recruitment record
      record.commitment = commitment;

      // Emit commitment creation event
      this.emitEvent({
        type: RecruitmentEventType.COMMITMENT_CREATED,
        commitmentId,
        agentId: record.targetAgentId,
        taskId: record.taskId,
        startTime: commitment.startTime,
        endTime: commitment.endTime,
        commitmentType: commitment.commitmentType,
        timestamp,
      });

      this.logger.info(
        `Acceptance processed for recruitment ${record.id} - commitment ${commitmentId} created`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Error processing acceptance: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Process a counter proposal
   */
  public processCounterProposal(
    counterProposal: CounterProposalMessage,
  ): boolean {
    try {
      // Find the original proposal
      const originalProposalId = counterProposal.originalProposalId;
      const record = this.getRecruitmentByProposal(originalProposalId);

      if (!record) {
        this.logger.warn(
          `No recruitment found for original proposal ${originalProposalId}`,
        );
        return false;
      }

      // Update record status
      record.status = RecruitmentStatus.COUNTER_PROPOSED;
      record.counterProposal = counterProposal;
      record.updatedAt = Date.now();

      // Add history entry
      record.history.push({
        timestamp: Date.now(),
        status: RecruitmentStatus.COUNTER_PROPOSED,
        message: `Counter proposal received from ${counterProposal.senderAgentName || counterProposal.senderAgentId}`,
      });

      this.logger.info(
        `Counter proposal processed for recruitment ${record.id}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Error processing counter proposal: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Process a rejection message
   */
  public processRejection(rejection: RejectionMessage): boolean {
    try {
      // Find the recruitment record
      const record = this.getRecruitmentByProposal(rejection.proposalId);

      if (!record) {
        this.logger.warn(
          `No recruitment found for proposal ${rejection.proposalId}`,
        );
        return false;
      }

      // Update record status
      record.status = RecruitmentStatus.REJECTED;
      record.rejection = rejection;
      record.updatedAt = Date.now();

      // Add history entry
      record.history.push({
        timestamp: Date.now(),
        status: RecruitmentStatus.REJECTED,
        message: `Proposal rejected by ${rejection.senderAgentName || rejection.senderAgentId}: ${rejection.reason}`,
      });

      this.logger.info(`Rejection processed for recruitment ${record.id}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Error processing rejection: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Get a recruitment record by ID
   */
  public getRecruitment(recruitmentId: string): RecruitmentRecord | null {
    return this.recruitmentRecords.get(recruitmentId) || null;
  }

  /**
   * Get a recruitment record by proposal ID
   */
  private getRecruitmentByProposal(
    proposalId: string,
  ): RecruitmentRecord | null {
    for (const record of this.recruitmentRecords.values()) {
      if (
        (record.proposal && record.proposal.id === proposalId) ||
        (record.counterProposal &&
          record.counterProposal.originalProposalId === proposalId)
      ) {
        return record;
      }
    }
    return null;
  }

  /**
   * Track agent recruitment
   */
  private trackAgentRecruitment(agentId: string, recruitmentId: string): void {
    const recruitments = this.agentRecruitmentHistory.get(agentId) || [];
    recruitments.push(recruitmentId);
    this.agentRecruitmentHistory.set(agentId, recruitments);
  }

  /**
   * Get all recruitments for an agent
   */
  public getAgentRecruitments(agentId: string): RecruitmentRecord[] {
    const recruitmentIds = this.agentRecruitmentHistory.get(agentId) || [];
    return recruitmentIds
      .map((id) => this.recruitmentRecords.get(id))
      .filter((record) => record !== undefined) as RecruitmentRecord[];
  }

  /**
   * Get all active commitments for an agent
   */
  public getAgentCommitments(agentId: string): CommitmentRecord[] {
    return Array.from(this.commitmentRecords.values()).filter(
      (commitment) =>
        commitment.agentId === agentId && commitment.status === 'active',
    );
  }

  /**
   * Update a commitment status
   */
  public updateCommitmentStatus(
    commitmentId: string,
    status: 'active' | 'completed' | 'failed' | 'cancelled',
    details?: any,
  ): boolean {
    const commitment = this.commitmentRecords.get(commitmentId);
    if (!commitment) {
      this.logger.warn(`Commitment with ID ${commitmentId} not found`);
      return false;
    }

    const timestamp = Date.now();

    // Update status
    commitment.status = status;
    commitment.updatedAt = timestamp;

    // Add history entry
    commitment.history.push({
      status,
      timestamp,
      details,
    });

    this.commitmentRecords.set(commitmentId, commitment);

    // Emit event
    this.emitEvent({
      type: RecruitmentEventType.COMMITMENT_UPDATED,
      commitmentId,
      agentId: commitment.agentId,
      taskId: commitment.taskId,
      status,
      details,
      timestamp,
    });

    this.logger.info(`Commitment ${commitmentId} updated to status: ${status}`);
    return true;
  }

  /**
   * Clean up expired recruitments
   */
  private cleanupExpiredRecruitments(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [id, record] of this.recruitmentRecords.entries()) {
      if (
        record.expiresAt &&
        record.expiresAt < now &&
        record.status !== RecruitmentStatus.ACCEPTED &&
        record.status !== RecruitmentStatus.EXPIRED &&
        record.status !== RecruitmentStatus.CANCELLED
      ) {
        // Mark as expired
        record.status = RecruitmentStatus.EXPIRED;
        record.updatedAt = now;

        // Add history entry
        record.history.push({
          timestamp: now,
          status: RecruitmentStatus.EXPIRED,
          message: 'Recruitment expired due to time limit',
        });

        this.recruitmentRecords.set(id, record);
        expiredCount++;

        // Emit event
        this.emitEvent({
          type: RecruitmentEventType.RECRUITMENT_EXPIRED,
          recruitmentId: id,
          taskId: record.taskId,
          teamId: record.teamId,
          timestamp: now,
        });
      }

      // Clean up expired proposals
      if (record.proposal && record.proposal.expiration < now) {
        // Only log this, don't change status if we already have a resolution
        this.logger.info(
          `Proposal ${record.proposal.id} for recruitment ${id} has expired`,
        );

        // If the record is still in proposal sent status, mark it as expired
        if (record.status === RecruitmentStatus.PROPOSAL_SENT) {
          record.status = RecruitmentStatus.EXPIRED;
          record.updatedAt = now;

          // Add history entry
          record.history.push({
            timestamp: now,
            status: RecruitmentStatus.EXPIRED,
            message: 'Proposal expired due to time limit',
          });

          this.recruitmentRecords.set(id, record);
        }
      }
    }

    if (expiredCount > 0) {
      this.logger.info(`Cleaned up ${expiredCount} expired recruitments`);
    }
  }

  /**
   * Subscribe to recruitment events
   */
  public subscribeToEvents(
    callback: (event: any) => void,
    eventTypes?: RecruitmentEventType[],
  ): string {
    const subscriptionId = uuidv4();

    const listener = (event: any) => {
      if (!eventTypes || eventTypes.includes(event.type)) {
        callback(event);
      }
    };

    this.eventEmitter.on('recruitment_event', listener);

    return subscriptionId;
  }

  /**
   * Emit a recruitment event
   */
  private emitEvent(event: any): void {
    this.eventEmitter.emit('recruitment_event', event);
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    this.eventEmitter.removeAllListeners('recruitment_event');
    this.recruitmentRecords.clear();
    this.commitmentRecords.clear();
    this.agentRecruitmentHistory.clear();
    this.activeRecruitments.clear();
    this.activeContracts.clear();
    this.capabilityRegistry.clear();
    this.negotiationHistory.clear();

    this.logger.info('AgentRecruitmentService resources cleaned up');
  }

  /**
   * Reset the singleton instance (for testing purposes)
   */
  public static resetInstance(): void {
    if (AgentRecruitmentService.instance) {
      AgentRecruitmentService.instance.cleanup();
      AgentRecruitmentService.instance = undefined as any;
    }
  }
}
