/**
 * Insight Discovery Visualization Service
 * 
 * Implements visualization of discovered insights during meeting analysis.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { 
  InsightDiscoveryVisualization, 
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Insight record for tracking and visualization
 */
interface Insight {
  id: string;
  meetingId: string;
  timestamp: Date;
  description: string;
  sourceAgentId: string;
  importance: number;
  confidence: number;
  relatedEntityIds?: string[];
  type: 'topic' | 'action' | 'decision' | 'pattern' | 'relationship';
  refinements: Array<{
    timestamp: Date;
    description: string;
    confidence: number;
    agentId: string;
  }>;
}

/**
 * Configuration for the InsightDiscoveryVisualizationImpl
 */
export interface InsightDiscoveryVisualizationConfig {
  logger?: Logger;
}

/**
 * Implementation of the InsightDiscoveryVisualization interface
 */
export class InsightDiscoveryVisualizationImpl implements InsightDiscoveryVisualization {
  private logger: Logger;
  private insights: Map<string, Insight>;
  private meetingInsights: Map<string, Set<string>>;
  private typeInsights: Map<string, Set<string>>;

  /**
   * Create a new insight discovery visualization service
   */
  constructor(config: InsightDiscoveryVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.insights = new Map();
    this.meetingInsights = new Map();
    this.typeInsights = new Map();
    this.logger.info('InsightDiscoveryVisualizationImpl initialized');
  }

  /**
   * Record a new insight
   */
  recordInsight(meetingId: string, insight: {
    timestamp: Date;
    description: string;
    sourceAgentId: string;
    importance: number;
    confidence: number;
    relatedEntityIds?: string[];
    type: 'topic' | 'action' | 'decision' | 'pattern' | 'relationship';
  }): string {
    const insightId = `insight-${uuidv4()}`;
    
    // Create the insight record
    const newInsight: Insight = {
      id: insightId,
      meetingId,
      timestamp: insight.timestamp,
      description: insight.description,
      sourceAgentId: insight.sourceAgentId,
      importance: insight.importance,
      confidence: insight.confidence,
      relatedEntityIds: insight.relatedEntityIds,
      type: insight.type,
      refinements: []
    };
    
    // Store the insight
    this.insights.set(insightId, newInsight);
    
    // Index by meeting
    if (!this.meetingInsights.has(meetingId)) {
      this.meetingInsights.set(meetingId, new Set());
    }
    this.meetingInsights.get(meetingId)?.add(insightId);
    
    // Index by type
    const typeKey = `${meetingId}-${insight.type}`;
    if (!this.typeInsights.has(typeKey)) {
      this.typeInsights.set(typeKey, new Set());
    }
    this.typeInsights.get(typeKey)?.add(insightId);
    
    this.logger.info(`Recorded insight ${insightId} of type ${insight.type} for meeting ${meetingId}`);
    return insightId;
  }

  /**
   * Add a refinement to an existing insight
   */
  refineInsight(insightId: string, refinement: {
    timestamp: Date;
    description: string;
    confidence: number;
    agentId: string;
  }): boolean {
    const insight = this.insights.get(insightId);
    
    if (!insight) {
      this.logger.warn(`Insight ${insightId} not found`);
      return false;
    }
    
    // Add the refinement
    insight.refinements.push({
      timestamp: refinement.timestamp,
      description: refinement.description,
      confidence: refinement.confidence,
      agentId: refinement.agentId
    });
    
    // Update the confidence if the new confidence is higher
    if (refinement.confidence > insight.confidence) {
      insight.confidence = refinement.confidence;
    }
    
    this.logger.info(`Added refinement to insight ${insightId}`);
    return true;
  }

  /**
   * Visualize the insight discovery process
   */
  visualizeInsightDiscovery(meetingId: string): VisualizationGraph {
    const insightIds = this.meetingInsights.get(meetingId);
    
    if (!insightIds || insightIds.size === 0) {
      this.logger.warn(`No insights found for meeting ${meetingId}`);
      return {
        id: `insight-discovery-${meetingId}`,
        name: 'No Insight Data',
        elements: [],
        connections: [],
        layout: 'force-directed',
        timestamp: new Date(),
        version: 1
      };
    }
    
    // Get all insights for this meeting
    const insights = Array.from(insightIds)
      .map(id => this.insights.get(id))
      .filter(Boolean) as Insight[];
    
    // Sort insights by timestamp
    insights.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Create elements and connections for visualization
    const elements: VisualizationElement[] = [];
    const connections: VisualizationConnection[] = [];
    
    // Process each insight
    insights.forEach(insight => {
      // Create insight element
      const insightElement: VisualizationElement = {
        id: `element-${insight.id}`,
        type: VisualizationElementType.INSIGHT,
        label: this.createShortLabel(insight.description),
        description: insight.description,
        properties: {
          timestamp: insight.timestamp,
          sourceAgentId: insight.sourceAgentId,
          importance: insight.importance,
          confidence: insight.confidence,
          type: insight.type,
          refinementCount: insight.refinements.length
        },
        state: this.getStateForConfidence(insight.confidence),
        size: {
          width: 50 + (insight.importance * 100), // Size reflects importance
          height: 50 + (insight.importance * 50)
        },
        color: this.getColorForInsightType(insight.type),
        createdAt: insight.timestamp,
        updatedAt: insight.refinements.length > 0 ? 
          insight.refinements[insight.refinements.length - 1].timestamp : 
          insight.timestamp,
        metadata: {
          insightId: insight.id,
          insightType: insight.type
        }
      };
      
      elements.push(insightElement);
      
      // Create elements for refinements
      insight.refinements.forEach((refinement, index) => {
        const refinementElement: VisualizationElement = {
          id: `refinement-${insight.id}-${index}`,
          type: VisualizationElementType.INSIGHT,
          label: `Refinement ${index + 1}`,
          description: refinement.description,
          properties: {
            timestamp: refinement.timestamp,
            sourceAgentId: refinement.agentId,
            confidence: refinement.confidence
          },
          state: this.getStateForConfidence(refinement.confidence),
          size: {
            width: 30,
            height: 30
          },
          color: this.getColorForInsightType(insight.type, true),
          createdAt: refinement.timestamp,
          updatedAt: refinement.timestamp,
          metadata: {
            insightId: insight.id,
            refinementIndex: index
          }
        };
        
        elements.push(refinementElement);
        
        // Connect refinement to insight
        connections.push({
          id: `connection-${insight.id}-refinement-${index}`,
          type: VisualizationConnectionType.RELATION,
          sourceId: `element-${insight.id}`,
          targetId: `refinement-${insight.id}-${index}`,
          label: 'Refines',
          properties: {
            confidenceDelta: refinement.confidence - insight.confidence
          },
          createdAt: refinement.timestamp,
          updatedAt: refinement.timestamp
        });
      });
      
      // Connect to related entities if they exist in the visualization
      if (insight.relatedEntityIds && insight.relatedEntityIds.length > 0) {
        for (const relatedId of insight.relatedEntityIds) {
          if (this.insights.has(relatedId)) {
            connections.push({
              id: `connection-${insight.id}-${relatedId}`,
              type: VisualizationConnectionType.REFERENCE,
              sourceId: `element-${insight.id}`,
              targetId: `element-${relatedId}`,
              label: 'Related To',
              properties: {},
              createdAt: insight.timestamp,
              updatedAt: insight.timestamp
            });
          }
        }
      }
    });
    
    return {
      id: `insight-discovery-${meetingId}`,
      name: `Insight Discovery for Meeting ${meetingId}`,
      description: `Visualization of insights discovered during meeting ${meetingId}`,
      elements,
      connections,
      layout: 'force-directed',
      timestamp: new Date(),
      version: 1,
      metadata: {
        meetingId,
        insightCount: insights.length,
        refinementCount: insights.reduce((sum, insight) => sum + insight.refinements.length, 0),
        averageConfidence: this.calculateAverageConfidence(insights)
      }
    };
  }

  /**
   * Get insights by type
   */
  getInsightsByType(meetingId: string, type: string): any[] {
    const typeKey = `${meetingId}-${type}`;
    const insightIds = this.typeInsights.get(typeKey);
    
    if (!insightIds) {
      return [];
    }
    
    return Array.from(insightIds)
      .map(id => this.insights.get(id))
      .filter(Boolean) as Insight[];
  }

  /**
   * Track the evolution of a specific insight
   */
  trackInsightEvolution(insightId: string): {
    refinements: Array<{ timestamp: Date; description: string }>;
    confidenceTrend: Array<{ timestamp: Date; value: number }>;
    contributingAgents: string[];
  } {
    const insight = this.insights.get(insightId);
    
    if (!insight) {
      this.logger.warn(`Insight ${insightId} not found`);
      return {
        refinements: [],
        confidenceTrend: [],
        contributingAgents: []
      };
    }
    
    // Extract refinement info
    const refinements = insight.refinements.map(r => ({
      timestamp: r.timestamp,
      description: r.description
    }));
    
    // Build confidence trend
    const confidenceTrend = [
      { timestamp: insight.timestamp, value: insight.confidence }
    ];
    
    for (const refinement of insight.refinements) {
      confidenceTrend.push({
        timestamp: refinement.timestamp,
        value: refinement.confidence
      });
    }
    
    // Identify contributing agents
    const contributingAgents = [insight.sourceAgentId];
    
    for (const refinement of insight.refinements) {
      if (!contributingAgents.includes(refinement.agentId)) {
        contributingAgents.push(refinement.agentId);
      }
    }
    
    return {
      refinements,
      confidenceTrend,
      contributingAgents
    };
  }

  /**
   * Identify the key (most important) insights
   */
  identifyKeyInsights(meetingId: string): string[] {
    const insightIds = this.meetingInsights.get(meetingId);
    
    if (!insightIds || insightIds.size === 0) {
      return [];
    }
    
    // Get all insights for this meeting
    const insights = Array.from(insightIds)
      .map(id => this.insights.get(id))
      .filter(Boolean) as Insight[];
    
    if (insights.length === 0) {
      return [];
    }
    
    // Calculate importance score for each insight
    const scoredInsights = insights.map(insight => {
      // Base score is the importance
      let score = insight.importance;
      
      // Adjust by confidence
      score *= insight.confidence;
      
      // Adjust by refinement count (refined insights are more important)
      score *= (1 + insight.refinements.length * 0.1);
      
      // Adjust by related entity count (more connections = more important)
      score *= (1 + (insight.relatedEntityIds?.length || 0) * 0.05);
      
      return {
        id: insight.id,
        score
      };
    });
    
    // Sort by score
    scoredInsights.sort((a, b) => b.score - a.score);
    
    // Return top 30% (or at least 3, but no more than 10)
    const topCount = Math.min(10, Math.max(3, Math.ceil(insights.length * 0.3)));
    return scoredInsights.slice(0, topCount).map(i => i.id);
  }

  /**
   * Helper: Create a short label from long description
   */
  private createShortLabel(description: string): string {
    if (description.length <= 30) {
      return description;
    }
    
    return description.substring(0, 27) + '...';
  }

  /**
   * Helper: Get appropriate state based on confidence
   */
  private getStateForConfidence(confidence: number): VisualizationElementState {
    if (confidence >= 0.8) {
      return VisualizationElementState.ACTIVE;
    } else if (confidence >= 0.5) {
      return VisualizationElementState.HIGHLIGHTED;
    } else {
      return VisualizationElementState.INACTIVE;
    }
  }

  /**
   * Helper: Get color for insight type
   */
  private getColorForInsightType(type: string, isRefinement: boolean = false): string {
    const baseColors: Record<string, string> = {
      'topic': '#673AB7', // Purple for topic insights
      'action': '#FF9800', // Orange for action insights
      'decision': '#F44336', // Red for decision insights
      'pattern': '#2196F3', // Blue for pattern insights
      'relationship': '#4CAF50' // Green for relationship insights
    };
    
    const baseColor = baseColors[type] || '#9E9E9E';
    
    if (isRefinement) {
      // Lighten color for refinements
      return this.adjustColorBrightness(baseColor, 40);
    }
    
    return baseColor;
  }

  /**
   * Helper: Adjust color brightness
   */
  private adjustColorBrightness(hexColor: string, percent: number): string {
    const R = parseInt(hexColor.substring(1, 3), 16);
    const G = parseInt(hexColor.substring(3, 5), 16);
    const B = parseInt(hexColor.substring(5, 7), 16);
    
    const adjustedR = Math.min(255, R + Math.floor(R * percent / 100));
    const adjustedG = Math.min(255, G + Math.floor(G * percent / 100));
    const adjustedB = Math.min(255, B + Math.floor(B * percent / 100));
    
    return `#${adjustedR.toString(16).padStart(2, '0')}${adjustedG.toString(16).padStart(2, '0')}${adjustedB.toString(16).padStart(2, '0')}`;
  }

  /**
   * Helper: Calculate average confidence across insights
   */
  private calculateAverageConfidence(insights: Insight[]): number {
    if (insights.length === 0) {
      return 0;
    }
    
    const totalConfidence = insights.reduce((sum, insight) => sum + insight.confidence, 0);
    return totalConfidence / insights.length;
  }
} 