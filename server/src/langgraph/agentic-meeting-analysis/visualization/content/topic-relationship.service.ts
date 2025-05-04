/**
 * Topic Relationship Visualization Service
 * 
 * Implements visualization of relationships between topics identified in meeting analysis.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  TopicRelationshipVisualization,
  TopicNode,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Topic relationship for visualization
 */
interface TopicRelationship {
  id: string;
  sourceTopicId: string;
  targetTopicId: string;
  relationshipType: string;
  strength: number;
  description?: string;
}

/**
 * Topic in test format (for backward compatibility with test-visualization.ts)
 */
interface TestTopic {
  topicId: string;
  name: string;
  description: string;
  importance: number;
  duration: number;
  parentTopicId: string | null;
}

/**
 * Configuration for the TopicRelationshipVisualizationImpl
 */
export interface TopicRelationshipVisualizationConfig {
  logger?: Logger;
}

/**
 * Implementation of the TopicRelationshipVisualization interface
 */
export class TopicRelationshipVisualizationImpl implements TopicRelationshipVisualization {
  private logger: Logger;
  private topicMaps: Map<string, {
    meetingId: string;
    topics: Map<string, TopicNode>;
    relationships: Map<string, TopicRelationship>;
    elements: Map<string, VisualizationElement>;
    connections: Map<string, VisualizationConnection>;
    version: number;
    timestamp: Date;
  }>;

  /**
   * Create a new topic relationship visualization service
   */
  constructor(config: TopicRelationshipVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.topicMaps = new Map();
    this.logger.info('TopicRelationshipVisualizationImpl initialized');
  }

  /**
   * Create a new topic map for a meeting
   */
  createTopicMap(meetingId: string): string {
    const mapId = `topic-map-${uuidv4()}`;
    
    this.topicMaps.set(mapId, {
      meetingId,
      topics: new Map<string, TopicNode>(),
      relationships: new Map<string, TopicRelationship>(),
      elements: new Map<string, VisualizationElement>(),
      connections: new Map<string, VisualizationConnection>(),
      version: 1,
      timestamp: new Date()
    });
    
    this.logger.info(`Created topic map ${mapId} for meeting ${meetingId}`);
    return mapId;
  }

  /**
   * For test compatibility - alias for createTopicMap
   */
  createTopicGraph(meetingId: string): string {
    return this.createTopicMap(meetingId);
  }

  /**
   * Add a topic to the map
   */
  addTopic(mapId: string, topic: Omit<TopicNode, 'id'>): string {
    const topicMap = this.topicMaps.get(mapId);
    
    if (!topicMap) {
      this.logger.warn(`Topic map ${mapId} not found`);
      throw new Error(`Topic map ${mapId} not found`);
    }
    
    const topicId = `topic-${uuidv4()}`;
    
    // Create topic record
    const newTopic: TopicNode = {
      id: topicId,
      name: topic.name,
      description: topic.description,
      relevanceScore: topic.relevanceScore,
      timeSpent: topic.timeSpent,
      participantIds: topic.participantIds,
      sentimentScore: topic.sentimentScore,
      keywords: topic.keywords,
      parentTopicId: topic.parentTopicId,
      childTopicIds: topic.childTopicIds || []
    };
    
    topicMap.topics.set(topicId, newTopic);
    
    // Create visualization element for this topic
    const element: VisualizationElement = {
      id: `element-${topicId}`,
      type: VisualizationElementType.TOPIC,
      label: topic.name,
      description: topic.description || `Topic: ${topic.name}`,
      properties: {
        relevanceScore: topic.relevanceScore,
        timeSpent: topic.timeSpent,
        participantIds: topic.participantIds,
        sentimentScore: topic.sentimentScore,
        keywords: topic.keywords
      },
      state: VisualizationElementState.ACTIVE,
      size: {
        width: 50 + (topic.relevanceScore * 100), // Size reflects relevance
        height: 50 + (topic.relevanceScore * 100)
      },
      color: this.getColorForSentiment(topic.sentimentScore || 0),
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        topicId
      }
    };
    
    topicMap.elements.set(element.id, element);
    
    // Connect to parent topic if specified
    if (topic.parentTopicId) {
      const parentTopic = topicMap.topics.get(topic.parentTopicId);
      
      if (parentTopic) {
        // Add this topic as child of parent
        if (!parentTopic.childTopicIds) {
          parentTopic.childTopicIds = [];
        }
        
        if (!parentTopic.childTopicIds.includes(topicId)) {
          parentTopic.childTopicIds.push(topicId);
        }
        
        // Create hierarchical relationship
        this.createHierarchyRelationship(mapId, topic.parentTopicId, topicId);
      }
    }
    
    // Connect to child topics if specified
    if (topic.childTopicIds && topic.childTopicIds.length > 0) {
      for (const childId of topic.childTopicIds) {
        const childTopic = topicMap.topics.get(childId);
        
        if (childTopic) {
          // Update child's parent reference
          childTopic.parentTopicId = topicId;
          
          // Create hierarchical relationship
          this.createHierarchyRelationship(mapId, topicId, childId);
        }
      }
    }
    
    // Update map metadata
    topicMap.version += 1;
    topicMap.timestamp = new Date();
    
    this.logger.info(`Added topic ${topicId} to map ${mapId}`);
    return topicId;
  }

  /**
   * For test compatibility - add a topic with test properties
   */
  addTestTopic(mapId: string, topic: TestTopic): string {
    return this.addTopic(mapId, {
      name: topic.name,
      description: topic.description,
      relevanceScore: topic.importance,
      timeSpent: topic.duration,
      parentTopicId: topic.parentTopicId === null ? undefined : topic.parentTopicId,
      participantIds: [], // Required property
      keywords: [] // Required property
    });
  }

  /**
   * Add a relationship between topics
   */
  addTopicRelationship(mapId: string, relationship: {
    sourceTopicId: string;
    targetTopicId: string;
    relationshipType: string;
    strength: number;
    description?: string;
  }): string {
    const topicMap = this.topicMaps.get(mapId);
    
    if (!topicMap) {
      this.logger.warn(`Topic map ${mapId} not found`);
      throw new Error(`Topic map ${mapId} not found`);
    }
    
    // Verify both topics exist
    if (!topicMap.topics.has(relationship.sourceTopicId)) {
      this.logger.warn(`Source topic ${relationship.sourceTopicId} not found`);
      throw new Error(`Source topic ${relationship.sourceTopicId} not found`);
    }
    
    if (!topicMap.topics.has(relationship.targetTopicId)) {
      this.logger.warn(`Target topic ${relationship.targetTopicId} not found`);
      throw new Error(`Target topic ${relationship.targetTopicId} not found`);
    }
    
    const relationshipId = `rel-${uuidv4()}`;
    
    // Create relationship record
    const newRelationship: TopicRelationship = {
      id: relationshipId,
      sourceTopicId: relationship.sourceTopicId,
      targetTopicId: relationship.targetTopicId,
      relationshipType: relationship.relationshipType,
      strength: relationship.strength,
      description: relationship.description
    };
    
    topicMap.relationships.set(relationshipId, newRelationship);
    
    // Create visualization connection
    const connection: VisualizationConnection = {
      id: `connection-${relationshipId}`,
      type: this.getConnectionTypeForRelationship(relationship.relationshipType),
      sourceId: `element-${relationship.sourceTopicId}`,
      targetId: `element-${relationship.targetTopicId}`,
      label: relationship.description || relationship.relationshipType,
      properties: {
        type: relationship.relationshipType,
        strength: relationship.strength
      },
      strength: relationship.strength,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        relationshipId
      }
    };
    
    topicMap.connections.set(connection.id, connection);
    
    // Update map metadata
    topicMap.version += 1;
    topicMap.timestamp = new Date();
    
    this.logger.info(`Added relationship ${relationshipId} to map ${mapId}`);
    return relationshipId;
  }

  /**
   * For test compatibility - alias for addTopicRelationship
   */
  createTopicRelationship(mapId: string, sourceTopicId: string, targetTopicId: string, relationshipType: string, strength: number): string {
    return this.addTopicRelationship(mapId, {
      sourceTopicId,
      targetTopicId,
      relationshipType,
      strength
    });
  }

  /**
   * Get the full visualization graph for the topic map
   */
  visualizeTopicMap(mapId: string): VisualizationGraph {
    const topicMap = this.topicMaps.get(mapId);
    
    if (!topicMap) {
      this.logger.warn(`Topic map ${mapId} not found`);
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
    
    return {
      id: mapId,
      name: `Topic Map for Meeting ${topicMap.meetingId}`,
      description: `Visualization of topic relationships for meeting ${topicMap.meetingId}`,
      elements: Array.from(topicMap.elements.values()),
      connections: Array.from(topicMap.connections.values()),
      layout: 'hierarchical',
      timestamp: topicMap.timestamp,
      version: topicMap.version,
      metadata: {
        meetingId: topicMap.meetingId,
        topicCount: topicMap.topics.size,
        relationshipCount: topicMap.relationships.size
      }
    };
  }

  /**
   * For test compatibility - alias for visualizeTopicMap
   */
  visualizeTopicGraph(mapId: string): VisualizationGraph {
    return this.visualizeTopicMap(mapId);
  }

  /**
   * Analyze the topic structure
   */
  analyzeTopicStructure(mapId: string): {
    centralTopics: string[];
    topicClusters: Array<{ topics: string[]; theme: string }>;
    topicDepths: Record<string, number>;
    topicDiversity: number;
  } {
    const topicMap = this.topicMaps.get(mapId);
    
    if (!topicMap) {
      this.logger.warn(`Topic map ${mapId} not found`);
      throw new Error(`Topic map ${mapId} not found`);
    }
    
    const topics = Array.from(topicMap.topics.values());
    const relationships = Array.from(topicMap.relationships.values());
    
    if (topics.length === 0) {
      return {
        centralTopics: [],
        topicClusters: [],
        topicDepths: {},
        topicDiversity: 0
      };
    }
    
    // Calculate topic centrality (how many relationships each topic has)
    const topicConnections: Record<string, number> = {};
    
    for (const topic of topics) {
      topicConnections[topic.id] = 0;
    }
    
    for (const relationship of relationships) {
      topicConnections[relationship.sourceTopicId] = 
        (topicConnections[relationship.sourceTopicId] || 0) + 1;
      
      topicConnections[relationship.targetTopicId] = 
        (topicConnections[relationship.targetTopicId] || 0) + 1;
    }
    
    // Identify central topics (top 20% by connection count)
    const topicsByConnectionCount = Object.entries(topicConnections)
      .sort(([, countA], [, countB]) => countB - countA);
    
    const centralTopicCount = Math.max(1, Math.ceil(topics.length * 0.2));
    const centralTopics = topicsByConnectionCount
      .slice(0, centralTopicCount)
      .map(([topicId]) => topicId);
    
    // Calculate topic depths in hierarchy
    const topicDepths: Record<string, number> = {};
    
    // Find root topics (no parent)
    const rootTopics = topics.filter(topic => !topic.parentTopicId);
    
    // Calculate depth for each topic recursively
    for (const rootTopic of rootTopics) {
      this.calculateTopicDepth(rootTopic, topicMap.topics, topicDepths, 0);
    }
    
    // Identify topic clusters using a simple approach
    // Group topics that are closely connected
    const topicClusters: Array<{ topics: string[]; theme: string }> = [];
    const processedTopics = new Set<string>();
    
    // Start with the most central topics as cluster seeds
    for (const centralTopicId of centralTopics) {
      if (processedTopics.has(centralTopicId)) {
        continue;
      }
      
      const cluster = this.identifyTopicCluster(centralTopicId, relationships, processedTopics);
      
      if (cluster.length > 0) {
        // Determine cluster theme from the most relevant topic
        let themeTopicId = cluster[0];
        let maxRelevance = 0;
        
        for (const topicId of cluster) {
          const topic = topicMap.topics.get(topicId);
          if (topic && (topic.relevanceScore || 0) > maxRelevance) {
            maxRelevance = topic.relevanceScore || 0;
            themeTopicId = topicId;
          }
        }
        
        const themeTopic = topicMap.topics.get(themeTopicId);
        const theme = themeTopic ? themeTopic.name : 'Unknown Cluster';
        
        topicClusters.push({
          topics: cluster,
          theme
        });
      }
    }
    
    // Handle any remaining topics
    const remainingTopics = topics
      .map(topic => topic.id)
      .filter(topicId => !processedTopics.has(topicId));
    
    if (remainingTopics.length > 0) {
      topicClusters.push({
        topics: remainingTopics,
        theme: 'Miscellaneous Topics'
      });
    }
    
    // Calculate topic diversity as a ratio of unique relationships to topics
    const uniqueRelationshipTypes = new Set<string>();
    
    for (const relationship of relationships) {
      uniqueRelationshipTypes.add(relationship.relationshipType);
    }
    
    const topicDiversity = Math.min(1, uniqueRelationshipTypes.size / Math.max(1, topics.length));
    
    return {
      centralTopics,
      topicClusters,
      topicDepths,
      topicDiversity
    };
  }

  /**
   * Helper: Create a hierarchical relationship between topics
   */
  private createHierarchyRelationship(mapId: string, parentId: string, childId: string): void {
    // Create a standard hierarchical relationship
    this.addTopicRelationship(mapId, {
      sourceTopicId: parentId,
      targetTopicId: childId,
      relationshipType: 'hierarchy',
      strength: 1.0, // Hierarchical relationships are strong
      description: 'Parent-child relationship'
    });
  }

  /**
   * Helper: Calculate topic depth in the hierarchy
   */
  private calculateTopicDepth(
    topic: TopicNode,
    topicsMap: Map<string, TopicNode>,
    depthMap: Record<string, number>,
    depth: number
  ): void {
    depthMap[topic.id] = depth;
    
    if (topic.childTopicIds) {
      for (const childId of topic.childTopicIds) {
        const childTopic = topicsMap.get(childId);
        if (childTopic) {
          this.calculateTopicDepth(childTopic, topicsMap, depthMap, depth + 1);
        }
      }
    }
  }

  /**
   * Helper: Identify a cluster of related topics
   */
  private identifyTopicCluster(
    seedTopicId: string,
    relationships: TopicRelationship[],
    processedTopics: Set<string>
  ): string[] {
    const cluster: string[] = [seedTopicId];
    processedTopics.add(seedTopicId);
    
    // Find directly connected topics
    const directlyConnected = relationships
      .filter(rel => 
        rel.sourceTopicId === seedTopicId || 
        rel.targetTopicId === seedTopicId)
      .map(rel => 
        rel.sourceTopicId === seedTopicId ? 
        rel.targetTopicId : rel.sourceTopicId)
      .filter(topicId => !processedTopics.has(topicId));
    
    // Add these to the cluster
    for (const topicId of directlyConnected) {
      cluster.push(topicId);
      processedTopics.add(topicId);
    }
    
    return cluster;
  }

  /**
   * Helper: Get connection type for relationship type
   */
  private getConnectionTypeForRelationship(relationshipType: string): VisualizationConnectionType {
    const typeMap: Record<string, VisualizationConnectionType> = {
      'hierarchy': VisualizationConnectionType.DEPENDENCY,
      'related': VisualizationConnectionType.RELATION,
      'opposes': VisualizationConnectionType.DEPENDENCY,
      'supports': VisualizationConnectionType.DEPENDENCY,
      'similar': VisualizationConnectionType.RELATION,
      'precedes': VisualizationConnectionType.DEPENDENCY,
      'follows': VisualizationConnectionType.DEPENDENCY,
      'references': VisualizationConnectionType.REFERENCE
    };
    
    return typeMap[relationshipType] || VisualizationConnectionType.RELATION;
  }

  /**
   * Helper: Get color for sentiment score
   */
  private getColorForSentiment(sentiment: number): string {
    if (sentiment > 0.3) {
      // Positive sentiment (green)
      return `#${Math.floor(100 + sentiment * 155).toString(16)}${Math.floor(200 + sentiment * 55).toString(16)}${Math.floor(100).toString(16)}`;
    } else if (sentiment < -0.3) {
      // Negative sentiment (red)
      return `#${Math.floor(200 + Math.abs(sentiment) * 55).toString(16)}${Math.floor(100).toString(16)}${Math.floor(100).toString(16)}`;
    } else {
      // Neutral sentiment (blue-gray)
      return '#607D8B';
    }
  }
} 