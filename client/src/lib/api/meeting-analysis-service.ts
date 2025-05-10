import { fetchWithAuth } from '../utils/auth-fetch';
import { API_CONFIG } from '../../config/api';

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

// Default headers for all API requests
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'x-bypass-auth': '1'  // Add this header to bypass auth in the proxy
};

/**
 * Meeting Analysis Service
 * 
 * Provides methods to interact with the meeting analysis API
 */
export const MeetingAnalysisService = {
  /**
   * Create a new analysis session
   */
  async createSession(params: CreateSessionParams): Promise<AnalysisSession> {
    const response = await fetchWithAuth(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.meetingAnalysis.sessions}`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to create analysis session');
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Submit transcript for analysis
   */
  async analyzeTranscript(sessionId: string, params: SubmitAnalysisParams): Promise<{ sessionId: string; status: string }> {
    const response = await fetchWithAuth(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.meetingAnalysis.analyze(sessionId)}`, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to analyze transcript');
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Get analysis session status
   */
  async getSessionStatus(sessionId: string): Promise<AnalysisSession> {
    const response = await fetchWithAuth(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.meetingAnalysis.status(sessionId)}`, {
      headers: DEFAULT_HEADERS
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get session status');
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Get analysis results
   */
  async getResults(sessionId: string): Promise<AnalysisResultsResponse> {
    const response = await fetchWithAuth(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.meetingAnalysis.results(sessionId)}`, {
      headers: DEFAULT_HEADERS
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get analysis results');
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * List all analysis sessions
   */
  async listSessions(): Promise<AnalysisSession[]> {
    const response = await fetchWithAuth(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.meetingAnalysis.sessions}`, {
      headers: DEFAULT_HEADERS
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to list sessions');
    }

    const data = await response.json();
    return data.data.sessions;
  },

  /**
   * Delete an analysis session
   */
  async deleteSession(sessionId: string): Promise<{ sessionId: string; status: string }> {
    const response = await fetchWithAuth(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.meetingAnalysis.status(sessionId)}`, {
      method: 'DELETE',
      headers: DEFAULT_HEADERS
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to delete session');
    }

    const data = await response.json();
    return data.data;
  }
}; 