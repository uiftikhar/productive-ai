/**
 * Test script for demonstrating status reporting and coordination (Milestone 4)
 *
 * This script demonstrates:
 * 1. Creating and reporting task progress
 * 2. Handling blockers and assistance requests
 * 3. Managing task dependencies and coordination
 * 4. Setting up and monitoring synchronization points
 */

const { v4: uuidv4 } = require('uuid');
const { Logger } = require('./dist/shared/logger/console-logger');
const {
  ProgressBroadcastService,
} = require('./dist/agents/services/progress-broadcast.service');
const {
  TaskCoordinationService,
} = require('./dist/agents/services/task-coordination.service');
const {
  SynchronizationPointService,
} = require('./dist/agents/services/synchronization-point.service');
const {
  BlockerResolutionService,
} = require('./dist/agents/services/blocker-resolution.service');
const {
  CollectiveProblemSolvingService,
} = require('./dist/agents/services/collective-problem-solving.service');
const {
  AgentMessagingService,
} = require('./dist/agents/services/agent-messaging.service');
const {
  AgentRegistryService,
} = require('./dist/agents/services/agent-registry.service');
const {
  StatusUpdateType,
  ProgressStatus,
  StatusPriority,
  createProgressUpdate,
  createBlockerUpdate,
  createAssistanceRequest,
} = require('./dist/agents/interfaces/status-reporting.interface');
const {
  DependencyType,
  TaskPriority,
} = require('./dist/agents/services/task-coordination.service');
const {
  AssistanceCategory,
  AssistanceResponseType,
} = require('./dist/agents/interfaces/assistance-request.interface');

// Create a logger
const logger = new Logger({ level: 'info' });

// Mock agent messaging service
class MockAgentMessagingService {
  constructor() {
    this.messages = [];
    this.conversations = new Map();
  }

  async sendMessage(message) {
    logger.info(
      `Message sent: ${message.intent} to ${message.recipientId || 'broadcast'}`,
    );
    this.messages.push(message);
    return message;
  }

  async createConversation(participants, topic) {
    const conversationId = uuidv4();
    this.conversations.set(conversationId, {
      conversationId,
      participants,
      topic,
      startTime: Date.now(),
    });
    return { conversationId, participants, topic };
  }

  async getConversations(participants) {
    const result = [];
    for (const conversation of this.conversations.values()) {
      const allPresent = participants.every((id) =>
        conversation.participants.includes(id),
      );
      if (allPresent) {
        result.push(conversation);
      }
    }
    return result;
  }
}

// Mock agent registry service
class MockAgentRegistryService {
  constructor() {
    this.agents = new Map();

    // Add some test agents
    this.addAgent({
      id: 'task-planner',
      name: 'Task Planner',
      description: 'Plans and coordinates tasks',
      capabilities: ['planning', 'coordination'],
    });

    this.addAgent({
      id: 'development-agent',
      name: 'Development Agent',
      description: 'Handles development tasks',
      capabilities: ['coding', 'debugging'],
    });

    this.addAgent({
      id: 'testing-agent',
      name: 'Testing Agent',
      description: 'Tests software components',
      capabilities: ['testing', 'quality-assurance'],
    });

    this.addAgent({
      id: 'integration-agent',
      name: 'Integration Agent',
      description: 'Handles component integration',
      capabilities: ['integration', 'deployment'],
    });

    this.addAgent({
      id: 'architecture-agent',
      name: 'Architecture Agent',
      description: 'Defines system architecture',
      capabilities: ['architecture', 'design', 'technical-guidance'],
    });
  }

  addAgent(agent) {
    this.agents.set(agent.id, agent);
  }

  async getAgent(agentId) {
    return this.agents.get(agentId);
  }

  async getAllAgents() {
    return Array.from(this.agents.values());
  }
}

// Initialize test environment
async function initializeTestEnv() {
  const messagingService = new MockAgentMessagingService();
  const agentRegistry = new MockAgentRegistryService();

  // Create services
  const progressService = new ProgressBroadcastService(
    messagingService,
    agentRegistry,
    logger,
  );

  const taskCoordination = new TaskCoordinationService(
    messagingService,
    progressService,
    logger,
  );

  const syncPointService = new SynchronizationPointService(
    taskCoordination,
    progressService,
    messagingService,
    agentRegistry,
    logger,
  );

  const blockerResolution = new BlockerResolutionService(
    messagingService,
    progressService,
    agentRegistry,
    logger,
  );

  const problemSolving = new CollectiveProblemSolvingService(
    blockerResolution,
    messagingService,
    agentRegistry,
    logger,
  );

  return {
    messagingService,
    agentRegistry,
    progressService,
    taskCoordination,
    syncPointService,
    blockerResolution,
    problemSolving,
  };
}

// Test progress reporting and tracking
async function testProgressReporting(services) {
  logger.info('=== Testing Progress Reporting ===');

  const { progressService } = services;

  // Create some task IDs
  const taskIds = {
    planning: uuidv4(),
    development: uuidv4(),
    testing: uuidv4(),
    integration: uuidv4(),
  };

  // Subscribe to progress updates
  progressService.subscribe('status.progress', (update) => {
    logger.info(
      `Progress update received: ${update.taskId} (${update.status}): ${update.percentComplete}%`,
    );
  });

  // Submit progress updates
  await progressService.submitStatusUpdate(
    createProgressUpdate(
      'task-planner',
      taskIds.planning,
      ProgressStatus.IN_PROGRESS,
      25,
      3600000, // 1 hour spent
      'Planning task in progress',
      {
        estimatedTimeRemaining: 10800000, // 3 hours remaining
        subtasksCompleted: 3,
        subtasksTotal: 12,
      },
    ),
  );

  await progressService.submitStatusUpdate(
    createProgressUpdate(
      'development-agent',
      taskIds.development,
      ProgressStatus.IN_PROGRESS,
      50,
      7200000, // 2 hours spent
      'Development progressing well',
      {
        estimatedTimeRemaining: 7200000, // 2 hours remaining
        metrics: {
          completed_features: 3,
          code_coverage: 75,
        },
      },
    ),
  );

  // Get task summary
  const planningStatus = progressService.getTaskStatusSummary(taskIds.planning);
  logger.info(
    `Task summary: ${planningStatus.status}, ${planningStatus.percentComplete}%, health: ${planningStatus.healthIndicator}`,
  );

  return taskIds;
}

// Test blocker reporting and resolution
async function testBlockerReporting(services, taskIds) {
  logger.info('\n=== Testing Blocker Reporting and Resolution ===');

  const { progressService, blockerResolution } = services;

  // Subscribe to blocker updates
  progressService.subscribe('status.blocker', (update) => {
    logger.info(
      `Blocker reported: ${update.blockerDescription} (${update.impact})`,
    );
  });

  // Report a blocker
  const blockerUpdate = createBlockerUpdate(
    'testing-agent',
    taskIds.testing,
    'API integration failing due to authentication issues',
    'major',
    'Testing blocked by authentication failure',
    {
      potentialSolutions: [
        'Review authentication configuration',
        'Check API credentials',
        'Verify network connectivity',
      ],
      escalationLevel: 1,
    },
  );

  await progressService.submitStatusUpdate(blockerUpdate);

  // Wait for the blocker resolution service to process it
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Get assistance requests for the task
  const assistanceRequests = blockerResolution.getTaskAssistanceRequests(
    taskIds.testing,
  );
  if (assistanceRequests.length > 0) {
    logger.info(`Assistance request created: ${assistanceRequests[0].title}`);

    // Submit a response to the assistance request
    const response = {
      id: uuidv4(),
      requestId: assistanceRequests[0].id,
      responderId: 'architecture-agent',
      timestamp: Date.now(),
      responseType: AssistanceResponseType.SOLUTION,
      content:
        'The authentication issue is caused by expired API credentials. Renew the credentials in the developer portal and update the configuration file.',
      confidence: 0.9,
      completeness: 0.95,
    };

    await blockerResolution.submitResponse(response);

    // Get updated request
    const updatedRequest = blockerResolution.getAssistanceRequest(
      assistanceRequests[0].id,
    );
    logger.info(`Assistance request status: ${updatedRequest.status}`);
  }

  return assistanceRequests;
}

// Test task coordination and dependencies
async function testTaskCoordination(services, taskIds) {
  logger.info('\n=== Testing Task Coordination and Dependencies ===');

  const { taskCoordination } = services;

  // Create task dependencies
  const planningToDevDependency = taskCoordination.createDependency(
    taskIds.planning,
    taskIds.development,
    DependencyType.FINISH_TO_START,
    'Development cannot start until planning is complete',
  );

  const devToTestingDependency = taskCoordination.createDependency(
    taskIds.development,
    taskIds.testing,
    DependencyType.FINISH_TO_START,
    'Testing cannot start until development is complete',
  );

  const testingToIntegrationDependency = taskCoordination.createDependency(
    taskIds.testing,
    taskIds.integration,
    DependencyType.FINISH_TO_START,
    'Integration cannot start until testing is complete',
  );

  logger.info(
    `Created ${taskCoordination.getTaskDependencies(taskIds.development).length} dependencies for development task`,
  );

  // Check if tasks can start
  const canDevStart = taskCoordination.canTaskStart(taskIds.development);
  logger.info(
    `Can development start? ${canDevStart.canStart}, blockers: ${canDevStart.blockers.length}`,
  );

  // Set task priorities
  taskCoordination.setTaskPriority(
    taskIds.development,
    TaskPriority.HIGH,
    'task-planner',
  );

  const priority = taskCoordination.getTaskPriority(taskIds.development);
  logger.info(`Development task priority: ${priority}`);

  // Allocate resources
  const allocation = taskCoordination.allocateResource(
    taskIds.development,
    'development-agent',
    'compute',
    'dev-server-1',
    0.8,
  );

  logger.info(
    `Resource allocated: ${allocation.resourceId}, allocation: ${allocation.allocation}`,
  );

  return {
    planningToDevDependency,
    devToTestingDependency,
    testingToIntegrationDependency,
  };
}

// Test synchronization points
async function testSynchronizationPoints(services, taskIds) {
  logger.info('\n=== Testing Synchronization Points ===');

  const { syncPointService } = services;

  // Create a synchronization point
  const syncPoint = await syncPointService.createSynchronizationPoint(
    'Development Milestone 1',
    'Complete planning and development phases',
    [taskIds.planning, taskIds.development],
    'completion_barrier',
    ['task-planner', 'development-agent'],
    {
      deadline: Date.now() + 14400000, // 4 hours from now
    },
  );

  logger.info(
    `Synchronization point created: ${syncPoint.name}, status: ${syncPoint.status}`,
  );

  // Add a custom rule
  const rule = syncPointService.addSyncRule(syncPoint.id, {
    type: 'majority_completed',
    taskIds: [taskIds.planning, taskIds.development],
    requiredStatus: ProgressStatus.COMPLETED,
    minRequired: 1,
    priority: 1,
  });

  logger.info(
    `Sync rule added: ${rule.type}, minRequired: ${rule.minRequired}`,
  );

  // Check synchronization point
  await syncPointService.checkSynchronizationPoint(syncPoint.id);

  // Get updated sync point
  const updatedSyncPoint = syncPointService.getSynchronizationPoint(
    syncPoint.id,
  );
  logger.info(
    `Sync point checked, status: ${updatedSyncPoint.status}, completed tasks: ${updatedSyncPoint.completedTasks.length}`,
  );

  return syncPoint;
}

// Test the complete workflow
async function runTest() {
  try {
    // Initialize
    const services = await initializeTestEnv();

    // Run the tests
    const taskIds = await testProgressReporting(services);
    const assistanceRequests = await testBlockerReporting(services, taskIds);
    const dependencies = await testTaskCoordination(services, taskIds);
    const syncPoint = await testSynchronizationPoints(services, taskIds);

    // Complete a task to demonstrate status changes
    logger.info('\n=== Completing Planning Task ===');

    await services.progressService.submitStatusUpdate(
      createProgressUpdate(
        'task-planner',
        taskIds.planning,
        ProgressStatus.COMPLETED,
        100,
        14400000, // 4 hours spent
        'Planning task completed successfully',
        {
          subtasksCompleted: 12,
          subtasksTotal: 12,
        },
      ),
    );

    // Check the dependency status
    await new Promise((resolve) => setTimeout(resolve, 100));
    const planningToDevDependency = services.taskCoordination
      .getTaskDependencies(taskIds.development)
      .find((d) => d.sourceTaskId === taskIds.planning);

    if (planningToDevDependency) {
      logger.info(
        `Dependency status updated: ${planningToDevDependency.status}`,
      );
    }

    // Check if development can now start
    const canDevStart = services.taskCoordination.canTaskStart(
      taskIds.development,
    );
    logger.info(
      `Can development start? ${canDevStart.canStart}, blockers: ${canDevStart.blockers.length}`,
    );

    // Check sync point again
    await services.syncPointService.checkSynchronizationPoint(syncPoint.id);
    const finalSyncPoint = services.syncPointService.getSynchronizationPoint(
      syncPoint.id,
    );
    logger.info(
      `Sync point status: ${finalSyncPoint.status}, completed tasks: ${finalSyncPoint.completedTasks.length}`,
    );

    logger.info('\n=== Test Completed Successfully ===');
  } catch (error) {
    logger.error('Test error:', error);
  }
}

// Run the test
runTest();
