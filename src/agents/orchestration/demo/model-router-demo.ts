/**
 * Model Router Integration Demo
 * 
 * This example demonstrates the integrated model router system with:
 * - Adaptive model selection
 * - Context window optimization
 * - Template-based prompt management
 */

import { ModelRouterService } from '../model-router.service.ts';
import { ModelSelectionService } from '../model-selection.service.ts';
import { ContextWindowOptimizer } from '../context-window-optimizer.service.ts';
import { RagPromptManager } from '../../../shared/services/rag-prompt-manager.service.ts';
import { ConsoleLogger } from '../../../shared/logger/console-logger.ts';

// Sample context items for the demo
const sampleContextItems = [
  {
    content: "The AI system needs to process customer service conversations to identify common issues and generate summaries.",
    source: "requirement-doc",
    metadata: {
      timestamp: Date.now() - 86400000 * 5, // 5 days ago
      sourceType: "document",
      importance: 0.8
    }
  },
  {
    content: "We need to implement a context-aware system that can handle complex customer inquiries while maintaining a consistent tone.",
    source: "meeting-notes",
    metadata: {
      timestamp: Date.now() - 86400000 * 2, // 2 days ago
      sourceType: "meeting",
      importance: 0.9
    }
  },
  {
    content: "The system should be able to handle at least 1000 requests per hour with response times under 2 seconds.",
    source: "performance-spec",
    metadata: {
      timestamp: Date.now() - 86400000 * 10, // 10 days ago
      sourceType: "document",
      importance: 0.7
    }
  },
  {
    content: "Recent user testing showed that users prefer concise answers that directly address their question without unnecessary details.",
    source: "user-research",
    metadata: {
      timestamp: Date.now() - 86400000 * 1, // 1 day ago
      sourceType: "feedback",
      importance: 0.95
    }
  },
  {
    content: "The current implementation uses GPT-3.5-Turbo but struggles with complex reasoning tasks that have multiple steps.",
    source: "technical-analysis",
    metadata: {
      timestamp: Date.now() - 86400000 * 3, // 3 days ago
      sourceType: "document",
      importance: 0.85
    }
  }
];

// Sample user queries representing different complexity levels
const sampleQueries = [
  {
    text: "How can I reset my password?",
    complexity: "simple"
  },
  {
    text: "Can you explain how the recommendation algorithm works?",
    complexity: "medium"
  },
  {
    text: "I need a detailed analysis of our customer service performance over the last quarter, including trends and recommendations for improvement.",
    complexity: "complex"
  },
  {
    text: "Write a Python function to analyze sentiment in customer reviews and visualize the results using matplotlib.",
    complexity: "code"
  }
];

/**
 * Demonstrate the complete model router integration
 */
async function runModelRouterDemo() {
  const logger = new ConsoleLogger();
  logger.info("Starting Model Router Integration Demo");
  
  // Initialize services
  const modelRouter = ModelRouterService.getInstance({ logger });
  const modelSelector = new ModelSelectionService({ logger, modelRouter });
  const contextOptimizer = new ContextWindowOptimizer({ logger });
  const promptManager = new RagPromptManager();
  
  // Register custom model configurations
  modelRouter.initialize([
    {
      modelName: 'gpt-4-turbo',
      provider: 'openai',
      contextWindow: 128000,
      streaming: true,
      temperature: 0.7,
      costPerToken: 0.00001,
      costPerInputToken: 0.00001,
      costPerOutputToken: 0.00003,
      capabilities: ['code', 'reasoning', 'creative', 'analysis'],
      maxOutputTokens: 4096,
    },
    {
      modelName: 'gpt-3.5-turbo',
      provider: 'openai',
      contextWindow: 16000,
      streaming: true,
      temperature: 0.7,
      costPerToken: 0.000002,
      costPerInputToken: 0.000002,
      costPerOutputToken: 0.000002,
      capabilities: ['summarization', 'classification', 'extraction'],
      maxOutputTokens: 4096,
    },
    {
      modelName: 'claude-2',
      provider: 'anthropic',
      contextWindow: 100000,
      streaming: true,
      temperature: 0.5,
      costPerToken: 0.000008,
      costPerInputToken: 0.000008,
      costPerOutputToken: 0.000024,
      capabilities: ['reasoning', 'creative', 'analysis', 'code'],
      maxOutputTokens: 4096,
    },
    {
      modelName: 'llama-2-70b',
      provider: 'local',
      contextWindow: 4096,
      streaming: true,
      temperature: 0.8,
      costPerToken: 0.0000001,
      capabilities: ['creative', 'summarization'],
      maxOutputTokens: 2048,
    }
  ]);
  
  // Process each query through the integrated system
  for (const query of sampleQueries) {
    logger.info(`\n\n=== Processing query: ${query.text} ===\n`);
    
    // 1. Analyze the query and select an appropriate model
    const modelRecommendations = modelSelector.getModelRecommendations(query.text, {
      includeCostEstimates: true,
      includeReasoning: true
    });
    
    const selectedModel = modelRecommendations[0].model;
    logger.info(`Selected model: ${selectedModel.modelName}`, {
      reasoning: modelRecommendations[0].reasoning,
      estimatedCost: modelRecommendations[0].estimatedCost
    });
    
    // 2. Optimize context based on model constraints
    const contextOptimizationResult = await contextOptimizer.optimizeContext(
      query.text,
      sampleContextItems,
      selectedModel.contextWindow * 0.8, // Use 80% of available context window
      {
        strategy: 'balanced',
        chunkLongItems: true
      }
    );
    
    logger.info("Context optimization results", {
      selectedItems: contextOptimizationResult.selectedItems.length,
      totalTokens: contextOptimizationResult.totalTokens,
      tokenLimit: contextOptimizationResult.tokenLimit
    });
    
    // 3. Select the appropriate prompt template
    const recommendedTemplates = promptManager.getTemplateRecommendations(query.text);
    const selectedTemplate = recommendedTemplates[0];
    
    logger.info(`Selected prompt template: ${selectedTemplate.id}`, {
      description: selectedTemplate.description,
      components: selectedTemplate.components
    });
    
    // 4. Estimate the total cost
    const costEstimate = modelSelector.estimateModelCost(
      selectedModel,
      contextOptimizationResult.totalTokens
    );
    
    logger.info("Estimated execution cost", {
      cost: costEstimate.cost,
      tokenLimit: costEstimate.tokenLimit
    });
    
    // 5. In a real implementation, this would now execute the query
    logger.info(`Ready to execute query with ${selectedModel.modelName} using template '${selectedTemplate.id}'`);
    
    // Simulate execution outcome for feedback loop
    const success = Math.random() > 0.2; // 80% success rate for the demo
    
    // 6. Record task outcome for adaptive learning
    modelSelector.recordTaskOutcome(query.text, selectedModel.modelName, {
      success,
      executionTimeMs: 1200 + Math.random() * 1000,
      tokensUsed: contextOptimizationResult.totalTokens,
      cost: costEstimate.cost,
      feedback: success ? "Satisfactory response" : "Response did not fully address the query"
    });
  }
  
  logger.info("\nModel Router Integration Demo completed");
}

// Run the demo when this file is executed directly
if (require.main === module) {
  runModelRouterDemo().catch(error => {
    console.error("Error in demo:", error);
  });
}

export { runModelRouterDemo }; 