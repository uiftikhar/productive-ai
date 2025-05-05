import { ConsoleLogger } from '../../../logger/console-logger';
import { Logger } from '../../../logger/logger.interface';
import { IEmbeddingService } from '../../embedding.interface';

interface EmbeddingWithMetadata {
  embedding: number[];
  text: string;
  metadata?: Record<string, any>;
}

// TODO: Fix linting errors
export class MockEmbeddingService implements IEmbeddingService {
  private embeddingMap: Map<string, number[]> = new Map();
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Return cached embedding if we have it
    if (this.embeddingMap.has(text)) {
      return this.embeddingMap.get(text)!;
    }

    // Otherwise generate a simple mock embedding (32-dim vector of random values)
    const mockEmbedding = Array.from({ length: 32 }, () => Math.random());
    this.embeddingMap.set(text, mockEmbedding);
    return mockEmbedding;
  }

  async embedText(text: string): Promise<number[]> {
    // Reuse the existing generateEmbedding implementation
    return this.generateEmbedding(text);
  }

  async generateEmbeddingWithMetadata(
    text: string,
    metadata?: Record<string, any>,
  ): Promise<EmbeddingWithMetadata> {
    const embedding = await this.generateEmbedding(text);
    return {
      embedding,
      text,
      metadata,
    };
  }

  calculateCosineSimilarity(
    embedding1: number[],
    embedding2: number[],
  ): number {
    // Mock implementation - return random similarity between 0 and 1
    return Math.random();
  }

  findSimilarEmbeddings(
    queryEmbedding: number[],
    embeddingsWithMetadata: { embedding: number[]; metadata: any }[],
    limit?: number,
  ): { similarity: number; metadata: any }[] {
    // Calculate similarities
    const similarities = embeddingsWithMetadata.map((item) => ({
      similarity: this.calculateCosineSimilarity(
        queryEmbedding,
        item.embedding,
      ),
      metadata: item.metadata,
    }));

    // Sort by similarity (highest first)
    const sorted = similarities.sort((a, b) => b.similarity - a.similarity);

    // Apply limit if specified
    return limit ? sorted.slice(0, limit) : sorted;
  }

  combineEmbeddings(embeddings: number[][]): number[] {
    // Simple mock implementation: average the embeddings
    if (embeddings.length === 0) {
      return [];
    }

    const dimension = embeddings[0].length;
    const result = new Array(dimension).fill(0);

    // Sum all embeddings
    for (const embedding of embeddings) {
      for (let i = 0; i < dimension; i++) {
        result[i] += embedding[i];
      }
    }

    // Divide by count to get average
    for (let i = 0; i < dimension; i++) {
      result[i] /= embeddings.length;
    }

    return result;
  }

  async findSimilarContent(
    query: string,
    content: string[],
  ): Promise<{ text: string; similarity: number }[]> {
    const queryEmbedding = await this.generateEmbedding(query);

    const results = await Promise.all(
      content.map(async (text) => {
        const embedding = await this.generateEmbedding(text);
        // Calculate cosine similarity
        const similarity = this.calculateCosineSimilarity(
          queryEmbedding,
          embedding,
        );
        return { text, similarity };
      }),
    );

    // Sort by similarity (highest first)
    return results.sort((a, b) => b.similarity - a.similarity);
  }

  async searchInLongText(
    query: string,
    longText: string,
    options?: { chunkSize?: number; overlap?: number },
  ): Promise<{ text: string; similarity: number }[]> {
    // Mock implementation - split text into chunks and find similar content
    const chunkSize = options?.chunkSize || 1000;
    const overlap = options?.overlap || 200;

    // Simple chunking algorithm
    const chunks: string[] = [];
    for (let i = 0; i < longText.length; i += chunkSize - overlap) {
      const chunk = longText.substring(i, i + chunkSize);
      if (chunk.length > 10) {
        // Only include chunks with meaningful content
        chunks.push(chunk);
      }
    }

    return this.findSimilarContent(query, chunks);
  }

  // Helper methods for testing
  setMockEmbedding(text: string, embedding: number[]): void {
    this.embeddingMap.set(text, embedding);
  }

  getMockEmbedding(text: string): number[] | undefined {
    return this.embeddingMap.get(text);
  }

  clearMockEmbeddings(): void {
    this.embeddingMap.clear();
  }
}

export const createMockEmbeddingService = (
  logger?: Logger,
): IEmbeddingService => {
  return new MockEmbeddingService(logger);
};
