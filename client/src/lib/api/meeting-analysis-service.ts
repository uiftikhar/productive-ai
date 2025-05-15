import { fetchWithAuth } from '../utils/auth-fetch';
import { API_CONFIG } from '../../config/api';
import axios from 'axios';

/**
 * Analysis submission parameters
 */
export interface AnalysisParams {
  transcript: string;
  options?: {
    title?: string;
    description?: string;
    participants?: Array<{
      id: string;
      name: string;
      role?: string;
      email?: string;
    }>;
    analysisGoal?: string;
  };
}

/**
 * Analysis session status type
 */
export type AnalysisSessionStatus = 'created' | 'processing' | 'completed' | 'failed' | 'canceled';

/**
 * Analysis session metadata
 */
export interface AnalysisSessionMetadata {
  createdAt?: string | number;
  processingStartedAt?: string | number;
  completedAt?: string | number;
  transcriptSubmitted?: boolean;
  transcriptLength?: number;
  analysisGoal?: string;
  progress?: number;
  error?: string;
}

/**
 * Analysis session information
 */
export interface AnalysisSession {
  sessionId: string;
  status: AnalysisSessionStatus;
  metadata: AnalysisSessionMetadata;
}

/**
 * Analysis results
 */
export interface AnalysisResults {
  summary?: {
    short?: string;
    detailed?: string;
  } | string;
  topics?: string[] | Array<{name: string; relevance: number}>;
  actionItems?: Array<{
    description: string;
    assignee?: string;
    assignees?: string[];
    dueDate?: string;
    priority?: string;
  }>;
  sentiment?: {
    overall?: string;
    byTopic?: Record<string, string>;
    byParticipant?: Record<string, string>;
  };
  participation?: {
    speakers?: Record<string, number>;
    talkTime?: Record<string, number>;
  };
  error?: string;
}

/**
 * Analysis results response
 */
export interface AnalysisResultsResponse {
  sessionId: string;
  status: AnalysisSessionStatus;
  results: {
    results: AnalysisResults;
  };
  message?: string;
}

/**
 * Service for interacting with the meeting analysis API
 */
export class MeetingAnalysisService {
  /**
   * Base API URL for meeting analysis
   */
  private static baseUrl = 'http://localhost:3000/api/analysis';

  /**
   * Get analysis session status
   */
  static async getSessionStatus(sessionId: string): Promise<AnalysisSession> {
    try {
      const response = await axios.get(`${this.baseUrl}/${sessionId}/status`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching session status:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch session status');
    }
  }

  /**
   * Create a new analysis session
   */
  static async createSession(): Promise<{ sessionId: string }> {
    try {
      const response = await axios.post(`${this.baseUrl}/create`);
      return {
        sessionId: response.data.sessionId
      };
    } catch (error: any) {
      console.error('Error creating session:', error);
      throw new Error(error.response?.data?.message || 'Failed to create session');
    }
  }

  /**
   * Analyze a transcript
   */
  static async analyzeTranscript(params: AnalysisParams): Promise<AnalysisSession> {
    try {
      const response = await axios.post(`${this.baseUrl}/analyze`, params);
      
      return {
        sessionId: response.data.sessionId,
        status: response.data.status as AnalysisSessionStatus,
        metadata: {
          analysisGoal: params.options?.analysisGoal || 'comprehensive_analysis',
          transcriptSubmitted: true,
          transcriptLength: params.transcript.length,
          processingStartedAt: Date.now(),
          progress: 0
        }
      };
    } catch (error: any) {
      console.error('Error analyzing transcript:', error);
      throw new Error(error.response?.data?.message || 'Failed to analyze transcript');
    }
  }

  /**
   * Get analysis results
   */
  static async getResults(sessionId: string): Promise<AnalysisResultsResponse> {
    try {
      const response = await axios.get(`${this.baseUrl}/${sessionId}/result`);
      
      // Handle different response formats gracefully
      const data = response.data;
      
      if (!data) {
        throw new Error('Invalid response format: empty response');
      }
      
      // Normalize response format
      const normalizedResponse: AnalysisResultsResponse = {
        sessionId,
        status: data.status || 'completed',
        results: {
          results: {}
        }
      };
      
      // Handle different result structures
      if (data.results) {
        if (typeof data.results === 'object') {
          if (data.results.results) {
            // Format: { results: { results: {...} } }
            normalizedResponse.results = data.results;
          } else {
            // Format: { results: {...} }
            normalizedResponse.results = { results: data.results };
          }
        }
      } else if (data.error) {
        // Format: { error: "..." }
        normalizedResponse.status = 'failed';
        normalizedResponse.results = { 
          results: { 
            summary: "Analysis failed",
            error: data.error 
          } 
        };
      }
      
      return normalizedResponse;
    } catch (error: any) {
      console.error('Error fetching results:', error);
      return {
        sessionId,
        status: 'failed',
        results: {
          results: {
            summary: 'Failed to retrieve analysis results',
            error: error.response?.data?.message || error.message
          }
        }
      };
    }
  }

  /**
   * Cancel an analysis
   */
  static async cancelAnalysis(sessionId: string): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/${sessionId}/cancel`);
    } catch (error: any) {
      console.error('Error canceling analysis:', error);
      throw new Error(error.response?.data?.message || 'Failed to cancel analysis');
    }
  }
} 