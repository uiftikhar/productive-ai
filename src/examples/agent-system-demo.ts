// src/examples/agent-system-demo.ts

import { AgentRegistryService } from '../agents/services/agent-registry.service';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { MasterOrchestratorAgent } from '../agents/orchestration/master-orchestrator';
import { KnowledgeRetrievalAgent } from '../agents/specialized/knowledge-retrieval-agent';
import { AgentRequest } from '../agents/interfaces/agent.interface';

/**
 * Demo application for the agent system
 * Initializes the agent registry, registers agents, and demonstrates
 * the knowledge retrieval capabilities
 */
async function runAgentSystemDemo() {
  console.log('Starting Agent System Demo...');

  // Create a logger for the demo
  const logger = new ConsoleLogger();

  // Get the agent registry instance
  const registry = AgentRegistryService.getInstance(logger);

  // Register our agents
  logger.info('Registering agents...');
  const orchestrator = registry.registerMasterOrchestratorAgent();
  const knowledgeAgent = registry.registerKnowledgeRetrievalAgent();

  // Initialize the agents
  logger.info('Initializing agents...');
  await registry.initializeAgents();

  // Define a test user and query
  const testUserId = 'test-user-123';
  const testQuery = 'What are the key components of a RAG system?';

  // Create a request to the knowledge retrieval agent
  const knowledgeRequest: AgentRequest = {
    input: testQuery,
    capability: 'answer_with_context',
    context: {
      userId: testUserId,
      conversationId: 'test-conversation-123',
      sessionId: 'test-session-123',
      metadata: {
        source: 'agent-system-demo',
      },
    },
    parameters: {
      retrievalOptions: {
        strategy: 'hybrid',
        maxItems: 3,
        minRelevanceScore: 0.5,
      },
    },
  };

  try {
    // Execute the knowledge retrieval agent directly
    logger.info('Executing knowledge retrieval agent...');
    const knowledgeResponse = await knowledgeAgent.execute(knowledgeRequest);

    // Log the response
    logger.info('Knowledge retrieval agent response:', {
      output: knowledgeResponse.output,
      executionTimeMs: knowledgeResponse.metrics?.executionTimeMs,
    });

    // Now create a workflow request to the orchestrator
    const orchestratorRequest: AgentRequest = {
      input: testQuery,
      capability: 'orchestrate_workflow',
      context: {
        userId: testUserId,
        conversationId: 'test-conversation-123',
        sessionId: 'test-session-123',
        metadata: {
          source: 'agent-system-demo',
        },
      },
      parameters: {
        workflow: 'sequential',
      },
    };

    // Execute the orchestrator
    logger.info('Executing workflow via orchestrator...');
    const orchestratorResponse =
      await orchestrator.execute(orchestratorRequest);

    // Log the response
    logger.info('Orchestrator response:', {
      output: orchestratorResponse.output,
      executionTimeMs: orchestratorResponse.metrics?.executionTimeMs,
      steps: orchestratorResponse.artifacts?.steps?.length || 0,
    });

    logger.info('Demo completed successfully');
  } catch (error) {
    logger.error('Error during demo execution:', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runAgentSystemDemo().catch((error) => {
    console.error('Unhandled error in demo:', error);
    process.exit(1);
  });
}

export { runAgentSystemDemo };
