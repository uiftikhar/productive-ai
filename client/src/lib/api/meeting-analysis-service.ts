import axios, { AxiosError } from 'axios';
import { AuthService } from './auth-service';
import { AnalysisResult, MeetingAnalysisResponse } from '@/types/meeting-analysis';
import Cookies from 'js-cookie';
import { API_CONFIG } from '@/config/api';

// Use the API_CONFIG which now properly handles browser vs server context
const API_URL = API_CONFIG.baseUrl;

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
export type { AnalysisResult, MeetingAnalysisResponse };

// Helper to get auth headers with the right token
const getAuthHeaders = () => {
  const token = AuthService.getToken();
  return {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    withCredentials: true, // Important for cookies-based auth
  };
};

// Helper to check all available cookies
const logAvailableCookies = () => {
  try {
    // Get all cookies
    const cookies = document.cookie.split(';').map(cookie => cookie.trim());
    console.log('Available cookies:', cookies);

    // Check specifically for auth token
    const authToken = Cookies.get('auth_token');
    console.log('Found auth token in cookies:', !!authToken);
  } catch (e) {
    console.log('Cannot log cookies - likely server-side rendering');
  }
};

/**
 * Meeting analysis service
 * Handles creating analysis sessions and retrieving results
 */
export const MeetingAnalysisService = {
  async analyzeTranscript(data: AnalyzeTranscriptRequest): Promise<{ sessionId: string }> {
    try {
      logAvailableCookies();

      const authConfig = getAuthHeaders();
      console.log('Using API URL:', API_URL);

      const response = await axios.post(`${API_URL}/rag-meeting-analysis`, data, authConfig);

      return {
        sessionId: response.data.sessionId,
      };
    } catch (error) {
      console.error('Analyze transcript error:', error);

      // Handle authentication errors
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        console.error('Authentication error: Token invalid or expired');
        AuthService.clearToken(); // Clear invalid token
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
      logAvailableCookies();

      const response = await axios.get(`${API_URL}/rag-meeting-analysis/${sessionId}`, authConfig);

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
            headers: axiosError.config.headers,
          });
        }
      }

      throw error;
    }
  },

  // WebSocket connection helpers
  getWebSocketUrl(sessionId: string): string {
    // Use the wsBaseUrl from API_CONFIG which handles browser context properly
    const wsUrl = API_CONFIG.wsBaseUrl;
    const token = AuthService.getToken();
    console.log(`Creating WebSocket URL for session ${sessionId} using base ${wsUrl}`);
    return `${wsUrl}/meeting-analysis/ws/${sessionId}?token=${token}`;
  },
};
