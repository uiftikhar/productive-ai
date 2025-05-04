/**
 * Collaboration Pattern Visualization Service
 * 
 * Implements visualization of collaboration patterns between agents during meetings.
 * Identifies and visualizes recurring interaction patterns and collaboration styles.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  CollaborationPatternVisualization,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Configuration for the CollaborationPatternVisualizationImpl
 */
export interface CollaborationPatternVisualizationConfig {
  logger?: Logger;
}

/**
 * Collaboration interaction record for visualization
 */
interface CollaborationInteraction {
  id: string;
  meetingId: string;
  timestamp: Date;
  sourceAgentId: string;
  targetAgentId: string;
  interactionType: string;
  context: string;
  duration?: number;
  outcome?: string;
  strength?: number;
}

/**
 * Identified collaboration pattern
 */
interface CollaborationPattern {
  id: string;
  meetingId: string;
  patternType: string;
  agentIds: string[];
  interactionIds: string[];
  frequency: number;
  significance: number;
  description: string;
}

/**
 * Implementation of the CollaborationPatternVisualization interface
 */
export class CollaborationPatternVisualizationImpl implements CollaborationPatternVisualization {
  private logger: Logger;
  private interactions: Map<string, CollaborationInteraction>;
  private patterns: Map<string, CollaborationPattern>;
  private meetingInteractions: Map<string, Set<string>>;
  private meetingPatterns: Map<string, Set<string>>;
  private agentInteractions: Map<string, Set<string>>;
  private elements: Map<string, VisualizationElement>;
  private connections: Map<string, VisualizationConnection>;

  /**
   * Create a new collaboration pattern visualization service
   */
  constructor(config: CollaborationPatternVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.interactions = new Map();
    this.patterns = new Map();
    this.meetingInteractions = new Map();
    this.meetingPatterns = new Map();
    this.agentInteractions = new Map();
    this.elements = new Map();
    this.connections = new Map();
    this.logger.info('CollaborationPatternVisualizationImpl initialized');
  }

  /**
   * Record a collaboration between agents
   */
  recordCollaboration(meetingId: string, collaboration: {
    timestamp: Date;
    participantAgentIds: string[];
    pattern: string;
    context: string;
    outcome: string;
    effectiveness: number; // 0-1 scale
  }): string {
    const patternId = `collaboration-pattern-${uuidv4()}`;
    
    // Convert to our internal pattern format
    const pattern: CollaborationPattern = {
      id: patternId,
      meetingId,
      patternType: collaboration.pattern,
      agentIds: collaboration.participantAgentIds,
      interactionIds: [], // Will be filled by interactions referencing this pattern
      frequency: 1, // Initial frequency
      significance: collaboration.effectiveness,
      description: `${collaboration.pattern} pattern: ${collaboration.outcome}`
    };
    
    this.patterns.set(patternId, pattern);
    this.addToIndex(this.meetingPatterns, meetingId, patternId);
    
    // Create an interaction record for the collaboration
    this.recordCollaborationInteraction(meetingId, {
      timestamp: collaboration.timestamp,
      sourceAgentId: collaboration.participantAgentIds[0] || 'unknown',
      targetAgentId: collaboration.participantAgentIds[1] || 'unknown',
      interactionType: collaboration.pattern,
      context: collaboration.context,
      outcome: collaboration.outcome,
      strength: collaboration.effectiveness
    });
    
    this.logger.info(`Recorded collaboration pattern ${patternId} (${collaboration.pattern})`);
    
    return patternId;
  }

  /**
   * Record a collaboration interaction
   */
  recordCollaborationInteraction(meetingId: string, interaction: {
    timestamp: Date;
    sourceAgentId: string;
    targetAgentId: string;
    interactionType: string;
    context: string;
    duration?: number;
    outcome?: string;
    strength?: number;
  }): string {
    const interactionId = `collaboration-interaction-${uuidv4()}`;
    
    // Store the interaction
    const collaborationInteraction: CollaborationInteraction = {
      id: interactionId,
      meetingId,
      ...interaction
    };
    
    this.interactions.set(interactionId, collaborationInteraction);
    
    // Add to indices
    this.addToIndex(this.meetingInteractions, meetingId, interactionId);
    this.addToIndex(this.agentInteractions, interaction.sourceAgentId, interactionId);
    this.addToIndex(this.agentInteractions, interaction.targetAgentId, interactionId);
    
    // Update patterns based on new interaction
    this.detectPatterns(meetingId);
    
    this.logger.info(`Recorded collaboration interaction ${interactionId}`);
    
    return interactionId;
  }

  /**
   * Identify successful collaboration patterns
   */
  identifySuccessfulPatterns(meetingId: string): {
    pattern: string;
    averageEffectiveness: number;
    frequency: number;
    participants: string[][];
  }[] {
    // Ensure patterns are up to date
    this.detectPatterns(meetingId);
    
    const patternIds = this.meetingPatterns.get(meetingId) || new Set<string>();
    
    if (patternIds.size === 0) {
      return [];
    }
    
    // Get all patterns
    const patterns = Array.from(patternIds)
      .map(id => this.patterns.get(id))
      .filter(Boolean) as CollaborationPattern[];
    
    // Group patterns by type
    const patternsByType: Record<string, {
      patterns: CollaborationPattern[];
      participants: string[][];
      significanceSum: number;
    }> = {};
    
    for (const pattern of patterns) {
      if (!patternsByType[pattern.patternType]) {
        patternsByType[pattern.patternType] = {
          patterns: [],
          participants: [],
          significanceSum: 0
        };
      }
      
      patternsByType[pattern.patternType].patterns.push(pattern);
      patternsByType[pattern.patternType].participants.push(pattern.agentIds);
      patternsByType[pattern.patternType].significanceSum += pattern.significance;
    }
    
    // Calculate metrics for each pattern type
    const successfulPatterns = Object.entries(patternsByType).map(([patternType, data]) => {
      return {
        pattern: patternType,
        averageEffectiveness: data.significanceSum / data.patterns.length,
        frequency: data.patterns.length,
        participants: data.participants
      };
    });
    
    // Sort by effectiveness
    successfulPatterns.sort((a, b) => b.averageEffectiveness - a.averageEffectiveness);
    
    return successfulPatterns;
  }

  /**
   * Suggest collaboration improvements
   */
  suggestCollaborationImprovements(meetingId: string): {
    agentPairings: Array<{ agent1: string; agent2: string; potential: number }>;
    underutilizedPatterns: string[];
    improvementAreas: Record<string, string[]>;
  } {
    // Get all interactions for this meeting
    const interactionIds = this.meetingInteractions.get(meetingId) || new Set<string>();
    
    if (interactionIds.size === 0) {
      return {
        agentPairings: [],
        underutilizedPatterns: [],
        improvementAreas: {}
      };
    }
    
    const interactions = Array.from(interactionIds)
      .map(id => this.interactions.get(id))
      .filter(Boolean) as CollaborationInteraction[];
    
    // Get all agents involved
    const agentIds = new Set<string>();
    for (const interaction of interactions) {
      agentIds.add(interaction.sourceAgentId);
      agentIds.add(interaction.targetAgentId);
    }
    
    // Get all agents as array
    const agents = Array.from(agentIds);
    
    // Count interactions between each pair of agents
    const pairInteractions: Record<string, {
      count: number;
      strength: number;
      types: Set<string>;
    }> = {};
    
    for (const interaction of interactions) {
      const agentPair = [interaction.sourceAgentId, interaction.targetAgentId].sort().join('-');
      
      if (!pairInteractions[agentPair]) {
        pairInteractions[agentPair] = {
          count: 0,
          strength: 0,
          types: new Set()
        };
      }
      
      pairInteractions[agentPair].count++;
      pairInteractions[agentPair].strength += interaction.strength || 0.5;
      pairInteractions[agentPair].types.add(interaction.interactionType);
    }
    
    // Find underutilized agent pairings
    const potentialPairings: Array<{ agent1: string; agent2: string; potential: number }> = [];
    
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const agent1 = agents[i];
        const agent2 = agents[j];
        const pairKey = [agent1, agent2].sort().join('-');
        
        const pairData = pairInteractions[pairKey];
        if (!pairData || pairData.count < 2) {
          // This pair has few or no interactions - high potential
          potentialPairings.push({
            agent1,
            agent2,
            potential: pairData ? 0.5 : 0.8 // Higher if no interactions at all
          });
        }
      }
    }
    
    // Find underutilized patterns
    const patternCounts: Record<string, number> = {};
    
    for (const interaction of interactions) {
      patternCounts[interaction.interactionType] = 
        (patternCounts[interaction.interactionType] || 0) + 1;
    }
    
    // Common patterns that should be present
    const expectedPatterns = ['discussion', 'question', 'support', 'challenge', 'feedback'];
    const underutilizedPatterns = expectedPatterns.filter(
      pattern => !patternCounts[pattern] || patternCounts[pattern] < 3
    );
    
    // Identify improvement areas per agent
    const improvementAreas: Record<string, string[]> = {};
    
    for (const agent of agents) {
      const agentInitiatedInteractions = interactions.filter(
        i => i.sourceAgentId === agent
      );
      
      const agentTypes = new Set(agentInitiatedInteractions.map(i => i.interactionType));
      const missingTypes = expectedPatterns.filter(type => !agentTypes.has(type));
      
      if (missingTypes.length > 0 || agentInitiatedInteractions.length < 3) {
        improvementAreas[agent] = [
          ...(agentInitiatedInteractions.length < 3 ? ['Increase participation'] : []),
          ...missingTypes.map(type => `Use more ${type} interactions`)
        ];
      }
    }
    
    // Sort potential pairings by potential
    potentialPairings.sort((a, b) => b.potential - a.potential);
    
    return {
      agentPairings: potentialPairings.slice(0, 5), // Top 5 potential pairings
      underutilizedPatterns,
      improvementAreas
    };
  }

  /**
   * Visualize collaboration patterns
   */
  visualizeCollaborationPatterns(meetingId: string): VisualizationGraph {
    // Ensure patterns are up to date
    this.detectPatterns(meetingId);
    
    const patternIds = this.meetingPatterns.get(meetingId) || new Set<string>();
    const interactionIds = this.meetingInteractions.get(meetingId) || new Set<string>();
    
    if (patternIds.size === 0 && interactionIds.size === 0) {
      this.logger.info(`No collaboration data found for meeting ${meetingId}`);
      return {
        id: `collaboration-patterns-${meetingId}`,
        name: `Collaboration Patterns for Meeting ${meetingId}`,
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
    
    // Get all interactions
    const interactions = Array.from(interactionIds)
      .map(id => this.interactions.get(id))
      .filter(Boolean) as CollaborationInteraction[];
    
    // Get all patterns
    const patterns = Array.from(patternIds)
      .map(id => this.patterns.get(id))
      .filter(Boolean) as CollaborationPattern[];
    
    // Get agents involved
    const agentIds = new Set<string>();
    for (const interaction of interactions) {
      agentIds.add(interaction.sourceAgentId);
      agentIds.add(interaction.targetAgentId);
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
    
    // Create pattern elements
    for (const pattern of patterns) {
      const elementId = `pattern-${pattern.id}`;
      elements.push({
        id: elementId,
        type: VisualizationElementType.TOPIC,
        label: this.formatPatternType(pattern.patternType),
        description: pattern.description,
        properties: {
          patternType: pattern.patternType,
          frequency: pattern.frequency,
          significance: pattern.significance
        },
        state: VisualizationElementState.HIGHLIGHTED,
        size: {
          width: 60 + (pattern.significance * 40),
          height: 60 + (pattern.significance * 40)
        },
        color: this.getColorForPattern(pattern.patternType),
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Connect pattern to involved agents
      for (const agentId of pattern.agentIds) {
        connections.push({
          id: `pattern-agent-${pattern.id}-${agentId}`,
          type: VisualizationConnectionType.RELATION,
          sourceId: elementId,
          targetId: `agent-${agentId}`,
          label: '',
          strength: pattern.significance,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }
    
    // Create interaction connections
    for (const interaction of interactions) {
      const connectionId = `interaction-${interaction.id}`;
      connections.push({
        id: connectionId,
        type: VisualizationConnectionType.COMMUNICATION,
        sourceId: `agent-${interaction.sourceAgentId}`,
        targetId: `agent-${interaction.targetAgentId}`,
        label: interaction.interactionType,
        properties: {
          timestamp: interaction.timestamp,
          interactionType: interaction.interactionType,
          context: interaction.context,
          duration: interaction.duration,
          outcome: interaction.outcome
        },
        strength: interaction.strength || 0.5,
        animated: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Connect interaction to its patterns
      for (const pattern of patterns) {
        if (pattern.interactionIds.includes(interaction.id)) {
          connections.push({
            id: `pattern-interaction-${pattern.id}-${interaction.id}`,
            type: VisualizationConnectionType.REFERENCE,
            sourceId: `pattern-${pattern.id}`,
            targetId: connectionId,
            label: '',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }
    
    return {
      id: `collaboration-patterns-${meetingId}`,
      name: `Collaboration Patterns for Meeting ${meetingId}`,
      description: `Visualization of collaboration patterns for meeting ${meetingId}`,
      elements,
      connections,
      layout: 'force-directed',
      timestamp: new Date(),
      version: 1,
      metadata: {
        meetingId,
        patternCount: patterns.length,
        interactionCount: interactions.length,
        agentCount: agentIds.size
      }
    };
  }

  /**
   * Get the most significant patterns
   */
  getSignificantPatterns(meetingId: string, limit: number = 5): {
    patternType: string;
    description: string;
    agentIds: string[];
    significance: number;
    frequency: number;
  }[] {
    // Ensure patterns are up to date
    this.detectPatterns(meetingId);
    
    const patternIds = this.meetingPatterns.get(meetingId) || new Set<string>();
    
    if (patternIds.size === 0) {
      return [];
    }
    
    // Get patterns
    const patterns = Array.from(patternIds)
      .map(id => this.patterns.get(id))
      .filter(Boolean) as CollaborationPattern[];
    
    // Sort by significance
    patterns.sort((a, b) => b.significance - a.significance);
    
    // Return top patterns
    return patterns.slice(0, limit).map(pattern => ({
      patternType: pattern.patternType,
      description: pattern.description,
      agentIds: pattern.agentIds,
      significance: pattern.significance,
      frequency: pattern.frequency
    }));
  }

  /**
   * Analyze agent collaboration styles
   */
  analyzeCollaborationStyles(meetingId: string): Record<string, {
    dominantStyle: string;
    adaptability: number;
    preferredPartners: string[];
    avoidedPartners: string[];
    styleBreakdown: Record<string, number>;
  }> {
    const interactionIds = this.meetingInteractions.get(meetingId) || new Set<string>();
    
    if (interactionIds.size === 0) {
      return {};
    }
    
    // Get interactions
    const interactions = Array.from(interactionIds)
      .map(id => this.interactions.get(id))
      .filter(Boolean) as CollaborationInteraction[];
    
    // Get all agents involved
    const agentIds = new Set<string>();
    for (const interaction of interactions) {
      agentIds.add(interaction.sourceAgentId);
      agentIds.add(interaction.targetAgentId);
    }
    
    const results: Record<string, {
      dominantStyle: string;
      adaptability: number;
      preferredPartners: string[];
      avoidedPartners: string[];
      styleBreakdown: Record<string, number>;
    }> = {};
    
    // Analyze each agent
    for (const agentId of agentIds) {
      // Get interactions where this agent is the source
      const agentInitiatedInteractions = interactions.filter(
        i => i.sourceAgentId === agentId
      );
      
      if (agentInitiatedInteractions.length === 0) {
        continue;
      }
      
      // Count interaction types
      const styleBreakdown: Record<string, number> = {};
      let totalInteractions = 0;
      
      for (const interaction of agentInitiatedInteractions) {
        styleBreakdown[interaction.interactionType] = 
          (styleBreakdown[interaction.interactionType] || 0) + 1;
        totalInteractions++;
      }
      
      // Normalize percentages
      for (const style in styleBreakdown) {
        styleBreakdown[style] = styleBreakdown[style] / totalInteractions;
      }
      
      // Find dominant style
      let dominantStyle = '';
      let maxFrequency = 0;
      
      for (const [style, frequency] of Object.entries(styleBreakdown)) {
        if (frequency > maxFrequency) {
          dominantStyle = style;
          maxFrequency = frequency;
        }
      }
      
      // Calculate adaptability (inverse of dominant style concentration)
      // Higher means more varied styles
      const adaptability = 1 - maxFrequency;
      
      // Find preferred and avoided partners
      const partnerInteractionCounts: Record<string, number> = {};
      
      for (const interaction of agentInitiatedInteractions) {
        partnerInteractionCounts[interaction.targetAgentId] = 
          (partnerInteractionCounts[interaction.targetAgentId] || 0) + 1;
      }
      
      // Sort partners by interaction count
      const sortedPartners = Object.entries(partnerInteractionCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([id]) => id);
      
      // Top 30% are preferred, bottom 30% are avoided
      const preferredCount = Math.ceil(sortedPartners.length * 0.3);
      const preferredPartners = sortedPartners.slice(0, preferredCount);
      const avoidedPartners = sortedPartners.slice(-preferredCount);
      
      results[agentId] = {
        dominantStyle,
        adaptability,
        preferredPartners,
        avoidedPartners,
        styleBreakdown
      };
    }
    
    return results;
  }

  /**
   * Helper: Detect patterns from recorded interactions
   */
  private detectPatterns(meetingId: string): void {
    const interactionIds = this.meetingInteractions.get(meetingId) || new Set<string>();
    
    if (interactionIds.size === 0) {
      return;
    }
    
    // Get interactions
    const interactions = Array.from(interactionIds)
      .map(id => this.interactions.get(id))
      .filter(Boolean) as CollaborationInteraction[];
    
    if (interactions.length < 3) {
      // Not enough interactions to detect patterns
      return;
    }
    
    // Clear existing patterns for this meeting
    if (this.meetingPatterns.has(meetingId)) {
      const oldPatternIds = this.meetingPatterns.get(meetingId) || new Set<string>();
      for (const id of oldPatternIds) {
        this.patterns.delete(id);
      }
      this.meetingPatterns.set(meetingId, new Set());
    }
    
    // Detect pair-wise collaboration patterns
    this.detectPairCollaborationPatterns(meetingId, interactions);
    
    // Detect team-wide collaboration patterns
    this.detectTeamCollaborationPatterns(meetingId, interactions);
  }
  
  /**
   * Helper: Detect pair-wise collaboration patterns
   */
  private detectPairCollaborationPatterns(
    meetingId: string, 
    interactions: CollaborationInteraction[]
  ): void {
    // Group interactions by agent pairs
    const pairInteractions: Record<string, CollaborationInteraction[]> = {};
    
    for (const interaction of interactions) {
      // Create stable ID for the pair (sort agent IDs to ensure consistency)
      const agentIds = [interaction.sourceAgentId, interaction.targetAgentId].sort();
      const pairId = `${agentIds[0]}-${agentIds[1]}`;
      
      if (!pairInteractions[pairId]) {
        pairInteractions[pairId] = [];
      }
      
      pairInteractions[pairId].push(interaction);
    }
    
    // Analyze each pair for patterns
    for (const [pairId, pairInteractionList] of Object.entries(pairInteractions)) {
      if (pairInteractionList.length < 3) {
        continue; // Need at least 3 interactions to establish a pattern
      }
      
      // Count interaction types
      const typeCounts: Record<string, number> = {};
      
      for (const interaction of pairInteractionList) {
        typeCounts[interaction.interactionType] = 
          (typeCounts[interaction.interactionType] || 0) + 1;
      }
      
      // Find the most frequent type
      let mostFrequentType = '';
      let maxCount = 0;
      
      for (const [type, count] of Object.entries(typeCounts)) {
        if (count > maxCount) {
          mostFrequentType = type;
          maxCount = count;
        }
      }
      
      // Check if this constitutes a pattern (at least 3 occurrences and >50% of interactions)
      if (maxCount >= 3 && maxCount / pairInteractionList.length > 0.5) {
        // Extract agent IDs from pair ID
        const agentIds = pairId.split('-');
        
        // Create pattern
        const patternId = `pair-pattern-${pairId}-${mostFrequentType}`;
        const pattern: CollaborationPattern = {
          id: patternId,
          meetingId,
          patternType: `pair_${mostFrequentType}`,
          agentIds,
          interactionIds: pairInteractionList.map(i => i.id),
          frequency: maxCount,
          significance: maxCount / pairInteractionList.length,
          description: `Repeated ${mostFrequentType} interactions between agents ${agentIds[0].split('-').pop()} and ${agentIds[1].split('-').pop()}`
        };
        
        this.patterns.set(patternId, pattern);
        this.addToIndex(this.meetingPatterns, meetingId, patternId);
      }
    }
  }
  
  /**
   * Helper: Detect team-wide collaboration patterns
   */
  private detectTeamCollaborationPatterns(
    meetingId: string, 
    interactions: CollaborationInteraction[]
  ): void {
    // Detect communication cycle patterns (A->B->C->A)
    this.detectCommunicationCycles(meetingId, interactions);
    
    // Detect centralization patterns (one agent interacting with many)
    this.detectCentralizationPatterns(meetingId, interactions);
  }
  
  /**
   * Helper: Detect communication cycles
   */
  private detectCommunicationCycles(
    meetingId: string, 
    interactions: CollaborationInteraction[]
  ): void {
    // Build a directed graph of communications
    const graph: Record<string, string[]> = {};
    
    for (const interaction of interactions) {
      if (!graph[interaction.sourceAgentId]) {
        graph[interaction.sourceAgentId] = [];
      }
      
      if (!graph[interaction.sourceAgentId].includes(interaction.targetAgentId)) {
        graph[interaction.sourceAgentId].push(interaction.targetAgentId);
      }
    }
    
    // Find cycles of length 3 or more
    const cycles = this.findCycles(graph);
    
    // Create patterns for each cycle
    for (const cycle of cycles) {
      if (cycle.length < 3) continue;
      
      // Get interactions that are part of this cycle
      const cycleInteractions = interactions.filter(interaction => {
        const sourceIndex = cycle.indexOf(interaction.sourceAgentId);
        if (sourceIndex === -1) return false;
        
        const targetIndex = (sourceIndex + 1) % cycle.length;
        return interaction.targetAgentId === cycle[targetIndex];
      });
      
      if (cycleInteractions.length < cycle.length) continue;
      
      const patternId = `cycle-pattern-${cycle.join('-')}`;
      const pattern: CollaborationPattern = {
        id: patternId,
        meetingId,
        patternType: 'communication_cycle',
        agentIds: cycle,
        interactionIds: cycleInteractions.map(i => i.id),
        frequency: cycleInteractions.length / cycle.length,
        significance: Math.min(1, cycle.length / 5), // Larger cycles are more significant
        description: `Communication cycle among ${cycle.length} agents`
      };
      
      this.patterns.set(patternId, pattern);
      this.addToIndex(this.meetingPatterns, meetingId, patternId);
    }
  }
  
  /**
   * Helper: Find cycles in a directed graph
   */
  private findCycles(graph: Record<string, string[]>): string[][] {
    const visited: Record<string, boolean> = {};
    const cycles: string[][] = [];
    
    for (const node in graph) {
      this.dfs(node, graph, [], visited, {}, cycles);
    }
    
    return cycles;
  }
  
  /**
   * Helper: DFS to find cycles
   */
  private dfs(
    node: string, 
    graph: Record<string, string[]>, 
    path: string[], 
    visited: Record<string, boolean>,
    recStack: Record<string, boolean>,
    cycles: string[][]
  ): void {
    // Mark node as visited
    visited[node] = true;
    path.push(node);
    recStack[node] = true;
    
    // Visit neighbors
    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      // If cycle found
      if (recStack[neighbor]) {
        // Extract cycle
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart);
        
        // Check if this cycle is new
        const cycleString = cycle.sort().join('-');
        if (!cycles.some(c => c.sort().join('-') === cycleString)) {
          cycles.push(cycle);
        }
      } else if (!visited[neighbor]) {
        this.dfs(neighbor, graph, [...path], visited, {...recStack}, cycles);
      }
    }
    
    // Remove from recursion stack
    recStack[node] = false;
  }
  
  /**
   * Helper: Detect centralization patterns
   */
  private detectCentralizationPatterns(
    meetingId: string, 
    interactions: CollaborationInteraction[]
  ): void {
    // Count outgoing interactions for each agent
    const outgoingCount: Record<string, number> = {};
    const uniqueTargets: Record<string, Set<string>> = {};
    
    for (const interaction of interactions) {
      outgoingCount[interaction.sourceAgentId] = 
        (outgoingCount[interaction.sourceAgentId] || 0) + 1;
      
      if (!uniqueTargets[interaction.sourceAgentId]) {
        uniqueTargets[interaction.sourceAgentId] = new Set();
      }
      
      uniqueTargets[interaction.sourceAgentId].add(interaction.targetAgentId);
    }
    
    // Get all agent IDs
    const agentIds = new Set<string>();
    for (const interaction of interactions) {
      agentIds.add(interaction.sourceAgentId);
      agentIds.add(interaction.targetAgentId);
    }
    
    // Find centralized agents (interacting with >70% of other agents)
    for (const [agentId, targets] of Object.entries(uniqueTargets)) {
      const connectionRatio = targets.size / (agentIds.size - 1);
      
      if (connectionRatio > 0.7 && outgoingCount[agentId] > 5) {
        // This is a centralized agent
        const centralInteractions = interactions.filter(
          i => i.sourceAgentId === agentId
        );
        
        const patternId = `centralization-pattern-${agentId}`;
        const pattern: CollaborationPattern = {
          id: patternId,
          meetingId,
          patternType: 'centralization',
          agentIds: [agentId, ...Array.from(targets)],
          interactionIds: centralInteractions.map(i => i.id),
          frequency: outgoingCount[agentId],
          significance: connectionRatio,
          description: `Centralized communication pattern with agent ${agentId.split('-').pop()} as hub`
        };
        
        this.patterns.set(patternId, pattern);
        this.addToIndex(this.meetingPatterns, meetingId, patternId);
      }
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
   * Helper: Get color for pattern type
   */
  private getColorForPattern(patternType: string): string {
    const colorMap: Record<string, string> = {
      'pair_discussion': '#2196F3', // Blue
      'pair_question': '#FF9800', // Orange
      'pair_challenge': '#F44336', // Red
      'pair_support': '#4CAF50', // Green
      'communication_cycle': '#9C27B0', // Purple
      'centralization': '#E91E63', // Pink
      'team_consensus': '#009688' // Teal
    };
    
    // Check if pattern type starts with any of the keys
    for (const [key, color] of Object.entries(colorMap)) {
      if (patternType.startsWith(key)) {
        return color;
      }
    }
    
    return '#607D8B'; // Blue Grey default
  }

  /**
   * Helper: Format pattern type for display
   */
  private formatPatternType(patternType: string): string {
    return patternType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
} 