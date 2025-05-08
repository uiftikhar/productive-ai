/**
 * Notification Service Implementation
 * Part of Milestone 2.3: Human-in-the-Loop Integration
 */
import { v4 as uuidv4 } from 'uuid';
import {
  NotificationService,
  Notification,
  NotificationChannel,
  NotificationEvent,
  NotificationType,
  InteractionPriority
} from '../interfaces/ui.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Configuration for the notification service
 */
export interface NotificationServiceConfig {
  maxNotificationsPerUser?: number;
  defaultExpiration?: number; // milliseconds
  defaultChannels?: NotificationChannel[];
  deliveryHandlers?: Partial<Record<NotificationChannel, NotificationDeliveryHandler>>;
  logger?: Logger;
}

/**
 * Handler for delivering notifications through different channels
 */
export interface NotificationDeliveryHandler {
  /**
   * Send a notification through a specific channel
   */
  sendNotification(notification: Notification): Promise<boolean>;
}

/**
 * Implementation of the notification service
 */
export class NotificationServiceImpl implements NotificationService {
  private notifications: Map<string, Notification> = new Map();
  private userNotificationIndices: Map<string, Set<string>> = new Map();
  private eventSubscriptions: Map<string, (event: NotificationEvent) => void> = new Map();
  private logger: Logger;
  private config: NotificationServiceConfig;
  private deliveryHandlers: Partial<Record<NotificationChannel, NotificationDeliveryHandler>>;
  
  /**
   * Create a new notification service
   */
  constructor(config: NotificationServiceConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    
    this.config = {
      maxNotificationsPerUser: 100,
      defaultExpiration: 30 * 24 * 60 * 60 * 1000, // 30 days
      defaultChannels: [NotificationChannel.IN_APP],
      ...config
    };
    
    this.deliveryHandlers = config.deliveryHandlers || {};
    
    this.logger.info('Notification service initialized');
  }
  
  /**
   * Send a notification to a user
   */
  async sendNotification(
    notification: Omit<Notification, 'id' | 'createdAt' | 'read' | 'readAt'>
  ): Promise<Notification> {
    const id = uuidv4();
    const now = new Date();
    
    // Create full notification object
    const fullNotification: Notification = {
      id,
      createdAt: now,
      read: false,
      ...notification,
      // Set defaults if not provided
      channels: notification.channels || this.config.defaultChannels || [NotificationChannel.IN_APP],
      expiresAt: notification.expiresAt || new Date(now.getTime() + (this.config.defaultExpiration || 0))
    };
    
    // Store the notification
    this.notifications.set(id, fullNotification);
    
    // Add to user index
    if (!this.userNotificationIndices.has(fullNotification.userId)) {
      this.userNotificationIndices.set(fullNotification.userId, new Set());
    }
    
    this.userNotificationIndices.get(fullNotification.userId)?.add(id);
    
    // Enforce maximum notifications limit per user
    if (this.config.maxNotificationsPerUser && 
        this.userNotificationIndices.get(fullNotification.userId)!.size > this.config.maxNotificationsPerUser) {
      this.enforceNotificationLimit(fullNotification.userId);
    }
    
    // Deliver notification through configured channels
    await this.deliverNotification(fullNotification);
    
    // Emit notification sent event
    this.emitEvent({
      type: 'notification_sent',
      timestamp: now,
      notificationId: id,
      notification: fullNotification,
      userId: fullNotification.userId
    });
    
    this.logger.info(`Sent notification: ${id}`, {
      type: fullNotification.type,
      userId: fullNotification.userId,
      channels: fullNotification.channels,
      title: fullNotification.title
    });
    
    return fullNotification;
  }
  
  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    
    if (!notification) {
      return false;
    }
    
    // Make sure the notification belongs to the user
    if (notification.userId !== userId) {
      return false;
    }
    
    // Update read status if not already read
    if (!notification.read) {
      notification.read = true;
      notification.readAt = new Date();
      
      // Update the notification
      this.notifications.set(notificationId, notification);
      
      // Emit notification read event
      this.emitEvent({
        type: 'notification_read',
        timestamp: new Date(),
        notificationId,
        notification,
        userId
      });
      
      this.logger.debug(`Marked notification as read: ${notificationId}`, {
        userId,
        title: notification.title
      });
    }
    
    return true;
  }
  
  /**
   * Get notifications for a user
   */
  async getUserNotifications(
    userId: string,
    options: {
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
  }> {
    const userNotificationIds = this.userNotificationIndices.get(userId) || new Set();
    let notifications = Array.from(userNotificationIds)
      .map(id => this.notifications.get(id)!)
      .filter(notification => !!notification);
    
    // Count total and unread before filtering
    const total = notifications.length;
    const unreadCount = notifications.filter(notification => !notification.read).length;
    
    // Filter by read status if requested
    if (options.unreadOnly) {
      notifications = notifications.filter(notification => !notification.read);
    }
    
    // Sort by creation date (newest first)
    notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    // Apply pagination
    if (options.offset !== undefined) {
      notifications = notifications.slice(options.offset);
    }
    
    if (options.limit !== undefined) {
      notifications = notifications.slice(0, options.limit);
    }
    
    this.logger.debug(`Retrieved ${notifications.length} notifications for user: ${userId}`, {
      total,
      unreadCount,
      limit: options.limit,
      offset: options.offset
    });
    
    return {
      notifications,
      total,
      unreadCount
    };
  }
  
  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string): Promise<boolean> {
    const notification = this.notifications.get(notificationId);
    
    if (!notification) {
      return false;
    }
    
    // Remove from storage
    this.notifications.delete(notificationId);
    
    // Remove from user index
    const userNotifications = this.userNotificationIndices.get(notification.userId);
    if (userNotifications) {
      userNotifications.delete(notificationId);
    }
    
    // Emit notification deleted event
    this.emitEvent({
      type: 'notification_deleted',
      timestamp: new Date(),
      notificationId,
      notification,
      userId: notification.userId
    });
    
    this.logger.debug(`Deleted notification: ${notificationId}`, {
      userId: notification.userId,
      title: notification.title
    });
    
    return true;
  }
  
  /**
   * Subscribe to notification events
   */
  subscribeToEvents(callback: (event: NotificationEvent) => void): string {
    const subscriptionId = uuidv4();
    this.eventSubscriptions.set(subscriptionId, callback);
    return subscriptionId;
  }
  
  /**
   * Unsubscribe from notification events
   */
  unsubscribeFromEvents(subscriptionId: string): boolean {
    return this.eventSubscriptions.delete(subscriptionId);
  }
  
  /**
   * Register a delivery handler for a specific channel
   */
  registerDeliveryHandler(channel: NotificationChannel, handler: NotificationDeliveryHandler): void {
    this.deliveryHandlers[channel] = handler;
    this.logger.info(`Registered delivery handler for channel: ${channel}`);
  }
  
  /**
   * Enforce notification limit per user by removing oldest read notifications
   */
  private enforceNotificationLimit(userId: string): void {
    const userNotificationIds = this.userNotificationIndices.get(userId);
    
    if (!userNotificationIds || this.config.maxNotificationsPerUser === undefined) {
      return;
    }
    
    if (userNotificationIds.size <= this.config.maxNotificationsPerUser) {
      return;
    }
    
    // Get all notifications for the user
    const userNotifications = Array.from(userNotificationIds)
      .map(id => this.notifications.get(id)!)
      .filter(notification => !!notification);
    
    // Sort by creation date (oldest first) and read status (read first)
    userNotifications.sort((a, b) => {
      // Prioritize read notifications for removal
      if (a.read !== b.read) {
        return a.read ? -1 : 1;
      }
      // Then by creation date (oldest first)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    
    // Calculate how many to remove
    const removeCount = userNotifications.length - this.config.maxNotificationsPerUser;
    
    if (removeCount <= 0) {
      return;
    }
    
    // Remove oldest notifications
    const toRemove = userNotifications.slice(0, removeCount);
    
    for (const notification of toRemove) {
      this.notifications.delete(notification.id);
      userNotificationIds.delete(notification.id);
      
      this.logger.debug(`Removed old notification due to limit: ${notification.id}`, {
        userId,
        title: notification.title
      });
    }
    
    this.logger.info(`Enforced notification limit for user: ${userId}`, {
      removedCount: toRemove.length,
      newTotal: userNotificationIds.size
    });
  }
  
  /**
   * Deliver notification through configured channels
   */
  private async deliverNotification(notification: Notification): Promise<void> {
    const deliveryPromises: Promise<boolean>[] = [];
    
    // Attempt delivery through each configured channel
    for (const channel of notification.channels) {
      const handler = this.deliveryHandlers[channel];
      
      if (handler) {
        try {
          deliveryPromises.push(handler.sendNotification(notification));
        } catch (error) {
          this.logger.error(`Error delivering notification through channel: ${channel}`, { error });
        }
      } else {
        this.logger.debug(`No delivery handler registered for channel: ${channel}`);
      }
    }
    
    // Wait for all deliveries to complete
    if (deliveryPromises.length > 0) {
      try {
        const results = await Promise.all(deliveryPromises);
        const successCount = results.filter(Boolean).length;
        
        if (successCount < notification.channels.length) {
          this.logger.warn(`Only delivered notification to ${successCount}/${notification.channels.length} channels`, {
            notificationId: notification.id
          });
        }
      } catch (error) {
        this.logger.error('Error delivering notification', { error });
      }
    }
  }
  
  /**
   * Emit a notification event to all subscribers
   */
  private emitEvent(event: NotificationEvent): void {
    for (const callback of this.eventSubscriptions.values()) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error('Error in notification event subscriber', { error });
      }
    }
  }
  
  /**
   * Clean up expired notifications
   */
  async cleanupExpiredNotifications(): Promise<number> {
    const now = new Date();
    let removedCount = 0;
    
    for (const [id, notification] of this.notifications.entries()) {
      if (notification.expiresAt && notification.expiresAt < now) {
        // Remove the notification
        this.notifications.delete(id);
        
        // Remove from user index
        const userNotifications = this.userNotificationIndices.get(notification.userId);
        if (userNotifications) {
          userNotifications.delete(id);
        }
        
        // Emit notification expired event
        this.emitEvent({
          type: 'notification_expired',
          timestamp: now,
          notificationId: id,
          notification,
          userId: notification.userId
        });
        
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      this.logger.info(`Cleaned up ${removedCount} expired notifications`);
    }
    
    return removedCount;
  }
}

/**
 * In-app notification delivery handler
 */
export class InAppNotificationDeliveryHandler implements NotificationDeliveryHandler {
  private logger: Logger;
  
  constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }
  
  /**
   * Send a notification through the in-app channel
   */
  async sendNotification(notification: Notification): Promise<boolean> {
    // In a real implementation, this would send to a user's client or a persistent store
    this.logger.debug(`Delivered in-app notification: ${notification.id}`, {
      userId: notification.userId,
      title: notification.title
    });
    
    // Always succeeds for in-app (as they're stored in the notification service)
    return true;
  }
}

/**
 * Email notification delivery handler
 */
export class EmailNotificationDeliveryHandler implements NotificationDeliveryHandler {
  private logger: Logger;
  
  constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }
  
  /**
   * Send a notification through the email channel
   */
  async sendNotification(notification: Notification): Promise<boolean> {
    // In a real implementation, this would send an email
    this.logger.info(`[EMAIL] To: ${notification.userId} - ${notification.title}`, {
      message: notification.message
    });
    
    // Simulate success (in a real implementation, this would check actual delivery)
    return true;
  }
}

/**
 * Webhook notification delivery handler
 */
export class WebhookNotificationDeliveryHandler implements NotificationDeliveryHandler {
  private webhookUrl: string;
  private logger: Logger;
  
  constructor(webhookUrl: string, logger?: Logger) {
    this.webhookUrl = webhookUrl;
    this.logger = logger || new ConsoleLogger();
  }
  
  /**
   * Send a notification through the webhook channel
   */
  async sendNotification(notification: Notification): Promise<boolean> {
    try {
      // In a real implementation, this would make an HTTP request to the webhook URL
      this.logger.info(`[WEBHOOK] ${this.webhookUrl} - ${notification.title}`, {
        notificationId: notification.id,
        userId: notification.userId
      });
      
      // Simulate successful webhook delivery
      return true;
    } catch (error) {
      this.logger.error('Error delivering webhook notification', { error });
      return false;
    }
  }
} 