/**
 * Interfaces for Parallel Execution Coordinator
 *
 * These interfaces define the core types and structures for synchronization point
 * management, data sharing protocols, and progress tracking across concurrent
 * execution paths.
 */

/**
 * Execution thread status
 */
export enum ExecutionThreadStatus {
  PENDING = 'pending', // Thread created but not started
  RUNNING = 'running', // Thread is actively executing
  WAITING = 'waiting', // Thread is waiting at synchronization point
  COMPLETED = 'completed', // Thread has completed successfully
  FAILED = 'failed', // Thread has failed
  CANCELED = 'canceled', // Thread was canceled
  BLOCKED = 'blocked', // Thread is blocked waiting for a resource
}

/**
 * Synchronization point type
 */
export enum SyncPointType {
  BARRIER = 'barrier', // All threads must reach before any can proceed
  RENDEZ_VOUS = 'rendez_vous', // Only specific threads need to sync
  JOIN = 'join', // Wait for specific threads to complete
  FORK = 'fork', // Create new parallel threads
  DATA_EXCHANGE = 'data_exchange', // Exchange data between threads
  DECISION = 'decision', // Make a decision based on multiple thread results
}

/**
 * Data access mode for shared data
 */
export enum DataAccessMode {
  READ_ONLY = 'read_only',
  READ_WRITE = 'read_write',
  WRITE_ONLY = 'write_only',
}

/**
 * Conflict resolution strategy for data updates
 */
export enum ConflictResolutionStrategy {
  LAST_WRITER_WINS = 'last_writer_wins',
  MERGE = 'merge',
  CONSENSUS = 'consensus',
  PRIORITY_BASED = 'priority_based',
  CUSTOM = 'custom',
}

/**
 * Definition of an execution thread in a parallel workflow
 */
export interface ExecutionThread {
  id: string;
  name: string;
  description?: string;
  status: ExecutionThreadStatus;
  parentThreadId?: string;
  childThreadIds: string[];
  taskIds: string[]; // Tasks being executed in this thread
  currentTaskId?: string;
  progress: number; // 0-1 progress indicator
  startTime?: Date;
  endTime?: Date;
  result?: any;
  error?: any;
  synchronizationPoints: string[]; // IDs of synchronization points this thread participates in
  dataAccess: {
    key: string;
    mode: DataAccessMode;
  }[];
  metadata: Record<string, any>;
}

/**
 * Synchronization point definition
 */
export interface SynchronizationPoint {
  id: string;
  name: string;
  type: SyncPointType;
  description?: string;
  participatingThreads: string[]; // Thread IDs that must synchronize
  requiredThreads: string[]; // Thread IDs that MUST be present (subset of participating)
  waitingThreads: string[]; // Thread IDs currently waiting at this point
  barrierCondition?: (threads: ExecutionThread[]) => boolean; // Custom condition for proceeding
  timeout?: number; // Timeout in ms after which barrier releases anyway
  createdAt: Date;
  completedAt?: Date;
  result?: any; // Any result from the synchronization (e.g., merged data)
  executionPath?: string[]; // Next steps after synchronization
}

/**
 * Shared data item for inter-thread communication
 */
export interface SharedDataItem {
  key: string;
  value: any;
  version: number;
  lastUpdated: Date;
  updatedBy: string; // Thread ID that last updated
  accessControl: {
    readThreads: string[] | 'all'; // Threads with read access
    writeThreads: string[] | 'all'; // Threads with write access
  };
  schema?: any; // Optional schema for validation
  conflictResolution: ConflictResolutionStrategy;
  history: {
    version: number;
    value: any;
    timestamp: Date;
    updatedBy: string;
  }[];
}

/**
 * Progress information for a specific task
 */
export interface TaskProgress {
  taskId: string;
  progress: number; // 0-1 scale
  status: string;
  startTime?: Date;
  estimatedCompletion?: Date;
  currentStage?: string;
  message?: string;
  metrics?: Record<string, any>;
}

/**
 * Interface for synchronization manager
 */
export interface SynchronizationManager {
  createSyncPoint(
    syncPoint: Omit<
      SynchronizationPoint,
      'id' | 'createdAt' | 'waitingThreads'
    >,
  ): string;
  registerThreadAtSyncPoint(syncPointId: string, threadId: string): boolean;
  releaseSyncPoint(syncPointId: string, result?: any): boolean;
  checkSyncPointStatus(syncPointId: string): {
    isComplete: boolean;
    waitingThreads: string[];
    canProceed: boolean;
  };
  getSyncPointById(syncPointId: string): SynchronizationPoint | undefined;
  getThreadSyncPoints(threadId: string): SynchronizationPoint[];
  getActiveSyncPoints(): SynchronizationPoint[];
  forceReleaseSyncPoint(syncPointId: string, reason: string): boolean;
}

/**
 * Interface for parallel data sharing service
 */
export interface ParallelDataSharingService {
  createSharedData(
    key: string,
    initialValue: any,
    options?: Partial<
      Omit<
        SharedDataItem,
        'key' | 'value' | 'version' | 'lastUpdated' | 'history'
      >
    >,
  ): boolean;
  readSharedData<T>(key: string, threadId: string): T | undefined;
  writeSharedData<T>(key: string, value: T, threadId: string): boolean;
  subscribeToDataChanges(
    key: string,
    callback: (item: SharedDataItem) => void,
  ): () => void;
  lockSharedData(key: string, threadId: string, timeout?: number): boolean;
  unlockSharedData(key: string, threadId: string): boolean;
  resolveConflict(
    key: string,
    conflictingValues: any[],
    resolution: any,
  ): boolean;
  getSharedDataSnapshot(): Record<string, any>;
}

/**
 * Interface for multi-task progress tracking
 */
export interface MultiTaskProgressService {
  registerTask(
    taskId: string,
    threadId: string,
    metadata?: Record<string, any>,
  ): boolean;
  updateTaskProgress(
    taskId: string,
    progress: number,
    status?: string,
    message?: string,
  ): boolean;
  updateTaskStage(taskId: string, stage: string, progress?: number): boolean;
  getTaskProgress(taskId: string): TaskProgress | undefined;
  getThreadProgress(threadId: string): number; // Combined progress for all tasks in the thread
  getOverallProgress(): number; // Overall workflow progress
  getProgressTimeline(taskId: string): {
    timestamp: Date;
    progress: number;
    stage?: string;
  }[];
  setEstimatedCompletion(taskId: string, estimatedCompletion: Date): boolean;
  getProgressReport(): Record<string, any>; // Comprehensive progress report
}
