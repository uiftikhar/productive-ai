/**
 * Types related to themes and their relationships
 */
import { UserRole } from './context.types.ts';

/**
 * Types of relationships between themes
 */
export enum ThemeRelationshipType {
  PARENT = 'parent', // Current theme is a parent of the related theme
  CHILD = 'child', // Current theme is a child of the related theme
  RELATED = 'related', // Themes are related without hierarchy
  EVOLUTION = 'evolution', // Current theme evolved from the related theme
  CONFLICT = 'conflict', // Themes represent conflicting viewpoints
  DEPENDENCY = 'dependency', // Current theme depends on the related theme
}

/**
 * Structure representing a relationship between themes
 */
export interface ThemeRelationship {
  /** ID of the related theme */
  relatedThemeId: string;
  /** Name of the related theme */
  relatedThemeName: string;
  /** Type of relationship */
  relationshipType: ThemeRelationshipType;
  /** Strength of the relationship (0-1) */
  relationshipStrength: number;
  /** When the relationship was established */
  establishedAt: number;
  /** Additional descriptive information about the relationship */
  description?: string;
}

/**
 * Information about the origin of a theme
 */
export interface ThemeOrigin {
  /** Where the theme was first identified (meeting, document, etc.) */
  sourceType: string;
  /** ID of the source where the theme originated */
  sourceId: string;
  /** When the theme was first identified */
  identifiedAt: number;
  /** User who first introduced or identified this theme */
  originatingUserId?: string;
}

/**
 * Tracking data for theme evolution over time
 */
export interface ThemeEvolution {
  /** Evolution stages of this theme */
  stages: Array<{
    /** When this stage occurred */
    timestamp: number;
    /** Description of this evolution stage */
    description: string;
    /** Source where this evolution was observed */
    sourceId?: string;
    /** Changes in theme relevance at this stage */
    relevanceChange?: number;
  }>;
  /** Overall maturity level of the theme (0-1) */
  maturityLevel: number;
  /** Is the theme still actively evolving */
  isActive: boolean;
}

/**
 * Theme-related metadata that extends the base context metadata
 */
export interface ThemeMetadata {
  /** IDs of themes associated with this context item */
  themeIds?: string[];
  /** Names of themes associated with this context item */
  themeNames?: string[];
  /** Map of theme IDs to relevance scores (0-1) */
  themeRelevance?: Record<string, number>;
  /** Relationships to other themes */
  themeRelationships?: ThemeRelationship[];
  /** Information about theme origin */
  themeOrigin?: ThemeOrigin;
  /** Tracking data for theme evolution */
  themeEvolution?: ThemeEvolution;

  /** Map of role types to relevance scores (0-1) */
  roleRelevance?: Record<UserRole, number>;
  /** Roles that contributed to this context item */
  contributingRoles?: UserRole[];
  /** Roles that would find this context particularly relevant */
  targetRoles?: UserRole[];
  /** Map of role types to tailored summaries of the content */
  roleSpecificSummaries?: Record<UserRole, string>;
  /** Required expertise level to fully utilize this information (0-1) */
  expertiseLevel?: number;
}
