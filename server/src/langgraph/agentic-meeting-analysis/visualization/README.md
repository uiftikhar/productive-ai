# Meeting Analysis Visualization Module

## Overview

This module provides real-time visualization capabilities for the hierarchical agent meeting analysis system. It allows users to observe the interactions between different agents, the tasks they perform, and the results they generate during the analysis of meeting transcripts.

## Key Components

### AgentGraphVisualizationService

The core service that maintains the graph structure of agent interactions and activities. It:

- Creates and manages nodes representing agents, tasks, topics, and other entities
- Establishes connections between nodes to represent relationships and communications
- Broadcasts state changes to clients via WebSocket
- Generates static HTML visualizations for persistence

### TopicVisualizationService

A specialized service for visualizing topic relationships and hierarchies extracted from meeting transcripts.

## Architecture

The visualization system follows a reactive architecture:

1. Events from the agent system (messages, task assignments, results) trigger updates to the graph
2. Graph updates are broadcasted to connected clients in real-time
3. Clients render the graph using React Flow
4. Static snapshots can be generated at key points for later reference

## Data Model

### Graph Elements

- **Nodes**: Represent entities like agents, tasks, topics, action items
  - Each node has a type, label, state, and custom properties
  - Node state (active, inactive, highlighted, selected) reflects its current status

- **Connections**: Represent relationships between nodes
  - Types include communication, collaboration, assignment, dependency
  - Can be animated to show real-time activity
  - Can be temporary or permanent

### WebSocket Protocol

The WebSocket server uses a simple JSON-based protocol:

```json
// Client subscription
{
  "type": "subscribe",
  "runId": "session-123"
}

// Server state update
{
  "type": "stateUpdate",
  "runId": "session-123",
  "state": {
    "nodes": [...],
    "edges": [...]
  },
  "timestamp": "2023-11-10T12:34:56.789Z"
}
```

## Integration Points

### ServiceRegistry

The visualization services are registered with the ServiceRegistry to make them accessible throughout the application.

### MeetingAnalysisController

The controller initializes visualization, tracks agent communications, and updates visualization with analysis results.

### MessageStore

The visualization connects to the message store to monitor agent communications.

## Implementation Details

### Node Types

1. **Agent Nodes**: Represent supervisor, manager, and worker agents with their expertise and roles
2. **Task Nodes**: Represent specific tasks assigned between agents
3. **Topic Nodes**: Key discussion topics identified in the meeting
4. **Action Item Nodes**: Tasks that need to be done after the meeting
5. **Result Nodes**: Final analysis outputs (summaries, topic collections, etc.)

### Positioning Algorithm

Nodes are positioned automatically using a simplified force-directed layout:
- Supervisor at the top center
- Managers in a row below
- Workers distributed below managers
- Results and insights arranged around the periphery

### Scaling Considerations

For very large agent teams or complex analyses:
- Graph can be filtered by node type or agent
- Graph can be zoomed and panned to focus on areas of interest
- Performance is maintained by limiting animations and using efficient data structures

## Usage

### Initialization

```typescript
// Register the service
const visualizationService = new AgentGraphVisualizationService({
  logger,
  enableRealTimeUpdates: true
});
serviceRegistry.registerAgentVisualizationService(visualizationService);

// Initialize for a session
visualizationService.initializeVisualization(sessionId, team);
```

### Tracking Communications

```typescript
// Add a communication event
visualizationService.addCommunicationEvent(
  sessionId,
  sourceAgentId,
  targetAgentId,
  MessageType.TASK,
  taskContent
);
```

### Adding Results

```typescript
// Add analysis results
visualizationService.addResultNode(
  sessionId,
  'summary',
  summaryContent,
  generatorAgentId
);
```

## Future Enhancements

1. **Persistent Storage**: Save graph state to database for recovery after server restart
2. **Advanced Layouts**: Implement more sophisticated graph layout algorithms
3. **Filtering Controls**: Add client-side controls to filter by node type or time
4. **Recording/Playback**: Record the evolution of the graph for later playback
5. **Agent Reasoning Visualization**: Visualize the reasoning process within individual agents 