/**
 * Visualization Services - Milestone 4
 *
 * This module exports all visualization services for the Emergent Workflow Visualization
 * system. These services provide capabilities for visualizing workflows, agent reasoning,
 * team dynamics, and interactive workflow inspection.
 */


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
  GraphHistorySnapshot,
} from '../interfaces/visualization.interface';
