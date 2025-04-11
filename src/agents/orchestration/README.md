# Agent Orchestration System

This directory contains the components of the Agent Orchestration System, which is responsible for coordinating agent activities, managing workflows, and facilitating agent discovery and communication.

## Key Components

### Enhanced Workflow Executor

The `EnhancedWorkflowExecutorService` integrates multiple orchestration capabilities:

- **Workflow Execution**: Executes predefined or dynamically generated workflows
- **Agent Discovery**: Automatically discovers and selects the most appropriate agents for tasks
- **Communication**: Enables message passing between agents during workflow execution
- **Metrics Tracking**: Captures performance metrics for optimization

### Workflow Definition

Workflows are defined as directed acyclic graphs (DAGs) where:

- Each node represents a step to be executed by an agent
- Edges represent the flow of execution and data between steps
- Steps can be conditional or parallel

### Integration Points

The orchestration system integrates with:

1. **Agent Registry**: Provides access to registered agents
2. **Agent Discovery Service**: Finds the most suitable agents for specific capabilities
3. **Communication Bus**: Enables message-based communication between agents
4. **Model Router**: Routes requests to appropriate AI models

## Usage Example

```typescript
// Initialize the workflow executor
const workflowExecutor = EnhancedWorkflowExecutorService.getInstance({
  logger,
  registry: AgentRegistryService.getInstance(),
  discovery: AgentDiscoveryService.getInstance(), 
  communicationBus: CommunicationBusService.getInstance()
});

// Create a workflow definition (or use predefined workflows)
const workflowDefinition = workflowExecutor.createAdaptiveQueryWorkflow();

// Execute the workflow
const result = await workflowExecutor.executeWorkflow(
  workflowDefinition,
  userQuery,
  {
    userId: 'user-123',
    conversationId: 'conv-456',
    streamingCallback: (token) => { /* handle streaming */ }
  }
);
```

## Predefined Workflows

The system includes several predefined workflows:

- **Adaptive Query Workflow**: Dynamically adapts based on query complexity and available knowledge
- **Knowledge Synthesis Workflow**: Retrieves and synthesizes information from multiple sources
- **Decision Support Workflow**: Helps users make decisions by analyzing options

## Advanced Features

### Dynamic Agent Discovery

The orchestration system can automatically discover agents with specific capabilities:

```typescript
const agents = await workflowExecutor.discoverAgentsForCapability(
  'knowledge_retrieval',
  { performanceWeight: 0.7, reliabilityWeight: 0.3 }
);
```

### Workflow Metrics

Every workflow execution captures detailed metrics:

- Total execution time
- Step-by-step execution times and statuses
- Resource utilization
- Message counts and types

### Error Handling

The system provides robust error handling with:

- Step-level retry policies
- Fallback mechanisms
- Error notification through the communication bus

## Demo

Check out the `demo/enhanced-workflow-demo.ts` file for a complete example of using the enhanced workflow executor with agent discovery and communication. 