import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface ChatSession {
  id: string;
  userId: string;
  metadata?: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  attachments?: Array<{
    type: string;
    data: any;
    metadata?: Record<string, any>;
  }>;
}

export interface ChatResponse {
  id: string;
  content: string;
  type: 'text' | 'visualization' | 'error' | 'loading' | 'analysis' | 'action';
  timestamp: number;
  attachments?: Array<{
    type: string;
    data: any;
    metadata?: Record<string, any>;
  }>;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface TranscriptUploadResponse {
  meetingId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp: number;
}

export interface AnalysisStatusResponse {
  meetingId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: {
    overallProgress: number;
    started: number;
    lastUpdated: number;
  };
}

/**
 * API service for chat operations
 */
export const chatApi = {
  /**
   * Create a new chat session
   */
  async createSession(userId: string, metadata?: Record<string, any>): Promise<ChatSession> {
    const response = await axios.post(
      `${API_URL}/api/chat/session`,
      { userId, metadata },
      { withCredentials: true }
    );
    return response.data;
  },

  /**
   * Get chat session details
   */
  async getSession(sessionId: string): Promise<ChatSession> {
    const response = await axios.get(`${API_URL}/api/chat/session/${sessionId}`, {
      withCredentials: true,
    });
    return response.data;
  },

  /**
   * Send a message to the chat agent
   */
  async sendMessage(
    sessionId: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<ChatResponse> {
    const response = await axios.post(
      `${API_URL}/api/chat/message`,
      { sessionId, content, metadata },
      { withCredentials: true }
    );
    return response.data;
  },

  /**
   * Get message history for a session
   */
  async getMessageHistory(sessionId: string, limit?: number): Promise<ChatMessage[]> {
    const response = await axios.get(`${API_URL}/api/chat/history/${sessionId}`, {
      params: { limit },
      withCredentials: true,
    });
    return response.data;
  },

  /**
   * Upload a transcript for analysis
   */
  async uploadTranscript(
    transcript: string,
    title?: string,
    description?: string,
    participants?: Array<{ id: string; name: string; role?: string }>
  ): Promise<TranscriptUploadResponse> {
    const response = await axios.post(
      `${API_URL}/api/chat/transcript/upload`,
      { transcript, title, description, participants },
      { withCredentials: true }
    );
    return response.data;
  },

  /**
   * Start or resume analysis for a transcript
   */
  async analyzeTranscript(
    meetingId: string,
    goals?: string[],
    options?: Record<string, any>
  ): Promise<AnalysisStatusResponse> {
    const response = await axios.post(
      `${API_URL}/api/chat/transcript/${meetingId}/analyze`,
      { goals, options },
      { withCredentials: true }
    );
    return response.data;
  },

  /**
   * Get analysis status
   */
  async getAnalysisStatus(meetingId: string): Promise<AnalysisStatusResponse> {
    const response = await axios.get(`${API_URL}/api/chat/transcript/${meetingId}/status`, {
      withCredentials: true,
    });
    return response.data;
  },

  /**
   * Get related meetings
   */
  async getRelatedMeetings(meetingId: string): Promise<any[]> {
    const response = await axios.get(`${API_URL}/api/chat/transcript/${meetingId}/related`, {
      withCredentials: true,
    });
    return response.data;
  },
};
