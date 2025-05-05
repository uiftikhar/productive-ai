/**
 * Conversation Context Service
 * Handles conversation history storage and retrieval with enhanced features:
 * - Agent-specific segmentation
 * - Retention policies
 * - Enhanced metadata management
 */

import { v4 as uuidv4 } from 'uuid';
import { RecordMetadata } from '@pinecone-database/pinecone';
import { BaseContextService } from './base-context.service';
import { MetadataValidationService } from './metadata-validation.service';
import {
  BaseContextMetadata,
  ContextType,
  USER_CONTEXT_INDEX,
  UserContextValidationError,
} from './types/context.types';
import { Logger } from '../../logger/logger.interface';
import { PineconeConnectionService } from '../../../pinecone/pinecone-connection.service';
import { LanguageModelProvider } from '../../../connectors/language-model-provider.interface';

/**
 * Retention policy options
 */
export enum RetentionPolicy {
  STANDARD = 'standard', // Default retention (30 days)
  EXTENDED = 'extended', // Extended retention (90 days)
  PERMANENT = 'permanent', // Permanent retention (no deletion)
}

/**
 * Configuration for conversation segmentation
 */
export interface SegmentationConfig {
  enabled: boolean;
  topicChangeThreshold?: number; // Threshold for determining new topic (0-1)
  minSegmentLength?: number; // Minimum number of turns before considering a new segment
  detectTopicChanges?: boolean; // Whether to automatically detect topic changes
  assignTopicNames?: boolean; // Whether to automatically assign topic names
}

/**
 * Options for conversation storage
 */
export interface ConversationStorageOptions {
  retentionPolicy?: RetentionPolicy;
  retentionPriority?: number;
  retentionTags?: string[];
  isHighValue?: boolean;
  segmentId?: string;
  segmentTopic?: string;
  isSegmentStart?: boolean;
  agentId?: string;
  agentName?: string;
  capability?: string;
  agentVersion?: string;
  [key: string]: any;
}

/**
 * Service for managing conversation context operations
 */
export class ConversationContextService extends BaseContextService {
  private metadataValidator: MetadataValidationService;
  private segmentationConfig: SegmentationConfig;
  private languageModelProvider?: LanguageModelProvider;
  private rateLimiter: {
    tokens: number;
    maxTokens: number;
    refillRate: number; // tokens per millisecond
    lastRefill: number;
  };

  /**
   * Default retention periods in days
   */
  private retentionPeriods = {
    [RetentionPolicy.STANDARD]: 30, // 30 days
    [RetentionPolicy.EXTENDED]: 90, // 90 days
    [RetentionPolicy.PERMANENT]: 9999, // ~27 years (effectively permanent)
  };

  // Reusable placeholder vector to avoid repeatedly creating the same array
  private static readonly PLACEHOLDER_VECTOR = Array(3072).fill(0);

  constructor(
    options: {
      pineconeService?: PineconeConnectionService;
      logger?: Logger;
      segmentationConfig?: Partial<SegmentationConfig>;
      retentionPeriods?: Partial<Record<RetentionPolicy, number>>;
      languageModelProvider?: LanguageModelProvider;
      rateLimiter?: {
        maxRequestsPerSecond?: number;
        maxBurstRequests?: number;
      };
    } = {},
  ) {
    // Extract the base service options
    const { pineconeService, logger, ...otherOptions } = options;
    // Pass only the properties that BaseContextService expects
    super({ pineconeService, logger });

    this.metadataValidator = new MetadataValidationService();

    // Initialize segmentation configuration with defaults
    this.segmentationConfig = {
      enabled: options.segmentationConfig?.enabled ?? false,
      topicChangeThreshold:
        options.segmentationConfig?.topicChangeThreshold ?? 0.7,
      minSegmentLength: options.segmentationConfig?.minSegmentLength ?? 5,
      detectTopicChanges:
        options.segmentationConfig?.detectTopicChanges ?? true,
      assignTopicNames: options.segmentationConfig?.assignTopicNames ?? true,
    };

    // Override default retention periods if provided
    if (options.retentionPeriods) {
      this.retentionPeriods = {
        ...this.retentionPeriods,
        ...options.retentionPeriods,
      };
    }

    this.languageModelProvider = options.languageModelProvider;

    // Initialize the rate limiter with defaults
    const maxRequestsPerSecond =
      options.rateLimiter?.maxRequestsPerSecond || 10; // Default to 10 requests per second
    const maxBurstRequests = options.rateLimiter?.maxBurstRequests || 20; // Default to 20 burst requests

    this.rateLimiter = {
      tokens: maxBurstRequests, // Start with full tokens
      maxTokens: maxBurstRequests,
      refillRate: maxRequestsPerSecond / 1000, // Convert to tokens per millisecond
      lastRefill: Date.now(),
    };
  }

  /**
   * Applies rate limiting and returns a promise that resolves when the operation can proceed
   * @private
   */
  private async applyRateLimit(): Promise<void> {
    // Refill tokens based on time elapsed
    const now = Date.now();
    const elapsedMs = now - this.rateLimiter.lastRefill;
    const tokensToAdd = elapsedMs * this.rateLimiter.refillRate;

    this.rateLimiter.tokens = Math.min(
      this.rateLimiter.maxTokens,
      this.rateLimiter.tokens + tokensToAdd,
    );
    this.rateLimiter.lastRefill = now;

    if (this.rateLimiter.tokens < 1) {
      // Calculate wait time to get at least one token
      const msToWait = Math.ceil(
        (1 - this.rateLimiter.tokens) / this.rateLimiter.refillRate,
      );
      this.logger.debug('Rate limit reached, waiting before proceeding', {
        msToWait,
      });

      // Wait for enough tokens
      await new Promise((resolve) => setTimeout(resolve, msToWait));
      return this.applyRateLimit(); // Retry after waiting
    }

    // Consume one token
    this.rateLimiter.tokens -= 1;
  }

  /**
   * Extends executeWithRetry to include rate limiting
   * @private
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationKey: string,
    retries = 3,
  ): Promise<T> {
    // Apply rate limiting before proceeding
    await this.applyRateLimit();

    // Call the parent's executeWithRetry method
    return super.executeWithRetry(operation, operationKey, retries);
  }

  /**
   * Store a conversation turn (message) in the context database with enhanced metadata
   */
  async storeConversationTurn(
    userId: string,
    conversationId: string,
    message: string,
    embeddings: number[],
    role: 'user' | 'assistant' | 'system',
    turnId?: string,
    additionalMetadata: Partial<
      BaseContextMetadata & ConversationStorageOptions
    > = {},
  ): Promise<string> {
    if (!conversationId) {
      throw new UserContextValidationError('Conversation ID is required');
    }

    const recency = Date.now();
    const messageId = turnId || `turn-${uuidv4()}`;

    // Apply retention policy
    const retentionPolicy =
      additionalMetadata.retentionPolicy || RetentionPolicy.STANDARD;
    const retentionDays =
      this.retentionPeriods[retentionPolicy as RetentionPolicy];
    const expiresAt =
      retentionPolicy !== RetentionPolicy.PERMANENT
        ? Date.now() + retentionDays * 24 * 60 * 60 * 1000 // Convert days to milliseconds
        : undefined; // Undefined means no expiration

    // Process segmentation
    const segmentMetadata = await this.processSegmentation(
      userId,
      conversationId,
      message,
      role,
      additionalMetadata,
    );

    // Prepare metadata for storage
    // Convert complex objects to proper format for storage in vector database
    const metadata: Partial<BaseContextMetadata> = {
      contextType: ContextType.CONVERSATION, // Use enum value for type safety
      conversationId,
      turnId: messageId,
      role,
      recency,
      expiresAt,
      retentionPolicy: retentionPolicy as string, // Ensure enum is stored as string
      retentionPriority: additionalMetadata.retentionPriority || 5,
      retentionTags: additionalMetadata.retentionTags || [],
      isHighValue: additionalMetadata.isHighValue === true ? true : false, // Ensure boolean
      // Add timestamp for querying by date ranges
      timestamp: Date.now(),
      // Agent-specific metadata
      agentId: additionalMetadata.agentId,
      agentName: additionalMetadata.agentName,
      capability: additionalMetadata.capability,
      agentVersion: additionalMetadata.agentVersion,
      // Include additional metadata, being careful with types
      ...(additionalMetadata || {}),
      // Segmentation metadata overrides any potential conflicts
      ...segmentMetadata,
    };

    return this.storeUserContext(userId, message, embeddings, metadata);
  }

  /**
   * Process segmentation logic for a conversation turn
   * @private
   */
  private async processSegmentation(
    userId: string,
    conversationId: string,
    message: string,
    role: 'user' | 'assistant' | 'system',
    options: ConversationStorageOptions = {},
  ): Promise<Record<string, any>> {
    // If segmentation is not enabled, return minimal metadata
    if (!this.segmentationConfig.enabled) {
      return {
        segmentId: options.segmentId || conversationId,
        segmentTopic: options.segmentTopic || 'General',
        isSegmentStart: options.isSegmentStart || false,
      };
    }

    // If explicitly marked as segment start, use provided values
    if (options.isSegmentStart) {
      return {
        segmentId: options.segmentId || `segment-${uuidv4()}`,
        segmentTopic: options.segmentTopic || 'New Topic',
        isSegmentStart: true,
        previousSegmentId: await this.getCurrentSegmentId(
          userId,
          conversationId,
        ),
      };
    }

    // If automatic topic detection is enabled, perform semantic analysis
    if (this.segmentationConfig.detectTopicChanges && role === 'user') {
      try {
        // Get current segment ID
        const currentSegmentId = await this.getCurrentSegmentId(
          userId,
          conversationId,
        );

        // Get recent conversation history
        const recentHistory = await this.getConversationHistory(
          userId,
          conversationId,
          this.segmentationConfig.minSegmentLength || 5,
        );

        // If we don't have enough history, continue with current segment
        if (
          recentHistory.length < (this.segmentationConfig.minSegmentLength || 5)
        ) {
          return {
            segmentId: currentSegmentId,
            segmentTopic: options.segmentTopic,
            isSegmentStart: false,
          };
        }

        // Extract recent messages for topic analysis
        const recentMessages = recentHistory
          .map((turn) => turn.metadata?.message || '')
          .join(' ');

        // Check for topic change using semantic similarity if we have an LLM provider
        if (this.languageModelProvider && recentMessages) {
          // Get embeddings for the current message and recent history
          const messageEmbedding =
            await this.languageModelProvider.generateEmbedding(message);
          const historyEmbedding =
            await this.languageModelProvider.generateEmbedding(recentMessages);

          // Calculate semantic similarity (cosine similarity)
          const similarity = this.calculateCosineSimilarity(
            messageEmbedding,
            historyEmbedding,
          );

          // If similarity is below threshold, create a new segment
          if (similarity < this.segmentationConfig.topicChangeThreshold!) {
            const newSegmentId = `segment-${uuidv4()}`;

            // Generate a topic name if enabled
            let segmentTopic = options.segmentTopic || 'New Topic';

            if (
              this.segmentationConfig.assignTopicNames &&
              this.languageModelProvider
            ) {
              try {
                // Use LLM to generate a topic name based on the message
                const topicPrompt = `
Generate a very short (2-4 words) topic name for this message:
"${message}"
The topic should be concise and descriptive. Please provide only the topic name without any explanation or punctuation.
`;

                const topicResponse =
                  await this.languageModelProvider.generateResponse(
                    [{ role: 'user', content: topicPrompt }],
                    { maxTokens: 20, temperature: 0.3 },
                  );

                // Extract the topic name from the response
                const generatedTopic =
                  typeof topicResponse.content === 'string'
                    ? topicResponse.content.trim()
                    : JSON.stringify(topicResponse.content);

                // Use the generated topic if it's not empty
                if (generatedTopic && generatedTopic.length > 0) {
                  segmentTopic = generatedTopic;
                }
              } catch (topicError) {
                this.logger.warn('Failed to generate topic name', {
                  error:
                    topicError instanceof Error
                      ? topicError.message
                      : String(topicError),
                });
                // Continue with default topic name
              }
            }

            this.logger.info('Detected topic change, creating new segment', {
              userId,
              conversationId,
              similarity,
              threshold: this.segmentationConfig.topicChangeThreshold,
              segmentTopic,
            });

            // Return new segment metadata
            return {
              segmentId: newSegmentId,
              segmentTopic,
              isSegmentStart: true,
              previousSegmentId: currentSegmentId,
              topicChangeScore: similarity,
            };
          }
        }

        // No topic change detected or no LLM provider available
        return {
          segmentId: currentSegmentId,
          segmentTopic: options.segmentTopic,
          isSegmentStart: false,
        };
      } catch (error) {
        this.logger.error('Error during semantic topic detection', {
          error: error instanceof Error ? error.message : String(error),
          userId,
          conversationId,
        });

        // Fall back to continuing with current segment
        const currentSegmentId = await this.getCurrentSegmentId(
          userId,
          conversationId,
        );
        return {
          segmentId: currentSegmentId,
          isSegmentStart: false,
        };
      }
    }

    // Default case: continue with current segment
    const currentSegmentId = await this.getCurrentSegmentId(
      userId,
      conversationId,
    );
    return {
      segmentId: currentSegmentId,
      isSegmentStart: false,
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   * @protected
   */
  protected calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must be of the same dimension');
    }

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) {
      return 0; // Avoid division by zero
    }

    return dotProduct / (mag1 * mag2);
  }

  /**
   * Get the current segment ID for a conversation
   * @private
   */
  private async getCurrentSegmentId(
    userId: string,
    conversationId: string,
  ): Promise<string> {
    try {
      // Get the most recent turn
      const history = await this.getConversationHistory(
        userId,
        conversationId,
        1,
      );

      if (history && history.length > 0 && history[0].metadata?.segmentId) {
        return String(history[0].metadata.segmentId);
      }

      // If no existing segment, create a default one
      return `segment-${conversationId}`;
    } catch (error) {
      this.logger.error('Error getting current segment ID', {
        error,
        userId,
        conversationId,
      });
      return `segment-${conversationId}`;
    }
  }

  /**
   * Retrieve conversation history for a specific conversation with enhanced filtering
   */
  async getConversationHistory(
    userId: string,
    conversationId: string,
    limit: number = 20,
    options: {
      beforeTimestamp?: number;
      afterTimestamp?: number;
      segmentId?: string;
      agentId?: string;
      role?: 'user' | 'assistant' | 'system';
      includeMetadata?: boolean;
      sortBy?: 'chronological' | 'relevance';
      relevanceEmbedding?: number[];
      turnIds?: string[];
    } = {},
  ) {
    // Add debugging to see what's being attempted
    this.logger.debug('getConversationHistory parameters', {
      userId,
      conversationId,
      limit,
      options,
    });

    // Perform basic validation
    if (!userId || !conversationId) {
      this.logger.warn(
        'Missing userId or conversationId for conversation history',
        {
          userId,
          conversationId,
        },
      );
      return [];
    }

    try {
      // Optimize query approach based on available parameters
      const isSpecificTurnQuery = options.turnIds && options.turnIds.length > 0;
      const isSpecificRoleQuery = !!options.role;
      const isSpecificSegmentQuery = !!options.segmentId;
      const isSpecificAgentQuery = !!options.agentId;
      const isTimeRangeQuery =
        options.beforeTimestamp || options.afterTimestamp;
      const isRelevanceSort =
        options.sortBy === 'relevance' && options.relevanceEmbedding;

      // Create optimized query plan
      let queryPlan = 'standard';
      let resultLimit = limit;

      // For relevance sort, increase limit to get enough data for sorting
      if (isRelevanceSort) {
        queryPlan = 'relevance';
        resultLimit = limit * 3; // Get more results to sort by relevance
      }
      // For specific turns, use a direct lookup approach
      else if (isSpecificTurnQuery) {
        queryPlan = 'direct_lookup';
        resultLimit = options.turnIds?.length || 0;
      }
      // For time range and other filters, increase limit with 2x factor
      else if (
        isTimeRangeQuery ||
        isSpecificRoleQuery ||
        isSpecificSegmentQuery ||
        isSpecificAgentQuery
      ) {
        queryPlan = 'filtered';
        resultLimit = limit * 2;
      }

      this.logger.debug('Using query plan', {
        queryPlan,
        resultLimit,
        originalLimit: limit,
      });

      // Use a single, optimized query strategy with appropriate filters
      const filter: Record<string, any> = {
        contextType: ContextType.CONVERSATION,
        conversationId, // Always filter by conversation ID directly
      };

      // Apply additional filters as needed
      if (options.role) {
        filter.role = options.role;
      }

      if (options.segmentId) {
        filter.segmentId = options.segmentId;
      }

      if (options.agentId) {
        filter.agentId = options.agentId;
      }

      if (options.turnIds && options.turnIds.length > 0) {
        filter.turnId = { $in: options.turnIds };
      }

      // Add timestamp filters if specified
      if (options.beforeTimestamp || options.afterTimestamp) {
        filter.timestamp = {};
        if (options.afterTimestamp) {
          filter.timestamp.$gte = options.afterTimestamp;
        }
        if (options.beforeTimestamp) {
          filter.timestamp.$lte = options.beforeTimestamp;
        }
      }

      // Use relevance-based search if requested
      const useRelevanceSearch =
        options.sortBy === 'relevance' &&
        options.relevanceEmbedding &&
        options.relevanceEmbedding.length > 0;

      // Select query vector based on search type
      const queryVector = useRelevanceSearch
        ? options.relevanceEmbedding!
        : ConversationContextService.PLACEHOLDER_VECTOR;

      // Increase topK to ensure we get enough results after filtering
      const queryLimit = useRelevanceSearch ? limit * 3 : limit * 2;

      // Execute the query, retrying if needed
      const result = await this.executeWithRetry(async () => {
        return await this.pineconeService.queryVectors(
          USER_CONTEXT_INDEX,
          queryVector,
          {
            topK: queryLimit,
            filter,
            includeValues: false,
            includeMetadata: options.includeMetadata !== false,
          },
          userId,
        );
      }, 'getConversationHistory');

      let matches = result.matches || [];

      // Sort results: first by relevance (if vector search), then chronologically
      if (useRelevanceSearch) {
        // Already sorted by relevance from vector search
        // Just enforce limit
        matches = matches.slice(0, limit);
      } else {
        // Sort chronologically
        matches.sort((a, b) => {
          const aTime = (a.metadata?.timestamp as number) || 0;
          const bTime = (b.metadata?.timestamp as number) || 0;
          return aTime - bTime;
        });

        // Apply limit after sorting
        matches = matches.slice(0, limit);
      }

      return matches;
    } catch (error) {
      // Log error and return empty array
      this.logger.error('Failed to retrieve conversation history', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        conversationId,
      });
      return [];
    }
  }

  /**
   * Get all segments for a conversation
   */
  async getConversationSegments(
    userId: string,
    conversationId: string,
  ): Promise<
    Array<{
      segmentId: string;
      segmentTopic?: string;
      turnCount: number;
      firstTimestamp: number;
      lastTimestamp: number;
      agentIds?: string[];
    }>
  > {
    const turns = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          ConversationContextService.PLACEHOLDER_VECTOR,
          {
            topK: 1000,
            filter: {
              contextType: ContextType.CONVERSATION,
              conversationId,
            },
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `getConversationSegments:${userId}:${conversationId}`,
    );

    const segments = new Map<
      string,
      {
        segmentId: string;
        segmentTopic?: string;
        turnCount: number;
        firstTimestamp: number;
        lastTimestamp: number;
        agentIds: Set<string>;
      }
    >();

    if (!turns.matches || turns.matches.length === 0) {
      return [];
    }

    // Group by segment ID
    for (const turn of turns.matches) {
      const segmentId = turn.metadata?.segmentId as string;
      const timestamp = (turn.metadata?.timestamp as number) || 0;
      const segmentTopic = turn.metadata?.segmentTopic as string;
      const agentId = turn.metadata?.agentId as string;

      if (segmentId) {
        const existing = segments.get(segmentId);
        if (existing) {
          existing.turnCount++;
          existing.firstTimestamp = Math.min(
            existing.firstTimestamp,
            timestamp,
          );
          existing.lastTimestamp = Math.max(existing.lastTimestamp, timestamp);
          if (agentId) existing.agentIds.add(agentId);
          // Update topic if not set
          if (!existing.segmentTopic && segmentTopic) {
            existing.segmentTopic = segmentTopic;
          }
        } else {
          segments.set(segmentId, {
            segmentId,
            segmentTopic,
            turnCount: 1,
            firstTimestamp: timestamp,
            lastTimestamp: timestamp,
            agentIds: new Set(agentId ? [agentId] : []),
          });
        }
      }
    }

    // Convert to array and format for return
    return Array.from(segments.values())
      .map((segment) => ({
        segmentId: segment.segmentId,
        segmentTopic: segment.segmentTopic,
        turnCount: segment.turnCount,
        firstTimestamp: segment.firstTimestamp,
        lastTimestamp: segment.lastTimestamp,
        agentIds:
          segment.agentIds.size > 0 ? Array.from(segment.agentIds) : undefined,
      }))
      .sort((a, b) => a.firstTimestamp - b.firstTimestamp);
  }

  /**
   * Get conversations by agent ID
   */
  async getConversationsByAgent(
    userId: string,
    agentId: string,
    limit: number = 10,
  ): Promise<
    Array<{
      conversationId: string;
      turnCount: number;
      firstTimestamp: number;
      lastTimestamp: number;
    }>
  > {
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          ConversationContextService.PLACEHOLDER_VECTOR,
          {
            topK: 1000,
            filter: {
              contextType: ContextType.CONVERSATION,
              agentId,
            },
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `getConversationsByAgent:${userId}:${agentId}`,
    );

    const turns = result.matches || [];

    // Group by conversation ID
    const convMap = new Map<
      string,
      {
        conversationId: string;
        turnCount: number;
        firstTimestamp: number;
        lastTimestamp: number;
      }
    >();

    for (const turn of turns) {
      const convId = turn.metadata?.conversationId as string;
      const timestamp = (turn.metadata?.timestamp as number) || 0;

      if (convId) {
        const existing = convMap.get(convId);
        if (existing) {
          existing.turnCount++;
          existing.firstTimestamp = Math.min(
            existing.firstTimestamp,
            timestamp,
          );
          existing.lastTimestamp = Math.max(existing.lastTimestamp, timestamp);
        } else {
          convMap.set(convId, {
            conversationId: convId,
            turnCount: 1,
            firstTimestamp: timestamp,
            lastTimestamp: timestamp,
          });
        }
      }
    }

    return Array.from(convMap.values())
      .sort((a, b) => b.lastTimestamp - a.lastTimestamp)
      .slice(0, limit);
  }

  /**
   * Update the retention policy for a conversation or specific turns
   */
  async updateRetentionPolicy(
    userId: string,
    conversationId: string,
    policy: RetentionPolicy,
    options: {
      turnIds?: string[];
      segmentId?: string;
      retentionPriority?: number;
      retentionTags?: string[];
      isHighValue?: boolean;
    } = {},
  ): Promise<number> {
    // Calculate the new expiration date based on retention policy
    const retentionDays = this.retentionPeriods[policy];
    const expiresAt =
      policy !== RetentionPolicy.PERMANENT
        ? Date.now() + retentionDays * 24 * 60 * 60 * 1000
        : undefined;

    // Build the filter to identify records to update
    const filter: Record<string, any> = {
      contextType: ContextType.CONVERSATION,
      conversationId,
    };

    if (options.turnIds && options.turnIds.length > 0) {
      filter.turnId = { $in: options.turnIds };
    }

    if (options.segmentId) {
      filter.segmentId = options.segmentId;
    }

    // Find matching records
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          ConversationContextService.PLACEHOLDER_VECTOR,
          {
            topK: 1000,
            filter,
            includeValues: true, // We need the vector values for update
            includeMetadata: true, // We need existing metadata to merge with updates
          },
          userId,
        ),
      `findRecordsForRetentionUpdate:${userId}:${conversationId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      return 0;
    }

    try {
      // Batch update records
      const updateBatchSize = 100; // Reasonable batch size for updates
      const recordsToUpdate = result.matches
        .filter((match) => match.values !== undefined) // Skip records without vector values
        .map((match) => {
          const currentMetadata: Partial<BaseContextMetadata> =
            match.metadata || {};

          // Prepare updated metadata - type-safe with BaseContextMetadata
          const updatedMetadata: Partial<BaseContextMetadata> = {
            ...currentMetadata,
            retentionPolicy: policy as string, // Store as string in metadata
            expiresAt: expiresAt,
            lastUpdated: Date.now(),
          };

          // Add additional metadata if provided
          if (options.retentionPriority !== undefined) {
            updatedMetadata.retentionPriority = options.retentionPriority;
          }

          if (options.retentionTags) {
            updatedMetadata.retentionTags = options.retentionTags;
          }

          if (options.isHighValue !== undefined) {
            updatedMetadata.isHighValue = options.isHighValue;
          }

          return {
            id: match.id,
            values: match.values as number[], // TypeScript needs explicit cast here
            metadata: updatedMetadata as RecordMetadata, // Cast for Pinecone compatibility
          };
        });

      // Process updates in batches
      for (let i = 0; i < recordsToUpdate.length; i += updateBatchSize) {
        const batch = recordsToUpdate.slice(i, i + updateBatchSize);
        await this.executeWithRetry(
          () =>
            this.pineconeService.upsertVectors(
              USER_CONTEXT_INDEX,
              batch,
              userId,
            ),
          `updateRetentionPolicy:${userId}:${conversationId}:batch${Math.floor(i / updateBatchSize)}`,
        );
      }

      this.logger.info(
        `Successfully updated retention policy for ${recordsToUpdate.length} records`,
        {
          userId,
          conversationId,
          policy,
          expiresAt,
          affectedRecords: recordsToUpdate.length,
        },
      );

      return recordsToUpdate.length;
    } catch (error) {
      this.logger.error('Failed to update retention policy', {
        userId,
        conversationId,
        policy,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete a specific conversation and all its turns
   */
  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<number> {
    // Find all turns in this conversation
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          ConversationContextService.PLACEHOLDER_VECTOR,
          {
            topK: 1000,
            filter: {
              contextType: ContextType.CONVERSATION,
              conversationId,
            },
            includeValues: false,
            includeMetadata: false,
          },
          userId,
        ),
      `findConversationTurns:${userId}:${conversationId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      return 0;
    }

    // Extract IDs of turns
    const turnIds = result.matches.map((match: any) => match.id);

    // Delete the turns
    await this.executeWithRetry(
      () =>
        this.pineconeService.deleteVectors(USER_CONTEXT_INDEX, turnIds, userId),
      `deleteConversationTurns:${userId}:${conversationId}`,
    );

    return turnIds.length;
  }

  /**
   * Delete conversations based on retention policy
   */
  async pruneExpiredConversations(userId?: string): Promise<number> {
    const currentTime = Date.now();

    // Build filter for expired records
    const filter: Record<string, any> = {
      contextType: ContextType.CONVERSATION,
      expiresAt: { $lt: currentTime },
      markedForDeletion: { $ne: false }, // Don't delete records explicitly marked to keep
    };

    // If user ID is provided, limit to that user
    if (userId) {
      filter.userId = userId;
    }

    // Find expired records
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          ConversationContextService.PLACEHOLDER_VECTOR,
          {
            topK: 10000, // Set a reasonable limit
            filter,
            includeValues: false,
            includeMetadata: false,
          },
          userId || '*', // If no userId, use wildcard
        ),
      `findExpiredConversationTurns`,
    );

    if (!result.matches || result.matches.length === 0) {
      return 0;
    }

    // Extract IDs of expired turns
    const turnIds = result.matches.map((match: any) => match.id);

    // Delete the expired turns
    await this.executeWithRetry(
      () =>
        this.pineconeService.deleteVectors(
          USER_CONTEXT_INDEX,
          turnIds,
          userId || '*',
        ),
      `deleteExpiredConversationTurns`,
    );

    return turnIds.length;
  }

  /**
   * List all conversations for a user
   */
  async listUserConversations(userId: string): Promise<
    Array<{
      conversationId: string;
      turnCount: number;
      firstTimestamp: number;
      lastTimestamp: number;
      agentIds?: string[];
      segments?: number;
      retentionPolicy?: RetentionPolicy;
    }>
  > {
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          ConversationContextService.PLACEHOLDER_VECTOR,
          {
            topK: 10000,
            filter: {
              contextType: ContextType.CONVERSATION,
              userId,
            },
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `listUserConversations:${userId}`,
    );

    const turns = result.matches || [];

    // Group by conversation ID
    const convMap = new Map<
      string,
      {
        conversationId: string;
        turnCount: number;
        firstTimestamp: number;
        lastTimestamp: number;
        agentIds: Set<string>;
        segmentIds: Set<string>;
        retentionPolicy?: RetentionPolicy;
      }
    >();

    for (const turn of turns) {
      const convId = turn.metadata?.conversationId as string;
      const timestamp = (turn.metadata?.timestamp as number) || 0;
      const agentId = turn.metadata?.agentId as string;
      const segmentId = turn.metadata?.segmentId as string;
      const policy = turn.metadata?.retentionPolicy as RetentionPolicy;

      if (convId) {
        const existing = convMap.get(convId);
        if (existing) {
          existing.turnCount++;
          existing.firstTimestamp = Math.min(
            existing.firstTimestamp,
            timestamp,
          );
          existing.lastTimestamp = Math.max(existing.lastTimestamp, timestamp);
          if (agentId) existing.agentIds.add(agentId);
          if (segmentId) existing.segmentIds.add(segmentId);
          // Update retention policy if this turn has a higher priority retention
          if (
            policy === RetentionPolicy.PERMANENT ||
            (policy === RetentionPolicy.EXTENDED &&
              existing.retentionPolicy === RetentionPolicy.STANDARD)
          ) {
            existing.retentionPolicy = policy;
          }
        } else {
          convMap.set(convId, {
            conversationId: convId,
            turnCount: 1,
            firstTimestamp: timestamp,
            lastTimestamp: timestamp,
            agentIds: new Set(agentId ? [agentId] : []),
            segmentIds: new Set(segmentId ? [segmentId] : []),
            retentionPolicy: policy,
          });
        }
      }
    }

    return Array.from(convMap.values())
      .map((conv) => ({
        conversationId: conv.conversationId,
        turnCount: conv.turnCount,
        firstTimestamp: conv.firstTimestamp,
        lastTimestamp: conv.lastTimestamp,
        agentIds:
          conv.agentIds.size > 0 ? Array.from(conv.agentIds) : undefined,
        segments: conv.segmentIds.size,
        retentionPolicy: conv.retentionPolicy,
      }))
      .sort((a, b) => b.lastTimestamp - a.lastTimestamp);
  }

  /**
   * Search conversations by semantic similarity
   */
  async searchConversations(
    userId: string,
    queryEmbedding: number[],
    options: {
      conversationIds?: string[];
      role?: 'user' | 'assistant' | 'system';
      agentId?: string;
      segmentId?: string;
      capability?: string;
      retentionPriority?: number;
      minRelevanceScore?: number;
      maxResults?: number;
      timeRangeStart?: number;
      timeRangeEnd?: number;
    } = {},
  ) {
    const filter: Record<string, any> = {
      contextType: ContextType.CONVERSATION,
    };

    if (options.conversationIds && options.conversationIds.length > 0) {
      filter.conversationId = { $in: options.conversationIds };
    }

    if (options.role) {
      filter.role = options.role;
    }

    if (options.agentId) {
      filter.agentId = options.agentId;
    }

    if (options.segmentId) {
      filter.segmentId = options.segmentId;
    }

    if (options.capability) {
      filter.capability = options.capability;
    }

    if (options.retentionPriority) {
      filter.retentionPriority = { $gte: options.retentionPriority };
    }

    if (options.timeRangeStart || options.timeRangeEnd) {
      filter.timestamp = {};
      if (options.timeRangeStart) {
        filter.timestamp.$gte = options.timeRangeStart;
      }
      if (options.timeRangeEnd) {
        filter.timestamp.$lte = options.timeRangeEnd;
      }
    }

    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          queryEmbedding,
          {
            topK: options.maxResults || 10,
            filter,
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `searchConversations:${userId}`,
    );

    let matches = result.matches || [];

    // Filter by minimum score if specified
    if (options.minRelevanceScore !== undefined) {
      matches = matches.filter(
        (match) =>
          match.score !== undefined &&
          match.score >= (options.minRelevanceScore || 0),
      );
    }

    // Format the results
    return matches.map((match) => ({
      id: match.id,
      score: match.score,
      conversationId: match.metadata?.conversationId,
      turnId: match.metadata?.turnId,
      role: match.metadata?.role,
      agentId: match.metadata?.agentId,
      agentName: match.metadata?.agentName,
      capability: match.metadata?.capability,
      segmentId: match.metadata?.segmentId,
      segmentTopic: match.metadata?.segmentTopic,
      message: match.metadata?.message || match.metadata?.content,
      timestamp: match.metadata?.timestamp,
      metadata: match.metadata,
    }));
  }

  /**
   * Configure segmentation settings
   */
  configureSegmentation(config: Partial<SegmentationConfig>): void {
    this.segmentationConfig = {
      ...this.segmentationConfig,
      ...config,
    };

    this.logger.info(
      'Updated conversation segmentation configuration',
      this.segmentationConfig,
    );
  }

  /**
   * Configure retention periods
   */
  configureRetentionPeriods(
    periods: Partial<Record<RetentionPolicy, number>>,
  ): void {
    this.retentionPeriods = {
      ...this.retentionPeriods,
      ...periods,
    };

    this.logger.info(
      'Updated conversation retention periods',
      this.retentionPeriods,
    );
  }

  /**
   * Create a context window for specific agent needs
   * @param userId User identifier
   * @param conversationId Conversation identifier
   * @param options Context window configuration options
   */
  async createContextWindow(
    userId: string,
    conversationId: string,
    options: {
      windowSize?: number;
      includeCurrentSegmentOnly?: boolean;
      includeAgentIds?: string[];
      excludeAgentIds?: string[];
      relevanceThreshold?: number;
      relevanceQuery?: string;
      relevanceEmbedding?: number[];
      recencyWeight?: number;
      filterByCapabilities?: string[];
      maxTokens?: number;
      includeTurnMetadata?: boolean;
    } = {},
  ): Promise<{
    messages: Array<any>;
    contextSummary?: string;
    segmentInfo?: {
      id: string;
      topic?: string;
    };
    tokenCount?: number;
  }> {
    // Set default window size
    const windowSize = options.windowSize || 10;

    // Get the current segment if needed
    let segmentId: string | undefined;
    if (options.includeCurrentSegmentOnly) {
      segmentId = await this.getCurrentSegmentId(userId, conversationId);
    }

    // Build filter criteria
    const filterOptions: any = {
      segmentId,
      includeMetadata: options.includeTurnMetadata !== false,
    };

    // Add agent filters
    if (options.includeAgentIds && options.includeAgentIds.length > 0) {
      // We will filter post-query as Pinecone doesn't support $in operations directly
      filterOptions.agentFilter = {
        include: options.includeAgentIds,
        exclude: options.excludeAgentIds || [],
      };
    } else if (options.excludeAgentIds && options.excludeAgentIds.length > 0) {
      filterOptions.agentFilter = {
        exclude: options.excludeAgentIds,
      };
    }

    // Configure relevance search if specified
    if (options.relevanceQuery || options.relevanceEmbedding) {
      filterOptions.sortBy = 'relevance';
      filterOptions.relevanceEmbedding = options.relevanceEmbedding;
    }

    // Retrieve the conversation history
    let messages = await this.getConversationHistory(
      userId,
      conversationId,
      windowSize * 2, // Fetch more initially as we may filter some out
      filterOptions,
    );

    // Post-processing: Apply additional filters that weren't handled by database query
    if (filterOptions.agentFilter) {
      messages = messages.filter((message) => {
        const messageAgentId = message.metadata?.agentId;

        // If include filter is set, message must match one of the included agent IDs
        if (
          filterOptions.agentFilter.include &&
          filterOptions.agentFilter.include.length > 0
        ) {
          if (
            !messageAgentId ||
            !filterOptions.agentFilter.include.includes(messageAgentId)
          ) {
            return false;
          }
        }

        // If exclude filter is set, message must not match any excluded agent IDs
        if (
          filterOptions.agentFilter.exclude &&
          filterOptions.agentFilter.exclude.length > 0
        ) {
          if (
            messageAgentId &&
            filterOptions.agentFilter.exclude.includes(messageAgentId)
          ) {
            return false;
          }
        }

        return true;
      });
    }

    // Filter by capabilities if specified
    if (
      options.filterByCapabilities &&
      options.filterByCapabilities.length > 0
    ) {
      messages = messages.filter((message) => {
        const capability = message.metadata?.capability as string | undefined;
        return capability && options.filterByCapabilities?.includes(capability);
      });
    }

    // Apply recency weighting if doing relevance search with recency bias
    if (
      options.recencyWeight &&
      options.recencyWeight > 0 &&
      options.relevanceEmbedding
    ) {
      const maxTimestamp = Math.max(
        ...messages.map((m) => (m.metadata?.timestamp as number) || 0),
      );
      const minTimestamp = Math.min(
        ...messages.map((m) => (m.metadata?.timestamp as number) || 0),
      );
      const timeRange = maxTimestamp - minTimestamp || 1; // Avoid division by zero

      // Adjust scores based on recency
      messages = messages.map((message) => {
        const timestamp = (message.metadata?.timestamp as number) || 0;
        const recencyScore = (timestamp - minTimestamp) / timeRange;
        const originalScore = message.score || 0;

        // Weighted average of relevance and recency
        const combinedScore =
          originalScore * (1 - options.recencyWeight!) +
          recencyScore * options.recencyWeight!;

        return {
          ...message,
          score: combinedScore,
        };
      });

      // Re-sort by combined score
      messages.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    // Apply relevance threshold if specified
    if (options.relevanceThreshold && options.relevanceThreshold > 0) {
      messages = messages.filter(
        (message) => (message.score || 0) >= (options.relevanceThreshold || 0),
      );
    }

    // Limit to window size after all filtering
    messages = messages.slice(0, windowSize);

    // Get segment information if this is a segment-specific context window
    let segmentInfo;
    if (segmentId) {
      const segments = await this.getConversationSegments(
        userId,
        conversationId,
      );
      const segment = segments.find((s) => s.segmentId === segmentId);
      if (segment) {
        segmentInfo = {
          id: segment.segmentId,
          topic: segment.segmentTopic,
        };
      }
    }

    // Calculate token count if maxTokens is specified
    // This is a simple approximation assuming 1 token per 4 characters
    let tokenCount;
    if (options.maxTokens) {
      const totalContent = messages.reduce((content, message) => {
        return content + ((message.metadata?.message as string) || '');
      }, '');
      tokenCount = Math.ceil(totalContent.length / 4);
    }

    // If token count exceeds the max, truncate messages
    if (tokenCount && options.maxTokens && tokenCount > options.maxTokens) {
      // Sort by importance (keeping most recent and most relevant)
      const sortedByImportance = [...messages].sort((a, b) => {
        const scoreA =
          (a.score || 0) +
          ((a.metadata?.timestamp as number) || 0) / Date.now();
        const scoreB =
          (b.score || 0) +
          ((b.metadata?.timestamp as number) || 0) / Date.now();
        return scoreB - scoreA;
      });

      // Keep messages until we reach the token limit
      let currentTokens = 0;
      const keptMessages: any[] = [];
      for (const message of sortedByImportance) {
        const messageContent = (message.metadata?.message as string) || '';
        const messageTokens = Math.ceil(messageContent.length / 4);

        if (currentTokens + messageTokens <= options.maxTokens) {
          keptMessages.push(message);
          currentTokens += messageTokens;
        }
      }

      // Restore original order
      messages = messages.filter((msg) => keptMessages.includes(msg));
      tokenCount = currentTokens;
    }

    return {
      messages,
      segmentInfo,
      tokenCount,
    };
  }

  /**
   * Generate a summary for a conversation segment to provide context
   * @param userId User identifier
   * @param conversationId Conversation identifier
   * @param segmentId Optional segment ID (defaults to current segment)
   */
  async generateContextSummary(
    userId: string,
    conversationId: string,
    segmentId?: string,
  ): Promise<string> {
    // If segment ID not provided, get current segment
    if (!segmentId) {
      segmentId = await this.getCurrentSegmentId(userId, conversationId);
    }

    // Get the segment messages
    const messages = await this.getConversationHistory(
      userId,
      conversationId,
      50, // Reasonable number of messages to summarize
      { segmentId },
    );

    if (messages.length === 0) {
      return 'No conversation history available.';
    }

    try {
      // Get segment information
      const segments = await this.getConversationSegments(
        userId,
        conversationId,
      );
      const segment = segments.find((s) => s.segmentId === segmentId);

      // Format the conversation for summarization
      const formattedConversation = messages
        .map((message) => {
          const role = message.metadata?.role || 'unknown';
          const content = message.metadata?.message || '';
          return `${role}: ${content}`;
        })
        .join('\n');

      // Use a proper LLM service to generate the summary
      // This requires an LLM connector to be passed to the service
      // In a real implementation, this would be injected as a dependency
      if (this.languageModelProvider) {
        const prompt = `
Please generate a concise summary of the following conversation segment.
Focus on the key points, decisions made, questions asked, and any action items.
Keep the summary informative but brief.

CONVERSATION:
${formattedConversation}
`;

        const response = await this.languageModelProvider.generateResponse(
          [
            {
              role: 'user',
              content: prompt,
            },
          ],
          {
            maxTokens: 250,
            temperature: 0.3, // Lower temperature for more focused/factual summary
          },
        );

        this.logger.info('Generated conversation summary using LLM', {
          userId,
          conversationId,
          segmentId,
          messageCount: messages.length,
        });

        return typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content);
      }

      // Fallback if no LLM connector is available
      const messageCount = messages.length;
      const topic = segment?.segmentTopic || 'Unspecified topic';
      const firstTimestamp = new Date(
        segment?.firstTimestamp || Date.now(),
      ).toLocaleString();
      const lastTimestamp = new Date(
        segment?.lastTimestamp || Date.now(),
      ).toLocaleString();

      return `This conversation segment "${topic}" contains ${messageCount} messages from ${firstTimestamp} to ${lastTimestamp}. The conversation involves ${new Set(messages.map((m) => m.metadata?.role)).size} participants.`;
    } catch (error) {
      this.logger.error('Error generating context summary', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        conversationId,
        segmentId,
      });

      // Return a basic summary in case of error
      return `Conversation segment with ${messages.length} messages. Summary generation failed.`;
    }
  }
}
