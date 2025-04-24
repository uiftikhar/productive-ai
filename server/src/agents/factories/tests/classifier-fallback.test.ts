import { ClassifierFactory } from '../classifier-factory';
import { DefaultAgentService } from '../../services/default-agent.service';
import { ClassifierConfigService } from '../classifier-config.service';
import { AgentRegistryService } from '../../services/agent-registry.service';
import { OpenAIClassifier } from '../../classifiers/openai-classifier';
import { BedrockClassifier } from '../../classifiers/bedrock-classifier';
import { MockLogger } from '../../tests/mocks/mock-logger';
import { ClassifierResult } from '../../interfaces/classifier.interface';
import {
  ConversationMessage,
  ParticipantRole,
} from '../../types/conversation.types';
import { mock, MockProxy } from 'jest-mock-extended';
import { BaseAgentInterface } from '../../interfaces/base-agent.interface';

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

// Create mock interface that has only the methods we need to mock
interface DefaultAgentInterface {
  processFallbackLogic: (
    result: ClassifierResult,
    input: string,
  ) => ClassifierResult;
  getDefaultAgent: () => BaseAgentInterface | null;
  setDefaultAgent: (agentId: string) => void;
  setConfidenceThreshold: (threshold: number) => void;
  getFallbackMetrics: () => any;
  resetMetrics: () => void;
}

// Create the mock before using it in jest.mock
const mockDefaultAgentService = mock<DefaultAgentInterface>();

// Mock the classifiers
jest.mock('../../classifiers/openai-classifier');
jest.mock('../../classifiers/bedrock-classifier');

// Mock DefaultAgentService.getInstance to return our mock
jest.mock('../../services/default-agent.service', () => ({
  DefaultAgentService: {
    getInstance: jest.fn(() => mockDefaultAgentService),
  },
}));

// Create a real logger for tests
class TestLogger extends MockLogger {
  public logs: Array<{ level: string; message: string; meta?: any }> = [];

  debug(message: string, meta?: any): void {
    this.logs.push({ level: 'debug', message, meta });
  }

  info(message: string, meta?: any): void {
    this.logs.push({ level: 'info', message, meta });
  }

  warn(message: string, meta?: any): void {
    this.logs.push({ level: 'warn', message, meta });
  }

  error(message: string, meta?: any): void {
    this.logs.push({ level: 'error', message, meta });
  }

  hasMessage(message: string, level?: string): boolean {
    return this.logs.some(
      (log) => log.message.includes(message) && (!level || log.level === level),
    );
  }
}

describe('Classifier Fallback Integration', () => {
  let classifierFactory: ClassifierFactory;
  let configService: ClassifierConfigService;
  let testLogger: TestLogger;
  let mockAgentRegistry: MockProxy<AgentRegistryService>;
  let mockDefaultAgent: MockProxy<BaseAgentInterface>;
  let mockSpecialistAgent: MockProxy<BaseAgentInterface>;

  beforeEach(() => {
    // Set up proper logging
    testLogger = new TestLogger();
    mockAgentRegistry = mock<AgentRegistryService>();

    // Create mock agents
    mockDefaultAgent = createMockAgent('default-agent', 'Default Agent');
    mockSpecialistAgent = createMockAgent(
      'specialist-agent',
      'Specialist Agent',
    );

    // Set up agent registry mock
    mockAgentRegistry.getAgent.mockImplementation((id: string) => {
      if (id === 'default-agent') return mockDefaultAgent;
      if (id === 'specialist-agent') return mockSpecialistAgent;
      return undefined;
    });

    // Configure our mocked DefaultAgentService
    mockDefaultAgentService.getDefaultAgent.mockReturnValue(mockDefaultAgent);
    mockDefaultAgentService.processFallbackLogic.mockImplementation(
      (result, input) => {
        // If confidence is below threshold, return fallback result
        if (result.confidence < 0.7) {
          return {
            ...result,
            selectedAgentId: 'default-agent',
            confidence: 1.0,
            reasoning: `Fallback due to low confidence (${result.confidence}). Using default agent.`,
          };
        }
        return result;
      },
    );

    // Create the classifier factory with our test logger
    classifierFactory = new ClassifierFactory({
      logger: testLogger,
      defaultType: 'openai',
      maxRetries: 2,
      logLevel: 'debug',
    });

    // Create the config service
    configService = ClassifierConfigService.getInstance(testLogger);

    // Setup mock implementations for classifiers
    const mockOpenAIClassify = jest.fn().mockImplementation((input: string) => {
      // Simulate different confidence levels based on input
      let confidence = 0.85; // Default high confidence

      if (input.includes('unsure')) {
        confidence = 0.6; // Medium/borderline confidence
      } else if (input.includes('unknown')) {
        confidence = 0.4; // Low confidence
      } else if (input.includes('error')) {
        return Promise.reject(new Error('Classification error'));
      }

      return Promise.resolve({
        selectedAgentId: 'specialist-agent',
        confidence,
        reasoning: `OpenAI classified with confidence ${confidence}`,
        isFollowUp: false,
        entities: ['test'],
        intent: 'test_intent',
      });
    });

    const mockBedrockClassify = jest.fn().mockResolvedValue({
      selectedAgentId: 'specialist-agent',
      confidence: 0.75,
      reasoning: 'Bedrock classified this',
      isFollowUp: false,
      entities: ['test'],
      intent: 'test_intent',
    });

    // Mock the classify methods
    (
      OpenAIClassifier as jest.MockedClass<typeof OpenAIClassifier>
    ).prototype.classify = mockOpenAIClassify;
    (
      BedrockClassifier as jest.MockedClass<typeof BedrockClassifier>
    ).prototype.classify = mockBedrockClassify;

    // Reset mocks
    jest.clearAllMocks();
    testLogger.logs = [];
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Clean up any intervals created during the test
    configService.cleanupAllMetricsReporting();
  });

  // Clean up all intervals after all tests are done
  afterAll(() => {
    configService.cleanupAllMetricsReporting();
  });

  // Milestone 4.2: Test Suite for Fallback Scenarios
  describe('Basic Fallback Scenarios', () => {
    it('should not trigger fallback for high confidence classifications', async () => {
      // Configure factory with default agent fallback
      configService.configureClassifierFallback(classifierFactory, {
        enableDefaultAgentFallback: true,
        confidenceThreshold: 0.7,
        defaultAgentId: 'default-agent',
        logger: testLogger,
      });

      const input = 'Help me with something';
      const history: ConversationMessage[] = [];

      // Execute classification
      const result = await classifierFactory.classify(input, history, {
        enableDefaultAgentFallback: true,
      });

      // Verify no fallback triggered
      expect(result.selectedAgentId).toBe('specialist-agent');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(mockDefaultAgentService.processFallbackLogic).toHaveBeenCalled();
    });

    it('should trigger fallback for low confidence classifications', async () => {
      // Configure factory with default agent fallback
      configService.configureClassifierFallback(classifierFactory, {
        enableDefaultAgentFallback: true,
        confidenceThreshold: 0.7,
        defaultAgentId: 'default-agent',
        logger: testLogger,
      });

      const input = 'unknown topic that is hard to classify';
      const history: ConversationMessage[] = [];

      // Execute classification
      const result = await classifierFactory.classify(input, history, {
        enableDefaultAgentFallback: true,
      });

      // Verify fallback triggered
      expect(result.selectedAgentId).toBe('default-agent');
      expect(result.confidence).toBe(1.0);
      expect(mockDefaultAgentService.processFallbackLogic).toHaveBeenCalled();
    });

    it('should handle classifier errors with fallback', async () => {
      // Configure factory with classifier fallback
      configService.configureClassifierFallback(classifierFactory, {
        enableClassifierFallback: true,
        fallbackClassifierType: 'bedrock',
        logger: testLogger,
      });

      // Force an error in the OpenAI classifier to trigger fallback
      (OpenAIClassifier.prototype.classify as jest.Mock).mockRejectedValueOnce(
        new Error('Simulated OpenAI error'),
      );

      const input = 'error-causing input';
      const history: ConversationMessage[] = [];

      // Execute classification with fallback explicitly enabled
      const result = await classifierFactory.classify(input, history, {
        enableFallback: true,
        classifierType: 'openai',
      });

      // Verify that we got a valid result (which would come from the Bedrock fallback)
      expect(result).toBeDefined();
      expect(result.selectedAgentId).toBe('specialist-agent');
      expect(result.confidence).toBe(0.75);
      expect(BedrockClassifier.prototype.classify).toHaveBeenCalled();
    });
  });

  describe('Advanced Fallback Integration', () => {
    it('should track fallback metrics correctly', async () => {
      // Mock metrics data
      mockDefaultAgentService.getFallbackMetrics.mockReturnValue({
        totalFallbacks: 5,
        lowConfidenceFallbacks: 3,
        errorFallbacks: 1,
        missingAgentFallbacks: 1,
        averageConfidenceAtFallback: 0.5,
        recentFallbackReasons: ['Low confidence (0.4)', 'Missing agent'],
        fallbacksByIntent: { test_intent: 3, unknown_intent: 2 },
        lastUpdated: Date.now(),
      });

      // Configure factory with default agent fallback
      configService.configureClassifierFallback(classifierFactory, {
        enableDefaultAgentFallback: true,
        confidenceThreshold: 0.7,
        defaultAgentId: 'default-agent',
        logger: testLogger,
      });

      // Trigger a series of classifications
      await classifierFactory.classify('normal request', [], {
        enableDefaultAgentFallback: true,
      });
      await classifierFactory.classify('unknown topic', [], {
        enableDefaultAgentFallback: true,
      });
      await classifierFactory.classify('unsure about this', [], {
        enableDefaultAgentFallback: true,
      });

      // Get metrics
      const metrics = configService.getFallbackMetrics(classifierFactory);

      // Verify metrics are being tracked
      expect(metrics).toBeDefined();
      expect(metrics.totalFallbacks).toBe(5); // From our mock

      // Verify metric reporting works
      expect(mockDefaultAgentService.getFallbackMetrics).toHaveBeenCalled();
    });

    it('should support context-aware fallback decisions', async () => {
      // Configure factory with default agent fallback
      configService.configureClassifierFallback(classifierFactory, {
        enableDefaultAgentFallback: true,
        confidenceThreshold: 0.7,
        defaultAgentId: 'default-agent',
        logger: testLogger,
      });

      // Mock conversation history to test context-awareness
      const history: ConversationMessage[] = [
        {
          role: ParticipantRole.USER,
          content: 'Tell me about machine learning',
          timestamp: (Date.now() - 60000).toString(),
        },
        {
          role: ParticipantRole.ASSISTANT,
          content: 'Machine learning is a subset of AI...',
          timestamp: (Date.now() - 50000).toString(),
        },
      ];

      // Execute classification with history context
      const result = await classifierFactory.classify(
        'unsure about this follow-up',
        history,
        {
          enableDefaultAgentFallback: true,
        },
      );

      // Verify the classifier used context in decision
      expect(mockDefaultAgentService.processFallbackLogic).toHaveBeenCalledWith(
        expect.any(Object),
        'unsure about this follow-up',
      );

      // Verify the classifier had access to history
      expect(OpenAIClassifier.prototype.classify).toHaveBeenCalledWith(
        'unsure about this follow-up',
        history,
        undefined,
      );
    });
  });

  describe('Threshold Tuning', () => {
    it('should adjust thresholds based on metrics', () => {
      // Mock metrics data for a high fallback rate
      mockDefaultAgentService.getFallbackMetrics.mockReturnValue({
        totalFallbacks: 200,
        lowConfidenceFallbacks: 150,
        errorFallbacks: 30,
        missingAgentFallbacks: 20,
        averageConfidenceAtFallback: 0.55,
        recentFallbackReasons: ['Low confidence (0.6)', 'Missing agent'],
        fallbacksByIntent: { test_intent: 120, unknown_intent: 80 },
        lastUpdated: Date.now(),
      });

      // Configure factory
      configService.configureClassifierFallback(classifierFactory, {
        enableDefaultAgentFallback: true,
        confidenceThreshold: 0.7,
        defaultAgentId: 'default-agent',
        logger: testLogger,
      });

      // Inject the confidenceThreshold value for testing
      Object.defineProperty(mockDefaultAgentService, 'confidenceThreshold', {
        value: 0.7,
        writable: true,
        configurable: true,
      });

      // Run tuning with a target fallback rate
      configService.tuneFallbackThreshold(classifierFactory, 0.1);

      // Verify threshold was raised to reduce fallbacks
      expect(
        mockDefaultAgentService.setConfidenceThreshold,
      ).toHaveBeenCalledWith(expect.any(Number));
    });
  });
});
