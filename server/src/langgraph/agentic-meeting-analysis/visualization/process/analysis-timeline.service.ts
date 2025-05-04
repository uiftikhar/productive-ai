/**
 * Analysis Timeline Visualization Service
 * 
 * Implements visualization of the analysis timeline for meeting analysis.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  AnalysisTimelineVisualization,
  MeetingPhase,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Timeline event for visualization
 */
interface TimelineEvent {
  id: string;
  timestamp: Date;
  eventType: string;
  description: string;
  agentId?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}

/**
 * Event in test format (for backward compatibility with test-visualization.ts)
 */
interface TestEvent {
  eventId: string;
  name: string;
  timestamp: Date;
  type: string;
  description: string;
  agentId: string;
  relatedEntityIds: string[];
}

/**
 * Configuration for the AnalysisTimelineVisualizationImpl
 */
export interface AnalysisTimelineVisualizationConfig {
  logger?: Logger;
}

/**
 * Implementation of the AnalysisTimelineVisualization interface
 */
export class AnalysisTimelineVisualizationImpl implements AnalysisTimelineVisualization {
  private logger: Logger;
  private timelines: Map<string, {
    meetingId: string;
    events: Map<string, TimelineEvent>;
    phases: Map<string, MeetingPhase>;
    elements: Map<string, VisualizationElement>;
    connections: Map<string, VisualizationConnection>;
    version: number;
    timestamp: Date;
  }>;

  /**
   * Create a new analysis timeline visualization service
   */
  constructor(config: AnalysisTimelineVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.timelines = new Map();
    this.logger.info('AnalysisTimelineVisualizationImpl initialized');
  }

  /**
   * Create a new analysis timeline for a meeting
   */
  createAnalysisTimeline(meetingId: string): string {
    const timelineId = `timeline-${uuidv4()}`;
    
    this.timelines.set(timelineId, {
      meetingId,
      events: new Map<string, TimelineEvent>(),
      phases: new Map<string, MeetingPhase>(),
      elements: new Map<string, VisualizationElement>(),
      connections: new Map<string, VisualizationConnection>(),
      version: 1,
      timestamp: new Date()
    });
    
    this.logger.info(`Created analysis timeline ${timelineId} for meeting ${meetingId}`);
    return timelineId;
  }

  /**
   * For test compatibility - alias for createAnalysisTimeline
   */
  createTimelineVisualization(meetingId: string): string {
    return this.createAnalysisTimeline(meetingId);
  }

  /**
   * Record an analysis event on the timeline
   */
  recordAnalysisEvent(timelineId: string, event: {
    timestamp: Date;
    eventType: string;
    description: string;
    agentId?: string;
    entityId?: string;
    metadata?: Record<string, any>;
  }): string {
    const timeline = this.timelines.get(timelineId);
    
    if (!timeline) {
      this.logger.warn(`Timeline ${timelineId} not found`);
      throw new Error(`Timeline ${timelineId} not found`);
    }
    
    const eventId = `event-${uuidv4()}`;
    
    // Create event record
    const newEvent: TimelineEvent = {
      id: eventId,
      timestamp: event.timestamp,
      eventType: event.eventType,
      description: event.description,
      agentId: event.agentId,
      entityId: event.entityId,
      metadata: event.metadata
    };
    
    timeline.events.set(eventId, newEvent);
    
    // Create visualization element for this event
    const element: VisualizationElement = {
      id: `element-${eventId}`,
      type: this.getElementTypeForEvent(event.eventType),
      label: event.eventType,
      description: event.description,
      properties: {
        timestamp: event.timestamp,
        agentId: event.agentId,
        entityId: event.entityId,
        eventType: event.eventType
      },
      state: VisualizationElementState.ACTIVE,
      position: {
        x: this.calculateTimePosition(event.timestamp),
        y: this.calculateRowPosition(event.eventType)
      },
      color: this.getColorForEventType(event.eventType),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...event.metadata,
        eventId
      }
    };
    
    timeline.elements.set(element.id, element);
    
    // Connect to previous events if appropriate
    this.connectToRelatedEvents(timelineId, element, newEvent);
    
    // Update timeline metadata
    timeline.version += 1;
    timeline.timestamp = new Date();
    
    // Check if this event completes or starts a phase
    this.updatePhasesBasedOnEvent(timelineId, newEvent);
    
    this.logger.info(`Recorded event ${eventId} on timeline ${timelineId}`);
    return eventId;
  }

  /**
   * For test compatibility - add an event to the timeline 
   */
  addEvent(timelineId: string, event: TestEvent): string {
    const timeline = this.timelines.get(timelineId);
    
    if (!timeline) {
      this.logger.warn(`Timeline ${timelineId} not found`);
      throw new Error(`Timeline ${timelineId} not found`);
    }
    
    // Map test event to standard format
    return this.recordAnalysisEvent(timelineId, {
      timestamp: event.timestamp,
      eventType: event.type,
      description: event.description,
      agentId: event.agentId,
      metadata: {
        eventId: event.eventId,
        name: event.name,
        relatedEntityIds: event.relatedEntityIds
      }
    });
  }

  /**
   * Add a phase to the timeline
   */
  addPhase(timelineId: string, phase: MeetingPhase): boolean {
    const timeline = this.timelines.get(timelineId);
    
    if (!timeline) {
      this.logger.warn(`Timeline ${timelineId} not found`);
      return false;
    }
    
    // Store the phase
    timeline.phases.set(phase.id, phase);
    
    // Create visualization element for this phase
    this.createPhaseElement(timelineId, phase);
    
    // Update timeline metadata
    timeline.version += 1;
    timeline.timestamp = new Date();
    
    this.logger.info(`Added phase ${phase.id} to timeline ${timelineId}`);
    return true;
  }

  /**
   * Get the full visualization graph for the timeline
   */
  visualizeAnalysisTimeline(timelineId: string): VisualizationGraph {
    const timeline = this.timelines.get(timelineId);
    
    if (!timeline) {
      this.logger.warn(`Timeline ${timelineId} not found`);
      return {
        id: timelineId,
        name: 'Not Found',
        elements: [],
        connections: [],
        layout: 'timeline',
        timestamp: new Date(),
        version: 0
      };
    }
    
    // Add phase elements if they're not already included
    this.ensurePhaseElementsExist(timelineId);
    
    return {
      id: timelineId,
      name: `Analysis Timeline for Meeting ${timeline.meetingId}`,
      description: `Visualization of analysis process for meeting ${timeline.meetingId}`,
      elements: Array.from(timeline.elements.values()),
      connections: Array.from(timeline.connections.values()),
      layout: 'timeline',
      timestamp: timeline.timestamp,
      version: timeline.version,
      metadata: {
        meetingId: timeline.meetingId,
        eventCount: timeline.events.size,
        phaseCount: timeline.phases.size,
        timeRange: this.calculateTimeRange(timeline)
      }
    };
  }

  /**
   * For test compatibility - alias for visualizeAnalysisTimeline
   */
  visualizeTimeline(timelineId: string): VisualizationGraph {
    return this.visualizeAnalysisTimeline(timelineId);
  }

  /**
   * Get all phases in the timeline
   */
  getAnalysisPhases(timelineId: string): MeetingPhase[] {
    const timeline = this.timelines.get(timelineId);
    
    if (!timeline) {
      this.logger.warn(`Timeline ${timelineId} not found`);
      return [];
    }
    
    return Array.from(timeline.phases.values());
  }

  /**
   * Highlight a time range on the timeline
   */
  highlightTimeRange(timelineId: string, startTime: Date, endTime: Date): boolean {
    const timeline = this.timelines.get(timelineId);
    
    if (!timeline) {
      this.logger.warn(`Timeline ${timelineId} not found`);
      return false;
    }
    
    // Highlight elements within this time range
    for (const [id, element] of timeline.elements.entries()) {
      const timestamp = element.properties.timestamp;
      
      if (timestamp && timestamp >= startTime && timestamp <= endTime) {
        element.state = VisualizationElementState.HIGHLIGHTED;
      } else {
        // Reset state if not in other special state
        if (element.state === VisualizationElementState.HIGHLIGHTED) {
          element.state = VisualizationElementState.ACTIVE;
        }
      }
    }
    
    // Update timeline metadata
    timeline.version += 1;
    timeline.timestamp = new Date();
    
    this.logger.info(`Highlighted time range on timeline ${timelineId}`);
    return true;
  }

  /**
   * Calculate process metrics from the timeline
   */
  calculateProcessMetrics(timelineId: string): {
    totalAnalysisDuration: number;
    phaseDistribution: Record<string, number>;
    concurrency: number;
  } {
    const timeline = this.timelines.get(timelineId);
    
    if (!timeline) {
      this.logger.warn(`Timeline ${timelineId} not found`);
      throw new Error(`Timeline ${timelineId} not found`);
    }
    
    // Calculate total duration
    const timeRange = this.calculateTimeRange(timeline);
    const totalAnalysisDuration = 
      (timeRange.endTime.getTime() - timeRange.startTime.getTime()) / 1000; // in seconds
    
    // Calculate phase distribution
    const phaseDistribution: Record<string, number> = {};
    let totalPhaseDuration = 0;
    
    for (const phase of timeline.phases.values()) {
      const endTime = phase.endTime || new Date();
      const phaseDuration = (endTime.getTime() - phase.startTime.getTime()) / 1000;
      
      phaseDistribution[phase.name] = phaseDuration;
      totalPhaseDuration += phaseDuration;
    }
    
    // Normalize phase distribution to percentages
    for (const [phaseName, duration] of Object.entries(phaseDistribution)) {
      phaseDistribution[phaseName] = (duration / totalPhaseDuration) * 100;
    }
    
    // Calculate concurrency (average number of concurrent events/activities)
    const concurrency = this.calculateAverageConcurrency(timeline);
    
    return {
      totalAnalysisDuration,
      phaseDistribution,
      concurrency
    };
  }

  /**
   * Helper: Calculate time range of the timeline
   */
  private calculateTimeRange(timeline: {
    events: Map<string, TimelineEvent>;
    phases: Map<string, MeetingPhase>;
  }): { startTime: Date; endTime: Date } {
    let startTime = new Date();
    let endTime = new Date(0); // Initialize to epoch
    
    // Check events
    for (const event of timeline.events.values()) {
      if (event.timestamp < startTime) {
        startTime = event.timestamp;
      }
      
      if (event.timestamp > endTime) {
        endTime = event.timestamp;
      }
    }
    
    // Check phases
    for (const phase of timeline.phases.values()) {
      if (phase.startTime < startTime) {
        startTime = phase.startTime;
      }
      
      if (phase.endTime && phase.endTime > endTime) {
        endTime = phase.endTime;
      }
    }
    
    // If no events or phases (unlikely), use current time
    if (endTime.getTime() === 0) {
      endTime = new Date();
    }
    
    return { startTime, endTime };
  }

  /**
   * Helper: Calculate average number of concurrent activities
   */
  private calculateAverageConcurrency(timeline: {
    events: Map<string, TimelineEvent>;
  }): number {
    const events = Array.from(timeline.events.values());
    
    if (events.length <= 1) {
      return 1;
    }
    
    // Sort events by timestamp
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Simple calculation: average number of events per time window
    const timeWindows = Math.ceil(events.length / 3); // Divide into windows of ~3 events
    
    return events.length / timeWindows;
  }

  /**
   * Helper: Calculate horizontal position based on timestamp
   */
  private calculateTimePosition(timestamp: Date): number {
    // In a real implementation, this would map time to a position
    // For this implementation, return a placeholder value
    return 100 + (timestamp.getHours() * 60 + timestamp.getMinutes()) * 2;
  }

  /**
   * Helper: Calculate vertical position based on event type
   */
  private calculateRowPosition(eventType: string): number {
    // Group events by type in rows
    const rowMap: Record<string, number> = {
      'insight': 100,
      'action': 150,
      'decision': 200,
      'communication': 250,
      'process': 300
    };
    
    return rowMap[eventType] || 350;
  }

  /**
   * Helper: Get element type for event type
   */
  private getElementTypeForEvent(eventType: string): VisualizationElementType {
    const typeMap: Record<string, VisualizationElementType> = {
      'insight': VisualizationElementType.INSIGHT,
      'action': VisualizationElementType.ACTION_ITEM,
      'decision': VisualizationElementType.DECISION,
      'communication': VisualizationElementType.TRANSCRIPT_SEGMENT,
      'process': VisualizationElementType.TOPIC
    };
    
    return typeMap[eventType] || VisualizationElementType.INSIGHT;
  }

  /**
   * Helper: Get color for event type
   */
  private getColorForEventType(eventType: string): string {
    const colorMap: Record<string, string> = {
      'insight': '#4CAF50', // Green
      'action': '#FFC107', // Amber
      'decision': '#F44336', // Red
      'communication': '#2196F3', // Blue
      'process': '#9C27B0' // Purple
    };
    
    return colorMap[eventType] || '#9E9E9E';
  }

  /**
   * Helper: Connect event to related events
   */
  private connectToRelatedEvents(timelineId: string, element: VisualizationElement, event: TimelineEvent): void {
    const timeline = this.timelines.get(timelineId);
    
    if (!timeline) {
      return;
    }
    
    // Find previous events by the same agent (if any)
    if (event.agentId) {
      const previousEvents = Array.from(timeline.events.values())
        .filter(e => e.agentId === event.agentId && e.timestamp < event.timestamp)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Most recent first
      
      if (previousEvents.length > 0) {
        const previousEvent = previousEvents[0];
        
        // Create a connection
        const connection: VisualizationConnection = {
          id: `connection-${previousEvent.id}-${event.id}`,
          type: VisualizationConnectionType.DEPENDENCY,
          sourceId: `element-${previousEvent.id}`,
          targetId: element.id,
          label: '',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        timeline.connections.set(connection.id, connection);
      }
    }
    
    // Connect to any explicitly related entity
    if (event.entityId && timeline.events.has(event.entityId)) {
      const connection: VisualizationConnection = {
        id: `connection-${event.id}-${event.entityId}`,
        type: VisualizationConnectionType.DEPENDENCY,
        sourceId: element.id,
        targetId: `element-${event.entityId}`,
        label: 'Related To',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      timeline.connections.set(connection.id, connection);
    }
    
    // Connect to related entities from metadata
    if (event.metadata?.relatedEntityIds) {
      for (const relatedId of event.metadata.relatedEntityIds) {
        // This is a simplification - in a real implementation you'd check if the entity exists
        const connection: VisualizationConnection = {
          id: `connection-${event.id}-${relatedId}`,
          type: VisualizationConnectionType.DEPENDENCY,
          sourceId: element.id,
          targetId: `element-${relatedId}`,
          label: 'References',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        timeline.connections.set(connection.id, connection);
      }
    }
  }

  /**
   * Helper: Update phases based on event
   */
  private updatePhasesBasedOnEvent(timelineId: string, event: TimelineEvent): void {
    // This is a placeholder for more sophisticated phase detection
    // In a real implementation, you would have logic to identify phase transitions
  }

  /**
   * Helper: Ensure all phases have visualization elements
   */
  private ensurePhaseElementsExist(timelineId: string): void {
    const timeline = this.timelines.get(timelineId);
    
    if (!timeline) {
      return;
    }
    
    for (const phase of timeline.phases.values()) {
      this.createPhaseElement(timelineId, phase);
    }
  }

  /**
   * Helper: Create visualization element for a phase
   */
  private createPhaseElement(timelineId: string, phase: MeetingPhase): void {
    const timeline = this.timelines.get(timelineId);
    
    if (!timeline) {
      return;
    }
    
    const elementId = `element-phase-${phase.id}`;
    
    // Check if element already exists
    if (timeline.elements.has(elementId)) {
      return;
    }
    
    const element: VisualizationElement = {
      id: elementId,
      type: VisualizationElementType.TRANSCRIPT_SEGMENT, // Using this as a phase segment
      label: phase.name,
      description: phase.description || `Phase: ${phase.name}`,
      properties: {
        startTime: phase.startTime,
        endTime: phase.endTime,
        topicIds: phase.topicIds,
        participantIds: phase.participantIds,
        sentimentScore: phase.sentimentScore,
        productivity: phase.productivity
      },
      state: VisualizationElementState.ACTIVE,
      position: {
        x: this.calculateTimePosition(phase.startTime),
        y: 0 // Phases are at the top
      },
      size: {
        width: phase.endTime ? 
          this.calculateTimePosition(phase.endTime) - this.calculateTimePosition(phase.startTime) :
          200, // Default width if endTime not set
        height: 50
      },
      color: '#E0E0E0', // Light gray background for phases
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        phaseId: phase.id,
        isPhase: true
      }
    };
    
    timeline.elements.set(elementId, element);
  }
} 