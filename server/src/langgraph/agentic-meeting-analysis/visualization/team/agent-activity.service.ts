/**
 * Agent Activity Visualization Service
 * 
 * Implements visualization of agent activities over time for meeting analysis.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { 
  AgentActivityVisualization, 
  AgentActivityEvent,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Configuration for the AgentActivityVisualizationImpl
 */
export interface AgentActivityVisualizationConfig {
  logger?: Logger;
}

/**
 * Implementation of the AgentActivityVisualization interface
 */
export class AgentActivityVisualizationImpl implements AgentActivityVisualization {
  private logger: Logger;
  private activities: Map<string, AgentActivityEvent>;
  private meetingActivities: Map<string, Set<string>>;
  private agentActivities: Map<string, Set<string>>;

  /**
   * Create a new agent activity visualization service
   */
  constructor(config: AgentActivityVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.activities = new Map();
    this.meetingActivities = new Map();
    this.agentActivities = new Map();
    this.logger.info('AgentActivityVisualizationImpl initialized');
  }

  /**
   * Record an agent activity
   */
  recordAgentActivity(activity: Omit<AgentActivityEvent, 'id'>): string {
    const activityId = `activity-${uuidv4()}`;
    
    // Create the activity record
    const newActivity: AgentActivityEvent = {
      id: activityId,
      timestamp: activity.timestamp,
      agentId: activity.agentId,
      activityType: activity.activityType,
      details: activity.details || '',
      description: activity.description,
      relatedEntityId: activity.relatedEntityId,
      duration: activity.duration,
      metadata: activity.metadata
    };
    
    // Store the activity
    this.activities.set(activityId, newActivity);
    
    // Index by meeting
    const meetingId = activity.metadata?.meetingId as string || 'unknown';
    if (!this.meetingActivities.has(meetingId)) {
      this.meetingActivities.set(meetingId, new Set());
    }
    this.meetingActivities.get(meetingId)?.add(activityId);
    
    // Index by agent
    if (!this.agentActivities.has(activity.agentId)) {
      this.agentActivities.set(activity.agentId, new Set());
    }
    this.agentActivities.get(activity.agentId)?.add(activityId);
    
    this.logger.info(`Recorded activity ${activityId} for agent ${activity.agentId} in meeting ${meetingId}`);
    return activityId;
  }

  /**
   * Get agent activities for a given time range
   */
  getAgentActivities(agentId: string, startTime?: Date, endTime?: Date): AgentActivityEvent[] {
    const activityIds = this.agentActivities.get(agentId);
    
    if (!activityIds) {
      return [];
    }
    
    // Get all activities for this agent
    const activities = Array.from(activityIds)
      .map(id => this.activities.get(id))
      .filter(Boolean) as AgentActivityEvent[];
    
    // Filter by time range if provided
    return activities.filter(activity => {
      if (startTime && activity.timestamp < startTime) {
        return false;
      }
      
      if (endTime && activity.timestamp > endTime) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * Visualize agent activity timeline
   */
  visualizeActivityTimeline(meetingId: string, agentIds?: string[]): VisualizationGraph {
    const activityIds = this.meetingActivities.get(meetingId);
    
    if (!activityIds || activityIds.size === 0) {
      this.logger.warn(`No activities found for meeting ${meetingId}`);
      return {
        id: `activity-timeline-${meetingId}`,
        name: 'No Activity Data',
        elements: [],
        connections: [],
        layout: 'timeline',
        timestamp: new Date(),
        version: 1
      };
    }
    
    // Get all activities for this meeting
    let activities = Array.from(activityIds)
      .map(id => this.activities.get(id))
      .filter(Boolean) as AgentActivityEvent[];
    
    // Filter by agent IDs if provided
    if (agentIds && agentIds.length > 0) {
      activities = activities.filter(activity => agentIds.includes(activity.agentId));
    }
    
    if (activities.length === 0) {
      this.logger.warn(`No activities found for the specified agents in meeting ${meetingId}`);
      return {
        id: `activity-timeline-${meetingId}`,
        name: 'No Activity Data for Selected Agents',
        elements: [],
        connections: [],
        layout: 'timeline',
        timestamp: new Date(),
        version: 1
      };
    }
    
    // Sort activities by timestamp
    activities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Create elements and connections for visualization
    const elements: VisualizationElement[] = [];
    const connections: VisualizationConnection[] = [];
    
    // Create timeline element
    const timelineElement: VisualizationElement = {
      id: 'timeline',
      type: VisualizationElementType.TRANSCRIPT_SEGMENT,
      label: 'Activity Timeline',
      description: 'Timeline of agent activities',
      properties: {},
      state: VisualizationElementState.ACTIVE,
      position: { x: 100, y: 50 },
      size: { width: 800, height: 10 },
      color: '#E0E0E0',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    elements.push(timelineElement);
    
    // Track agent rows
    const agentRows: Record<string, number> = {};
    let nextRow = 0;
    
    // Calculate time range
    const startTime = activities[0].timestamp.getTime();
    const endTime = activities[activities.length - 1].timestamp.getTime();
    const totalDuration = endTime - startTime;
    const timelineWidth = 800;
    
    // Process each activity
    activities.forEach((activity, index) => {
      // Determine row for this agent
      if (agentRows[activity.agentId] === undefined) {
        agentRows[activity.agentId] = nextRow;
        nextRow += 1;
        
        // Create agent label
        const agentLabelElement: VisualizationElement = {
          id: `agent-label-${activity.agentId}`,
          type: VisualizationElementType.AGENT,
          label: `Agent ${activity.agentId}`,
          description: `Activities for agent ${activity.agentId}`,
          properties: {},
          state: VisualizationElementState.ACTIVE,
          position: { x: 50, y: 100 + agentRows[activity.agentId] * 60 },
          color: this.getColorForActivityType(activity.activityType),
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            agentId: activity.agentId
          }
        };
        
        elements.push(agentLabelElement);
      }
      
      // Calculate position
      const xPosition = totalDuration > 0 ? 
        100 + ((activity.timestamp.getTime() - startTime) / totalDuration) * timelineWidth : 
        100 + (index * 50);
      
      const yPosition = 100 + agentRows[activity.agentId] * 60;
      
      // Create activity element
      const activityElement: VisualizationElement = {
        id: `element-${activity.id}`,
        type: this.getElementTypeForActivity(activity.activityType),
        label: activity.activityType,
        description: activity.description,
        properties: {
          timestamp: activity.timestamp,
          agentId: activity.agentId,
          activityType: activity.activityType,
          duration: activity.duration,
          details: activity.details,
          description: activity.description,
          relatedEntityId: activity.relatedEntityId
        },
        state: this.getStateForActivityOutcome(activity.metadata?.outcome as string),
        position: { x: xPosition, y: yPosition },
        size: {
          width: Math.max(30, (activity.duration || 1) / 10), // Size based on duration
          height: 30
        },
        color: this.getColorForActivityType(activity.activityType),
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          activityId: activity.id
        }
      };
      
      elements.push(activityElement);
      
      // Connect to timeline
      connections.push({
        id: `connection-timeline-${activity.id}`,
        type: VisualizationConnectionType.RELATION,
        sourceId: 'timeline',
        targetId: `element-${activity.id}`,
        label: '',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Connect to previous activity by same agent if it exists
      if (index > 0) {
        const prevActivities = activities.slice(0, index).filter(a => a.agentId === activity.agentId);
        
        if (prevActivities.length > 0) {
          const prevActivity = prevActivities[prevActivities.length - 1];
          
          connections.push({
            id: `connection-${prevActivity.id}-${activity.id}`,
            type: VisualizationConnectionType.RELATION,
            sourceId: `element-${prevActivity.id}`,
            targetId: `element-${activity.id}`,
            label: '',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
      
      // Connect to related entity if it exists
      if (activity.relatedEntityId && this.activities.has(activity.relatedEntityId)) {
        connections.push({
          id: `connection-related-${activity.id}-${activity.relatedEntityId}`,
          type: VisualizationConnectionType.REFERENCE,
          sourceId: `element-${activity.id}`,
          targetId: `element-${activity.relatedEntityId}`,
          label: 'Related To',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    });
    
    return {
      id: `activity-timeline-${meetingId}`,
      name: `Agent Activity Timeline for Meeting ${meetingId}`,
      description: `Visualization of agent activities for meeting ${meetingId}`,
      elements,
      connections,
      layout: 'timeline',
      timestamp: new Date(),
      version: 1,
      metadata: {
        meetingId,
        agentCount: Object.keys(agentRows).length,
        activityCount: activities.length,
        startTime: activities[0].timestamp,
        endTime: activities[activities.length - 1].timestamp
      }
    };
  }

  /**
   * Calculate activity metrics for an agent
   */
  calculateActivityMetrics(agentId: string): {
    activityDensity: number;
    activityDiversity: number;
    peakActivityPeriods: Array<{ start: Date; end: Date; intensity: number }>;
  } {
    const activityIds = this.agentActivities.get(agentId);
    
    if (!activityIds || activityIds.size === 0) {
      this.logger.warn(`No activities found for agent ${agentId}`);
      return {
        activityDensity: 0,
        activityDiversity: 0,
        peakActivityPeriods: []
      };
    }
    
    // Get all activities for this agent
    const activities = Array.from(activityIds)
      .map(id => this.activities.get(id))
      .filter(Boolean) as AgentActivityEvent[];
    
    // Sort activities by timestamp
    activities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Calculate time range
    const startTime = activities[0].timestamp.getTime();
    const endTime = activities[activities.length - 1].timestamp.getTime();
    const totalDuration = (endTime - startTime) / 1000; // in seconds
    
    // Calculate activity density (activities per minute)
    const activityDensity = totalDuration > 0 ? 
      (activities.length / (totalDuration / 60)) : 0;
    
    // Calculate activity diversity (distinct activity types)
    const activityTypes = new Set<string>();
    for (const activity of activities) {
      activityTypes.add(activity.activityType);
    }
    
    const activityDiversity = activityTypes.size > 0 ? 
      Math.min(1, activityTypes.size / 10) : 0; // Normalize to 0-1 (assuming 10 possible types is maximum diversity)
    
    // Identify peak activity periods
    const peakActivityPeriods: Array<{ start: Date; end: Date; intensity: number }> = [];
    
    // Simple algorithm to identify periods with high activity density
    if (activities.length >= 3) {
      // Use sliding window to find dense activity periods
      const windowSize = Math.max(3, Math.floor(activities.length / 5)); // Window of 20% of activities or at least 3
      const slidingStep = Math.max(1, Math.floor(windowSize / 2)); // 50% overlap
      
      for (let i = 0; i < activities.length - windowSize + 1; i += slidingStep) {
        const windowActivities = activities.slice(i, i + windowSize);
        const windowStartTime = windowActivities[0].timestamp.getTime();
        const windowEndTime = windowActivities[windowActivities.length - 1].timestamp.getTime();
        const windowDuration = (windowEndTime - windowStartTime) / 1000; // in seconds
        
        if (windowDuration > 0) {
          const windowDensity = (windowActivities.length / (windowDuration / 60));
          
          // If density is significantly higher than average, consider it a peak period
          if (windowDensity > activityDensity * 1.5) {
            peakActivityPeriods.push({
              start: windowActivities[0].timestamp,
              end: windowActivities[windowActivities.length - 1].timestamp,
              intensity: windowDensity / activityDensity // Relative intensity compared to average
            });
          }
        }
      }
      
      // Merge overlapping periods
      for (let i = 0; i < peakActivityPeriods.length - 1; i++) {
        const current = peakActivityPeriods[i];
        const next = peakActivityPeriods[i + 1];
        
        if (current.end >= next.start) {
          // Merge periods
          current.end = new Date(Math.max(current.end.getTime(), next.end.getTime()));
          current.intensity = Math.max(current.intensity, next.intensity);
          
          // Remove the next period
          peakActivityPeriods.splice(i + 1, 1);
          i--; // Recheck the current period against what's now the next period
        }
      }
    }
    
    return {
      activityDensity,
      activityDiversity,
      peakActivityPeriods
    };
  }

  /**
   * Compare activities between multiple agents
   */
  compareAgentActivities(agentIds: string[]): {
    activityCounts: Record<string, number>;
    activityTypeDistribution: Record<string, Record<string, number>>;
    timelineSimilarity: Record<string, Record<string, number>>;
    collaborationScore: Record<string, Record<string, number>>;
  } {
    if (agentIds.length < 2) {
      this.logger.warn('Need at least two agents to compare activities');
      return {
        activityCounts: {},
        activityTypeDistribution: {},
        timelineSimilarity: {},
        collaborationScore: {}
      };
    }
    
    // Get activities for each agent
    const agentActivitiesMap: Record<string, AgentActivityEvent[]> = {};
    const activityCounts: Record<string, number> = {};
    const activityTypeDistribution: Record<string, Record<string, number>> = {};
    
    for (const agentId of agentIds) {
      const activities = this.getAgentActivities(agentId);
      agentActivitiesMap[agentId] = activities;
      activityCounts[agentId] = activities.length;
      
      // Calculate activity type distribution
      activityTypeDistribution[agentId] = {};
      
      for (const activity of activities) {
        activityTypeDistribution[agentId][activity.activityType] = 
          (activityTypeDistribution[agentId][activity.activityType] || 0) + 1;
      }
    }
    
    // Calculate timeline similarity between agent pairs
    const timelineSimilarity: Record<string, Record<string, number>> = {};
    const collaborationScore: Record<string, Record<string, number>> = {};
    
    for (let i = 0; i < agentIds.length; i++) {
      const agentId1 = agentIds[i];
      
      timelineSimilarity[agentId1] = {};
      collaborationScore[agentId1] = {};
      
      for (let j = 0; j < agentIds.length; j++) {
        if (i === j) continue;
        
        const agentId2 = agentIds[j];
        const activities1 = agentActivitiesMap[agentId1];
        const activities2 = agentActivitiesMap[agentId2];
        
        // Skip if no activities
        if (activities1.length === 0 || activities2.length === 0) {
          timelineSimilarity[agentId1][agentId2] = 0;
          collaborationScore[agentId1][agentId2] = 0;
          continue;
        }
        
        // Calculate timeline similarity (temporal overlap)
        // Simple algorithm that looks at how many activities for agent2 are within
        // a time window of activities from agent1
        let overlappingActivities = 0;
        const timeWindow = 5 * 60 * 1000; // 5 minutes in milliseconds
        
        for (const activity1 of activities1) {
          for (const activity2 of activities2) {
            const timeDiff = Math.abs(activity1.timestamp.getTime() - activity2.timestamp.getTime());
            
            if (timeDiff <= timeWindow) {
              overlappingActivities++;
              break; // Count each activity1 only once
            }
          }
        }
        
        const timelineSimilarityScore = activities1.length > 0 ? 
          overlappingActivities / activities1.length : 0;
        
        timelineSimilarity[agentId1][agentId2] = timelineSimilarityScore;
        
        // Calculate collaboration score (related entities overlap)
        let sharedEntities = 0;
        
        for (const activity1 of activities1) {
          if (!activity1.relatedEntityId) continue;
          
          for (const activity2 of activities2) {
            if (!activity2.relatedEntityId) continue;
            
            // Check for overlapping related entities
            const entity1 = activity1.relatedEntityId;
            if (entity1 && activity2.relatedEntityId === entity1) {
              sharedEntities++;
              break; // Count each activity1 only once
            }
          }
        }
        
        const collaborationScoreValue = activities1.length > 0 ? 
          sharedEntities / activities1.length : 0;
        
        collaborationScore[agentId1][agentId2] = collaborationScoreValue;
      }
    }
    
    return {
      activityCounts,
      activityTypeDistribution,
      timelineSimilarity,
      collaborationScore
    };
  }

  /**
   * Helper method to get element type for activity type
   */
  private getElementTypeForActivity(activityType: string): VisualizationElementType {
    const typeMap: Record<string, VisualizationElementType> = {
      'analysis': VisualizationElementType.INSIGHT,
      'communication': VisualizationElementType.TRANSCRIPT_SEGMENT,
      'extraction': VisualizationElementType.ACTION_ITEM,
      'summarization': VisualizationElementType.TOPIC,
      'decision': VisualizationElementType.DECISION
    };
    
    return typeMap[activityType] || VisualizationElementType.INSIGHT;
  }

  /**
   * Helper method to get state for activity outcome
   */
  private getStateForActivityOutcome(outcome?: string): VisualizationElementState {
    if (!outcome) return VisualizationElementState.ACTIVE;
    
    if (outcome.includes('success') || outcome.includes('completed')) {
      return VisualizationElementState.ACTIVE;
    } else if (outcome.includes('fail') || outcome.includes('error')) {
      return VisualizationElementState.ERROR;
    } else if (outcome.includes('partial')) {
      return VisualizationElementState.HIGHLIGHTED;
    }
    
    return VisualizationElementState.ACTIVE;
  }

  /**
   * Helper method to get color for activity type
   */
  private getColorForActivityType(activityType: string): string {
    const colorMap: Record<string, string> = {
      'analysis': '#4CAF50', // Green
      'communication': '#2196F3', // Blue
      'extraction': '#FFC107', // Amber
      'summarization': '#9C27B0', // Purple
      'decision': '#F44336', // Red
      'coordination': '#FF9800', // Orange
      'verification': '#607D8B' // Blue-grey
    };
    
    return colorMap[activityType] || '#9E9E9E'; // Grey default
  }
} 