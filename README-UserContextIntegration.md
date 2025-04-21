# UserContextFacade Integration with SupervisorWorkflow

This document explains how the `UserContextFacade` has been integrated with the `SupervisorWorkflow` to provide context-aware task planning and execution in the LangGraph workflow system.

## Overview

The integration allows the SupervisorWorkflow to:

1. Retrieve relevant context for task planning based on user history
2. Store conversation turns, task delegations, and execution results
3. Track workflow execution across multi-agent task coordination

## Key Changes

### 1. SupervisorWorkflow Class Updates

The `SupervisorWorkflow` class was modified to:

- Add a `userContext` property to hold the UserContextFacade instance
- Update the constructor to accept a UserContextFacade in options
- Add an `id` property for workflow identification in context logs
- Enhance task planning with context retrieval
- Add context recording during task delegation and execution

### 2. Context Integration Points

Context is integrated at multiple points in the workflow:

- **Task Planning**: Retrieves relevant context based on the input query
- **Task Delegation**: Records task assignment information in the context
- **Execute Method**: Records workflow execution requests and responses

### 3. Example Implementation

A complete example is provided in `src/langgraph/examples/supervisor-with-context-example.ts`, demonstrating:

- How to initialize the UserContextFacade
- How to create a SupervisorWorkflow with context integration
- How to execute workflow tasks with context
- How to verify context storage and retrieval

## Usage Example

```typescript
// Initialize UserContextFacade
const userContextFacade = new UserContextFacade({
  logger
});
await userContextFacade.initialize();

// Create supervisor agent
const supervisorAgent = new SupervisorAgent({
  name: 'Main Supervisor', 
  description: 'Coordinates multi-step tasks',
  logger,
  agentRegistry
});

// Create SupervisorWorkflow with context
const workflow = new SupervisorWorkflow(supervisorAgent, {
  logger,
  userContext: userContextFacade,
  id: 'supervisor-workflow-' + uuidv4().substring(0, 8)
});

// Execute with context
const result = await workflow.execute({
  input: 'Create a blog post about AI trends',
  capability: 'task-coordination',
  parameters: {
    tasks: [...],  // Task definitions
    executionStrategy: 'sequential'
  },
  context: {
    userId: 'user-123',
    conversationId: 'conv-456',
    metadata: {
      projectId: 'project-789'
    }
  }
});

// Retrieve conversation history from context
const conversationHistory = await userContextFacade.getConversationHistory(
  'user-123',
  'conv-456',
  20,
  { includeMetadata: true }
);
```

## Benefits

The integration provides several benefits:

1. **Enhanced Context Awareness**: Workflows can access historical user information
2. **Improved Task Planning**: Task planning considers relevant context from past interactions
3. **Persistent Workflow History**: Task assignments and results are stored for future reference
4. **Better Debugging**: Workflow execution is tracked in the context storage system
5. **Analytics Support**: Stored context data can be analyzed for patterns and optimizations

## Implementation Notes

- Embedding generation is mocked in the current implementation with random vectors
- In a production environment, you would use a proper embedding service
- The integration supports different storage backends through the UserContextFacade abstraction 