/**
 * Sentiment Landscape Visualization Service
 * 
 * Implements visualization of sentiment distribution across topics and participants.
 * Tracks how sentiment evolves over the course of a meeting.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  SentimentLandscapeVisualization,
  VisualizationGraph,
  VisualizationElement,
  VisualizationConnection,
  VisualizationElementType,
  VisualizationConnectionType,
  VisualizationElementState
} from '../../interfaces/visualization.interface';

/**
 * Configuration for the SentimentLandscapeVisualizationImpl
 */
export interface SentimentLandscapeVisualizationConfig {
  logger?: Logger;
}

/**
 * Sentiment record
 */
interface SentimentRecord {
  id: string;
  meetingId: string;
  timestamp: Date;
  speakerId: string;
  content: string;
  topicId?: string;
  sentiment: number; // -1 to 1 scale
  intensity: number; // 0 to 1 scale
  emotions?: string[];
}

/**
 * Implementation of the SentimentLandscapeVisualization interface
 */
export class SentimentLandscapeVisualizationImpl implements SentimentLandscapeVisualization {
  private logger: Logger;
  private sentiments: Map<string, SentimentRecord>;
  private meetingSentiments: Map<string, Set<string>>;
  private speakerSentiments: Map<string, Set<string>>;
  private topicSentiments: Map<string, Set<string>>;
  private elements: Map<string, VisualizationElement>;
  private connections: Map<string, VisualizationConnection>;

  /**
   * Create a new sentiment landscape visualization service
   */
  constructor(config: SentimentLandscapeVisualizationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.sentiments = new Map();
    this.meetingSentiments = new Map();
    this.speakerSentiments = new Map();
    this.topicSentiments = new Map();
    this.elements = new Map();
    this.connections = new Map();
    this.logger.info('SentimentLandscapeVisualizationImpl initialized');
  }

  /**
   * Record a sentiment analysis
   */
  recordSentimentAnalysis(analysis: {
    entityId: string; // can be topic, participant, decision, etc.
    entityType: string;
    timestamp: Date;
    sentimentScore: number; // -1 to 1 scale
    keywords: { word: string; sentiment: number }[];
    confidence: number; // 0-1 scale
  }): string {
    // For backwards compatibility, use recordSentiment
    return this.recordSentiment('default-meeting', {
      timestamp: analysis.timestamp,
      speakerId: analysis.entityId,
      content: analysis.keywords.map(k => k.word).join(', '),
      topicId: analysis.entityType === 'topic' ? analysis.entityId : undefined,
      sentiment: analysis.sentimentScore,
      intensity: analysis.confidence,
      emotions: analysis.keywords
        .filter(k => k.sentiment > 0.5 || k.sentiment < -0.5)
        .map(k => k.word)
    });
  }

  /**
   * Record a sentiment data point (internal implementation)
   */
  recordSentiment(meetingId: string, sentiment: {
    timestamp: Date;
    speakerId: string;
    content: string;
    topicId?: string;
    sentiment: number;
    intensity: number;
    emotions?: string[];
  }): string {
    const sentimentId = `sentiment-${uuidv4()}`;
    
    // Store the sentiment
    const sentimentRecord: SentimentRecord = {
      id: sentimentId,
      meetingId,
      ...sentiment
    };
    
    this.sentiments.set(sentimentId, sentimentRecord);
    
    // Add to indices
    this.addToIndex(this.meetingSentiments, meetingId, sentimentId);
    this.addToIndex(this.speakerSentiments, sentiment.speakerId, sentimentId);
    
    if (sentiment.topicId) {
      this.addToIndex(this.topicSentiments, sentiment.topicId, sentimentId);
    }
    
    // Create visualization elements
    this.createSentimentElement(sentimentId, sentimentRecord);
    
    this.logger.info(`Recorded sentiment ${sentimentId} for speaker ${sentiment.speakerId}`);
    
    return sentimentId;
  }

  /**
   * Get sentiment analysis for a specific entity
   */
  getSentimentForEntity(entityId: string): {
    entityId: string; // can be topic, participant, decision, etc.
    entityType: string;
    timestamp: Date;
    sentimentScore: number; // -1 to 1 scale
    keywords: { word: string; sentiment: number }[];
    confidence: number; // 0-1 scale
  }[] {
    // Check if this is a speaker
    if (this.speakerSentiments.has(entityId)) {
      const sentimentIds = this.speakerSentiments.get(entityId) || new Set<string>();
      
      return Array.from(sentimentIds)
        .map(id => this.sentiments.get(id))
        .filter(Boolean)
        .map(record => ({
          entityId: record!.speakerId,
          entityType: 'participant',
          timestamp: record!.timestamp,
          sentimentScore: record!.sentiment,
          keywords: (record!.emotions || []).map(emotion => ({
            word: emotion,
            sentiment: record!.sentiment > 0 ? 0.8 : -0.8
          })),
          confidence: record!.intensity
        }));
    }
    
    // Check if this is a topic
    if (this.topicSentiments.has(entityId)) {
      const sentimentIds = this.topicSentiments.get(entityId) || new Set<string>();
      
      return Array.from(sentimentIds)
        .map(id => this.sentiments.get(id))
        .filter(Boolean)
        .map(record => ({
          entityId: record!.topicId!,
          entityType: 'topic',
          timestamp: record!.timestamp,
          sentimentScore: record!.sentiment,
          keywords: (record!.emotions || []).map(emotion => ({
            word: emotion,
            sentiment: record!.sentiment > 0 ? 0.8 : -0.8
          })),
          confidence: record!.intensity
        }));
    }
    
    return [];
  }

  /**
   * Analyze sentiment patterns
   */
  analyzeSentimentPatterns(meetingId: string): {
    overallTrend: 'positive' | 'negative' | 'neutral' | 'mixed' | 'volatile';
    sentimentByTopic: Record<string, number>;
    sentimentByParticipant: Record<string, number>;
    volatilityScore: number; // 0-1 scale
    emotionalTriggers: Array<{ entity: string; sentiment: number; intensity: number }>;
  } {
    const sentimentIds = this.meetingSentiments.get(meetingId) || new Set<string>();
    
    if (sentimentIds.size === 0) {
      return {
        overallTrend: 'neutral',
        sentimentByTopic: {},
        sentimentByParticipant: {},
        volatilityScore: 0,
        emotionalTriggers: []
      };
    }
    
    // Get all sentiments
    const sentiments = Array.from(sentimentIds)
      .map(id => this.sentiments.get(id))
      .filter(Boolean) as SentimentRecord[];
    
    // Sort by timestamp
    sentiments.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Calculate overall sentiment average
    const averageSentiment = sentiments.reduce((sum, record) => sum + record.sentiment, 0) / sentiments.length;
    
    // Determine overall trend
    let overallTrend: 'positive' | 'negative' | 'neutral' | 'mixed' | 'volatile';
    
    if (this.calculateVolatility(sentiments) > 0.5) {
      overallTrend = 'volatile';
    } else if (averageSentiment > 0.2) {
      overallTrend = 'positive';
    } else if (averageSentiment < -0.2) {
      overallTrend = 'negative';
    } else if (this.hasSignificantVariation(sentiments)) {
      overallTrend = 'mixed';
    } else {
      overallTrend = 'neutral';
    }
    
    // Calculate sentiment by topic
    const sentimentByTopic: Record<string, number> = {};
    const topicSentiments: Record<string, number[]> = {};
    
    for (const record of sentiments) {
      if (record.topicId) {
        if (!topicSentiments[record.topicId]) {
          topicSentiments[record.topicId] = [];
        }
        
        topicSentiments[record.topicId].push(record.sentiment);
      }
    }
    
    for (const [topicId, values] of Object.entries(topicSentiments)) {
      sentimentByTopic[topicId] = values.reduce((sum, val) => sum + val, 0) / values.length;
    }
    
    // Calculate sentiment by participant
    const sentimentByParticipant: Record<string, number> = {};
    const participantSentiments: Record<string, number[]> = {};
    
    for (const record of sentiments) {
      if (!participantSentiments[record.speakerId]) {
        participantSentiments[record.speakerId] = [];
      }
      
      participantSentiments[record.speakerId].push(record.sentiment);
    }
    
    for (const [participantId, values] of Object.entries(participantSentiments)) {
      sentimentByParticipant[participantId] = values.reduce((sum, val) => sum + val, 0) / values.length;
    }
    
    // Calculate volatility
    const volatilityScore = this.calculateVolatility(sentiments);
    
    // Identify emotional triggers
    const emotionalTriggers: Array<{ entity: string; sentiment: number; intensity: number }> = [];
    
    // Find extreme sentiment shifts
    for (let i = 1; i < sentiments.length; i++) {
      const prev = sentiments[i - 1];
      const current = sentiments[i];
      
      const shift = Math.abs(current.sentiment - prev.sentiment);
      
      if (shift > 0.5 && current.intensity > 0.7) {
        // This is a potential emotional trigger
        const entity = current.topicId || current.content.split(' ').slice(0, 3).join(' ');
        
        emotionalTriggers.push({
          entity,
          sentiment: current.sentiment,
          intensity: current.intensity
        });
      }
    }
    
    // Sort by intensity and limit results
    emotionalTriggers.sort((a, b) => b.intensity - a.intensity);
    
    return {
      overallTrend,
      sentimentByTopic,
      sentimentByParticipant,
      volatilityScore,
      emotionalTriggers: emotionalTriggers.slice(0, 5) // Top 5 triggers
    };
  }

  /**
   * Visualize sentiment landscape
   */
  visualizeSentimentLandscape(meetingId: string): VisualizationGraph {
    const sentimentIds = this.meetingSentiments.get(meetingId) || new Set<string>();
    
    if (sentimentIds.size === 0) {
      this.logger.info(`No sentiment data found for meeting ${meetingId}`);
      return {
        id: `sentiment-landscape-${meetingId}`,
        name: `Sentiment Landscape for Meeting ${meetingId}`,
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
    
    // Get all sentiments
    const sentiments = Array.from(sentimentIds)
      .map(id => this.sentiments.get(id))
      .filter(Boolean) as SentimentRecord[];
    
    // Sort by timestamp
    sentiments.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Collect unique speakers and topics
    const speakerIds = new Set<string>();
    const topicIds = new Set<string>();
    
    for (const sentiment of sentiments) {
      speakerIds.add(sentiment.speakerId);
      if (sentiment.topicId) {
        topicIds.add(sentiment.topicId);
      }
    }
    
    // Create speaker elements
    for (const speakerId of speakerIds) {
      const elementId = `speaker-${speakerId}`;
      elements.push({
        id: elementId,
        type: VisualizationElementType.PARTICIPANT,
        label: `Speaker ${speakerId.split('-').pop()}`,
        description: `Speaker ${speakerId}`,
        properties: { speakerId },
        state: VisualizationElementState.ACTIVE,
        color: this.getColorForSpeaker(speakerId),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Create topic elements
    for (const topicId of topicIds) {
      const elementId = `topic-${topicId}`;
      elements.push({
        id: elementId,
        type: VisualizationElementType.TOPIC,
        label: `Topic ${topicId.split('-').pop()}`,
        description: `Topic ${topicId}`,
        properties: { topicId },
        state: VisualizationElementState.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    // Create timeline element
    const timelineElement: VisualizationElement = {
      id: 'timeline',
      type: VisualizationElementType.TRANSCRIPT_SEGMENT,
      label: 'Sentiment Timeline',
      description: 'Timeline of sentiment changes',
      properties: {},
      state: VisualizationElementState.ACTIVE,
      position: { x: 100, y: 50 },
      size: { width: 800, height: 10 },
      color: '#E0E0E0',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    elements.push(timelineElement);
    
    // Calculate time range
    const startTime = sentiments[0].timestamp.getTime();
    const endTime = sentiments[sentiments.length - 1].timestamp.getTime();
    const totalDuration = endTime - startTime;
    const timelineWidth = 800;
    
    // Add sentiment elements
    for (const sentiment of sentiments) {
      const elementId = `sentiment-${sentiment.id}`;
      const element = this.elements.get(elementId);
      
      if (element) {
        // Calculate position along timeline
        const xPosition = 100 + ((sentiment.timestamp.getTime() - startTime) / totalDuration) * timelineWidth;
        
        // Calculate y position based on sentiment value
        // Map -1 to 1 range to 300 to 100 y coordinate (positive at top)
        const yPosition = 200 - (sentiment.sentiment * 100);
        
        element.position = { x: xPosition, y: yPosition };
        elements.push(element);
        
        // Connect to speaker
        connections.push({
          id: `sentiment-speaker-${sentiment.id}`,
          type: VisualizationConnectionType.RELATION,
          sourceId: elementId,
          targetId: `speaker-${sentiment.speakerId}`,
          label: '',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // Connect to topic if present
        if (sentiment.topicId) {
          connections.push({
            id: `sentiment-topic-${sentiment.id}`,
            type: VisualizationConnectionType.RELATION,
            sourceId: elementId,
            targetId: `topic-${sentiment.topicId}`,
            label: '',
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
        
        // Connect to timeline
        connections.push({
          id: `sentiment-timeline-${sentiment.id}`,
          type: VisualizationConnectionType.RELATION,
          sourceId: 'timeline',
          targetId: elementId,
          label: '',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }
    
    // Connect sequential sentiments from the same speaker
    const speakerSentiments: Record<string, SentimentRecord[]> = {};
    
    for (const sentiment of sentiments) {
      if (!speakerSentiments[sentiment.speakerId]) {
        speakerSentiments[sentiment.speakerId] = [];
      }
      
      speakerSentiments[sentiment.speakerId].push(sentiment);
    }
    
    for (const speakerSentimentList of Object.values(speakerSentiments)) {
      for (let i = 0; i < speakerSentimentList.length - 1; i++) {
        const current = speakerSentimentList[i];
        const next = speakerSentimentList[i + 1];
        
        connections.push({
          id: `sentiment-flow-${current.id}-${next.id}`,
          type: VisualizationConnectionType.DEPENDENCY,
          sourceId: `sentiment-${current.id}`,
          targetId: `sentiment-${next.id}`,
          label: '',
          animated: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }
    
    return {
      id: `sentiment-landscape-${meetingId}`,
      name: `Sentiment Landscape for Meeting ${meetingId}`,
      description: `Visualization of sentiment landscape for meeting ${meetingId}`,
      elements,
      connections,
      layout: 'timeline',
      timestamp: new Date(),
      version: 1,
      metadata: {
        meetingId,
        sentimentCount: sentiments.length,
        speakerCount: speakerIds.size,
        topicCount: topicIds.size,
        timeRange: {
          start: sentiments[0].timestamp,
          end: sentiments[sentiments.length - 1].timestamp
        }
      }
    };
  }

  /**
   * Helper: Calculate volatility of sentiment
   */
  private calculateVolatility(sentiments: SentimentRecord[]): number {
    if (sentiments.length < 3) {
      return 0;
    }
    
    let volatility = 0;
    
    for (let i = 1; i < sentiments.length; i++) {
      const change = Math.abs(sentiments[i].sentiment - sentiments[i - 1].sentiment);
      volatility += change;
    }
    
    // Normalize to 0-1 scale (assuming max shift per record is 2)
    return Math.min(1, volatility / ((sentiments.length - 1) * 2));
  }
  
  /**
   * Helper: Check if sentiments show significant variation
   */
  private hasSignificantVariation(sentiments: SentimentRecord[]): boolean {
    if (sentiments.length < 3) {
      return false;
    }
    
    const positiveCount = sentiments.filter(s => s.sentiment > 0.2).length;
    const negativeCount = sentiments.filter(s => s.sentiment < -0.2).length;
    
    // If we have both substantial positive and negative sentiments
    return positiveCount > 0 && negativeCount > 0 && 
           positiveCount / sentiments.length > 0.2 && 
           negativeCount / sentiments.length > 0.2;
  }

  /**
   * Track sentiment evolution by topic
   */
  trackSentimentByTopic(meetingId: string): Record<string, {
    averageSentiment: number;
    sentimentTrend: Array<{ timestamp: Date; sentiment: number }>;
    emotionalTone: Record<string, number>;
  }> {
    const sentimentIds = this.meetingSentiments.get(meetingId) || new Set<string>();
    
    if (sentimentIds.size === 0) {
      return {};
    }
    
    // Get all sentiments
    const sentiments = Array.from(sentimentIds)
      .map(id => this.sentiments.get(id))
      .filter(Boolean) as SentimentRecord[];
    
    // Group by topic
    const topicSentiments: Record<string, SentimentRecord[]> = {};
    
    for (const sentiment of sentiments) {
      const topicId = sentiment.topicId || 'unclassified';
      
      if (!topicSentiments[topicId]) {
        topicSentiments[topicId] = [];
      }
      
      topicSentiments[topicId].push(sentiment);
    }
    
    // Calculate metrics for each topic
    const result: Record<string, {
      averageSentiment: number;
      sentimentTrend: Array<{ timestamp: Date; sentiment: number }>;
      emotionalTone: Record<string, number>;
    }> = {};
    
    for (const [topicId, topicSentimentList] of Object.entries(topicSentiments)) {
      // Sort by timestamp
      topicSentimentList.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Calculate average sentiment
      const sentimentSum = topicSentimentList.reduce(
        (sum, record) => sum + record.sentiment, 0
      );
      const averageSentiment = sentimentSum / topicSentimentList.length;
      
      // Build sentiment trend
      const sentimentTrend = topicSentimentList.map(record => ({
        timestamp: record.timestamp,
        sentiment: record.sentiment
      }));
      
      // Count emotions
      const emotionCounts: Record<string, number> = {};
      
      for (const record of topicSentimentList) {
        if (record.emotions) {
          for (const emotion of record.emotions) {
            emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
          }
        }
      }
      
      // Normalize emotion counts to percentages
      const emotionalTone: Record<string, number> = {};
      const totalEmotions = Object.values(emotionCounts).reduce((sum, count) => sum + count, 0);
      
      if (totalEmotions > 0) {
        for (const [emotion, count] of Object.entries(emotionCounts)) {
          emotionalTone[emotion] = count / totalEmotions;
        }
      }
      
      result[topicId] = {
        averageSentiment,
        sentimentTrend,
        emotionalTone
      };
    }
    
    return result;
  }

  /**
   * Analyze sentiment by speaker
   */
  analyzeSentimentBySpeaker(meetingId: string): Record<string, {
    averageSentiment: number;
    sentimentVolatility: number;
    dominantEmotions: string[];
    sentimentDistribution: {
      positive: number;
      neutral: number;
      negative: number;
    };
  }> {
    const sentimentIds = this.meetingSentiments.get(meetingId) || new Set<string>();
    
    if (sentimentIds.size === 0) {
      return {};
    }
    
    // Get all sentiments
    const sentiments = Array.from(sentimentIds)
      .map(id => this.sentiments.get(id))
      .filter(Boolean) as SentimentRecord[];
    
    // Group by speaker
    const speakerSentiments: Record<string, SentimentRecord[]> = {};
    
    for (const sentiment of sentiments) {
      if (!speakerSentiments[sentiment.speakerId]) {
        speakerSentiments[sentiment.speakerId] = [];
      }
      
      speakerSentiments[sentiment.speakerId].push(sentiment);
    }
    
    // Calculate metrics for each speaker
    const result: Record<string, {
      averageSentiment: number;
      sentimentVolatility: number;
      dominantEmotions: string[];
      sentimentDistribution: {
        positive: number;
        neutral: number;
        negative: number;
      };
    }> = {};
    
    for (const [speakerId, speakerSentimentList] of Object.entries(speakerSentiments)) {
      // Sort by timestamp
      speakerSentimentList.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Calculate average sentiment
      const sentimentSum = speakerSentimentList.reduce(
        (sum, record) => sum + record.sentiment, 0
      );
      const averageSentiment = sentimentSum / speakerSentimentList.length;
      
      // Calculate sentiment volatility (standard deviation)
      const squaredDifferences = speakerSentimentList.map(
        record => Math.pow(record.sentiment - averageSentiment, 2)
      );
      const variance = squaredDifferences.reduce((sum, diff) => sum + diff, 0) / 
        speakerSentimentList.length;
      const sentimentVolatility = Math.sqrt(variance);
      
      // Count emotions
      const emotionCounts: Record<string, number> = {};
      
      for (const record of speakerSentimentList) {
        if (record.emotions) {
          for (const emotion of record.emotions) {
            emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
          }
        }
      }
      
      // Get dominant emotions (top 3)
      const dominantEmotions = Object.entries(emotionCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([emotion]) => emotion);
      
      // Calculate sentiment distribution
      let positive = 0, neutral = 0, negative = 0;
      
      for (const record of speakerSentimentList) {
        if (record.sentiment > 0.2) {
          positive++;
        } else if (record.sentiment < -0.2) {
          negative++;
        } else {
          neutral++;
        }
      }
      
      const total = speakerSentimentList.length;
      
      result[speakerId] = {
        averageSentiment,
        sentimentVolatility,
        dominantEmotions,
        sentimentDistribution: {
          positive: positive / total,
          neutral: neutral / total,
          negative: negative / total
        }
      };
    }
    
    return result;
  }

  /**
   * Detect sentiment turning points
   */
  detectSentimentTurningPoints(meetingId: string): Array<{
    timestamp: Date;
    speakerId: string;
    previousSentiment: number;
    newSentiment: number;
    content: string;
    significance: number;
  }> {
    const sentimentIds = this.meetingSentiments.get(meetingId) || new Set<string>();
    
    if (sentimentIds.size === 0) {
      return [];
    }
    
    // Get all sentiments
    const sentiments = Array.from(sentimentIds)
      .map(id => this.sentiments.get(id))
      .filter(Boolean) as SentimentRecord[];
    
    // Group by speaker
    const speakerSentiments: Record<string, SentimentRecord[]> = {};
    
    for (const sentiment of sentiments) {
      if (!speakerSentiments[sentiment.speakerId]) {
        speakerSentiments[sentiment.speakerId] = [];
      }
      
      speakerSentiments[sentiment.speakerId].push(sentiment);
    }
    
    // Find turning points for each speaker
    const turningPoints: Array<{
      timestamp: Date;
      speakerId: string;
      previousSentiment: number;
      newSentiment: number;
      content: string;
      significance: number;
    }> = [];
    
    for (const [speakerId, speakerSentimentList] of Object.entries(speakerSentiments)) {
      // Need at least two points for a turning point
      if (speakerSentimentList.length < 2) {
        continue;
      }
      
      // Sort by timestamp
      speakerSentimentList.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      // Find significant changes in sentiment
      for (let i = 1; i < speakerSentimentList.length; i++) {
        const previous = speakerSentimentList[i - 1];
        const current = speakerSentimentList[i];
        
        // Calculate sentiment change
        const sentimentChange = current.sentiment - previous.sentiment;
        
        // Check if this is a significant turning point
        // Significant if change is greater than 0.4 (40% change on -1 to 1 scale)
        if (Math.abs(sentimentChange) >= 0.4) {
          // Calculate significance based on magnitude and intensity
          const significance = Math.abs(sentimentChange) * current.intensity;
          
          turningPoints.push({
            timestamp: current.timestamp,
            speakerId,
            previousSentiment: previous.sentiment,
            newSentiment: current.sentiment,
            content: current.content,
            significance
          });
        }
      }
    }
    
    // Sort by significance
    turningPoints.sort((a, b) => b.significance - a.significance);
    
    return turningPoints;
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
   * Helper: Create sentiment element
   */
  private createSentimentElement(sentimentId: string, sentiment: SentimentRecord): void {
    const elementId = `sentiment-${sentimentId}`;
    
    // Create element
    const element: VisualizationElement = {
      id: elementId,
      type: VisualizationElementType.SENTIMENT,
      label: this.getSentimentLabel(sentiment.sentiment),
      description: sentiment.content,
      properties: {
        speakerId: sentiment.speakerId,
        timestamp: sentiment.timestamp,
        sentiment: sentiment.sentiment,
        intensity: sentiment.intensity,
        emotions: sentiment.emotions,
        topicId: sentiment.topicId
      },
      state: VisualizationElementState.ACTIVE,
      size: {
        width: 30 + (sentiment.intensity * 20),
        height: 30 + (sentiment.intensity * 20)
      },
      color: this.getSentimentColor(sentiment.sentiment),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.elements.set(elementId, element);
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
   * Helper: Get sentiment color
   */
  private getSentimentColor(sentiment: number): string {
    if (sentiment < -0.6) {
      return '#D32F2F'; // Dark Red
    } else if (sentiment < -0.2) {
      return '#F44336'; // Red
    } else if (sentiment < 0.2) {
      return '#9E9E9E'; // Grey
    } else if (sentiment < 0.6) {
      return '#4CAF50'; // Green
    } else {
      return '#2E7D32'; // Dark Green
    }
  }

  /**
   * Helper: Get sentiment label
   */
  private getSentimentLabel(sentiment: number): string {
    if (sentiment < -0.6) {
      return 'Very Negative';
    } else if (sentiment < -0.2) {
      return 'Negative';
    } else if (sentiment < 0.2) {
      return 'Neutral';
    } else if (sentiment < 0.6) {
      return 'Positive';
    } else {
      return 'Very Positive';
    }
  }
} 