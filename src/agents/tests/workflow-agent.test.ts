import { BaseAgent } from '../base/base-agent';
import {
  AgentRequest,
  AgentResponse,
  AgentStatus,
} from '../interfaces/base-agent.interface';
import { MockLogger } from './mocks/mock-logger';
import { AgentWorkflow } from '../../langgraph/core/workflows/agent-workflow';

/**
 * Create a test agent implementation
 */
class WorkflowTestAgent extends BaseAgent {
  public testError: boolean = false;
  public executionDelay: number = 0;

  constructor() {
    super('Workflow Test Agent', 'An agent for testing workflows', {
      logger: new MockLogger(),
    });

    // Register a test capability
    this.registerCapability({
      name: 'test-capability',
      description: 'A test capability',
    });
  }

  /**
   * Implementation of the internal execution logic
   */
  public async executeInternal(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    // Simulate processing delay
    if (this.executionDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.executionDelay));
    }

    // Simulate an error
    if (this.testError) {
      throw new Error('Test execution error');
    }

    // Return a test response
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

describe('Agent workflow pattern', () => {
  let agent: WorkflowTestAgent;
  let workflow: AgentWorkflow<WorkflowTestAgent>;

  beforeEach(() => {
    agent = new WorkflowTestAgent();
    workflow = new AgentWorkflow(agent, {
      tracingEnabled: false,
    });
  });

  test('should execute agent through workflow', async () => {
    await agent.initialize();

    const request: AgentRequest = {
      input: 'test input',
    };

    const response = await workflow.execute(request);
    expect(response.output).toBe('Processed: test input');

    // Verify metrics were updated on the agent
    const metrics = agent.getMetrics();
    expect(metrics.totalExecutions).toBe(1);
    expect(agent.getState().executionCount).toBe(1);
    expect(metrics.totalExecutionTimeMs).toBeGreaterThan(0);
  });

  test('should handle errors during workflow execution', async () => {
    await agent.initialize();
    agent.testError = true;

    const request: AgentRequest = {
      input: 'test input',
    };

    // Workflow handles errors differently - it wraps them in the response
    const response = await workflow.execute(request);
    expect(response.output).toContain('Error:');
    expect(response.output).toContain('Test execution error');

    // Verify error count was updated
    expect(agent.getState().errorCount).toBe(1);

    // Verify metrics were updated
    const metrics = agent.getMetrics();
    expect(metrics.errorRate).toBeGreaterThan(0);
  });

  test('should process metrics correctly through workflow', async () => {
    await agent.initialize();

    // Add a delay to ensure measurable execution time
    agent.executionDelay = 50;

    // Execute twice via workflow
    await workflow.execute({ input: 'test 1' });
    await workflow.execute({ input: 'test 2' });

    const metrics = agent.getMetrics();
    expect(metrics.totalExecutions).toBe(2);
    expect(metrics.totalExecutionTimeMs).toBeGreaterThan(50);
    expect(metrics.averageExecutionTimeMs).toBeGreaterThan(25);
    expect(metrics.lastExecutionTimeMs).toBeDefined();
  });

  test('should execute with capability and parameters', async () => {
    await agent.initialize();

    const request: AgentRequest = {
      input: 'test input',
      capability: 'test-capability',
      parameters: { param1: 'value1' },
      context: { userId: 'test-user' }
    };

    const response = await workflow.execute(request);
    expect(response.output).toBe('Processed: test input');
    
    // Verify metrics were updated
    const metrics = agent.getMetrics();
    expect(metrics.totalExecutions).toBe(1);
  });

  test('direct execution vs workflow execution match in normal cases', async () => {
    await agent.initialize();
    
    const request: AgentRequest = {
      input: 'test input',
    };

    // Execute directly
    const directResponse = await agent.execute(request);
    
    // Execute via workflow
    const workflowResponse = await workflow.execute(request);
    
    // Outputs should match
    expect(workflowResponse.output).toBe(directResponse.output);
    
    // Both execution methods should update metrics
    const metrics = agent.getMetrics();
    expect(metrics.totalExecutions).toBe(2);
  });
}); 