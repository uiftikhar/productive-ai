import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  AgentRelationship,
  AgentRelationshipVisualization
} from '../../interfaces/visualization.interface';

/**
 * Implementation of the agent relationship visualization service
 * This service manages agent relationships and provides visualization for team structures
 */
export class AgentRelationshipVisualizationImpl implements AgentRelationshipVisualization {
  private logger: Logger;
  private relationships: Map<string, AgentRelationship> = new Map();
  private agentRelationshipIndex: Map<string, Set<string>> = new Map();

  constructor(options: {
    logger?: Logger;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.logger.info('Agent relationship visualization service initialized');
  }

  /**
   * Record a new agent relationship
   */
  recordRelationship(relationship: Omit<AgentRelationship, 'id'>): string {
    const id = uuidv4();
    
    const newRelationship: AgentRelationship = {
      ...relationship,
      id
    };
    
    // Store the relationship
    this.relationships.set(id, newRelationship);
    
    // Update agent indexes
    this.updateAgentIndex(newRelationship.sourceAgentId, id);
    this.updateAgentIndex(newRelationship.targetAgentId, id);
    
    this.logger.debug(`Recorded relationship ${id} between agents ${relationship.sourceAgentId} and ${relationship.targetAgentId}`);
    
    return id;
  }

  /**
   * Update an existing agent relationship
   */
  updateRelationship(relationshipId: string, updates: Partial<AgentRelationship>): boolean {
    const relationship = this.relationships.get(relationshipId);
    
    if (!relationship) {
      this.logger.warn(`Cannot update non-existent relationship: ${relationshipId}`);
      return false;
    }
    
    // Create updated relationship
    const updatedRelationship: AgentRelationship = {
      ...relationship,
      ...updates,
      id: relationshipId // Ensure ID is not changed
    };
    
    // Update the relationship
    this.relationships.set(relationshipId, updatedRelationship);
    
    this.logger.debug(`Updated relationship ${relationshipId}`);
    
    return true;
  }

  /**
   * Get a specific agent relationship
   */
  getRelationship(relationshipId: string): AgentRelationship {
    const relationship = this.relationships.get(relationshipId);
    
    if (!relationship) {
      this.logger.warn(`Relationship not found: ${relationshipId}`);
      throw new Error(`Relationship not found: ${relationshipId}`);
    }
    
    return relationship;
  }

  /**
   * Get all relationships for a specific agent
   */
  getAgentRelationships(agentId: string): AgentRelationship[] {
    const relationshipIds = this.agentRelationshipIndex.get(agentId) || new Set<string>();
    
    const relationships = Array.from(relationshipIds)
      .map(id => this.relationships.get(id))
      .filter(Boolean) as AgentRelationship[];
    
    return relationships;
  }

  /**
   * Visualize team structure for a set of agents
   */
  visualizeTeamStructure(agentIds: string[]): any {
    this.logger.debug(`Visualizing team structure for ${agentIds.length} agents`);
    
    // Collect all relationships among the specified agents
    const relationships: AgentRelationship[] = [];
    const relationshipSet = new Set<string>();
    
    // Gather all relationships where both source and target are in the agent list
    for (const agentId of agentIds) {
      const agentRelationships = this.getAgentRelationships(agentId);
      
      for (const relationship of agentRelationships) {
        if (
          agentIds.includes(relationship.sourceAgentId) && 
          agentIds.includes(relationship.targetAgentId) &&
          !relationshipSet.has(relationship.id)
        ) {
          relationships.push(relationship);
          relationshipSet.add(relationship.id);
        }
      }
    }
    
    // Create nodes for all agents
    const nodes = agentIds.map(agentId => ({
      id: agentId,
      connections: this.getAgentRelationships(agentId).length
    }));
    
    // Create edges for all relationships
    const edges = relationships.map(relationship => ({
      source: relationship.sourceAgentId,
      target: relationship.targetAgentId,
      type: relationship.type,
      strength: relationship.strength
    }));
    
    // Create a team structure visualization object
    const teamStructure = {
      nodes,
      edges,
      metrics: {
        density: this.calculateTeamDensity(agentIds),
        cohesion: this.calculateTeamCohesion(agentIds),
        centralAgents: this.identifyCentralAgents(agentIds)
      }
    };
    
    return teamStructure;
  }

  /**
   * Identify central agents in a team
   */
  identifyCentralAgents(agentIds: string[]): string[] {
    this.logger.debug(`Identifying central agents among ${agentIds.length} agents`);
    
    // Calculate connection counts for each agent
    const connectionCounts = new Map<string, number>();
    
    for (const agentId of agentIds) {
      // Count relationships where this agent is either source or target
      const relationships = this.getAgentRelationships(agentId);
      connectionCounts.set(agentId, relationships.length);
    }
    
    // Sort agents by connection count in descending order
    const sortedAgents = [...connectionCounts.entries()]
      .sort((a, b) => b[1] - a[1]);
    
    // Consider agents in the top 25% as central agents
    const centralCount = Math.max(1, Math.ceil(agentIds.length * 0.25));
    
    // Return the IDs of central agents
    return sortedAgents.slice(0, centralCount).map(entry => entry[0]);
  }

  /**
   * Calculate team cohesion score
   */
  calculateTeamCohesion(agentIds: string[]): number {
    this.logger.debug(`Calculating team cohesion for ${agentIds.length} agents`);
    
    if (agentIds.length <= 1) {
      return 1.0; // A single agent is considered fully cohesive
    }
    
    // Count total relationships within the team
    let relationshipCount = 0;
    let totalStrength = 0;
    
    for (const agentId of agentIds) {
      const relationships = this.getAgentRelationships(agentId)
        .filter(relationship => agentIds.includes(relationship.sourceAgentId) && 
                              agentIds.includes(relationship.targetAgentId));
      
      relationshipCount += relationships.length;
      
      // Sum up relationship strengths
      for (const relationship of relationships) {
        totalStrength += relationship.strength;
      }
    }
    
    // Avoid double-counting by dividing by 2
    relationshipCount = relationshipCount / 2;
    totalStrength = totalStrength / 2;
    
    // Maximum possible relationships in a fully connected team
    const maxPossibleRelationships = (agentIds.length * (agentIds.length - 1)) / 2;
    
    if (maxPossibleRelationships === 0) {
      return 0;
    }
    
    // Calculate connection density (0-1)
    const connectionDensity = relationshipCount / maxPossibleRelationships;
    
    // Calculate average relationship strength (0-1)
    const averageStrength = relationshipCount > 0 ? totalStrength / relationshipCount : 0;
    
    // Combine density and strength for overall cohesion score
    return (connectionDensity * 0.5) + (averageStrength * 0.5);
  }

  /**
   * Helper method to update agent index
   */
  private updateAgentIndex(agentId: string, relationshipId: string): void {
    if (!this.agentRelationshipIndex.has(agentId)) {
      this.agentRelationshipIndex.set(agentId, new Set<string>());
    }
    
    this.agentRelationshipIndex.get(agentId)!.add(relationshipId);
  }

  /**
   * Calculate team density (helper method)
   */
  private calculateTeamDensity(agentIds: string[]): number {
    if (agentIds.length <= 1) {
      return 1.0;
    }
    
    let relationshipCount = 0;
    
    for (const agentId of agentIds) {
      const relationships = this.getAgentRelationships(agentId)
        .filter(relationship => agentIds.includes(relationship.sourceAgentId) && 
                              agentIds.includes(relationship.targetAgentId));
      
      relationshipCount += relationships.length;
    }
    
    // Avoid double-counting
    relationshipCount = relationshipCount / 2;
    
    // Maximum possible relationships
    const maxPossibleRelationships = (agentIds.length * (agentIds.length - 1)) / 2;
    
    if (maxPossibleRelationships === 0) {
      return 0;
    }
    
    return relationshipCount / maxPossibleRelationships;
  }
} 