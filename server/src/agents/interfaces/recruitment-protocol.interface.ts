/**
 * Recruitment Protocol Interfaces
 *
 * Defines standardized interfaces for agent recruitment, capability advertisement,
 * negotiation, and contract formation as part of Milestone 3.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Defines the different types of recruitment messages in the protocol
 */
export enum RecruitmentMessageType {
  INQUIRY = 'inquiry',
  PROPOSAL = 'proposal',
  COUNTER_PROPOSAL = 'counter_proposal',
  ACCEPTANCE = 'acceptance',
  REJECTION = 'rejection',
  CONTRACT = 'contract',
  CONTRACT_OFFER = 'contract_offer',
  CONTRACT_ACCEPTANCE = 'contract_acceptance',
  CAPABILITY_ADVERTISEMENT = 'capability_advertisement',
}

/**
 * Base interface for all recruitment messages
 */
export interface RecruitmentBaseMessage {
  id: string;
  type: RecruitmentMessageType;
  timestamp: number;
  senderAgentId: string;
  senderAgentName?: string;
  recipientAgentId: string;
  conversationId?: string;
  taskId: string;
  teamId?: string;
  expiration?: number;
  senderId?: string;
  recipientId?: string;
  replyToId?: string;
}

/**
 * Initial inquiry message from recruiter agent to target agent
 */
export interface RecruitmentInquiryMessage extends RecruitmentBaseMessage {
  type: RecruitmentMessageType.INQUIRY;
  taskDescription: string;
  requiredCapabilities: string[];
  priority: number;
  deadline?: number;
}

/**
 * Proposal message from recruiter to target agent
 */
export interface RecruitmentProposalMessage extends RecruitmentBaseMessage {
  type: RecruitmentMessageType.PROPOSAL;
  proposalId: string;
  proposedRole: string;
  responsibilities: string[];
  requiredCapabilities: string[];
  expectedContribution: string;
  expectedDuration: number;
  expiration: number;
  compensation?: {
    type: string; // 'credits', 'reputation', 'priority', etc.
    value: number;
  };
}

/**
 * Counter proposal message from target agent to recruiter
 */
export interface CounterProposalMessage extends RecruitmentBaseMessage {
  type: RecruitmentMessageType.COUNTER_PROPOSAL;
  originalProposalId: string;
  proposedRole: string;
  responsibilities: string[];
  requiredCapabilities: string[];
  expectedContribution: string;
  expectedDuration: number;
  expiration: number;
  compensation?: {
    type: string;
    value: number;
  };
  changes: {
    role?: boolean;
    responsibilities?: boolean;
    duration?: boolean;
    compensation?: boolean;
  };
  justification: string;
  modifiedTerms: {
    field: string;
    originalValue: any;
    proposedValue: any;
    justification: string;
  }[];
}

/**
 * Acceptance message from target agent to recruiter
 */
export interface AcceptanceMessage extends RecruitmentBaseMessage {
  type: RecruitmentMessageType.ACCEPTANCE;
  proposalId: string;
  acceptedTerms: {
    role: string;
    responsibilities: string[];
    duration: number;
    compensation?: {
      type: string;
      value: number;
    };
  };
  availability: {
    startTime: number;
    endTime?: number;
  };
  additionalNotes?: string;
  availableStartTime?: number;
  expectedCompletionTime?: number;
  commitmentLevel?: 'guaranteed' | 'firm' | 'tentative';
}

/**
 * Rejection message from target agent to recruiter
 */
export interface RejectionMessage extends RecruitmentBaseMessage {
  type: RecruitmentMessageType.REJECTION;
  proposalId: string;
  reason: string;
  alternativeAvailability?: {
    startTime: number;
    endTime?: number;
  };
  additionalNotes?: string;
}

/**
 * Team contract message for formalized team agreements
 */
export interface TeamContract extends RecruitmentBaseMessage {
  type: RecruitmentMessageType.CONTRACT;
  contractId: string;
  name: string;
  description: string;
  participants: {
    agentId: string;
    role: string;
    responsibilities: string[];
    requiredCapabilities: string[];
    expectedDeliverables: string[];
    agentName?: string;
    performanceMetrics?: {
      metricName: string;
      target: any;
      weight: number;
    }[];
  }[];
  terms: {
    startTime: number;
    endTime?: number;
    deadline?: number;
    gracePeriod?: number;
    terminationConditions?: string[];
    paymentTerms?: Record<string, any>;
  };
  expectedOutcomes: string[];
  signatures: {
    agentId: string;
    timestamp: number;
    signatureHash?: string;
  }[];
  status:
    | 'draft'
    | 'offered'
    | 'active'
    | 'completed'
    | 'terminated'
    | 'breached'
    | 'expired';
  statusHistory: {
    status: string;
    timestamp: number;
    updatedBy: string;
    reason?: string;
  }[];
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  metadata: Record<string, any>;
}

/**
 * Contract offer message
 */
export interface ContractOfferMessage extends RecruitmentBaseMessage {
  type: RecruitmentMessageType.CONTRACT_OFFER;
  contractId: string;
  contract?: TeamContract;
  requiresSignature?: boolean;
  offerExpiresAt?: number;
  offerExpiration?: number;
}

/**
 * Contract acceptance message
 */
export interface ContractAcceptanceMessage extends RecruitmentBaseMessage {
  type: RecruitmentMessageType.CONTRACT_ACCEPTANCE;
  contractId: string;
  acceptanceTimestamp: number;
  signature?: string;
}

/**
 * Contract rejection message
 */
export interface ContractRejectionMessage extends RecruitmentBaseMessage {
  type: RecruitmentMessageType.REJECTION;
  contractId: string;
  rejectionReason: string;
  reason?: string;
  suggestedModifications?: string[];
}

/**
 * Performance report message
 */
export interface PerformanceReportMessage extends RecruitmentBaseMessage {
  contractId: string;
  agentId: string;
  evaluatorId: string;
  metrics: {
    metricName: string;
    target: any;
    actual: any;
    score: number; // 0.0-1.0
  }[];
  overallScore: number; // 0.0-1.0
  feedback: string;
  recommendations?: string[];
  summary?: {
    overallStatus: 'excellent' | 'satisfactory' | 'at-risk' | 'failing';
    completionPercentage: number;
    keyInsights?: string[];
    improvementAreas?: string[];
  };
}

/**
 * Factory to create base recruitment message
 */
export function createBaseMessage(
  type: RecruitmentMessageType,
  senderId: string,
  senderName: string,
  recipientId: string,
  taskId: string,
  teamId?: string,
  conversationId?: string,
  expiration?: number,
): RecruitmentBaseMessage {
  return {
    id: uuidv4(),
    type,
    timestamp: Date.now(),
    senderAgentId: senderId,
    senderAgentName: senderName,
    recipientAgentId: recipientId,
    conversationId: conversationId || uuidv4(),
    taskId,
    teamId,
    expiration,
  };
}

/**
 * Contract status enum
 */
export enum ContractStatus {
  DRAFT = 'draft',
  OFFERED = 'offered',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  TERMINATED = 'terminated',
  BREACHED = 'breached',
  EXPIRED = 'expired',
}

/**
 * Capability advertisement interface
 */
export interface CapabilityAdvertisement {
  id: string;
  agentId: string;
  agentName: string;
  timestamp: number;
  expiration: number;
  capabilities: {
    name: string;
    description: string;
    confidenceLevel: 'expert' | 'proficient' | 'competent' | 'novice';
    confidenceScore: number; // 0.0-1.0
    experience: number; // Number of times used
    specializations?: string[];
    contexts?: string[];
    limitations?: string[];
  }[];
  availability: {
    status: 'available' | 'limited' | 'unavailable';
    currentLoad: number; // 0.0-1.0
    nextAvailableSlot?: number; // Timestamp
  };
}

/**
 * Capability advertisement message
 */
export interface CapabilityAdvertisementMessage {
  id: string;
  type: RecruitmentMessageType.CAPABILITY_ADVERTISEMENT;
  timestamp: number;
  senderId: string;
  senderName?: string;
  capabilities: Array<{
    name: string;
    description: string;
    confidenceLevel: ConfidenceLevel;
    confidenceScore: ConfidenceScore;
    experience: number;
    specializations?: string[];
    contexts?: string[];
    limitations?: string[];
    recentPerformance?: {
      successRate: number;
      averageExecutionTime: number;
      timestamp: number;
    };
  }>;
  availability: {
    status: 'available' | 'limited' | 'unavailable';
    currentLoad: number;
    nextAvailableSlot?: number;
  };
  validUntil: number;
  metadata?: Record<string, any>;
}

/**
 * Confidence level enum
 */
export enum ConfidenceLevel {
  EXPERT = 'expert',
  PROFICIENT = 'proficient',
  COMPETENT = 'competent',
  NOVICE = 'novice',
}

/**
 * Confidence score type (0-1 value)
 */
export type ConfidenceScore = number;

/**
 * Performance report interface
 */
export interface PerformanceReport {
  id: string;
  contractId: string;
  agentId: string;
  evaluatorId: string;
  timestamp: number;
  metrics: {
    metricName: string;
    target: any;
    actual: any;
    score: number; // 0.0-1.0
  }[];
  overallScore: number; // 0.0-1.0
  feedback: string;
  recommendations?: string[];
}

/**
 * Negotiation strategy options
 */
export enum NegotiationStrategy {
  COMPROMISE = 'compromise',
  PARTIAL_ACCEPTANCE = 'partial_acceptance',
  ALTERNATIVE_PROPOSAL = 'alternative_proposal',
  FIRM_STANCE = 'firm_stance',
}

/**
 * Resolution strategy for conflict resolution
 */
export enum ResolutionStrategy {
  COMPROMISE = 'compromise',
  PRIORITIZE_CAPABILITY_MATCH = 'prioritize_capability_match',
  PRIORITIZE_AVAILABILITY = 'prioritize_availability',
  PRIORITIZE_TEAM_BALANCE = 'prioritize_team_balance',
  FIND_ALTERNATIVE = 'find_alternative',
}

/**
 * Utility calculation parameters
 */
export interface UtilityCalculationParams {
  agent: {
    id: string;
    capabilities: string[];
    specializations: string[];
    confidenceScores: Record<string, number>;
    availability: number;
    recentSuccessRate: number;
  };
  task: {
    id: string;
    requiredCapabilities: string[];
    desiredCapabilities?: string[];
    priority: number;
  };
  team?: {
    id: string;
    currentMembers: Array<{
      id: string;
      capabilities: string[];
    }>;
  };
}

/**
 * Utility score result
 */
export interface UtilityScore {
  overallScore: number;
  capabilityMatch: number;
  availabilityMatch: number;
  teamComplementarity?: number;
  expectedContribution: number;
  confidenceAdjustment: number;
  explanation: string;
}

/**
 * Commitment record interface
 */
export interface CommitmentRecord {
  id: string;
  agentId: string;
  contractId: string;
  taskId: string;
  commitmentType: 'full' | 'partial' | 'tentative';
  startTime: number;
  endTime?: number;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  history: Array<{
    status: string;
    timestamp: number;
    details?: any;
  }>;
  createdAt: number;
  updatedAt: number;
}
