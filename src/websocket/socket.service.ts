import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { Logger } from '../shared/logger/logger.interface';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { ChatService } from '../chat/chat.service';
import { ChatMessage, ChatServiceError, ChatErrorType } from '../chat/chat.types';
import { isAuthenticated } from '../auth/middlewares/isAuthenticated';

export interface SocketUser {
  id: string;
  sessionIds: Set<string>;
}

// Define socket events
export enum SocketEvents {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
  JOIN_SESSION = 'join_session',
  LEAVE_SESSION = 'leave_session',
  NEW_MESSAGE = 'new_message',
  MESSAGE_RECEIVED = 'message_received',
  MESSAGE_RESPONSE = 'message_response',
  MESSAGE_TOKEN = 'message_token',
  TYPING_START = 'typing_start',
  TYPING_END = 'typing_end',
  READ_RECEIPT = 'read_receipt'
}

export interface MessagePayload {
  sessionId: string;
  content: string;
  metadata?: Record<string, any>;
}

/**
 * Socket.IO service for managing real-time communications
 */
export class SocketService {
  private io: Server;
  private logger: Logger;
  private users: Map<string, SocketUser> = new Map();
  private chatService: ChatService;
  
  constructor(
    server: HttpServer, 
    chatService: ChatService,
    logger?: Logger
  ) {
    this.logger = logger || new ConsoleLogger();
    this.chatService = chatService;
    
    // Initialize Socket.IO
    this.io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true
      },
      pingTimeout: 60000, // 60 seconds
      pingInterval: 25000, // 25 seconds
    });
    
    this.setupMiddleware();
    this.setupEventHandlers();
    
    this.logger.info('Socket.IO service initialized');
  }
  
  /**
   * Set up Socket.IO middleware for authentication and rate limiting
   */
  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use((socket, next) => {
      // Use the same authentication mechanism as Express
      const req = socket.request;
      
      // In test mode, bypass authentication
      if (process.env.TEST_MODE === 'true') {
        return next();
      }
      
      // Check if user is authenticated
      if (req.headers.authorization) {
        // Process JWT token or session authentication
        // This is a placeholder for actual auth logic
        next();
      } else {
        next(new Error('Authentication failed'));
      }
    });
    
    // Rate limiting middleware - simple implementation
    const connectionCounts = new Map<string, number>();
    
    this.io.use((socket, next) => {
      const clientIp = socket.handshake.address;
      
      // Allow up to 100 connections per IP
      const currentCount = connectionCounts.get(clientIp) || 0;
      if (currentCount >= 100) {
        this.logger.warn(`Rate limit exceeded for IP: ${clientIp}`);
        next(new Error('Too many connections'));
        return;
      }
      
      connectionCounts.set(clientIp, currentCount + 1);
      
      // When client disconnects, decrease the count
      socket.on('disconnect', () => {
        const newCount = (connectionCounts.get(clientIp) || 1) - 1;
        if (newCount <= 0) {
          connectionCounts.delete(clientIp);
        } else {
          connectionCounts.set(clientIp, newCount);
        }
      });
      
      next();
    });
  }
  
  /**
   * Set up global event handlers for socket connections
   */
  private setupEventHandlers(): void {
    this.io.on(SocketEvents.CONNECT, (socket: Socket) => {
      this.handleConnection(socket);
    });
  }
  
  /**
   * Handle new socket connections
   */
  private handleConnection(socket: Socket): void {
    const userId = socket.handshake.auth.userId || socket.id;
    
    this.logger.info(`New socket connection: ${socket.id}, userId: ${userId}`);
    
    // Initialize user if they don't exist
    if (!this.users.has(userId)) {
      this.users.set(userId, {
        id: userId,
        sessionIds: new Set()
      });
    }
    
    // Set up socket event handlers
    this.setupSocketEvents(socket, userId);
    
    // Send welcome event
    socket.emit('connected', { success: true, userId });
  }
  
  /**
   * Set up event handlers for a specific socket
   */
  private setupSocketEvents(socket: Socket, userId: string): void {
    // Handle session joining
    socket.on(SocketEvents.JOIN_SESSION, (sessionId: string) => {
      this.joinSession(socket, userId, sessionId);
    });
    
    // Handle session leaving
    socket.on(SocketEvents.LEAVE_SESSION, (sessionId: string) => {
      this.leaveSession(socket, userId, sessionId);
    });
    
    // Handle new messages
    socket.on(SocketEvents.NEW_MESSAGE, (payload: MessagePayload) => {
      this.handleNewMessage(socket, userId, payload);
    });
    
    // Handle typing indicators
    socket.on(SocketEvents.TYPING_START, (sessionId: string) => {
      this.handleTypingStart(socket, userId, sessionId);
    });
    
    socket.on(SocketEvents.TYPING_END, (sessionId: string) => {
      this.handleTypingEnd(socket, userId, sessionId);
    });
    
    // Handle read receipts
    socket.on(SocketEvents.READ_RECEIPT, (data: { sessionId: string, messageId: string }) => {
      this.handleReadReceipt(socket, userId, data);
    });
    
    // Handle disconnection
    socket.on(SocketEvents.DISCONNECT, () => {
      this.handleDisconnect(socket, userId);
    });
  }
  
  /**
   * Handle client joining a chat session
   */
  private joinSession(socket: Socket, userId: string, sessionId: string): void {
    try {
      // Verify session exists and user has access
      const session = this.chatService.getSession(sessionId);
      
      if (session.userId !== userId && !process.env.TEST_MODE) {
        throw new ChatServiceError(
          'Not authorized to access this session',
          ChatErrorType.INVALID_REQUEST
        );
      }
      
      // Add user to the session room
      socket.join(this.getSessionRoomName(sessionId));
      
      // Update user's session list
      const user = this.users.get(userId);
      if (user) {
        user.sessionIds.add(sessionId);
      }
      
      this.logger.info(`User ${userId} joined session ${sessionId}`);
      
      // Notify success
      socket.emit('session_joined', { success: true, sessionId });
      
    } catch (error) {
      this.logger.error(`Error joining session: ${error instanceof Error ? error.message : String(error)}`);
      socket.emit('error', {
        type: 'session_join_failed',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Handle client leaving a chat session
   */
  private leaveSession(socket: Socket, userId: string, sessionId: string): void {
    // Remove socket from the session room
    socket.leave(this.getSessionRoomName(sessionId));
    
    // Update user's session list
    const user = this.users.get(userId);
    if (user) {
      user.sessionIds.delete(sessionId);
    }
    
    this.logger.info(`User ${userId} left session ${sessionId}`);
    
    // Notify success
    socket.emit('session_left', { success: true, sessionId });
  }
  
  /**
   * Handle a new message from client
   */
  private async handleNewMessage(
    socket: Socket, 
    userId: string, 
    payload: MessagePayload
  ): Promise<void> {
    try {
      // First acknowledge receipt
      socket.emit(SocketEvents.MESSAGE_RECEIVED, {
        sessionId: payload.sessionId,
        timestamp: new Date().toISOString()
      });
      
      // Get the session to verify permissions
      const session = this.chatService.getSession(payload.sessionId);
      
      if (session.userId !== userId && !process.env.TEST_MODE) {
        throw new ChatServiceError(
          'Not authorized to send messages to this session',
          ChatErrorType.INVALID_REQUEST
        );
      }
      
      // Set up streaming handlers
      let accumulatedResponse = '';
      
      const streamOptions = {
        onToken: (token: string) => {
          // Send token to the session room
          this.io.to(this.getSessionRoomName(payload.sessionId)).emit(
            SocketEvents.MESSAGE_TOKEN, 
            { 
              sessionId: payload.sessionId,
              token 
            }
          );
          accumulatedResponse += token;
        },
        onComplete: (message: ChatMessage) => {
          // Send complete message to the session room
          this.io.to(this.getSessionRoomName(payload.sessionId)).emit(
            SocketEvents.MESSAGE_RESPONSE, 
            { 
              success: true,
              sessionId: payload.sessionId,
              message 
            }
          );
        },
        onError: (error: Error) => {
          // Send error to the session room
          this.io.to(this.getSessionRoomName(payload.sessionId)).emit(
            SocketEvents.ERROR, 
            { 
              type: 'message_failed',
              sessionId: payload.sessionId,
              message: error.message 
            }
          );
        }
      };
      
      // Process message with streaming
      await this.chatService.sendMessageStream(
        {
          sessionId: payload.sessionId,
          content: payload.content,
          metadata: payload.metadata || {}
        },
        streamOptions
      );
    } catch (error) {
      this.logger.error(`Error processing message: ${error instanceof Error ? error.message : String(error)}`);
      socket.emit(SocketEvents.ERROR, {
        type: 'message_failed',
        sessionId: payload.sessionId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Handle typing start indicator
   */
  private handleTypingStart(socket: Socket, userId: string, sessionId: string): void {
    // Broadcast to others in the session that this user is typing
    socket.to(this.getSessionRoomName(sessionId)).emit(
      SocketEvents.TYPING_START, 
      { userId, sessionId }
    );
  }
  
  /**
   * Handle typing end indicator
   */
  private handleTypingEnd(socket: Socket, userId: string, sessionId: string): void {
    // Broadcast to others in the session that this user stopped typing
    socket.to(this.getSessionRoomName(sessionId)).emit(
      SocketEvents.TYPING_END, 
      { userId, sessionId }
    );
  }
  
  /**
   * Handle read receipt
   */
  private handleReadReceipt(
    socket: Socket, 
    userId: string, 
    data: { sessionId: string, messageId: string }
  ): void {
    // Broadcast to others in the session that this user has read the message
    socket.to(this.getSessionRoomName(data.sessionId)).emit(
      SocketEvents.READ_RECEIPT, 
      { 
        userId, 
        sessionId: data.sessionId, 
        messageId: data.messageId, 
        timestamp: new Date().toISOString() 
      }
    );
  }
  
  /**
   * Handle client disconnection
   */
  private handleDisconnect(socket: Socket, userId: string): void {
    this.logger.info(`Socket disconnected: ${socket.id}, userId: ${userId}`);
    
    // Clean up user data if this is their last connection
    // (In a multi-device scenario, we'd need to track connections per user)
    const user = this.users.get(userId);
    if (user) {
      // In a real implementation, we might want to keep the user data
      // but mark them as offline, or remove them after a timeout
      this.users.delete(userId);
    }
  }
  
  /**
   * Get the room name for a session
   */
  private getSessionRoomName(sessionId: string): string {
    return `session:${sessionId}`;
  }
  
  /**
   * Shut down the socket service
   */
  public shutdown(): void {
    this.io.disconnectSockets(true);
    this.logger.info('Socket.IO service shut down');
  }
} 