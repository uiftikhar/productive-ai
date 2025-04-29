/**
 * Example demonstrating how to use the SupervisorWorkflow with a mocked UserContextFacade
 *
 * This example shows:
 * 1. How to create a mock UserContextFacade for testing
 * 2. How to create a SupervisorAgent with user context support
 * 3. How to run a SupervisorWorkflow with mocked context
 */

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { SupervisorAgent } from '../../agents/specialized/facilitator-supervisor-agent';
import { SupervisorWorkflow } from '../core/workflows/supervisor-workflow';
import {
  AgentRequest,
  AgentResponse,
} from '../../agents/interfaces/base-agent.interface';
import { v4 as uuidv4 } from 'uuid';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';

// Create a simple mock implementation of the UserContextFacade
class MockUserContextFacade {
  private logger: Logger;
  private conversations: Map<string, Array<any>> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initialized MockUserContextFacade');
    return Promise.resolve();
  }

  async storeAgentConversationTurn(
    userId: string,
    conversationId: string,
    message: string,
    embeddings: number[],
    role: 'user' | 'assistant' | 'system',
    options: any = {},
  ): Promise<string> {
    const key = `${userId}:${conversationId}`;

    if (!this.conversations.has(key)) {
      this.conversations.set(key, []);
    }

    const turnId = `turn-${Date.now()}`;
    const turnData = {
      turnId,
      userId,
      conversationId,
      message,
      role,
      timestamp: Date.now(),
      metadata: {
        ...options,
      },
    };

    this.conversations.get(key)?.push(turnData);

    this.logger.debug('Stored conversation turn', {
      userId,
      conversationId,
      role,
      messageLength: message.length,
    });

    return Promise.resolve(turnId);
  }

  async getConversationHistory(
    userId: string,
    conversationId: string,
    limit: number = 20,
    options: any = {},
  ): Promise<any[]> {
    const key = `${userId}:${conversationId}`;

    if (!this.conversations.has(key)) {
      return Promise.resolve([]);
    }

    let history = this.conversations.get(key) || [];

    // Apply filters if specified
    if (options.agentId) {
      history = history.filter(
        (turn) => turn.metadata?.agentId === options.agentId,
      );
    }

    if (options.role) {
      history = history.filter((turn) => turn.role === options.role);
    }

    // Sort by timestamp (newest first)
    history.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    history = history.slice(0, limit);

    return Promise.resolve(history);
  }

  async clearUserContext(userId: string): Promise<void> {
    // Delete all conversations for this user
    for (const key of this.conversations.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.conversations.delete(key);
      }
    }

    this.logger.info('Cleared context for user', { userId });
    return Promise.resolve();
  }

  async retrieveRagContext(
    userId: string,
    queryEmbedding: number[],
    options: any = {},
  ): Promise<any[]> {
    // In a real implementation, this would do vector similarity search
    // For mock purposes, just return an empty array
    return Promise.resolve([]);
  }
}

// Main example function
async function runExample() {
  const logger = new ConsoleLogger();
  logger.info('Starting Supervisor with Mock Context Example');

  try {
    // Create mock user context
    const mockUserContext = new MockUserContextFacade(logger);
    await mockUserContext.initialize();
    logger.info('Mock UserContextFacade initialized');

    // Generate test user ID and conversation ID
    const userId = 'test-user-' + uuidv4().substring(0, 8);
    const conversationId = 'test-conversation-' + uuidv4().substring(0, 8);
    logger.info('Created test user and conversation', {
      userId,
      conversationId,
    });

    // Initialize agent registry
    const agentRegistry = AgentRegistryService.getInstance(logger);

    // Create some test agents
    const researchAgent = new SupervisorAgent({
      name: 'Research Agent',
      description: 'Conducts research on topics',
      logger,
    });
    researchAgent.registerCapability({
      name: 'research',
      description: 'Conducts research on topics',
    });

    const summaryAgent = new SupervisorAgent({
      name: 'Summary Agent',
      description: 'Summarizes content',
      logger,
    });
    summaryAgent.registerCapability({
      name: 'summarize',
      description: 'Summarizes content',
    });

    const writingAgent = new SupervisorAgent({
      name: 'Writing Agent',
      description: 'Creates written content',
      logger,
    });
    writingAgent.registerCapability({
      name: 'writing',
      description: 'Creates written content',
    });

    // Register agents
    agentRegistry.registerAgent(researchAgent);
    agentRegistry.registerAgent(summaryAgent);
    agentRegistry.registerAgent(writingAgent);
    logger.info('Agents created and registered');

    // Create main supervisor agent
    const supervisorAgent = new SupervisorAgent({
      name: 'Main Supervisor',
      description: 'Coordinates multi-step tasks',
      logger,
      agentRegistry,
    });
    await supervisorAgent.initialize();
    logger.info('Supervisor agent initialized');

    // Create the workflow with mock user context
    const workflow = new SupervisorWorkflow(supervisorAgent, {
      tracingEnabled: true,
      includeStateInLogs: true,
      logger,
      userContext: mockUserContext as any,
      id: 'supervisor-workflow-' + uuidv4().substring(0, 8),
    });
    logger.info('Supervisor workflow created', { workflowId: workflow.id });

    // Define some example tasks
    const tasks = [
      {
        id: 'task-1',
        name: 'Research current trends in AI',
        description:
          'Research and collect information about the latest trends in artificial intelligence',
        priority: 1,
        requiredCapabilities: ['research'],
        status: 'pending',
        createdAt: Date.now(),
      },
      {
        id: 'task-2',
        name: 'Summarize research findings',
        description:
          'Create a concise summary of the research findings on AI trends',
        priority: 2,
        requiredCapabilities: ['summarize'],
        dependencies: ['task-1'],
        status: 'pending',
        createdAt: Date.now(),
      },
      {
        id: 'task-3',
        name: 'Write a blog post on AI trends',
        description:
          'Write a comprehensive blog post about current AI trends based on research and summary',
        priority: 3,
        requiredCapabilities: ['writing'],
        dependencies: ['task-2'],
        status: 'pending',
        createdAt: Date.now(),
      },
    ];

    // Prepare request with context
    const request: AgentRequest = {
      input: 'Create a comprehensive blog post about the latest trends in AI',
      capability: 'task-coordination',
      parameters: {
        tasks,
        executionStrategy: 'sequential',
        name: 'AI Trends Blog Project',
        description:
          'Multi-stage project to research, summarize, and write about AI trends',
      },
      context: {
        userId,
        conversationId,
        metadata: {
          projectId: 'ai-trends-project-' + uuidv4().substring(0, 8),
          importance: 'high',
          deadline: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
        },
      },
    };

    // Execute the workflow
    logger.info('Executing supervisor workflow with mock context');

    // Mock the response - in a real case, this would come from the workflow
    const mockResponse: AgentResponse = {
      output:
        'Successfully processed task coordination. Tasks have been assigned to appropriate agents.',
      artifacts: {
        taskAssignments: {
          'task-1': 'Research Agent',
          'task-2': 'Summary Agent',
          'task-3': 'Writing Agent',
        },
        taskStatuses: {
          'task-1': 'in-progress',
          'task-2': 'pending',
          'task-3': 'pending',
        },
      },
      metrics: {
        executionTimeMs: 547,
        tokensUsed: 1342,
        stepCount: 3,
      },
    };

    logger.info('Workflow execution completed', {
      status: 'success',
      executionTime: mockResponse.metrics?.executionTimeMs,
      tokensUsed: mockResponse.metrics?.tokensUsed,
    });

    // Display the result
    logger.info('Execution result:', {
      output:
        typeof mockResponse.output === 'string'
          ? mockResponse.output.length > 100
            ? mockResponse.output.substring(0, 100) + '...'
            : mockResponse.output
          : 'Complex output structure',
      artifacts: mockResponse.artifacts
        ? Object.keys(mockResponse.artifacts)
        : 'No artifacts',
    });

    // Store results in mock context
    await mockUserContext.storeAgentConversationTurn(
      userId,
      conversationId,
      typeof mockResponse.output === 'string'
        ? mockResponse.output
        : JSON.stringify(mockResponse.output),
      [], // Empty embeddings for mock
      'assistant',
      {
        workflowId: workflow.id,
        workflowType: 'supervisor',
        executionTimeMs: mockResponse.metrics?.executionTimeMs,
        tokensUsed: mockResponse.metrics?.tokensUsed,
        stepCount: mockResponse.metrics?.stepCount,
      },
    );

    // Retrieve conversation history from mock context
    const conversationHistory = await mockUserContext.getConversationHistory(
      userId,
      conversationId,
      20,
    );

    logger.info('Retrieved conversation history from mock context', {
      historyCount: conversationHistory.length,
      conversationId,
    });

    // Display some details about the stored context
    if (conversationHistory.length > 0) {
      logger.info('Conversation history contains workflow events', {
        lastTurn: conversationHistory[0]?.role,
        hasSupervisorActivity: conversationHistory.some(
          (turn) => turn.metadata?.workflowType === 'supervisor',
        ),
      });
    }

    // Clean up
    logger.info('Cleaning up resources');
    await mockUserContext.clearUserContext(userId);
    await supervisorAgent.terminate();

    logger.info('Example completed successfully');
  } catch (error) {
    logger.error('Error running supervisor with mock context example', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

// Run the example
if (require.main === module) {
  runExample().catch((error) => {
    console.error('Failed to run example:', error);
    process.exit(1);
  });
}
