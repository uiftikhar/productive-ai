# Unified Agent Architecture

This directory contains the consolidated agent framework for Productive AI. The system has been standardized around LangGraph for workflow orchestration and state management.

## Directory Structure

```
src/agents/
├── base/                   # Base agent classes and foundations
│   ├── unified-agent.ts    # Core base agent implementation
│   └── tests/              # Unit tests for base agents
├── interfaces/             # Agent interfaces
│   └── unified-agent.interface.ts # Standardized agent interfaces
├── specialized/            # Domain-specific agent implementations
├── messaging/              # Agent messaging infrastructure
│   └── standard-message.ts # Unified messaging system
├── registry.ts             # Central agent registration (coming soon)
└── adapters/               # Agent adapters for integrations
```

## Core Components

### UnifiedAgentInterface

The `UnifiedAgentInterface` is the foundation of the agent system. It defines:

- Core identity (id, name, description)
- Capability-based execution model
- Lifecycle methods (initialize, execute, terminate)
- State and metrics tracking

### UnifiedAgent

The `UnifiedAgent` abstract class implements the common functionality:

- Standardized initialization pattern
- Error handling
- Metrics collection
- Execution lifecycle management

### UnifiedAgentAdapter

The `UnifiedAgentAdapter` bridges agents with LangGraph:

- Creates standardized workflow graphs
- Manages state transitions
- Implements structured error handling
- Provides workflow definition

### Messaging System

The standardized messaging system enables consistent agent communication:

- Type-safe message interfaces
- Multiple message types for different communication needs
- Helper functions for message creation

## Usage

### Creating a New Agent

```typescript
import { UnifiedAgent } from '../base/unified-agent';
import { AgentRequest, AgentResponse } from '../interfaces/unified-agent.interface';

export class MySpecializedAgent extends UnifiedAgent {
  constructor() {
    super(
      'My Specialized Agent',
      'An agent that performs specialized tasks'
    );
    
    // Register capabilities
    this.registerCapability({
      name: 'analyze-data',
      description: 'Analyzes data and provides insights'
    });
  }
  
  protected async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    // Implementation of the agent's core logic
    return {
      output: 'Analysis complete'
    };
  }
}
```

### Using LangGraph Adapter

```typescript
import { UnifiedAgentAdapter } from '../../langgraph/core/adapters/unified-agent.adapter';
import { MySpecializedAgent } from '../specialized/my-specialized-agent';

// Create agent
const agent = new MySpecializedAgent();

// Create adapter
const adapter = new UnifiedAgentAdapter(agent);

// Execute with LangGraph workflow
const result = await adapter.execute({
  input: 'Analyze this data...',
  capability: 'analyze-data'
});
``` 