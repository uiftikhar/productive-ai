/**
 * Confidence Evolution Visualization Service
 * 
 * Implements visualization of confidence changes over time during meeting analysis.
 * Leverages the core ConfidenceVisualization service from adaptive visualization.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  ConfidenceEvolutionVisualization,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';
import { ConfidenceVisualizationImpl } from '../../../adaptive/visualization/agent-reasoning/confidence-visualization.service';
import { ReasoningPathImpl } from '../../../adaptive/visualization/agent-reasoning/reasoning-path.service';
import { DecisionCaptureImpl } from '../../../adaptive/visualization/agent-reasoning/decision-capture.service';

/**
 * Configuration for the ConfidenceEvolutionVisualizationImpl
 */
export interface ConfidenceEvolutionVisualizationConfig {
  logger?: Logger;
  confidenceVisualizationService?: ConfidenceVisualizationImpl;
  reasoningPathService?: ReasoningPathImpl;
}

/**
 * Confidence update record for visualization
 */
interface ConfidenceUpdate {
  id: string;
  meetingId: string;
  timestamp: Date;
  entityId: string;
  entityType: string;
  confidence: number;
  agentId: string;
  reason?: string;
}

/**
 * Implementation of the ConfidenceEvolutionVisualization interface
 * Uses the core ConfidenceVisualization service for tracking confidence
 */
export class ConfidenceEvolutionVisualizationImpl implements ConfidenceEvolutionVisualization {
  private logger: Logger;
  private confidenceService: ConfidenceVisualizationImpl;
  private reasoningPathService: ReasoningPathImpl;
  private confidenceUpdates: Map<string, ConfidenceUpdate>;
  private meetingUpdates: Map<string, Set<string>>;
  private entityUpdates: Map<string, Set<string>>;
  private elements: Map<string, VisualizationElement>;
  private connections: Map<string, VisualizationConnection>;

  /**
   * Create a new confidence evolution visualization service
   */
  constructor(config: ConfidenceEvolutionVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    
    // Create decision capture service if not provided
    const decisionCapture = new DecisionCaptureImpl({ logger: this.logger });
    
    // Create reasoning path service if not provided
    const reasoningPathService = config.reasoningPathService || 
      new ReasoningPathImpl({ 
        logger: this.logger, 
        decisionCapture: decisionCapture 
      });
    
    this.reasoningPathService = reasoningPathService;
    
    // Create confidence service if not provided
    this.confidenceService = config.confidenceVisualizationService || 
      new ConfidenceVisualizationImpl({ 
        logger: this.logger, 
        reasoningPathService: this.reasoningPathService 
      });
    
    this.confidenceUpdates = new Map();
    this.meetingUpdates = new Map();
    this.entityUpdates = new Map();
    this.elements = new Map();
    this.connections = new Map();
    
    this.logger.info('ConfidenceEvolutionVisualizationImpl initialized, using core ConfidenceVisualization service');
  }

  /**
   * Record a confidence update
   */
  recordConfidenceUpdate(meetingId: string, update: {
    timestamp: Date;
    entityId: string;
    entityType: string;
    confidence: number;
    agentId: string;
    reason?: string;
  }): string {
    const updateId = `confidence-update-${uuidv4()}`;
    
    // Store the update
    const confidenceUpdate: ConfidenceUpdate = {
      id: updateId,
      meetingId,
      ...update
    };
    
    this.confidenceUpdates.set(updateId, confidenceUpdate);
    
    // Add to meeting index
    if (!this.meetingUpdates.has(meetingId)) {
      this.meetingUpdates.set(meetingId, new Set());
    }
    
    this.meetingUpdates.get(meetingId)?.add(updateId);
    
    // Add to entity index
    if (!this.entityUpdates.has(update.entityId)) {
      this.entityUpdates.set(update.entityId, new Set());
    }
    
    this.entityUpdates.get(update.entityId)?.add(updateId);
    
    // Create or update a reasoning path for this agent/entity
    let pathId: string;
    const pathKey = `path-${update.agentId}-${update.entityId}`;
    
    try {
      // Try to get existing path
      this.reasoningPathService.getReasoningPath(pathKey);
      pathId = pathKey;
    } catch (error) {
      // Create new path if it doesn't exist
      pathId = this.reasoningPathService.createReasoningPath(update.agentId, meetingId);
    }
    
    // Record confidence in the core service
    this.confidenceService.recordConfidenceLevel(
      update.agentId,
      pathId,
      update.confidence
    );
    
    // Create visualization element
    this.createConfidenceElement(updateId, confidenceUpdate);
    
    this.logger.info(`Recorded confidence update ${updateId} for entity ${update.entityId}`);
    
    return updateId;
  }

  /**
   * Visualize confidence evolution
   */
  visualizeConfidenceEvolution(meetingId: string, entityIds?: string[]): VisualizationGraph {
    // Get updates for this meeting
    const updateIds = this.meetingUpdates.get(meetingId) || new Set<string>();
    
    if (updateIds.size === 0) {
      this.logger.info(`No confidence updates found for meeting ${meetingId}`);
      return {
        id: `confidence-graph-${meetingId}`,
        name: `Confidence Evolution for Meeting ${meetingId}`,
        elements: [],
        connections: [],
        layout: 'timeline',
        timestamp: new Date(),
        version: 1
      };
    }
    
    // Filter by entity IDs if provided
    let filteredUpdateIds = Array.from(updateIds);
    
    if (entityIds && entityIds.length > 0) {
      filteredUpdateIds = filteredUpdateIds.filter(updateId => {
        const update = this.confidenceUpdates.get(updateId);
        return update && entityIds.includes(update.entityId);
      });
    }
    
    // Get updates
    const updates = filteredUpdateIds
      .map(id => this.confidenceUpdates.get(id))
      .filter(Boolean) as ConfidenceUpdate[];
    
    // Sort by timestamp
    updates.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Collect visualization elements and connections
    const visualElements: VisualizationElement[] = [];
    const visualConnections: VisualizationConnection[] = [];
    
    // Create timeline element
    const timelineElement: VisualizationElement = {
      id: 'timeline',
      type: VisualizationElementType.TRANSCRIPT_SEGMENT,
      label: 'Confidence Timeline',
      description: 'Timeline of confidence updates',
      properties: {},
      state: VisualizationElementState.ACTIVE,
      position: { x: 100, y: 50 },
      size: { width: 800, height: 10 },
      color: '#E0E0E0',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    visualElements.push(timelineElement);
    
    // Process updates
    const entityRows: Record<string, number> = {};
    let nextRow = 0;
    
    // Create elements for unique entities
    const uniqueEntityIds = Array.from(new Set(updates.map(u => u.entityId)));
    
    uniqueEntityIds.forEach(entityId => {
      entityRows[entityId] = nextRow++;
      
      // Create entity label
      const entityLabelElement: VisualizationElement = {
        id: `entity-label-${entityId}`,
        type: this.getElementTypeForEntityType(updates.find(u => u.entityId === entityId)?.entityType || 'unknown'),
        label: `Entity ${entityId}`,
        description: `Confidence for entity ${entityId}`,
        properties: {},
        state: VisualizationElementState.ACTIVE,
        position: { x: 50, y: 100 + entityRows[entityId] * 100 },
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          entityId
        }
      };
      
      visualElements.push(entityLabelElement);
    });
    
    // Calculate time range
    const startTime = updates[0].timestamp.getTime();
    const endTime = updates[updates.length - 1].timestamp.getTime();
    const totalDuration = endTime - startTime;
    const timelineWidth = 800;
    
    // Add elements for each update
    let prevUpdateByEntity: Record<string, string> = {};
    
    updates.forEach(update => {
      const xPosition = totalDuration > 0 ? 
        100 + ((update.timestamp.getTime() - startTime) / totalDuration) * timelineWidth : 
        100;
      
      const yPosition = 100 + entityRows[update.entityId] * 100;
      
      // Create element for the update
      const elementId = `element-${update.id}`;
      const element = this.elements.get(elementId);
      
      if (element) {
        // Update position
        element.position = { x: xPosition, y: yPosition };
        visualElements.push(element);
        
        // Connect to timeline
        visualConnections.push({
          id: `connection-timeline-${update.id}`,
          type: VisualizationConnectionType.RELATION,
          sourceId: 'timeline',
          targetId: elementId,
          label: '',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // Connect to previous update for this entity
        const prevUpdateId = prevUpdateByEntity[update.entityId];
        
        if (prevUpdateId) {
          visualConnections.push({
            id: `connection-${prevUpdateId}-${update.id}`,
            type: VisualizationConnectionType.DEPENDENCY,
            sourceId: `element-${prevUpdateId}`,
            targetId: elementId,
            label: '',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
        
        // Remember this update for next time
        prevUpdateByEntity[update.entityId] = update.id;
      }
    });
    
    return {
      id: `confidence-graph-${meetingId}`,
      name: `Confidence Evolution for Meeting ${meetingId}`,
      description: `Visualization of confidence changes over time for meeting ${meetingId}`,
      elements: visualElements,
      connections: visualConnections,
      layout: 'timeline',
      timestamp: new Date(),
      version: 1,
      metadata: {
        meetingId,
        entityCount: uniqueEntityIds.length,
        updateCount: updates.length,
        startTime: updates[0].timestamp,
        endTime: updates[updates.length - 1].timestamp
      }
    };
  }

  /**
   * Get confidence trend for an entity
   */
  getConfidenceTrend(entityId: string): Array<{ timestamp: Date; value: number }> {
    const updateIds = this.entityUpdates.get(entityId) || new Set<string>();
    
    if (updateIds.size === 0) {
      return [];
    }
    
    // Get updates for this entity
    const updates = Array.from(updateIds)
      .map(id => this.confidenceUpdates.get(id))
      .filter(Boolean) as ConfidenceUpdate[];
    
    // Sort by timestamp
    updates.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Map to trend format
    return updates.map(update => ({
      timestamp: update.timestamp,
      value: update.confidence
    }));
  }

  /**
   * Analyze confidence convergence
   */
  analyzeConfidenceConvergence(meetingId: string): {
    convergenceRate: number;
    finalConfidences: Record<string, number>;
    uncertaintyPeriods: Array<{ start: Date; end: Date; entityIds: string[] }>;
  } {
    const updateIds = this.meetingUpdates.get(meetingId) || new Set<string>();
    
    if (updateIds.size === 0) {
      return {
        convergenceRate: 0,
        finalConfidences: {},
        uncertaintyPeriods: []
      };
    }
    
    // Get updates for this meeting
    const updates = Array.from(updateIds)
      .map(id => this.confidenceUpdates.get(id))
      .filter(Boolean) as ConfidenceUpdate[];
    
    // Get trends by entity
    const uniqueEntityIds = Array.from(new Set(updates.map(u => u.entityId)));
    const trendsByEntity: Record<string, Array<{ timestamp: Date; value: number }>> = {};
    
    uniqueEntityIds.forEach(entityId => {
      trendsByEntity[entityId] = this.getConfidenceTrend(entityId);
    });
    
    // Calculate final confidences
    const finalConfidences: Record<string, number> = {};
    
    for (const entityId of uniqueEntityIds) {
      const trend = trendsByEntity[entityId];
      if (trend.length > 0) {
        finalConfidences[entityId] = trend[trend.length - 1].value;
      }
    }
    
    // Calculate convergence rate (how quickly confidence stabilized)
    let avgConvergenceRate = 0;
    let entitiesWithConvergence = 0;
    
    for (const entityId of uniqueEntityIds) {
      const trend = trendsByEntity[entityId];
      
      if (trend.length < 3) {
        continue; // Not enough data points
      }
      
      // Calculate average absolute change between consecutive updates
      let totalChange = 0;
      
      for (let i = 1; i < trend.length; i++) {
        totalChange += Math.abs(trend[i].value - trend[i-1].value);
      }
      
      const avgChange = totalChange / (trend.length - 1);
      
      // Lower average change means faster convergence
      const convergenceRate = Math.max(0, 1 - avgChange * 5); // Scale to 0-1
      
      avgConvergenceRate += convergenceRate;
      entitiesWithConvergence++;
    }
    
    if (entitiesWithConvergence > 0) {
      avgConvergenceRate /= entitiesWithConvergence;
    }
    
    // Identify uncertainty periods (periods of low or rapidly changing confidence)
    const uncertaintyPeriods: Array<{ start: Date; end: Date; entityIds: string[] }> = [];
    const uncertaintyThreshold = 0.5; // Confidence below this is uncertain
    
    for (const entityId of uniqueEntityIds) {
      const trend = trendsByEntity[entityId];
      
      if (trend.length < 2) {
        continue;
      }
      
      let inUncertaintyPeriod = false;
      let periodStart: Date | null = null;
      
      for (let i = 0; i < trend.length; i++) {
        const point = trend[i];
        
        if (point.value < uncertaintyThreshold) {
          if (!inUncertaintyPeriod) {
            inUncertaintyPeriod = true;
            periodStart = point.timestamp;
          }
        } else {
          if (inUncertaintyPeriod && periodStart) {
            // End of uncertainty period
            uncertaintyPeriods.push({
              start: periodStart,
              end: point.timestamp,
              entityIds: [entityId]
            });
            
            inUncertaintyPeriod = false;
            periodStart = null;
          }
        }
      }
      
      // If still in uncertainty at the end
      if (inUncertaintyPeriod && periodStart && trend.length > 0) {
        uncertaintyPeriods.push({
          start: periodStart,
          end: trend[trend.length - 1].timestamp,
          entityIds: [entityId]
        });
      }
    }
    
    // Merge overlapping uncertainty periods
    uncertaintyPeriods.sort((a, b) => a.start.getTime() - b.start.getTime());
    
    for (let i = 0; i < uncertaintyPeriods.length - 1; i++) {
      const current = uncertaintyPeriods[i];
      const next = uncertaintyPeriods[i + 1];
      
      if (current.end >= next.start) {
        // Periods overlap, merge them
        current.end = new Date(Math.max(current.end.getTime(), next.end.getTime()));
        current.entityIds = [...new Set([...current.entityIds, ...next.entityIds])];
        
        // Remove the merged period
        uncertaintyPeriods.splice(i + 1, 1);
        i--; // Recheck the current period
      }
    }
    
    return {
      convergenceRate: avgConvergenceRate,
      finalConfidences,
      uncertaintyPeriods
    };
  }

  /**
   * Helper: Create visualization element for a confidence update
   */
  private createConfidenceElement(updateId: string, update: ConfidenceUpdate): void {
    const elementId = `element-${updateId}`;
    
    const element: VisualizationElement = {
      id: elementId,
      type: VisualizationElementType.SENTIMENT,
      label: `Confidence: ${(update.confidence * 100).toFixed(0)}%`,
      description: update.reason || `Confidence update for ${update.entityId}`,
      properties: {
        timestamp: update.timestamp,
        entityId: update.entityId,
        entityType: update.entityType,
        confidence: update.confidence,
        agentId: update.agentId,
        reason: update.reason
      },
      state: VisualizationElementState.ACTIVE,
      size: {
        width: 40,
        height: 40
      },
      color: this.getColorForConfidence(update.confidence),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        updateId
      }
    };
    
    this.elements.set(elementId, element);
  }

  /**
   * Helper: Map entity type to visualization element type
   */
  private getElementTypeForEntityType(entityType: string): VisualizationElementType {
    const typeMap: Record<string, VisualizationElementType> = {
      'topic': VisualizationElementType.TOPIC,
      'decision': VisualizationElementType.DECISION,
      'action': VisualizationElementType.ACTION_ITEM,
      'participant': VisualizationElementType.PARTICIPANT,
      'insight': VisualizationElementType.INSIGHT
    };
    
    return typeMap[entityType] || VisualizationElementType.SENTIMENT;
  }

  /**
   * Helper: Get color based on confidence value
   */
  private getColorForConfidence(confidence: number): string {
    if (confidence < 0.3) {
      return '#F44336'; // Red - low confidence
    } else if (confidence < 0.7) {
      return '#FFC107'; // Amber - medium confidence
    } else {
      return '#4CAF50'; // Green - high confidence
    }
  }
} 