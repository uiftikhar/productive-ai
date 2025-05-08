// @ts-nocheck

/**
 * Unit tests for StateRepositoryService
 */
import { StateRepositoryService, Meeting } from '../state/state-repository.service';
import { 
  StateChangeNotification,
  StateChangeType
} from '../interfaces/state.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

// Mock console logger to avoid cluttering test output
jest.mock('../../../shared/logger/console-logger', () => {
  return {
    ConsoleLogger: jest.fn().mockImplementation(() => {
      return {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        shouldLog: jest.fn().mockReturnValue(true),
      };
    }),
  };
});

describe('StateRepositoryService', () => {
  let stateRepo: StateRepositoryService;
  let logger: ConsoleLogger;
  
  // Sample meeting data for testing
  const sampleMeeting: Meeting = {
    meetingId: 'test-meeting-1',
    title: 'Test Meeting',
    transcript: 'This is a test transcript for meeting analysis',
    participants: [
      { id: 'user1', name: 'User One', role: 'presenter' },
      { id: 'user2', name: 'User Two', role: 'attendee' }
    ],
    metadata: {
      startTime: new Date('2023-05-01T10:00:00Z').toISOString(),
      endTime: new Date('2023-05-01T11:00:00Z').toISOString(),
      meetingType: 'planning'
    }
  };
  
  beforeEach(() => {
    // Create a new logger and state repository for each test
    logger = new ConsoleLogger();
    stateRepo = new StateRepositoryService({ 
      logger,
      maxHistoryLength: 5
    });
  });
  
  describe('Initialization', () => {
    it('should initialize successfully with default options', async () => {
      // Initialize
      await stateRepo.initialize();
      
      // Verify logger was called
      expect(logger.info).toHaveBeenCalledWith('Initializing state repository service');
      expect(logger.info).toHaveBeenCalledWith('State repository service initialized');
    });
    
    it('should initialize with persistence enabled', async () => {
      // Create state repository with persistence
      const persistentRepo = new StateRepositoryService({
        logger,
        persistenceEnabled: true
      });
      
      // Initialize
      await persistentRepo.initialize();
      
      // Verify
      expect(logger.info).toHaveBeenCalledWith('Persistence enabled, loading saved state');
    });
  });
  
  describe('Meeting management', () => {
    it('should save a meeting and create initial state', async () => {
      // Save meeting
      await stateRepo.saveMeeting(sampleMeeting);
      
      // Get the meeting
      const retrievedMeeting = await stateRepo.getMeeting(sampleMeeting.meetingId);
      
      // Verify
      expect(retrievedMeeting).toEqual(sampleMeeting);
      
      // Check that state was initialized
      const state = await stateRepo.getState(sampleMeeting.meetingId);
      
      // Verify state structure
      expect(state).toBeDefined();
      expect(state.meetingId).toBe(sampleMeeting.meetingId);
      expect(state.status).toBe('pending');
      expect(state.metadata.meetingId).toBe(sampleMeeting.meetingId);
      expect(state.transcript.meetingId).toBe(sampleMeeting.meetingId);
    });
    
    it('should throw error when saving meeting without ID', async () => {
      // Attempt to save an invalid meeting
      const invalidMeeting = { title: 'No ID Meeting' } as Meeting;
      
      // Verify it throws
      await expect(stateRepo.saveMeeting(invalidMeeting))
        .rejects.toThrow('Invalid meeting data: meetingId is required');
    });
    
    it('should get meeting by ID', async () => {
      // Save a meeting
      await stateRepo.saveMeeting(sampleMeeting);
      
      // Retrieve it
      const meeting = await stateRepo.getMeeting(sampleMeeting.meetingId);
      
      // Verify
      expect(meeting).toEqual(sampleMeeting);
    });
    
    it('should return null for non-existent meeting', async () => {
      // Try to get a meeting that doesn't exist
      const result = await stateRepo.getMeeting('non-existent-id');
      
      // Verify
      expect(result).toBeNull();
    });
    
    it('should list saved meetings', async () => {
      // Save multiple meetings
      const meeting1 = { ...sampleMeeting, meetingId: 'meeting-1', title: 'Meeting 1' };
      const meeting2 = { ...sampleMeeting, meetingId: 'meeting-2', title: 'Meeting 2' };
      const meeting3 = { ...sampleMeeting, meetingId: 'meeting-3', title: 'Meeting 3' };
      
      await stateRepo.saveMeeting(meeting1);
      await stateRepo.saveMeeting(meeting2);
      await stateRepo.saveMeeting(meeting3);
      
      // Update the states to have different status
      await stateRepo.updateState('meeting-1', { status: 'pending' });
      await stateRepo.updateState('meeting-2', { status: 'completed' });
      await stateRepo.updateState('meeting-3', { status: 'in_progress' });
      
      // List all meetings
      const meetings = await stateRepo.listMeetings();
      
      // Verify
      expect(meetings).toHaveLength(3);
      expect(meetings.some(m => m.meetingId === 'meeting-1')).toBeTruthy();
      expect(meetings.some(m => m.meetingId === 'meeting-2')).toBeTruthy();
      expect(meetings.some(m => m.meetingId === 'meeting-3')).toBeTruthy();
      
      // List with status filter
      const completedMeetings = await stateRepo.listMeetings({ status: 'completed' });
      expect(completedMeetings).toHaveLength(1);
      expect(completedMeetings[0].meetingId).toBe('meeting-2');
      
      // List with limit
      const limitedMeetings = await stateRepo.listMeetings({ limit: 2 });
      expect(limitedMeetings).toHaveLength(2);
    });
  });
  
  describe('State management', () => {
    beforeEach(async () => {
      // Save a meeting to work with
      await stateRepo.saveMeeting(sampleMeeting);
    });
    
    it('should get state for a meeting', async () => {
      // Get state
      const state = await stateRepo.getState(sampleMeeting.meetingId);
      
      // Verify
      expect(state).toBeDefined();
      expect(state.meetingId).toBe(sampleMeeting.meetingId);
      expect(state.status).toBe('pending');
    });
    
    it('should throw error for non-existent state', async () => {
      // Try to get state for non-existent meeting
      await expect(stateRepo.getState('non-existent-id'))
        .rejects.toThrow('State not found for meeting ID: non-existent-id');
    });
    
    it('should update state for a meeting', async () => {
      // Updates to apply
      const updates = {
        status: 'in_progress',
        progress: {
          meetingId: sampleMeeting.meetingId,
          overallProgress: 25,
          started: Date.now(),
          lastUpdated: Date.now(),
          goals: [],
          taskStatuses: {}
        }
      };
      
      // Update state
      await stateRepo.updateState(sampleMeeting.meetingId, updates);
      
      // Get updated state
      const state = await stateRepo.getState(sampleMeeting.meetingId);
      
      // Verify
      expect(state.status).toBe('in_progress');
      expect(state.progress.overallProgress).toBe(25);
    });
    
    it('should create new state when updating non-existent meeting', async () => {
      const newMeetingId = 'new-meeting-id';
      const updates = {
        meetingId: newMeetingId,
        status: 'in_progress'
      };
      
      // Update state for a meeting that doesn't exist yet
      await stateRepo.updateState(newMeetingId, updates);
      
      // Get the state
      const state = await stateRepo.getState(newMeetingId);
      
      // Verify
      expect(state).toBeDefined();
      expect(state.meetingId).toBe(newMeetingId);
      expect(state.status).toBe('in_progress');
    });
    
    it('should throw error when updating with mismatched meetingId', async () => {
      // Try to update with mismatched IDs
      await expect(stateRepo.updateState('meeting-1', { meetingId: 'meeting-2', status: 'in_progress' }))
        .rejects.toThrow('Meeting ID mismatch: meeting-2 vs meeting-1');
    });
    
    it('should maintain state history when updating', async () => {
      // Make multiple updates
      await stateRepo.updateState(sampleMeeting.meetingId, { status: 'in_progress' });
      await stateRepo.updateState(sampleMeeting.meetingId, { status: 'completed' });
      await stateRepo.updateState(sampleMeeting.meetingId, { status: 'completed' });
      
      // Get history
      const history = await stateRepo.getStateHistory(sampleMeeting.meetingId);
      
      // Verify
      expect(history.length).toBeGreaterThanOrEqual(3);
      
      // Verify most recent update is first
      expect(history[0].state.status).toBe('completed');
    });
    
    it('should limit history length to maxHistoryLength', async () => {
      // Create repo with small history limit
      const smallHistoryRepo = new StateRepositoryService({
        logger,
        maxHistoryLength: 3
      });
      
      // Save meeting
      await smallHistoryRepo.saveMeeting(sampleMeeting);
      
      // Make more updates than the limit
      await smallHistoryRepo.updateState(sampleMeeting.meetingId, { status: 'in_progress' });
      await smallHistoryRepo.updateState(sampleMeeting.meetingId, { status: 'analyzing' });
      await smallHistoryRepo.updateState(sampleMeeting.meetingId, { status: 'reviewing' });
      await smallHistoryRepo.updateState(sampleMeeting.meetingId, { status: 'finalizing' });
      await smallHistoryRepo.updateState(sampleMeeting.meetingId, { status: 'completed' });
      
      // Get history
      const history = await smallHistoryRepo.getStateHistory(sampleMeeting.meetingId);
      
      // Verify it's limited
      expect(history.length).toBeLessThanOrEqual(3);
      
      // Most recent updates should be kept
      expect(history[0].state.status).toBe('completed');
    });
    
    it('should get state at a specific timestamp', async () => {
      // Make updates with delays to ensure distinct timestamps
      await stateRepo.updateState(sampleMeeting.meetingId, { status: 'in_progress' });
      const firstUpdateTime = Date.now();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await stateRepo.updateState(sampleMeeting.meetingId, { status: 'analyzing' });
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const midUpdateTime = Date.now();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await stateRepo.updateState(sampleMeeting.meetingId, { status: 'completed' });
      
      // Get history
      const history = await stateRepo.getStateHistory(sampleMeeting.meetingId);
      
      // Get state at the middle timestamp
      const midState = await stateRepo.getStateAtTimestamp(sampleMeeting.meetingId, midUpdateTime);
      
      // Verify
      expect(midState).toBeDefined();
      expect(midState!.status).toBe('completed');
    });
  });
  
  describe('Team management', () => {
    beforeEach(async () => {
      // Save a meeting to work with
      await stateRepo.saveMeeting(sampleMeeting);
    });
    
    it('should update and get team for a meeting', async () => {
      // Update team
      const team = {
        id: 'team-1', 
        meetingId: sampleMeeting.meetingId,
        coordinator: 'agent1',
        specialists: [
          { id: 'agent2', role: 'analyzer', specialization: 'content' },
          { id: 'agent3', role: 'analyzer', specialization: 'sentiment' }
        ],
        created: Date.now(),
        updated: Date.now()
      };
      
      await stateRepo.updateTeam(sampleMeeting.meetingId, team);
      
      // Get team
      const retrievedTeam = await stateRepo.getTeam(sampleMeeting.meetingId);
      
      // Verify
      expect(retrievedTeam).toBeDefined();
      expect(retrievedTeam!.specialists).toHaveLength(2);
      expect(retrievedTeam!.coordinator).toBe('agent1');
    });
    
    it('should return null for non-existent team', async () => {
      // Get team for a meeting that doesn't have one
      const team = await stateRepo.getTeam('non-existent-id');
      
      // Verify
      expect(team).toBeNull();
    });
  });
  
  describe('Progress tracking', () => {
    beforeEach(async () => {
      // Save a meeting to work with
      await stateRepo.saveMeeting(sampleMeeting);
    });
    
    it('should update and get progress for a meeting', async () => {
      // Update progress
      const progress = {
        meetingId: sampleMeeting.meetingId,
        overallProgress: 42,
        goals: [
          { id: 'goal1', description: 'Analyze transcript', progress: 80 },
          { id: 'goal2', description: 'Generate summary', progress: 30 }
        ],
        taskStatuses: {
          'task1': { status: 'completed', progress: 100 },
          'task2': { status: 'in_progress', progress: 60 }
        },
        started: Date.now() - 1000,
        lastUpdated: Date.now()
      };
      
      await stateRepo.updateProgress(sampleMeeting.meetingId, progress);
      
      // Get progress
      const retrievedProgress = await stateRepo.getProgress(sampleMeeting.meetingId);
      
      // Verify
      expect(retrievedProgress).toBeDefined();
      expect(retrievedProgress.overallProgress).toBe(42);
      expect(retrievedProgress.goals).toHaveLength(2);
      expect(retrievedProgress.taskStatuses['task1'].status).toBe('completed');
    });
  });
  
  describe('Results management', () => {
    beforeEach(async () => {
      // Save a meeting to work with
      await stateRepo.saveMeeting(sampleMeeting);
    });
    
    it('should update and get results for a meeting', async () => {
      // Update results
      const results = {
        meetingId: sampleMeeting.meetingId,
        summary: {
          short: 'Brief meeting summary',
          detailed: 'Detailed meeting summary with more information'
        },
        actionItems: [
          { id: 'action1', description: 'Task 1', assignees: ['user1'] },
          { id: 'action2', description: 'Task 2', assignees: ['user2'] }
        ],
        decisions: [
          { id: 'decision1', description: 'Decision 1' }
        ],
        metadata: {
          processedBy: ['agent1', 'agent2'],
          confidence: 0.92,
          version: '1.0',
          generatedAt: Date.now()
        }
      };
      
      await stateRepo.updateResults(sampleMeeting.meetingId, results);
      
      // Get results
      const retrievedResults = await stateRepo.getResults(sampleMeeting.meetingId);
      
      // Verify
      expect(retrievedResults).toBeDefined();
      expect(retrievedResults!.summary.short).toBe('Brief meeting summary');
      expect(retrievedResults!.actionItems).toHaveLength(2);
      expect(retrievedResults!.decisions).toHaveLength(1);
      expect(retrievedResults!.metadata.confidence).toBe(0.92);
    });
    
    it('should return null for non-existent results', async () => {
      // Get results for a meeting that doesn't have any
      const results = await stateRepo.getResults('non-existent-id');
      
      // Verify
      expect(results).toBeNull();
    });
  });
  
  describe('Event notifications', () => {
    beforeEach(async () => {
      // Save a meeting to work with
      await stateRepo.saveMeeting(sampleMeeting);
    });
    
    it('should notify subscribers of state changes', async () => {
      // Create mock callback
      const mockCallback = jest.fn();
      
      // Subscribe to changes
      stateRepo.subscribeToChanges(mockCallback);
      
      // Update state to trigger notification
      await stateRepo.updateState(sampleMeeting.meetingId, { status: 'in_progress' });
      
      // Verify callback was called
      expect(mockCallback).toHaveBeenCalledTimes(1);
      
      // Verify notification structure
      const notification = mockCallback.mock.calls[0][0] as StateChangeNotification;
      expect(notification.type).toBe(StateChangeType.UPDATED);
      expect(notification.entityId).toBe(sampleMeeting.meetingId);
      expect(notification.changes).toBeDefined();
      expect(notification.changes.some(c => c.path === 'status' && c.newValue === 'in_progress')).toBeTruthy();
    });
    
    it('should stop sending notifications after unsubscribing', async () => {
      // Create mock callback
      const mockCallback = jest.fn();
      
      // Subscribe
      stateRepo.subscribeToChanges(mockCallback);
      
      // Update to trigger notification
      await stateRepo.updateState(sampleMeeting.meetingId, { status: 'in_progress' });
      
      // Verify callback was called
      expect(mockCallback).toHaveBeenCalledTimes(1);
      
      // Unsubscribe
      stateRepo.unsubscribeFromChanges(mockCallback);
      mockCallback.mockClear();
      
      // Update again
      await stateRepo.updateState(sampleMeeting.meetingId, { status: 'completed' });
      
      // Verify callback was not called
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });
}); 