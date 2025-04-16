// src/examples/enhanced-orchestration-demo.ts

import { ConsoleLogger } from '../shared/logger/console-logger';
import { EnhancedOrchestratorService } from '../agents/orchestration/enhanced-orchestrator.service';
import {
  WorkflowDefinitionService,
  WorkflowStepDefinition,
} from '../agents/orchestration/workflow-definition.service';
import { AgentRegistryService } from '../agents/services/agent-registry.service';
import { KnowledgeRetrievalAgent } from '../agents/specialized/knowledge-retrieval-agent';

/**
 * Demo application for testing the enhanced orchestration system
 */
async function runEnhancedOrchestratorDemo() {
  const logger = new ConsoleLogger();
  logger.info('Starting Enhanced Orchestration Demo');

  // Initialize the agent registry
  const registry = AgentRegistryService.getInstance(logger);

  // Register specialized agents
  logger.info('Registering specialized agents');
  const knowledgeAgent = registry.registerKnowledgeRetrievalAgent();

  // Initialize all agents
  logger.info('Initializing agents');
  await registry.initializeAgents();

  // Get the enhanced orchestrator service
  const orchestrator = EnhancedOrchestratorService.getInstance({
    logger,
    registry,
  });

  // Initialize the orchestrator
  await orchestrator.initialize();

  // Define test user data
  const testUserId = 'test-user-123';
  const testConversationId = 'test-conversation-456';

  // Create a custom workflow for question answering
  logger.info('Creating custom workflow');

  // Define workflow steps
  const steps: Array<Partial<WorkflowStepDefinition>> = [
    {
      id: 'step-1',
      name: 'retrieve-knowledge',
      description: 'Retrieve relevant knowledge based on query',
      capability: 'retrieve_knowledge',
      parameters: {
        maxItems: 3,
        minRelevanceScore: 0.5,
        strategy: 'hybrid',
      },
    },
    {
      id: 'step-2',
      name: 'generate-answer',
      description: 'Generate answer based on retrieved knowledge',
      capability: 'answer_with_context',
      parameters: {
        retrievalOptions: {
          strategy: 'hybrid',
          maxItems: 3,
        },
      },
      onSuccess: ['step-3'],
    },
    {
      id: 'step-3',
      name: 'final-processing',
      description: 'Process the final response',
      // This could dispatch to a specialized processing agent in a real implementation
      parameters: {
        enhanceResponse: true,
        addMetadata: true,
      },
    },
  ];

  // Define a branch for conditional logic
  const branches = [
    {
      id: 'branch-1',
      name: 'check-knowledge-available',
      description: 'Check if knowledge was found',
      condition: (state: any) => {
        // Check if the first step returned any results
        const step1Results = state.steps.find(
          (s: any) => s.stepId === 'step-1',
        );
        if (!step1Results) return false;

        try {
          const results = JSON.parse(step1Results.output);
          return results && results.length > 0;
        } catch (e) {
          return false;
        }
      },
      thenStepId: 'step-2', // If knowledge was found, generate answer
      elseStepId: 'step-3', // If no knowledge was found, skip to final processing
    },
  ];

  // Create the workflow
  const workflow = orchestrator.createWorkflow(
    'qa-workflow',
    'Question answering workflow using RAG',
    steps as any[],
    branches as any[],
    'step-1', // Start with the first step
    {
      category: 'knowledge',
      version: '1.0.0',
    },
  );

  logger.info(`Created workflow: ${workflow.name} (${workflow.id})`);

  // Execute the workflow with a test query
  logger.info('Executing workflow');

  try {
    const response = await orchestrator.executeWorkflow(
      workflow.id,
      'What are the components of a RAG system?',
      {
        userId: testUserId,
        conversationId: testConversationId,
        metadata: {
          source: 'enhanced-orchestration-demo',
        },
      },
    );

    logger.info('Workflow execution completed');
    logger.info(`Output: ${response.output}`);
    logger.info(`Execution time: ${response.metrics?.executionTimeMs}ms`);
    logger.info(`Steps executed: ${response.metrics?.stepCount}`);

    // Get status of the workflow execution
    const executionId = response.artifacts?.executionId;

    if (executionId) {
      const status = orchestrator.getExecutionStatus(executionId);
      logger.info(`Workflow status: ${status?.status}`);
    }
  } catch (error) {
    logger.error('Error executing workflow:', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Create and execute a linear workflow
  logger.info('Creating linear workflow');

  // Get workflow service
  const workflowService = WorkflowDefinitionService.getInstance(logger);

  // Create linear workflow
  const linearWorkflow = workflowService.createLinearWorkflow(
    'simple-rag',
    'Simple RAG workflow with linear steps',
    [
      {
        name: 'retrieve',
        description: 'Retrieve knowledge',
        capability: 'retrieve_knowledge',
      },
      {
        name: 'answer',
        description: 'Generate answer',
        capability: 'answer_with_context',
      },
    ],
  );

  logger.info(
    `Created linear workflow: ${linearWorkflow.name} (${linearWorkflow.id})`,
  );

  // Execute the linear workflow
  logger.info('Executing linear workflow');

  try {
    const response = await orchestrator.executeWorkflow(
      linearWorkflow.id,
      'Explain the difference between semantic and keyword search.',
      {
        userId: testUserId,
        conversationId: testConversationId,
      },
    );

    logger.info('Linear workflow execution completed');
    logger.info(`Output: ${response.output}`);
  } catch (error) {
    logger.error('Error executing linear workflow:', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info('Enhanced Orchestration Demo completed');
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runEnhancedOrchestratorDemo().catch((error) => {
    console.error('Unhandled error in demo:', error);
    process.exit(1);
  });
}

export { runEnhancedOrchestratorDemo };
