# LangGraph Workflows

This directory contains workflow orchestrators that leverage LangGraph for structured execution flows.

## Architecture

The workflows follow a hierarchical pattern:

1. `base-workflow.ts` - Core base workflow with common patterns
2. `agent-workflow.ts` - Standardized workflow for agent execution
3. Specialized workflows (to be added as needed):
   - Conversation workflows
   - Meeting analysis workflows
   - Multi-agent workflows

## Usage Guidelines

When implementing a new workflow:

1. Use the `BaseWorkflow` as your foundation for most cases
2. For agent-based workflows, extend `AgentWorkflow`
3. For specialized workflows, create a new class that extends the appropriate base

## Best Practices

1. Follow the established node naming conventions
2. Use conditional routing for error handling
3. Maintain clear state typing
4. Include proper error handling and logging
5. Create well-defined state schemas using the Annotation pattern

## Examples

See `agent-workflow.ts` for a complete example of implementing a workflow orchestrator. 