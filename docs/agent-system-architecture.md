# Agent System Architecture

## Overview

The Agent System is designed as a modular, extensible framework for creating, coordinating, and executing specialized AI agents. It features a layered architecture that separates concerns between orchestration, specialized agent capabilities, and the underlying services that power these agents.

## Key Components

### 1. Agent Registry Service

The `AgentRegistryService` serves as the central registry for all agents in the system. It:
- Maintains a registry of all available agents
- Provides methods to register and retrieve agents
- Ensures agents are properly initialized before execution
- Enables capability-based discovery of agents

```typescript
const registry = AgentRegistryService.getInstance();
const knowledgeAgent = registry.registerKnowledgeRetrievalAgent();
```

### 2. Master Orchestrator Agent

The `MasterOrchestratorAgent` coordinates workflow execution across multiple specialized agents. It:
- Manages workflow definitions using StateGraph from LangGraph
- Executes workflows by coordinating steps between agents
- Handles messaging between agents during workflow execution
- Supports dynamic workflow creation and execution

```typescript
const orchestrator = registry.registerMasterOrchestratorAgent();
const response = await orchestrator.execute({
  input: "What insights can we extract from this data?",
  capability: "orchestrate_workflow",
  parameters: { workflow: "data_analysis" }
});
```

### 3. Knowledge Retrieval Agent

The `KnowledgeRetrievalAgent` specializes in retrieving and synthesizing knowledge from the user's context. It:
- Retrieves relevant information based on semantic search
- Supports multiple retrieval strategies (semantic, hybrid, recency, etc.)
- Generates contextualized answers using retrieved information
- Integrates with the RAG (Retrieval-Augmented Generation) system

```typescript
const agent = registry.registerKnowledgeRetrievalAgent();
const response = await agent.execute({
  input: "What are the key components of a RAG system?",
  capability: "answer_with_context"
});
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                 Client Interface                     │
└────────────────────────┬────────────────────────────┘
                        │
┌────────────────────────┴────────────────────────────┐
│                Agent Registry Service                │
└────┬───────────────────┬───────────────────────┬────┘
     │                   │                       │
┌────▼───────┐    ┌──────▼─────────┐    ┌───────▼───────┐
│ Orchestrator│    │ Knowledge      │    │ Other         │
│ Agent      │    │ Retrieval Agent│    │ Agents        │
└────┬───────┘    └──────┬─────────┘    └───────────────┘
     │                   │
┌────▼───────┐    ┌──────▼─────────┐
│ LangGraph  │    │ UserContext    │
│ StateGraph │    │ Service        │
└────────────┘    │                │
                  │ RAG Prompt     │
                  │ Manager        │
                  │                │
                  │ Embedding      │
                  │ Service        │
                  └────────────────┘
```

## Technical Implementation

### Base Agent Framework

All agents extend the `BaseAgent` abstract class, which provides:
- Common agent lifecycle management
- Capability registration and discovery
- Standard execution patterns
- Metrics collection

```typescript
export abstract class BaseAgent implements AgentInterface {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  
  // Core functionality
  abstract execute(request: AgentRequest): Promise<AgentResponse>;
  
  // Common methods
  getCapabilities(): AgentCapability[];
  canHandle(capability: string): boolean;
  initialize(config?: Record<string, any>): Promise<void>;
}
```

### Workflow Orchestration

The Master Orchestrator Agent uses LangGraph's StateGraph for workflow definitions:

```typescript
const graph = new StateGraph<OrchestratorState>({
  channels: {
    input: { /* ... */ },
    steps: { /* ... */ },
    result: { /* ... */ },
    // other state channels
  }
})
.addNode("processNode", processNodeFunction)
.addEdge(START, "processNode" as any)
.addEdge("processNode" as any, END);

// Compile and store the graph
const compiledGraph = graph.compile();
```

### Knowledge Retrieval

The Knowledge Retrieval Agent integrates with multiple services:

1. `UserContextService` - For retrieving context from the vector database
2. `RagPromptManager` - For constructing prompts with retrieved context
3. `EmbeddingService` - For generating embeddings from text queries

## Usage Examples

### Running the Agent System Demo

```typescript
import { runAgentSystemDemo } from './examples/agent-system-demo.ts';

// Run the demo
runAgentSystemDemo()
  .then(() => console.log('Demo completed'))
  .catch(error => console.error('Demo failed:', error));
```

### Creating a Custom Agent

```typescript
import { BaseAgent } from './agents/base/base-agent.ts';

export class CustomAgent extends BaseAgent {
  constructor() {
    super('Custom Agent', 'Description of custom agent');
    this.registerCapability({
      name: 'custom_capability',
      description: 'What this capability does',
      parameters: { /* parameter definitions */ }
    });
  }
  
  async execute(request: AgentRequest): Promise<AgentResponse> {
    // Implement custom logic
    return {
      output: 'Result of execution',
      artifacts: { /* any produced artifacts */ },
      metrics: this.processMetrics(startTime)
    };
  }
}
```

## Future Enhancements

1. **Additional Specialized Agents**: 
   - Text Analysis Agent
   - Data Visualization Agent
   - Document Summarization Agent
   - Collaborative Task Agent

2. **Enhanced Orchestration**:
   - Multi-agent parallel workflows
   - Conditional branching based on agent outputs
   - Workflow templates for common tasks

3. **Integration Capabilities**:
   - Connect with external APIs and services
   - Support for multi-modal input/output
   - Long-term memory and persistence

4. **Self-improvement Mechanism**:
   - Performance analysis of agent outputs
   - Feedback loops for continuous improvement
   - Adaptive agent selection based on historical performance 