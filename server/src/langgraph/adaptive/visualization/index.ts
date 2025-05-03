/**
 * Visualization Services - Milestone 4
 * 
 * This module exports all visualization services for the Emergent Workflow Visualization
 * system. These services provide capabilities for visualizing workflows, agent reasoning,
 * team dynamics, and interactive workflow inspection.
 */

// Dynamic Graph Visualization
export { RealTimeGraphRendererImpl } from './dynamic-graph/real-time-graph-renderer.service';
export { PathHighlightingImpl } from './dynamic-graph/path-highlighting.service';
export { GraphHistoryImpl } from './dynamic-graph/graph-history.service';

// Agent Reasoning Visualization
export { DecisionCaptureImpl } from './agent-reasoning/decision-capture.service';
export { ReasoningPathImpl } from './agent-reasoning/reasoning-path.service';
export { ConfidenceVisualizationImpl } from './agent-reasoning/confidence-visualization.service';

// Team Formation Visualization
export { AgentRelationshipVisualizationImpl } from './team-formation/agent-relationship.service';
export { CommunicationFlowVisualizationImpl } from './team-formation/communication-flow.service';
export { ExpertiseContributionVisualizationImpl } from './team-formation/expertise-contribution.service';

// Interactive Workflow Inspector
export { InteractiveNodeExplorationImpl } from './interactive/interactive-node.service';
export { HumanInterventionImpl } from './interactive/human-intervention.service';
export { StateInspectionImpl } from './interactive/state-inspection.service';

// Re-export interfaces
export {
  // Graph types and structures
  GraphNodeType,
  GraphEdgeType,
  GraphNodeState,
  GraphNode,
  GraphEdge,
  Graph,
  
  // Visualization service interfaces
  RealTimeGraphRenderer,
  PathHighlighting,
  GraphHistory,
  DecisionCapture,
  ReasoningPathVisualization,
  ConfidenceVisualization,
  AgentRelationshipVisualization,
  CommunicationFlowVisualization,
  ExpertiseContributionVisualization,
  InteractiveNodeExploration,
  StateInspection,
  HumanIntervention,
  
  // Data structures
  DecisionPoint,
  ReasoningPath,
  AgentRelationship,
  CommunicationEvent,
  ExpertiseContribution,
  InterventionPoint,
  GraphHistorySnapshot
} from '../interfaces/visualization.interface'; 