import { Request, Response } from 'express';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import {MeetingAnalysisSupervisorService } from '../../langgraph/agentic-meeting-analysis/services/meeting-analysis-supervisor.service';
import { MeetingAnalysisServiceRegistry } from '../../langgraph/agentic-meeting-analysis/services/service-registry';

/**
 * Hierarchical Agent Controller
 * 
 * Handles API endpoints for the hierarchical multi-agent system
 */
export class HierarchicalAgentController {
  private supervisorCoordinationService: MeetingAnalysisSupervisorService;
  private logger = new ConsoleLogger();
  
  constructor() {
    // Get the supervisor coordination service from the registry
    const serviceRegistry = MeetingAnalysisServiceRegistry.getInstance();
    this.supervisorCoordinationService = serviceRegistry.getSupervisorCoordinationService();
  }

  /**
   * Create a new analysis session
   * @description Creates a new empty session for transcript analysis
   */
  public createSession = async (req: Request, res: Response): Promise<void> => {
    try {
      // Generate session ID
      const sessionId = `session-${Date.now()}`;
      
      this.logger.info(`Creating empty analysis session with ID: ${sessionId}`);
      
      // Create an empty session (without meeting ID)
      await this.createAndStoreSession(sessionId);
      
      // Verify session was created
      const sessionExists = await this.supervisorCoordinationService.getAnalysisSession(sessionId);
      this.logger.info(`Session creation verification: ${sessionExists ? 'Success' : 'Failed'}`);
      
      if (!sessionExists) {
        throw new Error('Failed to create session');
      }
      
      // Return success with session ID
      res.status(201).json({
        status: 'created',
        sessionId,
        message: 'Analysis session created successfully'
      });
    } catch (error) {
      this.logger.error('Error creating session', { error });
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };

  /**
   * Analyze a meeting transcript
   * @description Process a transcript using hierarchical agent system
   */
  public analyzeTranscript = async (req: Request, res: Response): Promise<void> => {
    try {
      // Extract transcript and options from request body
      const { transcript, options = {} } = req.body;
      
      // Validate transcript
      if (!transcript) {
        res.status(400).json({
          status: 'error',
          message: 'Transcript is required'
        });
        return;
      }
      
      // Generate IDs for this analysis
      const sessionId = `session-${Date.now()}`;
      const meetingId = `meeting-${Date.now()}`;
      
      this.logger.info(`Starting analysis with sessionId: ${sessionId}, meetingId: ${meetingId}`);
      
      // Create and store session record
      await this.createAndStoreSession(sessionId, meetingId);
      
      // Verify session was created
    const sessionExists = await this.supervisorCoordinationService.getAnalysisSession(sessionId);
      this.logger.info(`Session creation verification: ${sessionExists ? 'Success' : 'Failed'}`);
      
      // Start the hierarchical analysis
      await this.supervisorCoordinationService.startHierarchicalAnalysis(
        meetingId, 
        sessionId, 
        transcript, 
        {
          title: options.title || 'Meeting Analysis',
          description: options.description,
          participants: options.participants,
          analysisGoal: options.analysisGoal || 'comprehensive_analysis',
          onProgress: (progress) => {
            // Update the session progress
            this.updateSessionProgress(sessionId, progress).catch(err => {
              this.logger.error(`Failed to update progress for session ${sessionId}:`, { error: err });
            });
          }
        }
      );
      
      // Return success response with session ID for status tracking
      res.status(200).json({
        status: 'processing',
        sessionId,
        meetingId,
        message: 'Analysis started successfully'
      });
    } catch (error) {
      this.logger.error('Error starting analysis', { error });
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };
  
  /**
   * Create and store a new analysis session
   */
  private async createAndStoreSession(sessionId: string, meetingId?: string): Promise<void> {
    try {
      // Create session data structure according to the AnalysisSession interface
      const session = {
        sessionId,
        meetingId: meetingId || null,
        status: meetingId ? 'processing' : 'created',
        progress: {
          meetingId: meetingId || 'unknown-meeting',
          goals: [],
          taskStatuses: {},
          overallProgress: 0,
          started: Date.now(),
          lastUpdated: Date.now()
        },
        startTime: Date.now(),
        metadata: {
          createdAt: Date.now(),
          processingStartedAt: meetingId ? Date.now() : null,
          completedAt: null,
          analysisGoal: 'comprehensive_analysis'
        },
        options: {
          analysisGoal: 'comprehensive_analysis'
        }
      };
      
      // Create key for persistent storage - use the full key format expected by getAnalysisSession
      const sessionKey = `analysis_session:${sessionId}`;
      
      this.logger.info(`Creating session with key: ${sessionKey}`);
      
      // Get the persistent state manager and save
      const serviceRegistry = MeetingAnalysisServiceRegistry.getInstance();
      const persistentState = serviceRegistry.getService('persistentState');
      
      if (persistentState && typeof persistentState.saveState === 'function') {
        await persistentState.saveState(sessionKey, session);
        this.logger.info(`Created session record for ${sessionId} with key ${sessionKey}`);
        
        // Verify the session was saved
        const savedSession = await persistentState.loadState(sessionKey);
        if (savedSession) {
          this.logger.info(`Session verification successful: ${sessionId}`);
        } else {
          this.logger.error(`Session verification failed for ${sessionId}`);
        }
      } else {
        this.logger.error('Unable to save session state, persistent state service not available');
      }
    } catch (error) {
      this.logger.error(`Error creating session ${sessionId}:`, { error });
      throw error;
    }
  }
  
  /**
   * Update session progress
   */
  private async updateSessionProgress(sessionId: string, progress: any): Promise<void> {
    try {
      // Load session
      const session = await this.supervisorCoordinationService.getAnalysisSession(sessionId);
      
      if (session) {
        // Create key
        const sessionKey = `analysis_session:${sessionId}`;
        
        // Update progress
        const updatedSession = {
          ...session,
          progress: {
            ...session.progress,
            overallProgress: progress.overallProgress || session.progress.overallProgress,
            taskStatuses: { ...session.progress.taskStatuses, ...progress.taskStatuses },
            lastUpdated: Date.now()
          }
        };
        
        // Get the persistent state manager and save
        const serviceRegistry = MeetingAnalysisServiceRegistry.getInstance();
        const persistentState = serviceRegistry.getService('persistentState');
        
        if (persistentState && typeof persistentState.saveState === 'function') {
          await persistentState.saveState(sessionKey, updatedSession);
        }
      } else {
        this.logger.warn(`Cannot update progress for non-existent session ${sessionId}`);
      }
    } catch (error) {
      this.logger.error(`Error updating session progress for ${sessionId}:`, { error });
    }
  }
  
  /**
   * Get the status of an analysis session
   */
  public getSessionStatus = async (req: Request, res: Response): Promise<void> => {
    this.logger.info('***************getSessionStatus***************');
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        res.status(400).json({
          status: 'error',
          message: 'Session ID is required'
        });
        return;
      }
      
      // Get the analysis session
      let session = await this.supervisorCoordinationService.getAnalysisSession(sessionId);
      
      // If not found and the session ID doesn't have 'session-' prefix, try with the prefix
      if (!session && !sessionId.startsWith('session-')) {
        this.logger.debug(`Session not found for ${sessionId}, trying with session- prefix`);
        session = await this.supervisorCoordinationService.getAnalysisSession(`session-${sessionId}`);
      }
      
      // If still not found, return 404
      if (!session) {
        this.logger.warn(`Analysis session not found for ${sessionId}`);
        res.status(404).json({
          status: 'error',
          message: 'Session not found'
        });
        return;
      }
      
      res.status(200).json({
        sessionId,
        status: session.status,
        progress: session.progress.overallProgress || 0,
        metadata: session.metadata || {}
      });
    } catch (error) {
      this.logger.error('Error getting session status', { error, sessionId: req.params.sessionId });
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };
  
  /**
   * Get the results of an analysis session
   */
  public getSessionResult = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        res.status(400).json({
          status: 'error',
          message: 'Session ID is required'
        });
        return;
      }
      
      // Get the analysis session
      const session = await this.supervisorCoordinationService.getAnalysisSession(sessionId);
      
      if (!session) {
        res.status(404).json({
          status: 'error',
          message: 'Session not found'
        });
        return;
      }
      
      // Check if analysis is complete
      if (session.status !== 'completed') {
        res.status(200).json({
          sessionId,
          status: session.status,
          message: 'Analysis still in progress',
          progress: session.progress.overallProgress || 0
        });
        return;
      }
      
      // Get the meeting result
      const meeting = await this.supervisorCoordinationService.getMeeting(session.meetingId);
      
      res.status(200).json({
        sessionId,
        status: 'completed',
        results: meeting?.analysis?.results || null,
        metadata: session.metadata || {}
      });
    } catch (error) {
      this.logger.error('Error getting session results', { error, sessionId: req.params.sessionId });
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };
  
  /**
   * Cancel an ongoing analysis
   */
  public cancelAnalysis = async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        res.status(400).json({
          status: 'error',
          message: 'Session ID is required'
        });
        return;
      }
      
      // Get the analysis session
      const session = await this.supervisorCoordinationService.getAnalysisSession(sessionId);
      
      if (!session) {
        res.status(404).json({
          status: 'error',
          message: 'Session not found'
        });
        return;
      }
      
      // Only in-progress sessions can be canceled
      if (session.status !== 'in_progress' && session.status !== 'pending') {
        res.status(400).json({
          status: 'error',
          message: `Cannot cancel session with status ${session.status}`
        });
        return;
      }
      
      // Cancel all pending operations
      await this.supervisorCoordinationService.cancelAllPendingOperations();
      
      // Update session status
      await this.updateSessionStatus(sessionId, 'canceled');
      
      res.status(200).json({
        sessionId,
        status: 'canceled',
        message: 'Analysis canceled successfully'
      });
    } catch (error) {
      this.logger.error('Error canceling analysis', { error, sessionId: req.params.sessionId });
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };
  
  /**
   * Update session status
   */
  private async updateSessionStatus(sessionId: string, status: 'canceled'): Promise<void> {
    // Load session
    const session = await this.supervisorCoordinationService.getAnalysisSession(sessionId);
    
    if (session) {
      // Create key
      const sessionKey = `analysis_session:${sessionId}`;
      
      // Update status
      const updatedSession = {
        ...session,
        status: status,
        endTime: Date.now()
      };
      
      // Get the persistent state manager and save
      const serviceRegistry = MeetingAnalysisServiceRegistry.getInstance();
      const persistentState = serviceRegistry.getService('persistentState');
      
      if (persistentState && typeof persistentState.saveState === 'function') {
        await persistentState.saveState(sessionKey, updatedSession);
      }
    }
  }
} 