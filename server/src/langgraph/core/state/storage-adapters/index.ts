/**
 * Storage adapters for persistent state management
 */

// Export the storage adapter interface
export * from './storage-adapter.interface';

// Export concrete implementations
export * from './memory-storage.adapter';
export * from './file-storage.adapter';
export * from './mongo-storage.adapter'; 