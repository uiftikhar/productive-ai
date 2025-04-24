import { ResourceManager } from './resource-manager';

describe('ResourceManager', () => {
  let resourceManager: ResourceManager;

  beforeEach(() => {
    // Reset the singleton instance before each test
    // @ts-ignore accessing private property for testing
    ResourceManager.instance = undefined;
    resourceManager = ResourceManager.getInstance();
  });

  it('should register resources', () => {
    const cleanupFn = jest.fn();
    resourceManager.register('test-resource', cleanupFn);

    expect(resourceManager.getResourceCount()).toBe(1);
  });

  it('should unregister resources', () => {
    const cleanupFn = jest.fn();
    resourceManager.register('test-resource', cleanupFn);
    expect(resourceManager.getResourceCount()).toBe(1);

    resourceManager.unregister('test-resource');
    expect(resourceManager.getResourceCount()).toBe(0);
  });

  it('should execute cleanup functions in priority order', async () => {
    const order: number[] = [];

    // Register resources with different priorities
    resourceManager.register(
      'low-priority',
      () => {
        order.push(3);
      },
      { priority: 10 },
    );
    resourceManager.register(
      'high-priority',
      () => {
        order.push(1);
      },
      { priority: 100 },
    );
    resourceManager.register(
      'medium-priority',
      () => {
        order.push(2);
      },
      { priority: 50 },
    );

    await resourceManager.shutdownAll();

    // Resources should be shut down in order of priority (high to low)
    expect(order).toEqual([1, 2, 3]);
    expect(resourceManager.getResourceCount()).toBe(0);
  });

  it('should handle errors during cleanup', async () => {
    const successFn = jest.fn();
    const errorFn = jest.fn().mockImplementation(() => {
      throw new Error('Cleanup failed');
    });

    resourceManager.register('success-resource', successFn, { priority: 10 });
    resourceManager.register('error-resource', errorFn, { priority: 20 });

    await resourceManager.shutdownAll();

    // Both cleanup functions should be called, despite one throwing an error
    expect(successFn).toHaveBeenCalled();
    expect(errorFn).toHaveBeenCalled();
    expect(resourceManager.getResourceCount()).toBe(0);
  });

  it('should handle async cleanup functions', async () => {
    const order: number[] = [];
    const asyncCleanup = jest.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      order.push(1);
    });
    const syncCleanup = jest.fn().mockImplementation(() => {
      order.push(2);
    });

    resourceManager.register('async-resource', asyncCleanup, { priority: 20 });
    resourceManager.register('sync-resource', syncCleanup, { priority: 10 });

    await resourceManager.shutdownAll();

    // Resources should be shut down in order of priority regardless of sync/async
    expect(order).toEqual([1, 2]);
    expect(asyncCleanup).toHaveBeenCalled();
    expect(syncCleanup).toHaveBeenCalled();
  });

  it('should not register resources during shutdown', async () => {
    // Create a cleanup function that attempts to register another resource
    const cleanupFn = jest.fn().mockImplementation(() => {
      resourceManager.register('late-resource', jest.fn());
    });

    resourceManager.register('test-resource', cleanupFn);

    // Start the shutdown process
    const shutdownPromise = resourceManager.shutdownAll();

    // Verify the behavior after shutdown completes
    await shutdownPromise;

    // The late registration should have been rejected
    expect(resourceManager.getResourceCount()).toBe(0);
  });
});
