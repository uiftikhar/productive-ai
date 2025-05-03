/**
 * Memory interfaces for the Agentic Meeting Analysis System
 */
import { EventEmitter } from 'events';

/**
 * Memory operation types
 */
export enum MemoryOperationType {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  QUERY = 'query',
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
}

/**
 * Memory value types
 */
export enum MemoryValueType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  OBJECT = 'object',
  ARRAY = 'array',
  NULL = 'null',
  UNDEFINED = 'undefined',
}

/**
 * Data structure for memory operations
 */
export interface MemoryOperation {
  id: string;
  type: MemoryOperationType;
  key: string;
  namespace?: string;
  value?: any;
  metadata?: Record<string, any>;
  agentId: string;
  timestamp: number;
}

/**
 * Memory entry with versioning
 */
export interface MemoryEntry {
  key: string;
  namespace: string;
  currentValue: any;
  valueType: MemoryValueType;
  versions: {
    value: any;
    timestamp: number;
    agentId: string;
    operation: MemoryOperationType;
    metadata?: Record<string, any>;
  }[];
  created: number;
  lastUpdated: number;
  subscribers: string[]; // Agent IDs subscribed to this entry
}

/**
 * Memory query options
 */
export interface MemoryQueryOptions {
  namespaces?: string[];
  keyPattern?: string | RegExp;
  valueType?: MemoryValueType;
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
  includeHistory?: boolean;
}

/**
 * Memory conflict types
 */
export enum ConflictType {
  CONCURRENT_WRITE = 'concurrent_write',
  STALE_READ = 'stale_read',
  VERSION_MISMATCH = 'version_mismatch',
}

/**
 * Memory conflict description
 */
export interface MemoryConflict {
  type: ConflictType;
  key: string;
  namespace: string;
  operations: MemoryOperation[];
  resolution?: any;
}

/**
 * Memory update notification
 */
export interface MemoryUpdateNotification {
  id: string;
  operation: MemoryOperationType;
  key: string;
  namespace: string;
  newValue: any;
  oldValue?: any;
  agentId: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Meeting analysis shared memory interface
 */
export interface ISharedMemory extends EventEmitter {
  // Core operations
  initialize(): Promise<void>;

  read(key: string, namespace?: string, agentId?: string): Promise<any>;
  write(
    key: string,
    value: any,
    namespace?: string,
    agentId?: string,
    metadata?: Record<string, any>,
  ): Promise<void>;
  delete(key: string, namespace?: string, agentId?: string): Promise<void>;

  // Query and list operations
  query(options: MemoryQueryOptions): Promise<Record<string, any>>;
  listNamespaces(): Promise<string[]>;
  listKeys(namespace?: string, pattern?: string | RegExp): Promise<string[]>;

  // Subscription management
  subscribe(
    key: string,
    namespace: string,
    agentId: string,
    callback: (notification: MemoryUpdateNotification) => void,
  ): void;
  unsubscribe(key: string, namespace: string, agentId: string): void;

  // Version management
  getHistory(
    key: string,
    namespace?: string,
    limit?: number,
  ): Promise<MemoryEntry['versions']>;
  revertTo(key: string, namespace: string, timestamp: number): Promise<void>;

  // Conflict management
  detectConflicts(operations: MemoryOperation[]): Promise<MemoryConflict[]>;
  resolveConflict(conflict: MemoryConflict, resolution: any): Promise<void>;

  // Metadata
  getStats(): Promise<{
    totalEntries: number;
    entriesByNamespace: Record<string, number>;
    operationCounts: Record<MemoryOperationType, number>;
    totalVersions: number;
    averageVersionsPerKey: number;
  }>;

  // Persistence (optional)
  saveSnapshot(): Promise<string>; // Returns snapshot ID
  loadSnapshot(snapshotId: string): Promise<void>;
}
