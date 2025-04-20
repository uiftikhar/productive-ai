import { AgentRegistryService } from '../agent-registry.service';
import {
  BaseAgentInterface,
  AgentCapability as IAgentCapability,
  AgentState,
  AgentStatus,
  AgentMetrics,
  AgentRequest,
  AgentResponse,
} from '../../interfaces/base-agent.interface';

class MockAgent implements BaseAgentInterface {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  constructor(id: string) {
    this.id = id;
    this.name = `Mock Agent ${id}`;
    this.description = 'A mock agent for testing';
  }

  getCapabilities(): IAgentCapability[] {
    return [
      {
        name: 'text-generation',
        description: 'Generates text',
      },
    ];
  }

  canHandle(capability: string): boolean {
    return capability === 'text-generation';
  }

  async initialize(): Promise<void> {
    // Mock implementation
  }

  getInitializationStatus(): boolean {
    return true;
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    return {
      output: 'mock result',
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
  let registryService: AgentRegistryService;
  let mockAgent: MockAgent;

  beforeEach(() => {
    registryService = AgentRegistryService.getInstance();
    mockAgent = new MockAgent('test-agent-1');
  });

  describe('registerAgent', () => {
    it('should register an agent successfully', () => {
      // Act
      registryService.registerAgent(mockAgent);

      // Assert
      expect(registryService.getAgent('test-agent-1')).toBe(mockAgent);
    });

    it('should replace an agent with the same ID', () => {
      // Arrange
      registryService.registerAgent(mockAgent);
      const duplicateAgent = new MockAgent('test-agent-1');

      // Act
      registryService.registerAgent(duplicateAgent);

      // Assert
      expect(registryService.getAgent('test-agent-1')).toBe(duplicateAgent);
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
      const mockAgent2 = new MockAgent('test-agent-2');
      registryService.registerAgent(mockAgent);
      registryService.registerAgent(mockAgent2);

      // Act
      const result = registryService.listAgents();

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toContain(mockAgent);
      expect(result).toContain(mockAgent2);
    });

    it('should return an empty array when no agents are registered', () => {
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
      const result =
        registryService.findAgentsWithCapability('text-generation');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(mockAgent);
    });

    it('should return an empty array when no agents have the specified capability', () => {
      // Arrange
      registryService.registerAgent(mockAgent);

      // Act
      const result =
        registryService.findAgentsWithCapability('code-generation');

      // Assert
      expect(result).toHaveLength(0);
    });
  });
});
