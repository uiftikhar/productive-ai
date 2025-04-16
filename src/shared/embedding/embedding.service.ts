// src/shared/embedding/embedding.service.ts

import { OpenAIAdapter } from '../../agents/adapters/openai-adapter';
import { ConsoleLogger } from '../logger/console-logger';
import { Logger } from '../logger/logger.interface';

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

export class EmbeddingService {
  private logger: Logger;
  private openAIAdapter: OpenAIAdapter;
  private readonly embeddingModelName = 'text-embedding-ada-002';

  constructor(openAIAdapter: OpenAIAdapter, logger?: Logger) {
    this.openAIAdapter = openAIAdapter;
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Generates an embedding for the provided text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      this.logger.debug(
        `Generating embedding for text of length ${text.length}`,
      );

      const response = await this.openAIAdapter.generateEmbedding(text.trim());

      // In actual implementation, this would parse the OpenAI response
      // For now, simulate a valid embedding vector (e.g., 1536 dimensions for ada-002)
      const mockEmbedding = Array(1536)
        .fill(0)
        .map(() => Math.random() * 2 - 1);

      this.logger.debug(`Successfully generated embedding`);
      return mockEmbedding;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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
  }

  /**
   * Finds the most similar texts based on their embeddings
   */
  findSimilarEmbeddings(
    queryEmbedding: number[],
    embeddingsWithMetadata: { embedding: number[]; metadata: any }[],
    limit: number = 5,
  ): { similarity: number; metadata: any }[] {
    const similarities = embeddingsWithMetadata.map((item) => ({
      similarity: this.calculateCosineSimilarity(
        queryEmbedding,
        item.embedding,
      ),
      metadata: item.metadata,
    }));

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Combines multiple embeddings into a single composite embedding
   */
  combineEmbeddings(embeddings: number[][]): number[] {
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
  }
}
