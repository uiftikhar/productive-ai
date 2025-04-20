# Agent Architecture Migration Plan

## Current Status

The codebase is currently undergoing a migration from a mixed-implementation architecture to a standardized approach using LangGraph for agent workflow management. This document outlines the steps being taken to complete this migration.

## Migration Goals

1. **Standardize Interface**: Use `BaseAgentInterface` (previously known as `UnifiedAgentInterface`) as the standard interface for all agents
2. **LangGraph Integration**: Move agent execution flow to LangGraph-based workflow management
3. **Remove Legacy Code**: Deprecate and remove legacy implementations that don't follow the new patterns
4. **Simplify Agent Creation**: Make it easier to create new agent implementations through standardized base classes and factories

## Completed Steps

- [x] Renamed `UnifiedAgentInterface` to `BaseAgentInterface` with backward compatibility
- [x] Created `BaseAgent` abstract class for standard agent implementation
- [x] Implemented LangGraph adapter for agent execution
- [x] Updated `AgentRegistryService` to use the standard interface
- [x] Updated `PineconeConnector` with proper generic typing for `RecordMetadata`
- [x] Migrated `KnowledgeRetrievalAgent` to extend `BaseAgent`
- [x] Migrated `RetrievalAgent` to extend `BaseAgent`
- [x] Migrated `MeetingAnalysisAgent` to extend `BaseAgent`
- [x] Created migration helper script
- [x] Created standardized AgentFactory for simpler agent instantiation
- [x] Implemented the `DecisionTrackingAgent` using the new patterns
- [x] Removed `BaseAgentAdapter` and replaced with `AgentWorkflow`

## Current Progress

We've made significant progress on the migration:

- All core components have been migrated to the new architecture
- All primary agents are using the `BaseAgent` abstract class
- The `AgentRegistryService` is fully updated to use the standard interface
- The migration helper script (`src/scripts/migrate-agent.ts`) is in place to assist with future migrations
- The standardized `AgentFactory` simplifies agent creation with proper dependency injection
- All agents are now integrated with the `AgentWorkflow` for execution

## In Progress

- [ ] Finalizing integration tests for the new workflow pattern
- [ ] Creating additional examples for new implementations
- [ ] Updating documentation for new implementation patterns

## Next Steps

1. **Remove unused code** including legacy adapter code and deprecation bridges
2. **Complete integration tests** to verify functionality with the new workflow patterns
3. **Finalize documentation** for the new architecture

## Future Steps

- [ ] Implement a structured agent discovery mechanism based on capabilities
- [ ] Create a centralized workflow registry similar to the agent registry
- [ ] Standardize state management across all agents
- [ ] Add telemetry for agent performance monitoring

## Migration Path for Existing Agents

If you have an existing agent implementation, follow these steps to migrate:

1. Make your agent implement `BaseAgentInterface` (previously `UnifiedAgentInterface`)
2. Consider extending `BaseAgent` abstract class instead of implementing the interface directly
3. Register your agent with `AgentRegistryService`
4. Update execution flow to match the new agent lifecycle (initialize, execute, terminate)
5. Use the `AgentWorkflow` to execute your agent in the context of a LangGraph workflow

## Migration Path for Existing Workflows

If you have existing agent workflows:

1. Convert them to use `AgentWorkflow` from `src/langgraph/core/workflows/agent-workflow.ts`
2. Define state using `BaseAgentState` from `src/langgraph/core/state/base-agent-state.ts`

## Best Practices

- Use dependency injection for services and connectors
- Follow the repository pattern for external service interactions
- Implement agents as stateless services where possible
- Use the central agent registry for agent discovery
- Use LangGraph for managing agent execution flow and state

## Type Definitions

For reference, the key type definitions are:

```typescript
// The core agent interface (src/agents/interfaces/base-agent.interface.ts)
export interface BaseAgentInterface {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  getCapabilities(): AgentCapability[];
  canHandle(capability: string): boolean;
  initialize(config?: Record<string, any>): Promise<void>;
  execute(request: AgentRequest): Promise<AgentResponse>;
  getState(): AgentState;
  getInitializationStatus(): boolean;
  terminate(): Promise<void>;
  getMetrics(): AgentMetrics;
}
```

## Questions?

If you have questions about the migration, please reach out to the architecture team. 