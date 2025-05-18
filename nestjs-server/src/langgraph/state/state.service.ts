import { Injectable, Logger } from '@nestjs/common';
import { StateStorageService } from '../persistence/state-storage.service';
import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

/**
 * Session data interface
 */
export interface SessionData {
  transcript: string;
  metadata?: Record<string, any>;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt?: string;
  completedAt?: string;
  error?: string;
}

/**
 * Generic state management service for LangGraph
 */
@Injectable()
export class StateService {
  private readonly logger = new Logger(StateService.name);

  constructor(private readonly stateStorage: StateStorageService) {}

  /**
   * Create an annotation for a base message array
   */
  createMessagesAnnotation() {
    return Annotation<BaseMessage[]>({
      reducer: (x, y) => [...x, ...y],
      default: () => [],
    });
  }

  /**
   * Create a complete state definition for meeting analysis
   */
  createMeetingAnalysisState() {
    return {
      messages: this.createMessagesAnnotation(),
      transcript: this.createStringAnnotation(),
      topics: this.createArrayAnnotation(),
      actionItems: this.createArrayAnnotation(),
      sentiment: Annotation({
        reducer: (x, y) => y ?? x,
        default: () => null,
      }),
      summary: Annotation({
        reducer: (x, y) => y ?? x,
        default: () => null,
      }),
      currentPhase: this.createStringAnnotation('initialization'),
      errors: this.createArrayAnnotation(),
    };
  }

  /**
   * Create an annotation for a string
   */
  createStringAnnotation(defaultValue = '') {
    return Annotation<string>({
      reducer: (x, y) => y ?? x,
      default: () => defaultValue,
    });
  }

  /**
   * Create an annotation for an array of objects
   */
  createArrayAnnotation<T>() {
    return Annotation<T[]>({
      reducer: (x, y) => [...x, ...y],
      default: () => [],
    });
  }

  /**
   * Create an annotation for a record object
   */
  createRecordAnnotation<T>() {
    return Annotation<Record<string, T>>({
      reducer: (x, y) => ({ ...x, ...y }),
      default: () => ({}),
    });
  }

  /**
   * Create an annotation for a routing value
   */
  createRoutingAnnotation(defaultNode = 'start') {
    return Annotation<string>({
      reducer: (x, y) => y ?? x,
      default: () => defaultNode,
    });
  }

  /**
   * Save session data
   */
  async saveSession(sessionId: string, data: SessionData): Promise<void> {
    try {
      this.logger.debug(`Saving session data for ${sessionId}`);
      await this.stateStorage.saveState(sessionId, 'session_data', data);
    } catch (error) {
      this.logger.error(`Failed to save session: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update session data (partial update)
   */
  async updateSession(sessionId: string, data: Partial<SessionData>): Promise<void> {
    try {
      // Get existing session data
      const existingData = await this.getSession(sessionId);
      
      if (!existingData) {
        this.logger.warn(`Attempted to update non-existent session: ${sessionId}`);
        throw new Error(`Session ${sessionId} not found`);
      }
      
      // Merge data
      const updatedData: SessionData = {
        ...existingData,
        ...data,
      };
      
      this.logger.debug(`Updating session data for ${sessionId}`);
      await this.stateStorage.saveState(sessionId, 'session_data', updatedData);
    } catch (error) {
      this.logger.error(`Failed to update session: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get session data
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      this.logger.debug(`Getting session data for ${sessionId}`);
      const data = await this.stateStorage.loadState(sessionId, 'session_data');
      return data as SessionData | null;
    } catch (error) {
      this.logger.error(`Failed to get session: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Save analysis results
   */
  async saveResults(sessionId: string, results: any): Promise<void> {
    try {
      this.logger.debug(`Saving analysis results for ${sessionId}`);
      await this.stateStorage.saveState(sessionId, 'analysis_results', results);
    } catch (error) {
      this.logger.error(`Failed to save results: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get analysis results
   */
  async getResults(sessionId: string): Promise<any> {
    try {
      this.logger.debug(`Getting analysis results for ${sessionId}`);
      return await this.stateStorage.loadState(sessionId, 'analysis_results');
    } catch (error) {
      this.logger.error(`Failed to get results: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Save state checkpoint
   */
  async saveState(
    sessionId: string,
    checkpointId: string,
    state: any,
  ): Promise<void> {
    try {
      await this.stateStorage.saveState(sessionId, checkpointId, state);
    } catch (error) {
      this.logger.error(`Failed to save state: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Load state checkpoint
   */
  async loadState(sessionId: string, checkpointId: string): Promise<any> {
    try {
      return await this.stateStorage.loadState(sessionId, checkpointId);
    } catch (error) {
      this.logger.error(`Failed to load state: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Delete state checkpoint
   */
  async deleteState(sessionId: string, checkpointId: string): Promise<void> {
    try {
      await this.stateStorage.deleteState(sessionId, checkpointId);
    } catch (error) {
      this.logger.error(
        `Failed to delete state: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * List checkpoints for a session
   */
  async listCheckpoints(sessionId: string): Promise<string[]> {
    try {
      return await this.stateStorage.listCheckpoints(sessionId);
    } catch (error) {
      this.logger.error(
        `Failed to list checkpoints: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }
}
