import axios, { AxiosError } from 'axios';
import { AuthService } from './auth-service';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface AnalyzeTranscriptRequest {
  transcript: string;
  metadata?: {
    title?: string;
    participants?: string[];
    date?: string;
    [key: string]: any;
  };
}

export interface AnalysisResult {
  sessionId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  topics?: {
    name: string;
    description: string;
    relevance: number;
    subtopics: string[];
    keywords: string[];
  }[];
  actionItems?: {
    description: string;
    assignee?: string;
    dueDate?: string;
    priority?: string;
    status?: string;
  }[];
  sentiment?: {
    overall: string;
    score: number;
    segments: {
      text: string;
      sentiment: string;
      score: number;
      speaker?: string;
    }[];
    keyEmotions: string[];
    toneShifts: any[];
  };
  summary?: {
    title: string;
    executive_summary: string;
    key_points: string[];
    decisions: {
      description: string;
      stakeholders?: string[];
    }[];
    next_steps: string[];
  };
  createdAt?: Date;
  completedAt?: Date;
  transcript?: string;
  errors?: {
    step: string;
    error: string;
    timestamp: string;
  }[];
  message?: string;
}

// Create an axios instance with authorization header
const getAuthHeaders = () => {
  const token = AuthService.getToken();
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
    },
    withCredentials: true,
  };
};

export const MeetingAnalysisService = {
  async analyzeTranscript(data: AnalyzeTranscriptRequest): Promise<{ sessionId: string }> {
    try {
      console.log(`Sending transcript analysis request to ${API_URL}/rag-meeting-analysis`);
      console.log('Request payload:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
      
      const response = await axios.post(
        `${API_URL}/rag-meeting-analysis`, 
        data, 
        getAuthHeaders()
      );
      
      console.log('Analysis response:', response.data);
      return response.data;
    } catch (error: unknown) {
      console.error('Analyze transcript error:', error);
      
      // Properly type the error as AxiosError for TypeScript
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        // Provide better error message if available
        if (axiosError.response?.data) {
          console.error('Server error details:', axiosError.response.data);
        }
        
        // Log the detailed request that failed
        if (axiosError.config) {
          console.error('Failed request details:', {
            url: axiosError.config.url,
            method: axiosError.config.method,
            headers: axiosError.config.headers,
            // Don't log full data as it might be huge, just log that there was data
            data: axiosError.config.data ? 'Request had data payload' : 'No data payload'
          });
        }
      }
      
      throw error;
    }
  },

  async getAnalysisResults(sessionId: string): Promise<AnalysisResult> {
    try {
      console.log(`Fetching analysis results from ${API_URL}/rag-meeting-analysis/${sessionId}`);
      const response = await axios.get(
        `${API_URL}/rag-meeting-analysis/${sessionId}`, 
        getAuthHeaders()
      );
      console.log('Results response status:', response.status);
      console.log('Results response data:', JSON.stringify(response.data).substring(0, 500) + '...');
      return response.data;
    } catch (error: unknown) {
      console.error('Get analysis results error:', error);
      
      // Properly type the error as AxiosError for TypeScript
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        // Provide better error message if available
        if (axiosError.response?.data) {
          console.error('Server error details:', axiosError.response.data);
        }
        
        // Log request details
        if (axiosError.config) {
          console.error('Failed request details:', {
            url: axiosError.config.url,
            method: axiosError.config.method,
            headers: axiosError.config.headers
          });
        }
      }
      
      throw error;
    }
  },

  // WebSocket connection helpers
  getWebSocketUrl(sessionId: string): string {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.NEXT_PUBLIC_API_WS_URL || 'localhost:3001';
    const token = AuthService.getToken();
    console.log(`Creating WebSocket URL for session ${sessionId}`);
    return `${wsProtocol}//${host}/meeting-analysis/ws/${sessionId}?token=${token}`;
  },
}; 