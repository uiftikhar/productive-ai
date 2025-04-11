import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { RagPromptManager } from '../../shared/services/rag-prompt-manager.service.ts';
import { EmbeddingService } from '../../shared/embedding/embedding.service.ts';
import { ChatOpenAI } from '@langchain/openai';
import { BaseLLMParams } from '@langchain/core/language_models/llms';
import { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

/**
 * Model configuration interface
 */
export interface ModelConfig {
  modelName: string;
  provider: 'openai' | 'anthropic' | 'azure' | 'local';
  contextWindow: number;
  streaming: boolean;
  temperature: number;
  costPerToken: number;
  capabilities: string[];
  maxOutputTokens?: number;
}

/**
 * Context requirements for model selection
 */
export interface ContextRequirements {
  minTokens: number;
  maxTokens: number;
  importanceWeights: {
    recency: number;
    relevance: number;
    source: number;
  };
}

/**
 * Model selection criteria
 */
export interface ModelSelectionCriteria {
  taskComplexity: 'simple' | 'medium' | 'complex';
  responseTime: 'fast' | 'balanced' | 'thorough';
  costSensitivity: 'low' | 'medium' | 'high';
  streamingRequired: boolean;
  contextSize: number;
  requiresSpecialCapabilities?: string[];
}

/**
 * Streaming handler for real-time responses
 */
export interface StreamingHandler {
  handleNewToken: (token: string) => void;
  handleError: (error: Error) => void;
  handleComplete: (fullResponse: string) => void;
}

/**
 * Model Router Service
 * Handles model selection, context window management, and streaming support
 */
export class ModelRouterService {
  private logger: Logger;
  private ragPromptManager: RagPromptManager;
  private embeddingService: EmbeddingService;
  private modelConfigs: ModelConfig[];
  private llmInstances: Map<string, any> = new Map();
  
  private static instance: ModelRouterService;
  
  /**
   * Get singleton instance
   */
  public static getInstance(options: {
    logger?: Logger;
    ragPromptManager?: RagPromptManager;
    embeddingService?: EmbeddingService;
  } = {}): ModelRouterService {
    if (!ModelRouterService.instance) {
      ModelRouterService.instance = new ModelRouterService(options);
    }
    return ModelRouterService.instance;
  }

  /**
   * Private constructor for singleton pattern
   */
  private constructor(options: {
    logger?: Logger;
    ragPromptManager?: RagPromptManager;
    embeddingService?: EmbeddingService;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.ragPromptManager = options.ragPromptManager || new RagPromptManager();
    this.embeddingService = options.embeddingService || new EmbeddingService();
    
    // Initialize default model configurations
    this.modelConfigs = [
      {
        modelName: 'gpt-4-turbo',
        provider: 'openai',
        contextWindow: 128000,
        streaming: true,
        temperature: 0.7,
        costPerToken: 0.00001,
        capabilities: ['code', 'reasoning', 'creative', 'analysis'],
        maxOutputTokens: 4096
      },
      {
        modelName: 'gpt-3.5-turbo',
        provider: 'openai',
        contextWindow: 16000,
        streaming: true,
        temperature: 0.7,
        costPerToken: 0.000002,
        capabilities: ['summarization', 'classification', 'extraction'],
        maxOutputTokens: 4096
      }
    ];
  }

  /**
   * Initialize the model router with custom configurations
   */
  public initialize(customConfigs?: ModelConfig[]): void {
    if (customConfigs) {
      this.modelConfigs = customConfigs;
    }
    
    this.logger.info('Model Router Service initialized');
  }

  /**
   * Select the best model based on the provided criteria
   */
  public selectModel(criteria: ModelSelectionCriteria): ModelConfig {
    this.logger.info('Selecting model based on criteria', { criteria });
    
    // Filter models that meet basic requirements
    let eligibleModels = this.modelConfigs.filter(model => {
      // Check streaming capability if required
      if (criteria.streamingRequired && !model.streaming) {
        return false;
      }
      
      // Check context window size
      if (model.contextWindow < criteria.contextSize) {
        return false;
      }
      
      // Check for special capabilities
      if (criteria.requiresSpecialCapabilities && criteria.requiresSpecialCapabilities.length > 0) {
        const hasAllCapabilities = criteria.requiresSpecialCapabilities.every(
          cap => model.capabilities.includes(cap)
        );
        if (!hasAllCapabilities) {
          return false;
        }
      }
      
      return true;
    });
    
    if (eligibleModels.length === 0) {
      this.logger.warn('No models match all criteria, relaxing constraints');
      // Fall back to models that at least have sufficient context window
      eligibleModels = this.modelConfigs.filter(model => model.contextWindow >= criteria.contextSize);
      
      if (eligibleModels.length === 0) {
        // Last resort: just use the model with the largest context window
        eligibleModels = [this.modelConfigs.reduce(
          (max, current) => current.contextWindow > max.contextWindow ? current : max,
          this.modelConfigs[0]
        )];
      }
    }
    
    // Score the eligible models based on criteria
    const scoredModels = eligibleModels.map(model => {
      let score = 0;
      
      // Score based on task complexity
      if (criteria.taskComplexity === 'complex') {
        // Prefer more capable models for complex tasks
        score += model.contextWindow / 10000; // Higher context models get higher scores
      } else if (criteria.taskComplexity === 'simple') {
        // Prefer cheaper models for simple tasks
        score += (1 / model.costPerToken) * 0.1;
      }
      
      // Score based on response time preference
      if (criteria.responseTime === 'fast') {
        // Smaller models tend to be faster
        score += (1 / model.contextWindow) * 10000;
      } else if (criteria.responseTime === 'thorough') {
        // Larger context window for thorough responses
        score += model.contextWindow / 20000;
      }
      
      // Score based on cost sensitivity
      if (criteria.costSensitivity === 'high') {
        // Heavily weight cost for cost-sensitive operations
        score += (1 / model.costPerToken) * 0.5;
      } else if (criteria.costSensitivity === 'low') {
        // Cost is less important for low sensitivity
        score += (1 / model.costPerToken) * 0.1;
      }
      
      return { model, score };
    });
    
    // Select the highest scoring model
    const selectedModel = scoredModels.sort((a, b) => b.score - a.score)[0].model;
    
    this.logger.info('Selected model', { 
      modelName: selectedModel.modelName,
      provider: selectedModel.provider
    });
    
    return selectedModel;
  }

  /**
   * Manage context window for optimal prompt construction
   */
  public async manageContextWindow(
    query: string,
    availableContext: any[],
    contextSize: number,
    requirements?: ContextRequirements
  ): Promise<any[]> {
    // Default requirements if not provided
    const contextReq = requirements || {
      minTokens: 1000,
      maxTokens: Math.min(contextSize - 1000, 6000), // Leave room for the query and response
      importanceWeights: { recency: 0.3, relevance: 0.6, source: 0.1 }
    };
    
    // If we have more context than we can fit, we need to select the most relevant
    if (availableContext.length > 0) {
      // Create embedding for the query if we need to score by relevance
      let queryEmbedding: number[] | undefined;
      if (contextReq.importanceWeights.relevance > 0) {
        const embeddingResult = await this.embeddingService.createEmbeddings([query]);
        queryEmbedding = embeddingResult.embeddings[0];
      }
      
      // Score each context item
      const scoredContext = await Promise.all(availableContext.map(async (item) => {
        let score = 0;
        
        // Score by recency if timestamp is available
        if (contextReq.importanceWeights.recency > 0 && item.metadata?.timestamp) {
          const ageInHours = (Date.now() - new Date(item.metadata.timestamp).getTime()) / (1000 * 60 * 60);
          const recencyScore = Math.max(0, 1 - (ageInHours / 24)); // Higher score for more recent items
          score += recencyScore * contextReq.importanceWeights.recency;
        }
        
        // Score by relevance if we have embeddings
        if (contextReq.importanceWeights.relevance > 0 && queryEmbedding && item.embedding) {
          const relevanceScore = this.calculateCosineSimilarity(queryEmbedding, item.embedding);
          score += relevanceScore * contextReq.importanceWeights.relevance;
        }
        
        // Score by source importance if configured
        if (contextReq.importanceWeights.source > 0 && item.metadata?.source) {
          // This would be based on source prioritization logic
          // For example, official docs might be scored higher than forum posts
          const sourceScore = this.getSourceScore(item.metadata.source);
          score += sourceScore * contextReq.importanceWeights.source;
        }
        
        return { item, score };
      }));
      
      // Sort by score and select top items that fit within the token budget
      const sortedContext = scoredContext.sort((a, b) => b.score - a.score);
      
      let selectedContext = [];
      let totalTokens = 0;
      
      for (const { item } of sortedContext) {
        const itemTokens = item.metadata?.tokenCount || this.estimateTokenCount(item.content || '');
        
        if (totalTokens + itemTokens <= contextReq.maxTokens) {
          selectedContext.push(item);
          totalTokens += itemTokens;
        }
        
        if (totalTokens >= contextReq.minTokens) {
          break;
        }
      }
      
      return selectedContext;
    }
    
    return availableContext;
  }

  /**
   * Get or create an LLM instance for the specified model
   */
  private getLLMInstance(modelConfig: ModelConfig): any {
    const cacheKey = `${modelConfig.provider}-${modelConfig.modelName}-${modelConfig.streaming}`;
    
    if (!this.llmInstances.has(cacheKey)) {
      // Create model instance based on provider
      let model;
      
      switch (modelConfig.provider) {
        case 'openai':
          model = new ChatOpenAI({
            modelName: modelConfig.modelName,
            temperature: modelConfig.temperature,
            streaming: modelConfig.streaming,
            maxTokens: modelConfig.maxOutputTokens
          });
          break;
          
        // Add other providers as needed
        default:
          throw new Error(`Unsupported provider: ${modelConfig.provider}`);
      }
      
      this.llmInstances.set(cacheKey, model);
    }
    
    return this.llmInstances.get(cacheKey);
  }

  /**
   * Process a request with the selected model and streaming support
   */
  public async processRequest(
    messages: BaseMessage[],
    modelCriteria: ModelSelectionCriteria,
    streamingHandler?: StreamingHandler
  ): Promise<string> {
    // Select the appropriate model
    const selectedModel = this.selectModel(modelCriteria);
    
    // Get or create LLM instance
    const llm = this.getLLMInstance(selectedModel);
    
    try {
      let response;
      
      if (selectedModel.streaming && streamingHandler) {
        // Handle streaming mode
        const stream = await llm.stream(messages);
        let fullResponse = '';
        
        for await (const chunk of stream) {
          const content = chunk.content;
          if (content) {
            fullResponse += content;
            streamingHandler.handleNewToken(content);
          }
        }
        
        streamingHandler.handleComplete(fullResponse);
        response = fullResponse;
      } else {
        // Handle regular mode
        const result = await llm.invoke(messages);
        response = result.content;
      }
      
      return response;
    } catch (error) {
      this.logger.error('Error processing request with model', {
        model: selectedModel.modelName,
        error: error instanceof Error ? error.message : String(error)
      });
      
      if (streamingHandler) {
        streamingHandler.handleError(error instanceof Error ? error : new Error(String(error)));
      }
      
      throw error;
    }
  }

  /**
   * Utility function to calculate cosine similarity between two embeddings
   */
  private calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Utility function to get a score for a source based on prioritization
   */
  private getSourceScore(source: string): number {
    // Example prioritization logic - would be expanded based on your specific sources
    const sourcePriorities: Record<string, number> = {
      'official_documentation': 1.0,
      'knowledge_base': 0.9,
      'internal_memo': 0.8,
      'meeting_notes': 0.7,
      'email': 0.6,
      'chat_history': 0.5,
      'external_website': 0.4
    };
    
    // Default score for unknown sources
    return sourcePriorities[source.toLowerCase()] || 0.3;
  }

  /**
   * Estimate token count for a text string
   * This is a simple approximation, consider using a proper tokenizer
   */
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.split(/\s+/).length * 1.3);
  }
} 