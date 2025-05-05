/**
 * Assistance Request Interface
 *
 * Defines standardized formats for agent assistance requests, problem solving,
 * and inter-agent help mechanisms.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  StatusPriority,
  AssistanceRequest,
} from './status-reporting.interface';

/**
 * Assistance request categories
 */
export enum AssistanceCategory {
  KNOWLEDGE_GAP = 'knowledge_gap',
  SKILL_LIMITATION = 'skill_limitation',
  RESOURCE_LIMITATION = 'resource_limitation',
  CLARIFICATION_NEEDED = 'clarification_needed',
  TECHNICAL_OBSTACLE = 'technical_obstacle',
  STRATEGIC_GUIDANCE = 'strategic_guidance',
  VALIDATION_REVIEW = 'validation_review',
  CONFLICT_RESOLUTION = 'conflict_resolution',
  CREATIVE_INPUT = 'creative_input',
  COORDINATION_ISSUE = 'coordination_issue',
}

/**
 * Assistance response types
 */
export enum AssistanceResponseType {
  INFORMATION = 'information',
  SOLUTION = 'solution',
  RESOURCE_PROVISION = 'resource_provision',
  EXPERTISE_SUPPORT = 'expertise_support',
  REFERRAL = 'referral',
  COLLABORATION_OFFER = 'collaboration_offer',
  STRATEGIC_ADVICE = 'strategic_advice',
  ALTERNATIVE_APPROACH = 'alternative_approach',
  VALIDATION = 'validation',
  PARTIAL_SOLUTION = 'partial_solution',
}

/**
 * Assistance resolution status
 */
export enum AssistanceResolutionStatus {
  PENDING = 'pending',
  ACKNOWLEDGED = 'acknowledged',
  IN_PROGRESS = 'in_progress',
  PARTIALLY_RESOLVED = 'partially_resolved',
  RESOLVED = 'resolved',
  UNRESOLVABLE = 'unresolvable',
  REFERRED = 'referred',
  EXPIRED = 'expired',
}

/**
 * Detailed assistance request
 */
export interface DetailedAssistanceRequest {
  id: string;
  originatingRequestId?: string; // If derived from a basic AssistanceRequest
  requesterId: string;
  taskId: string;
  timestamp: number;
  category: AssistanceCategory;
  title: string;
  description: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  priority: StatusPriority;
  expectedResponseTime?: number; // Expected time to respond in ms
  requiredBy?: number; // When assistance is needed by (timestamp)

  // Context
  context: {
    problemStatement: string;
    taskContext: string;
    relevantFacts?: string[];
    constraints?: string[];
    attachments?: Array<{
      type: string;
      content: any;
      description: string;
    }>;
  };

  // Solution related
  attemptedSolutions?: string[];
  desiredOutcome: string;
  acceptanceCriteria?: string[];

  // Coordination
  targetAgentIds?: string[]; // Specific agents to request help from
  requiredExpertise?: string[];
  requiredResources?: string[];
  maxAssistants?: number; // Maximum number of agents to help
  collaborationMode?: 'asynchronous' | 'synchronous' | 'either';

  // Tracking
  status: AssistanceResolutionStatus;
  statusHistory: Array<{
    timestamp: number;
    status: AssistanceResolutionStatus;
    updatedBy: string;
    notes?: string;
  }>;
  assignedHelpers?: string[];
  escalationLevel: number; // 0 = no escalation, higher numbers = more escalation
  metadata?: Record<string, any>;
}

/**
 * Assistance response from a helping agent
 */
export interface AssistanceResponse {
  id: string;
  requestId: string;
  responderId: string;
  timestamp: number;
  responseType: AssistanceResponseType;
  content: string;
  confidence: number; // 0-1 confidence in the solution
  completeness: number; // 0-1 completeness of the solution

  // Additional information
  references?: string[];
  alternatives?: string[];
  followupActions?: string[];

  // Coordination
  collaborationOffer?: {
    type:
      | 'knowledge_transfer'
      | 'joint_problem_solving'
      | 'resource_sharing'
      | 'ongoing_support';
    details: string;
    availability: {
      start: number;
      end?: number;
    };
  };

  metadata?: Record<string, any>;
}

/**
 * Problem-solving session for collaborative assistance
 */
export interface ProblemSolvingSession {
  id: string;
  requestId: string;
  title: string;
  description: string;
  startTime: number;
  endTime?: number;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  participants: string[];

  // Problem details
  problem: {
    statement: string;
    context: string;
    constraints: string[];
    acceptanceCriteria: string[];
  };

  // Session content
  contributions: Array<{
    id: string;
    contributorId: string;
    timestamp: number;
    type:
      | 'analysis'
      | 'idea'
      | 'solution'
      | 'question'
      | 'critique'
      | 'refinement';
    content: string;
    references?: string[]; // References to other contributions
    votes?: Record<string, 'up' | 'down' | 'neutral'>;
  }>;

  // Session outcomes
  outcomes?: {
    solutions: string[];
    selectedSolutionId?: string;
    rationale: string;
    lessonsLearned: string[];
  };

  // Coordination
  facilitatorId?: string;
  nextSteps?: string[];
  metadata?: Record<string, any>;
}

/**
 * Blocker resolution strategy
 */
export interface BlockerResolutionStrategy {
  id: string;
  blockerId: string;
  creatorId: string;
  timestamp: number;
  title: string;
  description: string;
  approach: string;
  estimatedEffort: number; // In person-hours
  estimatedDuration: number; // In milliseconds
  requiredResources: string[];
  requiredExpertise: string[];
  risks: Array<{
    description: string;
    probability: number; // 0-1
    impact: number; // 0-1
    mitigation?: string;
  }>;
  steps: Array<{
    order: number;
    description: string;
    assignee?: string;
    estimatedDuration: number;
  }>;
  alternatives?: string[];
  status: 'proposed' | 'approved' | 'in_progress' | 'completed' | 'failed';
  successCriteria: string[];
  metadata?: Record<string, any>;
}

/**
 * Helper functions for assistance requests
 */

export function createDetailedAssistanceRequest(
  requesterId: string,
  taskId: string,
  category: AssistanceCategory,
  title: string,
  description: string,
  problemStatement: string,
  taskContext: string,
  desiredOutcome: string,
  urgency: DetailedAssistanceRequest['urgency'] = 'medium',
  options: Partial<
    Omit<
      DetailedAssistanceRequest,
      | 'id'
      | 'requesterId'
      | 'taskId'
      | 'timestamp'
      | 'category'
      | 'title'
      | 'description'
      | 'desiredOutcome'
      | 'status'
      | 'statusHistory'
      | 'escalationLevel'
      | 'urgency'
      | 'priority'
    >
  > = {},
): DetailedAssistanceRequest {
  const priority =
    urgency === 'critical'
      ? StatusPriority.CRITICAL
      : urgency === 'high'
        ? StatusPriority.HIGH
        : urgency === 'medium'
          ? StatusPriority.NORMAL
          : StatusPriority.LOW;

  return {
    id: uuidv4(),
    requesterId,
    taskId,
    timestamp: Date.now(),
    category,
    title,
    description,
    urgency,
    priority,
    context: {
      problemStatement,
      taskContext,
      relevantFacts: options.context?.relevantFacts || [],
      constraints: options.context?.constraints || [],
      attachments: options.context?.attachments || [],
    },
    desiredOutcome,
    status: AssistanceResolutionStatus.PENDING,
    statusHistory: [
      {
        timestamp: Date.now(),
        status: AssistanceResolutionStatus.PENDING,
        updatedBy: requesterId,
      },
    ],
    escalationLevel: 0,
    ...options,
  };
}

export function createAssistanceResponse(
  requestId: string,
  responderId: string,
  responseType: AssistanceResponseType,
  content: string,
  confidence: number,
  completeness: number,
  options: Partial<
    Omit<
      AssistanceResponse,
      | 'id'
      | 'requestId'
      | 'responderId'
      | 'timestamp'
      | 'responseType'
      | 'content'
      | 'confidence'
      | 'completeness'
    >
  > = {},
): AssistanceResponse {
  return {
    id: uuidv4(),
    requestId,
    responderId,
    timestamp: Date.now(),
    responseType,
    content,
    confidence,
    completeness,
    ...options,
  };
}

export function createProblemSolvingSession(
  requestId: string,
  title: string,
  description: string,
  problem: ProblemSolvingSession['problem'],
  participants: string[],
  options: Partial<
    Omit<
      ProblemSolvingSession,
      | 'id'
      | 'requestId'
      | 'title'
      | 'description'
      | 'startTime'
      | 'status'
      | 'participants'
      | 'problem'
      | 'contributions'
    >
  > = {},
): ProblemSolvingSession {
  return {
    id: uuidv4(),
    requestId,
    title,
    description,
    startTime: Date.now(),
    status: 'active',
    participants,
    problem,
    contributions: [],
    ...options,
  };
}

export function addContribution(
  session: ProblemSolvingSession,
  contributorId: string,
  type: ProblemSolvingSession['contributions'][0]['type'],
  content: string,
  options: Partial<
    Omit<
      ProblemSolvingSession['contributions'][0],
      'id' | 'contributorId' | 'timestamp' | 'type' | 'content'
    >
  > = {},
): ProblemSolvingSession {
  const updatedSession = { ...session };

  updatedSession.contributions.push({
    id: uuidv4(),
    contributorId,
    timestamp: Date.now(),
    type,
    content,
    ...options,
  });

  return updatedSession;
}
