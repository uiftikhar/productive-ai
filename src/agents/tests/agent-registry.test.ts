import { AgentRegistryService } from '../services/agent-registry.service';
import { 
  BaseAgentInterface, 
  AgentCapability,
  AgentState,
  AgentStatus,
  AgentMetrics,
  AgentRequest,
  AgentResponse
} from '../interfaces/base-agent.interface';
import { OpenAIConnector } from '../integrations/openai-connector';
import { ConsoleLogger, LogLevel } from '../../shared/logger/console-logger';
import { Logger } from '../../shared/logger/logger.interface';

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
        getCapabilities: jest.fn().mockReturnValue([
          { name: 'knowledge-retrieval', description: 'Retrieves knowledge' }
        ]),
        getState: jest.fn().mockReturnValue({
          status: AgentStatus.READY,
          errorCount: 0,
          executionCount: 0,
          metadata: {}
        }),
        getMetrics: jest.fn().mockReturnValue({
          totalExecutions: 0,
          totalExecutionTimeMs: 0,
          averageExecutionTimeMs: 0,
          tokensUsed: 0,
          errorRate: 0
        }),
        terminate: jest.fn().mockResolvedValue(undefined),
        getInitializationStatus: jest.fn().mockReturnValue(true),
      };
    })
  };
});

class MockLogger implements Logger {
  private messages: Array<{ message: string, level: string, context?: any }> = [];

  debug(message: string, context?: Record<string, any>): void {
    this.messages.push({ message, level: 'debug', context });
  }

  info(message: string, context?: Record<string, any>): void {
    this.messages.push({ message, level: 'info', context });
  }

  warn(message: string, context?: Record<string, any>): void {
    this.messages.push({ message, level: 'warn', context });
  }

  error(message: string, context?: Record<string, any>): void {
    this.messages.push({ message, level: 'error', context });
  }

  setLogLevel(level: LogLevel): void {
    // Not implemented for tests
  }

  hasMessage(message: string, level: string): boolean {
    return this.messages.some(m => 
      m.message.includes(message) && m.level === level
    );
  }

  getAllMessages(): Array<{ message: string, level: string, context?: any }> {
    return this.messages;
  }

  clearMessages(): void {
    this.messages = [];
  }
}

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
    return this._capabilities.map(cap => ({
      name: cap,
      description: `Supports ${cap}`
    }));
  }

  canHandle(capability: string): boolean {
    return this._capabilities.includes(capability);
  }

  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  getInitializationStatus(): boolean {
    return true;
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    return { 
      output: `Mock result for ${request.input || 'no input'}`
    };
  }

  getState(): AgentState {
    return { 
      status: AgentStatus.READY,
      errorCount: 0,
      executionCount: 0,
      metadata: {}
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
      errorRate: 0
    };
  }
}

describe('AgentRegistryService', () => {
  let registryService: AgentRegistryService;
  let mockLogger: MockLogger;
  let mockAgent: MockAgent;
  let originalInstance: AgentRegistryService;
  
  beforeEach(() => {
    // Save the original instance before tests modify it
    originalInstance = (AgentRegistryService as any).instance;
    
    // Reset the singleton instance for clean testing
    (AgentRegistryService as any).instance = undefined;
    
    // Create fresh mocks for each test
    mockLogger = new MockLogger();
    mockAgent = new MockAgent('test-agent-1');
    
    // Get a test instance with our mock logger
    registryService = AgentRegistryService.getInstance(mockLogger);
  });

  afterEach(() => {
    // Restore the original instance after each test
    (AgentRegistryService as any).instance = originalInstance;
    
    // Clean up
    jest.restoreAllMocks();
    mockLogger.clearMessages();
  });

  describe('getInstance', () => {
    it('should create and return a singleton instance', () => {
      const instance1 = AgentRegistryService.getInstance();
      const instance2 = AgentRegistryService.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should use the provided logger if supplied', () => {
      const service = AgentRegistryService.getInstance(mockLogger);
      
      // Indirectly test that the logger was used by calling a method 
      // that uses the logger and checking if the message was logged
      service.registerAgent(mockAgent);
      
      expect(mockLogger.hasMessage(`Registered agent: ${mockAgent.name} (${mockAgent.id})`, 'info')).toBe(true);
    });
  });

  describe('registerAgent', () => {
    it('should register an agent successfully', () => {
      // Act
      registryService.registerAgent(mockAgent);
      
      // Assert
      expect(registryService.getAgent('test-agent-1')).toBe(mockAgent);
      expect(mockLogger.hasMessage(`Registered agent: ${mockAgent.name} (${mockAgent.id})`, 'info')).toBe(true);
    });

    it('should replace an agent with the same ID and log a warning', () => {
      // Arrange
      registryService.registerAgent(mockAgent);
      const duplicateAgent = new MockAgent('test-agent-1');
      mockLogger.clearMessages(); // Clear previous messages
      
      // Act
      registryService.registerAgent(duplicateAgent);
      
      // Assert
      expect(registryService.getAgent('test-agent-1')).toBe(duplicateAgent);
      expect(mockLogger.hasMessage(`Agent with ID ${mockAgent.id} already registered, replacing it`, 'warn')).toBe(true);
    });
  });

  describe('registerKnowledgeRetrievalAgent', () => {
    it('should create, register and return a knowledge retrieval agent', () => {
      // Act
      const agent = registryService.registerKnowledgeRetrievalAgent({});
      
      // Assert
      expect(agent).toBeDefined();
      expect(agent.id).toBe('knowledge-retrieval-agent');
      expect(registryService.getAgent('knowledge-retrieval-agent')).toBeDefined();
    });

    it('should use provided OpenAIConnector if supplied', () => {
      // Arrange
      const connector = new OpenAIConnector();
      
      // Act
      registryService.registerKnowledgeRetrievalAgent({ openAIConnector: connector });
      
      // Assert - the connector should have been used and not created a new one
      expect(OpenAIConnector).toHaveBeenCalledTimes(1); // Still 1 because we're reusing the connector
    });

    it('should create a new OpenAIConnector if not supplied', () => {
      // Arrange
      jest.clearAllMocks(); // Clear previous mock calls
      
      // Act
      registryService.registerKnowledgeRetrievalAgent({});
      
      // Assert - a new connector should have been created
      expect(OpenAIConnector).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAgent', () => {
    it('should return the agent when it exists', () => {
      // Arrange
      registryService.registerAgent(mockAgent);
      
      // Act
      const result = registryService.getAgent('test-agent-1');
      
      // Assert
      expect(result).toBe(mockAgent);
    });

    it('should return undefined when agent does not exist', () => {
      // Act
      const result = registryService.getAgent('non-existent-agent');
      
      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('listAgents', () => {
    it('should return all registered agents', () => {
      // Arrange
      const mockAgent1 = mockAgent;
      const mockAgent2 = new MockAgent('test-agent-2');
      registryService.registerAgent(mockAgent1);
      registryService.registerAgent(mockAgent2);
      
      // Act
      const result = registryService.listAgents();
      
      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContainEqual(expect.objectContaining({ id: mockAgent1.id }));
      expect(result).toContainEqual(expect.objectContaining({ id: mockAgent2.id }));
    });

    it('should return an empty array when no agents are registered', () => {
      // Start with a clean registry instance
      (AgentRegistryService as any).instance = undefined;
      registryService = AgentRegistryService.getInstance(mockLogger);
      
      // Act
      const result = registryService.listAgents();
      
      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('findAgentsWithCapability', () => {
    it('should return agents with the specified capability', () => {
      // Arrange
      registryService.registerAgent(mockAgent);
      
      // Act
      const result = registryService.findAgentsWithCapability('text-generation');
      
      // Assert
      expect(result.length).toBe(1);
      expect(result[0]).toBe(mockAgent);
    });

    it('should return multiple agents with the same capability', () => {
      // Arrange
      const mockAgent1 = mockAgent;
      const mockAgent2 = new MockAgent('test-agent-2');
      registryService.registerAgent(mockAgent1);
      registryService.registerAgent(mockAgent2);
      
      // Act
      const result = registryService.findAgentsWithCapability('text-generation');
      
      // Assert
      expect(result.length).toBe(2);
      expect(result).toContain(mockAgent1);
      expect(result).toContain(mockAgent2);
    });

    it('should return an empty array when no agents have the specified capability', () => {
      // Arrange
      registryService.registerAgent(mockAgent);
      
      // Act
      const result = registryService.findAgentsWithCapability('image-generation');
      
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
      
      registryService.registerAgent(agent1);
      registryService.registerAgent(agent2);
      
      // Act
      await registryService.initializeAgents();
      
      // Assert
      expect(initializeSpy1).toHaveBeenCalled();
      expect(initializeSpy2).toHaveBeenCalled();
      expect(mockLogger.hasMessage('Initializing 2 agents', 'info')).toBe(true);
      expect(mockLogger.hasMessage('All agents initialized successfully', 'info')).toBe(true);
    });

    it('should pass config to all agents', async () => {
      // Arrange
      const agent = new MockAgent('agent1');
      const initializeSpy = jest.spyOn(agent, 'initialize');
      const config = { apiKey: 'test-key' };
      
      registryService.registerAgent(agent);
      
      // Act
      await registryService.initializeAgents(config);
      
      // Assert
      expect(initializeSpy).toHaveBeenCalledWith(config);
    });
  });
}); 