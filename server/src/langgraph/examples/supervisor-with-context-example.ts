/**
 * Example demonstrating how to use the SupervisorWorkflow with UserContextFacade integration
 *
 * This example shows:
 * 1. How to initialize the UserContextFacade
 * 2. How to create a SupervisorAgent with user context support
 * 3. How to run a SupervisorWorkflow that uses user context for enhanced capabilities
 */

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { PineconeConnectionService } from '../../pinecone/pinecone-connection.service';
import { UserContextFacade } from '../../shared/services/user-context/user-context.facade';
import { SupervisorAgent } from '../../agents/specialized/facilitator-supervisor-agent';
import { SupervisorWorkflow } from '../core/workflows/supervisor-workflow';
import { AgentRequest } from '../../agents/interfaces/base-agent.interface';
import { v4 as uuidv4 } from 'uuid';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';

// 1. Setup logger
const logger = new ConsoleLogger();

// 2. Initialize services
async function runExample() {
  logger.info('Starting Supervisor with Context Example');

  try {
    // Initialize Pinecone (optional, depends on your setup)
    const pineconeService = new PineconeConnectionService({
      logger,
      // Note: PineconeConnectionConfig doesn't accept apiKey directly
      // The PineconeConnectionService likely gets credentials elsewhere
    });

    // Initialize UserContextFacade
    const userContextFacade = new UserContextFacade({
      pineconeService,
      logger,
    });
    await userContextFacade.initialize();
    logger.info('UserContextFacade initialized');

    // Generate test user ID and conversation ID
    const userId = 'test-user-' + uuidv4().substring(0, 8);
    const conversationId = 'test-conversation-' + uuidv4().substring(0, 8);
    logger.info('Created test user and conversation', {
      userId,
      conversationId,
    });

    // 3. Initialize agent registry
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

    // 4. Create main supervisor agent
    const supervisorAgent = new SupervisorAgent({
      name: 'Main Supervisor',
      description: 'Coordinates multi-step tasks',
      logger,
      agentRegistry,
    });
    await supervisorAgent.initialize();
    logger.info('Supervisor agent initialized');

    // 5. Create the workflow with user context
    const workflow = new SupervisorWorkflow(supervisorAgent, {
      tracingEnabled: true,
      includeStateInLogs: true,
      logger,
      userContext: userContextFacade,
      id: 'supervisor-workflow-' + uuidv4().substring(0, 8),
    });
    logger.info('Supervisor workflow created', { workflowId: workflow.id });

    // 6. Define some example tasks
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

    // 7. Prepare request with context
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

    // 8. Execute the workflow
    logger.info('Executing supervisor workflow with context');
    const result = await workflow.execute(request);

    // 9. Display results
    logger.info('Workflow execution completed', {
      status: 'success',
      executionTime: result.metrics?.executionTimeMs,
      tokensUsed: result.metrics?.tokensUsed,
    });

    // Display the result
    logger.info('Execution result:', {
      output:
        typeof result.output === 'string'
          ? result.output.length > 100
            ? result.output.substring(0, 100) + '...'
            : result.output
          : 'Complex output structure',
      artifacts: result.artifacts
        ? Object.keys(result.artifacts)
        : 'No artifacts',
    });

    // 10. Retrieve conversation history from user context to verify storage
    const conversationHistory = await userContextFacade.getConversationHistory(
      userId,
      conversationId,
      20,
      { includeMetadata: true },
    );

    logger.info('Retrieved conversation history from user context', {
      historyCount: conversationHistory.length,
      conversationId,
    });

    // Display some details about the stored context
    if (conversationHistory.length > 0) {
      logger.info('Conversation history contains workflow events', {
        firstTurn: conversationHistory[0]?.role,
        lastTurn: conversationHistory[conversationHistory.length - 1]?.role,
        hasSupervisorActivity: conversationHistory.some(
          (turn) =>
            turn.metadata?.agentName === 'Main Supervisor' ||
            turn.metadata?.workflowType === 'supervisor',
        ),
      });
    }

    // 11. Clean up
    logger.info('Cleaning up resources');
    await userContextFacade.clearUserContext(userId);
    await supervisorAgent.terminate();

    logger.info('Example completed successfully');
  } catch (error) {
    logger.error('Error running supervisor with context example', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

// Run the example
runExample().catch((error) => {
  console.error('Failed to run example:', error);
  process.exit(1);
});
