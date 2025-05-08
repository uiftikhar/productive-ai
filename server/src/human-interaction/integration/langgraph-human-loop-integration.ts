/**
 * LangGraph Human-in-the-Loop Integration
 * Part of Milestone 2.3: Human-in-the-Loop Integration
 * 
 * This module connects the human-in-the-loop system with the LangGraph framework
 */
import { v4 as uuidv4 } from 'uuid';

// Approval imports
import { 
  ApprovalRequest, 
  ApprovalStatus, 
  ApprovalActionType,
  ApprovalPriority 
} from '../interfaces/approval.interface';
import { ApprovalWorkflowService } from '../approval/approval-workflow';

// Interruption imports
import {
  InterruptionType,
  InterruptionStatus,
  Checkpoint,
  ContinuationAction
} from '../interfaces/interruption.interface';
import {
  CheckpointServiceImpl,
  InMemoryStateCaptureService,
  InterruptionHandlerServiceImpl
} from '../interruption/interruption-handler';

// Feedback imports
import {
  FeedbackType,
  FeedbackSource,
  FeedbackRatingScale
} from '../interfaces/feedback.interface';
import {
  FeedbackCollectorServiceImpl,
  FeedbackAnalyzerServiceImpl
} from '../feedback/feedback-collector';

// UI imports
import {
  InteractionPointType,
  InteractionPriority,
  NotificationType,
  NotificationChannel
} from '../interfaces/ui.interface';
import { 
  NotificationServiceImpl,
  InAppNotificationDeliveryHandler
} from '../ui/notification-service';
import { InteractionServiceImpl } from '../ui/interaction-service';

// Shared imports
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Configuration for human-in-the-loop integration
 */
export interface HumanLoopIntegrationConfig {
  approvalEnabled?: boolean;
  feedbackEnabled?: boolean;
  interruptionEnabled?: boolean;
  uiEnabled?: boolean;
  defaultApprovers?: string[];
  logger?: Logger;
}

/**
 * Coordinates human-in-the-loop integration with LangGraph
 */
export class HumanLoopIntegration {
  private logger: Logger;
  private config: HumanLoopIntegrationConfig;
  
  // Service instances
  private approvalService?: ApprovalWorkflowService;
  private checkpointService?: CheckpointServiceImpl;
  private interruptionHandler?: InterruptionHandlerServiceImpl;
  private stateCaptureService?: InMemoryStateCaptureService;
  private feedbackCollector?: FeedbackCollectorServiceImpl;
  private feedbackAnalyzer?: FeedbackAnalyzerServiceImpl;
  private notificationService?: NotificationServiceImpl;
  private interactionService?: InteractionServiceImpl;
  
  /**
   * Create a new human-in-the-loop integration
   */
  constructor(config: HumanLoopIntegrationConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    
    this.config = {
      approvalEnabled: true,
      feedbackEnabled: true,
      interruptionEnabled: true,
      uiEnabled: true,
      defaultApprovers: [],
      ...config
    };
    
    // Initialize services based on configuration
    this.initializeServices();
    
    this.logger.info('Human-in-the-loop integration initialized', {
      approvalEnabled: this.config.approvalEnabled,
      feedbackEnabled: this.config.feedbackEnabled,
      interruptionEnabled: this.config.interruptionEnabled,
      uiEnabled: this.config.uiEnabled
    });
  }
  
  /**
   * Initialize the required services
   */
  private initializeServices(): void {
    // Initialize approval service if enabled
    if (this.config.approvalEnabled) {
      this.approvalService = new ApprovalWorkflowService(
        { requiredApproversCount: this.config.defaultApprovers?.length || 1 },
        this.logger
      );
    }
    
    // Initialize interruption services if enabled
    if (this.config.interruptionEnabled) {
      this.checkpointService = new CheckpointServiceImpl(this.logger);
      this.stateCaptureService = new InMemoryStateCaptureService(this.logger);
      this.interruptionHandler = new InterruptionHandlerServiceImpl(
        this.checkpointService,
        this.stateCaptureService,
        { logger: this.logger }
      );
    }
    
    // Initialize feedback services if enabled
    if (this.config.feedbackEnabled) {
      this.feedbackCollector = new FeedbackCollectorServiceImpl(
        {
          enabledTypes: [
            FeedbackType.GENERAL,
            FeedbackType.QUALITY,
            FeedbackType.ACCURACY,
            FeedbackType.HELPFULNESS
          ],
          defaultRatingScale: FeedbackRatingScale.FIVE_POINT
        },
        this.logger
      );
      
      this.feedbackAnalyzer = new FeedbackAnalyzerServiceImpl(
        this.feedbackCollector,
        this.logger
      );
    }
    
    // Initialize UI services if enabled
    if (this.config.uiEnabled) {
      this.notificationService = new NotificationServiceImpl({ logger: this.logger });
      
      // Register in-app notification handler
      this.notificationService.registerDeliveryHandler(
        NotificationChannel.IN_APP,
        new InAppNotificationDeliveryHandler(this.logger)
      );
      
      this.interactionService = new InteractionServiceImpl(
        { logger: this.logger },
        this.notificationService
      );
    }
  }
  
  /**
   * Get the approval service
   */
  getApprovalService(): ApprovalWorkflowService | undefined {
    return this.approvalService;
  }
  
  /**
   * Get the interruption handler service
   */
  getInterruptionHandler(): InterruptionHandlerServiceImpl | undefined {
    return this.interruptionHandler;
  }
  
  /**
   * Get the checkpoint service
   */
  getCheckpointService(): CheckpointServiceImpl | undefined {
    return this.checkpointService;
  }
  
  /**
   * Get the feedback collector service
   */
  getFeedbackCollector(): FeedbackCollectorServiceImpl | undefined {
    return this.feedbackCollector;
  }
  
  /**
   * Get the feedback analyzer service
   */
  getFeedbackAnalyzer(): FeedbackAnalyzerServiceImpl | undefined {
    return this.feedbackAnalyzer;
  }
  
  /**
   * Get the notification service
   */
  getNotificationService(): NotificationServiceImpl | undefined {
    return this.notificationService;
  }
  
  /**
   * Get the interaction service
   */
  getInteractionService(): InteractionServiceImpl | undefined {
    return this.interactionService;
  }
  
  /**
   * Request approval for an action
   */
  async requestApproval(
    options: {
      title: string;
      description: string;
      actionType: ApprovalActionType;
      priority?: ApprovalPriority;
      agentId: string;
      requestedBy: string;
      actionPayload: any;
      approvers?: string[];
      expiresIn?: number; // milliseconds
      actionContext?: any;
    }
  ): Promise<string> {
    if (!this.approvalService) {
      throw new Error('Approval service is not enabled');
    }
    
    // Set defaults
    const priority = options.priority || ApprovalPriority.MEDIUM;
    const approvers = options.approvers || this.config.defaultApprovers || [];
    
    // Create the approval request
    const request = await this.approvalService.createRequest({
      title: options.title,
      description: options.description,
      actionType: options.actionType,
      priority,
      agentId: options.agentId,
      requestedBy: options.requestedBy,
      assignedApprovers: approvers,
      actionPayload: options.actionPayload,
      actionContext: options.actionContext,
      expiresAt: options.expiresIn ? new Date(Date.now() + options.expiresIn) : undefined
    });
    
    this.logger.info(`Created approval request: ${request.id}`, {
      title: request.title,
      actionType: request.actionType,
      assignedApprovers: request.assignedApprovers
    });
    
    // If UI is enabled, create an interaction for the approval
    if (this.config.uiEnabled && this.interactionService) {
      try {
        // Register an interaction point for the approval
        const interactionPoint = await this.interactionService.registerInteractionPoint({
          type: InteractionPointType.APPROVAL_REQUEST,
          title: `Approval Request: ${options.title}`,
          description: options.description,
          priority: this.mapApprovalPriorityToInteractionPriority(priority),
          component: 'ApprovalRequestComponent',
          props: {
            request: {
              id: request.id,
              title: request.title,
              description: request.description,
              actionType: request.actionType,
              priority: request.priority,
              actionPayload: request.actionPayload,
              actionContext: request.actionContext
            }
          },
          position: 'modal',
          actions: [
            {
              id: 'approve',
              label: 'Approve',
              type: 'primary',
              action: 'approve_request',
              payload: { requestId: request.id },
              confirmationRequired: false
            },
            {
              id: 'reject',
              label: 'Reject',
              type: 'danger',
              action: 'reject_request',
              payload: { requestId: request.id },
              confirmationRequired: true,
              confirmationMessage: 'Are you sure you want to reject this request?'
            },
            {
              id: 'modify',
              label: 'Modify',
              type: 'secondary',
              action: 'modify_request',
              payload: { requestId: request.id },
              confirmationRequired: false
            }
          ]
        });
        
        // Show the interaction to all approvers
        for (const approverId of approvers) {
          await this.interactionService.showInteraction(
            interactionPoint.id,
            approverId,
            { requestId: request.id }
          );
        }
      } catch (error) {
        this.logger.error('Error creating approval interaction', { error });
      }
    }
    
    return request.id;
  }
  
  /**
   * Check if an approval request is approved
   */
  async isApproved(requestId: string): Promise<boolean> {
    if (!this.approvalService) {
      throw new Error('Approval service is not enabled');
    }
    
    return this.approvalService.isApproved(requestId);
  }
  
  /**
   * Wait for approval (blocking call)
   */
  async waitForApproval(
    requestId: string,
    options: {
      timeoutMs?: number;
      pollIntervalMs?: number;
    } = {}
  ): Promise<boolean> {
    if (!this.approvalService) {
      throw new Error('Approval service is not enabled');
    }
    
    const timeoutMs = options.timeoutMs || 300000; // 5 minutes default
    const pollIntervalMs = options.pollIntervalMs || 1000; // 1 second default
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      // Check if approved
      const request = await this.approvalService.getRequest(requestId);
      
      if (!request) {
        throw new Error(`Approval request not found: ${requestId}`);
      }
      
      if (request.status === ApprovalStatus.APPROVED) {
        return true;
      }
      
      if (request.status === ApprovalStatus.REJECTED || 
          request.status === ApprovalStatus.EXPIRED ||
          request.status === ApprovalStatus.CANCELLED) {
        return false;
      }
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
    
    // Timeout reached
    this.logger.warn(`Approval request timed out: ${requestId}`);
    return false;
  }
  
  /**
   * Register a checkpoint in the workflow
   */
  async registerCheckpoint(
    options: {
      name: string;
      description?: string;
      nodeId: string;
      condition?: {
        type: 'always' | 'expression' | 'probability' | 'metric';
        expression?: string;
        probability?: number;
        metric?: {
          name: string;
          operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
          value: number;
        };
      };
      requiredApproval?: boolean;
      autoResumeAfter?: number; // milliseconds
    }
  ): Promise<string> {
    if (!this.checkpointService) {
      throw new Error('Checkpoint service is not enabled');
    }
    
    const checkpoint = await this.checkpointService.registerCheckpoint({
      name: options.name,
      description: options.description,
      nodeId: options.nodeId,
      condition: options.condition,
      requiredApproval: options.requiredApproval,
      autoResumeAfter: options.autoResumeAfter
    });
    
    this.logger.info(`Registered checkpoint: ${checkpoint.id}`, {
      name: checkpoint.name,
      nodeId: checkpoint.nodeId
    });
    
    return checkpoint.id;
  }
  
  /**
   * Create an interruption at a checkpoint
   */
  async createInterruption(
    options: {
      type: InterruptionType;
      workflowId: string;
      agentId: string;
      nodeId: string;
      checkpointId?: string;
      createdBy?: string;
      reason?: string;
      state?: any;
      expiresIn?: number; // milliseconds
    }
  ): Promise<string> {
    if (!this.interruptionHandler) {
      throw new Error('Interruption handler is not enabled');
    }
    
    const interruption = await this.interruptionHandler.createInterruption({
      type: options.type,
      workflowId: options.workflowId,
      agentId: options.agentId,
      nodeId: options.nodeId,
      checkpointId: options.checkpointId,
      createdBy: options.createdBy,
      reason: options.reason,
      state: options.state,
      expiresAt: options.expiresIn ? new Date(Date.now() + options.expiresIn) : undefined
    });
    
    this.logger.info(`Created interruption: ${interruption.id}`, {
      type: interruption.type,
      workflowId: interruption.workflowId,
      nodeId: interruption.nodeId
    });
    
    // If UI is enabled, create an interaction for the interruption
    if (this.config.uiEnabled && this.interactionService && options.createdBy) {
      try {
        // Register an interaction point for the interruption
        const interactionPoint = await this.interactionService.registerInteractionPoint({
          type: InteractionPointType.CHECKPOINT,
          title: `Workflow Paused: ${options.type}`,
          description: options.reason || 'Workflow has been paused for human input',
          priority: InteractionPriority.HIGH,
          component: 'InterruptionComponent',
          props: {
            interruption: {
              id: interruption.id,
              type: interruption.type,
              workflowId: interruption.workflowId,
              agentId: interruption.agentId,
              nodeId: interruption.nodeId,
              reason: interruption.reason
            }
          },
          position: 'modal',
          actions: [
            {
              id: 'resume',
              label: 'Resume',
              type: 'primary',
              action: 'resume_workflow',
              payload: { interruptionId: interruption.id },
              confirmationRequired: false
            },
            {
              id: 'modify',
              label: 'Modify & Resume',
              type: 'secondary',
              action: 'modify_workflow',
              payload: { interruptionId: interruption.id },
              confirmationRequired: false
            },
            {
              id: 'abort',
              label: 'Abort Workflow',
              type: 'danger',
              action: 'abort_workflow',
              payload: { interruptionId: interruption.id },
              confirmationRequired: true,
              confirmationMessage: 'Are you sure you want to abort this workflow?'
            }
          ]
        });
        
        // Show the interaction to the creator
        await this.interactionService.showInteraction(
          interactionPoint.id,
          options.createdBy,
          { interruptionId: interruption.id }
        );
      } catch (error) {
        this.logger.error('Error creating interruption interaction', { error });
      }
    }
    
    return interruption.id;
  }
  
  /**
   * Resolve an interruption
   */
  async resolveInterruption(
    interruptionId: string,
    action: ContinuationAction,
    options: {
      modifications?: any;
      comments?: string;
      resolvedBy?: string;
    } = {}
  ): Promise<boolean> {
    if (!this.interruptionHandler) {
      throw new Error('Interruption handler is not enabled');
    }
    
    try {
      await this.interruptionHandler.resolveInterruption(
        interruptionId,
        action,
        options
      );
      
      this.logger.info(`Resolved interruption: ${interruptionId}`, {
        action,
        resolvedBy: options.resolvedBy
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Error resolving interruption: ${interruptionId}`, { error });
      return false;
    }
  }
  
  /**
   * Collect feedback from a user
   */
  async collectFeedback(
    options: {
      userId: string;
      agentId?: string;
      sessionId?: string;
      type: FeedbackType;
      source: FeedbackSource;
      rating?: number;
      text?: string;
      category?: string[];
      targetId?: string;
      targetType?: string;
      context?: any;
    }
  ): Promise<string> {
    if (!this.feedbackCollector) {
      throw new Error('Feedback collector is not enabled');
    }
    
    const feedback = await this.feedbackCollector.collectFeedback({
      userId: options.userId,
      agentId: options.agentId,
      sessionId: options.sessionId,
      type: options.type,
      source: options.source,
      rating: options.rating,
      text: options.text,
      category: options.category,
      targetId: options.targetId,
      targetType: options.targetType,
      context: options.context
    });
    
    this.logger.info(`Collected feedback: ${feedback.id}`, {
      userId: feedback.userId,
      type: feedback.type,
      rating: feedback.rating
    });
    
    // If we have an agent ID and feedback analyzer, update expertise
    if (options.agentId && this.feedbackAnalyzer) {
      try {
        await this.feedbackAnalyzer.updateExpertiseFromFeedback(
          options.agentId,
          [feedback]
        );
      } catch (error) {
        this.logger.error('Error updating expertise from feedback', { error });
      }
    }
    
    return feedback.id;
  }
  
  /**
   * Request feedback from a user
   */
  async requestFeedback(
    userId: string,
    options: {
      type?: FeedbackType;
      agentId?: string;
      sessionId?: string;
      context?: any;
    } = {}
  ): Promise<string> {
    if (!this.feedbackCollector) {
      throw new Error('Feedback collector is not enabled');
    }
    
    const requestId = await this.feedbackCollector.requestFeedback(
      userId,
      options
    );
    
    this.logger.info(`Requested feedback from user: ${userId}`, {
      requestId,
      type: options.type
    });
    
    // If UI is enabled, create an interaction for the feedback request
    if (this.config.uiEnabled && this.interactionService) {
      try {
        // Register an interaction point for the feedback request
        const interactionPoint = await this.interactionService.registerInteractionPoint({
          type: InteractionPointType.FEEDBACK_REQUEST,
          title: 'Feedback Request',
          description: 'We value your input! Please provide feedback on your experience.',
          priority: InteractionPriority.MEDIUM,
          component: 'FeedbackRequestComponent',
          props: {
            requestId,
            type: options.type,
            agentId: options.agentId,
            sessionId: options.sessionId,
            context: options.context
          },
          position: 'sidebar',
          autoDismiss: true,
          dismissAfter: 86400000, // 24 hours
          actions: [
            {
              id: 'submit',
              label: 'Submit Feedback',
              type: 'primary',
              action: 'submit_feedback',
              payload: { requestId },
              confirmationRequired: false
            },
            {
              id: 'dismiss',
              label: 'Not Now',
              type: 'secondary',
              action: 'dismiss_feedback',
              payload: { requestId },
              confirmationRequired: false
            }
          ]
        });
        
        // Show the interaction to the user
        await this.interactionService.showInteraction(
          interactionPoint.id,
          userId,
          { requestId }
        );
      } catch (error) {
        this.logger.error('Error creating feedback interaction', { error });
      }
    }
    
    return requestId;
  }
  
  /**
   * Send a notification to a user
   */
  async sendNotification(
    options: {
      userId: string;
      type: NotificationType;
      title: string;
      message: string;
      actionable?: boolean;
      actions?: Array<{
        id: string;
        label: string;
        type: 'primary' | 'secondary' | 'danger' | 'link';
        action: string;
        payload?: any;
      }>;
      priority?: InteractionPriority;
      channels?: NotificationChannel[];
      expiresIn?: number; // milliseconds
      data?: any;
      sourceId?: string;
      sourceType?: string;
    }
  ): Promise<string> {
    if (!this.notificationService) {
      throw new Error('Notification service is not enabled');
    }
    
    const notification = await this.notificationService.sendNotification({
      userId: options.userId,
      type: options.type,
      title: options.title,
      message: options.message,
      actionable: options.actionable !== false,
      actions: options.actions,
      priority: options.priority || InteractionPriority.MEDIUM,
      channels: options.channels || [NotificationChannel.IN_APP],
      expiresAt: options.expiresIn ? new Date(Date.now() + options.expiresIn) : undefined,
      data: options.data,
      sourceId: options.sourceId,
      sourceType: options.sourceType
    });
    
    this.logger.info(`Sent notification: ${notification.id}`, {
      userId: notification.userId,
      title: notification.title,
      channels: notification.channels
    });
    
    return notification.id;
  }
  
  /**
   * Map approval priority to interaction priority
   */
  private mapApprovalPriorityToInteractionPriority(
    priority: ApprovalPriority
  ): InteractionPriority {
    switch (priority) {
      case ApprovalPriority.LOW:
        return InteractionPriority.LOW;
      case ApprovalPriority.MEDIUM:
        return InteractionPriority.MEDIUM;
      case ApprovalPriority.HIGH:
        return InteractionPriority.HIGH;
      case ApprovalPriority.CRITICAL:
        return InteractionPriority.CRITICAL;
      default:
        return InteractionPriority.MEDIUM;
    }
  }
} 