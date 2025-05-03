import { v4 as uuidv4 } from 'uuid';
import { HierarchicalTask, TaskPriority } from './hierarchical-task.interface';
import { TaskBoundaryProposal } from './peer-task.interface';

/**
 * Negotiation status enum
 */
export enum NegotiationStatus {
  INITIATED = 'initiated',
  IN_PROGRESS = 'in_progress',
  COUNTER_PROPOSED = 'counter_proposed',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  ESCALATED = 'escalated',
  TIMED_OUT = 'timed_out',
  CANCELLED = 'cancelled',
}

/**
 * Negotiation type enum
 */
export enum NegotiationType {
  SCOPE = 'scope', // Negotiate task boundaries
  OWNERSHIP = 'ownership', // Negotiate task ownership
  RESOURCES = 'resources', // Negotiate resource allocation
  DEADLINE = 'deadline', // Negotiate task deadline
  PRIORITY = 'priority', // Negotiate task priority
  DEPENDENCY = 'dependency', // Negotiate task dependencies
}

/**
 * Response to a negotiation proposal
 */
export enum ProposalResponse {
  ACCEPT = 'accept',
  REJECT = 'reject',
  COUNTER = 'counter', // Counter-proposal
  MODIFY = 'modify', // Suggest modifications
  DEFER = 'defer', // Defer decision
  ESCALATE = 'escalate', // Escalate to higher authority
}

/**
 * Task negotiation proposition
 */
export interface NegotiationProposition {
  id: string;
  negotiationId: string;
  proposedBy: string; // Agent ID
  proposedAt: number;
  type: NegotiationType;
  content: Record<string, any>; // The actual proposal content
  reasoning: string;
  expiresAt?: number; // When this proposition expires
  responseDeadline?: number; // When a response is expected by
  previousPropositionId?: string; // If this is a counter-proposal
  status: 'proposed' | 'accepted' | 'rejected' | 'countered' | 'expired';
  metadata?: Record<string, any>;
}

/**
 * Task negotiation process
 */
export interface TaskNegotiation {
  id: string;
  taskId: string;
  initiatedBy: string; // Agent ID
  initiatedAt: number;
  type: NegotiationType;
  status: NegotiationStatus;
  participants: string[]; // Agent IDs
  currentPropositionId?: string; // Current active proposition
  propositions: NegotiationProposition[];
  resolution?: {
    outcome: 'accepted' | 'rejected' | 'compromise' | 'escalated' | 'timed_out';
    resolvedAt: number;
    winningPropositionId?: string;
    resolution?: Record<string, any>;
  };
  maxRounds?: number; // Maximum number of proposal rounds
  currentRound: number;
  deadline?: number; // When negotiation must complete
  metadata?: Record<string, any>;
}

/**
 * Dispute that may arise during negotiation
 */
export interface OwnershipDispute {
  id: string;
  taskId: string;
  negotiationId: string;
  claimants: string[]; // Agent IDs claiming ownership
  initiatedAt: number;
  status: 'open' | 'resolved' | 'escalated';
  resolution?: {
    assignedTo: string;
    resolvedAt: number;
    resolutionMethod:
      | 'consensus'
      | 'arbitration'
      | 'capability_match'
      | 'rotation';
    reasoning: string;
  };
  escalationLevel?: number; // Escalation level if dispute is escalated
  priority: TaskPriority;
  metadata?: Record<string, any>;
}

/**
 * Task negotiation manager interface
 */
export interface TaskNegotiationManager {
  // Negotiation management
  initiateNegotiation(
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
  ): Promise<TaskNegotiation>;

  getNegotiation(negotiationId: string): Promise<TaskNegotiation | null>;
  getNegotiationsForTask(taskId: string): Promise<TaskNegotiation[]>;

  // Proposition management
  proposeInNegotiation(
    negotiationId: string,
    proposedBy: string,
    proposition: Omit<
      NegotiationProposition,
      'id' | 'negotiationId' | 'proposedBy' | 'proposedAt' | 'status'
    >,
  ): Promise<NegotiationProposition>;
  respondToProposition(
    propositionId: string,
    respondingAgentId: string,
    response: ProposalResponse,
    reasoning: string,
    counterProposition?: Record<string, any>,
  ): Promise<TaskNegotiation>;
  getPropositions(negotiationId: string): Promise<NegotiationProposition[]>;

  // Boundary negotiation
  negotiateTaskBoundary(
    taskId: string,
    proposedBoundary: TaskBoundaryProposal,
  ): Promise<TaskNegotiation>;

  // Ownership dispute resolution
  fileOwnershipDispute(
    taskId: string,
    claimantId: string,
    reason: string,
  ): Promise<OwnershipDispute>;
  resolveOwnershipDispute(
    disputeId: string,
    resolution: Omit<OwnershipDispute['resolution'], 'resolvedAt'>,
  ): Promise<OwnershipDispute>;
  escalateDispute(disputeId: string, reason: string): Promise<OwnershipDispute>;
  getDisputesForTask(taskId: string): Promise<OwnershipDispute[]>;

  // Task modifications based on negotiation
  applyNegotiatedChanges(negotiationId: string): Promise<HierarchicalTask>;
}

/**
 * Factory function to create a negotiation proposition
 */
export function createNegotiationProposition(
  type: NegotiationType,
  content: Record<string, any>,
  reasoning: string,
  expiresAt?: number,
  responseDeadline?: number,
  previousPropositionId?: string,
): Omit<
  NegotiationProposition,
  'id' | 'negotiationId' | 'proposedBy' | 'proposedAt' | 'status'
> {
  return {
    type,
    content,
    reasoning,
    expiresAt,
    responseDeadline,
    previousPropositionId,
    metadata: {},
  };
}

/**
 * Factory function to create a task negotiation
 */
export function createTaskNegotiation(
  taskId: string,
  initiatedBy: string,
  type: NegotiationType,
  participants: string[],
  maxRounds: number = 5,
  deadline?: number,
): Omit<
  TaskNegotiation,
  | 'id'
  | 'initiatedAt'
  | 'status'
  | 'propositions'
  | 'currentRound'
  | 'currentPropositionId'
> {
  return {
    taskId,
    initiatedBy,
    type,
    participants: [
      initiatedBy,
      ...participants.filter((id) => id !== initiatedBy),
    ],
    maxRounds,
    deadline,
    metadata: {},
  };
}

/**
 * Factory function to create an ownership dispute
 */
export function createOwnershipDispute(
  taskId: string,
  negotiationId: string,
  claimants: string[],
  priority: TaskPriority,
): Omit<OwnershipDispute, 'id' | 'initiatedAt' | 'status'> {
  return {
    taskId,
    negotiationId,
    claimants,
    priority,
    metadata: {},
  };
}
