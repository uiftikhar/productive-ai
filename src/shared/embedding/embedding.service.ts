// src/shared/embedding/embedding.service.ts

import { OpenAIEmbeddings } from '@langchain/openai';
import { ConsoleLogger } from '../logger/console-logger.ts';
import { Logger } from '../logger/logger.interface.ts';

/**
 * Interface for embedding service results
 */
export interface EmbeddingResult {
  embeddings: number[][];
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

/**
 * Service for generating text embeddings
 */
export class EmbeddingService {
  private embeddings: OpenAIEmbeddings;
  private logger: Logger;

  constructor(options: {
    apiKey?: string;
    model?: string;
    dimensions?: number;
    logger?: Logger;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    
    // Initialize the OpenAI embeddings model
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: options.apiKey || process.env.OPENAI_API_KEY,
      modelName: options.model || 'text-embedding-3-small',
      dimensions: options.dimensions || 1536,
    });
  }

  /**
   * Generate embeddings for multiple texts
   */
  async createEmbeddings(texts: string[]): Promise<EmbeddingResult> {
    if (!texts || texts.length === 0) {
      throw new Error('No texts provided for embedding');
    }

    try {
      const startTime = Date.now();
      // Get embeddings for all texts
      const embeddings = await this.embeddings.embedDocuments(texts);

      // Estimate token usage (not exact, just an approximation)
      const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
      const estimatedTokens = Math.ceil(totalChars / 4); // Rough estimate: ~4 chars per token

      this.logger.debug(`Generated ${embeddings.length} embeddings`, {
        textCount: texts.length,
        estimatedTokens,
        dimensionCount: embeddings[0]?.length || 0,
        executionTimeMs: Date.now() - startTime
      });

      return {
        embeddings,
        usage: {
          promptTokens: estimatedTokens,
          totalTokens: estimatedTokens
        }
      };
    } catch (error) {
      this.logger.error('Error generating embeddings', {
        error: error instanceof Error ? error.message : String(error),
        textCount: texts.length
      });
      throw new Error(`Failed to create embeddings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate a single embedding for a text
   */
  async createEmbedding(text: string): Promise<number[]> {
    if (!text) {
      throw new Error('No text provided for embedding');
    }

    try {
      return await this.embeddings.embedQuery(text);
    } catch (error) {
      this.logger.error('Error generating embedding', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Failed to create embedding: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (!embedding1 || !embedding2) {
      throw new Error('Invalid embeddings provided');
    }

    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings have different dimensions');
    }

    // Calculate dot product
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

    // Prevent division by zero
    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    // Return cosine similarity
    return dotProduct / (magnitude1 * magnitude2);
  }
} 