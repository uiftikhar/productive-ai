# Agent Implementations

This directory contains the agent implementations for the application. The codebase is currently in a **migration** phase:

- Legacy agents are being converted to use the standardized `BaseAgentInterface`
- New agents should extend `BaseAgent` abstract class
- For detailed migration guidance, see [MIGRATION-PLAN.md](./MIGRATION-PLAN.md)

## Directory Structure

- **base/**: Base classes for agent implementations, including the standard `BaseAgent` abstract class
- **interfaces/**: Interface definitions, including the core `BaseAgentInterface`
- **specialized/**: Domain-specific agent implementations
- **messaging/**: Messaging and communication-related agents
- **factories/**: Factory classes for creating agents
- **services/**: Support services for agent discovery, registration, and management
- **adapters/**: Adapters for connecting agents to external systems
- **integrations/**: Connectors for integrating with third-party services

## Creating a New Agent

To create a new agent, extend the `BaseAgent` abstract class:

```typescript
import { BaseAgent } from '../base/base-agent';
import { AgentRequest, AgentResponse } from '../interfaces/base-agent.interface';

export class MyNewAgent extends BaseAgent {
  constructor(options: { /* agent-specific options */ } = {}) {
    super(
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
  
  // This is the only method you must implement
  protected async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    // Implement agent logic here
    return {
      output: 'Response from agent',
    };
  }
}
```

## Registering an Agent

Register your agent with the `AgentRegistryService`:

```typescript
import { AgentRegistryService } from '../services/agent-registry.service';
import { MyNewAgent } from './my-new-agent';

// Create agent instance
const myAgent = new MyNewAgent();

// Register with the registry
const registry = AgentRegistryService.getInstance();
registry.registerAgent(myAgent);
```

## Using the Migration Helper

To help migrate existing agents to the new pattern, use the migration helper script:

```bash
ts-node src/scripts/migrate-agent.ts src/agents/specialized/my-agent.ts
```

This will analyze your agent implementation and provide guidance on what changes are needed.

## Best Practices

1. **Dependency Injection**: Pass dependencies through constructor options
2. **Capability-based Design**: Define clear capabilities using `registerCapability`
3. **Error Handling**: Use the built-in error handling in `BaseAgent`
4. **Metrics**: Use the metrics tracking provided by `BaseAgent`
5. **Stateless Design**: Prefer stateless agent designs where possible
6. **Service Integration**: Use the connectors from the `integrations/` directory 