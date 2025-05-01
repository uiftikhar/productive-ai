import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';

import {
  StatusUpdate,
  ProgressUpdate,
  StatusUpdateType,
  ProgressStatus,
  DependencyUpdate,
  TaskStatusSummary,
  StatusPriority,
} from '../interfaces/status-reporting.interface';
import { AgentMessagingService } from './agent-messaging.service';
import { ProgressBroadcastService } from './progress-broadcast.service';

/**
 * Task dependency types
 */
export enum DependencyType {
  FINISH_TO_START = 'finish_to_start', // Task B can't start until Task A is finished
  START_TO_START = 'start_to_start', // Task B can't start until Task A has started
  FINISH_TO_FINISH = 'finish_to_finish', // Task B can't finish until Task A is finished
  START_TO_FINISH = 'start_to_finish', // Task B can't finish until Task A has started
  REQUIRES_ARTIFACT = 'requires_artifact', // Task B requires artifact from Task A
  OPTIONAL = 'optional', // Soft dependency, not strictly required
}

/**
 * Task dependency representation
 */
export interface TaskDependency {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  type: DependencyType;
  strength: number; // 0-1 scale, 1 being strongest dependency
  description: string;
  artifactId?: string;
  status: 'pending' | 'satisfied' | 'blocked' | 'waived';
  createdAt: number;
  satisfiedAt?: number;
}

/**
 * Task priority levels for resource allocation
 */
export enum TaskPriority {
  LOWEST = 0,
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  HIGHEST = 4,
  CRITICAL = 5,
}

/**
 * Task resource allocation
 */
export interface TaskResourceAllocation {
  taskId: string;
  agentId: string;
  resourceType: string;
  resourceId: string;
  allocation: number; // 0-1 scale representing percentage of resource allocated
  startTime: number;
  endTime?: number;
  priority: TaskPriority;
  status: 'planned' | 'active' | 'completed' | 'revoked';
}

/**
 * Synchronization point for coordinating multiple tasks
 */
export interface SynchronizationPoint {
  id: string;
  name: string;
  description: string;
  tasks: string[];
  criteria: Array<{
    taskId: string;
    requiredStatus: ProgressStatus;
    condition?: string;
  }>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  completedTasks: string[];
  createdAt: number;
  deadline?: number;
  completedAt?: number;
  notificationAgentIds: string[];
}

/**
 * Service for coordinating tasks and managing dependencies
 */
export class TaskCoordinationService {
  private dependencies: Map<string, TaskDependency> = new Map();
  private taskDependencies: Map<string, Set<string>> = new Map(); // taskId -> dependency IDs
  private resourceAllocations: Map<string, TaskResourceAllocation> = new Map();
  private syncPoints: Map<string, SynchronizationPoint> = new Map();
  private taskPriorities: Map<string, TaskPriority> = new Map();
  private readonly eventEmitter: EventEmitter;
  private readonly logger: Logger;

  constructor(
    private readonly messaging: AgentMessagingService,
    private readonly progressService: ProgressBroadcastService,
    logger: Logger,
  ) {
    this.logger = logger;
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);

    // Subscribe to progress updates to track dependencies
    this.subscribeToProgressUpdates();
  }

  /**
   * Create a task dependency
   */
  createDependency(
    sourceTaskId: string,
    targetTaskId: string,
    type: DependencyType,
    description: string,
    strength: number = 1,
    options: {
      artifactId?: string;
    } = {},
  ): TaskDependency {
    // Create the dependency
    const dependency: TaskDependency = {
      id: uuidv4(),
      sourceTaskId,
      targetTaskId,
      type,
      strength,
      description,
      artifactId: options.artifactId,
      status: 'pending',
      createdAt: Date.now(),
    };

    // Store the dependency
    this.dependencies.set(dependency.id, dependency);

    // Track by source task
    let sourceTaskDeps = this.taskDependencies.get(sourceTaskId) || new Set();
    sourceTaskDeps.add(dependency.id);
    this.taskDependencies.set(sourceTaskId, sourceTaskDeps);

    // Track by target task
    let targetTaskDeps = this.taskDependencies.get(targetTaskId) || new Set();
    targetTaskDeps.add(dependency.id);
    this.taskDependencies.set(targetTaskId, targetTaskDeps);

    this.logger.info('Task dependency created', {
      dependencyId: dependency.id,
      sourceTaskId,
      targetTaskId,
      type,
    });

    // Check dependency status immediately
    this.checkDependencyStatus(dependency.id);

    return dependency;
  }

  /**
   * Get all dependencies for a task
   */
  getTaskDependencies(
    taskId: string,
    direction?: 'inbound' | 'outbound',
  ): TaskDependency[] {
    const deps: TaskDependency[] = [];
    const depIds = this.taskDependencies.get(taskId) || new Set();

    for (const depId of depIds) {
      const dep = this.dependencies.get(depId);

      if (dep) {
        // Filter by direction if specified
        if (
          !direction ||
          (direction === 'inbound' && dep.targetTaskId === taskId) ||
          (direction === 'outbound' && dep.sourceTaskId === taskId)
        ) {
          deps.push(dep);
        }
      }
    }

    return deps;
  }

  /**
   * Get dependencies by status
   */
  getDependenciesByStatus(status: TaskDependency['status']): TaskDependency[] {
    const deps: TaskDependency[] = [];

    for (const dep of this.dependencies.values()) {
      if (dep.status === status) {
        deps.push(dep);
      }
    }

    return deps;
  }

  /**
   * Check if a task can start based on its dependencies
   */
  canTaskStart(taskId: string): {
    canStart: boolean;
    blockers: TaskDependency[];
  } {
    const blockers: TaskDependency[] = [];
    const inboundDeps = this.getTaskDependencies(taskId, 'inbound');

    // Check each dependency
    for (const dep of inboundDeps) {
      if (dep.status === 'blocked' || dep.status === 'pending') {
        if (
          dep.type === DependencyType.FINISH_TO_START ||
          dep.type === DependencyType.START_TO_START
        ) {
          blockers.push(dep);
        }
      }
    }

    return {
      canStart: blockers.length === 0,
      blockers,
    };
  }

  /**
   * Check if a task can finish based on its dependencies
   */
  canTaskFinish(taskId: string): {
    canFinish: boolean;
    blockers: TaskDependency[];
  } {
    const blockers: TaskDependency[] = [];
    const inboundDeps = this.getTaskDependencies(taskId, 'inbound');

    // Check each dependency
    for (const dep of inboundDeps) {
      if (dep.status === 'blocked' || dep.status === 'pending') {
        if (
          dep.type === DependencyType.FINISH_TO_FINISH ||
          dep.type === DependencyType.START_TO_FINISH
        ) {
          blockers.push(dep);
        }
      }
    }

    return {
      canFinish: blockers.length === 0,
      blockers,
    };
  }

  /**
   * Update dependency status
   */
  updateDependencyStatus(
    dependencyId: string,
    status: TaskDependency['status'],
    updatedBy: string,
  ): TaskDependency | undefined {
    const dependency = this.dependencies.get(dependencyId);

    if (!dependency) {
      return undefined;
    }

    // Update status
    dependency.status = status;

    // If satisfied, record the time
    if (status === 'satisfied' && !dependency.satisfiedAt) {
      dependency.satisfiedAt = Date.now();
    }

    // Store the updated dependency
    this.dependencies.set(dependencyId, dependency);

    // Create dependency update to broadcast
    const update: DependencyUpdate = {
      id: uuidv4(),
      agentId: updatedBy,
      taskId: dependency.targetTaskId,
      timestamp: Date.now(),
      type: StatusUpdateType.DEPENDENCY,
      priority:
        dependency.status === 'blocked'
          ? StatusPriority.HIGH
          : StatusPriority.NORMAL,
      message: `Dependency ${dependency.description} is now ${dependency.status}`,
      dependencyTaskId: dependency.sourceTaskId,
      dependencyStatus:
        dependency.status === 'satisfied'
          ? ProgressStatus.COMPLETED
          : dependency.status === 'blocked'
            ? ProgressStatus.BLOCKED
            : ProgressStatus.IN_PROGRESS,
      isBlocking: dependency.status === 'blocked',
      impact:
        dependency.status === 'blocked' && dependency.strength > 0.8
          ? 'critical'
          : dependency.status === 'blocked' && dependency.strength > 0.5
            ? 'major'
            : dependency.status === 'blocked'
              ? 'moderate'
              : 'minor',
    };

    // Broadcast the update
    this.progressService.submitStatusUpdate(update);

    this.logger.info('Dependency status updated', {
      dependencyId,
      status,
      updatedBy,
    });

    // Emit event
    this.eventEmitter.emit('dependency.updated', dependency);

    return dependency;
  }

  /**
   * Waive a dependency (mark as optional)
   */
  waiveDependency(
    dependencyId: string,
    waiverId: string,
    reason: string,
  ): TaskDependency | undefined {
    const dependency = this.dependencies.get(dependencyId);

    if (!dependency) {
      return undefined;
    }

    // Update dependency
    dependency.status = 'waived';
    dependency.type = DependencyType.OPTIONAL;

    // Store the updated dependency
    this.dependencies.set(dependencyId, dependency);

    // Create a message about the waiver
    const update: StatusUpdate = {
      id: uuidv4(),
      agentId: waiverId,
      taskId: dependency.targetTaskId,
      timestamp: Date.now(),
      type: StatusUpdateType.DEPENDENCY,
      priority: StatusPriority.NORMAL,
      message: `Dependency "${dependency.description}" waived. Reason: ${reason}`,
    };

    // Broadcast the update
    this.progressService.submitStatusUpdate(update);

    this.logger.info('Dependency waived', {
      dependencyId,
      waiverId,
      reason,
    });

    // Emit event
    this.eventEmitter.emit('dependency.waived', {
      dependency,
      waiverId,
      reason,
    });

    return dependency;
  }

  /**
   * Set task priority
   */
  setTaskPriority(taskId: string, priority: TaskPriority, setBy: string): void {
    // Store the priority
    this.taskPriorities.set(taskId, priority);

    // Adjust resource allocations based on priority
    this.adjustResourcesByPriority(taskId);

    this.logger.info('Task priority set', {
      taskId,
      priority,
      setBy,
    });

    // Emit event
    this.eventEmitter.emit('task.priority_changed', {
      taskId,
      priority,
      setBy,
    });
  }

  /**
   * Get task priority
   */
  getTaskPriority(taskId: string): TaskPriority {
    return this.taskPriorities.get(taskId) || TaskPriority.MEDIUM;
  }

  /**
   * Allocate a resource to a task
   */
  allocateResource(
    taskId: string,
    agentId: string,
    resourceType: string,
    resourceId: string,
    allocation: number,
  ): TaskResourceAllocation {
    const allocationId = `${taskId}-${resourceId}`;

    // Create allocation
    const resourceAllocation: TaskResourceAllocation = {
      taskId,
      agentId,
      resourceType,
      resourceId,
      allocation: Math.min(1, Math.max(0, allocation)), // Ensure between 0-1
      startTime: Date.now(),
      priority: this.getTaskPriority(taskId),
      status: 'active',
    };

    // Store the allocation
    this.resourceAllocations.set(allocationId, resourceAllocation);

    this.logger.info('Resource allocated', {
      taskId,
      agentId,
      resourceId,
      allocation: resourceAllocation.allocation,
    });

    // Emit event
    this.eventEmitter.emit('resource.allocated', resourceAllocation);

    return resourceAllocation;
  }

  /**
   * Release a resource allocation
   */
  releaseResource(taskId: string, resourceId: string): boolean {
    const allocationId = `${taskId}-${resourceId}`;
    const allocation = this.resourceAllocations.get(allocationId);

    if (!allocation) {
      return false;
    }

    // Update allocation
    allocation.status = 'completed';
    allocation.endTime = Date.now();

    // Store the updated allocation
    this.resourceAllocations.set(allocationId, allocation);

    this.logger.info('Resource released', {
      taskId,
      resourceId,
    });

    // Emit event
    this.eventEmitter.emit('resource.released', allocation);

    return true;
  }

  /**
   * Get resource allocations for a task
   */
  getTaskResourceAllocations(taskId: string): TaskResourceAllocation[] {
    const allocations: TaskResourceAllocation[] = [];

    for (const allocation of this.resourceAllocations.values()) {
      if (allocation.taskId === taskId && allocation.status === 'active') {
        allocations.push(allocation);
      }
    }

    return allocations;
  }

  /**
   * Create a synchronization point
   */
  createSynchronizationPoint(
    name: string,
    description: string,
    tasks: string[],
    criteria: SynchronizationPoint['criteria'],
    notificationAgentIds: string[],
    options: {
      deadline?: number;
    } = {},
  ): SynchronizationPoint {
    // Create sync point
    const syncPoint: SynchronizationPoint = {
      id: uuidv4(),
      name,
      description,
      tasks,
      criteria,
      status: 'pending',
      completedTasks: [],
      createdAt: Date.now(),
      deadline: options.deadline,
      notificationAgentIds,
    };

    // Store the sync point
    this.syncPoints.set(syncPoint.id, syncPoint);

    this.logger.info('Synchronization point created', {
      syncId: syncPoint.id,
      name,
      taskCount: tasks.length,
    });

    // Check status immediately
    this.checkSynchronizationPoint(syncPoint.id);

    return syncPoint;
  }

  /**
   * Get all synchronization points
   */
  getSynchronizationPoints(
    status?: SynchronizationPoint['status'],
  ): SynchronizationPoint[] {
    const points: SynchronizationPoint[] = [];

    for (const point of this.syncPoints.values()) {
      if (!status || point.status === status) {
        points.push(point);
      }
    }

    return points;
  }

  /**
   * Check synchronization point status
   */
  async checkSynchronizationPoint(syncPointId: string): Promise<void> {
    const syncPoint = this.syncPoints.get(syncPointId);

    if (!syncPoint) {
      return;
    }

    // Already completed or failed
    if (syncPoint.status === 'completed' || syncPoint.status === 'failed') {
      return;
    }

    // Update to in_progress if it was pending
    if (syncPoint.status === 'pending') {
      syncPoint.status = 'in_progress';
      this.syncPoints.set(syncPointId, syncPoint);
    }

    // Check each task against criteria
    let allCriteriaMet = true;
    let completedTasks: string[] = [];

    for (const criterion of syncPoint.criteria) {
      // Get task status summary
      const taskSummary = this.progressService.getTaskStatusSummary(
        criterion.taskId,
      );

      if (!taskSummary) {
        // No status info, can't be completed
        allCriteriaMet = false;
        continue;
      }

      // Check status
      if (taskSummary.status === criterion.requiredStatus) {
        completedTasks.push(criterion.taskId);
      } else {
        allCriteriaMet = false;
      }
    }

    // Update completed tasks
    syncPoint.completedTasks = completedTasks;

    // Check for completion
    if (allCriteriaMet) {
      syncPoint.status = 'completed';
      syncPoint.completedAt = Date.now();

      // Notify agents
      this.notifySyncPointComplete(syncPoint);
    } else if (syncPoint.deadline && Date.now() > syncPoint.deadline) {
      // Check for failure due to missed deadline
      syncPoint.status = 'failed';

      // Notify agents
      this.notifySyncPointFailed(syncPoint);
    }

    // Save updated state
    this.syncPoints.set(syncPointId, syncPoint);

    // Emit event
    this.eventEmitter.emit('sync_point.updated', syncPoint);
  }

  /**
   * Subscribe to events
   */
  subscribe(
    eventType:
      | 'dependency.updated'
      | 'dependency.waived'
      | 'task.priority_changed'
      | 'resource.allocated'
      | 'resource.released'
      | 'sync_point.updated'
      | 'sync_point.completed'
      | 'sync_point.failed',
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
    // Status update subscription
    this.progressService.subscribe('status.progress', (update) => {
      if (update.type === StatusUpdateType.PROGRESS) {
        const progressUpdate = update as ProgressUpdate;

        // Check dependencies affected by this task
        const taskDeps = this.getTaskDependencies(
          progressUpdate.taskId,
          'outbound',
        );

        for (const dep of taskDeps) {
          this.checkDependencyStatus(dep.id);
        }

        // Check sync points that include this task
        for (const syncPoint of this.syncPoints.values()) {
          if (syncPoint.tasks.includes(progressUpdate.taskId)) {
            this.checkSynchronizationPoint(syncPoint.id);
          }
        }
      }
    });
  }

  /**
   * Check a dependency status based on task states
   */
  private async checkDependencyStatus(dependencyId: string): Promise<void> {
    const dependency = this.dependencies.get(dependencyId);

    if (!dependency) {
      return;
    }

    // Get status summaries for the tasks
    const sourceTaskSummary = this.progressService.getTaskStatusSummary(
      dependency.sourceTaskId,
    );
    const targetTaskSummary = this.progressService.getTaskStatusSummary(
      dependency.targetTaskId,
    );

    if (!sourceTaskSummary || !targetTaskSummary) {
      // Not enough information to determine status
      return;
    }

    let newStatus: TaskDependency['status'] = dependency.status;
    const sourceIsCompleted =
      sourceTaskSummary.status === ProgressStatus.COMPLETED;
    const targetIsCompleted =
      targetTaskSummary.status === ProgressStatus.COMPLETED;
    const sourceHasStarted =
      sourceTaskSummary.status !== ProgressStatus.NOT_STARTED;
    const targetHasStarted =
      targetTaskSummary.status !== ProgressStatus.NOT_STARTED;

    switch (dependency.type) {
      case DependencyType.FINISH_TO_START:
        if (sourceIsCompleted) {
          newStatus = 'satisfied';
        } else if (targetHasStarted) {
          // Target has started but source isn't complete
          newStatus = 'blocked';
        }
        break;

      case DependencyType.START_TO_START:
        if (sourceHasStarted) {
          newStatus = 'satisfied';
        } else if (targetHasStarted) {
          // Target has started but source hasn't
          newStatus = 'blocked';
        }
        break;

      case DependencyType.FINISH_TO_FINISH:
        if (sourceIsCompleted) {
          newStatus = 'satisfied';
        } else if (targetIsCompleted) {
          // Target is complete but source isn't
          newStatus = 'blocked';
        }
        break;

      case DependencyType.START_TO_FINISH:
        if (sourceHasStarted) {
          newStatus = 'satisfied';
        } else if (targetIsCompleted) {
          // Target is complete but source hasn't started
          newStatus = 'blocked';
        }
        break;

      case DependencyType.REQUIRES_ARTIFACT:
        // Need more complex logic with artifact tracking
        // This is a simplified implementation
        if (sourceIsCompleted) {
          newStatus = 'satisfied';
        } else if (targetHasStarted) {
          // Target has started but source (artifact provider) isn't complete
          newStatus = 'blocked';
        }
        break;

      case DependencyType.OPTIONAL:
        // Optional dependencies are never blocking
        newStatus = 'satisfied';
        break;
    }

    // Update if changed
    if (newStatus !== dependency.status) {
      this.updateDependencyStatus(dependency.id, newStatus, 'system');
    }
  }

  /**
   * Adjust resource allocations based on task priority
   */
  private adjustResourcesByPriority(taskId: string): void {
    const priority = this.getTaskPriority(taskId);
    const allocations = this.getTaskResourceAllocations(taskId);

    // Update allocation priorities
    for (const allocation of allocations) {
      allocation.priority = priority;
      const allocationId = `${taskId}-${allocation.resourceId}`;
      this.resourceAllocations.set(allocationId, allocation);
    }

    // Check for overallocation of shared resources
    // Only do this for high or critical priority tasks
    if (priority >= TaskPriority.HIGH) {
      this.rebalanceResourceAllocations();
    }
  }

  /**
   * Rebalance resource allocations for overallocated resources
   */
  private rebalanceResourceAllocations(): void {
    // Group allocations by resource
    const resourceGroups: Map<string, TaskResourceAllocation[]> = new Map();

    for (const allocation of this.resourceAllocations.values()) {
      if (allocation.status === 'active') {
        const resourceAllocs = resourceGroups.get(allocation.resourceId) || [];
        resourceAllocs.push(allocation);
        resourceGroups.set(allocation.resourceId, resourceAllocs);
      }
    }

    // Check each resource for overallocation
    for (const [resourceId, allocations] of resourceGroups.entries()) {
      // Check total allocation
      const totalAllocation = allocations.reduce(
        (sum, alloc) => sum + alloc.allocation,
        0,
      );

      if (totalAllocation > 1.0) {
        // Resource is overallocated, rebalance based on priority
        // Sort allocations by priority (highest first)
        allocations.sort((a, b) => b.priority - a.priority);

        let remainingAllocation = 1.0;
        let adjustedAllocations: TaskResourceAllocation[] = [];

        // Allocate from highest priority to lowest
        for (const allocation of allocations) {
          const allocationId = `${allocation.taskId}-${resourceId}`;

          if (remainingAllocation > 0) {
            // Give this allocation as much as possible
            const newAllocation = Math.min(
              allocation.allocation,
              remainingAllocation,
            );
            remainingAllocation -= newAllocation;

            // Update allocation amount
            const updatedAllocation = {
              ...allocation,
              allocation: newAllocation,
            };
            this.resourceAllocations.set(allocationId, updatedAllocation);
            adjustedAllocations.push(updatedAllocation);
          } else {
            // No allocation left, set to 0
            const updatedAllocation = { ...allocation, allocation: 0 };
            this.resourceAllocations.set(allocationId, updatedAllocation);
            adjustedAllocations.push(updatedAllocation);
          }
        }

        // Emit event with adjustments
        this.eventEmitter.emit('resource.rebalanced', {
          resourceId,
          adjustedAllocations,
        });
      }
    }
  }

  /**
   * Notify agents about a completed synchronization point
   */
  private async notifySyncPointComplete(
    syncPoint: SynchronizationPoint,
  ): Promise<void> {
    for (const agentId of syncPoint.notificationAgentIds) {
      // Create a status update
      const update: StatusUpdate = {
        id: uuidv4(),
        agentId: 'system',
        taskId: syncPoint.tasks[0], // Use first task as reference
        timestamp: Date.now(),
        type: StatusUpdateType.MILESTONE,
        priority: StatusPriority.NORMAL,
        message: `Synchronization point "${syncPoint.name}" completed. ${syncPoint.description}`,
      };

      // Broadcast to the specific agent
      await this.progressService.broadcastStatus(update, [agentId]);
    }

    // Emit event
    this.eventEmitter.emit('sync_point.completed', syncPoint);
  }

  /**
   * Notify agents about a failed synchronization point
   */
  private async notifySyncPointFailed(
    syncPoint: SynchronizationPoint,
  ): Promise<void> {
    for (const agentId of syncPoint.notificationAgentIds) {
      // Create a status update
      const update: StatusUpdate = {
        id: uuidv4(),
        agentId: 'system',
        taskId: syncPoint.tasks[0], // Use first task as reference
        timestamp: Date.now(),
        type: StatusUpdateType.BLOCKER,
        priority: StatusPriority.HIGH,
        message: `Synchronization point "${syncPoint.name}" failed. ${syncPoint.completedTasks.length} of ${syncPoint.tasks.length} tasks met criteria.`,
      };

      // Broadcast to the specific agent
      await this.progressService.broadcastStatus(update, [agentId]);
    }

    // Emit event
    this.eventEmitter.emit('sync_point.failed', syncPoint);
  }
}
