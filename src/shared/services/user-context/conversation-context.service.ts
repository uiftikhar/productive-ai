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

  /**
   * Default retention periods in days
   */
  private retentionPeriods = {
    [RetentionPolicy.STANDARD]: 30, // 30 days
    [RetentionPolicy.EXTENDED]: 90, // 90 days
    [RetentionPolicy.PERMANENT]: 9999, // ~27 years (effectively permanent)
  };

  constructor(
    options: {
      pineconeService?: PineconeConnectionService;
      logger?: Logger;
      segmentationConfig?: Partial<SegmentationConfig>;
      retentionPeriods?: Partial<Record<RetentionPolicy, number>>;
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

    // Pinecone metadata only accepts string values for non-primitive types
    // We need to ensure all values are correctly formatted for storage
    // TODO: Fix type error - investigate how BaseContextService's prepareMetadataForStorage
    // handles different value types and ensure we're using compatible types
    const metadata: Partial<BaseContextMetadata> = {
      contextType: ContextType.CONVERSATION,
      conversationId,
      turnId: messageId,
      role,
      recency,
      expiresAt,
      retentionPolicy: retentionPolicy as string, // Ensure enum is stored as string
      retentionPriority: additionalMetadata.retentionPriority || 5,
      retentionTags: additionalMetadata.retentionTags || [],
      isHighValue: additionalMetadata.isHighValue === true ? true : false, // Ensure boolean
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

    // If automatic topic detection is enabled, check for topic changes
    // This is a placeholder - in a real implementation, we would use
    // semantic analysis to detect topic changes
    if (this.segmentationConfig.detectTopicChanges && role === 'user') {
      // For now, just return the current segment ID
      const currentSegmentId = await this.getCurrentSegmentId(
        userId,
        conversationId,
      );

      return {
        segmentId: currentSegmentId,
        segmentTopic: options.segmentTopic,
        isSegmentStart: false,
      };
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
    } = {},
  ) {
    const filter: Record<string, any> = {
      contextType: ContextType.CONVERSATION,
      conversationId,
    };

    if (options.beforeTimestamp) {
      filter.timestamp = filter.timestamp || {};
      filter.timestamp.$lt = options.beforeTimestamp;
    }

    if (options.afterTimestamp) {
      filter.timestamp = filter.timestamp || {};
      filter.timestamp.$gte = options.afterTimestamp;
    }

    if (options.segmentId) {
      filter.segmentId = options.segmentId;
    }

    if (options.agentId) {
      filter.agentId = options.agentId;
    }

    if (options.role) {
      filter.role = options.role;
    }

    // Use a proper placeholder vector for a metadata-only search
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          Array(3072).fill(0), // Placeholder vector filled with zeros - matching index dimension
          {
            topK: limit,
            filter,
            includeValues: false,
            includeMetadata: options.includeMetadata !== false, // Default to true
          },
          userId,
        ),
      `getConversationHistory:${userId}:${conversationId}`,
    );

    const turns = result.matches || [];

    // Sort turns by timestamp
    return turns.sort((a, b) => {
      const timestampA = (a.metadata?.timestamp as number) || 0;
      const timestampB = (b.metadata?.timestamp as number) || 0;
      return timestampA - timestampB;
    });
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
          Array(3072).fill(0),
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
          Array(3072).fill(0),
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
          Array(3072).fill(0),
          {
            topK: 1000,
            filter,
            includeValues: false,
            includeMetadata: false,
          },
          userId,
        ),
      `findRecordsForRetentionUpdate:${userId}:${conversationId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      return 0;
    }

    // Extract IDs of matching records
    const recordIds = result.matches.map((match) => match.id);

    // For real implementation, we would update these records in the vector DB
    // This would require extending the Pinecone service with an update method

    // For now, log the operation
    this.logger.info(
      `Would update retention policy for ${recordIds.length} records`,
      {
        policy,
        expiresAt,
        recordIds: recordIds.length,
      },
    );

    // Return the number of records that would be updated
    return recordIds.length;
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
          Array(3072).fill(0), // Placeholder vector filled with zeros - matching index dimension
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
          Array(3072).fill(0),
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
          Array(3072).fill(0), // Placeholder vector filled with zeros - matching index dimension
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
}
