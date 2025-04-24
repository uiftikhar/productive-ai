/**
 * Decision Tracking Types
 *
 * Type definitions for decision identification, categorization, and tracking
 */

import { BaseMessage } from '@langchain/core/messages';

/**
 * Decision entity
 */
export interface Decision {
  id: string;
  text: string;
  summary?: string;
  decisionMaker?: string;
  approvers?: string[];
  category: DecisionCategory;
  impact: 'low' | 'medium' | 'high';
  status: DecisionStatus;
  statusHistory?: StatusChange[];
  source: {
    meetingId: string;
    segmentId: string;
    rawText?: string;
  };
  relatedTopics: string[];
  context?: string;
  timestamp: number;
  tags?: string[];
  dependencies?: string[]; // IDs of other decisions this depends on
  impactAssessment?: ImpactAssessment;
  metadata?: Record<string, any>;
}

/**
 * Decision category
 */
export type DecisionCategory =
  | 'strategic'
  | 'tactical'
  | 'operational'
  | 'technical'
  | 'financial'
  | 'personnel'
  | 'policy'
  | 'other';

/**
 * Decision status
 */
export type DecisionStatus =
  | 'proposed'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'implemented'
  | 'blocked'
  | 'deferred'
  | 'superseded';

/**
 * Status change record
 */
export interface StatusChange {
  from: DecisionStatus;
  to: DecisionStatus;
  timestamp: number;
  by: string;
  reason?: string;
}

/**
 * Impact assessment for a decision
 */
export interface ImpactAssessment {
  areas: {
    area: string;
    impact: 'positive' | 'negative' | 'neutral';
    severity: 'low' | 'medium' | 'high';
    description: string;
  }[];
  risks: {
    description: string;
    probability: 'low' | 'medium' | 'high';
    severity: 'low' | 'medium' | 'high';
    mitigation?: string;
  }[];
  timeline: {
    shortTerm: string;
    mediumTerm: string;
    longTerm: string;
  };
  confidenceScore: number;
}

/**
 * Decision identification confidence
 */
export interface DecisionConfidence {
  isDecision: number; // 0-1 probability score
  hasClarity: number; // 0-1 clarity score
  hasConcrete: number; // 0-1 concreteness score
  reasoning: string;
}

/**
 * Decision query parameters
 */
export interface DecisionQueryParams {
  status?: DecisionStatus[];
  categories?: DecisionCategory[];
  impact?: ('low' | 'medium' | 'high')[];
  fromDate?: Date;
  toDate?: Date;
  decisionMakers?: string[];
  tags?: string[];
  searchText?: string;
  meetingIds?: string[];
}

/**
 * Decision tracking agent request parameters
 */
export interface DecisionTrackingParams {
  identifyOnly?: boolean;
  performImpactAssessment?: boolean;
  categorize?: boolean;
  trackDependencies?: boolean;
  confidenceThreshold?: number;
  meetingAnalysis?: any; // MeetingAnalysis from meeting-analysis.types.ts
}

/**
 * Report configuration
 */
export interface DecisionReportConfig {
  format: 'summary' | 'detailed' | 'timeline' | 'impact' | 'dashboard';
  groupBy?: 'category' | 'status' | 'impact' | 'decisionMaker';
  includeRationale?: boolean;
  includeImpact?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  filters?: DecisionQueryParams;
}

/**
 * Decision report output
 */
export interface DecisionReport {
  title: string;
  generateTime: number;
  parameters: DecisionReportConfig;
  summary: {
    totalDecisions: number;
    byStatus: Record<DecisionStatus, number>;
    byCategory: Record<DecisionCategory, number>;
    byImpact: Record<string, number>;
    timeline?: {
      labels: string[];
      counts: number[];
    };
  };
  decisions: Decision[];
  insights?: string[];
}
