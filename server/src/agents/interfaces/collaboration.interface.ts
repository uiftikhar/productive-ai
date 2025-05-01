/**
 * Collaboration Interfaces
 *
 * Defines the interfaces for collaboration between agents as part of
 * the supervisor transformation from controller to facilitator.
 */

import { AgentCapability } from './base-agent.interface';

/**
 * Agent message for coordination and collaboration
 */
export interface AgentMessage {
  id: string;
  type: string;
  content: any;
  sender: string;
  recipient?: string;
  timestamp: number;
  conversationId?: string;
  replyToId?: string;
  metadata?: Record<string, any>;
}

/**
 * Task proposal interface for collaborative task assignment
 */
export interface TaskProposal {
  id: string;
  taskId: string;
  proposerId: string;
  proposerName: string;
  suggestedAgentId?: string;
  suggestedTeamIds?: string[];
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
  votes: {
    agentId: string;
    vote: 'approve' | 'reject' | 'abstain';
    reason?: string;
  }[];
  timestamp: number;
  responseTimestamp?: number;
  metadata?: Record<string, any>;
}

/**
 * Task suggestion interface
 */
export interface TaskSuggestion {
  id: string;
  taskId: string;
  suggestedAgentId: string;
  status: 'pending' | 'accepted' | 'rejected';
  feedback?: string;
  timestamp: number;
}

/**
 * Team formation result
 */
export interface TeamFormationResult {
  taskId: string;
  teamMembers: Array<{
    agentId: string;
    name: string;
    role: string;
    score: number;
    suggestedReason: string;
  }>;
}

/**
 * Task breakdown for collaborative task analysis
 */
export interface CollaborativeTaskBreakdown {
  taskId: string;
  breakdownId: string;
  proposingAgentId: string;
  collaborators: string[]; // agent IDs
  subtasks: {
    id: string;
    description: string;
    requiredCapabilities: string[];
    estimatedComplexity: number;
    prerequisites?: string[]; // IDs of prerequisite subtasks
    suggestedAgentId?: string;
  }[];
  votes: {
    agentId: string;
    vote: 'approve' | 'reject' | 'suggestion';
    suggestedChanges?: any;
    reason?: string;
  }[];
  status:
    | 'draft'
    | 'voting'
    | 'approved'
    | 'rejected'
    | 'in-progress'
    | 'completed';
  metrics?: {
    averageSubtaskComplexity: number;
    parallelizationScore: number;
    capabilityMatchScore: number;
  };
  createdAt: number;
  modifiedAt: number;
}

/**
 * Capability composition for team assembly
 */
export interface CapabilityComposition {
  taskId: string;
  requiredCapabilities: {
    name: string;
    importance: number; // 0-1
    specializationLevel: number; // 0-1 (1 = highly specialized)
  }[];
  recommendedTeamSize: number;
  recommendedTeamBalance: 'specialist' | 'generalist' | 'balanced';
  agentRecommendations: {
    agentId: string;
    name: string;
    matchScore: number;
    keyCapabilities: string[];
    complementaryAgents?: string[];
  }[];
}

/**
 * Delegation protocol for dynamic task routing
 */
export interface DelegationProtocol {
  delegationType: 'direct' | 'auction' | 'volunteer' | 'capability-based';
  taskId: string;
  subtaskId?: string;
  requiredCapabilities: string[];
  assignmentCriteria: {
    prioritizeCapability?: boolean;
    prioritizeExperience?: boolean;
    prioritizeAvailability?: boolean;
    prioritizeLoadBalance?: boolean;
  };
  deadline?: number;
  biddingPeriod?: number; // for auction type
  targetAgents?: string[]; // for direct type
  result?: {
    assignedAgentId: string;
    assignmentTime: number;
    acceptanceStatus: 'pending' | 'accepted' | 'rejected' | 'completed';
    feedbackScore?: number;
  };
}
