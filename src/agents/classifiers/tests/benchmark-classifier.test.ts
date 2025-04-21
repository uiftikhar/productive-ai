import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BENCHMARK_DATASET, BENCHMARK_AGENTS } from './benchmark/benchmark-dataset';
import { ClassifierInterface } from '../../interfaces/classifier.interface';
import { OpenAIClassifier } from '../openai-classifier';
import { BaseClassifier } from '../base-classifier';
import { ConversationMessage, ParticipantRole } from '../../types/conversation.types';
import { ClassifierResult } from '../../interfaces/classifier.interface';
import { BenchmarkService } from '../services/benchmark.service';
import { mock } from 'jest-mock-extended';
import { Logger } from '../../../shared/logger/logger.interface';

// Mock BedrockClassifier for testing
class BedrockClassifier extends BaseClassifier {
  constructor() {
    super({});
  }
  
  classifyInternal(): Promise<ClassifierResult> {
    return Promise.resolve({
      selectedAgentId: 'mock-agent',
      confidence: 0.9,
      isFollowUp: false,
      reasoning: 'Mock reasoning',
      entities: [],
      intent: ''
    });
  }
}

// Mock dependencies to avoid actual API calls
jest.mock('@langchain/openai', () => {
  return {
    ChatOpenAI: jest.fn().mockImplementation(() => ({
      // Using any to avoid type issues in test
      invoke: jest.fn().mockImplementation((...args: unknown[]) => {
        // Extract messages from args, assuming it's the first argument
        const messages = Array.isArray(args[0]) ? args[0] : [];
        
        // Get the user input from the messages
        const userMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        const userInput = userMessage && typeof userMessage === 'object' && 'content' in userMessage 
          ? String(userMessage.content) 
          : '';
        
        // Simulate different responses based on the query content
        let response: {
          selectedAgentId: string | null;
          confidence: number;
          isFollowUp: boolean;
          reasoning: string;
        } = {
          selectedAgentId: 'general-assistant',
          confidence: 0.8,
          isFollowUp: false,
          reasoning: 'This is a general query'
        };
        
        // Detect technical queries
        if (userInput.match(/JavaScript|TypeScript|React|Docker|API|REST|GraphQL|code|programming|debug/i)) {
          response = {
            selectedAgentId: 'technical-assistant',
            confidence: 0.9,
            isFollowUp: false,
            reasoning: 'This is a technical query related to programming'
          };
        }
        
        // Detect customer service queries
        else if (userInput.match(/order|return|refund|subscription|cancel|account|purchase|charged/i)) {
          response = {
            selectedAgentId: 'customer-service',
            confidence: 0.85,
            isFollowUp: false,
            reasoning: 'This is a customer service related query'
          };
        }
        
        // Detect ambiguous queries
        else if (userInput.match(/^(How does that work|How do I install it|Can you give me more information)\?$/i)) {
          response = {
            selectedAgentId: null,
            confidence: 0.3,
            isFollowUp: false,
            reasoning: 'This query is ambiguous without context'
          };
        }
        
        // Detect follow-up questions by checking previous messages
        if (messages.length > 2) {
          const systemMessage = messages[0] && typeof messages[0] === 'object' && 'content' in messages[0]
            ? String(messages[0].content)
            : '';
            
          if (systemMessage.includes('previous messages')) {
            response.isFollowUp = true;
            
            // Try to extract the previous agent ID from the system message for more accurate testing
            const prevAgentMatch = systemMessage.match(/previous agent.*?([a-z-]+)/i);
            if (prevAgentMatch && prevAgentMatch[1]) {
              // Only set if not ambiguous, as ambiguous queries should keep selectedAgentId null
              if (response.selectedAgentId !== null) {
                response.selectedAgentId = prevAgentMatch[1];
              }
            }
          }
        }
        
        return Promise.resolve({
          content: JSON.stringify(response)
        });
      })
    }))
  };
});

describe('Benchmark Classifier', () => {
  let benchmarkService: BenchmarkService;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = mock<Logger>();
    benchmarkService = new BenchmarkService({ logger: mockLogger });
  });

  it('should initialize successfully', () => {
    expect(benchmarkService).toBeDefined();
  });

  describe('runBenchmark', () => {
    it('should evaluate classifier performance against benchmark dataset', async () => {
      // Arrange
      const mockClassifier = mock<OpenAIClassifier>();
      
      // Mock the setAgents method
      mockClassifier.setAgents.mockImplementation(() => {});
      
      // Setup mock responses for each benchmark item
      BENCHMARK_DATASET.forEach((item, index) => {
        // For each benchmark item, return the expected result for odd indices
        // and an incorrect result for even indices to test accuracy calculation
        const mockResult: ClassifierResult = {
          selectedAgentId: index % 2 === 0 ? item.expected.agentId : 'wrong-agent',
          confidence: 0.8,
          reasoning: 'Mock reasoning',
          isFollowUp: false,
          entities: [],
          intent: ''
        };
        
        mockClassifier.classify.mockResolvedValueOnce(mockResult);
      });

      // Act
      const result = await benchmarkService.runBenchmark(
        mockClassifier,
        BENCHMARK_DATASET,
        BENCHMARK_AGENTS,
        { verbose: true }
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.accuracy).toBeCloseTo(0.5, 1); // Half of the items should match
      expect(result.totalTests).toBe(BENCHMARK_DATASET.length);
      expect(result.correctClassifications).toBe(Math.ceil(BENCHMARK_DATASET.length / 2));
      expect(mockClassifier.classify).toHaveBeenCalledTimes(BENCHMARK_DATASET.length);
    });

    it('should handle when all classifications are correct', async () => {
      // Arrange
      const mockClassifier = mock<BedrockClassifier>();
      
      // Mock the setAgents method
      mockClassifier.setAgents.mockImplementation(() => {});
      
      // Setup mock responses to always return the expected result
      BENCHMARK_DATASET.forEach((item) => {
        const mockResult: ClassifierResult = {
          selectedAgentId: item.expected.agentId,
          confidence: 0.95,
          reasoning: 'Perfect classification',
          isFollowUp: false,
          entities: [],
          intent: ''
        };
        
        mockClassifier.classify.mockResolvedValueOnce(mockResult);
      });

      // Act
      const result = await benchmarkService.runBenchmark(
        mockClassifier,
        BENCHMARK_DATASET,
        BENCHMARK_AGENTS
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.accuracy).toBe(1.0); // All should match
      expect(result.totalTests).toBe(BENCHMARK_DATASET.length);
      expect(result.correctClassifications).toBe(BENCHMARK_DATASET.length);
    });

    it('should handle when all classifications are incorrect', async () => {
      // Arrange
      const mockClassifier = mock<OpenAIClassifier>();
      
      // Mock the setAgents method
      mockClassifier.setAgents.mockImplementation(() => {});
      
      // Setup mock responses to always return incorrect results
      BENCHMARK_DATASET.forEach(() => {
        const mockResult: ClassifierResult = {
          selectedAgentId: 'wrong-agent-id',
          confidence: 0.3,
          reasoning: 'Completely wrong',
          isFollowUp: false,
          entities: [],
          intent: ''
        };
        
        mockClassifier.classify.mockResolvedValueOnce(mockResult);
      });

      // Act
      const result = await benchmarkService.runBenchmark(
        mockClassifier,
        BENCHMARK_DATASET,
        BENCHMARK_AGENTS
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.accuracy).toBe(0); // None should match
      expect(result.totalTests).toBe(BENCHMARK_DATASET.length);
      expect(result.correctClassifications).toBe(0);
    });

    it('should handle errors during classification', async () => {
      // Arrange
      const mockClassifier = mock<OpenAIClassifier>();
      const errorMessage = 'Classification error';
      
      // Mock the setAgents method
      mockClassifier.setAgents.mockImplementation(() => {});
      
      // Make some classifications succeed and some fail
      BENCHMARK_DATASET.forEach((item, index) => {
        if (index % 2 === 0) {
          mockClassifier.classify.mockResolvedValueOnce({
            selectedAgentId: item.expected.agentId,
            confidence: 0.8,
            reasoning: 'Good classification',
            isFollowUp: false,
            entities: [],
            intent: ''
          });
        } else {
          mockClassifier.classify.mockRejectedValueOnce(new Error(errorMessage));
        }
      });

      // Act
      const result = await benchmarkService.runBenchmark(
        mockClassifier,
        BENCHMARK_DATASET,
        BENCHMARK_AGENTS
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.totalTests).toBe(BENCHMARK_DATASET.length);
      // Only the successful classifications count toward accuracy
      expect(result.correctClassifications).toBe(Math.ceil(BENCHMARK_DATASET.length / 2));
      expect(result.errors.length).toBe(Math.floor(BENCHMARK_DATASET.length / 2));
      expect(result.errors[0].error.message).toBe(errorMessage);
    });
  });
  
  // Simple test for the compareClassifiers method
  describe('compareClassifiers', () => {
    it('should be defined as a method on the benchmark service', () => {
      expect(typeof benchmarkService.compareClassifiers).toBe('function');
    });
  });
});

interface BenchmarkResult {
  item: typeof BENCHMARK_DATASET[0];
  result: {
    selectedAgentId: string | null;
    confidence: number;
    isFollowUp: boolean;
  };
  isCorrect: boolean;
  error?: Error;
}

/**
 * Run the benchmark suite on a given classifier
 */
async function runBenchmark(classifier: ClassifierInterface): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  
  for (const item of BENCHMARK_DATASET) {
    try {
      // Convert benchmark history format to conversation turns
      const conversationHistory: ConversationMessage[] = item.history?.map(h => ({
        role: h.role,
        content: h.content,
        agentId: h.agentId,
        timestamp: Date.now().toString()
      })) || [];
      
      // Classify the input
      const result = await classifier.classify(item.input, conversationHistory);
      
      // Determine if the classification is correct
      const isCorrect = 
        result.selectedAgentId === item.expected.agentId &&
        (result.confidence >= item.expected.minConfidence) &&
        result.isFollowUp === item.expected.isFollowUp;
      
      results.push({
        item,
        result: {
          selectedAgentId: result.selectedAgentId,
          confidence: result.confidence,
          isFollowUp: result.isFollowUp
        },
        isCorrect
      });
    } catch (error) {
      results.push({
        item,
        result: {
          selectedAgentId: null,
          confidence: 0,
          isFollowUp: false
        },
        isCorrect: false,
        error: error as Error
      });
    }
  }
  
  return results;
}

/**
 * Calculate the accuracy score from benchmark results
 */
function calculateAccuracy(results: BenchmarkResult[]): number {
  const correctCount = results.filter(r => r.isCorrect).length;
  return (correctCount / results.length) * 100;
}
