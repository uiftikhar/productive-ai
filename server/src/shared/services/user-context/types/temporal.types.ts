/**
 * Types related to temporal intelligence
 */

/**
 * Models for time-based relevance
 */
export enum TemporalRelevanceModel {
  LINEAR_DECAY = 'linear-decay', // Linear relevance decay over time
  EXPONENTIAL_DECAY = 'exponential-decay', // Exponential relevance decay
  CYCLICAL = 'cyclical', // Cyclical relevance pattern
  MILESTONE_BASED = 'milestone-based', // Relevance tied to milestones
  EVERGREEN = 'evergreen', // No decay in relevance
}

/**
 * Structure for cyclical temporal patterns
 */
export interface CyclicalPattern {
  /** Type of cycle */
  cycleType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';
  /** Length of cycle in milliseconds (for custom) */
  cycleLengthMs?: number;
  /** Peak relevance times within the cycle */
  peakTimesInCycle?: number[];
  /** Minimum relevance during cycle low points (0-1) */
  minRelevance: number;
  /** Maximum relevance during cycle peaks (0-1) */
  maxRelevance: number;
}

/**
 * Temporal-related metadata
 */
export interface TemporalMetadata {
  /** Model for time-based relevance */
  temporalRelevanceModel?: TemporalRelevanceModel;
  /** How quickly relevance decays over time (0-1, higher = faster decay) */
  decayRate?: number;
  /** When this memory was last reinforced */
  lastReinforcementTime?: number;
  /** Pattern of recurring relevance */
  cyclicalPattern?: CyclicalPattern;
  /** Seasonal relevance factors */
  seasonality?: string[];
  /** When this content stops being relevant */
  timeRelevantUntil?: number;
}
