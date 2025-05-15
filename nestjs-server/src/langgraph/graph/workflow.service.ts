import { Injectable, Logger } from '@nestjs/common';
import { AgentFactory } from '../agents/agent.factory';
import { SupervisorAgent } from '../agents/supervisor/supervisor.agent';
import { StateService } from '../state/state.service';
import { Topic } from '../agents/topic-extraction.agent';
import { ActionItem } from '../agents/action-item.agent';
import { SentimentAnalysis } from '../agents/sentiment-analysis.agent';
import { MeetingSummary } from '../agents/summary.agent';

/**
 * Interface for meeting analysis results
 */
export interface MeetingAnalysisResult {
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
 * Service for handling meeting analysis workflows
 */
@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly agentFactory: AgentFactory,
    private readonly supervisorAgent: SupervisorAgent,
    private readonly stateService: StateService,
  ) {}

  /**
   * Run a basic meeting analysis
   */
  async analyzeMeeting(transcript: string): Promise<MeetingAnalysisResult> {
    this.logger.log('Starting meeting analysis workflow');
    
    // Use supervisor agent to run the analysis
    const analysisState = await this.supervisorAgent.runAnalysis(transcript);
    
    // Return relevant analysis results
    return {
      transcript,
      topics: analysisState.topics || [],
      actionItems: analysisState.actionItems || [],
      sentiment: analysisState.sentiment,
      summary: analysisState.summary,
      errors: analysisState.errors,
    };
  }

  /**
   * Save analysis results
   */
  async saveAnalysisResults(sessionId: string, results: MeetingAnalysisResult): Promise<void> {
    this.logger.log(`Saving analysis results for session ${sessionId}`);
    
    // Save state checkpoint
    await this.stateService.saveState(
      sessionId,
      'analysis_results',
      results,
    );
  }

  /**
   * Load analysis results
   */
  async loadAnalysisResults(sessionId: string): Promise<MeetingAnalysisResult | null> {
    this.logger.log(`Loading analysis results for session ${sessionId}`);
    
    // Load state checkpoint
    const state = await this.stateService.loadState(
      sessionId,
      'analysis_results',
    );
    
    return state as MeetingAnalysisResult;
  }
} 