/**
 * Theme Management Service
 * Handles theme extraction, relationship tracking, and evolution monitoring
 */

import { RecordMetadata } from '@pinecone-database/pinecone';
import { BaseContextService } from './base-context.service.ts';
import { MetadataValidationService } from './metadata-validation.service.ts';
import {
  BaseContextMetadata,
  ContextType,
  USER_CONTEXT_INDEX,
  UserContextNotFoundError,
  UserRole,
} from '../types/context.types.ts';
import {
  ThemeRelationship,
  ThemeOrigin,
  ThemeEvolution,
  ThemeMetadata,
} from '../types/theme.types.ts';
import { UserContextMetadata } from '../user-context.service.ts';

/**
 * Service for managing theme-related operations
 */
export class ThemeManagementService extends BaseContextService {
  private metadataValidator: MetadataValidationService;

  constructor(options: any = {}) {
    super(options);
    this.metadataValidator = new MetadataValidationService();
  }

  /**
   * Add a theme to an existing context item
   * @param userId User identifier
   * @param contextId Context item identifier
   * @param themeId Theme identifier
   * @param themeName Theme name
   * @param relevanceScore Relevance score of the theme to this context
   */
  async addThemeToContext(
    userId: string,
    contextId: string,
    themeId: string,
    themeName: string,
    relevanceScore: number = 0.5,
  ): Promise<void> {
    // Validate parameters
    this.metadataValidator.validateAllMetadata({
      themeRelevance: { [themeId]: relevanceScore },
    });

    // Get the current context
    const response = await this.pineconeService.fetchVectors(
      USER_CONTEXT_INDEX,
      [contextId],
      userId,
    );

    if (!response.records || !response.records[contextId]) {
      throw new UserContextNotFoundError(contextId, userId);
    }

    const record = response.records[contextId];
    const metadata = record.metadata || {};

    // Update theme arrays
    const themeIds = Array.isArray(metadata.themeIds)
      ? [...metadata.themeIds]
      : [];
    const themeNames = Array.isArray(metadata.themeNames)
      ? [...metadata.themeNames]
      : [];

    if (!themeIds.includes(themeId)) {
      themeIds.push(themeId);
      themeNames.push(themeName);
    }

    // Update theme relevance - fix type issue with proper Record typing
    const themeRelevance: Record<string, number> = {};

    // Copy existing theme relevance if it exists
    if (
      typeof metadata.themeRelevance === 'object' &&
      metadata.themeRelevance !== null
    ) {
      // Handle the case where themeRelevance might be stored as a string
      if (typeof metadata.themeRelevance === 'string') {
        try {
          const parsed = JSON.parse(metadata.themeRelevance);
          if (typeof parsed === 'object' && parsed !== null) {
            Object.entries(parsed).forEach(([key, value]) => {
              if (typeof value === 'number') {
                themeRelevance[key] = value;
              }
            });
          }
        } catch (e) {
          this.logger.warn('Failed to parse themeRelevance string', {
            error: e,
          });
        }
      } else {
        // Handle as object
        Object.entries(metadata.themeRelevance as Record<string, any>).forEach(
          ([key, value]) => {
            if (typeof value === 'number') {
              themeRelevance[key] = value;
            }
          },
        );
      }
    }

    // Add or update the theme relevance
    themeRelevance[themeId] = relevanceScore;

    // Update the record
    await this.pineconeService.upsertVectors(
      USER_CONTEXT_INDEX,
      [
        {
          id: contextId,
          values: this.ensureNumberArray(record.values),
          metadata: this.prepareMetadataForStorage({
            ...metadata,
            themeIds,
            themeNames,
            themeRelevance,
            lastUpdatedAt: Date.now(),
          }),
        },
      ],
      userId,
    );

    this.logger.debug('Added theme to context', {
      userId,
      contextId,
      themeId,
      themeName,
    });
  }

  /**
   * Update theme relationships for a context item
   * @param userId User identifier
   * @param contextId Context item identifier
   * @param themeId The ID of the theme to update relationships for
   * @param relationships An array of ThemeRelationship objects defining the relationships
   * @returns The updated metadata
   */
  async updateThemeRelationships(
    userId: string,
    contextId: string,
    themeId: string,
    newRelationships: ThemeRelationship[],
  ): Promise<UserContextMetadata> {
    // Get the current context
    const response = await this.pineconeService.fetchVectors(
      USER_CONTEXT_INDEX,
      [contextId],
      userId,
    );

    if (!response.records || !response.records[contextId]) {
      throw new UserContextNotFoundError(contextId, userId);
    }

    const record = response.records[contextId];
    const metadata = record.metadata || {};

    // Parse existing relationships if stored as string
    let existingRelationships: ThemeRelationship[] = [];
    if (metadata.themeRelationships) {
      if (typeof metadata.themeRelationships === 'string') {
        try {
          const parsed = JSON.parse(
            metadata.themeRelationships,
          ) as ThemeRelationship[];
          if (Array.isArray(parsed)) {
            // Cast to unknown first, then to ThemeRelationship[]
            existingRelationships = parsed;
          }
        } catch (e) {
          // If parsing fails, start with empty array
          existingRelationships = [];
        }
      } else if (Array.isArray(metadata.themeRelationships)) {
        // Cast to unknown first, then to ThemeRelationship[]
        existingRelationships =
          metadata.themeRelationships as unknown as ThemeRelationship[];
      }
    }

    // Filter out any existing relationships for this theme
    const filteredRelationships = existingRelationships.filter(
      (rel) => rel.relatedThemeId !== themeId,
    );

    // Add new relationships
    const updatedRelationships = [
      ...filteredRelationships,
      ...newRelationships,
    ];

    // Ensure we have all required base properties
    const baseProperties: BaseContextMetadata = {
      userId: typeof metadata.userId === 'string' ? metadata.userId : userId,
      timestamp:
        typeof metadata.timestamp === 'number'
          ? metadata.timestamp
          : Date.now(),
      // Include other required fields with fallbacks
      source: typeof metadata.source === 'string' ? metadata.source : '',
      category: typeof metadata.category === 'string' ? metadata.category : '',
      relevanceScore:
        typeof metadata.relevanceScore === 'number'
          ? metadata.relevanceScore
          : 0,
    };

    // Create updated metadata with all existing fields plus updated relationships
    const updatedMetadata: UserContextMetadata = {
      ...metadata,
      ...baseProperties,
      themeRelationships: updatedRelationships,
    };

    // Save updated metadata
    await this.pineconeService.upsertVectors(
      USER_CONTEXT_INDEX,
      [
        {
          id: contextId,
          values: this.ensureNumberArray(record.values),
          metadata: this.prepareMetadataForStorage(updatedMetadata),
        },
      ],
      userId,
    );

    return updatedMetadata;
  }

  /**
   * Add theme origin information to a context item
   * @param userId User identifier
   * @param contextId Context item identifier
   * @param themeOrigin Theme origin information
   */
  async addThemeOrigin(
    userId: string,
    contextId: string,
    themeOrigin: ThemeOrigin,
  ): Promise<void> {
    // Get the current context
    const response = await this.pineconeService.fetchVectors(
      USER_CONTEXT_INDEX,
      [contextId],
      userId,
    );

    if (!response.records || !response.records[contextId]) {
      throw new UserContextNotFoundError(contextId, userId);
    }

    const record = response.records[contextId];
    const metadata = record.metadata || {};

    // Update the record
    await this.pineconeService.upsertVectors(
      USER_CONTEXT_INDEX,
      [
        {
          id: contextId,
          values: this.ensureNumberArray(record.values),
          metadata: this.prepareMetadataForStorage({
            ...metadata,
            themeOrigin,
            lastUpdatedAt: Date.now(),
          }),
        },
      ],
      userId,
    );

    this.logger.debug('Added theme origin', {
      userId,
      contextId,
      originSource: themeOrigin.sourceType,
    });
  }

  /**
   * Update theme evolution information
   * @param userId User identifier
   * @param contextId Context item identifier
   * @param themeEvolution Theme evolution information
   */
  async updateThemeEvolution(
    userId: string,
    contextId: string,
    themeEvolution: ThemeEvolution,
  ): Promise<void> {
    // Get the current context
    const response = await this.pineconeService.fetchVectors(
      USER_CONTEXT_INDEX,
      [contextId],
      userId,
    );

    if (!response.records || !response.records[contextId]) {
      throw new UserContextNotFoundError(contextId, userId);
    }

    const record = response.records[contextId];
    const metadata = record.metadata || {};

    // Update the record
    await this.pineconeService.upsertVectors(
      USER_CONTEXT_INDEX,
      [
        {
          id: contextId,
          values: this.ensureNumberArray(record.values),
          metadata: this.prepareMetadataForStorage({
            ...metadata,
            themeEvolution,
            lastUpdatedAt: Date.now(),
          }),
        },
      ],
      userId,
    );

    this.logger.debug('Updated theme evolution', {
      userId,
      contextId,
      stages: themeEvolution.stages.length,
    });
  }

  /**
   * Add a new stage to theme evolution
   * @param userId User identifier
   * @param contextId Context item identifier
   * @param description Description of the evolution stage
   * @param relevanceChange Change in relevance at this stage
   * @param sourceId Source where this evolution was observed
   */
  async addEvolutionStage(
    userId: string,
    contextId: string,
    description: string,
    relevanceChange: number = 0,
    sourceId?: string,
  ): Promise<void> {
    // Get the current context
    const response = await this.pineconeService.fetchVectors(
      USER_CONTEXT_INDEX,
      [contextId],
      userId,
    );

    if (!response.records || !response.records[contextId]) {
      throw new UserContextNotFoundError(contextId, userId);
    }

    const record = response.records[contextId];
    const metadata = record.metadata || {};

    // Get existing evolution or create new with proper typing
    let evolution: ThemeEvolution;

    if (
      metadata.themeEvolution &&
      typeof metadata.themeEvolution === 'object'
    ) {
      // Cast existing evolution to the correct type
      evolution = {
        stages: (metadata.themeEvolution as any).stages || [],
        maturityLevel: (metadata.themeEvolution as any).maturityLevel || 0,
        isActive: (metadata.themeEvolution as any).isActive !== false,
      };
    } else {
      // Create new evolution object
      evolution = {
        stages: [],
        maturityLevel: 0,
        isActive: true,
      };
    }

    // Add new stage
    evolution.stages = [
      ...evolution.stages,
      {
        timestamp: Date.now(),
        description,
        sourceId,
        relevanceChange,
      },
    ];

    // Update maturity level based on stages
    evolution.maturityLevel = Math.min(
      1,
      evolution.stages.length * 0.1, // Simple heuristic: each stage adds 0.1 to maturity
    );

    // Update the record
    await this.pineconeService.upsertVectors(
      USER_CONTEXT_INDEX,
      [
        {
          id: contextId,
          values: this.ensureNumberArray(record.values),
          metadata: this.prepareMetadataForStorage({
            ...metadata,
            themeEvolution: evolution,
            lastUpdatedAt: Date.now(),
          }),
        },
      ],
      userId,
    );

    this.logger.debug('Added evolution stage', {
      userId,
      contextId,
      stage: evolution.stages.length,
    });
  }

  /**
   * Track a topic across multiple meetings
   * @param userId User identifier
   * @param topicId Topic identifier
   * @param topicName Topic name
   * @param meetingIds Ids of meetings where this topic was discussed
   * @param topicEmbeddings Vector embeddings for the topic
   * @param metadata Additional metadata
   * @returns The ID of the stored topic
   */
  async trackTopicAcrossMeetings(
    userId: string,
    topicId: string,
    topicName: string,
    meetingIds: string[],
    topicEmbeddings: number[],
    metadata: Partial<BaseContextMetadata> = {},
  ): Promise<string> {
    return this.storeUserContext(userId, topicName, topicEmbeddings, {
      contextType: ContextType.TOPIC,
      topicId,
      topicName,
      relatedMeetingIds: meetingIds,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Update the meetings associated with a topic
   * @param userId User identifier
   * @param topicId Topic identifier
   * @param additionalMeetingIds Additional meeting IDs to add
   * @returns Updated topic record
   */
  async updateTopicMeetings(
    userId: string,
    topicId: string,
    additionalMeetingIds: string[],
  ): Promise<any> {
    // Find the topic
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [], // Empty vector for metadata-only query
          {
            topK: 1,
            filter: {
              contextType: ContextType.TOPIC,
              topicId,
            },
            includeValues: true,
            includeMetadata: true,
          },
          userId,
        ),
      `findTopic:${userId}:${topicId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      throw new UserContextNotFoundError(topicId, userId);
    }

    const topic = result.matches[0];
    const values = this.ensureNumberArray(topic.values);

    // Get existing meeting IDs and add new ones
    const existingMeetingIds = Array.isArray(topic.metadata?.relatedMeetingIds)
      ? (topic.metadata.relatedMeetingIds as string[])
      : [];

    const updatedMeetingIds = [
      ...new Set([...existingMeetingIds, ...additionalMeetingIds]),
    ];

    // Update the record
    await this.executeWithRetry(
      () =>
        this.pineconeService.upsertVectors(
          USER_CONTEXT_INDEX,
          [
            {
              id: topic.id,
              values,
              metadata: this.prepareMetadataForStorage({
                ...topic.metadata,
                relatedMeetingIds: updatedMeetingIds,
                lastUpdatedAt: Date.now(),
              }),
            },
          ],
          userId,
        ),
      `updateTopicMeetings:${userId}:${topicId}`,
    );

    return {
      id: topic.id,
      topicId,
      topicName: topic.metadata?.topicName,
      relatedMeetingIds: updatedMeetingIds,
    };
  }

  /**
   * Find themes related to a query
   * @param userId User identifier
   * @param queryEmbedding Query embedding vector
   * @param options Search options
   * @returns Related themes with scores
   */
  async findRelatedThemes(
    userId: string,
    queryEmbedding: number[],
    options: {
      minRelevance?: number;
      maxResults?: number;
      excludeThemeIds?: string[];
    } = {},
  ): Promise<any[]> {
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          queryEmbedding,
          {
            topK: options.maxResults || 10,
            filter: {
              contextType: ContextType.TOPIC,
            },
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `findRelatedThemes:${userId}`,
    );

    let themes = result.matches || [];

    // Filter out excluded themes
    if (options.excludeThemeIds && options.excludeThemeIds.length > 0) {
      themes = themes.filter(
        (theme) =>
          !options.excludeThemeIds?.includes(theme.metadata?.topicId as string),
      );
    }

    // Filter by minimum relevance
    if (options.minRelevance !== undefined) {
      themes = themes.filter(
        (theme) =>
          theme.score !== undefined &&
          theme.score >= (options.minRelevance || 0),
      );
    }

    return themes.map((theme) => ({
      id: theme.id,
      topicId: theme.metadata?.topicId,
      topicName: theme.metadata?.topicName,
      score: theme.score,
      relatedMeetingIds: theme.metadata?.relatedMeetingIds,
      themeMetadata: {
        themeOrigin: theme.metadata?.themeOrigin,
        themeEvolution: theme.metadata?.themeEvolution,
        themeRelationships: theme.metadata?.themeRelationships,
      },
    }));
  }

  /**
   * Get the evolution of a topic over time
   * @param userId User identifier
   * @param topicId Topic identifier
   * @param timeRangeStart Optional start of time range
   * @param timeRangeEnd Optional end of time range
   * @returns Topic information and timeline entries
   */
  async getTopicEvolution(
    userId: string,
    topicId: string,
    timeRangeStart?: number,
    timeRangeEnd?: number,
  ): Promise<{
    topicInfo: any;
    timelineEntries: any[];
  }> {
    // Find the topic
    const topicResult = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [], // Empty vector for metadata-only query
          {
            topK: 1,
            filter: {
              contextType: ContextType.TOPIC,
              topicId,
            },
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `getTopic:${userId}:${topicId}`,
    );

    if (!topicResult.matches || topicResult.matches.length === 0) {
      throw new UserContextNotFoundError(topicId, userId);
    }

    const topic = topicResult.matches[0];
    const meetingIds = (topic.metadata?.relatedMeetingIds as string[]) || [];

    // Construct filter for timeline query
    const filter: Record<string, any> = {
      meetingId: { $in: meetingIds },
    };

    // Add time range if specified
    if (timeRangeStart || timeRangeEnd) {
      filter.timestamp = {};
      if (timeRangeStart) {
        filter.timestamp.$gte = timeRangeStart;
      }
      if (timeRangeEnd) {
        filter.timestamp.$lte = timeRangeEnd;
      }
    }

    // Get timeline entries
    const timelineResult = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [], // Empty vector for metadata-only query
          {
            topK: 1000,
            filter,
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `getTopicTimeline:${userId}:${topicId}`,
    );

    const entries = timelineResult.matches || [];

    // Group entries by meeting and sort by timestamp
    const sortedEntries = entries.sort((a, b) => {
      const timestampA = (a.metadata?.timestamp as number) || 0;
      const timestampB = (b.metadata?.timestamp as number) || 0;
      return timestampA - timestampB;
    });

    // Process timeline entries
    const timelineEntries = sortedEntries.map((entry) => ({
      id: entry.id,
      timestamp: entry.metadata?.timestamp,
      meetingId: entry.metadata?.meetingId,
      meetingTitle: entry.metadata?.meetingTitle,
      contentType: entry.metadata?.contextType,
      content: entry.metadata?.content,
      isDecision: entry.metadata?.isDecision,
      isActionItem: entry.metadata?.isActionItem,
      isQuestion: entry.metadata?.isQuestion,
      metadata: entry.metadata,
    }));

    return {
      topicInfo: {
        id: topic.id,
        topicId: topic.metadata?.topicId,
        topicName: topic.metadata?.topicName,
        themeOrigin: topic.metadata?.themeOrigin,
        themeEvolution: topic.metadata?.themeEvolution,
        relatedMeetingIds: meetingIds,
      },
      timelineEntries,
    };
  }
}
