/**
 * Action Item Notification Service
 * 
 * Handles notifications for action item status changes
 * Part of Milestone 3.2: Action Item Processing (Day 5)
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ActionItem,
  ActionItemNotificationService,
  ActionItemStatus
} from '../interfaces/action-items.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

export interface ActionItemNotificationOptions {
  logger?: Logger;
  enableEmailNotifications?: boolean;
  enableSlackNotifications?: boolean;
  emailConfig?: {
    defaultSender: string;
    smtpConfig: Record<string, any>;
  };
  slackConfig?: {
    webhookUrl: string;
    defaultChannel: string;
  };
}

/**
 * Notification channel type
 */
export enum NotificationChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  IN_APP = 'in_app',
  SMS = 'sms'
}

/**
 * Notification template
 */
export interface NotificationTemplate {
  id: string;
  name: string;
  channel: NotificationChannel;
  subject: string;
  bodyTemplate: string;
  variables: string[];
}

/**
 * Notification record
 */
export interface NotificationRecord {
  id: string;
  actionItemId: string;
  timestamp: Date;
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  body: string;
  status: 'pending' | 'sent' | 'failed';
  errorMessage?: string;
}

/**
 * Notification subscriber
 */
interface NotificationSubscriber {
  id: string;
  eventTypes: string[];
  callback: (notification: any) => Promise<void>;
}

/**
 * Implementation of the ActionItemNotificationService interface
 */
export class ActionItemNotificationServiceImpl implements ActionItemNotificationService {
  private logger: Logger;
  private enableEmailNotifications: boolean;
  private enableSlackNotifications: boolean;
  private emailConfig?: {
    defaultSender: string;
    smtpConfig: Record<string, any>;
  };
  private slackConfig?: {
    webhookUrl: string;
    defaultChannel: string;
  };
  
  // Notification templates
  private templates: Map<string, NotificationTemplate> = new Map();
  
  // Notification history
  private notificationHistory: Map<string, NotificationRecord> = new Map();
  
  // User preferences
  private userPreferences: Map<string, {
    channels: NotificationChannel[];
    emailAddress?: string;
    slackMemberId?: string;
    phoneNumber?: string;
  }> = new Map();
  
  // Notification subscribers
  private subscribers: Map<string, NotificationSubscriber> = new Map();
  
  constructor(options: ActionItemNotificationOptions = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.enableEmailNotifications = options.enableEmailNotifications === true;
    this.enableSlackNotifications = options.enableSlackNotifications === true;
    this.emailConfig = options.emailConfig;
    this.slackConfig = options.slackConfig;
    
    // Add default templates
    this.addDefaultTemplates();
    
    this.logger.info('ActionItemNotificationService initialized');
  }
  
  /**
   * Add default notification templates
   */
  private addDefaultTemplates() {
    // Status update template for email
    this.templates.set('status-update-email', {
      id: 'status-update-email',
      name: 'Action Item Status Update (Email)',
      channel: NotificationChannel.EMAIL,
      subject: 'Action Item Status Update: {{itemDescription}}',
      bodyTemplate: `
        <html>
        <body>
          <h2>Action Item Status Update</h2>
          <p>The status of the following action item has been updated:</p>
          <ul>
            <li><strong>Description:</strong> {{itemDescription}}</li>
            <li><strong>Previous Status:</strong> {{previousStatus}}</li>
            <li><strong>New Status:</strong> {{newStatus}}</li>
            <li><strong>Meeting:</strong> {{meetingTitle}}</li>
            <li><strong>Deadline:</strong> {{deadline}}</li>
          </ul>
          <p>{{additionalNotes}}</p>
        </body>
        </html>
      `,
      variables: ['itemDescription', 'previousStatus', 'newStatus', 'meetingTitle', 'deadline', 'additionalNotes']
    });
    
    // Status update template for Slack
    this.templates.set('status-update-slack', {
      id: 'status-update-slack',
      name: 'Action Item Status Update (Slack)',
      channel: NotificationChannel.SLACK,
      subject: 'Action Item Status Update',
      bodyTemplate: `
        *Action Item Status Update*
        
        The status of the following action item has been updated:
        
        • *Description:* {{itemDescription}}
        • *Previous Status:* {{previousStatus}}
        • *New Status:* {{newStatus}}
        • *Meeting:* {{meetingTitle}}
        • *Deadline:* {{deadline}}
        
        {{additionalNotes}}
      `,
      variables: ['itemDescription', 'previousStatus', 'newStatus', 'meetingTitle', 'deadline', 'additionalNotes']
    });
    
    // Assignment notification template for email
    this.templates.set('new-assignment-email', {
      id: 'new-assignment-email',
      name: 'New Action Item Assignment (Email)',
      channel: NotificationChannel.EMAIL,
      subject: 'New Action Item Assigned: {{itemDescription}}',
      bodyTemplate: `
        <html>
        <body>
          <h2>New Action Item Assigned</h2>
          <p>You have been assigned a new action item:</p>
          <ul>
            <li><strong>Description:</strong> {{itemDescription}}</li>
            <li><strong>Priority:</strong> {{priority}}</li>
            <li><strong>Status:</strong> {{status}}</li>
            <li><strong>Meeting:</strong> {{meetingTitle}}</li>
            <li><strong>Deadline:</strong> {{deadline}}</li>
          </ul>
          <p>{{additionalNotes}}</p>
        </body>
        </html>
      `,
      variables: ['itemDescription', 'priority', 'status', 'meetingTitle', 'deadline', 'additionalNotes']
    });
    
    // Reminder template for email
    this.templates.set('reminder-email', {
      id: 'reminder-email',
      name: 'Action Item Reminder (Email)',
      channel: NotificationChannel.EMAIL,
      subject: 'Reminder: {{itemDescription}}',
      bodyTemplate: `
        <html>
        <body>
          <h2>Action Item Reminder</h2>
          <p>This is a reminder about your action item:</p>
          <ul>
            <li><strong>Description:</strong> {{itemDescription}}</li>
            <li><strong>Status:</strong> {{status}}</li>
            <li><strong>Priority:</strong> {{priority}}</li>
            <li><strong>Deadline:</strong> {{deadline}}</li>
          </ul>
          <p>{{customMessage}}</p>
        </body>
        </html>
      `,
      variables: ['itemDescription', 'status', 'priority', 'deadline', 'customMessage']
    });
  }
  
  /**
   * Set user notification preferences
   */
  async setUserPreferences(
    userId: string,
    preferences: {
      channels: string[];
      emailAddress?: string;
      slackMemberId?: string;
      phoneNumber?: string;
    }
  ): Promise<boolean> {
    try {
      // Convert string channels to enum values
      const enumChannels = preferences.channels.map(channel => {
        const channelEnum = Object.values(NotificationChannel).find(
          c => c.toLowerCase() === channel.toLowerCase()
        );
        return channelEnum || NotificationChannel.EMAIL;
      });
      
      this.userPreferences.set(userId, {
        ...preferences,
        channels: enumChannels as NotificationChannel[]
      });
      
      this.logger.debug(`Set notification preferences for user ${userId}`);
      return true;
    } catch (error) {
      this.logger.error(`Error setting user preferences: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Notify about action item status change
   */
  async notifyStatusChange(
    actionItem: ActionItem,
    previousStatus: ActionItemStatus,
    recipients: string[],
    additionalNotes?: string
  ): Promise<{ success: boolean; notificationIds: string[] }> {
    try {
      const notificationIds: string[] = [];
      
      // Prepare common variables for template
      const deadlineString = actionItem.deadline?.date 
        ? new Date(actionItem.deadline.date).toLocaleDateString() 
        : 'No deadline';
      
      const templateVars = {
        itemDescription: actionItem.description,
        previousStatus: previousStatus,
        newStatus: actionItem.status,
        meetingTitle: actionItem.meetingTitle || 'Unknown Meeting',
        deadline: deadlineString,
        additionalNotes: additionalNotes || ''
      };
      
      // Send notifications for each recipient based on their preferences
      for (const userId of recipients) {
        const userPrefs = this.userPreferences.get(userId);
        
        // If no preferences, use default (email)
        const channels = userPrefs?.channels || [NotificationChannel.EMAIL];
        
        for (const channel of channels) {
          switch (channel) {
            case NotificationChannel.EMAIL:
              if (this.enableEmailNotifications && userPrefs?.emailAddress) {
                const notificationId = await this.sendEmailNotification(
                  'status-update-email',
                  userPrefs.emailAddress,
                  actionItem.id,
                  templateVars
                );
                
                if (notificationId) {
                  notificationIds.push(notificationId);
                }
              }
              break;
              
            case NotificationChannel.SLACK:
              if (this.enableSlackNotifications && userPrefs?.slackMemberId) {
                const notificationId = await this.sendSlackNotification(
                  'status-update-slack',
                  userPrefs.slackMemberId,
                  actionItem.id,
                  templateVars
                );
                
                if (notificationId) {
                  notificationIds.push(notificationId);
                }
              }
              break;
              
            case NotificationChannel.IN_APP:
              // In-app notifications would be implemented with a frontend service
              // We'll just log it for now
              this.logger.info(`Would send in-app notification to ${userId} for action item ${actionItem.id}`);
              break;
              
            case NotificationChannel.SMS:
              // SMS notifications would require a third-party service
              // We'll just log it for now
              this.logger.info(`Would send SMS notification to ${userId} for action item ${actionItem.id}`);
              break;
          }
        }
      }
      
      // Notify subscribers
      this.notifySubscribers({
        type: 'action_item_status_change',
        actionItemId: actionItem.id,
        previousStatus,
        newStatus: actionItem.status,
        timestamp: new Date()
      });
      
      return {
        success: notificationIds.length > 0,
        notificationIds
      };
    } catch (error) {
      this.logger.error(`Error sending status change notifications: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        notificationIds: []
      };
    }
  }
  
  /**
   * Notify about new action item assignment
   */
  async notifyNewAssignment(
    actionItem: ActionItem,
    additionalNotes?: string
  ): Promise<{ success: boolean; notificationIds: string[] }> {
    try {
      const notificationIds: string[] = [];
      
      // Prepare common variables for template
      const deadlineString = actionItem.deadline?.date 
        ? new Date(actionItem.deadline.date).toLocaleDateString() 
        : 'No deadline';
      
      const templateVars = {
        itemDescription: actionItem.description,
        priority: actionItem.priority,
        status: actionItem.status,
        meetingTitle: actionItem.meetingTitle || 'Unknown Meeting',
        deadline: deadlineString,
        additionalNotes: additionalNotes || ''
      };
      
      // Send notifications for each assignee
      for (const assignee of actionItem.assignees) {
        // Skip if no ID (we need to know who to notify)
        if (!assignee.id) continue;
        
        const userId = assignee.id;
        const userPrefs = this.userPreferences.get(userId);
        
        // If no preferences, use default (email)
        const channels = userPrefs?.channels || [NotificationChannel.EMAIL];
        
        for (const channel of channels) {
          switch (channel) {
            case NotificationChannel.EMAIL:
              if (this.enableEmailNotifications && userPrefs?.emailAddress) {
                const notificationId = await this.sendEmailNotification(
                  'new-assignment-email',
                  userPrefs.emailAddress,
                  actionItem.id,
                  templateVars
                );
                
                if (notificationId) {
                  notificationIds.push(notificationId);
                }
              }
              break;
              
            case NotificationChannel.SLACK:
              if (this.enableSlackNotifications && userPrefs?.slackMemberId) {
                // We don't have a Slack template for new assignments yet, so we'll use the status update one
                const notificationId = await this.sendSlackNotification(
                  'status-update-slack',
                  userPrefs.slackMemberId,
                  actionItem.id,
                  templateVars
                );
                
                if (notificationId) {
                  notificationIds.push(notificationId);
                }
              }
              break;
              
            case NotificationChannel.IN_APP:
              // In-app notifications would be implemented with a frontend service
              // We'll just log it for now
              this.logger.info(`Would send in-app notification to ${userId} for new action item ${actionItem.id}`);
              break;
              
            case NotificationChannel.SMS:
              // SMS notifications would require a third-party service
              // We'll just log it for now
              this.logger.info(`Would send SMS notification to ${userId} for new action item ${actionItem.id}`);
              break;
          }
        }
      }
      
      // Notify subscribers
      this.notifySubscribers({
        type: 'action_item_assigned',
        actionItemId: actionItem.id,
        assignees: actionItem.assignees.map(a => a.id).filter(Boolean),
        timestamp: new Date()
      });
      
      return {
        success: notificationIds.length > 0,
        notificationIds
      };
    } catch (error) {
      this.logger.error(`Error sending new assignment notifications: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        notificationIds: []
      };
    }
  }
  
  /**
   * Get notification history
   */
  async getNotificationHistory(
    actionItemId: string
  ): Promise<NotificationRecord[]> {
    // Filter notifications by action item ID
    return Array.from(this.notificationHistory.values())
      .filter(record => record.actionItemId === actionItemId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // newest first
  }
  
  /**
   * Create a custom notification template
   */
  async createNotificationTemplate(
    template: Omit<NotificationTemplate, 'id'>
  ): Promise<string> {
    try {
      const id = `custom-${uuidv4()}`;
      const newTemplate: NotificationTemplate = {
        ...template,
        id
      };
      
      this.templates.set(id, newTemplate);
      this.logger.debug(`Created notification template ${id}`);
      
      return id;
    } catch (error) {
      this.logger.error(`Error creating notification template: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Register notification subscriber
   */
  async registerNotificationSubscriber(
    subscriber: {
      id: string;
      eventTypes: string[];
      callback: (notification: any) => Promise<void>;
    }
  ): Promise<boolean> {
    try {
      this.subscribers.set(subscriber.id, subscriber);
      this.logger.debug(`Registered notification subscriber ${subscriber.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Error registering notification subscriber: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  /**
   * Send generic notification
   */
  async sendNotification(
    type: string,
    recipients: string[],
    subject: string,
    content: string | Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<{ success: boolean; notificationIds: string[] }> {
    try {
      const notificationIds: string[] = [];
      
      // Process for each recipient
      for (const userId of recipients) {
        const userPrefs = this.userPreferences.get(userId);
        
        // If no preferences, use default (email)
        const channels = userPrefs?.channels || [NotificationChannel.EMAIL];
        
        for (const channel of channels) {
          let notificationId: string | null = null;
          
          switch (channel) {
            case NotificationChannel.EMAIL:
              if (this.enableEmailNotifications && userPrefs?.emailAddress) {
                // Create a custom record for non-template email
                notificationId = `notification-${uuidv4()}`;
                const record: NotificationRecord = {
                  id: notificationId,
                  actionItemId: metadata?.actionItemId || 'general',
                  timestamp: new Date(),
                  channel: NotificationChannel.EMAIL,
                  recipient: userPrefs.emailAddress,
                  subject,
                  body: typeof content === 'string' ? content : JSON.stringify(content),
                  status: 'sent' // Assuming success for simulation
                };
                
                this.notificationHistory.set(notificationId, record);
                
                // Log the simulated email
                this.logger.info(`Would send generic email to ${userPrefs.emailAddress}: ${subject}`);
              }
              break;
              
            case NotificationChannel.SLACK:
              if (this.enableSlackNotifications && userPrefs?.slackMemberId) {
                // Create a custom record for non-template slack message
                notificationId = `notification-${uuidv4()}`;
                const record: NotificationRecord = {
                  id: notificationId,
                  actionItemId: metadata?.actionItemId || 'general',
                  timestamp: new Date(),
                  channel: NotificationChannel.SLACK,
                  recipient: userPrefs.slackMemberId,
                  subject,
                  body: typeof content === 'string' ? content : JSON.stringify(content),
                  status: 'sent' // Assuming success for simulation
                };
                
                this.notificationHistory.set(notificationId, record);
                
                // Log the simulated slack message
                this.logger.info(`Would send generic Slack message to ${userPrefs.slackMemberId}`);
              }
              break;
          }
          
          if (notificationId) {
            notificationIds.push(notificationId);
          }
        }
      }
      
      // Notify subscribers
      this.notifySubscribers({
        type: 'generic_notification',
        notificationType: type,
        recipients,
        subject,
        content,
        metadata,
        timestamp: new Date()
      });
      
      return {
        success: notificationIds.length > 0,
        notificationIds
      };
    } catch (error) {
      this.logger.error(`Error sending generic notification: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        notificationIds: []
      };
    }
  }
  
  /**
   * Send reminder for action item
   */
  async sendReminder(
    actionItemId: string,
    recipients?: string[],
    customMessage?: string
  ): Promise<{ success: boolean; notificationIds: string[] }> {
    try {
      // If no explicit recipients provided, default to assignees
      const effectiveRecipients = recipients || [];
      
      // We'd typically look up the action item here to get assignees and details
      // For now, just simulate with the given recipients
      
      const notificationIds: string[] = [];
      const reminderSubject = `Reminder: Action Item ${actionItemId}`;
      const reminderBody = customMessage || 'This is a reminder about your action item.';
      
      // Send to each recipient
      for (const userId of effectiveRecipients) {
        const userPrefs = this.userPreferences.get(userId);
        
        if (userPrefs?.emailAddress) {
          const notificationId = `notification-${uuidv4()}`;
          const record: NotificationRecord = {
            id: notificationId,
            actionItemId,
            timestamp: new Date(),
            channel: NotificationChannel.EMAIL,
            recipient: userPrefs.emailAddress,
            subject: reminderSubject,
            body: reminderBody,
            status: 'sent' // Assuming success for simulation
          };
          
          this.notificationHistory.set(notificationId, record);
          notificationIds.push(notificationId);
          
          this.logger.info(`Would send reminder email to ${userPrefs.emailAddress}: ${reminderSubject}`);
        }
      }
      
      // Notify subscribers
      this.notifySubscribers({
        type: 'action_item_reminder',
        actionItemId,
        recipients: effectiveRecipients,
        message: customMessage,
        timestamp: new Date()
      });
      
      return {
        success: notificationIds.length > 0,
        notificationIds
      };
    } catch (error) {
      this.logger.error(`Error sending reminder: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        notificationIds: []
      };
    }
  }
  
  // ----- Private implementation methods -----
  
  /**
   * Send email notification
   */
  private async sendEmailNotification(
    templateId: string,
    recipient: string,
    actionItemId: string,
    variables: Record<string, any>
  ): Promise<string | null> {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }
      
      if (template.channel !== NotificationChannel.EMAIL) {
        throw new Error(`Template ${templateId} is not an email template`);
      }
      
      // Generate subject and body from template
      let subject = template.subject;
      let body = template.bodyTemplate;
      
      // Replace variables in the template
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        subject = subject.replace(new RegExp(placeholder, 'g'), String(value));
        body = body.replace(new RegExp(placeholder, 'g'), String(value));
      }
      
      // In a real implementation, we'd send the email here
      // For now, we'll just log it
      this.logger.info(`Would send email to ${recipient}: ${subject}`);
      
      // Record the notification
      const notificationId = `notification-${uuidv4()}`;
      const record: NotificationRecord = {
        id: notificationId,
        actionItemId,
        timestamp: new Date(),
        channel: NotificationChannel.EMAIL,
        recipient,
        subject,
        body,
        status: 'sent' // Assuming success for simulation
      };
      
      this.notificationHistory.set(notificationId, record);
      
      return notificationId;
    } catch (error) {
      this.logger.error(`Error sending email notification: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  
  /**
   * Send Slack notification
   */
  private async sendSlackNotification(
    templateId: string,
    recipient: string,
    actionItemId: string,
    variables: Record<string, any>
  ): Promise<string | null> {
    try {
      const template = this.templates.get(templateId);
      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }
      
      if (template.channel !== NotificationChannel.SLACK) {
        throw new Error(`Template ${templateId} is not a Slack template`);
      }
      
      // Generate body from template
      let body = template.bodyTemplate;
      
      // Replace variables in the template
      for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        body = body.replace(new RegExp(placeholder, 'g'), String(value));
      }
      
      // In a real implementation, we'd send to Slack here
      // For now, we'll just log it
      this.logger.info(`Would send Slack message to ${recipient}`);
      
      // Record the notification
      const notificationId = `notification-${uuidv4()}`;
      const record: NotificationRecord = {
        id: notificationId,
        actionItemId,
        timestamp: new Date(),
        channel: NotificationChannel.SLACK,
        recipient,
        subject: template.subject,
        body,
        status: 'sent' // Assuming success for simulation
      };
      
      this.notificationHistory.set(notificationId, record);
      
      return notificationId;
    } catch (error) {
      this.logger.error(`Error sending Slack notification: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  
  /**
   * Notify subscribers about events
   */
  private async notifySubscribers(event: any): Promise<void> {
    try {
      // Find all subscribers who are interested in this event type
      const relevantSubscribers = Array.from(this.subscribers.values())
        .filter(subscriber => 
          subscriber.eventTypes.includes(event.type) || 
          subscriber.eventTypes.includes('*')
        );
      
      // Notify each subscriber
      for (const subscriber of relevantSubscribers) {
        try {
          await subscriber.callback(event);
        } catch (error) {
          this.logger.error(`Error notifying subscriber ${subscriber.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error notifying subscribers: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 