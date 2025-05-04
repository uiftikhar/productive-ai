/**
 * Focus Transition Visualization Service
 * 
 * Implements visualization of focus transitions for meeting analysis.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { 
  FocusTransitionVisualization,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Focus transition data
 */
interface FocusTransition {
  id: string;
  meetingId: string;
  timestamp: Date;
  fromEntityId?: string;
  toEntityId: string;
  transitionType: string;
  durationSeconds: number;
  agentIds: string[];
}

/**
 * Meeting focus data
 */
interface MeetingFocusData {
  id: string;
  meetingId: string;
  transitions: Map<string, FocusTransition>;
  focusDurations: Map<string, number>; // entity ID to total duration
  transitionCounts: Map<string, number>; // from+to key to count
  elements: Map<string, VisualizationElement>;
  connections: Map<string, VisualizationConnection>;
  version: number;
  timestamp: Date;
}

/**
 * Configuration for the FocusTransitionVisualizationImpl
 */
export interface FocusTransitionVisualizationConfig {
  logger?: Logger;
}

/**
 * Implementation of the FocusTransitionVisualization interface
 */
export class FocusTransitionVisualizationImpl implements FocusTransitionVisualization {
  private logger: Logger;
  private meetingFocuses: Map<string, MeetingFocusData>;

  /**
   * Create a new focus transition visualization service
   */
  constructor(config: FocusTransitionVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.meetingFocuses = new Map();
    this.logger.info('FocusTransitionVisualizationImpl initialized');
  }

  /**
   * Record a focus transition
   */
  recordFocusTransition(meetingId: string, transition: {
    timestamp: Date;
    fromEntityId?: string;
    toEntityId: string;
    transitionType: string;
    durationSeconds: number;
    agentIds: string[];
  }): string {
    // Ensure meeting data exists
    if (!this.meetingFocuses.has(meetingId)) {
      this.createMeetingFocusData(meetingId);
    }
    
    const meetingData = this.meetingFocuses.get(meetingId)!;
    
    // Create the transition record
    const transitionId = `transition-${uuidv4()}`;
    const newTransition: FocusTransition = {
      id: transitionId,
      meetingId,
      timestamp: transition.timestamp,
      fromEntityId: transition.fromEntityId,
      toEntityId: transition.toEntityId,
      transitionType: transition.transitionType,
      durationSeconds: transition.durationSeconds,
      agentIds: [...transition.agentIds]
    };
    
    // Store the transition
    meetingData.transitions.set(transitionId, newTransition);
    
    // Update focus durations
    const toEntityId = transition.toEntityId;
    const currentDuration = meetingData.focusDurations.get(toEntityId) || 0;
    meetingData.focusDurations.set(toEntityId, currentDuration + transition.durationSeconds);
    
    // Update transition counts
    const transitionKey = this.getTransitionKey(transition.fromEntityId, transition.toEntityId);
    const currentCount = meetingData.transitionCounts.get(transitionKey) || 0;
    meetingData.transitionCounts.set(transitionKey, currentCount + 1);
    
    // Update version and timestamp
    meetingData.version += 1;
    meetingData.timestamp = new Date();
    
    this.logger.info(`Recorded focus transition ${transitionId} for meeting ${meetingId}`);
    return transitionId;
  }

  /**
   * Visualize the focus transitions
   */
  visualizeFocusTransitions(meetingId: string): VisualizationGraph {
    // Check if meeting data exists
    if (!this.meetingFocuses.has(meetingId)) {
      this.logger.warn(`No focus data found for meeting ${meetingId}`);
      return {
        id: `focus-${meetingId}`,
        name: `Focus Transitions - Meeting ${meetingId}`,
        elements: [],
        connections: [],
        layout: 'force-directed',
        timestamp: new Date(),
        version: 0
      };
    }
    
    const meetingData = this.meetingFocuses.get(meetingId)!;
    
    // Update the visualization data
    this.updateVisualization(meetingId);
    
    return {
      id: `focus-${meetingId}`,
      name: `Focus Transitions - Meeting ${meetingId}`,
      description: 'Visualization of focus transitions during the meeting',
      elements: Array.from(meetingData.elements.values()),
      connections: Array.from(meetingData.connections.values()),
      layout: 'force-directed',
      timestamp: meetingData.timestamp,
      version: meetingData.version,
      metadata: {
        meetingId,
        transitionCount: meetingData.transitions.size,
        entityCount: meetingData.focusDurations.size
      }
    };
  }

  /**
   * Analyze focus patterns
   */
  analyzeFocusPatterns(meetingId: string): {
    frequentTransitions: Array<{ from: string; to: string; count: number }>;
    focusDwellTimes: Record<string, number>;
    coherenceScore: number;
  } {
    if (!this.meetingFocuses.has(meetingId)) {
      this.logger.warn(`No focus data found for meeting ${meetingId}`);
      return {
        frequentTransitions: [],
        focusDwellTimes: {},
        coherenceScore: 0
      };
    }
    
    const meetingData = this.meetingFocuses.get(meetingId)!;
    
    // Analyze frequent transitions
    const frequentTransitions: Array<{ from: string; to: string; count: number }> = [];
    
    for (const [key, count] of meetingData.transitionCounts.entries()) {
      const [fromId, toId] = this.parseTransitionKey(key);
      
      frequentTransitions.push({
        from: fromId || 'start',
        to: toId,
        count
      });
    }
    
    // Sort by count descending
    frequentTransitions.sort((a, b) => b.count - a.count);
    
    // Convert focus durations to record
    const focusDwellTimes: Record<string, number> = {};
    for (const [entityId, duration] of meetingData.focusDurations.entries()) {
      focusDwellTimes[entityId] = duration;
    }
    
    // Calculate coherence score
    // A higher score means more logical/consistent transitions
    // Look at transition patterns and how many times the same transitions occur
    let coherenceScore = 0;
    
    if (meetingData.transitions.size > 1) {
      // Count repeated transitions
      const totalTransitions = meetingData.transitions.size;
      const uniqueTransitionCount = meetingData.transitionCounts.size;
      
      // More repeated transitions = more coherence
      const repetitionRatio = 1 - (uniqueTransitionCount / totalTransitions);
      
      // Check for focus clusters
      const transitionsPerEntity = new Map<string, number>();
      
      for (const transition of meetingData.transitions.values()) {
        const entityId = transition.toEntityId;
        const count = transitionsPerEntity.get(entityId) || 0;
        transitionsPerEntity.set(entityId, count + 1);
      }
      
      // Calculate variation in transitions per entity
      const transitionCounts = Array.from(transitionsPerEntity.values());
      const avgTransitions = transitionCounts.reduce((sum, count) => sum + count, 0) / transitionCounts.length;
      
      let variationSum = 0;
      for (const count of transitionCounts) {
        variationSum += Math.abs(count - avgTransitions);
      }
      
      const variationScore = transitionCounts.length > 1
        ? 1 - (variationSum / (avgTransitions * transitionCounts.length))
        : 0;
        
      // Combine metrics for overall score
      coherenceScore = (repetitionRatio * 0.6) + (variationScore * 0.4);
      coherenceScore = Math.max(0, Math.min(1, coherenceScore));
    }
    
    return {
      frequentTransitions,
      focusDwellTimes,
      coherenceScore
    };
  }

  /**
   * Identify attention hotspots
   */
  identifyAttentionHotspots(meetingId: string): string[] {
    if (!this.meetingFocuses.has(meetingId)) {
      this.logger.warn(`No focus data found for meeting ${meetingId}`);
      return [];
    }
    
    const meetingData = this.meetingFocuses.get(meetingId)!;
    
    // Consider both time spent on each entity and frequency of transitions
    const entityScores = new Map<string, number>();
    
    // Add scores based on focus duration
    for (const [entityId, duration] of meetingData.focusDurations.entries()) {
      entityScores.set(entityId, duration);
    }
    
    // Add scores based on transition frequency (how often an entity is the target)
    for (const [key, count] of meetingData.transitionCounts.entries()) {
      const [, toId] = this.parseTransitionKey(key);
      
      if (toId) {
        const currentScore = entityScores.get(toId) || 0;
        entityScores.set(toId, currentScore + (count * 10)); // Weight transition count
      }
    }
    
    // Sort entities by score and return top ones
    return Array.from(entityScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) // Top 5 hotspots
      .map(([entityId]) => entityId);
  }

  /**
   * Create empty meeting focus data
   */
  private createMeetingFocusData(meetingId: string): void {
    this.meetingFocuses.set(meetingId, {
      id: `focus-${uuidv4()}`,
      meetingId,
      transitions: new Map<string, FocusTransition>(),
      focusDurations: new Map<string, number>(),
      transitionCounts: new Map<string, number>(),
      elements: new Map<string, VisualizationElement>(),
      connections: new Map<string, VisualizationConnection>(),
      version: 1,
      timestamp: new Date()
    });
  }

  /**
   * Update the visualization elements and connections
   */
  private updateVisualization(meetingId: string): void {
    if (!this.meetingFocuses.has(meetingId)) {
      return;
    }
    
    const meetingData = this.meetingFocuses.get(meetingId)!;
    
    // Clear existing elements and connections
    meetingData.elements.clear();
    meetingData.connections.clear();
    
    // Create elements for each entity
    const entityIds = new Set<string>();
    
    // Add all entities from focus durations
    for (const entityId of meetingData.focusDurations.keys()) {
      entityIds.add(entityId);
    }
    
    // Add any missing entities from transitions
    for (const transition of meetingData.transitions.values()) {
      if (transition.fromEntityId) {
        entityIds.add(transition.fromEntityId);
      }
      entityIds.add(transition.toEntityId);
    }
    
    // Calculate positions using a simple circular layout
    const entityArray = Array.from(entityIds);
    
    // Create elements for each entity
    entityArray.forEach((entityId, index) => {
      const angle = (2 * Math.PI * index) / entityArray.length;
      const radius = 300;
      const x = 400 + radius * Math.cos(angle);
      const y = 300 + radius * Math.sin(angle);
      
      const duration = meetingData.focusDurations.get(entityId) || 0;
      const size = Math.max(40, Math.min(100, 40 + duration / 10));
      
      const element: VisualizationElement = {
        id: `entity-${entityId}`,
        type: VisualizationElementType.TOPIC,
        label: `Entity ${entityId}`,
        description: `Focus duration: ${duration} seconds`,
        properties: {
          entityId,
          durationSeconds: duration
        },
        state: VisualizationElementState.ACTIVE,
        position: { x, y },
        size: { width: size, height: size },
        color: this.getColorForDuration(duration),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      meetingData.elements.set(element.id, element);
    });
    
    // Create center element
    const centerElement: VisualizationElement = {
      id: 'center',
      type: VisualizationElementType.INSIGHT,
      label: 'Focus Activity',
      description: 'Center of focus transitions',
      properties: {},
      state: VisualizationElementState.ACTIVE,
      position: { x: 400, y: 300 },
      size: { width: 60, height: 60 },
      color: '#2196F3', // Blue
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    meetingData.elements.set(centerElement.id, centerElement);
    
    // Add transition connections
    for (const transition of meetingData.transitions.values()) {
      const sourceId = transition.fromEntityId 
        ? `entity-${transition.fromEntityId}` 
        : 'center';
      
      const targetId = `entity-${transition.toEntityId}`;
      
      // Skip if elements don't exist
      if (!meetingData.elements.has(sourceId) || !meetingData.elements.has(targetId)) {
        continue;
      }
      
      const connection: VisualizationConnection = {
        id: `connection-${transition.id}`,
        type: VisualizationConnectionType.DEPENDENCY,
        sourceId,
        targetId,
        label: transition.transitionType,
        properties: {
          transitionType: transition.transitionType,
          durationSeconds: transition.durationSeconds,
          timestamp: transition.timestamp
        },
        strength: this.calculateTransitionStrength(transition),
        animated: true,
        createdAt: transition.timestamp,
        updatedAt: new Date()
      };
      
      meetingData.connections.set(connection.id, connection);
    }
    
    // Add connections for frequently traversed paths
    const transitionPatterns = this.analyzeFocusPatterns(meetingId).frequentTransitions
      .filter(t => t.count > 1) // Only show paths traversed multiple times
      .slice(0, 5); // Top 5 most frequent
    
    for (const pattern of transitionPatterns) {
      const sourceId = pattern.from === 'start' ? 'center' : `entity-${pattern.from}`;
      const targetId = `entity-${pattern.to}`;
      
      // Skip if elements don't exist
      if (!meetingData.elements.has(sourceId) || !meetingData.elements.has(targetId)) {
        continue;
      }
      
      const connection: VisualizationConnection = {
        id: `pattern-${pattern.from}-${pattern.to}`,
        type: VisualizationConnectionType.INFLUENCE,
        sourceId,
        targetId,
        label: `${pattern.count} transitions`,
        properties: {
          count: pattern.count,
          patternType: 'frequent'
        },
        strength: Math.min(1, pattern.count / 5),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      meetingData.connections.set(connection.id, connection);
    }
  }

  /**
   * Get a transition key for the counts map
   */
  private getTransitionKey(fromEntityId?: string, toEntityId?: string): string {
    return `${fromEntityId || 'start'}->${toEntityId}`;
  }

  /**
   * Parse a transition key
   */
  private parseTransitionKey(key: string): [string | undefined, string] {
    const parts = key.split('->');
    return [parts[0] === 'start' ? undefined : parts[0], parts[1]];
  }

  /**
   * Calculate transition strength
   */
  private calculateTransitionStrength(transition: FocusTransition): number {
    // Base strength on duration and agent count
    const durationFactor = Math.min(1, transition.durationSeconds / 60); // Cap at 1 minute
    const agentFactor = Math.min(1, transition.agentIds.length / 5); // Cap at 5 agents
    
    return (durationFactor * 0.7) + (agentFactor * 0.3);
  }

  /**
   * Get color based on duration
   */
  private getColorForDuration(durationSeconds: number): string {
    if (durationSeconds < 30) {
      return '#90CAF9'; // Light blue for short durations
    } else if (durationSeconds < 120) {
      return '#42A5F5'; // Medium blue for moderate durations
    } else if (durationSeconds < 300) {
      return '#1E88E5'; // Dark blue for longer durations
    } else {
      return '#0D47A1'; // Very dark blue for extended durations
    }
  }
} 