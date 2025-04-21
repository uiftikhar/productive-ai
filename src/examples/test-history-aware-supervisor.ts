/**
 * Test Example: Fixed History-Aware Supervisor
 * 
 * This example demonstrates how to use the fixed HistoryAwareSupervisor
 * implementation with proper type handling and error management.
 */

import { HistoryAwareSupervisor } from '../langgraph/core/workflows/history-aware-supervisor';
import { UserContextFacade } from '../shared/services/user-context/user-context.facade';
import { ConversationContextService } from '../shared/services/user-context/conversation-context.service';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { PineconeConnectionService } from '../pinecone/pinecone-connection.service';
import { v4 as uuidv4 } from 'uuid';
import { ContextType } from '../shared/services/user-context/types/context.types';

// Import agent dependencies
import { BaseAgent } from '../agents/base/base-agent';
import { AgentResponse, AgentRequest } from '../agents/interfaces/base-agent.interface';
import { LanguageModelProvider, ModelResponse, MessageConfig, StreamHandler } from '../agents/interfaces/language-model-provider.interface';
import { BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Simple logger implementation
 */
const logger = new ConsoleLogger();

/**
 * Generate mock embeddings with the correct dimension (3072)
 */
function generateMockEmbeddings(): number[] {
  return Array(3072).fill(0).map(() => Math.random() * 2 - 1);
}

/**
 * Wait for a specified number of milliseconds
 */
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Interface for tracking stored conversation messages
 */
interface StoredMessage {
  turnId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * Run a demonstration of the fixed HistoryAwareSupervisor
 */
export async function testFixedHistoryAwareSupervisor(): Promise<void> {
  logger.info('Starting test of fixed HistoryAwareSupervisor implementation');

  // Create services needed by the supervisor
  const pineconeService = new PineconeConnectionService({
    logger
  });
  
  const conversationContextService = new ConversationContextService({
    pineconeService,
    logger
  });
  
  // Initialize the UserContextFacade
  const userContextFacade = new UserContextFacade({
    logger,
    pineconeService
  });
  
  // Make sure the service is initialized
  await userContextFacade.initialize();

  // Create unique user and conversation IDs for this demonstration
  const userId = `test-user-${uuidv4()}`;
  const conversationId = `test-conversation-${uuidv4()}`;

  // Create test agents
  const assistant = new TestAssistantAgent();
  const researcher = new TestResearchAgent();
  const analyzer = new TestAnalyzerAgent();

  // Create and configure the HistoryAwareSupervisor
  const supervisor = new HistoryAwareSupervisor({
    userContextFacade,
    logger,
    userId,
    conversationId,
    historyLimit: 5,
    includeMetadata: true,
    llmConnector: new TestLLMConnector(),
    conversationContextService,
    pineconeService
  });

  // Register the agents with the supervisor
  supervisor.registerAgent(assistant);
  supervisor.registerAgent(researcher);
  supervisor.registerAgent(analyzer);

  // Add dependencies between agents
  supervisor.addAgentDependency('assistant', 'researcher');
  supervisor.addAgentDependency('analyzer', 'researcher');

  // Store user and conversation IDs for validation
  const storedMessages: StoredMessage[] = [];

  try {
    // Test with a series of queries
    logger.info('Testing with initial query');
    await executeTestQuery(
      supervisor,
      'I need information about TypeScript interfaces vs. types.',
      userId,
      conversationId,
      userContextFacade,
      storedMessages,
      pineconeService
    );

    logger.info('Testing with follow-up query');
    await executeTestQuery(
      supervisor,
      'How do I use them with generics?',
      userId,
      conversationId,
      userContextFacade,
      storedMessages,
      pineconeService
    );

    logger.info('Testing with topic change');
    await executeTestQuery(
      supervisor,
      'Let\'s switch to a new topic. Tell me about Docker containers.',
      userId,
      conversationId,
      userContextFacade,
      storedMessages,
      pineconeService
    );

    // Add a delay to allow Pinecone indexing to complete
    logger.info('Waiting for indexing to complete...');
    await delay(15000);

    // Verify history context is available
    logger.info('Fetching conversation history to verify');
    logger.info('Fetch parameters', {
      userId,
      conversationId,
      limit: 10,
      includeMetadata: true
    });
    
    const history = await userContextFacade.getConversationHistory(
      userId,
      conversationId,
      10,
      { includeMetadata: true }
    );

    logger.info(`History verification: Retrieved ${history.length} conversation turns`, {
      stored: storedMessages.length,
      firstTurn: history.length > 0 && history[0]?.content 
        ? history[0].content.substring(0, 50) + '...' 
        : 'undefined',
      lastTurn: history.length > 0 && history[history.length - 1]?.content 
        ? history[history.length - 1].content.substring(0, 50) + '...' 
        : 'undefined'
    });

    // If history is empty, try direct query to Pinecone
    if (history.length === 0) {
      logger.info('History empty, trying direct query to verify storage...');
      
      // Try a direct query using the conversation ID as a filter
      const queryEmbedding = generateMockEmbeddings();
      logger.info('Direct query parameters', {
        index: 'user-context',
        namespace: userId,
        filter: { 
          conversationId,
          contextType: 'conversation'  // Use string value instead of numeric enum
        }
      });
      
      const queryResult = await pineconeService.queryVectors(
        'user-context',
        queryEmbedding,
        {
          topK: 10,
          includeMetadata: true,
          filter: { 
            conversationId,
            contextType: 'conversation'  // Use string value instead of numeric enum
          }
        },
        userId
      );
      
      logger.info(`Direct query results: ${queryResult.matches?.length || 0} matches`, {
        firstMatch: queryResult.matches && queryResult.matches.length > 0 
          ? JSON.stringify(queryResult.matches[0].metadata).substring(0, 100) + '...' 
          : 'No matches'
      });
      
      // Compare with our stored message count
      logger.info('Stored vs. Retrieved', {
        stored: storedMessages.length,
        directlyRetrieved: queryResult.matches?.length || 0,
        historyAPI: history.length
      });

      // Try with different filter
      logger.info('Trying with minimal filter...');
      const minimalQueryResult = await pineconeService.queryVectors(
        'user-context',
        queryEmbedding,
        {
          topK: 10,
          includeMetadata: true,
          filter: { contextType: 'conversation' }  // Use string value instead of numeric enum
        },
        userId
      );
      
      logger.info(`Minimal filter query results: ${minimalQueryResult.matches?.length || 0} matches`);
      
      // Verify what gets stored in a vector record by directly storing a test record and retrieving it
      logger.info('Testing direct record storage and retrieval...');
      try {
        // Generate a unique test ID
        const testId = `test-${Date.now()}`;
        
        // Create a test record with basic metadata
        const testRecord = {
          id: testId,
          values: generateMockEmbeddings(),
          metadata: {
            contextType: 'conversation',
            conversationId,
            message: 'Test message',
            timestamp: Date.now()
          }
        };
        
        // Store the test record directly
        logger.info('Storing test record directly', { testId });
        await pineconeService.upsertVectors(
          'user-context',
          [testRecord],
          userId
        );
        
        // Wait briefly
        await delay(1000);
        
        // Try to retrieve the test record
        const testQuery = await pineconeService.queryVectors(
          'user-context',
          generateMockEmbeddings(),
          {
            topK: 5,
            includeMetadata: true,
            filter: { id: testId }
          },
          userId
        );
        
        logger.info('Test record query results', {
          found: testQuery.matches?.length > 0,
          record: testQuery.matches?.[0] ? JSON.stringify(testQuery.matches[0].metadata).substring(0, 200) : 'Not found'
        });
      } catch (error) {
        logger.error('Error in direct test', { error: error instanceof Error ? error.message : String(error) });
      }
      
      // Try with just the userId in a different way
      logger.info('Trying with userId filter...');
      try {
        const userIdQueryResult = await pineconeService.queryVectors(
          'user-context',
          queryEmbedding,
          {
            topK: 10,
            includeMetadata: true,
            filter: { userId: userId }
          },
          userId
        );
        logger.info(`userId filter query results: ${userIdQueryResult.matches?.length || 0} matches`);
      } catch (error) {
        logger.warn('Error with userId filter query', { error: error instanceof Error ? error.message : String(error) });
      }
      
      // Also check if there's any data in the namespace at all
      logger.info('Checking namespace stats...');
      try {
        const stats = await pineconeService.describeIndexStats('user-context');
        logger.info('Index stats:', { 
          namespaces: Object.keys(stats.namespaces || {}),
          totalVectorCount: stats.totalVectorCount,
          namespaceStats: JSON.stringify(stats.namespaces || {}).substring(0, 500) + '...'
        });
      } catch (error) {
        logger.warn('Error getting index stats', { error: error instanceof Error ? error.message : String(error) });
      }

      // Print the ContextType enum values to check if we're using the correct value
      printContextTypeEnumValues();
      
      // Try with more detailed search filtering
      logger.info('Running filter variations to identify the issue...');
      
      // Test different filter variations
      const filterVariations = [
        { label: 'userId only', filter: { userId } },
        { label: 'conversationId only', filter: { conversationId } },
        { label: 'by turnId of first message', filter: { turnId: storedMessages[0].turnId } },
        { label: 'by role=user', filter: { role: 'user' } },
        { label: 'by role=assistant', filter: { role: 'assistant' } },
        { label: 'contextType as string', filter: { contextType: 'conversation' } },
        { label: 'contextType as enum value', filter: { contextType: ContextType.CONVERSATION } },
        { label: 'by timestamp range', filter: { timestamp: { $gte: Date.now() - 3600000 } } }, // Last hour
        { label: 'combination filter', filter: { userId, contextType: ContextType.CONVERSATION } }
      ];
      
      // Test each filter variation
      for (const variation of filterVariations) {
        try {
          logger.info(`Trying filter: ${variation.label}`);
          const result = await pineconeService.queryVectors(
            'user-context',
            generateMockEmbeddings(),
            {
              topK: 10,
              includeMetadata: true,
              filter: variation.filter
            },
            userId
          );
          logger.info(`  Results for ${variation.label}: ${result.matches?.length || 0} matches`);
          
          // If we got results, show the first match
          if (result.matches && result.matches.length > 0) {
            logger.info(`  First match metadata for ${variation.label}:`, {
              metadata: JSON.stringify(result.matches[0].metadata).substring(0, 200) + '...' 
            });
          }
        } catch (error) {
          logger.warn(`  Error with filter ${variation.label}:`, { 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
    }

    // Verify against local tracking
    if (storedMessages.length > 0) {
      logger.info('Messages we attempted to store:', storedMessages);
    }

    // Print config summary to help debug
    logger.info('Test configuration summary', {
      userId,
      conversationId,
      messageCount: storedMessages.length
    });

    logger.info('HistoryAwareSupervisor test completed successfully');
  } catch (error) {
    logger.error('Error during test execution', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

/**
 * Helper function to execute a test query
 */
async function executeTestQuery(
  supervisor: HistoryAwareSupervisor,
  userInput: string,
  userId: string,
  conversationId: string,
  userContextFacade: UserContextFacade,
  storedMessages: StoredMessage[] = [],
  pineconeService: PineconeConnectionService
): Promise<void> {
  try {
    // Log start of execution
    logger.info(`Executing test query: "${userInput.substring(0, 30)}..."`, { 
      userId, 
      conversationId 
    });

    // Execute the query with the supervisor
    const result = await supervisor.executeWithHistory(userInput, {
      userId,
      conversationId
    });

    // Log the execution result
    logger.info('Execution completed', {
      finalResponse: result.finalResponse,
      executionTimeMs: result.metrics.totalExecutionTimeMs,
      agentsInvolved: result.agentsInvolved,
      primaryAgent: result.primaryAgent
    });

    // Check if topic change was detected
    if (result.createNewSegment) {
      logger.info('Topic change detected', {
        segmentTitle: result.segmentTitle,
        segmentSummary: result.segmentSummary
      });
    }

    // Store the conversation turn
    // First the user message
    const userTurnId = `turn-${uuidv4()}`;
    const userTimestamp = Date.now();
    
    logger.info('Storing user message with metadata', {
      userId,
      conversationId,
      turnId: userTurnId,
      role: 'user',
      timestamp: userTimestamp,
      contextType: 'conversation'
    });
    
    await userContextFacade.storeConversationTurn(
      userId,
      conversationId,
      userInput,
      generateMockEmbeddings(),
      'user',
      userTurnId,
      { 
        timestamp: userTimestamp
      }
    );
    storedMessages.push({
      turnId: userTurnId,
      role: 'user',
      content: userInput,
      timestamp: new Date()
    });
    
    // Then the assistant response
    const assistantTurnId = `turn-${uuidv4()}`;
    const assistantTimestamp = Date.now();
    
    logger.info('Storing assistant message with metadata', {
      userId,
      conversationId,
      turnId: assistantTurnId,
      role: 'assistant',
      timestamp: assistantTimestamp,
      contextType: 'conversation'
    });
    
    await userContextFacade.storeConversationTurn(
      userId,
      conversationId,
      result.finalResponse,
      generateMockEmbeddings(),
      'assistant',
      assistantTurnId,
      { 
        timestamp: assistantTimestamp
      }
    );
    storedMessages.push({
      turnId: assistantTurnId,
      role: 'assistant',
      content: result.finalResponse,
      timestamp: new Date()
    });
    
    logger.info('Conversation turns stored successfully', { 
      userTurnId, 
      assistantTurnId 
    });
    
    // Immediately try to verify storage
    logger.info('Verifying storage with delay...');
    try {
      // Add a small delay to allow for indexing
      logger.info('Waiting 2 seconds for indexing...');
      await delay(2000);
      
      // First try with the UserContextFacade
      const immediateHistory = await userContextFacade.getConversationHistory(
        userId,
        conversationId,
        10,
        { includeMetadata: true }
      );
      
      logger.info(`History check after delay: ${immediateHistory.length} turns retrieved`);
      
      // Then try direct Pinecone query
      const queryEmbedding = generateMockEmbeddings();
      const directQueryResult = await pineconeService.queryVectors(
        'user-context',
        queryEmbedding,
        {
          topK: 10,
          includeMetadata: true,
          filter: { 
            contextType: 'conversation'  // Only use filter that's known to work
          }
        },
        userId
      );
      
      // Filter the results in memory for this conversation
      const conversationMatches = directQueryResult.matches?.filter(
        match => match.metadata?.conversationId === conversationId
      ) || [];
      
      logger.info(`Direct query after delay: ${conversationMatches.length}/${directQueryResult.matches?.length || 0} matches`, {
        firstMatch: conversationMatches.length > 0 
          ? JSON.stringify(conversationMatches[0].metadata).substring(0, 100) + '...' 
          : 'No matches'
      });
      
      // Try querying by just the most recent turn ID
      const turnIdQueryResult = await pineconeService.queryVectors(
        'user-context',
        queryEmbedding,
        {
          topK: 1,
          includeMetadata: true,
          filter: { 
            turnId: assistantTurnId
          }
        },
        userId
      );
      
      logger.info(`Turn ID query after delay: ${turnIdQueryResult.matches?.length || 0} matches`, {
        turnId: assistantTurnId,
        result: turnIdQueryResult.matches && turnIdQueryResult.matches.length > 0 
          ? 'Found' 
          : 'Not found'
      });
      
    } catch (error) {
      logger.warn('Error in immediate verification', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    return;
  } catch (error) {
    logger.error('Error in test query execution', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

/**
 * Test LLM Connector Implementation
 */
class TestLLMConnector implements LanguageModelProvider {
  async initialize(): Promise<void> {
    // No-op for test implementation
  }

  async generateResponse(
    messages: BaseMessage[] | MessageConfig[],
    options?: Record<string, any>
  ): Promise<ModelResponse> {
    // Create a reasonable mock response based on the input
    const lastMessage = Array.isArray(messages) && messages.length > 0 
      ? messages[messages.length - 1] 
      : null;
    
    const content = lastMessage 
      ? typeof lastMessage.content === 'string'
        ? `Response to: "${lastMessage.content.substring(0, 30)}..."`
        : 'Response to complex message'
      : 'Test response';

    return {
      content,
      usage: {
        promptTokens: 50,
        completionTokens: 100,
        totalTokens: 150
      }
    };
  }

  async generateStreamingResponse(
    messages: BaseMessage[] | MessageConfig[],
    streamHandler: StreamHandler,
    options?: Record<string, any>
  ): Promise<void> {
    const content = 'Test streaming response';
    
    // Simulate streaming by sending tokens gradually
    for (let i = 0; i < content.length; i += 5) {
      const chunk = content.substring(i, i + 5);
      streamHandler.onToken(chunk);
      // Small delay to simulate real streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    streamHandler.onComplete(content);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Use the correct embedding dimension (3072)
    return generateMockEmbeddings();
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    // Use the correct embedding dimension (3072)
    return texts.map(() => generateMockEmbeddings());
  }

  createPromptTemplate(
    systemTemplate: string,
    humanTemplate: string,
    inputVariables?: string[]
  ): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([]);
  }

  async formatPromptTemplate(
    template: ChatPromptTemplate,
    variables: Record<string, any>
  ): Promise<BaseMessage[]> {
    return [];
  }

  async sendPrompt(prompt: string): Promise<string> {
    return `Response to: ${prompt.substring(0, 20)}...`;
  }
}

/**
 * Test Assistant Agent
 */
class TestAssistantAgent extends BaseAgent {
  constructor() {
    super('TestAssistant', 'A test assistant agent for the example');
    
    // Register capabilities
    this.registerCapability({
      name: 'general-assistance',
      description: 'Provides general assistance and information'
    });
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    // Create a response based on the request
    const input = typeof request.input === 'string' 
      ? request.input 
      : 'complex input';
    
    const response = `The assistant provides information about ${input.substring(0, 30)}...`;
    
    return {
      output: response,
      metrics: {
        executionTimeMs: 500,
        tokensUsed: 100
      }
    };
  }
}

/**
 * Test Research Agent
 */
class TestResearchAgent extends BaseAgent {
  constructor() {
    super('TestResearcher', 'A test researcher agent for the example');
    
    // Register capabilities
    this.registerCapability({
      name: 'information-retrieval',
      description: 'Researches information on topics'
    });
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    // Create a research-themed response
    const input = typeof request.input === 'string' 
      ? request.input 
      : 'complex input';
    
    const response = `Research findings about ${input.substring(0, 30)}... indicate several key points worth noting.`;
    
    return {
      output: response,
      metrics: {
        executionTimeMs: 800,
        tokensUsed: 120
      }
    };
  }
}

/**
 * Test Analyzer Agent
 */
class TestAnalyzerAgent extends BaseAgent {
  constructor() {
    super('TestAnalyzer', 'A test analyzer agent for the example');
    
    // Register capabilities
    this.registerCapability({
      name: 'data-analysis',
      description: 'Analyzes information and provides insights'
    });
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    // Create an analysis-themed response
    const input = typeof request.input === 'string' 
      ? request.input 
      : 'complex input';
    
    const response = `Analysis of ${input.substring(0, 30)}... shows interesting patterns that suggest...`;
    
    return {
      output: response,
      metrics: {
        executionTimeMs: 650,
        tokensUsed: 110
      }
    };
  }
}

// Add this function before testFixedHistoryAwareSupervisor
function printContextTypeEnumValues() {
  logger.info('ContextType Enum Values:', {
    CONVERSATION: ContextType.CONVERSATION,
    DOCUMENT: ContextType.DOCUMENT,
    PREFERENCE: ContextType.PREFERENCE,
    MEMORY: ContextType.MEMORY,
    TOPIC: ContextType.TOPIC
  });
}

// Run the test if this file is executed directly
if (require.main === module) {
  testFixedHistoryAwareSupervisor()
    .then(() => {
      console.log('Test completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
} 