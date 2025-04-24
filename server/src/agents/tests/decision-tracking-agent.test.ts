import { AgentFactory } from '../factories/agent-factory';
import { MockLogger } from './mocks/mock-logger';
import { DecisionTrackingAgent } from '../specialized/decision-tracking-agent';
import { AgentWorkflow } from '../../langgraph/core/workflows/agent-workflow';

// Mock OpenAIConnector to avoid actual API calls
jest.mock('../integrations/openai-connector', () => {
  return {
    OpenAIConnector: jest.fn().mockImplementation(() => ({
      generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      getModel: jest.fn().mockReturnValue('gpt-3.5-turbo'),
      invoke: jest.fn().mockResolvedValue({
        content: 'Mock response',
      }),
    })),
  };
});

describe('DecisionTrackingAgent', () => {
  let agent: DecisionTrackingAgent;
  let logger: MockLogger;
  let factory: AgentFactory;

  beforeEach(() => {
    // Clear any previous mocks
    jest.clearAllMocks();

    logger = new MockLogger();

    factory = new AgentFactory({ logger });

    agent = factory.createDecisionTrackingAgent({
      id: 'test-decision-agent',
      wrapWithWorkflow: false,
    }) as DecisionTrackingAgent;
  });

  test('should create an agent with correct properties', () => {
    expect(agent).toBeDefined();
    expect(agent.id).toBe('test-decision-agent');
    expect(agent.name).toBe('Decision Tracking Agent');
    expect(agent.description).toContain('decisions');
  });

  test('should register capabilities', () => {
    const capabilities = agent.getCapabilities();
    expect(capabilities.length).toBeGreaterThan(0);

    // Check for specific capabilities
    const capabilityNames = capabilities.map((c) => c.name);
    expect(capabilityNames).toContain('Identify Decisions');
    expect(capabilityNames).toContain('Track Decisions');
    expect(capabilityNames).toContain('Generate Decision Report');
    expect(capabilityNames).toContain('Analyze Decision Impact');
  });

  test('should initialize successfully', async () => {
    await agent.initialize();
    const state = agent.getState();
    expect(state.status).toBe('ready');
    expect(agent.getInitializationStatus()).toBe(true);
  });

  test('should create a workflow for the agent', () => {
    const workflow = factory.createAgentWorkflow(agent);
    expect(workflow).toBeInstanceOf(AgentWorkflow);
  });

  test('should create an agent with workflow wrapping', () => {
    const wrappedAgent = factory.createDecisionTrackingAgent({
      id: 'wrapped-decision-agent',
      wrapWithWorkflow: true,
    });

    expect(wrappedAgent).toBeDefined();
    expect(wrappedAgent).toBeInstanceOf(AgentWorkflow);
  });
});
