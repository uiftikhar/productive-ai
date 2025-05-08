import { v4 as uuidv4 } from 'uuid';
import { FileStorageAdapter } from './file-storage-adapter';
import { Logger } from '../logger/logger.interface';
import { ConsoleLogger } from '../logger/console-logger';

/**
 * Session data structure
 */
export interface SessionData {
  id: string;
  graph: any;
  team?: any;
  state?: any;
  metadata?: Record<string, any>;
  status: SessionStatus;
  progress?: number;
  results?: any;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

/**
 * Session status options
 */
export enum SessionStatus {
  CREATED = 'created',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

/**
 * Session manager configuration
 */
export interface SessionManagerConfig {
  storageAdapter: FileStorageAdapter;
  cleanupInterval?: number; // in milliseconds, default 1 hour
  maxSessions?: number;
  logger?: Logger;
}

/**
 * Manager for graph analysis sessions
 */
export class SessionManager {
  private storageAdapter: FileStorageAdapter;
  private logger: Logger;
  private sessions: Map<string, SessionData> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private config: SessionManagerConfig;

  /**
   * Create a new session manager
   */
  constructor(config: SessionManagerConfig) {
    this.storageAdapter = config.storageAdapter;
    this.logger = config.logger || new ConsoleLogger();
    this.config = {
      cleanupInterval: 60 * 60 * 1000, // Default: 1 hour
      maxSessions: 100,
      ...config
    };
    
    // Start cleanup interval
    this.startCleanupInterval();
    
    // Load existing sessions on startup
    this.loadExistingSessions();
  }
  
  /**
   * Start the cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.config.cleanupInterval);
  }

  /**
   * Load existing sessions from storage
   */
  private async loadExistingSessions(): Promise<void> {
    try {
      const sessionIds = await this.storageAdapter.listSessions();
      this.logger.info(`Loading ${sessionIds.length} existing sessions`);
      
      for (const sessionId of sessionIds) {
        const sessionData = await this.storageAdapter.loadState(sessionId);
        if (sessionData) {
          this.sessions.set(sessionId, sessionData);
        }
      }
      
      this.logger.info(`Loaded ${this.sessions.size} active sessions`);
    } catch (error) {
      this.logger.error('Failed to load existing sessions', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Clean up expired sessions
   */
  private async cleanupExpiredSessions(): Promise<void> {
    try {
      const removedCount = await this.storageAdapter.cleanExpiredSessions();
      
      // Also clean from memory
      const now = Date.now();
      let memoryCleanedCount = 0;
      
      for (const [sessionId, session] of this.sessions.entries()) {
        // Clean sessions that haven't been updated in 24 hours or are explicitly expired
        const isExpired = session.status === SessionStatus.EXPIRED ||
          (now - session.updatedAt > 24 * 60 * 60 * 1000);
          
        if (isExpired) {
          this.sessions.delete(sessionId);
          memoryCleanedCount++;
        }
      }
      
      this.logger.info(`Cleaned up ${memoryCleanedCount} expired sessions from memory`);
    } catch (error) {
      this.logger.error('Failed to clean up expired sessions', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Create a new session
   */
  async createSession(options: {
    graph: any;
    team?: any;
    initialState?: any;
    metadata?: Record<string, any>;
  }): Promise<string> {
    // Check if max sessions reached
    if (this.config.maxSessions && this.sessions.size >= this.config.maxSessions) {
      throw new Error(`Maximum number of sessions (${this.config.maxSessions}) reached`);
    }
    
    // Generate new session ID
    const sessionId = uuidv4();
    
    // Create session data
    const sessionData: SessionData = {
      id: sessionId,
      graph: options.graph,
      team: options.team,
      state: options.initialState || {},
      metadata: options.metadata || {},
      status: SessionStatus.CREATED,
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    // Store in memory
    this.sessions.set(sessionId, sessionData);
    
    // Persist to storage
    await this.storageAdapter.saveState(sessionId, sessionData);
    
    this.logger.info(`Created new session: ${sessionId}`, {
      metadata: options.metadata
    });
    
    return sessionId;
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    // Check memory cache first
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId) || null;
    }
    
    // Try loading from storage
    const sessionData = await this.storageAdapter.loadState(sessionId);
    
    if (sessionData) {
      // Update cache
      this.sessions.set(sessionId, sessionData);
      
      // Extend session
      await this.storageAdapter.extendSession(sessionId);
      
      return sessionData;
    }
    
    return null;
  }

  /**
   * Update a session
   */
  async updateSession(
    sessionId: string,
    updates: Partial<Omit<SessionData, 'id' | 'createdAt'>>
  ): Promise<boolean> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      return false;
    }
    
    // Apply updates
    const updatedSession: SessionData = {
      ...session,
      ...updates,
      id: session.id, // Ensure ID doesn't change
      createdAt: session.createdAt, // Ensure created timestamp doesn't change
      updatedAt: Date.now() // Always update the updated timestamp
    };
    
    // If status changed to completed, add completedAt timestamp
    if (updates.status === SessionStatus.COMPLETED && !updatedSession.completedAt) {
      updatedSession.completedAt = Date.now();
    }
    
    // Update memory cache
    this.sessions.set(sessionId, updatedSession);
    
    // Persist to storage
    try {
      await this.storageAdapter.saveState(sessionId, updatedSession);
      
      this.logger.debug(`Updated session: ${sessionId}`, {
        status: updatedSession.status,
        progress: updatedSession.progress
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to update session: ${sessionId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    // Remove from memory
    this.sessions.delete(sessionId);
    
    // Remove from storage
    try {
      const result = await this.storageAdapter.deleteState(sessionId);
      
      if (result) {
        this.logger.info(`Deleted session: ${sessionId}`);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete session: ${sessionId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * List all active sessions
   */
  async listActiveSessions(): Promise<SessionData[]> {
    // Refresh session list from storage
    await this.loadExistingSessions();
    
    return Array.from(this.sessions.values());
  }

  /**
   * Get session status
   */
  async getSessionStatus(
    sessionId: string
  ): Promise<{ status: SessionStatus; progress: number } | null> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      return null;
    }
    
    return {
      status: session.status,
      progress: session.progress || 0
    };
  }

  /**
   * Close and clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
} 