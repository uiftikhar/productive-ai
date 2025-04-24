# LangGraph Implementation

This directory contains the LangGraph-based workflow orchestration system that powers the Productive AI platform. LangGraph provides a structured state machine approach to manage complex agent workflows, multi-agent interactions, and conversational patterns.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Workflows](#workflows)
4. [Adapters](#adapters)
5. [State Management](#state-management)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)
8. [Examples](#examples)
9. [RAG Integration](#rag-integration)
10. [Performance Considerations](#performance-considerations)

## Architecture Overview

The LangGraph implementation follows a modular, layered architecture designed for extensibility and maintainability:

```
┌───────────────────────────────────────────────────────────────┐
│                     Application Layer                         │
└─────────────────────────────┬─────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────┐
│                       Adapter Layer                           │
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │ SupervisorAdapter│  │ MeetingAnalysis │  │ Conversation    ││
│  │                 │  │ Adapter         │  │ Adapter         ││
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘│
└───────────┼─────────────────────┼─────────────────────┼───────┘
            │                     │                     │
            ▼                     ▼                     ▼
┌───────────────────────────────────────────────────────────────┐
│                      Workflow Layer                           │
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │ SupervisorWorkflow│ │ AgentWorkflow   │  │ BaseWorkflow    ││
│  │                 │  │                 │  │                 ││
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘│
└───────────┼─────────────────────┼─────────────────────┼───────┘
            │                     │                     │
            ▼                     ▼                     ▼
┌───────────────────────────────────────────────────────────────┐
│                       State Layer                             │
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐│
│  │ SupervisorState │  │ AgentState      │  │ BaseWorkflowState││
│  │                 │  │                 │  │                 ││
│  └─────────────────┘  └─────────────────┘  └─────────────────┘│
└───────────────────────────────────────────────────────────────┘
```

## Core Components

The LangGraph implementation consists of several core components:

### Base Workflow

The `BaseWorkflow` class provides the foundation for all workflows with:

- Standardized state management
- Common execution patterns
- Error handling
- Metrics collection
- Tracing

```typescript
export abstract class BaseWorkflow<
  TState extends BaseWorkflowState,
  TRequest,
  TResponse
> {
  // Core workflow functionality
  protected createStateSchema() { ... }
  protected createInitNode() { ... }
  protected createErrorHandlerNode() { ... }
  protected createCompletionNode() { ... }
  
  // Public execution interface
  public async execute(request: TRequest): Promise<TResponse> { ... }
}
```

### Agent Workflow

The `AgentWorkflow` class extends the BaseWorkflow to provide agent-specific execution:

```typescript
export class AgentWorkflow<T extends BaseAgent> extends BaseWorkflow<AgentExecutionState, AgentRequest, AgentResponse> {
  constructor(
    protected readonly agent: T,
    options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
    } = {},
  ) { ... }
  
  // Agent-specific nodes
  private createPreExecuteNode() { ... }
  private createExecuteNode() { ... }
  private createPostExecuteNode() { ... }
}
```

### Supervisor Workflow

The `SupervisorWorkflow` class enables multi-agent orchestration with:

- Team management
- Task assignment
- Execution coordination
- Progress tracking
- Error recovery

## Workflows

The workflow layer implements the core state machines that drive agent execution. The hierarchical workflow design includes:

1. **BaseWorkflow**: The foundation for all workflows with common patterns and error handling
2. **AgentWorkflow**: Standardized workflow for single agent execution
3. **SupervisorWorkflow**: Advanced workflow for multi-agent coordination
4. **HistoryAwareSupervisor**: Enhanced supervisor with interaction history management

Each workflow implements a state machine with defined nodes and edges:

```
[START] → [initialize] → [pre_execute] → [execute] → [post_execute] → [complete] → [END]
                                                               ↓
                                                        [error_handler] ───→ [END]
```

Conditional edges provide dynamic routing based on execution status, errors, and other state properties.

## Adapters

Adapters bridge the gap between application code and LangGraph workflows, providing simplified interfaces and additional capabilities:

### SupervisorAdapter

Connects `SupervisorAgent` with LangGraph workflows for multi-agent orchestration:

```typescript
const supervisor = new SupervisorAgent({ /* config */ });
const adapter = new SupervisorAdapter(supervisor, {
  tracingEnabled: true,
  maxRecoveryAttempts: 3,
});

// Execute coordinated tasks
const result = await adapter.executeCoordinatedTask(
  'Research and analyze market trends',
  [
    {
      description: 'Research market trends',
      requiredCapabilities: ['research'],
      priority: 9
    },
    {
      description: 'Analyze findings',
      requiredCapabilities: ['data-analysis'],
      priority: 7
    }
  ],
  'sequential'
);
```

### StandardizedMeetingAnalysisAdapter

Specialized adapter for meeting transcript analysis with RAG enhancement:

```typescript
const adapter = new StandardizedMeetingAnalysisAdapter({
  meetingAnalysisAgent,
  tracingEnabled: true,
  embeddingService,
});

const result = await adapter.analyzeMeetingTranscript({
  transcript: meetingContent,
  userId: 'user123',
  meetingId: 'meeting123',
  meetingTitle: 'Quarterly Planning',
  includeHistoricalContext: true,
});
```

### ConversationAdapter

Manages conversational interactions with context awareness:

```typescript
const adapter = new ConversationAdapter({
  agentFactory,
  tracingEnabled: true,
});

const response = await adapter.processMessage({
  userId: 'user123',
  conversationId: 'conv456',
  message: 'What decisions did we make in yesterday's meeting?',
  useRag: true,
});
```

## State Management

LangGraph uses strongly-typed state definitions with the Annotation pattern:

```typescript
protected createStateSchema() {
  return Annotation.Root({
    id: Annotation<string>(),
    runId: Annotation<string>(),
    status: Annotation<string>(),
    startTime: Annotation<number>(),
    endTime: Annotation<number | undefined>(),
    errorCount: Annotation<number>({
      default: () => 0,
      value: (curr, update) => (curr || 0) + (update || 0),
    }),
    errors: Annotation<any[]>({
      default: () => [],
      value: (curr, update) => [
        ...(curr || []),
        ...(Array.isArray(update) ? update : [update]),
      ],
    }),
    // Additional state fields...
  });
}
```

State schemas define:
- Required and optional fields
- Default values
- Merge behaviors for updates
- Type constraints

## Error Handling

The LangGraph implementation includes robust error handling at multiple levels:

1. **Node-level Handling**: Each node includes try/catch blocks
2. **Conditional Routing**: Error states trigger transitions to error handlers
3. **Recovery Strategies**: Retry mechanisms with configurable attempts
4. **Graceful Degradation**: Fallback behavior for critical failures

Error handling configuration is exposed through adapter options:

```typescript
const adapter = new SupervisorAdapter(supervisor, {
  maxRecoveryAttempts: 3,
  retryDelayMs: 1000,
  errorHandlingLevel: 'advanced',
});
```

## Best Practices

When working with LangGraph in the Productive AI platform:

1. **Standardized Workflows**: Use `AgentWorkflow` for single agents and `SupervisorWorkflow` for multi-agent systems
2. **Proper State Design**: Define clear state interfaces that extend from appropriate base states
3. **Conditional Edges**: Use conditional routing for complex logic flows
4. **Error Recovery**: Implement proper retry and recovery strategies
5. **Tracing**: Enable tracing for debugging complex workflows
6. **Resource Cleanup**: Properly clean up resources when workflows complete
7. **Type Safety**: Leverage TypeScript's type system for state definitions

## Examples

The `examples` directory contains several implementation examples:

1. **supervisor-example.ts**: Basic demonstration of supervisor functionality
2. **supervisor-with-context-example.ts**: Context-aware supervisor workflow
3. **supervisor-multi-agent-scenario.ts**: Complex multi-agent scenario
4. **supervisor-with-fallback-example.ts**: Error handling with fallbacks

These examples demonstrate best practices and common patterns for implementing LangGraph workflows.

## RAG Integration

The LangGraph implementation includes built-in support for Retrieval-Augmented Generation (RAG):

1. **Meeting Analysis**: Enhanced meeting transcript analysis with historical context
2. **Conversation Context**: RAG-enhanced conversational agents
3. **Document Integration**: Integration with document context stores

The RAG workflow follows this pattern:

1. Generate embeddings for input
2. Retrieve relevant context from vector store
3. Enhance prompts with retrieved context
4. Execute agent with enhanced context
5. Store results back in vector store for future reference

## Performance Considerations

When implementing LangGraph workflows:

1. **State Size**: Keep state objects reasonably sized to avoid performance issues
2. **Node Complexity**: Break complex logic into multiple focused nodes
3. **Tracing Overhead**: Be aware of tracing overhead in production environments
4. **Conditional Routing**: Use efficient conditional routing functions
5. **Error Recovery**: Configure reasonable retry limits and timeouts

## Migration from Legacy Patterns

For teams migrating from legacy patterns:

1. Replace direct agent execution with `AgentWorkflow`
2. Use `SupervisorAdapter` for multi-agent coordination
3. Leverage the standardized state interfaces
4. Implement proper error handling with conditional edges
5. Use the tracing capabilities for visibility into workflow execution

---

**Status**: STABLE (Core), EXPERIMENTAL (Some Components)

For detailed information on specific components, see the README files in their respective directories. 