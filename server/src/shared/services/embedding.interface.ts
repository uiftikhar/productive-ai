/**
 * Standardized interface for embedding services
 *
 * This interface defines the contract that all embedding services in the application
 * should implement. It combines methods from both existing implementations:
 * 1. The official EmbeddingService
 * 2. The LangChain-style embedding interface
 *
 * Having a standard interface ensures consistency across the codebase and
 * allows for easier swapping of implementations.
 */

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
 * Standardized interface for embedding services
 */
export interface IEmbeddingService {
  // Core embedding generation methods
  generateEmbedding(text: string): Promise<number[]>;

  // Utility methods for working with embeddings
  calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number;
  findSimilarEmbeddings(
    queryEmbedding: number[],
    embeddingsWithMetadata: { embedding: number[]; metadata: any }[],
    limit?: number,
  ): { similarity: number; metadata: any }[];
  combineEmbeddings(embeddings: number[][]): number[];

  // Alternative interface methods (for backward compatibility)
  embedText(text: string): Promise<number[]>;
  embedBatch?(texts: string[]): Promise<number[][]>;
  getModelName?(): string;
  getDimensions?(): number;
  getCost?(): number;
}
