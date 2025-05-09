/**
 * Action Item Tracking Service
 * 
 * Implements the ActionItemTrackingService interface to store, retrieve, and update action items
 * Part of Milestone 3.2: Action Item Processing
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ActionItem,
  ActionItemStatus,
  ActionItemTrackingService,
  VerificationStatus
} from '../interfaces/action-items.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

export interface ActionItemTrackingOptions {
  logger?: Logger;
  storageType?: 'memory' | 'database';
  persistChanges?: boolean;
}

/**
 * Implementation of the ActionItemTrackingService interface
 */
export class ActionItemTrackingServiceImpl implements ActionItemTrackingService {
  private logger: Logger;
  private storageType: 'memory' | 'database';
  private persistChanges: boolean;
  
  // In-memory storage
  private actionItems: Map<string, ActionItem> = new Map();
  private actionItemsByMeeting: Map<string, Set<string>> = new Map();
  private actionItemsByAssignee: Map<string, Set<string>> = new Map();
  
  constructor(options: ActionItemTrackingOptions = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.storageType = options.storageType || 'memory';
    this.persistChanges = options.persistChanges !== false;
    
    this.logger.info('ActionItemTrackingService initialized');
  }
  
  /**
   * Store action item in the system
   */
  async storeActionItem(actionItem: ActionItem): Promise<string> {
    try {
      // Ensure the action item has an ID
      if (!actionItem.id) {
        actionItem.id = `action-${uuidv4()}`;
      }
      
      // Set creation/update timestamps if not present
      const now = new Date();
      if (!actionItem.createdAt) {
        actionItem.createdAt = now;
      }
      actionItem.updatedAt = now;
      
      // Store the action item
      this.actionItems.set(actionItem.id, actionItem);
      
      // Update meeting index
      if (actionItem.meetingId) {
        if (!this.actionItemsByMeeting.has(actionItem.meetingId)) {
          this.actionItemsByMeeting.set(actionItem.meetingId, new Set());
        }
        this.actionItemsByMeeting.get(actionItem.meetingId)?.add(actionItem.id);
      }
      
      // Update assignee index
      for (const assignee of actionItem.assignees) {
        if (assignee.id) {
          if (!this.actionItemsByAssignee.has(assignee.id)) {
            this.actionItemsByAssignee.set(assignee.id, new Set());
          }
          this.actionItemsByAssignee.get(assignee.id)?.add(actionItem.id);
        }
      }
      
      this.logger.debug(`Stored action item ${actionItem.id}`);
      
      return actionItem.id;
    } catch (error) {
      this.logger.error(`Error storing action item: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Get action item by ID
   */
  async getActionItemById(id: string): Promise<ActionItem | null> {
    const actionItem = this.actionItems.get(id);
    return actionItem || null;
  }
  
  /**
   * Get action items by meeting
   */
  async getActionItemsByMeeting(meetingId: string): Promise<ActionItem[]> {
    const actionItemIds = this.actionItemsByMeeting.get(meetingId);
    if (!actionItemIds || actionItemIds.size === 0) {
      return [];
    }
    
    const items: ActionItem[] = [];
    for (const id of actionItemIds) {
      const item = this.actionItems.get(id);
      if (item) {
        items.push(item);
      }
    }
    
    // Sort by priority (higher priority first) and then by deadline
    return items.sort((a, b) => {
      // First by priority (critical/high -> medium -> low)
      const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
      const priorityA = priorityOrder[a.priority.toLowerCase() as keyof typeof priorityOrder] || 2;
      const priorityB = priorityOrder[b.priority.toLowerCase() as keyof typeof priorityOrder] || 2;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // Then by deadline if available
      if (a.deadline?.date && b.deadline?.date) {
        return new Date(a.deadline.date).getTime() - new Date(b.deadline.date).getTime();
      }
      
      if (a.deadline?.date) return -1;
      if (b.deadline?.date) return 1;
      
      // Finally by creation time
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }
  
  /**
   * Get action items by assignee
   */
  async getActionItemsByAssignee(assigneeId: string): Promise<ActionItem[]> {
    const actionItemIds = this.actionItemsByAssignee.get(assigneeId);
    if (!actionItemIds || actionItemIds.size === 0) {
      return [];
    }
    
    const items: ActionItem[] = [];
    for (const id of actionItemIds) {
      const item = this.actionItems.get(id);
      if (item) {
        items.push(item);
      }
    }
    
    // Sort by status (pending/in_progress -> blocked -> completed/cancelled)
    // then by priority and deadline
    return items.sort((a, b) => {
      // First by status
      const statusOrder = {
        'pending': 0,
        'in_progress': 1,
        'blocked': 2,
        'completed': 3,
        'cancelled': 4,
        'delayed': 5
      };
      
      const statusA = statusOrder[a.status.toLowerCase().replace('_', '') as keyof typeof statusOrder] || 0;
      const statusB = statusOrder[b.status.toLowerCase().replace('_', '') as keyof typeof statusOrder] || 0;
      
      if (statusA !== statusB) {
        return statusA - statusB;
      }
      
      // Then by priority
      const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
      const priorityA = priorityOrder[a.priority.toLowerCase() as keyof typeof priorityOrder] || 2;
      const priorityB = priorityOrder[b.priority.toLowerCase() as keyof typeof priorityOrder] || 2;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // Then by deadline if available
      if (a.deadline?.date && b.deadline?.date) {
        return new Date(a.deadline.date).getTime() - new Date(b.deadline.date).getTime();
      }
      
      return 0;
    });
  }
  
  /**
   * Update action item status
   */
  async updateActionItemStatus(
    id: string,
    status: ActionItemStatus,
    progressPercentage?: number
  ): Promise<boolean> {
    const actionItem = this.actionItems.get(id);
    if (!actionItem) {
      this.logger.warn(`Cannot update status of non-existent action item: ${id}`);
      return false;
    }
    
    // Update the status
    actionItem.status = status;
    actionItem.updatedAt = new Date();
    
    // Update progress percentage if provided
    if (progressPercentage !== undefined) {
      // Ensure it's between 0 and 100
      actionItem.progressPercentage = Math.min(100, Math.max(0, progressPercentage));
    } else {
      // Set default progress based on status
      switch (status) {
        case ActionItemStatus.COMPLETED:
          actionItem.progressPercentage = 100;
          actionItem.completedAt = new Date();
          break;
        case ActionItemStatus.IN_PROGRESS:
          // If no progress yet, set to a default 50%
          if (!actionItem.progressPercentage || actionItem.progressPercentage === 0) {
            actionItem.progressPercentage = 50;
          }
          break;
        case ActionItemStatus.PENDING:
          actionItem.progressPercentage = 0;
          break;
        case ActionItemStatus.BLOCKED:
        case ActionItemStatus.CANCELLED:
          // Don't change progress percentage for these statuses
          break;
      }
    }
    
    actionItem.lastStatusUpdate = new Date();
    
    // Update in storage
    this.actionItems.set(id, actionItem);
    
    this.logger.debug(`Updated action item ${id} status to ${status}`);
    
    return true;
  }
  
  /**
   * Verify action item information
   */
  async verifyActionItem(
    id: string,
    verifiedFields: string[],
    modifiedFields?: Record<string, any>
  ): Promise<ActionItem> {
    const actionItem = this.actionItems.get(id);
    if (!actionItem) {
      throw new Error(`Action item ${id} not found`);
    }
    
    // Apply modifications if provided
    if (modifiedFields) {
      for (const [field, value] of Object.entries(modifiedFields)) {
        if (field in actionItem) {
          // Type safety is challenging here since we're using dynamic field names
          // In a real implementation, we would have better type checking
          (actionItem as any)[field] = value;
        }
      }
    }
    
    // Mark verified fields
    for (const field of verifiedFields) {
      if (field === 'assignees' && actionItem.assignees) {
        // For assignees, mark each assignee as verified
        for (const assignee of actionItem.assignees) {
          assignee.verificationStatus = VerificationStatus.VERIFIED;
        }
      } else if (field === 'deadline' && actionItem.deadline) {
        // Mark deadline as verified
        actionItem.deadline.verificationStatus = VerificationStatus.VERIFIED;
      }
    }
    
    // If all critical fields are verified, mark the entire action item as verified
    const criticalFields = ['description', 'assignees', 'deadline', 'priority'];
    const allCriticalFieldsVerified = criticalFields.every(field => {
      if (field === 'assignees' && actionItem.assignees) {
        return actionItem.assignees.every(
          assignee => assignee.verificationStatus === VerificationStatus.VERIFIED
        );
      }
      if (field === 'deadline') {
        // If no deadline, consider it verified
        if (!actionItem.deadline) return true;
        return actionItem.deadline.verificationStatus === VerificationStatus.VERIFIED;
      }
      return verifiedFields.includes(field);
    });
    
    if (allCriticalFieldsVerified) {
      actionItem.verificationStatus = VerificationStatus.VERIFIED;
      actionItem.verifiedAt = new Date();
    }
    
    // Update in storage
    actionItem.updatedAt = new Date();
    this.actionItems.set(id, actionItem);
    
    this.logger.debug(`Verified action item ${id} fields: ${verifiedFields.join(', ')}`);
    
    return actionItem;
  }
  
  /**
   * Get all action items
   */
  async getAllActionItems(): Promise<ActionItem[]> {
    return Array.from(this.actionItems.values());
  }
  
  /**
   * Search for action items
   */
  async searchActionItems(
    query: string,
    filters?: {
      status?: ActionItemStatus[];
      priority?: string[];
      assignee?: string[];
      meeting?: string[];
      dueBeforeDate?: string;
      dueAfterDate?: string;
    }
  ): Promise<ActionItem[]> {
    const allItems = Array.from(this.actionItems.values());
    
    // First apply text search
    let results = allItems;
    if (query && query.trim() !== '') {
      const searchTerms = query.toLowerCase().trim().split(/\s+/);
      results = allItems.filter(item => {
        const searchableText = `${item.description} ${item.priorityRationale || ''} ${item.meetingTitle || ''}`.toLowerCase();
        return searchTerms.every(term => searchableText.includes(term));
      });
    }
    
    // Then apply filters
    if (filters) {
      if (filters.status && filters.status.length > 0) {
        results = results.filter(item => filters.status!.includes(item.status));
      }
      
      if (filters.priority && filters.priority.length > 0) {
        results = results.filter(item => filters.priority!.includes(item.priority));
      }
      
      if (filters.assignee && filters.assignee.length > 0) {
        results = results.filter(item => 
          item.assignees.some(assignee => 
            filters.assignee!.includes(assignee.id || assignee.name)
          )
        );
      }
      
      if (filters.meeting && filters.meeting.length > 0) {
        results = results.filter(item => filters.meeting!.includes(item.meetingId));
      }
      
      // Due date filters
      if (filters.dueBeforeDate && filters.dueBeforeDate.trim() !== '') {
        const beforeDate = new Date(filters.dueBeforeDate);
        results = results.filter(item => {
          if (!item.deadline?.date) return false;
          return new Date(item.deadline.date) <= beforeDate;
        });
      }
      
      if (filters.dueAfterDate && filters.dueAfterDate.trim() !== '') {
        const afterDate = new Date(filters.dueAfterDate);
        results = results.filter(item => {
          if (!item.deadline?.date) return false;
          return new Date(item.deadline.date) >= afterDate;
        });
      }
    }
    
    return results;
  }
  
  /**
   * Delete an action item
   */
  async deleteActionItem(id: string): Promise<boolean> {
    const actionItem = this.actionItems.get(id);
    if (!actionItem) {
      return false;
    }
    
    // Remove from main storage
    this.actionItems.delete(id);
    
    // Remove from meeting index
    if (actionItem.meetingId && this.actionItemsByMeeting.has(actionItem.meetingId)) {
      this.actionItemsByMeeting.get(actionItem.meetingId)?.delete(id);
    }
    
    // Remove from assignee index
    for (const assignee of actionItem.assignees) {
      if (assignee.id && this.actionItemsByAssignee.has(assignee.id)) {
        this.actionItemsByAssignee.get(assignee.id)?.delete(id);
      }
    }
    
    this.logger.debug(`Deleted action item ${id}`);
    
    return true;
  }
} 