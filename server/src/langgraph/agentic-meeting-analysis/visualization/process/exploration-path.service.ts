/**
 * Exploration Path Visualization Service
 * 
 * Implements visualization of agent exploration paths during meeting analysis.
 * Shows how agents navigate through information and make decisions.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  ExplorationPathVisualization,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';
import { GraphHistoryImpl } from '../../../adaptive/visualization/dynamic-graph/graph-history.service';
import { RealTimeGraphRendererImpl } from '../../../adaptive/visualization/dynamic-graph/real-time-graph-renderer.service';
import { GraphNodeType, GraphNodeState, GraphEdgeType } from '../../../adaptive/interfaces/visualization.interface';

/**
 * Configuration for the ExplorationPathVisualizationImpl
 */
export interface ExplorationPathVisualizationConfig {
  logger?: Logger;
  graphRenderer?: RealTimeGraphRendererImpl;
  graphHistory?: GraphHistoryImpl;
}

/**
 * Exploration step record for visualization
 */
interface ExplorationStep {
  id: string;
  meetingId: string;
  timestamp: Date;
  agentId: string;
  entityId: string;
  entityType: string;
  explorationAction: string;
  result: string;
  nextStepOptions: string[];
  selectedNextStep?: string;
}

/**
 * Implementation of the ExplorationPathVisualization interface
 */
export class ExplorationPathVisualizationImpl implements ExplorationPathVisualization {
  private logger: Logger;
  private graphRenderer: RealTimeGraphRendererImpl;
  private graphHistory?: GraphHistoryImpl;
  private steps: Map<string, ExplorationStep>;
  private meetingSteps: Map<string, Set<string>>;
  private agentSteps: Map<string, Set<string>>;
  private entitySteps: Map<string, Set<string>>;
  private explorationGraphs: Map<string, string>; // meetingId -> graphId

  /**
   * Create a new exploration path visualization service
   */
  constructor(config: ExplorationPathVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    
    // Create or use provided graph renderer
    this.graphRenderer = config.graphRenderer || new RealTimeGraphRendererImpl({ logger: this.logger });
    
    // Use graph history if provided
    this.graphHistory = config.graphHistory;
    
    this.steps = new Map();
    this.meetingSteps = new Map();
    this.agentSteps = new Map();
    this.entitySteps = new Map();
    this.explorationGraphs = new Map();
    
    this.logger.info('ExplorationPathVisualizationImpl initialized');
  }

  /**
   * Record an exploration step for a meeting
   */
  recordExplorationStep(meetingId: string, step: {
    timestamp: Date;
    agentId: string;
    entityId: string;
    entityType: string;
    explorationAction: string;
    result: string;
    nextStepOptions: string[];
    selectedNextStep?: string;
  }): string {
    const stepId = `exploration-step-${uuidv4()}`;
    
    // Store the step
    const explorationStep: ExplorationStep = {
      id: stepId,
      meetingId,
      ...step
    };
    
    this.steps.set(stepId, explorationStep);
    
    // Add to indices
    this.addToIndex(this.meetingSteps, meetingId, stepId);
    this.addToIndex(this.agentSteps, step.agentId, stepId);
    this.addToIndex(this.entitySteps, step.entityId, stepId);
    
    // Update graph visualization
    this.updateExplorationGraph(meetingId, stepId, explorationStep);
    
    this.logger.info(`Recorded exploration step ${stepId} for agent ${step.agentId}`);
    
    return stepId;
  }

  /**
   * Visualize exploration paths for a meeting
   */
  visualizeExplorationPaths(meetingId: string): VisualizationGraph {
    // Get or create graph for this meeting
    const graphId = this.getOrCreateGraph(meetingId);
    
    // Return the current graph state
    try {
      const graph = this.graphRenderer.getGraph(graphId);
      
      return {
        id: graph.id,
        name: `Exploration Paths for Meeting ${meetingId}`,
        description: `Visualization of agent exploration paths for meeting ${meetingId}`,
        elements: graph.nodes.map(node => ({
          id: node.id,
          type: this.mapNodeTypeToElementType(node.type),
          label: node.label,
          description: node.properties.description || '',
          properties: node.properties || {},
          state: this.mapNodeStateToElementState(node.state),
          position: node.position,
          size: node.size,
          color: node.color,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          metadata: node.metadata
        })),
        connections: graph.edges.map(edge => ({
          id: edge.id,
          type: this.mapEdgeTypeToConnectionType(edge.type),
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          label: edge.label || '',
          properties: edge.properties || {},
          state: edge.state,
          strength: edge.weight || 0.5, // Map weight to strength
          animated: edge.animated,
          createdAt: edge.createdAt,
          updatedAt: edge.updatedAt,
          metadata: edge.metadata
        })),
        layout: graph.layout,
        timestamp: graph.timestamp,
        version: graph.version,
        metadata: {
          meetingId,
          agentCount: this.getAgentCount(meetingId),
          stepCount: this.getStepCount(meetingId)
        }
      };
    } catch (error) {
      this.logger.error(`Error visualizing exploration paths for meeting ${meetingId}:`, { error });
      
      return {
        id: `exploration-graph-${meetingId}`,
        name: `Exploration Paths for Meeting ${meetingId}`,
        elements: [],
        connections: [],
        layout: 'force-directed',
        timestamp: new Date(),
        version: 1
      };
    }
  }

  /**
   * Compare agent exploration strategies
   */
  compareAgentExplorationStrategies(meetingId: string, agentIds: string[]): {
    explorationCounts: Record<string, number>;
    actionDistribution: Record<string, Record<string, number>>;
    pathDiversity: Record<string, number>;
    effectivenessScores: Record<string, number>;
  } {
    // Validate input
    if (!agentIds || agentIds.length === 0) {
      this.logger.warn('No agents specified for comparison');
      return {
        explorationCounts: {},
        actionDistribution: {},
        pathDiversity: {},
        effectivenessScores: {}
      };
    }
    
    const results = {
      explorationCounts: {} as Record<string, number>,
      actionDistribution: {} as Record<string, Record<string, number>>,
      pathDiversity: {} as Record<string, number>,
      effectivenessScores: {} as Record<string, number>
    };
    
    // Get steps for each agent
    for (const agentId of agentIds) {
      const stepIds = this.agentSteps.get(agentId) || new Set<string>();
      
      // Filter steps for this meeting
      const meetingStepIds = this.meetingSteps.get(meetingId) || new Set<string>();
      const filteredStepIds = Array.from(stepIds).filter(id => meetingStepIds.has(id));
      
      // Count steps
      results.explorationCounts[agentId] = filteredStepIds.length;
      
      // Calculate action distribution
      results.actionDistribution[agentId] = {};
      
      for (const stepId of filteredStepIds) {
        const step = this.steps.get(stepId);
        
        if (step) {
          const action = step.explorationAction;
          results.actionDistribution[agentId][action] = 
            (results.actionDistribution[agentId][action] || 0) + 1;
        }
      }
      
      // Calculate path diversity (number of unique entities explored)
      const uniqueEntities = new Set<string>();
      
      for (const stepId of filteredStepIds) {
        const step = this.steps.get(stepId);
        if (step) {
          uniqueEntities.add(step.entityId);
        }
      }
      
      // Normalize diversity to 0-1 scale
      const totalSteps = filteredStepIds.length;
      results.pathDiversity[agentId] = totalSteps > 0 ? 
        Math.min(1, uniqueEntities.size / totalSteps) : 0;
      
      // Calculate effectiveness (simple metric based on results)
      let effectivenessSum = 0;
      
      for (const stepId of filteredStepIds) {
        const step = this.steps.get(stepId);
        
        if (step && step.result) {
          // Simple heuristic: longer results are considered more effective
          // This is a placeholder - in a real system, you'd have a better metric
          const resultLength = step.result.length;
          effectivenessSum += Math.min(1, resultLength / 100);
        }
      }
      
      results.effectivenessScores[agentId] = totalSteps > 0 ? 
        effectivenessSum / totalSteps : 0;
    }
    
    return results;
  }

  /**
   * Identify efficient exploration paths
   */
  identifyEfficientPaths(meetingId: string): {
    pathSegments: string[][]; // sequences of entity IDs
    efficiency: number; // 0-1 scale
    insights: string[];
  }[] {
    const stepIds = this.meetingSteps.get(meetingId) || new Set<string>();
    
    if (stepIds.size === 0) {
      return [];
    }
    
    // Get steps
    const steps = Array.from(stepIds)
      .map(id => this.steps.get(id))
      .filter(Boolean) as ExplorationStep[];
    
    // Sort by timestamp
    steps.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Group steps by agent
    const stepsByAgent: Record<string, ExplorationStep[]> = {};
    
    for (const step of steps) {
      if (!stepsByAgent[step.agentId]) {
        stepsByAgent[step.agentId] = [];
      }
      
      stepsByAgent[step.agentId].push(step);
    }
    
    // Identify path segments
    const efficientPaths: {
      pathSegments: string[][]; // sequences of entity IDs
      efficiency: number; // 0-1 scale
      insights: string[];
    }[] = [];
    
    for (const [agentId, agentSteps] of Object.entries(stepsByAgent)) {
      // Skip if too few steps
      if (agentSteps.length < 3) {
        continue;
      }
      
      // Build path segments (sequences of at least 3 steps)
      let currentSegment: string[] = [];
      let segmentInsights: string[] = [];
      
      for (let i = 0; i < agentSteps.length; i++) {
        const step = agentSteps[i];
        
        // Add to current segment
        currentSegment.push(step.entityId);
        
        // Collect insights from step results
        if (step.result && step.result.length > 0) {
          segmentInsights.push(step.result);
        }
        
        // Check if we should close this segment
        const isLastStep = i === agentSteps.length - 1;
        const hasSelectedNextStep = step.selectedNextStep !== undefined;
        
        if (isLastStep || !hasSelectedNextStep) {
          // End of segment
          if (currentSegment.length >= 3) {
            // Calculate segment efficiency
            const efficiency = this.calculatePathEfficiency(currentSegment, agentSteps);
            
            efficientPaths.push({
              pathSegments: [currentSegment],
              efficiency,
              insights: segmentInsights
            });
          }
          
          // Reset for next segment
          currentSegment = [];
          segmentInsights = [];
        }
      }
    }
    
    // Sort by efficiency (highest first)
    efficientPaths.sort((a, b) => b.efficiency - a.efficiency);
    
    // Return top paths
    return efficientPaths.slice(0, 5);
  }

  /**
   * Detect exploration bottlenecks
   */
  detectExplorationBottlenecks(meetingId: string): {
    entityId: string;
    bottleneckType: string;
    severity: number; // 0-1 scale
    recommendations: string[];
  }[] {
    const stepIds = this.meetingSteps.get(meetingId) || new Set<string>();
    
    if (stepIds.size === 0) {
      return [];
    }
    
    // Get steps
    const steps = Array.from(stepIds)
      .map(id => this.steps.get(id))
      .filter(Boolean) as ExplorationStep[];
    
    // Count visits to each entity
    const entityVisits: Record<string, number> = {};
    const entityTime: Record<string, number> = {}; // Total time spent on entity
    const entityActions: Record<string, string[]> = {}; // Actions performed on entity
    
    let prevStep: ExplorationStep | null = null;
    
    for (const step of steps) {
      entityVisits[step.entityId] = (entityVisits[step.entityId] || 0) + 1;
      
      if (!entityActions[step.entityId]) {
        entityActions[step.entityId] = [];
      }
      
      entityActions[step.entityId].push(step.explorationAction);
      
      // Calculate time spent (difference between this step and previous step)
      if (prevStep) {
        const timeDiff = step.timestamp.getTime() - prevStep.timestamp.getTime();
        entityTime[prevStep.entityId] = (entityTime[prevStep.entityId] || 0) + timeDiff;
      }
      
      prevStep = step;
    }
    
    // Identify bottlenecks
    const bottlenecks: {
      entityId: string;
      bottleneckType: string;
      severity: number;
      recommendations: string[];
    }[] = [];
    
    // Calculate median visits and time
    const visitValues = Object.values(entityVisits);
    const timeValues = Object.values(entityTime);
    
    const medianVisits = this.calculateMedian(visitValues);
    const medianTime = this.calculateMedian(timeValues);
    
    // Check for high-visit bottlenecks
    for (const [entityId, visits] of Object.entries(entityVisits)) {
      if (visits > medianVisits * 2) {
        // High visit count indicates a bottleneck
        const severity = Math.min(1, (visits - medianVisits) / medianVisits);
        
        bottlenecks.push({
          entityId,
          bottleneckType: 'high_revisit',
          severity,
          recommendations: [
            'Improve information structure',
            'Provide clearer navigation options',
            'Reduce required revisits through better context retention'
          ]
        });
      }
    }
    
    // Check for time-sink bottlenecks
    for (const [entityId, time] of Object.entries(entityTime)) {
      if (time > medianTime * 2) {
        // High time spent indicates a bottleneck
        const severity = Math.min(1, (time - medianTime) / medianTime);
        
        bottlenecks.push({
          entityId,
          bottleneckType: 'time_sink',
          severity,
          recommendations: [
            'Simplify information processing',
            'Break complex content into smaller pieces',
            'Provide summarization or abstractions'
          ]
        });
      }
    }
    
    // Check for action diversity bottlenecks
    for (const [entityId, actions] of Object.entries(entityActions)) {
      const uniqueActions = new Set(actions);
      
      if (actions.length > 3 && uniqueActions.size === 1) {
        // Repeated same action many times
        bottlenecks.push({
          entityId,
          bottleneckType: 'repetitive_action',
          severity: Math.min(1, actions.length / 10),
          recommendations: [
            'Improve action feedback',
            'Provide alternative methods',
            'Enhance system response to repeated actions'
          ]
        });
      }
    }
    
    // Sort by severity (highest first)
    bottlenecks.sort((a, b) => b.severity - a.severity);
    
    return bottlenecks;
  }

  /**
   * Helper: Add an item to a map of sets
   */
  private addToIndex(index: Map<string, Set<string>>, key: string, value: string): void {
    if (!index.has(key)) {
      index.set(key, new Set());
    }
    
    index.get(key)?.add(value);
  }

  /**
   * Helper: Get or create graph for a meeting
   */
  private getOrCreateGraph(meetingId: string): string {
    if (this.explorationGraphs.has(meetingId)) {
      return this.explorationGraphs.get(meetingId)!;
    }
    
    // Create a new graph
    const graphId = this.graphRenderer.initializeGraph(
      `exploration-graph-${meetingId}`,
      `Exploration Paths for Meeting ${meetingId}`,
      'force-directed'
    );
    
    this.explorationGraphs.set(meetingId, graphId);
    return graphId;
  }

  /**
   * Helper: Update exploration graph with a new step
   */
  private updateExplorationGraph(meetingId: string, stepId: string, step: ExplorationStep): void {
    const graphId = this.getOrCreateGraph(meetingId);
    
    try {
      // Create a node for the current entity if it doesn't exist
      const entityNodeId = `entity-${step.entityId}`;
      const graph = this.graphRenderer.getGraph(graphId);
      
      if (!graph.nodes.some(node => node.id === entityNodeId)) {
        // Add entity node
        this.graphRenderer.addNode(graphId, {
          id: entityNodeId,
          label: `${step.entityType}: ${step.entityId.split('-').pop()}`,
          type: GraphNodeType.DATA,
          properties: {
            entityId: step.entityId,
            entityType: step.entityType,
            description: `${step.entityType} entity`
          },
          state: GraphNodeState.ACTIVE,
          color: this.getColorForEntityType(step.entityType)
        });
      }
      
      // Create a node for the step
      const stepNodeId = `step-${stepId}`;
      
      this.graphRenderer.addNode(graphId, {
        id: stepNodeId,
        label: step.explorationAction,
        type: GraphNodeType.EVENT,
        properties: {
          timestamp: step.timestamp,
          agentId: step.agentId,
          action: step.explorationAction,
          result: step.result,
          nextOptions: step.nextStepOptions,
          description: step.result
        },
        state: GraphNodeState.ACTIVE,
        color: this.getColorForAction(step.explorationAction)
      });
      
      // Connect step to entity
      this.graphRenderer.addEdge(graphId, {
        sourceId: stepNodeId,
        targetId: entityNodeId,
        type: GraphEdgeType.INTERACTION,
        label: step.explorationAction,
        id: `edge-${stepId}-to-${step.entityId}`,
        properties: {
          timestamp: step.timestamp,
          agentId: step.agentId
        }
      });
      
      // Connect to previous step by this agent if it exists
      const agentStepIds = this.agentSteps.get(step.agentId) || new Set<string>();
      
      // Find the most recent step by this agent before the current one
      let previousStepId: string | null = null;
      let previousStepTime = 0;
      
      for (const sid of agentStepIds) {
        if (sid === stepId) continue;
        
        const s = this.steps.get(sid);
        
        if (s && s.timestamp.getTime() < step.timestamp.getTime() &&
            s.timestamp.getTime() > previousStepTime) {
          previousStepId = sid;
          previousStepTime = s.timestamp.getTime();
        }
      }
      
      if (previousStepId) {
        const prevStep = this.steps.get(previousStepId);
        
        if (prevStep) {
          // Connect previous step to current step
          this.graphRenderer.addEdge(graphId, {
            sourceId: `step-${previousStepId}`,
            targetId: stepNodeId,
            type: GraphEdgeType.EXECUTION_FLOW,
            label: 'Next',
            id: `edge-${previousStepId}-to-${stepId}`,
            properties: {
              timeDiff: step.timestamp.getTime() - prevStep.timestamp.getTime()
            }
          });
        }
      }
      
      // Take a snapshot if we have history service
      if (this.graphHistory) {
        this.graphHistory.recordSnapshot(graphId, `Added step ${stepId}`);
      }
    } catch (error) {
      this.logger.error(`Error updating exploration graph for meeting ${meetingId}:`, { error });
    }
  }

  /**
   * Helper: Calculate path efficiency
   */
  private calculatePathEfficiency(entityIds: string[], steps: ExplorationStep[]): number {
    // Simple efficiency metric based on:
    // - Ratio of unique entities to total visits
    // - Whether the path produced results
    // - Time efficiency
    
    const uniqueEntities = new Set(entityIds);
    const uniqueRatio = uniqueEntities.size / entityIds.length;
    
    // Count results
    let resultCount = 0;
    
    for (const step of steps) {
      if (entityIds.includes(step.entityId) && step.result && step.result.length > 0) {
        resultCount++;
      }
    }
    
    const resultRatio = steps.length > 0 ? resultCount / steps.length : 0;
    
    // Calculate time efficiency (if we have enough steps)
    let timeEfficiency = 0.5; // Default medium efficiency
    
    if (steps.length >= 2) {
      // Sort by timestamp
      const sortedSteps = [...steps].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Calculate average time between steps
      let totalTime = 0;
      
      for (let i = 1; i < sortedSteps.length; i++) {
        totalTime += sortedSteps[i].timestamp.getTime() - sortedSteps[i-1].timestamp.getTime();
      }
      
      const avgTime = totalTime / (sortedSteps.length - 1);
      
      // Lower times are more efficient
      // Scale inversely: 60000ms (1 minute) -> 0.5 efficiency
      timeEfficiency = Math.max(0, Math.min(1, 1 - (avgTime / 120000)));
    }
    
    // Combine factors (weighted average)
    return (uniqueRatio * 0.4) + (resultRatio * 0.4) + (timeEfficiency * 0.2);
  }

  /**
   * Helper: Map node type to element type
   */
  private mapNodeTypeToElementType(nodeType: GraphNodeType): VisualizationElementType {
    const typeMap: Record<string, VisualizationElementType> = {
      [GraphNodeType.AGENT]: VisualizationElementType.AGENT,
      [GraphNodeType.TASK]: VisualizationElementType.TOPIC,
      [GraphNodeType.DECISION_POINT]: VisualizationElementType.DECISION,
      [GraphNodeType.RESOURCE]: VisualizationElementType.ACTION_ITEM,
      [GraphNodeType.DATA]: VisualizationElementType.TRANSCRIPT_SEGMENT,
      [GraphNodeType.INTERACTION]: VisualizationElementType.PARTICIPANT,
      [GraphNodeType.EVENT]: VisualizationElementType.INSIGHT,
      [GraphNodeType.BARRIER]: VisualizationElementType.SENTIMENT
    };
    
    return typeMap[nodeType] || VisualizationElementType.INSIGHT;
  }

  /**
   * Helper: Map node state to element state
   */
  private mapNodeStateToElementState(nodeState: GraphNodeState): VisualizationElementState {
    const stateMap: Record<string, VisualizationElementState> = {
      [GraphNodeState.ACTIVE]: VisualizationElementState.ACTIVE,
      [GraphNodeState.INACTIVE]: VisualizationElementState.INACTIVE,
      [GraphNodeState.HIGHLIGHTED]: VisualizationElementState.HIGHLIGHTED,
      [GraphNodeState.SELECTED]: VisualizationElementState.SELECTED,
      [GraphNodeState.COMPLETED]: VisualizationElementState.ACTIVE,
      [GraphNodeState.ERROR]: VisualizationElementState.ERROR,
      [GraphNodeState.WARNING]: VisualizationElementState.WARNING
    };
    
    return stateMap[nodeState] || VisualizationElementState.ACTIVE;
  }

  /**
   * Helper: Map edge type to connection type
   */
  private mapEdgeTypeToConnectionType(edgeType: GraphEdgeType): VisualizationConnectionType {
    const typeMap: Record<string, VisualizationConnectionType> = {
      [GraphEdgeType.INTERACTION]: VisualizationConnectionType.RELATION,
      [GraphEdgeType.EXECUTION_FLOW]: VisualizationConnectionType.DEPENDENCY,
      [GraphEdgeType.COMMUNICATION]: VisualizationConnectionType.COMMUNICATION,
      [GraphEdgeType.DATA_FLOW]: VisualizationConnectionType.REFERENCE,
      [GraphEdgeType.CONTRIBUTION]: VisualizationConnectionType.COLLABORATION,
      [GraphEdgeType.ASSIGNMENT]: VisualizationConnectionType.ASSIGNMENT,
      [GraphEdgeType.DEPENDENCY]: VisualizationConnectionType.DEPENDENCY
    };
    
    return typeMap[edgeType] || VisualizationConnectionType.RELATION;
  }

  /**
   * Helper: Get color for entity type
   */
  private getColorForEntityType(entityType: string): string {
    const colorMap: Record<string, string> = {
      'topic': '#4CAF50', // green
      'decision': '#FF5722', // deep orange
      'action': '#2196F3', // blue
      'participant': '#9C27B0', // purple
      'transcript': '#795548', // brown
      'insight': '#FFC107' // amber
    };
    
    return colorMap[entityType] || '#607D8B'; // blue gray default
  }

  /**
   * Helper: Get color for action
   */
  private getColorForAction(action: string): string {
    const colorMap: Record<string, string> = {
      'explore': '#2196F3', // blue
      'analyze': '#9C27B0', // purple
      'summarize': '#4CAF50', // green
      'connect': '#FF5722', // deep orange
      'question': '#FFC107', // amber
      'validate': '#607D8B' // blue gray
    };
    
    // Check if action contains any of the keys
    for (const [key, color] of Object.entries(colorMap)) {
      if (action.toLowerCase().includes(key)) {
        return color;
      }
    }
    
    return '#9E9E9E'; // gray default
  }

  /**
   * Helper: Get the number of agents for a meeting
   */
  private getAgentCount(meetingId: string): number {
    const stepIds = this.meetingSteps.get(meetingId) || new Set<string>();
    
    if (stepIds.size === 0) {
      return 0;
    }
    
    // Count unique agents
    const agents = new Set<string>();
    
    for (const stepId of stepIds) {
      const step = this.steps.get(stepId);
      
      if (step) {
        agents.add(step.agentId);
      }
    }
    
    return agents.size;
  }

  /**
   * Helper: Get the number of steps for a meeting
   */
  private getStepCount(meetingId: string): number {
    const stepIds = this.meetingSteps.get(meetingId) || new Set<string>();
    return stepIds.size;
  }

  /**
   * Helper: Calculate median of a number array
   */
  private calculateMedian(values: number[]): number {
    if (values.length === 0) {
      return 0;
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  }
} 