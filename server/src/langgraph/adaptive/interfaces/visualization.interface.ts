/**
 * Interfaces for the Visualization System
 *
 * These interfaces define the core types and structures for visualizing workflows,
 * agent reasoning, team dynamics, and interactive workflow inspection.
 */

/**
 * Graph node types for visualization
 */
export enum GraphNodeType {
  TASK = 'task',
  AGENT = 'agent',
  RESOURCE = 'resource',
  DECISION_POINT = 'decision_point',
  DATA = 'data',
  BARRIER = 'barrier',
  EVENT = 'event',
  INTERACTION = 'interaction',
}

/**
 * Graph edge types for visualization
 */
export enum GraphEdgeType {
  DEPENDENCY = 'dependency',
  EXECUTION_FLOW = 'execution_flow',
  DATA_FLOW = 'data_flow',
  COMMUNICATION = 'communication',
  ASSIGNMENT = 'assignment',
  INTERACTION = 'interaction',
  CONTRIBUTION = 'contribution',
}

/**
 * Graph node state for visualization
 */
export enum GraphNodeState {
  INACTIVE = 'inactive',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ERROR = 'error',
  WARNING = 'warning',
  SELECTED = 'selected',
  HIGHLIGHTED = 'highlighted',
}

/**
 * Graph node for visualization
 */
export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  properties: Record<string, any>;
  state: GraphNodeState;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  icon?: string;
  color?: string;
  parentId?: string;
  childIds?: string[];
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Graph edge for visualization
 */
export interface GraphEdge {
  id: string;
  type: GraphEdgeType;
  sourceId: string;
  targetId: string;
  label?: string;
  properties?: Record<string, any>;
  state?: string;
  weight?: number;
  animated?: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Graph for visualization
 */
export interface Graph {
  id: string;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: string;
  timestamp: Date;
  version: number;
}

/**
 * Decision point for agent reasoning
 */
export interface DecisionPoint {
  id: string;
  agentId: string;
  taskId?: string;
  timestamp: Date;
  context: Record<string, any>;
  options: {
    id: string;
    description: string;
    confidence: number;
    pros: string[];
    cons: string[];
    selected: boolean;
  }[];
  reasoning: string;
  result: string;
  metadata?: Record<string, any>;
}

/**
 * Reasoning path for visualization
 */
export interface ReasoningPath {
  id: string;
  agentId: string;
  decisionPoints: DecisionPoint[];
  startTime: Date;
  endTime?: Date;
  taskId?: string;
  confidenceOverTime: {
    timestamp: Date;
    value: number;
  }[];
  metadata?: Record<string, any>;
}

/**
 * Agent relationship for visualization
 */
export interface AgentRelationship {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  type:
    | 'collaboration'
    | 'supervision'
    | 'delegation'
    | 'information'
    | 'competition';
  strength: number; // 0-1 scale
  startTime: Date;
  endTime?: Date;
  interactions: number;
  metadata?: Record<string, any>;
}

/**
 * Communication event for visualization
 */
export interface CommunicationEvent {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  timestamp: Date;
  messageType: string;
  content: string;
  taskId?: string;
  responseToId?: string;
  metadata?: Record<string, any>;
}

/**
 * Expertise contribution for visualization
 */
export interface ExpertiseContribution {
  id: string;
  agentId: string;
  taskId: string;
  expertiseType: string;
  contributionLevel: number; // 0-1 scale
  timestamp: Date;
  details: string;
  metadata?: Record<string, any>;
}

/**
 * Human intervention point for visualization
 */
export interface InterventionPoint {
  id: string;
  nodeId: string;
  type: 'inspection' | 'modification' | 'approval' | 'rejection' | 'guidance';
  availableActions: string[];
  description: string;
  createdAt: Date;
  deadline?: Date;
  completed?: boolean;
  completedAt?: Date;
  result?: string;
  metadata?: Record<string, any>;
}

/**
 * Graph history snapshot for visualization
 */
export interface GraphHistorySnapshot {
  id: string;
  graphId: string;
  timestamp: Date;
  addedNodes: GraphNode[];
  removedNodeIds: string[];
  updatedNodes: GraphNode[];
  addedEdges: GraphEdge[];
  removedEdgeIds: string[];
  updatedEdges: GraphEdge[];
  event?: string;
  metadata?: Record<string, any>;
}

// Dynamic Graph Visualization Interfaces

/**
 * Interface for real-time graph rendering
 */
export interface RealTimeGraphRenderer {
  initializeGraph(graphId: string, name: string, layout?: string): string;
  addNode(
    graphId: string,
    node: Omit<GraphNode, 'createdAt' | 'updatedAt'>,
  ): GraphNode;
  addEdge(
    graphId: string,
    edge: Omit<GraphEdge, 'createdAt' | 'updatedAt'>,
  ): GraphEdge;
  updateNode(
    graphId: string,
    nodeId: string,
    updates: Partial<GraphNode>,
  ): GraphNode;
  updateEdge(
    graphId: string,
    edgeId: string,
    updates: Partial<GraphEdge>,
  ): GraphEdge;
  removeNode(graphId: string, nodeId: string): boolean;
  removeEdge(graphId: string, edgeId: string): boolean;
  getGraph(graphId: string): Graph;
  applyLayout(graphId: string, layoutType: string): boolean;
  subscribeToGraphUpdates(
    graphId: string,
    callback: (graph: Graph) => void,
  ): () => void;
}

/**
 * Interface for path highlighting
 */
export interface PathHighlighting {
  highlightNode(
    graphId: string,
    nodeId: string,
    highlightType?: string,
  ): boolean;
  highlightEdge(
    graphId: string,
    edgeId: string,
    highlightType?: string,
  ): boolean;
  highlightPath(
    graphId: string,
    nodeIds: string[],
    edgeIds: string[],
    highlightType?: string,
  ): boolean;
  clearHighlights(graphId: string): boolean;
  highlightActiveExecution(graphId: string, taskId: string): boolean;
  getHighlightedElements(graphId: string): {
    nodeIds: string[];
    edgeIds: string[];
  };
  subscribeToHighlightUpdates(
    graphId: string,
    callback: (highlights: { nodeIds: string[]; edgeIds: string[] }) => void,
  ): () => void;
}

/**
 * Interface for graph history tracking
 */
export interface GraphHistory {
  recordSnapshot(graphId: string, event?: string): string;
  getSnapshot(snapshotId: string): GraphHistorySnapshot;
  getSnapshotsByGraph(
    graphId: string,
    startTime?: Date,
    endTime?: Date,
  ): GraphHistorySnapshot[];
  getGraphStateAtTime(graphId: string, timestamp: Date): Graph;
  getGraphEvolution(
    graphId: string,
    startTime: Date,
    endTime: Date,
  ): GraphHistorySnapshot[];
  revertToSnapshot(graphId: string, snapshotId: string): boolean;
  compareSnapshots(
    snapshot1Id: string,
    snapshot2Id: string,
  ): {
    addedNodes: GraphNode[];
    removedNodes: GraphNode[];
    changedNodes: Array<{ before: GraphNode; after: GraphNode }>;
    addedEdges: GraphEdge[];
    removedEdges: GraphEdge[];
    changedEdges: Array<{ before: GraphEdge; after: GraphEdge }>;
  };
}

// Agent Reasoning Visualization Interfaces

/**
 * Interface for decision point capture
 */
export interface DecisionCapture {
  recordDecisionPoint(decision: Omit<DecisionPoint, 'id'>): string;
  getDecisionPoint(decisionId: string): DecisionPoint;
  getDecisionsByAgent(
    agentId: string,
    startTime?: Date,
    endTime?: Date,
  ): DecisionPoint[];
  getDecisionsByTask(taskId: string): DecisionPoint[];
  tagDecisionPoint(decisionId: string, tags: string[]): boolean;
  annotateDecisionPoint(decisionId: string, annotation: string): boolean;
  searchDecisionPoints(query: string): DecisionPoint[];
}

/**
 * Interface for reasoning path visualization
 */
export interface ReasoningPathVisualization {
  createReasoningPath(agentId: string, taskId?: string): string;
  addDecisionToPath(pathId: string, decisionId: string): boolean;
  getReasoningPath(pathId: string): ReasoningPath;
  getReasoningPathsByAgent(agentId: string): ReasoningPath[];
  visualizeReasoningPath(pathId: string): any; // Returns visualization data
  compareReasoningPaths(path1Id: string, path2Id: string): any; // Returns comparison data
  identifyKeyDecisionPoints(pathId: string): string[]; // Returns decision point IDs
}

/**
 * Interface for confidence visualization
 */
export interface ConfidenceVisualization {
  recordConfidenceLevel(
    agentId: string,
    pathId: string,
    confidence: number,
  ): boolean;
  getConfidenceHistory(
    agentId: string,
    pathId: string,
  ): { timestamp: Date; value: number }[];
  visualizeConfidenceOverTime(pathId: string): any; // Returns visualization data
  getConfidenceMetrics(agentId: string): {
    average: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    volatility: number;
  };
  compareConfidenceLevels(agentIds: string[]): any; // Returns comparison data
}

// Team Formation & Communication Display Interfaces

/**
 * Interface for agent relationship visualization
 */
export interface AgentRelationshipVisualization {
  recordRelationship(relationship: Omit<AgentRelationship, 'id'>): string;
  updateRelationship(
    relationshipId: string,
    updates: Partial<AgentRelationship>,
  ): boolean;
  getRelationship(relationshipId: string): AgentRelationship;
  getAgentRelationships(agentId: string): AgentRelationship[];
  visualizeTeamStructure(agentIds: string[]): any; // Returns visualization data
  identifyCentralAgents(agentIds: string[]): string[]; // Returns agent IDs
  calculateTeamCohesion(agentIds: string[]): number; // 0-1 scale
}

/**
 * Interface for communication flow visualization
 */
export interface CommunicationFlowVisualization {
  recordCommunication(communication: Omit<CommunicationEvent, 'id'>): string;
  getCommunication(communicationId: string): CommunicationEvent;
  getAgentCommunications(
    agentId: string,
    startTime?: Date,
    endTime?: Date,
  ): CommunicationEvent[];
  getTaskCommunications(taskId: string): CommunicationEvent[];
  visualizeCommunicationFlow(
    agentIds: string[],
    startTime?: Date,
    endTime?: Date,
  ): any; // Returns visualization data
  analyzeConversationThreads(agentIds: string[]): any; // Returns thread analysis
  identifyCommunicationBottlenecks(agentIds: string[]): any; // Returns bottleneck analysis
}

/**
 * Interface for expertise contribution visualization
 */
export interface ExpertiseContributionVisualization {
  recordContribution(contribution: Omit<ExpertiseContribution, 'id'>): string;
  getContribution(contributionId: string): ExpertiseContribution;
  getAgentContributions(agentId: string): ExpertiseContribution[];
  getTaskContributions(taskId: string): ExpertiseContribution[];
  visualizeExpertiseDistribution(taskId: string): any; // Returns visualization data
  identifyKeyContributors(taskId: string): string[]; // Returns agent IDs
  calculateContributionBalance(taskId: string): number; // 0-1 scale
}

// Interactive Workflow Inspector Interfaces

/**
 * Interface for interactive node exploration
 */
export interface InteractiveNodeExploration {
  createInteractiveView(graphId: string): string;
  focusOnNode(viewId: string, nodeId: string): boolean;
  expandNode(viewId: string, nodeId: string): string[]; // Returns related node IDs
  getNodeDetails(viewId: string, nodeId: string): Record<string, any>;
  navigateToRelatedNode(
    viewId: string,
    sourceNodeId: string,
    targetNodeId: string,
  ): boolean;
  createCustomFilter(
    viewId: string,
    filterCriteria: Record<string, any>,
  ): string;
  applyFilter(viewId: string, filterId: string): boolean;
}

/**
 * Interface for state inspection
 */
export interface StateInspection {
  captureNodeState(nodeId: string): string; // Returns state snapshot ID
  getNodeState(nodeId: string): Record<string, any>;
  compareNodeStates(
    nodeId: string,
    snapshot1Id: string,
    snapshot2Id: string,
  ): any; // Returns comparison
  watchNodeStateChanges(
    nodeId: string,
    callback: (state: Record<string, any>) => void,
  ): () => void;
  getTaskExecutionState(taskId: string): Record<string, any>;
  inspectDataFlow(sourceNodeId: string, targetNodeId: string): any; // Returns data flow info
}

/**
 * Interface for human intervention
 */
export interface HumanIntervention {
  createInterventionPoint(
    point: Omit<InterventionPoint, 'id' | 'createdAt'>,
  ): string;
  getInterventionPoint(pointId: string): InterventionPoint;
  getActiveInterventionPoints(): InterventionPoint[];
  completeIntervention(pointId: string, result: string): boolean;
  createApprovalRequest(
    nodeId: string,
    description: string,
    deadline?: Date,
  ): string;
  createModificationPoint(
    nodeId: string,
    description: string,
    allowedActions: string[],
  ): string;
  notifyHumanOperator(interventionId: string): boolean;
}
