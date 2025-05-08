/**
 * Memory Filtration System
 * Part of Milestone 2.2: Agent Memory System
 */
import {
  Memory,
  MemoryFiltrationOptions,
  MemoryQueryParams,
  MemoryQueryResults,
  MemoryRepository
} from '../interfaces/memory.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { VectorEmbeddingProvider } from '../interfaces/storage.interface';

/**
 * Configurations for memory filtration
 */
export interface MemoryFilterConfig {
  defaultRecencyWeight?: number;
  defaultImportanceWeight?: number;
  defaultRelevanceWeight?: number;
  defaultContextualWeight?: number;
  defaultMaxTokens?: number;
  defaultMaxMemories?: number;
  decayFactor?: number; // Controls how quickly importance decays with time
  encodingModel?: string; // Model used for token counting
  tokenCountEstimator?: (text: string) => number;
  logger?: Logger;
}

/**
 * Result of filtered memories
 */
export interface FilteredMemoriesResult<T extends Memory = Memory> {
  memories: T[];
  totalScore: number;
  tokens: number;
  strategy: string;
  scores: Map<string, number>;
}

/**
 * Memory Filter System for prioritizing and filtering memories
 */
export class MemoryFilterSystem {
  private config: MemoryFilterConfig;
  private logger: Logger;
  private embeddingProvider?: VectorEmbeddingProvider;

  /**
   * Create a new memory filter system
   */
  constructor(
    config: MemoryFilterConfig = {},
    embeddingProvider?: VectorEmbeddingProvider
  ) {
    this.config = {
      defaultRecencyWeight: 0.3,
      defaultImportanceWeight: 0.3,
      defaultRelevanceWeight: 0.3,
      defaultContextualWeight: 0.1,
      defaultMaxTokens: 4000,
      defaultMaxMemories: 20,
      decayFactor: 0.01, // Lower means slower decay
      ...config
    };
    
    this.logger = config.logger || new ConsoleLogger();
    this.embeddingProvider = embeddingProvider;
  }

  /**
   * Filter memories based on context and options
   */
  async filterMemories<T extends Memory>(
    memories: T[],
    context: string | object,
    options: MemoryFiltrationOptions = {}
  ): Promise<FilteredMemoriesResult<T>> {
    const startTime = Date.now();
    
    // Get context as string
    const contextString = typeof context === 'string' 
      ? context 
      : JSON.stringify(context);
    
    // Get options with defaults
    const recencyWeight = options.recencyWeight ?? this.config.defaultRecencyWeight;
    const importanceWeight = options.importanceWeight ?? this.config.defaultImportanceWeight;
    const relevanceWeight = options.relevanceWeight ?? this.config.defaultRelevanceWeight;
    const contextualWeight = options.contextualWeight ?? this.config.defaultContextualWeight;
    const maxTokens = options.maxTokens ?? this.config.defaultMaxTokens;
    const maxMemories = options.maxMemories ?? this.config.defaultMaxMemories;
    
    // Filter by required/excluded tags
    let filteredMemories = memories;
    
    if (options.requiredTags && options.requiredTags.length > 0) {
      filteredMemories = filteredMemories.filter(memory => 
        memory.metadata.tags && 
        options.requiredTags!.every(tag => memory.metadata.tags!.includes(tag))
      );
    }
    
    if (options.excludedTags && options.excludedTags.length > 0) {
      filteredMemories = filteredMemories.filter(memory => 
        !memory.metadata.tags || 
        !options.excludedTags!.some(tag => memory.metadata.tags!.includes(tag))
      );
    }
    
    // Get context embedding if we have an embedding provider
    let contextEmbedding: number[] | undefined;
    
    if (this.embeddingProvider && relevanceWeight! > 0) {
      try {
        contextEmbedding = await this.embeddingProvider.embedText(contextString);
      } catch (error) {
        this.logger.warn('Error generating context embedding, relevance scoring will be disabled', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // Calculate scores for each memory
    const now = Date.now();
    const scores = new Map<string, number>();
    const scoredMemories: Array<{memory: T; score: number}> = [];
    
    for (const memory of filteredMemories) {
      let score = 0;
      
      // Calculate recency score (newer memories score higher)
      if (recencyWeight! > 0) {
        const ageInMs = now - memory.updatedAt.getTime();
        const ageInDays = ageInMs / (24 * 60 * 60 * 1000);
        const recencyScore = Math.exp(-this.config.decayFactor! * ageInDays);
        score += recencyWeight! * recencyScore;
      }
      
      // Add importance score
      if (importanceWeight! > 0) {
        score += importanceWeight! * memory.metadata.importance;
      }
      
      // Calculate relevance score using embeddings
      if (relevanceWeight! > 0 && contextEmbedding && memory.vectorEmbedding) {
        try {
          const similarity = this.embeddingProvider!.calculateSimilarity(
            contextEmbedding, 
            memory.vectorEmbedding
          );
          score += relevanceWeight! * similarity;
        } catch (error) {
          // Skip relevance scoring if there's an error
          this.logger.debug('Error calculating embedding similarity', {
            memoryId: memory.id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      // Calculate contextual score (text similarity)
      if (contextualWeight! > 0) {
        const contentStr = JSON.stringify(memory.content);
        const contextualScore = this.calculateTextSimilarity(contextString, contentStr);
        score += contextualWeight! * contextualScore;
      }
      
      // Store the score
      scores.set(memory.id, score);
      
      // Add to scored memories
      scoredMemories.push({
        memory,
        score
      });
    }
    
    // Sort by score
    scoredMemories.sort((a, b) => b.score - a.score);
    
    // Take top memories up to maxMemories
    const topMemories = scoredMemories.slice(0, maxMemories);
    
    // Check if total tokens exceeds maxTokens
    const topMemoriesWithTokens = topMemories.map(item => {
      const tokens = this.estimateTokens(item.memory);
      return { ...item, tokens };
    });
    
    // Reduce memories to fit within token budget
    let finalMemories: T[] = [];
    let totalTokens = 0;
    let totalScore = 0;
    
    for (const item of topMemoriesWithTokens) {
      // Skip if this memory would push us over the token limit
      if (totalTokens + item.tokens > maxTokens!) {
        continue;
      }
      
      finalMemories.push(item.memory);
      totalTokens += item.tokens;
      totalScore += item.score;
      
      if (finalMemories.length >= maxMemories!) {
        break;
      }
    }
    
    // Log the result
    this.logger.debug(`Filtered ${memories.length} memories to ${finalMemories.length}`, {
      contextLength: contextString.length,
      totalTokens,
      executionTimeMs: Date.now() - startTime
    });
    
    return {
      memories: finalMemories,
      totalScore,
      tokens: totalTokens,
      strategy: `recency:${recencyWeight},importance:${importanceWeight},relevance:${relevanceWeight},contextual:${contextualWeight}`,
      scores
    };
  }

  /**
   * Filter memories from a repository
   */
  async filterFromRepository<T extends Memory>(
    repository: MemoryRepository<T>,
    context: string | object,
    baseParams: MemoryQueryParams,
    options: MemoryFiltrationOptions = {}
  ): Promise<FilteredMemoriesResult<T>> {
    // First get memories from repository
    const queryResult = await repository.query(baseParams);
    
    // Then apply filtering
    return this.filterMemories(queryResult.items, context, options);
  }

  /**
   * Calculate text similarity between two strings
   * This is a simple implementation - in production, use better algorithms
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple implementation using Jaccard similarity on words
    const words1 = new Set(text1.toLowerCase().split(/\W+/).filter(w => w.length > 0));
    const words2 = new Set(text2.toLowerCase().split(/\W+/).filter(w => w.length > 0));
    
    // Find intersection and union
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    // Return Jaccard similarity
    return intersection.size / union.size;
  }

  /**
   * Estimate token count for a memory
   */
  private estimateTokens(memory: Memory): number {
    // Use custom estimator if provided
    if (this.config.tokenCountEstimator) {
      return this.config.tokenCountEstimator(JSON.stringify(memory));
    }
    
    // Basic approximation: ~1 token per 4 characters
    const json = JSON.stringify(memory);
    return Math.ceil(json.length / 4);
  }
}

/**
 * Implementation of a simple token counter
 */
export class SimpleTokenCounter {
  private tokensPerCharacter: number;

  /**
   * Create a new token counter with specified ratio
   */
  constructor(tokensPerCharacter: number = 0.25) {
    this.tokensPerCharacter = tokensPerCharacter;
  }

  /**
   * Count tokens in text
   */
  countTokens(text: string): number {
    return Math.ceil(text.length * this.tokensPerCharacter);
  }
}

/**
 * Memory prioritization strategies
 */
export enum MemoryPrioritizationStrategy {
  RECENCY = 'recency',
  IMPORTANCE = 'importance',
  RELEVANCE = 'relevance',
  CONTEXT = 'context',
  BALANCED = 'balanced'
}

/**
 * Strategy configuration presets
 */
export const PRIORITIZATION_PRESETS: Record<MemoryPrioritizationStrategy, MemoryFiltrationOptions> = {
  [MemoryPrioritizationStrategy.RECENCY]: {
    recencyWeight: 0.7,
    importanceWeight: 0.2,
    relevanceWeight: 0.05,
    contextualWeight: 0.05
  },
  [MemoryPrioritizationStrategy.IMPORTANCE]: {
    recencyWeight: 0.2,
    importanceWeight: 0.7,
    relevanceWeight: 0.05,
    contextualWeight: 0.05
  },
  [MemoryPrioritizationStrategy.RELEVANCE]: {
    recencyWeight: 0.1,
    importanceWeight: 0.2,
    relevanceWeight: 0.6,
    contextualWeight: 0.1
  },
  [MemoryPrioritizationStrategy.CONTEXT]: {
    recencyWeight: 0.1,
    importanceWeight: 0.1,
    relevanceWeight: 0.3,
    contextualWeight: 0.5
  },
  [MemoryPrioritizationStrategy.BALANCED]: {
    recencyWeight: 0.25,
    importanceWeight: 0.25,
    relevanceWeight: 0.25,
    contextualWeight: 0.25
  }
}; 