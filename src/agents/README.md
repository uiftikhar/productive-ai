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

## LangGraph Migration

This codebase has been refactored to use LangGraph as the primary orchestration mechanism. LangGraph provides a more structured approach to creating agent workflows compared to traditional agent orchestration.

### Key Changes

1. **Simplified Architecture**
   - Removed legacy orchestration in favor of LangGraph workflows

## Migration from BaseAgent to UnifiedAgent

The codebase is currently transitioning from `BaseAgent` to `UnifiedAgent`. All new agent implementations should use `UnifiedAgent`, and existing agents should be migrated to use `UnifiedAgent` instead of `BaseAgent`.

### Migration Steps

1. **Update Imports**: Change imports from `BaseAgent` to `UnifiedAgent` and update interface imports:
   ```diff
   - import { BaseAgent } from '../base/base-agent';
   - import { AgentRequest, AgentResponse } from '../interfaces/agent.interface';
   + import { UnifiedAgent } from '../base/unified-agent';
   + import { AgentRequest, AgentResponse, AgentCapability } from '../interfaces/unified-agent.interface';
   ```

2. **Change Base Class**: Update your class to extend `UnifiedAgent`:
   ```diff
   - export class MyAgent extends BaseAgent {
   + export class MyAgent extends UnifiedAgent {
   ```

3. **Update Constructor**: The constructor options are different:
   ```diff
   constructor(
     options: {
       // ... your options
       logger?: Logger;
   +   llm?: ChatOpenAI;
   +   id?: string;
     } = {},
   ) {
     super(
       'My Agent',
       'Agent description',
   -   { logger: options.logger }, 
   +   { 
   +     logger: options.logger,
   +     llm: options.llm,
   +     id: options.id
   +   }
     );
     
     // ... rest of constructor
     
   - // Remove any automatic initialization
   - this.initialize();
   }
   ```

4. **Update State & Status References**: `UnifiedAgent` uses an enum for status:
   ```diff
   - this.state.status = 'running';
   + this.setState({ status: AgentStatus.EXECUTING });
   ```

5. **Update Error Handling**: Error handling is different in `UnifiedAgent`:
   ```diff
   - this.handleError(error);
   + // Instead, throw the error which will be handled by execute()
   + throw error;
   ```

6. **Update Metric Processing**: Metric processing is handled in the execute method of `UnifiedAgent`:
   ```diff
   - this.processMetrics(startTime, Date.now(), response.usage);
   + // Metrics are handled automatically by UnifiedAgent
   ```

7. **Update Response Format**: Ensure response format matches `AgentResponse` from unified interface:
   ```diff
   - return {
   -   success: true,
   -   output: result,
   -   usage: this.metrics,
   - };
   + return {
   +   output: result,
   +   metrics: {
   +     executionTimeMs: Date.now() - startTime,
   +     tokensUsed: tokensUsed,
   +   },
   + };
   ```

### Example Migration

```typescript
// Before
import { BaseAgent } from '../base/base-agent';
import { AgentRequest, AgentResponse } from '../interfaces/agent.interface';

export class ExampleAgent extends BaseAgent {
  constructor(options = {}) {
    super('Example Agent', 'Example description', { logger: options.logger });
    this.initialize();
  }
  
  protected async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const result = "Example result";
    return {
      success: true,
      output: result,
    };
  }
}

// After
import { UnifiedAgent } from '../base/unified-agent';
import { AgentRequest, AgentResponse, AgentStatus } from '../interfaces/unified-agent.interface';

export class ExampleAgent extends UnifiedAgent {
  constructor(options = {}) {
    super('Example Agent', 'Example description', { 
      logger: options.logger,
      id: options.id,
      llm: options.llm
    });
  }
  
  protected async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const result = "Example result";
    return {
      output: result,
      metrics: {
        executionTimeMs: Date.now() - startTime,
      },
    };
  }
}
```

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