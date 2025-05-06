/**
 * Test file for the Agentic Meeting Analysis System
 *
 * This file tests the core components of the system, including:
 * - Shared Memory
 * - State Repository
 * - Communication Service
 * - API Compatibility Layer
 */
import { ConsoleLogger } from '../../shared/logger/console-logger';
import {
  SharedMemoryService,
  StateRepositoryService,
  CommunicationService,
  ApiCompatibilityService,
  AgenticMeetingAnalysisRequest,
  AnalysisGoalType,
  MessageType,
  ConfidenceLevel,
  AnalysisTaskStatus,
} from './index';

/**
 * Run a comprehensive test of the core systems
 */
async function testAgenticMeetingAnalysisSystem() {
  console.log('=== Testing Agentic Meeting Analysis System ===\n');

  const logger = new ConsoleLogger();
  logger.info('Initializing test environment...');

  try {
    // Test each core component
    await testSharedMemory(logger);
    await testStateRepository(logger);
    await testCommunication(logger);
    await testApiCompatibility(logger);

    logger.info('\n=== All tests completed successfully ===');
  } catch (error) {
    logger.error(
      `Test failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(error);
  }
}

/**
 * Test the shared memory service
 */
async function testSharedMemory(logger: ConsoleLogger) {
  console.log('\n--- Testing Shared Memory Service ---');

  // Initialize the service
  const memory = new SharedMemoryService({ logger });
  await memory.initialize();

  // Test writing and reading
  const testKey = 'test-key';
  const testValue = { name: 'Test Value', priority: 5 };

  await memory.write(testKey, testValue, 'test-namespace', 'test-agent');

  const readValue = await memory.read(testKey, 'test-namespace');
  console.log('Read value:', readValue);

  // Test query
  const queryResults = await memory.query({
    namespaces: ['test-namespace'],
    keyPattern: 'test-.*',
  });

  console.log('Query results:', queryResults);

  // Test subscription
  let notificationReceived = false;
  memory.subscribe(testKey, 'test-namespace', 'subscriber-agent', () => {
    notificationReceived = true;
    console.log('Notification received for key change');
  });

  // Update the value to trigger notification
  await memory.write(
    testKey,
    { ...testValue, priority: 10 },
    'test-namespace',
    'test-agent',
  );

  // Wait a bit for notification to process
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log('Notification received:', notificationReceived);

  // Clean up
  await memory.cleanup();

  logger.info('Shared Memory Service tests passed');
}

/**
 * Test the state repository service
 */
async function testStateRepository(logger: ConsoleLogger) {
  console.log('\n--- Testing State Repository Service ---');

  // Initialize the service
  const state = new StateRepositoryService({ logger });
  await state.initialize();

  // Create a test meeting state
  const meetingId = `meeting-${Date.now()}`;

  await state.updateState(meetingId, {
    meetingId,
    metadata: {
      meetingId,
      title: 'Test Meeting',
      description: 'This is a test meeting',
      date: new Date().toISOString(),
      participants: [
        { id: 'user1', name: 'User One', role: 'Presenter' },
        { id: 'user2', name: 'User Two', role: 'Attendee' },
      ],
    },
    transcript: {
      meetingId,
      segments: [
        {
          id: 'segment1',
          speakerId: 'user1',
          speakerName: 'User One',
          content: 'Welcome to the test meeting.',
          startTime: 0,
          endTime: 5000,
        },
        {
          id: 'segment2',
          speakerId: 'user2',
          speakerName: 'User Two',
          content: 'Thanks for having me.',
          startTime: 5500,
          endTime: 7000,
        },
      ],
    },
    status: 'pending',
  });

  // Get the state
  const meetingState = await state.getState(meetingId);
  console.log(
    'Meeting state created:',
    meetingState.meetingId,
    meetingState.status,
  );

  // Update progress
  await state.updateProgress(meetingId, {
    meetingId,
    overallProgress: 50,
    goals: [
      {
        type: AnalysisGoalType.EXTRACT_TOPICS,
        status: 'in_progress' as AnalysisTaskStatus,
        progress: 75,
      },
    ],
    taskStatuses: {
      task1: 'completed' as AnalysisTaskStatus,
    },
  });

  // Get progress
  const progress = await state.getProgress(meetingId);
  console.log('Progress updated:', progress.overallProgress);

  // Update results
  await state.updateResults(meetingId, {
    meetingId,
    summary: {
      short: 'This is a short summary of the test meeting.',
      detailed:
        'This is a more detailed summary with all the important points.',
    },
    topics: [
      {
        id: 'topic1',
        name: 'Test Topic',
        relevance: 0.8,
      },
    ],
    actionItems: [
      {
        id: 'action1',
        description: 'Test action',
        assignees: ['user1'],
      },
    ],
    metadata: {
      processedBy: ['agent1', 'agent2'],
      confidence: 0.9,
      version: '1.0',
      generatedAt: Date.now(),
    },
  });

  // Get results
  const results = await state.getResults(meetingId);
  console.log('Results created:', results?.summary.short);

  // List meetings
  const meetings = await state.listMeetings();
  console.log('Meetings in repository:', meetings.length);

  // Clean up
  if ('cleanup' in state && typeof state.cleanup === 'function') {
    await state.cleanup();
  }

  logger.info('State Repository Service tests passed');
}

/**
 * Test the communication service
 */
async function testCommunication(logger: ConsoleLogger) {
  console.log('\n--- Testing Communication Service ---');

  // Initialize the service
  const communication = new CommunicationService({ logger });
  await communication.initialize();

  // Create test agents
  const agent1Messages: any[] = [];
  const agent2Messages: any[] = [];

  // Register test agents
  await communication.registerAgent('agent1', async (message) => {
    agent1Messages.push(message);
    console.log(
      `Agent1 received message: ${message.id} from ${message.sender}`,
    );
  });

  await communication.registerAgent('agent2', async (message) => {
    agent2Messages.push(message);
    console.log(
      `Agent2 received message: ${message.id} from ${message.sender}`,
    );
  });

  // Test direct messaging
  const directMessageId = await communication.sendMessage({
    id: `msg-${Date.now()}`,
    type: MessageType.REQUEST,
    sender: 'agent1',
    recipients: ['agent2'],
    content: 'Hello from Agent 1',
    timestamp: Date.now(),
  });

  console.log('Direct message sent:', directMessageId);

  // Test broadcast messaging
  const broadcastMessageId = await communication.broadcastMessage({
    id: `broadcast-${Date.now()}`,
    type: MessageType.NOTIFICATION,
    sender: 'system',
    content: 'System broadcast message',
    timestamp: Date.now(),
  });

  console.log('Broadcast message sent:', broadcastMessageId);

  // Test topic subscription
  await communication.subscribeToTopic({
    agentId: 'agent1',
    topic: 'test-topic',
  });

  await communication.subscribeToTopic({
    agentId: 'agent2',
    topic: 'test-topic',
  });

  // Publish to topic
  const topicMessageId = await communication.publishToTopic('test-topic', {
    id: `topic-${Date.now()}`,
    type: MessageType.UPDATE,
    sender: 'system',
    content: 'Topic message',
    timestamp: Date.now(),
  });

  console.log('Topic message sent:', topicMessageId);

  // Wait a bit for messages to be delivered
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Check message statistics
  console.log('Agent1 received messages:', agent1Messages.length);
  console.log('Agent2 received messages:', agent2Messages.length);

  // Get message history
  const history = await communication.getMessageHistory({
    types: [MessageType.UPDATE],
  });

  console.log('Topic messages in history:', history.length);

  // Get service metrics
  const metrics = await communication.getMetrics();
  console.log('Communication metrics:', {
    messagesSent: metrics.messagesSent,
    registeredAgents: metrics.registeredAgents,
  });

  // Clean up resources
  await communication.cleanup();

  logger.info('Communication Service tests passed');
}

/**
 * Test the API compatibility layer
 */
async function testApiCompatibility(logger: ConsoleLogger) {
  console.log('\n--- Testing API Compatibility Layer ---');

  // Initialize the service
  const compatibility = new ApiCompatibilityService({ logger });
  await compatibility.initialize();

  // Test conversion from legacy to agentic format
  const legacyRequest = {
    meetingId: `meeting-${Date.now()}`,
    transcript:
      'This is a test transcript for the meeting. It includes some discussion and action items.',
    title: 'Test Meeting',
    participantIds: ['user1', 'user2'],
    includeTopics: true,
    includeActionItems: true,
    includeSentiment: false,
    visualization: true,
    adaptiveChunking: true,
  };

  const agenticRequest =
    compatibility.convertLegacyToAgenticRequest(legacyRequest);

  console.log('Converted request:', {
    meetingId: agenticRequest.meetingId,
    goals: agenticRequest.goals,
    participantsCount: agenticRequest.participants?.length,
  });

  // Check if goals were properly mapped
  const hasTopicGoal = agenticRequest.goals?.includes(
    AnalysisGoalType.EXTRACT_TOPICS,
  );
  const hasActionItemGoal = agenticRequest.goals?.includes(
    AnalysisGoalType.EXTRACT_ACTION_ITEMS,
  );
  const hasSentimentGoal = agenticRequest.goals?.includes(
    AnalysisGoalType.ANALYZE_SENTIMENT,
  );

  console.log('Goal mapping correct:', {
    topics: hasTopicGoal === legacyRequest.includeTopics,
    actionItems: hasActionItemGoal === legacyRequest.includeActionItems,
    sentiment: hasSentimentGoal === legacyRequest.includeSentiment,
  });

  // Test feature flags
  const isAgenticMode = await compatibility.isAgenticMode();
  console.log('Agentic mode enabled:', isAgenticMode);

  await compatibility.setAgenticMode(false);
  const agenticModeAfterChange = await compatibility.isAgenticMode();
  console.log('Agentic mode after change:', agenticModeAfterChange);

  // Get compatibility version
  const version = await compatibility.getCompatibilityVersion();
  console.log('Compatibility layer version:', version);

  // Test error mapping
  const mappedError = compatibility.mapAgenticErrorToLegacyFormat(
    new Error('Test error'),
  );
  console.log('Mapped error structure:', Object.keys(mappedError));

  // Clean up
  if ('cleanup' in compatibility && typeof compatibility.cleanup === 'function') {
    await compatibility.cleanup();
  }

  logger.info('API Compatibility Layer tests passed');
}

// Run the tests
testAgenticMeetingAnalysisSystem()
  .then(() => {
    console.log('\nAll tests completed!');
  })
  .catch((error) => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
