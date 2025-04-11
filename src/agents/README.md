# Agent Framework

This directory contains the agent framework for the Productive AI system. The framework provides a foundation for building AI agents that can perform specialized tasks.

## Directory Structure

```
src/agents/
├── adapters/            # Adapters for integrating with external services
│   ├── agent-context.adapter.ts    # Adapter for context services
│   ├── openai-adapter.ts           # Adapter for OpenAI API
│   ├── pinecone-adapter.ts         # Adapter for Pinecone vector database
│   └── tests/                      # Tests for adapters
├── base/                # Base agent implementation
│   ├── base-agent.ts                # Abstract base agent class
│   └── tests/                       # Tests for base agent
├── examples/            # Example agent implementations
│   └── echo-agent.ts                # Simple echo agent example
├── interfaces/          # Core interfaces for the agent framework
│   └── agent.interface.ts           # Agent interface definitions
└── specialized/         # Specialized agent implementations
    ├── retrieval-agent.ts           # Agent for retrieval operations
    └── reasoning-agent.ts           # Agent for reasoning operations
```

## Key Components

### BaseAgent

The `BaseAgent` class provides a foundation for all agents in the system. It handles:

- Lifecycle management (initialization, execution, termination)
- Context retrieval and storage
- Capability registration and validation
- Metrics collection and monitoring
- Error handling and reporting

### Adapters

Adapters provide a standardized interface for agents to interact with external services:

- **AgentContextAdapter**: Provides access to user context (conversations, documents, memories)
- **PineconeAdapter**: Simplifies vector database operations
- **OpenAIAdapter**: Provides a clean interface for LLM and embedding operations

### Agent Interfaces

The `agent.interface.ts` file defines the core interfaces that all agents implement:

- **AgentInterface**: The primary interface all agents must implement
- **AgentCapability**: Describes capabilities an agent provides
- **AgentRequest**: Structure for requests sent to agents
- **AgentResponse**: Structure for responses returned by agents
- **AgentContext**: Context information available to agents

## Usage Examples

### Creating a Simple Agent

```typescript
import { BaseAgent } from '../base/base-agent.ts';
import { AgentRequest, AgentResponse } from '../interfaces/agent.interface.ts';

export class SimpleAgent extends BaseAgent {
  constructor() {
    super(
      'Simple Agent',
      'A simple agent that responds to requests'
    );
    
    // Register capabilities
    this.registerCapability({
      name: 'greet',
      description: 'Greet the user',
      parameters: {
        name: 'The name to greet'
      }
    });
  }
  
  // Implement the abstract executeInternal method
  protected async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    // Extract input
    const input = typeof request.input === 'string'
      ? request.input
      : request.input.map(msg => msg.content).join('\n');
    
    // Process based on capability
    if (request.capability === 'greet') {
      const name = request.parameters?.name || 'User';
      return {
        output: `Hello, ${name}! How can I help you today?`
      };
    }
    
    // Default response
    return {
      output: `Received: ${input}`
    };
  }
}
```

### Using an Agent

```typescript
import { SimpleAgent } from './simple-agent.ts';

async function main() {
  // Create and initialize the agent
  const agent = new SimpleAgent();
  await agent.initialize();
  
  // Execute a request
  const response = await agent.execute({
    input: 'Hello there!',
    capability: 'greet',
    parameters: {
      name: 'John'
    },
    context: {
      userId: 'user123',
      conversationId: 'conv456'
    }
  });
  
  console.log(response.output); // Hello, John! How can I help you today?
  
  // Clean up
  await agent.terminate();
}

main().catch(console.error);
```

## Testing

Run the agent tests with:

```bash
npm run test:agents
```

Or run all tests with:

```bash
npm test
``` 