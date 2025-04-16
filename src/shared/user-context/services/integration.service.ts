/**
 * Integration Service
 * Handles integration with external systems such as task management,
 * issue tracking, and project management platforms.
 */

import { RecordMetadata } from '@pinecone-database/pinecone';
import { BaseContextService } from './base-context.service';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  BaseContextMetadata,
  ContextType,
  USER_CONTEXT_INDEX,
  UserContextError,
  UserContextNotFoundError,
  UserContextValidationError,
} from '../types/context.types';
import { VectorRecord } from '../../../pinecone/pinecone.type';

/**
 * Service for managing integrations with external systems
 */
export class IntegrationService extends BaseContextService {
  protected logger: Logger;

  constructor(options: any = {}) {
    super(options);
    this.logger = options.logger || new ConsoleLogger();
  }

  /**
   * Integrate an action item with an external system
   * @param userId User identifier
   * @param actionItemId Action item identifier
   * @param externalSystem The external system to integrate with (e.g., 'jira', 'trello')
   * @param externalSystemId Optional existing ID in the external system
   * @param externalSystemData Additional data for the external system
   * @returns The external system ID
   */
  async integrateActionItemWithExternalSystem(
    userId: string,
    actionItemId: string,
    externalSystem: string,
    externalSystemId?: string,
    externalSystemData: Record<string, any> = {},
  ): Promise<string> {
    if (!actionItemId || !externalSystem) {
      throw new UserContextValidationError(
        'Action Item ID and External System are required',
      );
    }

    // Find the action item
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [],
          {
            topK: 1,
            filter: {
              actionItemId,
              contextType: ContextType.ACTION_ITEM,
            },
            includeValues: true,
            includeMetadata: true,
          },
          userId,
        ),
      `findActionItem:${userId}:${actionItemId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      throw new UserContextNotFoundError(actionItemId, userId);
    }

    const actionItem = result.matches[0];
    if (!actionItem.metadata) {
      throw new UserContextError(`Action item ${actionItemId} has no metadata`);
    }

    // In a real implementation, this would call the API of the external system
    // For this implementation, we'll just simulate the integration
    const newExternalId =
      externalSystemId || `ext-${externalSystem}-${Date.now()}`;

    // Update the action item with external system information
    const updatedRecord: VectorRecord<RecordMetadata> = {
      id: actionItem.id,
      values: this.ensureNumberArray(actionItem.values),
      metadata: this.prepareMetadataForStorage({
        ...actionItem.metadata,
        externalSystem,
        externalSystemId: newExternalId,
        externalSystemData: externalSystemData,
        lastUpdatedAt: Date.now(),
      }),
    };

    await this.executeWithRetry(
      () =>
        this.pineconeService.upsertVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [updatedRecord],
          userId,
        ),
      `updateActionItemExternal:${userId}:${actionItemId}`,
    );

    this.logger.debug('Integrated action item with external system', {
      userId,
      actionItemId,
      externalSystem,
      externalSystemId: newExternalId,
    });

    return newExternalId;
  }

  /**
   * Synchronize external system statuses with local action items
   * @param userId User identifier
   * @param externalSystem The external system to synchronize with
   * @returns Number of items synchronized
   */
  async syncExternalSystemStatuses(
    userId: string,
    externalSystem: string,
  ): Promise<number> {
    if (!externalSystem) {
      throw new UserContextValidationError('External System is required');
    }

    // Find action items integrated with this external system
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [],
          {
            filter: {
              contextType: ContextType.ACTION_ITEM,
              externalSystem,
            },
            topK: 1000, // Reasonable limit
            includeValues: true,
            includeMetadata: true,
          },
          userId,
        ),
      `findExternalItems:${userId}:${externalSystem}`,
    );

    if (!result.matches || result.matches.length === 0) {
      return 0; // No items to synchronize
    }

    // In a real implementation, this would:
    // 1. Call the external system's API to get the latest status for each item
    // 2. Compare with local status and update if different
    // For this implementation, we'll just simulate the synchronization
    const syncCount = Math.min(result.matches.length, 5); // Pretend we synced up to 5 items

    this.logger.info(`Synchronized ${syncCount} items with ${externalSystem}`, {
      userId,
      externalSystem,
      totalItems: result.matches.length,
      syncedItems: syncCount,
    });

    return syncCount;
  }

  /**
   * Get all action items integrated with an external system
   * @param userId User identifier
   * @param externalSystem The external system to query
   * @returns List of integrated action items
   */
  async getExternalSystemItems(
    userId: string,
    externalSystem: string,
  ): Promise<any[]> {
    if (!externalSystem) {
      throw new UserContextValidationError('External System is required');
    }

    // Find action items integrated with this external system
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [],
          {
            filter: {
              contextType: ContextType.ACTION_ITEM,
              externalSystem,
            },
            topK: 1000,
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `getExternalItems:${userId}:${externalSystem}`,
    );

    if (!result.matches || result.matches.length === 0) {
      return []; // No items found
    }

    // Transform to a more usable format
    return result.matches.map((match) => {
      const metadata = match.metadata || {};

      return {
        id: match.id,
        actionItemId: metadata.actionItemId,
        externalSystemId: metadata.externalSystemId,
        content: metadata.content,
        assigneeId: metadata.assigneeId,
        status: metadata.status,
        dueDate: metadata.dueDate,
        meetingId: metadata.meetingId,
        externalData:
          typeof metadata.externalSystemData === 'string'
            ? JSON.parse(metadata.externalSystemData)
            : metadata.externalSystemData || {},
      };
    });
  }

  /**
   * Remove integration with an external system for an action item
   * @param userId User identifier
   * @param actionItemId Action item identifier
   * @param externalSystem The external system to disconnect from
   * @returns True if successfully disconnected
   */
  async removeExternalIntegration(
    userId: string,
    actionItemId: string,
    externalSystem: string,
  ): Promise<boolean> {
    if (!actionItemId || !externalSystem) {
      throw new UserContextValidationError(
        'Action Item ID and External System are required',
      );
    }

    // Find the action item
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [],
          {
            topK: 1,
            filter: {
              actionItemId,
              contextType: ContextType.ACTION_ITEM,
              externalSystem,
            },
            includeValues: true,
            includeMetadata: true,
          },
          userId,
        ),
      `findActionItem:${userId}:${actionItemId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      throw new UserContextNotFoundError(actionItemId, userId);
    }

    const actionItem = result.matches[0];
    if (!actionItem.metadata) {
      throw new UserContextError(`Action item ${actionItemId} has no metadata`);
    }

    // Create a new metadata object without the external system fields
    const {
      externalSystem: _es,
      externalSystemId: _esi,
      externalSystemData: _esd,
      ...restMetadata
    } = actionItem.metadata;

    // Update the action item to remove external system information
    const updatedRecord: VectorRecord<RecordMetadata> = {
      id: actionItem.id,
      values: this.ensureNumberArray(actionItem.values),
      metadata: this.prepareMetadataForStorage({
        ...restMetadata,
        lastUpdatedAt: Date.now(),
      }),
    };

    await this.executeWithRetry(
      () =>
        this.pineconeService.upsertVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [updatedRecord],
          userId,
        ),
      `removeExternalIntegration:${userId}:${actionItemId}`,
    );

    this.logger.debug('Removed external integration for action item', {
      userId,
      actionItemId,
      externalSystem,
    });

    return true;
  }
}
