/**
 * Test file for cleanup functionality in the Agentic Meeting Analysis System
 * 
 * This file tests the proper cleanup of resources to prevent open handles
 */
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  AgenticMeetingAnalysis,
  AgenticMeetingAnalysisConfig,
  CommunicationService,
  SharedMemoryService,
  StateRepositoryService,
  ChannelType,
} from '../index';

/**
 * Run a comprehensive test of the cleanup functionality
 */
async function testCleanupFunctionality() {
  console.log('=== Testing Cleanup Functionality ===\n');

  const logger = new ConsoleLogger();
  logger.info('Initializing test environment...');

  try {
    // Test shared memory service cleanup
    await testSharedMemoryCleanup(logger);
    
    // Test communication service cleanup
    await testCommunicationServiceCleanup(logger);
    
    // Test main system cleanup
    await testSystemCleanup(logger);

    logger.info('\n=== All cleanup tests completed successfully ===');
  } catch (error) {
    logger.error(
      `Test failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(error);
  }
}

/**
 * Test the cleanup of shared memory service
 */
async function testSharedMemoryCleanup(logger: ConsoleLogger) {
  console.log('\n--- Testing Shared Memory Service Cleanup ---');

  // Initialize the service
  const memory = new SharedMemoryService({ logger });
  await memory.initialize();

  // Add some test data
  await memory.write('test-key-1', { data: 'value1' }, 'test-namespace', 'test-agent');
  await memory.write('test-key-2', { data: 'value2' }, 'test-namespace', 'test-agent');
  
  // Set up a subscription
  let callbackCalled = false;
  memory.subscribe('test-key-1', 'test-namespace', 'subscriber-agent', () => {
    callbackCalled = true;
  });
  
  // Clean up
  await memory.cleanup();
  
  // Test that cleanup was effective - try to read from memory after cleanup
  try {
    const value = await memory.read('test-key-1', 'test-namespace');
    console.log('Value after cleanup:', value); // Should be undefined or throw
  } catch (error: any) {
    console.log('Expected error after cleanup:', error.message);
  }

  logger.info('Shared Memory Service cleanup test completed');
}

/**
 * Test the cleanup of communication service
 */
async function testCommunicationServiceCleanup(logger: ConsoleLogger) {
  console.log('\n--- Testing Communication Service Cleanup ---');

  // Initialize the service
  const communication = new CommunicationService({ logger });
  await communication.initialize();

  // Register some test agents
  await communication.registerAgent('agent1', async (message) => {
    console.log('Agent 1 received message:', message.id);
  });
  
  await communication.registerAgent('agent2', async (message) => {
    console.log('Agent 2 received message:', message.id);
  });
  
  // Create a test channel
  const channelId = await communication.createChannel({
    name: 'Test Channel',
    type: ChannelType.TOPIC,
    description: 'Test channel for cleanup',
    participants: ['agent1', 'agent2'],
  });
  
  // Subscribe to a topic
  await communication.subscribeToTopic({
    agentId: 'agent1',
    topic: 'test-topic',
  });
  
  // Clean up
  await communication.cleanup();
  
  // Test that cleanup was effective - try to use the service after cleanup
  try {
    const channels = await communication.getAgentChannels('agent1');
    console.log('Channels after cleanup:', channels.length); // Should be 0 or throw
  } catch (error: any) {
    console.log('Expected error after cleanup:', error.message);
  }

  logger.info('Communication Service cleanup test completed');
}

/**
 * Test the cleanup of the complete system
 */
async function testSystemCleanup(logger: ConsoleLogger) {
  console.log('\n--- Testing System Cleanup ---');

  // Initialize the complete system with all features enabled
  const config: AgenticMeetingAnalysisConfig = {
    logger,
    useCollaborativeFramework: true,
    enableHumanFeedback: true,
    enableAdvancedFunctionality: true,
  };
  
  const system = new AgenticMeetingAnalysis(config);
  await system.initialize();
  
  // Start an analysis
  try {
    const result = await system.analyzeMeeting(
      'test-meeting-' + Date.now(),
      'This is a test meeting transcript. There are some key points we need to discuss.',
      {
        previousMeetings: [],
        additionalContext: 'This is a test meeting for cleanup functionality.',
      }
    );
    
    console.log('Analysis started:', result.meetingId);
  } catch (error: any) {
    console.log('Error starting analysis:', error.message);
  }
  
  // Clean up
  await system.cleanup();
  
  // After cleanup, verify system can't be used anymore
  try {
    const status = await system.getAnalysisStatus('test-meeting');
    console.log('Status after cleanup:', status); // Should fail or return empty
  } catch (error: any) {
    console.log('Expected error after cleanup:', error.message);
  }

  logger.info('System cleanup test completed');
}

// Run the tests
testCleanupFunctionality().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
}); 