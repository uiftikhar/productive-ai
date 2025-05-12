import { fetchWithAuth } from '../utils/auth-fetch';
import { API_CONFIG } from '../../config/api';
import { AgentProtocolAdapter } from './agent-protocol-adapter';

/**
 * Session creation parameters
 */
export interface CreateSessionParams {
  analysisGoal: string;
  enabledExpertise?: string[];
}

/**
 * Analysis submission parameters
 */
export interface SubmitAnalysisParams {
  transcript: string;
  message?: string;
}

/**
 * Analysis session response
 */
export interface AnalysisSession {
  sessionId: string;
  status: string;
  metadata: {
    analysisGoal: string;
    enabledExpertise?: string[];
    createdAt?: number;
    transcriptSubmitted?: boolean;
    transcriptLength?: number;
    processingStartedAt?: number;
    completedAt?: number;
    progress?: number;
  };
}

/**
 * Analysis results
 */
export interface AnalysisResults {
  topics: string[];
  actionItems: {
    description: string;
    assignee?: string;
    dueDate?: string;
  }[];
  summary: string;
}

/**
 * Analysis results response
 */
export interface AnalysisResultsResponse {
  sessionId: string;
  status: string;
  results?: AnalysisResults;
  message?: string;
  progress?: number;
  metadata?: Record<string, any>;
}

// Create an instance of the adapter
const agentProtocolAdapter = new AgentProtocolAdapter();

/**
 * Meeting Analysis Service
 * 
 * Provides methods to interact with the meeting analysis API using the Agent Protocol
 */
export const MeetingAnalysisService = {
  /**
   * Create a new analysis session
   */
  async createSession(params: CreateSessionParams): Promise<AnalysisSession> {
    return agentProtocolAdapter.createSession(params);
  },

  /**
   * Submit transcript for analysis
   */
  async analyzeTranscript(sessionId: string, params: SubmitAnalysisParams): Promise<{ sessionId: string; status: string }> {
    return agentProtocolAdapter.analyzeTranscript(sessionId, params);
  },

  /**
   * Get analysis session status
   */
  async getSessionStatus(sessionId: string): Promise<AnalysisSession> {
    return agentProtocolAdapter.getSessionStatus(sessionId);
  },

  /**
   * Get analysis results
   */
  async getResults(sessionId: string): Promise<AnalysisResultsResponse> {
    return agentProtocolAdapter.getResults(sessionId);
  },

  /**
   * List all analysis sessions
   */
  async listSessions(): Promise<AnalysisSession[]> {
    return agentProtocolAdapter.listSessions();
  },

  /**
   * Delete an analysis session
   */
  async deleteSession(sessionId: string): Promise<{ sessionId: string; status: string }> {
    return agentProtocolAdapter.deleteSession(sessionId);
  }
}; 