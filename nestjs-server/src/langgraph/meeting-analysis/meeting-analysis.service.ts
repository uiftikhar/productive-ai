import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { GraphService } from '../graph/graph.service';
import { StateService } from '../state/state.service';
import { WorkflowService } from '../graph/workflow.service';
import { Topic } from '../agents/topic-extraction.agent';
import { ActionItem } from '../agents/action-item.agent';
import { SentimentAnalysis } from '../agents/sentiment-analysis.agent';
import { MeetingSummary } from '../agents/summary.agent';

export interface SessionInfo {
  sessionId: string;
  createdAt: Date;
  completedAt?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  metadata?: Record<string, any>;
}

interface AnalysisResults {
  transcript: string;
  topics: Topic[];
  actionItems: ActionItem[];
  sentiment?: SentimentAnalysis;
  summary?: MeetingSummary;
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
    // Generate a session ID
    const sessionId = uuidv4();
    
    // Create session record
    this.sessions.set(sessionId, {
      sessionId,
      createdAt: new Date(),
      status: 'in_progress',
      metadata,
    });
    
    this.logger.log(`Starting analysis for session ${sessionId}`);
    
    try {
      // Run the analysis
      const result = await this.graphService.analyzeMeeting(transcript);
      
      // Save results
      const analysisResults: AnalysisResults = {
        transcript,
        topics: result.topics,
        actionItems: result.actionItems,
        sentiment: result.sentiment || undefined,
        summary: result.summary || undefined,
        errors: result.errors.map(err => ({
          step: err.step,
          error: err.message,
          timestamp: err.timestamp
        }))
      };
      
      await this.workflowService.saveAnalysisResults(sessionId, analysisResults);
      
      // Update session status
      this.sessions.set(sessionId, {
        sessionId,
        createdAt: new Date(),
        completedAt: new Date(),
        status: result.errors.length > 0 ? 'failed' : 'completed',
        metadata,
      });
      
      this.logger.log(`Analysis completed for session ${sessionId}`);
      
      // Return minimal response with session ID
      return {
        sessionId,
        status: result.errors.length > 0 ? 'failed' : 'completed',
        topicCount: result.topics.length,
        actionItemCount: result.actionItems.length,
        errors: result.errors,
      };
    } catch (error) {
      // Update session status to failed
      this.sessions.set(sessionId, {
        sessionId,
        createdAt: new Date(),
        completedAt: new Date(),
        status: 'failed',
        metadata,
      });
      
      this.logger.error(`Analysis failed for session ${sessionId}: ${error.message}`);
      
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
    // Check if session exists
    if (!this.sessions.has(sessionId)) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    
    // Get session info (we know it exists at this point)
    const session = this.sessions.get(sessionId)!;
    
    // Load results
    const results = await this.workflowService.loadAnalysisResults(sessionId);
    
    if (!results) {
      return {
        sessionId,
        status: session.status,
        message: 'No results found for this session',
      };
    }
    
    return {
      sessionId,
      status: session.status,
      createdAt: session.createdAt,
      completedAt: session.completedAt,
      results,
    };
  }

  /**
   * Get all sessions
   */
  async getAllSessions(): Promise<SessionInfo[]> {
    return Array.from(this.sessions.values());
  }
} 