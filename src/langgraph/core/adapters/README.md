# LangGraph Adapters

This directory contains standardized adapters that bridge our agent framework with LangGraph state-based workflows.

## Architecture

The adapters follow a hierarchical pattern:

1. `base-langgraph.adapter.ts` - Core base adapter with common workflow patterns
2. `base-agent.adapter.ts` - Standardized adapter for BaseAgent implementation
3. Specialized adapters:
   - `standardized-meeting-analysis.adapter.ts` - For meeting analysis workflow
   - `conversation.adapter.ts` - For conversational workflows

## Usage Guidelines

When implementing a new workflow:

1. Use the `BaseLangGraphAdapter` as your foundation
2. For agent-based workflows, extend `BaseAgentAdapter`
3. For specialized workflows, create a new adapter class following the patterns established in existing adapters

## Best Practices

1. Follow the established node naming conventions
2. Use conditional routing for error handling
3. Maintain clear state typing
4. Include proper error handling and logging
5. Create well-defined state schemas using the Annotation pattern

## Examples

See `standardized-meeting-analysis.adapter.ts` for a complete example of implementing a complex workflow. 