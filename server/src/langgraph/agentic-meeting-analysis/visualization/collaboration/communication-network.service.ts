/**
 * @deprecated This file is deprecated and will be removed in a future release.
 * It uses components from the deprecated adaptive visualization framework.
 * Please use hierarchical visualization components that align with the supervisor-manager-worker pattern.
 * See server/src/langgraph/HIERARCHICAL-ARCHITECTURE.md for more information.
 * 
 * Communication Network Visualization Service
 * 
 * Implements visualization of the communication network between agents and participants.
 * Leverages the core RealTimeGraphRenderer service from adaptive visualization.
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
import { GraphNodeState } from '../../interfaces/visualization.interface';

// Using any as temporary type to avoid linting errors in deprecated code
type RealTimeGraphRendererType = any;

/**
 * Configuration for the CommunicationNetworkVisualizationImpl
 */
export interface CommunicationNetworkVisualizationConfig {
  logger?: Logger;
  graphRenderer?: RealTimeGraphRendererType;
}

/**
 * Communication event for network visualization
 */
interface CommunicationEvent {
  id: string;
  timestamp: Date;
  sourceAgentId: string;
  targetAgentId: string;
  communicationType: string;
  content: string;
  relatedEntityId?: string;
  responseToId?: string;
}

/**
 * Agent node in communication network
 */
interface AgentNode {
  id: string;
  name: string;
  role?: string;
  outgoingMessages: number;
  incomingMessages: number;
  lastActive: Date;
  centrality: number; // 0-1 scale
}

/**
 * Communication channel between agents
 */
interface CommunicationChannel {
  sourceAgentId: string;
  targetAgentId: string;
  messageCount: number;
  lastActive: Date;
  primaryTypes: Record<string, number>; // Message type frequency
}

/**
 * Implementation of the CommunicationNetworkVisualization interface
 * Uses the core RealTimeGraphRenderer service for graph management and visualization
 */
export class CommunicationNetworkVisualizationImpl implements CommunicationNetworkVisualization {
  private logger: Logger;
  private graphRenderer: RealTimeGraphRendererType;
  private networks: Map<string, {
    meetingId: string;
    graphId: string;
    communications: Map<string, CommunicationEvent>;
    agents: Map<string, AgentNode>;
    channels: Map<string, CommunicationChannel>;
    elements: Map<string, VisualizationElement>;
    connections: Map<string, VisualizationConnection>;
    version: number;
    timestamp: Date;
  }>;

  /**
   * Create a new communication network visualization service
   */
  constructor(config: CommunicationNetworkVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.graphRenderer = config.graphRenderer || { 
      initializeGraph: () => 'mock-graph-id',
      logger: this.logger 
    };
    this.networks = new Map();
    this.logger.info('CommunicationNetworkVisualizationImpl initialized, using core RealTimeGraphRenderer service');
  }

  /**
   * Record a communication event in the network
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
    // Ensure network exists for this meeting
    let networkId = this.getNetworkIdForMeeting(meetingId);
    
    if (!networkId) {
      // Create a new network if none exists
      networkId = `network-${uuidv4()}`;
      this.createNetworkForMeeting(meetingId, networkId);
    }
    
    const network = this.networks.get(networkId);
    
    if (!network) {
      this.logger.error(`Network ${networkId} not found for meeting ${meetingId}`);
      throw new Error(`Network not found for meeting ${meetingId}`);
    }
    
    // Create communication record
    const communicationId = `comm-${uuidv4()}`;
    
    const newCommunication: CommunicationEvent = {
      id: communicationId,
      timestamp: communication.timestamp,
      sourceAgentId: communication.sourceAgentId,
      targetAgentId: communication.targetAgentId,
      communicationType: communication.communicationType,
      content: communication.content,
      relatedEntityId: communication.relatedEntityId,
      responseToId: communication.responseToId
    };
    
    network.communications.set(communicationId, newCommunication);
    
    // Update agent nodes
    this.updateAgentNodes(networkId, newCommunication);
    
    // Update communication channels
    this.updateCommunicationChannel(networkId, newCommunication);
    
    // Update visualization elements and connections
    this.updateNetworkVisualization(networkId);
    
    // Update network metadata
    network.version += 1;
    network.timestamp = new Date();
    
    this.logger.info(`Recorded communication ${communicationId} for meeting ${meetingId}`);
    return communicationId;
  }

  /**
   * Get the full visualization graph for the communication network
   */
  visualizeCommunicationNetwork(meetingId: string): VisualizationGraph {
    const networkId = this.getNetworkIdForMeeting(meetingId);
    
    if (!networkId) {
      this.logger.warn(`No network found for meeting ${meetingId}`);
      return {
        id: `network-${meetingId}`,
        name: 'No Communication Network',
        elements: [],
        connections: [],
        layout: 'force-directed',
        timestamp: new Date(),
        version: 0
      };
    }
    
    const network = this.networks.get(networkId);
    
    if (!network) {
      this.logger.warn(`Network ${networkId} not found`);
      return {
        id: networkId,
        name: 'Not Found',
        elements: [],
        connections: [],
        layout: 'force-directed',
        timestamp: new Date(),
        version: 0
      };
    }
    
    return {
      id: networkId,
      name: `Communication Network for Meeting ${meetingId}`,
      description: `Visualization of agent communications for meeting ${meetingId}`,
      elements: Array.from(network.elements.values()),
      connections: Array.from(network.connections.values()),
      layout: 'force-directed',
      timestamp: network.timestamp,
      version: network.version,
      metadata: {
        meetingId: network.meetingId,
        communicationCount: network.communications.size,
        agentCount: network.agents.size,
        channelCount: network.channels.size,
        density: this.calculateNetworkDensity(network)
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
    const networkId = this.getNetworkIdForMeeting(meetingId);
    
    if (!networkId) {
      this.logger.warn(`No network found for meeting ${meetingId}`);
      throw new Error(`No network found for meeting ${meetingId}`);
    }
    
    const network = this.networks.get(networkId);
    
    if (!network) {
      this.logger.warn(`Network ${networkId} not found`);
      throw new Error(`Network ${networkId} not found`);
    }
    
    // Calculate network density
    const density = this.calculateNetworkDensity(network);
    
    // Identify central agents (top 30% by centrality)
    const agents = Array.from(network.agents.values())
      .sort((a, b) => b.centrality - a.centrality);
    
    const centralAgentCount = Math.max(1, Math.ceil(agents.length * 0.3));
    const centralAgents = agents
      .slice(0, centralAgentCount)
      .map(agent => agent.id);
    
    // Calculate communication distribution
    const communicationDistribution: Record<string, number> = {};
    let totalMessages = 0;
    
    for (const agent of network.agents.values()) {
      communicationDistribution[agent.id] = agent.outgoingMessages;
      totalMessages += agent.outgoingMessages;
    }
    
    // Normalize to percentages
    if (totalMessages > 0) {
      for (const [agentId, count] of Object.entries(communicationDistribution)) {
        communicationDistribution[agentId] = (count / totalMessages) * 100;
      }
    }
    
    // Calculate effectiveness score
    // This is a simplified score based on balanced communication and connectivity
    const channelUtilization = network.channels.size / this.calculateMaxPossibleChannels(network);
    const communicationBalance = this.calculateCommunicationBalance(network);
    
    const effectivenessScore = (density * 0.4) + (channelUtilization * 0.3) + (communicationBalance * 0.3);
    
    return {
      density,
      centralAgents,
      communicationDistribution,
      effectivenessScore
    };
  }

  /**
   * Identify communication patterns in the network
   */
  identifyCommunicationPatterns(meetingId: string): {
    type: string;
    participants: string[];
    frequency: number;
    effectivenessScore: number;
  }[] {
    const networkId = this.getNetworkIdForMeeting(meetingId);
    
    if (!networkId) {
      this.logger.warn(`No network found for meeting ${meetingId}`);
      return [];
    }
    
    const network = this.networks.get(networkId);
    
    if (!network) {
      this.logger.warn(`Network ${networkId} not found`);
      return [];
    }
    
    const patterns: {
      type: string;
      participants: string[];
      frequency: number;
      effectivenessScore: number;
    }[] = [];
    
    // Identify hub-and-spoke pattern (central agent communicating with many)
    this.identifyHubAndSpokePattern(network, patterns);
    
    // Identify chain pattern (sequential communications)
    this.identifyChainPattern(network, patterns);
    
    // Identify cluster pattern (dense subgroups)
    this.identifyClusterPattern(network, patterns);
    
    // Identify isolates (agents with minimal communication)
    this.identifyIsolates(network, patterns);
    
    // Sort patterns by frequency
    return patterns.sort((a, b) => b.frequency - a.frequency);
  }
  
  /**
   * Helper: Find or create network for a meeting
   */
  private getNetworkIdForMeeting(meetingId: string): string | undefined {
    for (const [networkId, network] of this.networks.entries()) {
      if (network.meetingId === meetingId) {
        return networkId;
      }
    }
    
    return undefined;
  }
  
  /**
   * Helper: Create a new network for a meeting
   */
  private createNetworkForMeeting(meetingId: string, networkId: string): void {
    // Create a new graph in the core renderer
    const graphId = this.graphRenderer.initializeGraph(
      `comm-graph-${networkId}`,
      `Communication Network for Meeting ${meetingId}`,
      'force-directed'
    );
    
    this.networks.set(networkId, {
      meetingId,
      graphId,
      communications: new Map<string, CommunicationEvent>(),
      agents: new Map<string, AgentNode>(),
      channels: new Map<string, CommunicationChannel>(),
      elements: new Map<string, VisualizationElement>(),
      connections: new Map<string, VisualizationConnection>(),
      version: 1,
      timestamp: new Date()
    });
    
    this.logger.info(`Created communication network ${networkId} for meeting ${meetingId} with graph ${graphId}`);
  }
  
  /**
   * Helper: Update agent nodes based on communication event
   */
  private updateAgentNodes(networkId: string, communication: CommunicationEvent): void {
    const network = this.networks.get(networkId);
    
    if (!network) {
      return;
    }
    
    // Update or create source agent
    const sourceAgentId = communication.sourceAgentId;
    let sourceAgent = network.agents.get(sourceAgentId);
    
    if (sourceAgent) {
      sourceAgent.outgoingMessages += 1;
      sourceAgent.lastActive = communication.timestamp;
    } else {
      sourceAgent = {
        id: sourceAgentId,
        name: this.extractAgentName(sourceAgentId),
        outgoingMessages: 1,
        incomingMessages: 0,
        lastActive: communication.timestamp,
        centrality: 0
      };
    }
    
    network.agents.set(sourceAgentId, sourceAgent);
    
    // Update or create target agent
    const targetAgentId = communication.targetAgentId;
    let targetAgent = network.agents.get(targetAgentId);
    
    if (targetAgent) {
      targetAgent.incomingMessages += 1;
      targetAgent.lastActive = communication.timestamp;
    } else {
      targetAgent = {
        id: targetAgentId,
        name: this.extractAgentName(targetAgentId),
        outgoingMessages: 0,
        incomingMessages: 1,
        lastActive: communication.timestamp,
        centrality: 0
      };
    }
    
    network.agents.set(targetAgentId, targetAgent);
    
    // Update centrality scores
    this.updateCentralityScores(network);
  }
  
  /**
   * Helper: Update communication channel based on communication event
   */
  private updateCommunicationChannel(networkId: string, communication: CommunicationEvent): void {
    const network = this.networks.get(networkId);
    
    if (!network) {
      return;
    }
    
    const channelKey = `${communication.sourceAgentId}-${communication.targetAgentId}`;
    let channel = network.channels.get(channelKey);
    
    if (channel) {
      // Update existing channel
      channel.messageCount += 1;
      channel.lastActive = communication.timestamp;
      
      // Update message type frequency
      channel.primaryTypes[communication.communicationType] = 
        (channel.primaryTypes[communication.communicationType] || 0) + 1;
    } else {
      // Create new channel
      channel = {
        sourceAgentId: communication.sourceAgentId,
        targetAgentId: communication.targetAgentId,
        messageCount: 1,
        lastActive: communication.timestamp,
        primaryTypes: {
          [communication.communicationType]: 1
        }
      };
    }
    
    network.channels.set(channelKey, channel);
  }
  
  /**
   * Helper: Update the visualization elements and connections
   */
  private updateNetworkVisualization(networkId: string): void {
    const network = this.networks.get(networkId);
    
    if (!network) {
      return;
    }
    
    // Clear existing visualization
    network.elements.clear();
    network.connections.clear();
    
    // Add agent elements
    for (const agent of network.agents.values()) {
      const element: VisualizationElement = {
        id: `element-${agent.id}`,
        type: VisualizationElementType.AGENT,
        label: agent.name,
        description: `Agent: ${agent.name}`,
        properties: {
          outgoingMessages: agent.outgoingMessages,
          incomingMessages: agent.incomingMessages,
          lastActive: agent.lastActive,
          centrality: agent.centrality
        },
        state: VisualizationElementState.ACTIVE,
        // Position will be set by force-directed layout
        size: {
          width: 50 + agent.centrality * 50, // Size reflects centrality
          height: 50 + agent.centrality * 50
        },
        color: this.getColorForCentrality(agent.centrality),
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          agentId: agent.id
        }
      };
      
      network.elements.set(element.id, element);
    }
    
    // Add communication connections
    for (const channel of network.channels.values()) {
      const sourceElementId = `element-${channel.sourceAgentId}`;
      const targetElementId = `element-${channel.targetAgentId}`;
      
      // Ensure both elements exist
      if (!network.elements.has(sourceElementId) || !network.elements.has(targetElementId)) {
        continue;
      }
      
      const connectionId = `connection-${channel.sourceAgentId}-${channel.targetAgentId}`;
      
      const dominantType = this.getDominantCommunicationType(channel.primaryTypes);
      
      const connection: VisualizationConnection = {
        id: connectionId,
        type: VisualizationConnectionType.COMMUNICATION,
        sourceId: sourceElementId,
        targetId: targetElementId,
        label: `${channel.messageCount} messages`,
        properties: {
          messageCount: channel.messageCount,
          lastActive: channel.lastActive,
          primaryTypes: channel.primaryTypes,
          dominantType
        },
        strength: this.normalizeMessageCount(channel.messageCount),
        animated: channel.lastActive.getTime() > Date.now() - 300000, // Animate if active in last 5 minutes
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      network.connections.set(connectionId, connection);
    }
  }
  
  /**
   * Helper: Update centrality scores for all agents
   */
  private updateCentralityScores(network: {
    agents: Map<string, AgentNode>;
    channels: Map<string, CommunicationChannel>;
  }): void {
    // Simple degree centrality calculation
    const totalAgents = network.agents.size;
    
    if (totalAgents <= 1) {
      return;
    }
    
    // Max possible connections for normalization
    const maxPossibleConnections = (totalAgents - 1) * 2; // Both in and out
    
    for (const agent of network.agents.values()) {
      // Count unique connections (both in and out)
      const connections = new Set<string>();
      
      for (const channel of network.channels.values()) {
        if (channel.sourceAgentId === agent.id) {
          connections.add(channel.targetAgentId);
        }
        if (channel.targetAgentId === agent.id) {
          connections.add(channel.sourceAgentId);
        }
      }
      
      // Normalize to 0-1 scale
      agent.centrality = connections.size / (totalAgents - 1);
    }
  }
  
  /**
   * Helper: Calculate network density
   */
  private calculateNetworkDensity(network: {
    agents: Map<string, AgentNode>;
    channels: Map<string, CommunicationChannel>;
  }): number {
    const totalAgents = network.agents.size;
    
    if (totalAgents <= 1) {
      return 0;
    }
    
    // Maximum possible channels (directed)
    const maxPossibleChannels = this.calculateMaxPossibleChannels(network);
    
    // Actual channels
    const actualChannels = network.channels.size;
    
    return actualChannels / maxPossibleChannels;
  }
  
  /**
   * Helper: Calculate maximum possible channels
   */
  private calculateMaxPossibleChannels(network: {
    agents: Map<string, AgentNode>;
  }): number {
    const totalAgents = network.agents.size;
    
    if (totalAgents <= 1) {
      return 0;
    }
    
    // For directed graph: n * (n - 1)
    return totalAgents * (totalAgents - 1);
  }
  
  /**
   * Helper: Calculate communication balance
   */
  private calculateCommunicationBalance(network: {
    agents: Map<string, AgentNode>;
  }): number {
    const agents = Array.from(network.agents.values());
    
    if (agents.length <= 1) {
      return 1;
    }
    
    // Total messages
    const totalMessages = agents.reduce(
      (sum, agent) => sum + agent.outgoingMessages, 0
    );
    
    if (totalMessages === 0) {
      return 0;
    }
    
    // Expected messages per agent in a perfectly balanced network
    const expectedMessages = totalMessages / agents.length;
    
    // Calculate deviation from expected
    let totalDeviation = 0;
    
    for (const agent of agents) {
      const deviation = Math.abs(agent.outgoingMessages - expectedMessages);
      totalDeviation += deviation;
    }
    
    // Normalize: 0 = perfect imbalance, 1 = perfect balance
    const maxPossibleDeviation = totalMessages * (1 - 1 / agents.length);
    const normalizedDeviation = totalDeviation / maxPossibleDeviation;
    
    return 1 - Math.min(normalizedDeviation, 1);
  }
  
  /**
   * Helper: Identify hub-and-spoke pattern
   */
  private identifyHubAndSpokePattern(
    network: {
      agents: Map<string, AgentNode>;
      channels: Map<string, CommunicationChannel>;
    },
    patterns: {
      type: string;
      participants: string[];
      frequency: number;
      effectivenessScore: number;
    }[]
  ): void {
    // Find agents with high centrality (potential hubs)
    const potentialHubs = Array.from(network.agents.values())
      .filter(agent => agent.centrality > 0.6)
      .sort((a, b) => b.centrality - a.centrality);
    
    for (const hub of potentialHubs) {
      // Find all agents connected to this hub
      const connectedAgents = new Set<string>();
      
      for (const channel of network.channels.values()) {
        if (channel.sourceAgentId === hub.id) {
          connectedAgents.add(channel.targetAgentId);
        }
        if (channel.targetAgentId === hub.id) {
          connectedAgents.add(channel.sourceAgentId);
        }
      }
      
      // Must have at least 3 connected agents to be a hub
      if (connectedAgents.size >= 3) {
        // Verify structure: hub should account for most communications with spokes
        let isHubAndSpoke = true;
        let hubMessages = 0;
        let totalMessages = 0;
        
        for (const channel of network.channels.values()) {
          if (channel.sourceAgentId === hub.id || channel.targetAgentId === hub.id) {
            hubMessages += channel.messageCount;
          }
          
          totalMessages += channel.messageCount;
        }
        
        // Hub should account for at least 60% of all messages
        if (hubMessages / totalMessages >= 0.6) {
          patterns.push({
            type: 'hub-and-spoke',
            participants: [hub.id, ...connectedAgents],
            frequency: hubMessages,
            effectivenessScore: 0.7 // Hub patterns are moderately effective
          });
        }
      }
    }
  }
  
  /**
   * Helper: Identify chain pattern
   */
  private identifyChainPattern(
    network: {
      communications: Map<string, CommunicationEvent>;
    },
    patterns: {
      type: string;
      participants: string[];
      frequency: number;
      effectivenessScore: number;
    }[]
  ): void {
    // Simplified implementation - look for sequences of communications
    const communications = Array.from(network.communications.values())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    if (communications.length < 3) {
      return;
    }
    
    // Look for chains of at least 3 communications
    for (let i = 0; i < communications.length - 2; i++) {
      const first = communications[i];
      const second = communications[i + 1];
      const third = communications[i + 2];
      
      // Check if this forms a chain (A -> B -> C)
      if (
        first.targetAgentId === second.sourceAgentId &&
        second.targetAgentId === third.sourceAgentId &&
        // Ensure they happened within a reasonable timeframe (5 minutes)
        third.timestamp.getTime() - first.timestamp.getTime() < 300000
      ) {
        const chain = [
          first.sourceAgentId,
          first.targetAgentId,
          third.targetAgentId
        ];
        
        patterns.push({
          type: 'chain',
          participants: chain,
          frequency: 1, // Each chain is counted as one pattern
          effectivenessScore: 0.5 // Chains are moderately effective
        });
      }
    }
  }
  
  /**
   * Helper: Identify cluster pattern
   */
  private identifyClusterPattern(
    network: {
      agents: Map<string, AgentNode>;
      channels: Map<string, CommunicationChannel>;
    },
    patterns: {
      type: string;
      participants: string[];
      frequency: number;
      effectivenessScore: number;
    }[]
  ): void {
    // Simplified implementation - look for groups with high interconnection
    const agents = Array.from(network.agents.keys());
    
    if (agents.length < 3) {
      return;
    }
    
    // Create adjacency matrix
    const adjacencyMatrix: Record<string, Record<string, number>> = {};
    
    for (const agent of agents) {
      adjacencyMatrix[agent] = {};
      for (const otherAgent of agents) {
        adjacencyMatrix[agent][otherAgent] = 0;
      }
    }
    
    // Fill adjacency matrix
    for (const channel of network.channels.values()) {
      if (adjacencyMatrix[channel.sourceAgentId] && 
          adjacencyMatrix[channel.sourceAgentId][channel.targetAgentId] !== undefined) {
        adjacencyMatrix[channel.sourceAgentId][channel.targetAgentId] = channel.messageCount;
      }
    }
    
    // Look for clusters (groups with high interconnection)
    // This is a simplified approach - in a real system, use a community detection algorithm
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        for (let k = j + 1; k < agents.length; k++) {
          const agent1 = agents[i];
          const agent2 = agents[j];
          const agent3 = agents[k];
          
          // Check if all three are connected
          if (
            (adjacencyMatrix[agent1][agent2] > 0 || adjacencyMatrix[agent2][agent1] > 0) &&
            (adjacencyMatrix[agent1][agent3] > 0 || adjacencyMatrix[agent3][agent1] > 0) &&
            (adjacencyMatrix[agent2][agent3] > 0 || adjacencyMatrix[agent3][agent2] > 0)
          ) {
            // Calculate total messages in this cluster
            const totalMessages = 
              adjacencyMatrix[agent1][agent2] + adjacencyMatrix[agent2][agent1] +
              adjacencyMatrix[agent1][agent3] + adjacencyMatrix[agent3][agent1] +
              adjacencyMatrix[agent2][agent3] + adjacencyMatrix[agent3][agent2];
            
            patterns.push({
              type: 'cluster',
              participants: [agent1, agent2, agent3],
              frequency: totalMessages,
              effectivenessScore: 0.8 // Clusters are highly effective
            });
          }
        }
      }
    }
  }
  
  /**
   * Helper: Identify isolated agents
   */
  private identifyIsolates(
    network: {
      agents: Map<string, AgentNode>;
    },
    patterns: {
      type: string;
      participants: string[];
      frequency: number;
      effectivenessScore: number;
    }[]
  ): void {
    // Find agents with low activity
    const isolates = Array.from(network.agents.values())
      .filter(agent => 
        (agent.incomingMessages + agent.outgoingMessages) <= 2 ||
        agent.centrality < 0.2
      )
      .map(agent => agent.id);
    
    if (isolates.length > 0) {
      patterns.push({
        type: 'isolates',
        participants: isolates,
        frequency: isolates.length,
        effectivenessScore: 0.2 // Isolates indicate poor communication
      });
    }
  }
  
  /**
   * Helper: Extract agent name from agent ID
   */
  private extractAgentName(agentId: string): string {
    // Extract name from agent ID (e.g., "agent-summary-1" -> "Summary")
    const parts = agentId.split('-');
    
    if (parts.length >= 2) {
      return parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
    }
    
    return agentId;
  }
  
  /**
   * Helper: Get dominant communication type
   */
  private getDominantCommunicationType(types: Record<string, number>): string {
    let dominantType = '';
    let maxCount = 0;
    
    for (const [type, count] of Object.entries(types)) {
      if (count > maxCount) {
        dominantType = type;
        maxCount = count;
      }
    }
    
    return dominantType;
  }
  
  /**
   * Helper: Normalize message count to 0-1 scale for visualization
   */
  private normalizeMessageCount(count: number): number {
    // Simple normalization function
    return Math.min(1, Math.max(0.1, count / 20));
  }
  
  /**
   * Helper: Get color based on centrality score
   */
  private getColorForCentrality(centrality: number): string {
    // Color gradient from blue (low) to red (high)
    if (centrality < 0.25) {
      return '#2196F3'; // Blue for low centrality
    } else if (centrality < 0.5) {
      return '#4CAF50'; // Green for medium-low centrality
    } else if (centrality < 0.75) {
      return '#FFC107'; // Amber for medium-high centrality
    } else {
      return '#F44336'; // Red for high centrality
    }
  }
} 