import { Request, Response } from 'express';
import { Logger } from '../shared/logger/logger.interface';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { ServiceRegistry } from '../langgraph/agentic-meeting-analysis/services/service-registry';
import { MeetingAnalysisAgentProtocol } from '../langgraph/agent-protocol/meeting-analysis-agent-protocol';
import { OpenAIConnector } from '../connectors/openai-connector';
import { PineconeConnector } from '../connectors/pinecone-connector';

/**
 * Controller for Agent Protocol endpoints
 */
export class AgentProtocolController {
  private logger: Logger = new ConsoleLogger();
  private agentProtocol: MeetingAnalysisAgentProtocol | null = null;
  private registry: ServiceRegistry;
  
  constructor() {
    // Get the service registry
    this.registry = ServiceRegistry.getInstance();
    this.logger.info('Agent Protocol Controller initialized');
  }
  
  /**
   * Get or create the agent protocol instance
   * This ensures the OpenAI connector is available when needed
   */
  private getAgentProtocol(): MeetingAnalysisAgentProtocol {
    if (this.agentProtocol) {
      return this.agentProtocol;
    }
    
    // Get connectors from registry
    const openAiConnector = this.registry.getOpenAIConnector();
    const pineconeConnector = this.registry.getPineconeConnector();
    
    // Verify OpenAI connector is available
    if (!openAiConnector) {
      this.logger.error('OpenAI connector not available in service registry');
      throw new Error('OpenAI connector is required but not currently available in service registry. Please ensure it is initialized before using this endpoint.');
    }
    
    // Initialize the agent protocol service
    this.agentProtocol = new MeetingAnalysisAgentProtocol({
      logger: this.logger,
      openAiConnector,
      pineconeConnector,
      enableRag: true
    });
    
    this.logger.info('Agent Protocol initialized successfully');
    return this.agentProtocol;
  }
  
  /**
   * Start meeting analysis
   */
  async analyzeMeeting(req: Request, res: Response): Promise<void> {
    try {
      const { meetingId, transcript, title, participants, userId, goals, options } = req.body;
      
      if (!meetingId) {
        res.status(400).json({ error: 'Meeting ID is required' });
        return;
      }
      
      if (!transcript) {
        res.status(400).json({ error: 'Transcript is required' });
        return;
      }
      
      // Log the request
      this.logger.info(`Received meeting analysis request for ${meetingId}`);
      
      try {
        // Get the agent protocol (lazy initialization)
        const agentProtocol = this.getAgentProtocol();
        
        // Process the request using the agent protocol
        const startTime = Date.now();
        const result = await agentProtocol.analyzeMeeting({
          meetingId,
          transcript,
          title,
          participants,
          userId,
          goals,
          options
        });
        
        res.status(202).json({
          executionId: result.runId,
          meetingId,
          status: 'scheduled',
          message: 'Analysis scheduled successfully',
          threadId: result.threadId,
          executionTimeMs: Date.now() - startTime
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('OpenAI connector')) {
          // Special handling for OpenAI connector issues
          this.logger.error('OpenAI connector not available', { error });
          res.status(503).json({
            error: 'Service temporarily unavailable',
            message: 'The AI service is currently initializing. Please try again in a few moments.'
          });
          return;
        }
        
        // Re-throw for general error handling
        throw error;
      }
    } catch (error) {
      this.logger.error('Error analyzing meeting', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      res.status(500).json({
        error: 'An error occurred while analyzing the meeting',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Get meeting analysis status
   */
  async getMeetingAnalysisStatus(req: Request, res: Response): Promise<void> {
    try {
      const { meetingId } = req.params;
      const { executionId } = req.query;
      
      if (!meetingId) {
        res.status(400).json({ error: 'Meeting ID is required' });
        return;
      }
      
      if (!executionId) {
        res.status(400).json({ error: 'Execution ID is required' });
        return;
      }
      
      try {
        // Get the agent protocol (lazy initialization)
        const agentProtocol = this.getAgentProtocol();
        
        // Get the status using the agent protocol
        const result = await agentProtocol.getMeetingAnalysisStatus(String(executionId));
        
        const status = this.mapRunStatusToApiStatus(result.status);
        let progress = 50;
        
        // Map status to progress
        switch (status) {
          case 'completed':
          case 'failed':
          case 'canceled':
            progress = 100;
            break;
          case 'requires_action':
            progress = 75;
            break;
          case 'in_progress':
            progress = 50;
            break;
          case 'pending':
            progress = 25;
            break;
        }
        
        res.status(200).json({
          meetingId,
          status,
          progress,
          runId: result.runId,
          threadId: result.threadId,
          partialResults: result.results,
          metadata: result.metadata
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('OpenAI connector')) {
          // Special handling for OpenAI connector issues
          this.logger.error('OpenAI connector not available', { error });
          res.status(503).json({
            error: 'Service temporarily unavailable',
            message: 'The AI service is currently initializing. Please try again in a few moments.'
          });
          return;
        }
        
        // Re-throw for general error handling
        throw error;
      }
    } catch (error) {
      this.logger.error('Error getting meeting analysis status', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      res.status(500).json({
        error: 'An error occurred while getting meeting analysis status',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Get meeting analysis result
   */
  async getMeetingAnalysisResult(req: Request, res: Response): Promise<void> {
    try {
      const { meetingId } = req.params;
      const { executionId } = req.query;
      
      if (!meetingId) {
        res.status(400).json({ error: 'Meeting ID is required' });
        return;
      }
      
      if (!executionId) {
        res.status(400).json({ error: 'Execution ID is required' });
        return;
      }
      
      try {
        // Get the agent protocol (lazy initialization)
        const agentProtocol = this.getAgentProtocol();
        
        // Get the result using the agent protocol
        const result = await agentProtocol.getMeetingAnalysisStatus(String(executionId));
        
        // Only return results if the run is completed
        if (result.status !== 'completed') {
          res.status(200).json({
            meetingId,
            status: this.mapRunStatusToApiStatus(result.status),
            results: null,
            message: `Analysis is not yet complete (${result.status})`,
            runId: result.runId,
            threadId: result.threadId
          });
          return;
        }
        
        res.status(200).json({
          meetingId,
          status: 'completed',
          results: result.results,
          message: 'Analysis completed successfully',
          runId: result.runId,
          threadId: result.threadId
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('OpenAI connector')) {
          // Special handling for OpenAI connector issues
          this.logger.error('OpenAI connector not available', { error });
          res.status(503).json({
            error: 'Service temporarily unavailable',
            message: 'The AI service is currently initializing. Please try again in a few moments.'
          });
          return;
        }
        
        // Re-throw for general error handling
        throw error;
      }
    } catch (error) {
      this.logger.error('Error getting meeting analysis result', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      res.status(500).json({
        error: 'An error occurred while getting meeting analysis result',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Cancel meeting analysis
   */
  async cancelMeetingAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { meetingId } = req.params;
      const { executionId } = req.body;
      
      if (!meetingId) {
        res.status(400).json({ error: 'Meeting ID is required' });
        return;
      }
      
      if (!executionId) {
        res.status(400).json({ error: 'Execution ID is required' });
        return;
      }
      
      try {
        // Get the agent protocol (lazy initialization)
        const agentProtocol = this.getAgentProtocol();
        
        // Cancel the analysis using the agent protocol
        const cancelResponse = await agentProtocol.cancelMeetingAnalysis(executionId);
        
        res.status(200).json({
          meetingId,
          status: 'canceled',
          message: 'Analysis canceled successfully',
          runId: cancelResponse.id
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes('OpenAI connector')) {
          // Special handling for OpenAI connector issues
          this.logger.error('OpenAI connector not available', { error });
          res.status(503).json({
            error: 'Service temporarily unavailable',
            message: 'The AI service is currently initializing. Please try again in a few moments.'
          });
          return;
        }
        
        // Re-throw for general error handling
        throw error;
      }
    } catch (error) {
      this.logger.error('Error canceling meeting analysis', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      res.status(500).json({
        error: 'An error occurred while canceling meeting analysis',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Map Run Status to API Status
   */
  private mapRunStatusToApiStatus(runStatus: any): string {
    switch (runStatus) {
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'canceled':
        return 'canceled';
      case 'requires_action':
        return 'requires_action';
      case 'in_progress':
      case 'running':
        return 'in_progress';
      case 'pending':
      case 'queued':
        return 'pending';
      default:
        return 'unknown';
    }
  }
} 