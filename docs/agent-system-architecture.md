# Agent System Architecture

## Overview

The Agent System is designed as a modular and extensible framework for building AI-powered conversational and analytical capabilities. The architecture is structured in layers with clear separation of concerns, allowing for easy extension and customization.

## Key Components

### 1. Agent Registry Service

A central service that maintains a registry of available agents and their capabilities.

```typescript
import { BaseAgentInterface } from '../interfaces/base-agent.interface';

export class AgentRegistryService {
  private agents: Map<string, BaseAgentInterface> = new Map();
  
  registerAgent(agent: BaseAgentInterface): void {
    this.agents.set(agent.id, agent);
  }
  
  getAgent(id: string): BaseAgentInterface | undefined {
    return this.agents.get(id);
  }
  
  findAgentsWithCapability(capability: string): BaseAgentInterface[] {
    return Array.from(this.agents.values()).filter(agent => 
      agent.canHandle(capability)
    );
  }
}
```

### 2. Base Agent Class

An abstract base class implementing the core functionality required by all agents.

```typescript
export abstract class BaseAgent implements BaseAgentInterface {
  readonly id: string;
  
  constructor(
    readonly name: string,
    readonly description: string,
    options: {
      id?: string;
      logger?: Logger;
      llm?: ChatOpenAI;
    } = {},
  ) {
    this.id = options.id || uuidv4();
    // Initialize other properties
  }
  
  // Implement BaseAgentInterface methods
  getCapabilities(): AgentCapability[] { ... }
  canHandle(capability: string): boolean { ... }
  async initialize(config?: Record<string, any>): Promise<void> { ... }
  
  // Method to be implemented by concrete agent classes
  public abstract executeInternal(request: AgentRequest): Promise<AgentResponse>;
}
```

### 3. Master Orchestrator Agent

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

### 4. Specialized Agents

Concrete implementations of agents for specific use cases.

#### Knowledge Retrieval Agent

The `KnowledgeRetrievalAgent` specializes in retrieving and synthesizing knowledge from the user's context. It:
- Retrieves relevant information based on semantic search
- Supports multiple retrieval strategies (semantic, hybrid, recency, etc.)
- Generates contextualized answers using retrieved information
- Integrates with the RAG (Retrieval-Augmented Generation) system

```typescript
const knowledgeAgent = registry.getAgent('knowledge-retrieval');
const response = await knowledgeAgent.execute({
  input: "What was discussed in yesterday's meeting?",
  capability: "retrieve_and_synthesize",
  parameters: { 
    retrievalStrategy: "semantic",
    limit: 5
  }
});
```

#### MeetingAnalysisAgent

Specialized agent for analyzing meeting transcripts and extracting insights.

```typescript
export class MeetingAnalysisAgent extends BaseAgent {
  private ragPromptManager: RagPromptManager;
  private embeddingService: EmbeddingService;
  
  constructor(
    name: string = 'Meeting Analysis Agent',
    description: string = 'Analyzes meeting transcripts to extract key information',
    options: any = {},
  ) {
    super(name, description, options);
    
    // Register agent capabilities
    this.registerCapability({
      name: 'analyze-transcript-chunk',
      description: 'Analyze a chunk of meeting transcript'
    });
    
    this.registerCapability({
      name: 'generate-final-analysis',
      description: 'Generate comprehensive analysis from partial analyses'
    });
    
    this.registerCapability({
      name: 'extract-action-items',
      description: 'Extract action items from transcript'
    });
    
    // Initialize services
    this.embeddingService = options.embeddingService || new EmbeddingService();
    this.ragPromptManager = new RagPromptManager();
  }
  
  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    // Specialized implementation for processing meeting transcripts
    // using RAG, embeddings, and LLM calls
  }
}
```

## Architecture Diagram

The system follows a layered architecture with the following main components:

1. **Core Agent Framework**: Includes the `BaseAgentInterface`, `BaseAgent` abstract class, and the agent registry
2. **Specialized Agents**: Domain-specific agents like `MeetingAnalysisAgent`, `KnowledgeRetrievalAgent`, etc.
3. **Orchestration Layer**: Manages agent coordination, workflows, and task distribution
4. **Communication Layer**: Facilitates message passing between agents
5. **Integration Layer**: Connects agents to external systems and models

Please refer to the UML diagrams in the `/docs/UML` directory for visual representations of these components and their relationships.

```
+-------------------+      +----------------------+
|                   |      |                      |
| Client Application|----->| Master Orchestrator  |
|                   |      |                      |
+-------------------+      +----------+-----------+
                                      |
                                      | coordinates
                                      v
                 +--------------------+--------------------+
                 |                    |                    |
    +------------v---------+ +--------v---------+ +--------v-----------+
    |                      | |                  | |                    |
    | Knowledge Retrieval  | | Meeting Analysis | | Document Processing|
    |                      | |                  | |                    |
    +----------------------+ +------------------+ +--------------------+
```

## Key Interfaces

### BaseAgentInterface

```typescript
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

export interface WorkflowCompatibleAgent extends BaseAgentInterface {
  executeInternal(request: AgentRequest): Promise<AgentResponse>;
}
```

### Agent Factory

The system uses a factory pattern to create and configure agents:

```typescript
export class AgentFactory {
  createMeetingAnalysisAgent(options?: any): MeetingAnalysisAgent {
    const agent = new MeetingAnalysisAgent(
      'Meeting Analysis Agent',
      'Analyzes meeting transcripts to extract key information',
      options
    );
    return agent;
  }
  
  // Factory methods for other agent types
}
```

## Implementation Notes

- **Agent Registry**: Acts as a central service locator for all agent instances
- **Agent State Management**: Each agent maintains its own state, including messages, status, and metrics
- **LangGraph Integration**: Workflows leverage LangGraph for state management and transitions
- **LangSmith Tracing**: All agent executions are traced in LangSmith for observability
- **Extensibility**: New agents can be added by implementing the BaseAgentInterface
- **Error Handling**: Standardized error handling protocols across all agents

## Future Enhancements

1. **Extended Agent Capabilities**: Expand the range of specialized agents
2. **Advanced Orchestration**: Implement more sophisticated task planning and agent selection 
3. **Improved Knowledge Management**: Enhance vector storage and retrieval mechanisms
4. **Human-in-the-Loop**: Add capabilities for human intervention and feedback
5. **Multi-Modal Support**: Extend agents to work with various content types (images, audio)
6. **Additional Specialized Agents**: Develop agents for specific domains like code generation, data analysis, etc.
7. **Cross-agent Learning**: Enable agents to learn from each other's experiences
8. **Improved Metrics**: Enhance the metrics collection for better observability and analysis 