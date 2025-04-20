import { BaseAgent } from '../base/base-agent';
import {
  AgentRequest,
  AgentResponse,
  AgentStatus,
} from '../interfaces/base-agent.interface';
import { MockLogger } from './mocks/mock-logger';

/**
 * Create a test agent implementation
 */
class TestAgent extends BaseAgent {
  public testError: boolean = false;
  public executionDelay: number = 0;

  constructor() {
    super('Test Agent', 'An agent for testing', {
      logger: new MockLogger(),
    });

    this.registerCapability({
      name: 'test-capability',
      description: 'A test capability',
    });
  }

  /**
   * Implementation of the internal execution logic
   */
  public async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    // Simulate processing delay
    if (this.executionDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.executionDelay));
    }

    // Simulate an error
    if (this.testError) {
      throw new Error('Test execution error');
    }

    const input =
      typeof request.input === 'string'
        ? request.input
        : JSON.stringify(request.input);

    return {
      output: `Processed: ${input}`,
      metrics: {
        tokensUsed: input.length,
        executionTimeMs: this.executionDelay || 1,
        stepCount: 1,
      },
    };
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent;

  beforeEach(() => {
    agent = new TestAgent();
  });

  test('should initialize correctly', async () => {
    await agent.initialize();
    expect(agent.getInitializationStatus()).toBe(true);
    expect(agent.getState().status).toBe(AgentStatus.READY);
  });

  test('should register capabilities', () => {
    const capabilities = agent.getCapabilities();
    expect(capabilities.length).toBe(1);
    expect(capabilities[0].name).toBe('test-capability');
    expect(agent.canHandle('test-capability')).toBe(true);
    expect(agent.canHandle('unknown-capability')).toBe(false);
  });

  test('should execute requests', async () => {
    await agent.initialize();

    const request: AgentRequest = {
      input: 'test input',
    };

    const response = await agent.execute(request);
    expect(response.output).toBe('Processed: test input');

    // Verify metrics were updated
    const metrics = agent.getMetrics();
    expect(metrics.totalExecutions).toBe(1);
    // Check agent state execution count instead of metrics
    expect(agent.getState().executionCount).toBe(1);
    expect(metrics.totalExecutionTimeMs).toBeGreaterThan(0);
  });

  test('should handle errors during execution', async () => {
    await agent.initialize();
    agent.testError = true;

    const request: AgentRequest = {
      input: 'test input',
    };

    try {
      await agent.execute(request);
      fail('Should have thrown an error');
    } catch (error: any) {
      expect(error.message).toBe('Test execution error');
    }

    // Verify error count was updated
    expect(agent.getState().errorCount).toBe(1);

    // Verify metrics were updated
    const metrics = agent.getMetrics();
    expect(metrics.errorRate).toBeGreaterThan(0);
  });

  test('should terminate correctly', async () => {
    await agent.initialize();
    await agent.terminate();

    expect(agent.getState().status).toBe(AgentStatus.TERMINATED);
    expect(agent.getInitializationStatus()).toBe(false);
  });

  test('should process metrics correctly', async () => {
    await agent.initialize();

    agent.executionDelay = 50;

    // Execute twice
    await agent.execute({ input: 'test 1' });
    await agent.execute({ input: 'test 2' });

    const metrics = agent.getMetrics();
    expect(metrics.totalExecutions).toBe(2);
    expect(metrics.totalExecutionTimeMs).toBeGreaterThan(50);
    expect(metrics.averageExecutionTimeMs).toBeGreaterThan(25);
    expect(metrics.lastExecutionTimeMs).toBeDefined();
  });
});
