/**
 * Emergent Roles & Adaptive Teamwork Interfaces
 *
 * Defines interfaces for dynamic role assignment, role transitions,
 * and adaptive team optimization as part of Milestone 4.
 */

import { BaseAgentInterface } from './base-agent.interface';
import {
  CommitmentRecord,
  TeamContract,
} from './recruitment-protocol.interface';

/**
 * Types of role emergence patterns
 */
export enum RoleEmergencePattern {
  CAPABILITY_BASED = 'capability_based',
  INTERACTION_BASED = 'interaction_based',
  PERFORMANCE_BASED = 'performance_based',
  TASK_AFFINITY_BASED = 'task_affinity_based',
  HYBRID = 'hybrid',
}

/**
 * Role adjustment types
 */
export enum RoleAdjustmentType {
  EXPANSION = 'expansion', // Adding responsibilities to a role
  CONTRACTION = 'contraction', // Removing responsibilities
  TRANSITION = 'transition', // Moving to a different role
  SPECIALIZATION = 'specialization', // Becoming more specialized
  GENERALIZATION = 'generalization', // Becoming more generalized
}

/**
 * Role definition that emerges during team operation
 */
export interface EmergentRole {
  id: string;
  name: string;
  description: string;
  responsibilities: string[];
  requiredCapabilities: string[];
  createdAt: number;
  updatedAt: number;
  discoveryPattern: RoleEmergencePattern;
  contextualFactors: {
    taskType?: string;
    teamSize?: number;
    complexityLevel?: number;
  };
  metrics?: {
    effectivenessScore?: number;
    specializationScore?: number;
    redundancyLevel?: number;
  };
}

/**
 * Agent role assignment within a team
 */
export interface AgentRoleAssignment {
  id: string;
  agentId: string;
  roleId: string;
  teamId: string;
  taskId: string;
  assignedAt: number;
  updatedAt: number;
  matchScore: number; // 0.0-1.0 compatibility score
  confidenceScore: number; // Agent confidence in this role
  performanceHistory?: {
    timestamp: number;
    score: number;
    feedback?: string;
  }[];
  status: 'active' | 'transitioning' | 'completed';
}

/**
 * Role transition tracking
 */
export interface RoleTransition {
  id: string;
  agentId: string;
  teamId: string;
  taskId: string;
  previousRoleId: string;
  newRoleId: string;
  initiatedAt: number;
  completedAt?: number;
  reason: string;
  adjustmentType: RoleAdjustmentType;
  knowledgeTransfer: {
    required: boolean;
    completionStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
    transferredItems?: string[];
  };
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

/**
 * Workload distribution mapping
 */
export interface WorkloadDistribution {
  teamId: string;
  taskId: string;
  timestamp: number;
  distribution: {
    agentId: string;
    roleId: string;
    workloadPercentage: number; // 0.0-1.0
    taskCount: number;
    estimatedHours: number;
    complexity: number; // 0.0-1.0
  }[];
  balanceScore: number; // 0.0-1.0, higher means more balanced
  recommendations?: {
    targetAgentId: string;
    suggestedAction: 'increase' | 'decrease' | 'maintain';
    rationale: string;
  }[];
}

/**
 * Team performance analysis
 */
export interface TeamPerformanceAnalysis {
  id: string;
  teamId: string;
  taskId: string;
  timestamp: number;
  overallPerformanceScore: number; // 0.0-1.0
  efficiency: number; // 0.0-1.0
  qualityScore: number; // 0.0-1.0
  collaborationScore: number; // 0.0-1.0
  agentPerformance: {
    agentId: string;
    roleId: string;
    performanceScore: number; // 0.0-1.0
    contributionScore: number; // 0.0-1.0
    keyStrengths: string[];
    improvementAreas: string[];
  }[];
  roleEffectiveness: {
    roleId: string;
    effectivenessScore: number; // 0.0-1.0
    observations: string[];
  }[];
  recommendations: {
    type: 'role_adjustment' | 'team_composition' | 'process_improvement';
    description: string;
    priority: 'low' | 'medium' | 'high';
    expectedImpact: number; // 0.0-1.0
  }[];
}

/**
 * Role pattern discovery
 */
export interface RolePattern {
  id: string;
  name: string;
  description: string;
  pattern: RoleEmergencePattern;
  triggers: string[];
  responsibilityCluster: string[];
  capabilityRequirements: string[];
  contextualFactors: Record<string, any>;
  performanceMetrics: {
    effectivenessAverage: number;
    reliabilityScore: number;
    observationCount: number;
  };
  discoveredAt: number;
  updatedAt: number;
  confidence: number; // 0.0-1.0
}

/**
 * Role negotiation proposal
 */
export interface RoleNegotiationProposal {
  id: string;
  initiatingAgentId: string;
  recipientAgentId: string;
  teamId: string;
  taskId: string;
  timestamp: number;
  proposedRoleAdjustment: {
    roleId: string;
    responsibilitiesToAdd?: string[];
    responsibilitiesToRemove?: string[];
    newPrimaryConcern?: string;
  };
  rationale: string;
  expectedBenefits: string[];
  deadline: number;
  status: 'proposed' | 'accepted' | 'rejected' | 'countered';
}

/**
 * Team optimization model
 */
export interface TeamOptimizationModel {
  id: string;
  teamId: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  optimizationFactors: {
    factorName: string;
    weight: number; // 0.0-1.0
    threshold?: number;
    description: string;
  }[];
  roleDistributionPatterns: {
    patternName: string;
    taskType: string;
    teamSize: number;
    roleDistribution: Record<string, number>; // role name to percentage
    effectivenessScore: number;
    observationCount: number;
  }[];
  adaptationRules: {
    trigger: string;
    condition: string;
    action: string;
    rationale: string;
  }[];
  confidenceScore: number; // 0.0-1.0
  trainingData: {
    dataPoints: number;
    lastTrainedAt: number;
    performanceImprovement: number;
  };
}

/**
 * Event types for role and team events
 */
export enum TeamRoleEventType {
  ROLE_DISCOVERED = 'role_discovered',
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_ADJUSTED = 'role_adjusted',
  ROLE_TRANSITION_INITIATED = 'role_transition_initiated',
  ROLE_TRANSITION_COMPLETED = 'role_transition_completed',
  TEAM_COMPOSITION_CHANGED = 'team_composition_changed',
  WORKLOAD_IMBALANCE_DETECTED = 'workload_imbalance_detected',
  PERFORMANCE_ANALYSIS_COMPLETED = 'performance_analysis_completed',
  OPTIMIZATION_RECOMMENDATION_GENERATED = 'optimization_recommendation_generated',
  TEAM_OPTIMIZATION_APPLIED = 'team_optimization_applied',
}

/**
 * Basic role event structure
 */
export interface TeamRoleEvent {
  id: string;
  type: TeamRoleEventType;
  timestamp: number;
  teamId: string;
  taskId: string;
  agentId?: string;
  roleId?: string;
  data: any;
}
