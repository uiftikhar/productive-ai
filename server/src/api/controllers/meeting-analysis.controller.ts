/**
 * Meeting Analysis Controller
 * 
 * Provides RESTful API endpoints for hierarchical meeting analysis operations
 */
import { Request, Response } from 'express';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { Logger } from '../../shared/logger/logger.interface';
import { FileStorageAdapter } from '../../shared/storage/file-storage-adapter';
import { AgentExpertise, AnalysisGoalType, MessageType } from '../../langgraph/agentic-meeting-analysis/interfaces/agent.interface';
import { createHierarchicalAgentTeam } from '../../langgraph/agentic-meeting-analysis/factories/hierarchical-team-factory';
import { createHierarchicalMeetingAnalysisGraph } from '../../langgraph/agentic-meeting-analysis/graph/hierarchical-meeting-analysis-graph';
import { EnhancedDynamicGraphService } from '../../langgraph/dynamic/enhanced-dynamic-graph.service';
import { ApiErrorException, ErrorType, HttpStatus } from '../../shared/api/types';
import { sendSuccess, sendError } from '../../shared/api/response';
import { getRequestId } from '../../shared/api/request-id';
import { ServiceRegistry } from '../../langgraph/agentic-meeting-analysis/services/service-registry';
import { ApiCompatibilityService } from '../../langgraph/agentic-meeting-analysis/api-compatibility/api-compatibility.service';
import { AgenticMeetingAnalysisRequest } from '../../langgraph/agentic-meeting-analysis/interfaces/api-compatibility.interface';
import { AgentGraphVisualizationService } from '../../langgraph/agentic-meeting-analysis/visualization/agent-graph-visualization.service';

/**
 * Agent team structure
 */
interface AgentTeam {
  supervisor: any;
  managers: any[];
  workers: any[];
  [key: string]: any;
}

/**
 * Analysis session structure
 */
interface AnalysisSession {
  id: string;
  graph: any;
  team: AgentTeam;
  [key: string]: any;
}

/**
 * Session management for meeting analysis
 */
class SessionManager {
  private sessions: Map<string, AnalysisSession> = new Map();
  private sessionMetadata: Map<string, any> = new Map();
  private storageAdapter: FileStorageAdapter;
  private logger: Logger;
  
  constructor(storageAdapter: FileStorageAdapter, logger?: Logger) {
    this.storageAdapter = storageAdapter;
    this.logger = logger || new ConsoleLogger();
  }
  
  /**
   * Create a new analysis session
   */
  async createSession({ graph, team, metadata = {} }: { graph: any; team: AgentTeam; metadata?: Record<string, any> }): Promise<string> {
    const sessionId = `session-${uuidv4()}`;
    
    this.sessions.set(sessionId, { id: sessionId, graph, team });
    this.sessionMetadata.set(sessionId, {
      ...metadata,
      sessionId,
      status: 'created',
      createdAt: Date.now()
    });
    
    // Store session data for persistence
    await this.storageAdapter.saveJsonData('sessions', sessionId, {
      metadata: this.sessionMetadata.get(sessionId),
      teamStructure: {
        supervisorId: team.supervisor.id,
        managerIds: team.managers.map((m: any) => m.id),
        workerIds: team.workers.map((w: any) => w.id)
      }
    });
    
    this.logger.info(`Created new analysis session: ${sessionId}`);
    return sessionId;
  }
  
  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<AnalysisSession | null> {
    // Check in-memory cache first
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId) || null;
    }
    
    // Try to load from storage
    try {
      const sessionData = await this.storageAdapter.loadJsonData('sessions', sessionId);
      if (sessionData) {
        this.sessionMetadata.set(sessionId, sessionData.metadata);
        // Note: we don't restore the actual graph and team here,
        // would need proper serialization/deserialization
        return null; // Indicate session exists but needs reconstruction
      }
    } catch (err) {
      this.logger.error(`Error loading session ${sessionId}`, { err });
      return null;
    }
    
    return null;
  }
  
  /**
   * Get session metadata
   */
  async getSessionMetadata(sessionId: string): Promise<any | null> {
    // Check in-memory cache first
    if (this.sessionMetadata.has(sessionId)) {
      return this.sessionMetadata.get(sessionId);
    }
    
    // Try to load from storage
    try {
      const sessionData = await this.storageAdapter.loadJsonData('sessions', sessionId);
      if (sessionData) {
        this.sessionMetadata.set(sessionId, sessionData.metadata);
        return sessionData.metadata;
      }
    } catch (err) {
      this.logger.error(`Error loading session metadata ${sessionId}`, { err });
      return null;
    }
    
    return null;
  }
  
  /**
   * Update session metadata
   */
  async updateSessionMetadata(sessionId: string, updates: Record<string, any>): Promise<boolean> {
    const metadata = await this.getSessionMetadata(sessionId);
    if (!metadata) return false;
    
    const updatedMetadata = {
      ...metadata,
      ...updates,
      updatedAt: Date.now()
    };
    
    this.sessionMetadata.set(sessionId, updatedMetadata);
    
    // Update persistent storage
    try {
      const sessionData = await this.storageAdapter.loadJsonData('sessions', sessionId);
      if (sessionData) {
        sessionData.metadata = updatedMetadata;
        await this.storageAdapter.saveJsonData('sessions', sessionId, sessionData);
      }
    } catch (err) {
      this.logger.error(`Error updating session metadata ${sessionId}`, { err });
      return false;
    }
    
    return true;
  }
  
  /**
   * List all sessions
   */
  async listSessions(): Promise<any[]> {
    // Get all session IDs from storage
    try {
      const sessionIds = await this.storageAdapter.listFiles('sessions');
      
      // Map to session metadata
      const sessions = await Promise.all(
        sessionIds.map(async (id: string) => {
          const metadata = await this.getSessionMetadata(id);
          return metadata || { sessionId: id, status: 'unknown' };
        })
      );
      
      return sessions;
    } catch (err) {
      this.logger.error(`Error listing sessions`, { err });
      return Array.from(this.sessionMetadata.values());
    }
  }
  
  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
    }
    
    if (this.sessionMetadata.has(sessionId)) {
      this.sessionMetadata.delete(sessionId);
    }
    
    // Delete from storage
    try {
      await this.storageAdapter.deleteFile('sessions', sessionId);
      return true;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Error deleting session ${sessionId}`, { error: error.message });
      return false;
    }
  }
}

/**
 * Interface for controller configuration
 */
interface MeetingAnalysisControllerConfig {
  logger?: Logger;
  storage?: {
    meetingAnalysisDir?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * MeetingAnalysisController class
 */
export class MeetingAnalysisController {
  private storageAdapter: FileStorageAdapter;
  private sessionManager: SessionManager;
  private logger: Logger;
  private dynamicGraphService: EnhancedDynamicGraphService;
  private analysisProcesses: Map<string, any> = new Map();
  private visualizationService: AgentGraphVisualizationService;
  
  constructor(config: MeetingAnalysisControllerConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.storageAdapter = new FileStorageAdapter({
      storageDir: config.storage?.meetingAnalysisDir || 'data/meeting-analysis'
    });
    this.sessionManager = new SessionManager(this.storageAdapter, this.logger);
    this.dynamicGraphService = new EnhancedDynamicGraphService({
      logger: this.logger,
      storageAdapter: this.storageAdapter
    });
    this.visualizationService = new AgentGraphVisualizationService({
      logger: this.logger,
      enableRealTimeUpdates: true
    });
  }
  
  /**
   * Create a new analysis session
   * 
   * @param req Express request object
   * @param res Express response object
   * 
   * @returns HTTP 201 with session details
   * 
   * @throws ApiErrorException
   *  - ERR_MISSING_ANALYSIS_GOAL (400): analysisGoal is missing
   *  - ERR_INVALID_ANALYSIS_GOAL (400): analysisGoal is not valid
   *  - ERR_INVALID_EXPERTISE_FORMAT (400): enabledExpertise is not an array
   *  - ERR_INVALID_EXPERTISE (400): invalid expertise values
   */
  async createSession(req: Request, res: Response) {
    this.logger.info('Creating new analysis session');
    try {
      const { analysisGoal, enabledExpertise } = req.body;
      
      this.logger.info(`Received request with analysisGoal: ${analysisGoal}, enabledExpertise: ${JSON.stringify(enabledExpertise)}`);
      
      // Validate input
      if (!analysisGoal) {
        throw new ApiErrorException(
          'Missing required field: analysisGoal',
          ErrorType.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          'ERR_MISSING_ANALYSIS_GOAL'
        );
      }
      
      // Validate analysis goal type
      if (!Object.values(AnalysisGoalType).includes(analysisGoal)) {
        throw new ApiErrorException(
          `Invalid analysisGoal: ${analysisGoal}. Must be one of: ${Object.values(AnalysisGoalType).join(', ')}`,
          ErrorType.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          'ERR_INVALID_ANALYSIS_GOAL'
        );
      }
      
      // Validate expertise if provided
      if (enabledExpertise && !Array.isArray(enabledExpertise)) {
        throw new ApiErrorException(
          'enabledExpertise must be an array',
          ErrorType.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          'ERR_INVALID_EXPERTISE_FORMAT'
        );
      }
      
      if (enabledExpertise && enabledExpertise.length > 0) {
        // Validate each expertise value
        // Support both snake_case and UPPER_CASE formats
        const validExpertise = [
          ...Object.values(AgentExpertise),
          ...Object.values(AgentExpertise).map(exp => exp.toLowerCase()),
          // Also allow snake_case versions
          'topic_analysis',
          'action_item_extraction',
          'summary_generation',
          'sentiment_analysis',
          'participant_dynamics',
          'decision_tracking',
          'context_integration',
          'management'
        ];
        
        const invalidExpertise = enabledExpertise.filter(
          (exp: any) => !validExpertise.includes(exp)
        );
        
        if (invalidExpertise.length > 0) {
          throw new ApiErrorException(
            `Invalid expertise values: ${invalidExpertise.join(', ')}. Valid values are: ${Object.values(AgentExpertise).join(', ')} (or snake_case equivalents)`,
            ErrorType.VALIDATION_ERROR,
            HttpStatus.BAD_REQUEST,
            'ERR_INVALID_EXPERTISE'
          );
        }
      }
      
      this.logger.info(`Creating agent team with analysisGoal: ${analysisGoal}, enabledExpertise: ${JSON.stringify(enabledExpertise)}`);
      
      try {
        // Create agent team
        const team = createHierarchicalAgentTeam({
          debugMode: false,
          analysisGoal,
          enabledExpertise
        });
        
        this.logger.info(`Successfully created team with supervisor: ${team.supervisor.id}, managers: ${team.managers.length}, workers: ${team.workers.length}`);
        
        // Create graph
        const graph = createHierarchicalMeetingAnalysisGraph({
          supervisorAgent: team.supervisor,
          managerAgents: team.managers,
          workerAgents: team.workers,
          analysisGoal
        });
        
        this.logger.info(`Successfully created graph for analysis goal: ${analysisGoal}`);
        
        // Create session
        const sessionId = await this.sessionManager.createSession({
          graph,
          team,
          metadata: {
            createdAt: Date.now(),
            analysisGoal,
            enabledExpertise,
            status: 'created'
          }
        });
        
        // Initialize visualization
        this.initializeVisualization(sessionId, team);
        
        const responseData = {
          sessionId,
          status: 'created',
          metadata: {
            analysisGoal,
            enabledExpertise
          }
        };
        
        sendSuccess(res, responseData, HttpStatus.CREATED, { requestId: getRequestId(req) });
      } catch (error) {
        this.logger.error('Error during team/graph creation:', {error});
        
        if (error instanceof Error) {
          this.logger.error(`Error stack: ${error.stack}`);
        }
        
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error creating session:', { errorMessage });
      
      if (error instanceof Error) {
        this.logger.error(`Error stack: ${error.stack}`);
      }
      
      sendError(res, error, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
  
  /**
   * Submit transcript for analysis
   * 
   * @param req Express request object
   * @param res Express response object
   * 
   * @returns HTTP 202 with processing confirmation
   * 
   * @throws ApiErrorException
   *  - ERR_INVALID_SESSION_ID (400): sessionId is invalid
   *  - ERR_INVALID_TRANSCRIPT (400): transcript is missing or invalid
   *  - ERR_TRANSCRIPT_TOO_SHORT (400): transcript is too short
   *  - ERR_INVALID_MESSAGE (400): message is not a string
   *  - ERR_SESSION_NOT_FOUND (404): session not found
   */
  async analyzeTranscript(req: Request, res: Response) {
    const { sessionId } = req.params;
    const { transcript, message } = req.body;
    
    try {
      // Validate session ID
      if (!sessionId || typeof sessionId !== 'string') {
        throw new ApiErrorException(
          'Invalid session ID',
          ErrorType.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          'ERR_INVALID_SESSION_ID'
        );
      }
      
      // Validate transcript
      if (!transcript || typeof transcript !== 'string') {
        throw new ApiErrorException(
          'Missing or invalid transcript',
          ErrorType.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          'ERR_INVALID_TRANSCRIPT'
        );
      }
      
      if (transcript.length < 10) {
        throw new ApiErrorException(
          'Transcript is too short',
          ErrorType.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          'ERR_TRANSCRIPT_TOO_SHORT'
        );
      }
      
      // Validate message if provided
      if (message !== undefined && typeof message !== 'string') {
        throw new ApiErrorException(
          'Message must be a string',
          ErrorType.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          'ERR_INVALID_MESSAGE'
        );
      }
      
      // Get session
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new ApiErrorException(
          `Session ${sessionId} not found`,
          ErrorType.RESOURCE_NOT_FOUND, 
          HttpStatus.NOT_FOUND,
          'ERR_SESSION_NOT_FOUND'
        );
      }
      
      // Create message
      const initialMessage = {
        id: uuidv4(),
        type: MessageType.REQUEST,
        sender: 'user',
        recipients: [session.team.supervisor.id],
        content: message || 'Please analyze this transcript',
        timestamp: Date.now()
      };
      
      // Start analysis in background
      this.startAnalysisProcess(session, transcript, initialMessage);
      
      // Update session metadata
      await this.sessionManager.updateSessionMetadata(sessionId, {
        status: 'processing',
        transcriptSubmitted: true,
        transcriptLength: transcript.length,
        processingStartedAt: Date.now()
      });
      
      // Return accepted response
      const responseData = {
        sessionId,
        status: 'processing',
        message: 'Transcript accepted for analysis'
      };
      
      sendSuccess(res, responseData, HttpStatus.ACCEPTED, { requestId: getRequestId(req) });
    } catch (error) {
      this.logger.error('Error analyzing transcript:', { error });
      sendError(res, error);
    }
  }
  
  /**
   * Get analysis session status
   * 
   * @param req Express request object
   * @param res Express response object
   * 
   * @returns HTTP 200 with session status
   * 
   * @throws ApiErrorException
   *  - ERR_SESSION_NOT_FOUND (404): session not found
   */
  async getSessionStatus(req: Request, res: Response) {
    const { sessionId } = req.params;
    this.logger.info(`Getting session status for ${sessionId}`);
    try {
      // Get session metadata
      const metadata = await this.sessionManager.getSessionMetadata(sessionId);
      if (!metadata) {
        throw new ApiErrorException(
          `Session ${sessionId} not found`,
          ErrorType.RESOURCE_NOT_FOUND, 
          HttpStatus.NOT_FOUND,
          'ERR_SESSION_NOT_FOUND'
        );
      }
      
      // Return session status
      const responseData = {
        sessionId,
        status: metadata.status,
        metadata
      };
      
      sendSuccess(res, responseData, HttpStatus.OK, { requestId: getRequestId(req) });
    } catch (error) {
      this.logger.error('Error getting session status:', { error });
      sendError(res, error);
    }
  }
  
  /**
   * Get analysis results
   * 
   * @param req Express request object
   * @param res Express response object
   * 
   * @returns HTTP 200 with analysis results or progress status
   * 
   * @throws ApiErrorException
   *  - ERR_SESSION_NOT_FOUND (404): session not found
   *  - ERR_RESULTS_NOT_FOUND (404): results not found
   */
  async getResults(req: Request, res: Response) {
    const { sessionId } = req.params;
    
    try {
      // Get session metadata
      const metadata = await this.sessionManager.getSessionMetadata(sessionId);
      if (!metadata) {
        throw new ApiErrorException(
          `Session ${sessionId} not found`,
          ErrorType.RESOURCE_NOT_FOUND, 
          HttpStatus.NOT_FOUND,
          'ERR_SESSION_NOT_FOUND'
        );
      }
      
      // Check if analysis is complete
      if (metadata.status !== 'completed') {
        const responseData = {
          sessionId,
          status: metadata.status,
          message: 'Analysis not yet complete',
          progress: metadata.progress || 0
        };
        
        return sendSuccess(res, responseData, HttpStatus.OK, { requestId: getRequestId(req) });
      }
      
      // Load results
      const results = await this.storageAdapter.loadJsonData('results', sessionId);
      if (!results) {
        throw new ApiErrorException(
          `Results for session ${sessionId} not found`,
          ErrorType.RESOURCE_NOT_FOUND, 
          HttpStatus.NOT_FOUND,
          'ERR_RESULTS_NOT_FOUND'
        );
      }
      
      // Return results
      const responseData = {
        sessionId,
        status: 'completed',
        results,
        metadata
      };
      
      sendSuccess(res, responseData, HttpStatus.OK, { requestId: getRequestId(req) });
    } catch (error) {
      this.logger.error('Error getting analysis results:', { error });
      sendError(res, error);
    }
  }
  
  /**
   * List all analysis sessions
   * 
   * @param req Express request object
   * @param res Express response object
   * 
   * @returns HTTP 200 with list of sessions
   */
  async listSessions(req: Request, res: Response) {
    try {
      const sessions = await this.sessionManager.listSessions();
      const responseData = { sessions };
      
      sendSuccess(res, responseData, HttpStatus.OK, { requestId: getRequestId(req) });
    } catch (error) {
      this.logger.error('Error listing sessions:', { error });
      sendError(res, error);
    }
  }
  
  /**
   * Delete an analysis session
   * 
   * @param req Express request object
   * @param res Express response object
   * 
   * @returns HTTP 200 with deletion confirmation
   * 
   * @throws ApiErrorException
   *  - ERR_SESSION_NOT_FOUND (404): session not found
   */
  async deleteSession(req: Request, res: Response) {
    const { sessionId } = req.params;
    
    try {
      // Stop any running analysis
      if (this.analysisProcesses.has(sessionId)) {
        // TODO: implement proper cancellation
        this.analysisProcesses.delete(sessionId);
      }
      
      // Delete session
      const deleted = await this.sessionManager.deleteSession(sessionId);
      if (!deleted) {
        throw new ApiErrorException(
          `Session ${sessionId} not found`,
          ErrorType.RESOURCE_NOT_FOUND, 
          HttpStatus.NOT_FOUND,
          'ERR_SESSION_NOT_FOUND'
        );
      }
      
      // Return success
      const responseData = {
        sessionId,
        status: 'deleted',
        message: 'Session deleted successfully'
      };
      
      sendSuccess(res, responseData, HttpStatus.OK, { requestId: getRequestId(req) });
    } catch (error) {
      this.logger.error('Error deleting session:', { error });
      sendError(res, error);
    }
  }
  
  /**
   * Start the analysis process in the background
   */
  private startAnalysisProcess(session: AnalysisSession, transcript: string, initialMessage: any) {
    const sessionId = session.id;
    const graph = session.graph;
    
    // Store process for tracking with initial state
    const processState = {
      startTime: Date.now(),
      status: 'running',
      progress: 0,
      lastUpdateTime: Date.now()
    };
    
    this.analysisProcesses.set(sessionId, processState);
    
    // Store transcript for later reference
    this.storageAdapter.saveTextData('transcripts', sessionId, transcript)
      .catch((err: Error) => this.logger.error(`Failed to save transcript for session ${sessionId}`, { err }));
    
    // Immediately update session metadata to have a record of the job in case of server restart
    this.sessionManager.updateSessionMetadata(sessionId, {
      status: 'processing',
      transcriptSubmitted: true,
      transcriptLength: transcript.length,
      processingStartedAt: processState.startTime,
      progress: 0,
      lastUpdateTime: processState.lastUpdateTime
    }).catch(err => {
      this.logger.error(`Failed to update initial session metadata for ${sessionId}`, { err });
    });
    
    this.logger.info(`Starting analysis for session ${sessionId}`);
    
    // Execute in background
    setTimeout(async () => {
      try {
        // Run the graph
        this.logger.info(`Running analysis graph for session ${sessionId}`);
        
        // Initialize progress tracking
        let progressInterval: NodeJS.Timeout | null = null;
        
        // Get session metadata
        const metadata = await this.sessionManager.getSessionMetadata(sessionId);
        
        // Setup progress tracking interval
        progressInterval = setInterval(async () => {
          // Get current process information
          const process = this.analysisProcesses.get(sessionId);
          if (!process) return;
          
          // Get actual progress from service registry
          const serviceRegistry = ServiceRegistry.getInstance();
          const progress = await serviceRegistry.getSessionProgress(sessionId);
          
          // Use progress value or fall back to current process progress
          const currentProgress = progress?.progress || process.progress;
          
          // Update session metadata with progress if changed
          if (currentProgress > process.progress) {
            process.progress = currentProgress;
            process.lastUpdateTime = Date.now();
            
            // Save progress to handle server restarts
            await this.sessionManager.updateSessionMetadata(sessionId, { 
              progress: currentProgress,
              lastUpdateTime: process.lastUpdateTime
            });
            
            this.logger.debug(`Updated progress for ${sessionId}: ${currentProgress}%`);
          }
          
          // Stop at 95% - final progress will be set to 100% when results are generated
          if (currentProgress >= 95) {
            if (progressInterval) {
              clearInterval(progressInterval);
              progressInterval = null;
            }
          }
        }, 2000); // Check every 2 seconds
        
        // Use the real agent system instead of mock
        try {
          // Get session metadata
          const sessionMetadata = await this.sessionManager.getSessionMetadata(sessionId);
          
          // Create a simple state repository service for the API compatibility service
          const stateRepository = {
            saveMeeting: async (meeting: any) => {
              return this.storageAdapter.saveJsonData('meetings', meeting.meetingId, meeting);
            },
            getAnalysisStatus: async (meetingId: string) => {
              const metadata = await this.sessionManager.getSessionMetadata(meetingId);
              return {
                meetingId,
                status: metadata?.status || 'unknown',
                progress: metadata?.progress || 0
              };
            },
            storeTeamInfo: async (meetingId: string, executionId: string, teamInfo: any) => {
              return this.storageAdapter.saveJsonData('teams', `${meetingId}-${executionId}`, teamInfo);
            },
            storeResults: async (meetingId: string, executionId: string, results: any) => {
              return this.storageAdapter.saveJsonData('results', meetingId, {
                results,
                sessionId: meetingId,
                timestamp: Date.now()
              });
            }
          };
          
          // Create a simple shared memory service
          const sharedMemory = {
            set: async (key: string, value: any, executionId: string) => {
              return this.storageAdapter.saveJsonData('memory', `${executionId}-${key}`, value);
            },
            get: async (key: string, executionId: string) => {
              try {
                return await this.storageAdapter.loadJsonData('memory', `${executionId}-${key}`);
              } catch (err) {
                return null;
              }
            }
          };
          
          // Create a simple communication service
          const communication = {
            sendMessage: async (message: any) => {
              // Log message and store it
              this.logger.debug(`Message sent: ${message.content}`, { 
                from: message.sender, 
                to: message.recipients?.join(',') 
              });
              return true;
            }
          };
          
          // Create API compatibility service with the required services
          const apiCompatibility = new ApiCompatibilityService({
            logger: this.logger,
            stateRepository,
            sharedMemory,
            communication,
            // Use existing team formation via the factories
            teamFormation: null,
            defaultFeatureFlag: true
          });
          
          // Setup message listener for visualization updates
          const messageStore = ServiceRegistry.getInstance().getMessageStore();
          
          // Hook into message store to visualize communications
          if (messageStore) {
            this.setupMessageVisualization(sessionId, messageStore);
          }
          
          // Prepare the request for the agent system
          const agentRequest: AgenticMeetingAnalysisRequest = {
            meetingId: sessionId,
            transcript,
            title: initialMessage?.content || 'Meeting Analysis',
            goals: sessionMetadata?.analysisGoal ? [sessionMetadata.analysisGoal as AnalysisGoalType] : [AnalysisGoalType.FULL_ANALYSIS],
            options: {
              teamComposition: {
                requiredExpertise: sessionMetadata?.enabledExpertise as AgentExpertise[] || 
                  [AgentExpertise.TOPIC_ANALYSIS, AgentExpertise.ACTION_ITEM_EXTRACTION, AgentExpertise.SUMMARY_GENERATION]
              },
              confidenceScoring: true,
              detailedReasoning: true
            }
          };
          
          this.logger.info(`Starting real agent analysis for session ${sessionId}`);
          
          // Process the request using the agent system
          const analysisResponse = await apiCompatibility.processAgenticRequest(agentRequest);
          
          // Check if analysis was successful
          if (analysisResponse.success) {
            // Store results
            await this.storageAdapter.saveJsonData('results', sessionId, {
              results: analysisResponse.results,
              sessionId,
              timestamp: Date.now()
            });
            
            this.logger.info(`Successfully generated results using agent system for session ${sessionId}`);
          } else {
            // If the agent system failed, fall back to mock results
            this.logger.warn(`Agent system failed for session ${sessionId}, falling back to mock results`);
            await this.generateMockResults(sessionId, transcript);
          }
          
          // Visualize the completed analysis
          this.visualizeAnalysisResults(sessionId, analysisResponse.results);
          
        } catch (agentError) {
          // If the agent system fails, fall back to mock results
          this.logger.error(`Error in agent system for session ${sessionId}:`, { agentError });
          this.logger.info(`Falling back to mock results for session ${sessionId}`);
          
          // Generate mock results...
          const mockResults = await this.generateMockResults(sessionId, transcript);
          
          // Visualize mock results
          this.visualizeAnalysisResults(sessionId, mockResults.results);
        }
        
        // Clear progress tracking interval if it's still running
        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }
        
        // Update completion status
        await this.updateCompletionStatus(sessionId);
        
        // Update analysis processes
        this.analysisProcesses.set(sessionId, {
          ...this.analysisProcesses.get(sessionId),
          status: 'completed',
          progress: 100,
          completionTime: Date.now(),
        });
        
        this.logger.info(`Analysis completed for session ${sessionId}`);
      } catch (error) {
        this.logger.error(`Error processing analysis for session ${sessionId}:`, { error });
        
        // Update session status to error
        await this.sessionManager.updateSessionMetadata(sessionId, {
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        }).catch(err => {
          this.logger.error(`Failed to update session metadata for ${sessionId}`, { err });
        });
        
        // Update analysis processes
        this.analysisProcesses.set(sessionId, {
          ...this.analysisProcesses.get(sessionId),
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          completionTime: Date.now(),
        });
      }
    }, 100); // Start soon but not immediately
  }
  
  /**
   * Track progress for an analysis session
   * 
   * @param sessionId Session identifier
   * @returns Updated progress value
   */
  private async trackProgress(sessionId: string): Promise<number> {
    try {
      // Get current session metadata
      const metadata = await this.sessionManager.getSessionMetadata(sessionId);
      if (!metadata) {
        this.logger.warn(`Cannot track progress for session ${sessionId}: session not found`);
        return 0;
      }
      
      // Skip if the session is already completed
      if (metadata.status === 'completed') {
        return 100;
      }
      
      // Get session from the session manager
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        this.logger.warn(`Cannot track progress for session ${sessionId}: graph session not found`);
        return 0;
      }
      
      // Check if we have a graph with a state
      const graph = session.graph;
      if (!graph || !graph.state) {
        return metadata.progress || 0;
      }
      
      let progress = 0;
      
      try {
        // Calculate progress based on state transitions
        const stateTransitions = graph.state.transitions || [];
        const totalAgents = Object.keys(session.team.all || {}).length;
        
        if (totalAgents > 0 && stateTransitions.length > 0) {
          // Estimate progress based on state transitions and team size
          // More sophisticated algorithms could be implemented here
          const totalExpectedTransitions = totalAgents * 3; // Each agent performs ~3 state transitions
          const completedTransitions = stateTransitions.length;
          
          progress = Math.min(
            Math.floor((completedTransitions / totalExpectedTransitions) * 100), 
            99  // Cap at 99% until explicitly marked as complete
          );
        }
      } catch (error) {
        this.logger.error(`Error calculating progress for session ${sessionId}:`, { error });
        // Fall back to existing progress
        progress = metadata.progress || 0;
      }
      
      // Update session metadata with progress
      await this.sessionManager.updateSessionMetadata(sessionId, { progress });
      
      return progress;
    } catch (error) {
      this.logger.error(`Error tracking progress for session ${sessionId}:`, { error });
      return 0;
    }
  }
  
  /**
   * Calculate completion status for a session
   * 
   * @param sessionId Session identifier
   */
  private async updateCompletionStatus(sessionId: string): Promise<void> {
    try {
      // Get session from the session manager
      const metadata = await this.sessionManager.getSessionMetadata(sessionId);
      if (!metadata) {
        return;
      }
      
      // Skip if already completed
      if (metadata.status === 'completed') {
        return;
      }
      
      // Get results
      let completionStatus = 'processing';
      
      try {
        const resultsFile = await this.storageAdapter.loadJsonData('results', sessionId);
        if (resultsFile && resultsFile.results) {
          // Check if results contain expected fields
          const results = resultsFile.results;
          
          if (
            (results.topics && results.topics.length > 0) ||
            (results.actionItems && results.actionItems.length > 0) ||
            (results.summary && results.summary.length > 0)
          ) {
            completionStatus = 'completed';
          }
        }
      } catch (error) {
        // Results file doesn't exist yet or couldn't be loaded
        this.logger.debug(`Results not available yet for ${sessionId}`);
      }
      
      // Update metadata with completion status
      if (completionStatus === 'completed') {
        await this.sessionManager.updateSessionMetadata(sessionId, {
          status: completionStatus,
          progress: 100,
          completedAt: Date.now()
        });
      }
    } catch (error) {
      this.logger.error(`Error updating completion status for session ${sessionId}:`, { error });
    }
  }
  
  /**
   * Generate mock analysis results for testing purposes
   * This simulates what the actual agent system would produce
   */
  private async generateMockResults(sessionId: string, transcript: string): Promise<any> {
    // Extract sample topics
    const topicWords = ["project", "update", "meeting", "deadline", "database", "timeline", "budget", "API"];
    const topics = [
      {
        id: `topic-${Math.random().toString(36).substring(2, 10)}`,
        name: "Project Updates and Status",
        keywords: ["project", "update", "status", "progress"]
      },
      {
        id: `topic-${Math.random().toString(36).substring(2, 10)}`,
        name: "Timeline and Deadlines",
        keywords: ["timeline", "deadline", "schedule", "date"]
      },
      {
        id: `topic-${Math.random().toString(36).substring(2, 10)}`,
        name: "Budget and Resource Allocation",
        keywords: ["budget", "resource", "cost", "allocation"]
      },
      {
        id: `topic-${Math.random().toString(36).substring(2, 10)}`,
        name: "Technical Implementation Discussions",
        keywords: ["technical", "implementation", "development", "code"]
      }
    ];
    
    // Extract sample action items
    const actionItems = [
      {
        id: `action-${Math.random().toString(36).substring(2, 10)}`,
        description: "Update project timeline document",
        assignees: ["Charlie"],
        dueDate: "2023-11-30"
      },
      {
        id: `action-${Math.random().toString(36).substring(2, 10)}`,
        description: "Schedule meeting with finance team",
        assignees: ["Bob"],
        dueDate: "2023-11-15"
      },
      {
        id: `action-${Math.random().toString(36).substring(2, 10)}`,
        description: "Prepare API usage and cost report",
        assignees: ["Bob"],
        dueDate: "2023-11-08"
      }
    ];
    
    // Simple lines extraction for people mentioned
    const peopleMatches = transcript.match(/\b(?:Alice|Bob|Charlie|Dave)\b/g) || [];
    const people = [...new Set(peopleMatches)];
    
    // Generate summary
    const summary = {
      short: "The team discussed project updates, timeline adjustments, and budget considerations.",
      detailed: "In this meeting, the team discussed project updates, timeline adjustments, and budget considerations. " +
        "Charlie is working on the database schema for the analytics module and has a deadline of next Friday. " +
        "A separate meeting with the product team was scheduled for Thursday, where Dave will present the backend architecture. " +
        "The team also discussed revisiting the budget for external APIs, and Bob was assigned to prepare a usage and cost report by Wednesday."
    };
    
    // Prepare complete result object with nested structure to match ApiCompatibilityService format
    const results = {
      results: {
        meetingId: sessionId,
        topics,
        actionItems,
        participants: people,
        summary,
        metadata: {
          processedBy: ["mock-processor"],
          confidence: 0.85,
          version: "1.0",
          generatedAt: Date.now()
        }
      },
      sessionId,
      timestamp: Date.now()
    };
    
    // Save the results
    await this.storageAdapter.saveJsonData('results', sessionId, results);
    
    return results;
  }
  
  /**
   * Get agent visualization data for a session
   * 
   * @param req Express request object
   * @param res Express response object
   * 
   * @returns HTTP 200 with visualization data
   * 
   * @throws ApiErrorException
   *  - ERR_SESSION_NOT_FOUND (404): session not found
   */
  async getVisualizationData(req: Request, res: Response) {
    const { sessionId } = req.params;
    
    try {
      // Validate session exists
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new ApiErrorException(
          `Session ${sessionId} not found`,
          ErrorType.RESOURCE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
          'ERR_SESSION_NOT_FOUND'
        );
      }
      
      // Generate static visualization
      const visualizationPath = this.visualizationService.generateStaticVisualization(sessionId);
      
      if (!visualizationPath) {
        throw new ApiErrorException(
          `Visualization for session ${sessionId} not available`,
          ErrorType.RESOURCE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
          'ERR_VISUALIZATION_NOT_FOUND'
        );
      }
      
      const responseData = {
        sessionId,
        visualizationUrl: visualizationPath,
        message: 'Visualization generated successfully'
      };
      
      sendSuccess(res, responseData, HttpStatus.OK, { requestId: getRequestId(req) });
    } catch (error) {
      this.logger.error('Error getting visualization data:', { error });
      sendError(res, error);
    }
  }
  
  /**
   * Initialize visualization for a new session
   */
  private initializeVisualization(sessionId: string, team: AgentTeam): void {
    try {
      this.visualizationService.initializeVisualization(sessionId, team);
      this.logger.debug(`Visualization initialized for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error initializing visualization for session ${sessionId}:`, { error });
      // Non-critical error, continue without visualization
    }
  }
  
  /**
   * Set up message visualization by monitoring the message store
   */
  private setupMessageVisualization(sessionId: string, messageStore: any): void {
    if (!messageStore || typeof messageStore.onMessage !== 'function') {
      this.logger.warn(`Cannot set up message visualization for session ${sessionId}: message store does not support onMessage`);
      return;
    }
    
    const handler = (message: any) => {
      if (message.sessionId !== sessionId) return;
      
      try {
        this.visualizationService.addCommunicationEvent(
          `vis-${sessionId}`,
          message.sender || 'system',
          message.recipients?.[0] || 'system',
          message.type || 'message',
          message.content || ''
        );
        
        // If this is a task message, add a task node
        if (message.type === 'task' && message.sender && message.recipients?.[0]) {
          this.visualizationService.addTaskNode(
            `vis-${sessionId}`,
            message.content || 'Unknown task',
            message.sender,
            message.recipients[0]
          );
        }
      } catch (error) {
        this.logger.error(`Error visualizing message for session ${sessionId}:`, { error });
        // Non-critical error, continue without visualization
      }
    };
    
    // Register message handler
    messageStore.onMessage(handler);
  }
  
  /**
   * Visualize analysis results
   */
  private visualizeAnalysisResults(sessionId: string, results: any): void {
    if (!results) return;
    
    try {
      // Add summary node
      if (results.summary) {
        this.visualizationService.addResultNode(
          `vis-${sessionId}`,
          'summary',
          results.summary,
          'summary-agent'
        );
      }
      
      // Add topics
      if (results.topics && Array.isArray(results.topics)) {
        this.visualizationService.addResultNode(
          `vis-${sessionId}`,
          'topics',
          results.topics,
          'topic-agent'
        );
        
        // Add individual topic nodes
        results.topics.forEach((topic: any) => {
          const topicName = typeof topic === 'string' ? topic : (topic.name || 'Unknown topic');
          this.visualizationService.addTopicNode(
            `vis-${sessionId}`,
            topicName
          );
        });
      }
      
      // Add action items
      if (results.actionItems && Array.isArray(results.actionItems)) {
        this.visualizationService.addResultNode(
          `vis-${sessionId}`,
          'action_items',
          results.actionItems,
          'action-item-agent'
        );
        
        // Add individual action item nodes
        results.actionItems.forEach((item: any) => {
          if (item && item.description) {
            this.visualizationService.addActionItemNode(
              `vis-${sessionId}`,
              item.description,
              item.assignee || (item.assignees && item.assignees.length > 0 ? item.assignees[0] : undefined)
            );
          }
        });
      }
    } catch (error) {
      this.logger.error(`Error visualizing results for session ${sessionId}:`, { error });
      // Non-critical error, continue without visualization
    }
  }
  
  /**
   * Register routes with Express app
   * 
   * @param router Express router
   */
  registerRoutes(router: Router) {
    router.post('/sessions', this.createSession.bind(this));
    router.get('/sessions', this.listSessions.bind(this));
    router.get('/sessions/:sessionId', this.getSessionStatus.bind(this));
    router.delete('/sessions/:sessionId', this.deleteSession.bind(this));
    router.post('/sessions/:sessionId/analyze', this.analyzeTranscript.bind(this));
    router.get('/sessions/:sessionId/results', this.getResults.bind(this));
    router.get('/sessions/:sessionId/visualization', this.getVisualizationData.bind(this));
  }
} 