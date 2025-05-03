import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  ExecutionThread,
  ExecutionThreadStatus,
  SynchronizationManager,
  SynchronizationPoint,
  SyncPointType,
} from '../interfaces/parallel-execution.interface';

/**
 * Implementation of the synchronization manager for coordinating parallel execution
 */
export class SynchronizationManagerService implements SynchronizationManager {
  private logger: Logger;
  private syncPoints: Map<string, SynchronizationPoint> = new Map();
  private threadSyncPoints: Map<string, Set<string>> = new Map(); // threadId -> set of syncPointIds
  private syncPointTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private syncPointListeners: Map<
    string,
    ((syncPoint: SynchronizationPoint) => void)[]
  > = new Map();

  constructor(options: { logger?: Logger } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.logger.info('Synchronization manager service initialized');
  }

  /**
   * Create a new synchronization point
   */
  createSyncPoint(
    syncPoint: Omit<
      SynchronizationPoint,
      'id' | 'createdAt' | 'waitingThreads'
    >,
  ): string {
    const syncPointId = uuidv4();
    const createdAt = new Date();

    const newSyncPoint: SynchronizationPoint = {
      ...syncPoint,
      id: syncPointId,
      createdAt,
      waitingThreads: [],
    };

    // Store the sync point
    this.syncPoints.set(syncPointId, newSyncPoint);

    // Record which threads participate in this sync point
    for (const threadId of newSyncPoint.participatingThreads) {
      if (!this.threadSyncPoints.has(threadId)) {
        this.threadSyncPoints.set(threadId, new Set<string>());
      }
      this.threadSyncPoints.get(threadId)?.add(syncPointId);
    }

    // Set up timeout if specified
    if (newSyncPoint.timeout) {
      this.setupSyncPointTimeout(syncPointId, newSyncPoint.timeout);
    }

    this.logger.info(
      `Sync point created: ${newSyncPoint.name} (${syncPointId})`,
      {
        syncPointId,
        type: newSyncPoint.type,
        participatingThreads: newSyncPoint.participatingThreads,
        requiredThreads: newSyncPoint.requiredThreads,
      },
    );

    return syncPointId;
  }

  /**
   * Register a thread at a synchronization point
   */
  registerThreadAtSyncPoint(syncPointId: string, threadId: string): boolean {
    const syncPoint = this.syncPoints.get(syncPointId);
    if (!syncPoint) {
      this.logger.warn(
        `Cannot register thread at non-existent sync point ${syncPointId}`,
      );
      return false;
    }

    // Check if thread participates in this sync point
    if (!syncPoint.participatingThreads.includes(threadId)) {
      this.logger.warn(
        `Thread ${threadId} is not a participant in sync point ${syncPointId}`,
      );
      return false;
    }

    // Check if thread is already waiting
    if (syncPoint.waitingThreads.includes(threadId)) {
      return true;
    }

    // Add thread to waiting list
    const updatedSyncPoint: SynchronizationPoint = {
      ...syncPoint,
      waitingThreads: [...syncPoint.waitingThreads, threadId],
    };

    // Update the sync point
    this.syncPoints.set(syncPointId, updatedSyncPoint);

    this.logger.debug(
      `Thread ${threadId} registered at sync point ${syncPointId}`,
      {
        syncPointId,
        threadId,
        waitingThreadCount: updatedSyncPoint.waitingThreads.length,
        totalParticipants: updatedSyncPoint.participatingThreads.length,
      },
    );

    // Check if the sync point can now be released
    const status = this.checkSyncPointStatus(syncPointId);
    if (status.canProceed) {
      this.logger.info(
        `Sync point ${syncPointId} conditions met, threads can proceed`,
      );

      // Notify all listeners
      this.notifySyncPointListeners(syncPointId);
    }

    return true;
  }

  /**
   * Release a synchronization point, allowing waiting threads to proceed
   */
  releaseSyncPoint(syncPointId: string, result?: any): boolean {
    const syncPoint = this.syncPoints.get(syncPointId);
    if (!syncPoint) {
      this.logger.warn(`Cannot release non-existent sync point ${syncPointId}`);
      return false;
    }

    // If already completed, nothing to do
    if (syncPoint.completedAt) {
      return true;
    }

    // Clear any timeout
    if (this.syncPointTimeouts.has(syncPointId)) {
      clearTimeout(this.syncPointTimeouts.get(syncPointId)!);
      this.syncPointTimeouts.delete(syncPointId);
    }

    // Mark as completed
    const updatedSyncPoint: SynchronizationPoint = {
      ...syncPoint,
      completedAt: new Date(),
      result,
    };

    // Update the sync point
    this.syncPoints.set(syncPointId, updatedSyncPoint);

    this.logger.info(`Sync point ${syncPointId} released`, {
      syncPointId,
      waitingThreads: updatedSyncPoint.waitingThreads,
      result: result ? 'provided' : 'none',
    });

    // Notify all listeners
    this.notifySyncPointListeners(syncPointId);

    return true;
  }

  /**
   * Check the status of a synchronization point
   */
  checkSyncPointStatus(syncPointId: string): {
    isComplete: boolean;
    waitingThreads: string[];
    canProceed: boolean;
  } {
    const syncPoint = this.syncPoints.get(syncPointId);
    if (!syncPoint) {
      return {
        isComplete: false,
        waitingThreads: [],
        canProceed: false,
      };
    }

    // If already completed, all threads can proceed
    if (syncPoint.completedAt) {
      return {
        isComplete: true,
        waitingThreads: syncPoint.waitingThreads,
        canProceed: true,
      };
    }

    let canProceed = false;

    // Check if conditions for proceeding are met based on sync point type
    switch (syncPoint.type) {
      case SyncPointType.BARRIER:
        // All participating threads must be waiting
        canProceed = syncPoint.participatingThreads.every((threadId) =>
          syncPoint.waitingThreads.includes(threadId),
        );
        break;

      case SyncPointType.RENDEZ_VOUS:
        // Only specific threads need to be waiting
        canProceed = syncPoint.requiredThreads.every((threadId) =>
          syncPoint.waitingThreads.includes(threadId),
        );
        break;

      case SyncPointType.JOIN:
        // Check if all required threads are waiting
        canProceed = syncPoint.requiredThreads.every((threadId) =>
          syncPoint.waitingThreads.includes(threadId),
        );
        break;

      case SyncPointType.FORK:
        // Fork can proceed as soon as parent thread is waiting
        // Typically just needs the initiating thread
        canProceed =
          syncPoint.requiredThreads.length === 0 ||
          syncPoint.requiredThreads.every((threadId) =>
            syncPoint.waitingThreads.includes(threadId),
          );
        break;

      case SyncPointType.DATA_EXCHANGE:
        // Requires all threads that will exchange data
        canProceed = syncPoint.requiredThreads.every((threadId) =>
          syncPoint.waitingThreads.includes(threadId),
        );
        break;

      case SyncPointType.DECISION:
        // Decision points typically need all inputs before proceeding
        canProceed = syncPoint.requiredThreads.every((threadId) =>
          syncPoint.waitingThreads.includes(threadId),
        );
        break;

      default:
        this.logger.warn(`Unknown sync point type: ${syncPoint.type}`);
        break;
    }

    // If there's a custom condition, check that as well
    if (canProceed && syncPoint.barrierCondition) {
      try {
        // For this, we would need the actual thread objects
        // Here we're simplifying by assuming the condition checks waitingThreads
        canProceed = syncPoint.barrierCondition(
          syncPoint.waitingThreads.map(
            (threadId) =>
              ({
                id: threadId,
                status: ExecutionThreadStatus.WAITING,
              }) as ExecutionThread,
          ),
        );
      } catch (error) {
        this.logger.error(
          `Error in custom barrier condition for sync point ${syncPointId}`,
          {
            error,
          },
        );
        canProceed = false;
      }
    }

    return {
      isComplete: false,
      waitingThreads: syncPoint.waitingThreads,
      canProceed,
    };
  }

  /**
   * Get a synchronization point by ID
   */
  getSyncPointById(syncPointId: string): SynchronizationPoint | undefined {
    return this.syncPoints.get(syncPointId);
  }

  /**
   * Get all synchronization points a thread participates in
   */
  getThreadSyncPoints(threadId: string): SynchronizationPoint[] {
    const syncPointIds =
      this.threadSyncPoints.get(threadId) || new Set<string>();

    return Array.from(syncPointIds)
      .map((id) => this.syncPoints.get(id))
      .filter(
        (syncPoint): syncPoint is SynchronizationPoint =>
          syncPoint !== undefined,
      );
  }

  /**
   * Get all active synchronization points
   */
  getActiveSyncPoints(): SynchronizationPoint[] {
    return Array.from(this.syncPoints.values()).filter(
      (syncPoint) => !syncPoint.completedAt,
    );
  }

  /**
   * Force-release a synchronization point (e.g., due to timeout or error)
   */
  forceReleaseSyncPoint(syncPointId: string, reason: string): boolean {
    const syncPoint = this.syncPoints.get(syncPointId);
    if (!syncPoint) {
      this.logger.warn(
        `Cannot force-release non-existent sync point ${syncPointId}`,
      );
      return false;
    }

    // If already completed, nothing to do
    if (syncPoint.completedAt) {
      return true;
    }

    // Clear any timeout
    if (this.syncPointTimeouts.has(syncPointId)) {
      clearTimeout(this.syncPointTimeouts.get(syncPointId)!);
      this.syncPointTimeouts.delete(syncPointId);
    }

    this.logger.warn(`Forcing release of sync point ${syncPointId}`, {
      syncPointId,
      reason,
      waitingThreads: syncPoint.waitingThreads,
      missingThreads: syncPoint.participatingThreads.filter(
        (threadId) => !syncPoint.waitingThreads.includes(threadId),
      ),
    });

    // Mark as completed with error result
    const updatedSyncPoint: SynchronizationPoint = {
      ...syncPoint,
      completedAt: new Date(),
      result: {
        forcedRelease: true,
        reason,
        waitingThreads: syncPoint.waitingThreads,
        missingThreads: syncPoint.participatingThreads.filter(
          (threadId) => !syncPoint.waitingThreads.includes(threadId),
        ),
      },
    };

    // Update the sync point
    this.syncPoints.set(syncPointId, updatedSyncPoint);

    // Notify all listeners
    this.notifySyncPointListeners(syncPointId);

    return true;
  }

  /**
   * Set up timeout for automatic release of a sync point
   */
  private setupSyncPointTimeout(syncPointId: string, timeoutMs: number): void {
    // Clear any existing timeout
    if (this.syncPointTimeouts.has(syncPointId)) {
      clearTimeout(this.syncPointTimeouts.get(syncPointId)!);
    }

    // Set up new timeout
    const timeout = setTimeout(() => {
      this.logger.warn(
        `Sync point ${syncPointId} timed out after ${timeoutMs}ms`,
      );
      this.forceReleaseSyncPoint(syncPointId, `Timeout after ${timeoutMs}ms`);
    }, timeoutMs);

    this.syncPointTimeouts.set(syncPointId, timeout);
  }

  /**
   * Subscribe to synchronization point updates
   */
  subscribeSyncPointUpdates(
    syncPointId: string,
    callback: (syncPoint: SynchronizationPoint) => void,
  ): () => void {
    if (!this.syncPointListeners.has(syncPointId)) {
      this.syncPointListeners.set(syncPointId, []);
    }

    this.syncPointListeners.get(syncPointId)?.push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.syncPointListeners.get(syncPointId);
      if (listeners) {
        this.syncPointListeners.set(
          syncPointId,
          listeners.filter((cb) => cb !== callback),
        );
      }
    };
  }

  /**
   * Notify all listeners about synchronization point updates
   */
  private notifySyncPointListeners(syncPointId: string): void {
    const syncPoint = this.syncPoints.get(syncPointId);
    if (!syncPoint) {
      return;
    }

    const listeners = this.syncPointListeners.get(syncPointId) || [];
    for (const listener of listeners) {
      try {
        listener(syncPoint);
      } catch (error) {
        this.logger.error(
          `Error in sync point update listener for ${syncPointId}`,
          { error },
        );
      }
    }
  }

  /**
   * Check if a thread is waiting at any synchronization point
   */
  isThreadWaiting(threadId: string): boolean {
    for (const syncPoint of this.syncPoints.values()) {
      if (
        syncPoint.waitingThreads.includes(threadId) &&
        !syncPoint.completedAt
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all synchronization points of a specific type
   */
  getSyncPointsByType(type: SyncPointType): SynchronizationPoint[] {
    return Array.from(this.syncPoints.values()).filter(
      (syncPoint) => syncPoint.type === type,
    );
  }
}
