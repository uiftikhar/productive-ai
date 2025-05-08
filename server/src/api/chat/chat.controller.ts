import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ServiceRegistry } from '../../langgraph/agentic-meeting-analysis/services/service-registry';
import { UserMessage } from '../../langgraph/core/chat/chat-agent-interface';
import { ChatMessage } from '../../langgraph/agentic-meeting-analysis/services/message-store.service';
import { AnalysisGoalType } from '../../langgraph/agentic-meeting-analysis/interfaces/agent.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

// Error types for standardized API responses
enum ApiErrorType {
  BAD_REQUEST = 'BAD_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  CONFLICT = 'CONFLICT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

// Helper function to create standardized error responses
function createErrorResponse(res: Response, status: number, type: ApiErrorType, message: string, details?: any) {
  return res.status(status).json({
    error: {
      type,
      message,
      details: details || undefined
    }
  });
}

// Initialize the service registry
const logger = new ConsoleLogger();
const serviceRegistry = ServiceRegistry.getInstance({
  storageType: 'file',
  storagePath: process.env.STORAGE_PATH || './data',
  logger
});

// Initialize services
const supervisorCoordination = serviceRegistry.getSupervisorCoordinationService();
const sessionService = serviceRegistry.getSessionService();
const messageStore = serviceRegistry.getMessageStore();

// Ensure services are initialized
(async () => {
  try {
    await serviceRegistry.initialize();
    logger.info('Chat controller services initialized');
  } catch (error) {
    logger.error('Failed to initialize chat controller services', { error });
  }
})();

/**
 * Controller for chat-related API endpoints
 */
export const chatController = {
  /**
   * Create a new chat session
   */
  async createSession(req: Request, res: Response) {
    try {
      const { userId, metadata = {} } = req.body;

      if (!userId) {
        return createErrorResponse(
          res, 
          400, 
          ApiErrorType.BAD_REQUEST, 
          'User ID is required'
        );
      }

      // Create session using session service
      const session = await sessionService.createSession(userId, metadata);
      
      logger.info(`Created new chat session ${session.id} for user ${userId}`);
      
      // Return the session
      return res.status(201).json({
        id: session.id,
        userId: session.userId,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        metadata: session.metadata
      });
    } catch (error: any) {
      logger.error('Error creating session:', { error });
      return createErrorResponse(
        res,
        500,
        ApiErrorType.INTERNAL_ERROR,
        'Failed to create session',
        { message: error.message }
      );
    }
  },

  /**
   * Get session details
   */
  async getSession(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      
      // Get session from session service
      const session = await sessionService.getSession(sessionId);
      
      if (!session) {
        return createErrorResponse(
          res,
          404,
          ApiErrorType.NOT_FOUND,
          `Session ${sessionId} not found`
        );
      }
      
      // Return the session
      return res.status(200).json({
        id: session.id,
        userId: session.userId,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt,
        expiresAt: session.expiresAt,
        currentMeetingId: session.currentMeetingId,
        metadata: session.metadata
      });
    } catch (error: any) {
      logger.error('Error getting session:', { error });
      return createErrorResponse(
        res,
        500,
        ApiErrorType.INTERNAL_ERROR,
        'Failed to get session',
        { message: error.message }
      );
    }
  },

  /**
   * Send a message to a chat session
   */
  async sendMessage(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { content, role = 'user' } = req.body;
      
      if (!sessionId || !content) {
        return createErrorResponse(
          res, 
          400, 
          ApiErrorType.BAD_REQUEST, 
          'Session ID and message content are required'
        );
      }
      
      // Check if session exists
      const session = await sessionService.getSession(sessionId);
      if (!session) {
        return createErrorResponse(
          res, 
          404, 
          ApiErrorType.NOT_FOUND, 
          `Session ${sessionId} not found`
        );
      }
      
      // Create the message
      const message = await messageStore.createMessage({
        sessionId,
        content,
        role,
      });
      
      // Check if there's a meeting attached to this session
      const meetingId = session.currentMeetingId;
      
      if (meetingId) {
        try {
          // Get the analysis session
          const analysisSession = await supervisorCoordination.getAnalysisSessionForMeeting(meetingId);
          
          if (!analysisSession) {
            // No analysis session found, send a system message
            const systemResponse = await messageStore.createMessage({
              sessionId,
              content: 'No meeting transcript has been uploaded. Please upload a transcript first.',
              role: 'assistant'
            });
            
            return res.json(systemResponse);
          }
          
          // Process the message based on analysis state
          if (analysisSession.status === 'failed') {
            // Analysis failed, report the error
            const systemResponse = await messageStore.createMessage({
              sessionId,
              content: `Analysis failed: ${analysisSession.error?.message || 'Unknown error'}`,
              role: 'assistant'
            });
            
            return res.json(systemResponse);
          } else if (analysisSession.status === 'completed') {
            // TODO: Connect to LLM and provide full response based on analysis
            const assistantResponse = await messageStore.createMessage({
              sessionId,
              content: 'Analysis is complete! Here is what I found...',
              role: 'assistant'
            });
            
            return res.json(assistantResponse);
          } else {
            // Still in progress
            const progressResponse = await messageStore.createMessage({
              sessionId,
              content: `The analysis is still in progress (${analysisSession.progress.overallProgress}% complete). Please check back later.`,
              role: 'assistant'
            });
            
            return res.json(progressResponse);
          }
        } catch (analysisError: any) {
          logger.error('Error processing message:', { error: analysisError });
          
          return createErrorResponse(
            res,
            500,
            ApiErrorType.INTERNAL_ERROR,
            'Failed to process message',
            { message: analysisError.message }
          );
        }
      } else {
        // No meeting is attached to this session
        const systemResponse = await messageStore.createMessage({
          sessionId,
          content: 'No meeting transcript has been uploaded. Please upload a transcript first.',
          role: 'assistant'
        });
        
        return res.json(systemResponse);
      }
    } catch (error: any) {
      logger.error('Error sending message:', { error });
      
      return createErrorResponse(
        res,
        500,
        ApiErrorType.INTERNAL_ERROR,
        'Failed to send message',
        { message: error.message }
      );
    }
  },

  /**
   * Get messages for a chat session
   */
  async getMessages(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;
      const { limit, before, after } = req.query;
      
      if (!sessionId) {
        return createErrorResponse(
          res, 
          400,
          ApiErrorType.BAD_REQUEST, 
          'Session ID is required'
        );
      }
      
      // Convert query parameters
      const options: any = {};
      
      if (limit) {
        options.limit = parseInt(limit as string);
      }
      
      if (before) {
        options.before = parseInt(before as string);
      }
      
      if (after) {
        options.after = parseInt(after as string);
      }
      
      // Get messages with pagination
      const messages = await messageStore.getMessagesForSession(sessionId, options);
      
      // Return the messages directly
      return res.json(messages);
    } catch (error: any) {
      logger.error('Error retrieving messages', { error });
      
      return createErrorResponse(
        res,
        500,
        ApiErrorType.INTERNAL_ERROR,
        'Failed to retrieve messages',
        error
      );
    }
  },

  /**
   * Upload and process a transcript
   */
  async uploadTranscript(req: Request, res: Response) {
    try {
      const { transcript, title, description, participants, sessionId, userId } = req.body;
      
      if (!transcript) {
        return createErrorResponse(
          res, 
          400, 
          ApiErrorType.BAD_REQUEST, 
          'Transcript is required'
        );
      }
      
      if (!sessionId && !userId) {
        return createErrorResponse(
          res, 
          400, 
          ApiErrorType.BAD_REQUEST, 
          'Either sessionId or userId is required'
        );
      }
      
      // Get or create session
      let session;
      if (sessionId) {
        session = await sessionService.getSession(sessionId);
        if (!session) {
          return createErrorResponse(
            res,
            404,
            ApiErrorType.NOT_FOUND,
            `Session ${sessionId} not found`
          );
        }
      } else {
        session = await sessionService.createSession(userId);
      }
      
      // Create a meeting ID
      const meetingId = `meeting-${uuidv4()}`;
      
      // Initialize analysis using SupervisorCoordinationService
      const analysisInput = {
        meetingId,
        transcript,
        title: title || `Meeting transcript ${new Date().toISOString()}`,
        description: description || 'Uploaded via chat interface',
        participants,
        userId: session.userId,
        goals: [
          AnalysisGoalType.GENERATE_SUMMARY,
          AnalysisGoalType.EXTRACT_TOPICS,
          AnalysisGoalType.EXTRACT_ACTION_ITEMS
        ]
      };
      
      // Start analysis
      let analysisSession;
      try {
        analysisSession = await supervisorCoordination.initializeAnalysis(analysisInput);
      } catch (error: any) {
        logger.error('Error initializing analysis:', { error });
        // Create a minimal failed session object for the response
        analysisSession = {
          sessionId: `session-${uuidv4()}`,
          meetingId,
          status: 'failed',
          progress: {
            overallProgress: 0,
            goals: [],
            taskStatuses: {},
            started: Date.now(),
            lastUpdated: Date.now(),
            meetingId
          },
          startTime: Date.now(),
          endTime: Date.now(),
          error: {
            message: error.message,
            code: 'ANALYSIS_INITIALIZATION_ERROR'
          },
          metadata: {
            meetingId,
            title: title || `Meeting ${meetingId}`,
            participants: participants || []
          },
          options: {}
        };
        
        // Manually create the meeting to session mapping for failed sessions
        await supervisorCoordination['persistentState'].saveState(
          `meeting:${meetingId}`,
          {
            sessionId: analysisSession.sessionId,
            createdAt: analysisSession.startTime,
            metadata: {
              title: analysisSession.metadata.title,
              userId: session.userId,
              status: 'failed'
            }
          },
          { 
            ttl: 7 * 24 * 60 * 60, // 7 days TTL
            description: 'Meeting to session mapping (failed)'
          }
        );
      }
      
      // Update chat session with meeting info
      await sessionService.setCurrentMeeting(session.id, meetingId, analysisSession.sessionId);
      
      // Save a system message about the upload
      try {
        await messageStore.createMessage({
          sessionId: session.id,
          content: `Uploaded transcript "${title || 'Untitled meeting'}" for analysis. Analysis is now in progress.`,
          role: 'system',
          metadata: {
            meetingId,
            analysisSessionId: analysisSession.sessionId
          }
        });
      } catch (messageError: any) {
        logger.error('Error creating system message:', { messageError });
        // Continue without creating the message
      }
      
      // Return response with meeting and analysis details
      return res.status(201).json({
        meetingId,
        analysisSessionId: analysisSession.sessionId,
        status: analysisSession.status,
        progress: analysisSession.progress,
        sessionId: session.id,
        timestamp: Date.now()
      });
    } catch (error: any) {
      logger.error('Error uploading transcript:', { error });
      return createErrorResponse(
        res,
        500,
        ApiErrorType.INTERNAL_ERROR,
        'Failed to upload transcript',
        { message: error.message }
      );
    }
  },

  /**
   * Analyze a transcript
   */
  async analyzeTranscript(req: Request, res: Response) {
    try {
      const { meetingId } = req.params;
      const { sessionId, goals, options } = req.body;
      
      if (!sessionId) {
        return createErrorResponse(
          res, 
          400, 
          ApiErrorType.BAD_REQUEST, 
          'Session ID is required'
        );
      }
      
      // Validate session exists
      const session = await sessionService.getSession(sessionId);
      if (!session) {
        return createErrorResponse(
          res,
          404,
          ApiErrorType.NOT_FOUND,
          `Session ${sessionId} not found`
        );
      }
      
      // Check if analysis exists
      let analysisSession = await supervisorCoordination.getAnalysisSessionForMeeting(meetingId);
      
      if (!analysisSession) {
        return createErrorResponse(
          res,
          404,
          ApiErrorType.NOT_FOUND,
          `Analysis for meeting ${meetingId} not found`
        );
      }
      
      // Resume analysis if needed
      if (analysisSession.status !== 'completed') {
        analysisSession = await supervisorCoordination.resumeAnalysis(analysisSession.sessionId);
      }
      
      // Update chat session with meeting info
      await sessionService.setCurrentMeeting(sessionId, meetingId, analysisSession.sessionId);
      
      // Return analysis details
      return res.status(200).json({
        meetingId,
        analysisSessionId: analysisSession.sessionId,
        status: analysisSession.status,
        progress: analysisSession.progress
      });
    } catch (error: any) {
      logger.error('Error analyzing transcript:', { error });
      return createErrorResponse(
        res,
        500,
        ApiErrorType.INTERNAL_ERROR,
        'Failed to analyze transcript',
        { message: error.message }
      );
    }
  },

  /**
   * Get the current status of analysis
   */
  async getAnalysisStatus(req: Request, res: Response) {
    try {
      const { meetingId } = req.params;
      
      // Get analysis session for meeting
      const analysisSession = await supervisorCoordination.getAnalysisSessionForMeeting(meetingId);
      
      if (!analysisSession) {
        return createErrorResponse(
          res,
          404,
          ApiErrorType.NOT_FOUND,
          `Analysis for meeting ${meetingId} not found`
        );
      }
      
      // Return analysis status
      return res.status(200).json({
        meetingId,
        analysisSessionId: analysisSession.sessionId,
        status: analysisSession.status,
        progress: analysisSession.progress
      });
    } catch (error: any) {
      logger.error('Error getting analysis status:', { error });
      return createErrorResponse(
        res,
        500,
        ApiErrorType.INTERNAL_ERROR,
        'Failed to get analysis status',
        { message: error.message }
      );
    }
  },

  /**
   * Get related meetings
   */
  async getRelatedMeetings(req: Request, res: Response) {
    try {
      const { meetingId } = req.params;
      const { sessionId } = req.query;
      
      if (!sessionId) {
        return createErrorResponse(
          res, 
          400, 
          ApiErrorType.BAD_REQUEST, 
          'Session ID is required'
        );
      }
      
      // Validate session exists
      const session = await sessionService.getSession(sessionId as string);
      if (!session) {
        return createErrorResponse(
          res,
          404,
          ApiErrorType.NOT_FOUND,
          `Session ${sessionId} not found`
        );
      }
      
      // Get analysis session for meeting
      const analysisSession = await supervisorCoordination.getAnalysisSessionForMeeting(meetingId);
      
      if (!analysisSession) {
        return createErrorResponse(
          res,
          404,
          ApiErrorType.NOT_FOUND,
          `Analysis for meeting ${meetingId} not found`
        );
      }
      
      // Get related meetings
      const relatedMeetings = await supervisorCoordination.getRelatedMeetings(analysisSession.sessionId);
      
      // Return related meetings
      return res.status(200).json(relatedMeetings);
    } catch (error: any) {
      logger.error('Error getting related meetings:', { error });
      return createErrorResponse(
        res,
        500,
        ApiErrorType.INTERNAL_ERROR,
        'Failed to get related meetings',
        { message: error.message }
      );
    }
  }
}; 