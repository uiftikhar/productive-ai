import {
  AgentFactory,
  getDefaultAgentFactory,
} from '../factories/agent-factory';
import { AgentRegistryService } from '../services/agent-registry.service';
import { MockLogger } from './mocks/mock-logger';
import { OpenAIConnector } from '../integrations/openai-connector';
import { BaseAgentInterface } from '../interfaces/base-agent.interface';

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

describe('AgentFactory', () => {
  let factory: AgentFactory;
  let registry: AgentRegistryService;
  let logger: MockLogger;

  beforeEach(() => {
    // Clear any previous registrations
    jest.clearAllMocks();

    logger = new MockLogger();
    registry = AgentRegistryService.getInstance(logger);

    // Spy on the registry's registerAgent method
    jest.spyOn(registry, 'registerAgent');

    factory = new AgentFactory({
      logger,
      registry,
      openAIConnector: new OpenAIConnector(),
    });
  });

  test('should create a KnowledgeRetrievalAgent', () => {
    const agent = factory.createKnowledgeRetrievalAgent({
      id: 'test-knowledge-agent',
      wrapWithWorkflow: false,
    }) as any;

    expect(agent).toBeDefined();
    expect(agent.id).toBe('test-knowledge-agent');
    expect(agent.name).toBe('Knowledge Retrieval Agent');
    expect(registry.registerAgent).toHaveBeenCalledWith(agent);

    // Verify the agent was registered
    const retrievedAgent = registry.getAgent('test-knowledge-agent');
    expect(retrievedAgent).toBe(agent);
  });

  test('should create a DocumentRetrievalAgent', () => {
    const agent = factory.createDocumentRetrievalAgent({
      id: 'test-document-agent',
      indexName: 'test-index',
      namespace: 'test-namespace',
      wrapWithWorkflow: false,
    }) as any;

    expect(agent).toBeDefined();
    expect(agent.id).toBe('test-document-agent');
    expect(registry.registerAgent).toHaveBeenCalledWith(agent);
  });

  test('should create a MeetingAnalysisAgent', () => {
    const agent = factory.createMeetingAnalysisAgent({
      id: 'test-meeting-agent',
      name: 'Test Meeting Agent',
      description: 'Test description',
      wrapWithWorkflow: false,
    }) as any;

    expect(agent).toBeDefined();
    expect(agent.id).toBe('test-meeting-agent');
    expect(agent.name).toBe('Test Meeting Agent');
    expect(agent.description).toBe('Test description');
    expect(registry.registerAgent).toHaveBeenCalledWith(agent);
  });

  test('should not register agent when autoRegister is false', () => {
    const agent = factory.createKnowledgeRetrievalAgent({
      id: 'unregistered-agent',
      autoRegister: false,
      wrapWithWorkflow: false,
    }) as any;

    expect(agent).toBeDefined();
    expect(registry.registerAgent).not.toHaveBeenCalledWith(agent);

    // Verify the agent was not registered
    const retrievedAgent = registry.getAgent('unregistered-agent');
    expect(retrievedAgent).toBeUndefined();
  });

  test('getDefaultAgentFactory should return a working factory', () => {
    const defaultFactory = getDefaultAgentFactory();
    expect(defaultFactory).toBeInstanceOf(AgentFactory);

    // Should be able to create an agent
    const agent = defaultFactory.createKnowledgeRetrievalAgent();
    expect(agent).toBeDefined();
  });

  // test('should create and initialize multiple agents', async () => {
  //   // Spy on initialize method
  //   const initializeSpy = jest.spyOn(BaseAgentInterface.prototype, 'initialize')
  //     .mockImplementation(() => Promise.resolve());

  //   const agents = await factory.createStandardAgents();

  //   // Should create three agents: Knowledge, Document, and Meeting
  //   expect(agents.length).toBe(3);

  //   // Each agent should be registered
  //   expect(registry.registerAgent).toHaveBeenCalledTimes(3);

  //   // Each agent should be initialized
  //   expect(initializeSpy).toHaveBeenCalledTimes(3);

  //   // Cleanup
  //   initializeSpy.mockRestore();
  // });
});
