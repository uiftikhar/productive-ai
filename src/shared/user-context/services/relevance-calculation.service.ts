/**
 * Relevance Calculation Service
 * Provides algorithms for calculating relevance scores for different content types,
 * including role-based, content-type-based, and recency-based relevance.
 */

import { BaseContextService } from './base-context.service';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { ContextType } from '../context-types';
import { UserRole, BaseContextMetadata } from '../types/context.types';

// Constants for relevance calculation
const DECAY_FACTOR = 0.01; // How much relevance decays per day
const ROLE_MATCH_FACTOR = 1.5; // Boost for exact role matches
const RECENCY_FACTOR = 1.2; // Factor to boost recent content
const TIME_WINDOW_DAYS = 30; // Recent content window in days

/**
 * Service for calculating content relevance based on various factors
 */
export class RelevanceCalculationService extends BaseContextService {
  protected logger: Logger;

  constructor(options: any = {}) {
    super(options);
    this.logger = options.logger || new ConsoleLogger();
  }

  /**
   * Calculate relevance score based on multiple factors
   * @param userRole Current user's role
   * @param metadata Content metadata
   * @param currentTime Current timestamp
   * @returns Calculated relevance score (0-1)
   */
  calculateRelevanceScore(
    userRole: UserRole,
    metadata: BaseContextMetadata,
    currentTime: number = Date.now(),
  ): number {
    // Start with base relevance (either existing or default)
    let relevance =
      typeof metadata.relevanceScore === 'number'
        ? metadata.relevanceScore
        : 0.5;

    // Apply role-based relevance
    relevance = this.applyRoleRelevance(relevance, userRole, metadata);

    // Apply recency factor
    relevance = this.applyRecencyFactor(relevance, metadata, currentTime);

    // Apply content type importance
    relevance = this.applyContentTypeImportance(relevance, metadata);

    // Apply usage statistics if available
    relevance = this.applyUsageStatistics(relevance, metadata);

    // Apply explicit feedback if available
    if (typeof metadata.explicitRelevanceFeedback === 'number') {
      // Weight explicit feedback more heavily
      relevance = (relevance + metadata.explicitRelevanceFeedback * 2) / 3;
    }

    // Ensure relevance is within bounds
    return Math.max(0, Math.min(1, relevance));
  }

  /**
   * Apply role-specific relevance adjustments
   * @param baseRelevance Base relevance score
   * @param userRole Current user's role
   * @param metadata Content metadata
   * @returns Adjusted relevance score
   */
  private applyRoleRelevance(
    baseRelevance: number,
    userRole: UserRole,
    metadata: BaseContextMetadata,
  ): number {
    let relevance = baseRelevance;

    // Check if we have role relevance information
    if (metadata.roleRelevance && typeof metadata.roleRelevance === 'object') {
      // Check if the user's role has a specific relevance score
      if (metadata.roleRelevance[userRole] !== undefined) {
        // Weight the specific role score higher than base relevance
        const roleSpecificScore = metadata.roleRelevance[userRole];
        if (typeof roleSpecificScore === 'number') {
          relevance = (relevance + roleSpecificScore * 2) / 3;
        }
      }
    }

    // Boost if the content is specifically targeted at this role
    if (metadata.targetRoles && Array.isArray(metadata.targetRoles)) {
      if (metadata.targetRoles.includes(userRole)) {
        relevance *= ROLE_MATCH_FACTOR;
      }
    }

    // Cap at 1.0
    return Math.min(1.0, relevance);
  }

  /**
   * Apply recency factor to relevance score
   * @param baseRelevance Base relevance score
   * @param metadata Content metadata
   * @param currentTime Current timestamp
   * @returns Adjusted relevance score
   */
  private applyRecencyFactor(
    baseRelevance: number,
    metadata: BaseContextMetadata,
    currentTime: number,
  ): number {
    const timestamp = metadata.timestamp || 0;
    if (timestamp === 0) return baseRelevance;

    const ageInDays = (currentTime - timestamp) / (1000 * 60 * 60 * 24);

    // Boost recent content
    if (ageInDays < TIME_WINDOW_DAYS) {
      const recencyBoost = RECENCY_FACTOR * (1 - ageInDays / TIME_WINDOW_DAYS);
      return Math.min(1.0, baseRelevance * (1 + recencyBoost / 5));
    }

    // Apply decay to older content
    const decay = (DECAY_FACTOR * (ageInDays - TIME_WINDOW_DAYS)) / 30;
    return Math.max(0.1, baseRelevance * (1 - decay));
  }

  /**
   * Apply content type importance to relevance score
   * @param baseRelevance Base relevance score
   * @param metadata Content metadata
   * @returns Adjusted relevance score
   */
  private applyContentTypeImportance(
    baseRelevance: number,
    metadata: BaseContextMetadata,
  ): number {
    // Weights for different content types
    const typeWeights: Partial<Record<ContextType, number>> = {
      [ContextType.DECISION]: 1.3, // Decisions are very important
      [ContextType.ACTION_ITEM]: 1.2, // Action items are important
      [ContextType.TOPIC]: 1.15, // Topics are important for context
      [ContextType.MEETING]: 1.1, // General meeting content
      [ContextType.QUESTION]: 1.05, // Questions are slightly more important
      [ContextType.DOCUMENT]: 1.0, // Standard weight for documents
      [ContextType.CONVERSATION]: 1.0, // Standard weight for conversations
    };

    const contentType = metadata.contextType;
    if (contentType && typeWeights[contentType]) {
      return Math.min(1.0, baseRelevance * typeWeights[contentType]);
    }

    return baseRelevance;
  }

  /**
   * Apply usage statistics to relevance score
   * @param baseRelevance Base relevance score
   * @param metadata Content metadata
   * @returns Adjusted relevance score
   */
  private applyUsageStatistics(
    baseRelevance: number,
    metadata: BaseContextMetadata,
  ): number {
    let relevance = baseRelevance;

    // Boost frequently viewed content
    if (typeof metadata.viewCount === 'number' && metadata.viewCount > 0) {
      // Log scaling to prevent excessive boosting for high view counts
      const viewBoost = Math.log10(metadata.viewCount + 1) * 0.05;
      relevance = Math.min(1.0, relevance * (1 + viewBoost));
    }

    // Boost recently accessed content
    if (metadata.lastAccessedAt && metadata.timestamp) {
      const totalAge = Date.now() - metadata.timestamp;
      const timeSinceLastAccess = Date.now() - metadata.lastAccessedAt;

      // If accessed recently relative to its age, boost it
      if (totalAge > 0 && timeSinceLastAccess / totalAge < 0.2) {
        relevance = Math.min(1.0, relevance * 1.1);
      }
    }

    return relevance;
  }

  /**
   * Calculate thematic relevance between a query and content
   * @param queryThemes Themes in the query
   * @param contentThemes Themes in the content
   * @returns Thematic relevance score (0-1)
   */
  calculateThematicRelevance(
    queryThemes: string[],
    contentMetadata: BaseContextMetadata,
  ): number {
    const contentThemes = contentMetadata.themeIds || [];
    if (!queryThemes.length || !contentThemes.length) {
      return 0.5; // Default moderate relevance if no theme data
    }

    let matchCount = 0;
    let totalRelevance = 0;

    for (const queryTheme of queryThemes) {
      if (contentThemes.includes(queryTheme)) {
        matchCount++;

        // If we have theme relevance information, use that
        if (
          contentMetadata.themeRelevance &&
          typeof contentMetadata.themeRelevance === 'object' &&
          typeof contentMetadata.themeRelevance[queryTheme] === 'number'
        ) {
          totalRelevance += contentMetadata.themeRelevance[queryTheme];
        } else {
          // Default relevance for matched themes
          totalRelevance += 0.8;
        }
      }
    }

    if (matchCount === 0) {
      return 0.3; // Low relevance for no matches
    }

    // Scale by the proportion of query themes that matched
    const coverage = matchCount / queryThemes.length;
    const averageRelevance = totalRelevance / matchCount;

    // Combine average relevance with coverage
    return averageRelevance * 0.7 + coverage * 0.3;
  }

  /**
   * Get relevance keywords from content
   * @param text Content text
   * @returns Array of relevant keywords
   */
  extractRelevanceKeywords(text: string): string[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    // Simple keyword extraction implementation
    // In a real implementation, this would use NLP techniques

    // Remove common punctuation and convert to lowercase
    const processedText = text
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
      .replace(/\s{2,}/g, ' ');

    // Split into words and filter out common stop words
    const stopWords = new Set([
      'a',
      'an',
      'the',
      'and',
      'or',
      'but',
      'is',
      'are',
      'was',
      'were',
      'to',
      'of',
      'in',
      'for',
      'with',
      'on',
      'at',
      'by',
      'this',
      'that',
      'it',
      'we',
      'i',
      'you',
      'he',
      'she',
      'they',
      'be',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'should',
      'can',
      'could',
    ]);

    const words = processedText
      .split(' ')
      .filter((word) => word.length > 3 && !stopWords.has(word))
      .slice(0, 20); // Limit to top 20 words

    // Remove duplicates
    return [...new Set(words)];
  }
}
