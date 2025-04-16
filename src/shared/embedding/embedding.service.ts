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
   * Generate embedding for text, handling large inputs by chunking
   * Maximum token length for embedding models is typically 8191 tokens
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      this.logger.debug(
        `Generating embedding for text of length ${text.length}`,
      );

      // If text is very short, generate directly
      if (text.length < 5000) {
        const response = await this.openAIAdapter.generateEmbedding(text.trim());
        this.logger.debug(`Successfully generated embedding directly`);
        return response;
      }

      // For longer text, use chunking strategy
      return this.generateEmbeddingWithChunking(text);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error generating embedding: ${errorMessage}`);
      throw new Error(`Failed to generate embedding: ${errorMessage}`);
    }
  }

  /**
   * Generate embedding for large text by chunking and combining embeddings
   */
  private async generateEmbeddingWithChunking(text: string): Promise<number[]> {
    this.logger.debug(`Using chunking strategy for large text`);
    
    // Split text into chunks of roughly 4000 characters (~1000 tokens)
    const chunkSize = 4000;
    const chunks: string[] = [];
    
    for (let i = 0; i < text.length; i += chunkSize) {
      // Use overlap of 500 characters to maintain context across chunks
      const start = Math.max(0, i - 500);
      const end = Math.min(text.length, i + chunkSize);
      chunks.push(text.substring(start, end).trim());
    }
    
    this.logger.debug(`Split text into ${chunks.length} chunks`);
    
    // Generate embeddings for each chunk
    const chunkEmbeddings: number[][] = [];
    for (const chunk of chunks) {
      try {
        const embedding = await this.openAIAdapter.generateEmbedding(chunk);
        chunkEmbeddings.push(embedding);
      } catch (error) {
        this.logger.warn(`Error embedding chunk, skipping: ${error}`);
        // Continue with other chunks even if one fails
      }
    }
    
    if (chunkEmbeddings.length === 0) {
      throw new Error('Failed to generate any chunk embeddings');
    }
    
    // Combine the embeddings
    return this.combineEmbeddings(chunkEmbeddings);
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
