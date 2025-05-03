import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
// Message types for future LLM-based negotiation functionality
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
// Parser for future LLM response handling in negotiations
import { JsonOutputParser } from '@langchain/core/output_parsers';

import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { LangChainConfig } from '../../../langchain/config';

import {
  TaskNegotiation,
  NegotiationStatus,
  NegotiationType,
  ProposalResponse,
  NegotiationProposition,
  OwnershipDispute,
  TaskNegotiationManager,
  createNegotiationProposition,
  createTaskNegotiation,
  createOwnershipDispute,
} from './interfaces/task-negotiation.interface';
import {
  HierarchicalTask,
  TaskPriority,
} from './interfaces/hierarchical-task.interface';
import { TaskBoundaryProposal } from './interfaces/peer-task.interface';

/**
 * Agent representation for negotiation
 */
export interface AgentForNegotiation {
  id: string;
  name: string;
  negotiationStyle?:
    | 'cooperative'
    | 'competitive'
    | 'compromising'
    | 'avoiding'
    | 'accommodating';
  priorities?: string[];
  constraints?: string[];
}

/**
 * Service configuration
 */
export interface TaskNegotiationServiceConfig {
  logger?: Logger;
  llmModel?: string;
  llmTemperature?: number;
  maxNegotiationRounds?: number;
  defaultNegotiationDeadline?: number;
}

/**
 * Service for task negotiation between agents
 */
export class TaskNegotiationService implements Partial<TaskNegotiationManager> {
  private static instance: TaskNegotiationService;
  private logger: Logger;
  private llm: ChatOpenAI;
  private maxNegotiationRounds: number;
  private defaultNegotiationDeadline: number;

  // In-memory storage
  private negotiations: Map<string, TaskNegotiation> = new Map();
  private propositions: Map<string, NegotiationProposition> = new Map();
  private disputes: Map<string, OwnershipDispute> = new Map();

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: TaskNegotiationServiceConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.maxNegotiationRounds = config.maxNegotiationRounds || 5;
    this.defaultNegotiationDeadline =
      config.defaultNegotiationDeadline || 3600000; // 1 hour default

    // Initialize LLM for future AI-powered negotiation features
    // Will be used for evaluating proposals, generating counter-proposals,
    // and resolving complex negotiation scenarios
    this.llm = new ChatOpenAI({
      modelName: config.llmModel || LangChainConfig.llm.model,
      temperature: config.llmTemperature || 0.4,
      verbose: false,
    });

    this.logger.info('TaskNegotiationService initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(
    config: TaskNegotiationServiceConfig = {},
  ): TaskNegotiationService {
    if (!TaskNegotiationService.instance) {
      TaskNegotiationService.instance = new TaskNegotiationService(config);
    }
    return TaskNegotiationService.instance;
  }

  /**
   * Initiate a negotiation process
   */
  public async initiateNegotiation(
    taskId: string,
    initiatedBy: string,
    type: NegotiationType,
    participants: string[],
    initialProposition?: Omit<
      NegotiationProposition,
      | 'id'
      | 'negotiationId'
      | 'proposedBy'
      | 'proposedAt'
      | 'status'
      | 'previousPropositionId'
    >,
  ): Promise<TaskNegotiation> {
    this.logger.info(`Initiating ${type} negotiation for task ${taskId}`);

    // Create the negotiation
    const negotiation: TaskNegotiation = {
      id: uuidv4(),
      taskId,
      initiatedBy,
      initiatedAt: Date.now(),
      type,
      status: NegotiationStatus.INITIATED,
      participants: [
        initiatedBy,
        ...participants.filter((id) => id !== initiatedBy),
      ],
      propositions: [],
      currentRound: 1,
      maxRounds: this.maxNegotiationRounds,
      deadline: Date.now() + this.defaultNegotiationDeadline,
      metadata: {},
    };

    // Add an initial proposition if provided
    if (initialProposition) {
      const proposition = await this.createInitialProposition(
        negotiation.id,
        initiatedBy,
        initialProposition,
      );

      negotiation.propositions.push(proposition);
      negotiation.currentPropositionId = proposition.id;
      negotiation.status = NegotiationStatus.IN_PROGRESS;
    }

    // Store the negotiation
    this.negotiations.set(negotiation.id, negotiation);

    return negotiation;
  }

  /**
   * Create an initial proposition for a negotiation
   */
  private async createInitialProposition(
    negotiationId: string,
    proposedBy: string,
    details: Omit<
      NegotiationProposition,
      | 'id'
      | 'negotiationId'
      | 'proposedBy'
      | 'proposedAt'
      | 'status'
      | 'previousPropositionId'
    >,
  ): Promise<NegotiationProposition> {
    const proposition: NegotiationProposition = {
      id: uuidv4(),
      negotiationId,
      proposedBy,
      proposedAt: Date.now(),
      type: details.type,
      content: details.content,
      reasoning: details.reasoning,
      expiresAt: details.expiresAt,
      responseDeadline: details.responseDeadline,
      status: 'proposed',
      metadata: details.metadata || {},
    };

    // Store the proposition
    this.propositions.set(proposition.id, proposition);

    return proposition;
  }

  /**
   * Get a negotiation by ID
   */
  public async getNegotiation(
    negotiationId: string,
  ): Promise<TaskNegotiation | null> {
    return this.negotiations.get(negotiationId) || null;
  }

  /**
   * Get all negotiations for a task
   */
  public async getNegotiationsForTask(
    taskId: string,
  ): Promise<TaskNegotiation[]> {
    return Array.from(this.negotiations.values()).filter(
      (negotiation) => negotiation.taskId === taskId,
    );
  }

  /**
   * Propose within an existing negotiation
   */
  public async proposeInNegotiation(
    negotiationId: string,
    proposedBy: string,
    proposition: Omit<
      NegotiationProposition,
      'id' | 'negotiationId' | 'proposedBy' | 'proposedAt' | 'status'
    >,
  ): Promise<NegotiationProposition> {
    const negotiation = await this.getNegotiation(negotiationId);
    if (!negotiation) {
      throw new Error(`Negotiation not found: ${negotiationId}`);
    }

    // Check if the agent is a participant
    if (!negotiation.participants.includes(proposedBy)) {
      throw new Error(
        `Agent ${proposedBy} is not a participant in negotiation ${negotiationId}`,
      );
    }

    // Check if the negotiation is still active
    if (
      negotiation.status !== NegotiationStatus.INITIATED &&
      negotiation.status !== NegotiationStatus.IN_PROGRESS &&
      negotiation.status !== NegotiationStatus.COUNTER_PROPOSED
    ) {
      throw new Error(
        `Negotiation ${negotiationId} is not active (status: ${negotiation.status})`,
      );
    }

    // Check if we've reached the maximum rounds
    if (
      negotiation.currentRound >
      (negotiation.maxRounds || this.maxNegotiationRounds)
    ) {
      throw new Error(
        `Negotiation ${negotiationId} has reached the maximum number of rounds`,
      );
    }

    // Check if the deadline has passed
    if (negotiation.deadline && Date.now() > negotiation.deadline) {
      negotiation.status = NegotiationStatus.TIMED_OUT;
      this.negotiations.set(negotiationId, negotiation);
      throw new Error(`Negotiation ${negotiationId} has timed out`);
    }

    // Create the proposition
    const newProposition: NegotiationProposition = {
      id: uuidv4(),
      negotiationId,
      proposedBy,
      proposedAt: Date.now(),
      type: proposition.type,
      content: proposition.content,
      reasoning: proposition.reasoning,
      expiresAt: proposition.expiresAt,
      responseDeadline: proposition.responseDeadline,
      previousPropositionId:
        proposition.previousPropositionId || negotiation.currentPropositionId,
      status: 'proposed',
      metadata: proposition.metadata || {},
    };

    // Store the proposition
    this.propositions.set(newProposition.id, newProposition);

    // Update the negotiation
    negotiation.propositions.push(newProposition);
    negotiation.currentPropositionId = newProposition.id;
    negotiation.status = NegotiationStatus.COUNTER_PROPOSED;

    // If this is a counter-proposal, increment the round
    if (proposition.previousPropositionId) {
      negotiation.currentRound++;
    }

    this.negotiations.set(negotiationId, negotiation);

    return newProposition;
  }

  /**
   * Respond to a proposition
   */
  public async respondToProposition(
    propositionId: string,
    respondingAgentId: string,
    response: ProposalResponse,
    reasoning: string,
    counterProposition?: Record<string, any>,
  ): Promise<TaskNegotiation> {
    const proposition = this.propositions.get(propositionId);
    if (!proposition) {
      throw new Error(`Proposition not found: ${propositionId}`);
    }

    const negotiation = await this.getNegotiation(proposition.negotiationId);
    if (!negotiation) {
      throw new Error(`Negotiation not found: ${proposition.negotiationId}`);
    }

    // Check if the agent is a participant
    if (!negotiation.participants.includes(respondingAgentId)) {
      throw new Error(
        `Agent ${respondingAgentId} is not a participant in negotiation ${negotiation.id}`,
      );
    }

    // Handle the response
    switch (response) {
      case ProposalResponse.ACCEPT:
        await this.handleAcceptResponse(
          negotiation,
          proposition,
          respondingAgentId,
          reasoning,
        );
        break;

      case ProposalResponse.REJECT:
        await this.handleRejectResponse(
          negotiation,
          proposition,
          respondingAgentId,
          reasoning,
        );
        break;

      case ProposalResponse.COUNTER:
        await this.handleCounterResponse(
          negotiation,
          proposition,
          respondingAgentId,
          reasoning,
          counterProposition,
        );
        break;

      case ProposalResponse.MODIFY:
        await this.handleModifyResponse(
          negotiation,
          proposition,
          respondingAgentId,
          reasoning,
          counterProposition,
        );
        break;

      case ProposalResponse.DEFER:
        await this.handleDeferResponse(
          negotiation,
          proposition,
          respondingAgentId,
          reasoning,
        );
        break;

      case ProposalResponse.ESCALATE:
        await this.handleEscalateResponse(
          negotiation,
          proposition,
          respondingAgentId,
          reasoning,
        );
        break;

      default:
        throw new Error(`Unsupported response type: ${response}`);
    }

    return negotiation;
  }

  /**
   * Handle an accept response
   */
  private async handleAcceptResponse(
    negotiation: TaskNegotiation,
    proposition: NegotiationProposition,
    respondingAgentId: string,
    reasoning: string,
  ): Promise<void> {
    // Update the proposition status
    proposition.status = 'accepted';
    this.propositions.set(proposition.id, proposition);

    // Check if all participants have accepted
    const allAccepted = negotiation.participants.every((participantId) => {
      // The proposer is considered to have implicitly accepted
      if (participantId === proposition.proposedBy) {
        return true;
      }

      // Check if there's an explicit acceptance from this participant
      return proposition.status === 'accepted';
    });

    if (allAccepted) {
      // Negotiation successful
      negotiation.status = NegotiationStatus.ACCEPTED;
      negotiation.resolution = {
        outcome: 'accepted',
        resolvedAt: Date.now(),
        winningPropositionId: proposition.id,
      };
    }

    this.negotiations.set(negotiation.id, negotiation);
  }

  /**
   * Handle a reject response
   */
  private async handleRejectResponse(
    negotiation: TaskNegotiation,
    proposition: NegotiationProposition,
    respondingAgentId: string,
    reasoning: string,
  ): Promise<void> {
    // Update the proposition status
    proposition.status = 'rejected';
    this.propositions.set(proposition.id, proposition);

    // Check if this is the final round
    if (
      negotiation.currentRound >=
      (negotiation.maxRounds || this.maxNegotiationRounds)
    ) {
      // Negotiation failed
      negotiation.status = NegotiationStatus.REJECTED;
      negotiation.resolution = {
        outcome: 'rejected',
        resolvedAt: Date.now(),
        resolution: {
          reason: 'Maximum rounds reached without agreement',
          finalResponse: reasoning,
        },
      };
    } else {
      // Negotiation continues
      negotiation.status = NegotiationStatus.IN_PROGRESS;
    }

    this.negotiations.set(negotiation.id, negotiation);
  }

  /**
   * Handle a counter-proposal response
   */
  private async handleCounterResponse(
    negotiation: TaskNegotiation,
    proposition: NegotiationProposition,
    respondingAgentId: string,
    reasoning: string,
    counterContent?: Record<string, any>,
  ): Promise<void> {
    // Update the original proposition status
    proposition.status = 'countered';
    this.propositions.set(proposition.id, proposition);

    // Create the counter-proposal
    if (!counterContent) {
      throw new Error('Counter proposal content is required');
    }

    // Create a new proposition as the counter-proposal
    const counterProposition = await this.proposeInNegotiation(
      negotiation.id,
      respondingAgentId,
      {
        type: proposition.type,
        content: counterContent,
        reasoning: reasoning,
        previousPropositionId: proposition.id,
      },
    );

    // Update the negotiation
    negotiation.status = NegotiationStatus.COUNTER_PROPOSED;
    negotiation.currentPropositionId = counterProposition.id;
    negotiation.currentRound++;

    this.negotiations.set(negotiation.id, negotiation);
  }

  /**
   * Handle a modify response
   */
  private async handleModifyResponse(
    negotiation: TaskNegotiation,
    proposition: NegotiationProposition,
    respondingAgentId: string,
    reasoning: string,
    modificationContent?: Record<string, any>,
  ): Promise<void> {
    // Similar to counter-proposal but less divergent
    await this.handleCounterResponse(
      negotiation,
      proposition,
      respondingAgentId,
      reasoning,
      modificationContent,
    );
  }

  /**
   * Handle a defer response
   */
  private async handleDeferResponse(
    negotiation: TaskNegotiation,
    proposition: NegotiationProposition,
    respondingAgentId: string,
    reasoning: string,
  ): Promise<void> {
    // For now, just note the deferral in the metadata
    negotiation.metadata = {
      ...negotiation.metadata,
      deferrals: [
        ...(negotiation.metadata?.deferrals || []),
        {
          agentId: respondingAgentId,
          propositionId: proposition.id,
          reasoning,
          timestamp: Date.now(),
        },
      ],
    };

    this.negotiations.set(negotiation.id, negotiation);
  }

  /**
   * Handle an escalate response
   */
  private async handleEscalateResponse(
    negotiation: TaskNegotiation,
    proposition: NegotiationProposition,
    respondingAgentId: string,
    reasoning: string,
  ): Promise<void> {
    // Mark the negotiation as escalated
    negotiation.status = NegotiationStatus.ESCALATED;
    negotiation.metadata = {
      ...negotiation.metadata,
      escalatedBy: respondingAgentId,
      escalationReason: reasoning,
      escalatedAt: Date.now(),
    };

    this.negotiations.set(negotiation.id, negotiation);
  }

  /**
   * Get all propositions for a negotiation
   */
  public async getPropositions(
    negotiationId: string,
  ): Promise<NegotiationProposition[]> {
    const negotiation = await this.getNegotiation(negotiationId);
    if (!negotiation) {
      throw new Error(`Negotiation not found: ${negotiationId}`);
    }

    return negotiation.propositions;
  }

  /**
   * Negotiate task boundary
   */
  public async negotiateTaskBoundary(
    taskId: string,
    proposedBoundary: TaskBoundaryProposal,
  ): Promise<TaskNegotiation> {
    // This is a specialized form of negotiation for task boundaries
    const negotiation = await this.initiateNegotiation(
      taskId,
      proposedBoundary.proposedBy,
      NegotiationType.SCOPE,
      proposedBoundary.votes.map((v) => v.agentId),
      {
        type: NegotiationType.SCOPE,
        content: {
          boundary: {
            name: proposedBoundary.name,
            description: proposedBoundary.description,
            scope: proposedBoundary.scope,
            outOfScope: proposedBoundary.outOfScope,
            resourceNeeds: proposedBoundary.resourceNeeds,
            expectedOutcomes: proposedBoundary.expectedOutcomes,
          },
        },
        reasoning: 'Based on the proposed task boundary',
      },
    );

    return negotiation;
  }

  /**
   * File an ownership dispute
   */
  public async fileOwnershipDispute(
    taskId: string,
    claimantId: string,
    reason: string,
  ): Promise<OwnershipDispute> {
    this.logger.info(
      `Filing ownership dispute for task ${taskId} by agent ${claimantId}`,
    );

    // Check if there's already a negotiation for ownership of this task
    const existingNegotiations = await this.getNegotiationsForTask(taskId);
    let relatedNegotiation = existingNegotiations.find(
      (n) =>
        n.type === NegotiationType.OWNERSHIP &&
        n.status !== NegotiationStatus.REJECTED &&
        n.status !== NegotiationStatus.TIMED_OUT,
    );

    // Create a negotiation if one doesn't exist
    if (!relatedNegotiation) {
      relatedNegotiation = await this.initiateNegotiation(
        taskId,
        claimantId,
        NegotiationType.OWNERSHIP,
        [], // No other participants yet
        {
          type: NegotiationType.OWNERSHIP,
          content: {
            claim: {
              reason,
              priority: TaskPriority.MEDIUM, // Default priority
            },
          },
          reasoning: reason,
        },
      );
    }

    // Create the dispute
    const dispute: OwnershipDispute = {
      id: uuidv4(),
      taskId,
      negotiationId: relatedNegotiation.id,
      claimants: [claimantId],
      initiatedAt: Date.now(),
      status: 'open',
      priority: TaskPriority.MEDIUM, // Default priority
      metadata: {
        initialReason: reason,
      },
    };

    // Store the dispute
    this.disputes.set(dispute.id, dispute);

    return dispute;
  }

  /**
   * Resolve an ownership dispute
   */
  public async resolveOwnershipDispute(
    disputeId: string,
    resolution: {
      assignedTo: string;
      resolutionMethod:
        | 'consensus'
        | 'arbitration'
        | 'capability_match'
        | 'rotation';
      reasoning: string;
    },
  ): Promise<OwnershipDispute> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute not found: ${disputeId}`);
    }

    // Update the dispute
    dispute.status = 'resolved';
    dispute.resolution = {
      ...resolution,
      resolvedAt: Date.now(),
    };

    // Update the related negotiation
    const negotiation = await this.getNegotiation(dispute.negotiationId);
    if (negotiation) {
      negotiation.status = NegotiationStatus.ACCEPTED;
      negotiation.resolution = {
        outcome: 'accepted',
        resolvedAt: Date.now(),
        resolution: {
          assignedTo: resolution.assignedTo,
          method: resolution.resolutionMethod,
          reasoning: resolution.reasoning,
        },
      };

      this.negotiations.set(negotiation.id, negotiation);
    }

    this.disputes.set(disputeId, dispute);

    return dispute;
  }

  /**
   * Escalate a dispute
   */
  public async escalateDispute(
    disputeId: string,
    reason: string,
  ): Promise<OwnershipDispute> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new Error(`Dispute not found: ${disputeId}`);
    }

    // Update the dispute
    dispute.status = 'escalated';
    dispute.escalationLevel = (dispute.escalationLevel || 0) + 1;
    dispute.metadata = {
      ...dispute.metadata,
      escalation: {
        reason,
        timestamp: Date.now(),
        level: dispute.escalationLevel,
      },
    };

    // Update the related negotiation
    const negotiation = await this.getNegotiation(dispute.negotiationId);
    if (negotiation) {
      negotiation.status = NegotiationStatus.ESCALATED;
      negotiation.metadata = {
        ...negotiation.metadata,
        escalation: {
          reason,
          timestamp: Date.now(),
          level: dispute.escalationLevel,
        },
      };

      this.negotiations.set(negotiation.id, negotiation);
    }

    this.disputes.set(disputeId, dispute);

    return dispute;
  }

  /**
   * Get all disputes for a task
   */
  public async getDisputesForTask(taskId: string): Promise<OwnershipDispute[]> {
    return Array.from(this.disputes.values()).filter(
      (dispute) => dispute.taskId === taskId,
    );
  }

  /**
   * Apply negotiated changes to a task
   */
  public async applyNegotiatedChanges(
    negotiationId: string,
  ): Promise<HierarchicalTask> {
    const negotiation = await this.getNegotiation(negotiationId);
    if (!negotiation) {
      throw new Error(`Negotiation not found: ${negotiationId}`);
    }

    if (negotiation.status !== NegotiationStatus.ACCEPTED) {
      throw new Error(`Negotiation ${negotiationId} has not been accepted`);
    }

    if (!negotiation.resolution?.winningPropositionId) {
      throw new Error(
        `Negotiation ${negotiationId} does not have a winning proposition`,
      );
    }

    // This method would normally update the task based on the negotiated changes
    // Since we don't have actual task storage here, we'll just return a placeholder
    // In a real implementation, you would retrieve the task, apply changes, and save it

    const mockTask: HierarchicalTask = {
      id: negotiation.taskId,
      name: 'Updated Task',
      description: 'Task updated based on negotiation',
      status: 'planned',
      priority: TaskPriority.MEDIUM,
      complexity: 'MODERATE',
      childTaskIds: [],
      dependencies: [],
      resourceRequirements: [],
      milestones: [],
      estimatedDuration: 3600000,
      progress: 0,
      createdAt: Date.now() - 3600000, // 1 hour ago
      updatedAt: Date.now(),
      metadata: {
        negotiationId,
        appliedChanges: true,
        winningPropositionId: negotiation.resolution.winningPropositionId,
      },
    } as any;

    return mockTask;
  }
}
