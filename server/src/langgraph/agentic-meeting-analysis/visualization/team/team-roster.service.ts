/**
 * Team Roster Visualization Service
 * 
 * Implements visualization of agent rosters for meeting analysis.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { AgentExpertise } from '../../interfaces/agent.interface';
import { 
  TeamRosterVisualization, 
  AgentRole,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Team roster data structure
 */
interface TeamData {
  id: string;
  meetingId: string;
  name: string;
  roster: Map<string, AgentRole>;
  elements: Map<string, VisualizationElement>;
  connections: Map<string, VisualizationConnection>;
  highlightedAgents: Set<string>;
  version: number;
  timestamp: Date;
}

/**
 * Configuration for the TeamRosterVisualizationImpl
 */
export interface TeamRosterVisualizationConfig {
  logger?: Logger;
}

/**
 * Implementation of the TeamRosterVisualization interface
 */
export class TeamRosterVisualizationImpl implements TeamRosterVisualization {
  private logger: Logger;
  private teams: Map<string, TeamData>;

  /**
   * Create a new team roster visualization service
   */
  constructor(config: TeamRosterVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.teams = new Map();
    this.logger.info('TeamRosterVisualizationImpl initialized');
  }

  /**
   * Create a new team visualization
   */
  createTeamVisualization(meetingId: string, name: string): string {
    const id = `team-${uuidv4()}`;
    
    this.teams.set(id, {
      id,
      meetingId,
      name,
      roster: new Map<string, AgentRole>(),
      elements: new Map<string, VisualizationElement>(),
      connections: new Map<string, VisualizationConnection>(),
      highlightedAgents: new Set<string>(),
      version: 1,
      timestamp: new Date()
    });
    
    this.logger.info(`Created team visualization ${id} for meeting ${meetingId}`);
    return id;
  }

  /**
   * Add an agent to the team roster
   */
  addAgentToRoster(visualizationId: string, agent: AgentRole): boolean {
    const team = this.teams.get(visualizationId);
    
    if (!team) {
      this.logger.warn(`Team visualization ${visualizationId} not found`);
      return false;
    }
    
    // Add agent to roster
    team.roster.set(agent.agentId, {...agent});
    
    // Update the visualization
    this.updateTeamVisualization(visualizationId);
    
    this.logger.info(`Added agent ${agent.agentId} to team ${visualizationId}`);
    return true;
  }

  /**
   * Update an agent's role in the roster
   */
  updateAgentRole(visualizationId: string, agentId: string, updates: Partial<AgentRole>): boolean {
    const team = this.teams.get(visualizationId);
    
    if (!team) {
      this.logger.warn(`Team visualization ${visualizationId} not found`);
      return false;
    }
    
    const agent = team.roster.get(agentId);
    
    if (!agent) {
      this.logger.warn(`Agent ${agentId} not found in team ${visualizationId}`);
      return false;
    }
    
    // Update agent role
    team.roster.set(agentId, {
      ...agent,
      ...updates
    });
    
    // Update the visualization
    this.updateTeamVisualization(visualizationId);
    
    this.logger.info(`Updated agent ${agentId} in team ${visualizationId}`);
    return true;
  }

  /**
   * Remove an agent from the roster
   */
  removeAgentFromRoster(visualizationId: string, agentId: string): boolean {
    const team = this.teams.get(visualizationId);
    
    if (!team) {
      this.logger.warn(`Team visualization ${visualizationId} not found`);
      return false;
    }
    
    // Remove agent from roster
    const removed = team.roster.delete(agentId);
    
    if (!removed) {
      this.logger.warn(`Agent ${agentId} not found in team ${visualizationId}`);
      return false;
    }
    
    // Update the visualization
    this.updateTeamVisualization(visualizationId);
    
    this.logger.info(`Removed agent ${agentId} from team ${visualizationId}`);
    return true;
  }

  /**
   * Visualize the team roster
   */
  visualizeTeamRoster(visualizationId: string): VisualizationGraph {
    const team = this.teams.get(visualizationId);
    
    if (!team) {
      this.logger.warn(`Team visualization ${visualizationId} not found`);
      return {
        id: visualizationId,
        name: 'Not Found',
        elements: [],
        connections: [],
        layout: 'force-directed',
        timestamp: new Date(),
        version: 0
      };
    }
    
    // Ensure visualization is up to date
    this.updateTeamVisualization(visualizationId);
    
    return {
      id: visualizationId,
      name: team.name,
      description: `Team roster for meeting ${team.meetingId}`,
      elements: Array.from(team.elements.values()),
      connections: Array.from(team.connections.values()),
      layout: 'force-directed',
      timestamp: team.timestamp,
      version: team.version,
      metadata: {
        meetingId: team.meetingId,
        agentCount: team.roster.size
      }
    };
  }

  /**
   * Get agent role from the roster
   */
  getAgentRole(visualizationId: string, agentId: string): AgentRole {
    const team = this.teams.get(visualizationId);
    
    if (!team) {
      this.logger.warn(`Team visualization ${visualizationId} not found`);
      throw new Error(`Team visualization ${visualizationId} not found`);
    }
    
    const agent = team.roster.get(agentId);
    
    if (!agent) {
      this.logger.warn(`Agent ${agentId} not found in team ${visualizationId}`);
      throw new Error(`Agent ${agentId} not found in team ${visualizationId}`);
    }
    
    return {...agent};
  }

  /**
   * Highlight an agent in the roster visualization
   */
  highlightAgent(visualizationId: string, agentId: string): boolean {
    const team = this.teams.get(visualizationId);
    
    if (!team) {
      this.logger.warn(`Team visualization ${visualizationId} not found`);
      return false;
    }
    
    const agent = team.roster.get(agentId);
    
    if (!agent) {
      this.logger.warn(`Agent ${agentId} not found in team ${visualizationId}`);
      return false;
    }
    
    // Add to highlighted agents set
    team.highlightedAgents.add(agentId);
    
    // Update agent element state
    const elementId = `agent-${agentId}`;
    const element = team.elements.get(elementId);
    
    if (element) {
      element.state = VisualizationElementState.HIGHLIGHTED;
    }
    
    // Update timestamp and version
    team.version += 1;
    team.timestamp = new Date();
    
    this.logger.info(`Highlighted agent ${agentId} in team ${visualizationId}`);
    return true;
  }

  /**
   * Get team composition metrics
   */
  getTeamComposition(visualizationId: string): {
    expertiseCoverage: Record<AgentExpertise, number>;
    teamSize: number;
    specializations: Record<string, number>;
  } {
    const team = this.teams.get(visualizationId);
    
    if (!team) {
      this.logger.warn(`Team visualization ${visualizationId} not found`);
      return {
        expertiseCoverage: {} as Record<AgentExpertise, number>,
        teamSize: 0,
        specializations: {}
      };
    }
    
    // Initialize expertise coverage
    const expertiseCoverage: Record<AgentExpertise, number> = Object.values(AgentExpertise).reduce((acc, expertise) => {
      acc[expertise] = 0;
      return acc;
    }, {} as Record<AgentExpertise, number>);
    
    // Calculate coverage and specializations
    const specializations: Record<string, number> = {};
    
    for (const agent of team.roster.values()) {
      // Add primary expertise (full weight)
      expertiseCoverage[agent.primaryExpertise] += 1;
      
      // Record primary specialization
      const primaryKey = agent.primaryExpertise;
      specializations[primaryKey] = (specializations[primaryKey] || 0) + 1;
      
      // Add secondary expertise (half weight)
      for (const secondaryExpertise of agent.secondaryExpertise) {
        expertiseCoverage[secondaryExpertise] += 0.5;
        
        // Record combined specialization
        const combinedKey = `${agent.primaryExpertise}+${secondaryExpertise}`;
        specializations[combinedKey] = (specializations[combinedKey] || 0) + 1;
      }
    }
    
    return {
      expertiseCoverage,
      teamSize: team.roster.size,
      specializations
    };
  }

  /**
   * Update the team visualization elements and connections
   */
  private updateTeamVisualization(visualizationId: string): void {
    const team = this.teams.get(visualizationId);
    
    if (!team) {
      return;
    }
    
    // Clear existing elements and connections
    team.elements.clear();
    team.connections.clear();
    
    // Create team center element
    const teamElement: VisualizationElement = {
      id: 'team-center',
      type: VisualizationElementType.TOPIC,
      label: team.name,
      description: `Team for meeting ${team.meetingId}`,
      properties: {
        agentCount: team.roster.size
      },
      state: VisualizationElementState.ACTIVE,
      position: { x: 400, y: 300 },
      size: { width: 60, height: 60 },
      color: '#03A9F4', // Light blue
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    team.elements.set(teamElement.id, teamElement);
    
    // Create elements for each expertise type
    const expertiseElements = new Map<AgentExpertise, string>();
    
    // Find all expertise types used in the team
    const expertiseTypes = new Set<AgentExpertise>();
    
    for (const agent of team.roster.values()) {
      expertiseTypes.add(agent.primaryExpertise);
      for (const secondaryExpertise of agent.secondaryExpertise) {
        expertiseTypes.add(secondaryExpertise);
      }
    }
    
    // Create expertise elements
    Array.from(expertiseTypes).forEach((expertise, index) => {
      const angle = (2 * Math.PI * index) / expertiseTypes.size;
      const radius = 150;
      const x = 400 + radius * Math.cos(angle);
      const y = 300 + radius * Math.sin(angle);
      
      const elementId = `expertise-${expertise}`;
      const expertiseElement: VisualizationElement = {
        id: elementId,
        type: VisualizationElementType.TOPIC,
        label: this.formatExpertiseName(expertise),
        description: `${this.formatExpertiseName(expertise)} expertise area`,
        properties: {
          expertise
        },
        state: VisualizationElementState.ACTIVE,
        position: { x, y },
        color: this.getColorForExpertise(expertise),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      team.elements.set(elementId, expertiseElement);
      expertiseElements.set(expertise, elementId);
      
      // Connect to team center
      const connection: VisualizationConnection = {
        id: `team-to-${expertise}`,
        type: VisualizationConnectionType.RELATION,
        sourceId: 'team-center',
        targetId: elementId,
        label: '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      team.connections.set(connection.id, connection);
    });
    
    // Create elements for each agent
    const agents = Array.from(team.roster.entries());
    
    agents.forEach(([agentId, agent], index) => {
      const angle = (2 * Math.PI * index) / agents.length;
      const radius = 250;
      const x = 400 + radius * Math.cos(angle);
      const y = 300 + radius * Math.sin(angle);
      
      const elementId = `agent-${agentId}`;
      const agentElement: VisualizationElement = {
        id: elementId,
        type: VisualizationElementType.AGENT,
        label: `Agent ${agentId}`,
        description: agent.responsibility || `Agent with ${agent.primaryExpertise} expertise`,
        properties: {
          primaryExpertise: agent.primaryExpertise,
          secondaryExpertise: agent.secondaryExpertise,
          responsibility: agent.responsibility,
          contributionScore: agent.contributionScore
        },
        state: team.highlightedAgents.has(agentId) ? 
          VisualizationElementState.HIGHLIGHTED : 
          VisualizationElementState.ACTIVE,
        position: { x, y },
        color: this.getColorForExpertise(agent.primaryExpertise),
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          agentId
        }
      };
      
      team.elements.set(elementId, agentElement);
      
      // Connect to team center
      const teamConnection: VisualizationConnection = {
        id: `team-to-agent-${agentId}`,
        type: VisualizationConnectionType.ASSIGNMENT,
        sourceId: 'team-center',
        targetId: elementId,
        label: '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      team.connections.set(teamConnection.id, teamConnection);
      
      // Connect to primary expertise
      const primaryExpertiseId = expertiseElements.get(agent.primaryExpertise);
      
      if (primaryExpertiseId) {
        const primaryConnection: VisualizationConnection = {
          id: `agent-${agentId}-primary`,
          type: VisualizationConnectionType.ASSIGNMENT,
          sourceId: elementId,
          targetId: primaryExpertiseId,
          label: 'Primary',
          strength: 1.0,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        team.connections.set(primaryConnection.id, primaryConnection);
      }
      
      // Connect to secondary expertise
      agent.secondaryExpertise.forEach((expertise, idx) => {
        const expertiseId = expertiseElements.get(expertise);
        
        if (expertiseId) {
          const secondaryConnection: VisualizationConnection = {
            id: `agent-${agentId}-secondary-${idx}`,
            type: VisualizationConnectionType.RELATION,
            sourceId: elementId,
            targetId: expertiseId,
            label: 'Secondary',
            strength: 0.5,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          team.connections.set(secondaryConnection.id, secondaryConnection);
        }
      });
    });
    
    // Update version and timestamp
    team.version += 1;
    team.timestamp = new Date();
  }

  /**
   * Format expertise name for display
   */
  private formatExpertiseName(expertise: AgentExpertise): string {
    // Convert SNAKE_CASE to Title Case
    return expertise
      .split('_')
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Get a color for expertise
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
    };
    
    return colorMap[expertise] || '#000000';
  }
} 