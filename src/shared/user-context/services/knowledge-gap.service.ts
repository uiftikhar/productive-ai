/**
 * Knowledge Gap Service
 * Detects and manages knowledge gaps, misalignments, and unanswered questions
 * for improved organizational intelligence.
 */

import { RecordMetadata } from '@pinecone-database/pinecone';
import { BaseContextService } from './base-context.service';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

import {
  ContextType,
  KnowledgeGapType,
  USER_CONTEXT_INDEX,
} from '../types/context.types';
import { EmbeddingService } from '../../embedding/embedding.service';
import { OpenAIConnector } from '../../../agents/integrations/openai-connector';

/**
 * Structure representing a knowledge gap
 */
interface KnowledgeGap {
  // Basic identification
  id: string;
  userId: string;
  timestamp: number;

  // Gap classification
  gapType: KnowledgeGapType;
  confidence: number; // 0-1 confidence in gap detection

  // Content related to the gap
  title: string;
  description: string;
  relatedContextIds: string[];
  suggestedActions?: string[];

  // Gap status tracking
  status: 'open' | 'addressed' | 'closed' | 'rejected';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  resolutionNotes?: string;

  // Additional metadata
  topicIds?: string[];
  meetingIds?: string[];
  teamIds?: string[];
}

/**
 * Service for detecting and managing knowledge gaps
 */
export class KnowledgeGapService extends BaseContextService {
  protected logger: Logger;
  protected embeddingService: EmbeddingService;

  constructor(options: any = {}) {
    super(options);
    this.logger = options.logger || new ConsoleLogger();
    this.embeddingService =
      options.embeddingService || new EmbeddingService(new OpenAIConnector());
  }

  /**
   * Detect knowledge gaps based on unanswered questions
   * @param userId User identifier
   * @returns Array of detected knowledge gaps
   */
  async detectUnansweredQuestionGaps(
    userId: string,
    options: {
      minAgeInDays?: number;
      maxResults?: number;
      minConfidence?: number;
    } = {},
  ): Promise<KnowledgeGap[]> {
    const minAgeInDays = options.minAgeInDays || 7;
    const maxResults = options.maxResults || 50;
    const minConfidence = options.minConfidence || 0.7;

    // Set time threshold
    const maxTimestamp = Date.now() - minAgeInDays * 24 * 60 * 60 * 1000;

    // Find unanswered questions older than the threshold
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [], // Empty vector for metadata-only query
          {
            filter: {
              contextType: ContextType.QUESTION,
              isQuestion: true,
              isAnswered: false,
              timestamp: { $lt: maxTimestamp },
            },
            topK: maxResults,
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `detectUnansweredQuestionGaps:${userId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      return [];
    }

    // Convert to knowledge gaps
    return result.matches
      .map((match) => {
        const metadata = match.metadata || {};
        const questionAge =
          (Date.now() - ((metadata.timestamp as number) || 0)) /
          (24 * 60 * 60 * 1000);

        // Calculate confidence based on age and importance factors
        let confidence = 0.7;

        // Older questions are more likely to be real gaps
        confidence += Math.min(0.2, (questionAge / 30) * 0.2);

        // Questions from meetings with many participants might be more important
        if (
          Array.isArray(metadata.participantIds) &&
          metadata.participantIds.length > 3
        ) {
          confidence += 0.05;
        }

        // Skip if below confidence threshold
        if (confidence < minConfidence) {
          return null;
        }

        // Get content as string
        const contentStr =
          typeof metadata.content === 'string' ? metadata.content : '';

        // Create knowledge gap entry
        return {
          id: this.generateContextId(userId, 'kg-'),
          userId,
          timestamp: Date.now(),

          gapType: KnowledgeGapType.UNANSWERED_QUESTION,
          confidence,

          title: `Unanswered Question: ${contentStr.substring(0, 50)}...`,
          description: contentStr,
          relatedContextIds: [match.id],
          suggestedActions: [
            'Schedule a follow-up discussion',
            'Assign to subject matter expert',
            'Document in knowledge base',
          ],

          status: 'open',
          priority: confidence > 0.85 ? 'high' : 'medium',

          topicIds: (metadata.topicIds as string[]) || [],
          meetingIds: metadata.meetingId ? [metadata.meetingId as string] : [],
        };
      })
      .filter(Boolean) as KnowledgeGap[];
  }

  /**
   * Detect misalignment between team understanding of topics
   * @param userId User identifier
   * @param teamIds Team identifiers to check for misalignment
   * @param options Additional options
   * @returns Array of detected knowledge gaps
   */
  async detectTeamMisalignments(
    userId: string,
    teamIds: string[],
    options: {
      threshold?: number;
      maxResults?: number;
    } = {},
  ): Promise<KnowledgeGap[]> {
    if (!teamIds || teamIds.length < 2) {
      throw new Error(
        'At least two team IDs are needed to detect misalignments',
      );
    }

    const threshold = options.threshold || 0.7;
    const maxResults = options.maxResults || 20;
    const gaps: KnowledgeGap[] = [];

    // Get top topics for each team
    const teamTopics: Record<
      string,
      {
        id: string;
        topicId: string;
        topicName: string;
        embedding: number[];
        metadata: Record<string, any>;
      }[]
    > = {};

    // Collect topics for each team
    for (const teamId of teamIds) {
      const result = await this.executeWithRetry(
        () =>
          this.pineconeService.queryVectors<RecordMetadata>(
            USER_CONTEXT_INDEX,
            [], // Empty vector for metadata-only query
            {
              filter: {
                contextType: ContextType.TOPIC,
                teamId,
              },
              topK: 50,
              includeValues: true,
              includeMetadata: true,
            },
            userId,
          ),
        `getTeamTopics:${userId}:${teamId}`,
      );

      if (result.matches && result.matches.length > 0) {
        teamTopics[teamId] = result.matches.map((match) => ({
          id: match.id,
          topicId: (match.metadata?.topicId as string) || '',
          topicName: (match.metadata?.topicName as string) || '',
          embedding: this.ensureNumberArray(match.values),
          metadata: match.metadata || {},
        }));
      } else {
        teamTopics[teamId] = [];
      }
    }

    // Compare topic understanding between teams
    for (let i = 0; i < teamIds.length - 1; i++) {
      const team1 = teamIds[i];

      for (let j = i + 1; j < teamIds.length; j++) {
        const team2 = teamIds[j];

        // Skip if either team doesn't have topics
        if (!teamTopics[team1].length || !teamTopics[team2].length) {
          continue;
        }

        // Find common topics (by name or ID)
        const team1Topics = new Map(
          teamTopics[team1].map((t) => [t.topicId || t.topicName, t]),
        );

        for (const topic2 of teamTopics[team2]) {
          const key = topic2.topicId || topic2.topicName;
          if (team1Topics.has(key)) {
            const topic1 = team1Topics.get(key)!;

            // Calculate similarity between the two team's understanding
            const similarity = this.calculateCosineSimilarity(
              topic1.embedding,
              topic2.embedding,
            );

            // If similarity is below threshold, it indicates misalignment
            if (similarity < threshold) {
              gaps.push({
                id: this.generateContextId(userId, 'kg-'),
                userId,
                timestamp: Date.now(),

                gapType: KnowledgeGapType.MISALIGNMENT,
                confidence: 1 - similarity, // Higher confidence for lower similarity

                title: `Team Misalignment: ${topic1.topicName}`,
                description: `Teams "${team1}" and "${team2}" have different understandings of "${topic1.topicName}". Similarity score: ${similarity.toFixed(2)}`,
                relatedContextIds: [topic1.id, topic2.id],
                suggestedActions: [
                  'Schedule alignment meeting between teams',
                  'Create shared documentation',
                  'Define common terminology',
                ],

                status: 'open',
                priority: similarity < 0.5 ? 'critical' : 'high',

                topicIds: [topic1.topicId],
                teamIds: [team1, team2],
              });

              // Break if we've reached the limit
              if (gaps.length >= maxResults) {
                break;
              }
            }
          }
        }

        // Break if we've reached the limit
        if (gaps.length >= maxResults) {
          break;
        }
      }

      // Break if we've reached the limit
      if (gaps.length >= maxResults) {
        break;
      }
    }

    return gaps;
  }

  /**
   * Detect missing information gaps in organizational knowledge
   * @param userId User identifier
   * @param options Additional options
   * @returns Array of detected knowledge gaps
   */
  async detectMissingInformation(
    userId: string,
    options: {
      maxResults?: number;
      minConfidence?: number;
    } = {},
  ): Promise<KnowledgeGap[]> {
    const maxResults = options.maxResults || 20;
    const minConfidence = options.minConfidence || 0.7;

    // Find questions with partial or incomplete answers
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [], // Empty vector for metadata-only query
          {
            filter: {
              $or: [
                {
                  contextType: ContextType.QUESTION,
                  isQuestion: true,
                  isAnswered: true,
                  isPartialAnswer: true,
                },
                {
                  contextType: ContextType.TOPIC,
                  completeness: { $lt: 0.7 },
                },
              ],
            },
            topK: maxResults * 2, // Get more than needed for filtering
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `detectMissingInformation:${userId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      return [];
    }

    // Convert to knowledge gaps
    const gaps: KnowledgeGap[] = [];

    for (const match of result.matches) {
      const metadata = match.metadata || {};
      let confidence = 0;
      let title = '';
      let description = '';

      if (metadata.contextType === ContextType.QUESTION) {
        // For questions with partial answers
        confidence = 0.75;
        const contentStr =
          typeof metadata.content === 'string' ? metadata.content : '';
        const partialAnswerStr =
          typeof metadata.partialAnswer === 'string'
            ? metadata.partialAnswer
            : '';

        title = `Incomplete Answer: ${contentStr.substring(0, 50)}...`;
        description = `Question: ${contentStr}\n\nPartial Answer: ${partialAnswerStr}`;
      } else {
        // For topics with low completeness
        const completeness =
          typeof metadata.completeness === 'number' ? metadata.completeness : 0;
        confidence = 1 - completeness;
        const topicNameStr =
          typeof metadata.topicName === 'string' ? metadata.topicName : '';

        title = `Incomplete Topic: ${topicNameStr}`;
        description = `The topic "${topicNameStr}" has incomplete information (${(completeness * 100).toFixed(0)}% complete).`;
      }

      // Skip if below confidence threshold
      if (confidence < minConfidence) {
        continue;
      }

      // Create knowledge gap entry
      gaps.push({
        id: this.generateContextId(userId, 'kg-'),
        userId,
        timestamp: Date.now(),

        gapType: KnowledgeGapType.MISSING_INFORMATION,
        confidence,

        title,
        description,
        relatedContextIds: [match.id],
        suggestedActions: [
          'Research and document missing information',
          'Consult subject matter experts',
          'Schedule a follow-up discussion',
        ],

        status: 'open',
        priority: confidence > 0.85 ? 'high' : 'medium',

        topicIds:
          (metadata.topicIds as string[]) ||
          (metadata.topicId ? [metadata.topicId as string] : []),
        meetingIds: metadata.meetingId ? [metadata.meetingId as string] : [],
      });

      // Break if we've reached the limit
      if (gaps.length >= maxResults) {
        break;
      }
    }

    return gaps;
  }

  /**
   * Store a knowledge gap in the system
   * @param userId User identifier
   * @param gap Knowledge gap to store
   * @returns The ID of the stored gap
   */
  async storeKnowledgeGap(userId: string, gap: KnowledgeGap): Promise<string> {
    const gapId = gap.id || this.generateContextId(userId, 'kg-');

    // Create embedding for the gap (from title and description)
    const embeddingText = `${gap.title}\n${gap.description}`;
    const embedding = await this.executeWithRetry(
      () => this.embeddingService.generateEmbedding(embeddingText),
      `createGapEmbedding:${userId}:${gapId}`,
    );

    if (!embedding) {
      throw new Error('Failed to create embedding for knowledge gap');
    }

    // Store the gap
    await this.executeWithRetry(
      () =>
        this.pineconeService.upsertVectors(
          USER_CONTEXT_INDEX,
          [
            {
              id: gapId,
              values: embedding,
              metadata: this.prepareMetadataForStorage({
                userId,
                timestamp: gap.timestamp || Date.now(),
                contextType: ContextType.KNOWLEDGE_GAP,
                gapType: gap.gapType,
                confidence: gap.confidence,
                title: gap.title,
                description: gap.description,
                relatedContextIds: gap.relatedContextIds,
                suggestedActions: gap.suggestedActions,
                gapStatus: gap.status,
                priority: gap.priority,
                assignedTo: gap.assignedTo,
                resolutionNotes: gap.resolutionNotes,
                topicIds: gap.topicIds,
                meetingIds: gap.meetingIds,
                teamIds: gap.teamIds,
              }),
            },
          ],
          userId,
        ),
      `storeKnowledgeGap:${userId}:${gapId}`,
    );

    return gapId;
  }

  /**
   * Update the status of a knowledge gap
   * @param userId User identifier
   * @param gapId Gap identifier
   * @param status New status
   * @param notes Additional notes for the status change
   * @returns True if successfully updated
   */
  async updateKnowledgeGapStatus(
    userId: string,
    gapId: string,
    status: 'open' | 'addressed' | 'closed' | 'rejected',
    notes: string = '',
  ): Promise<boolean> {
    // Get the current gap
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.fetchVectors(USER_CONTEXT_INDEX, [gapId], userId),
      `getKnowledgeGap:${userId}:${gapId}`,
    );

    if (!result.records || !result.records[gapId]) {
      throw new Error(`Knowledge gap ${gapId} not found`);
    }

    const record = result.records[gapId];
    const metadata = record.metadata || {};

    // Update the status
    await this.executeWithRetry(
      () =>
        this.pineconeService.upsertVectors(
          USER_CONTEXT_INDEX,
          [
            {
              id: gapId,
              values: this.ensureNumberArray(record.values),
              metadata: this.prepareMetadataForStorage({
                ...metadata,
                gapStatus: status,
                resolutionNotes: notes || metadata.resolutionNotes,
                lastUpdatedAt: Date.now(),
              }),
            },
          ],
          userId,
        ),
      `updateKnowledgeGapStatus:${userId}:${gapId}`,
    );

    return true;
  }

  /**
   * Get all knowledge gaps for a user
   * @param userId User identifier
   * @param options Filter options
   * @returns Array of knowledge gaps
   */
  async getKnowledgeGaps(
    userId: string,
    options: {
      status?: string;
      gapType?: KnowledgeGapType;
      priority?: string;
      topicId?: string;
      teamId?: string;
      limit?: number;
    } = {},
  ): Promise<KnowledgeGap[]> {
    // Build filter
    const filter: Record<string, any> = {
      contextType: ContextType.KNOWLEDGE_GAP,
    };

    if (options.status) {
      filter.gapStatus = options.status;
    }

    if (options.gapType) {
      filter.gapType = options.gapType;
    }

    if (options.priority) {
      filter.priority = options.priority;
    }

    if (options.topicId) {
      filter.topicIds = options.topicId;
    }

    if (options.teamId) {
      filter.teamIds = options.teamId;
    }

    // Get matching gaps
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [], // Empty vector for metadata-only query
          {
            filter,
            topK: options.limit || 100,
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `getKnowledgeGaps:${userId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      return [];
    }

    // Convert to knowledge gaps
    return result.matches.map((match) => {
      const metadata = match.metadata || {};

      return {
        id: match.id,
        userId,
        timestamp: (metadata.timestamp as number) || 0,

        gapType: metadata.gapType as KnowledgeGapType,
        confidence: (metadata.confidence as number) || 0,

        title: (metadata.title as string) || '',
        description: (metadata.description as string) || '',
        relatedContextIds: (metadata.relatedContextIds as string[]) || [],
        suggestedActions: (metadata.suggestedActions as string[]) || [],

        status: metadata.gapStatus as
          | 'open'
          | 'addressed'
          | 'closed'
          | 'rejected',
        priority: metadata.priority as 'low' | 'medium' | 'high' | 'critical',
        assignedTo: metadata.assignedTo as string,
        resolutionNotes: metadata.resolutionNotes as string,

        topicIds: (metadata.topicIds as string[]) || [],
        meetingIds: (metadata.meetingIds as string[]) || [],
        teamIds: (metadata.teamIds as string[]) || [],
      };
    });
  }
}
