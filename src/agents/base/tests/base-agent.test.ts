// @ts-nocheck
// src/agents/base/tests/base-agent.test.ts

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { BaseAgent } from '../base-agent.ts';
import {
  AgentRequest,
  AgentResponse,
} from '../../interfaces/agent.interface.ts';
import { AgentContextAdapter } from '../../adapters/agent-context.adapter.ts';
import { PineconeAdapter } from '../../adapters/pinecone-adapter.ts';
import { OpenAIAdapter } from '../../adapters/openai-adapter.ts';
import { Logger } from '../../../shared/logger/logger.interface.ts';
import { ConsoleLogger } from '../../../shared/logger/console-logger.ts';

// Mock the adapters
jest.mock('../../adapters/agent-context.adapter.ts');
jest.mock('../../adapters/pinecone-adapter.ts');
jest.mock('../../adapters/openai-adapter.ts');

// Mock createAdapters
jest.mock('../../adapters/index.ts', () => ({
  createAdapters: jest.fn().mockImplementation((logger) => ({
    contextAdapter: {
      initialize: jest.fn().mockResolvedValue(undefined),
      getContext: jest.fn().mockResolvedValue({}),
      storeContext: jest.fn().mockResolvedValue('ctx-123'),
    },
    pineconeAdapter: {
      initialize: jest.fn().mockResolvedValue(undefined),
    },
    openaiAdapter: {
      initialize: jest.fn().mockResolvedValue(undefined),
    },
  })),
}));

// Create a concrete implementation of BaseAgent for testing
class TestAgent extends BaseAgent {
  public testData: string = '';

  constructor(
    options: {
      name?: string;
      description?: string;
      testData?: string;
      logger?: Logger;
      contextAdapter?: AgentContextAdapter;
      pineconeAdapter?: PineconeAdapter;
      openaiAdapter?: OpenAIAdapter;
    } = {},
  ) {
    super(
      options.name || 'Test Agent',
      options.description || 'Agent for testing',
      {
        logger: options.logger,
        contextAdapter: options.contextAdapter,
        pineconeAdapter: options.pineconeAdapter,
        openaiAdapter: options.openaiAdapter,
      },
    );

    this.testData = options.testData || '';

    // Register test capabilities
    this.registerCapability({
      name: 'test',
      description: 'A test capability',
      parameters: {
        param1: 'A test parameter',
      },
    });

    this.registerCapability({
      name: 'advanced',
      description: 'An advanced test capability',
      parameters: {
        mode: 'The operation mode',
      },
    });
  }

  // Implement the abstract method
  protected async executeInternal(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    // Simple echo implementation for testing
    const input =
      typeof request.input === 'string'
        ? request.input
        : request.input.map((msg) => msg.content).join('\n');

    return {
      output: `Test agent received: ${input}`,
      artifacts: {
        capability: request.capability,
        parameters: request.parameters,
        testData: this.testData,
        context: request.context,
      },
    };
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent;
  let mockContextAdapter: AgentContextAdapter;
  let mockPineconeAdapter: PineconeAdapter;
  let mockOpenAIAdapter: OpenAIAdapter;
  let mockLogger: Logger;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    // Create mock adapters
    mockContextAdapter = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getContext: jest.fn().mockResolvedValue({
        userId: 'user123',
        conversationId: 'conv123',
        metadata: {
          memories: [{ text: 'Test memory' }],
          documents: [{ text: 'Test document' }],
        },
      }),
      storeContext: jest.fn().mockResolvedValue('ctx-123'),
      clearContext: jest.fn().mockResolvedValue(undefined),
    } as unknown as AgentContextAdapter;

    mockPineconeAdapter = {
      initialize: jest.fn().mockResolvedValue(undefined),
    } as unknown as PineconeAdapter;

    mockOpenAIAdapter = {
      initialize: jest.fn().mockResolvedValue(undefined),
    } as unknown as OpenAIAdapter;

    // Create agent with mocked dependencies
    agent = new TestAgent({
      testData: 'test-value',
      logger: mockLogger,
      contextAdapter: mockContextAdapter,
      pineconeAdapter: mockPineconeAdapter,
      openaiAdapter: mockOpenAIAdapter,
    });

    // Initialize the agent before each test
    await agent.initialize();
  });

  test('initialize should initialize all adapters', async () => {
    // Re-initialize to test the initialization logic
    await agent.initialize();

    expect(mockContextAdapter.initialize).toHaveBeenCalled();
    expect(mockPineconeAdapter.initialize).toHaveBeenCalled();
    expect(mockOpenAIAdapter.initialize).toHaveBeenCalled();
    expect(agent.getState().status).toBe('ready');
  });

  test('getCapabilities should return registered capabilities', () => {
    const capabilities = agent.getCapabilities();

    expect(capabilities).toHaveLength(2);
    expect(capabilities[0].name).toBe('test');
    expect(capabilities[1].name).toBe('advanced');
  });

  test('canHandle should check if the agent has a capability', () => {
    expect(agent.canHandle('test')).toBe(true);
    expect(agent.canHandle('advanced')).toBe(true);
    expect(agent.canHandle('nonexistent')).toBe(false);
  });

  test('execute should process a request and return a response', async () => {
    const request: AgentRequest = {
      input: 'Hello, agent!',
      capability: 'test',
      parameters: { param1: 'value1' },
      context: {
        userId: 'user123',
        conversationId: 'conv123',
      },
    };

    const response = await agent.execute(request);

    // Check the response
    expect(response.output).toBe('Test agent received: Hello, agent!');
    expect(response.artifacts).toHaveProperty('capability', 'test');
    expect(response.artifacts).toHaveProperty('parameters.param1', 'value1');
    expect(response.artifacts).toHaveProperty('testData', 'test-value');

    // Check that context was retrieved
    expect(mockContextAdapter.getContext).toHaveBeenCalledWith(
      'user123',
      'Hello, agent!',
      expect.objectContaining({
        conversationId: 'conv123',
      }),
    );

    // Check metrics
    expect(response.metrics).toHaveProperty('executionTimeMs');

    // Check state changes
    expect(agent.getState().executionCount).toBe(1);
  });

  test('execute should fail when trying to use an unsupported capability', async () => {
    const request: AgentRequest = {
      input: 'Hello, agent!',
      capability: 'nonexistent',
      context: {
        userId: 'user123',
      },
    };

    const response = await agent.execute(request);

    expect(response.output).toContain('Error in agent Test Agent');
    expect(response.output).toContain('cannot handle capability');
    expect(response.artifacts).toHaveProperty('error.message');
    expect(agent.getState().status).toBe('error');
    expect(agent.getState().errorCount).toBe(1);
  });

  test('execute should handle errors during execution', async () => {
    // Create an agent that will throw an error
    const errorAgent = new TestAgent({
      logger: mockLogger,
      contextAdapter: mockContextAdapter,
      pineconeAdapter: mockPineconeAdapter,
      openaiAdapter: mockOpenAIAdapter,
    });

    // Initialize the error agent
    await errorAgent.initialize();

    // Override the executeInternal method to throw an error
    jest.spyOn(errorAgent as any, 'executeInternal').mockImplementation(() => {
      throw new Error('Test execution error');
    });

    const request: AgentRequest = {
      input: 'Hello, agent!',
      capability: 'test',
      context: {
        userId: 'user123',
      },
    };

    const response = await errorAgent.execute(request);

    expect(response.output).toContain('Error in agent Test Agent');
    expect(response.output).toContain('Test execution error');
    expect(response.artifacts).toHaveProperty(
      'error.message',
      'Test execution error',
    );
    expect(errorAgent.getState().errorCount).toBe(1);
    expect(errorAgent.getState().status).toBe('error');
  });

  test('terminate should update agent state', async () => {
    await agent.terminate();

    expect(agent.getState().status).toBe('terminated');
  });

  test('metrics should be tracked correctly', async () => {
    // Mock Date.now to ensure consistent timing
    const originalDateNow = Date.now;
    let callCount = 0;

    try {
      // Mock Date.now to return increasing values
      jest.spyOn(global.Date, 'now').mockImplementation(() => {
        callCount++;
        // Return base time + 100ms per call to simulate time passing
        return 1600000000000 + callCount * 100;
      });

      // Execute multiple times to build up metrics
      const request: AgentRequest = {
        input: 'Test',
        capability: 'test',
        context: {
          userId: 'user123',
        },
      };

      await agent.execute(request);
      await agent.execute(request);
      await agent.execute(request);

      const metrics = agent.getMetrics();

      expect(metrics.totalExecutions).toBe(3);
      expect(metrics.averageExecutionTimeMs).toBeGreaterThan(0);
      expect(metrics.lastExecutionTimeMs).toBeGreaterThan(0);
    } finally {
      // Restore original Date.now implementation
      global.Date.now = originalDateNow;
    }
  });

  // Additional tests to improve coverage

  test('create agent with default adapters', async () => {
    // Create agent without specifying adapters
    const defaultAgent = new TestAgent({
      logger: mockLogger,
    });

    // Initialize agent
    await defaultAgent.initialize();

    // Test that the agent was initialized with default adapters
    expect(defaultAgent.getState().status).toBe('ready');
  });

  test('setState should update the agent state', () => {
    const metadata = { testKey: 'testValue' };
    agent.setState({ metadata });

    expect(agent.getState().metadata).toEqual(metadata);
  });

  test('resetMetrics should clear all metrics', async () => {
    // First execute to populate some metrics
    const request: AgentRequest = {
      input: 'Test',
      capability: 'test',
      context: { userId: 'user123' },
    };

    await agent.execute(request);

    // Verify metrics were populated
    const beforeReset = agent.getMetrics();
    expect(beforeReset.totalExecutions).toBe(1);

    // Reset metrics
    agent.resetMetrics();

    // Verify metrics were reset
    const afterReset = agent.getMetrics();
    expect(afterReset.totalExecutions).toBe(0);
    expect(afterReset.averageExecutionTimeMs).toBe(0);
    expect(afterReset.tokensUsed).toBe(0);
    expect(afterReset.errorRate).toBe(0);
  });

  test('prepareMessages should correctly format system and user messages', async () => {
    // Access the protected method using type assertion
    const messages = (agent as any).prepareMessages(
      'System instruction',
      'User input',
    );

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('System instruction');
    expect(messages[1].content).toBe('User input');
  });

  test('getContext should handle errors from context adapter', async () => {
    // Override getContext to throw an error
    mockContextAdapter.getContext.mockRejectedValueOnce(
      new Error('Context error'),
    );

    const request: AgentRequest = {
      input: 'Test input',
      context: { userId: 'user123' },
    };

    // Execute should still work even if context retrieval fails
    const response = await agent.execute(request);

    // Verify error was logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error retrieving context',
      expect.objectContaining({ error: 'Context error' }),
    );

    // Response should still be generated
    expect(response.output).toBe('Test agent received: Test input');
  });

  test('storeContext should handle errors gracefully', async () => {
    // Override storeContext to throw an error
    mockContextAdapter.storeContext.mockRejectedValueOnce(
      new Error('Storage error'),
    );

    // We can directly test the storeContext method
    const result = await (agent as any).storeContext('user123', 'Test content');

    // Verify that undefined is returned when there's an error
    expect(result).toBeUndefined();

    // Error should be logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error storing context',
      expect.objectContaining({ error: 'Storage error' }),
    );
  });

  test('should handle non-error objects thrown during execution', async () => {
    // Create agent that will throw a non-Error object
    const errorAgent = new TestAgent({ logger: mockLogger });
    await errorAgent.initialize();

    // Override executeInternal to throw a string
    jest.spyOn(errorAgent as any, 'executeInternal').mockImplementation(() => {
      throw 'String error'; // Not an Error object
    });

    const request: AgentRequest = {
      input: 'Test',
      capability: 'test',
    };

    const response = await errorAgent.execute(request);

    // Should be handled properly
    expect(response.output).toContain('Error in agent Test Agent');
    expect(response.output).toContain('String error');
    expect(errorAgent.getState().status).toBe('error');
  });

  test('execute should fail when agent is not initialized', async () => {
    // Create a new agent without initializing it
    const uninitializedAgent = new TestAgent({ logger: mockLogger });

    const request: AgentRequest = {
      input: 'Test',
      capability: 'test',
    };

    const response = await uninitializedAgent.execute(request);

    expect(response.output).toContain('is not initialized');
    expect(uninitializedAgent.getState().status).toBe('error');
  });

  test('processMetrics should update metrics with token usage', async () => {
    // Create a test agent
    const agent = new TestAgent({ logger: mockLogger });
    await agent.initialize();

    // Call processMetrics directly with token usage
    const startTime = Date.now() - 100; // 100ms ago
    const metrics = (agent as any).processMetrics(startTime, 150, 3);

    // Verify metrics calculation
    expect(metrics.executionTimeMs).toBeGreaterThanOrEqual(100);
    expect(metrics.tokensUsed).toBe(150);
    expect(metrics.stepCount).toBe(3);

    // Verify agent metrics were updated
    const agentMetrics = agent.getMetrics();
    expect(agentMetrics.totalExecutions).toBe(1);
    expect(agentMetrics.tokensUsed).toBe(150);
  });

  test('processMetrics should update error rate correctly', async () => {
    const agent = new TestAgent({ logger: mockLogger });
    await agent.initialize();

    // Simulate an error state
    agent.setState({ errorCount: 1 });

    // Process metrics
    const startTime = Date.now() - 100;
    (agent as any).processMetrics(startTime);

    // Verify error rate was calculated
    const metrics = agent.getMetrics();
    expect(metrics.errorRate).toBe(1); // 1 error / 1 execution = 100% error rate
  });

  test('execute should handle array input', async () => {
    const request: AgentRequest = {
      input: [
        { role: 'user', content: 'Message 1' },
        { role: 'system', content: 'Message 2' },
      ],
      capability: 'test',
      context: { userId: 'user123' },
    };

    const response = await agent.execute(request);

    // Verify that the messages were processed correctly
    expect(response.output).toBe('Test agent received: Message 1\nMessage 2');
  });

  test('getContext should handle array input', async () => {
    const request: AgentRequest = {
      input: [
        { role: 'user', content: 'Message 1' },
        { role: 'system', content: 'Message 2' },
      ],
      context: { userId: 'user123' },
    };

    // Spy on the getContext call within execute
    const getContextSpy = jest.spyOn(mockContextAdapter, 'getContext');

    await agent.execute(request);

    // Verify the getContext method was called with concatenated messages
    expect(getContextSpy).toHaveBeenCalledWith(
      'user123',
      'Message 1\nMessage 2',
      expect.anything(),
    );
  });

  test('execute should work without context adapter', async () => {
    // Create agent without context adapter
    const noContextAgent = new TestAgent({
      logger: mockLogger,
      contextAdapter: undefined,
    });

    await noContextAgent.initialize();

    const request: AgentRequest = {
      input: 'Hello',
      capability: 'test',
      context: { userId: 'user123' },
    };

    const response = await noContextAgent.execute(request);

    // Should complete successfully even without context adapter
    expect(response.output).toBe('Test agent received: Hello');
  });

  test('storeContext should return undefined when no context adapter', async () => {
    // Create agent without context adapter
    const noContextAgent = new TestAgent({
      logger: mockLogger,
    });

    await noContextAgent.initialize();

    // Replace the context adapter with undefined
    Object.defineProperty(noContextAgent, 'contextAdapter', {
      value: undefined,
    });

    // Call storeContext directly
    const result = await (noContextAgent as any).storeContext(
      'user123',
      'content',
    );

    // Should return undefined when no adapter
    expect(result).toBeUndefined();
  });

  test('prepare messages should handle array of BaseMessages', async () => {
    const systemPrompt = 'This is the system prompt';
    const messages = [{ content: 'Message 1' }, { content: 'Message 2' }];

    const result = (agent as any).prepareMessages(systemPrompt, messages);

    expect(result).toHaveLength(3);
    expect(result[0].content).toBe(systemPrompt);
    expect(result[1]).toBe(messages[0]);
    expect(result[2]).toBe(messages[1]);
  });

  test('postExecute should store context with string output', async () => {
    const request: AgentRequest = {
      input: 'Test input',
      context: { userId: 'user123' },
    };

    const response: AgentResponse = {
      output: 'Test output string',
    };

    await (agent as any).postExecute(request, response, 100);

    expect(mockContextAdapter.storeContext).toHaveBeenCalledWith(
      'user123',
      'Test output string',
      expect.objectContaining({
        agentId: agent.id,
        executionTimeMs: 100,
      }),
    );
  });

  test('postExecute should store context with object output', async () => {
    const request: AgentRequest = {
      input: 'Test input',
      context: { userId: 'user123' },
    };

    const response: AgentResponse = {
      output: { content: 'Test output object' },
    };

    await (agent as any).postExecute(request, response, 100);

    expect(mockContextAdapter.storeContext).toHaveBeenCalledWith(
      'user123',
      'Test output object',
      expect.any(Object),
    );
  });

  test('executeInternal should be called with the correct arguments', async () => {
    // Create a spy on the executeInternal method
    const executeInternalSpy = jest.spyOn(agent as any, 'executeInternal');

    const context = { userId: 'user123', someProp: 'value' };
    const request: AgentRequest = {
      input: 'Test input',
      capability: 'test',
      context,
    };

    // Mock getContext to return enhanced context
    mockContextAdapter.getContext.mockResolvedValueOnce({
      ...context,
      additionalInfo: 'from-context-adapter',
    });

    await agent.execute(request);

    // Verify that executeInternal is called with the enriched context
    expect(executeInternalSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          additionalInfo: 'from-context-adapter',
        }),
      }),
    );
  });

  test('handleError should be called when an error is thrown in execInternal', async () => {
    // Create a spy on the handleError method
    const handleErrorSpy = jest.spyOn(agent as any, 'handleError');

    // Temporarily override executeInternal to throw an error
    const originalExecInternal = agent['executeInternal'];
    agent['executeInternal'] = jest.fn().mockImplementation(() => {
      throw new Error('Internal execution error');
    });

    const request: AgentRequest = {
      input: 'Test input',
      capability: 'test',
      context: { userId: 'user123' },
    };

    try {
      await agent.execute(request);

      // Check that handleError was called with the correct error
      expect(handleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Internal execution error',
        }),
        request,
      );
    } finally {
      // Restore the original method
      agent['executeInternal'] = originalExecInternal;
    }
  });

  test('execute should handle various input formats', async () => {
    // Test with more complex input structure
    const request: AgentRequest = {
      input: [
        { role: 'system', content: 'System message' },
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Assistant message' },
      ],
      capability: 'test',
      parameters: {
        complex: { nested: [1, 2, 3] },
      },
    };

    const response = await agent.execute(request);

    // Verify the response includes concatenated messages
    expect(response.output).toBe(
      'Test agent received: System message\nUser message\nAssistant message',
    );
  });

  test('metrics processing with error states', async () => {
    // Create a fresh agent for this test
    const metricsAgent = new TestAgent({ logger: mockLogger });
    await metricsAgent.initialize();

    // Set up an error state
    metricsAgent.setState({ errorCount: 5 });

    // Process metrics once to set initial values
    const startTime = Date.now() - 100;
    (metricsAgent as any).processMetrics(startTime, 200);

    // Verify that totalExecutions is 1 after the first call
    expect(metricsAgent.getMetrics().totalExecutions).toBe(1);

    // Process metrics a few more times
    (metricsAgent as any).processMetrics(startTime, 300);
    (metricsAgent as any).processMetrics(startTime, 400);

    // Now check the final metrics
    const agentMetrics = metricsAgent.getMetrics();
    expect(agentMetrics.totalExecutions).toBe(3); // One for each call to processMetrics
    expect(agentMetrics.errorRate).toBeCloseTo(5 / 3, 5); // 5 errors / 3 executions
    expect(agentMetrics.tokensUsed).toBe(900); // 200 + 300 + 400
  });

  test('specifically target remaining uncovered lines', async () => {
    // Mock Date.now to ensure consistent timing
    const originalDateNow = Date.now;
    let callCount = 0;

    try {
      // Mock Date.now to return increasing values
      jest.spyOn(global.Date, 'now').mockImplementation(() => {
        callCount++;
        // Return base time + 100ms per call to simulate time passing
        return 1600000000000 + callCount * 100;
      });

      // Create a custom agent to target specific lines
      class EdgeCaseAgent extends BaseAgent {
        constructor() {
          super('EdgeCase', 'For testing edge cases');
        }

        // Override executeInternal to test specific edge cases
        protected async executeInternal(
          request: AgentRequest,
        ): Promise<AgentResponse> {
          // Target line 177 (throw a different instance than Error)
          if (request.input === 'trigger-non-error-throw') {
            throw 'This is a string error';
          }

          // Target line 187 (return an error response)
          if (request.input === 'trigger-error-response') {
            return {
              output: 'Error response',
              error: new Error('Test error'),
            };
          }

          // Target line 197 (trigger metrics with null/undefined metrics)
          if (request.input === 'trigger-null-metrics') {
            // Will return undefined metrics which will be merged
            return {
              output: 'Response with no metrics',
            };
          }

          // Target line 406 (handleError with custom error type)
          if (request.input === 'trigger-custom-error') {
            const customError = new Error('Custom error');
            (customError as any).code = 'CUSTOM_ERROR';
            (customError as any).details = { someData: 'test' };
            throw customError;
          }

          return {
            output: 'Default response',
          };
        }
      }

      // Create and initialize the edge case agent
      const edgeAgent = new EdgeCaseAgent();
      await edgeAgent.initialize();

      // Test non-error throw (line 177)
      let response = await edgeAgent.execute({
        input: 'trigger-non-error-throw',
      });
      expect(response.output).toContain('string error');

      // Test error response handling (line 187)
      response = await edgeAgent.execute({
        input: 'trigger-error-response',
      });
      expect(response.output).toBe('Error response');

      // Test null metrics (line 197)
      response = await edgeAgent.execute({
        input: 'trigger-null-metrics',
      });
      expect(response.output).toBe('Response with no metrics');
      expect(response.metrics).toBeDefined();
      expect(response.metrics!.executionTimeMs).toBeGreaterThan(0);

      // Test custom error (line 406)
      response = await edgeAgent.execute({
        input: 'trigger-custom-error',
      });
      expect(response.output).toContain('Custom error');
      expect(response.artifacts?.error).toBeDefined();
    } finally {
      // Restore original Date.now implementation
      global.Date.now = originalDateNow;
    }
  });
});
