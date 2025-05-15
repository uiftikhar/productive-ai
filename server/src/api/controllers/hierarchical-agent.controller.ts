import { Request, Response } from 'express';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { MeetingAnalysisSupervisorService } from '../../langgraph/agentic-meeting-analysis/services/meeting-analysis-supervisor.service';
import { MeetingAnalysisServiceRegistry } from '../../langgraph/agentic-meeting-analysis/services/service-registry';
import { FileStorageAdapter } from '../../langgraph/core/state/storage-adapters/file-storage.adapter';
import { PersistentStateManager } from '../../langgraph/core/state/persistent-state-manager';
import path from 'path';

/**
 * Hierarchical Agent Controller
 * 
 * Handles API endpoints for the hierarchical multi-agent system
 */
export class HierarchicalAgentController {
  private supervisorService: MeetingAnalysisSupervisorService;
  private logger = new ConsoleLogger();
  private persistentStateManager: PersistentStateManager;
  
  constructor() {
    // Set up service registry and ensure it's initialized
    const serviceRegistry = MeetingAnalysisServiceRegistry.getInstance({
      storageType: 'file',
      storagePath: process.env.STORAGE_PATH || path.join(process.cwd(), 'data', 'storage'),
      logger: this.logger
    });
    
    // Initialize service registry if not already done
    if (!serviceRegistry.isInitialized()) {
      this.logger.info('Initializing service registry...');
      serviceRegistry.initialize().catch(err => {
        this.logger.error('Error initializing service registry', { error: err });
      });
    }
    
    // Get the proper supervisor service using non-deprecated method
    this.supervisorService = serviceRegistry.getMeetingAnalysisSupervisor();
    
    // Set up persistent state manager if not available from service
    if (!serviceRegistry.hasService('persistentState')) {
      const storagePath = process.env.STORAGE_PATH || path.join(process.cwd(), 'data', 'storage');
      this.logger.info(`Setting up persistent state manager using Redis`);
      
      // Create Redis-based persistent state manager
      this.persistentStateManager = new PersistentStateManager({
        storageType: 'redis',
        namespace: 'meeting-analysis',
        redisOptions: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_DB || '0')
        },
        logger: this.logger
      });
      
      // Register the persistent state manager with the service registry
      serviceRegistry.registerService('persistentState', this.persistentStateManager);
    } else {
      this.persistentStateManager = serviceRegistry.getService('persistentState');
    }
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
      
      this.logger.info(`*********************** createAndStoreSession-SUCCESSFUL: Creating empty analysis session with ID: ${sessionId}`);
      
      // Try to verify the session using multiple methods
      let sessionVerified = false;
      let sessionData = null;
      
      // Method 1: Use the supervisor service (most reliable but might have key format issues)
      try {
        const supervisorSession = await this.supervisorService.getAnalysisSession(sessionId);
        if (supervisorSession) {
          sessionVerified = true;
          sessionData = supervisorSession;
          this.logger.info(`Session verified through supervisor service: ${sessionId}`);
        }
      } catch (verifyError) {
        this.logger.warn(`Error verifying session through supervisor: ${verifyError}`);
      }
      
      // Method 2: Check directly in persistent storage (if method 1 failed)
      if (!sessionVerified) {
        try {
          const directKey = `analysis_session:${sessionId}`;
          const hasDirectSession = await this.persistentStateManager.hasState(directKey);
          
          if (hasDirectSession) {
            const directSession = await this.persistentStateManager.loadState(directKey);
            if (directSession) {
              sessionVerified = true;
              sessionData = directSession;
              this.logger.info(`Session verified through direct persistent storage: ${sessionId}`);
            }
          }
        } catch (directError) {
          this.logger.warn(`Error verifying session through direct storage: ${directError}`);
        }
      }
      
      // Log verification results
      this.logger.info(`Session creation verification: ${sessionVerified ? 'Success' : 'Failed'}`);
      
      // Even if verification failed but we have no other errors, assume success
      // This is more user-friendly than failing completely, and the session might
      // still be accessible through one of our fallback methods
      
      // Return success with session ID
      res.status(201).json({
        status: 'created',
        sessionId,
        verified: sessionVerified,
        message: 'Analysis session created successfully'
      });
    } catch (error) {
      this.logger.error('Error creating session', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : String(error) 
      });
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
      
      // Enhanced validation for transcript
      if (!transcript) {
        res.status(400).json({
          status: 'error',
          message: 'Transcript is required'
        });
        return;
      }
      
      if (typeof transcript !== 'string') {
        res.status(400).json({
          status: 'error',
          message: 'Transcript must be a string'
        });
        return;
      }
      
      // Log transcript length and validate minimum size
      this.logger.info(`Starting analysis with transcript length: ${transcript.length}`);
      if (transcript.length < 50) {
        this.logger.warn(`Very short transcript detected (${transcript.length} chars): ${transcript.substring(0, 30)}...`);
        
        // For very short transcripts, provide a more helpful error message
        if (transcript.length < 10) {
          res.status(400).json({
            status: 'error',
            message: 'Transcript is too short for meaningful analysis (less than 10 characters)'
          });
          return;
        }
      }
      
      // Generate IDs for this analysis
      const sessionId = `session-${Date.now()}`;
      const meetingId = `meeting-${Date.now()}`;
      
      this.logger.info(`Starting analysis with sessionId: ${sessionId}, meetingId: ${meetingId}`);
      
      // Create and store session record with better data
      await this.createAndStoreSession(sessionId, meetingId);
      
      // Update session with transcript info before starting analysis
      await this.updateSessionBeforeAnalysis(sessionId, transcript, options);
      
      // Directly force an initial progress update with specific tasks in progress
      await this.updateSessionProgress(sessionId, { 
        overallProgress: 5, 
        taskStatuses: { 
          'initialization': 'completed',
          'transcript_validation': 'completed',
          'analysis_preparation': 'in_progress'
        } 
      });
      
      // Prepare transcript message to ensure it gets passed properly
      const transcriptMessage = {
        transcript,
        meetingId,
        sessionId,
        timestamp: Date.now(),
        options: {
          title: options.title || 'Meeting Analysis',
          description: options.description,
          participants: options.participants,
          analysisGoal: options.analysisGoal || 'comprehensive_analysis'
        }
      };
      
      // Log important information about the execution
      this.logger.info(`Starting hierarchical analysis with transcript (${transcript.length} chars), meetingId: ${meetingId}, sessionId: ${sessionId}`);
      this.logger.info(`Analysis goal: ${options.analysisGoal || 'comprehensive_analysis'}`);
      
      // Create a GraphDebuggerService to track execution
      try {
        const { GraphDebuggerService } = require('../../langgraph/agentic-meeting-analysis/services/graph-debugger.service');
        const graphDebugger = new GraphDebuggerService({ logger: this.logger });
        
        // Register the debugger with the service registry
        const serviceRegistry = MeetingAnalysisServiceRegistry.getInstance();
        serviceRegistry.registerService('graphDebugger', graphDebugger);
        
        this.logger.info('Graph debugger service initialized for execution tracking');
      } catch (err) {
        this.logger.warn(`Could not initialize graph debugger: ${err}`);
      }
      
      // Start the hierarchical analysis with more explicit transcript message
      this.logger.info(`Invoking supervisor service startHierarchicalAnalysis`);
      await this.supervisorService.startHierarchicalAnalysis(
        meetingId, 
        sessionId, 
        transcript, 
        {
          title: options.title || 'Meeting Analysis',
          description: options.description,
          participants: options.participants,
          analysisGoal: options.analysisGoal || 'comprehensive_analysis',
          onProgress: async (progress) => {
            // Enhanced progress logging
            this.logger.info(`Analysis progress update for ${sessionId}: ${progress.overallProgress}%`, {
              currentStep: progress.currentStep,
              completedNodes: progress.completedNodes,
              totalNodes: progress.totalNodes,
              goals: Array.isArray(progress.goals) ? progress.goals.length : 0
            });
            
            // Update the session progress with more complete data
            try {
              await this.updateSessionProgress(sessionId, progress);
            } catch (err) {
              this.logger.error(`Failed to update progress for session ${sessionId}:`, { error: err });
            }
          }
        }
      );
      
      // Return success response with session ID for status tracking
      res.status(200).json({
        status: 'processing',
        sessionId,
        meetingId,
        message: 'Analysis started successfully',
        estimatedCompletionTime: `${Math.ceil(transcript.length / 1000)} minutes` // Rough estimate
      });
    } catch (error) {
      this.logger.error('Error starting analysis', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace available'
      });
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };
  
  /**
   * Update session with transcript information before starting analysis
   */
  private async updateSessionBeforeAnalysis(sessionId: string, transcript: string, options: any): Promise<void> {
    try {
      // Load session
      const sessionKey = `analysis_session:${sessionId}`;
      const session = await this.persistentStateManager.loadState(sessionKey);
      
      if (!session) {
        this.logger.warn(`Cannot update session before analysis - session ${sessionId} not found`);
        return;
      }
      
      // Update metadata with transcript info
      const updatedSession = {
        ...session,
        status: 'processing', // Update status to processing
        metadata: {
          ...session.metadata,
          processingStartedAt: Date.now(),
          transcriptSubmitted: true,
          transcriptLength: transcript.length,
          analysisGoal: options.analysisGoal || 'comprehensive_analysis'
        }
      };
      
      // Save updated session
      await this.persistentStateManager.saveState(sessionKey, updatedSession);
      this.logger.debug(`Updated session ${sessionId} with transcript information`);
    } catch (error) {
      this.logger.error(`Error updating session ${sessionId} before analysis:`, { error });
    }
  }
  
  /**
   * Update session progress with more complete information
   */
  private async updateSessionProgress(sessionId: string, progress: any): Promise<void> {
    try {
      // Load session with key format that matches what we stored
      const sessionKey = `analysis_session:${sessionId}`;
      const session = await this.persistentStateManager.loadState(sessionKey);
      
      if (!session) {
        this.logger.warn(`Cannot update progress for non-existent session ${sessionId}`);
        return;
      }

      // Ensure progress is a number between 0-100
      const progressValue = Math.min(Math.max(progress.overallProgress || 0, 0), 100);
      
      this.logger.info(`Updating progress for session ${sessionId} to ${progressValue}%`);
      
      // Update both standard progress metrics and add task details
      const updatedSession = {
        ...session,
        status: progressValue >= 100 ? 'completed' : 'processing',
        progress: {
          ...session.progress,
          overallProgress: progressValue,
          taskStatuses: { ...session.progress.taskStatuses, ...progress.taskStatuses },
          currentStep: progress.currentStep || session.progress.currentStep,
          completedNodes: progress.completedNodes || session.progress.completedNodes,
          totalNodes: progress.totalNodes || session.progress.totalNodes,
          lastUpdated: Date.now()
        },
        metadata: {
          ...session.metadata,
          progress: progressValue, // Add progress to metadata for client
          status: progressValue >= 100 ? 'completed' : 'processing', // Also update status in metadata
          completedAt: progressValue >= 100 ? Date.now() : session.metadata.completedAt,
          currentStep: progress.currentStep || session.metadata.currentStep, // Also update in metadata for client
        }
      };
      
      // Save updated session
      await this.persistentStateManager.saveState(sessionKey, updatedSession);
      this.logger.debug(`Updated progress for session ${sessionId} to ${progressValue}%`);
      
      // Verify the update was successful
      const updatedStoredSession = await this.persistentStateManager.loadState(sessionKey);
      if (updatedStoredSession && updatedStoredSession.metadata && 
          updatedStoredSession.metadata.progress === progressValue) {
        this.logger.debug(`Progress update verification successful: ${sessionId} progress=${progressValue}%`);
      } else {
        this.logger.warn(`Progress update verification failed: ${sessionId} expected=${progressValue}%, actual=${
          updatedStoredSession?.metadata?.progress || 'unknown'
        }%`);
      }
    } catch (error) {
      this.logger.error(`Error updating session progress for ${sessionId}:`, { error });
    }
  }
  
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
          analysisGoal: 'comprehensive_analysis',
          transcriptSubmitted: false,
          transcriptLength: 0,
          progress: 0 // Always include progress in metadata for client
        },
        options: {
          analysisGoal: 'comprehensive_analysis'
        }
      };
      
      // Create key for persistent storage - use the full key format expected by getAnalysisSession
      const sessionKey = `analysis_session:${sessionId}`;
      
      this.logger.info(`Creating session with key: ${sessionKey}`);
      
      // Use the persistent state manager directly
      if (this.persistentStateManager && typeof this.persistentStateManager.saveState === 'function') {
        // Ensure persistent state manager is initialized
        if (typeof this.persistentStateManager.initialize === 'function') {
          try {
            await this.persistentStateManager.initialize();
          } catch (err) {
            // Ignore error if already initialized
            this.logger.debug('Error initializing persistent state manager, might be already initialized', { error: err });
          }
        }
        
        // Save the session using the correct key
        await this.persistentStateManager.saveState(sessionKey, session);
        this.logger.info(`Created session record for ${sessionId} with key ${sessionKey}`);
        
        // Create all possible meeting-to-session mappings to ensure supervisor can find them
        if (meetingId) {
          // The critical mapping: meetingId -> sessionId (without prefix)
          await this.persistentStateManager.saveState(`meeting:${meetingId}`, {
            sessionId,
            createdAt: Date.now()
          });
          this.logger.info(`Created primary meeting:${meetingId} -> ${sessionId} mapping`);
          
          // Additional mapping with state: prefix (used by some services)
          await this.persistentStateManager.saveState(`state:meeting:${meetingId}`, {
            sessionId,
            createdAt: Date.now()
          });
          this.logger.info(`Created secondary state:meeting:${meetingId} -> ${sessionId} mapping`);
        }

        // Always create a session self-reference mapping
        await this.persistentStateManager.saveState(`session:${sessionId}`, {
          sessionId,
          meetingId: meetingId || null,
          createdAt: Date.now()
        });
        this.logger.info(`Created session self-reference mapping: session:${sessionId}`);
        
        // Verify session exists in Redis using multiple patterns
        try {
          const patterns = [
            sessionKey,
            meetingId ? `meeting:${meetingId}` : undefined,
            meetingId ? `state:meeting:${meetingId}` : undefined,
            `session:${sessionId}`
          ].filter(Boolean) as string[];
          
          for (const pattern of patterns) {
            const exists = await this.persistentStateManager.hasState(pattern);
            this.logger.info(`Verification check for ${pattern}: ${exists ? 'EXISTS' : 'NOT FOUND'}`);
          }
        } catch (err: any) {
          this.logger.warn(`Error during verification checks: ${err.message}`);
        }
      } else {
        this.logger.error('Unable to save session state, persistent state manager not available');
        throw new Error('Persistent state manager not available');
      }
    } catch (error) {
      this.logger.error(`Error creating session ${sessionId}:`, { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : String(error)
      });
      throw error;
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
      
      // Log exactly which sessionId we're looking for
      this.logger.info(`Looking up session status for ID: ${sessionId}`);
      
      // Add more diagnostics about the persistent state manager
      if (!this.persistentStateManager) {
        this.logger.error('Persistent state manager is not available');
        res.status(500).json({
          status: 'error',
          message: 'Persistent state manager not available'
        });
        return;
      }
      
      // Try to find the session directly from Redis using the correct key format
      const sessionKey = `analysis_session:${sessionId}`;
      const hasSession = await this.persistentStateManager.hasState(sessionKey);
      
      if (hasSession) {
        this.logger.info(`Session found in persistent storage with key: ${sessionKey}`);
        const sessionData = await this.persistentStateManager.loadState(sessionKey);
        
        if (sessionData) {
          this.logger.info(`Successfully loaded session from persistent storage with key: ${sessionKey}`);
          
          // Get progress from the most reliable source
          const progressValue = (sessionData.metadata as any)?.progress !== undefined 
            ? (sessionData.metadata as any).progress 
            : (sessionData.progress?.overallProgress || 0);
          
          // Ensure consistent status representation
          const statusValue = sessionData.status || sessionData.metadata?.status || 'created';
          
          // Ensure metadata always has progress and status fields
          const metadata = {
            ...(sessionData.metadata || {}),
            progress: progressValue,
            status: statusValue
          };
          
          // Return standardized response
          res.status(200).json({
            sessionId,
            status: statusValue,
            progress: progressValue, // Top-level progress for backwards compatibility
            metadata
          });
          return;
        }
      }
      
      this.logger.warn(`Session not found directly in storage. Trying supervisor service...`);
      
      // Try supervisor service as fallback
      const session = await this.supervisorService.getAnalysisSession(sessionId);
      
      if (!session) {
        this.logger.warn(`Analysis session not found for ${sessionId} after all attempts`);
        res.status(404).json({
          status: 'error',
          message: 'Session not found'
        });
        return;
      }
      
      // Successfully found the session through supervisor
      this.logger.info(`Found session for ${sessionId} via supervisor`);
      
      // Get progress value from the most reliable source
      const progressValue = (session.metadata as any)?.progress !== undefined 
        ? (session.metadata as any).progress 
        : (session.progress?.overallProgress || 0);
      
      // Ensure metadata always has progress field
      const metadata = {
        ...(session.metadata || {}),
        progress: progressValue,
        status: session.status || 'created'
      };
      
      res.status(200).json({
        sessionId,
        status: session.status || 'created',
        progress: progressValue,
        metadata
      });
    } catch (error) {
      this.logger.error('Error getting session status', { 
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.stack : error
      });
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
      const session = await this.supervisorService.getAnalysisSession(sessionId);
      
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
      const meeting = await this.supervisorService.getMeeting(session.meetingId);
      
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
      const session = await this.supervisorService.getAnalysisSession(sessionId);
      
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
      await this.supervisorService.cancelAllPendingOperations();
      
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
    const session = await this.supervisorService.getAnalysisSession(sessionId);
    
    if (session) {
      // Create key
      const sessionKey = `analysis_session:${sessionId}`;
      
      // Update status
      const updatedSession = {
        ...session,
        status: status,
        endTime: Date.now()
      };
      
      // Use the persistent state manager directly
      if (this.persistentStateManager && typeof this.persistentStateManager.saveState === 'function') {
        await this.persistentStateManager.saveState(sessionKey, updatedSession);
      } else {
        this.logger.warn(`Cannot update session status: persistent state manager not available`);
      }
    }
  }
}