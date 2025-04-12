/**
 * Tests for the ModelSelectionService
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  ModelSelectionService,
  TaskAnalysisResult,
} from '../model-selection.service.ts';
import {
  ModelRouterService,
  ModelSelectionCriteria,
  ModelConfig,
} from '../model-router.service.ts';

// Mock ModelRouterService
jest.mock('../model-router.service.ts', () => {
  const mockModelConfig: ModelConfig = {
    modelName: 'gpt-4-turbo',
    provider: 'openai',
    contextWindow: 128000,
    streaming: true,
    temperature: 0.7,
    costPerToken: 0.00001,
    capabilities: ['code', 'reasoning', 'creative', 'analysis'],
    maxOutputTokens: 4096,
  };

  return {
    ModelRouterService: {
      getInstance: jest.fn().mockReturnValue({
        selectModel: jest.fn().mockReturnValue(mockModelConfig),
      }),
    },
  };
});

describe('ModelSelectionService', () => {
  let modelSelectionService: ModelSelectionService;
  let mockModelRouter: any;
  let mockLogger: any;

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Get mocked ModelRouterService instance
    mockModelRouter = ModelRouterService.getInstance();

    // Create the service
    modelSelectionService = new ModelSelectionService({
      logger: mockLogger,
      modelRouter: mockModelRouter,
    });
  });

  describe('analyzeTask', () => {
    test('should correctly analyze simple tasks', () => {
      const simpleTask = 'Give me a brief summary of quantum computing.';
      const result = modelSelectionService.analyzeTask(simpleTask);

      expect(result.complexity).toBe('simple');
      expect(result.requiredCapabilities).toContain('summarization');
      expect(result.estimatedContextSize).toBeGreaterThan(0);
      expect(typeof result.requiresStreaming).toBe('boolean');
      expect(['fast', 'balanced', 'thorough']).toContain(
        result.suggestedResponseTime,
      );
    });

    test('should correctly analyze complex tasks', () => {
      const complexTask =
        'Develop a comprehensive analysis of the global economic implications of climate change, considering both short-term and long-term impacts across different sectors and regions.';
      const result = modelSelectionService.analyzeTask(complexTask);

      expect(result.complexity).toBe('complex');
      expect(result.requiredCapabilities.length).toBeGreaterThan(0);
      expect(result.estimatedContextSize).toBeGreaterThan(5000);
      expect(result.requiresStreaming).toBe(true);
      expect(result.suggestedResponseTime).toBe('thorough');
    });

    test('should detect code-related capabilities', () => {
      const codeTask =
        'Write a JavaScript function to implement a quick sort algorithm.';
      const result = modelSelectionService.analyzeTask(codeTask);

      expect(result.requiredCapabilities).toContain('code');
      expect(result.estimatedContextSize).toBeGreaterThan(4000); // Should allocate more context for code
    });

    test('should respect preferred capabilities', () => {
      const task = 'Tell me about the weather.';
      const preferredCapabilities = ['creative', 'reasoning'];
      const result = modelSelectionService.analyzeTask(
        task,
        preferredCapabilities,
      );

      expect(result.requiredCapabilities).toContain('creative');
      expect(result.requiredCapabilities).toContain('reasoning');
    });
  });

  describe('selectModelForTask', () => {
    test('should call modelRouter.selectModel with correct criteria', () => {
      const task = 'Summarize the main points of this article.';
      modelSelectionService.selectModelForTask(task);

      expect(mockModelRouter.selectModel).toHaveBeenCalledWith(
        expect.objectContaining({
          taskComplexity: expect.any(String),
          responseTime: expect.any(String),
          costSensitivity: expect.any(String),
          streamingRequired: expect.any(Boolean),
          contextSize: expect.any(Number),
          requiresSpecialCapabilities: expect.any(Array),
        }),
      );
    });

    test('should override analysis with provided options', () => {
      const task = 'Write a summary of the book.';
      const options = {
        costSensitivity: 'high' as const,
        responseSpeed: 'fast' as const,
        requiresStreaming: true,
        estimatedContextSize: 10000,
        preferredCapabilities: ['summarization', 'extraction'],
      };

      modelSelectionService.selectModelForTask(task, options);

      expect(mockModelRouter.selectModel).toHaveBeenCalledWith(
        expect.objectContaining({
          costSensitivity: 'high',
          responseTime: 'fast',
          streamingRequired: true,
          contextSize: 10000,
        }),
      );
    });

    test('should return the model selected by modelRouter', () => {
      const task = 'What is machine learning?';
      const expectedModel: ModelConfig = {
        modelName: 'gpt-4-turbo',
        provider: 'openai',
        contextWindow: 128000,
        streaming: true,
        temperature: 0.7,
        costPerToken: 0.00001,
        capabilities: ['code', 'reasoning', 'creative', 'analysis'],
        maxOutputTokens: 4096,
      };

      // Mock the return value for this specific test
      mockModelRouter.selectModel.mockReturnValueOnce(expectedModel);

      const result = modelSelectionService.selectModelForTask(task);

      expect(result).toEqual(expectedModel);
    });
  });

  describe('analyzeTaskComplexity', () => {
    test('should identify simple tasks', () => {
      const simpleTasks = [
        'What is the capital of France?',
        'Define photosynthesis',
        'Give me a quick summary of the French Revolution',
        'Is water wet? Yes or no',
        'Tell me a basic fact about elephants',
      ];

      // Using any to access private method for testing
      const service = modelSelectionService as any;

      simpleTasks.forEach((task) => {
        expect(service.analyzeTaskComplexity(task)).toBe('simple');
      });
    });

    test('should identify complex tasks', () => {
      const complexTasks = [
        'Analyze the geopolitical implications of climate change on international relations over the next 50 years',
        'Compare and contrast the philosophical approaches of Kant and Hegel with respect to their influence on modern ethics',
        'Design a comprehensive system architecture for a scalable e-commerce platform with microservices',
        'Develop a multi-step implementation plan for transitioning a legacy system to a cloud-native architecture',
      ];

      // Using any to access private method for testing
      const service = modelSelectionService as any;

      complexTasks.forEach((task) => {
        expect(service.analyzeTaskComplexity(task)).toBe('complex');
      });
    });

    test('should classify medium complexity tasks', () => {
      const mediumTasks = [
        'Explain how nuclear fusion works',
        'What are the main challenges in urban planning?',
        'How does cognitive behavioral therapy help with anxiety?',
        'What factors contributed to the 2008 financial crisis?',
      ];

      // Using any to access private method for testing
      const service = modelSelectionService as any;

      mediumTasks.forEach((task) => {
        expect(service.analyzeTaskComplexity(task)).toBe('medium');
      });
    });
  });

  describe('determineRequiredCapabilities', () => {
    test('should detect code capabilities', () => {
      const codeTasks = [
        'Write a Python function to sort a list',
        'Debug this JavaScript code',
        'Implement a binary search algorithm',
        'How do I use the React framework?',
      ];

      // Using any to access private method for testing
      const service = modelSelectionService as any;

      codeTasks.forEach((task) => {
        const capabilities = service.determineRequiredCapabilities(task);
        expect(capabilities).toContain('code');
      });
    });

    test('should detect creative capabilities', () => {
      const creativeTasks = [
        'Write a short story about a robot',
        'Generate a poem about autumn',
        'Create an innovative marketing campaign',
        'Design a logo concept for a tech startup',
      ];

      // Using any to access private method for testing
      const service = modelSelectionService as any;

      creativeTasks.forEach((task) => {
        const capabilities = service.determineRequiredCapabilities(task);
        expect(capabilities).toContain('creative');
      });
    });

    test('should add reasoning as default when no specific capability is detected', () => {
      const genericTask = 'What time is it?';

      // Using any to access private method for testing
      const service = modelSelectionService as any;

      const capabilities = service.determineRequiredCapabilities(genericTask);
      expect(capabilities).toContain('reasoning');
    });
  });

  describe('estimateContextSize', () => {
    test('should base size on task complexity', () => {
      // Using any to access private method for testing
      const service = modelSelectionService as any;

      const simpleSize = service.estimateContextSize('simple task', 'simple');
      const mediumSize = service.estimateContextSize('medium task', 'medium');
      const complexSize = service.estimateContextSize(
        'complex task',
        'complex',
      );

      expect(complexSize).toBeGreaterThan(mediumSize);
      expect(mediumSize).toBeGreaterThan(simpleSize);
    });

    test('should allocate more context for summarization tasks', () => {
      const service = modelSelectionService as any;

      const regularSize = service.estimateContextSize(
        'explain this concept',
        'medium',
      );
      const summarizationSize = service.estimateContextSize(
        'summarize this article',
        'medium',
      );

      expect(summarizationSize).toBeGreaterThan(regularSize);
    });

    test('should allocate more context for code tasks', () => {
      const service = modelSelectionService as any;

      const regularSize = service.estimateContextSize(
        'explain this concept',
        'medium',
      );
      const codeSize = service.estimateContextSize(
        'implement a sorting algorithm',
        'medium',
      );

      expect(codeSize).toBeGreaterThan(regularSize);
    });
  });

  describe('suggestResponseTime', () => {
    test('should suggest fast response time for simple tasks', () => {
      const service = modelSelectionService as any;

      expect(service.suggestResponseTime('simple task', 'simple')).toBe('fast');
    });

    test('should suggest thorough response time for complex tasks', () => {
      const service = modelSelectionService as any;

      expect(service.suggestResponseTime('complex task', 'complex')).toBe(
        'thorough',
      );
    });

    test('should detect indicators for thorough responses', () => {
      const service = modelSelectionService as any;

      expect(
        service.suggestResponseTime('provide a detailed analysis', 'medium'),
      ).toBe('thorough');
      expect(
        service.suggestResponseTime(
          'give me a comprehensive overview',
          'medium',
        ),
      ).toBe('thorough');
      expect(
        service.suggestResponseTime('do in-depth research', 'medium'),
      ).toBe('thorough');
    });

    test('should detect indicators for fast responses', () => {
      const service = modelSelectionService as any;

      expect(
        service.suggestResponseTime('give me a quick answer', 'medium'),
      ).toBe('fast');
      expect(
        service.suggestResponseTime('brief summary please', 'medium'),
      ).toBe('fast');
      expect(
        service.suggestResponseTime('tldr of this concept', 'medium'),
      ).toBe('fast');
    });
  });
});
