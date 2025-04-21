import { BenchmarkService } from '../../services/benchmark.service';
import { BENCHMARK_DATASET, BENCHMARK_AGENTS } from './benchmark-dataset';
import { OpenAIClassifier } from '../../openai-classifier';
import { BedrockClassifier } from '../../bedrock-classifier';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import fs from 'fs';
import path from 'path';

/**
 * Command line runner for benchmarking classifiers
 */
async function runBenchmark() {
  const logger = new ConsoleLogger();
  const benchmarkService = new BenchmarkService({ logger });
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  const flags = {
    classifier: args.find(arg => arg.startsWith('--classifier='))?.split('=')[1] || 'openai',
    categories: args.find(arg => arg.startsWith('--categories='))?.split('=')[1]?.split(',') || undefined,
    output: args.find(arg => arg.startsWith('--output='))?.split('=')[1] || undefined,
    verbose: args.includes('--verbose') || args.includes('-v'),
    help: args.includes('--help') || args.includes('-h')
  };
  
  // Show help and exit if requested
  if (flags.help) {
    console.log('Classifier Benchmark Runner');
    console.log('');
    console.log('Options:');
    console.log('  --classifier=<name>      The classifier to benchmark (openai, bedrock) [default: openai]');
    console.log('  --categories=<list>      Comma-separated list of categories to include [default: all]');
    console.log('  --output=<path>          Write report to the specified file [default: none]');
    console.log('  --verbose, -v            Enable verbose output');
    console.log('  --help, -h               Show this help message');
    console.log('');
    console.log('Example:');
    console.log('  ts-node benchmark-runner.ts --classifier=openai --categories=general,technical --output=report.md');
    process.exit(0);
  }
  
  // Initialize the selected classifier
  logger.info(`Initializing ${flags.classifier} classifier...`);
  
  let classifier;
  
  try {
    if (flags.classifier === 'openai') {
      classifier = new OpenAIClassifier({
        modelName: process.env.OPENAI_MODEL || 'gpt-4o',
        temperature: 0,
        logger
      });
    } else if (flags.classifier === 'bedrock') {
      classifier = new BedrockClassifier({
        modelId: process.env.BEDROCK_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0',
        temperature: 0,
        logger
      });
    } else {
      logger.error(`Unknown classifier type: ${flags.classifier}`);
      process.exit(1);
    }
    
    // Set agents for the classifier
    classifier.setAgents(BENCHMARK_AGENTS as any);
    
    // Run benchmark
    logger.info('Running benchmark...');
    const results = await benchmarkService.runBenchmark(
      classifier,
      BENCHMARK_DATASET,
      BENCHMARK_AGENTS as Record<string, any>,
      {
        verbose: flags.verbose
      }
    );
    
    // Log results
    benchmarkService.logResults(results, flags.verbose);
    
    // Generate and save report if output is specified
    if (flags.output) {
      const report = benchmarkService.generateReport(results);
      const outputPath = path.resolve(flags.output);
      
      // Ensure directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Write report to file
      fs.writeFileSync(outputPath, report);
      logger.info(`Report saved to ${outputPath}`);
    }
    
  } catch (error) {
    logger.error('Benchmark failed', { error });
    process.exit(1);
  }
}

// Run the benchmark if this file is executed directly
if (require.main === module) {
  runBenchmark().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { runBenchmark }; 