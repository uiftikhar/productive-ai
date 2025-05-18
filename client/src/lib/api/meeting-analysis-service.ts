import axios, { AxiosError } from 'axios';
import { AuthService } from './auth-service';
import { 
  AnalysisResult, 
  MeetingAnalysisResponse 
} from '@/types/meeting-analysis';
import Cookies from 'js-cookie';

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

// Re-export the types for convenience
export type { 
  AnalysisResult,
  MeetingAnalysisResponse
};

// Create an axios instance with authorization header
const getAuthHeaders = () => {
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
  async analyzeTranscript(data: AnalyzeTranscriptRequest): Promise<{ sessionId: string }> {
    try {
      console.log(`Sending transcript analysis request to ${API_URL}/rag-meeting-analysis`);
      console.log(`Auth token exists: ${!!AuthService.getToken()}`);
      
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
        
        // Handle authentication errors
        if (axiosError.response?.status === 401) {
          console.error('Authentication error: Token invalid or expired');
          AuthService.clearToken(); // Clear invalid token
        }

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

  async getAnalysisResults(sessionId: string): Promise<MeetingAnalysisResponse> {
    try {
      // Get a fresh set of headers (to ensure token sync)
      const authConfig = getAuthHeaders();
      
      console.log(`Fetching analysis results from ${API_URL}/rag-meeting-analysis/${sessionId}`);
      console.log(`Auth token exists: ${!!AuthService.getToken()}`);
      console.log(`Auth headers:`, JSON.stringify(authConfig.headers));
      
      // Check document cookies for debugging
      console.log(`Document cookies:`, document.cookie ? 'Present' : 'Empty');
      
      const response = await axios.get(
        `${API_URL}/rag-meeting-analysis/${sessionId}`,
        authConfig
      );
      
      console.log('Results response status:', response.status);
      return response.data;
    } catch (error: unknown) {
      console.error('Get analysis results error:', error);

      // Properly type the error as AxiosError for TypeScript
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        // Handle authentication errors
        if (axiosError.response?.status === 401) {
          console.error('Authentication error: Token invalid or expired');
          AuthService.clearToken(); // Clear invalid token
        }

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