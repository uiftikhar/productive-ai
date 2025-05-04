/**
 * Integration Tests for SharedMemoryService
 * 
 * Tests the SharedMemoryService's integration with other system components.
 */

import { jest } from '@jest/globals';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  createTestMeeting,
  mockAgentResponses,
  flushPromises
} from '../test-utils';

describe('SharedMemoryService Integration', () => {
  let testEnv: any;
  
  beforeAll(async () => {
    // Set up the test environment with all services
    testEnv = await setupTestEnvironment();
  });
  
  afterAll(async () => {
    // Clean up after tests
    await cleanupTestEnvironment();
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('should store and retrieve meeting data between services', async () => {
    const { sharedMemory, stateRepository } = testEnv;
    
    // Create a test meeting
    const testMeeting = createTestMeeting();
    
    // Store in shared memory
    const memoryKey = `meeting:${testMeeting.meetingId}`;
    await sharedMemory.set(memoryKey, testMeeting);
    
    // Verify it can be retrieved from shared memory
    const retrievedFromMemory = await sharedMemory.get(memoryKey);
    expect(retrievedFromMemory).toEqual(testMeeting);
    
    // Store in state repository
    await stateRepository.saveMeeting(testMeeting);
    
    // Verify it can be retrieved from state repository
    const retrievedFromState = await stateRepository.getMeeting(testMeeting.meetingId);
    expect(retrievedFromState).toEqual(testMeeting);
  });
  
  test('should maintain data consistency across services', async () => {
    const { sharedMemory, stateRepository } = testEnv;
    
    // Create a test meeting
    const testMeeting = createTestMeeting();
    
    // Store in state repository
    await stateRepository.saveMeeting(testMeeting);
    
    // Update meeting status
    const updatedMeeting = {
      ...testMeeting,
      status: 'completed',
      updatedAt: Date.now()
    };
    
    // Update in state repository
    await stateRepository.saveMeeting(updatedMeeting);
    
    // Verify it was updated in state repository
    const fromState = await stateRepository.getMeeting(testMeeting.meetingId);
    expect(fromState.status).toBe('completed');
    
    // Store updated meeting in shared memory
    const memoryKey = `meeting:${testMeeting.meetingId}`;
    await sharedMemory.set(memoryKey, updatedMeeting);
    
    // Verify it's consistent in shared memory
    const fromMemory = await sharedMemory.get(memoryKey);
    expect(fromMemory.status).toBe('completed');
    
    // Verify both services have consistent data
    expect(fromState.status).toEqual(fromMemory.status);
    expect(fromState.updatedAt).toEqual(fromMemory.updatedAt);
  });
  
  test('should handle concurrent access from multiple services', async () => {
    const { sharedMemory } = testEnv;
    
    // Create test data
    const testKey = `test-concurrent-${Date.now()}`;
    const initialValue = { counter: 0 };
    
    // Initialize data
    await sharedMemory.set(testKey, initialValue);
    
    // Simulate concurrent updates (5 operations)
    const concurrentOperations = Array(5).fill(0).map(async (_, i) => {
      // Get current value
      const current = await sharedMemory.get(testKey);
      
      // Update value
      const updated = { 
        counter: current.counter + 1,
        lastUpdatedBy: `operation-${i}`
      };
      
      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      
      // Save updated value
      await sharedMemory.set(testKey, updated);
      
      return updated;
    });
    
    // Wait for all operations to complete
    await Promise.all(concurrentOperations);
    
    // Get final value
    const finalValue = await sharedMemory.get(testKey);
    
    // Verify the counter was updated correctly (should be 5)
    expect(finalValue.counter).toBe(5);
  });
  
  test('should publish and subscribe to memory changes', async () => {
    const { sharedMemory } = testEnv;
    
    // Create test data
    const testKey = `test-pubsub-${Date.now()}`;
    const initialValue = { status: 'initial' };
    const updatedValue = { status: 'updated' };
    
    // Set up subscription
    const changeHandler = jest.fn();
    await sharedMemory.subscribe(testKey, changeHandler);
    
    // Update value to trigger notification
    await sharedMemory.set(testKey, initialValue);
    await sharedMemory.set(testKey, updatedValue);
    
    // Wait for async operations
    await flushPromises();
    
    // Verify change handler was called
    expect(changeHandler).toHaveBeenCalledTimes(2);
    expect(changeHandler).toHaveBeenLastCalledWith(updatedValue);
    
    // Unsubscribe
    await sharedMemory.unsubscribe(testKey, changeHandler);
    
    // Update again
    await sharedMemory.set(testKey, { status: 'final' });
    
    // Verify no more calls after unsubscribing
    expect(changeHandler).toHaveBeenCalledTimes(2);
  });
}); 