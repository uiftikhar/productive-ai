/**
 * Types for transcript management
 */

export enum TranscriptStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  ANALYZED = 'ANALYZED',
  ERROR = 'ERROR'
}

export interface Transcript {
  id: string;
  title: string;
  uploadDate: Date | string;
  status: TranscriptStatus;
  tags?: string[];
  duration: number;
  speakerCount: number;
  fileSize: number;
  fileType: string;
  summary?: string;
  keyPoints?: string[];
  actionItems?: string[];
  analysis?: TranscriptAnalysis;
  isTemporary?: boolean;
}

export interface TranscriptMetadata {
  source: string;
  duration?: number; // in seconds
  participants?: string[];
  dateRecorded?: string;
  fileSize?: number; // in bytes
  fileType?: string;
  originalFilename?: string;
}

export interface TranscriptAnalysis {
  summary: string;
  keyPoints: string[];
  actionItems: string[];
}

export interface KeyTopic {
  name: string;
  relevance: number; // 0-1 score
  mentions: number;
  context: string[];
}

export interface SentimentAnalysis {
  overall: number; // -1 to 1 where -1 is negative, 0 is neutral, 1 is positive
  byTopic?: Record<string, number>;
}

export interface KnowledgeGapAnalysis {
  id: string;
  gaps: KnowledgeGap[];
  relatedTranscripts: RelatedTranscript[];
}

export interface KnowledgeGap {
  topic: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  recommendedAction?: string;
}

export interface RelatedTranscript {
  id: string;
  title: string;
  similarity: number; // 0-1 score
  relevantTopics: string[];
} 