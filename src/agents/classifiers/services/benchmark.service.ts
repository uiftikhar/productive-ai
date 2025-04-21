import { ClassifierInterface, ClassifierResult } from '../../interfaces/classifier.interface';
import { BenchmarkItem } from '../tests/benchmark/benchmark-dataset';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * Benchmark result statistics
 */
export interface BenchmarkStats {
  /**
   * Overall statistics
   */
  overall: {
    total: number;
    passed: number;
    failed: number;
    accuracy: number;
  };
  
  /**
   * Statistics by category
   */
  byCategory: Record<string, {
    total: number;
    passed: number;
    failed: number;
    accuracy: number;
  }>;
  
  /**
   * Detailed results for each test case
   */
  details: Array<{
    category: string;
    input: string;
    expected: any;
    actual: ClassifierResult;
    passed: boolean;
  }>;
}

/**
 * Options for running classifier benchmarks
 */
export interface BenchmarkOptions {
  /**
   * Dataset to use for benchmarking
   */
  dataset: BenchmarkItem[];
  
  /**
   * Whether to use verbose logging
   */
  verbose?: boolean;
  
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Categories to include in the benchmark (if not specified, all categories are included)
   */
  includeCategories?: string[];
  
  /**
   * Filter function to determine which benchmark items to include
   */
  filter?: (item: BenchmarkItem) => boolean;
}

/**
 * Service for running benchmarks against classifiers
 */
export class BenchmarkService {
  private logger: Logger;
  
  /**
   * Create a new benchmark service
   */
  constructor(options: { logger?: Logger } = {}) {
    this.logger = options.logger || new ConsoleLogger();
  }
  
  /**
   * Run a benchmark test suite against a classifier
   */
  async runBenchmark(
    classifier: ClassifierInterface,
    options: BenchmarkOptions
  ): Promise<BenchmarkStats> {
    const { dataset, verbose = false } = options;
    const filter = options.filter || (() => true);
    
    // Filter dataset if categories specified
    const filteredDataset = dataset.filter(item => {
      // Apply category filter if specified
      if (options.includeCategories && !options.includeCategories.includes(item.category)) {
        return false;
      }
      
      // Apply custom filter if provided
      return filter(item);
    });
    
    // Initialize results tracking
    const results: BenchmarkStats = {
      overall: {
        total: 0,
        passed: 0,
        failed: 0,
        accuracy: 0
      },
      byCategory: {},
      details: []
    };
    
    // Initialize category stats
    for (const item of filteredDataset) {
      if (!results.byCategory[item.category]) {
        results.byCategory[item.category] = {
          total: 0,
          passed: 0,
          failed: 0,
          accuracy: 0
        };
      }
    }
    
    if (verbose) {
      this.logger.info(`Running benchmarks on ${filteredDataset.length} test cases`);
    }
    
    // Run benchmark on each item
    for (const benchmarkItem of filteredDataset) {
      try {
        // Set appropriate template type based on category
        if ('setTemplateType' in classifier && typeof classifier.setTemplateType === 'function') {
          if (benchmarkItem.category === 'followup') {
            (classifier as any).setTemplateType('followup');
          } else {
            (classifier as any).setTemplateType('default');
          }
        }
        
        // Perform the classification
        const result = await classifier.classify(
          benchmarkItem.input,
          benchmarkItem.history || []
        );
        
        // Validate the results against expectations
        const passed = this.validateResult(result, benchmarkItem.expected);
        
        // Update overall stats
        results.overall.total++;
        if (passed) {
          results.overall.passed++;
        } else {
          results.overall.failed++;
        }
        
        // Update category stats
        results.byCategory[benchmarkItem.category].total++;
        if (passed) {
          results.byCategory[benchmarkItem.category].passed++;
        } else {
          results.byCategory[benchmarkItem.category].failed++;
        }
        
        // Store details
        results.details.push({
          category: benchmarkItem.category,
          input: benchmarkItem.input,
          expected: benchmarkItem.expected,
          actual: result,
          passed
        });
        
        if (verbose) {
          this.logger.info(
            `[${passed ? 'PASS' : 'FAIL'}] ${benchmarkItem.category}: "${benchmarkItem.input.slice(0, 40)}${benchmarkItem.input.length > 40 ? '...' : ''}"`
          );
        }
      } catch (error) {
        // Handle errors in benchmark processing
        results.overall.total++;
        results.overall.failed++;
        results.byCategory[benchmarkItem.category].total++;
        results.byCategory[benchmarkItem.category].failed++;
        
        results.details.push({
          category: benchmarkItem.category,
          input: benchmarkItem.input,
          expected: benchmarkItem.expected,
          actual: {
            selectedAgentId: null,
            confidence: 0,
            reasoning: `Error: ${error instanceof Error ? error.message : String(error)}`,
            isFollowUp: false,
            entities: [],
            intent: ''
          },
          passed: false
        });
        
        this.logger.error(`Benchmark error for ${benchmarkItem.category}: "${benchmarkItem.input}"`, { error });
      }
    }
    
    // Calculate accuracy percentages
    results.overall.accuracy = results.overall.total > 0 
      ? (results.overall.passed / results.overall.total) 
      : 0;
    
    // Calculate category accuracy
    for (const category in results.byCategory) {
      const categoryStats = results.byCategory[category];
      categoryStats.accuracy = categoryStats.total > 0 
        ? (categoryStats.passed / categoryStats.total) 
        : 0;
    }
    
    return results;
  }
  
  /**
   * Generate a formatted report from benchmark results
   */
  generateReport(results: BenchmarkStats): string {
    const report = [];
    
    // Overall summary
    report.push('# Classifier Benchmark Report');
    report.push('');
    report.push('## Overall Results');
    report.push('');
    report.push(`- Total test cases: ${results.overall.total}`);
    report.push(`- Passed: ${results.overall.passed}`);
    report.push(`- Failed: ${results.overall.failed}`);
    report.push(`- Accuracy: ${(results.overall.accuracy * 100).toFixed(2)}%`);
    report.push('');
    
    // Category breakdown
    report.push('## Results by Category');
    report.push('');
    report.push('| Category | Total | Passed | Failed | Accuracy |');
    report.push('|----------|-------|--------|--------|----------|');
    
    for (const category in results.byCategory) {
      const stats = results.byCategory[category];
      report.push(
        `| ${category} | ${stats.total} | ${stats.passed} | ${stats.failed} | ${(stats.accuracy * 100).toFixed(2)}% |`
      );
    }
    
    report.push('');
    
    // Failed test cases
    const failedTests = results.details.filter(detail => !detail.passed);
    if (failedTests.length > 0) {
      report.push('## Failed Test Cases');
      report.push('');
      
      for (const test of failedTests) {
        report.push(`### ${test.category}: "${test.input}"`);
        report.push('');
        report.push('**Expected:**');
        report.push('```');
        report.push(JSON.stringify(test.expected, null, 2));
        report.push('```');
        report.push('');
        report.push('**Actual:**');
        report.push('```');
        report.push(JSON.stringify(test.actual, null, 2));
        report.push('```');
        report.push('');
      }
    }
    
    return report.join('\n');
  }
  
  /**
   * Log benchmark results to the console
   */
  logResults(results: BenchmarkStats, verbose = false): void {
    // Log summary
    this.logger.info('\n\nBenchmark Results:');
    this.logger.info(`Total: ${results.overall.total}`);
    this.logger.info(`Passed: ${results.overall.passed}`);
    this.logger.info(`Failed: ${results.overall.failed}`);
    this.logger.info(`Accuracy: ${(results.overall.accuracy * 100).toFixed(2)}%`);
    
    // Log category breakdown
    this.logger.info('\nResults by Category:');
    for (const category in results.byCategory) {
      const stats = results.byCategory[category];
      this.logger.info(
        `${category}: ${stats.passed}/${stats.total} (${(stats.accuracy * 100).toFixed(2)}%)`
      );
    }
    
    // Log failed test cases
    const failedTests = results.details.filter(detail => !detail.passed);
    if (failedTests.length > 0 && verbose) {
      this.logger.info('\nFailed Test Cases:');
      failedTests.forEach(detail => {
        this.logger.info(`- Category: ${detail.category}, Input: "${detail.input}"`);
        this.logger.info(`  Expected: ${JSON.stringify(detail.expected)}`);
        this.logger.info(`  Got: ${JSON.stringify(detail.actual)}`);
        this.logger.info('');
      });
    }
  }
  
  /**
   * Helper to validate results against expectations
   */
  private validateResult(actual: ClassifierResult, expected: any): boolean {
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
} 