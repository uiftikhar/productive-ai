/**
 * Communication Network Visualization Service
 * 
 * Implements visualization of communication networks for meeting analysis.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { 
  CommunicationNetworkVisualization,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Communication record
 */
interface Communication {
  id: string;
  meetingId: string;
  timestamp: Date;
  sourceAgentId: string;
  targetAgentId: string;
  communicationType: string;
  content: string;
  relatedEntityId?: string;
  responseToId?: string;
}

/**
 * Meeting communication data
 */
interface MeetingCommunicationData {
  id: string;
  meetingId: string;
  communications: Map<string, Communication>;
  agentCommunicationCounts: Map<string, number>; // agentId to outgoing communication count
  connectionStrengths: Map<string, number>; // source-target key to communication count
  elements: Map<string, VisualizationElement>;
  connections: Map<string, VisualizationConnection>;
  version: number;
  timestamp: Date;
}

/**
 * Configuration for the CommunicationNetworkVisualizationImpl
 */
export interface CommunicationNetworkVisualizationConfig {
  logger?: Logger;
}

/**
 * Implementation of the CommunicationNetworkVisualization interface
 */
export class CommunicationNetworkVisualizationImpl implements CommunicationNetworkVisualization {
  private logger: Logger;
  private meetingCommunications: Map<string, MeetingCommunicationData>;

  /**
   * Create a new communication network visualization service
   */
  constructor(config: CommunicationNetworkVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.meetingCommunications = new Map();
    this.logger.info('CommunicationNetworkVisualizationImpl initialized');
  }

  /**
   * Record a communication
   */
  recordCommunication(meetingId: string, communication: {
    timestamp: Date;
    sourceAgentId: string;
    targetAgentId: string;
    communicationType: string;
    content: string;
    relatedEntityId?: string;
    responseToId?: string;
  }): string {
    // Ensure meeting data exists
    if (!this.meetingCommunications.has(meetingId)) {
      this.createMeetingCommunicationData(meetingId);
    }
    
    const meetingData = this.meetingCommunications.get(meetingId)!;
    
    // Create the communication record
    const communicationId = `communication-${uuidv4()}`;
    const newCommunication: Communication = {
      id: communicationId,
      meetingId,
      timestamp: communication.timestamp,
      sourceAgentId: communication.sourceAgentId,
      targetAgentId: communication.targetAgentId,
      communicationType: communication.communicationType,
      content: communication.content,
      relatedEntityId: communication.relatedEntityId,
      responseToId: communication.responseToId
    };
    
    // Store the communication
    meetingData.communications.set(communicationId, newCommunication);
    
    // Update agent communication counts
    const sourceAgentId = communication.sourceAgentId;
    const currentCount = meetingData.agentCommunicationCounts.get(sourceAgentId) || 0;
    meetingData.agentCommunicationCounts.set(sourceAgentId, currentCount + 1);
    
    // Update connection strengths
    const connectionKey = this.getConnectionKey(sourceAgentId, communication.targetAgentId);
    const currentStrength = meetingData.connectionStrengths.get(connectionKey) || 0;
    meetingData.connectionStrengths.set(connectionKey, currentStrength + 1);
    
    // Update version and timestamp
    meetingData.version += 1;
    meetingData.timestamp = new Date();
    
    this.logger.info(`Recorded communication ${communicationId} for meeting ${meetingId}`);
    return communicationId;
  }

  /**
   * Visualize the communication network
   */
  visualizeCommunicationNetwork(meetingId: string): VisualizationGraph {
    // Check if meeting data exists
    if (!this.meetingCommunications.has(meetingId)) {
      this.logger.warn(`No communication data found for meeting ${meetingId}`);
      return {
        id: `comm-network-${meetingId}`,
        name: `Communication Network - Meeting ${meetingId}`,
        elements: [],
        connections: [],
        layout: 'force-directed',
        timestamp: new Date(),
        version: 0
      };
    }
    
    const meetingData = this.meetingCommunications.get(meetingId)!;
    
    // Update the visualization data
    this.updateVisualization(meetingId);
    
    return {
      id: `comm-network-${meetingId}`,
      name: `Communication Network - Meeting ${meetingId}`,
      description: 'Visualization of agent communication patterns',
      elements: Array.from(meetingData.elements.values()),
      connections: Array.from(meetingData.connections.values()),
      layout: 'force-directed',
      timestamp: meetingData.timestamp,
      version: meetingData.version,
      metadata: {
        meetingId,
        communicationCount: meetingData.communications.size,
        agentCount: this.getUniqueAgentCount(meetingId)
      }
    };
  }

  /**
   * Calculate network metrics
   */
  calculateNetworkMetrics(meetingId: string): {
    density: number;
    centralAgents: string[];
    communicationDistribution: Record<string, number>;
    effectivenessScore: number;
  } {
    if (!this.meetingCommunications.has(meetingId)) {
      this.logger.warn(`No communication data found for meeting ${meetingId}`);
      return {
        density: 0,
        centralAgents: [],
        communicationDistribution: {},
        effectivenessScore: 0
      };
    }
    
    const meetingData = this.meetingCommunications.get(meetingId)!;
    
    // Get all unique agents
    const agents = this.getUniqueAgents(meetingId);
    const agentCount = agents.length;
    
    if (agentCount <= 1) {
      return {
        density: 0,
        centralAgents: agents,
        communicationDistribution: this.createCommunicationDistribution(meetingId),
        effectivenessScore: 0
      };
    }
    
    // Calculate network density
    // Density = actual connections / possible connections
    // For directed network: possible connections = n * (n-1)
    const possibleConnections = agentCount * (agentCount - 1);
    const actualConnections = meetingData.connectionStrengths.size;
    const density = possibleConnections > 0 ? actualConnections / possibleConnections : 0;
    
    // Find central agents based on both incoming and outgoing communications
    const incomingComms = new Map<string, number>();
    const outgoingComms = new Map<string, number>(meetingData.agentCommunicationCounts);
    
    // Calculate incoming communications for each agent
    for (const communication of meetingData.communications.values()) {
      const targetAgent = communication.targetAgentId;
      const currentCount = incomingComms.get(targetAgent) || 0;
      incomingComms.set(targetAgent, currentCount + 1);
    }
    
    // Calculate centrality based on total communications (incoming + outgoing)
    const centralityScores = new Map<string, number>();
    
    for (const agent of agents) {
      const incoming = incomingComms.get(agent) || 0;
      const outgoing = outgoingComms.get(agent) || 0;
      centralityScores.set(agent, incoming + outgoing);
    }
    
    // Get top 3 most central agents
    const centralAgents = Array.from(centralityScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([agent]) => agent);
    
    // Calculate effectiveness score
    // Based on density, balance of communication, and response rates
    
    // First, check communication balance
    const commCounts = Array.from(centralityScores.values());
    const avgComm = commCounts.reduce((sum, count) => sum + count, 0) / commCounts.length;
    
    let balanceSum = 0;
    for (const count of commCounts) {
      balanceSum += Math.abs(count - avgComm);
    }
    
    const balanceScore = 1 - Math.min(1, balanceSum / (avgComm * commCounts.length));
    
    // Check response rate
    let responseCount = 0;
    for (const comm of meetingData.communications.values()) {
      if (comm.responseToId) {
        responseCount++;
      }
    }
    
    const responseRate = meetingData.communications.size > 0 ? 
      responseCount / meetingData.communications.size : 0;
    
    // Combine factors for effectiveness score
    const effectivenessScore = (density * 0.3) + (balanceScore * 0.4) + (responseRate * 0.3);
    
    return {
      density,
      centralAgents,
      communicationDistribution: this.createCommunicationDistribution(meetingId),
      effectivenessScore
    };
  }

  /**
   * Identify communication patterns
   */
  identifyCommunicationPatterns(meetingId: string): {
    type: string;
    participants: string[];
    frequency: number;
    effectivenessScore: number;
  }[] {
    if (!this.meetingCommunications.has(meetingId)) {
      this.logger.warn(`No communication data found for meeting ${meetingId}`);
      return [];
    }
    
    const meetingData = this.meetingCommunications.get(meetingId)!;
    const patterns: Array<{
      type: string;
      participants: string[];
      frequency: number;
      effectivenessScore: number;
    }> = [];
    
    // Identify bidirectional communication pairs
    const bidirectionalPairs = new Map<string, {
      agents: [string, string];
      count: number;
    }>();
    
    // Count communications between each pair
    for (const [key, count] of meetingData.connectionStrengths.entries()) {
      const [source, target] = this.parseConnectionKey(key);
      
      // Skip self-communications
      if (source === target) {
        continue;
      }
      
      // Check if reverse connection exists
      const reverseKey = this.getConnectionKey(target, source);
      const reverseCount = meetingData.connectionStrengths.get(reverseKey) || 0;
      
      if (reverseCount > 0) {
        // This is a bidirectional pair
        // Use a normalized key to avoid duplicates
        const pairKey = [source, target].sort().join('-');
        
        if (bidirectionalPairs.has(pairKey)) {
          const pairData = bidirectionalPairs.get(pairKey)!;
          pairData.count += count;
        } else {
          bidirectionalPairs.set(pairKey, {
            agents: [source, target],
            count: count + reverseCount
          });
        }
      }
    }
    
    // Convert bidirectional pairs to patterns
    for (const pair of bidirectionalPairs.values()) {
      patterns.push({
        type: 'bidirectional',
        participants: pair.agents,
        frequency: pair.count,
        effectivenessScore: Math.min(1, pair.count / 10) // Normalize to 0-1 scale
      });
    }
    
    // Identify hub patterns (one agent communicating with many others)
    const agents = this.getUniqueAgents(meetingId);
    
    for (const agent of agents) {
      const outgoingConnections = new Set<string>();
      const incomingConnections = new Set<string>();
      
      // Count outgoing connections
      for (const communication of meetingData.communications.values()) {
        if (communication.sourceAgentId === agent) {
          outgoingConnections.add(communication.targetAgentId);
        }
        
        if (communication.targetAgentId === agent) {
          incomingConnections.add(communication.sourceAgentId);
        }
      }
      
      // Check if this is a hub (connects to many agents)
      if (outgoingConnections.size >= 3) {
        patterns.push({
          type: 'broadcast_hub',
          participants: [agent, ...outgoingConnections],
          frequency: meetingData.agentCommunicationCounts.get(agent) || 0,
          effectivenessScore: incomingConnections.size / outgoingConnections.size // Effectiveness based on reciprocity
        });
      }
      
      // Check if this is a collector (receives from many agents)
      if (incomingConnections.size >= 3) {
        patterns.push({
          type: 'collector',
          participants: [...incomingConnections, agent],
          frequency: incomingConnections.size,
          effectivenessScore: outgoingConnections.size / incomingConnections.size // Effectiveness based on responses
        });
      }
    }
    
    // Identify chains (A→B→C)
    const chains = this.identifyCommunicationChains(meetingId);
    for (const chain of chains) {
      if (chain.agents.length >= 3) {
        patterns.push({
          type: 'chain',
          participants: chain.agents,
          frequency: chain.strength,
          effectivenessScore: Math.min(1, chain.strength / 3) // Normalize to 0-1 scale
        });
      }
    }
    
    // Sort patterns by frequency
    patterns.sort((a, b) => b.frequency - a.frequency);
    
    return patterns;
  }

  /**
   * Create empty meeting communication data
   */
  private createMeetingCommunicationData(meetingId: string): void {
    this.meetingCommunications.set(meetingId, {
      id: `comm-${uuidv4()}`,
      meetingId,
      communications: new Map<string, Communication>(),
      agentCommunicationCounts: new Map<string, number>(),
      connectionStrengths: new Map<string, number>(),
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
    if (!this.meetingCommunications.has(meetingId)) {
      return;
    }
    
    const meetingData = this.meetingCommunications.get(meetingId)!;
    
    // Clear existing elements and connections
    meetingData.elements.clear();
    meetingData.connections.clear();
    
    // Get all unique agents
    const agents = this.getUniqueAgents(meetingId);
    
    // Calculate positions using a circular layout
    agents.forEach((agentId, index) => {
      const angle = (2 * Math.PI * index) / agents.length;
      const radius = 300;
      const x = 400 + radius * Math.cos(angle);
      const y = 300 + radius * Math.sin(angle);
      
      // Size based on communication count
      const commCount = meetingData.agentCommunicationCounts.get(agentId) || 0;
      const size = Math.max(40, Math.min(100, 40 + commCount * 5));
      
      // Create element
      const element: VisualizationElement = {
        id: `agent-${agentId}`,
        type: VisualizationElementType.AGENT,
        label: `Agent ${agentId}`,
        description: `${commCount} outgoing communications`,
        properties: {
          agentId,
          communicationCount: commCount
        },
        state: VisualizationElementState.ACTIVE,
        position: { x, y },
        size: { width: size, height: size },
        color: this.getColorForAgent(agentId, commCount),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      meetingData.elements.set(element.id, element);
    });
    
    // Create connections between agents
    for (const [key, strength] of meetingData.connectionStrengths.entries()) {
      const [sourceId, targetId] = this.parseConnectionKey(key);
      
      const sourceElementId = `agent-${sourceId}`;
      const targetElementId = `agent-${targetId}`;
      
      // Skip if elements don't exist
      if (!meetingData.elements.has(sourceElementId) || !meetingData.elements.has(targetElementId)) {
        continue;
      }
      
      // Connection width based on strength (number of communications)
      const normalizedStrength = Math.min(1, strength / 10);
      
      const connection: VisualizationConnection = {
        id: `connection-${sourceId}-${targetId}`,
        type: VisualizationConnectionType.COMMUNICATION,
        sourceId: sourceElementId,
        targetId: targetElementId,
        label: `${strength} messages`,
        properties: {
          communicationCount: strength
        },
        strength: normalizedStrength,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      meetingData.connections.set(connection.id, connection);
    }
    
    // Add visual indicator for frequent communication patterns
    const patterns = this.identifyCommunicationPatterns(meetingId)
      .filter(p => p.effectivenessScore > 0.5) // Only highlight effective patterns
      .slice(0, 3); // Top 3 patterns
    
    patterns.forEach((pattern, index) => {
      // Create a central node for the pattern
      const patternId = `pattern-${index}`;
      
      // Find center position for the pattern
      const participants = pattern.participants;
      let centerX = 0;
      let centerY = 0;
      
      for (const participantId of participants) {
        const elementId = `agent-${participantId}`;
        const element = meetingData.elements.get(elementId);
        
        if (element && element.position) {
          centerX += element.position.x;
          centerY += element.position.y;
        }
      }
      
      centerX /= participants.length || 1;
      centerY /= participants.length || 1;
      
      const patternElement: VisualizationElement = {
        id: patternId,
        type: VisualizationElementType.INSIGHT,
        label: `${pattern.type} Pattern`,
        description: `${pattern.participants.length} participants, effectiveness: ${Math.round(pattern.effectivenessScore * 100)}%`,
        properties: {
          patternType: pattern.type,
          participants: pattern.participants,
          effectiveness: pattern.effectivenessScore
        },
        state: VisualizationElementState.HIGHLIGHTED,
        position: { x: centerX, y: centerY },
        size: { width: 40, height: 40 },
        color: '#8E24AA', // Purple for patterns
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      meetingData.elements.set(patternId, patternElement);
      
      // Connect pattern to participants
      for (const participantId of participants) {
        const elementId = `agent-${participantId}`;
        
        if (meetingData.elements.has(elementId)) {
          const connectionId = `pattern-conn-${index}-${participantId}`;
          
          const connection: VisualizationConnection = {
            id: connectionId,
            type: VisualizationConnectionType.INFLUENCE,
            sourceId: patternId,
            targetId: elementId,
            label: '',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          meetingData.connections.set(connectionId, connection);
        }
      }
    });
  }

  /**
   * Get all unique agents involved in communications
   */
  private getUniqueAgents(meetingId: string): string[] {
    if (!this.meetingCommunications.has(meetingId)) {
      return [];
    }
    
    const meetingData = this.meetingCommunications.get(meetingId)!;
    const agents = new Set<string>();
    
    for (const communication of meetingData.communications.values()) {
      agents.add(communication.sourceAgentId);
      agents.add(communication.targetAgentId);
    }
    
    return Array.from(agents);
  }

  /**
   * Get the count of unique agents
   */
  private getUniqueAgentCount(meetingId: string): number {
    return this.getUniqueAgents(meetingId).length;
  }

  /**
   * Create a communication distribution record
   */
  private createCommunicationDistribution(meetingId: string): Record<string, number> {
    if (!this.meetingCommunications.has(meetingId)) {
      return {};
    }
    
    const meetingData = this.meetingCommunications.get(meetingId)!;
    const distribution: Record<string, number> = {};
    
    for (const [agentId, count] of meetingData.agentCommunicationCounts.entries()) {
      distribution[agentId] = count;
    }
    
    return distribution;
  }

  /**
   * Get a connection key for the strength map
   */
  private getConnectionKey(sourceAgentId: string, targetAgentId: string): string {
    return `${sourceAgentId}->${targetAgentId}`;
  }

  /**
   * Parse a connection key
   */
  private parseConnectionKey(key: string): [string, string] {
    const parts = key.split('->');
    return [parts[0], parts[1]];
  }

  /**
   * Identify communication chains
   */
  private identifyCommunicationChains(meetingId: string): Array<{
    agents: string[];
    strength: number;
  }> {
    if (!this.meetingCommunications.has(meetingId)) {
      return [];
    }
    
    const meetingData = this.meetingCommunications.get(meetingId)!;
    
    // Create a graph of connections
    const graph = new Map<string, string[]>();
    
    for (const [key] of meetingData.connectionStrengths.entries()) {
      const [sourceId, targetId] = this.parseConnectionKey(key);
      
      if (!graph.has(sourceId)) {
        graph.set(sourceId, []);
      }
      
      graph.get(sourceId)!.push(targetId);
    }
    
    // Find chains of length 3 or more
    const chains: Array<{
      agents: string[];
      strength: number;
    }> = [];
    
    const agents = this.getUniqueAgents(meetingId);
    
    for (const startAgent of agents) {
      this.findChains(startAgent, [], graph, chains, meetingData.connectionStrengths);
    }
    
    return chains;
  }

  /**
   * Recursive helper for finding chains
   */
  private findChains(
    current: string,
    path: string[],
    graph: Map<string, string[]>,
    chains: Array<{ agents: string[]; strength: number }>,
    strengths: Map<string, number>,
    maxDepth = 5
  ): void {
    // Add current node to path
    const newPath = [...path, current];
    
    // If path is long enough, add it as a chain
    if (newPath.length >= 3) {
      // Calculate chain strength
      let minStrength = Number.MAX_VALUE;
      
      for (let i = 0; i < newPath.length - 1; i++) {
        const source = newPath[i];
        const target = newPath[i + 1];
        const key = this.getConnectionKey(source, target);
        const strength = strengths.get(key) || 0;
        
        minStrength = Math.min(minStrength, strength);
      }
      
      chains.push({
        agents: newPath,
        strength: minStrength
      });
    }
    
    // Stop if reached max depth
    if (newPath.length >= maxDepth) {
      return;
    }
    
    // Continue search
    const neighbors = graph.get(current) || [];
    
    for (const neighbor of neighbors) {
      // Avoid cycles
      if (!newPath.includes(neighbor)) {
        this.findChains(neighbor, newPath, graph, chains, strengths, maxDepth);
      }
    }
  }

  /**
   * Get color for agent node
   */
  private getColorForAgent(agentId: string, communicationCount: number): string {
    // Assign colors based on communication activity
    if (communicationCount > 20) {
      return '#E53935'; // Red for very active
    } else if (communicationCount > 10) {
      return '#FB8C00'; // Orange for moderately active
    } else if (communicationCount > 5) {
      return '#43A047'; // Green for somewhat active
    } else {
      return '#1E88E5'; // Blue for less active
    }
  }
} 