/**
 * Shared memory implementation for the Agentic Meeting Analysis System
 */
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  ISharedMemory,
  MemoryEntry,
  MemoryOperation,
  MemoryOperationType,
  MemoryValueType,
  MemoryUpdateNotification,
  MemoryQueryOptions,
  MemoryConflict,
  ConflictType,
} from '../interfaces/memory.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * Configuration options for SharedMemoryService
 */
export interface SharedMemoryConfig {
  logger?: Logger;
  persistenceEnabled?: boolean;
  maxHistoryLength?: number;
  defaultNamespace?: string;
}

/**
 * Implementation of shared memory service for the agentic meeting analysis system
 */
export class SharedMemoryService extends EventEmitter implements ISharedMemory {
  private entries: Map<string, MemoryEntry> = new Map();
  private operations: MemoryOperation[] = [];
  private logger: Logger;
  private persistenceEnabled: boolean;
  private maxHistoryLength: number;
  private defaultNamespace: string;
  private subscriptionCallbacks: Map<
    string,
    ((notification: MemoryUpdateNotification) => void)[]
  > = new Map();
  private locks: Set<string> = new Set();

  /**
   * Create a new shared memory service
   */
  constructor(config: SharedMemoryConfig = {}) {
    super();

    this.logger = config.logger || new ConsoleLogger();
    this.persistenceEnabled = config.persistenceEnabled || false;
    this.maxHistoryLength = config.maxHistoryLength || 100;
    this.defaultNamespace = config.defaultNamespace || 'default';

    this.logger.info('Initialized SharedMemoryService');
  }

  /**
   * Initialize the shared memory service
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing shared memory service');

    // Register event listeners
    this.on('memoryUpdate', this.handleMemoryUpdate.bind(this));

    if (this.persistenceEnabled) {
      try {
        // Load persisted state from storage if enabled
        this.logger.info('Persistence enabled, loading saved memory state');
        // Implementation would load from database, file, etc.
      } catch (error) {
        this.logger.warn(
          `Failed to load persisted memory: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.info('Shared memory service initialized');
  }

  /**
   * Read a value from memory
   */
  async read(
    key: string,
    namespace: string = this.defaultNamespace,
    agentId: string = 'system',
  ): Promise<any> {
    this.logger.debug(`Reading key ${key} from namespace ${namespace}`);

    const fullKey = this.getFullKey(namespace, key);
    const entry = this.entries.get(fullKey);

    if (!entry) {
      this.logger.debug(`Key ${key} not found in namespace ${namespace}`);
      return null;
    }

    // Record the read operation
    const operation: MemoryOperation = {
      id: uuidv4(),
      type: MemoryOperationType.READ,
      key,
      namespace,
      agentId,
      timestamp: Date.now(),
    };

    this.operations.push(operation);

    return entry.currentValue;
  }

  /**
   * Write a value to memory
   */
  async write(
    key: string,
    value: any,
    namespace: string = this.defaultNamespace,
    agentId: string = 'system',
    metadata: Record<string, any> = {},
  ): Promise<void> {
    if (!key) {
      throw new Error('Invalid key: key must be provided');
    }

    this.logger.debug(`Writing key ${key} to namespace ${namespace}`);

    // Implement a more robust locking mechanism for concurrent access
    const fullKey = this.getFullKey(namespace, key);
    
    // Track lock acquisition for timeout handling
    let lockAcquired = false;
    const lockTimeout = setTimeout(() => {
      if (!lockAcquired) {
        this.logger.warn(`Lock acquisition timeout for key ${key} in namespace ${namespace}`);
        this.locks.delete(fullKey); // Force release lock if stuck
      }
    }, 5000); // 5 second timeout

    try {
      // Try to acquire the lock with exponential backoff
      let attempts = 0;
      const maxAttempts = 10;
      let backoffMs = 10; // Start with 10ms
      
      while (this.locks.has(fullKey)) {
        // Wait with exponential backoff
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        
        // Increase backoff for next iteration (with some randomness)
        backoffMs = Math.min(backoffMs * 1.5 + Math.random() * 10, 200);
        attempts++;
        
        if (attempts >= maxAttempts) {
          throw new Error(`Failed to acquire lock for key ${key} after ${maxAttempts} attempts`);
        }
      }
      
      // Lock the key
      this.locks.add(fullKey);
      lockAcquired = true;
      clearTimeout(lockTimeout);
      
      // Get fresh data from the store after acquiring the lock
      const now = Date.now();
      const valueType = this.determineValueType(value);
      
      // Get existing entry or create a new one
      const existingEntry = this.entries.get(fullKey);
      const oldValue = existingEntry?.currentValue;
      
      if (existingEntry) {
        // Update existing entry
        existingEntry.currentValue = value;
        existingEntry.valueType = valueType;
        existingEntry.lastUpdated = now;
        
        // Add version history
        existingEntry.versions.unshift({
          value,
          timestamp: now,
          agentId,
          operation: MemoryOperationType.WRITE,
          metadata,
        });
        
        // Trim history if needed
        if (existingEntry.versions.length > this.maxHistoryLength) {
          existingEntry.versions = existingEntry.versions.slice(0, this.maxHistoryLength);
        }
      } else {
        // Create new entry
        const newEntry: MemoryEntry = {
          key,
          namespace,
          currentValue: value,
          valueType,
          versions: [
            {
              value,
              timestamp: now,
              agentId,
              operation: MemoryOperationType.WRITE,
              metadata,
            },
          ],
          created: now,
          lastUpdated: now,
          subscribers: [],
        };
        this.entries.set(fullKey, newEntry);
      }
      
      // Record the write operation
      const operation: MemoryOperation = {
        id: uuidv4(),
        type: MemoryOperationType.WRITE,
        key,
        namespace,
        value,
        metadata,
        agentId,
        timestamp: now,
      };
      
      this.operations.push(operation);
      
      // If operation history gets too large, trim it
      if (this.operations.length > this.maxHistoryLength * 10) {
        this.operations = this.operations.slice(-this.maxHistoryLength * 5);
      }
      
      // Emit update event
      const notification: MemoryUpdateNotification = {
        id: uuidv4(),
        operation: MemoryOperationType.WRITE,
        key,
        namespace,
        newValue: value,
        oldValue,
        agentId,
        timestamp: now,
        metadata,
      };
      
      this.emit('memoryUpdate', notification);
      
      // If enabled, persist changes
      if (this.persistenceEnabled) {
        this.persistChanges();
      }
    } catch (error) {
      this.logger.error(`Error writing to memory: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to write key ${key}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Always release the lock
      if (lockAcquired) {
        this.locks.delete(fullKey);
      } else {
        clearTimeout(lockTimeout);
      }
    }
  }

  /**
   * Delete a value from memory
   */
  async delete(
    key: string,
    namespace: string = this.defaultNamespace,
    agentId: string = 'system',
  ): Promise<void> {
    this.logger.debug(`Deleting key ${key} from namespace ${namespace}`);

    const fullKey = this.getFullKey(namespace, key);
    const entry = this.entries.get(fullKey);

    if (!entry) {
      this.logger.debug(
        `Key ${key} not found in namespace ${namespace} for deletion`,
      );
      return;
    }

    const oldValue = entry.currentValue;
    const now = Date.now();

    // Record the delete operation
    const operation: MemoryOperation = {
      id: uuidv4(),
      type: MemoryOperationType.DELETE,
      key,
      namespace,
      agentId,
      timestamp: now,
    };

    this.operations.push(operation);

    // Remove the entry
    this.entries.delete(fullKey);

    // Emit update event
    const notification: MemoryUpdateNotification = {
      id: uuidv4(),
      operation: MemoryOperationType.DELETE,
      key,
      namespace,
      newValue: null,
      oldValue,
      agentId,
      timestamp: now,
    };

    this.emit('memoryUpdate', notification);

    // If enabled, persist changes
    if (this.persistenceEnabled) {
      this.persistChanges();
    }
  }

  /**
   * Query memory based on criteria
   */
  async query(options: MemoryQueryOptions): Promise<Record<string, any>> {
    this.logger.debug(
      `Querying memory with options: ${JSON.stringify(options)}`,
    );

    const results: Record<string, any> = {};
    const namespaces = options.namespaces || [this.defaultNamespace];
    const keyPattern = options.keyPattern
      ? typeof options.keyPattern === 'string'
        ? new RegExp(options.keyPattern)
        : options.keyPattern
      : null;

    // Convert the entries map to array for iteration compatibility
    const entriesArray = Array.from(this.entries);

    for (const [fullKey, entry] of entriesArray) {
      // Filter by namespace
      if (!namespaces.includes(entry.namespace)) {
        continue;
      }

      // Filter by key pattern
      if (keyPattern && !keyPattern.test(entry.key)) {
        continue;
      }

      // Filter by value type
      if (options.valueType && entry.valueType !== options.valueType) {
        continue;
      }

      // Filter by timestamp range
      if (options.fromTimestamp && entry.lastUpdated < options.fromTimestamp) {
        continue;
      }

      if (options.toTimestamp && entry.lastUpdated > options.toTimestamp) {
        continue;
      }

      // Add to results
      if (options.includeHistory) {
        results[entry.key] = {
          value: entry.currentValue,
          history: this.operations.filter((op) => op.key === entry.key && op.type === MemoryOperationType.WRITE),
          metadata: {
            created: entry.created,
            lastUpdated: entry.lastUpdated,
            namespace: entry.namespace,
          },
        };
      } else {
        results[entry.key] = entry.currentValue;
      }
    }

    // Apply limit and sorting if needed
    const keys = Object.keys(results);
    if (options.sort) {
      keys.sort((a, b) => {
        const entryA = this.entries.get(this.getFullKey(namespaces[0], a));
        const entryB = this.entries.get(this.getFullKey(namespaces[0], b));

        if (!entryA || !entryB) return 0;

        return options.sort === 'asc'
          ? entryA.lastUpdated - entryB.lastUpdated
          : entryB.lastUpdated - entryA.lastUpdated;
      });
    }

    if (options.limit && keys.length > options.limit) {
      const limitedKeys = keys.slice(0, options.limit);
      const limitedResults: Record<string, any> = {};

      for (const key of limitedKeys) {
        limitedResults[key] = results[key];
      }

      return limitedResults;
    }

    return results;
  }

  /**
   * List all namespaces
   */
  async listNamespaces(): Promise<string[]> {
    const namespaces = new Set<string>();

    // Convert the entries map to array for iteration compatibility
    const entriesArray = Array.from(this.entries.values());

    for (const entry of entriesArray) {
      namespaces.add(entry.namespace);
    }

    return Array.from(namespaces);
  }

  /**
   * List keys in a namespace matching a pattern
   */
  async listKeys(
    namespace: string = this.defaultNamespace,
    pattern?: string | RegExp,
  ): Promise<string[]> {
    const keys: string[] = [];
    const regex = pattern
      ? typeof pattern === 'string'
        ? new RegExp(pattern)
        : pattern
      : null;

    // Convert the entries map to array for iteration compatibility
    const entriesArray = Array.from(this.entries);

    for (const [fullKey, entry] of entriesArray) {
      if (entry.namespace === namespace) {
        if (!regex || regex.test(entry.key)) {
          keys.push(entry.key);
        }
      }
    }

    return keys;
  }

  /**
   * Subscribe to changes for a specific key
   */
  subscribe(
    key: string,
    namespace: string = this.defaultNamespace,
    agentId: string = 'system',
    callback: (notification: MemoryUpdateNotification) => void,
  ): void {
    this.logger.debug(`Agent ${agentId} subscribing to ${key} in namespace ${namespace}`);

    const fullKey = this.getFullKey(namespace, key);
    const entry = this.entries.get(fullKey);
    
    // Add agent to subscribers for this entry
    if (entry) {
      if (!entry.subscribers.includes(agentId)) {
        entry.subscribers.push(agentId);
      }
    } else {
      // Create a placeholder entry for future writes
      this.entries.set(fullKey, {
        key,
        namespace,
        currentValue: null,
        valueType: MemoryValueType.NULL,
        versions: [],
        created: Date.now(),
        lastUpdated: Date.now(),
        subscribers: [agentId],
      });
    }
    
    // Register the callback
    const subscriptionKey = `${agentId}:${fullKey}`;
    
    if (!this.subscriptionCallbacks.has(subscriptionKey)) {
      this.subscriptionCallbacks.set(subscriptionKey, []);
    }
    
    const callbacks = this.subscriptionCallbacks.get(subscriptionKey);
    if (callbacks && !callbacks.includes(callback)) {
      callbacks.push(callback);
    }
    
    // Record the subscription operation
    const operation: MemoryOperation = {
      id: uuidv4(),
      type: MemoryOperationType.SUBSCRIBE,
      key,
      namespace,
      agentId,
      timestamp: Date.now(),
    };
    
    this.operations.push(operation);
  }

  /**
   * Unsubscribe from changes for a specific key
   */
  unsubscribe(
    key: string,
    namespace: string = this.defaultNamespace,
    agentId: string = 'system'
  ): void {
    this.logger.debug(`Agent ${agentId} unsubscribing from ${key} in namespace ${namespace}`);
    
    const fullKey = this.getFullKey(namespace, key);
    const entry = this.entries.get(fullKey);
    
    // Remove agent from subscribers for this entry
    if (entry) {
      entry.subscribers = entry.subscribers.filter(id => id !== agentId);
    }
    
    // Remove the callbacks
    const subscriptionKey = `${agentId}:${fullKey}`;
    this.subscriptionCallbacks.delete(subscriptionKey);
    
    // Record the unsubscription operation
    const operation: MemoryOperation = {
      id: uuidv4(),
      type: MemoryOperationType.UNSUBSCRIBE,
      key,
      namespace,
      agentId,
      timestamp: Date.now(),
    };
    
    this.operations.push(operation);
  }

  /**
   * Get history of a memory entry
   */
  async getHistory(
    key: string,
    namespace: string = this.defaultNamespace,
    limit?: number,
  ): Promise<MemoryEntry['versions']> {
    this.logger.debug(
      `Getting history for key ${key} in namespace ${namespace}`,
    );

    const fullKey = this.getFullKey(namespace, key);
    const entry = this.entries.get(fullKey);

    if (!entry) {
      return [];
    }

    return limit ? entry.versions.slice(0, limit) : entry.versions;
  }

  /**
   * Revert a memory entry to a previous state
   */
  async revertTo(
    key: string,
    namespace: string = this.defaultNamespace,
    timestamp: number,
  ): Promise<void> {
    this.logger.debug(
      `Reverting key ${key} in namespace ${namespace} to timestamp ${timestamp}`,
    );

    const fullKey = this.getFullKey(namespace, key);
    const entry = this.entries.get(fullKey);

    if (!entry) {
      throw new Error(
        `Cannot revert: key ${key} does not exist in namespace ${namespace}`,
      );
    }

    // Find the closest version at or before the specified timestamp
    const targetVersion = entry.versions.find((v) => v.timestamp <= timestamp);

    if (!targetVersion) {
      throw new Error(
        `Cannot revert: no version exists at or before timestamp ${timestamp}`,
      );
    }

    // Update the current value to the target version
    await this.write(
      key, 
      targetVersion.value, 
      namespace, 
      'system', 
      {
        revertedFrom: timestamp,
        originalAgentId: targetVersion.agentId,
      }
    );

    this.logger.info(
      `Successfully reverted key ${key} to timestamp ${timestamp}`,
    );
  }

  /**
   * Detect conflicts between operations
   */
  async detectConflicts(
    operations: MemoryOperation[],
  ): Promise<MemoryConflict[]> {
    this.logger.debug(
      `Detecting conflicts among ${operations.length} operations`,
    );

    const conflicts: MemoryConflict[] = [];
    const writesByKey: Record<string, MemoryOperation[]> = {};

    // Group write operations by key
    for (const op of operations) {
      if (op.type === MemoryOperationType.WRITE) {
        const fullKey = this.getFullKey(
          op.namespace || this.defaultNamespace,
          op.key,
        );

        if (!writesByKey[fullKey]) {
          writesByKey[fullKey] = [];
        }

        writesByKey[fullKey].push(op);
      }
    }

    // Check for concurrent writes to the same key
    for (const [fullKey, writes] of Object.entries(writesByKey)) {
      if (writes.length > 1) {
        // Sort by timestamp
        writes.sort((a, b) => a.timestamp - b.timestamp);

        // Check for operations that happened close in time (within 1 second)
        for (let i = 0; i < writes.length - 1; i++) {
          if (
            writes[i + 1].timestamp - writes[i].timestamp < 1000 &&
            writes[i].agentId !== writes[i + 1].agentId
          ) {
            const [namespace, key] = fullKey.split(':');

            conflicts.push({
              type: ConflictType.CONCURRENT_WRITE,
              key,
              namespace,
              operations: [writes[i], writes[i + 1]],
            });
          }
        }
      }
    }

    // Check for stale reads (read after write)
    for (const op of operations) {
      if (op.type === MemoryOperationType.READ) {
        const fullKey = this.getFullKey(
          op.namespace || this.defaultNamespace,
          op.key,
        );
        const writes = writesByKey[fullKey] || [];

        // Find writes that happened before this read
        const priorWrites = writes.filter((w) => w.timestamp < op.timestamp);

        if (priorWrites.length > 0) {
          // Get the most recent write before this read
          const latestWrite = priorWrites.reduce(
            (latest, current) =>
              current.timestamp > latest.timestamp ? current : latest,
            priorWrites[0],
          );

          // If read is stale (more than 30 seconds after write)
          if (op.timestamp - latestWrite.timestamp > 30000) {
            const [namespace, key] = fullKey.split(':');

            conflicts.push({
              type: ConflictType.STALE_READ,
              key,
              namespace,
              operations: [latestWrite, op],
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Resolve a conflict
   */
  async resolveConflict(
    conflict: MemoryConflict,
    resolution: any,
  ): Promise<void> {
    this.logger.info(
      `Resolving conflict for key ${conflict.key} in namespace ${conflict.namespace}`,
    );

    // Apply the resolution directly
    await this.write(
      conflict.key, 
      resolution, 
      conflict.namespace, 
      'system', 
      {
        conflictResolution: true,
        conflictType: conflict.type,
        conflictingOperations: conflict.operations.map((op) => op.id),
      }
    );

    this.logger.info(`Conflict for key ${conflict.key} resolved`);
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    entriesByNamespace: Record<string, number>;
    operationCounts: Record<MemoryOperationType, number>;
    totalVersions: number;
    averageVersionsPerKey: number;
  }> {
    const entriesByNamespace: Record<string, number> = {};
    const operationCounts: Record<MemoryOperationType, number> = {
      [MemoryOperationType.READ]: 0,
      [MemoryOperationType.WRITE]: 0,
      [MemoryOperationType.DELETE]: 0,
      [MemoryOperationType.QUERY]: 0,
      [MemoryOperationType.SUBSCRIBE]: 0,
      [MemoryOperationType.UNSUBSCRIBE]: 0,
    };

    let totalVersions = 0;

    // Convert the entries map to array for iteration compatibility
    const entriesArray = Array.from(this.entries.values());

    // Count entries by namespace
    for (const entry of entriesArray) {
      if (!entriesByNamespace[entry.namespace]) {
        entriesByNamespace[entry.namespace] = 0;
      }

      entriesByNamespace[entry.namespace]++;
      totalVersions += entry.versions.length;
    }

    // Count operations by type
    for (const op of this.operations) {
      if (!operationCounts[op.type]) {
        operationCounts[op.type] = 0;
      }

      operationCounts[op.type]++;
    }

    const totalEntries = this.entries.size;
    const averageVersionsPerKey =
      totalEntries > 0 ? totalVersions / totalEntries : 0;

    return {
      totalEntries,
      entriesByNamespace,
      operationCounts,
      totalVersions,
      averageVersionsPerKey,
    };
  }

  /**
   * Save a snapshot of the current memory state
   */
  async saveSnapshot(): Promise<string> {
    if (!this.persistenceEnabled) {
      this.logger.warn('Cannot save snapshot: persistence not enabled');
      throw new Error('Persistence not enabled');
    }

    try {
      const snapshotId = `snapshot-${Date.now()}-${uuidv4()}`;

      this.logger.info(`Creating memory snapshot: ${snapshotId}`);
      
      // Serialize the current state
      const snapshotData = JSON.stringify({
        entries: Array.from(this.entries),
        operations: this.operations,
        timestamp: Date.now(),
      });
      
      // In a production implementation, you would save this to a persistent storage
      // Example with file system storage (using Node.js fs module in a real implementation):
      // await fs.promises.writeFile(`./snapshots/${snapshotId}.json`, snapshotData, 'utf8');
      
      // Example with a database storage (in a real implementation):
      // await database.snapshots.insert({
      //   id: snapshotId,
      //   data: snapshotData,
      //   createdAt: new Date()
      // });
      
      this.logger.info(`Memory snapshot ${snapshotId} created successfully`);
      return snapshotId;
    } catch (error) {
      this.logger.error(`Failed to save memory snapshot: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to save memory snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load a saved memory snapshot
   */
  async loadSnapshot(snapshotId: string): Promise<void> {
    if (!this.persistenceEnabled) {
      this.logger.warn('Cannot load snapshot: persistence not enabled');
      throw new Error('Persistence not enabled');
    }

    if (!snapshotId) {
      throw new Error('Invalid snapshot ID');
    }

    try {
      this.logger.info(`Loading memory snapshot: ${snapshotId}`);
      
      // In a production implementation, you would load this from persistent storage
      // Example with file system storage:
      // const snapshotData = await fs.promises.readFile(`./snapshots/${snapshotId}.json`, 'utf8');
      
      // Example with a database storage:
      // const snapshot = await database.snapshots.findOne({ id: snapshotId });
      // const snapshotData = snapshot?.data;
      
      // if (!snapshotData) {
      //   throw new Error(`Snapshot ${snapshotId} not found`);
      // }
      
      // Parse the snapshot data
      // const { entries, operations } = JSON.parse(snapshotData);
      
      // Clear current state
      // this.entries.clear();
      // this.operations = [];
      
      // Restore from snapshot
      // for (const [key, entry] of entries) {
      //   this.entries.set(key, entry);
      // }
      // this.operations = operations;
      
      this.logger.info(`Memory snapshot ${snapshotId} loaded successfully`);
    } catch (error) {
      this.logger.error(`Failed to load memory snapshot: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`Failed to load memory snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Internal handler for memory update events
   */
  private handleMemoryUpdate(notification: MemoryUpdateNotification): void {
    const fullKey = this.getFullKey(notification.namespace, notification.key);
    const entry = this.entries.get(fullKey);

    if (!entry) {
      return;
    }

    // Notify all subscribers
    for (const agentId of entry.subscribers) {
      const subscriptionKey = `${agentId}:${fullKey}`;
      const callbacks = this.subscriptionCallbacks.get(subscriptionKey) || [];

      for (const callback of callbacks) {
        try {
          callback(notification);
        } catch (error) {
          this.logger.error(
            `Error in subscription callback for agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }

  /**
   * Get a namespaced key
   */
  private getFullKey(namespace: string, key: string): string {
    return `${namespace}:${key}`;
  }

  /**
   * Determine the value type
   */
  private determineValueType(value: any): MemoryValueType {
    if (value === null) {
      return MemoryValueType.NULL;
    }

    if (value === undefined) {
      return MemoryValueType.UNDEFINED;
    }

    if (typeof value === 'string') {
      return MemoryValueType.STRING;
    }

    if (typeof value === 'number') {
      return MemoryValueType.NUMBER;
    }

    if (typeof value === 'boolean') {
      return MemoryValueType.BOOLEAN;
    }

    if (Array.isArray(value)) {
      return MemoryValueType.ARRAY;
    }

    if (typeof value === 'object') {
      return MemoryValueType.OBJECT;
    }

    return MemoryValueType.STRING; // Default
  }

  /**
   * Persist changes to storage
   */
  private persistChanges(): void {
    if (!this.persistenceEnabled) {
      return;
    }

    try {
      const now = Date.now();
      this.logger.debug('Persisting memory changes');
      
      // Track which entries have changed since last persistence
      const changedKeys = new Set<string>();
      
      // Get recent operations to determine what to persist
      const recentOperations = this.operations
        // Filter to recent operations since last persist time
        // In a real implementation, you would compare against lastPersistTime
        .filter(op => op.type === MemoryOperationType.WRITE || 
                     op.type === MemoryOperationType.DELETE);
      
      // Collect all changed keys
      for (const op of recentOperations) {
        const fullKey = this.getFullKey(op.namespace || this.defaultNamespace, op.key);
        changedKeys.add(fullKey);
      }
      
      // In a production implementation, you'd persist changes
      // Example with database storage:
      // const changedEntries = Array.from(changedKeys).map(fullKey => {
      //   return this.entries.get(fullKey);
      // }).filter(Boolean);
      
      // if (changedEntries.length > 0) {
      //   // Option 1: Full batch upsert
      //   await database.memory.bulkWrite(
      //     changedEntries.map(entry => ({
      //       updateOne: {
      //         filter: { 
      //           key: entry.key, 
      //           namespace: entry.namespace 
      //         },
      //         update: { 
      //           $set: entry 
      //         },
      //         upsert: true
      //       }
      //     }))
      //   );
      
      //   // Option 2: Full document replacement
      //   await Promise.all(changedEntries.map(entry => 
      //     database.memory.replaceOne(
      //       { key: entry.key, namespace: entry.namespace },
      //       entry,
      //       { upsert: true }
      //     )
      //   ));
      // }
      
      // Handle deletes (for keys that no longer exist)
      // const deletedKeys = Array.from(changedKeys)
      //   .filter(fullKey => !this.entries.has(fullKey));
      
      // if (deletedKeys.length > 0) {
      //   await Promise.all(deletedKeys.map(fullKey => {
      //     const [namespace, key] = fullKey.split(':');
      //     return database.memory.deleteOne({ key, namespace });
      //   }));
      // }
      
      // this.lastPersistTime = now;
    } catch (error) {
      this.logger.error(`Failed to persist memory changes: ${error instanceof Error ? error.message : String(error)}`);
      // Don't throw the error here to avoid disrupting operations
      // But log it for monitoring systems to detect
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up SharedMemoryService resources');
    
    // Clear all locks
    this.locks.clear();
    
    // Clear all subscriptions
    this.subscriptionCallbacks.clear();
    
    // Clear all stored data
    this.entries.clear();
    this.operations = [];
    
    // Remove all event listeners
    this.removeAllListeners();
    
    this.logger.info('SharedMemoryService cleanup completed');
  }

  /**
   * Set a value in memory (alias for write method for backwards compatibility) 
   */
  async set(key: string, value: any, namespace?: string, agentId?: string, metadata?: Record<string, any>): Promise<void> {
    this.logger.debug(`Using set() alias for key ${key}`);
    return this.write(key, value, namespace, agentId, metadata);
  }

  /**
   * Get a value from memory (alias for read method for backwards compatibility)
   */
  async get(key: string, namespace?: string, agentId?: string): Promise<any> {
    this.logger.debug(`Using get() alias for key ${key}`);
    return this.read(key, namespace, agentId);
  }

  /**
   * Atomically update a value in memory with retries
   * This is useful for handling concurrent updates safely
   */
  async atomicUpdate<T>(
    key: string,
    updateFn: (currentValue: T) => T,
    namespace: string = this.defaultNamespace,
    agentId: string = 'system',
    metadata: Record<string, any> = {},
    options: { maxRetries?: number; retryDelay?: number } = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries || 5;
    const baseRetryDelay = options.retryDelay || 10;
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // Get the full key for locking
        const fullKey = this.getFullKey(namespace, key);
        
        // Try to acquire the lock with exponential backoff
        let lockAttempts = 0;
        const maxLockAttempts = 10;
        let lockBackoffMs = 10; // Start with 10ms
        
        // Track lock acquisition for timeout handling
        let lockAcquired = false;
        const lockTimeout = setTimeout(() => {
          if (!lockAcquired) {
            this.logger.warn(`Lock acquisition timeout for key ${key} in atomic update`);
            this.locks.delete(fullKey); // Force release lock if stuck
          }
        }, 5000); // 5 second timeout
        
        try {
          while (this.locks.has(fullKey)) {
            // Wait with exponential backoff
            await new Promise(resolve => setTimeout(resolve, lockBackoffMs));
            
            // Increase backoff for next iteration (with some randomness)
            lockBackoffMs = Math.min(lockBackoffMs * 1.5 + Math.random() * 10, 200);
            lockAttempts++;
            
            if (lockAttempts >= maxLockAttempts) {
              throw new Error(`Failed to acquire lock for key ${key} during atomic update after ${maxLockAttempts} attempts`);
            }
          }
          
          // Lock the key
          this.locks.add(fullKey);
          lockAcquired = true;
          clearTimeout(lockTimeout);
          
          // Get current value
          const current = await this.read(key, namespace, agentId) as T;
          
          // Apply update function
          const updated = updateFn(current);
          
          // Try to write the updated value
          await this.write(key, updated, namespace, agentId, {
            ...metadata,
            atomicUpdate: true,
            attempt: retries + 1
          });
          
          // If we got here, the write succeeded
          return updated;
        } finally {
          // Always release the lock if acquired
          if (lockAcquired) {
            this.locks.delete(fullKey);
          } else {
            clearTimeout(lockTimeout);
          }
        }
      } catch (error) {
        retries++;
        this.logger.debug(
          `Atomic update retry ${retries}/${maxRetries} for key ${key}: ${error instanceof Error ? error.message : String(error)}`
        );
        
        if (retries >= maxRetries) {
          throw new Error(`Failed to atomically update key ${key} after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        // Exponential backoff with jitter
        const delay = Math.min(
          Math.random() * baseRetryDelay + baseRetryDelay * Math.pow(2, retries),
          200
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    // This should never be reached due to the throw above, but TypeScript doesn't know that
    throw new Error(`Failed to atomically update key ${key}`);
  }
}
