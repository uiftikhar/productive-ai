# Agent Factory Pattern

## Overview

The Agent Factory pattern provides a standardized way to create, configure, and manage agents in the Productive AI system. This pattern follows the Factory design pattern to encapsulate the creation logic, dependency injection, and registration of agents.

## Key Benefits

- **Simplified Agent Creation**: Creates agents with proper default configuration
- **Dependency Injection**: Automatically provides needed dependencies like connectors and services
- **Consistent Registration**: Handles agent registration with the `AgentRegistryService`
- **Centralized Configuration**: Provides a single point for configuring common agent properties
- **Reduced Boilerplate**: Eliminates repetitive setup code when creating agents

## AgentFactory Implementation

The `AgentFactory` class implements the following features:

1. **Default Dependencies**: Provides reasonable defaults for all required dependencies
2. **Automatic Registration**: Agents are registered automatically with the AgentRegistryService
3. **Flexible Configuration**: Supports custom configuration for each agent type
4. **Bulk Creation**: Supports creating and initializing all standard agents at once

## Usage Examples

### Basic Usage

```typescript
import { getDefaultAgentFactory } from '../factories/agent-factory';

// Get a factory with default configuration
const factory = getDefaultAgentFactory();

// Create a knowledge retrieval agent
const agent = factory.createKnowledgeRetrievalAgent({
  id: 'knowledge-agent-1'
});

// The agent is automatically registered and ready to use
```

### Custom Dependencies

```typescript
import { AgentFactory } from '../factories/agent-factory';
import { OpenAIConnector } from '../integrations/openai-connector';

// Create a factory with custom dependencies
const factory = new AgentFactory({
  openAIConnector: new OpenAIConnector({
    modelConfig: {
      model: 'gpt-4',
      temperature: 0.2
    }
  })
});

// Create a meeting analysis agent with custom settings
const agent = factory.createMeetingAnalysisAgent({
  id: 'meeting-agent-custom',
  name: 'Custom Meeting Agent',
  description: 'Agent with custom configuration'
});
```

### Disabling Automatic Registration

```typescript
// Create an agent without automatic registration
const agent = factory.createDocumentRetrievalAgent({
  id: 'doc-agent',
  autoRegister: false
});

// Later, register manually if needed
registry.registerAgent(agent);
```

## Supported Agent Types

The factory currently supports creating the following agent types:

1. **KnowledgeRetrievalAgent**: For retrieving knowledge from vector stores
2. **DocumentRetrievalAgent**: For document search and retrieval operations
3. **MeetingAnalysisAgent**: For analyzing meeting transcripts

## Adding New Agent Types

To extend the factory with support for new agent types:

1. Add a new creation method to the `AgentFactory` class
2. Follow the existing pattern of dependency injection and configuration
3. Include the agent type in the `createStandardAgents` method if appropriate

Example:

```typescript
createNewAgentType(options: AgentFactoryOptions = {}): NewAgentType {
  const agent = new NewAgentType({
    logger: options.logger || this.logger,
    // Inject other required dependencies
    ...options,
  });

  if (options.autoRegister !== false) {
    this.registerAgent(agent);
  }

  return agent;
}
```

## Complete Example

For complete usage examples, see:
- [agent-factory-usage.ts](../examples/agent-factory-usage.ts) for detailed usage patterns
- [agent-factory.test.ts](../tests/agent-factory.test.ts) for testing approaches 