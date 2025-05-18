import { Injectable, Logger } from '@nestjs/common';
import { AgentFactory } from '../agents/agent.factory';
import { SupervisorAgent } from '../agents/supervisor/supervisor.agent';
import { StateService } from '../state/state.service';
import { Topic } from '../agents/topic-extraction.agent';
import { ActionItem } from '../agents/action-item.agent';
import { SentimentAnalysis } from '../agents/sentiment-analysis.agent';
import { MeetingSummary } from '../agents/summary.agent';
import { GraphService } from './graph.service';
import { v4 as uuidv4 } from 'uuid';
import { AgentEventService } from '../visualization/agent-event.service';

/**
 * Interface for meeting analysis results
 */
export interface MeetingAnalysisResult {
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
 * Interface for session information
 */
export interface SessionInfo {
  id: string;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  metadata?: Record<string, any>;
  error?: string;
}

/**
 * Service for handling meeting analysis workflows
 */
@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);
  private readonly sessions: Map<string, SessionInfo> = new Map();

  constructor(
    private readonly agentFactory: AgentFactory,
    private readonly supervisorAgent: SupervisorAgent,
    private readonly stateService: StateService,
    private readonly graphService: GraphService,
    private readonly agentEventService: AgentEventService,
  ) {}

  /**
   * Create a new analysis session
   */
  async createSession(data: { transcript: string, metadata: any }): Promise<string> {
    // Generate unique session ID
    const sessionId = uuidv4();
    
    this.logger.log(`Creating new analysis session: ${sessionId}`);
    
    // Initialize session in database with status "pending"
    await this.stateService.saveSession(sessionId, {
      transcript: data.transcript,
      metadata: data.metadata || {},
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    
    // Register session info
    this.sessions.set(sessionId, {
      id: sessionId,
      startTime: new Date(),
      status: 'pending',
      metadata: data.metadata || {},
    });
    
    // Emit workflow event for visualization
    this.agentEventService.emitWorkflowEvent('created', {
      sessionId,
      metadata: data.metadata || {},
      timestamp: Date.now(),
    });
    
    return sessionId;
  }
  
  /**
   * Update session status
   */
  async updateSessionStatus(sessionId: string, status: 'pending' | 'in_progress' | 'completed' | 'failed', data?: any): Promise<void> {
    this.logger.log(`Updating session ${sessionId} status to ${status}`);
    
    // Get existing session info
    const sessionInfo = this.sessions.get(sessionId);
    if (!sessionInfo) {
      this.logger.warn(`Cannot update status for unknown session: ${sessionId}`);
      return;
    }
    
    // Update session info
    sessionInfo.status = status;
    
    if (status === 'completed' || status === 'failed') {
      sessionInfo.endTime = new Date();
    }
    
    if (data && data.error) {
      sessionInfo.error = data.error;
    }
    
    // Update session in storage
    this.sessions.set(sessionId, sessionInfo);
    
    // Update session in database
    await this.stateService.updateSession(sessionId, {
      status,
      completedAt: status === 'completed' || status === 'failed' ? new Date().toISOString() : undefined,
      error: data?.error,
    });
    
    // Emit event for visualization
    this.agentEventService.emitWorkflowEvent(status, {
      sessionId,
      timestamp: Date.now(),
      ...(data || {}),
    });
  }
  
  /**
   * Update session metadata
   */
  async updateSessionMetadata(sessionId: string, metadata: Record<string, any>): Promise<void> {
    this.logger.log(`Updating metadata for session ${sessionId}`);
    
    // Get existing session info
    const sessionInfo = this.sessions.get(sessionId);
    if (!sessionInfo) {
      this.logger.warn(`Cannot update metadata for unknown session: ${sessionId}`);
      return;
    }
    
    // Update session info
    sessionInfo.metadata = {
      ...sessionInfo.metadata,
      ...metadata,
    };
    
    // Update session in storage
    this.sessions.set(sessionId, sessionInfo);
    
    // Update session in database
    await this.stateService.updateSession(sessionId, {
      metadata: sessionInfo.metadata,
    });
  }
  
  /**
   * Run analysis for an existing session
   */
  async runAnalysis(sessionId: string): Promise<void> {
    this.logger.log(`Running analysis for session ${sessionId}`);
    
    try {
      // Update session status to "in_progress"
      await this.updateSessionStatus(sessionId, 'in_progress');
      
      // Get session data
      const sessionData = await this.stateService.getSession(sessionId);
      if (!sessionData || !sessionData.transcript) {
        throw new Error(`Invalid session: ${sessionId} (no transcript found)`);
      }
      
      // Emit workflow started event
      this.agentEventService.emitWorkflowEvent('started', {
        sessionId,
        timestamp: Date.now(),
      });
      
      // Run the analysis workflow with the session ID to ensure real agent events are emitted
      const startTime = Date.now();
      const result = await this.graphService.analyzeMeeting(sessionData.transcript, sessionId);
      const duration = Date.now() - startTime;
      
      // Save results
      await this.saveAnalysisResults(sessionId, result);
      
      // Update session status to "completed"
      await this.updateSessionStatus(sessionId, 'completed', {
        duration,
        topicCount: result.topics?.length || 0,
        actionItemCount: result.actionItems?.length || 0,
      });
      
      this.logger.log(`Analysis completed for session ${sessionId} in ${duration}ms`);
    } catch (error) {
      this.logger.error(`Analysis failed for session ${sessionId}: ${error.message}`, error.stack);
      
      // Update session status to "failed"
      await this.updateSessionStatus(sessionId, 'failed', {
        error: error.message,
      });
      
      throw error;
    }
  }
  
  /**
   * Generate mock agent events for visualization testing
   * Public method that can be called from controllers
   */
  async generateMockAgentEvents(sessionId: string): Promise<void> {
    // Create a supervisor agent that will be the parent
    const supervisorId = `supervisor-${Date.now()}`;
    
    // Emit supervisor start event
    this.agentEventService.emitAgentEvent('started', {
      agentId: supervisorId,
      agentType: 'SupervisorAgent',
      sessionId,
      timestamp: Date.now(),
      input: { message: 'Starting analysis workflow' }
    });
    
    // Topic extraction agent
    const topicAgentId = `topic-agent-${Date.now()}`;
    this.agentEventService.emitAgentEvent('started', {
      agentId: topicAgentId,
      agentType: 'TopicExtractionAgent',
      sessionId,
      parentAgentId: supervisorId,
      timestamp: Date.now(),
      input: { message: 'Extracting topics from transcript' }
    });
    
    // Wait a short while to simulate processing
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Topic extraction completed
    this.agentEventService.emitAgentEvent('completed', {
      agentId: topicAgentId,
      agentType: 'TopicExtractionAgent',
      sessionId,
      parentAgentId: supervisorId,
      timestamp: Date.now(),
      duration: 500,
      output: { topicCount: 4 }
    });
    
    // Action item agent
    const actionAgentId = `action-agent-${Date.now()}`;
    this.agentEventService.emitAgentEvent('started', {
      agentId: actionAgentId,
      agentType: 'ActionItemAgent',
      sessionId,
      parentAgentId: supervisorId,
      timestamp: Date.now(),
      input: { message: 'Extracting action items from transcript' }
    });
    
    // Emit a service event for LLM
    this.agentEventService.emitServiceEvent(
      'llm',
      'extract_actions',
      {
        agentId: actionAgentId,
        agentType: 'ActionItemAgent',
        sessionId,
        timestamp: Date.now(),
      },
      { prompt: 'Find action items in the text' }
    );
    
    // Wait a short while to simulate processing
    await new Promise(resolve => setTimeout(resolve, 700));
    
    // Action item completed
    this.agentEventService.emitAgentEvent('completed', {
      agentId: actionAgentId,
      agentType: 'ActionItemAgent',
      sessionId,
      parentAgentId: supervisorId,
      timestamp: Date.now(),
      duration: 700,
      output: { actionItemCount: 12 }
    });
    
    // Sentiment analysis agent
    const sentimentAgentId = `sentiment-agent-${Date.now()}`;
    this.agentEventService.emitAgentEvent('started', {
      agentId: sentimentAgentId,
      agentType: 'SentimentAnalysisAgent',
      sessionId,
      parentAgentId: supervisorId,
      timestamp: Date.now(),
      input: { message: 'Analyzing sentiment in transcript' }
    });
    
    // Wait a short while to simulate processing
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Sentiment analysis completed
    this.agentEventService.emitAgentEvent('completed', {
      agentId: sentimentAgentId,
      agentType: 'SentimentAnalysisAgent',
      sessionId,
      parentAgentId: supervisorId,
      timestamp: Date.now(),
      duration: 600,
      output: { sentimentScore: 7 }
    });
    
    // Summary agent
    const summaryAgentId = `summary-agent-${Date.now()}`;
    this.agentEventService.emitAgentEvent('started', {
      agentId: summaryAgentId,
      agentType: 'SummaryAgent',
      sessionId,
      parentAgentId: supervisorId,
      timestamp: Date.now(),
      input: { message: 'Generating meeting summary' }
    });
    
    // Emit a service event for LLM
    this.agentEventService.emitServiceEvent(
      'llm',
      'generate_summary',
      {
        agentId: summaryAgentId,
        agentType: 'SummaryAgent',
        sessionId,
        timestamp: Date.now(),
      },
      { prompt: 'Create a concise summary' }
    );
    
    // Wait a short while to simulate processing
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Summary completed
    this.agentEventService.emitAgentEvent('completed', {
      agentId: summaryAgentId,
      agentType: 'SummaryAgent',
      sessionId,
      parentAgentId: supervisorId,
      timestamp: Date.now(),
      duration: 800,
      output: { summaryLength: 250 }
    });
    
    // Complete the supervisor agent last
    this.agentEventService.emitAgentEvent('completed', {
      agentId: supervisorId,
      agentType: 'SupervisorAgent',
      sessionId,
      timestamp: Date.now(),
      duration: 3000,
      output: { status: 'success' }
    });
  }

  /**
   * Run a meeting analysis using the StateGraph implementation
   */
  async analyzeMeeting(
    transcript: string,
  ): Promise<{ sessionId: string; result: MeetingAnalysisResult }> {
    this.logger.log('Starting meeting analysis workflow');

    // Generate unique session ID
    const sessionId = uuidv4();

    // Register session
    this.sessions.set(sessionId, {
      id: sessionId,
      startTime: new Date(),
      status: 'in_progress',
    });

    try {
      // Use the StateGraph-based implementation
      const result = await this.graphService.analyzeMeeting(transcript);

      // Save analysis results
      await this.saveAnalysisResults(sessionId, result);

      // Update session status
      this.sessions.set(sessionId, {
        id: sessionId,
        startTime: this.sessions.get(sessionId)!.startTime,
        endTime: new Date(),
        status:
          result.errors && result.errors.length > 0 ? 'failed' : 'completed',
      });

      this.logger.log(`Completed analysis for session ${sessionId}`);

      return { sessionId, result };
    } catch (error) {
      this.logger.error(`Analysis failed: ${error.message}`, error.stack);

      // Update session status
      this.sessions.set(sessionId, {
        id: sessionId,
        startTime: this.sessions.get(sessionId)!.startTime,
        endTime: new Date(),
        status: 'failed',
      });

      // Return error result
      const errorResult: MeetingAnalysisResult = {
        transcript,
        topics: [],
        actionItems: [],
        errors: [
          {
            step: 'workflow',
            error: error.message,
            timestamp: new Date().toISOString(),
          },
        ],
      };

      // Save error result
      await this.saveAnalysisResults(sessionId, errorResult);

      return { sessionId, result: errorResult };
    }
  }

  /**
   * Run analysis with supervisor (alternative approach)
   */
  async runSupervisedAnalysis(
    transcript: string,
  ): Promise<MeetingAnalysisResult> {
    this.logger.log('Starting supervised meeting analysis');

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
   * Run a custom analysis pipeline with specific agents
   * This method uses the AgentFactory to create a custom analysis flow
   */
  async runCustomAnalysis(
    transcript: string,
    options: {
      includeTopics?: boolean;
      includeActionItems?: boolean;
      includeSentiment?: boolean;
      includeSummary?: boolean;
    } = {},
  ): Promise<MeetingAnalysisResult> {
    this.logger.log('Starting custom analysis pipeline');

    const result: MeetingAnalysisResult = {
      transcript,
      topics: [],
      actionItems: [],
    };

    const errors: Array<{ step: string; error: string; timestamp: string }> =
      [];

    try {
      // Run topic extraction if requested
      if (options.includeTopics !== false) {
        const topicAgent = this.agentFactory.getTopicExtractionAgent();
        result.topics = await topicAgent.extractTopics(transcript);
      }

      // Run action item extraction if requested
      if (options.includeActionItems !== false) {
        const actionItemAgent = this.agentFactory.getActionItemAgent();
        result.actionItems =
          await actionItemAgent.extractActionItems(transcript);
      }

      // Run sentiment analysis if requested
      if (options.includeSentiment) {
        try {
          const sentimentAgent = this.agentFactory.getSentimentAnalysisAgent();
          result.sentiment = await sentimentAgent.analyzeSentiment(transcript);
        } catch (error) {
          errors.push({
            step: 'sentiment_analysis',
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Run summary generation if requested
      if (options.includeSummary) {
        try {
          const summaryAgent = this.agentFactory.getSummaryAgent();
          result.summary = await summaryAgent.generateSummary(
            transcript,
            result.topics,
            result.actionItems,
            result.sentiment || undefined,
          );
        } catch (error) {
          errors.push({
            step: 'summary_generation',
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Add any errors to the result
      if (errors.length > 0) {
        result.errors = errors;
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Custom analysis failed: ${error.message}`,
        error.stack,
      );
      return {
        transcript,
        topics: [],
        actionItems: [],
        errors: [
          ...errors,
          {
            step: 'custom_analysis',
            error: error.message,
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }
  }

  /**
   * Save analysis results
   */
  async saveAnalysisResults(
    sessionId: string,
    results: MeetingAnalysisResult,
  ): Promise<void> {
    this.logger.log(`Saving analysis results for session ${sessionId}`);
    
    try {
      await this.stateService.saveResults(sessionId, results);
    } catch (error) {
      this.logger.error(`Failed to save results: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load analysis results
   */
  async loadAnalysisResults(
    sessionId: string,
  ): Promise<MeetingAnalysisResult | null> {
    this.logger.log(`Loading analysis results for session ${sessionId}`);
    
    try {
      const results = await this.stateService.getResults(sessionId);
      
      // If no results yet but we have a session, return placeholder
      if (!results) {
        const sessionInfo = this.getSessionInfo(sessionId);
        if (sessionInfo) {
          this.logger.log(`No results yet for session ${sessionId}, returning placeholder`);
          
          // Return placeholder with empty data but correct status
          return {
            transcript: '',
            topics: [],
            actionItems: [],
            status: sessionInfo.status,
            inProgress: sessionInfo.status === 'in_progress',
            message: 'Analysis in progress. Results not available yet.'
          } as any;
        }
      }
      
      return results;
    } catch (error) {
      this.logger.error(`Failed to load results: ${error.message}`);
      return null;
    }
  }

  /**
   * Get info about a specific session
   */
  getSessionInfo(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all sessions
   */
  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get visualization status for a session
   * Returns event count and connection count information
   */
  async getVisualizationStatus(sessionId: string): Promise<{
    visualizationReady: boolean;
    eventsCount: number;
    connectionCount: number;
  }> {
    this.logger.log(`Getting visualization status for session ${sessionId}`);
    
    try {
      // Get the number of events for this session
      const eventsCount = await this.agentEventService.getEventCountForSession(sessionId);
      
      // Get the number of active connections for this session
      const connectionCount = await this.agentEventService.getConnectionCountForSession(sessionId);
      
      // Determine if visualization is ready based on event count
      const visualizationReady = eventsCount > 0;
      
      this.logger.debug(`Visualization status for ${sessionId}: events=${eventsCount}, connections=${connectionCount}, ready=${visualizationReady}`);
      
      return {
        visualizationReady,
        eventsCount,
        connectionCount
      };
    } catch (error) {
      this.logger.error(`Failed to get visualization status for session ${sessionId}: ${error.message}`);
      return {
        visualizationReady: false,
        eventsCount: 0,
        connectionCount: 0
      };
    }
  }
}
