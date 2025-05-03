import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  HumanIntervention,
  InterventionPoint,
} from '../../interfaces/visualization.interface';

type NotificationCallback = (
  interventionId: string,
  details: InterventionPoint,
) => void;

/**
 * Implementation of the human intervention service
 * This service manages intervention points for human oversight of workflows
 */
export class HumanInterventionImpl implements HumanIntervention {
  private logger: Logger;
  private interventionPoints: Map<string, InterventionPoint> = new Map();
  private nodeInterventions: Map<string, Set<string>> = new Map();
  private notificationCallbacks: Map<string, NotificationCallback> = new Map();

  constructor(
    options: {
      logger?: Logger;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.logger.info('Human intervention service initialized');
  }

  /**
   * Create a new intervention point
   */
  createInterventionPoint(
    point: Omit<InterventionPoint, 'id' | 'createdAt'>,
  ): string {
    const id = uuidv4();
    const now = new Date();

    const newPoint: InterventionPoint = {
      ...point,
      id,
      createdAt: now,
      completed: false,
    };

    // Store the intervention point
    this.interventionPoints.set(id, newPoint);

    // Index by node
    this.updateNodeIndex(newPoint.nodeId, id);

    this.logger.debug(
      `Created intervention point ${id} for node ${point.nodeId}`,
    );

    // Notify any registered callbacks
    this.notifyOperators(id);

    return id;
  }

  /**
   * Get a specific intervention point
   */
  getInterventionPoint(pointId: string): InterventionPoint {
    const point = this.interventionPoints.get(pointId);

    if (!point) {
      this.logger.warn(`Intervention point not found: ${pointId}`);
      throw new Error(`Intervention point not found: ${pointId}`);
    }

    return point;
  }

  /**
   * Get all active intervention points
   */
  getActiveInterventionPoints(): InterventionPoint[] {
    const activePoints: InterventionPoint[] = [];

    for (const point of this.interventionPoints.values()) {
      if (!point.completed) {
        activePoints.push(point);
      }
    }

    // Sort by creation time (oldest first)
    activePoints.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return activePoints;
  }

  /**
   * Complete an intervention
   */
  completeIntervention(pointId: string, result: string): boolean {
    const point = this.interventionPoints.get(pointId);

    if (!point) {
      this.logger.warn(`Cannot complete non-existent intervention: ${pointId}`);
      return false;
    }

    if (point.completed) {
      this.logger.warn(`Intervention ${pointId} is already completed`);
      return false;
    }

    // Update the intervention point
    point.completed = true;
    point.completedAt = new Date();
    point.result = result;

    this.logger.debug(
      `Completed intervention ${pointId} with result: ${result}`,
    );

    return true;
  }

  /**
   * Create an approval request intervention
   */
  createApprovalRequest(
    nodeId: string,
    description: string,
    deadline?: Date,
  ): string {
    return this.createInterventionPoint({
      nodeId,
      type: 'approval',
      availableActions: ['approve', 'reject', 'modify'],
      description,
      deadline,
    });
  }

  /**
   * Create a modification point intervention
   */
  createModificationPoint(
    nodeId: string,
    description: string,
    allowedActions: string[],
  ): string {
    return this.createInterventionPoint({
      nodeId,
      type: 'modification',
      availableActions: allowedActions,
      description,
    });
  }

  /**
   * Notify human operators about an intervention
   */
  notifyHumanOperator(interventionId: string): boolean {
    const point = this.interventionPoints.get(interventionId);

    if (!point) {
      this.logger.warn(
        `Cannot notify about non-existent intervention: ${interventionId}`,
      );
      return false;
    }

    if (point.completed) {
      this.logger.warn(
        `Intervention ${interventionId} is already completed, not notifying`,
      );
      return false;
    }

    // Notify all registered callbacks
    this.notifyOperators(interventionId);

    this.logger.debug(
      `Notified human operators about intervention ${interventionId}`,
    );

    return true;
  }

  /**
   * Register a notification callback
   * This is an extension method not defined in the interface
   */
  registerNotificationCallback(
    callbackId: string,
    callback: NotificationCallback,
  ): void {
    this.notificationCallbacks.set(callbackId, callback);
    this.logger.debug(`Registered notification callback: ${callbackId}`);
  }

  /**
   * Unregister a notification callback
   * This is an extension method not defined in the interface
   */
  unregisterNotificationCallback(callbackId: string): boolean {
    const result = this.notificationCallbacks.delete(callbackId);

    if (result) {
      this.logger.debug(`Unregistered notification callback: ${callbackId}`);
    } else {
      this.logger.warn(`Notification callback not found: ${callbackId}`);
    }

    return result;
  }

  /**
   * Get active interventions for a specific node
   * This is an extension method not defined in the interface
   */
  getNodeInterventions(
    nodeId: string,
    activeOnly: boolean = true,
  ): InterventionPoint[] {
    const interventionIds =
      this.nodeInterventions.get(nodeId) || new Set<string>();

    let interventions = Array.from(interventionIds)
      .map((id) => this.interventionPoints.get(id))
      .filter(Boolean) as InterventionPoint[];

    if (activeOnly) {
      interventions = interventions.filter((point) => !point.completed);
    }

    // Sort by creation time (oldest first)
    interventions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return interventions;
  }

  /**
   * Helper method to update node index
   */
  private updateNodeIndex(nodeId: string, interventionId: string): void {
    if (!this.nodeInterventions.has(nodeId)) {
      this.nodeInterventions.set(nodeId, new Set<string>());
    }

    this.nodeInterventions.get(nodeId)!.add(interventionId);
  }

  /**
   * Helper method to notify all registered callbacks
   */
  private notifyOperators(interventionId: string): void {
    const point = this.interventionPoints.get(interventionId);

    if (!point) {
      return;
    }

    for (const callback of this.notificationCallbacks.values()) {
      try {
        callback(interventionId, point);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Error in notification callback for intervention ${interventionId}: ${errorMessage}`,
        );
      }
    }
  }
}
