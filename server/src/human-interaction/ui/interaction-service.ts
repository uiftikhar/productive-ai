/**
 * Interaction Service Implementation
 * Part of Milestone 2.3: Human-in-the-Loop Integration
 */
import { v4 as uuidv4 } from 'uuid';
import {
  InteractionService,
  InteractionPoint,
  InteractionResponse,
  InteractionEvent,
  InteractionPointType,
  NotificationType,
  NotificationChannel
} from '../interfaces/ui.interface';
import { NotificationService } from '../interfaces/ui.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Configuration for the interaction service
 */
export interface InteractionServiceConfig {
  defaultExpirationTime?: number; // milliseconds
  autoCleanupInterval?: number; // milliseconds
  logger?: Logger;
}

/**
 * Implementation of the interaction service
 */
export class InteractionServiceImpl implements InteractionService {
  private interactionPoints: Map<string, InteractionPoint> = new Map();
  private activeInteractions: Map<string, {
    instanceId: string;
    interactionId: string;
    userId: string;
    createdAt: Date;
    expiresAt?: Date;
    context?: any;
    responded?: boolean;
    dismissed?: boolean;
  }> = new Map();
  private userInteractionIndices: Map<string, Set<string>> = new Map();
  private eventSubscriptions: Map<string, (event: InteractionEvent) => void> = new Map();
  private logger: Logger;
  private config: InteractionServiceConfig;
  private notificationService?: NotificationService;
  private cleanupTimer?: NodeJS.Timeout;
  
  /**
   * Create a new interaction service
   */
  constructor(config: InteractionServiceConfig = {}, notificationService?: NotificationService) {
    this.logger = config.logger || new ConsoleLogger();
    this.notificationService = notificationService;
    
    this.config = {
      defaultExpirationTime: 24 * 60 * 60 * 1000, // 24 hours
      autoCleanupInterval: 60 * 60 * 1000, // 1 hour
      ...config
    };
    
    // Start cleanup timer
    if (this.config.autoCleanupInterval && this.config.autoCleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpiredInteractions();
      }, this.config.autoCleanupInterval);
    }
    
    this.logger.info('Interaction service initialized');
  }
  
  /**
   * Register an interaction point
   */
  async registerInteractionPoint(
    interactionPoint: Omit<InteractionPoint, 'id'>
  ): Promise<InteractionPoint> {
    const id = uuidv4();
    
    const fullInteractionPoint: InteractionPoint = {
      id,
      ...interactionPoint
    };
    
    // Store the interaction point
    this.interactionPoints.set(id, fullInteractionPoint);
    
    this.logger.info(`Registered interaction point: ${id}`, {
      type: fullInteractionPoint.type,
      title: fullInteractionPoint.title
    });
    
    return fullInteractionPoint;
  }
  
  /**
   * Get an interaction point by ID
   */
  async getInteractionPoint(id: string): Promise<InteractionPoint | null> {
    return this.interactionPoints.get(id) || null;
  }
  
  /**
   * Show an interaction to a user
   */
  async showInteraction(
    interactionId: string,
    userId: string,
    context?: any
  ): Promise<string> {
    const interactionPoint = await this.getInteractionPoint(interactionId);
    
    if (!interactionPoint) {
      throw new Error(`Interaction point not found: ${interactionId}`);
    }
    
    const instanceId = uuidv4();
    const now = new Date();
    
    // Create interaction instance
    const interactionInstance = {
      instanceId,
      interactionId,
      userId,
      createdAt: now,
      expiresAt: interactionPoint.dismissAfter
        ? new Date(now.getTime() + interactionPoint.dismissAfter)
        : interactionPoint.autoDismiss
          ? new Date(now.getTime() + (this.config.defaultExpirationTime || 0))
          : undefined,
      context,
      responded: false,
      dismissed: false
    };
    
    // Store the interaction instance
    this.activeInteractions.set(instanceId, interactionInstance);
    
    // Add to user index
    if (!this.userInteractionIndices.has(userId)) {
      this.userInteractionIndices.set(userId, new Set());
    }
    
    this.userInteractionIndices.get(userId)?.add(instanceId);
    
    // Emit interaction shown event
    this.emitEvent({
      type: 'interaction_shown',
      timestamp: now,
      instanceId,
      interactionId,
      interaction: interactionPoint,
      userId
    });
    
    // If integrated with notification service, send notification for interaction
    if (this.notificationService && 
        (interactionPoint.type === InteractionPointType.NOTIFICATION ||
         interactionPoint.type === InteractionPointType.APPROVAL_REQUEST ||
         interactionPoint.type === InteractionPointType.FEEDBACK_REQUEST)) {
      
      try {
        await this.notificationService.sendNotification({
          userId,
          type: this.mapInteractionTypeToNotificationType(interactionPoint.type),
          title: interactionPoint.title,
          message: interactionPoint.description || interactionPoint.title,
          actionable: true,
          priority: interactionPoint.priority,
          channels: [NotificationChannel.IN_APP], // Default to in-app for interactions
          data: {
            interactionInstanceId: instanceId,
            interactionId,
            component: interactionPoint.component,
            props: interactionPoint.props,
            actions: interactionPoint.actions
          }
        });
      } catch (error) {
        this.logger.error('Error sending notification for interaction', { error });
      }
    }
    
    this.logger.info(`Showed interaction to user: ${userId}`, {
      instanceId,
      interactionId,
      type: interactionPoint.type,
      title: interactionPoint.title
    });
    
    return instanceId;
  }
  
  /**
   * Process a user response to an interaction
   */
  async processInteractionResponse(response: InteractionResponse): Promise<void> {
    const instanceId = response.interactionId; // In our implementation, response.interactionId is the instanceId
    const instance = this.activeInteractions.get(instanceId);
    
    if (!instance) {
      throw new Error(`Interaction instance not found: ${instanceId}`);
    }
    
    // Make sure the user ID matches
    if (instance.userId !== response.userId) {
      throw new Error(`User ID mismatch for interaction response: ${response.userId} vs ${instance.userId}`);
    }
    
    // Get the interaction point
    const interactionPoint = await this.getInteractionPoint(instance.interactionId);
    
    if (!interactionPoint) {
      throw new Error(`Interaction point not found: ${instance.interactionId}`);
    }
    
    // Mark as responded
    instance.responded = true;
    this.activeInteractions.set(instanceId, instance);
    
    // Emit interaction responded event
    this.emitEvent({
      type: 'interaction_responded',
      timestamp: new Date(),
      instanceId,
      interactionId: instance.interactionId,
      interaction: interactionPoint,
      userId: response.userId,
      response
    });
    
    this.logger.info(`Processed interaction response: ${instanceId}`, {
      userId: response.userId,
      actionId: response.actionId,
      duration: response.duration
    });
  }
  
  /**
   * Dismiss an interaction without a response
   */
  async dismissInteraction(
    instanceId: string,
    userId: string,
    reason?: string
  ): Promise<boolean> {
    const instance = this.activeInteractions.get(instanceId);
    
    if (!instance) {
      return false;
    }
    
    // Make sure the user ID matches
    if (instance.userId !== userId) {
      throw new Error(`User ID mismatch for interaction dismissal: ${userId} vs ${instance.userId}`);
    }
    
    // Get the interaction point
    const interactionPoint = await this.getInteractionPoint(instance.interactionId);
    
    if (!interactionPoint) {
      throw new Error(`Interaction point not found: ${instance.interactionId}`);
    }
    
    // Mark as dismissed
    instance.dismissed = true;
    this.activeInteractions.set(instanceId, instance);
    
    // Emit interaction dismissed event
    this.emitEvent({
      type: 'interaction_dismissed',
      timestamp: new Date(),
      instanceId,
      interactionId: instance.interactionId,
      interaction: interactionPoint,
      userId
    });
    
    this.logger.info(`Dismissed interaction: ${instanceId}`, {
      userId,
      reason: reason || 'User dismissed'
    });
    
    return true;
  }
  
  /**
   * Get active interactions for a user
   */
  async getUserActiveInteractions(userId: string): Promise<Array<{
    instanceId: string;
    interaction: InteractionPoint;
    context?: any;
  }>> {
    const userInstanceIds = this.userInteractionIndices.get(userId) || new Set();
    const activeInteractions: Array<{
      instanceId: string;
      interaction: InteractionPoint;
      context?: any;
    }> = [];
    
    for (const instanceId of userInstanceIds) {
      const instance = this.activeInteractions.get(instanceId);
      
      if (!instance || instance.responded || instance.dismissed) {
        continue;
      }
      
      // Check if expired
      if (instance.expiresAt && instance.expiresAt < new Date()) {
        // Mark as expired and continue
        await this.expireInteraction(instanceId);
        continue;
      }
      
      const interactionPoint = await this.getInteractionPoint(instance.interactionId);
      
      if (interactionPoint) {
        activeInteractions.push({
          instanceId,
          interaction: interactionPoint,
          context: instance.context
        });
      }
    }
    
    return activeInteractions;
  }
  
  /**
   * Subscribe to interaction events
   */
  subscribeToEvents(callback: (event: InteractionEvent) => void): string {
    const subscriptionId = uuidv4();
    this.eventSubscriptions.set(subscriptionId, callback);
    return subscriptionId;
  }
  
  /**
   * Unsubscribe from interaction events
   */
  unsubscribeFromEvents(subscriptionId: string): boolean {
    return this.eventSubscriptions.delete(subscriptionId);
  }
  
  /**
   * Expire an interaction instance
   */
  private async expireInteraction(instanceId: string): Promise<void> {
    const instance = this.activeInteractions.get(instanceId);
    
    if (!instance || instance.responded || instance.dismissed) {
      return;
    }
    
    const interactionPoint = await this.getInteractionPoint(instance.interactionId);
    
    if (!interactionPoint) {
      return;
    }
    
    // Emit interaction expired event
    this.emitEvent({
      type: 'interaction_expired',
      timestamp: new Date(),
      instanceId,
      interactionId: instance.interactionId,
      interaction: interactionPoint,
      userId: instance.userId
    });
    
    this.logger.info(`Interaction expired: ${instanceId}`, {
      userId: instance.userId,
      interactionId: instance.interactionId
    });
  }
  
  /**
   * Clean up expired interactions
   */
  private async cleanupExpiredInteractions(): Promise<void> {
    const now = new Date();
    let expiredCount = 0;
    
    for (const [instanceId, instance] of this.activeInteractions.entries()) {
      if (instance.expiresAt && instance.expiresAt < now && !instance.responded && !instance.dismissed) {
        await this.expireInteraction(instanceId);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      this.logger.info(`Cleaned up ${expiredCount} expired interactions`);
    }
  }
  
  /**
   * Map interaction type to notification type
   */
  private mapInteractionTypeToNotificationType(interactionType: InteractionPointType): NotificationType {
    switch (interactionType) {
      case InteractionPointType.ERROR_RESOLUTION:
        return NotificationType.ERROR;
      case InteractionPointType.APPROVAL_REQUEST:
      case InteractionPointType.CHECKPOINT:
      case InteractionPointType.DECISION_POINT:
        return NotificationType.WARNING;
      case InteractionPointType.FEEDBACK_REQUEST:
        return NotificationType.INFO;
      case InteractionPointType.INFORMATION:
        return NotificationType.INFO;
      case InteractionPointType.CONFIRMATION:
        return NotificationType.SUCCESS;
      case InteractionPointType.NOTIFICATION:
      case InteractionPointType.CUSTOM:
      default:
        return NotificationType.SYSTEM;
    }
  }
  
  /**
   * Emit an interaction event to all subscribers
   */
  private emitEvent(event: InteractionEvent): void {
    for (const callback of this.eventSubscriptions.values()) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error('Error in interaction event subscriber', { error });
      }
    }
  }
  
  /**
   * Clean up resources on shutdown
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
} 