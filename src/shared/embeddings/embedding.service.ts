// import { Injectable } from '@nestjs/common';
import { OpenAI } from 'openai';
import { Logger } from '../logger/logger.interface.ts';

export interface EmbeddingConfig {
  openAIApiKey?: string;
  model?: string;
  dimensions?: number;
  apiBaseUrl?: string;
}

export interface SearchResult {
  content: string;
  score: number;
}

// @Injectable()
export class EmbeddingService {
  private openai: OpenAI;
  private model: string;
  private dimensions: number;

  constructor(
    config: EmbeddingConfig = {},
    private readonly logger?: Logger,
  ) {
    this.model = config.model || 'text-embedding-ada-002';
    this.dimensions = config.dimensions || 1536;

    this.openai = new OpenAI({
      apiKey: config.openAIApiKey || process.env.OPENAI_API_KEY,
      baseURL: config.apiBaseUrl || process.env.OPENAI_API_BASE_URL,
    });

    this.logger?.info('EmbeddingService initialized');
  }

  /**
   * Generate embeddings for a given text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      this.logger?.debug(
        `Generating embedding for text of length ${text.length}`,
      );

      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error: any) {
      this.logger?.error('Error generating embedding', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      this.logger?.debug(`Generating embeddings for ${texts.length} texts`);

      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts,
      });

      return response.data.map((item) => item.embedding);
    } catch (error: any) {
      this.logger?.error('Error generating embeddings', error);
      throw new Error(`Failed to generate embeddings: ${error.message}`);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Search for similar content by comparing embeddings
   */
  async findSimilarContent(
    query: string,
    contents: string[],
    topK: number = 5,
  ): Promise<SearchResult[]> {
    try {
      this.logger?.debug(
        `Searching for similar content among ${contents.length} items`,
      );

      if (contents.length === 0) {
        return [];
      }

      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Generate embeddings for all contents
      const contentEmbeddings = await this.generateEmbeddings(contents);

      // Calculate similarities
      const similarities = contentEmbeddings.map((embedding, index) => ({
        content: contents[index],
        score: this.cosineSimilarity(queryEmbedding, embedding),
      }));

      // Sort by similarity score (highest first) and take topK
      return similarities.sort((a, b) => b.score - a.score).slice(0, topK);
    } catch (error: any) {
      this.logger?.error('Error finding similar content', error);
      throw new Error(`Failed to find similar content: ${error.message}`);
    }
  }

  /**
   * Split content into chunks for embedding
   */
  splitContentIntoChunks(
    content: string,
    chunkSize: number = 1000,
    overlap: number = 200,
  ): string[] {
    this.logger?.debug(
      `Splitting content of length ${content.length} into chunks`,
    );

    const chunks: string[] = [];
    let startIdx = 0;

    while (startIdx < content.length) {
      const endIdx = Math.min(startIdx + chunkSize, content.length);
      chunks.push(content.substring(startIdx, endIdx));
      startIdx += chunkSize - overlap;
    }

    return chunks;
  }

  /**
   * Search within a long text by chunking it first
   */
  async searchInLongText(
    query: string,
    longText: string,
    topK: number = 5,
    chunkSize: number = 1000,
    overlap: number = 200,
  ): Promise<SearchResult[]> {
    this.logger?.debug(`Searching in long text of length ${longText.length}`);

    // Split the text into chunks
    const chunks = this.splitContentIntoChunks(longText, chunkSize, overlap);

    // Find similar chunks
    return await this.findSimilarContent(query, chunks, topK);
  }
}
