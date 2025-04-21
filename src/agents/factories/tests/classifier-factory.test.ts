import { ClassifierFactory, ClassifierType, ClassificationTelemetry } from '../classifier-factory';
import { OpenAIClassifier } from '../../classifiers/openai-classifier';
import { BedrockClassifier } from '../../classifiers/bedrock-classifier';
import { MockLogger } from '../../tests/mocks/mock-logger';
import { ClassifierResult } from '../../interfaces/classifier.interface';
import { ConversationMessage, ParticipantRole } from '../../types/conversation.types';

// Mock the classifiers
jest.mock('../../classifiers/openai-classifier');
jest.mock('../../classifiers/bedrock-classifier');

describe('ClassifierFactory', () => {
  let factory: ClassifierFactory;
  let mockLogger: MockLogger;
  let telemetryData: ClassificationTelemetry[] = [];
  
  // Helper to capture telemetry data
  const telemetryHandler = (data: ClassificationTelemetry) => {
    telemetryData.push(data);
  };
  
  beforeEach(() => {
    mockLogger = new MockLogger();
    telemetryData = [];
    
    factory = new ClassifierFactory({
      logger: mockLogger,
      defaultType: 'openai',
      maxRetries: 2,
      logLevel: 'debug',
      telemetryHandler
    });
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock implementations
    const mockOpenAIClassify = jest.fn().mockResolvedValue({
      selectedAgentId: 'openai-agent',
      confidence: 0.9,
      reasoning: 'OpenAI classified this',
      isFollowUp: false,
      entities: ['test'],
      intent: 'test_intent'
    });
    
    const mockBedrockClassify = jest.fn().mockResolvedValue({
      selectedAgentId: 'bedrock-agent',
      confidence: 0.85,
      reasoning: 'Bedrock classified this',
      isFollowUp: false,
      entities: ['test'],
      intent: 'test_intent'
    });
    
    // Mock the classify methods
    (OpenAIClassifier as jest.MockedClass<typeof OpenAIClassifier>).prototype.classify = mockOpenAIClassify;
    (BedrockClassifier as jest.MockedClass<typeof BedrockClassifier>).prototype.classify = mockBedrockClassify;
  });
  
  describe('initialization', () => {
    test('should initialize with default options', () => {
      const defaultFactory = new ClassifierFactory();
      
      expect(defaultFactory['defaultType']).toBe('openai');
      expect(defaultFactory['maxRetries']).toBe(3);
      expect(defaultFactory['fallbackOptions'].enabled).toBe(false);
    });
    
    test('should initialize with custom options', () => {
      const customFactory = new ClassifierFactory({
        defaultType: 'bedrock',
        maxRetries: 5,
        fallbackOptions: {
          enabled: true,
          classifierType: 'openai'
        }
      });
      
      expect(customFactory['defaultType']).toBe('bedrock');
      expect(customFactory['maxRetries']).toBe(5);
      expect(customFactory['fallbackOptions'].enabled).toBe(true);
      expect(customFactory['fallbackOptions'].classifierType).toBe('openai');
    });
  });
  
  describe('classifier creation', () => {
    test('should create OpenAI classifier by default', () => {
      const classifier = factory.createClassifier();
      
      expect(classifier).toBeInstanceOf(OpenAIClassifier);
      expect(OpenAIClassifier).toHaveBeenCalledWith(
        expect.objectContaining({
          logger: mockLogger,
          maxRetries: 2
        })
      );
    });
    
    test('should create classifier of specified type', () => {
      const bedrockClassifier = factory.createClassifier('bedrock');
      
      expect(bedrockClassifier).toBeInstanceOf(BedrockClassifier);
      expect(BedrockClassifier).toHaveBeenCalledWith(
        expect.objectContaining({
          logger: mockLogger,
          maxRetries: 2
        })
      );
    });
    
    test('should cache classifier instances', () => {
      const classifier1 = factory.createClassifier('openai');
      const classifier2 = factory.createClassifier('openai');
      
      expect(classifier1).toBe(classifier2); // Same instance
      expect(OpenAIClassifier).toHaveBeenCalledTimes(1); // Constructor called only once
    });
    
    test('should create different instances for different types', () => {
      const openaiClassifier = factory.createClassifier('openai');
      const bedrockClassifier = factory.createClassifier('bedrock');
      
      expect(openaiClassifier).not.toBe(bedrockClassifier);
      expect(OpenAIClassifier).toHaveBeenCalledTimes(1);
      expect(BedrockClassifier).toHaveBeenCalledTimes(1);
    });
    
    test('should create specialized classifier instances', () => {
      const openaiClassifier = factory.createOpenAIClassifier({
        modelName: 'gpt-4-turbo',
        temperature: 0.1
      });
      
      const bedrockClassifier = factory.createBedrockClassifier({
        modelId: 'anthropic.claude-3-sonnet',
        region: 'us-west-2'
      });
      
      expect(openaiClassifier).toBeInstanceOf(OpenAIClassifier);
      expect(bedrockClassifier).toBeInstanceOf(BedrockClassifier);
      
      // Check that options were passed correctly
      expect(OpenAIClassifier).toHaveBeenCalledWith(
        expect.objectContaining({
          modelName: 'gpt-4-turbo',
          temperature: 0.1
        })
      );
      
      expect(BedrockClassifier).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'anthropic.claude-3-sonnet',
          region: 'us-west-2'
        })
      );
    });
    
    test('should reset classifier cache', () => {
      // Create initial classifier
      const classifier1 = factory.createClassifier('openai');
      
      // Reset cache
      factory.resetCache();
      
      // Create new classifier
      const classifier2 = factory.createClassifier('openai');
      
      expect(classifier1).not.toBe(classifier2); // Different instances
      expect(OpenAIClassifier).toHaveBeenCalledTimes(2); // Constructor called twice
      expect(mockLogger.hasMessage('Classifier cache cleared')).toBe(true);
    });
  });
  
  describe('classification', () => {
    test('should classify using the default classifier', async () => {
      const input = 'Test input';
      const history: ConversationMessage[] = [
        {
          role: ParticipantRole.USER,
          content: 'Hello',
          timestamp: Date.now().toString()
        }
      ];
      
      const result = await factory.classify(input, history);
      
      expect(result.selectedAgentId).toBe('openai-agent');
      expect(OpenAIClassifier.prototype.classify).toHaveBeenCalledWith(input, history, undefined);
      
      // Check telemetry was captured
      expect(telemetryData.length).toBe(1);
      expect(telemetryData[0].classifierType).toBe('openai');
      expect(telemetryData[0].selectedAgentId).toBe('openai-agent');
    });
    
    test('should classify using specified classifier', async () => {
      const input = 'Test input';
      const history: ConversationMessage[] = [];
      
      const result = await factory.classify(input, history, {
        classifierType: 'bedrock'
      });
      
      expect(result.selectedAgentId).toBe('bedrock-agent');
      expect(BedrockClassifier.prototype.classify).toHaveBeenCalledWith(input, history, undefined);
      
      // Check telemetry was captured
      expect(telemetryData.length).toBe(1);
      expect(telemetryData[0].classifierType).toBe('bedrock');
    });
    
    test('should pass metadata to classifier', async () => {
      const input = 'Test input';
      const history: ConversationMessage[] = [];
      const metadata = { test: 'value' };
      
      await factory.classify(input, history, {
        metadata
      });
      
      expect(OpenAIClassifier.prototype.classify).toHaveBeenCalledWith(input, history, metadata);
    });
    
    test('should handle classification errors', async () => {
      // Setup classifier to throw error
      (OpenAIClassifier.prototype.classify as jest.Mock).mockRejectedValueOnce(
        new Error('Classification failed')
      );
      
      // Disable fallback
      factory.configureFallback({ enabled: false, classifierType: 'bedrock' });
      
      const result = await factory.classify('test', []);
      
      expect(result.selectedAgentId).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Classification error');
      
      // Check error logging
      expect(mockLogger.hasMessage('Classification failed', 'error')).toBe(true);
      
      // Check telemetry
      expect(telemetryData.length).toBe(1);
      expect(telemetryData[0].error).toContain('Classification failed');
    });
    
    test('should use fallback classifier when primary fails', async () => {
      // Enable fallback
      factory.configureFallback({ enabled: true, classifierType: 'bedrock' });
      
      // Setup primary classifier to throw error
      (OpenAIClassifier.prototype.classify as jest.Mock).mockRejectedValueOnce(
        new Error('Classification failed')
      );
      
      const result = await factory.classify('test', [], {
        classifierType: 'openai',
        enableFallback: true
      });
      
      // Should have fallback to bedrock
      expect(result.selectedAgentId).toBe('bedrock-agent');
      expect(BedrockClassifier.prototype.classify).toHaveBeenCalled();
      
      // Check logging
      expect(mockLogger.hasMessage('Classification failed', 'error')).toBe(true);
      expect(mockLogger.hasMessage('Attempting fallback classification', 'info')).toBe(true);
      
      // Check telemetry (should have two entries - failed and fallback)
      expect(telemetryData.length).toBe(2);
      expect(telemetryData[0].error).toBeDefined();
      expect(telemetryData[1].classifierType).toBe('bedrock');
    });
  });
  
  describe('configuration', () => {
    test('should set telemetry handler', () => {
      const newHandler = jest.fn();
      factory.setTelemetryHandler(newHandler);
      
      // Trigger classification to check handler
      factory.classify('test', []);
      
      expect(newHandler).toHaveBeenCalled();
      expect(mockLogger.hasMessage('Telemetry handler set')).toBe(true);
    });
    
    test('should configure fallback options', () => {
      const fallbackOptions = {
        enabled: true,
        classifierType: 'bedrock' as ClassifierType
      };
      
      factory.configureFallback(fallbackOptions);
      
      expect(factory['fallbackOptions']).toEqual(fallbackOptions);
      expect(mockLogger.hasMessage('Fallback configuration updated')).toBe(true);
    });
  });
}); 