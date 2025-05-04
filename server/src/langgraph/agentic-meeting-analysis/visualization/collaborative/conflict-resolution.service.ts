/**
 * Conflict Resolution Visualization Service
 * 
 * Implements visualization of conflict identification and resolution processes
 * during meetings. Tracks disagreements, resolution approaches, and outcomes.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  ConflictResolutionVisualization,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Configuration for the ConflictResolutionVisualizationImpl
 */
export interface ConflictResolutionVisualizationConfig {
  logger?: Logger;
}

/**
 * Conflict record
 */
interface Conflict {
  id: string;
  meetingId: string;
  topic: string;
  description: string;
  startTimestamp: Date;
  endTimestamp?: Date;
  status: 'active' | 'resolved' | 'deferred';
  involvedAgentIds: string[];
  intensity: number; // 0-1 scale
  resolution?: {
    approach: string;
    outcome: string;
    agentId?: string; // Agent who resolved it
    timestamp: Date;
    acceptanceLevel: number; // 0-1 scale
  };
}

/**
 * Disagreement record
 */
interface Disagreement {
  id: string;
  conflictId: string;
  meetingId: string;
  timestamp: Date;
  sourceAgentId: string;
  targetAgentId: string;
  topic: string;
  statement: string;
  intensity: number; // 0-1 scale
}

/**
 * Implementation of the ConflictResolutionVisualization interface
 */
export class ConflictResolutionVisualizationImpl implements ConflictResolutionVisualization {
  private logger: Logger;
  private conflicts: Map<string, Conflict>;
  private disagreements: Map<string, Disagreement>;
  private meetingConflicts: Map<string, Set<string>>;
  private meetingDisagreements: Map<string, Set<string>>;
  private agentConflicts: Map<string, Set<string>>;
  private elements: Map<string, VisualizationElement>;
  private connections: Map<string, VisualizationConnection>;

  /**
   * Create a new conflict resolution visualization service
   */
  constructor(config: ConflictResolutionVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.conflicts = new Map();
    this.disagreements = new Map();
    this.meetingConflicts = new Map();
    this.meetingDisagreements = new Map();
    this.agentConflicts = new Map();
    this.elements = new Map();
    this.connections = new Map();
    this.logger.info('ConflictResolutionVisualizationImpl initialized');
  }

  /**
   * Record a conflict
   */
  recordConflict(meetingId: string, conflict: {
    timestamp: Date;
    involvedAgentIds: string[];
    conflictType: string;
    description: string;
    entityId?: string;
    resolutionStatus: 'detected' | 'in_progress' | 'resolved' | 'escalated';
  }): string {
    const conflictId = `conflict-${uuidv4()}`;
    
    // Store the conflict
    const conflictRecord: Conflict = {
      id: conflictId,
      meetingId,
      topic: conflict.conflictType,
      description: conflict.description,
      startTimestamp: conflict.timestamp,
      status: this.mapResolutionStatus(conflict.resolutionStatus),
      involvedAgentIds: conflict.involvedAgentIds,
      intensity: 0.5 // Default intensity
    };
    
    this.conflicts.set(conflictId, conflictRecord);
    
    // Add to indices
    this.addToIndex(this.meetingConflicts, meetingId, conflictId);
    
    for (const agentId of conflict.involvedAgentIds) {
      this.addToIndex(this.agentConflicts, agentId, conflictId);
    }
    
    // Create visualization elements
    this.createConflictElement(conflictId, conflictRecord);
    
    this.logger.info(`Recorded conflict ${conflictId} of type ${conflict.conflictType}`);
    
    return conflictId;
  }

  /**
   * Record a disagreement within a conflict
   */
  recordDisagreement(conflictId: string, disagreement: {
    timestamp: Date;
    sourceAgentId: string;
    targetAgentId: string;
    topic: string;
    statement: string;
    intensity: number;
  }): string {
    // Check if conflict exists
    if (!this.conflicts.has(conflictId)) {
      throw new Error(`Conflict ${conflictId} not found`);
    }
    
    const conflict = this.conflicts.get(conflictId)!;
    const disagreementId = `disagreement-${uuidv4()}`;
    
    // Store the disagreement
    const disagreementRecord: Disagreement = {
      id: disagreementId,
      conflictId,
      meetingId: conflict.meetingId,
      ...disagreement
    };
    
    this.disagreements.set(disagreementId, disagreementRecord);
    
    // Add to meeting index
    this.addToIndex(this.meetingDisagreements, conflict.meetingId, disagreementId);
    
    // Create visualization elements
    this.createDisagreementConnection(disagreementId, disagreementRecord);
    
    // Update conflict intensity if needed
    if (disagreement.intensity > conflict.intensity) {
      conflict.intensity = disagreement.intensity;
      this.updateConflictElement(conflictId, conflict);
    }
    
    this.logger.info(`Recorded disagreement ${disagreementId} for conflict ${conflictId}`);
    
    return disagreementId;
  }

  /**
   * Update conflict resolution
   */
  updateConflictResolution(conflictId: string, resolution: {
    timestamp: Date;
    resolutionType: string;
    resolutionAgentId?: string;
    outcome: string;
    acceptedByAgentIds: string[];
  }): boolean {
    // Check if conflict exists
    if (!this.conflicts.has(conflictId)) {
      throw new Error(`Conflict ${conflictId} not found`);
      return false;
    }
    
    const conflict = this.conflicts.get(conflictId)!;
    
    // Update conflict
    conflict.status = 'resolved';
    conflict.endTimestamp = resolution.timestamp;
    conflict.resolution = {
      approach: resolution.resolutionType,
      outcome: resolution.outcome,
      agentId: resolution.resolutionAgentId,
      timestamp: resolution.timestamp,
      acceptanceLevel: resolution.acceptedByAgentIds.length / conflict.involvedAgentIds.length
    };
    
    // Update element
    this.updateConflictElement(conflictId, conflict);
    
    this.logger.info(`Updated conflict ${conflictId} resolution to resolved`);
    return true;
  }

  /**
   * Visualize conflict resolution
   */
  visualizeConflictResolutions(meetingId: string): VisualizationGraph {
    return this.visualizeConflictResolution(meetingId);
  }
  
  /**
   * Internal method for visualization - will keep for backward compatibility
   */
  visualizeConflictResolution(meetingId: string): VisualizationGraph {
    const conflictIds = this.meetingConflicts.get(meetingId) || new Set<string>();
    const disagreementIds = this.meetingDisagreements.get(meetingId) || new Set<string>();
    
    if (conflictIds.size === 0) {
      this.logger.info(`No conflicts found for meeting ${meetingId}`);
      return {
        id: `conflict-resolution-${meetingId}`,
        name: `Conflict Resolution for Meeting ${meetingId}`,
        elements: [],
        connections: [],
        layout: 'force-directed',
        timestamp: new Date(),
        version: 1
      };
    }
    
    // Build visualization
    const elements: VisualizationElement[] = [];
    const connections: VisualizationConnection[] = [];
    
    // Get conflicts
    const conflicts = Array.from(conflictIds)
      .map(id => this.conflicts.get(id))
      .filter(Boolean) as Conflict[];
    
    // Get disagreements
    const disagreements = Array.from(disagreementIds)
      .map(id => this.disagreements.get(id))
      .filter(Boolean) as Disagreement[];
    
    // Collect all agents involved
    const agentIds = new Set<string>();
    
    for (const conflict of conflicts) {
      for (const agentId of conflict.involvedAgentIds) {
        agentIds.add(agentId);
      }
    }
    
    for (const disagreement of disagreements) {
      agentIds.add(disagreement.sourceAgentId);
      agentIds.add(disagreement.targetAgentId);
    }
    
    // Create agent elements
    for (const agentId of agentIds) {
      const elementId = `agent-${agentId}`;
      elements.push({
        id: elementId,
        type: VisualizationElementType.AGENT,
        label: `Agent ${agentId.split('-').pop()}`,
        description: `Agent ${agentId}`,
        properties: { agentId },
        state: VisualizationElementState.ACTIVE,
        color: this.getColorForAgent(agentId),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Add conflict elements
    for (const conflict of conflicts) {
      const elementId = `conflict-${conflict.id}`;
      const element = this.elements.get(elementId);
      
      if (element) {
        elements.push(element);
        
        // Connect to involved agents
        for (const agentId of conflict.involvedAgentIds) {
          connections.push({
            id: `conflict-agent-${conflict.id}-${agentId}`,
            type: VisualizationConnectionType.RELATION,
            sourceId: elementId,
            targetId: `agent-${agentId}`,
            label: '',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }
    
    // Add disagreement connections
    for (const disagreement of disagreements) {
      const connectionId = `disagreement-${disagreement.id}`;
      const connection = this.connections.get(connectionId);
      
      if (connection) {
        connections.push(connection);
      }
    }
    
    // Add resolution elements
    for (const conflict of conflicts) {
      if (conflict.status === 'resolved' && conflict.resolution) {
        const resolutionId = `resolution-${conflict.id}`;
        const element: VisualizationElement = {
          id: resolutionId,
          type: VisualizationElementType.DECISION,
          label: `Resolution: ${conflict.resolution.approach}`,
          description: conflict.resolution.outcome,
          properties: {
            approach: conflict.resolution.approach,
            outcome: conflict.resolution.outcome,
            timestamp: conflict.resolution.timestamp,
            acceptanceLevel: conflict.resolution.acceptanceLevel
          },
          state: VisualizationElementState.ACTIVE,
          color: '#4CAF50', // Green for resolution
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        elements.push(element);
        
        // Connect to conflict
        connections.push({
          id: `conflict-resolution-${conflict.id}`,
          type: VisualizationConnectionType.DEPENDENCY,
          sourceId: `conflict-${conflict.id}`,
          targetId: resolutionId,
          label: 'Resolved by',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // Connect to resolver agent if specified
        if (conflict.resolution.agentId) {
          connections.push({
            id: `resolution-agent-${conflict.id}`,
            type: VisualizationConnectionType.ASSIGNMENT,
            sourceId: resolutionId,
            targetId: `agent-${conflict.resolution.agentId}`,
            label: 'Proposed by',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }
    
    return {
      id: `conflict-resolution-${meetingId}`,
      name: `Conflict Resolution for Meeting ${meetingId}`,
      description: `Visualization of conflicts and resolutions for meeting ${meetingId}`,
      elements,
      connections,
      layout: 'force-directed',
      timestamp: new Date(),
      version: 1,
      metadata: {
        meetingId,
        conflictCount: conflicts.length,
        disagreementCount: disagreements.length,
        resolvedCount: conflicts.filter(c => c.status === 'resolved').length,
        deferredCount: conflicts.filter(c => c.status === 'deferred').length,
        activeCount: conflicts.filter(c => c.status === 'active').length
      }
    };
  }

  /**
   * Analyze conflict patterns
   */
  analyzeConflictPatterns(meetingId: string): {
    frequentConflictTypes: Array<{ type: string; count: number }>;
    conflictProneAgents: string[];
    resolutionEffectiveness: number; // 0-1 scale
    escalationRate: number; // percentage of conflicts requiring escalation
  } {
    const conflictIds = this.meetingConflicts.get(meetingId) || new Set<string>();
    
    if (conflictIds.size === 0) {
      return {
        frequentConflictTypes: [],
        conflictProneAgents: [],
        resolutionEffectiveness: 0,
        escalationRate: 0
      };
    }
    
    // Get conflicts
    const conflicts = Array.from(conflictIds)
      .map(id => this.conflicts.get(id))
      .filter(Boolean) as Conflict[];
    
    // Count conflict types
    const typeCounts: Record<string, number> = {};
    for (const conflict of conflicts) {
      typeCounts[conflict.topic] = (typeCounts[conflict.topic] || 0) + 1;
    }
    
    // Get frequent types
    const frequentConflictTypes = Object.entries(typeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
    
    // Count agent involvement
    const agentInvolvement: Record<string, number> = {};
    for (const conflict of conflicts) {
      for (const agentId of conflict.involvedAgentIds) {
        agentInvolvement[agentId] = (agentInvolvement[agentId] || 0) + 1;
      }
    }
    
    // Get most conflict-prone agents
    const conflictProneAgents = Object.entries(agentInvolvement)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([agentId]) => agentId);
    
    // Calculate resolution effectiveness
    const resolvedConflicts = conflicts.filter(c => c.status === 'resolved' && c.resolution);
    const resolutionEffectiveness = resolvedConflicts.length > 0
      ? resolvedConflicts.reduce((sum, c) => sum + (c.resolution?.acceptanceLevel || 0), 0) / resolvedConflicts.length
      : 0;
    
    // Calculate escalation rate
    const escalationRate = conflicts.length > 0
      ? conflicts.filter(c => this.isEscalated(c)).length / conflicts.length
      : 0;
    
    return {
      frequentConflictTypes,
      conflictProneAgents,
      resolutionEffectiveness,
      escalationRate
    };
  }
  
  /**
   * Helper: Check if a conflict was escalated
   */
  private isEscalated(conflict: Conflict): boolean {
    // Consider a conflict escalated if:
    // 1. It has high intensity
    // 2. It has many disagreements
    return conflict.intensity > 0.8;
  }
  
  /**
   * Helper: Map resolution status from interface to internal representation
   */
  private mapResolutionStatus(status: 'detected' | 'in_progress' | 'resolved' | 'escalated'): 'active' | 'resolved' | 'deferred' {
    switch(status) {
      case 'detected': 
      case 'in_progress':
        return 'active';
      case 'resolved':
        return 'resolved';
      case 'escalated':
        return 'deferred';
      default:
        return 'active';
    }
  }

  /**
   * Helper: Add to index
   */
  private addToIndex(index: Map<string, Set<string>>, key: string, value: string): void {
    if (!index.has(key)) {
      index.set(key, new Set());
    }
    
    index.get(key)?.add(value);
  }

  /**
   * Helper: Create conflict element
   */
  private createConflictElement(conflictId: string, conflict: Conflict): void {
    const elementId = `conflict-${conflictId}`;
    
    // Create element
    const element: VisualizationElement = {
      id: elementId,
      type: VisualizationElementType.TOPIC,
      label: `Conflict: ${conflict.topic}`,
      description: conflict.description,
      properties: {
        topic: conflict.topic,
        startTimestamp: conflict.startTimestamp,
        status: conflict.status,
        involvedAgentIds: conflict.involvedAgentIds,
        intensity: conflict.intensity
      },
      state: conflict.status === 'active' ? 
        VisualizationElementState.WARNING : 
        conflict.status === 'resolved' ? 
          VisualizationElementState.ACTIVE : 
          VisualizationElementState.INACTIVE,
      size: {
        width: 50 + (conflict.intensity * 30),
        height: 50 + (conflict.intensity * 30)
      },
      color: this.getColorForConflictStatus(conflict.status, conflict.intensity),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.elements.set(elementId, element);
  }

  /**
   * Helper: Update conflict element
   */
  private updateConflictElement(conflictId: string, conflict: Conflict): void {
    const elementId = `conflict-${conflictId}`;
    
    if (!this.elements.has(elementId)) {
      this.createConflictElement(conflictId, conflict);
      return;
    }
    
    const element = this.elements.get(elementId)!;
    
    // Update element
    element.label = `Conflict: ${conflict.topic}`;
    element.description = conflict.description;
    element.properties = {
      ...element.properties,
      status: conflict.status,
      intensity: conflict.intensity,
      endTimestamp: conflict.endTimestamp,
      resolution: conflict.resolution
    };
    element.state = conflict.status === 'active' ? 
      VisualizationElementState.WARNING : 
      conflict.status === 'resolved' ? 
        VisualizationElementState.ACTIVE : 
        VisualizationElementState.INACTIVE;
    element.size = {
      width: 50 + (conflict.intensity * 30),
      height: 50 + (conflict.intensity * 30)
    };
    element.color = this.getColorForConflictStatus(conflict.status, conflict.intensity);
    element.updatedAt = new Date();
  }

  /**
   * Helper: Create disagreement connection
   */
  private createDisagreementConnection(disagreementId: string, disagreement: Disagreement): void {
    const connectionId = `disagreement-${disagreementId}`;
    
    // Create connection
    const connection: VisualizationConnection = {
      id: connectionId,
      type: VisualizationConnectionType.COMMUNICATION,
      sourceId: `agent-${disagreement.sourceAgentId}`,
      targetId: `agent-${disagreement.targetAgentId}`,
      label: 'Disagrees',
      properties: {
        topic: disagreement.topic,
        statement: disagreement.statement,
        timestamp: disagreement.timestamp,
        intensity: disagreement.intensity,
        conflictId: disagreement.conflictId,
        color: this.getColorForIntensity(disagreement.intensity)
      },
      strength: disagreement.intensity,
      animated: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.connections.set(connectionId, connection);
  }

  /**
   * Helper: Get color for agent
   */
  private getColorForAgent(agentId: string): string {
    // Simple hash function to get a consistent color
    let hash = 0;
    for (let i = 0; i < agentId.length; i++) {
      hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert to color
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  /**
   * Helper: Get color for conflict status
   */
  private getColorForConflictStatus(status: string, intensity: number): string {
    if (status === 'resolved') {
      return '#4CAF50'; // Green
    } else if (status === 'deferred') {
      return '#FFC107'; // Amber
    } else {
      // Active - color based on intensity
      return this.getColorForIntensity(intensity);
    }
  }

  /**
   * Helper: Get color for intensity
   */
  private getColorForIntensity(intensity: number): string {
    // Interpolate from yellow to red based on intensity
    if (intensity < 0.3) {
      return '#FFC107'; // Yellow for low intensity
    } else if (intensity < 0.7) {
      return '#FF9800'; // Orange for medium intensity
    } else {
      return '#F44336'; // Red for high intensity
    }
  }
} 