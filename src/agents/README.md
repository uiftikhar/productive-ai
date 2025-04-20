# Agent Implementations

## Current Status

This directory contains the agent implementations for the application. The agent architecture has been significantly improved with:

- ✅ Standardized interfaces via `BaseAgentInterface`
- ✅ LangGraph integration for workflow management
- ✅ Enhanced agent factories for dependency injection
- ✅ Improved tracing and error handling

All core agents have been migrated to the new architecture. For detailed migration background, see [MIGRATION-PLAN.md](./MIGRATION-PLAN.md).

## Directory Structure

- **base/**: Base classes including the standard `BaseAgent` abstract class
- **interfaces/**: Core interfaces including `BaseAgentInterface`
- **specialized/**: Domain-specific agent implementations
- **messaging/**: Messaging and communication-related agents
- **factories/**: Factory classes for agent creation with proper dependency injection
- **services/**: Services for agent discovery and registration
- **integrations/**: Connectors for third-party service integration

## Creating a New Agent

New agents should follow these best practices:

1. Extend the `BaseAgent` abstract class:
2. Use the `AgentFactory` for creating instances
3. Implement workflow compatibility
4. Register with the `AgentRegistryService`

### Example Implementation

```typescript
import { BaseAgent } from '../base/base-agent';
import { AgentRequest, AgentResponse } from '../interfaces/base-agent.interface';

export class MyNewAgent extends BaseAgent {
  constructor(
    options: {
      logger?: Logger;
      // Agent-specific dependencies
    } = {}
  ) {
    super(
      'my-unique-id', // id
      'My New Agent', // name
      'Description of what this agent does', // description
      { logger: options.logger } // options
    );
    
    // Register agent capabilities
    this.registerCapability({
      name: 'my-capability',
      description: 'What this capability does',
    });
  }
  
  // Override initialize if needed
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);
    // Agent-specific initialization
  }
  
  // This is the required method to implement
  protected async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    // Implement agent logic here
    return {
      output: 'Response from agent',
    };
  }
}
```

### Using the Agent Factory

The recommended way to create agents is through the `AgentFactory`:

```typescript
import { AgentFactory } from '../factories/agent-factory';

// Create factory with dependencies
const agentFactory = new AgentFactory({
  logger,
  openAIConnector,
  embeddingService,
});

// Create an agent with workflow wrapping
const myAgent = agentFactory.createCustomAgent({
  id: 'my-agent-id',
  name: 'My Agent',
  description: 'Agent description',
  customDependency: someService,
  wrapWithWorkflow: true, // automatically wraps with AgentWorkflow
});

// Execute the agent (works whether wrapped or not)
const result = await myAgent.execute({ input: "Query" });
```

## Using LangGraph Workflows

All agents should be executed through `AgentWorkflow` for consistent tracing and error handling:

```typescript
import { AgentWorkflow } from '../../langgraph/core/workflows/agent-workflow';

// Create a workflow for an existing agent
const workflow = new AgentWorkflow(myAgent, {
  tracingEnabled: true,
});

// Execute the agent through the workflow
const result = await workflow.execute({
  input: "What would you like to know?",
  capability: "answer-question",
});
```

## Best Practices

1. **Dependency Injection**: Pass dependencies through constructor options
2. **Capability-based Design**: Define clear capabilities using `registerCapability`
3. **Error Handling**: Use the built-in error handling in `BaseAgent`
4. **Metrics Collection**: Use the metrics tracking provided by `BaseAgent`
5. **Stateless Design**: Prefer stateless agent designs where possible
6. **Service Integration**: Use the connectors from the `integrations/` directory
7. **Repository Pattern**: Follow the repository pattern for external service interactions
8. **Use the Registry**: Register agents with `AgentRegistryService` for discovery 