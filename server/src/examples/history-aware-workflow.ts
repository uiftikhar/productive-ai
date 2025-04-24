/**
 * Example: History-Aware Workflow
 *
 * This example demonstrates how to use the HistoryAwareSupervisor
 * to create a workflow that leverages conversation history
 * for more informed decision making.
 */

import { HistoryAwareSupervisor } from '../langgraph/core/workflows/history-aware-supervisor';
import { UserContextFacade } from '../shared/services/user-context/user-context.facade';
import { ConversationContextService } from '../shared/services/user-context/conversation-context.service';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { v4 as uuidv4 } from 'uuid';

// Import agent mocks for the example
import { BaseAgent } from '../agents/base/base-agent';
import {
  AgentResponse,
  AgentRequest,
} from '../agents/interfaces/base-agent.interface';
import {
  LanguageModelProvider,
  ModelResponse,
  MessageConfig,
  StreamHandler,
} from '../agents/interfaces/language-model-provider.interface';
import { BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Simple logger implementation for the example
 */
const logger = {
  info: (message: string, context?: Record<string, any>): void => {
    console.info(message, context || '');
  },
  error: (message: string, context?: Record<string, any>): void => {
    console.error(message, context || '');
  },
  warn: (message: string, context?: Record<string, any>): void => {
    console.warn(message, context || '');
  },
  debug: (message: string, context?: Record<string, any>): void => {
    console.debug(message, context || '');
  },
};

/**
 * Run a demonstration of the HistoryAwareSupervisor workflow with conversation history
 */
export async function runHistoryAwareWorkflowExample(): Promise<void> {
  logger.info('Starting HistoryAwareSupervisor workflow example');

  // Initialize basic services
  const consoleLogger = new ConsoleLogger();

  // Set up user context services
  const conversationContextService = new ConversationContextService({
    logger: consoleLogger,
  });

  // Initialize the UserContextFacade
  const userContextFacade = new UserContextFacade({
    logger: consoleLogger,
  });

  // Create unique user and conversation IDs for this demonstration
  const userId = `demo-user-${uuidv4()}`;
  const conversationId = `demo-conversation-${uuidv4()}`;

  // Create mock agents for the example
  const knowledgeAgent = new MockKnowledgeAgent(
    'knowledge',
    'Retrieves relevant knowledge',
  );
  const planningAgent = new MockPlanningAgent(
    'planner',
    'Creates plans and sequences actions',
  );
  const contentAgent = new MockContentAgent(
    'content',
    'Generates high-quality content',
  );

  // Create and configure the HistoryAwareSupervisor
  const historyAwareSupervisor = new HistoryAwareSupervisor({
    userContextFacade,
    logger: consoleLogger,
    userId,
    conversationId,
    historyLimit: 10,
    includeMetadata: true,
    llmConnector: new MockLLMConnector(),
  });

  // Add mock methods to access the private userContextFacade
  const supervisor = historyAwareSupervisor as any;

  // Register the agents with the supervisor
  historyAwareSupervisor.registerAgent(knowledgeAgent);
  historyAwareSupervisor.registerAgent(planningAgent);
  historyAwareSupervisor.registerAgent(contentAgent);

  // Add dependencies between agents
  historyAwareSupervisor.addAgentDependency('content', 'knowledge');
  historyAwareSupervisor.addAgentDependency('planner', 'knowledge');

  // First query - no history yet
  logger.info('Example 1: First query with no prior history');
  const firstQuery = 'What are the key benefits of TypeScript over JavaScript?';

  await executeWorkflowExample(
    supervisor,
    firstQuery,
    userId,
    conversationId,
    'Example 1: First query',
  );

  // Second query - follow-up question that requires history context
  logger.info('Example 2: Follow-up query that references previous context');
  const followUpQuery =
    'How do those benefits specifically help with large-scale applications?';

  await executeWorkflowExample(
    supervisor,
    followUpQuery,
    userId,
    conversationId,
    'Example 2: Follow-up query',
  );

  // Third query - new topic that should be detected as a topic change
  logger.info('Example 3: New topic that triggers segmentation');
  const newTopicQuery =
    "Let's talk about something else. What are the best practices for RESTful API design?";

  await executeWorkflowExample(
    supervisor,
    newTopicQuery,
    userId,
    conversationId,
    'Example 3: Topic change query',
  );

  logger.info('HistoryAwareSupervisor workflow example completed');
}

/**
 * Helper function to execute the workflow and log the results
 */
async function executeWorkflowExample(
  supervisor: any,
  userInput: string,
  userId: string,
  conversationId: string,
  label: string,
): Promise<void> {
  logger.info(`Executing ${label}`, { userInput });

  try {
    // Execute the workflow with the user input
    const result = await supervisor.executeWithHistory(userInput, {
      userId,
      conversationId,
    });

    // Log the results
    logger.info(`${label} - Result`, {
      finalResponse:
        typeof result.finalResponse === 'string'
          ? result.finalResponse
          : result.finalResponse.content,
      agentsInvolved: result.agentsInvolved,
      primaryAgent: result.primaryAgent,
      totalExecutionTimeMs: result.metrics.totalExecutionTimeMs,
      taskCount: result.tasks.length,
    });

    // Check if this was detected as a topic change
    if (result.createNewSegment) {
      logger.info(`${label} - Topic change detected`, {
        segmentTitle: result.segmentTitle,
        segmentSummary: result.segmentSummary,
      });
    }

    // Store the result in conversation history
    await supervisor.userContextFacade.storeConversationTurn(
      userId,
      conversationId,
      userInput,
      [],
      'user',
      undefined,
      {},
    );

    await supervisor.userContextFacade.storeConversationTurn(
      userId,
      conversationId,
      typeof result.finalResponse === 'string'
        ? result.finalResponse
        : result.finalResponse.content,
      [],
      'assistant',
      undefined,
      {
        agentsInvolved: result.agentsInvolved,
        primaryAgent: result.primaryAgent,
        executionTime: result.metrics.totalExecutionTimeMs,
      },
    );
  } catch (error) {
    logger.error(`${label} - Error executing workflow`, {
      error: error instanceof Error ? error.message : String(error),
      userInput,
    });
  }
}

/**
 * Mock LLM Connector for the example
 */
class MockLLMConnector implements LanguageModelProvider {
  async initialize(): Promise<void> {
    // No initialization needed for mock
  }

  async generateResponse(
    messages: BaseMessage[] | MessageConfig[],
    options?: Record<string, any>,
  ): Promise<ModelResponse> {
    const content =
      Array.isArray(messages) && messages.length > 0
        ? `Response to: ${
            typeof messages[0].content === 'string'
              ? messages[0].content.substring(0, 30)
              : 'message'
          }...`
        : 'Mock response';

    return {
      content,
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };
  }

  async generateStreamingResponse(
    messages: BaseMessage[] | MessageConfig[],
    streamHandler: StreamHandler,
    options?: Record<string, any>,
  ): Promise<void> {
    const content = 'Mock streaming response';
    streamHandler.onToken(content);
    streamHandler.onComplete(content);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return Array(1536)
      .fill(0)
      .map((_, i) => i / 1536);
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map(() =>
      Array(1536)
        .fill(0)
        .map((_, i) => i / 1536),
    );
  }

  createPromptTemplate(
    systemTemplate: string,
    humanTemplate: string,
    inputVariables?: string[],
  ): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([]);
  }

  async formatPromptTemplate(
    template: ChatPromptTemplate,
    variables: Record<string, any>,
  ): Promise<BaseMessage[]> {
    return [];
  }

  // Legacy method for compatibility
  async sendPrompt(prompt: string): Promise<string> {
    return `Response to: ${prompt.substring(0, 30)}...`;
  }
}

/**
 * Mock Knowledge Agent for the example
 */
class MockKnowledgeAgent extends BaseAgent {
  constructor(name: string, description: string) {
    super(name, description, {});
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    return {
      output: `Knowledge response for: ${request.input.toString().substring(0, 20)}...`,
      metrics: {
        tokensUsed: 100,
        executionTimeMs: 200,
      },
      artifacts: {
        sources: ['Mock source 1', 'Mock source 2'],
      },
    };
  }
}

/**
 * Mock Planning Agent for the example
 */
class MockPlanningAgent extends BaseAgent {
  constructor(name: string, description: string) {
    super(name, description, {});
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    return {
      output: `Plan for: ${request.input.toString().substring(0, 20)}...`,
      metrics: {
        tokensUsed: 150,
        executionTimeMs: 300,
      },
      artifacts: {
        steps: ['Step 1', 'Step 2', 'Step 3'],
      },
    };
  }
}

/**
 * Mock Content Agent for the example
 */
class MockContentAgent extends BaseAgent {
  constructor(name: string, description: string) {
    super(name, description, {});
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    return {
      output: `Generated content for: ${request.input.toString().substring(0, 20)}...`,
      metrics: {
        tokensUsed: 500,
        executionTimeMs: 800,
      },
      artifacts: {
        format: 'markdown',
        sections: 3,
      },
    };
  }
}

// When run directly, execute the example
if (require.main === module) {
  runHistoryAwareWorkflowExample()
    .then(() => {
      logger.info('Example completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Example failed with error', { error });
      process.exit(1);
    });
}
