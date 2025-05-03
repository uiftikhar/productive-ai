import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  ConflictResolutionStrategy,
  ParallelDataSharingService,
  SharedDataItem,
} from '../interfaces/parallel-execution.interface';

/**
 * Implementation of the parallel data sharing service
 */
export class ParallelDataSharingServiceImpl implements ParallelDataSharingService {
  private logger: Logger;
  private sharedData: Map<string, SharedDataItem> = new Map();
  private dataLocks: Map<string, { threadId: string; expiry: number }> = new Map();
  private dataChangeListeners: Map<string, ((item: SharedDataItem) => void)[]> = new Map();
  private DEFAULT_LOCK_TIMEOUT = 30000; // 30 seconds

  constructor(options: { logger?: Logger } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.logger.info('Parallel data sharing service initialized');
    
    // Start lock expiry check
    setInterval(() => this.checkLockExpiry(), 5000);
  }

  /**
   * Create a new shared data item
   */
  createSharedData(
    key: string,
    initialValue: any,
    options: Partial<Omit<SharedDataItem, 'key' | 'value' | 'version' | 'lastUpdated' | 'history'>> = {}
  ): boolean {
    // Check if data already exists
    if (this.sharedData.has(key)) {
      this.logger.warn(`Shared data item with key ${key} already exists`);
      return false;
    }

    const now = new Date();
    
    // Create shared data item with defaults
    const sharedItem: SharedDataItem = {
      key,
      value: initialValue,
      version: 1,
      lastUpdated: now,
      updatedBy: options.updatedBy || 'system',
      accessControl: options.accessControl || {
        readThreads: 'all',
        writeThreads: 'all',
      },
      conflictResolution: options.conflictResolution || ConflictResolutionStrategy.LAST_WRITER_WINS,
      history: [
        {
          version: 1,
          value: initialValue,
          timestamp: now,
          updatedBy: options.updatedBy || 'system',
        },
      ],
      schema: options.schema,
    };

    // Store the shared data
    this.sharedData.set(key, sharedItem);

    this.logger.info(`Shared data item created: ${key}`, {
      key,
      initialValueType: typeof initialValue,
      accessControl: sharedItem.accessControl,
      conflictResolution: sharedItem.conflictResolution,
    });

    return true;
  }

  /**
   * Read a shared data value
   */
  readSharedData<T>(key: string, threadId: string): T | undefined {
    const item = this.sharedData.get(key);
    
    if (!item) {
      this.logger.warn(`Thread ${threadId} attempted to read non-existent shared data: ${key}`);
      return undefined;
    }

    // Check read access
    if (!this.hasReadAccess(item, threadId)) {
      this.logger.warn(`Thread ${threadId} does not have read access to shared data: ${key}`);
      return undefined;
    }

    this.logger.debug(`Thread ${threadId} read shared data: ${key}`, {
      key,
      version: item.version,
    });

    return item.value as T;
  }

  /**
   * Write a value to shared data
   */
  writeSharedData<T>(key: string, value: T, threadId: string): boolean {
    const item = this.sharedData.get(key);
    
    if (!item) {
      this.logger.warn(`Thread ${threadId} attempted to write to non-existent shared data: ${key}`);
      return false;
    }

    // Check write access
    if (!this.hasWriteAccess(item, threadId)) {
      this.logger.warn(`Thread ${threadId} does not have write access to shared data: ${key}`);
      return false;
    }

    // Check if the key is locked by another thread
    const lock = this.dataLocks.get(key);
    if (lock && lock.threadId !== threadId && lock.expiry > Date.now()) {
      this.logger.warn(`Thread ${threadId} attempted to write to locked shared data: ${key}`, {
        key,
        lockedBy: lock.threadId,
        lockedUntil: new Date(lock.expiry),
      });
      return false;
    }

    // Validate against schema if present
    if (item.schema) {
      try {
        // This is a simplified schema validation
        // In a real implementation, use a proper schema validator
        if (typeof item.schema === 'function') {
          if (!item.schema(value)) {
            this.logger.warn(`Thread ${threadId} attempted to write invalid data to ${key}`);
            return false;
          }
        }
      } catch (error) {
        this.logger.error(`Schema validation error for ${key}`, { error });
        return false;
      }
    }

    const now = new Date();
    const newVersion = item.version + 1;

    // Create updated item
    const updatedItem: SharedDataItem = {
      ...item,
      value,
      version: newVersion,
      lastUpdated: now,
      updatedBy: threadId,
      history: [
        ...item.history,
        {
          version: newVersion,
          value,
          timestamp: now,
          updatedBy: threadId,
        },
      ],
    };

    // Ensure history doesn't grow too large
    if (updatedItem.history.length > 10) {
      updatedItem.history = updatedItem.history.slice(-10);
    }

    // Update the shared data
    this.sharedData.set(key, updatedItem);

    this.logger.info(`Thread ${threadId} updated shared data: ${key}`, {
      key,
      version: newVersion,
      previousVersion: item.version,
    });

    // Notify listeners
    this.notifyDataChangeListeners(key, updatedItem);

    return true;
  }

  /**
   * Subscribe to changes on a shared data item
   */
  subscribeToDataChanges(key: string, callback: (item: SharedDataItem) => void): () => void {
    if (!this.dataChangeListeners.has(key)) {
      this.dataChangeListeners.set(key, []);
    }

    this.dataChangeListeners.get(key)?.push(callback);

    this.logger.debug(`New subscriber for shared data: ${key}`);

    // Return unsubscribe function
    return () => {
      const listeners = this.dataChangeListeners.get(key);
      if (listeners) {
        this.dataChangeListeners.set(
          key,
          listeners.filter(cb => cb !== callback)
        );
      }
    };
  }

  /**
   * Lock a shared data item for exclusive access
   */
  lockSharedData(key: string, threadId: string, timeout?: number): boolean {
    if (!this.sharedData.has(key)) {
      this.logger.warn(`Thread ${threadId} attempted to lock non-existent shared data: ${key}`);
      return false;
    }

    // Check if already locked by another thread
    const existingLock = this.dataLocks.get(key);
    if (existingLock && existingLock.threadId !== threadId && existingLock.expiry > Date.now()) {
      this.logger.warn(`Thread ${threadId} attempted to lock already locked data: ${key}`, {
        key,
        lockedBy: existingLock.threadId,
        lockedUntil: new Date(existingLock.expiry),
      });
      return false;
    }

    // Set lock
    const lockTimeout = timeout || this.DEFAULT_LOCK_TIMEOUT;
    const expiry = Date.now() + lockTimeout;
    
    this.dataLocks.set(key, {
      threadId,
      expiry,
    });

    this.logger.info(`Thread ${threadId} locked shared data: ${key}`, {
      key,
      expiry: new Date(expiry),
      timeout: lockTimeout,
    });

    return true;
  }

  /**
   * Unlock a shared data item
   */
  unlockSharedData(key: string, threadId: string): boolean {
    if (!this.dataLocks.has(key)) {
      // Not locked, so nothing to unlock
      return true;
    }

    const lock = this.dataLocks.get(key);
    
    // Check if locked by another thread
    if (lock && lock.threadId !== threadId) {
      this.logger.warn(`Thread ${threadId} attempted to unlock data locked by another thread: ${key}`, {
        key,
        lockedBy: lock.threadId,
      });
      return false;
    }

    // Remove lock
    this.dataLocks.delete(key);

    this.logger.info(`Thread ${threadId} unlocked shared data: ${key}`, { key });

    return true;
  }

  /**
   * Resolve a conflict with multiple values
   */
  resolveConflict(key: string, conflictingValues: any[], resolution: any): boolean {
    const item = this.sharedData.get(key);
    
    if (!item) {
      this.logger.warn(`Attempted to resolve conflict for non-existent shared data: ${key}`);
      return false;
    }

    const now = new Date();
    const newVersion = item.version + 1;

    // Create updated item with resolution
    const updatedItem: SharedDataItem = {
      ...item,
      value: resolution,
      version: newVersion,
      lastUpdated: now,
      updatedBy: 'conflict-resolution',
      history: [
        ...item.history,
        {
          version: newVersion,
          value: resolution,
          timestamp: now,
          updatedBy: 'conflict-resolution',
        },
      ],
    };

    // Ensure history doesn't grow too large
    if (updatedItem.history.length > 10) {
      updatedItem.history = updatedItem.history.slice(-10);
    }

    // Update the shared data
    this.sharedData.set(key, updatedItem);

    this.logger.info(`Conflict resolved for shared data: ${key}`, {
      key,
      version: newVersion,
      conflictingValueCount: conflictingValues.length,
    });

    // Notify listeners
    this.notifyDataChangeListeners(key, updatedItem);

    return true;
  }

  /**
   * Get a snapshot of all shared data
   */
  getSharedDataSnapshot(): Record<string, any> {
    const snapshot: Record<string, any> = {};

    for (const [key, item] of this.sharedData.entries()) {
      snapshot[key] = item.value;
    }

    return snapshot;
  }

  /**
   * Check if a thread has read access to a shared data item
   */
  private hasReadAccess(item: SharedDataItem, threadId: string): boolean {
    const { readThreads } = item.accessControl;

    if (readThreads === 'all') {
      return true;
    }

    return readThreads.includes(threadId);
  }

  /**
   * Check if a thread has write access to a shared data item
   */
  private hasWriteAccess(item: SharedDataItem, threadId: string): boolean {
    const { writeThreads } = item.accessControl;

    if (writeThreads === 'all') {
      return true;
    }

    return writeThreads.includes(threadId);
  }

  /**
   * Notify all listeners about data changes
   */
  private notifyDataChangeListeners(key: string, item: SharedDataItem): void {
    const listeners = this.dataChangeListeners.get(key) || [];
    
    for (const listener of listeners) {
      try {
        listener(item);
      } catch (error) {
        this.logger.error(`Error in data change listener for ${key}`, { error });
      }
    }
  }

  /**
   * Check and clean up expired locks
   */
  private checkLockExpiry(): void {
    const now = Date.now();
    const expiredLocks: string[] = [];

    // Find expired locks
    for (const [key, lock] of this.dataLocks.entries()) {
      if (lock.expiry <= now) {
        expiredLocks.push(key);
      }
    }

    // Remove expired locks
    for (const key of expiredLocks) {
      const lock = this.dataLocks.get(key);
      this.dataLocks.delete(key);
      
      this.logger.info(`Lock expired for shared data: ${key}`, {
        key,
        threadId: lock?.threadId,
      });
    }
  }

  /**
   * Get detailed information about a shared data item
   */
  getSharedDataInfo(key: string): Omit<SharedDataItem, 'value' | 'history'> | undefined {
    const item = this.sharedData.get(key);
    
    if (!item) {
      return undefined;
    }

    // Return metadata without the actual value or full history
    return {
      key: item.key,
      version: item.version,
      lastUpdated: item.lastUpdated,
      updatedBy: item.updatedBy,
      accessControl: item.accessControl,
      schema: item.schema,
      conflictResolution: item.conflictResolution,
    };
  }

  /**
   * Get all shared data keys
   */
  getSharedDataKeys(): string[] {
    return Array.from(this.sharedData.keys());
  }

  /**
   * Delete a shared data item
   */
  deleteSharedData(key: string, threadId: string): boolean {
    const item = this.sharedData.get(key);
    
    if (!item) {
      return false;
    }

    // Check write access (deletion requires write access)
    if (!this.hasWriteAccess(item, threadId)) {
      this.logger.warn(`Thread ${threadId} does not have write access to delete shared data: ${key}`);
      return false;
    }

    // Check if locked by another thread
    const lock = this.dataLocks.get(key);
    if (lock && lock.threadId !== threadId && lock.expiry > Date.now()) {
      this.logger.warn(`Thread ${threadId} attempted to delete locked shared data: ${key}`);
      return false;
    }

    // Remove data, lock, and listeners
    this.sharedData.delete(key);
    this.dataLocks.delete(key);
    this.dataChangeListeners.delete(key);

    this.logger.info(`Thread ${threadId} deleted shared data: ${key}`);

    return true;
  }
} 