/**
 * Topic Extraction Service Implementation
 * Part of Milestone 3.1: Enhanced Topic Extraction
 */
import { v4 as uuidv4 } from 'uuid';
import {
  Topic,
  TopicSegment,
  TopicGraph,
  TopicRelationship,
  TopicExtractionResult,
  TopicExtractionConfig,
  TopicExtractionService,
  ContextWeightingConfig,
  OrganizationalContext,
  TopicTimelineEntry
} from '../interfaces/topic-extraction.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * Default configuration for topic extraction
 */
const DEFAULT_TOPIC_EXTRACTION_CONFIG: TopicExtractionConfig = {
  minConfidenceThreshold: 0.6,
  maxTopicsPerMeeting: 20,
  minMentionsRequired: 2,
  enableHierarchicalExtraction: true,
  enableOrganizationalContext: true,
  contextWeighting: {
    recencyWeight: 0.3,
    frequencyWeight: 0.3,
    speakerRoleWeight: 0.2,
    organizationalContextWeight: 0.1,
    previousMeetingsWeight: 0.1
  },
  enableCrossMeetingTopics: true,
  languageModel: 'default'
};

/**
 * Implementation of the topic extraction service
 */
export class TopicExtractionServiceImpl implements TopicExtractionService {
  private topics: Map<string, Topic> = new Map();
  private meetingTopics: Map<string, Set<string>> = new Map();
  private meetingResults: Map<string, TopicExtractionResult> = new Map();
  private logger: Logger;
  
  /**
   * Create a new topic extraction service
   */
  constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
    this.logger.info('Topic extraction service initialized');
  }
  
  /**
   * Extract topics from meeting transcript
   */
  async extractTopics(
    meetingId: string, 
    config?: Partial<TopicExtractionConfig>
  ): Promise<TopicExtractionResult> {
    // Merge with default config
    const fullConfig: TopicExtractionConfig = {
      ...DEFAULT_TOPIC_EXTRACTION_CONFIG,
      ...config
    };
    
    this.logger.info(`Extracting topics for meeting: ${meetingId}`, {
      config: fullConfig
    });
    
    try {
      // In a real implementation, we would:
      // 1. Fetch the meeting transcript
      // 2. Process it using NLP techniques or LLM
      // 3. Extract topics with contextual weighting
      
      // This is a simplified implementation that would be replaced with actual NLP processing
      const extractedTopics = await this.performTopicExtraction(meetingId, fullConfig);
      
      // Apply relevance scoring with context weighting
      const scoredTopics = this.applyContextWeighting(
        extractedTopics, 
        fullConfig.contextWeighting
      );
      
      // Build topic relationships
      const topicGraph = this.buildTopicGraph(scoredTopics, fullConfig);
      
      // Calculate dominant topics
      const dominantTopics = this.calculateDominantTopics(
        scoredTopics,
        fullConfig.maxTopicsPerMeeting
      );
      
      // Generate timeline
      const topicTimeline = this.generateTopicTimeline(scoredTopics);
      
      // Create result
      const result: TopicExtractionResult = {
        meetingId,
        topics: scoredTopics,
        topicGraph,
        dominantTopics,
        topicTimeline,
        metricsSummary: {
          topicCount: scoredTopics.length,
          averageConfidence: this.calculateAverageConfidence(scoredTopics),
          totalSegments: this.calculateTotalSegments(scoredTopics),
          organizationalRelevance: this.calculateOrganizationalRelevance(scoredTopics)
        }
      };
      
      // Store the result
      this.meetingResults.set(meetingId, result);
      
      // Store topics in our maps
      for (const topic of scoredTopics) {
        this.topics.set(topic.id, topic);
        
        if (!this.meetingTopics.has(meetingId)) {
          this.meetingTopics.set(meetingId, new Set());
        }
        
        this.meetingTopics.get(meetingId)?.add(topic.id);
      }
      
      this.logger.info(`Extracted ${scoredTopics.length} topics for meeting: ${meetingId}`, {
        dominantTopicsCount: dominantTopics.length,
        averageConfidence: result.metricsSummary.averageConfidence
      });
      
      return result;
    } catch (error) {
      this.logger.error(`Error extracting topics for meeting: ${meetingId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Get topic by ID
   */
  async getTopicById(topicId: string): Promise<Topic | null> {
    return this.topics.get(topicId) || null;
  }
  
  /**
   * Get topics for a meeting
   */
  async getTopicsForMeeting(meetingId: string): Promise<Topic[]> {
    const topicIds = this.meetingTopics.get(meetingId);
    
    if (!topicIds) {
      return [];
    }
    
    const topics: Topic[] = [];
    
    for (const topicId of topicIds) {
      const topic = this.topics.get(topicId);
      if (topic) {
        topics.push(topic);
      }
    }
    
    return topics;
  }
  
  /**
   * Update topic metadata
   */
  async updateTopicMetadata(
    topicId: string, 
    metadata: Record<string, any>
  ): Promise<Topic> {
    const topic = this.topics.get(topicId);
    
    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
    }
    
    // Update metadata
    topic.metadata = {
      ...topic.metadata,
      ...metadata
    };
    
    // Store updated topic
    this.topics.set(topicId, topic);
    
    return topic;
  }
  
  /**
   * Get topic graph for a meeting
   */
  async getTopicGraph(meetingId: string): Promise<TopicGraph> {
    const result = this.meetingResults.get(meetingId);
    
    if (!result) {
      return { topics: [], relationships: [] };
    }
    
    return result.topicGraph;
  }
  
  /**
   * Find related topics across meetings
   */
  async findRelatedTopics(
    topicId: string, 
    maxResults: number = 10
  ): Promise<Topic[]> {
    const topic = this.topics.get(topicId);
    
    if (!topic) {
      return [];
    }
    
    // Get all topics
    const allTopics = Array.from(this.topics.values());
    
    // Calculate similarity scores
    const topicsWithScores = allTopics
      .filter(t => t.id !== topicId) // Exclude the original topic
      .map(t => ({
        topic: t,
        score: this.calculateTopicSimilarity(topic, t)
      }))
      .sort((a, b) => b.score - a.score) // Sort by similarity score (descending)
      .slice(0, maxResults); // Take top results
    
    return topicsWithScores.map(item => item.topic);
  }
  
  /**
   * Perform topic extraction (simplified implementation)
   * In a real system, this would use NLP and LLMs
   */
  private async performTopicExtraction(
    meetingId: string,
    config: TopicExtractionConfig
  ): Promise<Topic[]> {
    // In a real implementation, we would process the actual transcript
    // For this simplified version, we'll create sample topics
    
    const mockTranscript = await this.getMockTranscript(meetingId);
    
    // Extract topics using NLP techniques (simplified)
    const extractedTopics: Topic[] = [];
    
    // Create sample topics for demonstration
    const sampleTopics = [
      {
        name: 'Q4 Revenue Projections',
        description: 'Discussion about revenue projections for Q4',
        keywords: ['revenue', 'projection', 'Q4', 'forecast', 'sales'],
        relevanceScore: 0.95,
        confidence: 0.92,
        mentionCount: 12
      },
      {
        name: 'Product Launch Timeline',
        description: 'Timeline for the new product launch',
        keywords: ['product', 'launch', 'timeline', 'release', 'schedule'],
        relevanceScore: 0.87,
        confidence: 0.89,
        mentionCount: 8
      },
      {
        name: 'Marketing Budget Allocation',
        description: 'Discussion about allocating the marketing budget',
        keywords: ['marketing', 'budget', 'allocation', 'spend', 'campaign'],
        relevanceScore: 0.82,
        confidence: 0.85,
        mentionCount: 6
      },
      {
        name: 'Team Expansion',
        description: 'Plans for expanding the team in engineering',
        keywords: ['team', 'hiring', 'expansion', 'engineering', 'recruitment'],
        relevanceScore: 0.78,
        confidence: 0.83,
        mentionCount: 5
      },
      {
        name: 'Customer Feedback Analysis',
        description: 'Analysis of recent customer feedback',
        keywords: ['customer', 'feedback', 'analysis', 'satisfaction', 'survey'],
        relevanceScore: 0.75,
        confidence: 0.81,
        mentionCount: 4
      }
    ];
    
    // Create topics with proper structure
    for (const sampleTopic of sampleTopics) {
      const topic: Topic = {
        id: uuidv4(),
        name: sampleTopic.name,
        description: sampleTopic.description,
        keywords: sampleTopic.keywords,
        relevanceScore: sampleTopic.relevanceScore,
        confidence: sampleTopic.confidence,
        mentionCount: sampleTopic.mentionCount,
        firstMentionTime: this.getRandomTimestamp(0, 10),
        lastMentionTime: this.getRandomTimestamp(20, 30),
        speakerIds: this.getRandomSpeakers(),
        segments: this.generateMockSegments(sampleTopic.keywords, sampleTopic.mentionCount),
        childTopicIds: [],
        relatedTopicIds: new Map(),
        metadata: {}
      };
      
      // Add organizational context if enabled
      if (config.enableOrganizationalContext) {
        topic.organizationalContext = this.generateMockOrganizationalContext();
      }
      
      extractedTopics.push(topic);
    }
    
    // If hierarchical extraction is enabled, create hierarchies
    if (config.enableHierarchicalExtraction) {
      this.createMockHierarchies(extractedTopics);
    }
    
    return extractedTopics;
  }
  
  /**
   * Apply context weighting to topics
   */
  private applyContextWeighting(
    topics: Topic[],
    weightingConfig: ContextWeightingConfig
  ): Topic[] {
    return topics.map(topic => {
      // Calculate a weighted relevance score based on context factors
      let weightedScore = 0;
      
      // Recency factor (more recent mentions get higher score)
      const recencyScore = topic.lastMentionTime ? 
        this.normalizeTimestamp(topic.lastMentionTime) : 0.5;
      
      // Frequency factor (more mentions get higher score)
      const frequencyScore = this.normalizeCount(topic.mentionCount);
      
      // Speaker role importance (simplified)
      const speakerRoleScore = 0.7; // In a real system, we'd calculate this
      
      // Organizational context relevance
      const orgContextScore = topic.organizationalContext?.businessValueScore || 0.5;
      
      // Previous meetings relevance (simplified)
      const previousMeetingsScore = 0.5; // In a real system, we'd calculate this
      
      // Calculate weighted score
      weightedScore = (
        recencyScore * weightingConfig.recencyWeight +
        frequencyScore * weightingConfig.frequencyWeight +
        speakerRoleScore * weightingConfig.speakerRoleWeight +
        orgContextScore * weightingConfig.organizationalContextWeight +
        previousMeetingsScore * weightingConfig.previousMeetingsWeight
      );
      
      // Ensure score is between 0 and 1
      weightedScore = Math.min(1, Math.max(0, weightedScore));
      
      // Update the topic with the weighted score
      return {
        ...topic,
        relevanceScore: weightedScore
      };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore); // Sort by relevance
  }
  
  /**
   * Build topic graph
   */
  private buildTopicGraph(topics: Topic[], config: TopicExtractionConfig): TopicGraph {
    const relationships: TopicRelationship[] = [];
    
    // Create hierarchical relationships
    if (config.enableHierarchicalExtraction) {
      for (const topic of topics) {
        if (topic.parentTopicId) {
          relationships.push({
            sourceTopicId: topic.parentTopicId,
            targetTopicId: topic.id,
            relationshipType: 'hierarchy',
            strength: 1.0,
            description: 'Parent-child relationship'
          });
        }
      }
    }
    
    // Create related topic relationships
    for (const topic of topics) {
      if (topic.relatedTopicIds.size > 0) {
        for (const [relatedId, strength] of topic.relatedTopicIds.entries()) {
          // Avoid duplicate relationships
          const existingRelationship = relationships.find(
            r => (r.sourceTopicId === topic.id && r.targetTopicId === relatedId) ||
                 (r.sourceTopicId === relatedId && r.targetTopicId === topic.id)
          );
          
          if (!existingRelationship) {
            relationships.push({
              sourceTopicId: topic.id,
              targetTopicId: relatedId,
              relationshipType: 'related',
              strength,
              description: 'Related topics'
            });
          }
        }
      }
    }
    
    // Create sequence relationships (simplified)
    topics.sort((a, b) => (a.firstMentionTime || 0) - (b.firstMentionTime || 0));
    for (let i = 0; i < topics.length - 1; i++) {
      const current = topics[i];
      const next    = topics[i + 1];
    
      // Make sure both exist and have defined timestamps
      if (
        current.lastMentionTime != null &&
        next != null &&
        next.firstMentionTime != null &&
        current.lastMentionTime < next.firstMentionTime
      ) {
        relationships.push({
          sourceTopicId: topics[i].id,
          targetTopicId: topics[i+1].id,
          relationshipType: 'sequence',
          strength: 0.7,
          description: 'Sequential topics'
        });
      }
    }
    
    return {
      topics,
      relationships
    };
  }
  
  /**
   * Calculate dominant topics
   */
  private calculateDominantTopics(topics: Topic[], maxTopics: number): Topic[] {
    return topics
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxTopics);
  }
  
  /**
   * Generate topic timeline
   */
  private generateTopicTimeline(topics: Topic[]): TopicTimelineEntry[] {
    // Get all timestamps where topics are mentioned
    const allTimestamps = new Set<number>();
    
    for (const topic of topics) {
      for (const segment of topic.segments) {
        allTimestamps.add(segment.startTime);
        allTimestamps.add(segment.endTime);
      }
    }
    
    // Sort timestamps
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    
    // Create timeline entries
    const timeline: TopicTimelineEntry[] = [];
    
    for (const timestamp of sortedTimestamps) {
      // Find active topics at this timestamp
      const activeTopicIds: string[] = [];
      let maxRelevance = 0;
      let dominantTopicId: string | undefined;
      
      for (const topic of topics) {
        // Check if topic is active at this timestamp
        const isActive = topic.segments.some(
          segment => segment.startTime <= timestamp && segment.endTime >= timestamp
        );
        
        if (isActive) {
          activeTopicIds.push(topic.id);
          
          // Check if this is the most relevant topic
          if (topic.relevanceScore > maxRelevance) {
            maxRelevance = topic.relevanceScore;
            dominantTopicId = topic.id;
          }
        }
      }
      
      timeline.push({
        timestamp,
        activeTopicIds,
        dominantTopicId
      });
    }
    
    return timeline;
  }
  
  /**
   * Calculate average confidence
   */
  private calculateAverageConfidence(topics: Topic[]): number {
    if (topics.length === 0) {
      return 0;
    }
    
    const sum = topics.reduce((acc, topic) => acc + topic.confidence, 0);
    return sum / topics.length;
  }
  
  /**
   * Calculate total segments
   */
  private calculateTotalSegments(topics: Topic[]): number {
    return topics.reduce((acc, topic) => acc + topic.segments.length, 0);
  }
  
  /**
   * Calculate organizational relevance
   */
  private calculateOrganizationalRelevance(topics: Topic[]): number {
    if (topics.length === 0) {
      return 0;
    }
    
    let sum = 0;
    let count = 0;
    
    for (const topic of topics) {
      if (topic.organizationalContext?.businessValueScore !== undefined) {
        sum += topic.organizationalContext.businessValueScore;
        count++;
      }
    }
    
    return count > 0 ? sum / count : 0;
  }
  
  /**
   * Calculate similarity between topics
   */
  private calculateTopicSimilarity(topic1: Topic, topic2: Topic): number {
    // In a real implementation, this would use semantic similarity
    // For this simplified version, we'll use keyword overlap
    
    const keywords1 = new Set(topic1.keywords);
    const keywords2 = new Set(topic2.keywords);
    
    let overlapCount = 0;
    for (const keyword of keywords1) {
      if (keywords2.has(keyword)) {
        overlapCount++;
      }
    }
    
    const similarity = overlapCount / 
      Math.sqrt(keywords1.size * keywords2.size);
    
    return similarity;
  }
  
  /**
   * Normalize timestamp to a 0-1 score
   */
  private normalizeTimestamp(timestamp: number): number {
    // In a real implementation, this would be based on meeting duration
    // For this simplified version, we'll assume timestamps range from 0-60
    return Math.min(1, Math.max(0, timestamp / 60));
  }
  
  /**
   * Normalize count to a 0-1 score
   */
  private normalizeCount(count: number): number {
    // Assume max count is 20
    return Math.min(1, Math.max(0, count / 20));
  }
  
  /**
   * Get mock transcript (simplified)
   */
  private async getMockTranscript(meetingId: string): Promise<string> {
    // In a real implementation, this would fetch the actual transcript
    return `This is a mock transcript for meeting ${meetingId}`;
  }
  
  /**
   * Generate mock segments
   */
  private generateMockSegments(keywords: string[], count: number): TopicSegment[] {
    const segments: TopicSegment[] = [];
    
    for (let i = 0; i < count; i++) {
      const startTime = this.getRandomTimestamp(0, 50);
      const endTime = startTime + this.getRandomTimestamp(1, 5);
      
      segments.push({
        id: uuidv4(),
        startTime,
        endTime,
        transcript: `Discussion about ${keywords.join(', ')}`,
        speakerId: `speaker-${Math.floor(Math.random() * 5) + 1}`,
        relevanceScore: 0.6 + Math.random() * 0.4,
        keyPhrases: keywords.slice(0, 2),
        sentiment: Math.random() * 2 - 1 // -1 to 1
      });
    }
    
    return segments;
  }
  
  /**
   * Generate mock organizational context
   */
  private generateMockOrganizationalContext(): OrganizationalContext {
    return {
      departmentRelevance: new Map([
        ['engineering', 0.2 + Math.random() * 0.8],
        ['marketing', 0.2 + Math.random() * 0.8],
        ['sales', 0.2 + Math.random() * 0.8]
      ]),
      projectRelevance: new Map([
        ['project-a', 0.2 + Math.random() * 0.8],
        ['project-b', 0.2 + Math.random() * 0.8]
      ]),
      teamRelevance: new Map([
        ['team-1', 0.2 + Math.random() * 0.8],
        ['team-2', 0.2 + Math.random() * 0.8]
      ]),
      businessValueScore: 0.4 + Math.random() * 0.6,
      strategicAlignmentScore: 0.4 + Math.random() * 0.6,
      knowledgeBaseReferences: [`kb-${Math.floor(Math.random() * 100)}`]
    };
  }
  
  /**
   * Get random timestamp
   */
  private getRandomTimestamp(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
  
  /**
   * Get random speakers
   */
  private getRandomSpeakers(): string[] {
    const speakerCount = Math.floor(Math.random() * 3) + 1;
    const speakers: string[] = [];
    
    for (let i = 0; i < speakerCount; i++) {
      speakers.push(`speaker-${Math.floor(Math.random() * 5) + 1}`);
    }
    
    return [...new Set(speakers)]; // Remove duplicates
  }
  
  /**
   * Create mock hierarchies between topics
   */
  private createMockHierarchies(topics: Topic[]): void {
    if (topics.length < 2) {
      return;
    }
    
    // Make the first topic the parent of a few others
    const parentTopic = topics[0];
    
    for (let i = 1; i < Math.min(4, topics.length); i++) {
      const childTopic = topics[i];
      childTopic.parentTopicId = parentTopic.id;
      parentTopic.childTopicIds.push(childTopic.id);
    }
    
    // Create related topics
    for (const topic of topics) {
      const relatedCount = Math.floor(Math.random() * 3);
      
      for (let i = 0; i < relatedCount; i++) {
        // Find a random topic to relate to
        const otherTopics = topics.filter(t => 
          t.id !== topic.id && 
          t.parentTopicId !== topic.id &&
          topic.parentTopicId !== t.id
        );
        
        if (otherTopics.length > 0) {
          const relatedTopic = otherTopics[Math.floor(Math.random() * otherTopics.length)];
          const strength = 0.5 + Math.random() * 0.5;
          
          // Add to related topics if not already there
          if (!topic.relatedTopicIds.has(relatedTopic.id)) {
            topic.relatedTopicIds.set(relatedTopic.id, strength);
            relatedTopic.relatedTopicIds.set(topic.id, strength);
          }
        }
      }
    }
  }
} 