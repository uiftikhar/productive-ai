/**
 * Conversation Analytics Service
 * 
 * Provides analytics capabilities for conversation data, including:
 * - Usage statistics and trends
 * - Topic analysis and topic distribution
 * - Sentiment analysis and emotional trends
 * - Agent performance metrics
 * - Conversation quality metrics
 */

import { Logger } from '../../logger/logger.interface';
import { ConversationContextService } from '../user-context/conversation-context.service';
import { PineconeConnectionService } from '../../../pinecone/pinecone-connection.service';
import { ConsoleLogger } from '../../logger/console-logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Conversation analytics configuration
 */
export interface ConversationAnalyticsConfig {
  enableSentimentAnalysis?: boolean;
  enableTopicAnalysis?: boolean;
  enableAgentPerformanceMetrics?: boolean;
  enableUsageStatistics?: boolean;
  enableResponseTimeAnalysis?: boolean;
  enableConversationQualityMetrics?: boolean;
  analysisTimePeriod?: {
    days?: number;
    hours?: number;
    minutes?: number;
  };
  cacheExpirationMs?: number;
}

/**
 * Statistics for a specific timeframe
 */
export interface TimeframeStatistics {
  startTime: number;
  endTime: number;
  totalConversations: number;
  totalTurns: number;
  totalUsers: number;
  avgTurnsPerConversation: number;
  avgResponseTime: number | null;
  avgMessagesPerUser: number;
  turnsByRole: {
    user: number;
    assistant: number;
    system: number;
  };
}

/**
 * Result of a topic analysis
 */
export interface TopicAnalysisResult {
  topicDistribution: Array<{
    topic: string;
    percentage: number;
    count: number;
  }>;
  topicTrends: Array<{
    topic: string;
    timePoints: Array<{
      time: number;
      count: number;
    }>;
  }>;
  relatedTopics: Record<string, string[]>;
}

/**
 * Result of sentiment analysis
 */
export interface SentimentAnalysisResult {
  overallSentiment: number; // -1 to 1, where -1 is negative, 0 is neutral, 1 is positive
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  sentimentTrend: Array<{
    time: number;
    sentiment: number;
  }>;
}

/**
 * Agent performance metrics
 */
export interface AgentPerformanceMetrics {
  overall: {
    avgResponseTime: number;
    avgTurnsPerResolution: number;
    successRate: number;
    userSatisfactionScore: number | null;
  };
  byAgent: Record<
    string,
    {
      agentId: string;
      agentName: string;
      responseCount: number;
      avgResponseTime: number;
      successRate: number;
      userSatisfactionScore: number | null;
      topCapabilities: Array<{
        capability: string;
        usageCount: number;
        successRate: number;
      }>;
    }
  >;
  trends: {
    daily: Array<{
      date: string;
      avgResponseTime: number;
      successRate: number;
    }>;
    weekly: Array<{
      weekStart: string;
      avgResponseTime: number;
      successRate: number;
    }>;
  };
}

/**
 * Conversation quality metrics
 */
export interface ConversationQualityMetrics {
  coherenceScore: number;
  completenessScore: number;
  resolutionRate: number;
  avgUserSatisfaction: number | null;
  avgTurnsToResolution: number;
  abandonmentRate: number;
  followUpRate: number;
}

/**
 * Usage statistics and trends
 */
export interface UsageStatistics {
  overall: TimeframeStatistics;
  byPeriod: {
    daily: TimeframeStatistics[];
    weekly: TimeframeStatistics[];
    monthly: TimeframeStatistics[];
  };
  byUser: Record<
    string,
    {
      userId: string;
      conversationCount: number;
      totalTurns: number;
      avgTurnsPerConversation: number;
      firstSeen: number;
      lastSeen: number;
      activeHours: number[];
    }
  >;
  activeUsers: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

/**
 * Segment analytics
 */
export interface SegmentAnalytics {
  segmentDistribution: Array<{
    segmentTopic: string;
    count: number;
    percentage: number;
  }>;
  avgSegmentsPerConversation: number;
  avgTurnsPerSegment: number;
  topSegmentTransitions: Array<{
    fromSegment: string;
    toSegment: string;
    count: number;
  }>;
}

/**
 * Comprehensive analytics result
 */
export interface ConversationAnalyticsResult {
  id: string;
  timestamp: number;
  timeframe: {
    start: number;
    end: number;
  };
  usageStatistics?: UsageStatistics;
  topicAnalysis?: TopicAnalysisResult;
  sentimentAnalysis?: SentimentAnalysisResult;
  agentPerformance?: AgentPerformanceMetrics;
  qualityMetrics?: ConversationQualityMetrics;
  segmentAnalytics?: SegmentAnalytics;
}

/**
 * Service for analyzing conversation data
 */
export class ConversationAnalyticsService {
  private logger: Logger;
  private conversationService: ConversationContextService;
  private config: Required<ConversationAnalyticsConfig>;
  private analysisCacheKey = 'conversation-analytics';
  private analysisCache: Map<string, { result: ConversationAnalyticsResult; timestamp: number }> = new Map();

  constructor(
    options: {
      conversationService?: ConversationContextService;
      pineconeService?: PineconeConnectionService;
      logger?: Logger;
      config?: ConversationAnalyticsConfig;
    } = {}
  ) {
    this.logger = options.logger || new ConsoleLogger();
    
    // Create conversation service if not provided
    if (options.conversationService) {
      this.conversationService = options.conversationService;
    } else {
      this.conversationService = new ConversationContextService({
        pineconeService: options.pineconeService,
        logger: this.logger,
      });
    }

    // Set default configuration with sensible defaults
    this.config = {
      enableSentimentAnalysis: options.config?.enableSentimentAnalysis ?? true,
      enableTopicAnalysis: options.config?.enableTopicAnalysis ?? true,
      enableAgentPerformanceMetrics: options.config?.enableAgentPerformanceMetrics ?? true,
      enableUsageStatistics: options.config?.enableUsageStatistics ?? true,
      enableResponseTimeAnalysis: options.config?.enableResponseTimeAnalysis ?? true,
      enableConversationQualityMetrics: options.config?.enableConversationQualityMetrics ?? true,
      analysisTimePeriod: {
        days: options.config?.analysisTimePeriod?.days ?? 30,
        hours: options.config?.analysisTimePeriod?.hours ?? 0,
        minutes: options.config?.analysisTimePeriod?.minutes ?? 0,
      },
      cacheExpirationMs: options.config?.cacheExpirationMs ?? 15 * 60 * 1000, // 15 minutes by default
    };
  }

  /**
   * Generate comprehensive analytics for a user's conversations
   * 
   * @param userId User identifier
   * @param options Analytics options
   * @returns Comprehensive analytics result
   */
  async generateAnalytics(
    userId: string,
    options: {
      forceRefresh?: boolean;
      timeframe?: {
        startTime?: number;
        endTime?: number;
      };
      includeUsageStatistics?: boolean;
      includeTopicAnalysis?: boolean;
      includeSentimentAnalysis?: boolean;
      includeAgentPerformance?: boolean;
      includeQualityMetrics?: boolean;
      includeSegmentAnalytics?: boolean;
    } = {}
  ): Promise<ConversationAnalyticsResult> {
    const cacheKey = `${userId}-${JSON.stringify(options)}`;
    
    // Check cache first if not forcing refresh
    if (!options.forceRefresh) {
      const cached = this.analysisCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cacheExpirationMs) {
        this.logger.debug('Returning cached analytics result', { userId });
        return cached.result;
      }
    }

    // Calculate timeframe
    const endTime = options.timeframe?.endTime || Date.now();
    const startTime = options.timeframe?.startTime || this.calculateStartTime(endTime);

    // Initialize result structure
    const result: ConversationAnalyticsResult = {
      id: uuidv4(),
      timestamp: Date.now(),
      timeframe: {
        start: startTime,
        end: endTime,
      },
    };

    try {
      // Get all user conversations within timeframe
      const conversations = await this.conversationService.listUserConversations(userId);
      
      // Filter by timeframe
      const filteredConversations = conversations.filter(
        (conv) => conv.lastTimestamp >= startTime && conv.firstTimestamp <= endTime
      );

      // Run enabled analytics
      if (
        (options.includeUsageStatistics !== false && this.config.enableUsageStatistics) || 
        options.includeUsageStatistics === true
      ) {
        result.usageStatistics = await this.calculateUsageStatistics(userId, filteredConversations, startTime, endTime);
      }

      if (
        (options.includeTopicAnalysis !== false && this.config.enableTopicAnalysis) || 
        options.includeTopicAnalysis === true
      ) {
        result.topicAnalysis = await this.performTopicAnalysis(userId, filteredConversations);
      }

      if (
        (options.includeSentimentAnalysis !== false && this.config.enableSentimentAnalysis) || 
        options.includeSentimentAnalysis === true
      ) {
        result.sentimentAnalysis = await this.performSentimentAnalysis(userId, filteredConversations);
      }

      if (
        (options.includeAgentPerformance !== false && this.config.enableAgentPerformanceMetrics) || 
        options.includeAgentPerformance === true
      ) {
        result.agentPerformance = await this.calculateAgentPerformanceMetrics(userId, filteredConversations);
      }

      if (
        (options.includeQualityMetrics !== false && this.config.enableConversationQualityMetrics) || 
        options.includeQualityMetrics === true
      ) {
        result.qualityMetrics = await this.calculateQualityMetrics(userId, filteredConversations);
      }

      if (
        options.includeSegmentAnalytics !== false
      ) {
        result.segmentAnalytics = await this.calculateSegmentAnalytics(userId, filteredConversations);
      }

      // Store in cache
      this.analysisCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      this.logger.error('Error generating conversation analytics', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Calculate usage statistics for conversations
   * @private
   */
  private async calculateUsageStatistics(
    userId: string,
    conversations: any[],
    startTime: number,
    endTime: number
  ): Promise<UsageStatistics> {
    this.logger.debug('Calculating usage statistics', { userId });
    
    // Placeholder implementation - would be more sophisticated in production
    const totalConversations = conversations.length;
    const totalTurns = conversations.reduce((sum, conv) => sum + (conv.turnCount || 0), 0);
    
    // Simplified statistics for demonstration purposes
    return {
      overall: {
        startTime,
        endTime,
        totalConversations,
        totalTurns,
        totalUsers: 1, // Just one user in this context
        avgTurnsPerConversation: totalConversations > 0 ? totalTurns / totalConversations : 0,
        avgResponseTime: null, // Would require message-level analysis
        avgMessagesPerUser: totalTurns,
        turnsByRole: {
          user: Math.round(totalTurns / 2), // Rough estimate
          assistant: Math.round(totalTurns / 2), // Rough estimate
          system: 0,
        },
      },
      byPeriod: {
        daily: [], // Would calculate daily statistics
        weekly: [], // Would calculate weekly statistics
        monthly: [], // Would calculate monthly statistics
      },
      byUser: {
        [userId]: {
          userId,
          conversationCount: totalConversations,
          totalTurns,
          avgTurnsPerConversation: totalConversations > 0 ? totalTurns / totalConversations : 0,
          firstSeen: conversations.length > 0 ? Math.min(...conversations.map(c => c.firstTimestamp)) : Date.now(),
          lastSeen: conversations.length > 0 ? Math.max(...conversations.map(c => c.lastTimestamp)) : Date.now(),
          activeHours: [], // Would analyze active hours
        },
      },
      activeUsers: {
        daily: 1,
        weekly: 1,
        monthly: 1,
      },
    };
  }

  /**
   * Perform topic analysis on conversations
   * @private
   */
  private async performTopicAnalysis(
    userId: string,
    conversations: any[]
  ): Promise<TopicAnalysisResult> {
    this.logger.debug('Performing topic analysis', { userId });
    
    // Get segment data from conversations
    const segmentCounts: Record<string, number> = {};
    
    // Count segments by topic
    for (const conversation of conversations) {
      if (conversation.segments && conversation.segments > 0) {
        // Get segments for this conversation
        const segments = await this.conversationService.getConversationSegments(
          userId,
          conversation.conversationId
        );
        
        // Count by topic
        for (const segment of segments) {
          const topic = segment.segmentTopic || 'Unlabeled';
          segmentCounts[topic] = (segmentCounts[topic] || 0) + 1;
        }
      }
    }
    
    // Convert to distribution
    const totalSegments = Object.values(segmentCounts).reduce((sum, count) => sum + count, 0);
    const topicDistribution = Object.entries(segmentCounts).map(([topic, count]) => ({
      topic,
      count,
      percentage: totalSegments > 0 ? (count / totalSegments) * 100 : 0,
    })).sort((a, b) => b.count - a.count);
    
    // Simple placeholder implementation - would be more sophisticated in production
    return {
      topicDistribution,
      topicTrends: [], // Would analyze topic trends over time
      relatedTopics: {}, // Would analyze related topics
    };
  }

  /**
   * Perform sentiment analysis on conversations
   * @private
   */
  private async performSentimentAnalysis(
    userId: string,
    conversations: any[]
  ): Promise<SentimentAnalysisResult> {
    this.logger.debug('Performing sentiment analysis', { userId });
    
    // Placeholder implementation - in a real system this would use a sentiment analysis model
    return {
      overallSentiment: 0.2, // Slightly positive sentiment
      sentimentDistribution: {
        positive: 0.4, // 40% positive
        neutral: 0.4, // 40% neutral
        negative: 0.2, // 20% negative
      },
      sentimentTrend: [], // Would track sentiment over time
    };
  }

  /**
   * Calculate agent performance metrics
   * @private
   */
  private async calculateAgentPerformanceMetrics(
    userId: string,
    conversations: any[]
  ): Promise<AgentPerformanceMetrics> {
    this.logger.debug('Calculating agent performance metrics', { userId });
    
    // Extract unique agent IDs
    const agentMap: Record<string, { 
      agentId: string, 
      agentName: string,
      responseCount: number,
      // Other metrics would be calculated from actual data
    }> = {};
    
    // Process agent IDs from conversations
    for (const conversation of conversations) {
      if (conversation.agentIds && conversation.agentIds.length > 0) {
        for (const agentId of conversation.agentIds) {
          if (!agentMap[agentId]) {
            agentMap[agentId] = {
              agentId,
              agentName: `Agent ${agentId.substring(0, 8)}`, // Would get real agent name
              responseCount: 0,
            };
          }
          
          // Increment response count - this is a simplification
          agentMap[agentId].responseCount += 1;
        }
      }
    }
    
    // Simplified metrics - would be more sophisticated in production
    return {
      overall: {
        avgResponseTime: 2.5, // In seconds - placeholder value
        avgTurnsPerResolution: 6.2, // Placeholder value
        successRate: 0.85, // 85% success rate - placeholder value
        userSatisfactionScore: 4.2, // On scale of 1-5 - placeholder value
      },
      byAgent: Object.fromEntries(
        Object.entries(agentMap).map(([agentId, data]) => [
          agentId,
          {
            ...data,
            avgResponseTime: 2.2, // Placeholder value
            successRate: 0.88, // Placeholder value
            userSatisfactionScore: 4.3, // Placeholder value
            topCapabilities: [], // Would analyze top capabilities
          },
        ])
      ),
      trends: {
        daily: [], // Would analyze daily trends
        weekly: [], // Would analyze weekly trends
      },
    };
  }

  /**
   * Calculate conversation quality metrics
   * @private
   */
  private async calculateQualityMetrics(
    userId: string,
    conversations: any[]
  ): Promise<ConversationQualityMetrics> {
    this.logger.debug('Calculating conversation quality metrics', { userId });
    
    // Placeholder implementation - would be more sophisticated in production
    return {
      coherenceScore: 0.85, // 85% coherence - placeholder value
      completenessScore: 0.92, // 92% completeness - placeholder value
      resolutionRate: 0.78, // 78% resolution rate - placeholder value
      avgUserSatisfaction: 4.1, // On scale of 1-5 - placeholder value
      avgTurnsToResolution: 7.3, // Placeholder value
      abandonmentRate: 0.15, // 15% abandonment rate - placeholder value
      followUpRate: 0.22, // 22% follow-up rate - placeholder value
    };
  }

  /**
   * Calculate segment analytics
   * @private
   */
  private async calculateSegmentAnalytics(
    userId: string,
    conversations: any[]
  ): Promise<SegmentAnalytics> {
    this.logger.debug('Calculating segment analytics', { userId });
    
    // Get all segments for all conversations
    const allSegments: any[] = [];
    
    for (const conversation of conversations) {
      if (conversation.segments && conversation.segments > 0) {
        const segments = await this.conversationService.getConversationSegments(
          userId,
          conversation.conversationId
        );
        allSegments.push(...segments);
      }
    }
    
    // Count segments by topic
    const topicCounts: Record<string, number> = {};
    for (const segment of allSegments) {
      const topic = segment.segmentTopic || 'Unlabeled';
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    }
    
    // Calculate distribution
    const totalSegments = allSegments.length;
    const segmentDistribution = Object.entries(topicCounts).map(([topic, count]) => ({
      segmentTopic: topic,
      count,
      percentage: totalSegments > 0 ? (count / totalSegments) * 100 : 0,
    })).sort((a, b) => b.count - a.count);
    
    // Calculate average segments per conversation
    const avgSegmentsPerConversation = conversations.length > 0 ? 
      totalSegments / conversations.length : 0;
    
    // Calculate average turns per segment
    const totalTurns = conversations.reduce((sum, conv) => sum + (conv.turnCount || 0), 0);
    const avgTurnsPerSegment = totalSegments > 0 ? totalTurns / totalSegments : 0;
    
    return {
      segmentDistribution,
      avgSegmentsPerConversation,
      avgTurnsPerSegment,
      topSegmentTransitions: [], // Would analyze segment transitions
    };
  }

  /**
   * Calculate start time based on the configured analysis period
   * @private
   */
  private calculateStartTime(endTime: number): number {
    const { days = 0, hours = 0, minutes = 0 } = this.config.analysisTimePeriod;
    const totalMilliseconds = 
      (days * 24 * 60 * 60 * 1000) + 
      (hours * 60 * 60 * 1000) + 
      (minutes * 60 * 1000);
    
    return endTime - totalMilliseconds;
  }
} 