import { ConsoleLogger } from '../../shared/logger/console-logger';
import { ClassifierFactory } from '../../agents/factories/classifier-factory';
import { ClassifierConfigService } from '../../agents/factories/classifier-config.service';
import { SupervisorWorkflow } from '../core/workflows/supervisor-workflow';
import { SupervisorAgent } from '../../agents/specialized/supervisor-agent';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { initializeDefaultAgentSystem } from '../../agents/services/initialize-default-agent';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentRequest,
  AgentResponse,
} from '../../agents/interfaces/base-agent.interface';

// Simple delay utility since the import isn't working
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Example demonstrating integration of supervisor workflow with default agent fallback
 */
async function supervisorWithFallbackExample() {
  // Create a logger for the example
  const logger = new ConsoleLogger();
  logger.setLogLevel('debug');

  logger.info('Starting supervisor with fallback example');

  // Get the config service outside the try block to ensure we can clean it up
  const configService = ClassifierConfigService.getInstance(logger);

  try {
    // 1. Initialize the default agent system
    logger.info('Initializing default agent system...');
    const defaultAgentService = await initializeDefaultAgentSystem({
      logger,
      // Use a lower threshold to demonstrate more fallbacks
      confidenceThreshold: 0.6,
    });

    const defaultAgent = defaultAgentService.getDefaultAgent();
    if (defaultAgent) {
      logger.info(
        `Default agent configured: ${defaultAgent.name} (${defaultAgent.id})`,
      );
    } else {
      logger.warn(
        'No default agent configured. Fallback functionality will be limited.',
      );
    }

    // 2. Create and configure the classifier factory
    const classifierFactory = new ClassifierFactory({
      logger,
      defaultType: 'openai',
      maxRetries: 2,
      logLevel: 'debug',
    });

    // 3. Configure fallback with the classifier config service
    configService.configureClassifierFallback(classifierFactory, {
      enableDefaultAgentFallback: true,
      confidenceThreshold: 0.6, // Match the threshold from default agent service
      logger,
    });

    // 4. Register some agents for the supervisor
    const agentRegistry = AgentRegistryService.getInstance();
    logger.info(
      `Available agents: ${agentRegistry
        .listAgents()
        .map((a) => a.name)
        .join(', ')}`,
    );

    // 5. Create supervisor agent
    const supervisorAgent = new SupervisorAgent({
      id: 'supervisor-agent',
      name: 'Supervisor Agent',
      description: 'Manages and coordinates specialized agents',
      logger,
      // Pass the classifier factory through configuration
      ...(classifierFactory ? { classifierFactory } : {}),
    });

    // 6. Create the supervisor workflow
    const supervisorWorkflow = new SupervisorWorkflow(supervisorAgent, {
      logger,
      tracingEnabled: true,
    });

    // 7. Run a few test queries to demonstrate the fallback behavior
    const queries = [
      'What can you tell me about machine learning algorithms?',
      'This is a very vague and confusing request that is hard to classify',
      'Do something that no specific agent handles well',
      'Can you help me analyze this market data?',
    ];

    for (const query of queries) {
      logger.info(`\n\n--- PROCESSING QUERY: "${query}" ---`);

      const requestId = uuidv4();

      try {
        // Create a request object that matches the AgentRequest interface
        const request: AgentRequest = {
          input: query,
          context: {
            userId: 'example-user',
            conversationId: 'example-conversation',
            runId: requestId,
            metadata: {
              source: 'fallback-example',
              enableDefaultAgentFallback: true,
              confidenceThreshold: 0.6,
            },
          },
        };

        const response = await supervisorWorkflow.execute(request);

        // Handle the response according to the AgentResponse interface
        logger.info('Received response:', {
          // Access 'output' instead of 'content'
          output:
            typeof response.output === 'string'
              ? response.output
              : 'Complex response (non-string)',
          // Access metadata through artifacts
          agentId: response.artifacts?.agentId || 'unknown',
          fallback: response.artifacts?.fallbackUsed || false,
        });
      } catch (error) {
        logger.error(`Error processing query "${query}":`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Brief pause between queries
      await delay(1000);
    }

    // 8. Show fallback metrics
    const metrics = defaultAgentService.getFallbackMetrics();
    logger.info('Fallback metrics from the example run:', {
      metrics: metrics || 'No metrics available',
    });

    // 9. Demonstrate threshold tuning
    logger.info('Tuning fallback threshold based on current metrics...');
    configService.tuneFallbackThreshold(classifierFactory, 0.15);
  } catch (error) {
    logger.error('Error in supervisor fallback example:', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // Clean up all intervals to prevent memory leaks
    logger.info('Cleaning up metrics reporting intervals...');
    configService.cleanupAllMetricsReporting();
  }
}

// Run the example if this script is executed directly
if (require.main === module) {
  supervisorWithFallbackExample()
    .then(() => {
      console.log('Example completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Example failed:', error);
      process.exit(1);
    });
}

export { supervisorWithFallbackExample };
