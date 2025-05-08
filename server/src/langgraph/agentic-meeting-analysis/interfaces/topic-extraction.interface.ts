/**
 * Topic Extraction Interfaces
 * Part of Milestone 3.1: Enhanced Topic Extraction
 */

/**
 * Represents a topic extracted from meeting content
 */
export interface Topic {
  id: string;
  name: string;
  description?: string;
  keywords: string[];
  relevanceScore: number; // 0-1 score indicating relevance
  confidence: number; // 0-1 score indicating extraction confidence
  mentionCount: number; // Number of times topic was mentioned
  firstMentionTime?: number; // Timestamp of first mention
  lastMentionTime?: number; // Timestamp of last mention
  speakerIds: string[]; // IDs of speakers who mentioned this topic
  segments: TopicSegment[]; // Segments where this topic appears
  parentTopicId?: string; // For hierarchical relationship
  childTopicIds: string[]; // For hierarchical relationship
  relatedTopicIds: Map<string, number>; // Topic ID to relationship strength (0-1)
  organizationalContext?: OrganizationalContext; // Organizational relevance
  metadata: Record<string, any>; // Additional metadata
}

/**
 * Represents a segment of text where a topic appears
 */
export interface TopicSegment {
  id: string;
  startTime: number;
  endTime: number;
  transcript: string;
  speakerId: string;
  relevanceScore: number; // 0-1 score indicating relevance to the topic
  keyPhrases: string[]; // Key phrases in this segment related to the topic
  sentiment?: number; // -1 to 1 sentiment score
}

/**
 * Organizational context for a topic
 */
export interface OrganizationalContext {
  departmentRelevance: Map<string, number>; // Department ID to relevance score (0-1)
  projectRelevance: Map<string, number>; // Project ID to relevance score (0-1)
  teamRelevance: Map<string, number>; // Team ID to relevance score (0-1)
  businessValueScore?: number; // 0-1 score indicating business value
  strategicAlignmentScore?: number; // 0-1 score indicating strategic alignment
  knowledgeBaseReferences?: string[]; // References to knowledge base entries
}

/**
 * Represents a graph of related topics
 */
export interface TopicGraph {
  topics: Topic[];
  relationships: TopicRelationship[];
}

/**
 * Represents a relationship between topics
 */
export interface TopicRelationship {
  sourceTopicId: string;
  targetTopicId: string;
  relationshipType: 'hierarchy' | 'related' | 'sequence' | 'causal';
  strength: number; // 0-1 score indicating relationship strength
  description?: string;
}

/**
 * Context weighting configuration for topic extraction
 */
export interface ContextWeightingConfig {
  recencyWeight: number; // Weight for recency of mentions
  frequencyWeight: number; // Weight for frequency of mentions
  speakerRoleWeight: number; // Weight for speaker role importance
  organizationalContextWeight: number; // Weight for organizational relevance
  previousMeetingsWeight: number; // Weight for mentions in previous meetings
}

/**
 * Results from topic extraction
 */
export interface TopicExtractionResult {
  meetingId: string;
  topics: Topic[];
  topicGraph: TopicGraph;
  dominantTopics: Topic[]; // Top topics by relevance
  topicTimeline: TopicTimelineEntry[]; // Timeline of topic occurrences
  metricsSummary: {
    topicCount: number;
    averageConfidence: number;
    totalSegments: number;
    organizationalRelevance: number; // 0-1 score
  };
}

/**
 * Entry in the topic timeline
 */
export interface TopicTimelineEntry {
  timestamp: number;
  activeTopicIds: string[];
  dominantTopicId?: string;
}

/**
 * Configuration for topic extraction
 */
export interface TopicExtractionConfig {
  minConfidenceThreshold: number; // Minimum confidence for topic inclusion
  maxTopicsPerMeeting: number; // Maximum number of topics to extract
  minMentionsRequired: number; // Minimum mentions required for a topic
  enableHierarchicalExtraction: boolean; // Whether to extract hierarchical topics
  enableOrganizationalContext: boolean; // Whether to consider organizational context
  contextWeighting: ContextWeightingConfig; // Weights for context factors
  enableCrossMeetingTopics: boolean; // Whether to consider topics from previous meetings
  languageModel: string; // Language model to use for extraction
}

/**
 * Interface for topic extraction service
 */
export interface TopicExtractionService {
  /**
   * Extract topics from meeting transcript
   */
  extractTopics(meetingId: string, config?: Partial<TopicExtractionConfig>): Promise<TopicExtractionResult>;
  
  /**
   * Get topic by ID
   */
  getTopicById(topicId: string): Promise<Topic | null>;
  
  /**
   * Get topics for a meeting
   */
  getTopicsForMeeting(meetingId: string): Promise<Topic[]>;
  
  /**
   * Update topic metadata
   */
  updateTopicMetadata(topicId: string, metadata: Record<string, any>): Promise<Topic>;
  
  /**
   * Get topic graph for a meeting
   */
  getTopicGraph(meetingId: string): Promise<TopicGraph>;
  
  /**
   * Find related topics across meetings
   */
  findRelatedTopics(topicId: string, maxResults?: number): Promise<Topic[]>;
} 