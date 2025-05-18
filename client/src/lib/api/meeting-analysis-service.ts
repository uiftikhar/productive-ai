import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { AuthService } from './auth-service';
import { 
  AnalysisResult, 
  MeetingAnalysisResponse 
} from '@/types/meeting-analysis';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface AnalyzeTranscriptRequest {
  transcript: string;
  metadata?: {
    title?: string;
    participants?: string[];
    date?: string;
    analysisType?: 'full_analysis' | 'action_items_only' | 'summary_only' | 'topics_only';
    [key: string]: any;
  };
}

export interface AnalysisStatusResponse {
  sessionId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

// Re-export the types for convenience
export type { 
  AnalysisResult,
  MeetingAnalysisResponse
};

// Create an axios request config with authorization header
const getAxiosConfig = (): AxiosRequestConfig => {
  const token = AuthService.getToken();
  
  // Ensure token is in cookies for server components
  if (token && !Cookies.get('auth_token')) {
    console.log('[API Service] Syncing missing token to cookies');
    // Set token in cookies
    Cookies.set('auth_token', token, {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: 7, // 7 days
    });
    
    // Also set in document.cookie for server components
    document.cookie = `auth_token=${token}; path=/; max-age=${60*60*24*7}`;
  }
  
  // Log for debugging
  if (!token) {
    console.log('[API Service] Warning: No auth token found for API request');
  }
  
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
    },
    withCredentials: true,
  };
};

export const MeetingAnalysisService = {
  /**
   * Submit transcript for RAG-enhanced analysis
   */
  async analyzeTranscript(
    request: AnalyzeTranscriptRequest,
  ): Promise<{ sessionId: string }> {
    try {
      console.log(`Sending transcript analysis request to ${API_URL}/rag-meeting-analysis`);
      const response = await axios.post(
        `${API_URL}/rag-meeting-analysis`,
        {
          transcript: request.transcript,
          metadata: {
            ...(request.metadata || {}),
            title: request.metadata?.title || 'Untitled Meeting',
            analysisType: request.metadata?.analysisType || 'full_analysis',
          },
        },
        getAxiosConfig()
      );

      console.log(`Analysis initiated with sessionId: ${response.data.sessionId}`);
      return response.data;
    } catch (error) {
      console.error('Failed to analyze transcript:', error);
      throw error;
    }
  },

  /**
   * Get analysis results by sessionId
   */
  async getAnalysisResults(sessionId: string): Promise<any> {
    try {
      console.log(`Fetching analysis results from ${API_URL}/rag-meeting-analysis/${sessionId}`);
      const response = await axios.get(
        `${API_URL}/rag-meeting-analysis/${sessionId}`,
        getAxiosConfig()
      );

      return response.data;
    } catch (error) {
      console.error('Failed to retrieve analysis results:', error);
      throw error;
    }
  },

  /**
   * Get analysis status by sessionId
   */
  async getAnalysisStatus(sessionId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${API_URL}/rag-meeting-analysis/${sessionId}/status`,
        getAxiosConfig()
      );

      return response.data;
    } catch (error) {
      console.error('Failed to retrieve analysis status:', error);
      throw error;
    }
  },

  /**
   * Get WebSocket URL
   */
  getWebSocketUrl() {
    const apiUrl = API_URL.replace(/^https?:\/\//, '');
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${apiUrl}/visualization`;
  },
  
  /**
   * Get visualization status for a session
   */
  async getVisualizationStatus(sessionId: string): Promise<{
    visualizationReady: boolean;
    eventsCount: number;
    connectionCount: number;
    status: string;
  }> {
    try {
      console.log(`Checking visualization status for session ${sessionId}`);
      const response = await axios.get(
        `${API_URL}/rag-meeting-analysis/${sessionId}/visualization-status`, 
        getAxiosConfig()
      );
      
      return response.data;
    } catch (error) {
      console.error('Failed to get visualization status:', error);
      return {
        visualizationReady: false,
        eventsCount: 0,
        connectionCount: 0,
        status: 'unknown'
      };
    }
  },
}; 