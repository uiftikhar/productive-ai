# LangGraph Adapters

This directory contains standardized adapters that bridge our agent framework with LangGraph state-based workflows.

## Architecture

The adapters follow a hierarchical pattern:

1. `base-langgraph.adapter.ts` - Core base adapter with common workflow patterns
2. Specialized adapters:
   - `standardized-meeting-analysis.adapter.ts` - For meeting analysis workflow
   - `conversation.adapter.ts` - For conversational workflows

> **Note:** The legacy `BaseAgentAdapter` has been removed in favor of using `AgentWorkflow` directly.
> See `AgentWorkflow` in the `../workflows/agent-workflow.ts` file for the new implementation pattern.

## Usage Guidelines

When implementing a new workflow:

1. Use the `BaseLangGraphAdapter` as your foundation for complex custom adapters
2. For agent-based workflows, use `AgentWorkflow` from the workflows directory
3. For specialized workflows, create a new adapter class following the patterns established in existing adapters

## Best Practices

1. Follow the established node naming conventions
2. Use conditional routing for error handling
3. Maintain clear state typing
4. Include proper error handling and logging
5. Create well-defined state schemas using the Annotation pattern

## Examples

See `standardized-meeting-analysis.adapter.ts` for a complete example of implementing a complex workflow. 
For basic agent workflows, refer to `../workflows/agent-workflow.ts`. 