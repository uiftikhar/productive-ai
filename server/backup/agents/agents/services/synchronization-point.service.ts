import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';

import {
  StatusUpdate,
  StatusUpdateType,
  ProgressStatus,
  StatusPriority,
  MilestoneUpdate,
} from '../interfaces/status-reporting.interface';
import {
  TaskCoordinationService,
  SynchronizationPoint,
} from './task-coordination.service';
import { ProgressBroadcastService } from './progress-broadcast.service';
import { AgentMessagingService } from './agent-messaging.service';
import { AgentRegistryService } from './agent-registry.service';
import { CommunicationModality } from '../interfaces/message-protocol.interface';
import { MessageIntent } from '../interfaces/message-protocol.interface';

/**
 * Synchronization point type
 */
export enum SyncPointType {
  DECISION_GATE = 'decision_gate', // Requires a decision to proceed
  COMPLETION_BARRIER = 'completion_barrier', // All tasks must complete
  DATA_READINESS = 'data_readiness', // Data must be available
  VERIFICATION = 'verification', // Results must be verified
  RESOURCE_ALLOCATION = 'resource_allocation', // Resources must be allocated
  INTEGRATION_POINT = 'integration_point', // Components must be integrated
  COORDINATION_MEETING = 'coordination_meeting', // Agents must coordinate
  TIMED_CHECKPOINT = 'timed_checkpoint', // Time-based checkpoint
}

/**
 * Synchronization rule for dependencies
 */
export interface SyncRule {
  id: string;
  type: 'all_completed' | 'any_completed' | 'majority_completed' | 'custom';
  taskIds: string[];
  requiredStatus: ProgressStatus;
  customCondition?: string;
  minRequired?: number; // For majority rule
  priority: number; // Higher priorities are evaluated first
}

/**
 * Service for managing workflow synchronization points
 */
export class SynchronizationPointService {
  private synchronizationPoints: Map<string, SynchronizationPoint> = new Map();
  private syncRules: Map<string, SyncRule[]> = new Map(); // syncPointId -> rules
  private syncPointsByTask: Map<string, Set<string>> = new Map(); // taskId -> syncPointIds
  private nextCheckSchedule: Map<string, NodeJS.Timeout> = new Map(); // syncPointId -> timeout
  private readonly eventEmitter: EventEmitter;
  private readonly logger: Logger;

  constructor(
    private readonly taskCoordination: TaskCoordinationService,
    private readonly progressService: ProgressBroadcastService,
    private readonly messaging: AgentMessagingService,
    private readonly agentRegistry: AgentRegistryService,
    logger: Logger,
  ) {
    this.logger = logger;
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);

    // Subscribe to progress updates
    this.subscribeToProgressUpdates();
  }

  /**
   * Create a new synchronization point
   */
  async createSynchronizationPoint(
    name: string,
    description: string,
    tasks: string[],
    type: SyncPointType,
    notificationAgentIds: string[],
    options: {
      deadline?: number;
      syncRules?: SyncRule[];
    } = {},
  ): Promise<SynchronizationPoint> {
    // Create criteria from tasks
    const criteria = tasks.map((taskId) => ({
      taskId,
      requiredStatus: ProgressStatus.COMPLETED,
    }));

    // Create the synchronization point
    const syncPoint = await this.taskCoordination.createSynchronizationPoint(
      name,
      description,
      tasks,
      criteria,
      notificationAgentIds,
      {
        deadline: options.deadline,
      },
    );

    // Store the synchronization point
    this.synchronizationPoints.set(syncPoint.id, syncPoint);

    // Store sync rules if provided
    if (options.syncRules && options.syncRules.length > 0) {
      this.syncRules.set(syncPoint.id, options.syncRules);
    }

    // Track sync points by task
    for (const taskId of tasks) {
      const taskSyncPoints = this.syncPointsByTask.get(taskId) || new Set();
      taskSyncPoints.add(syncPoint.id);
      this.syncPointsByTask.set(taskId, taskSyncPoints);
    }

    // Schedule next check
    this.scheduleNextCheck(syncPoint.id);

    this.logger.info('Synchronization point created', {
      syncPointId: syncPoint.id,
      name,
      type,
      taskCount: tasks.length,
    });

    // Emit event
    this.eventEmitter.emit('sync_point.created', {
      syncPoint,
      type,
    });

    return syncPoint;
  }

  /**
   * Get a synchronization point by ID
   */
  getSynchronizationPoint(
    syncPointId: string,
  ): SynchronizationPoint | undefined {
    return this.synchronizationPoints.get(syncPointId);
  }

  /**
   * Get synchronization points for a task
   */
  getTaskSynchronizationPoints(taskId: string): SynchronizationPoint[] {
    const syncPointIds = this.syncPointsByTask.get(taskId) || new Set();
    const syncPoints: SynchronizationPoint[] = [];

    for (const syncPointId of syncPointIds) {
      const syncPoint = this.synchronizationPoints.get(syncPointId);
      if (syncPoint) {
        syncPoints.push(syncPoint);
      }
    }

    return syncPoints;
  }

  /**
   * Add a custom synchronization rule
   */
  addSyncRule(syncPointId: string, rule: Omit<SyncRule, 'id'>): SyncRule {
    const syncPoint = this.synchronizationPoints.get(syncPointId);

    if (!syncPoint) {
      throw new Error(`Synchronization point ${syncPointId} not found`);
    }

    // Create the rule with ID
    const newRule: SyncRule = {
      ...rule,
      id: uuidv4(),
    };

    // Store the rule
    const rules = this.syncRules.get(syncPointId) || [];
    rules.push(newRule);

    // Sort by priority (highest first)
    rules.sort((a, b) => b.priority - a.priority);

    this.syncRules.set(syncPointId, rules);

    this.logger.info('Synchronization rule added', {
      syncPointId,
      ruleId: newRule.id,
      type: newRule.type,
    });

    return newRule;
  }

  /**
   * Force check a synchronization point
   */
  async checkSynchronizationPoint(syncPointId: string): Promise<void> {
    const syncPoint = this.synchronizationPoints.get(syncPointId);

    if (!syncPoint) {
      throw new Error(`Synchronization point ${syncPointId} not found`);
    }

    // Check with custom rules first
    const rules = this.syncRules.get(syncPointId);

    if (rules && rules.length > 0) {
      await this.evaluateSyncRules(syncPointId, rules);
    } else {
      // Use default check in task coordination service
      await this.taskCoordination.checkSynchronizationPoint(syncPointId);
    }

    // Refresh our copy of the sync point
    const updatedSyncPoint = await this.taskCoordination
      .getSynchronizationPoints()
      .find((sp) => sp.id === syncPointId);

    if (updatedSyncPoint) {
      this.synchronizationPoints.set(syncPointId, updatedSyncPoint);

      // If still active, schedule next check
      if (
        updatedSyncPoint.status === 'pending' ||
        updatedSyncPoint.status === 'in_progress'
      ) {
        this.scheduleNextCheck(syncPointId);
      } else {
        // Create milestone update for completed sync points
        await this.createMilestoneUpdate(updatedSyncPoint);
      }
    }
  }

  /**
   * Add a task to an existing synchronization point
   */
  async addTaskToSyncPoint(
    syncPointId: string,
    taskId: string,
    requiredStatus: ProgressStatus = ProgressStatus.COMPLETED,
  ): Promise<SynchronizationPoint> {
    const syncPoint = this.synchronizationPoints.get(syncPointId);

    if (!syncPoint) {
      throw new Error(`Synchronization point ${syncPointId} not found`);
    }

    // Check if task is already part of this sync point
    if (syncPoint.tasks.includes(taskId)) {
      throw new Error(
        `Task ${taskId} is already part of synchronization point ${syncPointId}`,
      );
    }

    // Add task to sync point
    syncPoint.tasks.push(taskId);

    // Add criterion
    syncPoint.criteria.push({
      taskId,
      requiredStatus,
    });

    // Store updated sync point
    this.synchronizationPoints.set(syncPointId, syncPoint);

    // Track sync point by task
    const taskSyncPoints = this.syncPointsByTask.get(taskId) || new Set();
    taskSyncPoints.add(syncPointId);
    this.syncPointsByTask.set(taskId, taskSyncPoints);

    // Force a check
    await this.checkSynchronizationPoint(syncPointId);

    this.logger.info('Task added to synchronization point', {
      syncPointId,
      taskId,
    });

    // Emit event
    this.eventEmitter.emit('sync_point.task_added', {
      syncPoint,
      taskId,
      requiredStatus,
    });

    return syncPoint;
  }

  /**
   * Set a deadline for a synchronization point
   */
  async setDeadline(
    syncPointId: string,
    deadline: number,
  ): Promise<SynchronizationPoint> {
    const syncPoint = this.synchronizationPoints.get(syncPointId);

    if (!syncPoint) {
      throw new Error(`Synchronization point ${syncPointId} not found`);
    }

    // Set deadline
    syncPoint.deadline = deadline;

    // Store updated sync point
    this.synchronizationPoints.set(syncPointId, syncPoint);

    // Force a check if deadline is soon
    if (deadline - Date.now() < 3600000) {
      // Less than an hour away
      await this.checkSynchronizationPoint(syncPointId);
    } else {
      // Reschedule next check
      this.scheduleNextCheck(syncPointId);
    }

    this.logger.info('Deadline set for synchronization point', {
      syncPointId,
      deadline: new Date(deadline).toISOString(),
    });

    return syncPoint;
  }

  /**
   * Notify additional agents about a synchronization point
   */
  async notifyAgents(syncPointId: string, agentIds: string[]): Promise<void> {
    const syncPoint = this.synchronizationPoints.get(syncPointId);

    if (!syncPoint) {
      throw new Error(`Synchronization point ${syncPointId} not found`);
    }

    // Add agent IDs to notification list if not already there
    const newAgentIds = agentIds.filter(
      (id) => !syncPoint.notificationAgentIds.includes(id),
    );

    if (newAgentIds.length === 0) {
      return;
    }

    syncPoint.notificationAgentIds = [
      ...syncPoint.notificationAgentIds,
      ...newAgentIds,
    ];

    // Store updated sync point
    this.synchronizationPoints.set(syncPointId, syncPoint);

    // Create message content
    const messageContent = {
      type: 'synchronization_point_notification',
      syncPoint: {
        id: syncPoint.id,
        name: syncPoint.name,
        description: syncPoint.description,
        status: syncPoint.status,
        completedTasks: syncPoint.completedTasks.length,
        totalTasks: syncPoint.tasks.length,
        deadline: syncPoint.deadline,
      },
    };

    // Send message to new agents
    for (const agentId of newAgentIds) {
      const agent = await this.agentRegistry.getAgent(agentId);

      if (!agent) {
        continue;
      }

      // Create a conversation if needed
      const conversation = await this.messaging.createConversation(
        ['system', agentId],
        `Synchronization point: ${syncPoint.name}`,
      );

      // Send notification
      await this.messaging.sendMessage({
        id: uuidv4(),
        conversationId: conversation.conversationId,
        senderId: 'system',
        recipientId: agentId,
        recipientName: agent.name,
        intent: MessageIntent.NOTIFY,
        modality: CommunicationModality.STRUCTURED_DATA,
        content: messageContent,
        timestamp: Date.now(),
        priority:
          syncPoint.deadline && Date.now() > syncPoint.deadline - 3600000
            ? 2
            : 1, // Higher priority if deadline is close
      });
    }

    this.logger.info('Additional agents notified about synchronization point', {
      syncPointId,
      agentCount: newAgentIds.length,
    });
  }

  /**
   * Subscribe to events
   */
  subscribe(
    eventType:
      | 'sync_point.created'
      | 'sync_point.task_added'
      | 'sync_point.rule_triggered'
      | 'sync_point.completed'
      | 'sync_point.failed'
      | 'sync_point.approaching_deadline',
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
   * Subscribe to progress updates
   */
  private subscribeToProgressUpdates(): void {
    // Listen for task progress updates
    this.progressService.subscribe('status.progress', async (update) => {
      // Check if this task is part of any sync points
      const syncPointIds = this.syncPointsByTask.get(update.taskId);

      if (syncPointIds) {
        // Check each affected sync point
        for (const syncPointId of syncPointIds) {
          await this.checkSynchronizationPoint(syncPointId);
        }
      }
    });

    // Subscribe to task coordination events
    this.taskCoordination.subscribe('sync_point.completed', (syncPoint) => {
      // Update our copy
      this.synchronizationPoints.set(syncPoint.id, syncPoint);

      // Emit our own event
      this.eventEmitter.emit('sync_point.completed', syncPoint);
    });

    this.taskCoordination.subscribe('sync_point.failed', (syncPoint) => {
      // Update our copy
      this.synchronizationPoints.set(syncPoint.id, syncPoint);

      // Emit our own event
      this.eventEmitter.emit('sync_point.failed', syncPoint);
    });
  }

  /**
   * Evaluate synchronization rules
   */
  private async evaluateSyncRules(
    syncPointId: string,
    rules: SyncRule[],
  ): Promise<void> {
    const syncPoint = this.synchronizationPoints.get(syncPointId);

    if (!syncPoint) {
      return;
    }

    // Already completed or failed
    if (syncPoint.status === 'completed' || syncPoint.status === 'failed') {
      return;
    }

    // Evaluate each rule
    for (const rule of rules) {
      const taskStatuses = await this.getTaskStatuses(rule.taskIds);

      // Apply the rule
      let ruleResult = false;

      switch (rule.type) {
        case 'all_completed':
          ruleResult = taskStatuses.every(
            (status) => status === rule.requiredStatus,
          );
          break;

        case 'any_completed':
          ruleResult = taskStatuses.some(
            (status) => status === rule.requiredStatus,
          );
          break;

        case 'majority_completed':
          {
            const minRequired =
              rule.minRequired || Math.ceil(taskStatuses.length / 2);
            const completedCount = taskStatuses.filter(
              (status) => status === rule.requiredStatus,
            ).length;
            ruleResult = completedCount >= minRequired;
          }
          break;

        case 'custom':
          // Custom conditions would be implemented here
          // This is a simplified placeholder
          ruleResult = false;
          break;
      }

      if (ruleResult) {
        // Rule triggered - update sync point status
        syncPoint.status = 'completed';
        syncPoint.completedAt = Date.now();

        // Update sync point
        this.synchronizationPoints.set(syncPointId, syncPoint);

        // Notify via task coordination service
        await this.taskCoordination.checkSynchronizationPoint(syncPointId);

        // Emit rule triggered event
        this.eventEmitter.emit('sync_point.rule_triggered', {
          syncPoint,
          rule,
        });

        this.logger.info('Synchronization rule triggered', {
          syncPointId,
          ruleId: rule.id,
          type: rule.type,
        });

        return;
      }
    }

    // No rule triggered, fall back to standard check
    await this.taskCoordination.checkSynchronizationPoint(syncPointId);
  }

  /**
   * Get status for multiple tasks
   */
  private async getTaskStatuses(taskIds: string[]): Promise<ProgressStatus[]> {
    const statuses: ProgressStatus[] = [];

    for (const taskId of taskIds) {
      const summary = this.progressService.getTaskStatusSummary(taskId);

      if (summary) {
        statuses.push(summary.status);
      } else {
        // Default to not started
        statuses.push(ProgressStatus.NOT_STARTED);
      }
    }

    return statuses;
  }

  /**
   * Schedule next check for a synchronization point
   */
  private scheduleNextCheck(syncPointId: string): void {
    // Clear any existing scheduled check
    const existingTimeout = this.nextCheckSchedule.get(syncPointId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const syncPoint = this.synchronizationPoints.get(syncPointId);

    if (!syncPoint) {
      return;
    }

    // Already completed or failed
    if (syncPoint.status === 'completed' || syncPoint.status === 'failed') {
      return;
    }

    let checkDelay = 60000; // Default: check every minute

    // If there's a deadline, adjust check frequency based on proximity
    if (syncPoint.deadline) {
      const timeToDeadline = syncPoint.deadline - Date.now();

      if (timeToDeadline <= 0) {
        // Past deadline, check now
        checkDelay = 0;
      } else if (timeToDeadline < 300000) {
        // Less than 5 minutes to deadline - check every 30 seconds
        checkDelay = 30000;

        // Emit approaching deadline event if not already notified
        if (timeToDeadline < 300000 && timeToDeadline > 270000) {
          this.eventEmitter.emit('sync_point.approaching_deadline', {
            syncPoint,
            timeToDeadline,
          });
        }
      } else if (timeToDeadline < 3600000) {
        // Less than 1 hour to deadline - check every minute
        checkDelay = 60000;
      } else {
        // More than 1 hour to deadline - check less frequently
        checkDelay = 300000; // Every 5 minutes
      }
    }

    // Schedule next check
    const timeout = setTimeout(
      async () => this.checkSynchronizationPoint(syncPointId),
      checkDelay,
    );

    this.nextCheckSchedule.set(syncPointId, timeout);
  }

  /**
   * Create a milestone update for a completed sync point
   */
  private async createMilestoneUpdate(
    syncPoint: SynchronizationPoint,
  ): Promise<void> {
    if (syncPoint.status !== 'completed') {
      return;
    }

    // Create milestone update for the first task
    if (syncPoint.tasks.length === 0) {
      return;
    }

    const mainTaskId = syncPoint.tasks[0];

    // Create the milestone update
    const milestoneUpdate: MilestoneUpdate = {
      id: uuidv4(),
      agentId: 'system',
      taskId: mainTaskId,
      timestamp: Date.now(),
      type: StatusUpdateType.MILESTONE,
      priority: StatusPriority.HIGH,
      message: `Synchronization point "${syncPoint.name}" completed`,
      milestoneName: syncPoint.name,
      outcomes: [
        `All ${syncPoint.completedTasks.length} required tasks completed`,
      ],
      impactedTasks: syncPoint.tasks,
    };

    // Submit the update
    await this.progressService.submitStatusUpdate(milestoneUpdate);
  }
}
