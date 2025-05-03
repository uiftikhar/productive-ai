/**
 * State interfaces for the Agentic Meeting Analysis System
 */
import { AgentExpertise, AnalysisGoalType, AnalysisTaskStatus, AgentOutput } from './agent.interface';

/**
 * Meeting metadata including participants and context
 */
export interface MeetingMetadata {
  meetingId: string;
  title?: string;
  description?: string;
  date?: string;
  duration?: number;
  participants: {
    id: string;
    name: string;
    role?: string;
    email?: string;
  }[];
  context?: {
    previousMeetings?: string[];
    relatedDocuments?: string[];
    projectInfo?: Record<string, any>;
    organizationInfo?: Record<string, any>;
  };
}

/**
 * Meeting transcript format
 */
export interface MeetingTranscript {
  meetingId: string;
  segments: {
    id: string;
    speakerId: string;
    speakerName?: string;
    startTime: number;
    endTime: number;
    content: string;
    confidence?: number;
  }[];
  rawText?: string;
}

/**
 * Represents a transcript segment or chunk for analysis
 */
export interface TranscriptSegment {
  id: string;
  content: string;
  startPosition: number;
  endPosition: number;
  speakers: string[];
  importance?: number;
  metadata?: Record<string, any>;
}

/**
 * Analysis team composition 
 */
export interface AnalysisTeam {
  id: string;
  meetingId: string;
  coordinator: string; // Agent ID of coordinator
  specialists: {
    agentId: string;
    expertise: AgentExpertise[];
    assignedTasks: string[];
  }[];
  created: number;
  updated: number;
}

/**
 * Analysis progress tracking
 */
export interface AnalysisProgress {
  meetingId: string;
  goals: {
    type: AnalysisGoalType;
    status: AnalysisTaskStatus;
    progress: number; // 0-100
    startTime?: number;
    endTime?: number;
  }[];
  taskStatuses: Record<string, AnalysisTaskStatus>;
  overallProgress: number; // 0-100
  started: number;
  lastUpdated: number;
}

/**
 * Complete analysis results
 */
export interface AnalysisResults {
  meetingId: string;
  summary: {
    short: string;
    detailed?: string;
  };
  topics?: {
    id: string;
    name: string;
    description?: string;
    keywords?: string[];
    relevance?: number;
    segments?: string[];
    duration?: number;
  }[];
  actionItems?: {
    id: string;
    description: string;
    assignees?: string[];
    dueDate?: string;
    priority?: string;
    status?: string;
    relatedTopics?: string[];
    segment?: string;
  }[];
  decisions?: {
    id: string;
    description: string;
    rationale?: string;
    stakeholders?: string[];
    impact?: string;
    relatedTopics?: string[];
    segment?: string;
  }[];
  sentiment?: {
    overall: string;
    byTopic?: Record<string, string>;
    byParticipant?: Record<string, string>;
    trends?: any[];
  };
  participation?: {
    speakingTime: Record<string, number>;
    contributions: Record<string, number>;
    interactions?: any[];
  };
  metadata: {
    processedBy: string[];
    confidence: number;
    version: string;
    generatedAt: number;
  };
}

/**
 * State change notification type
 */
export enum StateChangeType {
  CREATED = 'created',
  UPDATED = 'updated',
  DELETED = 'deleted'
}

/**
 * State change notification
 */
export interface StateChangeNotification {
  id: string;
  type: StateChangeType;
  entity: string;
  entityId: string;
  changes?: {
    path: string;
    previousValue?: any;
    newValue?: any;
  }[];
  timestamp: number;
  agentId?: string;
}

/**
 * Complete meeting analysis state
 */
export interface AgenticMeetingAnalysisState {
  // Core meeting information
  meetingId: string;
  metadata: MeetingMetadata;
  transcript: MeetingTranscript;
  segments: TranscriptSegment[];
  
  // Analysis process state
  team?: AnalysisTeam;
  goals: AnalysisGoalType[];
  tasks: Record<string, {
    id: string;
    type: AnalysisGoalType;
    status: AnalysisTaskStatus;
    assignedTo?: string;
    dependencies?: string[];
    input: any;
    output?: AgentOutput;
    created: number;
    updated: number;
  }>;
  progress: AnalysisProgress;
  
  // Results
  results?: AnalysisResults;
  
  // Execution metadata
  executionId: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  errors?: any[];
}

/**
 * Meeting analysis state repository interface
 */
export interface IStateRepository {
  // Core operations
  initialize(): Promise<void>;
  
  // State management
  getState(meetingId: string): Promise<AgenticMeetingAnalysisState>;
  updateState(meetingId: string, updates: Partial<AgenticMeetingAnalysisState>): Promise<void>;
  
  // Specific entity operations
  getTeam(meetingId: string): Promise<AnalysisTeam | null>;
  updateTeam(meetingId: string, updates: Partial<AnalysisTeam>): Promise<void>;
  
  getProgress(meetingId: string): Promise<AnalysisProgress>;
  updateProgress(meetingId: string, updates: Partial<AnalysisProgress>): Promise<void>;
  
  getResults(meetingId: string): Promise<AnalysisResults | null>;
  updateResults(meetingId: string, updates: Partial<AnalysisResults>): Promise<void>;
  
  // History and versioning
  getStateHistory(meetingId: string, limit?: number): Promise<{
    timestamp: number;
    state: Partial<AgenticMeetingAnalysisState>;
    agentId?: string;
  }[]>;
  
  getStateAtTimestamp(meetingId: string, timestamp: number): Promise<AgenticMeetingAnalysisState | null>;
  
  // Event subscription
  subscribeToChanges(callback: (notification: StateChangeNotification) => void): void;
  unsubscribeFromChanges(callback: (notification: StateChangeNotification) => void): void;
  
  // Utilities
  listMeetings(options?: {
    limit?: number;
    offset?: number;
    status?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<{
    meetingId: string;
    title?: string;
    date?: string;
    status: string;
  }[]>;
} 