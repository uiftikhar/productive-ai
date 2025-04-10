/**
 * Temporal Intelligence Service
 * Manages how context relevance changes over time, implementing time-based decay models,
 * cyclical relevance patterns, and milestone-based relevance tracking.
 */

import { RecordMetadata } from '@pinecone-database/pinecone';
import { BaseContextService } from './base-context.service.ts';
import { Logger } from '../../../shared/logger/logger.interface.ts';
import { ConsoleLogger } from '../../../shared/logger/console-logger.ts';
import { 
  USER_CONTEXT_INDEX,
  UserContextNotFoundError,
  UserContextMetadata,
  TemporalRelevanceModel,
  CyclicalPattern
} from '../user-context.service.ts';

/**
 * Service for time-based relevance operations
 */
export class TemporalIntelligenceService extends BaseContextService {
  protected logger: Logger;

  constructor(options: any = {}) {
    super(options);
    this.logger = options.logger || new ConsoleLogger();
  }

  /**
   * Set or update the temporal relevance model for a context item
   * @param userId User identifier
   * @param contextId Context item identifier
   * @param temporalModel The temporal model to use
   * @param options Additional temporal settings
   */
  async setTemporalRelevanceModel(
    userId: string,
    contextId: string,
    temporalModel: TemporalRelevanceModel,
    options: {
      decayRate?: number;
      cyclicalPattern?: CyclicalPattern;
      timeRelevantUntil?: number;
      seasonality?: string[];
    } = {},
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

    // Update the record with temporal settings
    await this.pineconeService.upsertVectors(
      USER_CONTEXT_INDEX,
      [
        {
          id: contextId,
          values: this.ensureNumberArray(record.values),
          metadata: this.prepareMetadataForStorage({
            ...metadata,
            temporalRelevanceModel: temporalModel,
            decayRate: options.decayRate !== undefined ? options.decayRate : (metadata.decayRate || 0.1),
            cyclicalPattern: options.cyclicalPattern || metadata.cyclicalPattern,
            timeRelevantUntil: options.timeRelevantUntil || metadata.timeRelevantUntil,
            seasonality: options.seasonality || metadata.seasonality,
            lastUpdatedAt: Date.now(),
          }),
        },
      ],
      userId,
    );

    this.logger.debug('Set temporal relevance model', {
      userId,
      contextId,
      temporalModel,
    });
  }

  /**
   * Set a cyclical pattern for context relevance
   * @param userId User identifier
   * @param contextId Context item identifier
   * @param cyclicalPattern Cyclical pattern definition
   */
  async setCyclicalPattern(
    userId: string,
    contextId: string,
    cyclicalPattern: CyclicalPattern,
  ): Promise<void> {
    return this.setTemporalRelevanceModel(
      userId,
      contextId,
      TemporalRelevanceModel.CYCLICAL,
      { cyclicalPattern }
    );
  }

  /**
   * Set milestone-based relevance for a context item
   * @param userId User identifier
   * @param contextId Context item identifier
   * @param timeRelevantUntil Timestamp when milestone is reached
   * @param decayRate Optional decay rate after milestone
   */
  async setMilestoneBased(
    userId: string,
    contextId: string,
    timeRelevantUntil: number,
    decayRate: number = 0.5,
  ): Promise<void> {
    return this.setTemporalRelevanceModel(
      userId,
      contextId,
      TemporalRelevanceModel.MILESTONE_BASED,
      { timeRelevantUntil, decayRate }
    );
  }

  /**
   * Set an evergreen status for content that doesn't decay
   * @param userId User identifier
   * @param contextId Context item identifier
   */
  async setEvergreen(
    userId: string,
    contextId: string,
  ): Promise<void> {
    return this.setTemporalRelevanceModel(
      userId,
      contextId,
      TemporalRelevanceModel.EVERGREEN
    );
  }

  /**
   * Calculate the current temporal relevance of a context item
   * @param metadata Context metadata
   * @param currentTime Current timestamp
   * @returns Updated relevance score based on temporal factors
   */
  calculateTemporalRelevance(
    metadata: UserContextMetadata,
    currentTime: number = Date.now(),
  ): number {
    if (metadata.relevanceScore === undefined) {
      return 0.5; // Default relevance
    }

    // If no temporal model is specified, return original score
    if (!metadata.temporalRelevanceModel) {
      return metadata.relevanceScore;
    }

    const originalScore = metadata.relevanceScore;
    const creationTime = metadata.timestamp || 0;
    const lastReinforcement = metadata.lastReinforcementTime || creationTime;
    const elapsedSinceReinforcement = currentTime - lastReinforcement;
    const decayRate = metadata.decayRate || 0.1; // Default decay rate

    // Apply different decay models
    switch (metadata.temporalRelevanceModel) {
      case TemporalRelevanceModel.LINEAR_DECAY: {
        // Linear decay: score - (decayRate * timeElapsed / 30days)
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const decayAmount =
          decayRate * (elapsedSinceReinforcement / thirtyDaysMs);
        return Math.max(0, originalScore - decayAmount);
      }

      case TemporalRelevanceModel.EXPONENTIAL_DECAY: {
        // Exponential decay: score * e^(-decayRate * timeElapsed / 30days)
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const decay = Math.exp(
          -decayRate * (elapsedSinceReinforcement / thirtyDaysMs),
        );
        return originalScore * decay;
      }

      case TemporalRelevanceModel.CYCLICAL: {
        // Handle cyclical pattern if defined
        if (metadata.cyclicalPattern) {
          const cycle = metadata.cyclicalPattern;
          let cycleLength: number;

          // Determine cycle length
          switch (cycle.cycleType) {
            case 'daily':
              cycleLength = 24 * 60 * 60 * 1000;
              break;
            case 'weekly':
              cycleLength = 7 * 24 * 60 * 60 * 1000;
              break;
            case 'monthly':
              cycleLength = 30 * 24 * 60 * 60 * 1000;
              break;
            case 'quarterly':
              cycleLength = 90 * 24 * 60 * 60 * 1000;
              break;
            case 'annual':
              cycleLength = 365 * 24 * 60 * 60 * 1000;
              break;
            case 'custom':
              cycleLength = cycle.cycleLengthMs || 7 * 24 * 60 * 60 * 1000;
              break;
            default:
              cycleLength = 7 * 24 * 60 * 60 * 1000; // Default to weekly
          }

          // Calculate position in cycle (0 to 1)
          const cyclePosition = (currentTime % cycleLength) / cycleLength;

          // Check if we have specific peak times
          if (cycle.peakTimesInCycle && cycle.peakTimesInCycle.length > 0) {
            // Find the closest peak time
            let minDistance = 1;
            for (const peakPosition of cycle.peakTimesInCycle) {
              // Calculate distance (accounting for wraparound)
              const distance = Math.min(
                Math.abs(cyclePosition - (peakPosition as number)),
                1 - Math.abs(cyclePosition - (peakPosition as number))
              );
              minDistance = Math.min(minDistance, distance);
            }
            
            // Convert distance to a score (closer to peak = higher score)
            const normalizedDistance = 1 - minDistance;
            const amplitude = (cycle.maxRelevance || 1) - (cycle.minRelevance || 0);
            return (cycle.minRelevance || 0) + amplitude * normalizedDistance;
          } else {
            // Simple sinusoidal variation between min and max relevance
            const amplitude = ((cycle.maxRelevance || 1) - (cycle.minRelevance || 0)) / 2;
            const offset = ((cycle.maxRelevance || 1) + (cycle.minRelevance || 0)) / 2;
            return offset + amplitude * Math.sin(cyclePosition * 2 * Math.PI);
          }
        }
        return originalScore;
      }

      case TemporalRelevanceModel.EVERGREEN:
        // No decay for evergreen content
        return originalScore;

      case TemporalRelevanceModel.MILESTONE_BASED:
        // Check if milestone has passed
        if (
          metadata.timeRelevantUntil &&
          currentTime > metadata.timeRelevantUntil
        ) {
          // Apply decay based on time since milestone
          const timeSinceMilestone = currentTime - metadata.timeRelevantUntil;
          const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
          
          // If recently passed milestone, apply gentle decay
          if (timeSinceMilestone < thirtyDaysMs) {
            const percentPassed = timeSinceMilestone / thirtyDaysMs;
            return originalScore * (1 - (percentPassed * decayRate));
          }
          
          // After 30 days, apply standard decay
          return originalScore * (1 - decayRate);
        }
        
        // Before milestone, maintain full relevance
        return originalScore;

      default:
        return originalScore;
    }
  }

  /**
   * Update the relevance scores for all expired context items
   * @param userId User identifier
   * @param contextTypes Optional types of context to update
   * @returns Number of updated items
   */
  async updateExpiredRelevanceScores(
    userId: string,
    contextTypes?: string[],
  ): Promise<number> {
    // Configure the filter
    const filter: Record<string, any> = {};
    
    if (contextTypes && contextTypes.length > 0) {
      filter.contextType = { $in: contextTypes };
    }

    // Get contexts that have temporal models
    const result = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [], // Empty vector for metadata-only query
        {
          filter: {
            ...filter,
            temporalRelevanceModel: { $exists: true },
          },
          topK: 1000,
          includeValues: true,
          includeMetadata: true,
        },
        userId,
      ),
      `updateExpiredRelevanceScores:${userId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      return 0;
    }

    let updatedCount = 0;
    const currentTime = Date.now();
    const updateBatchSize = 100;
    const updateBatches: Array<{
      id: string;
      values: number[];
      metadata: Record<string, any>;
    }>[] = [];

    // Process items in batches
    let currentBatch: Array<{
      id: string;
      values: number[];
      metadata: Record<string, any>;
    }> = [];

    for (const match of result.matches) {
      // Calculate new relevance score based on temporal model
      const newRelevanceScore = this.calculateTemporalRelevance(
        match.metadata as unknown as UserContextMetadata,
        currentTime,
      );

      // Only update if relevance changed significantly (more than 1%)
      const oldRelevanceScore = typeof match.metadata?.relevanceScore === 'number' 
        ? match.metadata.relevanceScore 
        : 0.5;
      
      if (Math.abs(newRelevanceScore - oldRelevanceScore) > 0.01) {
        currentBatch.push({
          id: match.id,
          values: this.ensureNumberArray(match.values),
          metadata: this.prepareMetadataForStorage({
            ...match.metadata,
            relevanceScore: newRelevanceScore,
            lastTemporalUpdate: currentTime,
          }),
        });
        updatedCount++;

        // If we've reached the batch size, add to batches and reset
        if (currentBatch.length >= updateBatchSize) {
          updateBatches.push([...currentBatch]);
          currentBatch = [];
        }
      }
    }

    // Add any remaining items to the batches
    if (currentBatch.length > 0) {
      updateBatches.push(currentBatch);
    }

    // Update all batches
    for (const batch of updateBatches) {
      await this.executeWithRetry(
        () => this.pineconeService.upsertVectors(
          USER_CONTEXT_INDEX,
          batch,
          userId,
        ),
        `updateExpiredRelevanceScoresBatch:${userId}`,
      );
    }

    this.logger.info('Updated temporal relevance scores', {
      userId,
      updatedCount,
      totalFound: result.matches.length,
    });

    return updatedCount;
  }

  /**
   * Apply seasonal adjustments to context items
   * @param userId User identifier
   * @param season Season identifier (e.g., "summer", "q4", "holiday-season")
   * @param relevanceMultiplier Multiplier for relevance scores for this season
   * @returns Number of updated items
   */
  async applySeasonalAdjustments(
    userId: string,
    season: string,
    relevanceMultiplier: number = 1.5,
  ): Promise<number> {
    // Get contexts that have this season in their seasonality array
    const result = await this.executeWithRetry(
      () => this.pineconeService.queryVectors<RecordMetadata>(
        USER_CONTEXT_INDEX,
        [], // Empty vector for metadata-only query
        {
          filter: {
            seasonality: season,
          },
          topK: 1000,
          includeValues: true,
          includeMetadata: true,
        },
        userId,
      ),
      `applySeasonalAdjustments:${userId}:${season}`,
    );

    if (!result.matches || result.matches.length === 0) {
      return 0;
    }

    // Update relevance scores for seasonal items
    const updates = result.matches.map(match => {
      const currentRelevance = (match.metadata?.relevanceScore as number) || 0.5;
      return {
        id: match.id,
        values: this.ensureNumberArray(match.values),
        metadata: this.prepareMetadataForStorage({
          ...match.metadata,
          // Apply seasonal boost but cap at 1.0
          relevanceScore: Math.min(1.0, currentRelevance * relevanceMultiplier),
          lastSeasonalUpdate: Date.now(),
          activeSeason: season,
        }),
      };
    });

    // Perform the update
    await this.executeWithRetry(
      () => this.pineconeService.upsertVectors(
        USER_CONTEXT_INDEX,
        updates,
        userId,
      ),
      `applySeasonalAdjustmentsBatch:${userId}:${season}`,
    );

    this.logger.info('Applied seasonal adjustments', {
      userId,
      season,
      updatedCount: updates.length,
    });

    return updates.length;
  }
}
