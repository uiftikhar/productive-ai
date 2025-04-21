import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BENCHMARK_DATASET, BENCHMARK_AGENTS } from './benchmark/benchmark-dataset';
import { ClassifierInterface } from '../../interfaces/classifier.interface';
import { OpenAIClassifier } from '../openai-classifier';
import { BaseClassifier } from '../base-classifier';
import { ConversationMessage, ParticipantRole } from '../../types/conversation.types';

// Mock dependencies to avoid actual API calls
jest.mock('@langchain/openai', () => {
  return {
    ChatOpenAI: jest.fn().mockImplementation(() => ({
      // Using any to avoid type issues in test
      invoke: jest.fn().mockImplementation(() => {
        return Promise.resolve({
          content: JSON.stringify({
            selectedAgentId: 'general-assistant',
            confidence: 0.8,
            isFollowUp: false,
            reasoning: 'This is a general query about capabilities'
          })
        }) as any;
      })
    }))
  };
});

describe('Classifier Benchmark Tests', () => {
  let openaiClassifier: ClassifierInterface;
  
  beforeEach(() => {
    openaiClassifier = new OpenAIClassifier();
    
    // Set benchmark agents
    const mockAgents = Object.values(BENCHMARK_AGENTS).reduce((acc, agent) => {
      acc[agent.id] = {
        id: agent.id,
        name: agent.name,
        description: agent.description
      };
      return acc;
    }, {} as Record<string, any>);
    
    openaiClassifier.setAgents(mockAgents);
    
    // Reset mock implementations before each test
    jest.clearAllMocks();
  });
  
  describe('OpenAI Classifier Benchmark', () => {
    it('should achieve acceptable accuracy on the benchmark dataset', async () => {
      const results = await runBenchmark(openaiClassifier);
      const accuracyScore = calculateAccuracy(results);
      
      console.log(`OpenAI Classifier Accuracy: ${accuracyScore.toFixed(2)}%`);
      expect(accuracyScore).toBeGreaterThanOrEqual(80); // Expect at least 80% accuracy
      
      // Output detailed results for inspection
      logDetailedResults(results, 'OpenAI');
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

/**
 * Log detailed results for analysis
 */
function logDetailedResults(results: BenchmarkResult[], classifierType: string): void {
  console.log(`\n--- ${classifierType} Classifier Detailed Results ---`);
  
  // Group by category
  const categoryResults = results.reduce((acc, result) => {
    const category = result.item.category;
    if (!acc[category]) {
      acc[category] = { total: 0, correct: 0, items: [] };
    }
    
    acc[category].total++;
    if (result.isCorrect) {
      acc[category].correct++;
    }
    
    acc[category].items.push(result);
    return acc;
  }, {} as Record<string, { total: number; correct: number; items: BenchmarkResult[] }>);
  
  // Log category summaries
  Object.entries(categoryResults).forEach(([category, data]) => {
    const accuracy = (data.correct / data.total) * 100;
    console.log(`${category}: ${accuracy.toFixed(2)}% (${data.correct}/${data.total})`);
    
    // Log incorrect classifications for debugging
    data.items.filter(item => !item.isCorrect).forEach(item => {
      console.log(`  ❌ "${item.item.input.substring(0, 30)}..."`);
      console.log(`     Expected: ${item.item.expected.agentId}, Got: ${item.result.selectedAgentId}`);
      if (item.error) {
        console.log(`     Error: ${item.error.message}`);
      }
    });
  });
  
  console.log('-------------------------------------------\n');
}