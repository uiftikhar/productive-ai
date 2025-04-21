import { ClassifierInterface, ClassifierResult } from '../../interfaces/classifier.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { ParticipantRole } from '../../types/conversation.types';

export interface BenchmarkItem {
  category: string;
  input: string;
  history?: Array<{
    role: ParticipantRole;
    content: string;
    agentId?: string;
  }>;
  expected: {
    agentId: string | null;
    minConfidence: number;
    isFollowUp: boolean;
    expectedEntities?: string[];
    expectedIntent?: string;
  };
}

export interface BenchmarkAgent {
  id: string;
  name: string;
  description: string;
}

export interface BenchmarkStats {
  accuracy: number;
  totalTests: number;
  correctClassifications: number;
  results: Array<{
    item: BenchmarkItem;
    result: ClassifierResult;
    isCorrect: boolean;
  }>;
  errors: Array<{
    item: BenchmarkItem;
    error: Error;
  }>;
}

export interface BenchmarkOptions {
  verbose?: boolean;
}

export class BenchmarkService {
  private logger: Logger;
  
  constructor({ logger }: { logger?: Logger } = {}) {
    this.logger = logger || new ConsoleLogger();
  }
  
  async runBenchmark(
    classifier: ClassifierInterface,
    dataset: BenchmarkItem[],
    agents: Record<string, BenchmarkAgent>,
    options: BenchmarkOptions = {}
  ): Promise<BenchmarkStats> {
    const startTime = Date.now();
    const results: BenchmarkStats['results'] = [];
    const errors: BenchmarkStats['errors'] = [];
    let correctClassifications = 0;

    // Set up the classifier with the benchmark agents
    const mockAgents = Object.values(agents).reduce((acc, agent) => {
      acc[agent.id] = {
        id: agent.id,
        name: agent.name,
        description: agent.description
      };
      return acc;
    }, {} as Record<string, any>);
    
    classifier.setAgents(mockAgents);

    if (options.verbose) {
      this.logger.info(`Running benchmark with ${dataset.length} test cases`);
    }

    // Run the benchmark tests
    for (const item of dataset) {
      try {
        // Prepare the input for the classifier
        const messages = [];
        
        // Add history if present
        if (item.history && item.history.length > 0) {
          messages.push(...item.history.map(msg => ({
            role: msg.role,
            content: msg.content
          })));
        }
        
        // Add the current input
        messages.push({
          role: 'user' as ParticipantRole,
          content: item.input
        });

        // Call the classifier
        const result = await classifier.classify(item.input, messages);
        
        // Check if the classification matches the expected result
        const isCorrect = this.validateResult(result, item.expected);
        
        if (isCorrect) {
          correctClassifications++;
        }
        
        results.push({
          item,
          result,
          isCorrect
        });
        
        if (options.verbose) {
          this.logger.info(`Test case: ${item.category} - ${isCorrect ? '✓' : '✗'}`);
          this.logger.info(`  Input: ${item.input.substring(0, 50)}...`);
          this.logger.info(`  Expected: ${item.expected.agentId}, Got: ${result.selectedAgentId}`);
          const reasoning = typeof result.reasoning === 'string' ? result.reasoning.substring(0, 100) : '';
          this.logger.info(`  Reasoning: ${reasoning}...`);
        }
      } catch (error) {
        errors.push({
          item,
          error: error instanceof Error ? error : new Error(String(error))
        });
        
        if (options.verbose) {
          this.logger.error(`Error in test case: ${item.category}`);
          this.logger.error(String(error));
        }
      }
    }

    const endTime = Date.now();
    const accuracy = dataset.length > 0 ? correctClassifications / dataset.length : 0;
    
    if (options.verbose) {
      this.logger.info(`Benchmark completed in ${endTime - startTime}ms`);
      this.logger.info(`Accuracy: ${(accuracy * 100).toFixed(2)}% (${correctClassifications}/${dataset.length})`);
    }

    return {
      accuracy,
      totalTests: dataset.length,
      correctClassifications,
      results,
      errors
    };
  }

  async compareClassifiers(
    classifiers: Array<{ classifier: ClassifierInterface; name: string }>,
    dataset: BenchmarkItem[],
    agents: Record<string, BenchmarkAgent>,
    options: BenchmarkOptions = {}
  ): Promise<Array<BenchmarkStats & { name: string }>> {
    const results: Array<BenchmarkStats & { name: string }> = [];
    
    for (const { classifier, name } of classifiers) {
      if (options.verbose) {
        this.logger.info(`Running benchmark for classifier: ${name}`);
      }
      
      const result = await this.runBenchmark(classifier, dataset, agents, options);
      results.push({ ...result, name });
    }
    
    return results;
  }

  // Validate the results against expected values
  private validateResult(actual: ClassifierResult, expected: BenchmarkItem['expected']): boolean {
    // Check selected agent
    if (actual.selectedAgentId !== expected.agentId) {
      return false;
    }
    
    // Check confidence meets minimum threshold
    if (actual.confidence < expected.minConfidence) {
      return false;
    }
    
    // Check follow-up flag
    if (actual.isFollowUp !== expected.isFollowUp) {
      return false;
    }
    
    // Check entities if expected
    if (expected.expectedEntities && expected.expectedEntities.length > 0) {
      if (!actual.entities || !Array.isArray(actual.entities)) {
        return false;
      }
      
      // Check that each expected entity is present
      for (const entity of expected.expectedEntities) {
        if (!actual.entities.includes(entity)) {
          return false;
        }
      }
    }
    
    // Check intent if expected
    if (expected.expectedIntent && actual.intent !== expected.expectedIntent) {
      return false;
    }
    
    return true;
  }

  /**
   * Log benchmark results to the console
   */
  logResults(results: BenchmarkStats, verbose = false): void {
    // Log summary
    this.logger.info('\n\nBenchmark Results:');
    this.logger.info(`Total: ${results.totalTests}`);
    this.logger.info(`Passed: ${results.correctClassifications}`);
    this.logger.info(`Failed: ${results.totalTests - results.correctClassifications}`);
    this.logger.info(`Accuracy: ${(results.accuracy * 100).toFixed(2)}%`);
    
    // Log category breakdown
    const categoryResults = this.getCategoryResults(results);
    this.logger.info('\nResults by Category:');
    
    for (const category in categoryResults) {
      const stats = categoryResults[category];
      this.logger.info(
        `${category}: ${stats.correct}/${stats.total} (${(stats.accuracy * 100).toFixed(2)}%)`
      );
    }
    
    // Log failed test cases
    const failedTests = results.results.filter(detail => !detail.isCorrect);
    if (failedTests.length > 0 && verbose) {
      this.logger.info('\nFailed Test Cases:');
      failedTests.forEach(detail => {
        this.logger.info(`- Category: ${detail.item.category}, Input: "${detail.item.input}"`);
        this.logger.info(`  Expected: ${detail.item.expected.agentId}`);
        this.logger.info(`  Got: ${detail.result.selectedAgentId}`);
        this.logger.info('');
      });
    }
  }

  /**
   * Generate a formatted report from benchmark results
   */
  generateReport(results: BenchmarkStats): string {
    const categoryResults = this.getCategoryResults(results);
    const report = [];
    
    // Overall summary
    report.push('# Classifier Benchmark Report');
    report.push('');
    report.push('## Overall Results');
    report.push('');
    report.push(`- Total test cases: ${results.totalTests}`);
    report.push(`- Passed: ${results.correctClassifications}`);
    report.push(`- Failed: ${results.totalTests - results.correctClassifications}`);
    report.push(`- Accuracy: ${(results.accuracy * 100).toFixed(2)}%`);
    report.push('');
    
    // Category breakdown
    report.push('## Results by Category');
    report.push('');
    report.push('| Category | Total | Passed | Failed | Accuracy |');
    report.push('|----------|-------|--------|--------|----------|');
    
    for (const category in categoryResults) {
      const stats = categoryResults[category];
      report.push(
        `| ${category} | ${stats.total} | ${stats.correct} | ${stats.total - stats.correct} | ${(stats.accuracy * 100).toFixed(2)}% |`
      );
    }
    
    report.push('');
    
    // Failed test cases
    const failedTests = results.results.filter(detail => !detail.isCorrect);
    if (failedTests.length > 0) {
      report.push('## Failed Test Cases');
      report.push('');
      
      for (const test of failedTests) {
        report.push(`### ${test.item.category}: "${test.item.input}"`);
        report.push('');
        report.push('**Expected:**');
        report.push('```');
        report.push(JSON.stringify(test.item.expected, null, 2));
        report.push('```');
        report.push('');
        report.push('**Actual:**');
        report.push('```');
        report.push(JSON.stringify(test.result, null, 2));
        report.push('```');
        report.push('');
      }
    }
    
    return report.join('\n');
  }

  /**
   * Helper method to get category statistics
   */
  private getCategoryResults(results: BenchmarkStats): Record<string, { total: number; correct: number; accuracy: number }> {
    return results.results.reduce((acc, result) => {
      const category = result.item.category;
      if (!acc[category]) {
        acc[category] = { total: 0, correct: 0, accuracy: 0 };
      }
      
      acc[category].total++;
      if (result.isCorrect) {
        acc[category].correct++;
      }
      
      acc[category].accuracy = acc[category].total > 0 
        ? acc[category].correct / acc[category].total
        : 0;
      
      return acc;
    }, {} as Record<string, { total: number; correct: number; accuracy: number }>);
  }
} 