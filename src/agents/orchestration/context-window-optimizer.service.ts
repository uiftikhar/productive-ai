/**
 * Context Window Optimizer Service
 *
 * Provides intelligent context window management to optimize token usage
 * while preserving the most relevant context for LLM interactions.
 */

import { Logger } from '../../shared/logger/logger.interface.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { EmbeddingService } from '../../shared/embedding/embedding.service.ts';
import { OpenAIAdapter } from '../../agents/adapters/openai-adapter.ts';

/**
 * Context scoring parameters
 */
export interface ContextScoringParams {
  queryRelevanceWeight: number;
  recencyWeight: number;
  sourceImportanceWeight: number;
}

/**
 * Context item interface
 */
export interface ContextItem {
  id?: string;
  content: string;
  source?: string;
  embedding?: number[];
  metadata?: {
    timestamp?: number;
    sourceType?: string;
    importance?: number;
    tokenCount?: number;
    [key: string]: any;
  };
}

/**
 * Context window optimization result
 */
export interface ContextOptimizationResult {
  selectedItems: ContextItem[];
  totalTokens: number;
  tokenLimit: number;
  prunedCount: number;
  scoringStrategy: string;
}

/**
 * Service for optimizing context window usage
 */
export class ContextWindowOptimizer {
  private logger: Logger;
  private embeddingService: EmbeddingService;

  // Source importance factors - for scoring context from different sources
  private sourceImportance: Record<string, number> = {
    document: 0.9,
    conversation: 0.85,
    'knowledge-base': 0.8,
    meeting: 0.75,
    email: 0.7,
    note: 0.65,
    web: 0.6,
    default: 0.5,
  };

  constructor(
    options: {
      logger?: Logger;
      embeddingService?: EmbeddingService;
      openAIAdapter?: OpenAIAdapter;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();

    // Use provided embedding service or create a new one with proper parameters
    if (options.embeddingService) {
      this.embeddingService = options.embeddingService;
    } else if (options.openAIAdapter) {
      this.embeddingService = new EmbeddingService(
        options.openAIAdapter,
        this.logger,
      );
    } else {
      throw new Error(
        'Either embeddingService or openAIAdapter must be provided',
      );
    }
  }

  /**
   * Optimize context to fit within token limits
   */
  async optimizeContext(
    query: string,
    contextItems: ContextItem[],
    tokenLimit: number,
    options: {
      scoringParams?: ContextScoringParams;
      strategy?: 'relevance' | 'recency' | 'balanced' | 'preserve-coherence';
      chunkLongItems?: boolean;
      semanticCutoff?: number;
    } = {},
  ): Promise<ContextOptimizationResult> {
    this.logger.info('Optimizing context for query', {
      query: query.substring(0, 100),
      contextItemCount: contextItems.length,
      tokenLimit,
    });

    // Default scoring params
    const scoringParams = options.scoringParams || {
      queryRelevanceWeight: 0.7,
      recencyWeight: 0.2,
      sourceImportanceWeight: 0.1,
    };

    // Ensure all items have token count estimates
    let itemsWithTokens = await this.ensureTokenCounts(contextItems);

    // Calculate total tokens
    const totalTokens = itemsWithTokens.reduce(
      (sum, item) => sum + (item.metadata?.tokenCount || 0),
      0,
    );

    this.logger.debug('Total token count before optimization', {
      totalTokens,
      tokenLimit,
    });

    // If we're under the limit, return all items
    if (totalTokens <= tokenLimit) {
      return {
        selectedItems: itemsWithTokens,
        totalTokens,
        tokenLimit,
        prunedCount: 0,
        scoringStrategy: 'none-needed',
      };
    }

    // Determine if we need to chunk long items
    if (options.chunkLongItems) {
      itemsWithTokens = this.chunkLongItems(itemsWithTokens);
    }

    // Choose optimization strategy
    const strategy = options.strategy || 'balanced';
    let scoredItems: Array<{ item: ContextItem; score: number }>;

    switch (strategy) {
      case 'relevance':
        scoredItems = await this.scoreItemsByRelevance(
          query,
          itemsWithTokens,
          options.semanticCutoff,
        );
        break;
      case 'recency':
        scoredItems = this.scoreItemsByRecency(itemsWithTokens);
        break;
      case 'preserve-coherence':
        scoredItems = this.scoreItemsForCoherence(itemsWithTokens);
        break;
      case 'balanced':
      default:
        scoredItems = await this.scoreItemsBalanced(
          query,
          itemsWithTokens,
          scoringParams,
        );
        break;
    }

    // Select items to fit token budget
    const result = this.selectItemsToFitBudget(scoredItems, tokenLimit);

    this.logger.info('Context optimization complete', {
      selectedItemCount: result.selectedItems.length,
      prunedCount: contextItems.length - result.selectedItems.length,
      selectedTokens: result.totalTokens,
      strategy,
    });

    return {
      selectedItems: result.selectedItems,
      totalTokens: result.totalTokens,
      tokenLimit,
      prunedCount: contextItems.length - result.selectedItems.length,
      scoringStrategy: strategy,
    };
  }

  /**
   * Ensure all context items have token count metadata
   */
  private async ensureTokenCounts(
    items: ContextItem[],
  ): Promise<ContextItem[]> {
    return Promise.all(
      items.map(async (item) => {
        if (item.metadata?.tokenCount) {
          return item;
        }

        const tokenCount = await this.estimateTokenCount(item.content);
        return {
          ...item,
          metadata: {
            ...(item.metadata || {}),
            tokenCount,
          },
        };
      }),
    );
  }

  /**
   * Estimate token count for content
   * Uses a simple approximation formula if detailed token count is not available
   */
  private async estimateTokenCount(content: string): Promise<number> {
    // Simple approximation: ~4 characters per token for English text
    // In a production environment, you would use a more accurate tokenizer
    return Math.ceil(content.length / 4);
  }

  /**
   * Chunk long content items into smaller pieces
   * This helps prevent dropping entire long documents
   */
  private chunkLongItems(
    items: ContextItem[],
    maxChunkTokens = 1000,
  ): ContextItem[] {
    const result: ContextItem[] = [];

    for (const item of items) {
      const tokenCount = item.metadata?.tokenCount || 0;

      // If item is small enough, include as is
      if (tokenCount <= maxChunkTokens) {
        result.push(item);
        continue;
      }

      // For larger items, split into smaller chunks
      const contentChunks = this.splitContentIntoChunks(
        item.content,
        maxChunkTokens,
      );
      const timestamp = item.metadata?.timestamp || Date.now();

      contentChunks.forEach((chunk, index) => {
        const chunkTokenCount = Math.ceil(chunk.length / 4); // Simple estimation

        result.push({
          id: item.id ? `${item.id}_chunk${index}` : undefined,
          content: chunk,
          source: item.source,
          embedding: item.embedding, // Note: would need to recompute embeddings for chunks in production
          metadata: {
            ...item.metadata,
            tokenCount: chunkTokenCount,
            isChunk: true,
            chunkIndex: index,
            originalId: item.id,
            // Slightly decrease timestamp for later chunks to maintain order
            timestamp: timestamp - index * 0.001,
          },
        });
      });
    }

    return result;
  }

  /**
   * Split content into chunks of roughly equal size
   */
  private splitContentIntoChunks(
    content: string,
    maxChunkTokens: number,
  ): string[] {
    // Simple paragraph-based splitting
    const paragraphs = content.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      const paragraphTokens = Math.ceil(paragraph.length / 4);
      const currentTokens = Math.ceil(currentChunk.length / 4);

      if (
        currentTokens + paragraphTokens > maxChunkTokens &&
        currentChunk !== ''
      ) {
        chunks.push(currentChunk);
        currentChunk = paragraph;
      } else {
        currentChunk = currentChunk
          ? `${currentChunk}\n\n${paragraph}`
          : paragraph;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Score items by relevance to the query
   */
  private async scoreItemsByRelevance(
    query: string,
    items: ContextItem[],
    semanticCutoff = 0.6,
  ): Promise<Array<{ item: ContextItem; score: number }>> {
    // Get embedding for query
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    // Get embeddings for items that don't have them
    const itemsWithEmbeddings = await Promise.all(
      items.map(async (item) => {
        if (item.embedding) {
          return item;
        }

        const embedding = await this.embeddingService.generateEmbedding(
          item.content,
        );
        return {
          ...item,
          embedding,
        };
      }),
    );

    // Calculate similarity scores
    const scoredItems = itemsWithEmbeddings.map((item) => {
      const similarity = item.embedding
        ? this.calculateCosineSimilarity(queryEmbedding, item.embedding)
        : 0;

      return {
        item,
        score: similarity,
      };
    });

    // Filter out items below cutoff if specified
    const filteredItems = semanticCutoff
      ? scoredItems.filter((item) => item.score >= semanticCutoff)
      : scoredItems;

    // Sort by score (highest first)
    return filteredItems.sort((a, b) => b.score - a.score);
  }

  /**
   * Score items by recency
   */
  private scoreItemsByRecency(
    items: ContextItem[],
  ): Array<{ item: ContextItem; score: number }> {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    return items
      .map((item) => {
        const timestamp = item.metadata?.timestamp || 0;
        let recencyScore = 0;

        if (timestamp > 0) {
          const age = now - timestamp;

          // Exponential decay based on age
          if (age < oneHour) {
            // Less than an hour old - highest score
            recencyScore = 1.0;
          } else if (age < oneDay) {
            // Less than a day old - moderate decay
            recencyScore = 0.8 * Math.exp(-age / (oneDay * 2));
          } else {
            // Older - steeper decay
            recencyScore = 0.5 * Math.exp(-age / (oneDay * 7));
          }
        }

        return {
          item,
          score: recencyScore,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Score items to preserve coherence/continuity of context
   * Prioritizes keeping sequences of items from the same source
   */
  private scoreItemsForCoherence(
    items: ContextItem[],
  ): Array<{ item: ContextItem; score: number }> {
    // Group items by source
    const sourceGroups = new Map<string, ContextItem[]>();

    for (const item of items) {
      const source = item.source || 'unknown';
      if (!sourceGroups.has(source)) {
        sourceGroups.set(source, []);
      }
      sourceGroups.get(source)?.push(item);
    }

    // Sort each group by timestamp (if available)
    for (const [source, group] of sourceGroups.entries()) {
      sourceGroups.set(
        source,
        group.sort((a, b) => {
          const timestampA = a.metadata?.timestamp || 0;
          const timestampB = b.metadata?.timestamp || 0;
          return timestampA - timestampB;
        }),
      );
    }

    // Assign coherence scores - items in sequence get higher scores
    const scoredItems: Array<{ item: ContextItem; score: number }> = [];
    const sourceImportanceMap = this.sourceImportance;

    sourceGroups.forEach((group, source) => {
      const sourceScore =
        sourceImportanceMap[source] || sourceImportanceMap.default;

      group.forEach((item, index, arr) => {
        // Items in the middle of a sequence get higher scores for coherence
        const positionFactor =
          arr.length <= 2
            ? 1.0
            : 0.7 +
              0.6 * (1 - Math.abs(index - arr.length / 2) / (arr.length / 2));

        scoredItems.push({
          item,
          score: sourceScore * positionFactor,
        });
      });
    });

    return scoredItems.sort((a, b) => b.score - a.score);
  }

  /**
   * Score items using a balanced approach considering relevance, recency and source importance
   */
  private async scoreItemsBalanced(
    query: string,
    items: ContextItem[],
    params: ContextScoringParams,
  ): Promise<Array<{ item: ContextItem; score: number }>> {
    // Get scores from different dimensions
    const relevanceScores = await this.scoreItemsByRelevance(query, items);
    const recencyScores = this.scoreItemsByRecency(items);

    // Create a map of item IDs to scores for fast lookup
    const relevanceMap = new Map(
      relevanceScores.map(({ item, score }) => [
        item.id || item.content,
        score,
      ]),
    );

    const recencyMap = new Map(
      recencyScores.map(({ item, score }) => [item.id || item.content, score]),
    );

    // Calculate balanced scores
    return items
      .map((item) => {
        const id = item.id || item.content;
        const sourceType = item.metadata?.sourceType || 'default';
        const sourceImportance =
          this.sourceImportance[sourceType] || this.sourceImportance.default;

        // Combine scores with weights
        const balancedScore =
          (relevanceMap.get(id) || 0) * params.queryRelevanceWeight +
          (recencyMap.get(id) || 0) * params.recencyWeight +
          sourceImportance * params.sourceImportanceWeight;

        return {
          item,
          score: balancedScore,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Select items to fit within token budget based on scores
   */
  private selectItemsToFitBudget(
    scoredItems: Array<{ item: ContextItem; score: number }>,
    tokenLimit: number,
  ): { selectedItems: ContextItem[]; totalTokens: number } {
    const selectedItems: ContextItem[] = [];
    let totalTokens = 0;

    for (const { item } of scoredItems) {
      const tokenCount = item.metadata?.tokenCount || 0;

      if (totalTokens + tokenCount <= tokenLimit) {
        selectedItems.push(item);
        totalTokens += tokenCount;
      }
    }

    return { selectedItems, totalTokens };
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(
    vectorA: number[],
    vectorB: number[],
  ): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must be of same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    // Avoid division by zero
    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
