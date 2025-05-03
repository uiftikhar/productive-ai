/**
 * State Manager for the Agentic Meeting Analysis System
 *
 * Provides a simplified interface for accessing and manipulating state
 * in the agentic meeting analysis system.
 */
import { EventEmitter } from 'events';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * Configuration options for StateManager
 */
export interface StateManagerConfig {
  logger?: Logger;
  persistenceEnabled?: boolean;
}

/**
 * State Manager implementation
 */
export class StateManager extends EventEmitter {
  private stateStore: Map<string, any> = new Map();
  private logger: Logger;
  private persistenceEnabled: boolean;

  /**
   * Create a new state manager
   */
  constructor(config: StateManagerConfig = {}) {
    super();

    this.logger = config.logger || new ConsoleLogger();
    this.persistenceEnabled = config.persistenceEnabled || false;

    this.logger.info('Initialized StateManager');
  }

  /**
   * Initialize the state manager
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing state manager');

    if (this.persistenceEnabled) {
      try {
        // Load persisted states (implementation would be added here)
        this.logger.info('Persistence enabled, loading saved state');
      } catch (error) {
        this.logger.warn(
          `Failed to load persisted states: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.info('State manager initialized');
  }

  /**
   * Get state for a specific key
   */
  async getState(key: string): Promise<any> {
    this.logger.debug(`Getting state for key ${key}`);

    return this.stateStore.get(key);
  }

  /**
   * Set state for a specific key
   */
  async setState(key: string, value: any): Promise<void> {
    this.logger.debug(`Setting state for key ${key}`);

    const oldValue = this.stateStore.get(key);
    this.stateStore.set(key, value);

    // Emit change event
    this.emit('stateChange', {
      key,
      oldValue,
      newValue: value,
      timestamp: Date.now(),
    });

    // Persist if enabled
    if (this.persistenceEnabled) {
      this.persistState();
    }
  }

  /**
   * Update state for a specific key
   */
  async updateState(key: string, updates: Partial<any>): Promise<void> {
    this.logger.debug(`Updating state for key ${key}`);

    const currentValue = this.stateStore.get(key);

    if (!currentValue) {
      // If no existing value, just set it
      await this.setState(key, updates);
      return;
    }

    // Merge updates with current value
    const updatedValue = {
      ...currentValue,
      ...updates,
    };

    await this.setState(key, updatedValue);
  }

  /**
   * Delete state for a specific key
   */
  async deleteState(key: string): Promise<boolean> {
    this.logger.debug(`Deleting state for key ${key}`);

    const exists = this.stateStore.has(key);

    if (exists) {
      const oldValue = this.stateStore.get(key);
      this.stateStore.delete(key);

      // Emit change event
      this.emit('stateChange', {
        key,
        oldValue,
        newValue: undefined,
        timestamp: Date.now(),
      });

      // Persist if enabled
      if (this.persistenceEnabled) {
        this.persistState();
      }
    }

    return exists;
  }

  /**
   * Check if state exists for a key
   */
  async hasState(key: string): Promise<boolean> {
    return this.stateStore.has(key);
  }

  /**
   * Get all keys in the state store
   */
  async getAllKeys(): Promise<string[]> {
    return Array.from(this.stateStore.keys());
  }

  /**
   * Persist all state to storage
   */
  private async persistState(): Promise<void> {
    if (!this.persistenceEnabled) return;

    this.logger.debug('Persisting state');

    try {
      // Implementation of state persistence would go here
    } catch (error) {
      this.logger.error(
        `Failed to persist state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
