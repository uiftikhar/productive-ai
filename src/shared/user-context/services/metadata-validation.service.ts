/**
 * Metadata Validation Service
 * Handles validation of different types of metadata
 */

import { 
  UserContextValidationError 
} from '../types/context.types.ts';
import { MemoryType } from '../types/memory.types.ts';
import { TemporalRelevanceModel } from '../types/temporal.types.ts';

/**
 * Service for validating metadata objects to ensure they have the required fields 
 * and proper data types/ranges
 */
export class MetadataValidationService {
  /**
   * Validate that required fields are present in metadata
   */
  validateMetadata(
    metadata: Record<string, any>,
    requiredFields: string[],
  ): void {
    for (const field of requiredFields) {
      if (metadata[field] === undefined) {
        throw new UserContextValidationError(
          `Required metadata field "${field}" is missing`,
        );
      }
    }
  }

  /**
   * Validate theme-related metadata
   */
  validateThemeMetadata(metadata: Record<string, any>): void {
    // Theme validation
    if (
      metadata.themeIds &&
      metadata.themeNames &&
      metadata.themeIds.length !== metadata.themeNames.length
    ) {
      throw new UserContextValidationError(
        'Theme IDs and names arrays must have the same length',
      );
    }

    if (metadata.themeRelevance) {
      for (const [themeId, score] of Object.entries(metadata.themeRelevance)) {
        if (typeof score === 'number' && (score < 0 || score > 1)) {
          throw new UserContextValidationError(
            `Theme relevance score must be between 0 and 1, got ${score} for theme ${themeId}`,
          );
        }
      }
    }
  }

  /**
   * Validate role-related metadata
   */
  validateRoleMetadata(metadata: Record<string, any>): void {
    if (metadata.roleRelevance) {
      for (const [role, score] of Object.entries(metadata.roleRelevance)) {
        if (typeof score === 'number' && (score < 0 || score > 1)) {
          throw new UserContextValidationError(
            `Role relevance score must be between 0 and 1, got ${score} for role ${role}`,
          );
        }
      }
    }
  }

  /**
   * Validate memory-related metadata
   */
  validateMemoryMetadata(metadata: Record<string, any>): void {
    if (
      metadata.memoryType &&
      !Object.values(MemoryType).includes(metadata.memoryType as MemoryType)
    ) {
      throw new UserContextValidationError(
        `Invalid memory type: ${metadata.memoryType}`,
      );
    }

    if (
      metadata.memoryStrength !== undefined &&
      (metadata.memoryStrength < 0 || metadata.memoryStrength > 1)
    ) {
      throw new UserContextValidationError(
        `Memory strength must be between 0 and 1, got ${metadata.memoryStrength}`,
      );
    }
  }

  /**
   * Validate temporal-related metadata
   */
  validateTemporalMetadata(metadata: Record<string, any>): void {
    if (
      metadata.temporalRelevanceModel &&
      !Object.values(TemporalRelevanceModel).includes(
        metadata.temporalRelevanceModel as TemporalRelevanceModel,
      )
    ) {
      throw new UserContextValidationError(
        `Invalid temporal relevance model: ${metadata.temporalRelevanceModel}`,
      );
    }

    if (
      metadata.decayRate !== undefined &&
      (metadata.decayRate < 0 || metadata.decayRate > 1)
    ) {
      throw new UserContextValidationError(
        `Decay rate must be between 0 and 1, got ${metadata.decayRate}`,
      );
    }
  }

  /**
   * Validate all types of metadata in a single call
   */
  validateAllMetadata(metadata: Record<string, any>, requiredFields: string[] = []): void {
    // Validate required fields first
    if (requiredFields.length > 0) {
      this.validateMetadata(metadata, requiredFields);
    }
    
    // Then validate each specialized type
    this.validateThemeMetadata(metadata);
    this.validateRoleMetadata(metadata);
    this.validateMemoryMetadata(metadata);
    this.validateTemporalMetadata(metadata);
  }
}
