/**
 * Unit tests for StateManager
 */
import { StateManager } from '../state/state.manager';
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

describe('StateManager', () => {
  let stateManager: StateManager;
  let logger: ConsoleLogger;
  
  beforeEach(() => {
    // Create a new logger and state manager for each test
    logger = new ConsoleLogger();
    stateManager = new StateManager({ logger });
  });
  
  describe('Initialization', () => {
    it('should initialize successfully with default options', async () => {
      // Initialize the state manager
      await stateManager.initialize();
      
      // Verify logger was called
      expect(logger.info).toHaveBeenCalledWith('Initializing state manager');
      expect(logger.info).toHaveBeenCalledWith('State manager initialized');
    });
    
    it('should initialize with persistence enabled', async () => {
      // Create a state manager with persistence enabled
      const persistentManager = new StateManager({
        logger,
        persistenceEnabled: true
      });
      
      // Initialize
      await persistentManager.initialize();
      
      // Verify logger was called with the right messages
      expect(logger.info).toHaveBeenCalledWith('Persistence enabled, loading saved state');
    });
  });
  
  describe('State operations', () => {
    it('should set and get state for a specific key', async () => {
      const key = 'test-key';
      const value = { data: 'test-value' };
      
      // Set state
      await stateManager.setState(key, value);
      
      // Get state
      const result = await stateManager.getState(key);
      
      // Verify
      expect(result).toEqual(value);
    });
    
    it('should update state for a specific key', async () => {
      const key = 'update-test-key';
      const initialValue = { 
        name: 'Initial name',
        count: 0,
        active: true,
        nested: { key: 'original' }
      };
      
      // Set initial state
      await stateManager.setState(key, initialValue);
      
      // Update partial state
      const updates = {
        count: 1,
        active: false,
        nested: { key: 'updated' }
      };
      await stateManager.updateState(key, updates);
      
      // Get updated state
      const result = await stateManager.getState(key);
      
      // Verify the update merged correctly
      expect(result).toEqual({
        name: 'Initial name', // remains unchanged
        count: 1,             // updated
        active: false,        // updated
        nested: { key: 'updated' } // updated
      });
    });
    
    it('should update non-existent state by creating it', async () => {
      const key = 'non-existent-key';
      const updates = { count: 5 };
      
      // Update a key that doesn't exist yet
      await stateManager.updateState(key, updates);
      
      // Get the state
      const result = await stateManager.getState(key);
      
      // Verify
      expect(result).toEqual(updates);
    });
    
    it('should delete state for a specific key', async () => {
      const key = 'delete-test-key';
      const value = 'value to be deleted';
      
      // Set state
      await stateManager.setState(key, value);
      
      // Verify it was set
      const beforeDelete = await stateManager.getState(key);
      expect(beforeDelete).toEqual(value);
      
      // Delete state
      const deleteResult = await stateManager.deleteState(key);
      
      // Verify deletion was successful
      expect(deleteResult).toBeTruthy();
      
      // Verify state is gone
      const afterDelete = await stateManager.getState(key);
      expect(afterDelete).toBeUndefined();
    });
    
    it('should return false when deleting non-existent state', async () => {
      // Delete a key that doesn't exist
      const deleteResult = await stateManager.deleteState('non-existent-key');
      
      // Verify
      expect(deleteResult).toBeFalsy();
    });
    
    it('should check if state exists for a key', async () => {
      const key = 'exists-test-key';
      
      // Check before setting - should not exist
      const existsBefore = await stateManager.hasState(key);
      expect(existsBefore).toBeFalsy();
      
      // Set state
      await stateManager.setState(key, 'some value');
      
      // Check after setting - should exist
      const existsAfter = await stateManager.hasState(key);
      expect(existsAfter).toBeTruthy();
    });
    
    it('should get all keys in the state store', async () => {
      // Set state for multiple keys
      await stateManager.setState('key1', 'value1');
      await stateManager.setState('key2', 'value2');
      await stateManager.setState('key3', 'value3');
      
      // Get all keys
      const keys = await stateManager.getAllKeys();
      
      // Verify
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });
  });
  
  describe('Event handling', () => {
    it('should emit stateChange event when state is set', async () => {
      const key = 'event-test-key';
      const value = 'event test value';
      
      // Create a mock event listener
      const mockListener = jest.fn();
      
      // Register listener
      stateManager.on('stateChange', mockListener);
      
      // Set state
      await stateManager.setState(key, value);
      
      // Verify listener was called with the right data
      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(expect.objectContaining({
        key,
        oldValue: undefined,
        newValue: value,
        timestamp: expect.any(Number)
      }));
    });
    
    it('should emit stateChange event when state is updated', async () => {
      const key = 'update-event-key';
      const initialValue = { count: 0 };
      const updatedValue = { count: 1 };
      
      // Set initial state
      await stateManager.setState(key, initialValue);
      
      // Create a mock event listener
      const mockListener = jest.fn();
      
      // Register listener
      stateManager.on('stateChange', mockListener);
      
      // Update state
      await stateManager.updateState(key, { count: 1 });
      
      // Verify listener was called with the right data
      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(expect.objectContaining({
        key,
        oldValue: initialValue,
        newValue: updatedValue,
        timestamp: expect.any(Number)
      }));
    });
    
    it('should emit stateChange event when state is deleted', async () => {
      const key = 'delete-event-key';
      const value = 'value to be deleted';
      
      // Set state
      await stateManager.setState(key, value);
      
      // Create a mock event listener
      const mockListener = jest.fn();
      
      // Register listener
      stateManager.on('stateChange', mockListener);
      
      // Delete state
      await stateManager.deleteState(key);
      
      // Verify listener was called with the right data
      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(expect.objectContaining({
        key,
        oldValue: value,
        newValue: undefined,
        timestamp: expect.any(Number)
      }));
    });
    
    it('should stop emitting events after removing listener', async () => {
      const key = 'remove-listener-key';
      
      // Create a mock event listener
      const mockListener = jest.fn();
      
      // Register listener
      stateManager.on('stateChange', mockListener);
      
      // Set state - should trigger event
      await stateManager.setState(key, 'first value');
      
      // Verify listener was called
      expect(mockListener).toHaveBeenCalledTimes(1);
      
      // Reset mock
      mockListener.mockClear();
      
      // Remove listener
      stateManager.off('stateChange', mockListener);
      
      // Set state again - should not trigger event for removed listener
      await stateManager.setState(key, 'second value');
      
      // Verify listener was not called
      expect(mockListener).not.toHaveBeenCalled();
    });
  });
}); 