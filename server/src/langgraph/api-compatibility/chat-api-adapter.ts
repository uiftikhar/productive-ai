import { ChatAgentInterface, ChatResponse, ChatSession, UserMessage } from '../core/chat/chat-agent-interface';
import { Logger } from '../../shared/logger/logger.interface';

/**
 * Authentication data structure
 */
export interface AuthData {
  /**
   * User ID
   */
  userId: string;
  
  /**
   * User name
   */
  userName: string;
  
  /**
   * User role/permission level
   */
  role?: string;
  
  /**
   * Authentication token
   */
  token?: string;
  
  /**
   * Token expiration timestamp
   */
  tokenExpiration?: number;
}

/**
 * Chat session storage
 */
interface SessionStorage {
  /**
   * Get a session by ID
   */
  get(sessionId: string): Promise<ChatSession | null>;
  
  /**
   * Save a session
   */
  save(session: ChatSession): Promise<void>;
  
  /**
   * Delete a session
   */
  delete(sessionId: string): Promise<void>;
  
  /**
   * List all sessions for a user
   */
  listUserSessions(userId: string): Promise<ChatSession[]>;
}

/**
 * In-memory session storage implementation
 */
class MemorySessionStorage implements SessionStorage {
  private sessions = new Map<string, ChatSession>();
  
  async get(sessionId: string): Promise<ChatSession | null> {
    return this.sessions.get(sessionId) || null;
  }
  
  async save(session: ChatSession): Promise<void> {
    this.sessions.set(session.id, session);
  }
  
  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
  
  async listUserSessions(userId: string): Promise<ChatSession[]> {
    return Array.from(this.sessions.values())
      .filter(session => session.userId === userId);
  }
}

/**
 * Options for chat API adapter
 */
export interface ChatApiAdapterOptions {
  /**
   * Chat agent interface instance
   */
  chatAgent: ChatAgentInterface;
  
  /**
   * Session storage
   */
  sessionStorage?: SessionStorage;
  
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Session timeout in milliseconds
   */
  sessionTimeoutMs?: number;
  
  /**
   * Authentication service
   */
  authService?: any;
}

/**
 * Chat API adapter
 * Adapts the chat agent interface to API frameworks
 * Handles session management and user authentication
 */
export class ChatApiAdapter {
  private chatAgent: ChatAgentInterface;
  private sessionStorage: SessionStorage;
  private logger?: Logger;
  private sessionTimeoutMs: number;
  private authService?: any;
  
  /**
   * Create a new chat API adapter
   */
  constructor(options: ChatApiAdapterOptions) {
    this.chatAgent = options.chatAgent;
    this.sessionStorage = options.sessionStorage || new MemorySessionStorage();
    this.logger = options.logger;
    this.sessionTimeoutMs = options.sessionTimeoutMs || 3600000; // 1 hour default
    this.authService = options.authService;
  }
  
  /**
   * Process a user message through the API
   * 
   * @param requestData - Request data from the API
   * @returns Response for the API
   */
  async processMessage(requestData: {
    sessionId?: string;
    userId: string;
    message: string;
    attachments?: any[];
    authToken?: string;
  }): Promise<{
    sessionId: string;
    response: ChatResponse;
  }> {
    try {
      this.logger?.debug('Processing message request', { 
        sessionId: requestData.sessionId,
        userId: requestData.userId
      });
      
      // Authenticate the user if auth service is available
      if (this.authService) {
        try {
          await this.authService.validateToken(requestData.authToken, requestData.userId);
        } catch (error) {
          this.logger?.error('Authentication failed', {
            userId: requestData.userId,
            error: (error as Error).message
          });
          
          throw new Error('Authentication failed. Please log in again.');
        }
      }
      
      // Get or create the session
      const session = await this.getOrCreateSession(requestData);
      
      // Create user message
      const userMessage: UserMessage = {
        id: `msg-${Date.now()}`,
        content: requestData.message,
        timestamp: Date.now(),
        attachments: this.formatAttachments(requestData.attachments)
      };
      
      // Process the message
      const response = await this.chatAgent.handleUserMessage(session, userMessage);
      
      // Update session last activity time
      session.metadata = session.metadata || {};
      session.metadata.lastActivityTime = Date.now();
      await this.sessionStorage.save(session);
      
      return {
        sessionId: session.id,
        response
      };
    } catch (error) {
      this.logger?.error('Error processing message', {
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      
      // Return error response
      return {
        sessionId: requestData.sessionId || `session-${Date.now()}`,
        response: {
          id: `error-${Date.now()}`,
          content: `An error occurred: ${(error as Error).message}`,
          type: 'error',
          timestamp: Date.now(),
          error: {
            code: 'processing_error',
            message: (error as Error).message
          }
        }
      };
    }
  }
  
  /**
   * Upload a transcript through the API
   * 
   * @param requestData - Request data from the API
   * @returns Response for the API
   */
  async uploadTranscript(requestData: {
    sessionId?: string;
    userId: string;
    transcript: string;
    meetingId?: string;
    authToken?: string;
  }): Promise<{
    sessionId: string;
    response: ChatResponse;
  }> {
    try {
      this.logger?.debug('Processing transcript upload', { 
        sessionId: requestData.sessionId,
        userId: requestData.userId,
        meetingId: requestData.meetingId
      });
      
      // Authenticate the user if auth service is available
      if (this.authService) {
        try {
          await this.authService.validateToken(requestData.authToken, requestData.userId);
        } catch (error) {
          this.logger?.error('Authentication failed', {
            userId: requestData.userId,
            error: (error as Error).message
          });
          
          throw new Error('Authentication failed. Please log in again.');
        }
      }
      
      // Get or create the session
      const session = await this.getOrCreateSession(requestData);
      
      // Process the transcript
      const response = await this.chatAgent.uploadTranscript(
        session,
        requestData.transcript,
        requestData.meetingId
      );
      
      // Update session
      session.metadata = session.metadata || {};
      session.metadata.lastActivityTime = Date.now();
      await this.sessionStorage.save(session);
      
      return {
        sessionId: session.id,
        response
      };
    } catch (error) {
      this.logger?.error('Error uploading transcript', {
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      
      // Return error response
      return {
        sessionId: requestData.sessionId || `session-${Date.now()}`,
        response: {
          id: `error-${Date.now()}`,
          content: `An error occurred while processing the transcript: ${(error as Error).message}`,
          type: 'error',
          timestamp: Date.now(),
          error: {
            code: 'transcript_processing_error',
            message: (error as Error).message
          }
        }
      };
    }
  }
  
  /**
   * Get session information
   * 
   * @param sessionId - Session ID
   * @param userId - User ID for verification
   * @param authToken - Authentication token
   * @returns Session information
   */
  async getSession(
    sessionId: string,
    userId: string,
    authToken?: string
  ): Promise<ChatSession> {
    try {
      // Authenticate the user if auth service is available
      if (this.authService && authToken) {
        try {
          await this.authService.validateToken(authToken, userId);
        } catch (error) {
          throw new Error('Authentication failed. Please log in again.');
        }
      }
      
      // Get the session
      const session = await this.sessionStorage.get(sessionId);
      
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      
      // Verify the session belongs to the user
      if (session.userId !== userId) {
        throw new Error('Unauthorized access to session');
      }
      
      return session;
    } catch (error) {
      this.logger?.error('Error getting session', {
        sessionId,
        userId,
        error: (error as Error).message
      });
      
      throw error;
    }
  }
  
  /**
   * List all sessions for a user
   * 
   * @param userId - User ID
   * @param authToken - Authentication token
   * @returns List of sessions
   */
  async listSessions(
    userId: string,
    authToken?: string
  ): Promise<ChatSession[]> {
    try {
      // Authenticate the user if auth service is available
      if (this.authService && authToken) {
        try {
          await this.authService.validateToken(authToken, userId);
        } catch (error) {
          throw new Error('Authentication failed. Please log in again.');
        }
      }
      
      // Get all sessions for the user
      return await this.sessionStorage.listUserSessions(userId);
    } catch (error) {
      this.logger?.error('Error listing sessions', {
        userId,
        error: (error as Error).message
      });
      
      throw error;
    }
  }
  
  /**
   * Delete a session
   * 
   * @param sessionId - Session ID
   * @param userId - User ID for verification
   * @param authToken - Authentication token
   */
  async deleteSession(
    sessionId: string,
    userId: string,
    authToken?: string
  ): Promise<void> {
    try {
      // Authenticate the user if auth service is available
      if (this.authService && authToken) {
        try {
          await this.authService.validateToken(authToken, userId);
        } catch (error) {
          throw new Error('Authentication failed. Please log in again.');
        }
      }
      
      // Get the session
      const session = await this.sessionStorage.get(sessionId);
      
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      
      // Verify the session belongs to the user
      if (session.userId !== userId) {
        throw new Error('Unauthorized access to session');
      }
      
      // Delete the session
      await this.sessionStorage.delete(sessionId);
    } catch (error) {
      this.logger?.error('Error deleting session', {
        sessionId,
        userId,
        error: (error as Error).message
      });
      
      throw error;
    }
  }
  
  /**
   * Get or create a session
   * 
   * @param requestData - Request data
   * @returns Chat session
   */
  private async getOrCreateSession(requestData: {
    sessionId?: string;
    userId: string;
  }): Promise<ChatSession> {
    // If session ID is provided, try to get the existing session
    if (requestData.sessionId) {
      const existingSession = await this.sessionStorage.get(requestData.sessionId);
      
      if (existingSession) {
        // Verify the session belongs to the user
        if (existingSession.userId !== requestData.userId) {
          throw new Error('Unauthorized access to session');
        }
        
        // Check session expiration
        const lastActivityTime = existingSession.metadata?.lastActivityTime || 0;
        const now = Date.now();
        
        if (now - lastActivityTime > this.sessionTimeoutMs) {
          this.logger?.info('Session expired, creating new session', {
            oldSessionId: existingSession.id,
            userId: requestData.userId
          });
          
          // Create a new session
          return this.createNewSession(requestData.userId);
        }
        
        return existingSession;
      }
    }
    
    // Create a new session
    return this.createNewSession(requestData.userId);
  }
  
  /**
   * Create a new chat session
   * 
   * @param userId - User ID
   * @returns New chat session
   */
  private async createNewSession(userId: string): Promise<ChatSession> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
    const session: ChatSession = {
      id: sessionId,
      userId,
      metadata: {
        createdAt: Date.now(),
        lastActivityTime: Date.now()
      }
    };
    
    await this.sessionStorage.save(session);
    
    this.logger?.info('Created new session', {
      sessionId,
      userId
    });
    
    return session;
  }
  
  /**
   * Format API attachments to the internal format
   * 
   * @param attachments - Attachments from the API
   * @returns Formatted attachments
   */
  private formatAttachments(attachments?: any[]): UserMessage['attachments'] {
    if (!attachments || attachments.length === 0) {
      return undefined;
    }
    
    return attachments.map(attachment => ({
      type: attachment.type || 'file',
      data: attachment.data,
      metadata: attachment.metadata || {}
    }));
  }
} 