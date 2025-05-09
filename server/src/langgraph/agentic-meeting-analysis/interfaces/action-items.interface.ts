/**
 * Action Items Interface
 * Defines structures for enhanced action item processing
 * Part of Milestone 3.2: Action Item Processing
 */

import { ConfidenceLevel } from './agent.interface';

/**
 * Priority levels for action items
 */
export enum ActionItemPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Status of action items
 */
export enum ActionItemStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  BLOCKED = 'blocked',
  CANCELLED = 'cancelled',
  DELAYED = 'delayed',
}

/**
 * Verification status for automatically detected information
 */
export enum VerificationStatus {
  UNVERIFIED = 'unverified',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  NEEDS_REVIEW = 'needs_review',
}

/**
 * Time frame information for deadlines
 */
export interface TimeFrame {
  type: 'absolute' | 'relative';
  date?: string; // ISO date string for absolute dates
  relativeValue?: number; // For relative time frames
  relativeUnit?: 'day' | 'week' | 'month'; // Unit for relative time frames
  time?: string; // Time in HH:MM format
  originalText: string; // Original text that was interpreted as a time frame
  confidence: number; // Confidence in the extraction
  verificationStatus: VerificationStatus;
}

/**
 * Information about an assignee
 */
export interface AssigneeInfo {
  id?: string; // ID in the system
  name: string;
  role?: string;
  confidence: number;
  detectionMethod: 'direct_mention' | 'implied' | 'role_based' | 'org_structure';
  verificationStatus: VerificationStatus;
}

/**
 * Action item representation
 */
export interface ActionItem {
  id: string;
  description: string;
  meetingId: string;
  meetingTitle?: string;
  createdAt: Date;
  updatedAt: Date;
  status: ActionItemStatus;
  priority: ActionItemPriority;
  priorityRationale?: string;
  assignees: AssigneeInfo[];
  deadline?: TimeFrame;
  topicId?: string;
  topicTitle?: string;
  relatedDecisionId?: string;
  progressPercentage?: number;
  completedAt?: Date;
  verificationStatus: VerificationStatus;
  verifiedAt?: Date;
  extractionConfidence: number;
  lastStatusUpdate?: Date;
}

/**
 * Interface for extracting action items from meeting transcripts
 */
export interface ActionItemExtractionService {
  /**
   * Extract action items from a meeting transcript
   */
  extractActionItems(
    transcript: string,
    meetingId: string,
    meetingTitle: string,
    participantInfo?: any[]
  ): Promise<ActionItem[]>;
}

/**
 * Interface for tracking and managing action items
 */
export interface ActionItemTrackingService {
  /**
   * Store a new action item
   */
  storeActionItem(actionItem: ActionItem): Promise<string>;
  
  /**
   * Get an action item by ID
   */
  getActionItemById(id: string): Promise<ActionItem | null>;
  
  /**
   * Get all action items for a meeting
   */
  getActionItemsByMeeting(meetingId: string): Promise<ActionItem[]>;
  
  /**
   * Get all action items assigned to a particular user
   */
  getActionItemsByAssignee(assigneeId: string): Promise<ActionItem[]>;
  
  /**
   * Update the status of an action item
   */
  updateActionItemStatus(
    id: string,
    status: ActionItemStatus,
    progressPercentage?: number
  ): Promise<boolean>;
  
  /**
   * Verify action item information after review
   */
  verifyActionItem(
    id: string,
    verifiedFields: string[],
    modifiedFields?: Record<string, any>
  ): Promise<ActionItem>;
  
  /**
   * Get all action items
   */
  getAllActionItems(): Promise<ActionItem[]>;
  
  /**
   * Search for action items
   */
  searchActionItems(
    query: string,
    filters?: {
      status?: ActionItemStatus[];
      priority?: string[];
      assignee?: string[];
      meeting?: string[];
      dueBeforeDate?: string;
      dueAfterDate?: string;
    }
  ): Promise<ActionItem[]>;
  
  /**
   * Delete an action item
   */
  deleteActionItem(id: string): Promise<boolean>;
}

/**
 * Interface for external system integration
 */
export interface ActionItemIntegrationService {
  /**
   * Connect to an external project management system
   */
  connectToExternalSystem(
    system: string,
    connectionParams: Record<string, any>
  ): Promise<boolean>;
  
  /**
   * Integrate an action item with an external system
   */
  integrateActionItem(
    actionItemId: string,
    externalSystem: string,
    mappingOptions?: Record<string, any>
  ): Promise<{ externalId: string; success: boolean }>;
  
  /**
   * Sync action item status from external system
   */
  syncFromExternalSystem(
    actionItemId: string,
    externalSystem: string
  ): Promise<{ 
    success: boolean; 
    updatedStatus?: ActionItemStatus;
    updatedProgress?: number;
  }>;
  
  /**
   * Push action item updates to external system
   */
  pushUpdatesToExternalSystem(
    actionItemId: string, 
    externalSystem: string
  ): Promise<boolean>;
  
  /**
   * Get available integration systems
   */
  getAvailableIntegrationSystems(): Promise<string[]>;
  
  /**
   * Get status of integration with external system
   */
  getIntegrationStatus(
    externalSystem: string
  ): Promise<{ 
    connected: boolean; 
    lastSyncTime?: Date;
    itemCount?: number;
  }>;
}

/**
 * Interface for notification about action items
 */
export interface ActionItemNotificationService {
  /**
   * Set user notification preferences
   */
  setUserPreferences(
    userId: string,
    preferences: {
      channels: string[];
      emailAddress?: string;
      slackMemberId?: string;
      phoneNumber?: string;
    }
  ): Promise<boolean>;
  
  /**
   * Notify about action item status change
   */
  notifyStatusChange(
    actionItem: ActionItem,
    previousStatus: ActionItemStatus,
    recipients: string[],
    additionalNotes?: string
  ): Promise<{ success: boolean; notificationIds: string[] }>;
  
  /**
   * Notify assignees about new action item
   */
  notifyNewAssignment(
    actionItem: ActionItem,
    additionalNotes?: string
  ): Promise<{ success: boolean; notificationIds: string[] }>;
  
  /**
   * Get notification history for an action item
   */
  getNotificationHistory(
    actionItemId: string
  ): Promise<any[]>;
  
  /**
   * Create custom notification template
   */
  createNotificationTemplate(
    template: any
  ): Promise<string>;
  
  /**
   * Register notification subscriber
   */
  registerNotificationSubscriber(
    subscriber: {
      id: string;
      eventTypes: string[];
      callback: (notification: any) => Promise<void>;
    }
  ): Promise<boolean>;
  
  /**
   * Send generic notification
   */
  sendNotification(
    type: string,
    recipients: string[],
    subject: string,
    content: string | Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<{ success: boolean; notificationIds: string[] }>;
  
  /**
   * Send reminder for action item
   */
  sendReminder(
    actionItemId: string,
    recipients?: string[],
    customMessage?: string
  ): Promise<{ success: boolean; notificationIds: string[] }>;
} 