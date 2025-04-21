import { OpenAIClassifier } from '../../openai-classifier';
import { BedrockClassifier } from '../../bedrock-classifier';
import { BENCHMARK_DATASET, BENCHMARK_AGENTS } from './benchmark-dataset';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';

/**
 * Run a benchmark on the specified classifier
 */
async function runBenchmark(classifierType: 'openai' | 'bedrock') {
  // Create the classifier
  const logger = new ConsoleLogger();
  let classifier;
  
  if (classifierType === 'openai') {
    classifier = new OpenAIClassifier({
      logger,
      temperature: 0.1,
      modelName: 'gpt-4o' // Use appropriate model
    });
  } else {
    classifier = new BedrockClassifier({
      logger,
      temperature: 0.1,
      // Use appropriate model
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0'
    });
  }
  
  // Initialize the classifier
  await classifier.initialize();
  
  // Set up the mock agents
  const mockAgents = Object.values(BENCHMARK_AGENTS).reduce((acc, agent) => {
    acc[agent.id] = {
      id: agent.id,
      name: agent.name,
      description: agent.description
    };
    return acc;
  }, {} as Record<string, any>);
  
  classifier.setAgents(mockAgents);
  
  // Run tests for each benchmark item
  const results = [];
  let correct = 0;
  
  console.log(`\n===== Starting ${classifierType.toUpperCase()} Classifier Benchmark =====\n`);
  
  for (const item of BENCHMARK_DATASET) {
    try {
      // Create conversation history in the expected format
      const conversationHistory = item.history?.map(h => ({
        role: h.role,
        content: h.content,
        agentId: h.agentId,
        timestamp: Date.now().toString()
      })) || [];
      
      // Run the classification
      console.log(`Testing: "${item.input.substring(0, 40)}${item.input.length > 40 ? '...' : ''}"`);
      const result = await classifier.classify(item.input, conversationHistory);
      
      // Check if correct
      const isCorrect = 
        result.selectedAgentId === item.expected.agentId &&
        result.confidence >= item.expected.minConfidence &&
        result.isFollowUp === item.expected.isFollowUp;
      
      if (isCorrect) {
        correct++;
        console.log(`✅ Correct: ${result.selectedAgentId}, confidence: ${result.confidence.toFixed(2)}`);
      } else {
        console.log(`❌ Incorrect: Expected ${item.expected.agentId}, got ${result.selectedAgentId}`);
        console.log(`   Confidence: ${result.confidence.toFixed(2)}, isFollowUp: ${result.isFollowUp}`);
        console.log(`   Reasoning: ${result.reasoning}`);
      }
      
      results.push({
        item,
        result,
        isCorrect
      });
      
    } catch (error) {
      console.log(`❌ Error testing "${item.input.substring(0, 30)}...": ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        item,
        result: null,
        isCorrect: false,
        error
      });
    }
  }
  
  // Calculate accuracy
  const accuracy = (correct / BENCHMARK_DATASET.length) * 100;
  
  console.log(`\n===== ${classifierType.toUpperCase()} Classifier Benchmark Results =====`);
  console.log(`Accuracy: ${accuracy.toFixed(2)}% (${correct}/${BENCHMARK_DATASET.length})\n`);
  
  // Print category breakdown
  const categories = [...new Set(BENCHMARK_DATASET.map(item => item.category))];
  for (const category of categories) {
    const categoryItems = results.filter(r => r.item.category === category);
    const categoryCorrect = categoryItems.filter(r => r.isCorrect).length;
    const categoryAccuracy = (categoryCorrect / categoryItems.length) * 100;
    
    console.log(`${category}: ${categoryAccuracy.toFixed(2)}% (${categoryCorrect}/${categoryItems.length})`);
  }
  
  return { accuracy, results };
}

// Run the benchmark when this file is executed directly
if (require.main === module) {
  const classifierType = process.argv[2] as 'openai' | 'bedrock' || 'openai';
  
  console.log(`Running benchmark for ${classifierType} classifier...`);
  runBenchmark(classifierType)
    .catch(error => {
      console.error('Benchmark failed:', error);
      process.exit(1);
    });
}

export { runBenchmark }; 