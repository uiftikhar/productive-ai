/**
 * Decision Point Visualization Service
 * 
 * Implements visualization of decision points identified in meeting analysis.
 * Leverages the core DecisionCapture service from adaptive visualization.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  DecisionPointVisualization,
  DecisionPoint,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';
import { DecisionCaptureImpl } from '../../../adaptive/visualization/agent-reasoning/decision-capture.service';

/**
 * Configuration for the DecisionPointVisualizationImpl
 */
export interface DecisionPointVisualizationConfig {
  logger?: Logger;
  decisionCaptureService?: DecisionCaptureImpl;
}

/**
 * Decision-entity relationship for visualization
 */
interface DecisionEntityRelationship {
  id: string;
  decisionId: string;
  entityId: string;
  entityType: string;
  relationshipType: string;
}

/**
 * Implementation of the DecisionPointVisualization interface
 * Uses the core DecisionCapture service for storing and managing decisions
 */
export class DecisionPointVisualizationImpl implements DecisionPointVisualization {
  private logger: Logger;
  private decisionCapture: DecisionCaptureImpl;
  private relationships: Map<string, DecisionEntityRelationship>;
  private meetingDecisions: Map<string, Set<string>>;
  private elements: Map<string, VisualizationElement>;
  private connections: Map<string, VisualizationConnection>;

  /**
   * Create a new decision point visualization service
   */
  constructor(config: DecisionPointVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.decisionCapture = config.decisionCaptureService || new DecisionCaptureImpl({ logger: this.logger });
    this.relationships = new Map();
    this.meetingDecisions = new Map();
    this.elements = new Map();
    this.connections = new Map();
    this.logger.info('DecisionPointVisualizationImpl initialized, using core DecisionCapture service');
  }

  /**
   * Record a decision point
   */
  recordDecision(decision: Omit<DecisionPoint, 'id'>): string {
    // Convert to the core decision format - we need to adapt from the meeting-analysis DecisionPoint
    // to the adaptive framework DecisionPoint format
    const coreDecision = {
      agentId: decision.decisionMakers.join(','),
      timestamp: decision.timestamp,
      taskId: this.extractMeetingId(decision.topicId || ''),
      reasoning: decision.rationale || '',
      options: decision.alternatives.map(alt => ({
        id: uuidv4(), // Generate IDs for the options
        description: alt.description,
        pros: alt.pros || [],
        cons: alt.cons || [],
        selected: alt.selected || false,
        confidence: decision.confidence || 0.5 // Use the decision-level confidence for all options
      })),
      result: decision.description,
      context: {}, // Required by the adaptive framework's DecisionPoint interface
      metadata: {
        topicId: decision.topicId,
        actionItemIds: decision.actionItemIds,
        original: {
          type: 'meeting-analysis-decision',
          decisionMakers: decision.decisionMakers
        }
      }
    };

    // Use the core service to record the decision
    const decisionId = this.decisionCapture.recordDecisionPoint(coreDecision);

    // Add to meeting index
    const meetingId = this.extractMeetingId(decisionId);
    
    if (!this.meetingDecisions.has(meetingId)) {
      this.meetingDecisions.set(meetingId, new Set());
    }
    
    this.meetingDecisions.get(meetingId)?.add(decisionId);
    
    // Create visualization element
    this.createDecisionElement(decisionId, this.mapToDecisionPoint(this.decisionCapture.getDecisionPoint(decisionId)));
    
    // Connect to topic if provided
    if (decision.topicId) {
      this.linkDecisionToEntities(decisionId, 'related_to_topic', [decision.topicId]);
    }
    
    // Connect to action items if provided
    if (decision.actionItemIds && decision.actionItemIds.length > 0) {
      this.linkDecisionToEntities(decisionId, 'results_in_action', decision.actionItemIds);
    }
    
    this.logger.info(`Recorded decision ${decisionId}`);
    return decisionId;
  }

  /**
   * Visualize all decisions for a meeting
   */
  visualizeDecisions(meetingId: string): VisualizationGraph {
    // Get all decisions for this meeting
    const decisionIds = this.meetingDecisions.get(meetingId) || new Set<string>();
    
    if (decisionIds.size === 0) {
      // Try to get decisions by taskId from core service
      const coreDecisions = this.decisionCapture.getDecisionsByTask(meetingId);
      
      for (const decision of coreDecisions) {
        if (!this.elements.has(`element-${decision.id}`)) {
          this.createDecisionElement(decision.id, this.mapToDecisionPoint(decision));
        }
        
        if (!this.meetingDecisions.has(meetingId)) {
          this.meetingDecisions.set(meetingId, new Set());
        }
        this.meetingDecisions.get(meetingId)?.add(decision.id);
      }
    }
    
    const updatedDecisionIds = this.meetingDecisions.get(meetingId) || new Set<string>();
    
    if (updatedDecisionIds.size === 0) {
      this.logger.info(`No decisions found for meeting ${meetingId}`);
      return {
        id: `decision-graph-${meetingId}`,
        name: `Decisions for Meeting ${meetingId}`,
        elements: [],
        connections: [],
        layout: 'timeline',
        timestamp: new Date(),
        version: 1
      };
    }
    
    // Collect all elements and connections related to these decisions
    const decisionElements: VisualizationElement[] = [];
    const decisionConnections: VisualizationConnection[] = [];
    
    // First add all decision elements
    for (const decisionId of updatedDecisionIds) {
      const elementId = `element-${decisionId}`;
      const element = this.elements.get(elementId);
      
      if (element) {
        decisionElements.push(element);
        
        // Find all connections related to this decision
        for (const connection of this.connections.values()) {
          if (connection.sourceId === elementId || connection.targetId === elementId) {
            decisionConnections.push(connection);
            
            // Find the connected element and add it if not already included
            const connectedElementId = connection.sourceId === elementId
              ? connection.targetId
              : connection.sourceId;
            
            const connectedElement = this.elements.get(connectedElementId);
            
            if (connectedElement && !decisionElements.includes(connectedElement)) {
              decisionElements.push(connectedElement);
            }
          }
        }
      }
    }
    
    // Create visualization graph
    return {
      id: `decision-graph-${meetingId}`,
      name: `Decisions for Meeting ${meetingId}`,
      description: `Visualization of decision points for meeting ${meetingId}`,
      elements: decisionElements,
      connections: decisionConnections,
      layout: 'timeline',
      timestamp: new Date(),
      version: 1,
      metadata: {
        meetingId,
        decisionCount: updatedDecisionIds.size
      }
    };
  }

  /**
   * Get a decision by ID
   */
  getDecisionById(decisionId: string): DecisionPoint {
    try {
      // Get from core service and map to our format
      const coreDecision = this.decisionCapture.getDecisionPoint(decisionId);
      return this.mapToDecisionPoint(coreDecision);
    } catch (error) {
      this.logger.warn(`Decision ${decisionId} not found`);
      throw new Error(`Decision ${decisionId} not found`);
    }
  }

  /**
   * Link a decision to entities
   */
  linkDecisionToEntities(decisionId: string, relationshipType: string, entityIds: string[]): boolean {
    try {
      // Verify decision exists in core service
      this.decisionCapture.getDecisionPoint(decisionId);
      
      let allSuccessful = true;
      
      for (const entityId of entityIds) {
        const relationshipId = `rel-${uuidv4()}`;
        
        // Determine entity type from ID prefix
        const entityType = this.determineEntityType(entityId);
        
        // Create relationship record
        const relationship: DecisionEntityRelationship = {
          id: relationshipId,
          decisionId,
          entityId,
          entityType,
          relationshipType
        };
        
        this.relationships.set(relationshipId, relationship);
        
        // Create visualization element for entity if it doesn't exist
        this.ensureEntityElement(entityId, entityType);
        
        // Create visualization connection
        const connection: VisualizationConnection = {
          id: `connection-${relationshipId}`,
          type: this.mapRelationshipType(relationshipType),
          sourceId: `element-${decisionId}`,
          targetId: `element-${entityId}`,
          label: this.formatRelationshipLabel(relationshipType),
          properties: {
            relationshipType
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        this.connections.set(connection.id, connection);
        
        // Tag the decision in the core service with this relationship
        this.decisionCapture.tagDecisionPoint(decisionId, [`related_to_${entityType}_${entityId}`]);
        
        this.logger.info(`Linked decision ${decisionId} to entity ${entityId}`);
      }
      
      return allSuccessful;
    } catch (error) {
      this.logger.error(`Error linking decision to entities: ${error}`);
      return false;
    }
  }

  /**
   * Analyze decision quality
   */
  analyzeDecisionQuality(meetingId: string): {
    decisionsWithLowConfidence: string[];
    decisionsWithFewAlternatives: string[];
    decisionsWithoutRationale: string[];
    qualityScore: Record<string, number>;
  } {
    const decisionIds = this.meetingDecisions.get(meetingId) || new Set<string>();
    let decisions: DecisionPoint[] = [];
    
    // Get decisions from the core service
    try {
      const coreDecisions = this.decisionCapture.getDecisionsByTask(meetingId);
      decisions = coreDecisions.map(d => this.mapToDecisionPoint(d));
      
      // Add to our tracking if not already there
      for (const decision of decisions) {
        if (!decisionIds.has(decision.id)) {
          if (!this.meetingDecisions.has(meetingId)) {
            this.meetingDecisions.set(meetingId, new Set());
          }
          this.meetingDecisions.get(meetingId)?.add(decision.id);
          
          // Make sure we have a visualization element
          if (!this.elements.has(`element-${decision.id}`)) {
            this.createDecisionElement(decision.id, decision);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Error getting decisions from core service: ${error}`);
      
      // Fallback: Try to get decisions from our tracking
      decisions = Array.from(decisionIds).map(id => {
        try {
          return this.getDecisionById(id);
        } catch {
          return null;
        }
      }).filter(Boolean) as DecisionPoint[];
    }
    
    if (decisions.length === 0) {
      return {
        decisionsWithLowConfidence: [],
        decisionsWithFewAlternatives: [],
        decisionsWithoutRationale: [],
        qualityScore: {}
      };
    }
    
    // Analysis results
    const decisionsWithLowConfidence: string[] = [];
    const decisionsWithFewAlternatives: string[] = [];
    const decisionsWithoutRationale: string[] = [];
    const qualityScore: Record<string, number> = {};
    
    // Analyze each decision
    for (const decision of decisions) {
      // Check for low confidence
      if (decision.confidence < 0.5) {
        decisionsWithLowConfidence.push(decision.id);
      }
      
      // Check for few alternatives
      if (decision.alternatives.length < 2) {
        decisionsWithFewAlternatives.push(decision.id);
      }
      
      // Check for missing rationale
      if (!decision.rationale || decision.rationale.trim().length < 10) {
        decisionsWithoutRationale.push(decision.id);
      }
      
      // Calculate overall quality score
      const confidenceScore = decision.confidence * 0.3;
      const alternativesScore = Math.min(1, decision.alternatives.length / 3) * 0.3;
      const rationaleScore = decision.rationale?.trim().length ? 0.4 : 0;
      
      // Update decision element with quality info
      const decisionElement = this.elements.get(`element-${decision.id}`);
      
      if (decisionElement) {
        decisionElement.properties.qualityScore = confidenceScore + alternativesScore + rationaleScore;
        
        // Update color based on quality
        decisionElement.color = this.getColorForQuality(decisionElement.properties.qualityScore);
        decisionElement.updatedAt = new Date();
      }
      
      // Record quality score
      qualityScore[decision.id] = confidenceScore + alternativesScore + rationaleScore;
    }
    
    return {
      decisionsWithLowConfidence,
      decisionsWithFewAlternatives,
      decisionsWithoutRationale,
      qualityScore
    };
  }

  /**
   * Map a decision from the core service format to our format
   */
  private mapToDecisionPoint(coreDecision: any): DecisionPoint {
    const decisionMakers = coreDecision.agentId.includes(',') 
      ? coreDecision.agentId.split(',') 
      : [coreDecision.agentId];
    
    // Find the selected option to get confidence
    const selectedOption = coreDecision.options.find((opt: any) => opt.selected);
    const confidence = selectedOption ? selectedOption.confidence : 0.5;
    
    return {
      id: coreDecision.id,
      description: coreDecision.result,
      timestamp: coreDecision.timestamp,
      decisionMakers,
      alternatives: coreDecision.options.map((opt: any) => ({
        description: opt.description,
        pros: opt.pros || [],
        cons: opt.cons || [],
        selected: opt.selected || false,
      })),
      rationale: coreDecision.reasoning,
      topicId: coreDecision.metadata?.topicId,
      actionItemIds: coreDecision.metadata?.actionItemIds || [],
      confidence
    };
  }

  /**
   * Helper: Create visualization element for a decision
   */
  private createDecisionElement(decisionId: string, decision: DecisionPoint): void {
    const elementId = `element-${decisionId}`;
    
    const element: VisualizationElement = {
      id: elementId,
      type: VisualizationElementType.DECISION,
      label: this.createShortLabel(decision.description),
      description: decision.description,
      properties: {
        timestamp: decision.timestamp,
        decisionMakers: decision.decisionMakers,
        alternatives: decision.alternatives.length,
        hasRationale: !!decision.rationale,
        confidence: decision.confidence,
        topicId: decision.topicId,
        actionItemIds: decision.actionItemIds
      },
      state: VisualizationElementState.ACTIVE,
      // Position will be set by timeline layout
      size: {
        width: 150,
        height: 80
      },
      color: this.getColorForConfidence(decision.confidence),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        decisionId
      }
    };
    
    this.elements.set(elementId, element);
  }

  /**
   * Helper: Create or update visualization element for an entity
   */
  private ensureEntityElement(entityId: string, entityType: string): void {
    const elementId = `element-${entityId}`;
    
    // Check if element already exists
    if (this.elements.has(elementId)) {
      return;
    }
    
    // Create a placeholder element for the entity
    const element: VisualizationElement = {
      id: elementId,
      type: this.mapEntityTypeToElementType(entityType),
      label: this.formatEntityLabel(entityId, entityType),
      description: `Related ${entityType}`,
      properties: {
        entityType
      },
      state: VisualizationElementState.ACTIVE,
      // Size and position will be set by layout
      color: this.getColorForEntityType(entityType),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        entityId,
        entityType,
        isPlaceholder: true
      }
    };
    
    this.elements.set(elementId, element);
  }

  /**
   * Helper: Determine entity type from ID
   */
  private determineEntityType(entityId: string): string {
    if (entityId.startsWith('topic-')) {
      return 'topic';
    } else if (entityId.startsWith('action-')) {
      return 'action';
    } else if (entityId.startsWith('participant-')) {
      return 'participant';
    } else {
      return 'entity';
    }
  }

  /**
   * Helper: Map entity type to visualization element type
   */
  private mapEntityTypeToElementType(entityType: string): VisualizationElementType {
    const typeMap: Record<string, VisualizationElementType> = {
      'topic': VisualizationElementType.TOPIC,
      'action': VisualizationElementType.ACTION_ITEM,
      'participant': VisualizationElementType.PARTICIPANT
    };
    
    return typeMap[entityType] || VisualizationElementType.TOPIC;
  }

  /**
   * Helper: Map relationship type to visualization connection type
   */
  private mapRelationshipType(relationshipType: string): VisualizationConnectionType {
    const typeMap: Record<string, VisualizationConnectionType> = {
      'related_to_topic': VisualizationConnectionType.RELATION,
      'results_in_action': VisualizationConnectionType.DEPENDENCY,
      'made_by': VisualizationConnectionType.ASSIGNMENT,
      'influences': VisualizationConnectionType.INFLUENCE,
      'depends_on': VisualizationConnectionType.DEPENDENCY,
      'references': VisualizationConnectionType.REFERENCE
    };
    
    return typeMap[relationshipType] || VisualizationConnectionType.RELATION;
  }

  /**
   * Helper: Format relationship label for display
   */
  private formatRelationshipLabel(relationshipType: string): string {
    // Convert snake_case to Title Case with spaces
    return relationshipType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Helper: Format entity label for display
   */
  private formatEntityLabel(entityId: string, entityType: string): string {
    // Extract meaningful part from ID
    const parts = entityId.split('-');
    
    if (parts.length >= 2) {
      // Try to create a reasonable label
      return `${entityType.charAt(0).toUpperCase() + entityType.slice(1)}: ${parts[1]}`;
    }
    
    return entityType.charAt(0).toUpperCase() + entityType.slice(1);
  }

  /**
   * Helper: Create short label from long description
   */
  private createShortLabel(description: string): string {
    if (description.length <= 30) {
      return description;
    }
    
    return description.substring(0, 27) + '...';
  }

  /**
   * Helper: Extract meeting ID from entity ID
   */
  private extractMeetingId(entityId: string): string {
    // In a real implementation, this would extract the meeting ID from the entity ID
    // or from other context. For this implementation, we'll use a placeholder.
    const parts = entityId.split('-');
    
    if (parts.length >= 3) {
      return parts[2];
    }
    
    return 'default-meeting';
  }

  /**
   * Helper: Get color for confidence level
   */
  private getColorForConfidence(confidence: number): string {
    if (confidence < 0.3) {
      return '#F44336'; // Red for low confidence
    } else if (confidence < 0.7) {
      return '#FFC107'; // Amber for medium confidence
    } else {
      return '#4CAF50'; // Green for high confidence
    }
  }

  /**
   * Helper: Get color for quality score
   */
  private getColorForQuality(quality: number): string {
    if (quality < 0.4) {
      return '#F44336'; // Red for low quality
    } else if (quality < 0.7) {
      return '#FFC107'; // Amber for medium quality
    } else {
      return '#4CAF50'; // Green for high quality
    }
  }

  /**
   * Helper: Get color for entity type
   */
  private getColorForEntityType(entityType: string): string {
    const colorMap: Record<string, string> = {
      'topic': '#673AB7', // Purple for topics
      'action': '#FF9800', // Orange for actions
      'participant': '#2196F3', // Blue for participants
      'entity': '#607D8B' // Gray for generic entities
    };
    
    return colorMap[entityType] || '#607D8B';
  }
} 