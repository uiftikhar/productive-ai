import { PersistentStateManager } from '../persistent-state-manager';
import { MemoryStorageAdapter } from '../storage-adapters/memory-storage.adapter';

describe('PersistentStateManager', () => {
  let stateManager: PersistentStateManager;
  let storageAdapter: MemoryStorageAdapter;
  
  beforeEach(async () => {
    // Create a fresh storage adapter for each test
    storageAdapter = new MemoryStorageAdapter({
      namespace: 'test',
      simulateNetworkDelay: false
    });
    
    // Create a state manager using the memory adapter
    stateManager = new PersistentStateManager({
      storageAdapter,
      namespace: 'test',
      ttl: 0,
      autoSerialize: true
    });
    
    // Initialize the state manager
    await stateManager.initialize();
  });
  
  test('should save and load state', async () => {
    // Sample state data
    const testData = {
      id: 'test123',
      name: 'Test Meeting',
      participants: [{ id: 'user1', name: 'Alice' }],
      status: 'active'
    };
    
    // Save the state
    await stateManager.saveState('meeting1', testData);
    
    // Load the state
    const loadedData = await stateManager.loadState('meeting1');
    
    // Verify the data was loaded correctly
    expect(loadedData).toEqual(testData);
  });
  
  test('should update state', async () => {
    // Initial state data
    const initialData = {
      id: 'test123',
      name: 'Test Meeting',
      participants: [{ id: 'user1', name: 'Alice' }],
      status: 'active'
    };
    
    // Save the initial state
    await stateManager.saveState('meeting1', initialData);
    
    // Update with partial data
    const updateData = {
      status: 'completed',
      summary: 'This is a summary'
    };
    
    await stateManager.updateState('meeting1', updateData);
    
    // Load the updated state
    const loadedData = await stateManager.loadState('meeting1');
    
    // Verify the data was updated correctly
    expect(loadedData).toEqual({
      ...initialData,
      ...updateData
    });
  });
  
  test('should track metadata and history', async () => {
    // Initial state data
    const initialData = { name: 'Test', value: 42 };
    
    // Save the initial state with metadata
    await stateManager.saveState('state1', initialData, {
      updatedBy: 'user1',
      description: 'Initial creation'
    });
    
    // Update the state with metadata
    await stateManager.updateState('state1', { value: 100 }, {
      updatedBy: 'user2',
      description: 'Value update'
    });
    
    // Get the metadata
    const metadata = await stateManager.getStateMetadata('state1');
    
    // Verify metadata and history
    expect(metadata).toBeDefined();
    expect(metadata?.version).toBe(2);
    expect(metadata?.updatedBy).toBe('user2');
    
    // Check history entries
    expect(metadata?.history).toHaveLength(2);
    expect(metadata?.history?.[0].description).toBe('Initial creation');
    expect(metadata?.history?.[1].description).toBe('Value update');
  });
  
  test('should delete state', async () => {
    // Sample state data
    const testData = { name: 'Test', value: 42 };
    
    // Save the state
    await stateManager.saveState('state1', testData);
    
    // Verify it exists
    const exists1 = await stateManager.hasState('state1');
    expect(exists1).toBe(true);
    
    // Delete the state
    await stateManager.deleteState('state1');
    
    // Verify it no longer exists
    const exists2 = await stateManager.hasState('state1');
    expect(exists2).toBe(false);
    
    // Load should return null
    const loadedData = await stateManager.loadState('state1');
    expect(loadedData).toBeNull();
  });
  
  test('should list states', async () => {
    // Save multiple states
    await stateManager.saveState('meeting1', { name: 'Meeting 1' });
    await stateManager.saveState('meeting2', { name: 'Meeting 2' });
    await stateManager.saveState('task1', { description: 'Task 1' });
    
    // List all states
    const allStates = await stateManager.listStates();
    expect(allStates.length).toBe(3);
    expect(allStates).toContain('meeting1');
    expect(allStates).toContain('meeting2');
    expect(allStates).toContain('task1');
    
    // List with prefix filter
    const meetingStates = await stateManager.listStates({
      keyPrefix: 'meeting'
    });
    expect(meetingStates.length).toBe(2);
    expect(meetingStates).toContain('meeting1');
    expect(meetingStates).toContain('meeting2');
    
    // List with custom filter function
    const filterFn = (key: string) => key.endsWith('1');
    const endsWith1States = await stateManager.listStates({
      filterFn
    });
    expect(endsWith1States.length).toBe(2);
    expect(endsWith1States).toContain('meeting1');
    expect(endsWith1States).toContain('task1');
  });
  
  test('should clear all states', async () => {
    // Save multiple states
    await stateManager.saveState('meeting1', { name: 'Meeting 1' });
    await stateManager.saveState('meeting2', { name: 'Meeting 2' });
    
    // Verify states exist
    const states1 = await stateManager.listStates();
    expect(states1.length).toBe(2);
    
    // Clear all states
    await stateManager.clearAllStates();
    
    // Verify no states exist
    const states2 = await stateManager.listStates();
    expect(states2.length).toBe(0);
  });
}); 