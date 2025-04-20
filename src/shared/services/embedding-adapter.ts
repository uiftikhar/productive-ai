/**
 * Embedding Service Adapter
 * 
 * This adapter standardizes the interface between different embedding implementations
 * in the codebase, specifically bridging between:
 * 
 * 1. EmbeddingService (src/shared/services/embedding.service.ts) - The canonical implementation
 * 2. LangChain OpenAIEmbeddings (used in tests and some parts of the codebase)
 * 
 * This adapter enables a smooth transition to the canonical implementation while
 * maintaining compatibility with code that expects the alternative interface.
 */

import { EmbeddingService } from './embedding.service';
import { Logger } from '../logger/logger.interface';
import { ConsoleLogger } from '../logger/console-logger';
import { OpenAIConnector } from '../../agents/integrations/openai-connector';
import { IEmbeddingService } from './embedding.interface';

/**
 * A unified adapter for embedding services
 * Implements both interfaces to ensure compatibility
 */
export class EmbeddingAdapter implements IEmbeddingService {
  private embeddingService: any; // Using 'any' to support mock objects in testing
  private logger: Logger;
  private modelName: string = 'text-embedding-3-large';
  private dimensions: number = 3072; // For text-embedding-3-large

  /**
   * Create a new embedding adapter
   */
  constructor(options: {
    embeddingService?: any;
    connector?: OpenAIConnector;
    logger?: Logger;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    
    // If an embedding service is provided, use it
    if (options.embeddingService) {
      this.embeddingService = options.embeddingService;
    } 
    // Otherwise create a new one if connector is provided
    else if (options.connector) {
      this.embeddingService = new EmbeddingService(options.connector, this.logger);
    } 
    // Last resort - create a new connector and service
    else {
      const connector = new OpenAIConnector();
      this.embeddingService = new EmbeddingService(connector, this.logger);
    }
  }

  // ====================================
  // EmbeddingService interface methods - with fallbacks for mock objects
  // ====================================

  /**
   * Generate embedding for text, handling large inputs by chunking
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // First try the standard interface
      if (typeof this.embeddingService.generateEmbedding === 'function') {
        return await this.embeddingService.generateEmbedding(text);
      }
      
      // Fall back to embedText if available (LangChain style)
      if (typeof this.embeddingService.embedText === 'function') {
        this.logger.debug('Falling back to embedText method');
        return await this.embeddingService.embedText(text);
      }
      
      // For test mocks that might have different implementation
      if (typeof this.embeddingService.embedQuery === 'function') {
        this.logger.debug('Falling back to embedQuery method');
        return await this.embeddingService.embedQuery(text);
      }
      
      // Last resort fallback for testing
      this.logger.warn('No embedding method found, returning zero vector');
      return new Array(this.dimensions).fill(0);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error generating embedding: ${errorMessage}`);
      throw new Error(`Failed to generate embedding: ${errorMessage}`);
    }
  }

  /**
   * Calculates the cosine similarity between two embedding vectors
   */
  calculateCosineSimilarity(
    embedding1: number[],
    embedding2: number[],
  ): number {
    try {
      // Try the standard interface first
      if (typeof this.embeddingService.calculateCosineSimilarity === 'function') {
        return this.embeddingService.calculateCosineSimilarity(embedding1, embedding2);
      }
      
      // Fall back to implementation from the main service
      this.logger.debug('Implementing cosine similarity locally');
      
      if (embedding1.length !== embedding2.length) {
        throw new Error('Embeddings must have the same dimensions');
      }

      let dotProduct = 0;
      let magnitude1 = 0;
      let magnitude2 = 0;

      for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        magnitude1 += embedding1[i] * embedding1[i];
        magnitude2 += embedding2[i] * embedding2[i];
      }

      magnitude1 = Math.sqrt(magnitude1);
      magnitude2 = Math.sqrt(magnitude2);

      if (magnitude1 === 0 || magnitude2 === 0) {
        return 0;
      }

      return dotProduct / (magnitude1 * magnitude2);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage !== 'Embeddings must have the same dimensions') {
        this.logger.error(`Error calculating cosine similarity: ${errorMessage}`);
      }
      throw error;
    }
  }

  /**
   * Finds the most similar texts based on their embeddings
   */
  findSimilarEmbeddings(
    queryEmbedding: number[],
    embeddingsWithMetadata: { embedding: number[]; metadata: any }[],
    limit: number = 5,
  ): { similarity: number; metadata: any }[] {
    try {
      // Try the standard interface first
      if (typeof this.embeddingService.findSimilarEmbeddings === 'function') {
        return this.embeddingService.findSimilarEmbeddings(
          queryEmbedding,
          embeddingsWithMetadata,
          limit
        );
      }
      
      // Fall back to local implementation
      this.logger.debug('Implementing findSimilarEmbeddings locally');
      
      const similarities = embeddingsWithMetadata.map((item) => ({
        similarity: this.calculateCosineSimilarity(queryEmbedding, item.embedding),
        metadata: item.metadata,
      }));

      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error finding similar embeddings: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Combines multiple embeddings into a single composite embedding
   */
  combineEmbeddings(embeddings: number[][]): number[] {
    try {
      // Try the standard interface first
      if (typeof this.embeddingService.combineEmbeddings === 'function') {
        return this.embeddingService.combineEmbeddings(embeddings);
      }
      
      // Fall back to local implementation
      this.logger.debug('Implementing combineEmbeddings locally');
      
      if (embeddings.length === 0) {
        throw new Error('No embeddings provided to combine');
      }

      const dimension = embeddings[0].length;
      const result = new Array(dimension).fill(0);

      for (const embedding of embeddings) {
        if (embedding.length !== dimension) {
          throw new Error('All embeddings must have the same dimensions');
        }

        for (let i = 0; i < dimension; i++) {
          result[i] += embedding[i];
        }
      }

      // Normalize the combined vector
      const magnitude = Math.sqrt(
        result.reduce((sum, val) => sum + val * val, 0),
      );

      if (magnitude === 0) {
        return result;
      }

      return result.map((val) => val / magnitude);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('No embeddings provided') && 
          !errorMessage.includes('same dimensions')) {
        this.logger.error(`Error combining embeddings: ${errorMessage}`);
      }
      throw error;
    }
  }

  // =======================================
  // Alternative interface methods (LangChain style)
  // =======================================

  /**
   * Generate embedding for text (alternative interface)
   */
  async embedText(text: string): Promise<number[]> {
    this.logger.debug('Using embedText (alternative interface)');
    return this.generateEmbedding(text);
  }

  /**
   * Generate embeddings for multiple texts (alternative interface)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    this.logger.debug('Using embedBatch (alternative interface)');
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.generateEmbedding(text));
    }
    return results;
  }

  /**
   * Get the name of the embedding model
   */
  getModelName(): string {
    if (typeof this.embeddingService.getModelName === 'function') {
      return this.embeddingService.getModelName();
    }
    return this.modelName;
  }

  /**
   * Get the dimensions of the embedding vectors
   */
  getDimensions(): number {
    if (typeof this.embeddingService.getDimensions === 'function') {
      return this.embeddingService.getDimensions();
    }
    return this.dimensions;
  }

  /**
   * Get the cost per 1K tokens for the embedding model
   */
  getCost(): number {
    if (typeof this.embeddingService.getCost === 'function') {
      return this.embeddingService.getCost();
    }
    return 0.00013; // Cost for text-embedding-3-large per 1K tokens
  }
} 