# Hierarchical Meeting Analysis Graph

This directory contains the core graph components for the hierarchical meeting analysis system based on LangGraph patterns.

## Overview

The hierarchical meeting analysis system uses a supervisor-manager-worker architecture where:

1. **Supervisor Agent**: Coordinates the overall analysis, decides which teams to activate, and synthesizes final results
2. **Manager Agents**: Manage teams of workers with specific expertise, decompose tasks, and aggregate worker results
3. **Worker Agents**: Perform specialized analysis tasks based on their expertise

## Core Components

### State Schema

The `state-schema.ts` file defines the state structure used by the LangGraph implementation:

- `MeetingAnalysisState`: The main state interface for the graph
- `TeamStructure`: Defines the hierarchical agent organization
- `TaskAssignment`: Tracks task assignments and status
- Helper functions for state manipulation (adding messages, updating tasks, etc.)

### Node Registry

The `nodes/index.ts` file provides a registry for managing graph nodes:

- `HierarchicalNodeRegistry`: Manages all node types and their handlers
- Node creation and registration functions
- Agent node processing logic for different agent roles
- Message passing and routing between agents

### Graph Implementation

The `meeting-analysis-graph.ts` file implements the main graph structure:

- `MeetingAnalysisGraphFactory`: Creates graphs with proper nodes and edges
- `MeetingAnalysisGraph`: Provides the main interface for performing analysis
- Agent provisioning and configuration
- Graph execution and result processing

## Architecture

The graph follows a hierarchical pattern with:

1. **Node Definitions**: Each agent is represented as a node in the graph
2. **State Management**: Central state object shared between nodes
3. **Conditional Routing**: Edges determine the flow between agents
4. **Message Passing**: Agents communicate via messages stored in state

### Workflow

1. Initialize graph with supervisor, managers, and workers
2. Supervisor analyzes goal and decides which teams to activate
3. Managers break down tasks and assign to appropriate workers
4. Workers perform analysis and return results to managers
5. Managers synthesize worker results and report to supervisor
6. Supervisor combines all results into final analysis output

## Usage

The main entry point is the `createMeetingAnalysisGraph` function:

```typescript
const graph = createMeetingAnalysisGraph({
  logger,
  supervisorAgent,
  initialManagerAgents: [topicManager, actionManager],
  initialWorkerAgents: [topicWorker, actionWorker],
  serviceRegistry
});

const result = await graph.analyzeMeeting(
  transcript,
  metadata,
  AnalysisGoalType.FULL_ANALYSIS
);
```

## Implementation Notes

1. The graph is designed to be dynamic, allowing new agents to be added at runtime
2. All components use TypeScript for type safety
3. LangGraph is used for the core graph structure and execution
4. Error handling is built into each node
5. The system is designed to be extensible for future agent types 