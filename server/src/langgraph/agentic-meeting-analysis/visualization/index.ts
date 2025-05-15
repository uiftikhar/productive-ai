/**
 * @deprecated This file is deprecated and will be removed in a future release.
 * It imports from deprecated adaptive visualization components.
 * Please use the hierarchical visualization components instead.
 * See server/src/langgraph/HIERARCHICAL-ARCHITECTURE.md for more information.
 * 
 * Visualization Services for Agentic Meeting Analysis
 * 
 * This module exports both specialized meeting analysis visualization components
 * and core visualization services from the adaptive framework.
 */

/**
 * Visualization components for agentic meeting analysis
 */

// Team Visualization
export { TeamRosterVisualizationImpl } from './team/team-roster.service';
export { RoleDistributionVisualizationImpl } from './team/role-distribution.service';
export { TeamEvolutionVisualizationImpl } from './team/team-evolution.service';
export { AgentActivityVisualizationImpl } from './team/agent-activity.service';
export { SpecializationOverlapVisualizationImpl } from './team/specialization-overlap.service';

// Process Visualization
export { AnalysisTimelineVisualizationImpl } from './process/analysis-timeline.service';
export { InsightDiscoveryVisualizationImpl } from './process/insight-discovery.service';
export { FocusTransitionVisualizationImpl } from './process/focus-transition.service';

// Collaborative Dynamics
export { KnowledgeFlowVisualizationImpl } from './collaborative/knowledge-flow.service';
export { CollaborationPatternVisualizationImpl } from './collaborative/collaboration-pattern.service';
export { ConflictResolutionVisualizationImpl } from './collaborative/conflict-resolution.service';
export { ConsensusBuildingVisualizationImpl } from './collaborative/consensus-building.service';
// Content Visualization
export { TopicRelationshipVisualizationImpl } from './content/topic-relationship.service';
export { SpeakerParticipationVisualizationImpl } from './content/speaker-participation.service';
export { SentimentLandscapeVisualizationImpl } from './content/sentiment-landscape.service';
export { ActionNetworkVisualizationImpl } from './content/action-network.service';


// Core visualization services from adaptive framework
export {
  AgentVisualization,
  TeamVisualization,
  MeetingProcessVisualization,
  ContentVisualization,
  CollaborationVisualization,
  VisualizationGraph
} from '../interfaces/visualization.interface';

/**
 * This module provides comprehensive visualization capabilities by combining:
 * 
 * 1. Specialized visualization services for meeting analysis:
 *    - Process visualization (confidence evolution, exploration paths)
 *    - Collaborative dynamics (knowledge flow)
 *    - Content visualization (speaker participation, decision points)
 * 
 * 2. Core visualization services from the adaptive framework:
 *    - Agent reasoning visualization (confidence, decisions, reasoning paths)
 *    - Dynamic graph visualization (graph history, path highlighting, real-time rendering)
 *    - Interactive visualization (human intervention, interactive node exploration)
 *    
 * The specialized services are built on top of the core services to provide
 * domain-specific visualizations while leveraging the robust foundation of the
 * adaptive visualization framework.
 */

/**
 * Index file for visualization services
 * Part of Milestone 3.1: Enhanced Topic Extraction
 */

// Export topic visualization service
export * from './topic-visualization.service';

// Update the import path
import {
  AgentVisualization,
  TeamVisualization,
  MeetingProcessVisualization,
  ContentVisualization,
  CollaborationVisualization,
  VisualizationGraph
} from '../interfaces/visualization.interface'; 