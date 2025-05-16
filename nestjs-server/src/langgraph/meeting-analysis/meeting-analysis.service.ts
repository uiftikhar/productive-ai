import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { GraphService } from '../graph/graph.service';
import { StateService } from '../state/state.service';
import { WorkflowService, SessionInfo } from '../graph/workflow.service';
import { Topic } from '../agents/topic-extraction.agent';
import { ActionItem } from '../agents/action-item.agent';
import { SentimentAnalysis } from '../agents/sentiment-analysis.agent';
import { MeetingSummary } from '../agents/summary.agent';
import { EventEmitter2 } from '@nestjs/event-emitter';

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

// Analysis update event type
export interface AnalysisProgressEvent {
  sessionId: string;
  phase: string;
  progress: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message?: string;
  timestamp: string;
}

/**
 * Service for handling meeting analysis requests
 */
@Injectable()
export class MeetingAnalysisService {
  private readonly logger = new Logger(MeetingAnalysisService.name);
  private readonly sessions: Map<string, SessionInfo> = new Map();
  private readonly progressMap: Map<string, number> = new Map();
  private readonly phaseWeights: Record<string, number> = {
    topic_extraction: 0.2,
    action_item_extraction: 0.2,
    sentiment_analysis: 0.2,
    participation_analysis: 0.2,
    summary_generation: 0.2,
  };

  constructor(
    private readonly graphService: GraphService,
    private readonly stateService: StateService,
    private readonly workflowService: WorkflowService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Analyze a transcript
   */
  async analyzeTranscript(transcript: string, metadata?: Record<string, any>) {
    this.logger.log('Analyzing transcript using StateGraph implementation');

    try {
      // Initialize progress
      const sessionId = this.initProgress();

      // Publish initial progress update
      this.publishProgressUpdate(
        sessionId,
        'initialization',
        0,
        'pending',
        'Starting analysis',
      );

      // Use the WorkflowService which now uses the StateGraph implementation
      const { result } = await this.workflowService.analyzeMeeting(transcript);

      // Update progress with each step
      let progressValue = 0;
      const completedSteps = result.errors?.map((err) => err.step) || [];

      for (const [phase, weight] of Object.entries(this.phaseWeights)) {
        if (completedSteps.includes(phase)) {
          progressValue += weight;
          this.publishProgressUpdate(
            sessionId,
            phase,
            Math.min(progressValue * 100, 100),
            'in_progress',
            `Completed ${phase}`,
          );
        }
      }

      // Save session info
      const sessionInfo = this.workflowService.getSessionInfo(sessionId);
      if (sessionInfo) {
        this.sessions.set(sessionId, {
          ...sessionInfo,
          metadata,
        });
      }

      // Final progress update
      const status =
        result.errors && result.errors.length > 0 ? 'failed' : 'completed';
      this.publishProgressUpdate(
        sessionId,
        'completed',
        100,
        status,
        status === 'completed'
          ? 'Analysis completed successfully'
          : 'Analysis completed with errors',
      );

      this.logger.log(`Analysis completed for session ${sessionId}`);

      // Return minimal response with session ID
      return {
        sessionId,
        status:
          result.errors && result.errors.length > 0 ? 'failed' : 'completed',
        topicCount: result.topics.length,
        actionItemCount: result.actionItems.length,
        errors: result.errors,
      };
    } catch (error) {
      this.logger.error(`Analysis failed: ${error.message}`);

      // Generate a session ID for the failed attempt
      const sessionId = uuidv4();

      // Publish failed event
      this.publishProgressUpdate(
        sessionId,
        'failed',
        100,
        'failed',
        `Analysis failed: ${error.message}`,
      );

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
    const sessionInfo =
      this.sessions.get(sessionId) ||
      this.workflowService.getSessionInfo(sessionId);

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
    [...localSessions, ...workflowSessions].forEach((session) => {
      sessionMap.set(session.id, session);
    });

    return Array.from(sessionMap.values());
  }

  /**
   * Initialize progress tracking for a new session
   */
  private initProgress(): string {
    const sessionId = uuidv4();
    this.progressMap.set(sessionId, 0);
    return sessionId;
  }

  /**
   * Publish a progress update event
   */
  private publishProgressUpdate(
    sessionId: string,
    phase: string,
    progress: number,
    status: 'pending' | 'in_progress' | 'completed' | 'failed',
    message?: string,
  ): void {
    const event: AnalysisProgressEvent = {
      sessionId,
      phase,
      progress,
      status,
      message,
      timestamp: new Date().toISOString(),
    };

    // Save current progress
    this.progressMap.set(sessionId, progress);

    // Emit event for WebSocket gateway
    this.eventEmitter.emit('analysis.progress', event);

    this.logger.debug(
      `Published progress update for session ${sessionId}: ${progress}% (${phase})`,
    );
  }
}
