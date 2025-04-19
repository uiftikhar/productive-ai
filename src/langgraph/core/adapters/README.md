# Standardized LangGraph Adapters

This directory contains adapters that bridge agent functionality with LangGraph workflow management. The adapters provide a structured approach to building complex agent workflows with proper state management and error handling.

## Architecture

The architecture is based on a hierarchy of adapters:

```
BaseLangGraphAdapter (abstract)
├── UnifiedAgentAdapter
└── Specialized Adapters
    ├── StandardizedMeetingAnalysisAdapter
    └── StandardizedTaskExecutionAdapter
    └── ... (other specialized adapters)
```

## Base Adapter

`BaseLangGraphAdapter` provides the foundation with standardized:

- Workflow state management
- Error handling
- Metrics tracking
- Execution patterns

It defines abstract methods that all adapters must implement:
- `createStateSchema()`: Define the state structure
- `createStateGraph()`: Create the workflow graph
- `processResult()`: Process the final state into a result

## Unified Agent Adapter

`UnifiedAgentAdapter` extends the base adapter to provide a generic interface for all agent types. It:

- Connects any `UnifiedAgent` instance with LangGraph
- Provides standard nodes for agent lifecycle (initialize, execute, etc.)
- Handles agent-specific state management

## Specialized Adapters

Specialized adapters provide domain-specific workflows:

- `StandardizedMeetingAnalysisAdapter`: Processes meeting transcripts through a chunking workflow
- `StandardizedTaskExecutionAdapter`: Manages task execution with planning and validation steps
- More can be added for other specialized workflows

## Error Handling

The adapters provide comprehensive error handling:

- Error collection in state
- Error routing in graph workflows
- Standardized error representation
- Error tracing and logging

## Usage Example

```typescript
// Create an agent
const meetingAnalysisAgent = new MeetingAnalysisAgent();

// Create the adapter with the agent
const adapter = new StandardizedMeetingAnalysisAdapter(meetingAnalysisAgent);

// Execute a workflow
const result = await adapter.processMeetingTranscript({
  meetingId: 'meeting-123',
  transcript: meetingTranscript,
  title: 'Team Planning Meeting',
  userId: 'user-456'
});

// Access the result
console.log(`Success: ${result.success}`);
console.log(`Output: ${JSON.stringify(result.output)}`);
console.log(`Metrics: ${JSON.stringify(result.metrics)}`);
```

## Benefits

This standardized approach offers several benefits:

1. **Consistency**: All adapters follow the same patterns and error handling
2. **Maintainability**: Common code is centralized in base classes
3. **Extensibility**: New specialized adapters can be created easily
4. **Observability**: Standard metrics and logging across all adapters
5. **Error Handling**: Robust error management and recovery strategies 