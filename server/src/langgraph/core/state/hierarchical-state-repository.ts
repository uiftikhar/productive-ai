import { PersistentStateManager } from './persistent-state-manager';
import { Logger } from '../../../shared/logger/logger.interface';
import { deepMerge, deepClone } from '../utils/object-utils';

/**
 * Criteria for finding related meetings
 */
export interface RelationCriteria {
  /**
   * Related by participant (participant IDs)
   */
  participants?: string[];
  
  /**
   * Related by topic (topic names or IDs)
   */
  topics?: string[];
  
  /**
   * Related by tags
   */
  tags?: string[];
  
  /**
   * Time range for meetings
   */
  timeRange?: {
    start?: number;
    end?: number;
  };
  
  /**
   * Minimum similarity score (0-1)
   */
  minSimilarity?: number;
  
  /**
   * Maximum number of results
   */
  limit?: number;
}

/**
 * Meeting analysis result structure
 */
export interface MeetingAnalysisResult {
  /**
   * Meeting ID
   */
  meetingId: string;
  
  /**
   * Meeting title
   */
  title?: string;
  
  /**
   * Meeting date/time (timestamp)
   */
  timestamp: number;
  
  /**
   * Meeting duration in seconds
   */
  duration?: number;
  
  /**
   * Participants in the meeting
   */
  participants: {
    id: string;
    name: string;
    role?: string;
    speakingTime?: number;
    contributions?: number;
  }[];
  
  /**
   * Topics discussed in the meeting
   */
  topics?: {
    id: string;
    name: string;
    relevance: number;
    keywords?: string[];
  }[];
  
  /**
   * Action items from the meeting
   */
  actionItems?: {
    id: string;
    description: string;
    assignees?: string[];
    dueDate?: string;
    status?: string;
  }[];
  
  /**
   * Decisions made in the meeting
   */
  decisions?: {
    id: string;
    description: string;
    stakeholders?: string[];
  }[];
  
  /**
   * Meeting summary
   */
  summary?: {
    short: string;
    detailed?: string;
  };
  
  /**
   * Tags for the meeting
   */
  tags?: string[];
  
  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Topic frequency information
 */
export interface TopicFrequency {
  /**
   * Topic ID
   */
  id: string;
  
  /**
   * Topic name
   */
  name: string;
  
  /**
   * Number of meetings where the topic appeared
   */
  frequency: number;
  
  /**
   * Average relevance score (0-1)
   */
  averageRelevance: number;
  
  /**
   * Meeting IDs where the topic appeared
   */
  meetingIds: string[];
  
  /**
   * Common keywords associated with the topic
   */
  keywords?: string[];
}

/**
 * Participant history information
 */
export interface ParticipantHistory {
  /**
   * Participant ID
   */
  id: string;
  
  /**
   * Participant name
   */
  name: string;
  
  /**
   * Meetings the participant attended
   */
  meetings: {
    meetingId: string;
    title?: string;
    timestamp: number;
    speakingTime?: number;
    contributions?: number;
    role?: string;
  }[];
  
  /**
   * Topics the participant frequently discusses
   */
  frequentTopics?: {
    id: string;
    name: string;
    frequency: number;
    relevance: number;
  }[];
  
  /**
   * Action items assigned to the participant
   */
  actionItems?: {
    id: string;
    meetingId: string;
    description: string;
    dueDate?: string;
    status?: string;
  }[];
  
  /**
   * Collaboration network - participants they frequently interact with
   */
  collaborators?: {
    id: string;
    name: string;
    score: number;
  }[];
}

/**
 * Options for the hierarchical state repository
 */
export interface HierarchicalStateRepositoryOptions {
  /**
   * Persistent state manager for storing results
   */
  stateManager: PersistentStateManager;
  
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Enable building of search indices for faster queries
   */
  buildIndices?: boolean;
  
  /**
   * How frequently to rebuild indices (in milliseconds)
   */
  indexRebuildInterval?: number;
}

/**
 * Repository for cross-meeting knowledge
 * Implements patterns for storing, retrieving, and querying meeting analysis results
 * across multiple meetings.
 */
export class HierarchicalStateRepository {
  private stateManager: PersistentStateManager;
  private logger?: Logger;
  private options: HierarchicalStateRepositoryOptions;
  private initialized = false;
  
  // In-memory indices for faster querying
  private meetingIndex: Map<string, MeetingAnalysisResult> = new Map();
  private participantIndex: Map<string, Set<string>> = new Map(); // participantId -> meetingIds
  private topicIndex: Map<string, Set<string>> = new Map(); // topicName -> meetingIds
  private tagIndex: Map<string, Set<string>> = new Map(); // tag -> meetingIds
  private timeIndex: {meetingId: string; timestamp: number}[] = []; // sorted by timestamp
  private indexLastRebuild = 0;
  private indexRebuildPromise: Promise<void> | null = null;
  
  /**
   * Create a new hierarchical state repository
   */
  constructor(options: HierarchicalStateRepositoryOptions) {
    this.options = {
      buildIndices: true,
      indexRebuildInterval: 60 * 60 * 1000, // 1 hour
      ...options
    };
    
    this.stateManager = options.stateManager;
    this.logger = options.logger;
  }
  
  /**
   * Initialize the repository
   */
  async initialize(): Promise<void> {
    if (!this.initialized) {
      try {
        // Ensure state manager is initialized
        await this.stateManager.initialize();
        
        // Build indices if enabled
        if (this.options.buildIndices) {
          await this.rebuildIndices();
        }
        
        this.initialized = true;
        this.logger?.debug('HierarchicalStateRepository initialized');
      } catch (error) {
        this.logger?.error(`Failed to initialize HierarchicalStateRepository: ${(error as Error).message}`);
        throw new Error(`Failed to initialize repository: ${(error as Error).message}`);
      }
    }
  }
  
  /**
   * Store a meeting result in the repository
   * 
   * @param result - The meeting analysis result to store
   */
  async storeMeetingResult(result: MeetingAnalysisResult): Promise<void> {
    this.ensureInitialized();
    
    try {
      // Create a deep clone to avoid modifying the original
      const storedResult = deepClone(result);
      
      // Save to state manager
      await this.stateManager.saveState(
        this.getMeetingStateKey(result.meetingId),
        storedResult,
        { description: 'Store meeting analysis result' }
      );
      
      // Update indices if enabled
      if (this.options.buildIndices) {
        this.updateIndicesForMeeting(result);
      }
      
      this.logger?.debug(`Stored meeting result for ID: ${result.meetingId}`);
    } catch (error) {
      this.logger?.error(`Failed to store meeting result for ID ${result.meetingId}: ${(error as Error).message}`);
      throw new Error(`Failed to store meeting result: ${(error as Error).message}`);
    }
  }
  
  /**
   * Find meetings related to a specific meeting
   * 
   * @param meetingId - The meeting ID to find related meetings for
   * @param criteria - Criteria for determining relation
   * @returns Array of related meeting IDs, sorted by relevance
   */
  async findRelatedMeetings(
    meetingId: string, 
    criteria: RelationCriteria = {}
  ): Promise<string[]> {
    this.ensureInitialized();
    
    try {
      // Get the reference meeting
      const meetingResult = await this.getMeetingResult(meetingId);
      
      if (!meetingResult) {
        return [];
      }
      
      // Check if we need to rebuild indices
      await this.checkAndRebuildIndices();
      
      // Use indices if enabled
      if (this.options.buildIndices && this.meetingIndex.size > 0) {
        return this.findRelatedMeetingsFromIndices(meetingResult, criteria);
      }
      
      // Fall back to direct querying if indices are not available
      return this.findRelatedMeetingsDirectQuery(meetingResult, criteria);
    } catch (error) {
      this.logger?.error(`Failed to find related meetings for ID ${meetingId}: ${(error as Error).message}`);
      throw new Error(`Failed to find related meetings: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get common topics across specified meetings
   * 
   * @param meetingIds - Array of meeting IDs to analyze
   * @returns Array of topic frequencies, sorted by frequency
   */
  async getCommonTopics(meetingIds: string[]): Promise<TopicFrequency[]> {
    this.ensureInitialized();
    
    try {
      // Check if we need to rebuild indices
      await this.checkAndRebuildIndices();
      
      // Get the meetings
      const meetings: MeetingAnalysisResult[] = [];
      
      for (const meetingId of meetingIds) {
        const result = await this.getMeetingResult(meetingId);
        if (result && result.topics && result.topics.length > 0) {
          meetings.push(result);
        }
      }
      
      if (meetings.length === 0) {
        return [];
      }
      
      // Map to track topic frequencies
      const topicMap = new Map<string, {
        id: string;
        name: string;
        frequency: number;
        relevanceSum: number;
        meetingIds: Set<string>;
        keywords: Set<string>;
      }>();
      
      // Process each meeting
      for (const meeting of meetings) {
        if (!meeting.topics) continue;
        
        for (const topic of meeting.topics) {
          const normalizedName = this.normalizeTopicName(topic.name);
          const existing = topicMap.get(normalizedName);
          
          if (existing) {
            existing.frequency += 1;
            existing.relevanceSum += topic.relevance;
            existing.meetingIds.add(meeting.meetingId);
            
            if (topic.keywords) {
              for (const keyword of topic.keywords) {
                existing.keywords.add(keyword.toLowerCase());
              }
            }
          } else {
            topicMap.set(normalizedName, {
              id: topic.id,
              name: topic.name,
              frequency: 1,
              relevanceSum: topic.relevance,
              meetingIds: new Set([meeting.meetingId]),
              keywords: new Set(topic.keywords?.map(k => k.toLowerCase()) || [])
            });
          }
        }
      }
      
      // Convert to array and sort by frequency
      const result: TopicFrequency[] = Array.from(topicMap.values()).map(topic => ({
        id: topic.id,
        name: topic.name,
        frequency: topic.frequency,
        averageRelevance: topic.relevanceSum / topic.frequency,
        meetingIds: Array.from(topic.meetingIds),
        keywords: Array.from(topic.keywords)
      }));
      
      return result.sort((a, b) => {
        // Sort by frequency first, then by average relevance
        if (a.frequency !== b.frequency) {
          return b.frequency - a.frequency;
        }
        return b.averageRelevance - a.averageRelevance;
      });
    } catch (error) {
      this.logger?.error(`Failed to get common topics: ${(error as Error).message}`);
      throw new Error(`Failed to get common topics: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get participant history across all meetings
   * 
   * @param participantId - The participant ID to get history for
   * @returns Participant history information
   */
  async getParticipantHistory(participantId: string): Promise<ParticipantHistory | null> {
    this.ensureInitialized();
    
    try {
      // Check if we need to rebuild indices
      await this.checkAndRebuildIndices();
      
      // Use index to find meetings if available
      let meetingIds: string[];
      
      if (this.options.buildIndices && this.participantIndex.has(participantId)) {
        meetingIds = Array.from(this.participantIndex.get(participantId) || []);
      } else {
        // Fall back to scanning all meetings
        const allMeetingIds = await this.getAllMeetingIds();
        const participantMeetings: string[] = [];
        
        for (const meetingId of allMeetingIds) {
          const result = await this.getMeetingResult(meetingId);
          
          if (result && result.participants && 
              result.participants.some(p => p.id === participantId)) {
            participantMeetings.push(meetingId);
          }
        }
        
        meetingIds = participantMeetings;
      }
      
      if (meetingIds.length === 0) {
        return null;
      }
      
      // Collect meeting data
      const meetings: {
        meetingId: string;
        title?: string;
        timestamp: number;
        speakingTime?: number;
        contributions?: number;
        role?: string;
      }[] = [];
      
      const actionItems: {
        id: string;
        meetingId: string;
        description: string;
        dueDate?: string;
        status?: string;
      }[] = [];
      
      const topicMap = new Map<string, {
        id: string;
        name: string;
        frequency: number;
        relevanceSum: number;
      }>();
      
      const collaboratorMap = new Map<string, {
        id: string;
        name: string;
        interactionCount: number;
      }>();
      
      // Process each meeting
      for (const meetingId of meetingIds) {
        const result = await this.getMeetingResult(meetingId);
        if (!result) continue;
        
        // Find the participant in this meeting
        const participant = result.participants.find(p => p.id === participantId);
        if (!participant) continue;
        
        // Add to meetings list
        meetings.push({
          meetingId: result.meetingId,
          title: result.title,
          timestamp: result.timestamp,
          speakingTime: participant.speakingTime,
          contributions: participant.contributions,
          role: participant.role
        });
        
        // Process action items
        if (result.actionItems) {
          for (const item of result.actionItems) {
            if (item.assignees && item.assignees.includes(participantId)) {
              actionItems.push({
                id: item.id,
                meetingId: result.meetingId,
                description: item.description,
                dueDate: item.dueDate,
                status: item.status
              });
            }
          }
        }
        
        // Process topics
        if (result.topics) {
          for (const topic of result.topics) {
            const normalizedName = this.normalizeTopicName(topic.name);
            const existing = topicMap.get(normalizedName);
            
            if (existing) {
              existing.frequency += 1;
              existing.relevanceSum += topic.relevance;
            } else {
              topicMap.set(normalizedName, {
                id: topic.id,
                name: topic.name,
                frequency: 1,
                relevanceSum: topic.relevance
              });
            }
          }
        }
        
        // Process collaborators
        for (const otherParticipant of result.participants) {
          if (otherParticipant.id === participantId) continue;
          
          const existing = collaboratorMap.get(otherParticipant.id);
          
          if (existing) {
            existing.interactionCount += 1;
          } else {
            collaboratorMap.set(otherParticipant.id, {
              id: otherParticipant.id,
              name: otherParticipant.name,
              interactionCount: 1
            });
          }
        }
      }
      
      // Convert topics to array and sort
      const frequentTopics = Array.from(topicMap.values())
        .map(topic => ({
          id: topic.id,
          name: topic.name,
          frequency: topic.frequency,
          relevance: topic.relevanceSum / topic.frequency,
        }))
        .sort((a, b) => b.frequency - a.frequency);
      
      // Convert collaborators to array and sort
      const collaborators = Array.from(collaboratorMap.values())
        .map(collaborator => ({
          id: collaborator.id,
          name: collaborator.name,
          score: collaborator.interactionCount / meetingIds.length
        }))
        .sort((a, b) => b.score - a.score);
      
      // Get name from the first meeting where we have it
      let participantName = participantId;
      
      // Try to find participant name from any of the meetings
      if (meetings.length > 0) {
        for (const meetingId of meetingIds) {
          const result = await this.getMeetingResult(meetingId);
          if (result) {
            const participant = result.participants.find(p => p.id === participantId);
            if (participant && participant.name) {
              participantName = participant.name;
              break;
            }
          }
        }
      }
      
      // Sort meetings by timestamp (newest first)
      meetings.sort((a, b) => b.timestamp - a.timestamp);
      
      // Create the participant history
      const history: ParticipantHistory = {
        id: participantId,
        name: participantName,
        meetings,
        frequentTopics: frequentTopics.length > 0 ? frequentTopics : undefined,
        actionItems: actionItems.length > 0 ? actionItems : undefined,
        collaborators: collaborators.length > 0 ? collaborators : undefined
      };
      
      return history;
    } catch (error) {
      this.logger?.error(`Failed to get participant history for ID ${participantId}: ${(error as Error).message}`);
      throw new Error(`Failed to get participant history: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get a meeting result by ID
   * 
   * @param meetingId - The meeting ID to retrieve
   * @returns The meeting analysis result, or null if not found
   */
  private async getMeetingResult(meetingId: string): Promise<MeetingAnalysisResult | null> {
    try {
      // Check in-memory index first if enabled and available
      if (this.options.buildIndices && this.meetingIndex.has(meetingId)) {
        return this.meetingIndex.get(meetingId) || null;
      }
      
      // Otherwise retrieve from state manager
      const result = await this.stateManager.loadState<MeetingAnalysisResult>(
        this.getMeetingStateKey(meetingId)
      );
      
      return result;
    } catch (error) {
      this.logger?.error(`Failed to get meeting result for ID ${meetingId}: ${(error as Error).message}`);
      return null;
    }
  }
  
  /**
   * Get a list of all meeting IDs
   * 
   * @returns Array of all meeting IDs
   */
  private async getAllMeetingIds(): Promise<string[]> {
    try {
      const stateIds = await this.stateManager.listStates({
        keyPrefix: 'meeting:'
      });
      
      // Convert state IDs to meeting IDs
      return stateIds.map(id => id.replace('meeting:', ''));
    } catch (error) {
      this.logger?.error(`Failed to get all meeting IDs: ${(error as Error).message}`);
      return [];
    }
  }
  
  /**
   * Get state key for a meeting ID
   * 
   * @param meetingId - The meeting ID
   * @returns The state key
   */
  private getMeetingStateKey(meetingId: string): string {
    return `meeting:${meetingId}`;
  }
  
  /**
   * Normalize a topic name for consistent comparison
   * 
   * @param topicName - The topic name to normalize
   * @returns Normalized topic name
   */
  private normalizeTopicName(topicName: string): string {
    return topicName.toLowerCase().trim();
  }
  
  /**
   * Ensure the repository is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('HierarchicalStateRepository is not initialized. Call initialize() first.');
    }
  }
  
  /**
   * Check if indices need to be rebuilt and rebuild if necessary
   */
  private async checkAndRebuildIndices(): Promise<void> {
    if (!this.options.buildIndices) {
      return;
    }
    
    const now = Date.now();
    const timeSinceLastRebuild = now - this.indexLastRebuild;
    
    // Check if we need to rebuild indices
    if (this.meetingIndex.size === 0 || 
        timeSinceLastRebuild > (this.options.indexRebuildInterval || 3600000)) {
      
      // If there's already a rebuild in progress, wait for it
      if (this.indexRebuildPromise) {
        await this.indexRebuildPromise;
      } else {
        // Otherwise start a new rebuild
        this.indexRebuildPromise = this.rebuildIndices().finally(() => {
          this.indexRebuildPromise = null;
        });
        
        await this.indexRebuildPromise;
      }
    }
  }
  
  /**
   * Rebuild all search indices
   */
  private async rebuildIndices(): Promise<void> {
    if (!this.options.buildIndices) {
      return;
    }
    
    try {
      this.logger?.debug('Rebuilding search indices...');
      
      // Clear existing indices
      this.meetingIndex.clear();
      this.participantIndex.clear();
      this.topicIndex.clear();
      this.tagIndex.clear();
      this.timeIndex = [];
      
      // Get all meeting IDs
      const meetingIds = await this.getAllMeetingIds();
      
      // Load all meetings into the indices
      for (const meetingId of meetingIds) {
        const result = await this.stateManager.loadState<MeetingAnalysisResult>(
          this.getMeetingStateKey(meetingId)
        );
        
        if (result) {
          this.updateIndicesForMeeting(result);
        }
      }
      
      // Sort the time index
      this.timeIndex.sort((a, b) => a.timestamp - b.timestamp);
      
      this.indexLastRebuild = Date.now();
      this.logger?.debug(`Rebuilt indices with ${this.meetingIndex.size} meetings`);
    } catch (error) {
      this.logger?.error(`Failed to rebuild indices: ${(error as Error).message}`);
      throw new Error(`Failed to rebuild indices: ${(error as Error).message}`);
    }
  }
  
  /**
   * Update indices for a single meeting
   * 
   * @param meeting - The meeting result to index
   */
  private updateIndicesForMeeting(meeting: MeetingAnalysisResult): void {
    if (!this.options.buildIndices) {
      return;
    }
    
    // Add to meeting index
    this.meetingIndex.set(meeting.meetingId, deepClone(meeting));
    
    // Add to time index
    const timeEntry = this.timeIndex.find(e => e.meetingId === meeting.meetingId);
    if (timeEntry) {
      timeEntry.timestamp = meeting.timestamp;
    } else {
      this.timeIndex.push({
        meetingId: meeting.meetingId,
        timestamp: meeting.timestamp
      });
    }
    
    // Add to participant index
    if (meeting.participants) {
      for (const participant of meeting.participants) {
        if (!this.participantIndex.has(participant.id)) {
          this.participantIndex.set(participant.id, new Set());
        }
        this.participantIndex.get(participant.id)?.add(meeting.meetingId);
      }
    }
    
    // Add to topic index
    if (meeting.topics) {
      for (const topic of meeting.topics) {
        const normalizedName = this.normalizeTopicName(topic.name);
        if (!this.topicIndex.has(normalizedName)) {
          this.topicIndex.set(normalizedName, new Set());
        }
        this.topicIndex.get(normalizedName)?.add(meeting.meetingId);
      }
    }
    
    // Add to tag index
    if (meeting.tags) {
      for (const tag of meeting.tags) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)?.add(meeting.meetingId);
      }
    }
  }
  
  /**
   * Find related meetings using in-memory indices
   * 
   * @param meeting - The reference meeting
   * @param criteria - Search criteria
   * @returns Array of related meeting IDs, sorted by relevance
   */
  private findRelatedMeetingsFromIndices(
    meeting: MeetingAnalysisResult,
    criteria: RelationCriteria
  ): string[] {
    // Track relevance scores for each meeting
    const relevanceScores = new Map<string, number>();
    const meetingSet = new Set<string>();
    
    // Find by participants
    if (meeting.participants && (!criteria.participants || criteria.participants.length === 0)) {
      // Use reference meeting's participants if not specified in criteria
      for (const participant of meeting.participants) {
        const relatedMeetings = this.participantIndex.get(participant.id);
        if (relatedMeetings) {
          for (const meetingId of relatedMeetings) {
            if (meetingId !== meeting.meetingId) {
              meetingSet.add(meetingId);
              relevanceScores.set(
                meetingId, 
                (relevanceScores.get(meetingId) || 0) + 1
              );
            }
          }
        }
      }
    } else if (criteria.participants && criteria.participants.length > 0) {
      // Use specified participants
      for (const participantId of criteria.participants) {
        const relatedMeetings = this.participantIndex.get(participantId);
        if (relatedMeetings) {
          for (const meetingId of relatedMeetings) {
            if (meetingId !== meeting.meetingId) {
              meetingSet.add(meetingId);
              relevanceScores.set(
                meetingId, 
                (relevanceScores.get(meetingId) || 0) + 2
              );
            }
          }
        }
      }
    }
    
    // Find by topics
    if (meeting.topics && (!criteria.topics || criteria.topics.length === 0)) {
      // Use reference meeting's topics if not specified in criteria
      for (const topic of meeting.topics) {
        const normalizedName = this.normalizeTopicName(topic.name);
        const relatedMeetings = this.topicIndex.get(normalizedName);
        if (relatedMeetings) {
          for (const meetingId of relatedMeetings) {
            if (meetingId !== meeting.meetingId) {
              meetingSet.add(meetingId);
              // Weight by relevance
              relevanceScores.set(
                meetingId, 
                (relevanceScores.get(meetingId) || 0) + (topic.relevance * 3)
              );
            }
          }
        }
      }
    } else if (criteria.topics && criteria.topics.length > 0) {
      // Use specified topics
      for (const topicName of criteria.topics) {
        const normalizedName = this.normalizeTopicName(topicName);
        const relatedMeetings = this.topicIndex.get(normalizedName);
        if (relatedMeetings) {
          for (const meetingId of relatedMeetings) {
            if (meetingId !== meeting.meetingId) {
              meetingSet.add(meetingId);
              relevanceScores.set(
                meetingId, 
                (relevanceScores.get(meetingId) || 0) + 3
              );
            }
          }
        }
      }
    }
    
    // Find by tags
    if (meeting.tags && (!criteria.tags || criteria.tags.length === 0)) {
      // Use reference meeting's tags if not specified in criteria
      for (const tag of meeting.tags) {
        const relatedMeetings = this.tagIndex.get(tag);
        if (relatedMeetings) {
          for (const meetingId of relatedMeetings) {
            if (meetingId !== meeting.meetingId) {
              meetingSet.add(meetingId);
              relevanceScores.set(
                meetingId, 
                (relevanceScores.get(meetingId) || 0) + 1.5
              );
            }
          }
        }
      }
    } else if (criteria.tags && criteria.tags.length > 0) {
      // Use specified tags
      for (const tag of criteria.tags) {
        const relatedMeetings = this.tagIndex.get(tag);
        if (relatedMeetings) {
          for (const meetingId of relatedMeetings) {
            if (meetingId !== meeting.meetingId) {
              meetingSet.add(meetingId);
              relevanceScores.set(
                meetingId, 
                (relevanceScores.get(meetingId) || 0) + 2
              );
            }
          }
        }
      }
    }
    
    // Filter by time range if specified
    if (criteria.timeRange) {
      for (const meetingId of meetingSet) {
        const result = this.meetingIndex.get(meetingId);
        if (result) {
          if (
            (criteria.timeRange.start !== undefined && result.timestamp < criteria.timeRange.start) ||
            (criteria.timeRange.end !== undefined && result.timestamp > criteria.timeRange.end)
          ) {
            // Outside the time range, remove it
            meetingSet.delete(meetingId);
            relevanceScores.delete(meetingId);
          }
        }
      }
    }
    
    // Apply similarity threshold if specified
    if (criteria.minSimilarity !== undefined) {
      // Find the maximum score for normalization
      const maxScore = Math.max(...Array.from(relevanceScores.values()));
      
      if (maxScore > 0) {
        // Filter by normalized similarity score
        for (const [meetingId, score] of relevanceScores.entries()) {
          const normalizedScore = score / maxScore;
          
          if (normalizedScore < criteria.minSimilarity) {
            meetingSet.delete(meetingId);
            relevanceScores.delete(meetingId);
          }
        }
      }
    }
    
    // Sort by relevance score and apply limit if specified
    let result = Array.from(meetingSet).sort((a, b) => {
      return (relevanceScores.get(b) || 0) - (relevanceScores.get(a) || 0);
    });
    
    if (criteria.limit !== undefined && criteria.limit > 0) {
      result = result.slice(0, criteria.limit);
    }
    
    return result;
  }
  
  /**
   * Find related meetings using direct querying (fallback when indices not available)
   * 
   * @param meeting - The reference meeting
   * @param criteria - Search criteria
   * @returns Array of related meeting IDs, sorted by relevance
   */
  private async findRelatedMeetingsDirectQuery(
    meeting: MeetingAnalysisResult,
    criteria: RelationCriteria
  ): Promise<string[]> {
    // Get all meeting IDs
    const allMeetingIds = await this.getAllMeetingIds();
    
    // Track relevance scores for each meeting
    const relevanceScores = new Map<string, number>();
    const meetingSet = new Set<string>();
    
    // Reference sets for faster lookups
    const refParticipantIds = new Set(meeting.participants.map(p => p.id));
    const refTopicNames = new Set(meeting.topics?.map(t => this.normalizeTopicName(t.name)) || []);
    const refTags = new Set(meeting.tags || []);
    
    // Check criteria participants
    const criteriaParticipantIds = new Set(criteria.participants || []);
    const criteriaTopicNames = new Set((criteria.topics || []).map(t => this.normalizeTopicName(t)));
    const criteriaTags = new Set(criteria.tags || []);
    
    // Process each meeting
    for (const meetingId of allMeetingIds) {
      // Skip the reference meeting
      if (meetingId === meeting.meetingId) {
        continue;
      }
      
      const result = await this.getMeetingResult(meetingId);
      if (!result) continue;
      
      // Check time range criteria if specified
      if (criteria.timeRange) {
        if (
          (criteria.timeRange.start !== undefined && result.timestamp < criteria.timeRange.start) ||
          (criteria.timeRange.end !== undefined && result.timestamp > criteria.timeRange.end)
        ) {
          // Outside the time range, skip it
          continue;
        }
      }
      
      let relevanceScore = 0;
      
      // Check participant overlap
      if (criteriaParticipantIds.size > 0) {
        // Use criteria participants
        for (const participant of result.participants) {
          if (criteriaParticipantIds.has(participant.id)) {
            relevanceScore += 2;
            meetingSet.add(meetingId);
          }
        }
      } else {
        // Use reference meeting participants
        for (const participant of result.participants) {
          if (refParticipantIds.has(participant.id)) {
            relevanceScore += 1;
            meetingSet.add(meetingId);
          }
        }
      }
      
      // Check topic overlap
      if (criteriaTopicNames.size > 0) {
        // Use criteria topics
        for (const topic of result.topics || []) {
          const normalizedName = this.normalizeTopicName(topic.name);
          if (criteriaTopicNames.has(normalizedName)) {
            relevanceScore += 3;
            meetingSet.add(meetingId);
          }
        }
      } else if (result.topics) {
        // Use reference meeting topics
        for (const topic of result.topics) {
          const normalizedName = this.normalizeTopicName(topic.name);
          if (refTopicNames.has(normalizedName)) {
            relevanceScore += topic.relevance * 3;
            meetingSet.add(meetingId);
          }
        }
      }
      
      // Check tag overlap
      if (criteriaTags.size > 0) {
        // Use criteria tags
        for (const tag of result.tags || []) {
          if (criteriaTags.has(tag)) {
            relevanceScore += 2;
            meetingSet.add(meetingId);
          }
        }
      } else if (result.tags) {
        // Use reference meeting tags
        for (const tag of result.tags) {
          if (refTags.has(tag)) {
            relevanceScore += 1.5;
            meetingSet.add(meetingId);
          }
        }
      }
      
      if (relevanceScore > 0) {
        relevanceScores.set(meetingId, relevanceScore);
      }
    }
    
    // Apply similarity threshold if specified
    if (criteria.minSimilarity !== undefined && relevanceScores.size > 0) {
      // Find the maximum score for normalization
      const maxScore = Math.max(...Array.from(relevanceScores.values()));
      
      if (maxScore > 0) {
        // Filter by normalized similarity score
        for (const [meetingId, score] of relevanceScores.entries()) {
          const normalizedScore = score / maxScore;
          
          if (normalizedScore < criteria.minSimilarity) {
            meetingSet.delete(meetingId);
            relevanceScores.delete(meetingId);
          }
        }
      }
    }
    
    // Sort by relevance score and apply limit if specified
    let result = Array.from(meetingSet).sort((a, b) => {
      return (relevanceScores.get(b) || 0) - (relevanceScores.get(a) || 0);
    });
    
    if (criteria.limit !== undefined && criteria.limit > 0) {
      result = result.slice(0, criteria.limit);
    }
    
    return result;
  }
} 