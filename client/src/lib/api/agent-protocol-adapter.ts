/**
 * Agent Protocol Adapter
 * 
 * This adapter provides backward compatibility between the new Agent Protocol API
 * and the existing UI components that expect the legacy API format.
 */

import { AgentProtocolService, AnalysisRequest, AnalysisResultResponse, AnalysisStatusResponse } from './agent-protocol-service';
import { AnalysisResults, AnalysisResultsResponse, AnalysisSession, SubmitAnalysisParams } from './meeting-analysis-service';

export class AgentProtocolAdapter {
  private agentProtocolService: AgentProtocolService;
  // Store execution IDs for sessions
  private sessionRunMap: Map<string, string> = new Map();

  constructor() {
    this.agentProtocolService = new AgentProtocolService();
  }

  /**
   * Create a session (in the Agent Protocol, this is just a way to generate an ID)
   */
  async createSession(params: { analysisGoal: string }): Promise<AnalysisSession> {
    // Generate a session ID locally since the Agent Protocol doesn't have a specific session creation step
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Return a mock session
    return {
      sessionId: sessionId,
      status: 'created',
      metadata: {
        analysisGoal: params.analysisGoal,
        createdAt: Date.now()
      }
    };
  }

  /**
   * Get the status of a session (maps to getting the run status in Agent Protocol)
   */
  async getSessionStatus(sessionId: string): Promise<AnalysisSession> {
    // If we don't have a run ID for this session, it means the session hasn't started analysis yet
    const executionId = this.sessionRunMap.get(sessionId);
    if (!executionId) {
      return {
        sessionId: sessionId,
        status: 'created',
        metadata: {
          analysisGoal: 'Meeting Analysis',
          createdAt: Date.now()
        }
      };
    }

    try {
      // Get the status from the Agent Protocol
      const status = await this.agentProtocolService.getAnalysisStatus(sessionId, executionId);
      
      // Convert status to the format expected by the UI
      return this.mapStatusResponseToSession(sessionId, status);
    } catch (error) {
      console.error('Error getting session status:', error);
      // If there's an error, return a default session
      return {
        sessionId: sessionId,
        status: 'error',
        metadata: {
          analysisGoal: 'Meeting Analysis',
          createdAt: Date.now()
        }
      };
    }
  }

  /**
   * Analyze a transcript (maps to starting a run in Agent Protocol)
   */
  async analyzeTranscript(sessionId: string, params: SubmitAnalysisParams): Promise<{ sessionId: string; status: string }> {
    try {
      // Prepare request for the Agent Protocol
      const request: AnalysisRequest = {
        meetingId: sessionId,
        transcript: params.transcript
      };

      // Start the analysis
      const response = await this.agentProtocolService.analyzeMeeting(request);
      
      // Save the execution ID for this session
      this.sessionRunMap.set(sessionId, response.executionId);
      
      // Return the status
      return {
        sessionId: sessionId,
        status: 'processing'
      };
    } catch (error) {
      console.error('Error analyzing transcript:', error);
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Get analysis results
   */
  async getResults(sessionId: string): Promise<AnalysisResultsResponse> {
    const executionId = this.sessionRunMap.get(sessionId);
    if (!executionId) {
      return {
        sessionId,
        status: 'not_started',
        message: 'Analysis has not been started for this session'
      };
    }

    try {
      // Get results from the Agent Protocol
      const resultResponse = await this.agentProtocolService.getAnalysisResults(sessionId, executionId);
      
      // Map the results to the format expected by the UI
      return this.mapResultResponseToLegacyFormat(sessionId, resultResponse);
    } catch (error) {
      console.error('Error getting results:', error);
      return {
        sessionId,
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Delete a session (no direct equivalent in Agent Protocol, but can cancel if running)
   */
  async deleteSession(sessionId: string): Promise<{ sessionId: string; status: string }> {
    const executionId = this.sessionRunMap.get(sessionId);
    if (executionId) {
      try {
        // Try to cancel the run
        await this.agentProtocolService.cancelAnalysis(sessionId, executionId);
      } catch (error) {
        // Ignore errors when canceling (might already be completed)
        console.warn('Error canceling analysis during deletion:', error);
      }
      
      // Remove the mapping
      this.sessionRunMap.delete(sessionId);
    }
    
    return {
      sessionId,
      status: 'deleted'
    };
  }

  /**
   * Map Agent Protocol status response to legacy session format
   */
  private mapStatusResponseToSession(sessionId: string, status: AnalysisStatusResponse): AnalysisSession {
    // Map the status
    let legacyStatus: string;
    switch (status.status) {
      case 'completed':
        legacyStatus = 'completed';
        break;
      case 'failed':
        legacyStatus = 'error';
        break;
      case 'canceled':
        legacyStatus = 'canceled';
        break;
      case 'in_progress':
      case 'requires_action':
      case 'running':
        legacyStatus = 'processing';
        break;
      default:
        legacyStatus = 'processing';
    }

    // Convert timestamps from ISO strings to numbers if present
    const startedAtTimestamp = status.metadata?.startedAt 
      ? new Date(status.metadata.startedAt).getTime() 
      : Date.now();
    
    const completedAtTimestamp = status.metadata?.completedAt 
      ? new Date(status.metadata.completedAt).getTime() 
      : undefined;

    // Create metadata
    const metadata: any = {
      analysisGoal: 'Meeting Analysis',
      progress: status.progress || 0,
      createdAt: startedAtTimestamp,
      transcriptSubmitted: true
    };

    // Add processing started timestamp
    if (status.metadata?.startedAt) {
      metadata.processingStartedAt = startedAtTimestamp;
    }

    // Add completion timestamp if completed
    if (legacyStatus === 'completed' && completedAtTimestamp) {
      metadata.completedAt = completedAtTimestamp;
    }

    return {
      sessionId: sessionId,
      status: legacyStatus,
      metadata
    };
  }

  /**
   * Map Agent Protocol result response to legacy result format
   */
  private mapResultResponseToLegacyFormat(sessionId: string, resultResponse: AnalysisResultResponse): AnalysisResultsResponse {
    // If not completed, return partial results
    if (resultResponse.status !== 'completed') {
      return {
        sessionId,
        status: resultResponse.status,
        message: resultResponse.message || 'Analysis in progress'
      };
    }

    // Extract topic names from the topics array
    const topicNames = Array.isArray(resultResponse.results.topics) 
      ? resultResponse.results.topics.map(topic => {
          if (typeof topic === 'string') return topic;
          return topic.name || 'Unnamed Topic';
        })
      : [];

    // Map action items
    const actionItems = Array.isArray(resultResponse.results.actionItems)
      ? resultResponse.results.actionItems.map(item => ({
          description: item.description,
          assignee: item.assignee || (item.assignees && item.assignees[0]) || undefined,
          dueDate: item.dueDate
        }))
      : [];

    // Get summary text
    const summaryText = resultResponse.results.summary 
      ? (typeof resultResponse.results.summary === 'string' 
          ? resultResponse.results.summary 
          : resultResponse.results.summary.short || 'Summary not available')
      : 'Summary not available';

    // Map the results
    const results: AnalysisResults = {
      topics: topicNames,
      actionItems: actionItems,
      summary: summaryText
    };

    return {
      sessionId,
      status: 'completed',
      results,
      message: 'Analysis completed successfully'
    };
  }

  /**
   * List all sessions (not directly supported in Agent Protocol)
   */
  async listSessions(): Promise<AnalysisSession[]> {
    // Since we don't have a way to list sessions in the Agent Protocol,
    // just return an empty array
    return [];
  }
} 