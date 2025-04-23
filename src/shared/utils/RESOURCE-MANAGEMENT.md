# Resource Management in Productive AI

This document describes the resource management approach in the Productive AI application, focusing on how we manage system resources, handle cleanup on shutdown, and prevent memory leaks.

## ResourceManager

The `ResourceManager` is a singleton service that centralizes resource cleanup across the application. It allows services to register their cleanup functions, which are then executed in a controlled manner during application shutdown.

### Key Features

- **Centralized Resource Management**: Single point of control for all application resources
- **Priority-Based Cleanup**: Resources can be cleaned up in a specific order based on their priority
- **Error Handling**: Gracefully handles errors during cleanup
- **Asynchronous Support**: Works with both synchronous and asynchronous cleanup functions
- **Logging**: Provides detailed logs for debugging and auditing

### Usage

#### Registering Resources

```typescript
import { ResourceManager } from './shared/utils/resource-manager';

// Get the singleton instance
const resourceManager = ResourceManager.getInstance(logger);

// Register a resource with the manager
resourceManager.register('myService', () => {
  // Cleanup logic here
  clearInterval(this.interval);
  this.connections.clear();
}, {
  priority: 50, // Higher priorities are cleaned up first
  description: 'My service cleanup'
});
```

#### Cleanup During Shutdown

In the main application file:

```typescript
// Handle graceful shutdown
const handleShutdown = async () => {
  logger.info('Shutting down server...');
  
  // Shut down all resources using the ResourceManager
  await resourceManager.shutdownAll();
  
  // Close the HTTP server
  server.close(() => {
    logger.info('Server shutdown complete');
    process.exit(0);
  });
};

// Register signal handlers
process.on('SIGTERM', () => { void handleShutdown(); });
process.on('SIGINT', () => { void handleShutdown(); });
```

## Timer Management with `unref()`

In a Node.js application, timers (created with `setTimeout`, `setInterval`, etc.) can prevent the process from exiting even if there are no other active handles. This can lead to resource leaks and processes that don't terminate properly.

### The `unref()` Method

The `unref()` method tells Node.js that a timer should not prevent the program from exiting:

```typescript
const timer = setInterval(() => {
  // Do something periodically
}, 60000).unref();
```

### Where We Use `unref()`

In our application, we apply `unref()` to the following timers:

1. **ChatService**: For the presence monitoring interval
2. **ConversationIndexingService**: For the index refresh timer
3. **PerformanceMonitor**: For the metrics collection interval
4. **ClassifierConfigService**: For the metrics reporting intervals

## Service Cleanup Methods

To ensure proper resource management and prevent memory leaks, key services in the application now implement dedicated cleanup methods. These methods are responsible for releasing all resources used by the service, such as timers, event listeners, and connections.

### Implemented Cleanup Methods

#### 1. ChatService

```typescript
public cleanup(): void {
  if (this.presenceUpdateInterval) {
    clearInterval(this.presenceUpdateInterval);
    this.presenceUpdateInterval = undefined;
    this.logger.info('ChatService resources cleaned up');
  }
}
```

#### 2. ConversationIndexingService

```typescript
public cleanup(): void {
  if (this.refreshTimer) {
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    this.logger.info('ConversationIndexingService resources cleaned up');
  }
}
```

#### 3. AgentTaskExecutorService

```typescript
public cleanup(): void {
  // Clear all active executions
  for (const [executionId, execution] of this.activeExecutions.entries()) {
    if (execution.timeout) {
      clearTimeout(execution.timeout);
    }
    this.activeExecutions.delete(executionId);
  }
  
  // Remove all event listeners
  this.eventEmitter.removeAllListeners();
  
  // Clear event handlers
  this.eventHandlers.clear();
  
  this.logger.info('AgentTaskExecutorService resources cleaned up');
}
```

### Best Practices for Service Cleanup

1. **Identify All Resources**: List all resources used by the service that require explicit cleanup
2. **Check Before Clearing**: Always check if a resource exists before attempting to clear it
3. **Release All References**: Set references to null/undefined after clearing them
4. **Log Cleanup Actions**: Include logging to confirm cleanup happened successfully
5. **Integrate with ResourceManager**: Register service cleanup methods with the ResourceManager for centralized management

## Best Practices

1. **Always Use `unref()` for Background Tasks**: Any timer that performs background work and shouldn't keep the application running should use `unref()`

2. **Register Cleanup Functions**: All services should register their cleanup functions with the `ResourceManager`

3. **Clean Order Matters**: Consider the dependencies between services when assigning cleanup priorities:
   - Socket services should be cleaned up first (priority 100)
   - Then application services (priorities 50-90)
   - Then low-level infrastructure services (priorities 10-40)

4. **Handle Async Properly**: Always use `await` or `void` with promises to ensure they are properly handled

5. **Implement Service-Specific Cleanup**: Services should implement a `cleanup()` method to handle their own resource management

## Testing Resource Cleanup

We've added a test suite for the `ResourceManager` that verifies:

- Resource registration and unregistration
- Priority-based execution order
- Error handling during cleanup
- Asynchronous cleanup functions
- Prevention of registration during shutdown

You can run these tests with:

```
npm test -- src/shared/utils/resource-manager.test.ts
```

To check for open handles in the application, use the Jest `--detectOpenHandles` flag:

```
npm test -- --detectOpenHandles
```

This will help identify any timers or other resources that might be preventing the application from shutting down properly. 