import { OpenAIClassifier } from '../../openai-classifier';
import { BedrockClassifier } from '../../bedrock-classifier';
import { BENCHMARK_DATASET, BENCHMARK_AGENTS } from './benchmark-dataset';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { ClassifierResult } from '../../../interfaces/classifier.interface';
import { ConversationMessage } from '../../../types/conversation.types';

interface ComparisonResult {
  input: string;
  expected: {
    agentId: string | null;
    isFollowUp: boolean;
  };
  openai: {
    selectedAgentId: string | null;
    confidence: number;
    isFollowUp: boolean;
    isCorrect: boolean;
  };
  bedrock: {
    selectedAgentId: string | null;
    confidence: number;
    isFollowUp: boolean;
    isCorrect: boolean;
  };
}

/**
 * Compare classifiers side-by-side on the benchmark dataset
 */
async function compareClassifiers() {
  // Create instances of each classifier
  const logger = new ConsoleLogger();

  const openaiClassifier = new OpenAIClassifier({
    logger,
    temperature: 0.1,
    modelName: 'gpt-4o', // Use appropriate model
  });

  const bedrockClassifier = new BedrockClassifier({
    logger,
    temperature: 0.1,
    modelId: 'anthropic.claude-3-sonnet-20240229-v1:0', // Use appropriate model
  });

  // Initialize classifiers
  await openaiClassifier.initialize();
  await bedrockClassifier.initialize();

  // Set up the mock agents for both classifiers
  const mockAgents = Object.values(BENCHMARK_AGENTS).reduce(
    (acc, agent) => {
      acc[agent.id] = {
        id: agent.id,
        name: agent.name,
        description: agent.description,
      };
      return acc;
    },
    {} as Record<string, any>,
  );

  openaiClassifier.setAgents(mockAgents);
  bedrockClassifier.setAgents(mockAgents);

  // Results tracking
  const results: ComparisonResult[] = [];
  let openaiCorrect = 0;
  let bedrockCorrect = 0;

  console.log('\n===== CLASSIFIER COMPARISON BENCHMARK =====\n');

  // Test each benchmark item
  for (const item of BENCHMARK_DATASET) {
    console.log(
      `Testing: "${item.input.substring(0, 40)}${item.input.length > 40 ? '...' : ''}"`,
    );

    try {
      // Prepare conversation history
      const conversationHistory: ConversationMessage[] =
        item.history?.map((h) => ({
          role: h.role,
          content: h.content,
          agentId: h.agentId,
          timestamp: Date.now().toString(),
        })) || [];

      // Run both classifiers
      const openaiResult = await openaiClassifier.classify(
        item.input,
        conversationHistory,
      );
      const bedrockResult = await bedrockClassifier.classify(
        item.input,
        conversationHistory,
      );

      // Calculate correctness
      const openaiIsCorrect =
        openaiResult.selectedAgentId === item.expected.agentId &&
        openaiResult.confidence >= item.expected.minConfidence &&
        openaiResult.isFollowUp === item.expected.isFollowUp;

      const bedrockIsCorrect =
        bedrockResult.selectedAgentId === item.expected.agentId &&
        bedrockResult.confidence >= item.expected.minConfidence &&
        bedrockResult.isFollowUp === item.expected.isFollowUp;

      // Update counts
      if (openaiIsCorrect) openaiCorrect++;
      if (bedrockIsCorrect) bedrockCorrect++;

      // Store the result
      results.push({
        input: item.input,
        expected: {
          agentId: item.expected.agentId,
          isFollowUp: item.expected.isFollowUp,
        },
        openai: {
          selectedAgentId: openaiResult.selectedAgentId,
          confidence: openaiResult.confidence,
          isFollowUp: openaiResult.isFollowUp,
          isCorrect: openaiIsCorrect,
        },
        bedrock: {
          selectedAgentId: bedrockResult.selectedAgentId,
          confidence: bedrockResult.confidence,
          isFollowUp: bedrockResult.isFollowUp,
          isCorrect: bedrockIsCorrect,
        },
      });

      // Print comparison
      console.log(
        `Expected: ${item.expected.agentId || 'null'}, Follow-up: ${item.expected.isFollowUp}`,
      );
      console.log(
        `OpenAI:   ${openaiResult.selectedAgentId || 'null'} (${openaiResult.confidence.toFixed(2)}) ${openaiIsCorrect ? '✅' : '❌'}`,
      );
      console.log(
        `Bedrock:  ${bedrockResult.selectedAgentId || 'null'} (${bedrockResult.confidence.toFixed(2)}) ${bedrockIsCorrect ? '✅' : '❌'}`,
      );
      console.log('');
    } catch (error) {
      console.log(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Calculate accuracy
  const openaiAccuracy = (openaiCorrect / BENCHMARK_DATASET.length) * 100;
  const bedrockAccuracy = (bedrockCorrect / BENCHMARK_DATASET.length) * 100;

  console.log('\n===== CLASSIFIER COMPARISON RESULTS =====');
  console.log(
    `OpenAI:  ${openaiAccuracy.toFixed(2)}% (${openaiCorrect}/${BENCHMARK_DATASET.length})`,
  );
  console.log(
    `Bedrock: ${bedrockAccuracy.toFixed(2)}% (${bedrockCorrect}/${BENCHMARK_DATASET.length})`,
  );
  console.log('');

  // Calculate category breakdown
  const categories = [
    ...new Set(BENCHMARK_DATASET.map((item) => item.category)),
  ];

  console.log('Category Breakdown:');
  for (const category of categories) {
    const categoryItems = BENCHMARK_DATASET.filter(
      (item) => item.category === category,
    );
    const categoryResults = results.filter(
      (r) =>
        BENCHMARK_DATASET.find((item) => item.input === r.input)?.category ===
        category,
    );

    const openaiCategoryCorrect = categoryResults.filter(
      (r) => r.openai.isCorrect,
    ).length;
    const bedrockCategoryCorrect = categoryResults.filter(
      (r) => r.bedrock.isCorrect,
    ).length;

    const openaiCategoryAccuracy =
      (openaiCategoryCorrect / categoryItems.length) * 100;
    const bedrockCategoryAccuracy =
      (bedrockCategoryCorrect / categoryItems.length) * 100;

    console.log(`${category}:`);
    console.log(
      `  OpenAI:  ${openaiCategoryAccuracy.toFixed(2)}% (${openaiCategoryCorrect}/${categoryItems.length})`,
    );
    console.log(
      `  Bedrock: ${bedrockCategoryAccuracy.toFixed(2)}% (${bedrockCategoryCorrect}/${categoryItems.length})`,
    );
  }

  return {
    results,
    openaiAccuracy,
    bedrockAccuracy,
    openaiCorrect,
    bedrockCorrect,
    totalItems: BENCHMARK_DATASET.length,
  };
}

// Run the comparison when this file is executed directly
if (require.main === module) {
  compareClassifiers().catch((error) => {
    console.error('Comparison failed:', error);
    process.exit(1);
  });
}

export { compareClassifiers };
