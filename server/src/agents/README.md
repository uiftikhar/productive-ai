# Productive AI - Agent Architecture

This directory contains the agent implementations for the Productive AI platform, featuring a modern, extensible architecture for building intelligent agents.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [LangGraph Integration](#langgraph-integration)
4. [Creating New Agents](#creating-new-agents)
5. [Specialized Agents](#specialized-agents)
6. [Resource Management](#resource-management)
7. [Agent Factory Pattern](#agent-factory-pattern)
8. [Best Practices](#best-practices)
9. [Technology Stack](#technology-stack)

## Architecture Overview

The Productive AI agent architecture follows these key design principles:

- **Standardization**: All agents implement the `BaseAgentInterface`
- **Composability**: Agents can be combined and orchestrated via workflows
- **Dependency Injection**: Dependencies are passed through constructor options
- **Capability-Based Design**: Agents declare their capabilities for discovery
- **Resource Management**: Explicit cleanup methods prevent memory leaks
- **Observable**: Built-in metrics and tracing for performance monitoring

The architecture supports both standalone agent execution and complex multi-agent workflows through LangGraph integration.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Application Layer                              │
└───────────┬─────────────────────────────────────┬───────────────────────┘
            │                                     │
            ▼                                     ▼
┌───────────────────────────┐         ┌───────────────────────────────────┐
│                           │         │                                   │
│     Agent Workflows       │         │      Direct Agent Execution       │
│                           │         │                                   │
└───────────┬───────────────┘         └───────────────┬───────────────────┘
            │                                         │
            ▼                                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│                             Agent Factory                                 │
│                                                                           │
└───────────┬─────────────────────────────────────────────┬─────────────────┘
            │                                             │
            ▼                                             ▼
┌───────────────────────────┐                   ┌───────────────────────────┐
│                           │                   │                           │
│    Specialized Agents     │                   │      Service Layer        │
│                           │                   │                           │
└───────────┬───────────────┘                   └───────────┬───────────────┘
            │                                               │
            ▼                                               ▼
┌───────────────────────────┐                   ┌───────────────────────────┐
│                           │                   │                           │
│       Base Agent          │                   │     Integration Layer     │
│                           │                   │                           │
└───────────────────────────┘                   └───────────────────────────┘
```

## Core Components

### BaseAgent Abstract Class

The `BaseAgent` abstract class provides common functionality for all agents:

- Built-in metrics collection
- Error handling and logging
- Status tracking
- Capability registration
- Lifecycle management (initialize, execute, terminate)

```typescript
export abstract class BaseAgent implements WorkflowCompatibleAgent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  
  // Get all capabilities this agent provides
  getCapabilities(): AgentCapability[] {...}
  
  // Check if agent can handle a specific capability
  canHandle(capability: string): boolean {...}
  
  // Initialize the agent with runtime configuration
  async initialize(config?: Record<string, any>): Promise<void> {...}
  
  // Execute the agent with the given request
  async execute(request: AgentRequest): Promise<AgentResponse> {...}
  
  // Abstract method that must be implemented by all agents
  protected abstract executeInternal(request: AgentRequest): Promise<AgentResponse>;
}
```

### Agent Interface Hierarchy

The agent interfaces provide a clear contract for all agent implementations:

- `BaseAgentInterface`: Core interface all agents implement
- `WorkflowCompatibleAgent`: Extended interface for LangGraph workflow compatibility

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
```

### Service Layer

The agent architecture includes several services for agent management:

1. **AgentRegistryService**: Central registry for agent discovery
2. **AgentTaskExecutorService**: Executes agent tasks with timeout management
3. **TaskPlanningService**: Creates and manages task plans with dependencies

## LangGraph Integration

The agent architecture integrates with LangGraph for workflow management, providing:

- **State Management**: Structured workflow state
- **Error Handling**: Robust error recovery
- **Observability**: Tracing for each step
- **Multi-Agent Coordination**: Complex workflows with multiple agents

### Agent Workflow

The `AgentWorkflow` class wraps agents in LangGraph's state machine:

```typescript
export class AgentWorkflow<T extends BaseAgent> extends BaseWorkflow<AgentExecutionState, AgentRequest, AgentResponse> {
  constructor(
    protected readonly agent: T,
    options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
    } = {},
  ) {
    super({
      tracingEnabled: options.tracingEnabled,
      logger: options.includeStateInLogs ? undefined : undefined,
    });
  }
  
  // Creates a state graph for the agent workflow
  protected createStateGraph(schema: ReturnType<typeof this.createStateSchema>): StateGraph<any> {
    // ...workflow definition with initialize, pre_execute, execute, post_execute, etc.
  }
}
```

### SupervisorAgent for Multi-Agent Workflows

The `SupervisorAgent` enables complex multi-agent workflows by:

1. Coordinating multiple specialized agents
2. Assigning tasks based on agent capabilities
3. Managing execution order (sequential, parallel, priority-based)
4. Handling error recovery and retry logic
5. Tracking progress of tasks and sub-tasks

## Creating New Agents

To create a new agent:

1. **Extend BaseAgent**: Implement the `executeInternal` method
2. **Register Capabilities**: Define what your agent can do 
3. **Create Factory Method**: Add to `AgentFactory` for easy instantiation
4. **Add Tests**: Create comprehensive tests for your agent
5. **Register with AgentRegistry**: Make your agent discoverable

Example implementation:

```typescript
export class MyCustomAgent extends BaseAgent {
  constructor(
    options: {
      id?: string;
      name?: string;
      description?: string;
      logger?: Logger;
      // Add custom dependencies
    } = {}
  ) {
    super(
      options.id || 'my-custom-agent',
      options.name || 'My Custom Agent',
      options.description || 'This agent does something specific',
      {
        logger: options.logger,
      }
    );
    
    // Register capabilities
    this.registerCapability({
      name: 'custom-capability',
      description: 'Performs a custom operation',
    });
  }
  
  // Implementation of the abstract method
  protected async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    // Your agent logic here
    return {
      output: `Processed: ${request.input}`,
      metrics: {
        executionTimeMs: Date.now() - startTime,
      }
    };
  }
}
```

## Specialized Agents

The platform includes several specialized agents:

1. **MeetingAnalysisAgent**: Analyzes meeting transcripts using RAG
2. **KnowledgeRetrievalAgent**: Retrieves knowledge from multiple context sources
3. **DocumentRetrievalAgent**: Stores and retrieves documents using vector embeddings
4. **DecisionTrackingAgent**: Tracks decisions across meetings
5. **SupervisorAgent**: Coordinates multiple agents for complex workflows

Each specialized agent implements specific capabilities:

```typescript
// Example from MeetingAnalysisAgent
this.registerCapability({
  name: 'analyze-transcript-chunk',
  description: 'Analyze a chunk of a meeting transcript',
});

this.registerCapability({
  name: 'generate-final-analysis',
  description: 'Generate a comprehensive analysis from partial analyses',
});
```

## Resource Management

The agent architecture includes robust resource management to prevent memory leaks and ensure clean application shutdown:

### Cleanup Methods

Services and agents that manage resources implement explicit cleanup methods:

```typescript
// Example from AgentTaskExecutorService
public cleanup(): void {
  // Clear all active executions
  for (const [executionId, execution] of this.activeExecutions.entries()) {
    if (execution.timeout) {
      clearTimeout(execution.timeout);
    }
    this.activeExecutions.delete(executionId);
  }
  
  // Remove all event listeners
  this.eventEmitter.removeAllListeners();
  
  // Clear event handlers
  this.eventHandlers.clear();
  
  this.logger.info('AgentTaskExecutorService resources cleaned up');
}
```

### Timer Management

All background timers use the `unref()` method to prevent keeping the Node.js process alive:

```typescript
this.pollingInterval = setInterval(() => {
  this.pollExternalService();
}, 30000).unref(); // unref() prevents keeping the process alive
```

### ResourceManager Integration

The `ResourceManager` provides centralized control of resource cleanup:

```typescript
import { ResourceManager } from '../../shared/utils/resource-manager';

// In application startup code
const resourceManager = ResourceManager.getInstance();
resourceManager.register(
  'agent-task-executor', 
  () => agentTaskExecutor.cleanup(),
  { 
    priority: 70, 
    description: 'Agent task executor cleanup'
  }
);
```

## Agent Factory Pattern

The `AgentFactory` centralizes agent creation with proper dependency injection:

```typescript
const factory = new AgentFactory({
  logger,
  openAIConnector,
  embeddingService,
});

// Create an agent with workflow wrapping
const knowledgeAgent = factory.createKnowledgeRetrievalAgent({
  id: 'knowledge-agent-1',
  wrapWithWorkflow: true,
  tracingEnabled: true,
});
```

This pattern ensures:

1. **Consistent Configuration**: All agents are created with proper dependencies
2. **Automatic Registration**: Agents are registered with `AgentRegistryService`
3. **Workflow Integration**: Optional wrapping with `AgentWorkflow`
4. **Resource Sharing**: Reuse of expensive connections and services

## Best Practices

1. **Dependency Injection**: Pass dependencies through constructor options
2. **Capability-based Design**: Define clear capabilities using `registerCapability`
3. **Error Handling**: Use the built-in error handling in `BaseAgent`
4. **Metrics Collection**: Use the metrics tracking provided by `BaseAgent`
5. **Stateless Design**: Prefer stateless agent designs where possible
6. **Service Integration**: Use the connectors from the `integrations/` directory
7. **Repository Pattern**: Follow the repository pattern for external service interactions
8. **Use the Registry**: Register agents with `AgentRegistryService` for discovery
9. **Resource Cleanup**: Implement cleanup methods for agents that manage resources
10. **Unref Timers**: Always use `unref()` for background timers

### Testing Practices

1. **Unit Test Agents**: Test agent methods in isolation
2. **Mock Dependencies**: Use mock implementations of services
3. **Test Capabilities**: Verify each capability functions correctly
4. **Resource Leak Testing**: Use Jest's `--detectOpenHandles` flag

```
yarn test -- --detectOpenHandles src/agents/tests/my-agent.test.ts
```

## Technology Stack

The agent architecture leverages several key technologies:

- **TypeScript**: Type-safe implementation with interfaces and generics
- **LangChain.js**: Foundation for agent interactions with LLMs
- **LangGraph**: Workflow management and state machine implementation
- **OpenAI API**: Default LLM provider for agent intelligence
- **Pinecone**: Vector database for RAG implementations
- **Node.js EventEmitter**: Event-based communication between components
- **Jest**: Testing framework for unit and integration tests

### Integration Points

Agents integrate with various systems:

1. **Vector Databases**: For retrieval-augmented generation (RAG)
2. **LLM Providers**: For natural language processing capabilities
3. **Document Processing**: For analysis of documents and transcripts
4. **External APIs**: For accessing external data sources
5. **Storage Systems**: For persisting agent results and state


# Specialized Agents

This directory contains specialized agent implementations that extend the base `BaseAgent` class, each designed for specific tasks and domains within the Productive AI platform.

## Architecture Overview

Specialized agents build upon the base agent framework to provide domain-specific capabilities. They follow a capability-based architecture where each agent registers specific capabilities it can handle.

```
┌───────────────────────────────────────────────────────────────────────┐
│                          Client Applications                          │
└───────────────┬───────────────────────────────────────┬───────────────┘
                │                                       │
                ▼                                       ▼
┌───────────────────────────┐               ┌───────────────────────────┐
│   API / Endpoint Layer    │◄──────────────┤    User Interface Layer   │
└───────────────┬───────────┘               └───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                      Specialized Agent Orchestrator                   │
└───────────┬───────────────────────────────────────────┬───────────────┘
            │                                           │
            ▼                                           ▼
┌───────────────────────────┐               ┌───────────────────────────┐
│   Meeting Analysis Agent  │◄─────Channel──┤   Decision Tracking Agent │
└─┬─────────────────────────┘               └─────────────────────────┬─┘
```

## Available Specialized Agents

### 1. MeetingAnalysisAgent

The `MeetingAnalysisAgent` analyzes meeting transcripts to extract key information.

#### Capabilities

- `analyze-transcript-chunk`: Analyze a chunk of a meeting transcript
- `generate-final-analysis`: Generate a comprehensive analysis from partial analyses
- `extract-action-items`: Extract action items and their owners
- `extract-topics`: Extract main topics discussed
- `extract-decisions`: Extract decisions made during a meeting

#### Retrieval-Augmented Generation (RAG)

The agent uses RAG functionality to enhance analysis with relevant context:

1. **Embedding Generation**: Uses `IEmbeddingService` to generate embeddings
2. **Context Retrieval**: Retrieves relevant meeting content from vector storage
3. **Context Storage**: Stores analysis results with proper embeddings
4. **Contextual Analysis**: Incorporates related content from previous meetings

#### Usage Example

```typescript
import { getDefaultAgentFactory } from '../factories/agent-factory';

// Create the agent using the factory
const factory = getDefaultAgentFactory();
const meetingAnalysisAgent = factory.createMeetingAnalysisAgent({
  id: 'meeting-analysis-agent-1',
  name: 'Meeting Analysis Agent',
  description: 'Analyzes meeting transcripts with RAG capabilities'
});

// Initialize the agent
await meetingAnalysisAgent.initialize();

// Process a transcript chunk with RAG
const chunkResult = await meetingAnalysisAgent.execute({
  input: transcriptChunk,
  capability: 'analyze-transcript-chunk',
  parameters: {
    userId: 'user123',
    meetingId: 'meeting123',
    meetingTitle: 'Weekly Planning Meeting',
    chunkIndex: 0,
    totalChunks: 3,
    storeInContext: true,
    documentIds: ['prev-meeting-1', 'prev-meeting-2']
  }
});
```

### 2. SupervisorAgent

The `SupervisorAgent` provides a coordination layer for multi-agent systems, enabling task planning, assignment, and orchestration.

#### Capabilities

- `team-management`: Add, remove, and configure team members
- `task-assignment`: Assign tasks to appropriate team members
- `work-coordination`: Coordinate execution of multiple tasks across team members
- `progress-tracking`: Track progress of tasks and overall goals
- `task-planning`: Create and manage task plans with dependencies

#### Integration Patterns

##### LangGraph Workflow (Recommended)

```typescript
import { SupervisorAgent } from '../agents/specialized/supervisor-agent';
import { SupervisorAdapter } from '../langgraph/core/adapters/supervisor-adapter';

// Create specialized agents
const researchAgent = new ResearchAgent();
const analysisAgent = new AnalysisAgent();

// Create supervisor with team members
const supervisor = new SupervisorAgent({
  defaultTeamMembers: [
    { agent: researchAgent, role: 'Researcher', priority: 8, active: true },
    { agent: analysisAgent, role: 'Analyst', priority: 6, active: true },
  ],
});

// Create the workflow adapter
const adapter = new SupervisorAdapter(supervisor);

// Execute coordinated tasks
const result = await adapter.executeCoordinatedTask(
  'Research and analyze renewable energy trends',
  [
    {
      description: 'Research renewable energy trends',
      requiredCapabilities: ['research'],
      priority: 9
    },
    {
      description: 'Analyze research findings',
      requiredCapabilities: ['data-analysis'],
      priority: 7
    }
  ],
  'sequential' // or 'parallel' or 'prioritized'
);
```

#### Execution Strategies

The SupervisorAgent supports different execution strategies:

1. **Sequential**: For tasks with dependencies or when order matters
2. **Parallel**: For independent tasks that can run concurrently
3. **Prioritized**: For mixed-priority tasks where some are more urgent

### 3. RetrievalAgent & DocumentRetrievalAgent

The `RetrievalAgent` provides core functionality for retrieving and storing information using vector embeddings.

#### Capabilities

- `retrieve`: Retrieve relevant information based on a query
- `store`: Store information for later retrieval

The `DocumentRetrievalAgent` extends this with specific document handling capabilities:

```typescript
import { DocumentRetrievalAgent } from '../agents/specialized/retrieval-agent';

const agent = new DocumentRetrievalAgent({
  openAIConnector: new OpenAIConnector(),
  pineconeConnector: new PineconeConnector(),
  indexName: 'documents',
  namespace: 'user-documents'
});

// Store a document
const storeResult = await agent.execute({
  capability: 'store',
  input: 'Document content to store',
  parameters: {
    documentId: 'doc123',
    metadata: {
      title: 'Important Document',
      category: 'research'
    }
  }
});

// Retrieve similar documents
const retrieveResult = await agent.execute({
  capability: 'retrieve',
  input: 'Query to find similar documents',
  parameters: {
    maxResults: 5,
    filter: { category: 'research' }
  }
});
```

### 4. KnowledgeRetrievalAgent

The `KnowledgeRetrievalAgent` retrieves relevant information from the user's knowledge base across multiple context types.

#### Capabilities

- `retrieve_knowledge`: Retrieve relevant knowledge from user context
- `answer_with_context`: Generate an answer using retrieved context

```typescript
import { KnowledgeRetrievalAgent } from '../agents/specialized/knowledge-retrieval-agent';

const agent = new KnowledgeRetrievalAgent({
  openAIConnector: new OpenAIConnector(),
  embeddingService: EmbeddingServiceFactory.getService()
});

// Answer a question with contextual knowledge
const result = await agent.execute({
  capability: 'answer_with_context',
  input: 'What were the key decisions from yesterday's meeting?',
  parameters: {
    retrievalOptions: {
      contextTypes: [ContextType.MEETING, ContextType.DOCUMENT],
      maxResults: 5,
      timeRangeStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    }
  },
  context: {
    userId: 'user123',
    conversationId: 'conv456'
  }
});
```

### 5. DecisionTrackingAgent

The `DecisionTrackingAgent` identifies, categorizes, and tracks decisions across meetings.

#### Capabilities

- `identify-decisions`: Identify decisions within meeting transcripts
- `track-decisions`: Track decisions across multiple meetings
- `generate-decision-report`: Generate reports on decisions and their status
- `analyze-decision-impact`: Analyze the impact and implications of decisions

```typescript
import { DecisionTrackingAgent } from '../agents/specialized/decision-tracking-agent';

const agent = new DecisionTrackingAgent();

// Identify decisions in meeting transcript
const decisions = await agent.execute({
  capability: 'identify-decisions',
  input: meetingTranscript,
  parameters: {
    meetingId: 'meeting123',
    meetingTitle: 'Quarterly Planning'
  }
});

// Generate a decision report
const report = await agent.execute({
  capability: 'generate-decision-report',
  parameters: {
    timeRange: {
      start: new Date('2023-01-01'),
      end: new Date()
    },
    categories: ['strategic', 'financial'],
    format: 'detailed'
  }
});
```

## Resource Management in Specialized Agents

Specialized agents implement proper resource management to prevent memory leaks and ensure clean application shutdown.

### Cleanup Methods

The `AgentTaskExecutorService` used by specialized agents implements a comprehensive cleanup method:

```typescript
public cleanup(): void {
  // Clear all active executions
  for (const [executionId, execution] of this.activeExecutions.entries()) {
    if (execution.timeout) {
      clearTimeout(execution.timeout);
    }
    this.activeExecutions.delete(executionId);
  }
  
  // Remove all event listeners
  this.eventEmitter.removeAllListeners();
  
  // Clear event handlers
  this.eventHandlers.clear();
  
  this.logger.info('AgentTaskExecutorService resources cleaned up');
}
```

The `SupervisorAgent` implements additional cleanup for monitoring intervals:

```typescript
// In SupervisorAgent
public cleanup(): void {
  if (this.monitoringInterval) {
    clearInterval(this.monitoringInterval);
    this.monitoringInterval = undefined;
    this.logger.info('SupervisorAgent resources cleaned up');
  }
}
```

### Timer Management with `unref()`

Background timers in specialized agents use the `unref()` method to ensure they don't prevent the Node.js process from exiting:

```typescript
// Example from the SupervisorAgent
this.monitoringInterval = setInterval(() => {
  this.monitorAgentHealth();
}, 30000).unref();
```

### Best Practices for Resource Management

When creating or using specialized agents:

1. **Use cleanup methods**: Always call the appropriate cleanup method when an agent is no longer needed.
   ```typescript
   // When done with an agent
   await agentTaskExecutor.cleanup();
   ```

2. **Use unref() for timers**: Any background timer should use `unref()` to prevent keeping the Node.js process alive unnecessarily.
   ```typescript
   const timer = setInterval(callback, interval).unref();
   ```

3. **Register with ResourceManager**: For application-level cleanup, register agent cleanup methods with the ResourceManager.
   ```typescript
   ResourceManager.getInstance().register('agent-task-executor', 
     () => agentTaskExecutor.cleanup(),
     { priority: 80, description: 'Agent task executor cleanup' }
   );
   ```

4. **Test for resource leaks**: Use the Jest `--detectOpenHandles` flag to test for resource leaks.
   ```
   npm test -- --detectOpenHandles
   ```

## Best Practices for Multi-Agent Systems

When working with multiple specialized agents:

1. **Use the SupervisorAgent** for complex workflows requiring multiple agents
2. **Design for resilience** with proper error handling and recovery mechanisms
3. **Consider execution strategy** based on task dependencies and priorities
4. **Implement observability** with structured logging and metrics collection
5. **Set appropriate timeouts** to prevent hung tasks and resource leaks
6. **Leverage capabilities** to assign tasks to the most appropriate agents
7. **Use LangGraph workflows** for complex, multi-step agent interactions

## Testing Strategies

Test specialized agents with:

1. **Unit tests** for individual agent capabilities
2. **Integration tests** for agent interactions with external services
3. **End-to-end tests** for complete workflows
4. **Resource leak tests** using the `--detectOpenHandles` flag

```typescript
// Example test for SupervisorAgent
describe('SupervisorAgent', () => {
  let supervisor: SupervisorAgent;
  let mockAgent: BaseAgentInterface;
  
  beforeEach(() => {
    mockAgent = createMockAgent();
    supervisor = new SupervisorAgent({
      defaultTeamMembers: [
        { agent: mockAgent, role: 'Test Agent', priority: 5, active: true }
      ]
    });
  });
  
  afterEach(() => {
    // Clean up resources
    supervisor.cleanup();
  });
  
  it('should assign tasks to team members with matching capabilities', async () => {
    const result = await supervisor.execute({
      capability: 'task-assignment',
      parameters: {
        taskDescription: 'Test task',
        requiredCapabilities: ['test-capability']
      }
    });
    
    expect(result.output).toBeDefined();
    expect(mockAgent.execute).toHaveBeenCalled();
  });
});
```