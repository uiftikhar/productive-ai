import { AgentRegistryService } from '../services/agent-registry.service';
import {
  BaseAgentInterface,
  AgentCapability,
  AgentState,
  AgentStatus,
  AgentMetrics,
  AgentRequest,
  AgentResponse,
} from '../interfaces/base-agent.interface';
import { OpenAIConnector } from '../integrations/openai-connector';
import { MockLogger } from './mocks/mock-logger';

// Mock OpenAIConnector
jest.mock('../integrations/openai-connector');

// Mock the KnowledgeRetrievalAgent to avoid actual implementation
jest.mock('../specialized/knowledge-retrieval-agent', () => {
  return {
    KnowledgeRetrievalAgent: jest.fn().mockImplementation((options) => {
      return {
        id: 'knowledge-retrieval-agent',
        name: 'Knowledge Retrieval Agent',
        description: 'Retrieves knowledge from various sources',
        canHandle: jest.fn((cap) => cap === 'knowledge-retrieval'),
        initialize: jest.fn().mockResolvedValue(undefined),
        execute: jest.fn().mockResolvedValue({ output: 'Retrieved knowledge' }),
        getCapabilities: jest
          .fn()
          .mockReturnValue([
            { name: 'knowledge-retrieval', description: 'Retrieves knowledge' },
          ]),
        getState: jest.fn().mockReturnValue({
          status: AgentStatus.READY,
          errorCount: 0,
          executionCount: 0,
          metadata: {},
        }),
        getMetrics: jest.fn().mockReturnValue({
          totalExecutions: 0,
          totalExecutionTimeMs: 0,
          averageExecutionTimeMs: 0,
          tokensUsed: 0,
          errorRate: 0,
        }),
        terminate: jest.fn().mockResolvedValue(undefined),
        getInitializationStatus: jest.fn().mockReturnValue(true),
      };
    }),
  };
});

class MockAgent implements BaseAgentInterface {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  constructor(id: string, capabilities: string[] = ['text-generation']) {
    this.id = id;
    this.name = `Mock Agent ${id}`;
    this.description = 'A mock agent for testing';
    this._capabilities = capabilities;
  }

  private _capabilities: string[];

  getCapabilities(): AgentCapability[] {
    return this._capabilities.map((cap) => ({
      name: cap,
      description: `Supports ${cap}`,
    }));
  }

  canHandle(capability: string): boolean {
    return this._capabilities.includes(capability);
  }

  async initialize(): Promise<void> {
    // Mock implementation
  }

  getInitializationStatus(): boolean {
    return true;
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    return {
      output: `Mock result for ${request.input || 'no input'}`,
    };
  }

  getState(): AgentState {
    return {
      status: AgentStatus.READY,
      errorCount: 0,
      executionCount: 0,
      metadata: {},
    };
  }

  async terminate(): Promise<void> {
    // Mock implementation
  }

  getMetrics(): AgentMetrics {
    return {
      totalExecutions: 0,
      totalExecutionTimeMs: 0,
      averageExecutionTimeMs: 0,
      tokensUsed: 0,
      errorRate: 0,
    };
  }
}

describe('AgentRegistryService', () => {
  let mockRegistryService: AgentRegistryService;
  let mockLogger: MockLogger;
  let mockAgent: MockAgent;
  let getInstanceMock: jest.SpyInstance;

  // Create a private instance for testing
  const createTestInstance = () => {
    // Reset the singleton instance for fresh testing
    (AgentRegistryService as any).instance = undefined;

    // Create a new logger for each test to ensure messages are fresh
    mockLogger = new MockLogger();

    // Create a new registry instance with our mock logger
    return AgentRegistryService.getInstance(mockLogger);
  };

  beforeEach(() => {
    // Create a fresh set of mock objects for each test
    mockLogger = new MockLogger();
    mockAgent = new MockAgent('test-agent-1');

    // Get a new test instance and ensure singleton is reset
    mockRegistryService = createTestInstance();

    // Mock the getInstance to return our test instance consistently
    getInstanceMock = jest
      .spyOn(AgentRegistryService, 'getInstance')
      .mockImplementation(() => mockRegistryService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockLogger.clear();
    // Reset the singleton instance after each test
    (AgentRegistryService as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('should create and return a singleton instance', () => {
      const instance1 = AgentRegistryService.getInstance();
      const instance2 = AgentRegistryService.getInstance();

      expect(instance1).toBe(instance2);
      expect(getInstanceMock).toHaveBeenCalledTimes(2);
    });

    it('should use the provided logger if supplied', () => {
      const logger = new MockLogger();

      // Reset singleton for this specific test
      (AgentRegistryService as any).instance = undefined;

      // Don't use the mocked version for this specific test
      getInstanceMock.mockRestore();

      // Create a new service with our logger
      const service = AgentRegistryService.getInstance(logger);

      // Indirectly test that the logger was used by calling a method
      // that uses the logger and checking if the message was logged
      service.registerAgent(mockAgent);

      // Check that our logger recorded the message
      expect(
        logger.hasMessage(
          `Registered agent: ${mockAgent.name} (${mockAgent.id})`,
          'info',
        ),
      ).toBe(true);
    });
  });

  describe('registerAgent', () => {
    it('should register an agent successfully', () => {
      // Act
      mockRegistryService.registerAgent(mockAgent);

      // Assert
      expect(mockRegistryService.getAgent('test-agent-1')).toBe(mockAgent);
      expect(
        mockLogger.hasMessage(
          `Registered agent: ${mockAgent.name} (${mockAgent.id})`,
          'info',
        ),
      ).toBe(true);
    });

    it('should replace an agent with the same ID and log a warning', () => {
      // Arrange
      mockRegistryService.registerAgent(mockAgent);
      const duplicateAgent = new MockAgent('test-agent-1');

      // Act
      mockRegistryService.registerAgent(duplicateAgent);

      // Assert
      expect(mockRegistryService.getAgent('test-agent-1')).toBe(duplicateAgent);
      expect(
        mockLogger.hasMessage(
          `Agent with ID ${mockAgent.id} already registered, replacing it`,
          'warn',
        ),
      ).toBe(true);
    });
  });

  describe('registerKnowledgeRetrievalAgent', () => {
    it('should create, register and return a knowledge retrieval agent', () => {
      // Act
      const agent = mockRegistryService.registerKnowledgeRetrievalAgent({});

      // Assert
      expect(agent).toBeDefined();
      expect(agent.id).toBe('knowledge-retrieval-agent');
      expect(
        mockRegistryService.getAgent('knowledge-retrieval-agent'),
      ).toBeDefined();
    });

    it('should use provided OpenAIConnector if supplied', () => {
      // Arrange
      const connector = new OpenAIConnector();

      // Act
      mockRegistryService.registerKnowledgeRetrievalAgent({
        openAIConnector: connector,
      });

      // Assert - the connector should have been used and not created a new one
      expect(OpenAIConnector).toHaveBeenCalledTimes(1);
    });

    it('should create a new OpenAIConnector if not supplied', () => {
      // Act
      mockRegistryService.registerKnowledgeRetrievalAgent({});

      // Assert - a new connector should have been created
      expect(OpenAIConnector).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAgent', () => {
    it('should return the agent when it exists', () => {
      // Arrange
      mockRegistryService.registerAgent(mockAgent);

      // Act
      const result = mockRegistryService.getAgent('test-agent-1');

      // Assert
      expect(result).toBe(mockAgent);
    });

    it('should return undefined when agent does not exist', () => {
      // Act
      const result = mockRegistryService.getAgent('non-existent-agent');

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('listAgents', () => {
    it('should return all registered agents', () => {
      // Arrange
      const mockAgent2 = new MockAgent('test-agent-2');
      mockRegistryService.registerAgent(mockAgent);
      mockRegistryService.registerAgent(mockAgent2);

      // Act
      const result = mockRegistryService.listAgents();

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain(mockAgent);
      expect(result).toContain(mockAgent2);
    });

    it('should return an empty array when no agents are registered', () => {
      // Act
      const result = mockRegistryService.listAgents();

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('findAgentsWithCapability', () => {
    it('should return agents with the specified capability', () => {
      // Arrange
      mockRegistryService.registerAgent(mockAgent);

      // Act
      const result =
        mockRegistryService.findAgentsWithCapability('text-generation');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(mockAgent);
    });

    it('should return multiple agents with the same capability', () => {
      // Arrange
      const mockAgent2 = new MockAgent('test-agent-2');
      mockRegistryService.registerAgent(mockAgent);
      mockRegistryService.registerAgent(mockAgent2);

      // Act
      const result =
        mockRegistryService.findAgentsWithCapability('text-generation');

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain(mockAgent);
      expect(result).toContain(mockAgent2);
    });

    it('should return an empty array when no agents have the specified capability', () => {
      // Arrange
      mockRegistryService.registerAgent(mockAgent);

      // Act
      const result =
        mockRegistryService.findAgentsWithCapability('code-generation');

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('initializeAgents', () => {
    it('should initialize all registered agents', async () => {
      // Arrange
      const agent1 = new MockAgent('agent1');
      const agent2 = new MockAgent('agent2');
      const initializeSpy1 = jest.spyOn(agent1, 'initialize');
      const initializeSpy2 = jest.spyOn(agent2, 'initialize');

      mockRegistryService.registerAgent(agent1);
      mockRegistryService.registerAgent(agent2);

      // Act
      await mockRegistryService.initializeAgents();

      // Assert
      expect(initializeSpy1).toHaveBeenCalled();
      expect(initializeSpy2).toHaveBeenCalled();
      expect(mockLogger.hasMessage('Initializing 2 agents...', 'info')).toBe(
        true,
      );
      expect(
        mockLogger.hasMessage('All agents initialized successfully', 'info'),
      ).toBe(true);
    });

    it('should pass config to all agents', async () => {
      // Arrange
      const agent = new MockAgent('agent1');
      const initializeSpy = jest.spyOn(agent, 'initialize');
      const config = { apiKey: 'test-key' };

      mockRegistryService.registerAgent(agent);

      // Act
      await mockRegistryService.initializeAgents(config);

      // Assert
      expect(initializeSpy).toHaveBeenCalledWith(config);
    });
  });
});
