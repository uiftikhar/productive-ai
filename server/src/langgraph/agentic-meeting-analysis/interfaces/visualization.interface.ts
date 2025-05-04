/**
 * Visualization Interfaces for Agentic Meeting Analysis
 * 
 * These interfaces define the core types and structures for visualizing
 * team formation, meeting process analysis, collaborative dynamics, and
 * meeting content analysis.
 */

import { AgentExpertise } from './agent.interface';

/**
 * Common visualization element types
 */
export enum VisualizationElementType {
  AGENT = 'agent',
  TOPIC = 'topic',
  DECISION = 'decision',
  ACTION_ITEM = 'action_item',
  TRANSCRIPT_SEGMENT = 'transcript_segment',
  PARTICIPANT = 'participant',
  INSIGHT = 'insight',
  SENTIMENT = 'sentiment',
}

/**
 * Connection types between visualization elements
 */
export enum VisualizationConnectionType {
  COLLABORATION = 'collaboration',
  COMMUNICATION = 'communication',
  DEPENDENCY = 'dependency',
  RELATION = 'relation',
  ASSIGNMENT = 'assignment',
  INFLUENCE = 'influence',
  REFERENCE = 'reference',
  SEQUENCE = 'sequence',
}

/**
 * Visualization element state
 */
export enum VisualizationElementState {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  HIGHLIGHTED = 'highlighted',
  SELECTED = 'selected',
  FILTERED = 'filtered',
  ERROR = 'error',
  WARNING = 'warning',
}

/**
 * Base visualization element
 */
export interface VisualizationElement {
  id: string;
  type: VisualizationElementType;
  label: string;
  description?: string;
  properties: Record<string, any>;
  state: VisualizationElementState;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  color?: string;
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Connection between visualization elements
 */
export interface VisualizationConnection {
  id: string;
  type: VisualizationConnectionType;
  sourceId: string;
  targetId: string;
  label?: string;
  properties?: Record<string, any>;
  state?: string;
  strength?: number; // 0-1 scale
  animated?: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Complete visualization graph
 */
export interface VisualizationGraph {
  id: string;
  name: string;
  description?: string;
  elements: VisualizationElement[];
  connections: VisualizationConnection[];
  layout: string;
  timestamp: Date;
  version: number;
  metadata?: Record<string, any>;
}

/**
 * Agent role for team visualization
 */
export interface AgentRole {
  agentId: string;
  primaryExpertise: AgentExpertise;
  secondaryExpertise: AgentExpertise[];
  responsibility: string;
  contributionScore: number; // 0-1 scale
}

/**
 * Agent activity event for visualization
 */
export interface AgentActivityEvent {
  id: string;
  agentId: string;
  timestamp: Date;
  activityType: string;
  details?: string;
  description?: string;
  relatedEntityId?: string;
  relatedEntityIds?: string[];
  duration?: number; // in milliseconds
  outcome?: string;
  meetingId?: string;
  metadata?: Record<string, any>;
}

/**
 * Topic node for visualization
 */
export interface TopicNode {
  id: string;
  name: string;
  description?: string;
  relevanceScore: number; // 0-1 scale
  timeSpent: number; // in seconds
  participantIds: string[];
  sentimentScore?: number; // -1 to 1 scale
  keywords: string[];
  parentTopicId?: string;
  childTopicIds?: string[];
}

/**
 * Decision point for visualization
 */
export interface DecisionPoint {
  id: string;
  description: string;
  timestamp: Date;
  decisionMakers: string[];
  alternatives: {
    description: string;
    pros: string[];
    cons: string[];
    selected: boolean;
  }[];
  rationale: string;
  topicId?: string;
  actionItemIds?: string[];
  confidence: number; // 0-1 scale
}

/**
 * Action item for visualization
 */
export interface ActionItem {
  id: string;
  description: string;
  assignees: string[];
  deadline?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high';
  dependsOn?: string[]; // other action item IDs
  topicId?: string;
  decisionId?: string;
}

/**
 * Participant dynamics for visualization
 */
export interface ParticipantDynamics {
  participantId: string;
  name: string;
  speakingTime: number; // in seconds
  interventions: number;
  influence: number; // 0-1 scale
  engagement: number; // 0-1 scale
  sentimentTrend: { timestamp: Date; value: number }[];
  interactions: {
    withParticipantId: string;
    count: number;
    sentiment: number; // -1 to 1 scale
  }[];
}

/**
 * Meeting phase for visualization
 */
export interface MeetingPhase {
  id: string;
  phaseId: string;
  name: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  topicIds: string[];
  participantIds: string[];
  sentimentScore: number; // -1 to 1 scale
  productivity: number; // 0-1 scale
  keyInsights: string[];
}

/**
 * Sentiment analysis result for visualization
 */
export interface SentimentAnalysis {
  entityId: string; // can be topic, participant, decision, etc.
  entityType: string;
  timestamp: Date;
  sentimentScore: number; // -1 to 1 scale
  keywords: { word: string; sentiment: number }[];
  confidence: number; // 0-1 scale
}

// Team Visualization Interfaces

/**
 * Interface for agent roster visualization
 */
export interface TeamRosterVisualization {
  createTeamVisualization(meetingId: string, name: string): string;
  addAgentToRoster(visualizationId: string, agent: AgentRole): boolean;
  updateAgentRole(visualizationId: string, agentId: string, updates: Partial<AgentRole>): boolean;
  removeAgentFromRoster(visualizationId: string, agentId: string): boolean;
  visualizeTeamRoster(visualizationId: string): VisualizationGraph;
  getAgentRole(visualizationId: string, agentId: string): AgentRole;
  highlightAgent(visualizationId: string, agentId: string): boolean;
  getTeamComposition(visualizationId: string): {
    expertiseCoverage: Record<AgentExpertise, number>;
    teamSize: number;
    specializations: Record<string, number>;
  };
}

/**
 * Interface for role distribution visualization
 */
export interface RoleDistributionVisualization {
  createDistributionVisualization(meetingId: string): string;
  updateExpertiseDistribution(visualizationId: string, distribution: Record<AgentExpertise, number>): boolean;
  visualizeRoleDistribution(visualizationId: string): any; // Returns visualization data
  compareDistributionWithOptimal(visualizationId: string): {
    gaps: Record<AgentExpertise, number>;
    overallocations: Record<AgentExpertise, number>;
    balanceScore: number; // 0-1 scale
  };
  identifyUnderservedAreas(visualizationId: string): AgentExpertise[];
}

/**
 * Interface for team evolution visualization
 */
export interface TeamEvolutionVisualization {
  trackTeamChange(meetingId: string, timestamp: Date, changes: {
    added: AgentRole[];
    removed: string[];
    modified: Array<{ agentId: string; updates: Partial<AgentRole> }>;
  }): boolean;
  getTeamSnapshots(meetingId: string, startTime?: Date, endTime?: Date): Array<{
    timestamp: Date;
    roster: AgentRole[];
  }>;
  visualizeTeamEvolution(meetingId: string): any; // Returns visualization data
  analyzeTrends(meetingId: string): {
    growth: number; // team size change rate
    turnover: number; // team composition stability
    expertiseEvolution: Record<AgentExpertise, number[]>;
  };
}

/**
 * Interface for agent activity timeline
 */
export interface AgentActivityVisualization {
  recordAgentActivity(activity: Omit<AgentActivityEvent, 'id'>): string;
  getAgentActivities(agentId: string, startTime?: Date, endTime?: Date): AgentActivityEvent[];
  visualizeActivityTimeline(meetingId: string, agentIds?: string[]): any; // Returns visualization data
  calculateActivityMetrics(agentId: string): {
    activityDensity: number; // activities per time unit
    activityDiversity: number; // 0-1 scale of different activity types
    peakActivityPeriods: Array<{ start: Date; end: Date; intensity: number }>;
  };
  compareAgentActivities(agentIds: string[]): any; // Returns comparison data
}

/**
 * Interface for specialization overlap visualization
 */
export interface SpecializationOverlapVisualization {
  calculateExpertiseOverlap(meetingId: string): Record<AgentExpertise, {
    agents: string[];
    overlapDegree: number; // 0-1 scale
  }>;
  visualizeExpertiseOverlap(meetingId: string): any; // Returns visualization data
  identifyRedundancies(meetingId: string): {
    expertise: AgentExpertise;
    agentIds: string[];
    redundancyScore: number; // 0-1 scale
  }[];
  suggestOptimizations(meetingId: string): {
    removeAgents: string[];
    reassignExpertise: Array<{ agentId: string; from: AgentExpertise; to: AgentExpertise }>;
    addExpertise: Array<{ agentId: string; expertise: AgentExpertise }>;
  };
}

// Process Visualization Interfaces

/**
 * Interface for analysis timeline visualization
 */
export interface AnalysisTimelineVisualization {
  createAnalysisTimeline(meetingId: string): string;
  recordAnalysisEvent(timelineId: string, event: {
    timestamp: Date;
    eventType: string;
    description: string;
    agentId?: string;
    entityId?: string;
    metadata?: Record<string, any>;
  }): string;
  visualizeAnalysisTimeline(timelineId: string): any; // Returns visualization data
  getAnalysisPhases(timelineId: string): MeetingPhase[];
  highlightTimeRange(timelineId: string, startTime: Date, endTime: Date): boolean;
  calculateProcessMetrics(timelineId: string): {
    totalAnalysisDuration: number; // in seconds
    phaseDistribution: Record<string, number>; // percentage of time per phase
    concurrency: number; // average parallel activities
  };
}

/**
 * Interface for insight discovery tracking
 */
export interface InsightDiscoveryVisualization {
  recordInsight(meetingId: string, insight: {
    timestamp: Date;
    description: string;
    sourceAgentId: string;
    importance: number; // 0-1 scale
    confidence: number; // 0-1 scale
    relatedEntityIds?: string[];
    type: 'topic' | 'action' | 'decision' | 'pattern' | 'relationship';
  }): string;
  visualizeInsightDiscovery(meetingId: string): any; // Returns visualization data
  getInsightsByType(meetingId: string, type: string): any[];
  trackInsightEvolution(insightId: string): {
    refinements: Array<{ timestamp: Date; description: string }>;
    confidenceTrend: Array<{ timestamp: Date; value: number }>;
    contributingAgents: string[];
  };
  identifyKeyInsights(meetingId: string): string[]; // Returns insight IDs
}

/**
 * Interface for focus transition visualization
 */
export interface FocusTransitionVisualization {
  recordFocusTransition(meetingId: string, transition: {
    timestamp: Date;
    fromEntityId?: string;
    toEntityId: string;
    transitionType: string;
    durationSeconds: number;
    agentIds: string[];
  }): string;
  visualizeFocusTransitions(meetingId: string): any; // Returns visualization data
  analyzeFocusPatterns(meetingId: string): {
    frequentTransitions: Array<{ from: string; to: string; count: number }>;
    focusDwellTimes: Record<string, number>; // average time spent on each focus
    coherenceScore: number; // 0-1 scale of focus transitions coherence
  };
  identifyAttentionHotspots(meetingId: string): string[]; // Returns entity IDs
}

/**
 * Interface for confidence evolution visualization
 */
export interface ConfidenceEvolutionVisualization {
  recordConfidenceUpdate(meetingId: string, update: {
    timestamp: Date;
    entityId: string;
    entityType: string;
    confidence: number; // 0-1 scale
    agentId: string;
    reason?: string;
  }): string;
  visualizeConfidenceEvolution(meetingId: string, entityIds?: string[]): any; // Returns visualization data
  getConfidenceTrend(entityId: string): Array<{ timestamp: Date; value: number }>;
  analyzeConfidenceConvergence(meetingId: string): {
    convergenceRate: number; // speed of confidence stabilization
    finalConfidences: Record<string, number>;
    uncertaintyPeriods: Array<{ start: Date; end: Date; entityIds: string[] }>;
  };
}

/**
 * Interface for exploration path visualization
 */
export interface ExplorationPathVisualization {
  recordExplorationStep(meetingId: string, step: {
    timestamp: Date;
    agentId: string;
    entityId: string;
    entityType: string;
    explorationAction: string;
    result: string;
    nextStepOptions: string[];
    selectedNextStep?: string;
  }): string;
  visualizeExplorationPaths(meetingId: string): any; // Returns visualization data
  compareAgentExplorationStrategies(meetingId: string, agentIds: string[]): any;
  identifyEfficientPaths(meetingId: string): {
    pathSegments: string[][]; // sequences of entity IDs
    efficiency: number; // 0-1 scale
    insights: string[];
  }[];
  detectExplorationBottlenecks(meetingId: string): {
    entityId: string;
    bottleneckType: string;
    severity: number; // 0-1 scale
    recommendations: string[];
  }[];
}

// Collaborative Dynamics Interfaces

/**
 * Interface for communication network visualization
 */
export interface CommunicationNetworkVisualization {
  recordCommunication(meetingId: string, communication: {
    timestamp: Date;
    sourceAgentId: string;
    targetAgentId: string;
    communicationType: string;
    content: string;
    relatedEntityId?: string;
    responseToId?: string;
  }): string;
  visualizeCommunicationNetwork(meetingId: string): any; // Returns visualization data
  calculateNetworkMetrics(meetingId: string): {
    density: number; // 0-1 scale of network connectedness
    centralAgents: string[];
    communicationDistribution: Record<string, number>; // per agent
    effectivenessScore: number; // 0-1 scale
  };
  identifyCommunicationPatterns(meetingId: string): {
    type: string;
    participants: string[];
    frequency: number;
    effectivenessScore: number; // 0-1 scale
  }[];
}

/**
 * Interface for knowledge flow visualization
 */
export interface KnowledgeFlowVisualization {
  recordKnowledgeTransfer(meetingId: string, transfer: {
    timestamp: Date;
    sourceAgentId: string;
    targetAgentId: string;
    knowledgeType: string;
    content: string;
    entityId?: string;
    utilityScore?: number; // 0-1 scale
  }): string;
  visualizeKnowledgeFlow(meetingId: string): any; // Returns visualization data
  identifyKnowledgeHubs(meetingId: string): {
    agentId: string;
    knowledgeTypes: string[];
    outgoingTransfers: number;
    incomingTransfers: number;
    hubScore: number; // 0-1 scale
  }[];
  analyzeKnowledgeDistribution(meetingId: string): {
    distribution: Record<string, number>; // knowledge per agent
    gaps: Record<string, string[]>; // missing knowledge areas per agent
    sharingEfficiency: number; // 0-1 scale
  };
}

/**
 * Interface for collaboration pattern visualization
 */
export interface CollaborationPatternVisualization {
  recordCollaboration(meetingId: string, collaboration: {
    timestamp: Date;
    participantAgentIds: string[];
    pattern: string;
    context: string;
    outcome: string;
    effectiveness: number; // 0-1 scale
  }): string;
  visualizeCollaborationPatterns(meetingId: string): any; // Returns visualization data
  identifySuccessfulPatterns(meetingId: string): {
    pattern: string;
    averageEffectiveness: number;
    frequency: number;
    participants: string[][];
  }[];
  suggestCollaborationImprovements(meetingId: string): {
    agentPairings: Array<{ agent1: string; agent2: string; potential: number }>;
    underutilizedPatterns: string[];
    improvementAreas: Record<string, string[]>;
  };
}

/**
 * Interface for conflict resolution visualization
 */
export interface ConflictResolutionVisualization {
  recordConflict(meetingId: string, conflict: {
    timestamp: Date;
    involvedAgentIds: string[];
    conflictType: string;
    description: string;
    entityId?: string;
    resolutionStatus: 'detected' | 'in_progress' | 'resolved' | 'escalated';
  }): string;
  updateConflictResolution(conflictId: string, resolution: {
    timestamp: Date;
    resolutionType: string;
    resolutionAgentId?: string;
    outcome: string;
    acceptedByAgentIds: string[];
  }): boolean;
  visualizeConflictResolutions(meetingId: string): any; // Returns visualization data
  analyzeConflictPatterns(meetingId: string): {
    frequentConflictTypes: Array<{ type: string; count: number }>;
    conflictProneAgents: string[];
    resolutionEffectiveness: number; // 0-1 scale
    escalationRate: number; // percentage of conflicts requiring escalation
  };
}

/**
 * Interface for consensus building tracking
 */
export interface ConsensusBuildingVisualization {
  trackConsensusProcess(meetingId: string, process: {
    entityId: string;
    entityType: string;
    startTimestamp: Date;
    participantAgentIds: string[];
    initialPositions: Record<string, string>;
  }): string;
  updateConsensusStep(processId: string, step: {
    timestamp: Date;
    agentId: string;
    newPosition?: string;
    contributionType: string;
    influenceLevel: number; // 0-1 scale
  }): boolean;
  completeConsensusProcess(processId: string, outcome: {
    timestamp: Date;
    finalPosition: string;
    agreementLevel: number; // 0-1 scale
    dissenterIds?: string[];
  }): boolean;
  visualizeConsensusBuilding(meetingId: string): any; // Returns visualization data
  analyzeConsensusEfficiency(meetingId: string): {
    averageConsensusTime: number; // in seconds
    influentialAgents: string[];
    medianAgreementLevel: number;
    successRate: number; // percentage of successful consensus
  };
}

// Content Visualization Interfaces

/**
 * Interface for topic relationship mapping
 */
export interface TopicRelationshipVisualization {
  createTopicMap(meetingId: string): string;
  addTopic(mapId: string, topic: Omit<TopicNode, 'id'>): string;
  addTopicRelationship(mapId: string, relationship: {
    sourceTopicId: string;
    targetTopicId: string;
    relationshipType: string;
    strength: number; // 0-1 scale
    description?: string;
  }): string;
  visualizeTopicMap(mapId: string): any; // Returns visualization data
  analyzeTopicStructure(mapId: string): {
    centralTopics: string[];
    topicClusters: Array<{ topics: string[]; theme: string }>;
    topicDepths: Record<string, number>; // depth in topic hierarchy
    topicDiversity: number; // 0-1 scale
  };
}

/**
 * Interface for speaker participation visualization
 */
export interface SpeakerParticipationVisualization {
  recordParticipation(meetingId: string, participation: {
    timestamp: Date;
    participantId: string;
    durationType: 'speaking' | 'question' | 'response' | 'challenge' | 'support';
    durationSeconds: number;
    topicId?: string;
    interactsWithIds?: string[];
  }): string;
  visualizeSpeakerParticipation(meetingId: string): any; // Returns visualization data
  getParticipantDynamics(meetingId: string, participantId: string): ParticipantDynamics;
  compareParticipantEngagement(meetingId: string): Record<string, number>;
  analyzeParticipationEquality(meetingId: string): {
    giniCoefficient: number; // measure of inequality (0-1)
    dominantParticipants: string[];
    underrepresentedParticipants: string[];
    balanceOverTime: Array<{ timestamp: Date; equality: number }>;
  };
}

/**
 * Interface for sentiment landscape visualization
 */
export interface SentimentLandscapeVisualization {
  recordSentimentAnalysis(analysis: Omit<SentimentAnalysis, 'id'>): string;
  visualizeSentimentLandscape(meetingId: string): any; // Returns visualization data
  getSentimentForEntity(entityId: string): SentimentAnalysis[];
  analyzeSentimentPatterns(meetingId: string): {
    overallTrend: 'positive' | 'negative' | 'neutral' | 'mixed' | 'volatile';
    sentimentByTopic: Record<string, number>;
    sentimentByParticipant: Record<string, number>;
    volatilityScore: number; // 0-1 scale
    emotionalTriggers: Array<{ entity: string; sentiment: number; intensity: number }>;
  };
}

/**
 * Interface for decision point highlighting
 */
export interface DecisionPointVisualization {
  recordDecision(decision: Omit<DecisionPoint, 'id'>): string;
  visualizeDecisions(meetingId: string): any; // Returns visualization data
  getDecisionById(decisionId: string): DecisionPoint;
  linkDecisionToEntities(decisionId: string, relationshipType: string, entityIds: string[]): boolean;
  analyzeDecisionQuality(meetingId: string): {
    decisionsWithLowConfidence: string[];
    decisionsWithFewAlternatives: string[];
    decisionsWithoutRationale: string[];
    qualityScore: Record<string, number>; // 0-1 scale per decision
  };
}

/**
 * Interface for action network visualization
 */
export interface ActionNetworkVisualization {
  recordAction(action: Omit<ActionItem, 'id'>): string;
  visualizeActionNetwork(meetingId: string): any; // Returns visualization data
  getActionById(actionId: string): ActionItem;
  updateActionStatus(actionId: string, status: ActionItem['status'], progress?: number): boolean;
  analyzeActionAssignment(meetingId: string): {
    assignmentBalance: number; // 0-1 scale of assignment distribution quality
    overloadedAssignees: string[];
    actionsByPriority: Record<string, number>;
    dependencyComplexity: number; // 0-1 scale
    criticalPath: string[]; // sequence of action IDs
  };
} 