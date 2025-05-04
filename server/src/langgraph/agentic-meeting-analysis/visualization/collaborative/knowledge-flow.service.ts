/**
 * Knowledge Flow Visualization Service
 * 
 * Implements visualization of knowledge transfer between agents during meetings,
 * showing how information flows through the system.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  KnowledgeFlowVisualization,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Configuration for the KnowledgeFlowVisualizationImpl
 */
export interface KnowledgeFlowVisualizationConfig {
  logger?: Logger;
}

/**
 * Knowledge transfer record for visualization
 */
interface KnowledgeTransfer {
  id: string;
  meetingId: string;
  timestamp: Date;
  sourceAgentId: string;
  targetAgentId: string;
  knowledgeType: string;
  content: string;
  entityId?: string;
  utilityScore?: number;
}

/**
 * Implementation of the KnowledgeFlowVisualization interface
 */
export class KnowledgeFlowVisualizationImpl implements KnowledgeFlowVisualization {
  private logger: Logger;
  private transfers: Map<string, KnowledgeTransfer>;
  private meetingTransfers: Map<string, Set<string>>;
  private agentIncomingTransfers: Map<string, Set<string>>;
  private agentOutgoingTransfers: Map<string, Set<string>>;
  private elements: Map<string, VisualizationElement>;
  private connections: Map<string, VisualizationConnection>;

  /**
   * Create a new knowledge flow visualization service
   */
  constructor(config: KnowledgeFlowVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.transfers = new Map();
    this.meetingTransfers = new Map();
    this.agentIncomingTransfers = new Map();
    this.agentOutgoingTransfers = new Map();
    this.elements = new Map();
    this.connections = new Map();
    this.logger.info('KnowledgeFlowVisualizationImpl initialized');
  }

  /**
   * Record a knowledge transfer between agents
   */
  recordKnowledgeTransfer(meetingId: string, transfer: {
    timestamp: Date;
    sourceAgentId: string;
    targetAgentId: string;
    knowledgeType: string;
    content: string;
    entityId?: string;
    utilityScore?: number;
  }): string {
    const transferId = `knowledge-transfer-${uuidv4()}`;
    
    // Store the transfer
    const knowledgeTransfer: KnowledgeTransfer = {
      id: transferId,
      meetingId,
      ...transfer
    };
    
    this.transfers.set(transferId, knowledgeTransfer);
    
    // Add to meeting index
    if (!this.meetingTransfers.has(meetingId)) {
      this.meetingTransfers.set(meetingId, new Set());
    }
    
    this.meetingTransfers.get(meetingId)?.add(transferId);
    
    // Add to agent indices
    this.addToAgentIndex(this.agentOutgoingTransfers, transfer.sourceAgentId, transferId);
    this.addToAgentIndex(this.agentIncomingTransfers, transfer.targetAgentId, transferId);
    
    // Create visualization elements
    this.createOrUpdateAgentElement(transfer.sourceAgentId, meetingId);
    this.createOrUpdateAgentElement(transfer.targetAgentId, meetingId);
    this.createTransferConnection(transferId, knowledgeTransfer);
    
    this.logger.info(`Recorded knowledge transfer ${transferId} from ${transfer.sourceAgentId} to ${transfer.targetAgentId}`);
    
    return transferId;
  }

  /**
   * Visualize knowledge flow for a meeting
   */
  visualizeKnowledgeFlow(meetingId: string): VisualizationGraph {
    const transferIds = this.meetingTransfers.get(meetingId) || new Set<string>();
    
    if (transferIds.size === 0) {
      this.logger.info(`No knowledge transfers found for meeting ${meetingId}`);
      return {
        id: `knowledge-flow-${meetingId}`,
        name: `Knowledge Flow for Meeting ${meetingId}`,
        elements: [],
        connections: [],
        layout: 'force-directed',
        timestamp: new Date(),
        version: 1
      };
    }
    
    // Get all transfers for this meeting
    const transfers = Array.from(transferIds)
      .map(id => this.transfers.get(id))
      .filter(Boolean) as KnowledgeTransfer[];
    
    // Build visualization
    // First, collect all agent IDs involved
    const agentIds = new Set<string>();
    
    for (const transfer of transfers) {
      agentIds.add(transfer.sourceAgentId);
      agentIds.add(transfer.targetAgentId);
    }
    
    // Get all elements and connections for these agents
    const agentElements: VisualizationElement[] = [];
    const transferConnections: VisualizationConnection[] = [];
    
    // Add agent elements
    for (const agentId of agentIds) {
      const elementId = `agent-${agentId}`;
      const element = this.elements.get(elementId);
      
      if (element) {
        agentElements.push(element);
      }
    }
    
    // Add transfer connections
    for (const transferId of transferIds) {
      const connection = this.connections.get(`connection-${transferId}`);
      
      if (connection) {
        transferConnections.push(connection);
      }
    }
    
    // Add knowledge type elements (for grouping)
    const knowledgeTypes = new Set<string>();
    
    for (const transfer of transfers) {
      knowledgeTypes.add(transfer.knowledgeType);
    }
    
    const knowledgeTypeElements: VisualizationElement[] = [];
    
    for (const knowledgeType of knowledgeTypes) {
      const elementId = `knowledge-type-${knowledgeType}`;
      
      if (!this.elements.has(elementId)) {
        // Create knowledge type element
        const element: VisualizationElement = {
          id: elementId,
          type: VisualizationElementType.TOPIC,
          label: this.formatKnowledgeType(knowledgeType),
          description: `Knowledge of type: ${this.formatKnowledgeType(knowledgeType)}`,
          properties: {
            knowledgeType
          },
          state: VisualizationElementState.INACTIVE,
          size: {
            width: 100,
            height: 100
          },
          color: this.getColorForKnowledgeType(knowledgeType),
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            type: 'knowledge-group'
          }
        };
        
        this.elements.set(elementId, element);
      }
      
      const element = this.elements.get(elementId);
      if (element) {
        knowledgeTypeElements.push(element);
      }
    }
    
    // Add connections between transfers and knowledge type groups
    const groupConnections: VisualizationConnection[] = [];
    
    for (const transfer of transfers) {
      const groupConnectionId = `group-connection-${transfer.id}`;
      
      if (!this.connections.has(groupConnectionId)) {
        const connection: VisualizationConnection = {
          id: groupConnectionId,
          type: VisualizationConnectionType.RELATION,
          sourceId: `connection-${transfer.id}`,
          targetId: `knowledge-type-${transfer.knowledgeType}`,
          label: '',
          strength: 0.2, // Weak connection to group
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        this.connections.set(groupConnectionId, connection);
      }
      
      const connection = this.connections.get(groupConnectionId);
      if (connection) {
        groupConnections.push(connection);
      }
    }
    
    return {
      id: `knowledge-flow-${meetingId}`,
      name: `Knowledge Flow for Meeting ${meetingId}`,
      description: `Visualization of knowledge transfers between agents in meeting ${meetingId}`,
      elements: [...agentElements, ...knowledgeTypeElements],
      connections: [...transferConnections, ...groupConnections],
      layout: 'force-directed',
      timestamp: new Date(),
      version: 1,
      metadata: {
        meetingId,
        agentCount: agentIds.size,
        transferCount: transferIds.size,
        knowledgeTypeCount: knowledgeTypes.size
      }
    };
  }

  /**
   * Identify knowledge hubs in the meeting
   */
  identifyKnowledgeHubs(meetingId: string): {
    agentId: string;
    knowledgeTypes: string[];
    outgoingTransfers: number;
    incomingTransfers: number;
    hubScore: number;
  }[] {
    const transferIds = this.meetingTransfers.get(meetingId) || new Set<string>();
    
    if (transferIds.size === 0) {
      return [];
    }
    
    // Get all transfers for this meeting
    const transfers = Array.from(transferIds)
      .map(id => this.transfers.get(id))
      .filter(Boolean) as KnowledgeTransfer[];
    
    // Collect all agent IDs involved
    const agentIds = new Set<string>();
    
    for (const transfer of transfers) {
      agentIds.add(transfer.sourceAgentId);
      agentIds.add(transfer.targetAgentId);
    }
    
    // Calculate hub metrics for each agent
    const hubMetrics: Array<{
      agentId: string;
      knowledgeTypes: string[];
      outgoingTransfers: number;
      incomingTransfers: number;
      hubScore: number;
    }> = [];
    
    for (const agentId of agentIds) {
      // Count outgoing transfers
      const outgoingIds = this.agentOutgoingTransfers.get(agentId) || new Set<string>();
      const outgoingTransfers = Array.from(outgoingIds)
        .filter(id => transferIds.has(id))
        .map(id => this.transfers.get(id))
        .filter(Boolean) as KnowledgeTransfer[];
      
      // Count incoming transfers
      const incomingIds = this.agentIncomingTransfers.get(agentId) || new Set<string>();
      const incomingTransfers = Array.from(incomingIds)
        .filter(id => transferIds.has(id))
        .map(id => this.transfers.get(id))
        .filter(Boolean) as KnowledgeTransfer[];
      
      // Collect knowledge types
      const knowledgeTypes = new Set<string>();
      
      for (const transfer of [...outgoingTransfers, ...incomingTransfers]) {
        knowledgeTypes.add(transfer.knowledgeType);
      }
      
      // Calculate hub score (combination of knowledge diversity and transfer counts)
      // Higher scores mean more central and important knowledge hubs
      const diversityFactor = knowledgeTypes.size / 5; // Normalize by assuming max 5 types
      const volumeFactor = 
        (outgoingTransfers.length * 1.5 + incomingTransfers.length) / 20; // Weight outgoing more
      
      const hubScore = Math.min(1, (diversityFactor * 0.5) + (volumeFactor * 0.5));
      
      hubMetrics.push({
        agentId,
        knowledgeTypes: Array.from(knowledgeTypes),
        outgoingTransfers: outgoingTransfers.length,
        incomingTransfers: incomingTransfers.length,
        hubScore
      });
    }
    
    // Sort by hub score (highest first)
    hubMetrics.sort((a, b) => b.hubScore - a.hubScore);
    
    return hubMetrics;
  }

  /**
   * Analyze knowledge distribution across agents
   */
  analyzeKnowledgeDistribution(meetingId: string): {
    distribution: Record<string, number>;
    gaps: Record<string, string[]>;
    sharingEfficiency: number;
  } {
    const transferIds = this.meetingTransfers.get(meetingId) || new Set<string>();
    
    if (transferIds.size === 0) {
      return {
        distribution: {},
        gaps: {},
        sharingEfficiency: 0
      };
    }
    
    // Get all transfers for this meeting
    const transfers = Array.from(transferIds)
      .map(id => this.transfers.get(id))
      .filter(Boolean) as KnowledgeTransfer[];
    
    // Collect all agent IDs and knowledge types
    const agentIds = new Set<string>();
    const knowledgeTypes = new Set<string>();
    
    for (const transfer of transfers) {
      agentIds.add(transfer.sourceAgentId);
      agentIds.add(transfer.targetAgentId);
      knowledgeTypes.add(transfer.knowledgeType);
    }
    
    // Calculate knowledge score for each agent
    const distribution: Record<string, number> = {};
    const knowledgeByAgent: Record<string, Set<string>> = {};
    
    // Initialize
    for (const agentId of agentIds) {
      distribution[agentId] = 0;
      knowledgeByAgent[agentId] = new Set<string>();
    }
    
    // Calculate knowledge distribution
    for (const transfer of transfers) {
      // Source agent is providing knowledge
      knowledgeByAgent[transfer.sourceAgentId].add(transfer.knowledgeType);
      
      // Target is receiving knowledge
      knowledgeByAgent[transfer.targetAgentId].add(transfer.knowledgeType);
      
      // Increase distribution score for source (providing knowledge)
      distribution[transfer.sourceAgentId] += 0.5;
      
      // Target gets some score too, but less
      distribution[transfer.targetAgentId] += 0.2;
    }
    
    // Normalize distribution scores
    const totalScore = Object.values(distribution).reduce((sum, score) => sum + score, 0);
    
    if (totalScore > 0) {
      for (const agentId of Object.keys(distribution)) {
        distribution[agentId] /= totalScore;
      }
    }
    
    // Identify knowledge gaps
    const gaps: Record<string, string[]> = {};
    
    for (const agentId of agentIds) {
      const agentKnowledge = knowledgeByAgent[agentId];
      
      // Find missing knowledge types
      const missingTypes = Array.from(knowledgeTypes).filter(type => !agentKnowledge.has(type));
      
      if (missingTypes.length > 0) {
        gaps[agentId] = missingTypes;
      } else {
        gaps[agentId] = [];
      }
    }
    
    // Calculate sharing efficiency
    // Higher means knowledge is spread more evenly
    let sharingEfficiency = 0;
    
    if (agentIds.size > 0 && knowledgeTypes.size > 0) {
      // Calculate how evenly knowledge is distributed
      const maxPossibleKnowledge = agentIds.size * knowledgeTypes.size;
      let totalAcquiredKnowledge = 0;
      
      for (const agentKnowledge of Object.values(knowledgeByAgent)) {
        totalAcquiredKnowledge += agentKnowledge.size;
      }
      
      // Efficiency is ratio of actual knowledge spread to maximum possible
      sharingEfficiency = Math.min(1, totalAcquiredKnowledge / maxPossibleKnowledge);
    }
    
    return {
      distribution,
      gaps,
      sharingEfficiency
    };
  }

  /**
   * Helper: Add to agent index
   */
  private addToAgentIndex(index: Map<string, Set<string>>, agentId: string, transferId: string): void {
    if (!index.has(agentId)) {
      index.set(agentId, new Set());
    }
    
    index.get(agentId)?.add(transferId);
  }

  /**
   * Helper: Create or update agent element
   */
  private createOrUpdateAgentElement(agentId: string, meetingId: string): void {
    const elementId = `agent-${agentId}`;
    
    if (this.elements.has(elementId)) {
      // Update existing element
      const element = this.elements.get(elementId)!;
      
      // Count transfers for this agent
      const outgoingIds = this.agentOutgoingTransfers.get(agentId) || new Set<string>();
      const incomingIds = this.agentIncomingTransfers.get(agentId) || new Set<string>();
      
      // Update properties
      element.properties = {
        ...element.properties,
        outgoingTransfers: outgoingIds.size,
        incomingTransfers: incomingIds.size,
        totalTransfers: outgoingIds.size + incomingIds.size
      };
      
      // Update size based on transfer count
      element.size = {
        width: 40 + Math.min(60, (outgoingIds.size + incomingIds.size) * 5),
        height: 40 + Math.min(60, (outgoingIds.size + incomingIds.size) * 5)
      };
      
      element.updatedAt = new Date();
      
      return;
    }
    
    // Create new element
    const element: VisualizationElement = {
      id: elementId,
      type: VisualizationElementType.AGENT,
      label: `Agent ${agentId.split('-').pop()}`,
      description: `Agent ${agentId}`,
      properties: {
        agentId,
        outgoingTransfers: 0,
        incomingTransfers: 0,
        totalTransfers: 0
      },
      state: VisualizationElementState.ACTIVE,
      size: {
        width: 40,
        height: 40
      },
      color: this.getColorForAgent(agentId),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        meetingId
      }
    };
    
    this.elements.set(elementId, element);
  }

  /**
   * Helper: Create transfer connection
   */
  private createTransferConnection(transferId: string, transfer: KnowledgeTransfer): void {
    const connectionId = `connection-${transferId}`;
    
    if (this.connections.has(connectionId)) {
      return;
    }
    
    // Create connection
    const connection: VisualizationConnection = {
      id: connectionId,
      type: VisualizationConnectionType.COMMUNICATION,
      sourceId: `agent-${transfer.sourceAgentId}`,
      targetId: `agent-${transfer.targetAgentId}`,
      label: this.formatKnowledgeType(transfer.knowledgeType),
      properties: {
        knowledgeType: transfer.knowledgeType,
        timestamp: transfer.timestamp,
        content: transfer.content,
        entityId: transfer.entityId,
        utilityScore: transfer.utilityScore
      },
      strength: transfer.utilityScore || 0.5,
      animated: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        transferId: transfer.id
      }
    };
    
    this.connections.set(connectionId, connection);
  }

  /**
   * Helper: Format knowledge type for display
   */
  private formatKnowledgeType(knowledgeType: string): string {
    // Convert snake_case to Title Case
    return knowledgeType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
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
   * Helper: Get color for knowledge type
   */
  private getColorForKnowledgeType(knowledgeType: string): string {
    const colorMap: Record<string, string> = {
      'domain_knowledge': '#4CAF50', // Green
      'procedural_knowledge': '#2196F3', // Blue
      'contextual_knowledge': '#FF5722', // Deep Orange
      'strategic_knowledge': '#9C27B0', // Purple
      'factual_knowledge': '#FFC107', // Amber
      'analytical_insight': '#00BCD4', // Cyan
      'technical_knowledge': '#607D8B', // Blue Grey
      'social_knowledge': '#FF9800' // Orange
    };
    
    return colorMap[knowledgeType] || '#9E9E9E'; // Grey default
  }
} 