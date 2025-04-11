/**
 * Adaptive Query Demo
 * 
 * This demo showcases the integration of the Model Router with the orchestration layer
 * to create an adaptive workflow that:
 * 1. Analyzes query complexity
 * 2. Retrieves relevant knowledge
 * 3. Selects an appropriate model
 * 4. Generates a streaming response
 */

import { WorkflowExecutorService } from '../workflow-executor.service.ts';
import { ModelRouterService, ModelSelectionCriteria } from '../model-router.service.ts';
import { ConsoleLogger } from '../../../shared/logger/console-logger.ts';
import { KnowledgeRetrievalAgent } from '../../specialized/knowledge-retrieval-agent.ts';
import { AgentRegistryService } from '../../services/agent-registry.service.ts';
import { v4 as uuid } from 'uuid';

// Initialize services
const logger = new ConsoleLogger();
const modelRouter = ModelRouterService.getInstance({ logger });
const workflowExecutor = WorkflowExecutorService.getInstance({ 
  logger,
  modelRouter
});

// Register agents
const registry = AgentRegistryService.getInstance();
try {
  // The knowledge retrieval agent should already be registered by the workflow
  // We'll skip it if it already exists
  const knowledgeAgent = new KnowledgeRetrievalAgent({
    logger
  });
  registry.registerAgent(knowledgeAgent);
} catch (e) {
  // Agent might already be registered, which is fine
  logger.debug('Knowledge agent registration:', { error: e instanceof Error ? e.message : String(e) });
}

/**
 * Run a query through the adaptive workflow
 */
async function runAdaptiveQuery(query: string, userId: string): Promise<void> {
  logger.info('Starting adaptive query demo', { query, userId });
  
  // Generate conversation ID
  const conversationId = uuid();
  
  // Define streaming callback
  const streamingCallback = (token: string) => {
    process.stdout.write(token);
  };
  
  try {
    // Get the workflow definition
    const workflowDefinition = workflowExecutor.createAdaptiveQueryWorkflow();
    
    // Define default model criteria
    const defaultModelCriteria: ModelSelectionCriteria = {
      taskComplexity: 'medium',
      responseTime: 'balanced',
      costSensitivity: 'medium',
      streamingRequired: true,
      contextSize: 8000
    };
    
    // Execute the workflow
    const result = await workflowExecutor.executeWorkflow(
      workflowDefinition,
      query,
      {
        userId,
        conversationId,
        modelCriteria: defaultModelCriteria,
        streamingCallback,
        metadata: {
          source: 'demo',
          timestamp: new Date().toISOString()
        }
      }
    );
    
    // Log the result
    console.log('\n\n--- Workflow Execution Complete ---');
    console.log(`Workflow: ${workflowDefinition.name}`);
    console.log(`Steps executed: ${result.steps.length}`);
    console.log(`Execution time: ${result.metadata.executionTime}ms`);
    
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
  } catch (error) {
    logger.error('Error in adaptive query demo', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Demo entry point
 */
async function runDemo(): Promise<void> {
  // Initialize the model router with default configurations
  modelRouter.initialize();
  
  // Sample user ID
  const userId = 'demo-user-123';
  
  // Sample queries with different characteristics
  const queries = [
    {
      type: 'factual',
      query: 'What is the capital of France?'
    },
    {
      type: 'code',
      query: 'Write a function to calculate the Fibonacci sequence in JavaScript.'
    },
    {
      type: 'creative',
      query: 'Create a short story about a robot learning to feel emotions.'
    },
    {
      type: 'complex',
      query: 'Explain the process of photosynthesis in detail, including the light-dependent and light-independent reactions, and how it relates to cellular respiration.'
    }
  ];
  
  // Run each query
  for (const { type, query } of queries) {
    console.log(`\n\n==========================================`);
    console.log(`Running ${type.toUpperCase()} query: "${query}"`);
    console.log(`==========================================\n`);
    
    await runAdaptiveQuery(query, userId);
    
    // Add a delay between queries
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runDemo()
    .then(() => {
      console.log('\nDemo completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Demo failed with error:', error);
      process.exit(1);
    });
} 