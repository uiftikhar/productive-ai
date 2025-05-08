import { v4 as uuidv4 } from 'uuid';
import { PersistentStateManager } from '../../core/state/persistent-state-manager';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * Chat session interface
 */
export interface ChatSession {
  /**
   * Session ID
   */
  id: string;
  
  /**
   * User ID associated with the session
   */
  userId: string;
  
  /**
   * Creation timestamp
   */
  createdAt: number;
  
  /**
   * Last activity timestamp
   */
  lastActiveAt: number;
  
  /**
   * Session expiration timestamp
   */
  expiresAt: number;
  
  /**
   * Current meeting ID if analyzing a transcript
   */
  currentMeetingId?: string;
  
  /**
   * Current analysis session ID if analyzing a transcript
   */
  currentAnalysisSessionId?: string;
  
  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Session service options
 */
interface SessionServiceOptions {
  /**
   * Persistent state manager for storing sessions
   */
  stateManager: PersistentStateManager;
  
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Session expiration time in milliseconds (default: 24 hours)
   */
  sessionExpirationMs?: number;
}

/**
 * Service for managing chat sessions
 */
export class SessionService {
  private stateManager: PersistentStateManager;
  private logger: Logger;
  private sessionExpirationMs: number;
  
  /**
   * Namespace prefix for session keys in the state manager
   */
  private readonly SESSION_PREFIX = 'chat_session:';
  
  /**
   * Create a new session service
   */
  constructor(options: SessionServiceOptions) {
    this.stateManager = options.stateManager;
    this.logger = options.logger || new ConsoleLogger();
    this.sessionExpirationMs = options.sessionExpirationMs || 24 * 60 * 60 * 1000; // 24 hours default
  }
  
  /**
   * Create a new chat session
   */
  async createSession(userId: string, metadata?: Record<string, any>): Promise<ChatSession> {
    try {
      // Check if the state manager is initialized
      if (this.stateManager['ensureInitialized']) {
        this.stateManager['ensureInitialized']();
      }

      const sessionId = uuidv4();
      const now = Date.now();
      
      const session: ChatSession = {
        id: sessionId,
        userId,
        createdAt: now,
        lastActiveAt: now,
        expiresAt: now + this.sessionExpirationMs,
        metadata
      };
      
      await this.stateManager.saveState(
        `${this.SESSION_PREFIX}${sessionId}`,
        session,
        {
          ttl: this.sessionExpirationMs / 1000, // Convert to seconds for TTL
          description: 'Chat session storage'
        }
      );
      
      this.logger.info(`Created new chat session ${sessionId} for user ${userId}`);
      
      return session;
    } catch (error: any) {
      this.logger.error('Failed to create chat session', { error });
      throw new Error(`Failed to create chat session: ${error.message}`);
    }
  }
  
  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<ChatSession | null> {
    try {
      const stateKey = `${this.SESSION_PREFIX}${sessionId}`;
      const exists = await this.stateManager.hasState(stateKey);
      
      if (!exists) {
        this.logger.debug(`Session ${sessionId} not found`);
        return null;
      }
      
      // Use the internal storage adapter since getState isn't exposed
      const rawSession = await this.stateManager['storageAdapter'].get(
        this.stateManager['getStateKey'] ? 
          this.stateManager['getStateKey'](stateKey) : 
          `state:${stateKey}`
      );
      
      if (!rawSession) {
        return null;
      }
      
      // Handle auto-deserialization if needed
      const session = (rawSession && typeof rawSession === 'object' && 'data' in rawSession)
        ? rawSession.data as ChatSession
        : rawSession as ChatSession;
      
      // Check if session has expired
      if (session.expiresAt < Date.now()) {
        this.logger.debug(`Session ${sessionId} has expired`);
        return null;
      }
      
      return session;
    } catch (error: any) {
      this.logger.error(`Failed to get session ${sessionId}`, { error });
      return null;
    }
  }
  
  /**
   * Update a session
   */
  async updateSession(sessionId: string, updates: Partial<ChatSession>): Promise<ChatSession | null> {
    try {
      const session = await this.getSession(sessionId);
      
      if (!session) {
        this.logger.debug(`Cannot update session ${sessionId}: not found or expired`);
        return null;
      }
      
      // Update last active timestamp by default
      const updatedSession = {
        ...session,
        ...updates,
        lastActiveAt: Date.now()
      };
      
      // Extend expiration if not explicitly provided
      if (!updates.expiresAt) {
        updatedSession.expiresAt = Date.now() + this.sessionExpirationMs;
      }
      
      await this.stateManager.updateState(
        `${this.SESSION_PREFIX}${sessionId}`,
        updatedSession,
        {
          ttl: Math.max(
            0, 
            Math.floor((updatedSession.expiresAt - Date.now()) / 1000)
          ),
          description: 'Update chat session'
        }
      );
      
      return updatedSession;
    } catch (error: any) {
      this.logger.error(`Failed to update session ${sessionId}`, { error });
      return null;
    }
  }
  
  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const stateKey = `${this.SESSION_PREFIX}${sessionId}`;
      // Use deleteState instead of removeState
      await this.stateManager.deleteState(stateKey);
      this.logger.info(`Deleted chat session ${sessionId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to delete session ${sessionId}`, { error });
      return false;
    }
  }
  
  /**
   * Set the current meeting ID for a session
   */
  async setCurrentMeeting(sessionId: string, meetingId: string, analysisSessionId: string): Promise<ChatSession | null> {
    return this.updateSession(sessionId, {
      currentMeetingId: meetingId,
      currentAnalysisSessionId: analysisSessionId
    });
  }
  
  /**
   * Clear the current meeting ID for a session
   */
  async clearCurrentMeeting(sessionId: string): Promise<ChatSession | null> {
    return this.updateSession(sessionId, {
      currentMeetingId: undefined,
      currentAnalysisSessionId: undefined
    });
  }
} 