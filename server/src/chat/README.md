# Chat Service

This directory contains the core chat functionality for Productive AI, including the chat service, models, middleware, and related utilities.

## Overview

The chat service provides real-time communication capabilities, user presence tracking, message persistence, and integration with various AI capabilities. It serves as a central component of the Productive AI platform, enabling users to interact with each other and with AI agents.

## Key Components

### ChatService

The `ChatService` is the main class responsible for handling chat operations, including:

- Message sending and receiving
- User presence management
- Conversation history retrieval
- Integration with AI agents
- Message parsing and formatting
- Real-time notifications

### Chat Middleware

The chat system includes various middleware components:

- **Input Sanitization**: Sanitizes user input to prevent XSS attacks
- **Rate Limiting**: Prevents abuse of the chat API
- **Authentication**: Verifies user identity and permissions
- **Message Formatting**: Processes and formats messages consistently

## Resource Management

The chat service implements robust resource management to prevent memory leaks and ensure proper cleanup of background processes.

### ChatService Cleanup

The `ChatService` includes a cleanup method that properly releases resources when the service is no longer needed:

```typescript
public cleanup(): void {
  if (this.presenceUpdateInterval) {
    clearInterval(this.presenceUpdateInterval);
    this.presenceUpdateInterval = undefined;
    this.logger.info('ChatService resources cleaned up');
  }
}
```

This method:
1. Checks if there's an active presence update interval
2. Clears the interval if it exists
3. Sets the reference to undefined to allow garbage collection
4. Logs the cleanup action for debugging purposes

### Timer Management

The ChatService uses background timers for tasks like presence updates. These timers now use the `unref()` method to ensure they don't prevent the Node.js process from exiting:

```typescript
this.presenceUpdateInterval = setInterval(() => {
  this.updatePresenceStatus();
}, 60000).unref();
```

This ensures that the application can exit cleanly even if the timer is still registered.

## ConversationIndexingService

The `ConversationIndexingService` is responsible for indexing conversations for searching and retrieval, and also implements proper resource management:

```typescript
public cleanup(): void {
  if (this.refreshTimer) {
    clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    this.logger.info('ConversationIndexingService resources cleaned up');
  }
}
```

## Best Practices

When using the chat service:

1. **Proper Initialization**: Always initialize the chat service with appropriate configuration options.

2. **Error Handling**: Implement proper error handling when interacting with the chat service.

3. **Resource Cleanup**: Call the cleanup method when the service is no longer needed.
   ```typescript
   // When shutting down the application
   chatService.cleanup();
   ```

4. **Performance Optimization**: Use the caching and optimization features provided by the chat service.

5. **Security**: Always use the input sanitization middleware to prevent security vulnerabilities.

## Performance Considerations

The chat service is optimized for performance in several ways:

- Efficient presence tracking that minimizes database queries
- Message caching to reduce database load
- Query optimization for conversation history retrieval
- Pagination for large result sets
- Background processing for resource-intensive operations

## Testing

The chat service includes comprehensive tests covering:

- Unit tests for individual methods
- Integration tests for service interactions
- Load tests for performance validation

Run chat service tests with:

```
npm test -- src/chat
```

To check for resource leaks:

```
npm test -- src/chat --detectOpenHandles
``` 