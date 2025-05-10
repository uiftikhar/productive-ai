/**
 * Meeting Analysis WebSocket Handler
 * 
 * Provides real-time updates for meeting analysis sessions
 */
import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { Logger } from '../../shared/logger/logger.interface';

// Define event types
export enum AnalysisSocketEvent {
  // Client events
  JOIN_SESSION = 'join_session',
  LEAVE_SESSION = 'leave_session',
  SUBMIT_TRANSCRIPT = 'submit_transcript',
  CANCEL_ANALYSIS = 'cancel_analysis',
  
  // Server events
  SESSION_JOINED = 'session_joined',
  SESSION_UPDATE = 'session_update',
  ANALYSIS_PROGRESS = 'analysis_progress',
  ANALYSIS_COMPLETE = 'analysis_complete',
  ANALYSIS_ERROR = 'analysis_error',
  TOPIC_DETECTED = 'topic_detected',
  ACTION_ITEM_DETECTED = 'action_item_detected',
  INSIGHT_DETECTED = 'insight_detected',
}

export interface AnalysisSocketMessage {
  type: AnalysisSocketEvent;
  sessionId: string;
  data?: any;
  timestamp: number;
}

export class MeetingAnalysisWebSocketHandler {
  private io: SocketIOServer;
  private logger: Logger;
  private activeConnections: Map<string, Set<string>> = new Map();
  private sessionEmitter: any; // This would be a central event emitter for analysis events
  
  constructor(server: HTTPServer, logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
    
    // Setup Socket.IO with CORS
    this.io = new SocketIOServer(server, {
      path: '/api/ws/analysis',
      cors: {
        origin: process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:8080',
        methods: ['GET', 'POST'],
        credentials: true
      }
    });
    
    this.initializeHandlers();
    this.logger.info('Meeting Analysis WebSocket handler initialized');
  }
  
  /**
   * Initialize WebSocket event handlers
   */
  private initializeHandlers() {
    this.io.on('connection', (socket: Socket) => {
      this.logger.info(`New WebSocket connection: ${socket.id}`);
      
      // Handle session subscription
      socket.on(AnalysisSocketEvent.JOIN_SESSION, (sessionId: string) => {
        this.handleJoinSession(socket, sessionId);
      });
      
      // Handle session unsubscription
      socket.on(AnalysisSocketEvent.LEAVE_SESSION, (sessionId: string) => {
        this.handleLeaveSession(socket, sessionId);
      });
      
      // Handle transcript submission
      socket.on(AnalysisSocketEvent.SUBMIT_TRANSCRIPT, (data: any) => {
        this.handleSubmitTranscript(socket, data);
      });
      
      // Handle analysis cancellation
      socket.on(AnalysisSocketEvent.CANCEL_ANALYSIS, (sessionId: string) => {
        this.handleCancelAnalysis(socket, sessionId);
      });
      
      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }
  
  /**
   * Handle a client joining a session
   */
  private handleJoinSession(socket: Socket, sessionId: string) {
    this.logger.info(`Client ${socket.id} joining session ${sessionId}`);
    
    // Add socket to the session room
    socket.join(sessionId);
    
    // Track the connection
    if (!this.activeConnections.has(sessionId)) {
      this.activeConnections.set(sessionId, new Set());
    }
    this.activeConnections.get(sessionId)?.add(socket.id);
    
    // Notify client they've joined
    socket.emit(AnalysisSocketEvent.SESSION_JOINED, {
      type: AnalysisSocketEvent.SESSION_JOINED,
      sessionId,
      data: { success: true },
      timestamp: Date.now()
    });
    
    // Notify other clients in the session
    socket.to(sessionId).emit(AnalysisSocketEvent.SESSION_UPDATE, {
      type: AnalysisSocketEvent.SESSION_UPDATE,
      sessionId,
      data: { clientJoined: socket.id },
      timestamp: Date.now()
    });
    
    // This is a placeholder for real implementation
    // We would normally check session status and send initial data
    this.simulateSessionProgress(sessionId);
  }
  
  /**
   * Handle a client leaving a session
   */
  private handleLeaveSession(socket: Socket, sessionId: string) {
    this.logger.info(`Client ${socket.id} leaving session ${sessionId}`);
    
    // Remove socket from the session room
    socket.leave(sessionId);
    
    // Update tracking
    this.activeConnections.get(sessionId)?.delete(socket.id);
    
    // Notify other clients
    socket.to(sessionId).emit(AnalysisSocketEvent.SESSION_UPDATE, {
      type: AnalysisSocketEvent.SESSION_UPDATE,
      sessionId,
      data: { clientLeft: socket.id },
      timestamp: Date.now()
    });
  }
  
  /**
   * Handle transcript submission through WebSocket
   */
  private handleSubmitTranscript(socket: Socket, data: any) {
    const { sessionId, transcript } = data;
    this.logger.info(`Received transcript for session ${sessionId} (length: ${transcript?.length || 0})`);
    
    // In a real implementation, this would submit the transcript to the analysis system
    // and then listeners would emit progress events
    
    // For now, simulate progress
    this.io.to(sessionId).emit(AnalysisSocketEvent.SESSION_UPDATE, {
      type: AnalysisSocketEvent.SESSION_UPDATE,
      sessionId,
      data: { status: 'processing', transcriptReceived: true },
      timestamp: Date.now()
    });
    
    this.simulateSessionProgress(sessionId);
  }
  
  /**
   * Handle analysis cancellation
   */
  private handleCancelAnalysis(socket: Socket, sessionId: string) {
    this.logger.info(`Client ${socket.id} cancelled analysis for session ${sessionId}`);
    
    // In a real implementation, this would signal the analysis system to cancel
    
    // Notify all clients in the session
    this.io.to(sessionId).emit(AnalysisSocketEvent.SESSION_UPDATE, {
      type: AnalysisSocketEvent.SESSION_UPDATE,
      sessionId,
      data: { status: 'cancelled', cancelledBy: socket.id },
      timestamp: Date.now()
    });
  }
  
  /**
   * Handle client disconnection
   */
  private handleDisconnect(socket: Socket) {
    this.logger.info(`WebSocket client disconnected: ${socket.id}`);
    
    // Remove client from all tracked sessions
    for (const [sessionId, clients] of this.activeConnections.entries()) {
      if (clients.has(socket.id)) {
        clients.delete(socket.id);
        
        // Notify other clients
        socket.to(sessionId).emit(AnalysisSocketEvent.SESSION_UPDATE, {
          type: AnalysisSocketEvent.SESSION_UPDATE,
          sessionId,
          data: { clientDisconnected: socket.id },
          timestamp: Date.now()
        });
      }
    }
  }
  
  /**
   * Send a message to all clients in a session
   */
  sendToSession(sessionId: string, message: AnalysisSocketMessage) {
    this.io.to(sessionId).emit(message.type, message);
  }
  
  /**
   * Broadcast analysis progress update
   */
  broadcastProgress(sessionId: string, progress: number, status: string) {
    this.io.to(sessionId).emit(AnalysisSocketEvent.ANALYSIS_PROGRESS, {
      type: AnalysisSocketEvent.ANALYSIS_PROGRESS,
      sessionId,
      data: { progress, status },
      timestamp: Date.now()
    });
  }
  
  /**
   * Broadcast analysis completion
   */
  broadcastCompletion(sessionId: string, results: any) {
    this.io.to(sessionId).emit(AnalysisSocketEvent.ANALYSIS_COMPLETE, {
      type: AnalysisSocketEvent.ANALYSIS_COMPLETE,
      sessionId,
      data: { results },
      timestamp: Date.now()
    });
  }
  
  /**
   * Broadcast detected topic
   */
  broadcastTopic(sessionId: string, topic: any) {
    this.io.to(sessionId).emit(AnalysisSocketEvent.TOPIC_DETECTED, {
      type: AnalysisSocketEvent.TOPIC_DETECTED,
      sessionId,
      data: { topic },
      timestamp: Date.now()
    });
  }
  
  /**
   * Broadcast detected action item
   */
  broadcastActionItem(sessionId: string, actionItem: any) {
    this.io.to(sessionId).emit(AnalysisSocketEvent.ACTION_ITEM_DETECTED, {
      type: AnalysisSocketEvent.ACTION_ITEM_DETECTED,
      sessionId,
      data: { actionItem },
      timestamp: Date.now()
    });
  }
  
  /**
   * Broadcast error
   */
  broadcastError(sessionId: string, error: any) {
    this.io.to(sessionId).emit(AnalysisSocketEvent.ANALYSIS_ERROR, {
      type: AnalysisSocketEvent.ANALYSIS_ERROR,
      sessionId,
      data: { error: error.message || 'Unknown error', code: error.code },
      timestamp: Date.now()
    });
  }
  
  /**
   * Simulate session progress for testing
   */
  private simulateSessionProgress(sessionId: string) {
    const totalSteps = 5;
    let currentStep = 0;
    
    const interval = setInterval(() => {
      currentStep++;
      const progress = Math.round((currentStep / totalSteps) * 100);
      
      // Broadcast progress
      this.broadcastProgress(sessionId, progress, `Processing step ${currentStep} of ${totalSteps}`);
      
      // Simulate topic detection around step 2
      if (currentStep === 2) {
        this.broadcastTopic(sessionId, {
          name: 'Project Updates',
          confidence: 0.92,
          keywords: ['milestone', 'deadline', 'progress']
        });
      }
      
      // Simulate action item detection around step 3
      if (currentStep === 3) {
        this.broadcastActionItem(sessionId, {
          description: 'Update project timeline document',
          assignee: 'Alice',
          dueDate: '2023-11-30',
          confidence: 0.88
        });
      }
      
      // Complete simulation
      if (currentStep >= totalSteps) {
        clearInterval(interval);
        
        // Simulate completion with results
        this.broadcastCompletion(sessionId, {
          topics: ['Project Updates', 'Timeline Discussion', 'Budget Concerns'],
          actionItems: [
            {
              description: 'Update project timeline document',
              assignee: 'Alice',
              dueDate: '2023-11-30'
            },
            {
              description: 'Schedule meeting with finance team',
              assignee: 'Bob',
              dueDate: '2023-11-15'
            }
          ],
          summary: 'Meeting covered project updates, timeline adjustments, and budget considerations. Several action items were assigned.'
        });
      }
    }, 1000); // Update every second
  }
}

// Create singleton for reuse
let meetingAnalysisWebSocket: MeetingAnalysisWebSocketHandler | null = null;

/**
 * Initialize WebSocket handler and attach to HTTP server
 */
export function initializeMeetingAnalysisWebSocket(server: HTTPServer, logger?: Logger) {
  if (!meetingAnalysisWebSocket) {
    meetingAnalysisWebSocket = new MeetingAnalysisWebSocketHandler(server, logger);
  }
  return meetingAnalysisWebSocket;
}

/**
 * Get the WebSocket handler instance
 */
export function getMeetingAnalysisWebSocket(): MeetingAnalysisWebSocketHandler | null {
  return meetingAnalysisWebSocket;
} 