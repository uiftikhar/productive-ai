/**
 * Feedback System Interfaces
 * Part of Milestone 2.3: Human-in-the-Loop Integration
 */

/**
 * Feedback types for different kinds of feedback
 */
export enum FeedbackType {
  GENERAL = 'general',
  QUALITY = 'quality',
  ACCURACY = 'accuracy',
  HELPFULNESS = 'helpfulness',
  USABILITY = 'usability',
  PERFORMANCE = 'performance',
  SUGGESTION = 'suggestion',
  BUG_REPORT = 'bug_report'
}

/**
 * Rating scale for numeric feedback
 */
export enum FeedbackRatingScale {
  BINARY = 'binary', // 0-1 (thumbs up/down)
  FIVE_POINT = 'five_point', // 1-5 scale
  TEN_POINT = 'ten_point', // 1-10 scale
  HUNDRED_POINT = 'hundred_point' // 0-100 scale
}

/**
 * Source of the feedback
 */
export enum FeedbackSource {
  DIRECT = 'direct', // User directly submitted
  INFERRED = 'inferred', // System inferred from user behavior
  PROMPTED = 'prompted', // System prompted user for feedback
  SURVEY = 'survey', // Collected via survey
  INTEGRATED = 'integrated' // From integrated system
}

/**
 * Feedback item interface
 */
export interface Feedback {
  id: string;
  userId: string;
  agentId?: string;
  sessionId?: string;
  type: FeedbackType;
  source: FeedbackSource;
  rating?: number;
  ratingScale?: FeedbackRatingScale;
  text?: string;
  category?: string[];
  targetId?: string; // Can refer to tool, action, response ID
  targetType?: string;
  createdAt: Date;
  context?: any; // Context when feedback was given
  metadata?: Record<string, any>;
}

/**
 * Feedback collection configuration
 */
export interface FeedbackCollectionConfig {
  enabledTypes: FeedbackType[];
  defaultRatingScale: FeedbackRatingScale;
  promptProbability?: number; // 0-1, likelihood of prompting for feedback
  promptInterval?: number; // milliseconds between prompts
  collectContextData?: boolean;
  categories?: string[];
  customQuestions?: FeedbackQuestion[];
  autoTagging?: boolean;
  sentimentAnalysis?: boolean;
}

/**
 * Feedback question for structured collection
 */
export interface FeedbackQuestion {
  id: string;
  text: string;
  type: 'rating' | 'text' | 'boolean' | 'choice';
  ratingScale?: FeedbackRatingScale;
  options?: string[]; // For choice questions
  category?: string;
  required?: boolean;
  condition?: { // Show question only if condition met
    questionId: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than';
    value: any;
  };
}

/**
 * Feedback analysis result
 */
export interface FeedbackAnalysis {
  totalFeedbackCount: number;
  averageRating?: number;
  ratingDistribution?: Record<number, number>;
  sentimentScore?: number; // -1 to 1
  topCategories?: Array<{category: string; count: number}>;
  commonTerms?: Array<{term: string; count: number}>;
  trends?: {
    byDate: Array<{date: string; averageRating: number; count: number}>;
    byCategory: Record<string, {averageRating: number; count: number}>;
  };
  insights?: string[];
  metadata?: Record<string, any>;
}

/**
 * Feedback collection service interface
 */
export interface FeedbackCollectorService {
  /**
   * Collect feedback from user
   */
  collectFeedback(feedback: Omit<Feedback, 'id' | 'createdAt'>): Promise<Feedback>;
  
  /**
   * Get feedback by ID
   */
  getFeedback(id: string): Promise<Feedback | null>;
  
  /**
   * Get all feedback for a user
   */
  getUserFeedback(userId: string, limit?: number): Promise<Feedback[]>;
  
  /**
   * Get all feedback for an agent
   */
  getAgentFeedback(agentId: string, limit?: number): Promise<Feedback[]>;
  
  /**
   * Get all feedback for a session
   */
  getSessionFeedback(sessionId: string): Promise<Feedback[]>;
  
  /**
   * Request feedback from user
   */
  requestFeedback(userId: string, options?: {
    type?: FeedbackType;
    questions?: FeedbackQuestion[];
    context?: any;
  }): Promise<string>; // Returns request ID
  
  /**
   * Subscribe to feedback events
   */
  subscribeToEvents(callback: (event: FeedbackEvent) => void): string;
  
  /**
   * Unsubscribe from feedback events
   */
  unsubscribeFromEvents(subscriptionId: string): boolean;
}

/**
 * Feedback analyzer service interface
 */
export interface FeedbackAnalyzerService {
  /**
   * Analyze feedback
   */
  analyzeFeedback(feedback: Feedback[]): Promise<FeedbackAnalysis>;
  
  /**
   * Get analysis for a specific agent
   */
  getAgentAnalysis(agentId: string): Promise<FeedbackAnalysis>;
  
  /**
   * Update expertise based on feedback
   */
  updateExpertiseFromFeedback(agentId: string, feedback: Feedback[]): Promise<void>;
  
  /**
   * Extract actionable insights from feedback
   */
  extractInsights(feedback: Feedback[]): Promise<string[]>;
  
  /**
   * Generate improvement recommendations
   */
  generateRecommendations(agentId: string): Promise<string[]>;
}

/**
 * Feedback event for notification
 */
export interface FeedbackEvent {
  type: 'feedback_received' | 'feedback_requested' | 'analysis_updated';
  timestamp: Date;
  feedbackId?: string;
  feedback?: Feedback;
  userId?: string;
  agentId?: string;
  metadata?: Record<string, any>;
} 