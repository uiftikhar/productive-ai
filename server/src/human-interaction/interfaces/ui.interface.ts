/**
 * UI Integration Interfaces
 * Part of Milestone 2.3: Human-in-the-Loop Integration
 */

/**
 * Types of UI interaction points
 */
export enum InteractionPointType {
  APPROVAL_REQUEST = 'approval_request',
  CHECKPOINT = 'checkpoint',
  FEEDBACK_REQUEST = 'feedback_request',
  NOTIFICATION = 'notification',
  DECISION_POINT = 'decision_point',
  ERROR_RESOLUTION = 'error_resolution',
  INFORMATION = 'information',
  CONFIRMATION = 'confirmation',
  CUSTOM = 'custom'
}

/**
 * Priority levels for UI interactions
 */
export enum InteractionPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * UI notification type
 */
export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error',
  SYSTEM = 'system'
}

/**
 * Delivery channel for notifications
 */
export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
  WEBHOOK = 'webhook',
  SLACK = 'slack'
}

/**
 * UI interaction point definition
 */
export interface InteractionPoint {
  id: string;
  type: InteractionPointType;
  title: string;
  description?: string;
  priority: InteractionPriority;
  component: string; // UI component to render
  props?: Record<string, any>; // Props to pass to the component
  position?: 'modal' | 'sidebar' | 'inline' | 'toast' | 'banner';
  condition?: string; // Condition for when to show this interaction point
  autoDismiss?: boolean;
  dismissAfter?: number; // milliseconds
  actions?: UIAction[];
  metadata?: Record<string, any>;
}

/**
 * UI action that can be taken in an interaction
 */
export interface UIAction {
  id: string;
  label: string;
  type: 'primary' | 'secondary' | 'danger' | 'link' | 'custom';
  action: string; // Action identifier
  payload?: any; // Data to include with action
  confirmationRequired?: boolean;
  confirmationMessage?: string;
  icon?: string;
  disabled?: boolean;
  tooltip?: string;
  metadata?: Record<string, any>;
}

/**
 * Notification to deliver to user
 */
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: Date;
  expiresAt?: Date;
  read: boolean;
  readAt?: Date;
  actionable: boolean;
  actions?: UIAction[];
  data?: any;
  sourceId?: string;
  sourceType?: string;
  channels: NotificationChannel[];
  priority: InteractionPriority;
  icon?: string;
  metadata?: Record<string, any>;
}

/**
 * User interaction response
 */
export interface InteractionResponse {
  interactionId: string;
  userId: string;
  timestamp: Date;
  actionId?: string;
  responseData?: any;
  duration?: number; // How long it took to respond
  metadata?: Record<string, any>;
}

/**
 * Notification service interface
 */
export interface NotificationService {
  /**
   * Send a notification to a user
   */
  sendNotification(
    notification: Omit<Notification, 'id' | 'createdAt' | 'read' | 'readAt'>
  ): Promise<Notification>;
  
  /**
   * Mark a notification as read
   */
  markAsRead(notificationId: string, userId: string): Promise<boolean>;
  
  /**
   * Get notifications for a user
   */
  getUserNotifications(
    userId: string, 
    options?: {
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
  }>;
  
  /**
   * Delete a notification
   */
  deleteNotification(notificationId: string): Promise<boolean>;
  
  /**
   * Subscribe to notification events
   */
  subscribeToEvents(callback: (event: NotificationEvent) => void): string;
  
  /**
   * Unsubscribe from notification events
   */
  unsubscribeFromEvents(subscriptionId: string): boolean;
}

/**
 * Interaction service interface
 */
export interface InteractionService {
  /**
   * Register an interaction point
   */
  registerInteractionPoint(
    interactionPoint: Omit<InteractionPoint, 'id'>
  ): Promise<InteractionPoint>;
  
  /**
   * Get an interaction point by ID
   */
  getInteractionPoint(id: string): Promise<InteractionPoint | null>;
  
  /**
   * Show an interaction to a user
   */
  showInteraction(
    interactionId: string, 
    userId: string,
    context?: any
  ): Promise<string>; // Returns interaction instance ID
  
  /**
   * Process a user response to an interaction
   */
  processInteractionResponse(
    response: InteractionResponse
  ): Promise<void>;
  
  /**
   * Get active interactions for a user
   */
  getUserActiveInteractions(userId: string): Promise<Array<{
    instanceId: string;
    interaction: InteractionPoint;
    context?: any;
  }>>;
  
  /**
   * Subscribe to interaction events
   */
  subscribeToEvents(callback: (event: InteractionEvent) => void): string;
  
  /**
   * Unsubscribe from interaction events
   */
  unsubscribeFromEvents(subscriptionId: string): boolean;
}

/**
 * Notification event
 */
export interface NotificationEvent {
  type: 'notification_sent' | 'notification_read' | 'notification_expired' | 'notification_deleted';
  timestamp: Date;
  notificationId: string;
  notification: Notification;
  userId: string;
}

/**
 * Interaction event
 */
export interface InteractionEvent {
  type: 'interaction_shown' | 'interaction_responded' | 'interaction_dismissed' | 'interaction_expired';
  timestamp: Date;
  instanceId: string;
  interactionId: string;
  interaction: InteractionPoint;
  userId: string;
  response?: InteractionResponse;
} 