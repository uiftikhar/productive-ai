# LangGraph Integration

This directory contains the LangGraph integration for the Productive AI agent system. LangGraph is a framework for building stateful, multi-step applications with LLMs.

## Architecture

The implementation follows a modular approach with several key components:

### Core Components

- **State Schema**: Defined in `core/state/base-agent-state.ts`, provides a structured state representation with typings and validators.
- **Adapters**: Bridge between existing agent classes and LangGraph workflows (e.g., `BaseAgentAdapter`, `MeetingAnalysisAdapter`).
- **Utilities**: Helper functions for tracing, edge conditions, and graph visualization.

### Workflow Implementation

The LangGraph implementation provides a structured workflow with the following nodes:

1. **initialize**: Sets up the agent and ensures it's properly initialized
2. **pre_execute**: Prepares for execution and sets initial state
3. **execute**: Runs the core agent logic with the provided input
4. **post_execute**: Finalizes the execution and updates metrics
5. **handle_error**: Manages error states and provides recovery paths

## Usage Example

```typescript
import { BaseAgent } from '../agents/base/base-agent';
import { BaseAgentAdapter } from './core/adapters/base-agent.adapter';

// Create an agent instance
const agent = new YourAgent(/* configuration */);

// Create the adapter
const adapter = new BaseAgentAdapter(agent);

// Execute the agent through the adapter
const response = await adapter.execute({
  input: 'Your input here',
  capability: 'your-capability',
  parameters: {},
  context: {
    userId: 'user-123'
  }
});
```

## Implementation Notes

### TypeScript Compatibility

The current implementation of LangGraph has some TypeScript typing challenges, particularly around node names and edge connections. We address these in several ways:

1. **Type Casting**: We use `as any` for node names in edge connections to work around TypeScript's strict typing. This approach is consistent with LangChain's own repositories, as seen in the data-enrichment-js example.

2. **State Schema Definition**: We use `Annotation.Root` to define the state schema, which provides proper typing for state access within node functions.

3. **Proper Graph Initialization**: We initialize the StateGraph with a stateSchema parameter, following the pattern used in LangChain examples.

These approaches ensure compatibility with LangGraph while maintaining good practices in our own code.

### Error Handling

Error recovery paths are defined at multiple levels:

1. **Node-level**: Each node includes try/catch blocks to handle local errors
2. **Edge conditions**: Error states trigger transitions to the error handling node
3. **Adapter-level**: The execute method includes top-level error handling
4. **Secondary recovery**: If error handling itself fails, a fallback mechanism is in place

## Running the Demo

To see the LangGraph adapter in action, run:

```bash
ts-node src/examples/agent-langgraph-demo.ts
```

## Future Improvements

- Expand the use of edge condition functions for more complex routing
- Improve type safety as LangGraph's TypeScript support matures
- Add more specialized adapters for different agent types
- Implement more complex workflows with branching logic
- Add telemetry and performance monitoring capabilities 