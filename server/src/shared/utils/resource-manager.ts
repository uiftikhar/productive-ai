import { Logger } from '../logger/logger.interface';
import { ConsoleLogger } from '../logger/console-logger';

/**
 * Type for cleanup functions registered with the resource manager
 * Can be synchronous or asynchronous
 */
export type CleanupFunction = () => void | Promise<void>;

/**
 * Resource registration options
 */
export interface ResourceRegistrationOptions {
  /** Priority of the cleanup function (higher numbers are cleaned up first) */
  priority?: number;
  /** Description of the resource (for logging) */
  description?: string;
}

/**
 * Interface for a registered resource
 */
interface RegisteredResource {
  /** The cleanup function to call */
  cleanup: CleanupFunction;
  /** Priority of the cleanup (higher numbers are cleaned up first) */
  priority: number;
  /** Name of the service or resource */
  name: string;
  /** Description of the resource */
  description?: string;
}

/**
 * Singleton service that manages resource cleanup across the application
 * Services can register their cleanup functions with this manager
 * During application shutdown, all registered cleanup functions will be executed
 */
export class ResourceManager {
  private static instance: ResourceManager;
  private resources: RegisteredResource[] = [];
  private logger: Logger;
  private isShuttingDown = false;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
    this.logger.debug('ResourceManager initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(logger?: Logger): ResourceManager {
    if (!ResourceManager.instance) {
      ResourceManager.instance = new ResourceManager(logger);
    }
    return ResourceManager.instance;
  }

  /**
   * Register a cleanup function with the resource manager
   * @param name Name of the service or resource
   * @param cleanupFn Function to call during cleanup
   * @param options Optional registration options
   */
  public register(
    name: string,
    cleanupFn: CleanupFunction,
    options: ResourceRegistrationOptions = {},
  ): void {
    if (this.isShuttingDown) {
      this.logger.warn(`Cannot register resource "${name}" during shutdown`);
      return;
    }

    this.resources.push({
      cleanup: cleanupFn,
      priority: options.priority || 0,
      name,
      description: options.description,
    });

    this.logger.debug(
      `Registered resource for cleanup: ${name}${options.description ? ` (${options.description})` : ''}`,
    );
  }

  /**
   * Unregister a cleanup function
   * @param name Name of the service or resource to unregister
   */
  public unregister(name: string): void {
    const initialLength = this.resources.length;
    this.resources = this.resources.filter(
      (resource) => resource.name !== name,
    );

    if (initialLength !== this.resources.length) {
      this.logger.debug(`Unregistered resource: ${name}`);
    }
  }

  /**
   * Shut down all registered resources in order of priority
   */
  public async shutdownAll(): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.logger.info(
      `Starting shutdown of ${this.resources.length} registered resources`,
    );

    // Sort resources by priority (higher priority first)
    const sortedResources = [...this.resources].sort(
      (a, b) => b.priority - a.priority,
    );

    const errors: Error[] = [];

    // Shut down resources one by one
    for (const resource of sortedResources) {
      try {
        this.logger.debug(`Shutting down: ${resource.name}`);
        const result = resource.cleanup();

        // Handle async cleanup functions
        if (result instanceof Promise) {
          await result;
        }

        this.logger.debug(`Successfully shut down: ${resource.name}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Error shutting down ${resource.name}: ${errorMessage}`,
        );
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.resources = [];
    this.isShuttingDown = false;

    if (errors.length > 0) {
      this.logger.warn(`Completed shutdown with ${errors.length} errors`);
    } else {
      this.logger.info('All resources shut down successfully');
    }
  }

  /**
   * Get the count of registered resources
   */
  public getResourceCount(): number {
    return this.resources.length;
  }
}
