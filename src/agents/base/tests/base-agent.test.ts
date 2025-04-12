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
  });
});
