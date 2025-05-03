/**
 * API compatibility interfaces for the Agentic Meeting Analysis System
 */
import { AnalysisGoalType } from './agent.interface';
import { AnalysisResults } from './state.interface';

/**
 * Legacy meeting analysis request format
 */
export interface LegacyMeetingAnalysisRequest {
  meetingId: string;
  transcript: string;
  title?: string;
  participantIds?: string[];
  userId?: string;
  includeTopics?: boolean;
  includeActionItems?: boolean;
  includeSentiment?: boolean;
  visualization?: boolean;
  adaptiveChunking?: boolean;
  chunkingConfig?: {
    maxChunkSize?: number;
    chunkOverlap?: number;
    minImportanceScore?: number;
    contentSegmentation?: boolean;
  };
}

/**
 * Legacy meeting analysis response format
 */
export interface LegacyMeetingAnalysisResponse {
  meetingId: string;
  output: any;
  success: boolean;
  metrics?: {
    executionTimeMs?: number;
    tokensUsed?: number;
  };
  visualizationUrl?: string;
}

/**
 * Agentic meeting analysis request format
 */
export interface AgenticMeetingAnalysisRequest {
  meetingId: string;
  transcript: string;
  title?: string;
  description?: string;
  participants?: {
    id: string;
    name: string;
    role?: string;
  }[];
  userId?: string;
  goals?: AnalysisGoalType[];
  context?: {
    previousMeetings?: string[];
    relatedDocuments?: string[];
    projectInfo?: Record<string, any>;
  };
  options?: {
    teamComposition?: {
      requiredExpertise?: string[];
      maxTeamSize?: number;
    };
    visualization?: boolean;
    detailedReasoning?: boolean;
    confidenceScoring?: boolean;
    maxExecutionTime?: number;
  };
}

/**
 * Agentic meeting analysis response format
 */
export interface AgenticMeetingAnalysisResponse {
  meetingId: string;
  results: AnalysisResults;
  executionId: string;
  success: boolean;
  team?: {
    coordinator: string;
    specialists: {
      id: string;
      name: string;
      expertise: string[];
    }[];
  };
  metrics: {
    executionTimeMs: number;
    tokensUsed?: number;
    agentInteractions?: number;
    confidenceScore?: number;
  };
  visualizationUrls?: {
    workflow?: string;
    team?: string;
    topics?: string;
    timeline?: string;
  };
}

/**
 * API compatibility layer interface
 */
export interface IApiCompatibilityLayer {
  // Convert between legacy and agentic formats
  convertLegacyToAgenticRequest(
    legacyRequest: LegacyMeetingAnalysisRequest,
  ): AgenticMeetingAnalysisRequest;
  convertAgenticToLegacyResponse(
    agenticResponse: AgenticMeetingAnalysisResponse,
  ): LegacyMeetingAnalysisResponse;

  // Process requests in either format
  processLegacyRequest(
    request: LegacyMeetingAnalysisRequest,
  ): Promise<LegacyMeetingAnalysisResponse>;
  processAgenticRequest(
    request: AgenticMeetingAnalysisRequest,
  ): Promise<AgenticMeetingAnalysisResponse>;

  // Status and results endpoints
  getLegacyAnalysisStatus(meetingId: string): Promise<{
    meetingId: string;
    status: string;
    progress: number;
  }>;

  getLegacyAnalysisResults(
    meetingId: string,
  ): Promise<LegacyMeetingAnalysisResponse>;

  // Feature flags and versioning
  isAgenticMode(): Promise<boolean>;
  setAgenticMode(enabled: boolean): Promise<void>;

  getCompatibilityVersion(): Promise<string>;

  // Error mapping
  mapAgenticErrorToLegacyFormat(error: any): any;
}
