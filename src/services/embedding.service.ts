/**
 * Embedding Service
 * Creates vector embeddings for text content using OpenAI's API
 */

import { computeEmbedding } from '../memory-client/compute-embedding';

/**
 * Service for creating vector embeddings from text content
 */
export class EmbeddingService {
  /**
   * Create embeddings for an array of text inputs
   * @param texts Array of text strings to embed
   * @returns Object with array of embeddings
   */
  async createEmbeddings(texts: string[]): Promise<{ embeddings: number[][] }> {
    try {
      const embeddings: number[][] = [];

      // Process each text input sequentially
      for (const text of texts) {
        const embedding = await computeEmbedding(text);
        embeddings.push(embedding);
      }

      return { embeddings };
    } catch (error) {
      console.error('Error creating embeddings:', error);
      throw new Error('Failed to create embeddings');
    }
  }
}
