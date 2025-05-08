/**
 * Team Evolution Visualization Service
 * 
 * Implements visualization of team changes over time for meeting analysis.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { AgentExpertise } from '../../interfaces/agent.interface';
import { 
  TeamEvolutionVisualization, 
  AgentRole, 
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Team change snapshot for tracking evolution over time
 */
interface TeamChangeSnapshot {
  id: string;
  timestamp: Date;
  added: AgentRole[];
  removed: string[];
  modified: Array<{ agentId: string; updates: Partial<AgentRole> }>;
  roster: AgentRole[];
}

/**
 * Configuration for the TeamEvolutionVisualizationImpl
 */
export interface TeamEvolutionVisualizationConfig {
  logger?: Logger;
}

/**
 * Implementation of the TeamEvolutionVisualization interface
 */
export class TeamEvolutionVisualizationImpl implements TeamEvolutionVisualization {
  private logger: Logger;
  private teamChanges: Map<string, {
    meetingId: string;
    snapshots: TeamChangeSnapshot[];
    currentRoster: Map<string, AgentRole>;
  }>;

  /**
   * Create a new team evolution visualization service
   */
  constructor(config: TeamEvolutionVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.teamChanges = new Map();
    this.logger.info('TeamEvolutionVisualizationImpl initialized');
  }

  /**
   * Track a team change for a meeting
   */
  trackTeamChange(meetingId: string, timestamp: Date, changes: {
    added: AgentRole[];
    removed: string[];
    modified: Array<{ agentId: string; updates: Partial<AgentRole> }>;
  }): boolean {
    // Get or create the team change record for this meeting
    let teamChange = this.teamChanges.get(meetingId);
    
    if (!teamChange) {
      teamChange = {
        meetingId,
        snapshots: [],
        currentRoster: new Map<string, AgentRole>()
      };
      this.teamChanges.set(meetingId, teamChange);
    }
    
    // Apply changes to current roster
    // Add new agents
    for (const agent of changes.added) {
      teamChange.currentRoster.set(agent.agentId, {...agent});
    }
    
    // Remove agents
    for (const agentId of changes.removed) {
      teamChange.currentRoster.delete(agentId);
    }
    
    // Update modified agents
    for (const modification of changes.modified) {
      const agent = teamChange.currentRoster.get(modification.agentId);
      
      if (agent) {
        teamChange.currentRoster.set(modification.agentId, {
          ...agent,
          ...modification.updates
        });
      }
    }
    
    // Create a snapshot of the current state
    const snapshot: TeamChangeSnapshot = {
      id: `snapshot-${uuidv4()}`,
      timestamp,
      added: changes.added,
      removed: changes.removed,
      modified: changes.modified,
      roster: Array.from(teamChange.currentRoster.values())
    };
    
    // Add the snapshot to the history
    teamChange.snapshots.push(snapshot);
    
    // Sort snapshots by timestamp
    teamChange.snapshots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    this.logger.info(`Tracked team change at ${timestamp} for meeting ${meetingId}`);
    return true;
  }

  /**
   * Get team snapshots for a given time range
   */
  getTeamSnapshots(meetingId: string, startTime?: Date, endTime?: Date): Array<{
    timestamp: Date;
    roster: AgentRole[];
  }> {
    const teamChange = this.teamChanges.get(meetingId);
    
    if (!teamChange) {
      this.logger.warn(`No team changes found for meeting ${meetingId}`);
      return [];
    }
    
    // Filter snapshots based on time range
    return teamChange.snapshots
      .filter(snapshot => {
        if (startTime && snapshot.timestamp < startTime) {
          return false;
        }
        
        if (endTime && snapshot.timestamp > endTime) {
          return false;
        }
        
        return true;
      })
      .map(snapshot => ({
        timestamp: snapshot.timestamp,
        roster: snapshot.roster
      }));
  }

  /**
   * Visualize team evolution over time
   */
  visualizeTeamEvolution(meetingId: string): VisualizationGraph {
    const teamChange = this.teamChanges.get(meetingId);
    
    if (!teamChange || teamChange.snapshots.length === 0) {
      this.logger.warn(`No team changes found for meeting ${meetingId}`);
      return {
        id: `evolution-${meetingId}`,
        name: 'No Team Evolution Data',
        elements: [],
        connections: [],
        layout: 'timeline',
        timestamp: new Date(),
        version: 1
      };
    }
    
    // Create elements and connections for visualization
    const elements: VisualizationElement[] = [];
    const connections: VisualizationConnection[] = [];
    
    // Create a timeline element
    const timelineElement: VisualizationElement = {
      id: 'timeline',
      type: VisualizationElementType.TRANSCRIPT_SEGMENT,
      label: 'Team Evolution Timeline',
      description: 'Timeline of team changes',
      properties: {},
      state: VisualizationElementState.ACTIVE,
      position: { x: 100, y: 50 },
      size: { width: 800, height: 10 },
      color: '#E0E0E0',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    elements.push(timelineElement);
    
    // Create elements for each snapshot
    const totalDuration = 
      teamChange.snapshots[teamChange.snapshots.length - 1].timestamp.getTime() - 
      teamChange.snapshots[0].timestamp.getTime();
    
    const startTime = teamChange.snapshots[0].timestamp.getTime();
    const timelineWidth = 800;
    
    // Track agents across snapshots
    const agentPositions: Record<string, number> = {};
    let nextPosition = 0;
    
    // Process snapshots in order
    teamChange.snapshots.forEach((snapshot, index) => {
      // Create snapshot marker
      const xPosition = totalDuration > 0 ? 
        100 + ((snapshot.timestamp.getTime() - startTime) / totalDuration) * timelineWidth : 
        100 + (index * 100);
      
      const snapshotElement: VisualizationElement = {
        id: `snapshot-${snapshot.id}`,
        type: VisualizationElementType.INSIGHT,
        label: `Snapshot ${index + 1}`,
        description: `Team snapshot at ${snapshot.timestamp.toISOString()}`,
        properties: {
          timestamp: snapshot.timestamp,
          rosterSize: snapshot.roster.length,
          added: snapshot.added.length,
          removed: snapshot.removed.length,
          modified: snapshot.modified.length
        },
        state: VisualizationElementState.ACTIVE,
        position: { x: xPosition, y: 50 },
        color: '#4CAF50',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          snapshotId: snapshot.id
        }
      };
      
      elements.push(snapshotElement);
      
      // Connect to timeline
      connections.push({
        id: `connection-timeline-${snapshot.id}`,
        type: VisualizationConnectionType.RELATION,
        sourceId: 'timeline',
        targetId: `snapshot-${snapshot.id}`,
        label: '',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // If not the first snapshot, connect to previous
      if (index > 0) {
        connections.push({
          id: `connection-snapshot-${teamChange.snapshots[index - 1].id}-${snapshot.id}`,
          type: VisualizationConnectionType.DEPENDENCY,
          sourceId: `snapshot-${teamChange.snapshots[index - 1].id}`,
          targetId: `snapshot-${snapshot.id}`,
          label: '',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      
      // Create agent elements for this snapshot
      snapshot.roster.forEach(agent => {
        // Check if we have a position for this agent
        if (agentPositions[agent.agentId] === undefined) {
          agentPositions[agent.agentId] = nextPosition;
          nextPosition += 1;
        }
        
        const yPosition = 100 + agentPositions[agent.agentId] * 50;
        
        const agentElement: VisualizationElement = {
          id: `agent-${snapshot.id}-${agent.agentId}`,
          type: VisualizationElementType.AGENT,
          label: `Agent: ${agent.primaryExpertise}`,
          description: agent.responsibility || `Agent with ${agent.primaryExpertise} expertise`,
          properties: {
            primaryExpertise: agent.primaryExpertise,
            secondaryExpertise: agent.secondaryExpertise,
            contributionScore: agent.contributionScore
          },
          state: VisualizationElementState.ACTIVE,
          position: { x: xPosition, y: yPosition },
          color: this.getColorForExpertise(agent.primaryExpertise),
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            agentId: agent.agentId,
            snapshotId: snapshot.id
          }
        };
        
        elements.push(agentElement);
        
        // Connect agent to snapshot
        connections.push({
          id: `connection-${snapshot.id}-${agent.agentId}`,
          type: VisualizationConnectionType.ASSIGNMENT,
          sourceId: `snapshot-${snapshot.id}`,
          targetId: `agent-${snapshot.id}-${agent.agentId}`,
          label: '',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // If not the first snapshot, try to connect to the same agent in previous snapshot
        if (index > 0) {
          const prevSnapshotId = teamChange.snapshots[index - 1].id;
          const prevAgentId = `agent-${prevSnapshotId}-${agent.agentId}`;
          
          // Check if this agent existed in the previous snapshot
          const wasAdded = snapshot.added.some(a => a.agentId === agent.agentId);
          
          if (!wasAdded) {
            connections.push({
              id: `connection-agent-${prevSnapshotId}-${snapshot.id}-${agent.agentId}`,
              type: VisualizationConnectionType.DEPENDENCY,
              sourceId: prevAgentId,
              targetId: `agent-${snapshot.id}-${agent.agentId}`,
              label: '',
              createdAt: new Date(),
              updatedAt: new Date()
            });
          }
        }
      });
    });
    
    return {
      id: `evolution-${meetingId}`,
      name: `Team Evolution for Meeting ${meetingId}`,
      description: `Visualization of team changes over time for meeting ${meetingId}`,
      elements,
      connections,
      layout: 'timeline',
      timestamp: new Date(),
      version: 1,
      metadata: {
        meetingId,
        snapshotCount: teamChange.snapshots.length,
        startTime: teamChange.snapshots[0].timestamp,
        endTime: teamChange.snapshots[teamChange.snapshots.length - 1].timestamp,
        totalAgents: Object.keys(agentPositions).length
      }
    };
  }

  /**
   * Analyze team evolution trends
   */
  analyzeTrends(meetingId: string): {
    growth: number;
    turnover: number;
    expertiseEvolution: Record<AgentExpertise, number[]>;
  } {
    const teamChange = this.teamChanges.get(meetingId);
    
    if (!teamChange || teamChange.snapshots.length < 2) {
      this.logger.warn(`Insufficient data for trend analysis for meeting ${meetingId}`);
      return {
        growth: 0,
        turnover: 0,
        expertiseEvolution: Object.values(AgentExpertise).reduce((acc, expertise) => {
          acc[expertise] = [];
          return acc;
        }, {} as Record<AgentExpertise, number[]>)
      };
    }
    
    // Calculate growth rate
    const initialSize = teamChange.snapshots[0].roster.length;
    const finalSize = teamChange.snapshots[teamChange.snapshots.length - 1].roster.length;
    const growth = initialSize > 0 ? (finalSize - initialSize) / initialSize : 0;
    
    // Calculate turnover (ratio of agents who have been added or removed)
    const allAgentIds = new Set<string>();
    const addedOrRemovedIds = new Set<string>();
    
    for (const snapshot of teamChange.snapshots) {
      // Add all agents to the overall set
      for (const agent of snapshot.roster) {
        allAgentIds.add(agent.agentId);
      }
      
      // Add agents that were added or removed to that set
      for (const agent of snapshot.added) {
        addedOrRemovedIds.add(agent.agentId);
      }
      
      for (const agentId of snapshot.removed) {
        addedOrRemovedIds.add(agentId);
      }
    }
    
    const turnover = allAgentIds.size > 0 ? addedOrRemovedIds.size / allAgentIds.size : 0;
    
    // Calculate expertise evolution
    const expertiseEvolution: Record<AgentExpertise, number[]> = Object.values(AgentExpertise).reduce((acc, expertise) => {
      acc[expertise] = [];
      return acc;
    }, {} as Record<AgentExpertise, number[]>);
    
    // Calculate expertise counts for each snapshot
    for (const snapshot of teamChange.snapshots) {
      const expertiseCounts: Record<AgentExpertise, number> = Object.values(AgentExpertise).reduce((acc, expertise) => {
        acc[expertise] = 0;
        return acc;
      }, {} as Record<AgentExpertise, number>);
      
      // Count primary expertise
      for (const agent of snapshot.roster) {
        expertiseCounts[agent.primaryExpertise] += 1;
        
        // Count secondary expertise as 0.5
        for (const secondaryExpertise of agent.secondaryExpertise || []) {
          expertiseCounts[secondaryExpertise] += 0.5;
        }
      }
      
      // Add counts to evolution tracking
      for (const expertise of Object.values(AgentExpertise)) {
        expertiseEvolution[expertise].push(expertiseCounts[expertise]);
      }
    }
    
    return {
      growth,
      turnover,
      expertiseEvolution
    };
  }

  /**
   * Helper method to get color for expertise
   */
  private getColorForExpertise(expertise: AgentExpertise): string {
    const colorMap: Record<AgentExpertise, string> = {
      [AgentExpertise.COORDINATION]: '#4285F4', // blue
      [AgentExpertise.SUMMARY_GENERATION]: '#34A853', // green
      [AgentExpertise.ACTION_ITEM_EXTRACTION]: '#FBBC05', // yellow
      [AgentExpertise.DECISION_TRACKING]: '#EA4335', // red
      [AgentExpertise.TOPIC_ANALYSIS]: '#8F44AD', // purple
      [AgentExpertise.SENTIMENT_ANALYSIS]: '#1ABC9C', // teal
      [AgentExpertise.PARTICIPANT_DYNAMICS]: '#F39C12', // orange
      [AgentExpertise.CONTEXT_INTEGRATION]: '#7F8C8D', // gray 
      [AgentExpertise.MANAGEMENT]: '#000000',
    };
    
    return colorMap[expertise] || '#000000';
  }
} 