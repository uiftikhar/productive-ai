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
          description: 'Chat session creation'
        }
      );
      
      // Add session to user's index for tracking
      await this.addSessionToUserIndex(userId, sessionId);
      
      return session;
    } catch (error: any) {
      this.logger.error('Failed to create session', { error, userId });
      throw new Error(`Failed to create session: ${error.message}`);
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
  
  /**
   * Get count of active sessions for a user
   * Used for rate limiting and resource usage monitoring
   */
  async getSessionCountByUser(userId: string): Promise<number> {
    try {
      // Use a user index key to track active sessions
      const userSessionsKey = `user_sessions:${userId}`;
      
      // Check if the user sessions index exists
      const exists = await this.stateManager.hasState(userSessionsKey);
      
      if (!exists) {
        // No index exists yet, so user has no active sessions
        return 0;
      }
      
      // Get the user sessions index
      const userSessions = await this.stateManager.loadState<{ sessions: string[] }>(userSessionsKey);
      
      if (!userSessions || !userSessions.sessions || !Array.isArray(userSessions.sessions)) {
        // Invalid index format
        return 0;
      }
      
      // Filter to only include active sessions
      const now = Date.now();
      let activeCount = 0;
      
      for (const sessionId of userSessions.sessions) {
        try {
          const session = await this.getSession(sessionId);
          
          if (session && session.expiresAt > now) {
            activeCount++;
          }
        } catch (sessionError) {
          this.logger.warn(`Error checking session activity: ${sessionId}`, { error: sessionError });
          // Continue to next session
        }
      }
      
      return activeCount;
    } catch (error) {
      this.logger.error(`Failed to get session count for user ${userId}`, { error });
      // Return 0 as a fallback to avoid blocking the user
      return 0;
    }
  }
  
  /**
   * Add session to user's session index
   * Used for tracking user's sessions for rate limiting
   */
  private async addSessionToUserIndex(userId: string, sessionId: string): Promise<void> {
    try {
      const userSessionsKey = `user_sessions:${userId}`;
      
      // Check if the user sessions index exists
      const exists = await this.stateManager.hasState(userSessionsKey);
      
      let userSessions: { sessions: string[] } = { sessions: [] };
      
      if (exists) {
        // Load existing user sessions
        const existingUserSessions = await this.stateManager.loadState<{ sessions: string[] }>(userSessionsKey);
        
        if (existingUserSessions && Array.isArray(existingUserSessions.sessions)) {
          userSessions = existingUserSessions;
        }
      }
      
      // Add new session ID if not already present
      if (!userSessions.sessions.includes(sessionId)) {
        userSessions.sessions.push(sessionId);
      }
      
      // Save updated user sessions index
      await this.stateManager.saveState(
        userSessionsKey,
        userSessions,
        {
          ttl: 30 * 24 * 60 * 60, // 30 days TTL
          description: 'User sessions index'
        }
      );
    } catch (error) {
      this.logger.error(`Failed to add session to user index: ${userId}/${sessionId}`, { error });
      // Non-critical error, continue without failing
    }
  }
  
  /**
   * Helper method to load state with proper error handling
   */
  private async loadState<T>(key: string): Promise<T | null> {
    try {
      return await this.stateManager.loadState<T>(key);
    } catch (error) {
      this.logger.warn(`Failed to load state for key ${key}`, { error });
      return null;
    }
  }
} 