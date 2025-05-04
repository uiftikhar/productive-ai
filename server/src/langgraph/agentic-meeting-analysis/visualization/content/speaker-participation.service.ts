/**
 * Speaker Participation Visualization Service
 * 
 * Tracks and visualizes speaker participation metrics during meetings.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  SpeakerParticipationVisualization,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState,
  ParticipantDynamics
} from '../../interfaces/visualization.interface';

/**
 * Configuration for the SpeakerParticipationVisualizationImpl
 */
export interface SpeakerParticipationVisualizationConfig {
  logger?: Logger;
}

/**
 * Speaker participation record
 */
interface SpeakerParticipation {
  id: string;
  meetingId: string;
  speakerId: string;
  timestamp: Date;
  duration: number;
  wordCount: number;
  topicId?: string;
  sentiment?: number;
  durationType?: 'speaking' | 'question' | 'response' | 'challenge' | 'support';
  interactsWithIds?: string[];
}

/**
 * Implementation of the SpeakerParticipationVisualization interface
 */
export class SpeakerParticipationVisualizationImpl implements SpeakerParticipationVisualization {
  private logger: Logger;
  private participations: Map<string, SpeakerParticipation>;
  private meetingParticipations: Map<string, Set<string>>;
  private speakerParticipations: Map<string, Set<string>>;
  private topicParticipations: Map<string, Set<string>>;
  private participantDynamicsCache: Map<string, ParticipantDynamics>;

  /**
   * Create a new speaker participation visualization service
   */
  constructor(config: SpeakerParticipationVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.participations = new Map();
    this.meetingParticipations = new Map();
    this.speakerParticipations = new Map();
    this.topicParticipations = new Map();
    this.participantDynamicsCache = new Map();
    this.logger.info('SpeakerParticipationVisualizationImpl initialized');
  }

  /**
   * Record speaker participation
   * NOTE: This is the internal version used by recordParticipation
   */
  recordSpeakerParticipation(meetingId: string, participation: {
    speakerId: string;
    timestamp: Date;
    duration: number;
    wordCount: number;
    topicId?: string;
    sentiment?: number;
    durationType?: 'speaking' | 'question' | 'response' | 'challenge' | 'support';
    interactsWithIds?: string[];
  }): string {
    const participationId = `participation-${uuidv4()}`;
    
    // Store the participation
    const speakerParticipation: SpeakerParticipation = {
      id: participationId,
      meetingId,
      ...participation
    };
    
    this.participations.set(participationId, speakerParticipation);
    
    // Add to indices
    this.addToIndex(this.meetingParticipations, meetingId, participationId);
    this.addToIndex(this.speakerParticipations, participation.speakerId, participationId);
    
    if (participation.topicId) {
      this.addToIndex(this.topicParticipations, participation.topicId, participationId);
    }
    
    // Clear any cached dynamics that are affected by this new participation
    this.participantDynamicsCache.delete(`${meetingId}-${participation.speakerId}`);
    
    this.logger.info(`Recorded speaker participation ${participationId} for ${participation.speakerId}`);
    
    return participationId;
  }
  
  /**
   * Record a participation (implements interface method)
   */
  recordParticipation(meetingId: string, participation: {
    timestamp: Date;
    participantId: string;
    durationType: 'speaking' | 'question' | 'response' | 'challenge' | 'support';
    durationSeconds: number;
    topicId?: string;
    interactsWithIds?: string[];
  }): string {
    // Calculate approximate word count based on duration
    // Assume average speaking rate of ~130 words per minute
    const wordCount = Math.round((participation.durationSeconds / 60) * 130);
    
    return this.recordSpeakerParticipation(meetingId, {
      speakerId: participation.participantId,
      timestamp: participation.timestamp,
      duration: participation.durationSeconds,
      wordCount,
      topicId: participation.topicId,
      durationType: participation.durationType,
      interactsWithIds: participation.interactsWithIds
    });
  }

  /**
   * Visualize speaker participation for a meeting
   */
  visualizeSpeakerParticipation(meetingId: string): VisualizationGraph {
    const participationIds = this.meetingParticipations.get(meetingId) || new Set<string>();
    
    if (participationIds.size === 0) {
      return {
        id: `speaker-participation-${meetingId}`,
        name: `Speaker Participation for Meeting ${meetingId}`,
        elements: [],
        connections: [],
        layout: 'timeline',
        timestamp: new Date(),
        version: 1
      };
    }
    
    // Get all participations for this meeting
    const participations = Array.from(participationIds)
      .map(id => this.participations.get(id))
      .filter(Boolean) as SpeakerParticipation[];
    
    // Sort by timestamp
    participations.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Get unique speakers
    const speakerIds = new Set<string>();
    for (const participation of participations) {
      speakerIds.add(participation.speakerId);
    }
    
    // Create timeline visualization
    const elements: VisualizationElement[] = [];
    const connections: VisualizationConnection[] = [];
    
    // Create timeline element
    const timelineElement: VisualizationElement = {
      id: 'timeline',
      type: VisualizationElementType.TRANSCRIPT_SEGMENT,
      label: 'Meeting Timeline',
      description: 'Timeline of meeting participation',
      properties: {},
      state: VisualizationElementState.ACTIVE,
      position: { x: 100, y: 50 },
      size: { width: 800, height: 10 },
      color: '#E0E0E0',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    elements.push(timelineElement);
    
    // Create speaker elements
    const speakerRows: Record<string, number> = {};
    let nextRow = 0;
    
    for (const speakerId of speakerIds) {
      speakerRows[speakerId] = nextRow++;
      
      // Create speaker label
      const speakerLabel: VisualizationElement = {
        id: `speaker-label-${speakerId}`,
        type: VisualizationElementType.PARTICIPANT,
        label: `Speaker ${speakerId.split('-').pop()}`,
        description: `Speaker ${speakerId}`,
        properties: {
          speakerId
        },
        state: VisualizationElementState.ACTIVE,
        position: { x: 50, y: 100 + speakerRows[speakerId] * 100 },
        color: this.getColorForSpeaker(speakerId),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      elements.push(speakerLabel);
    }
    
    // Calculate time range
    const startTime = participations[0].timestamp.getTime();
    const endTime = participations[participations.length - 1].timestamp.getTime();
    const totalDuration = endTime - startTime || 1; // Avoid division by zero
    const timelineWidth = 800;
    
    // Add elements for each participation
    for (const participation of participations) {
      const xPosition = 100 + ((participation.timestamp.getTime() - startTime) / totalDuration) * timelineWidth;
      const yPosition = 100 + speakerRows[participation.speakerId] * 100;
      
      // Size based on duration/word count
      const size = Math.max(20, Math.min(60, participation.wordCount / 10));
      
      // Create participation element
      const elementId = `participation-${participation.id}`;
      const element: VisualizationElement = {
        id: elementId,
        type: VisualizationElementType.TRANSCRIPT_SEGMENT,
        label: `${participation.wordCount} words`,
        description: `Participation of ${participation.duration}s and ${participation.wordCount} words`,
        properties: {
          speakerId: participation.speakerId,
          timestamp: participation.timestamp,
          duration: participation.duration,
          wordCount: participation.wordCount,
          topicId: participation.topicId,
          sentiment: participation.sentiment,
          durationType: participation.durationType
        },
        state: VisualizationElementState.ACTIVE,
        position: { x: xPosition, y: yPosition },
        size: { width: size, height: size },
        color: this.getSentimentColor(participation.sentiment),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      elements.push(element);
      
      // Connect to timeline
      connections.push({
        id: `timeline-connection-${participation.id}`,
        type: VisualizationConnectionType.RELATION,
        sourceId: 'timeline',
        targetId: elementId,
        label: '',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Connect to speaker
      connections.push({
        id: `speaker-connection-${participation.id}`,
        type: VisualizationConnectionType.ASSIGNMENT,
        sourceId: `speaker-label-${participation.speakerId}`,
        targetId: elementId,
        label: '',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Connect interacting participants if specified
      if (participation.interactsWithIds && participation.interactsWithIds.length > 0) {
        for (const interacteeId of participation.interactsWithIds) {
          // Add interaction connections
          connections.push({
            id: `interaction-${participation.id}-${interacteeId}`,
            type: VisualizationConnectionType.COMMUNICATION,
            sourceId: elementId,
            targetId: `speaker-label-${interacteeId}`,
            label: participation.durationType || 'interaction',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }
    
    return {
      id: `speaker-participation-${meetingId}`,
      name: `Speaker Participation for Meeting ${meetingId}`,
      description: `Visualization of speaker participation for meeting ${meetingId}`,
      elements,
      connections,
      layout: 'timeline',
      timestamp: new Date(),
      version: 1,
      metadata: {
        meetingId,
        speakerCount: speakerIds.size,
        participationCount: participations.length,
        timeRange: {
          start: participations[0].timestamp,
          end: participations[participations.length - 1].timestamp
        }
      }
    };
  }

  /**
   * Calculate participation metrics for a meeting
   */
  calculateParticipationMetrics(meetingId: string): {
    speakerStats: Record<string, {
      totalTime: number;
      totalWords: number;
      participationCount: number;
      averageSentiment?: number;
    }>;
    dominanceScore: Record<string, number>;
    balanceScore: number;
  } {
    const participationIds = this.meetingParticipations.get(meetingId) || new Set<string>();
    
    if (participationIds.size === 0) {
      return {
        speakerStats: {},
        dominanceScore: {},
        balanceScore: 0
      };
    }
    
    // Get all participations for this meeting
    const participations = Array.from(participationIds)
      .map(id => this.participations.get(id))
      .filter(Boolean) as SpeakerParticipation[];
    
    // Calculate stats for each speaker
    const speakerStats: Record<string, {
      totalTime: number;
      totalWords: number;
      participationCount: number;
      sentimentSum?: number;
      sentimentCount?: number;
    }> = {};
    
    for (const participation of participations) {
      if (!speakerStats[participation.speakerId]) {
        speakerStats[participation.speakerId] = {
          totalTime: 0,
          totalWords: 0,
          participationCount: 0,
          sentimentSum: 0,
          sentimentCount: 0
        };
      }
      
      const stats = speakerStats[participation.speakerId];
      stats.totalTime += participation.duration;
      stats.totalWords += participation.wordCount;
      stats.participationCount++;
      
      if (participation.sentiment !== undefined) {
        stats.sentimentSum = (stats.sentimentSum || 0) + participation.sentiment;
        stats.sentimentCount = (stats.sentimentCount || 0) + 1;
      }
    }
    
    // Calculate dominance scores (percentage of total time)
    const totalTime = Object.values(speakerStats).reduce(
      (sum, stats) => sum + stats.totalTime, 0
    );
    
    const dominanceScore: Record<string, number> = {};
    
    for (const [speakerId, stats] of Object.entries(speakerStats)) {
      dominanceScore[speakerId] = totalTime > 0 ? stats.totalTime / totalTime : 0;
    }
    
    // Calculate balance score (how evenly distributed participation is)
    // 1.0 means perfectly balanced, 0.0 means one speaker dominated completely
    const speakerCount = Object.keys(speakerStats).length;
    let balanceScore = 0;
    
    if (speakerCount > 1) {
      // Perfect balance would be 1/speakerCount for each speaker
      const idealShare = 1 / speakerCount;
      let totalDeviation = 0;
      
      for (const share of Object.values(dominanceScore)) {
        totalDeviation += Math.abs(share - idealShare);
      }
      
      // Normalize to 0-1 range (max deviation is 2*(1-idealShare))
      const maxDeviation = 2 * (1 - idealShare);
      balanceScore = maxDeviation > 0 ? 1 - (totalDeviation / maxDeviation) : 1;
    }
    
    // Add average sentiment to final output
    const result = {
      speakerStats: {} as Record<string, {
        totalTime: number;
        totalWords: number;
        participationCount: number;
        averageSentiment?: number;
      }>,
      dominanceScore,
      balanceScore
    };
    
    for (const [speakerId, stats] of Object.entries(speakerStats)) {
      result.speakerStats[speakerId] = {
        totalTime: stats.totalTime,
        totalWords: stats.totalWords,
        participationCount: stats.participationCount
      };
      
      if (stats.sentimentCount && stats.sentimentCount > 0) {
        result.speakerStats[speakerId].averageSentiment = 
          (stats.sentimentSum || 0) / stats.sentimentCount;
      }
    }
    
    return result;
  }
  
  /**
   * Get participant dynamics for a specific participant
   */
  getParticipantDynamics(meetingId: string, participantId: string): ParticipantDynamics {
    const cacheKey = `${meetingId}-${participantId}`;
    
    // Check if we have a cached result
    if (this.participantDynamicsCache.has(cacheKey)) {
      return this.participantDynamicsCache.get(cacheKey)!;
    }
    
    // Get all participations for this participant in this meeting
    const participationIds = this.speakerParticipations.get(participantId) || new Set<string>();
    const meetingParticipationIds = this.meetingParticipations.get(meetingId) || new Set<string>();
    
    // Filter to only include participations from this meeting
    const relevantParticipationIds = Array.from(participationIds)
      .filter(id => meetingParticipationIds.has(id));
    
    const participations = relevantParticipationIds
      .map(id => this.participations.get(id))
      .filter(Boolean) as SpeakerParticipation[];
    
    // Sort by timestamp
    participations.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Calculate speaking time and interventions
    const speakingTime = participations.reduce((sum, p) => sum + p.duration, 0);
    const interventions = participations.length;
    
    // Calculate influence based on interactions
    let interactionCount = 0;
    for (const p of participations) {
      if (p.interactsWithIds && p.interactsWithIds.length > 0) {
        interactionCount += p.interactsWithIds.length;
      }
    }
    
    // Influence is a combination of speaking time, interventions, and interactions
    const rawInfluence = (speakingTime / 60) * 0.4 + interventions * 0.3 + interactionCount * 0.3;
    const influence = Math.min(1, rawInfluence / 20); // Normalize to 0-1 scale
    
    // Calculate engagement based on participation frequency
    let engagement = 0;
    if (participations.length >= 2) {
      const timeDiffs: number[] = [];
      for (let i = 1; i < participations.length; i++) {
        timeDiffs.push(participations[i].timestamp.getTime() - participations[i-1].timestamp.getTime());
      }
      
      // Calculate average time between participations (in minutes)
      const avgTimeBetween = timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length / 60000;
      
      // Shorter times between participations = higher engagement
      engagement = Math.min(1, 10 / (avgTimeBetween + 10)); // Normalize to 0-1 scale
    } else if (participations.length === 1) {
      engagement = 0.3; // One participation means some engagement
    }
    
    // Calculate sentiment trend
    const sentimentTrend = participations
      .filter(p => p.sentiment !== undefined)
      .map(p => ({
        timestamp: p.timestamp,
        value: p.sentiment!
      }));
    
    // Calculate interactions with other participants
    const interactionsByParticipant = new Map<string, { count: number; sentimentSum: number; sentimentCount: number }>();
    
    for (const p of participations) {
      if (p.interactsWithIds && p.interactsWithIds.length > 0) {
        for (const interacteeId of p.interactsWithIds) {
          if (!interactionsByParticipant.has(interacteeId)) {
            interactionsByParticipant.set(interacteeId, { count: 0, sentimentSum: 0, sentimentCount: 0 });
          }
          
          const stats = interactionsByParticipant.get(interacteeId)!;
          stats.count++;
          
          if (p.sentiment !== undefined) {
            stats.sentimentSum += p.sentiment;
            stats.sentimentCount++;
          }
        }
      }
    }
    
    // Format interactions
    const interactions = Array.from(interactionsByParticipant.entries()).map(([withParticipantId, stats]) => ({
      withParticipantId,
      count: stats.count,
      sentiment: stats.sentimentCount > 0 ? stats.sentimentSum / stats.sentimentCount : 0
    }));
    
    // Create the ParticipantDynamics object
    const dynamics: ParticipantDynamics = {
      participantId,
      name: `Participant ${participantId.split('-').pop()}`,
      speakingTime,
      interventions,
      influence,
      engagement,
      sentimentTrend,
      interactions
    };
    
    // Cache result
    this.participantDynamicsCache.set(cacheKey, dynamics);
    
    return dynamics;
  }
  
  /**
   * Compare participant engagement levels
   */
  compareParticipantEngagement(meetingId: string): Record<string, number> {
    // Get all participants in the meeting
    const meetingParticipationIds = this.meetingParticipations.get(meetingId) || new Set<string>();
    
    if (meetingParticipationIds.size === 0) {
      return {};
    }
    
    // Get all participations for this meeting
    const participations = Array.from(meetingParticipationIds)
      .map(id => this.participations.get(id))
      .filter(Boolean) as SpeakerParticipation[];
    
    // Get unique participant IDs
    const participantIds = new Set<string>();
    for (const p of participations) {
      participantIds.add(p.speakerId);
    }
    
    // Calculate engagement for each participant
    const engagementScores: Record<string, number> = {};
    
    for (const participantId of participantIds) {
      const dynamics = this.getParticipantDynamics(meetingId, participantId);
      engagementScores[participantId] = dynamics.engagement;
    }
    
    return engagementScores;
  }
  
  /**
   * Analyze participation equality in the meeting
   */
  analyzeParticipationEquality(meetingId: string): {
    giniCoefficient: number;
    dominantParticipants: string[];
    underrepresentedParticipants: string[];
    balanceOverTime: Array<{ timestamp: Date; equality: number }>;
  } {
    // Get metrics for the meeting
    const metrics = this.calculateParticipationMetrics(meetingId);
    
    // Calculate Gini coefficient (measure of inequality)
    // Perfect equality = 0, perfect inequality = 1
    const giniCoefficient = 1 - metrics.balanceScore;
    
    // Identify dominant participants (top 20% of speakers by time)
    const participantsByDominance = Object.entries(metrics.dominanceScore)
      .sort(([, a], [, b]) => b - a);
    
    const dominantThreshold = 1 / (participantsByDominance.length * 0.8);
    const dominantParticipants = participantsByDominance
      .filter(([, score]) => score > dominantThreshold)
      .map(([id]) => id);
    
    // Identify underrepresented participants (bottom 20%)
    const underrepresentedThreshold = 1 / (participantsByDominance.length * 5);
    const underrepresentedParticipants = participantsByDominance
      .filter(([, score]) => score < underrepresentedThreshold)
      .map(([id]) => id);
    
    // Calculate balance over time
    const balanceOverTime: Array<{ timestamp: Date; equality: number }> = [];
    
    // Get all participations for this meeting
    const participationIds = this.meetingParticipations.get(meetingId) || new Set<string>();
    
    if (participationIds.size === 0) {
      return {
        giniCoefficient,
        dominantParticipants,
        underrepresentedParticipants,
        balanceOverTime: []
      };
    }
    
    const participations = Array.from(participationIds)
      .map(id => this.participations.get(id))
      .filter(Boolean) as SpeakerParticipation[];
    
    // Sort by timestamp
    participations.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Calculate balance at regular intervals
    if (participations.length > 0) {
      const startTime = participations[0].timestamp.getTime();
      const endTime = participations[participations.length - 1].timestamp.getTime();
      const duration = endTime - startTime;
      
      // Calculate at 10 points if possible
      const numPoints = Math.min(10, participations.length);
      const interval = duration / numPoints;
      
      for (let i = 0; i < numPoints; i++) {
        const pointTime = new Date(startTime + i * interval);
        
        // Get participations up to this point
        const participationsUpToPoint = participations.filter(
          p => p.timestamp.getTime() <= pointTime.getTime()
        );
        
        if (participationsUpToPoint.length > 0) {
          // Calculate temporary speaker stats
          const speakerStats: Record<string, number> = {};
          
          for (const p of participationsUpToPoint) {
            speakerStats[p.speakerId] = (speakerStats[p.speakerId] || 0) + p.duration;
          }
          
          // Calculate equality for this point in time
          const totalTime = Object.values(speakerStats).reduce((sum, time) => sum + time, 0);
          const shares = Object.values(speakerStats).map(time => time / totalTime);
          
          // Calculate equality using Gini-like method
          let equality = 1;
          
          if (shares.length > 1) {
            const idealShare = 1 / shares.length;
            let totalDeviation = 0;
            
            for (const share of shares) {
              totalDeviation += Math.abs(share - idealShare);
            }
            
            const maxDeviation = 2 * (1 - idealShare);
            equality = maxDeviation > 0 ? 1 - (totalDeviation / maxDeviation) : 1;
          }
          
          balanceOverTime.push({
            timestamp: pointTime,
            equality
          });
        }
      }
    }
    
    return {
      giniCoefficient,
      dominantParticipants,
      underrepresentedParticipants,
      balanceOverTime
    };
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
   * Helper: Get color for speaker
   */
  private getColorForSpeaker(speakerId: string): string {
    // Simple hash function to get a consistent color
    let hash = 0;
    for (let i = 0; i < speakerId.length; i++) {
      hash = speakerId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert to color
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  }

  /**
   * Helper: Get color based on sentiment value
   */
  private getSentimentColor(sentiment?: number): string {
    if (sentiment === undefined) {
      return '#9E9E9E'; // Gray (neutral)
    }
    
    if (sentiment < -0.3) {
      return '#F44336'; // Red (negative)
    } else if (sentiment < 0.3) {
      return '#FFC107'; // Amber (neutral)
    } else {
      return '#4CAF50'; // Green (positive)
    }
  }
} 