# Agent Visualization System Guide

## Overview

The Agent Visualization System provides real-time visualization of the hierarchical meeting analysis agents and their activities during the analysis process. The system allows users to observe the communication and task delegation between agents, the generation of insights, and the results of the analysis.

## Architecture

The visualization system consists of several components:

1. **AgentGraphVisualizationService**: Core service that manages visualization data and updates
2. **WebSocket Server**: Provides real-time updates to the client
3. **REST API Endpoints**: For fetching graph data and static visualizations
4. **React Client**: Interactive graph visualization using React Flow

### Data Flow

1. Agent activities (communication, task delegation, results) are captured by hooks in the controller
2. The visualization service processes these events and updates the graph model
3. Updates are broadcast via WebSocket to any connected clients
4. The React client renders the graph in real-time using React Flow

## Key Components

### Server Components

#### AgentGraphVisualizationService

This service is responsible for:
- Creating and maintaining the graph structure (nodes and edges)
- Processing agent communications and activities
- Broadcasting updates to connected clients
- Generating static HTML visualizations

#### ServiceRegistry

The ServiceRegistry provides a central location to register and access the visualization service, allowing different parts of the application to contribute to the graph.

#### WebSocket Controller

The visualization controller sets up the WebSocket server and handles client connections, subscriptions, and message broadcasting.

### Client Components

#### AgentVisualization React Component

This component:
- Establishes WebSocket connection to receive updates
- Falls back to REST API if WebSocket is unavailable
- Renders the graph using React Flow
- Provides interactive controls for exploring the graph

## Node and Edge Types

### Node Types

1. **Agent Nodes**: Represent supervisor, manager, and worker agents
2. **Task Nodes**: Represent tasks delegated between agents
3. **Topic Nodes**: Key topics identified in the meeting
4. **Action Item Nodes**: Actions extracted from the meeting
5. **Result Nodes**: Final analysis results

### Edge Types

1. **Communication**: Messages between agents
2. **Collaboration**: Working relationships between agents
3. **Assignment**: Task assignments
4. **Dependency**: Hierarchical relationships
5. **Relation**: Connections between insights and sources

## Usage

### Starting the Visualization

The visualization is automatically initialized when a meeting analysis session is created. No manual setup is required.

### Viewing the Visualization

1. Open a meeting analysis session page
2. Navigate to the "Visualization" tab
3. The graph will load automatically and update in real-time

### Interacting with the Graph

- Zoom and pan to explore the graph
- Hover over nodes to see details
- Node colors indicate different types and states
- Edge animations show active communications

## API Endpoints

### REST API

- `GET /api/v1/visualizations/graph/:sessionId`: Get current graph data
- `GET /api/v1/visualizations/:filename`: Get a static visualization file
- `GET /api/v1/visualizations`: List all available visualizations

### WebSocket API

- Connect to `ws://server:port/ws/visualization`
- Send subscription message: `{ type: "subscribe", runId: "session-id" }`
- Receive updates: `{ type: "stateUpdate", runId: "session-id", state: {...} }`

## Extending the Visualization

### Adding New Node Types

1. Define a new node type in the AgentGraphVisualizationService
2. Create a matching React node component in the client
3. Update the node type mapping in the client

### Adding New Edge Types

1. Define a new edge type in the AgentGraphVisualizationService
2. Update the edge type styling in the client

## Troubleshooting

### No Visualization Data

- Check that the agent system is running correctly
- Verify the WebSocket connection is established
- Try refreshing the visualization tab

### Performance Issues

- Large graphs can be resource-intensive
- Use the filtering controls to focus on specific parts of the graph
- Consider using a static visualization for very complex graphs

## Implementation Details

### Server-Side Graph Data Structure

The server maintains a graph data structure for each session:
- Elements Map: Contains all nodes with their properties and state
- Connections Map: Contains all edges with their properties

### Client-Side Rendering

The client transforms the server graph data into React Flow's format:
- Server nodes → React Flow nodes with appropriate types and styles
- Server edges → React Flow edges with appropriate types and styles

### State Persistence

The visualization state is maintained in memory and is not persisted to the database. If the server restarts, the visualization will start fresh when the next activity occurs. 