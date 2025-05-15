import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { GraphService } from '../graph/graph.service';
import { StateService } from '../state/state.service';
import { WorkflowService, SessionInfo } from '../graph/workflow.service';
import { Topic } from '../agents/topic-extraction.agent';
import { ActionItem } from '../agents/action-item.agent';
import { SentimentAnalysis } from '../agents/sentiment-analysis.agent';
import { MeetingSummary } from '../agents/summary.agent';

interface AnalysisResults {
  transcript: string;
  topics: Topic[];
  actionItems: ActionItem[];
  sentiment?: SentimentAnalysis | null;
  summary?: MeetingSummary | null;
  errors?: Array<{
    step: string;
    error: string;
    timestamp: string;
  }>;
}

/**
 * Service for handling meeting analysis requests
 */
@Injectable()
export class MeetingAnalysisService {
  private readonly logger = new Logger(MeetingAnalysisService.name);
  private readonly sessions: Map<string, SessionInfo> = new Map();

  constructor(
    private readonly graphService: GraphService,
    private readonly stateService: StateService,
    private readonly workflowService: WorkflowService,
  ) {}

  /**
   * Analyze a transcript
   */
  async analyzeTranscript(transcript: string, metadata?: Record<string, any>) {
    this.logger.log('Analyzing transcript using StateGraph implementation');
    
    try {
      // Use the WorkflowService which now uses the StateGraph implementation
      const { sessionId, result } = await this.workflowService.analyzeMeeting(transcript);
      
      // Save session info
      const sessionInfo = this.workflowService.getSessionInfo(sessionId);
      if (sessionInfo) {
        this.sessions.set(sessionId, { 
          ...sessionInfo, 
          metadata 
        });
      }
      
      this.logger.log(`Analysis completed for session ${sessionId}`);
      
      // Return minimal response with session ID
      return {
        sessionId,
        status: result.errors && result.errors.length > 0 ? 'failed' : 'completed',
        topicCount: result.topics.length,
        actionItemCount: result.actionItems.length,
        errors: result.errors,
      };
    } catch (error) {
      this.logger.error(`Analysis failed: ${error.message}`);
      
      // Generate a session ID for the failed attempt
      const sessionId = uuidv4();
      
      // Create a failed session record
      this.sessions.set(sessionId, {
        id: sessionId,
        startTime: new Date(),
        endTime: new Date(),
        status: 'failed',
        metadata,
      });
      
      // Return error response
      return {
        sessionId,
        status: 'failed',
        error: error.message,
      };
    }
  }

  /**
   * Get analysis results by session ID
   */
  async getAnalysisResults(sessionId: string) {
    // First check if session exists in our local cache
    const sessionInfo = this.sessions.get(sessionId) || this.workflowService.getSessionInfo(sessionId);
    
    if (!sessionInfo) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    
    // Load results from state service
    const results = await this.workflowService.loadAnalysisResults(sessionId);
    
    if (!results) {
      return {
        sessionId,
        status: sessionInfo.status,
        message: 'No results found for this session',
      };
    }
    
    return {
      sessionId,
      status: sessionInfo.status,
      createdAt: sessionInfo.startTime,
      completedAt: sessionInfo.endTime,
      results,
    };
  }

  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<SessionInfo[]> {
    // Combine sessions from both services
    const localSessions = Array.from(this.sessions.values());
    const workflowSessions = this.workflowService.listSessions();
    
    // Merge and deduplicate by session ID
    const sessionMap = new Map<string, SessionInfo>();
    [...localSessions, ...workflowSessions].forEach(session => {
      sessionMap.set(session.id, session);
    });
    
    return Array.from(sessionMap.values());
  }
} 