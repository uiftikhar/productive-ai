/**
 * State repository implementation for the Agentic Meeting Analysis System
 */
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  IStateRepository,
  AgenticMeetingAnalysisState,
  AnalysisTeam,
  AnalysisProgress,
  AnalysisResults,
  StateChangeNotification,
  StateChangeType,
} from '../interfaces/state.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * Configuration options for StateRepositoryService
 */
export interface StateRepositoryConfig {
  logger?: Logger;
  persistenceEnabled?: boolean;
  maxHistoryLength?: number;
}

/**
 * Meeting interface for saveMeeting method
 */
export interface Meeting {
  meetingId: string;
  title?: string;
  transcript?: string;
  metadata?: any;
  participants?: any[];
  [key: string]: any;
}

/**
 * Implementation of state repository service
 */
export class StateRepositoryService
  extends EventEmitter
  implements IStateRepository
{
  private states: Map<string, AgenticMeetingAnalysisState> = new Map();
  private stateHistory: Map<
    string,
    {
      timestamp: number;
      state: Partial<AgenticMeetingAnalysisState>;
      agentId?: string;
    }[]
  > = new Map();

  private meetings: Map<string, Meeting> = new Map();

  private logger: Logger;
  private persistenceEnabled: boolean;
  private maxHistoryLength: number;

  /**
   * Create a new state repository service
   */
  constructor(config: StateRepositoryConfig = {}) {
    super();

    this.logger = config.logger || new ConsoleLogger();
    this.persistenceEnabled = config.persistenceEnabled || false;
    this.maxHistoryLength = config.maxHistoryLength || 100;

    this.logger.info('Initialized StateRepositoryService');
  }

  /**
   * Initialize the state repository
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing state repository service');

    if (this.persistenceEnabled) {
      try {
        // Load persisted states (implementation would be added here)
        this.logger.info('Persistence enabled, loading saved state');
      } catch (error) {
        this.logger.warn(
          `Failed to load persisted states: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.info('State repository service initialized');
  }

  /**
   * Save a meeting to the repository
   */
  async saveMeeting(meeting: Meeting): Promise<void> {
    if (!meeting || !meeting.meetingId) {
      this.logger.error('Cannot save meeting: Invalid meeting data');
      throw new Error('Invalid meeting data: meetingId is required');
    }

    this.logger.debug(`Saving meeting ${meeting.meetingId} to repository`);
    this.meetings.set(meeting.meetingId, meeting);
    
    // Initialize state if needed
    if (!this.states.has(meeting.meetingId)) {
      const now = Date.now();
      const initialState: AgenticMeetingAnalysisState = {
        meetingId: meeting.meetingId,
        metadata: {
          meetingId: meeting.meetingId,
          participants: meeting.participants || [],
          title: meeting.title || '',
        },
        transcript: {
          meetingId: meeting.meetingId,
          segments: [],
          rawText: meeting.transcript || '',
        },
        segments: [],
        goals: [],
        tasks: {},
        progress: {
          meetingId: meeting.meetingId,
          goals: [],
          taskStatuses: {},
          overallProgress: 0,
          started: now,
          lastUpdated: now,
        },
        executionId: `exec-${uuidv4()}`,
        startTime: now,
        status: 'pending',
      };
      
      this.states.set(meeting.meetingId, initialState);
      
      // Add to history
      this.addToStateHistory(meeting.meetingId, initialState);
    }
  }

  /**
   * Get a meeting from the repository
   */
  async getMeeting(meetingId: string): Promise<Meeting | null> {
    this.logger.debug(`Getting meeting ${meetingId} from repository`);
    return this.meetings.get(meetingId) || null;
  }

  /**
   * Get the full state for a meeting
   */
  async getState(meetingId: string): Promise<AgenticMeetingAnalysisState> {
    this.logger.debug(`Getting state for meeting ${meetingId}`);

    const state = this.states.get(meetingId);

    if (!state) {
      throw new Error(`State not found for meeting ID: ${meetingId}`);
    }

    return state;
  }

  /**
   * Update state for a meeting
   */
  async updateState(
    meetingId: string,
    updates: Partial<AgenticMeetingAnalysisState>,
  ): Promise<void> {
    this.logger.debug(`Updating state for meeting ${meetingId}`);

    let state = this.states.get(meetingId);
    const now = Date.now();
    const changes: StateChangeNotification['changes'] = [];

    if (!state) {
      // If the state doesn't exist, create it with the updates
      if (!updates.meetingId || updates.meetingId !== meetingId) {
        throw new Error(
          `Meeting ID mismatch: ${updates.meetingId} vs ${meetingId}`,
        );
      }

      // Initialize a new state with defaults
      state = {
        meetingId,
        metadata: updates.metadata || {
          meetingId,
          participants: [],
        },
        transcript: updates.transcript || {
          meetingId,
          segments: [],
        },
        segments: updates.segments || [],
        goals: updates.goals || [],
        tasks: updates.tasks || {},
        progress: updates.progress || {
          meetingId,
          goals: [],
          taskStatuses: {},
          overallProgress: 0,
          started: now,
          lastUpdated: now,
        },
        executionId: updates.executionId || `exec-${uuidv4()}`,
        startTime: updates.startTime || now,
        status: updates.status || 'pending',
      };

      this.states.set(meetingId, state);

      // Record the creation event
      const notification: StateChangeNotification = {
        id: uuidv4(),
        type: StateChangeType.CREATED,
        entity: 'state',
        entityId: meetingId,
        timestamp: now,
      };

      this.emit('stateChange', notification);
    } else {
      // Perform the update and track changes
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'meetingId') continue; // Skip meeting ID changes

        const oldValue = (state as any)[key];
        (state as any)[key] = value;

        changes.push({
          path: key,
          previousValue: oldValue,
          newValue: value,
        });
      }

      // Update status if not explicitly set
      if (!updates.status && state.status === 'pending') {
        state.status = 'in_progress';
        changes.push({
          path: 'status',
          previousValue: 'pending',
          newValue: 'in_progress',
        });
      }

      // Record the update event
      const notification: StateChangeNotification = {
        id: uuidv4(),
        type: StateChangeType.UPDATED,
        entity: 'state',
        entityId: meetingId,
        changes,
        timestamp: now,
        // Extract agent ID from metadata if available
        agentId: updates.tasks
          ? Object.values(updates.tasks).find((t) => t.assignedTo)?.assignedTo
          : undefined,
      };

      this.emit('stateChange', notification);
    }

    // Add to history
    this.addToStateHistory(meetingId, updates);

    // Persist if enabled
    if (this.persistenceEnabled) {
      this.persistState(meetingId);
    }
  }

  /**
   * Get the team for a meeting
   */
  async getTeam(meetingId: string): Promise<AnalysisTeam | null> {
    this.logger.debug(`Getting team for meeting ${meetingId}`);

    const state = this.states.get(meetingId);

    if (!state) {
      return null;
    }

    return state.team || null;
  }

  /**
   * Update team for a meeting
   */
  async updateTeam(
    meetingId: string,
    updates: Partial<AnalysisTeam>,
  ): Promise<void> {
    this.logger.debug(`Updating team for meeting ${meetingId}`);

    const state = this.states.get(meetingId);

    if (!state) {
      throw new Error(`State not found for meeting ID: ${meetingId}`);
    }

    const now = Date.now();
    const changes: StateChangeNotification['changes'] = [];

    if (!state.team) {
      // Create new team
      state.team = {
        id: updates.id || `team-${uuidv4()}`,
        meetingId,
        coordinator: updates.coordinator || '',
        specialists: updates.specialists || [],
        created: now,
        updated: now,
      };

      // Emit creation event
      const notification: StateChangeNotification = {
        id: uuidv4(),
        type: StateChangeType.CREATED,
        entity: 'team',
        entityId: state.team.id,
        timestamp: now,
      };

      this.emit('stateChange', notification);
    } else {
      // Update existing team
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'id' || key === 'meetingId') continue; // Skip these

        const oldValue = (state.team as any)[key];
        (state.team as any)[key] = value;

        changes.push({
          path: `team.${key}`,
          previousValue: oldValue,
          newValue: value,
        });
      }

      state.team.updated = now;

      // Emit update event
      const notification: StateChangeNotification = {
        id: uuidv4(),
        type: StateChangeType.UPDATED,
        entity: 'team',
        entityId: state.team.id,
        changes,
        timestamp: now,
      };

      this.emit('stateChange', notification);
    }

    // Add to history
    this.addToStateHistory(meetingId, { team: state.team });

    // Persist if enabled
    if (this.persistenceEnabled) {
      this.persistState(meetingId);
    }
  }

  /**
   * Get progress for a meeting
   */
  async getProgress(meetingId: string): Promise<AnalysisProgress> {
    this.logger.debug(`Getting progress for meeting ${meetingId}`);

    const state = this.states.get(meetingId);

    if (!state) {
      throw new Error(`State not found for meeting ID: ${meetingId}`);
    }

    return state.progress;
  }

  /**
   * Update progress for a meeting
   */
  async updateProgress(
    meetingId: string,
    updates: Partial<AnalysisProgress>,
  ): Promise<void> {
    this.logger.debug(`Updating progress for meeting ${meetingId}`);

    const state = this.states.get(meetingId);

    if (!state) {
      throw new Error(`State not found for meeting ID: ${meetingId}`);
    }

    const now = Date.now();
    const changes: StateChangeNotification['changes'] = [];

    // Update fields
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'meetingId') continue; // Skip meeting ID

      const oldValue = (state.progress as any)[key];
      (state.progress as any)[key] = value;

      changes.push({
        path: `progress.${key}`,
        previousValue: oldValue,
        newValue: value,
      });
    }

    // Always update lastUpdated
    state.progress.lastUpdated = now;

    // Emit update event
    const notification: StateChangeNotification = {
      id: uuidv4(),
      type: StateChangeType.UPDATED,
      entity: 'progress',
      entityId: meetingId,
      changes,
      timestamp: now,
    };

    this.emit('stateChange', notification);

    // Add to history
    this.addToStateHistory(meetingId, { progress: state.progress });

    // If progress is 100%, update the state status
    if (state.progress.overallProgress >= 100 && state.status !== 'completed') {
      state.status = 'completed';
      state.endTime = now;

      // Emit status change event
      const statusNotification: StateChangeNotification = {
        id: uuidv4(),
        type: StateChangeType.UPDATED,
        entity: 'state',
        entityId: meetingId,
        changes: [
          {
            path: 'status',
            previousValue: 'in_progress',
            newValue: 'completed',
          },
          {
            path: 'endTime',
            previousValue: undefined,
            newValue: now,
          },
        ],
        timestamp: now,
      };

      this.emit('stateChange', statusNotification);
    }

    // Persist if enabled
    if (this.persistenceEnabled) {
      this.persistState(meetingId);
    }
  }

  /**
   * Get results for a meeting
   */
  async getResults(meetingId: string): Promise<AnalysisResults | null> {
    this.logger.debug(`Getting results for meeting ${meetingId}`);

    const state = this.states.get(meetingId);

    if (!state) {
      return null;
    }

    return state.results || null;
  }

  /**
   * Update results for a meeting
   */
  async updateResults(
    meetingId: string,
    updates: Partial<AnalysisResults>,
  ): Promise<void> {
    this.logger.debug(`Updating results for meeting ${meetingId}`);

    const state = this.states.get(meetingId);

    if (!state) {
      throw new Error(`State not found for meeting ID: ${meetingId}`);
    }

    const now = Date.now();
    const changes: StateChangeNotification['changes'] = [];

    if (!state.results) {
      // Create new results
      state.results = {
        meetingId,
        summary: updates.summary || {
          short: '',
        },
        metadata: updates.metadata || {
          processedBy: [],
          confidence: 0,
          version: '1.0',
          generatedAt: now,
        },
      };

      // Add other fields from updates
      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'meetingId' && key !== 'summary' && key !== 'metadata') {
          (state.results as any)[key] = value;
        }
      }

      // Emit creation event
      const notification: StateChangeNotification = {
        id: uuidv4(),
        type: StateChangeType.CREATED,
        entity: 'results',
        entityId: meetingId,
        timestamp: now,
      };

      this.emit('stateChange', notification);
    } else {
      // Update existing results
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'meetingId') continue; // Skip meeting ID

        const oldValue = (state.results as any)[key];
        (state.results as any)[key] = value;

        changes.push({
          path: `results.${key}`,
          previousValue: oldValue,
          newValue: value,
        });
      }

      // Update generation timestamp
      if (state.results.metadata) {
        state.results.metadata.generatedAt = now;
      }

      // Emit update event
      const notification: StateChangeNotification = {
        id: uuidv4(),
        type: StateChangeType.UPDATED,
        entity: 'results',
        entityId: meetingId,
        changes,
        timestamp: now,
      };

      this.emit('stateChange', notification);
    }

    // Add to history
    this.addToStateHistory(meetingId, { results: state.results });

    // Persist if enabled
    if (this.persistenceEnabled) {
      this.persistState(meetingId);
    }
  }

  /**
   * Get state history for a meeting
   */
  async getStateHistory(
    meetingId: string,
    limit?: number,
  ): Promise<
    {
      timestamp: number;
      state: Partial<AgenticMeetingAnalysisState>;
      agentId?: string;
    }[]
  > {
    this.logger.debug(`Getting state history for meeting ${meetingId}`);

    const history = this.stateHistory.get(meetingId) || [];

    if (limit) {
      return history.slice(0, limit);
    }

    return history;
  }

  /**
   * Get state at a specific timestamp
   */
  async getStateAtTimestamp(
    meetingId: string,
    timestamp: number,
  ): Promise<AgenticMeetingAnalysisState | null> {
    this.logger.debug(
      `Getting state at timestamp ${timestamp} for meeting ${meetingId}`,
    );

    const history = this.stateHistory.get(meetingId) || [];

    if (history.length === 0) {
      return null;
    }

    // Find the closest history entry at or before the specified timestamp
    history.sort((a, b) => b.timestamp - a.timestamp); // Sort descending

    let reconstructedState: AgenticMeetingAnalysisState | null = null;

    for (const entry of history) {
      if (entry.timestamp <= timestamp) {
        if (!reconstructedState) {
          // Start with the current state and work backwards
          const currentState = this.states.get(meetingId);
          if (!currentState) return null;

          reconstructedState = JSON.parse(JSON.stringify(currentState));
        }

        // Apply the partial state in reverse chronological order
        for (const [key, value] of Object.entries(entry.state)) {
          (reconstructedState as any)[key] = value;
        }
      }
    }

    return reconstructedState;
  }

  /**
   * Subscribe to state changes
   */
  subscribeToChanges(
    callback: (notification: StateChangeNotification) => void,
  ): void {
    this.logger.debug('Adding state change subscription');
    this.on('stateChange', callback);
  }

  /**
   * Unsubscribe from state changes
   */
  unsubscribeFromChanges(
    callback: (notification: StateChangeNotification) => void,
  ): void {
    this.logger.debug('Removing state change subscription');
    this.off('stateChange', callback);
  }

  /**
   * List meetings with filtering options
   */
  async listMeetings(
    options: {
      limit?: number;
      offset?: number;
      status?: string;
      fromDate?: string;
      toDate?: string;
    } = {},
  ): Promise<
    {
      meetingId: string;
      title?: string;
      date?: string;
      status: string;
    }[]
  > {
    this.logger.debug(
      `Listing meetings with options: ${JSON.stringify(options)}`,
    );

    let meetings = Array.from(this.states.values()).map((state) => ({
      meetingId: state.meetingId,
      title: state.metadata?.title,
      date: state.metadata?.date,
      status: state.status,
    }));

    // Apply filters
    if (options.status) {
      meetings = meetings.filter((m) => m.status === options.status);
    }

    if (options.fromDate) {
      const fromDate = new Date(options.fromDate).getTime();
      meetings = meetings.filter((m) => {
        if (!m.date) return true;
        return new Date(m.date).getTime() >= fromDate;
      });
    }

    if (options.toDate) {
      const toDate = new Date(options.toDate).getTime();
      meetings = meetings.filter((m) => {
        if (!m.date) return true;
        return new Date(m.date).getTime() <= toDate;
      });
    }

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || meetings.length;

    return meetings.slice(offset, offset + limit);
  }

  /**
   * Add state update to history
   */
  private addToStateHistory(
    meetingId: string,
    update: Partial<AgenticMeetingAnalysisState>,
    agentId?: string,
  ): void {
    if (!this.stateHistory.has(meetingId)) {
      this.stateHistory.set(meetingId, []);
    }

    const history = this.stateHistory.get(meetingId) || [];

    history.unshift({
      timestamp: Date.now(),
      state: update,
      agentId,
    });

    // Trim history if needed
    if (history.length > this.maxHistoryLength) {
      this.stateHistory.set(meetingId, history.slice(0, this.maxHistoryLength));
    } else {
      this.stateHistory.set(meetingId, history);
    }
  }

  /**
   * Persist state to storage (stub implementation)
   */
  private persistState(meetingId: string): void {
    // This would implement actual persistence to a database or file
    this.logger.debug(`Persisting state for meeting ${meetingId}`);
  }

  /**
   * Save analysis result to the repository
   */
  async saveAnalysisResult(
    meetingId: string,
    result: any
  ): Promise<void> {
    this.logger.debug(`Saving analysis result for meeting ${meetingId}`);
    
    if (!meetingId) {
      this.logger.error('Cannot save analysis result: Invalid meeting ID');
      throw new Error('Invalid meeting ID');
    }
    
    // Get the current state
    const state = await this.getState(meetingId);
    if (!state) {
      this.logger.error(`Cannot save analysis result: Meeting ${meetingId} not found`);
      throw new Error(`Meeting ${meetingId} not found`);
    }
    
    // Update the state with the results
    state.results = result.results || state.results;
    state.status = result.status || state.status;
    state.endTime = result.endTime || Date.now();
    
    // Update the state
    await this.updateState(meetingId, state);
  }

  /**
   * Save analysis progress to the repository
   */
  async saveAnalysisProgress(
    meetingId: string,
    progressData: any
  ): Promise<void> {
    this.logger.debug(`Saving analysis progress for meeting ${meetingId}`);
    
    if (!meetingId) {
      this.logger.error('Cannot save analysis progress: Invalid meeting ID');
      throw new Error('Invalid meeting ID');
    }
    
    // Get the current state
    const state = await this.getState(meetingId);
    if (!state) {
      this.logger.error(`Cannot save analysis progress: Meeting ${meetingId} not found`);
      throw new Error(`Meeting ${meetingId} not found`);
    }
    
    // Update the progress
    const progress: AnalysisProgress = {
      ...state.progress,
      overallProgress: progressData.progress || state.progress.overallProgress,
      lastUpdated: Date.now(),
    };
    
    // Update partial results if provided
    if (progressData.partialResults) {
      state.results = {
        ...state.results,
        ...progressData.partialResults,
        metadata: {
          ...(state.results?.metadata || {}),
          ...progressData.partialResults.metadata,
          generatedAt: Date.now(),
        },
      };
    }
    
    // Update the state
    await this.updateState(meetingId, { 
      progress,
      status: progressData.status || state.status,
      results: state.results,
    });
  }

  /**
   * Get analysis result from the repository
   */
  async getAnalysisResult(
    meetingId: string
  ): Promise<any> {
    this.logger.debug(`Getting analysis result for meeting ${meetingId}`);
    
    if (!meetingId) {
      this.logger.error('Cannot get analysis result: Invalid meeting ID');
      throw new Error('Invalid meeting ID');
    }
    
    // Get the current state
    const state = await this.getState(meetingId);
    if (!state) {
      this.logger.error(`Cannot get analysis result: Meeting ${meetingId} not found`);
      throw new Error(`Meeting ${meetingId} not found`);
    }
    
    // Return the results
    return {
      meetingId,
      status: state.status,
      results: state.results,
      error: state.errors || null,
      progress: state.progress?.overallProgress || 100
    };
  }

  /**
   * Get analysis status from the repository
   */
  async getAnalysisStatus(
    meetingId: string
  ): Promise<any> {
    this.logger.debug(`Getting analysis status for meeting ${meetingId}`);
    
    if (!meetingId) {
      this.logger.error('Cannot get analysis status: Invalid meeting ID');
      throw new Error('Invalid meeting ID');
    }
    
    // Get the current state
    const state = await this.getState(meetingId);
    if (!state) {
      this.logger.error(`Cannot get analysis status: Meeting ${meetingId} not found`);
      throw new Error(`Meeting ${meetingId} not found`);
    }
    
    // Return the status
    return {
      meetingId,
      status: state.status,
      progress: state.progress?.overallProgress || 0,
      partialResults: state.results || {},
      updatedAt: state.progress?.lastUpdated || Date.now()
    };
  }
}
