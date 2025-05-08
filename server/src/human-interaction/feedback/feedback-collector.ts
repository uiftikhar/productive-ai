/**
 * Feedback Collector Service Implementation
 * Part of Milestone 2.3: Human-in-the-Loop Integration
 */
import { v4 as uuidv4 } from 'uuid';
import {
  FeedbackCollectorService,
  FeedbackAnalyzerService,
  Feedback,
  FeedbackEvent,
  FeedbackType,
  FeedbackSource,
  FeedbackRatingScale,
  FeedbackQuestion,
  FeedbackAnalysis,
  FeedbackCollectionConfig
} from '../interfaces/feedback.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Implementation of the feedback collector service
 */
export class FeedbackCollectorServiceImpl implements FeedbackCollectorService {
  private feedback: Map<string, Feedback> = new Map();
  private feedbackRequests: Map<string, {
    userId: string;
    type?: FeedbackType;
    questions?: FeedbackQuestion[];
    context?: any;
    createdAt: Date;
  }> = new Map();
  private eventSubscriptions: Map<string, (event: FeedbackEvent) => void> = new Map();
  private logger: Logger;
  private config: FeedbackCollectionConfig;
  
  /**
   * Create a new feedback collector service
   */
  constructor(config: FeedbackCollectionConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || new ConsoleLogger();
    
    this.logger.info('Feedback collector service initialized', {
      enabledTypes: config.enabledTypes,
      ratingScale: config.defaultRatingScale
    });
  }
  
  /**
   * Collect feedback from user
   */
  async collectFeedback(feedback: Omit<Feedback, 'id' | 'createdAt'>): Promise<Feedback> {
    // Validate feedback type is enabled
    if (!this.config.enabledTypes.includes(feedback.type)) {
      throw new Error(`Feedback type ${feedback.type} is not enabled`);
    }
    
    const id = uuidv4();
    const now = new Date();
    
    // Create full feedback object
    const fullFeedback: Feedback = {
      id,
      createdAt: now,
      ...feedback,
      // Set default rating scale if not provided
      ratingScale: feedback.ratingScale || this.config.defaultRatingScale
    };
    
    // Store the feedback
    this.feedback.set(id, fullFeedback);
    
    // Emit feedback received event
    this.emitEvent({
      type: 'feedback_received',
      timestamp: now,
      feedbackId: id,
      feedback: fullFeedback,
      userId: fullFeedback.userId,
      agentId: fullFeedback.agentId
    });
    
    this.logger.info(`Collected feedback: ${id}`, {
      type: fullFeedback.type,
      source: fullFeedback.source,
      userId: fullFeedback.userId,
      agentId: fullFeedback.agentId,
      rating: fullFeedback.rating
    });
    
    return fullFeedback;
  }
  
  /**
   * Get feedback by ID
   */
  async getFeedback(id: string): Promise<Feedback | null> {
    return this.feedback.get(id) || null;
  }
  
  /**
   * Get all feedback for a user
   */
  async getUserFeedback(userId: string, limit?: number): Promise<Feedback[]> {
    const userFeedback = Array.from(this.feedback.values())
      .filter(feedback => feedback.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    if (limit !== undefined && limit > 0) {
      return userFeedback.slice(0, limit);
    }
    
    return userFeedback;
  }
  
  /**
   * Get all feedback for an agent
   */
  async getAgentFeedback(agentId: string, limit?: number): Promise<Feedback[]> {
    const agentFeedback = Array.from(this.feedback.values())
      .filter(feedback => feedback.agentId === agentId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    if (limit !== undefined && limit > 0) {
      return agentFeedback.slice(0, limit);
    }
    
    return agentFeedback;
  }
  
  /**
   * Get all feedback for a session
   */
  async getSessionFeedback(sessionId: string): Promise<Feedback[]> {
    return Array.from(this.feedback.values())
      .filter(feedback => feedback.sessionId === sessionId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  /**
   * Request feedback from user
   */
  async requestFeedback(userId: string, options: {
    type?: FeedbackType;
    questions?: FeedbackQuestion[];
    context?: any;
  } = {}): Promise<string> {
    const requestId = uuidv4();
    
    // Store the feedback request
    this.feedbackRequests.set(requestId, {
      userId,
      ...options,
      createdAt: new Date()
    });
    
    // Emit feedback requested event
    this.emitEvent({
      type: 'feedback_requested',
      timestamp: new Date(),
      userId,
      metadata: {
        requestId,
        type: options.type,
        questionCount: options.questions?.length || 0
      }
    });
    
    this.logger.info(`Requested feedback from user: ${userId}`, {
      requestId,
      type: options.type,
      questionCount: options.questions?.length || 0
    });
    
    return requestId;
  }
  
  /**
   * Subscribe to feedback events
   */
  subscribeToEvents(callback: (event: FeedbackEvent) => void): string {
    const subscriptionId = uuidv4();
    this.eventSubscriptions.set(subscriptionId, callback);
    return subscriptionId;
  }
  
  /**
   * Unsubscribe from feedback events
   */
  unsubscribeFromEvents(subscriptionId: string): boolean {
    return this.eventSubscriptions.delete(subscriptionId);
  }
  
  /**
   * Emit a feedback event to all subscribers
   */
  private emitEvent(event: FeedbackEvent): void {
    for (const callback of this.eventSubscriptions.values()) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error('Error in feedback event subscriber', { error });
      }
    }
  }
}

/**
 * Implementation of feedback analyzer service
 */
export class FeedbackAnalyzerServiceImpl implements FeedbackAnalyzerService {
  private collector: FeedbackCollectorService;
  private analysisCache: Map<string, { analysis: FeedbackAnalysis; timestamp: number }> = new Map();
  private logger: Logger;
  
  /**
   * Create a new feedback analyzer service
   */
  constructor(collector: FeedbackCollectorService, logger?: Logger) {
    this.collector = collector;
    this.logger = logger || new ConsoleLogger();
    
    this.logger.info('Feedback analyzer service initialized');
  }
  
  /**
   * Analyze feedback
   */
  async analyzeFeedback(feedback: Feedback[]): Promise<FeedbackAnalysis> {
    if (feedback.length === 0) {
      return {
        totalFeedbackCount: 0
      };
    }
    
    // Calculate basic metrics
    const totalCount = feedback.length;
    
    // Calculate average rating
    const ratingFeedback = feedback.filter(f => f.rating !== undefined);
    const averageRating = ratingFeedback.length > 0 
      ? ratingFeedback.reduce((sum, f) => sum + (f.rating || 0), 0) / ratingFeedback.length
      : undefined;
    
    // Calculate rating distribution
    const ratingDistribution: Record<number, number> = {};
    for (const item of ratingFeedback) {
      if (item.rating !== undefined) {
        ratingDistribution[item.rating] = (ratingDistribution[item.rating] || 0) + 1;
      }
    }
    
    // Get categories
    const categoryCount: Record<string, number> = {};
    for (const item of feedback) {
      if (item.category) {
        for (const category of item.category) {
          categoryCount[category] = (categoryCount[category] || 0) + 1;
        }
      }
    }
    
    // Sort categories by count
    const topCategories = Object.entries(categoryCount)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
    
    // Extract common terms from text feedback (simple implementation)
    const commonTerms: Array<{ term: string; count: number }> = this.extractCommonTerms(
      feedback.filter(f => f.text).map(f => f.text || '')
    );
    
    // Calculate trends by date
    const feedbackByDate: Record<string, { sum: number; count: number }> = {};
    for (const item of ratingFeedback) {
      const dateKey = item.createdAt.toISOString().split('T')[0];
      if (!feedbackByDate[dateKey]) {
        feedbackByDate[dateKey] = { sum: 0, count: 0 };
      }
      feedbackByDate[dateKey].sum += item.rating || 0;
      feedbackByDate[dateKey].count += 1;
    }
    
    const trendsByDate = Object.entries(feedbackByDate)
      .map(([date, { sum, count }]) => ({
        date,
        averageRating: sum / count,
        count
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Calculate trends by category
    const feedbackByCategory: Record<string, { sum: number; count: number }> = {};
    for (const item of ratingFeedback) {
      if (item.category) {
        for (const category of item.category) {
          if (!feedbackByCategory[category]) {
            feedbackByCategory[category] = { sum: 0, count: 0 };
          }
          feedbackByCategory[category].sum += item.rating || 0;
          feedbackByCategory[category].count += 1;
        }
      }
    }
    
    const trendsByCategory: Record<string, { averageRating: number; count: number }> = {};
    for (const [category, { sum, count }] of Object.entries(feedbackByCategory)) {
      trendsByCategory[category] = {
        averageRating: sum / count,
        count
      };
    }
    
    // Generate some basic insights
    const insights = this.generateInsights(feedback, {
      averageRating,
      topCategories,
      ratingDistribution,
      trendsByDate
    });
    
    // Compile the analysis
    const analysis: FeedbackAnalysis = {
      totalFeedbackCount: totalCount,
      averageRating,
      ratingDistribution,
      topCategories: topCategories.slice(0, 10),
      commonTerms: commonTerms.slice(0, 20),
      trends: {
        byDate: trendsByDate,
        byCategory: trendsByCategory
      },
      insights
    };
    
    this.logger.info('Completed feedback analysis', {
      feedbackCount: totalCount,
      averageRating,
      topCategories: topCategories.slice(0, 3).map(c => c.category),
      insightCount: insights.length
    });
    
    return analysis;
  }
  
  /**
   * Get analysis for a specific agent
   */
  async getAgentAnalysis(agentId: string): Promise<FeedbackAnalysis> {
    // Check cache first
    const cachedAnalysis = this.analysisCache.get(agentId);
    if (cachedAnalysis && Date.now() - cachedAnalysis.timestamp < 3600000) { // 1 hour cache
      return cachedAnalysis.analysis;
    }
    
    // Get all feedback for the agent
    const feedback = await this.collector.getAgentFeedback(agentId);
    
    // Analyze the feedback
    const analysis = await this.analyzeFeedback(feedback);
    
    // Cache the result
    this.analysisCache.set(agentId, {
      analysis,
      timestamp: Date.now()
    });
    
    return analysis;
  }
  
  /**
   * Update expertise based on feedback
   */
  async updateExpertiseFromFeedback(agentId: string, feedback: Feedback[]): Promise<void> {
    // This is a placeholder for actual expertise tracking integration
    // In a real implementation, this would call the expertise tracker service
    
    this.logger.info(`Updating expertise for agent: ${agentId} based on ${feedback.length} feedback items`);
    
    // Example integration point with expertise tracker
    // const expertiseTracker = new ExpertiseTrackerService(...);
    // await expertiseTracker.updateAgentExpertise(agentId, domain, level);
  }
  
  /**
   * Extract actionable insights from feedback
   */
  async extractInsights(feedback: Feedback[]): Promise<string[]> {
    if (feedback.length === 0) {
      return [];
    }
    
    const analysis = await this.analyzeFeedback(feedback);
    return analysis.insights || [];
  }
  
  /**
   * Generate improvement recommendations
   */
  async generateRecommendations(agentId: string): Promise<string[]> {
    // Get agent analysis
    const analysis = await this.getAgentAnalysis(agentId);
    
    // Generate recommendations based on analysis
    const recommendations: string[] = [];
    
    // This is a placeholder for more sophisticated recommendation generation
    // In a real implementation, this might use AI to generate context-aware recommendations
    
    // Example simple recommendations based on ratings
    if (analysis.averageRating !== undefined) {
      if (analysis.averageRating < 0.3 && analysis.totalFeedbackCount > 5) {
        recommendations.push('Critical review needed: Overall satisfaction is very low');
      } else if (analysis.averageRating < 0.6 && analysis.totalFeedbackCount > 5) {
        recommendations.push('Improvement needed: User satisfaction is below target');
      }
    }
    
    // Look at category-specific issues
    if (analysis.trends?.byCategory) {
      for (const [category, data] of Object.entries(analysis.trends.byCategory)) {
        if (data.count >= 3 && data.averageRating < 0.5) {
          recommendations.push(`Improvement needed in ${category}: Average rating ${data.averageRating.toFixed(2)}`);
        }
      }
    }
    
    // Look at trends over time
    if (analysis.trends?.byDate && analysis.trends.byDate.length >= 3) {
      const recentTrends = analysis.trends.byDate.slice(-3);
      if (recentTrends.every((t, i, arr) => i === 0 || t.averageRating < arr[i - 1].averageRating)) {
        recommendations.push('Ratings show a declining trend over the last three periods');
      }
    }
    
    // Add recommendations about common terms if available
    if (analysis.commonTerms && analysis.commonTerms.length > 0) {
      const negativeTerms = analysis.commonTerms.filter(term => 
        ['error', 'slow', 'confusing', 'difficult', 'fail', 'problem'].includes(term.term.toLowerCase())
      );
      
      if (negativeTerms.length > 0) {
        recommendations.push(`Address common user concerns: ${negativeTerms.map(t => t.term).join(', ')}`);
      }
    }
    
    return recommendations;
  }
  
  /**
   * Extract common terms from text feedback
   */
  private extractCommonTerms(texts: string[]): Array<{ term: string; count: number }> {
    if (texts.length === 0) {
      return [];
    }
    
    // Combine all texts
    const combinedText = texts.join(' ').toLowerCase();
    
    // Simple tokenization and stop word removal
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'is', 'are', 'was', 'were', 'be', 'have', 'has', 'had']);
    const words = combinedText.split(/\W+/).filter(word => 
      word.length > 2 && !stopWords.has(word)
    );
    
    // Count word frequency
    const wordCount: Record<string, number> = {};
    for (const word of words) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
    
    // Convert to array and sort by count
    return Object.entries(wordCount)
      .map(([term, count]) => ({ term, count }))
      .sort((a, b) => b.count - a.count);
  }
  
  /**
   * Generate insights from feedback data
   */
  private generateInsights(
    feedback: Feedback[], 
    analysis: {
      averageRating?: number;
      topCategories: Array<{ category: string; count: number }>;
      ratingDistribution: Record<number, number>;
      trendsByDate: Array<{ date: string; averageRating: number; count: number }>;
    }
  ): string[] {
    const insights: string[] = [];
    
    // Overall sentiment insight
    if (analysis.averageRating !== undefined) {
      if (analysis.averageRating > 0.8) {
        insights.push('Users generally express high satisfaction with the service');
      } else if (analysis.averageRating < 0.4) {
        insights.push('Users express significant dissatisfaction that needs addressing');
      }
    }
    
    // Rating polarization
    if (analysis.ratingDistribution && Object.keys(analysis.ratingDistribution).length > 0) {
      const values = Object.values(analysis.ratingDistribution);
      const max = Math.max(...values);
      const min = Math.min(...values);
      
      if (max > min * 3 && feedback.length > 10) {
        insights.push('User ratings show significant polarization - users either love or dislike the service');
      }
    }
    
    // Trending insights
    if (analysis.trendsByDate.length > 3) {
      const recent = analysis.trendsByDate.slice(-3);
      const older = analysis.trendsByDate.slice(-6, -3);
      
      if (recent.length === 3 && older.length === 3) {
        const recentAvg = recent.reduce((sum, item) => sum + item.averageRating, 0) / 3;
        const olderAvg = older.reduce((sum, item) => sum + item.averageRating, 0) / 3;
        
        if (recentAvg > olderAvg + 0.1) {
          insights.push('User satisfaction has been improving in recent periods');
        } else if (recentAvg < olderAvg - 0.1) {
          insights.push('User satisfaction has been declining in recent periods');
        }
      }
    }
    
    // Category-based insights
    if (analysis.topCategories.length > 0) {
      const topCategory = analysis.topCategories[0];
      if (topCategory.count > feedback.length * 0.3) {
        insights.push(`Category "${topCategory.category}" appears in ${Math.round(topCategory.count / feedback.length * 100)}% of feedback and should be a focus area`);
      }
    }
    
    // Text-based insights (simple implementation)
    const textFeedback = feedback.filter(f => f.text && f.text.length > 0);
    if (textFeedback.length > 0) {
      // Check for common pain points
      const painPoints = this.identifyCommonPainPoints(textFeedback.map(f => f.text || ''));
      if (painPoints.length > 0) {
        insights.push(`Common user pain points: ${painPoints.join(', ')}`);
      }
      
      // Check for feature requests
      const featureRequests = this.identifyFeatureRequests(textFeedback.map(f => f.text || ''));
      if (featureRequests.length > 0) {
        insights.push(`Users frequently request: ${featureRequests.join(', ')}`);
      }
    }
    
    return insights;
  }
  
  /**
   * Identify common pain points from text feedback
   */
  private identifyCommonPainPoints(texts: string[]): string[] {
    // This is a placeholder for more advanced text analysis
    // In a real implementation, this might use NLP or AI to extract pain points
    
    const painPointPatterns = [
      { pattern: /slow|laggy|performance/i, label: 'Performance issues' },
      { pattern: /crash|error|fail/i, label: 'Stability problems' },
      { pattern: /confusing|unclear|hard to understand/i, label: 'Usability concerns' },
      { pattern: /expensive|price|cost/i, label: 'Pricing concerns' }
    ];
    
    const foundPainPoints = new Set<string>();
    
    for (const text of texts) {
      for (const { pattern, label } of painPointPatterns) {
        if (pattern.test(text)) {
          foundPainPoints.add(label);
        }
      }
    }
    
    return Array.from(foundPainPoints);
  }
  
  /**
   * Identify feature requests from text feedback
   */
  private identifyFeatureRequests(texts: string[]): string[] {
    // This is a placeholder for more advanced text analysis
    // In a real implementation, this might use NLP or AI to extract feature requests
    
    const requestPatterns = [
      { pattern: /wish|would like|should have|need\s+to\s+add/i, label: 'General feature requests' },
      { pattern: /integrate|connection|connect with/i, label: 'Integration requests' },
      { pattern: /export|import|download/i, label: 'Data portability features' },
      { pattern: /mobile|app|android|ios/i, label: 'Mobile app improvements' }
    ];
    
    const foundRequests = new Set<string>();
    
    for (const text of texts) {
      for (const { pattern, label } of requestPatterns) {
        if (pattern.test(text)) {
          foundRequests.add(label);
        }
      }
    }
    
    return Array.from(foundRequests);
  }
} 