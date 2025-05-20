/**
 * Meeting Analysis Response Types
 * These interfaces match the actual server response structure
 */

// Core Topic structure
export interface Topic {
  topic?: string;
  name?: string;
  description?: string;
  relevance?: number;
  subtopics?: string[];
  keywords?: string[];
  main_participants?: string[];
  duration?: string;
}

// Action Item structure
export interface ActionItem {
  description: string;
  assignee?: string;
  deadline?: string;
  status?: string;
  priority?: string;
  context?: string;
}

// Sentiment Analysis structures
export interface SentimentSegment {
  text: string;
  sentiment: string;
  score: number;
  speaker?: string;
  timestamp?: string;
}

export interface TopicSentiment {
  topic: string;
  sentiment: string;
  score: number;
  context: string;
}

export interface ToneShift {
  from: string;
  to: string;
  approximate_time?: string;
  trigger?: string;
}

export interface SentimentAnalysis {
  overallSentiment?: string;
  overall?: string;
  score?: number;
  sentimentScore?: number;
  segments?: SentimentSegment[];
  keyEmotions?: string[];
  topicSentiments?: TopicSentiment[];
  toneShifts?: ToneShift[];
}

// Meeting Summary structure
export interface Decision {
  title: string;
  content: string;
}

export interface MeetingSummary {
  meetingTitle: string;
  summary: string;
  decisions: Decision[];
  next_steps?: string[];
}

// Analysis Error structure
export interface AnalysisError {
  step: string;
  error: string;
  timestamp: string;
}

// Base Analysis Result structure
export interface AnalysisResult {
  sessionId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  topics?: Topic[];
  actionItems?: ActionItem[];
  sentiment?: SentimentAnalysis;
  summary?: MeetingSummary;
  createdAt?: Date | string;
  completedAt?: Date | string;
  transcript?: string;
  errors?: AnalysisError[];
  message?: string;
  currentPhase?: string;
}

// The full response structure with potentially nested results
export interface MeetingAnalysisResponse extends AnalysisResult {
  results?: AnalysisResult;
}
