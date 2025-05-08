/**
 * Topic Visualization Service
 * Part of Milestone 3.1: Enhanced Topic Extraction
 */
import {
  Topic,
  TopicGraph,
  TopicRelationship,
  TopicExtractionResult
} from '../interfaces/topic-extraction.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * Graph visualization format for topics
 */
export interface TopicGraphVisualization {
  nodes: Array<{
    id: string;
    label: string;
    size: number;
    color?: string;
    group?: string;
    metadata?: Record<string, any>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    width?: number;
    color?: string;
    type?: string;
    metadata?: Record<string, any>;
  }>;
}

/**
 * Timeline visualization format
 */
export interface TopicTimelineVisualization {
  timeline: Array<{
    time: number;
    topics: Array<{
      id: string;
      name: string;
      isDominant: boolean;
      relevance: number;
    }>;
  }>;
}

/**
 * Heatmap visualization format
 */
export interface TopicHeatmapVisualization {
  speakers: string[];
  topics: Array<{
    id: string;
    name: string;
  }>;
  heatmap: Array<Array<number>>; // [speaker][topic] -> intensity
}

/**
 * Configuration for topic visualization
 */
export interface TopicVisualizationConfig {
  colorScheme?: string[];
  minNodeSize?: number;
  maxNodeSize?: number;
  minEdgeWidth?: number;
  maxEdgeWidth?: number;
  hierarchyLayout?: boolean;
  includeMetadata?: boolean;
}

/**
 * Service for generating visualizations from topic data
 */
export class TopicVisualizationService {
  private logger: Logger;
  private defaultConfig: TopicVisualizationConfig = {
    colorScheme: [
      '#4285F4', // blue
      '#EA4335', // red
      '#FBBC05', // yellow
      '#34A853', // green
      '#8AB4F8', // light blue
      '#F6AEA9', // light red
      '#FDD663', // light yellow
      '#8CE8AD'  // light green
    ],
    minNodeSize: 10,
    maxNodeSize: 50,
    minEdgeWidth: 1,
    maxEdgeWidth: 5,
    hierarchyLayout: true,
    includeMetadata: true
  };
  
  /**
   * Create a new topic visualization service
   */
  constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
    this.logger.info('Topic visualization service initialized');
  }
  
  /**
   * Create graph visualization data from topic graph
   */
  createGraphVisualization(
    topicGraph: TopicGraph,
    config?: Partial<TopicVisualizationConfig>
  ): TopicGraphVisualization {
    const fullConfig = { ...this.defaultConfig, ...config };
    
    this.logger.info(`Creating graph visualization for ${topicGraph.topics.length} topics`);
    
    // Create nodes
    const nodes = topicGraph.topics.map((topic, index) => {
      // Calculate node size based on relevance score
      const size = this.calculateNodeSize(
        topic.relevanceScore,
        fullConfig.minNodeSize!,
        fullConfig.maxNodeSize!
      );
      
      // Assign color from scheme
      const colorIndex = index % fullConfig.colorScheme!.length;
      const color = fullConfig.colorScheme![colorIndex];
      
      // Determine group (for visualization grouping)
      let group = 'topic';
      if (topic.parentTopicId) {
        group = 'subtopic';
      } else if (topic.childTopicIds.length > 0) {
        group = 'parentTopic';
      }
      
      return {
        id: topic.id,
        label: topic.name,
        size,
        color,
        group,
        metadata: fullConfig.includeMetadata ? {
          description: topic.description,
          keywords: topic.keywords,
          confidence: topic.confidence,
          mentionCount: topic.mentionCount,
          organizationalRelevance: topic.organizationalContext?.businessValueScore
        } : undefined
      };
    });
    
    // Create edges
    const edges = topicGraph.relationships.map((rel, index) => {
      // Calculate edge width based on relationship strength
      const width = this.calculateEdgeWidth(
        rel.strength,
        fullConfig.minEdgeWidth!,
        fullConfig.maxEdgeWidth!
      );
      
      // Determine edge color and type
      let color = '#999999'; // Default gray
      let type = 'solid';
      
      switch (rel.relationshipType) {
        case 'hierarchy':
          color = '#333333'; // Dark for hierarchy
          type = 'solid';
          break;
        case 'related':
          color = '#666666'; // Medium for related
          type = 'dashed';
          break;
        case 'sequence':
          color = '#999999'; // Light for sequence
          type = 'dotted';
          break;
        case 'causal':
          color = '#555555'; // Medium-dark for causal
          type = 'solid';
          break;
      }
      
      return {
        id: `edge-${index}`,
        source: rel.sourceTopicId,
        target: rel.targetTopicId,
        label: rel.description,
        width,
        color,
        type,
        metadata: fullConfig.includeMetadata ? {
          relationshipType: rel.relationshipType,
          strength: rel.strength
        } : undefined
      };
    });
    
    return { nodes, edges };
  }
  
  /**
   * Create timeline visualization from extraction results
   */
  createTimelineVisualization(
    extractionResult: TopicExtractionResult
  ): TopicTimelineVisualization {
    const { topicTimeline, topics } = extractionResult;
    
    // Create a map of topic IDs to topics for quick lookup
    const topicMap = new Map(topics.map(topic => [topic.id, topic]));
    
    // Transform timeline data for visualization
    const timeline = topicTimeline.map(entry => {
      return {
        time: entry.timestamp,
        topics: entry.activeTopicIds.map(topicId => {
          const topic = topicMap.get(topicId);
          
          if (!topic) {
            throw new Error(`Topic not found: ${topicId}`);
          }
          
          return {
            id: topic.id,
            name: topic.name,
            isDominant: entry.dominantTopicId === topic.id,
            relevance: topic.relevanceScore
          };
        })
      };
    });
    
    return { timeline };
  }
  
  /**
   * Create heatmap visualization showing topic intensity by speaker
   */
  createHeatmapVisualization(
    extractionResult: TopicExtractionResult
  ): TopicHeatmapVisualization {
    const { topics } = extractionResult;
    
    // Get unique speakers across all topics
    const allSpeakers = new Set<string>();
    for (const topic of topics) {
      for (const speakerId of topic.speakerIds) {
        allSpeakers.add(speakerId);
      }
    }
    
    const speakers = Array.from(allSpeakers);
    
    // Create heatmap data structure
    const heatmap: number[][] = Array(speakers.length)
      .fill(0)
      .map(() => Array(topics.length).fill(0));
    
    // Fill in heatmap values
    for (let topicIndex = 0; topicIndex < topics.length; topicIndex++) {
      const topic = topics[topicIndex];
      
      // For each speaker, calculate their contribution to this topic
      for (let speakerIndex = 0; speakerIndex < speakers.length; speakerIndex++) {
        const speakerId = speakers[speakerIndex];
        
        // Count segments by this speaker for this topic
        const speakerSegments = topic.segments.filter(
          segment => segment.speakerId === speakerId
        );
        
        // Calculate average relevance across segments
        if (speakerSegments.length > 0) {
          const avgRelevance = speakerSegments.reduce(
            (sum, segment) => sum + segment.relevanceScore, 
            0
          ) / speakerSegments.length;
          
          heatmap[speakerIndex][topicIndex] = avgRelevance;
        }
      }
    }
    
    // Create topic entries for the result
    const topicEntries = topics.map(topic => ({
      id: topic.id,
      name: topic.name
    }));
    
    return {
      speakers,
      topics: topicEntries,
      heatmap
    };
  }
  
  /**
   * Export topic graph to a format compatible with visualization libraries
   */
  exportGraphForVisualization(
    graphVisualization: TopicGraphVisualization,
    format: 'json' | 'cytoscape' | 'd3' | 'sigma' = 'json'
  ): string {
    switch (format) {
      case 'json':
        return JSON.stringify(graphVisualization);
        
      case 'cytoscape':
        return JSON.stringify(this.convertToCytoscapeFormat(graphVisualization));
        
      case 'd3':
        return JSON.stringify(this.convertToD3Format(graphVisualization));
        
      case 'sigma':
        return JSON.stringify(this.convertToSigmaFormat(graphVisualization));
        
      default:
        return JSON.stringify(graphVisualization);
    }
  }
  
  /**
   * Calculate node size based on relevance score
   */
  private calculateNodeSize(
    relevanceScore: number,
    minSize: number,
    maxSize: number
  ): number {
    return minSize + relevanceScore * (maxSize - minSize);
  }
  
  /**
   * Calculate edge width based on relationship strength
   */
  private calculateEdgeWidth(
    strength: number,
    minWidth: number,
    maxWidth: number
  ): number {
    return minWidth + strength * (maxWidth - minWidth);
  }
  
  /**
   * Convert to Cytoscape.js format
   */
  private convertToCytoscapeFormat(
    graph: TopicGraphVisualization
  ): any {
    const elements = {
      nodes: graph.nodes.map(node => ({
        data: {
          id: node.id,
          label: node.label,
          size: node.size,
          color: node.color,
          group: node.group,
          ...node.metadata
        }
      })),
      edges: graph.edges.map(edge => ({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          width: edge.width,
          color: edge.color,
          type: edge.type,
          ...edge.metadata
        }
      }))
    };
    
    return elements;
  }
  
  /**
   * Convert to D3.js format
   */
  private convertToD3Format(
    graph: TopicGraphVisualization
  ): any {
    return {
      nodes: graph.nodes.map(node => ({
        id: node.id,
        name: node.label,
        val: node.size,
        group: node.group,
        color: node.color,
        ...node.metadata
      })),
      links: graph.edges.map(edge => ({
        source: edge.source,
        target: edge.target,
        value: edge.width,
        label: edge.label,
        type: edge.type,
        color: edge.color,
        ...edge.metadata
      }))
    };
  }
  
  /**
   * Convert to Sigma.js format
   */
  private convertToSigmaFormat(
    graph: TopicGraphVisualization
  ): any {
    return {
      nodes: graph.nodes.map(node => ({
        id: node.id,
        label: node.label,
        size: node.size,
        color: node.color,
        type: node.group,
        ...node.metadata
      })),
      edges: graph.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        size: edge.width,
        color: edge.color,
        type: edge.type,
        ...edge.metadata
      }))
    };
  }
} 