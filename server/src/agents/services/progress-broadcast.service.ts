import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';

import {
  StatusUpdate,
  ProgressUpdate,
  BlockerUpdate,
  StatusUpdateType,
  ProgressStatus,
  StatusAnomaly,
  TaskStatusSummary,
} from '../interfaces/status-reporting.interface';
import { AgentMessagingService } from './agent-messaging.service';
import { AgentRegistryService } from './agent-registry.service';
import {
  NaturalAgentMessage,
  MessageIntent,
  CommunicationModality,
} from '../interfaces/message-protocol.interface';

/**
 * Service for broadcasting and sharing progress updates across agents
 */
export class ProgressBroadcastService {
  private statusUpdates: Map<string, StatusUpdate> = new Map();
  private taskStatusSummaries: Map<string, TaskStatusSummary> = new Map();
  private anomalies: Map<string, StatusAnomaly> = new Map();
  private statusSubscriptions: Map<string, Array<string>> = new Map(); // taskId -> subscriberIds
  private readonly eventEmitter: EventEmitter;
  private readonly logger: Logger;

  constructor(
    private readonly messaging: AgentMessagingService,
    private readonly agentRegistry: AgentRegistryService,
    logger: Logger,
  ) {
    this.logger = logger;
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);
  }

  /**
   * Submit a status update
   */
  async submitStatusUpdate(update: StatusUpdate): Promise<StatusUpdate> {
    // Store the update
    this.statusUpdates.set(update.id, update);

    // Update task summary for this task
    await this.updateTaskSummary(update.taskId);

    // Check for anomalies
    if (
      update.type === StatusUpdateType.PROGRESS ||
      update.type === StatusUpdateType.BLOCKER
    ) {
      await this.detectAnomalies(update);
    }

    // Notify subscribers
    await this.notifySubscribers(update);

    // Emit event
    this.eventEmitter.emit(`status.${update.type}`, update);

    this.logger.info('Status update submitted', {
      updateId: update.id,
      agentId: update.agentId,
      taskId: update.taskId,
      type: update.type,
    });

    return update;
  }

  /**
   * Get status updates for a task
   */
  getTaskUpdates(
    taskId: string,
    limit?: number,
    type?: StatusUpdateType,
  ): StatusUpdate[] {
    const updates: StatusUpdate[] = [];

    for (const update of this.statusUpdates.values()) {
      if (update.taskId === taskId && (!type || update.type === type)) {
        updates.push(update);
      }
    }

    // Sort by timestamp descending (newest first)
    updates.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit if specified
    if (limit && updates.length > limit) {
      return updates.slice(0, limit);
    }

    return updates;
  }

  /**
   * Get status updates by an agent
   */
  getAgentUpdates(
    agentId: string,
    limit?: number,
    type?: StatusUpdateType,
  ): StatusUpdate[] {
    const updates: StatusUpdate[] = [];

    for (const update of this.statusUpdates.values()) {
      if (update.agentId === agentId && (!type || update.type === type)) {
        updates.push(update);
      }
    }

    // Sort by timestamp descending (newest first)
    updates.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit if specified
    if (limit && updates.length > limit) {
      return updates.slice(0, limit);
    }

    return updates;
  }

  /**
   * Get task status summary
   */
  getTaskStatusSummary(taskId: string): TaskStatusSummary | undefined {
    return this.taskStatusSummaries.get(taskId);
  }

  /**
   * Get all active blockers
   */
  getActiveBlockers(taskId?: string): BlockerUpdate[] {
    const blockers: BlockerUpdate[] = [];

    for (const update of this.statusUpdates.values()) {
      if (
        update.type === StatusUpdateType.BLOCKER &&
        (!taskId || update.taskId === taskId)
      ) {
        blockers.push(update as BlockerUpdate);
      }
    }

    // Sort by priority (critical first)
    blockers.sort((a, b) => {
      const priorityMap: Record<string, number> = {
        critical: 3,
        major: 2,
        moderate: 1,
        minor: 0,
      };

      return priorityMap[b.impact] - priorityMap[a.impact];
    });

    return blockers;
  }

  /**
   * Get detected anomalies
   */
  getAnomalies(taskId?: string): StatusAnomaly[] {
    const anomalies: StatusAnomaly[] = [];

    for (const anomaly of this.anomalies.values()) {
      if (!taskId || anomaly.taskId === taskId) {
        anomalies.push(anomaly);
      }
    }

    // Sort by severity and timestamp
    anomalies.sort((a, b) => {
      if (b.severity !== a.severity) {
        return b.severity - a.severity; // Higher severity first
      }
      return b.timestamp - a.timestamp; // Then newest first
    });

    return anomalies;
  }

  /**
   * Subscribe to status updates for a task
   */
  subscribeToTask(taskId: string, subscriberId: string): void {
    const subscribers = this.statusSubscriptions.get(taskId) || [];

    if (!subscribers.includes(subscriberId)) {
      subscribers.push(subscriberId);
      this.statusSubscriptions.set(taskId, subscribers);

      this.logger.debug('Agent subscribed to task updates', {
        taskId,
        subscriberId,
      });
    }
  }

  /**
   * Unsubscribe from status updates
   */
  unsubscribeFromTask(taskId: string, subscriberId: string): void {
    const subscribers = this.statusSubscriptions.get(taskId) || [];
    const updatedSubscribers = subscribers.filter((id) => id !== subscriberId);

    if (updatedSubscribers.length > 0) {
      this.statusSubscriptions.set(taskId, updatedSubscribers);
    } else {
      this.statusSubscriptions.delete(taskId);
    }

    this.logger.debug('Agent unsubscribed from task updates', {
      taskId,
      subscriberId,
    });
  }

  /**
   * Broadcast an important status update to all interested agents
   */
  async broadcastStatus(
    update: StatusUpdate,
    recipientIds: string[],
    options: {
      conversationId?: string;
      priority?: number;
    } = {},
  ): Promise<void> {
    const sender = await this.agentRegistry.getAgent(update.agentId);

    if (!sender) {
      this.logger.warn('Could not find sender agent for broadcast', {
        agentId: update.agentId,
      });
      return;
    }

    // Create a conversation if one doesn't exist
    let conversationId = options.conversationId;
    if (!conversationId) {
      const conversation = await this.messaging.createConversation(
        [update.agentId, ...recipientIds],
        `Status update: ${update.taskId}`,
      );
      conversationId = conversation.conversationId;
    }

    // Create a message with the status update
    const message: NaturalAgentMessage = {
      id: uuidv4(),
      conversationId,
      senderId: update.agentId,
      senderName: sender.name,
      intent: MessageIntent.INFORM,
      modality: CommunicationModality.STRUCTURED_DATA,
      content: {
        type: 'status_update',
        update,
      },
      timestamp: Date.now(),
      priority: options.priority || 1,
    };

    // Send the message
    await this.messaging.sendMessage(message);

    this.logger.info('Status broadcast sent', {
      updateId: update.id,
      recipientCount: recipientIds.length,
    });
  }

  /**
   * Subscribe to events
   */
  subscribe(
    eventType:
      | 'status.progress'
      | 'status.blocker'
      | 'status.milestone'
      | 'status.assistance'
      | 'anomaly_detected',
    callback: (data: any) => void,
  ): () => void {
    this.eventEmitter.on(eventType, callback);

    // Return unsubscribe function
    return () => {
      this.eventEmitter.off(eventType, callback);
    };
  }

  /**
   * Helper methods
   */

  /**
   * Update task summary based on a new status update
   */
  private async updateTaskSummary(taskId: string): Promise<TaskStatusSummary> {
    // Get existing summary or create new one
    let summary = this.taskStatusSummaries.get(taskId) || {
      taskId,
      status: ProgressStatus.NOT_STARTED,
      lastUpdateTime: Date.now(),
      percentComplete: 0,
      activeBlockers: [],
      pendingAssistanceRequests: [],
      recentUpdates: [],
      healthIndicator: 'unknown',
      metrics: {},
    };

    // Get all updates for this task
    const allUpdates = this.getTaskUpdates(taskId);

    // Get active blockers
    summary.activeBlockers = this.getActiveBlockers(taskId);

    // Find latest progress update
    const progressUpdates = allUpdates.filter(
      (update) => update.type === StatusUpdateType.PROGRESS,
    ) as ProgressUpdate[];

    if (progressUpdates.length > 0) {
      // Sort by timestamp descending
      progressUpdates.sort((a, b) => b.timestamp - a.timestamp);

      const latestProgress = progressUpdates[0];

      // Update summary with latest progress
      summary.status = latestProgress.status;
      summary.percentComplete = latestProgress.percentComplete;
      summary.lastUpdateTime = latestProgress.timestamp;

      // Update health indicator
      if (summary.activeBlockers.length > 0) {
        summary.healthIndicator = 'blocked';
      } else if (summary.status === ProgressStatus.IN_PROGRESS) {
        // Calculate health based on progress rate
        if (progressUpdates.length > 1) {
          const previousProgress = progressUpdates[1];
          const timeElapsed =
            latestProgress.timestamp - previousProgress.timestamp;
          const progressMade =
            latestProgress.percentComplete - previousProgress.percentComplete;

          // If progress is stagnant or negative, mark as at risk
          if (progressMade <= 0 && timeElapsed > 24 * 60 * 60 * 1000) {
            // No progress for 24h
            summary.healthIndicator = 'at_risk';
          } else {
            summary.healthIndicator = 'healthy';
          }
        } else {
          summary.healthIndicator = 'healthy';
        }
      }
    }

    // Get recent updates
    summary.recentUpdates = allUpdates.slice(0, 5);

    // Store the updated summary
    this.taskStatusSummaries.set(taskId, summary);

    return summary;
  }

  /**
   * Detect anomalies in status updates
   */
  private async detectAnomalies(update: StatusUpdate): Promise<void> {
    // This is a simple implementation - in a real system this would use
    // more sophisticated anomaly detection algorithms

    if (update.type === StatusUpdateType.PROGRESS) {
      const progressUpdate = update as ProgressUpdate;

      // Get previous updates for this task
      const taskUpdates = this.getTaskUpdates(update.taskId);
      const progressUpdates = taskUpdates.filter(
        (u) => u.type === StatusUpdateType.PROGRESS && u.id !== update.id,
      ) as ProgressUpdate[];

      if (progressUpdates.length > 0) {
        // Sort by timestamp ascending (oldest first)
        progressUpdates.sort((a, b) => a.timestamp - b.timestamp);

        // Check for progress slowdown
        const progressRates: number[] = [];

        for (let i = 1; i < progressUpdates.length; i++) {
          const current = progressUpdates[i];
          const previous = progressUpdates[i - 1];
          const timeElapsed = current.timestamp - previous.timestamp;
          const progressChange =
            current.percentComplete - previous.percentComplete;

          if (timeElapsed > 0) {
            // Calculate progress rate (percent per hour)
            const ratePerHour = (progressChange / timeElapsed) * 3600000;
            progressRates.push(ratePerHour);
          }
        }

        if (progressRates.length > 0) {
          // Calculate average progress rate
          const avgRate =
            progressRates.reduce((sum, rate) => sum + rate, 0) /
            progressRates.length;

          // Calculate progress rate for this update
          const previousUpdate = progressUpdates[progressUpdates.length - 1];
          const timeElapsed =
            progressUpdate.timestamp - previousUpdate.timestamp;
          const progressChange =
            progressUpdate.percentComplete - previousUpdate.percentComplete;
          const currentRate = (progressChange / timeElapsed) * 3600000;

          // If current rate is significantly lower than average, flag as anomaly
          if (currentRate < avgRate * 0.5 && progressChange >= 0) {
            const anomaly: StatusAnomaly = {
              id: uuidv4(),
              timestamp: Date.now(),
              agentId: update.agentId,
              taskId: update.taskId,
              anomalyType: 'progress_slowdown',
              severity: 0.7,
              description: `Progress rate has slowed significantly. Current: ${currentRate.toFixed(2)}%/hr, Avg: ${avgRate.toFixed(2)}%/hr`,
              detectionMethod: 'rate_comparison',
              relatedStatusUpdates: [update.id, previousUpdate.id],
              recommendedActions: [
                'Review recent blockers',
                'Check for resource constraints',
                'Consider adjusting task plan',
              ],
            };

            this.anomalies.set(anomaly.id, anomaly);
            this.eventEmitter.emit('anomaly_detected', anomaly);

            this.logger.warn('Progress anomaly detected', {
              anomalyId: anomaly.id,
              taskId: update.taskId,
              agentId: update.agentId,
              severity: anomaly.severity,
            });
          }
        }
      }
    } else if (update.type === StatusUpdateType.BLOCKER) {
      const blockerUpdate = update as BlockerUpdate;

      if (
        blockerUpdate.impact === 'critical' ||
        blockerUpdate.impact === 'major'
      ) {
        // Critical or major blockers are always anomalies that need attention
        const anomaly: StatusAnomaly = {
          id: uuidv4(),
          timestamp: Date.now(),
          agentId: update.agentId,
          taskId: update.taskId,
          anomalyType: 'coordination_issue',
          severity: blockerUpdate.impact === 'critical' ? 0.9 : 0.7,
          description: `Critical blocker reported: ${blockerUpdate.blockerDescription}`,
          detectionMethod: 'blocker_severity',
          relatedStatusUpdates: [update.id],
          recommendedActions: [
            'Escalate to team lead',
            'Allocate resources to resolve blocker',
            'Consider parallel work paths',
          ],
        };

        this.anomalies.set(anomaly.id, anomaly);
        this.eventEmitter.emit('anomaly_detected', anomaly);

        this.logger.warn('Blocker anomaly detected', {
          anomalyId: anomaly.id,
          taskId: update.taskId,
          agentId: update.agentId,
          severity: anomaly.severity,
        });
      }
    }
  }

  /**
   * Notify subscribers about a status update
   */
  private async notifySubscribers(update: StatusUpdate): Promise<void> {
    const subscribers = this.statusSubscriptions.get(update.taskId) || [];

    if (subscribers.length > 0) {
      // Broadcast to all subscribers
      await this.broadcastStatus(update, subscribers);
    }
  }
}
