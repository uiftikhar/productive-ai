/**
 * Consensus Building Visualization Service
 * 
 * Implements visualization of consensus building processes during meetings.
 * Tracks how agents move toward agreement on topics and decisions.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  ConsensusBuildingVisualization,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Configuration for the ConsensusBuildingVisualizationImpl
 */
export interface ConsensusBuildingVisualizationConfig {
  logger?: Logger;
}

/**
 * Topic consensus record
 */
interface TopicConsensus {
  id: string;
  meetingId: string;
  topic: string;
  description: string;
  timestamp: Date;
  status: 'forming' | 'reached' | 'failed';
  agentPositions: Record<string, {
    initialPosition: string;
    currentPosition: string;
    agreement: number; // 0-1 scale
    timestamp: Date;
  }>;
  consensusLevel: number; // 0-1 scale
  consensusReachedAt?: Date;
  consensusStatement?: string;
}

/**
 * Position update record
 */
interface PositionUpdate {
  id: string;
  consensusId: string;
  agentId: string;
  timestamp: Date;
  previousPosition: string;
  newPosition: string;
  reason: string;
  influencedBy?: string[]; // Agent IDs
}

/**
 * Implementation of the ConsensusBuildingVisualization interface
 */
export class ConsensusBuildingVisualizationImpl implements ConsensusBuildingVisualization {
  private logger: Logger;
  private consensusRecords: Map<string, TopicConsensus>;
  private positionUpdates: Map<string, PositionUpdate>;
  private meetingConsensus: Map<string, Set<string>>;
  private topicConsensus: Map<string, Set<string>>;
  private agentConsensus: Map<string, Set<string>>;
  private elements: Map<string, VisualizationElement>;
  private connections: Map<string, VisualizationConnection>;

  /**
   * Create a new consensus building visualization service
   */
  constructor(config: ConsensusBuildingVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.consensusRecords = new Map();
    this.positionUpdates = new Map();
    this.meetingConsensus = new Map();
    this.topicConsensus = new Map();
    this.agentConsensus = new Map();
    this.elements = new Map();
    this.connections = new Map();
    this.logger.info('ConsensusBuildingVisualizationImpl initialized');
  }

  /**
   * Track a new consensus process
   */
  trackConsensusProcess(meetingId: string, process: {
    entityId: string;
    entityType: string;
    startTimestamp: Date;
    participantAgentIds: string[];
    initialPositions: Record<string, string>;
  }): string {
    const consensusId = `consensus-${uuidv4()}`;
    const timestamp = process.startTimestamp;
    
    // Initialize agent positions
    const agentPositions: Record<string, {
      initialPosition: string;
      currentPosition: string;
      agreement: number;
      timestamp: Date;
    }> = {};
    
    for (const [agentId, position] of Object.entries(process.initialPositions)) {
      agentPositions[agentId] = {
        initialPosition: position,
        currentPosition: position,
        agreement: 0.2, // Start with low agreement
        timestamp
      };
    }
    
    // Store the consensus
    const topicConsensus: TopicConsensus = {
      id: consensusId,
      meetingId,
      topic: process.entityId,
      description: `Consensus on ${process.entityType}: ${process.entityId}`,
      timestamp,
      status: 'forming',
      agentPositions,
      consensusLevel: 0.2 // Start with low consensus
    };
    
    this.consensusRecords.set(consensusId, topicConsensus);
    
    // Add to indices
    this.addToIndex(this.meetingConsensus, meetingId, consensusId);
    this.addToIndex(this.topicConsensus, process.entityId, consensusId);
    
    for (const agentId of process.participantAgentIds) {
      this.addToIndex(this.agentConsensus, agentId, consensusId);
    }
    
    // Create visualization elements
    this.createConsensusElements(consensusId, topicConsensus);
    
    this.logger.info(`Initialized consensus tracking ${consensusId} for entity ${process.entityId}`);
    
    return consensusId;
  }

  /**
   * Update consensus step
   */
  updateConsensusStep(processId: string, step: {
    timestamp: Date;
    agentId: string;
    newPosition?: string;
    contributionType: string;
    influenceLevel: number; // 0-1 scale
  }): boolean {
    // Check if consensus exists
    if (!this.consensusRecords.has(processId)) {
      this.logger.warn(`Consensus ${processId} not found`);
      return false;
    }
    
    const consensus = this.consensusRecords.get(processId)!;
    
    // Check if agent exists in this consensus
    if (!consensus.agentPositions[step.agentId]) {
      this.logger.warn(`Agent ${step.agentId} not part of consensus ${processId}`);
      return false;
    }
    
    const timestamp = step.timestamp;
    
    // Update position if provided
    if (step.newPosition) {
      const agentPosition = consensus.agentPositions[step.agentId];
      
      // Create position update record
      const updateId = `position-update-${uuidv4()}`;
      const positionUpdate: PositionUpdate = {
        id: updateId,
        consensusId: processId,
        agentId: step.agentId,
        timestamp,
        previousPosition: agentPosition.currentPosition,
        newPosition: step.newPosition,
        reason: step.contributionType
        // No influencedBy in this interface
      };
      
      this.positionUpdates.set(updateId, positionUpdate);
      
      // Update agent position
      consensus.agentPositions[step.agentId] = {
        ...agentPosition,
        currentPosition: step.newPosition,
        timestamp
      };
      
      // Update consensus level
      this.recalculateConsensusLevel(processId, consensus);
      
      // Update visualization
      this.updateConsensusElements(processId, consensus);
      this.createPositionUpdateConnection(updateId, positionUpdate);
    }
    
    this.logger.info(`Updated agent ${step.agentId} position for consensus ${processId}`);
    
    return true;
  }

  /**
   * Complete consensus process
   */
  completeConsensusProcess(processId: string, outcome: {
    timestamp: Date;
    finalPosition: string;
    agreementLevel: number; // 0-1 scale
    dissenterIds?: string[];
  }): boolean {
    // Check if consensus exists
    if (!this.consensusRecords.has(processId)) {
      this.logger.warn(`Consensus ${processId} not found`);
      return false;
    }
    
    const consensus = this.consensusRecords.get(processId)!;
    
    // If there are dissenters, we may want to mark as failed
    if (outcome.dissenterIds && outcome.dissenterIds.length > 0 && outcome.agreementLevel < 0.7) {
      consensus.status = 'failed';
      consensus.description = `${consensus.description} (Failed: ${outcome.dissenterIds.length} dissenters)`;
      
      // Update visualization
      this.updateConsensusElements(processId, consensus);
      
      this.logger.info(`Marked consensus ${processId} as failed due to dissenters`);
      return false;
    }
    
    // Update consensus
    consensus.status = 'reached';
    consensus.consensusReachedAt = outcome.timestamp;
    consensus.consensusStatement = outcome.finalPosition;
    
    // Update consensus level to agreement level
    consensus.consensusLevel = outcome.agreementLevel;
    
    // Update all agent positions to final position
    for (const agentId in consensus.agentPositions) {
      if (outcome.dissenterIds && outcome.dissenterIds.includes(agentId)) {
        // Dissenters keep their current position but with low agreement
        consensus.agentPositions[agentId].agreement = 0.2;
      } else {
        // Others accept final position with high agreement
        consensus.agentPositions[agentId].currentPosition = outcome.finalPosition;
        consensus.agentPositions[agentId].agreement = 1.0;
      }
    }
    
    // Update visualization
    this.updateConsensusElements(processId, consensus);
    
    this.logger.info(`Completed consensus ${processId} with position: "${outcome.finalPosition}"`);
    
    return true;
  }

  /**
   * Visualize consensus building
   */
  visualizeConsensusBuilding(meetingId: string): VisualizationGraph {
    const consensusIds = this.meetingConsensus.get(meetingId) || new Set<string>();
    
    if (consensusIds.size === 0) {
      this.logger.info(`No consensus topics found for meeting ${meetingId}`);
      return {
        id: `consensus-building-${meetingId}`,
        name: `Consensus Building for Meeting ${meetingId}`,
        elements: [],
        connections: [],
        layout: 'force-directed',
        timestamp: new Date(),
        version: 1
      };
    }
    
    // Build visualization
    const elements: VisualizationElement[] = [];
    const connections: VisualizationConnection[] = [];
    
    // Get all consensus records
    const consensusRecords = Array.from(consensusIds)
      .map(id => this.consensusRecords.get(id))
      .filter(Boolean) as TopicConsensus[];
    
    // Collect all agents involved
    const agentIds = new Set<string>();
    
    for (const consensus of consensusRecords) {
      for (const agentId of Object.keys(consensus.agentPositions)) {
        agentIds.add(agentId);
      }
    }
    
    // Create agent elements
    for (const agentId of agentIds) {
      const elementId = `agent-${agentId}`;
      elements.push({
        id: elementId,
        type: VisualizationElementType.AGENT,
        label: `Agent ${agentId.split('-').pop()}`,
        description: `Agent ${agentId}`,
        properties: { agentId },
        state: VisualizationElementState.ACTIVE,
        color: this.getColorForAgent(agentId),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Add consensus elements
    for (const consensus of consensusRecords) {
      const elementId = `consensus-${consensus.id}`;
      const element = this.elements.get(elementId);
      
      if (element) {
        elements.push(element);
        
        // Connect to involved agents
        for (const agentId of Object.keys(consensus.agentPositions)) {
          const agentPosition = consensus.agentPositions[agentId];
          
          const connectionId = `consensus-agent-${consensus.id}-${agentId}`;
          connections.push({
            id: connectionId,
            type: VisualizationConnectionType.RELATION,
            sourceId: elementId,
            targetId: `agent-${agentId}`,
            label: agentPosition.currentPosition.substring(0, 15) + 
              (agentPosition.currentPosition.length > 15 ? '...' : ''),
            properties: {
              initialPosition: agentPosition.initialPosition,
              currentPosition: agentPosition.currentPosition,
              agreement: agentPosition.agreement,
              timestamp: agentPosition.timestamp,
              agreementColor: this.getAgreementColor(agentPosition.agreement)
            },
            strength: agentPosition.agreement,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }
    
    // Add influence connections from position updates
    const positionUpdates = Array.from(this.positionUpdates.values())
      .filter(update => {
        const consensus = this.consensusRecords.get(update.consensusId);
        return consensus && consensusIds.has(update.consensusId);
      });
    
    for (const update of positionUpdates) {
      if (update.influencedBy && update.influencedBy.length > 0) {
        for (const influencerId of update.influencedBy) {
          const connectionId = `influence-${update.id}-${influencerId}`;
          connections.push({
            id: connectionId,
            type: VisualizationConnectionType.COMMUNICATION,
            sourceId: `agent-${influencerId}`,
            targetId: `agent-${update.agentId}`,
            label: 'Influenced',
            properties: {
              timestamp: update.timestamp,
              reason: update.reason,
              consensusId: update.consensusId
            },
            strength: 0.7,
            animated: true,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }
    
    return {
      id: `consensus-building-${meetingId}`,
      name: `Consensus Building for Meeting ${meetingId}`,
      description: `Visualization of consensus building for meeting ${meetingId}`,
      elements,
      connections,
      layout: 'force-directed',
      timestamp: new Date(),
      version: 1,
      metadata: {
        meetingId,
        consensusCount: consensusRecords.length,
        reachedCount: consensusRecords.filter(c => c.status === 'reached').length,
        formingCount: consensusRecords.filter(c => c.status === 'forming').length,
        failedCount: consensusRecords.filter(c => c.status === 'failed').length
      }
    };
  }

  /**
   * Analyze consensus efficiency
   */
  analyzeConsensusEfficiency(meetingId: string): {
    averageConsensusTime: number; // in seconds
    influentialAgents: string[];
    medianAgreementLevel: number;
    successRate: number; // percentage of successful consensus
  } {
    const consensusIds = this.meetingConsensus.get(meetingId) || new Set<string>();
    
    if (consensusIds.size === 0) {
      return {
        averageConsensusTime: 0,
        influentialAgents: [],
        medianAgreementLevel: 0,
        successRate: 0
      };
    }
    
    // Get all consensus records
    const consensusRecords = Array.from(consensusIds)
      .map(id => this.consensusRecords.get(id))
      .filter(Boolean) as TopicConsensus[];
    
    // Calculate success rate
    const reachedConsensus = consensusRecords.filter(c => c.status === 'reached');
    const successRate = consensusRecords.length > 0 
      ? reachedConsensus.length / consensusRecords.length 
      : 0;
    
    // Calculate average consensus time (in seconds)
    let totalConvergenceTime = 0;
    let convergenceCount = 0;
    
    for (const consensus of reachedConsensus) {
      if (consensus.consensusReachedAt) {
        const convergenceTime = consensus.consensusReachedAt.getTime() - consensus.timestamp.getTime();
        totalConvergenceTime += convergenceTime;
        convergenceCount++;
      }
    }
    
    const averageConsensusTime = convergenceCount > 0 ? 
      totalConvergenceTime / convergenceCount / 1000 : 0; // In seconds
    
    // Calculate influential agents based on position updates
    const agentInfluenceCount: Record<string, number> = {};
    const positionUpdates = Array.from(this.positionUpdates.values())
      .filter(update => {
        const consensus = this.consensusRecords.get(update.consensusId);
        return consensus && consensusIds.has(update.consensusId);
      });
    
    for (const update of positionUpdates) {
      if (update.influencedBy && update.influencedBy.length > 0) {
        for (const influencerId of update.influencedBy) {
          agentInfluenceCount[influencerId] = (agentInfluenceCount[influencerId] || 0) + 1;
        }
      }
    }
    
    // Get top influential agents
    const influentialAgents = Object.entries(agentInfluenceCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([agentId]) => agentId);
    
    // Calculate median agreement level
    const consensusLevels = consensusRecords.map(c => c.consensusLevel).sort((a, b) => a - b);
    const medianAgreementLevel = consensusLevels.length > 0
      ? consensusLevels[Math.floor(consensusLevels.length / 2)]
      : 0;
    
    return {
      averageConsensusTime,
      influentialAgents,
      medianAgreementLevel,
      successRate
    };
  }

  /**
   * Initialize a new topic consensus tracking (legacy method)
   */
  initializeConsensusTracking(meetingId: string, consensus: {
    topic: string;
    description: string;
    initialPositions: Record<string, string>;
  }): string {
    return this.trackConsensusProcess(meetingId, {
      entityId: consensus.topic,
      entityType: 'topic',
      startTimestamp: new Date(),
      participantAgentIds: Object.keys(consensus.initialPositions),
      initialPositions: consensus.initialPositions
    });
  }

  /**
   * Track position changes over time for an agent
   */
  trackAgentPositionChanges(meetingId: string, agentId: string): {
    topic: string;
    initialPosition: string;
    positionChanges: Array<{
      timestamp: Date;
      position: string;
      reason: string;
    }>;
    finalConsensus: boolean;
  }[] {
    // Get consensus records for this meeting involving this agent
    const consensusIds = this.meetingConsensus.get(meetingId) || new Set<string>();
    
    if (consensusIds.size === 0) {
      return [];
    }
    
    const relevantConsensus = Array.from(consensusIds)
      .map(id => this.consensusRecords.get(id))
      .filter(c => c && c.agentPositions[agentId])
      .filter(Boolean) as TopicConsensus[];
    
    if (relevantConsensus.length === 0) {
      return [];
    }
    
    // Get position updates for this agent
    const positionUpdates = Array.from(this.positionUpdates.values())
      .filter(update => update.agentId === agentId)
      .filter(update => {
        const consensus = this.consensusRecords.get(update.consensusId);
        return consensus && consensusIds.has(update.consensusId);
      });
    
    // Group updates by consensus
    const updatesByConsensus: Record<string, PositionUpdate[]> = {};
    
    for (const update of positionUpdates) {
      if (!updatesByConsensus[update.consensusId]) {
        updatesByConsensus[update.consensusId] = [];
      }
      
      updatesByConsensus[update.consensusId].push(update);
    }
    
    // Build position change tracks
    const positionTracks = relevantConsensus.map(consensus => {
      const updates = updatesByConsensus[consensus.id] || [];
      
      // Sort updates by timestamp
      updates.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Build position changes
      const positionChanges = [
        {
          timestamp: consensus.timestamp,
          position: consensus.agentPositions[agentId].initialPosition,
          reason: 'Initial position'
        },
        ...updates.map(update => ({
          timestamp: update.timestamp,
          position: update.newPosition,
          reason: update.reason
        }))
      ];
      
      return {
        topic: consensus.topic,
        initialPosition: consensus.agentPositions[agentId].initialPosition,
        positionChanges,
        finalConsensus: consensus.status === 'reached'
      };
    });
    
    return positionTracks;
  }

  /**
   * Helper: Recalculate consensus level
   */
  private recalculateConsensusLevel(consensusId: string, consensus: TopicConsensus): void {
    const agentPositions = consensus.agentPositions;
    const agentIds = Object.keys(agentPositions);
    
    if (agentIds.length <= 1) {
      // Not enough agents for consensus
      return;
    }
    
    // Calculate position similarity
    const positionMap: Record<string, string[]> = {};
    
    for (const agentId of agentIds) {
      const position = agentPositions[agentId].currentPosition;
      
      if (!positionMap[position]) {
        positionMap[position] = [];
      }
      
      positionMap[position].push(agentId);
    }
    
    // Calculate dominant position
    let dominantPosition = '';
    let maxAgents = 0;
    
    for (const [position, agents] of Object.entries(positionMap)) {
      if (agents.length > maxAgents) {
        dominantPosition = position;
        maxAgents = agents.length;
      }
    }
    
    // Calculate consensus level and agent agreement
    const consensusLevel = maxAgents / agentIds.length;
    
    // Update agent agreement levels
    for (const agentId of agentIds) {
      const position = agentPositions[agentId].currentPosition;
      const agreement = position === dominantPosition ? 1.0 : 0.2;
      
      agentPositions[agentId].agreement = agreement;
    }
    
    // Update consensus level
    consensus.consensusLevel = consensusLevel;
    
    // Check if consensus is reached
    if (consensusLevel >= 0.8 && consensus.status === 'forming') {
      this.logger.info(`Consensus ${consensusId} approaching threshold at ${consensusLevel}`);
    }
  }

  /**
   * Helper: Create consensus elements
   */
  private createConsensusElements(consensusId: string, consensus: TopicConsensus): void {
    const elementId = `consensus-${consensusId}`;
    
    // Create element
    const element: VisualizationElement = {
      id: elementId,
      type: VisualizationElementType.TOPIC,
      label: `Consensus: ${consensus.topic}`,
      description: consensus.description,
      properties: {
        topic: consensus.topic,
        timestamp: consensus.timestamp,
        status: consensus.status,
        consensusLevel: consensus.consensusLevel
      },
      state: this.getConsensusState(consensus.status),
      size: {
        width: 60 + (consensus.consensusLevel * 40),
        height: 60 + (consensus.consensusLevel * 40)
      },
      color: this.getConsensusColor(consensus.status, consensus.consensusLevel),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.elements.set(elementId, element);
  }

  /**
   * Helper: Update consensus elements
   */
  private updateConsensusElements(consensusId: string, consensus: TopicConsensus): void {
    const elementId = `consensus-${consensusId}`;
    
    if (!this.elements.has(elementId)) {
      this.createConsensusElements(consensusId, consensus);
      return;
    }
    
    const element = this.elements.get(elementId)!;
    
    // Update element
    element.label = `Consensus: ${consensus.topic}`;
    element.description = consensus.description;
    element.properties = {
      ...element.properties,
      status: consensus.status,
      consensusLevel: consensus.consensusLevel,
      consensusReachedAt: consensus.consensusReachedAt,
      consensusStatement: consensus.consensusStatement
    };
    element.state = this.getConsensusState(consensus.status);
    element.size = {
      width: 60 + (consensus.consensusLevel * 40),
      height: 60 + (consensus.consensusLevel * 40)
    };
    element.color = this.getConsensusColor(consensus.status, consensus.consensusLevel);
    element.updatedAt = new Date();
  }

  /**
   * Helper: Create position update connection
   */
  private createPositionUpdateConnection(updateId: string, update: PositionUpdate): void {
    // Only create connections for influenced updates
    if (!update.influencedBy || update.influencedBy.length === 0) {
      return;
    }
    
    // Create connections from influencers
    for (const influencerId of update.influencedBy) {
      const connectionId = `update-influence-${updateId}-${influencerId}`;
      
      const connection: VisualizationConnection = {
        id: connectionId,
        type: VisualizationConnectionType.COMMUNICATION,
        sourceId: `agent-${influencerId}`,
        targetId: `agent-${update.agentId}`,
        label: 'Influenced',
        properties: {
          updateId,
          timestamp: update.timestamp,
          previousPosition: update.previousPosition,
          newPosition: update.newPosition,
          reason: update.reason
        },
        strength: 0.7,
        animated: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      this.connections.set(connectionId, connection);
    }
  }

  /**
   * Helper: Add to index
   */
  private addToIndex(index: Map<string, Set<string>>, key: string, value: string): void {
    if (!index.has(key)) {
      index.set(key, new Set());
    }
    
    index.get(key)?.add(value);
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
   * Helper: Get consensus state
   */
  private getConsensusState(status: string): VisualizationElementState {
    switch (status) {
      case 'reached':
        return VisualizationElementState.HIGHLIGHTED;
      case 'forming':
        return VisualizationElementState.ACTIVE;
      case 'failed':
        return VisualizationElementState.ERROR;
      default:
        return VisualizationElementState.INACTIVE;
    }
  }

  /**
   * Helper: Get consensus color
   */
  private getConsensusColor(status: string, level: number): string {
    if (status === 'reached') {
      return '#4CAF50'; // Green
    } else if (status === 'failed') {
      return '#F44336'; // Red
    } else {
      // Forming - color based on level
      if (level < 0.3) {
        return '#FFC107'; // Yellow
      } else if (level < 0.7) {
        return '#FF9800'; // Orange
      } else {
        return '#8BC34A'; // Light Green
      }
    }
  }

  /**
   * Helper: Get agreement color
   */
  private getAgreementColor(agreement: number): string {
    if (agreement < 0.3) {
      return '#F44336'; // Red
    } else if (agreement < 0.7) {
      return '#FFC107'; // Yellow
    } else {
      return '#4CAF50'; // Green
    }
  }
} 