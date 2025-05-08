# Persistence Layer & Modern API Structure

This document outlines the implementation of the persistence layer and API modernization for the LangGraph system.

## Key Components

### 1. FileStorageAdapter

The `FileStorageAdapter` provides a robust file-based persistence mechanism for storing graph states and sessions. It includes:

- Configurable storage directory
- Session expiration management
- Optional compression using gzip
- Error handling and logging

The adapter is used to:
- Save graph state during execution
- Load persistent state across server restarts
- Manage automatic cleanup of expired sessions

### 2. SessionManager

The `SessionManager` provides higher-level session management capabilities using the `FileStorageAdapter`. It handles:

- Session creation and management
- In-memory caching for faster access
- Automatic session cleanup
- State tracking and expiration

### 3. Enhanced Dynamic Graph Service

The `EnhancedDynamicGraphService` extends the base `DynamicGraphService` with:

- Integration with persistence layer
- Event emission for graph execution
- Node and edge tracking
- Streaming capabilities
- Modern API structure

## API Modernization

### Standardizing on Invoke Method

The implementation standardizes on the `invoke()` method for consistency with modern LangGraph versions:

- All executions use `invoke()` instead of `execute()`
- Backward compatibility is maintained through fallback mechanisms
- Method signatures and return types are properly typed

### Streaming API

A streaming API has been added to support real-time updates:

- `streamInvoke()` method for streaming execution
- Support for different streaming modes (updates, values, steps)
- Back-pressure handling through the StreamController
- Event-based progress tracking

### Type Improvements

- Enhanced typing for all components
- Proper handling of null states and arrays
- Type safety with proper casting

## Usage Examples

### Basic Usage with Persistence

```typescript
// Create storage adapter
const storageAdapter = new FileStorageAdapter({
  storageDir: storageConfig.graphState.dir
});

// Create graph service with storage
const graphService = new EnhancedDynamicGraphService({
  initialNodes,
  initialEdges,
  storageAdapter
});

// Create graph
const graph = graphService.createEnhancedGraph();

// Execute with session tracking
const result = await graph.invoke({
  sessionId: 'my-session-id',
  // other state properties
});
```

### Streaming Execution

```typescript
// Execute with streaming
for await (const update of graph.streamInvoke(initialState, {
  mode: 'updates',
  includeNodeDetails: true,
  persistInterval: 1000 // 1 second
})) {
  console.log(`Update type: ${update.type}`);
  
  if (update.type === 'nodeComplete') {
    console.log(`Node completed: ${update.nodeId}`);
  }
}
```

### Event Handling

```typescript
// Add event listeners
graph.on('nodeStart', (data) => {
  console.log(`Node started: ${data.id}`);
});

graph.on('progressUpdate', (data) => {
  console.log(`Progress: ${data.progress}%`);
});

graph.on('graphComplete', (data) => {
  console.log('Graph execution completed');
});
```

## Integration with Existing Systems

The persistence layer is designed to integrate with:

1. Chat controllers and API endpoints
2. WebSocket implementations for real-time updates
3. Existing graph definitions and workflows
4. Monitoring and observability systems

## Next Steps

- Add WebSocket support for streaming to clients
- Implement advanced analytics for graph execution
- Add more specialized storage adapters (Redis, MongoDB, etc.)
- Enhance visualization capabilities 