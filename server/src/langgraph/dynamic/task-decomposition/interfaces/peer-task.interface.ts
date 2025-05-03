import { v4 as uuidv4 } from 'uuid';
import { HierarchicalTask, TaskPriority, TaskStatus } from './hierarchical-task.interface';
import { ComplexityLevel } from './task-analysis.interface';

/**
 * Vote type for consensus mechanisms
 */
export enum VoteType {
  APPROVE = 'approve',
  REJECT = 'reject',
  ABSTAIN = 'abstain',
  SUGGEST_CHANGES = 'suggest_changes',
}

/**
 * Consensus strategy for decision making
 */
export enum ConsensusStrategy {
  MAJORITY = 'majority', // Greater than 50%
  SUPER_MAJORITY = 'super_majority', // Usually 2/3 or greater
  UNANIMOUS = 'unanimous', // All must agree
  WEIGHTED = 'weighted', // Based on agent weights/expertise
  THRESHOLD = 'threshold', // Custom threshold
}

/**
 * Responsibility type for shared work
 */
export enum ResponsibilityType {
  PRIMARY = 'primary', // Main responsibility
  SECONDARY = 'secondary', // Supporting role
  REVIEWER = 'reviewer', // Reviews the work
  CONSULTANT = 'consultant', // Provides expertise
  COORDINATOR = 'coordinator', // Coordinates among peers
  OBSERVER = 'observer', // Observes only
}

/**
 * Agent responsibility assignment
 */
export interface ResponsibilityAssignment {
  id: string;
  taskId: string;
  agentId: string;
  type: ResponsibilityType;
  description: string;
  percentage: number; // Percentage of overall responsibility (0-100)
  assignedAt: number;
  acceptedAt?: number;
  completedAt?: number;
  metadata?: Record<string, any>;
}

/**
 * Vote on a task proposal
 */
export interface TaskVote {
  id: string;
  taskId: string;
  proposalId: string;
  agentId: string;
  vote: VoteType;
  reasoning: string;
  timestamp: number;
  suggestedChanges?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Task boundary proposal
 */
export interface TaskBoundaryProposal {
  id: string;
  taskId: string;
  proposedBy: string; // Agent ID
  proposedAt: number;
  name: string;
  description: string;
  scope: string;
  outOfScope: string[];
  complexity: ComplexityLevel;
  estimatedDuration: number;
  resourceNeeds: string[];
  expectedOutcomes: string[];
  status: 'proposed' | 'under_review' | 'accepted' | 'rejected' | 'modified';
  votes: TaskVote[];
  consensusStrategy: ConsensusStrategy;
  requiredVoteCount: number;
  metadata?: Record<string, any>;
}

/**
 * Collaborative task definition
 */
export interface CollaborativeTask extends HierarchicalTask {
  initiatedBy: string; // Agent ID
  collaborators: string[]; // Agent IDs
  proposalHistory: TaskBoundaryProposal[];
  currentProposal?: string; // Current proposal ID
  responsibilities: ResponsibilityAssignment[];
  consensusStrategy: ConsensusStrategy;
  consensusThreshold: number; // 0-1 percentage required for consensus
  consensusReached: boolean;
  discussionThreadId?: string; // ID of related discussion thread
  lastActivity: number; // Timestamp of last activity
  finalContributions?: Record<string, any>; // Contributions by each agent
}

/**
 * Task consensus interface
 */
export interface TaskConsensusManager {
  createProposal(taskId: string, proposedBy: string, details: Omit<TaskBoundaryProposal, 'id' | 'taskId' | 'proposedBy' | 'proposedAt' | 'votes' | 'status'>): Promise<TaskBoundaryProposal>;
  getProposal(proposalId: string): Promise<TaskBoundaryProposal | null>;
  updateProposal(proposalId: string, updates: Partial<TaskBoundaryProposal>): Promise<TaskBoundaryProposal>;
  
  // Voting
  castVote(proposalId: string, agentId: string, vote: VoteType, reasoning: string, suggestedChanges?: Record<string, any>): Promise<TaskVote>;
  getVotes(proposalId: string): Promise<TaskVote[]>;
  checkConsensus(proposalId: string): Promise<{reached: boolean, approvalRate: number, results: Record<VoteType, number>}>;
  
  // Responsibility management
  assignResponsibility(taskId: string, agentId: string, type: ResponsibilityType, description: string, percentage: number): Promise<ResponsibilityAssignment>;
  updateResponsibility(responsibilityId: string, updates: Partial<ResponsibilityAssignment>): Promise<ResponsibilityAssignment>;
  getResponsibilities(taskId: string): Promise<ResponsibilityAssignment[]>;
  
  // Collaborative tasks
  createCollaborativeTask(details: Omit<CollaborativeTask, 'id' | 'childTaskIds' | 'createdAt' | 'updatedAt' | 'progress' | 'lastActivity' | 'proposalHistory' | 'consensusReached' | 'responsibilities'>): Promise<CollaborativeTask>;
  convertToCollaborative(taskId: string, initiatedBy: string, collaborators: string[], consensusStrategy: ConsensusStrategy, consensusThreshold: number): Promise<CollaborativeTask>;
  addCollaborator(taskId: string, agentId: string): Promise<CollaborativeTask>;
  removeCollaborator(taskId: string, agentId: string): Promise<CollaborativeTask>;
}

/**
 * Factory function to create a responsibility assignment
 */
export function createResponsibilityAssignment(
  taskId: string,
  agentId: string,
  type: ResponsibilityType,
  description: string,
  percentage: number,
): ResponsibilityAssignment {
  return {
    id: uuidv4(),
    taskId,
    agentId,
    type,
    description,
    percentage: Math.min(Math.max(percentage, 0), 100), // Ensure 0-100 range
    assignedAt: Date.now(),
    metadata: {},
  };
}

/**
 * Factory function to create a task proposal
 */
export function createTaskProposal(
  name: string,
  description: string,
  scope: string,
  complexity: ComplexityLevel,
  estimatedDuration: number,
  consensusStrategy: ConsensusStrategy,
  requiredVoteCount: number,
): Omit<TaskBoundaryProposal, 'id' | 'taskId' | 'proposedBy' | 'proposedAt' | 'votes' | 'status'> {
  return {
    name,
    description,
    scope,
    outOfScope: [],
    complexity,
    estimatedDuration,
    resourceNeeds: [],
    expectedOutcomes: [],
    consensusStrategy,
    requiredVoteCount,
    metadata: {},
  };
}

/**
 * Factory function to create a collaborative task
 */
export function createCollaborativeTask(
  name: string,
  description: string,
  initiatedBy: string,
  collaborators: string[],
  consensusStrategy: ConsensusStrategy,
  consensusThreshold: number,
  priority: TaskPriority = TaskPriority.MEDIUM,
  complexity: ComplexityLevel = ComplexityLevel.MODERATE,
  estimatedDuration: number = 3600000, // 1 hour default
): Omit<CollaborativeTask, 'id' | 'childTaskIds' | 'createdAt' | 'updatedAt' | 'progress' | 'lastActivity' | 'proposalHistory' | 'consensusReached' | 'responsibilities'> {
  return {
    name,
    description,
    status: TaskStatus.DRAFT,
    priority,
    complexity,
    dependencies: [],
    resourceRequirements: [],
    milestones: [],
    estimatedDuration,
    initiatedBy,
    collaborators: [initiatedBy, ...collaborators.filter(id => id !== initiatedBy)],
    consensusStrategy,
    consensusThreshold,
    metadata: {},
  };
} 