import { AgentDiscoveryService } from '../services/agent-discovery.service';
import { AgentRegistryService } from '../services/agent-registry.service';
import { 
  AgentCapability,
  AgentState,
  AgentStatus,
  AgentMetrics,
  AgentRequest,
  AgentResponse,
  BaseAgentInterface
} from '../interfaces/base-agent.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { Logger, LogLevel } from '../../shared/logger/logger.interface';
import { MockLogger } from './mocks/mock-logger';

class MockAgent implements BaseAgentInterface {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  private _capabilities: string[];

  constructor(id: string, capabilities: string[] = ['text-generation']) {
    this.id = id;
    this.name = `Mock Agent ${id}`;
    this.description = 'A mock agent for testing';
    this._capabilities = [...capabilities];
  }

  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  getCapabilities(): AgentCapability[] {
    return this._capabilities.map(capability => ({
      name: capability,
      description: `Mock capability: ${capability}`
    }));
  }

  canHandle(capability: string): boolean {
    return this._capabilities.includes(capability);
  }

  getInitializationStatus(): boolean {
    return true;
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    return {
      output: `Mock response for request: ${typeof request.input === 'string' ? request.input : 'complex input'}`
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
    return Promise.resolve();
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

describe('AgentDiscoveryService', () => {
  let discoveryService: AgentDiscoveryService;
  let registryService: AgentRegistryService;
  let mockLogger: MockLogger;
  let originalRegistryInstance: AgentRegistryService;
  let originalDiscoveryInstance: AgentDiscoveryService;

  beforeEach(() => {
    // Save original instances
    originalRegistryInstance = (AgentRegistryService as any).instance;
    originalDiscoveryInstance = (AgentDiscoveryService as any).instance;
    
    // Reset singleton instances
    (AgentRegistryService as any).instance = undefined;
    (AgentDiscoveryService as any).instance = undefined;
    
    // Create test dependencies
    mockLogger = new MockLogger();
    
    // Create registry service first (discovery depends on it)
    registryService = AgentRegistryService.getInstance(mockLogger);
    
    // Create discovery service with our mock logger and real registry
    discoveryService = AgentDiscoveryService.getInstance({
      logger: mockLogger,
      registry: registryService
    });
    
    // Reset metrics for clean state
    discoveryService.resetMetrics();
  });

  afterEach(() => {
    // Restore original instances
    (AgentRegistryService as any).instance = originalRegistryInstance;
    (AgentDiscoveryService as any).instance = originalDiscoveryInstance;
    
    mockLogger.clear();
    jest.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const service1 = AgentDiscoveryService.getInstance();
      const service2 = AgentDiscoveryService.getInstance();
      expect(service1).toBe(service2);
    });

    it('should use the provided logger if supplied', () => {
      const service = AgentDiscoveryService.getInstance({
        logger: mockLogger
      });
      
      service.discoverAgent({ capability: 'text-generation' });
      
      expect(mockLogger.hasMessage('Discovering agent for capability', 'info')).toBe(true);
    });
  });

  describe('discoverAgent', () => {
    it('should return null if no agents have the capability', () => {
      // Act
      const result = discoveryService.discoverAgent({
        capability: 'unknown-capability'
      });
      
      // Assert
      expect(result).toBeNull();
      expect(mockLogger.hasMessage('No agents found with capability', 'warn')).toBe(true);
    });

    it('should return the best agent for a capability', () => {
      // Arrange
      const mockAgent = new MockAgent('test-agent-1');
      registryService.registerAgent(mockAgent);
      
      // Act
      const result = discoveryService.discoverAgent({
        capability: 'text-generation'
      });
      
      // Assert
      expect(result).not.toBeNull();
      expect(result!.agentId).toBe('test-agent-1');
      expect(result!.capability).toBe('text-generation');
    });

    it('should exclude specified agent IDs', () => {
      // Arrange
      const mockAgent1 = new MockAgent('test-agent-1');
      const mockAgent2 = new MockAgent('test-agent-2');
      registryService.registerAgent(mockAgent1);
      registryService.registerAgent(mockAgent2);
      
      // Act
      const result = discoveryService.discoverAgent({
        capability: 'text-generation',
        excludedAgentIds: ['test-agent-1']
      });
      
      // Assert
      expect(result).not.toBeNull();
      expect(result!.agentId).toBe('test-agent-2');
    });

    it('should return null if all matching agents are excluded', () => {
      // Arrange
      const mockAgent = new MockAgent('test-agent-1');
      registryService.registerAgent(mockAgent);
      
      // Act
      const result = discoveryService.discoverAgent({
        capability: 'text-generation',
        excludedAgentIds: ['test-agent-1']
      });
      
      // Assert
      expect(result).toBeNull();
      expect(mockLogger.hasMessage('All agents with capability were excluded', 'warn')).toBe(true);
    });
  });

  describe('updateAgentMetrics', () => {
    it('should create and update metrics for an agent and capability', () => {
      // Arrange
      const agentId = 'test-agent-1';
      const capability = 'text-generation';
      
      // Act
      discoveryService.updateAgentMetrics(agentId, capability, {
        executionTime: 200,
        success: true
      });
      
      // Get all metrics to verify
      const allMetrics = discoveryService.getAllAgentMetrics();
      
      // Assert
      expect(allMetrics[agentId]).toBeDefined();
      expect(allMetrics[agentId][capability]).toBeDefined();
      // The service initializes with a default value of 500ms and then applies weighted averaging
      // (0.7 * default + 0.3 * new value) = (0.7 * 500 + 0.3 * 200) = 350 + 60 = 410ms
      expect(allMetrics[agentId][capability].averageResponseTime).toBeCloseTo(410, 0);
      expect(allMetrics[agentId][capability].successRate).toBe(0.955);
    });

    it('should update existing metrics with moving averages', () => {
      // Arrange
      const agentId = 'test-agent-1';
      const capability = 'text-generation';
      
      // Initial state
      discoveryService.updateAgentMetrics(agentId, capability, {
        executionTime: 1000,
        success: false
      });
      
      // Act - update with new values
      discoveryService.updateAgentMetrics(agentId, capability, {
        executionTime: 500,
        success: true
      });
      
      // Get all metrics to verify
      const allMetrics = discoveryService.getAllAgentMetrics();
      const metrics = allMetrics[agentId][capability];
      
      // Assert
      expect(metrics.averageResponseTime).toBeLessThan(1000); // Should be a weighted average
      expect(metrics.averageResponseTime).toBeGreaterThan(500);
      expect(metrics.successRate).toBeGreaterThan(0); // Should be a weighted average
      expect(metrics.successRate).toBeLessThan(1.0);
    });
  });

  describe('getAllAgentMetrics', () => {
    it('should return all agent metrics', () => {
      // Arrange - create metrics for two agents
      discoveryService.updateAgentMetrics('agent1', 'text-generation', {
        executionTime: 200,
        success: true
      });
      
      discoveryService.updateAgentMetrics('agent2', 'code-generation', {
        executionTime: 300,
        success: true
      });
      
      // Act
      const allMetrics = discoveryService.getAllAgentMetrics();
      
      // Assert
      expect(Object.keys(allMetrics)).toHaveLength(2);
      expect(allMetrics.agent1).toBeDefined();
      expect(allMetrics.agent2).toBeDefined();
      expect(allMetrics.agent1['text-generation']).toBeDefined();
      expect(allMetrics.agent2['code-generation']).toBeDefined();
    });

    it('should return an empty object when no metrics exist', () => {
      // Act
      const allMetrics = discoveryService.getAllAgentMetrics();
      
      // Assert - we reset metrics in beforeEach
      expect(Object.keys(allMetrics)).toHaveLength(0);
    });
  });

  describe('resetMetrics', () => {
    it('should clear all metrics', () => {
      // Arrange - create some metrics
      discoveryService.updateAgentMetrics('agent1', 'text-generation', {
        executionTime: 200,
        success: true
      });
      
      // Act
      discoveryService.resetMetrics();
      const allMetrics = discoveryService.getAllAgentMetrics();
      
      // Assert
      expect(Object.keys(allMetrics)).toHaveLength(0);
    });
  });
}); 