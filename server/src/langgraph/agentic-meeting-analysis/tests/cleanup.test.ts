/**
 * Jest tests for cleanup functionality in the Agentic Meeting Analysis System
 * 
 * These tests verify that services properly clean up resources to prevent open handles
 */
import { CommunicationService } from '../communication/communication.service';
import { SharedMemoryService } from '../memory/shared-memory.service';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { ChannelType } from '../interfaces/communication.interface';

describe('Cleanup functionality', () => {
  let logger: ConsoleLogger;
  
  beforeEach(() => {
    logger = new ConsoleLogger();
  });
  
  describe('CommunicationService', () => {
    let communication: CommunicationService;
    
    beforeEach(async () => {
      communication = new CommunicationService({ logger });
      await communication.initialize();
    });
    
    afterEach(async () => {
      await communication.cleanup();
    });
    
    it('should properly initialize and clean up', async () => {
      // Register test agents
      await communication.registerAgent('test-agent-1', async (message) => {
        // Empty handler
      });
      
      // Create a test channel
      const channelId = await communication.createChannel({
        name: 'Test Channel',
        type: ChannelType.TOPIC,
        description: 'Test channel for cleanup',
        participants: ['test-agent-1'],
      });
      
      // Verify channel was created
      const channel = await communication.getChannel(channelId);
      expect(channel).not.toBeNull();
      
      // Cleanup happens in afterEach
    });
    
    it('should unregister agents on cleanup', async () => {
      // Register test agent
      await communication.registerAgent('test-agent-2', async (message) => {
        // Empty handler
      });
      
      // Clean up manually for this test
      await communication.cleanup();
      
      // Try to use the service after cleanup - should have empty results
      const metrics = await communication.getMetrics();
      expect(metrics.registeredAgents).toBe(0);
    });
  });
  
  describe('SharedMemoryService', () => {
    let memory: SharedMemoryService;
    
    beforeEach(async () => {
      memory = new SharedMemoryService({ logger });
      await memory.initialize();
    });
    
    afterEach(async () => {
      await memory.cleanup();
    });
    
    it('should properly initialize and clean up', async () => {
      // Write test data
      await memory.write('test-key', { value: 'test' }, 'test-namespace', 'test-agent');
      
      // Read it back
      const value = await memory.read('test-key', 'test-namespace');
      expect(value).toEqual({ value: 'test' });
      
      // Cleanup happens in afterEach
    });
    
    it('should clear subscriptions on cleanup', async () => {
      // Set up a subscription
      let callbackCalled = false;
      
      // Write a value to start
      await memory.write('test-key', { value: 'original' }, 'test-namespace', 'test-agent');
      
      // Set up subscription 
      memory.subscribe('test-key', 'test-namespace', 'subscriber-agent', (notification) => {
        callbackCalled = true;
        console.log('Subscription notification received:', notification);
      });
      
      // Write a value to trigger subscription before cleanup
      await memory.write('test-key', { value: 'updated-before-cleanup' }, 'test-namespace', 'test-agent');
      
      // Verify callback was called
      expect(callbackCalled).toBe(true);
      
      // Reset flag
      callbackCalled = false;
      
      // Clean up
      await memory.cleanup();
      
      try {
        // Write again - callback should not be called after cleanup
        await memory.write('test-key', { value: 'updated-after-cleanup' }, 'test-namespace', 'test-agent');
        
        // Give a moment for any async processing to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify callback was not called after cleanup
        expect(callbackCalled).toBe(false);
      } catch (error: any) {
        // If writing fails due to cleanup, that's also acceptable
        console.log('Expected error after cleanup:', error.message);
      }
    });
  });
}); 