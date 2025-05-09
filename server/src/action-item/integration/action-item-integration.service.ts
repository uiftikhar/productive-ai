import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { IntegrationService } from '../../shared/services/user-context/integration.service';
import { ActionItemPriority, ActionItemStatus } from '../action-item-processor';

/**
 * Supported integration platforms
 */
export enum IntegrationPlatform {
  JIRA = 'jira',
  ASANA = 'asana',
  TRELLO = 'trello',
  GITHUB = 'github',
  MONDAY = 'monday',
  CLICKUP = 'clickup',
  CUSTOM = 'custom'
}

/**
 * Interface for integration credentials
 */
export interface IntegrationCredentials {
  apiKey?: string;
  username?: string;
  password?: string;
  token?: string;
  organizationId?: string;
  projectId?: string;
  url?: string;
  [key: string]: any;
}

/**
 * Base interface for action item data across platforms
 */
export interface ActionItemData {
  id: string; // Local ID
  externalId?: string; // ID in external system
  title: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: Date | null;
  priority?: ActionItemPriority;
  status: ActionItemStatus;
  labels?: string[];
  meetingId: string;
  meetingTitle?: string;
  parentId?: string; // For hierarchical relationships
  externalUrl?: string; // Link to item in external system
  lastSyncedAt?: Date;
  platform?: IntegrationPlatform;
}

/**
 * Synchronization direction options
 */
export enum SyncDirection {
  EXPORT_ONLY = 'export_only', // Only push local items to external system
  IMPORT_ONLY = 'import_only', // Only import from external system
  BIDIRECTIONAL = 'bidirectional' // Sync both ways
}

/**
 * Options for synchronization
 */
export interface SyncOptions {
  direction: SyncDirection;
  createMissing?: boolean;
  updateExisting?: boolean;
  importCompletedItems?: boolean;
  syncLabels?: boolean;
  syncAssignees?: boolean;
  syncDueDates?: boolean;
  filterByMeeting?: string; // Only sync items from specific meeting
  filterByAssignee?: string; // Only sync items for specific assignee
  dryRun?: boolean; // Only simulate changes without actually performing them
}

/**
 * Result of a synchronization operation
 */
export interface SyncResult {
  created: ActionItemData[];
  updated: ActionItemData[];
  failed: Array<{item: ActionItemData, error: string}>;
  unchanged: ActionItemData[];
  imported: ActionItemData[];
  timestamp: Date;
}

/**
 * Abstract base adapter class for integration platforms
 */
export abstract class IntegrationAdapter {
  protected logger: Logger;
  protected credentials: IntegrationCredentials;
  
  constructor(credentials: IntegrationCredentials, logger?: Logger) {
    this.credentials = credentials;
    this.logger = logger || new ConsoleLogger();
  }
  
  abstract get platform(): IntegrationPlatform;
  
  /**
   * Initialize the connection to the platform
   */
  abstract initialize(): Promise<boolean>;
  
  /**
   * Test the connection with provided credentials
   */
  abstract testConnection(): Promise<boolean>;
  
  /**
   * Create a new item in the external system
   */
  abstract createItem(item: ActionItemData): Promise<string | null>;
  
  /**
   * Update an existing item in the external system
   */
  abstract updateItem(item: ActionItemData): Promise<boolean>;
  
  /**
   * Get an item from the external system
   */
  abstract getItem(externalId: string): Promise<ActionItemData | null>;
  
  /**
   * List items from the external system with optional filters
   */
  abstract listItems(options?: any): Promise<ActionItemData[]>;
  
  /**
   * Delete an item from the external system
   */
  abstract deleteItem(externalId: string): Promise<boolean>;
}

/**
 * Main service for integrating action items with external systems
 */
export class ActionItemIntegrationService {
  private logger: Logger;
  private adapters: Map<string, IntegrationAdapter> = new Map();
  private userContextIntegration: IntegrationService;
  
  constructor(options: {
    logger?: Logger;
    userContextIntegration?: IntegrationService;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.userContextIntegration = options.userContextIntegration || new IntegrationService();
  }
  
  /**
   * Register an integration adapter for a user
   * @param userId User identifier
   * @param adapter Integration adapter implementation
   */
  registerAdapter(userId: string, adapter: IntegrationAdapter): void {
    const key = `${userId}:${adapter.platform}`;
    this.adapters.set(key, adapter);
    this.logger.info(`Registered ${adapter.platform} adapter for user ${userId}`);
  }
  
  /**
   * Get adapter for a specific user and platform
   */
  getAdapter(userId: string, platform: IntegrationPlatform): IntegrationAdapter | undefined {
    const key = `${userId}:${platform}`;
    return this.adapters.get(key);
  }
  
  /**
   * Synchronize action items with an external system
   */
  async synchronize(
    userId: string,
    platform: IntegrationPlatform,
    actionItems: ActionItemData[],
    options: SyncOptions
  ): Promise<SyncResult> {
    this.logger.info(`Starting sync with ${platform} for user ${userId}`);
    
    const adapter = this.getAdapter(userId, platform);
    if (!adapter) {
      throw new Error(`No adapter registered for ${platform} for user ${userId}`);
    }
    
    // Make sure adapter is initialized
    await adapter.initialize();
    
    // Prepare result structure
    const result: SyncResult = {
      created: [],
      updated: [],
      failed: [],
      unchanged: [],
      imported: [],
      timestamp: new Date()
    };
    
    // Export items to external system if needed
    if (options.direction !== SyncDirection.IMPORT_ONLY) {
      await this.exportItems(userId, adapter, actionItems, options, result);
    }
    
    // Import items from external system if needed
    if (options.direction !== SyncDirection.EXPORT_ONLY) {
      await this.importItems(userId, adapter, actionItems, options, result);
    }
    
    this.logger.info(`Sync completed with ${platform} for user ${userId}`, {
      created: result.created.length,
      updated: result.updated.length,
      failed: result.failed.length,
      unchanged: result.unchanged.length,
      imported: result.imported.length
    });
    
    return result;
  }
  
  /**
   * Export local action items to external system
   */
  private async exportItems(
    userId: string,
    adapter: IntegrationAdapter,
    actionItems: ActionItemData[],
    options: SyncOptions,
    result: SyncResult
  ): Promise<void> {
    if (options.dryRun) {
      this.logger.info('Dry run: simulating export operations only');
    }
    
    // Apply filters if needed
    let itemsToExport = [...actionItems];
    
    if (options.filterByMeeting) {
      itemsToExport = itemsToExport.filter(item => item.meetingId === options.filterByMeeting);
    }
    
    if (options.filterByAssignee) {
      itemsToExport = itemsToExport.filter(item => item.assigneeId === options.filterByAssignee);
    }
    
    // Process each item
    for (const item of itemsToExport) {
      try {
        if (item.externalId) {
          // Item already exists in external system, update if needed
          if (options.updateExisting) {
            if (!options.dryRun) {
              const success = await adapter.updateItem(item);
              if (success) {
                result.updated.push(item);
                
                // Use the UserContext integration service to store the relationship
                await this.userContextIntegration.integrateActionItemWithExternalSystem(
                  userId,
                  item.id,
                  adapter.platform,
                  item.externalId,
                  {
                    lastSyncedAt: new Date().toISOString(),
                    externalUrl: item.externalUrl
                  }
                );
              } else {
                result.failed.push({ item, error: 'Update failed' });
              }
            } else {
              // Dry run - simulate success
              result.updated.push(item);
            }
          } else {
            result.unchanged.push(item);
          }
        } else if (options.createMissing) {
          // Item doesn't exist in external system, create it
          if (!options.dryRun) {
            const externalId = await adapter.createItem(item);
            
            if (externalId) {
              const updatedItem = { 
                ...item, 
                externalId,
                lastSyncedAt: new Date()
              };
              result.created.push(updatedItem);
              
              // Store the integration relationship
              await this.userContextIntegration.integrateActionItemWithExternalSystem(
                userId,
                item.id,
                adapter.platform,
                externalId,
                {
                  lastSyncedAt: new Date().toISOString(),
                  externalUrl: updatedItem.externalUrl
                }
              );
            } else {
              result.failed.push({ item, error: 'Creation failed' });
            }
          } else {
            // Dry run - simulate success
            result.created.push({
              ...item,
              externalId: `dry-run-id-${Date.now()}`,
              lastSyncedAt: new Date()
            });
          }
        } else {
          result.unchanged.push(item);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Error processing item ${item.id}: ${errorMessage}`);
        result.failed.push({ item, error: errorMessage });
      }
    }
  }
  
  /**
   * Import items from external system
   */
  private async importItems(
    userId: string,
    adapter: IntegrationAdapter,
    existingItems: ActionItemData[],
    options: SyncOptions,
    result: SyncResult
  ): Promise<void> {
    if (options.dryRun) {
      this.logger.info('Dry run: simulating import operations only');
      return;
    }
    
    try {
      // Get items from external system
      const externalItems = await adapter.listItems();
      
      // Build map of existing items by external ID for quick lookup
      const existingItemMap = new Map<string, ActionItemData>();
      for (const item of existingItems) {
        if (item.externalId) {
          existingItemMap.set(item.externalId, item);
        }
      }
      
      // Process each external item
      for (const externalItem of externalItems) {
        // Skip completed items if specified
        if (!options.importCompletedItems && 
            (externalItem.status === ActionItemStatus.COMPLETED || 
             externalItem.status === ActionItemStatus.CANCELLED)) {
          continue;
        }
        
        // Check if we already have this item
        if (externalItem.externalId && existingItemMap.has(externalItem.externalId)) {
          const existingItem = existingItemMap.get(externalItem.externalId)!;
          
          // Update existing item with external data if needed
          const updatedItem = this.mergeItems(existingItem, externalItem, options);
          
          // Store updated information
          // Note: In a real implementation, we'd update the local database here
          result.updated.push(updatedItem);
        } else {
          // This is a new item, import it
          const newItem = {
            ...externalItem,
            id: externalItem.id || `imported-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            platform: adapter.platform,
            lastSyncedAt: new Date()
          };
          
          result.imported.push(newItem);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error importing items: ${errorMessage}`);
    }
  }
  
  /**
   * Merge local and external item data based on sync options
   */
  private mergeItems(
    localItem: ActionItemData,
    externalItem: ActionItemData,
    options: SyncOptions
  ): ActionItemData {
    const result = { ...localItem };
    
    // Always sync status changes
    result.status = externalItem.status;
    
    // Sync other fields based on options
    if (options.syncAssignees && externalItem.assigneeId) {
      result.assigneeId = externalItem.assigneeId;
      result.assigneeName = externalItem.assigneeName;
    }
    
    if (options.syncDueDates && externalItem.dueDate) {
      result.dueDate = externalItem.dueDate;
    }
    
    if (options.syncLabels && externalItem.labels) {
      result.labels = externalItem.labels;
    }
    
    result.lastSyncedAt = new Date();
    
    return result;
  }
  
  /**
   * Get the synchronization status for a set of action items
   */
  async getSyncStatus(
    userId: string,
    platform: IntegrationPlatform,
    actionItems: ActionItemData[]
  ): Promise<Map<string, {
    synced: boolean;
    lastSyncedAt?: Date;
    externalUrl?: string;
    status?: ActionItemStatus;
  }>> {
    const result = new Map();
    
    // Get all external integrations for this user and platform
    const integrations = await this.userContextIntegration.getExternalSystemItems(
      userId,
      platform
    );
    
    // Map integration data by action item ID
    const integrationMap = new Map();
    for (const integration of integrations) {
      integrationMap.set(integration.actionItemId, integration);
    }
    
    // Check status for each item
    for (const item of actionItems) {
      const integration = integrationMap.get(item.id);
      
      if (integration) {
        result.set(item.id, {
          synced: true,
          lastSyncedAt: integration.externalData?.lastSyncedAt 
            ? new Date(integration.externalData.lastSyncedAt) 
            : undefined,
          externalUrl: integration.externalData?.externalUrl,
          status: item.status
        });
      } else {
        result.set(item.id, {
          synced: false,
          status: item.status
        });
      }
    }
    
    return result;
  }
  
  /**
   * Get available adapters for a user
   */
  getAvailableAdapters(userId: string): IntegrationPlatform[] {
    const result: IntegrationPlatform[] = [];
    
    for (const [key, _] of this.adapters.entries()) {
      if (key.startsWith(`${userId}:`)) {
        const platform = key.split(':')[1] as IntegrationPlatform;
        result.push(platform);
      }
    }
    
    return result;
  }
  
  /**
   * Remove integration for an action item
   */
  async removeIntegration(
    userId: string,
    platform: IntegrationPlatform,
    actionItemId: string
  ): Promise<boolean> {
    return this.userContextIntegration.removeExternalIntegration(
      userId,
      actionItemId,
      platform
    );
  }
} 