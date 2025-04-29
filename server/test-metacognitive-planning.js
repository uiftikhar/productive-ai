/**
 * Test Metacognitive Planning System
 *
 * This script demonstrates the self-prompted planning and learning mechanism components
 * of the metacognitive framework.
 */

const { ChatOpenAI } = require('@langchain/openai');
const { ConsoleLogger } = require('./dist/shared/logger/console-logger');
const {
  MetacognitiveAgentImplementation,
} = require('./dist/agents/base/metacognitive-agent-implementation');
const {
  ConfidenceLevel,
  ReflectionPointType,
} = require('./dist/agents/interfaces/metacognition.interface');
const {
  ExecutionMemoryService,
} = require('./dist/agents/services/execution-memory.service');
const {
  SelfPlanningService,
} = require('./dist/agents/services/self-planning.service');
const {
  StrategyAdjustmentService,
} = require('./dist/agents/services/strategy-adjustment.service');

// Create a logger instance
const logger = new ConsoleLogger();
logger.info('Starting Metacognitive Planning Test...');

// Create a simple LLM instance
const llm = new ChatOpenAI({
  temperature: 0.2,
});

async function runDemo() {
  // Initialize services
  logger.info('Initializing services...');

  const memoryService = ExecutionMemoryService.getInstance({
    logger,
    learningEnabled: true,
  });

  const strategyService = StrategyAdjustmentService.getInstance({
    logger,
    experienceRepository: memoryService.getRepository(),
  });

  const planningService = SelfPlanningService.getInstance({
    logger,
    llm,
    strategyService,
    executionMemoryService: memoryService,
  });

  // Register some strategies
  const textSummaryStrategy = strategyService.createStrategy(
    'text-summarization',
    'Comprehensive Summary Strategy',
    'Create a detailed summary capturing all key points',
    [
      'Read and analyze the full text',
      'Identify main topics and themes',
      'Extract key points and supporting details',
      'Organize information logically',
      'Generate comprehensive summary',
      'Review for accuracy and completeness',
    ],
    {
      applicabilityScore: 0.9,
      estimatedEffort: 7,
      estimatedSuccess: 0.8,
    },
  );

  const quickSummaryStrategy = strategyService.createStrategy(
    'text-summarization',
    'Quick Summary Strategy',
    'Create a brief summary of the main points',
    [
      'Scan text for major points',
      'Identify topic sentences',
      'Combine key points into concise summary',
      'Review for clarity',
    ],
    {
      applicabilityScore: 0.7,
      estimatedEffort: 3,
      estimatedSuccess: 0.7,
    },
  );

  // Create a metacognitive agent
  logger.info('Creating metacognitive agent...');
  const agent = new MetacognitiveAgentImplementation(
    'Metacognitive Summarization Agent',
    'An agent that can summarize text with self-reflection capabilities',
    {
      logger,
      llm,
      reflectionConfig: {
        reflectionPoints: [
          ReflectionPointType.PRE_EXECUTION,
          ReflectionPointType.POST_EXECUTION,
        ],
        progressCheckpoints: [0.25, 0.5, 0.75],
        timeCheckpoints: {
          relative: [0.5],
        },
        confidenceThresholds: {
          low: 0.4,
          high: 0.8,
        },
        adaptationThreshold: 0.6,
        maxConsecutiveReflections: 3,
        reflectionDepth: 'normal',
      },
    },
  );

  // Register text summarization capability
  agent.registerCapability({
    name: 'text-summarization',
    description: 'Summarize text content',
  });

  // Define test tasks
  const tasks = [
    {
      description: 'Summarize a short paragraph',
      input:
        'The metacognitive framework enhances AI agents with self-reflection capabilities. It includes modules for confidence assessment, performance monitoring, and strategy adjustment. This framework helps agents adapt to different tasks dynamically.',
      capability: 'text-summarization',
    },
    {
      description: 'Summarize a medium-length text',
      input: `Artificial intelligence has rapidly evolved over the past decade. Deep learning breakthroughs have enabled systems to recognize images, understand natural language, and even generate creative content. However, these systems often lack self-awareness and the ability to recognize their own limitations. Metacognitive AI addresses this gap by implementing self-reflection, confidence assessment, and strategy adjustment mechanisms. This allows the AI to monitor its own performance, detect when it might be failing, and adapt its approach accordingly. Such systems show promise for more reliable and transparent AI applications, especially in high-stakes domains where errors can have significant consequences.`,
      capability: 'text-summarization',
    },
    {
      description: 'Summarize complex content',
      input: `The implementation of metacognitive frameworks in artificial intelligence represents a significant advancement in creating more autonomous and self-regulating systems. Unlike traditional AI approaches that execute predefined algorithms without awareness of their own processing, metacognitive AI incorporates self-monitoring, self-evaluation, and self-regulation mechanisms that mirror human metacognitive processes.

These systems typically include several key components: confidence assessment modules that evaluate the system's certainty in its outputs; performance monitoring systems that track execution metrics and detect anomalies; strategy adjustment mechanisms that modify approaches based on feedback; and execution memory that learns from past experiences to improve future performance.

When implemented effectively, these components work together to create agents capable of recognizing when they're likely to make errors, adapting their strategies to different task requirements, and continuously improving their performance through experience. For instance, a metacognitive language model might recognize when a query falls outside its knowledge domain and either abstain from answering or seek additional information, rather than confidently providing incorrect information.

The advantages of metacognitive AI include increased reliability in uncertain situations, better transparency in decision-making processes, and reduced need for human intervention. However, implementing these systems presents challenges, including the computational overhead of self-monitoring, the difficulty of designing effective metacognitive strategies, and ensuring that self-assessments accurately reflect actual performance.

Despite these challenges, metacognitive frameworks represent a promising direction for AI research, potentially addressing some of the limitations of current systems while bringing artificial intelligence closer to the kind of flexible, self-aware cognition characteristic of human intelligence.`,
      capability: 'text-summarization',
    },
  ];

  // Run the tasks
  for (const [index, task] of tasks.entries()) {
    logger.info(`\n=== Task ${index + 1}: ${task.description} ===`);

    // First, get a pre-execution plan
    logger.info('Generating pre-execution plan...');
    const plan = await planningService.createExecutionPlan({
      taskId: `task-${index + 1}`,
      taskDescription: task.description,
      capability: task.capability,
      input: task.input,
    });

    logger.info(`Planning result:`);
    logger.info(
      `- Complexity: ${plan.requirementAnalysis.complexityEstimate}/10`,
    );
    logger.info(
      `- Resource estimate: ${Math.round(plan.resourceEstimate.estimatedTimeMs / 1000)}s, ${plan.resourceEstimate.estimatedTokens} tokens`,
    );
    logger.info(`- Selected strategy: ${plan.selectedStrategy.name}`);
    logger.info(
      `- Bottlenecks: ${plan.potentialBottlenecks.map((b) => b.description).join('; ') || 'None'}`,
    );
    logger.info(`- Should proceed: ${plan.shouldProceed}`);

    // Execute the task
    logger.info('Executing task...');
    const startTime = Date.now();

    const response = await agent.execute({
      capability: task.capability,
      input: task.input,
      context: {
        taskId: `task-${index + 1}`,
        metadata: {
          description: task.description,
        },
      },
    });

    const executionTime = Date.now() - startTime;

    logger.info(`Execution completed in ${Math.round(executionTime / 1000)}s`);
    logger.info(`Output: ${response.output}`);

    // Get updated repository stats
    const repository = memoryService.getRepository();
    logger.info(
      `Experience repository now contains ${repository.executionRecords.length} execution records and ${repository.patterns.length} patterns`,
    );

    if (repository.patterns.length > 0) {
      logger.info('Learned patterns:');
      repository.patterns.forEach((pattern) => {
        logger.info(
          `- ${pattern.name}: ${pattern.description} (confidence: ${pattern.confidence.toFixed(2)})`,
        );
      });
    }

    // Wait a bit before next task
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Run one more task but use the learned patterns
  logger.info('\n=== Task 4: Using learned patterns ===');
  const newTask = {
    description: 'Summarize another paragraph',
    input:
      'Machine learning models have become increasingly sophisticated. Modern architectures like transformers have enabled breakthroughs in natural language processing and computer vision. However, these models require large amounts of data and computational resources. Researchers are working on more efficient approaches.',
    capability: 'text-summarization',
  };

  // Find similar executions
  logger.info('Finding similar past executions...');
  const similarResults = await memoryService.findSimilarExecutions({
    capability: newTask.capability,
    taskDescription: newTask.description,
    filters: {
      onlySuccessful: true,
    },
  });

  logger.info(
    `Found ${similarResults.matchingExecutions.length} similar executions`,
  );
  if (similarResults.recommendedStrategies.length > 0) {
    logger.info(
      `Recommended strategy: ${similarResults.recommendedStrategies[0].strategy.name} (confidence: ${similarResults.recommendedStrategies[0].confidence.toFixed(2)})`,
    );
    logger.info(
      `Reasoning: ${similarResults.recommendedStrategies[0].reasoning}`,
    );
  }

  // Execute the task
  logger.info('Executing task with learned knowledge...');
  const startTime = Date.now();

  const response = await agent.execute({
    capability: newTask.capability,
    input: newTask.input,
    context: {
      taskId: 'task-4',
      metadata: {
        description: newTask.description,
      },
    },
  });

  const executionTime = Date.now() - startTime;

  logger.info(`Execution completed in ${Math.round(executionTime / 1000)}s`);
  logger.info(`Output: ${response.output}`);

  logger.info('\nTest completed successfully!');
}

// Run the demo
runDemo().catch((error) => {
  console.error('Error in demo:', error);
});
