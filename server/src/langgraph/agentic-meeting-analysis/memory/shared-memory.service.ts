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
        // Load persisted memory (implementation would be added here)
        this.logger.info('Persistence enabled, loading saved memory state');
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
    this.logger.debug(`Writing key ${key} to namespace ${namespace}`);

    const fullKey = this.getFullKey(namespace, key);
    const now = Date.now();
    let entry = this.entries.get(fullKey);
    const valueType = this.determineValueType(value);

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

    let oldValue = null;

    if (entry) {
      // Update existing entry
      oldValue = entry.currentValue;
      entry.currentValue = value;
      entry.valueType = valueType;
      entry.lastUpdated = now;

      // Add version to history
      entry.versions.unshift({
        value,
        timestamp: now,
        agentId,
        operation: MemoryOperationType.WRITE,
        metadata,
      });

      // Trim history if needed
      if (entry.versions.length > this.maxHistoryLength) {
        entry.versions = entry.versions.slice(0, this.maxHistoryLength);
      }
    } else {
      // Create new entry
      entry = {
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

      this.entries.set(fullKey, entry);
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

    for (const [fullKey, entry] of this.entries.entries()) {
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
          history: entry.versions,
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

    for (const entry of this.entries.values()) {
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

    for (const [fullKey, entry] of this.entries.entries()) {
      if (entry.namespace === namespace) {
        if (!regex || regex.test(entry.key)) {
          keys.push(entry.key);
        }
      }
    }

    return keys;
  }

  /**
   * Subscribe to memory changes
   */
  subscribe(
    key: string,
    namespace: string = this.defaultNamespace,
    agentId: string,
    callback: (notification: MemoryUpdateNotification) => void,
  ): void {
    this.logger.debug(
      `Agent ${agentId} subscribing to key ${key} in namespace ${namespace}`,
    );

    const fullKey = this.getFullKey(namespace, key);
    const entry = this.entries.get(fullKey);

    // Add to subscription list
    const subscriptionKey = `${agentId}:${fullKey}`;

    if (!this.subscriptionCallbacks.has(subscriptionKey)) {
      this.subscriptionCallbacks.set(subscriptionKey, []);
    }

    const callbacks = this.subscriptionCallbacks.get(subscriptionKey) || [];
    callbacks.push(callback);
    this.subscriptionCallbacks.set(subscriptionKey, callbacks);

    // Update entry subscription list if it exists
    if (entry && !entry.subscribers.includes(agentId)) {
      entry.subscribers.push(agentId);
    }

    // Record the subscribe operation
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
   * Unsubscribe from memory changes
   */
  unsubscribe(
    key: string,
    namespace: string = this.defaultNamespace,
    agentId: string,
  ): void {
    this.logger.debug(
      `Agent ${agentId} unsubscribing from key ${key} in namespace ${namespace}`,
    );

    const fullKey = this.getFullKey(namespace, key);
    const entry = this.entries.get(fullKey);
    const subscriptionKey = `${agentId}:${fullKey}`;

    // Remove from subscription callbacks
    this.subscriptionCallbacks.delete(subscriptionKey);

    // Update entry subscription list if it exists
    if (entry) {
      entry.subscribers = entry.subscribers.filter((id) => id !== agentId);
    }

    // Record the unsubscribe operation
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
    await this.write(key, targetVersion.value, namespace, 'system', {
      revertedFrom: timestamp,
      originalAgentId: targetVersion.agentId,
    });

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
    await this.write(conflict.key, resolution, conflict.namespace, 'system', {
      conflictResolution: true,
      conflictType: conflict.type,
      conflictingOperations: conflict.operations.map((op) => op.id),
    });

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

    // Count entries by namespace
    for (const entry of this.entries.values()) {
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

    const snapshotId = `snapshot-${Date.now()}-${uuidv4()}`;

    // Implementation would serialize and save the entries map
    // For now, we'll just log the action
    this.logger.info(`Creating memory snapshot: ${snapshotId}`);

    return snapshotId;
  }

  /**
   * Load a saved memory snapshot
   */
  async loadSnapshot(snapshotId: string): Promise<void> {
    if (!this.persistenceEnabled) {
      this.logger.warn('Cannot load snapshot: persistence not enabled');
      throw new Error('Persistence not enabled');
    }

    // Implementation would deserialize and load the entries map
    // For now, we'll just log the action
    this.logger.info(`Loading memory snapshot: ${snapshotId}`);
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
   * Persist changes to storage (stub implementation)
   */
  private persistChanges(): void {
    // This would implement actual persistence to a database or file
    this.logger.debug('Persisting memory changes');
  }
}
