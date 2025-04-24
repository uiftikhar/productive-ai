import { DefaultAgentService } from '../default-agent.service';
import { AgentRegistryService } from '../agent-registry.service';
import { BaseAgentInterface } from '../../interfaces/base-agent.interface';
import { ClassifierResult } from '../../interfaces/classifier.interface';
import { mock, MockProxy } from 'jest-mock-extended';
import { Logger } from '../../../shared/logger/logger.interface';

// Create a mock agent for testing
const createMockAgent = (
  id: string,
  name: string,
): MockProxy<BaseAgentInterface> => {
  const mockAgent = mock<BaseAgentInterface>();

  // Use defineProperty to set read-only properties
  Object.defineProperty(mockAgent, 'id', { value: id });
  Object.defineProperty(mockAgent, 'name', { value: name });
  Object.defineProperty(mockAgent, 'description', {
    value: `Mock agent (${name})`,
  });

  return mockAgent;
};

describe('DefaultAgentService', () => {
  let defaultAgentService: DefaultAgentService;
  let mockAgentRegistry: MockProxy<AgentRegistryService>;
  let mockLogger: MockProxy<Logger>;
  let defaultAgent: MockProxy<BaseAgentInterface>;
  let anotherAgent: MockProxy<BaseAgentInterface>;

  beforeEach(() => {
    // Create mock dependencies
    mockLogger = mock<Logger>();
    mockAgentRegistry = mock<AgentRegistryService>();

    // Create mock agents
    defaultAgent = createMockAgent('default-agent', 'Default Agent');
    anotherAgent = createMockAgent('specific-agent', 'Specific Agent');

    // Set up mocks for agent registry
    mockAgentRegistry.getAgent.mockImplementation((id: string) => {
      if (id === 'default-agent') return defaultAgent;
      if (id === 'specific-agent') return anotherAgent;
      return undefined;
    });

    // Create the service with mocked dependencies
    defaultAgentService = DefaultAgentService.getInstance({
      logger: mockLogger,
      agentRegistry: mockAgentRegistry,
      confidenceThreshold: 0.7,
    });

    // Reset metrics for clean slate
    defaultAgentService.resetMetrics();
  });

  afterEach(() => {
    // Reset the singleton between tests to avoid state leakage
    // @ts-ignore - accessing private static instance for testing
    DefaultAgentService.instance = undefined;
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = DefaultAgentService.getInstance();
      const instance2 = DefaultAgentService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('setDefaultAgent', () => {
    it('should set the default agent if it exists in registry', () => {
      // Act
      defaultAgentService.setDefaultAgent('default-agent');

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Default agent set to: default-agent',
      );
    });

    it('should throw error if agent does not exist in registry', () => {
      // Arrange
      mockAgentRegistry.getAgent.mockReturnValue(undefined);

      // Act & Assert
      expect(() => {
        defaultAgentService.setDefaultAgent('non-existent-agent');
      }).toThrow('Cannot set default agent');
    });
  });

  describe('getDefaultAgent', () => {
    it('should return null if no default agent is set', () => {
      // Act
      const result = defaultAgentService.getDefaultAgent();

      // Assert
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No default agent configured'),
      );
    });

    it('should return the default agent if set', () => {
      // Arrange
      defaultAgentService.setDefaultAgent('default-agent');

      // Act
      const result = defaultAgentService.getDefaultAgent();

      // Assert
      expect(result).toBe(defaultAgent);
    });
  });

  describe('setConfidenceThreshold', () => {
    it('should set a valid confidence threshold', () => {
      // Act
      defaultAgentService.setConfidenceThreshold(0.8);

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Confidence threshold set to: 0.8',
      );
    });

    it('should throw error for invalid threshold values', () => {
      // Act & Assert
      expect(() => {
        defaultAgentService.setConfidenceThreshold(1.5);
      }).toThrow('Confidence threshold must be between 0 and 1');

      expect(() => {
        defaultAgentService.setConfidenceThreshold(-0.5);
      }).toThrow('Confidence threshold must be between 0 and 1');
    });
  });

  describe('processFallbackLogic', () => {
    beforeEach(() => {
      // Set default agent for fallback tests
      defaultAgentService.setDefaultAgent('default-agent');
    });

    it('should return original result when confidence is above threshold', () => {
      // Arrange
      const highConfidenceResult: ClassifierResult = {
        selectedAgentId: 'specific-agent',
        confidence: 0.9,
        reasoning: 'High confidence selection',
        isFollowUp: false,
        entities: [],
        intent: 'test-intent',
      };

      // Act
      const result = defaultAgentService.processFallbackLogic(
        highConfidenceResult,
        'What is the weather today?',
      );

      // Assert
      expect(result).toBe(highConfidenceResult);
      expect(result.selectedAgentId).toBe('specific-agent');

      // No fallback metrics should be incremented
      expect(defaultAgentService.getFallbackMetrics().totalFallbacks).toBe(0);
    });

    it('should fallback when confidence is below threshold', () => {
      // Arrange
      const lowConfidenceResult: ClassifierResult = {
        selectedAgentId: 'specific-agent',
        confidence: 0.5, // Below 0.7 threshold
        reasoning: 'Low confidence selection',
        isFollowUp: false,
        entities: [],
        intent: 'weather-intent',
      };

      // Act
      const result = defaultAgentService.processFallbackLogic(
        lowConfidenceResult,
        'What is the weather today?',
      );

      // Assert
      expect(result.selectedAgentId).toBe('default-agent');
      expect(result.confidence).toBe(1.0);
      expect(result.reasoning).toContain('Low confidence');
      expect(result.reasoning).toContain('Falling back to default agent');

      // Metrics should be updated
      const metrics = defaultAgentService.getFallbackMetrics();
      expect(metrics.totalFallbacks).toBe(1);
      expect(metrics.lowConfidenceFallbacks).toBe(1);
      expect(metrics.fallbacksByIntent['weather-intent']).toBe(1);
      expect(metrics.recentFallbackReasons.length).toBe(1);
    });

    it('should fallback when no agent is selected', () => {
      // Arrange
      const noAgentResult: ClassifierResult = {
        selectedAgentId: null,
        confidence: 0.0,
        reasoning: 'No matching agent found',
        isFollowUp: false,
        entities: [],
        intent: 'unknown-intent',
      };

      // Act
      const result = defaultAgentService.processFallbackLogic(
        noAgentResult,
        'Something totally random and unclassifiable',
      );

      // Assert
      expect(result.selectedAgentId).toBe('default-agent');
      expect(result.confidence).toBe(1.0);
      expect(result.reasoning).toContain('No agent selected');

      // Metrics should be updated
      const metrics = defaultAgentService.getFallbackMetrics();
      expect(metrics.totalFallbacks).toBe(1);
      expect(metrics.missingAgentFallbacks).toBe(1);
    });

    it('should return original result if no default agent is configured', () => {
      // Arrange
      // @ts-ignore - accessing private static instance for testing
      DefaultAgentService.instance = undefined;
      const serviceWithoutDefault = DefaultAgentService.getInstance({
        logger: mockLogger,
        agentRegistry: mockAgentRegistry,
      });

      const lowConfidenceResult: ClassifierResult = {
        selectedAgentId: 'specific-agent',
        confidence: 0.5,
        reasoning: 'Low confidence selection',
        isFollowUp: false,
        entities: [],
        intent: 'test-intent',
      };

      // Act
      const result = serviceWithoutDefault.processFallbackLogic(
        lowConfidenceResult,
        'What is the weather today?',
      );

      // Assert
      expect(result).toBe(lowConfidenceResult);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Fallback triggered but no default agent configured',
        ),
        expect.any(Object),
      );
    });
  });

  describe('getFallbackMetrics', () => {
    it('should return current metrics', () => {
      // Arrange
      defaultAgentService.setDefaultAgent('default-agent');

      // Trigger multiple fallbacks to generate metrics
      const lowConfidenceResult: ClassifierResult = {
        selectedAgentId: 'specific-agent',
        confidence: 0.5,
        reasoning: 'Low confidence',
        isFollowUp: false,
        entities: [],
        intent: 'intent1',
      };

      const noAgentResult: ClassifierResult = {
        selectedAgentId: null,
        confidence: 0.0,
        reasoning: 'No agent found',
        isFollowUp: false,
        entities: [],
        intent: 'intent2',
      };

      // Act
      defaultAgentService.processFallbackLogic(lowConfidenceResult, 'Query 1');
      defaultAgentService.processFallbackLogic(lowConfidenceResult, 'Query 2');
      defaultAgentService.processFallbackLogic(noAgentResult, 'Query 3');

      // Get metrics
      const metrics = defaultAgentService.getFallbackMetrics();

      // Assert
      expect(metrics.totalFallbacks).toBe(3);
      expect(metrics.lowConfidenceFallbacks).toBe(2);
      expect(metrics.missingAgentFallbacks).toBe(1);
      expect(metrics.fallbacksByIntent).toEqual({
        intent1: 2,
        intent2: 1,
      });
      expect(metrics.recentFallbackReasons.length).toBe(3);
      expect(metrics.averageConfidenceAtFallback).toBeCloseTo(0.33, 1); // (0.5 + 0.5 + 0) / 3
    });

    it('should limit the number of recent reasons', () => {
      // Arrange
      defaultAgentService.setDefaultAgent('default-agent');

      // Set a small limit for testing
      // @ts-ignore - accessing private property for testing
      defaultAgentService['maxRecentReasons'] = 3;

      const result: ClassifierResult = {
        selectedAgentId: 'specific-agent',
        confidence: 0.5,
        reasoning: 'Test',
        isFollowUp: false,
        entities: [],
        intent: 'test',
      };

      // Act - add 5 reasons (should keep only most recent 3)
      for (let i = 1; i <= 5; i++) {
        defaultAgentService.processFallbackLogic(
          { ...result, reasoning: `Test ${i}` },
          `Query ${i}`,
        );
      }

      // Assert
      const metrics = defaultAgentService.getFallbackMetrics();
      expect(metrics.recentFallbackReasons.length).toBe(3);
      expect(metrics.recentFallbackReasons[0]).toContain('Low confidence'); // Check for actual content
      expect(metrics.recentFallbackReasons[2]).toContain('Low confidence'); // Check for actual content
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to initial values', () => {
      // Arrange
      defaultAgentService.setDefaultAgent('default-agent');

      // Generate some metrics
      const result: ClassifierResult = {
        selectedAgentId: 'specific-agent',
        confidence: 0.5,
        reasoning: 'Low confidence',
        isFollowUp: false,
        entities: [],
        intent: 'test-intent',
      };

      defaultAgentService.processFallbackLogic(result, 'Test query');

      // Verify metrics were updated
      expect(defaultAgentService.getFallbackMetrics().totalFallbacks).toBe(1);

      // Act
      defaultAgentService.resetMetrics();

      // Assert
      const resetMetrics = defaultAgentService.getFallbackMetrics();
      expect(resetMetrics.totalFallbacks).toBe(0);
      expect(resetMetrics.lowConfidenceFallbacks).toBe(0);
      expect(resetMetrics.errorFallbacks).toBe(0);
      expect(resetMetrics.missingAgentFallbacks).toBe(0);
      expect(resetMetrics.recentFallbackReasons).toEqual([]);
      expect(resetMetrics.fallbacksByIntent).toEqual({});
    });
  });
});
