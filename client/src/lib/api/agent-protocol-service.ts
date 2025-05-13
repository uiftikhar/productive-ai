/**
 * Agent Protocol Service
 * 
 * This service provides methods to interact with the Agent Protocol API
 * for meeting analysis and other agent-based functionality.
 */

export interface AnalysisRequest {
  meetingId: string;
  transcript: string;
  title?: string;
  participants?: Array<{ id: string; name: string; role?: string }>;
  userId?: string;
}

export interface AnalysisResponse {
  executionId: string;
  meetingId: string;
  status: string;
  message: string;
  threadId: string;
  executionTimeMs: number;
}

export interface AnalysisStatusResponse {
  meetingId: string;
  status: string;
  progress: number;
  runId: string;
  threadId: string;
  partialResults?: any;
  metadata?: any;
}

export interface AnalysisResultResponse {
  meetingId: string;
  status: string;
  results: {
    meetingTitle?: string;
    summary?: string;
    decisions?: Array<{
      title: string;
      content: string;
    }>;
    
    topics?: Array<{
      name: string;
      description?: string;
      keywords?: string[];
      relevanceScore?: number;
    } | string>;
    
    actionItems?: Array<{
      description: string;
      assignees?: string[];
      dueDate?: string;
      priority?: string;
      status?: string;
    }>;
    
    questions?: Array<{
      question: string;
      answered: boolean;
      answer?: string;
    }>;
    keyTopics?: string[];
    
    error?: string;
    error_details?: string;
  };
  message: string;
  runId: string;
  threadId: string;
}

export class AgentProtocolService {
  private apiUrl: string;

  constructor() {
    this.apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  }

  /**
   * Start meeting analysis with the provided transcript
   */
  async analyzeMeeting(params: AnalysisRequest): Promise<AnalysisResponse> {
    const response = await fetch(`${this.apiUrl}/analysis/meetings/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to start analysis: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Get the status of a meeting analysis
   */
  async getAnalysisStatus(meetingId: string, executionId: string): Promise<AnalysisStatusResponse> {
    const response = await fetch(
      `${this.apiUrl}/analysis/meetings/${meetingId}/status?executionId=${executionId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to get analysis status: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Get the results of a completed meeting analysis
   */
  async getAnalysisResults(meetingId: string, executionId: string): Promise<AnalysisResultResponse> {
    const response = await fetch(
      `${this.apiUrl}/analysis/meetings/${meetingId}/result?executionId=${executionId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to get analysis results: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Cancel a running meeting analysis
   */
  async cancelAnalysis(meetingId: string, executionId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/analysis/meetings/${meetingId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ executionId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to cancel analysis: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }
} 