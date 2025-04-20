/**
 * Transcript segment with speaker information
 */
export interface TranscriptSegment {
  id: string;
  speaker: string;
  text: string;
  timestamp: number;
  duration?: number;
  sentiment?: SentimentScore;
}

/**
 * Sentiment analysis score
 */
export interface SentimentScore {
  positive: number;
  negative: number;
  neutral: number;
  compound: number;
}

/**
 * Detected topic in meeting
 */
export interface MeetingTopic {
  id: string;
  name: string;
  keywords: string[];
  relevance: number;
  segments: string[]; // IDs of transcript segments related to this topic
  summary: string;
  sentiment?: SentimentScore;
}

/**
 * Action item extracted from meeting
 */
export interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  dueDate?: Date;
  status: 'pending' | 'completed' | 'overdue' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  relatedTopics: string[]; // Topic IDs
  source: string; // Transcript segment ID
}

/**
 * Full meeting analysis result
 */
export interface MeetingAnalysis {
  meetingId: string;
  title?: string;
  date: Date;
  duration: number;
  participants: string[];
  transcript: TranscriptSegment[];
  topics: MeetingTopic[];
  summary: string;
  actionItems: ActionItem[];
  decisions?: Decision[]; // Reference to decisions if decision tracking is enabled
  artifacts?: Record<string, any>; // Additional analysis artifacts
  metadata: {
    analysisVersion: string;
    analysisTimestamp: number;
    sourceType: 'transcript' | 'recording' | 'notes';
    confidenceScore?: number;
  };
}

/**
 * Meeting analysis agent request parameters
 */
export interface MeetingAnalysisParams {
  includeTopics?: boolean;
  includeActionItems?: boolean;
  includeSentiment?: boolean;
  topicLimit?: number;
  format?: 'full' | 'executive' | 'technical';
  trackDecisions?: boolean;
  previousMeetingIds?: string[];
}

/**
 * Meeting analysis agent response
 */
export interface MeetingAnalysisResponse {
  analysis: MeetingAnalysis;
  decisions?: Decision[];
}

/**
 * Decision from meeting
 * (Also referenced in decision-tracking.types.ts)
 */
export interface Decision {
  id: string;
  text: string;
  decisionMaker?: string;
  approvers?: string[];
  category?: string;
  impact?: 'low' | 'medium' | 'high';
  status: 'proposed' | 'approved' | 'implemented' | 'rejected';
  source: {
    meetingId: string;
    segmentId: string;
  };
  relatedTopics: string[];
  context?: string;
  timestamp: number;
}
