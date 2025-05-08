/**
 * Specialization Overlap Visualization Service
 * 
 * Implements visualization of overlapping expertise areas among agents.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { AgentExpertise } from '../../interfaces/agent.interface';
import { 
  SpecializationOverlapVisualization, 
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Agent expertise record for visualization
 */
interface AgentExpertiseRecord {
  agentId: string;
  name: string;
  primaryExpertise: AgentExpertise;
  secondaryExpertise: AgentExpertise[];
}

/**
 * Configuration for the SpecializationOverlapVisualizationImpl
 */
export interface SpecializationOverlapVisualizationConfig {
  logger?: Logger;
}

/**
 * Implementation of the SpecializationOverlapVisualization interface
 */
export class SpecializationOverlapVisualizationImpl implements SpecializationOverlapVisualization {
  private logger: Logger;
  private overlapMaps: Map<string, {
    id: string;
    agents: Map<string, AgentExpertiseRecord>;
    elements: Map<string, VisualizationElement>;
    connections: Map<string, VisualizationConnection>;
    version: number;
    timestamp: Date;
  }>;

  /**
   * Create a new specialization overlap visualization service
   */
  constructor(config: SpecializationOverlapVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.overlapMaps = new Map();
    this.logger.info('SpecializationOverlapVisualizationImpl initialized');
  }

  /**
   * Create a new overlap map
   */
  createOverlapMap(name: string): string {
    const mapId = `overlap-map-${uuidv4()}`;
    
    this.overlapMaps.set(mapId, {
      id: mapId,
      agents: new Map<string, AgentExpertiseRecord>(),
      elements: new Map<string, VisualizationElement>(),
      connections: new Map<string, VisualizationConnection>(),
      version: 1,
      timestamp: new Date()
    });
    
    this.logger.info(`Created specialization overlap map ${mapId}`);
    return mapId;
  }

  /**
   * Add an agent to the overlap map
   */
  addAgent(mapId: string, agent: {
    agentId: string;
    name: string;
    primaryExpertise: AgentExpertise;
    secondaryExpertise: AgentExpertise[];
  }): boolean {
    const overlapMap = this.overlapMaps.get(mapId);
    
    if (!overlapMap) {
      this.logger.warn(`Overlap map ${mapId} not found`);
      return false;
    }
    
    // Store agent data
    overlapMap.agents.set(agent.agentId, {
      ...agent
    });
    
    // Update the visualization
    this.updateVisualization(mapId);
    
    this.logger.info(`Added agent ${agent.agentId} to overlap map ${mapId}`);
    return true;
  }

  /**
   * Get the visualization of expertise overlap
   */
  visualizeOverlap(mapId: string): VisualizationGraph {
    const overlapMap = this.overlapMaps.get(mapId);
    
    if (!overlapMap) {
      this.logger.warn(`Overlap map ${mapId} not found`);
      return {
        id: mapId,
        name: 'Not Found',
        elements: [],
        connections: [],
        layout: 'force-directed',
        timestamp: new Date(),
        version: 0
      };
    }
    
    // Ensure visualization is up to date
    this.updateVisualization(mapId);
    
    return {
      id: mapId,
      name: 'Specialization Overlap Map',
      description: 'Visualization of overlapping expertise among agents',
      elements: Array.from(overlapMap.elements.values()),
      connections: Array.from(overlapMap.connections.values()),
      layout: 'force-directed',
      timestamp: overlapMap.timestamp,
      version: overlapMap.version,
      metadata: {
        agentCount: overlapMap.agents.size,
        overlapCount: this.calculateOverlapCount(mapId)
      }
    };
  }

  /**
   * Find agents with overlapping specializations
   */
  findOverlappingAgents(mapId: string, expertise: AgentExpertise): string[] {
    const overlapMap = this.overlapMaps.get(mapId);
    
    if (!overlapMap) {
      this.logger.warn(`Overlap map ${mapId} not found`);
      return [];
    }
    
    // Find agents with this expertise as primary or secondary
    const matchingAgents: string[] = [];
    
    for (const [agentId, agent] of overlapMap.agents.entries()) {
      if (agent.primaryExpertise === expertise || 
          agent.secondaryExpertise.includes(expertise)) {
        matchingAgents.push(agentId);
      }
    }
    
    return matchingAgents;
  }

  /**
   * Identify expertise gaps
   */
  identifyExpertiseGaps(mapId: string): AgentExpertise[] {
    const overlapMap = this.overlapMaps.get(mapId);
    
    if (!overlapMap) {
      this.logger.warn(`Overlap map ${mapId} not found`);
      return [];
    }
    
    // Count coverage for each expertise area
    const expertiseCoverage: Record<AgentExpertise, number> = {} as Record<AgentExpertise, number>;
    
    // Initialize coverage counts
    for (const expertise of Object.values(AgentExpertise)) {
      expertiseCoverage[expertise] = 0;
    }
    
    // Count primary and secondary expertise
    for (const agent of overlapMap.agents.values()) {
      // Primary expertise counts as 1.0
      expertiseCoverage[agent.primaryExpertise] += 1.0;
      
      // Secondary expertise counts as 0.5 each
      for (const secondaryExpertise of agent.secondaryExpertise) {
        expertiseCoverage[secondaryExpertise] += 0.5;
      }
    }
    
    // Identify gaps (areas with coverage < 1.0)
    const gaps: AgentExpertise[] = [];
    
    for (const [expertise, coverage] of Object.entries(expertiseCoverage)) {
      if (coverage < 1.0) {
        gaps.push(expertise as AgentExpertise);
      }
    }
    
    return gaps;
  }

  /**
   * Calculate team versatility score (how well expertise is distributed)
   */
  calculateTeamVersatility(mapId: string): {
    overallScore: number;
    expertiseDistribution: Record<AgentExpertise, number>;
    specialistCount: number;
    generalistCount: number;
  } {
    const overlapMap = this.overlapMaps.get(mapId);
    
    if (!overlapMap) {
      this.logger.warn(`Overlap map ${mapId} not found`);
      return {
        overallScore: 0,
        expertiseDistribution: {} as Record<AgentExpertise, number>,
        specialistCount: 0,
        generalistCount: 0
      };
    }
    
    // Count coverage for each expertise area
    const expertiseDistribution: Record<AgentExpertise, number> = {} as Record<AgentExpertise, number>;
    
    // Initialize distribution counts
    for (const expertise of Object.values(AgentExpertise)) {
      expertiseDistribution[expertise] = 0;
    }
    
    // Count primary and secondary expertise
    for (const agent of overlapMap.agents.values()) {
      expertiseDistribution[agent.primaryExpertise] += 1.0;
      
      for (const secondaryExpertise of agent.secondaryExpertise) {
        expertiseDistribution[secondaryExpertise] += 0.5;
      }
    }
    
    // Calculate overall score (how evenly distributed expertise is)
    const totalExpertise = Object.values(expertiseDistribution).reduce((sum, count) => sum + count, 0);
    const idealDistribution = totalExpertise / Object.keys(expertiseDistribution).length;
    
    let scoreSum = 0;
    for (const count of Object.values(expertiseDistribution)) {
      const deviation = Math.abs(count - idealDistribution);
      scoreSum += deviation;
    }
    
    // Normalize to 0-1 scale (1 is perfect distribution)
    const maxDeviation = totalExpertise; // Worst case: all expertise in one area
    const overallScore = 1 - (scoreSum / maxDeviation);
    
    // Count specialists (agents with narrowly focused expertise)
    // and generalists (agents with broader expertise)
    let specialistCount = 0;
    let generalistCount = 0;
    
    for (const agent of overlapMap.agents.values()) {
      if (agent.secondaryExpertise.length <= 1) {
        specialistCount++;
      } else if (agent.secondaryExpertise.length >= 3) {
        generalistCount++;
      }
    }
    
    return {
      overallScore,
      expertiseDistribution,
      specialistCount,
      generalistCount
    };
  }

  /**
   * Update the visualization of the overlap map
   */
  private updateVisualization(mapId: string): void {
    const overlapMap = this.overlapMaps.get(mapId);
    
    if (!overlapMap) {
      return;
    }
    
    // Clear existing elements and connections
    overlapMap.elements.clear();
    overlapMap.connections.clear();
    
    // Create elements for each agent
    this.createAgentElements(mapId);
    
    // Create elements for each expertise area
    this.createExpertiseElements(mapId);
    
    // Create connections between agents and expertise
    this.createExpertiseConnections(mapId);
    
    // Create connections between agents with overlapping expertise
    this.createAgentOverlapConnections(mapId);
    
    // Update version and timestamp
    overlapMap.version += 1;
    overlapMap.timestamp = new Date();
  }

  /**
   * Create elements for agents
   */
  private createAgentElements(mapId: string): void {
    const overlapMap = this.overlapMaps.get(mapId);
    
    if (!overlapMap) {
      return;
    }
    
    // Create elements for agents
    for (const [agentId, agent] of overlapMap.agents.entries()) {
      const element: VisualizationElement = {
        id: `agent-${agentId}`,
        type: VisualizationElementType.AGENT,
        label: agent.name || `Agent ${agentId}`,
        description: `Agent with ${agent.primaryExpertise} expertise`,
        properties: {
          primaryExpertise: agent.primaryExpertise,
          secondaryExpertise: agent.secondaryExpertise,
          expertiseCount: 1 + agent.secondaryExpertise.length
        },
        state: VisualizationElementState.ACTIVE,
        position: this.calculateRandomPosition(),
        size: {
          width: 40,
          height: 40
        },
        color: this.getColorForExpertise(agent.primaryExpertise),
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          agentId
        }
      };
      
      overlapMap.elements.set(element.id, element);
    }
  }

  /**
   * Create elements for expertise areas
   */
  private createExpertiseElements(mapId: string): void {
    const overlapMap = this.overlapMaps.get(mapId);
    
    if (!overlapMap) {
      return;
    }
    
    // Collect all expertise areas used by agents
    const expertiseAreas = new Set<AgentExpertise>();
    
    for (const agent of overlapMap.agents.values()) {
      expertiseAreas.add(agent.primaryExpertise);
      
      for (const secondaryExpertise of agent.secondaryExpertise) {
        expertiseAreas.add(secondaryExpertise);
      }
    }
    
    // Create elements for expertise areas
    for (const expertise of expertiseAreas) {
      const element: VisualizationElement = {
        id: `expertise-${expertise}`,
        type: VisualizationElementType.TOPIC,
        label: this.formatExpertiseName(expertise),
        description: `${this.formatExpertiseName(expertise)} expertise area`,
        properties: {
          expertise
        },
        state: VisualizationElementState.ACTIVE,
        position: this.calculateRandomPosition(),
        size: {
          width: 60,
          height: 60
        },
        color: this.getColorForExpertise(expertise),
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          expertiseType: expertise
        }
      };
      
      overlapMap.elements.set(element.id, element);
    }
  }

  /**
   * Create connections between agents and expertise
   */
  private createExpertiseConnections(mapId: string): void {
    const overlapMap = this.overlapMaps.get(mapId);
    
    if (!overlapMap) {
      return;
    }
    
    // Create connections between agents and their expertise
    for (const [agentId, agent] of overlapMap.agents.entries()) {
      // Connect to primary expertise
      const primaryConnection: VisualizationConnection = {
        id: `connection-${agentId}-${agent.primaryExpertise}`,
        type: VisualizationConnectionType.ASSIGNMENT, // Primary expertise is a direct assignment
        sourceId: `agent-${agentId}`,
        targetId: `expertise-${agent.primaryExpertise}`,
        label: 'Primary',
        strength: 1.0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      overlapMap.connections.set(primaryConnection.id, primaryConnection);
      
      // Connect to secondary expertise
      for (const secondaryExpertise of agent.secondaryExpertise) {
        const secondaryConnection: VisualizationConnection = {
          id: `connection-${agentId}-${secondaryExpertise}-secondary`,
          type: VisualizationConnectionType.RELATION, // Secondary expertise is a relation
          sourceId: `agent-${agentId}`,
          targetId: `expertise-${secondaryExpertise}`,
          label: 'Secondary',
          strength: 0.5,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        overlapMap.connections.set(secondaryConnection.id, secondaryConnection);
      }
    }
  }

  /**
   * Create connections between agents with overlapping expertise
   */
  private createAgentOverlapConnections(mapId: string): void {
    const overlapMap = this.overlapMaps.get(mapId);
    
    if (!overlapMap) {
      return;
    }
    
    // Track which agent pairs have been connected
    const connectedPairs = new Set<string>();
    
    // For each agent pair, check for overlapping expertise
    const agents = Array.from(overlapMap.agents.entries());
    
    for (let i = 0; i < agents.length; i++) {
      const [agentId1, agent1] = agents[i];
      
      // Get all expertise for agent1
      const agent1Expertise = [agent1.primaryExpertise, ...agent1.secondaryExpertise];
      
      for (let j = i + 1; j < agents.length; j++) {
        const [agentId2, agent2] = agents[j];
        
        // Get all expertise for agent2
        const agent2Expertise = [agent2.primaryExpertise, ...agent2.secondaryExpertise];
        
        // Find overlapping expertise
        const overlappingExpertise = agent1Expertise.filter(exp => 
          agent2Expertise.includes(exp));
        
        if (overlappingExpertise.length > 0) {
          // Create a connection for the overlap
          const pairKey = `${agentId1}-${agentId2}`;
          
          if (!connectedPairs.has(pairKey)) {
            connectedPairs.add(pairKey);
            
            const overlapConnection: VisualizationConnection = {
              id: `overlap-${agentId1}-${agentId2}`,
              type: VisualizationConnectionType.RELATION,
              sourceId: `agent-${agentId1}`,
              targetId: `agent-${agentId2}`,
              label: `Overlapping: ${overlappingExpertise.map(exp => this.formatExpertiseName(exp)).join(', ')}`,
              strength: 0.3 + (overlappingExpertise.length * 0.1), // Stronger connection for more overlap
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            overlapMap.connections.set(overlapConnection.id, overlapConnection);
          }
        }
      }
    }
  }

  /**
   * Calculate the number of overlap connections
   */
  private calculateOverlapCount(mapId: string): number {
    const overlapMap = this.overlapMaps.get(mapId);
    
    if (!overlapMap) {
      return 0;
    }
    
    // Count connections between agents (not connections to expertise elements)
    let overlapCount = 0;
    
    for (const connection of overlapMap.connections.values()) {
      if (connection.sourceId.startsWith('agent-') && 
          connection.targetId.startsWith('agent-')) {
        overlapCount++;
      }
    }
    
    return overlapCount;
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
   * Get a color for a given expertise
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

  /**
   * Generate a random position for layout
   */
  private calculateRandomPosition(): { x: number; y: number } {
    return {
      x: Math.random() * 800 + 100,
      y: Math.random() * 600 + 100
    };
  }

  /**
   * Calculate expertise overlap between agents
   */
  calculateExpertiseOverlap(meetingId: string): Record<AgentExpertise, {
    agents: string[];
    overlapDegree: number; // 0-1 scale
  }> {
    // Use a map ID that incorporates the meeting ID
    const mapId = `overlap-${meetingId}`;
    const overlapMap = this.overlapMaps.get(mapId);
    
    if (!overlapMap) {
      this.logger.warn(`No overlap map found for meeting ${meetingId}`);
      const emptyResult: Record<AgentExpertise, { agents: string[]; overlapDegree: number }> = {} as Record<AgentExpertise, { agents: string[]; overlapDegree: number }>;
      
      // Initialize with empty values for all expertise types
      for (const expertise of Object.values(AgentExpertise)) {
        emptyResult[expertise] = { agents: [], overlapDegree: 0 };
      }
      
      return emptyResult;
    }
    
    // Calculate overlap for each expertise area
    const result: Record<AgentExpertise, { agents: string[]; overlapDegree: number }> = {} as Record<AgentExpertise, { agents: string[]; overlapDegree: number }>;
    
    // Initialize result for each expertise type
    for (const expertise of Object.values(AgentExpertise)) {
      result[expertise] = {
        agents: [],
        overlapDegree: 0
      };
    }
    
    // Calculate for each expertise area
    for (const expertise of Object.values(AgentExpertise)) {
      // Find agents with this expertise (primary or secondary)
      const agentsWithExpertise: string[] = [];
      
      for (const [agentId, agent] of overlapMap.agents.entries()) {
        if (agent.primaryExpertise === expertise || agent.secondaryExpertise.includes(expertise)) {
          agentsWithExpertise.push(agentId);
        }
      }
      
      // Calculate overlap degree
      // 0 = no overlap (only one agent or none)
      // 0-1 = degree of overlap (higher means more overlapping agents)
      let overlapDegree = 0;
      
      if (agentsWithExpertise.length > 1) {
        // Count primary vs secondary
        let primaryCount = 0;
        
        for (const agentId of agentsWithExpertise) {
          const agent = overlapMap.agents.get(agentId);
          if (agent && agent.primaryExpertise === expertise) {
            primaryCount++;
          }
        }
        
        // Calculate overlap considering primary vs secondary distinction
        const primaryWeight = 0.7;
        const secondaryWeight = 0.3;
        const secondaryCount = agentsWithExpertise.length - primaryCount;
        
        // Higher score for multiple primary experts
        if (primaryCount > 1) {
          overlapDegree = Math.min(1.0, (primaryCount - 1) * 0.5);
        }
        
        // Add contribution from secondary experts
        if (secondaryCount > 0) {
          overlapDegree += Math.min(0.5, secondaryCount * 0.2);
        }
        
        // Ensure it's within 0-1 range
        overlapDegree = Math.min(1.0, overlapDegree);
      }
      
      result[expertise] = {
        agents: agentsWithExpertise,
        overlapDegree
      };
    }
    
    return result;
  }

  /**
   * Visualize expertise overlap for a meeting
   */
  visualizeExpertiseOverlap(meetingId: string): any {
    // Use a map ID that incorporates the meeting ID
    const mapId = `overlap-${meetingId}`;
    
    // Check if map exists
    if (!this.overlapMaps.has(mapId)) {
      // Create a new map for this meeting
      this.createOverlapMap(meetingId);
    }
    
    // Return the visualization
    return this.visualizeOverlap(mapId);
  }

  /**
   * Identify redundant expertise in the team
   */
  identifyRedundancies(meetingId: string): Array<{
    expertise: AgentExpertise;
    agentIds: string[];
    redundancyScore: number; // 0-1 scale
  }> {
    const overlap = this.calculateExpertiseOverlap(meetingId);
    const redundancies: Array<{
      expertise: AgentExpertise;
      agentIds: string[];
      redundancyScore: number;
    }> = [];
    
    // Analyze each expertise area for redundancy
    for (const [expertise, data] of Object.entries(overlap)) {
      // Only consider areas with multiple agents and high overlap
      if (data.agents.length > 1 && data.overlapDegree > 0.5) {
        redundancies.push({
          expertise: expertise as AgentExpertise,
          agentIds: data.agents,
          redundancyScore: data.overlapDegree
        });
      }
    }
    
    // Sort by redundancy score (highest first)
    redundancies.sort((a, b) => b.redundancyScore - a.redundancyScore);
    
    return redundancies;
  }

  /**
   * Suggest optimizations for team expertise distribution
   */
  suggestOptimizations(meetingId: string): {
    removeAgents: string[];
    reassignExpertise: Array<{ agentId: string; from: AgentExpertise; to: AgentExpertise }>;
    addExpertise: Array<{ agentId: string; expertise: AgentExpertise }>;
  } {
    // Use a map ID that incorporates the meeting ID
    const mapId = `overlap-${meetingId}`;
    const overlapMap = this.overlapMaps.get(mapId);
    
    const result = {
      removeAgents: [] as string[],
      reassignExpertise: [] as Array<{ agentId: string; from: AgentExpertise; to: AgentExpertise }>,
      addExpertise: [] as Array<{ agentId: string; expertise: AgentExpertise }>
    };
    
    if (!overlapMap) {
      return result;
    }
    
    // Find redundancies
    const redundancies = this.identifyRedundancies(meetingId);
    
    // Find gaps
    const gaps = this.identifyExpertiseGaps(mapId);
    
    // If we have redundancies and gaps, suggest reassignments
    if (redundancies.length > 0 && gaps.length > 0) {
      // For each redundancy, find the most suitable agent to reassign
      for (const redundancy of redundancies) {
        // Skip if we're out of gaps to fill
        if (gaps.length === 0) break;
        
        const expertise = redundancy.expertise;
        const agentIds = redundancy.agentIds;
        
        // Find agents with this as secondary expertise only
        const secondaryAgents = [];
        
        for (const agentId of agentIds) {
          const agent = overlapMap.agents.get(agentId);
          if (agent && agent.primaryExpertise !== expertise && agent.secondaryExpertise.includes(expertise)) {
            secondaryAgents.push(agentId);
          }
        }
        
        // If we have agents with this as secondary expertise, suggest reassigning them
        if (secondaryAgents.length > 0) {
          const agentToReassign = secondaryAgents[0];
          const targetExpertise = gaps.shift()!; // Take the first gap
          
          result.reassignExpertise.push({
            agentId: agentToReassign,
            from: expertise,
            to: targetExpertise
          });
        }
      }
    }
    
    // For remaining gaps, suggest adding expertise to agents with fewer specializations
    if (gaps.length > 0) {
      // Find agents with fewest expertise areas
      const agentsByExpertiseCount = Array.from(overlapMap.agents.entries())
        .map(([agentId, agent]) => ({
          agentId,
          expertiseCount: 1 + agent.secondaryExpertise.length
        }))
        .sort((a, b) => a.expertiseCount - b.expertiseCount);
      
      // Assign gaps to agents with fewest expertise areas
      for (let i = 0; i < gaps.length && i < agentsByExpertiseCount.length; i++) {
        result.addExpertise.push({
          agentId: agentsByExpertiseCount[i].agentId,
          expertise: gaps[i]
        });
      }
    }
    
    // In extreme cases of high redundancy, suggest removing agents
    // Only if there are no gaps to fill and multiple agents have the same primary expertise
    if (gaps.length === 0 && redundancies.length > 0) {
      const highestRedundancy = redundancies[0];
      
      if (highestRedundancy.redundancyScore > 0.8) {
        // Find agents with this as primary expertise
        const primaryAgents = [];
        
        for (const agentId of highestRedundancy.agentIds) {
          const agent = overlapMap.agents.get(agentId);
          if (agent && agent.primaryExpertise === highestRedundancy.expertise) {
            primaryAgents.push(agentId);
          }
        }
        
        // If we have multiple primary agents, suggest removing one
        if (primaryAgents.length > 1) {
          // Choose the agent with the least secondary expertise (less versatile)
          const agentToRemove = primaryAgents
            .map(agentId => ({
              agentId,
              secondaryCount: overlapMap.agents.get(agentId)?.secondaryExpertise.length || 0
            }))
            .sort((a, b) => a.secondaryCount - b.secondaryCount)[0].agentId;
          
          result.removeAgents.push(agentToRemove);
        }
      }
    }
    
    return result;
  }
} 