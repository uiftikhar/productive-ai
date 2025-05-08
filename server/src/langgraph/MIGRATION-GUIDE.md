# Migration Guide: Enhanced Dynamic Graph Service

This guide provides instructions for migrating existing graph implementations to use the new `EnhancedDynamicGraphService` with persistence and streaming capabilities.

## Overview of Changes

1. The `EnhancedDynamicGraphService` now includes:
   - Persistence layer integration
   - Streaming capabilities
   - Consistent API using `invoke()`
   - Better typing and null checking

2. Added components:
   - `FileStorageAdapter` for state persistence
   - `SessionManager` for session tracking
   - Streaming capabilities for real-time updates

## Step-by-Step Migration Guide

### 1. Update Import Statements

**Before:**
```typescript
import { DynamicGraphService } from '../../langgraph/dynamic/dynamic-graph.service';
```

**After:**
```typescript
import { EnhancedDynamicGraphService } from '../../langgraph/dynamic/enhanced-dynamic-graph.service';
import { FileStorageAdapter } from '../../shared/storage/file-storage-adapter';
import { storageConfig } from '../../config/storage.config';
```

### 2. Update Graph Creation

**Before:**
```typescript
const graphService = new DynamicGraphService({
  initialNodes,
  initialEdges,
  logger
});

const graph = graphService.createGraph();
```

**After:**
```typescript
// Create storage adapter
const storageAdapter = new FileStorageAdapter({
  storageDir: storageConfig.graphState.dir,
  logger
});

// Create graph service
const graphService = new EnhancedDynamicGraphService({
  initialNodes,
  initialEdges,
  storageAdapter,
  logger
});

// Create enhanced graph
const graph = graphService.createEnhancedGraph();
```

### 3. Update Graph Execution

**Before:**
```typescript
const result = await graphService.execute(initialState);
```

**After:**
```typescript
// Option 1: Direct execution
const result = await graphService.invoke(initialState);

// Option 2: Using the enhanced graph
const result = await graph.invoke(initialState);

// Option 3: Streaming execution
for await (const update of graph.streamInvoke(initialState)) {
  // Process updates
}
```

### 4. Add Event Listeners (Optional)

```typescript
// Add event listeners for progress tracking
graph.on('nodeStart', (data) => {
  console.log(`Starting node: ${data.id}`);
});

graph.on('nodeComplete', (data) => {
  console.log(`Completed node: ${data.id}`);
});

graph.on('progressUpdate', (data) => {
  console.log(`Progress: ${data.progress}%`);
});

graph.on('graphComplete', (data) => {
  console.log('Graph execution completed');
});
```

### 5. Add Session Tracking (Optional)

```typescript
// Create a session manager
const sessionManager = new SessionManager({
  storageAdapter,
  logger
});

// Create a session
const sessionId = await sessionManager.createSession({
  graph,
  initialState,
  metadata: { /* session metadata */ }
});

// Execute with session ID
const result = await graph.invoke({
  ...initialState,
  sessionId
});

// Get session status
const sessionStatus = await sessionManager.getSessionStatus(sessionId);
```

### 6. Update State Types

Ensure your state types extend `EnhancedDynamicGraphState` instead of `DynamicGraphState`.

**Before:**
```typescript
export interface MyGraphState extends DynamicGraphState {
  // Custom state properties
}
```

**After:**
```typescript
export interface MyGraphState extends EnhancedDynamicGraphState {
  // Custom state properties
}
```

### 7. Update Node and Edge Types

For enhanced functionality, update your node and edge types:

**Before:**
```typescript
const node: DynamicGraphNode = { /* ... */ };
const edge: DynamicGraphEdge = { /* ... */ };
```

**After:**
```typescript
const node: EnhancedGraphNode = { /* ... */ };
const edge: EnhancedGraphEdge = { /* ... */ };
```

## Examples

### Example 1: Basic Migration

```typescript
// Create storage adapter
const storageAdapter = new FileStorageAdapter({
  storageDir: path.join(__dirname, '../../data/graph-state'),
});

// Create graph service
const graphService = new EnhancedDynamicGraphService({
  initialNodes,
  initialEdges,
  storageAdapter,
});

// Create enhanced graph
const graph = graphService.createEnhancedGraph();

// Execute the graph
const result = await graph.invoke(initialState);
```

### Example 2: Streaming with Progress Updates

```typescript
// Set up progress tracking
let progress = 0;
graph.on('progressUpdate', (data) => {
  progress = data.progress;
  console.log(`Progress: ${progress}%`);
});

// Execute with streaming
for await (const update of graph.streamInvoke(initialState, {
  mode: 'updates',
  includeNodeDetails: true,
})) {
  if (update.type === 'nodeComplete') {
    console.log(`Completed node: ${update.nodeId}`);
  }
}
```

### Example 3: Session Management

```typescript
// Create session manager
const sessionManager = new SessionManager({
  storageAdapter,
});

// Create a session
const sessionId = await sessionManager.createSession({
  graph,
  initialState,
});

// Execute with session tracking
const result = await graph.invoke({
  ...initialState,
  sessionId,
});

// Get session status
const { status, progress } = await sessionManager.getSessionStatus(sessionId);
console.log(`Session ${sessionId}: ${status} (${progress}%)`);
```

## Common Issues and Solutions

### Problem: TypeError: Cannot read properties of undefined (reading 'includes')

**Solution:** The enhanced service now handles null arrays properly. Make sure you're using the latest version.

### Problem: Graph execution does not persist state

**Solution:** Ensure you're providing a sessionId in your state:

```typescript
const result = await graph.invoke({
  ...initialState,
  sessionId: 'your-session-id', // Required for persistence
});
```

### Problem: Event listeners not firing

**Solution:** Make sure you're using createEnhancedGraph() not createGraph():

```typescript
const graph = graphService.createEnhancedGraph(); // Use this
// const graph = graphService.createGraph(); // Not this
```

## Additional Resources

- [Persistence Layer Documentation](./dynamic/PERSISTENCE-IMPLEMENTATION.md)
- [EnhancedDynamicGraphService API Reference](./dynamic/enhanced-dynamic-graph.service.ts) 