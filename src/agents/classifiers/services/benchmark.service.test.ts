import { BenchmarkService, BenchmarkStats, BenchmarkAgent } from './benchmark.service';
import { ClassifierInterface, ClassifierResult } from '../../interfaces/classifier.interface';
import { ConversationMessage, ParticipantRole } from '../../types/conversation.types';
import { MockLogger } from '../../../agents/tests/mocks/mock-logger';
import { BenchmarkItem } from '../tests/benchmark/benchmark-dataset';

// Mock classifier for testing
class MockClassifier implements ClassifierInterface {
  // Configuration for mock responses
  public mockResponses: Record<string, ClassifierResult> = {};
  public defaultResponse: ClassifierResult = {
    selectedAgentId: 'default-agent',
    confidence: 0.8,
    reasoning: 'Default response',
    isFollowUp: false,
    entities: [],
    intent: 'default'
  };
  public throwError = false;
  
  // Track calls
  public classifyCalls: Array<{input: string, history: ConversationMessage[]}> = [];

  // Implementation of ClassifierInterface
  async initialize(): Promise<void> {
    // No-op for mock
  }
  
  setAgents(): void {
    // No-op for mock
  }
  
  setPromptTemplate(): void {
    // No-op for mock
  }
  
  // Return mock responses based on input or throw error if configured
  async classify(
    input: string, 
    conversationHistory: ConversationMessage[]
  ): Promise<ClassifierResult> {
    // Track the call
    this.classifyCalls.push({
      input,
      history: conversationHistory
    });
    
    if (this.throwError) {
      throw new Error('Mock classifier error');
    }
    
    // Return a canned response for the input or default
    return this.mockResponses[input] || this.defaultResponse;
  }
  
  // Custom method for the mock to simulate template type setting
  setTemplateType(type: string): void {
    // No-op for mock
  }
}

describe('BenchmarkService', () => {
  let service: BenchmarkService;
  let mockClassifier: MockClassifier;
  let mockLogger: MockLogger;
  
  // Sample benchmark items to use in tests
  const sampleDataset: BenchmarkItem[] = [
    {
      category: 'general',
      input: 'test query 1',
      expected: {
        agentId: 'agent-1',
        minConfidence: 0.7,
        isFollowUp: false
      }
    },
    {
      category: 'technical',
      input: 'test query 2',
      expected: {
        agentId: 'agent-2',
        minConfidence: 0.8,
        isFollowUp: false,
        expectedEntities: ['entity1', 'entity2'],
        expectedIntent: 'technical_help'
      }
    },
    {
      category: 'followup',
      input: 'yes',
      history: [
        { role: ParticipantRole.USER, content: 'previous query' },
        { role: ParticipantRole.ASSISTANT, content: 'previous response', agentId: 'agent-1' }
      ],
      expected: {
        agentId: 'agent-1',
        minConfidence: 0.6,
        isFollowUp: true
      }
    }
  ];

  // Mock benchmark agents
  const mockAgents: Record<string, BenchmarkAgent> = {
    'agent-1': {
      id: 'agent-1',
      name: 'Test Agent 1',
      description: 'Test agent for benchmarking'
    },
    'agent-2': {
      id: 'agent-2',
      name: 'Test Agent 2',
      description: 'Another test agent for benchmarking'
    }
  };

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setLogLevel: jest.fn(),
      log: jest.fn(),
      hasMessage: jest.fn().mockReturnValue(false),
      getLogs: jest.fn().mockReturnValue([])
    } as any;
    
    service = new BenchmarkService({ logger: mockLogger });
    mockClassifier = new MockClassifier();
    
    // Set up default responses
    mockClassifier.mockResponses = {
      'test query 1': {
        selectedAgentId: 'agent-1',
        confidence: 0.9,
        reasoning: 'Selected agent 1',
        isFollowUp: false,
        entities: [],
        intent: 'general_query'
      },
      'test query 2': {
        selectedAgentId: 'agent-2',
        confidence: 0.85,
        reasoning: 'Selected agent 2',
        isFollowUp: false,
        entities: ['entity1', 'entity2'],
        intent: 'technical_help'
      },
      'yes': {
        selectedAgentId: 'agent-1',
        confidence: 0.8,
        reasoning: 'This is a follow-up',
        isFollowUp: true,
        entities: [],
        intent: 'confirm'
      }
    };
    
    // Reset tracking
    mockClassifier.classifyCalls = [];
    mockClassifier.throwError = false;
  });

  describe('runBenchmark', () => {
    test('should run full benchmark dataset', async () => {
      const results = await service.runBenchmark(
        mockClassifier,
        sampleDataset,
        mockAgents,
        { verbose: false }
      );
      
      // Should have called classifier for each item
      expect(mockClassifier.classifyCalls.length).toBe(3);
      
      // Should have calculated correct statistics
      expect(results.totalTests).toBe(3);
      expect(results.correctClassifications).toBe(3);
      expect(results.accuracy).toBe(1); // 100% success
      
      // Should have set template type
      expect(mockClassifier.classifyCalls[2].input).toBe('yes'); // The follow-up test
    });
    
    test('should filter by category', async () => {
      // Filter dataset by category
      const technicalDataset = sampleDataset.filter(item => item.category === 'technical');
      
      const results = await service.runBenchmark(
        mockClassifier,
        technicalDataset,
        mockAgents
      );
      
      // Should only run technical test
      expect(mockClassifier.classifyCalls.length).toBe(1);
      expect(mockClassifier.classifyCalls[0].input).toBe('test query 2');
      
      // Stats should only include technical category
      expect(results.totalTests).toBe(1);
      
      // Check results have correct category data
      const categoryResults = service['getCategoryResults'](results);
      expect(Object.keys(categoryResults)).toEqual(['technical']);
    });
    
    test('should handle classifier errors', async () => {
      // Make one query fail
      mockClassifier.mockResponses['test query 2'] = {
        selectedAgentId: 'wrong-agent', // Wrong agent to make validation fail
        confidence: 0.5,
        reasoning: 'Wrong agent',
        isFollowUp: false,
        entities: [],
        intent: 'wrong_intent'
      };
      
      const results = await service.runBenchmark(
        mockClassifier,
        sampleDataset,
        mockAgents
      );
      
      // Should have 1 failure (the technical query)
      expect(results.correctClassifications).toBe(2);
      expect(results.totalTests - results.correctClassifications).toBe(1);
      
      // Check category results
      const categoryResults = service['getCategoryResults'](results);
      expect(categoryResults.technical.correct).toBe(0);
      
      // Should record details of the failure
      const failedTests = results.results.filter(r => !r.isCorrect);
      expect(failedTests).toHaveLength(1);
      expect(failedTests[0].item.input).toBe('test query 2');
    });
    
    test('should handle exceptions during classification', async () => {
      // Make classifier throw an error
      mockClassifier.throwError = true;
      
      const results = await service.runBenchmark(
        mockClassifier,
        sampleDataset,
        mockAgents,
        { verbose: true }
      );
      
      // All tests should fail due to error
      expect(results.correctClassifications).toBe(0);
      expect(results.errors.length).toBe(3);
      
      // Error should be logged
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
  
  describe('report generation', () => {
    test('should generate formatted benchmark report', async () => {
      // Run a benchmark with mixed results
      mockClassifier.mockResponses['test query 2'] = {
        selectedAgentId: 'wrong-agent',
        confidence: 0.5,
        reasoning: 'Wrong agent',
        isFollowUp: false,
        entities: [],
        intent: 'wrong_intent'
      };
      
      const results = await service.runBenchmark(
        mockClassifier,
        sampleDataset,
        mockAgents
      );
      
      // Generate report
      const report = service.generateReport(results);
      
      // Should include overall statistics
      expect(report).toContain('# Classifier Benchmark Report');
      expect(report).toContain('Total test cases: 3');
      expect(report).toContain('Passed: 2');
      expect(report).toContain('Failed: 1');
      
      // Should include category breakdown
      expect(report).toContain('| general | 1 | 1 | 0 |');
      expect(report).toContain('| technical | 1 | 0 | 1 |');
      
      // Should include failed test details
      expect(report).toContain('### technical: "test query 2"');
      expect(report).toContain('"selectedAgentId": "wrong-agent"');
    });
  });
  
  describe('result validation', () => {
    test('should validate selected agent ID', async () => {
      // Make a test with specific scenario
      const testItem: BenchmarkItem = {
        category: 'general',
        input: 'test validation',
        expected: {
          agentId: 'expected-agent',
          minConfidence: 0.5,
          isFollowUp: false
        }
      };
      
      // Configure classifier to return wrong agent
      mockClassifier.mockResponses['test validation'] = {
        selectedAgentId: 'wrong-agent',
        confidence: 0.9,
        reasoning: 'Wrong agent',
        isFollowUp: false,
        entities: [],
        intent: ''
      };
      
      const results = await service.runBenchmark(
        mockClassifier,
        [testItem],
        mockAgents
      );
      
      // Should fail validation
      expect(results.correctClassifications).toBe(0);
      expect(results.totalTests).toBe(1);
    });
    
    test('should validate confidence threshold', async () => {
      // Create test item with high confidence requirement
      const testItem: BenchmarkItem = {
        category: 'general',
        input: 'high confidence query',
        expected: {
          agentId: 'agent-1',
          minConfidence: 0.9, // High threshold
          isFollowUp: false
        }
      };
      
      // Configure classifier to return too low confidence
      mockClassifier.mockResponses['high confidence query'] = {
        selectedAgentId: 'agent-1',
        confidence: 0.8, // Below threshold
        reasoning: 'Good but not confident enough',
        isFollowUp: false,
        entities: [],
        intent: ''
      };
      
      const results = await service.runBenchmark(
        mockClassifier,
        [testItem],
        mockAgents
      );
      
      // Should fail validation due to confidence
      expect(results.correctClassifications).toBe(0);
      expect(results.totalTests).toBe(1);
    });
    
    test('should validate entities and intent', async () => {
      // Create test that requires specific entities and intent
      const testItem: BenchmarkItem = {
        category: 'technical',
        input: 'entity test',
        expected: {
          agentId: 'agent-1',
          minConfidence: 0.5,
          isFollowUp: false,
          expectedEntities: ['entity1', 'entity2'],
          expectedIntent: 'specific_intent'
        }
      };
      
      // Test with missing entity
      mockClassifier.mockResponses['entity test'] = {
        selectedAgentId: 'agent-1',
        confidence: 0.8,
        reasoning: 'Missing entities',
        isFollowUp: false,
        entities: ['entity1'], // Missing entity2
        intent: 'specific_intent'
      };
      
      const results = await service.runBenchmark(
        mockClassifier,
        [testItem],
        mockAgents
      );
      
      // Should fail validation due to missing entity
      expect(results.correctClassifications).toBe(0);
      expect(results.totalTests).toBe(1);
      
      // Update mock to include entities but wrong intent
      mockClassifier.mockResponses['entity test'] = {
        selectedAgentId: 'agent-1',
        confidence: 0.8,
        reasoning: 'Wrong intent',
        isFollowUp: false,
        entities: ['entity1', 'entity2'],
        intent: 'wrong_intent'
      };
      
      const results2 = await service.runBenchmark(
        mockClassifier,
        [testItem],
        mockAgents
      );
      
      // Should fail validation due to wrong intent
      expect(results2.correctClassifications).toBe(0);
      expect(results2.totalTests).toBe(1);
    });
  });
}); 