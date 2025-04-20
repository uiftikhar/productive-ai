# Creating New Agents

This guide provides detailed instructions for creating new agents using the standardized agent architecture.

## Prerequisites

Before creating a new agent, ensure you have:

1. Identified the specific capabilities your agent will provide
2. Determined what external services or dependencies your agent will need
3. Considered how your agent will fit into the overall agent ecosystem
4. Reviewed existing agents to avoid duplication of functionality

## Step 1: Extend the BaseAgent Class

All new agents should extend the `BaseAgent` abstract class:

```typescript
import { BaseAgent } from '../base/base-agent';
import { AgentRequest, AgentResponse } from '../interfaces/base-agent.interface';
import { Logger } from '../../shared/logger/logger.interface';

export class MyCustomAgent extends BaseAgent {
  constructor(
    options: {
      id?: string;
      name?: string;
      description?: string;
      logger?: Logger;
      // Add any other dependencies your agent needs
      someService?: SomeService;
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
    
    // Store any additional dependencies
    this.someService = options.someService;
    
    // Register capabilities - these define what your agent can do
    this.registerCapability({
      name: 'custom-capability',
      description: 'Performs a custom operation',
    });
  }
  
  /**
   * Initialize the agent
   * This is called before the agent can be used
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    // Always call the parent initialize first
    await super.initialize(config);
    
    // Add any agent-specific initialization
    // For example, loading models, connecting to services, etc.
    try {
      // Your initialization code here
      this.logger.info('Custom agent initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize custom agent', { error });
      throw error;
    }
  }
  
  /**
   * Execute the agent's core functionality
   * This is where your agent's business logic goes
   */
  protected async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    try {
      // Validate the request
      if (!request.input) {
        throw new Error('Input is required');
      }
      
      // Execute agent-specific logic
      const result = await this.processInput(request.input);
      
      // Return a standardized response
      return {
        output: result,
        metrics: {
          processingTime: Date.now() - this.startTime,
        }
      };
    } catch (error) {
      // The BaseAgent will handle error logging and status updates
      throw error;
    }
  }
  
  /**
   * Agent-specific processing method
   * Break down your logic into smaller, testable methods
   */
  private async processInput(input: string): Promise<string> {
    // Implementation details for your agent
    return `Processed: ${input}`;
  }
}
```

## Step 2: Create a Factory Method

Add a factory method to `AgentFactory` to create instances of your agent:

```typescript
// In src/agents/factories/agent-factory.ts

// Add your new agent import
import { MyCustomAgent } from '../specialized/my-custom-agent';

export class AgentFactory {
  // Add to the existing class
  
  /**
   * Create a custom agent with proper dependency injection
   */
  createCustomAgent(options: {
    id?: string;
    name?: string;
    description?: string;
    someService?: SomeService;
    wrapWithWorkflow?: boolean;
    tracingEnabled?: boolean;
  } = {}): MyCustomAgent | AgentWorkflow<MyCustomAgent> {
    // Create the agent with dependencies from the factory
    const agent = new MyCustomAgent({
      id: options.id,
      name: options.name,
      description: options.description,
      logger: this.logger,
      someService: options.someService || this.getSomeService(),
    });
    
    // Optionally wrap with a workflow
    if (options.wrapWithWorkflow) {
      return this.createAgentWorkflow(agent, {
        tracingEnabled: options.tracingEnabled,
      });
    }
    
    return agent;
  }
  
  // Helper method to get dependencies
  private getSomeService(): SomeService {
    // Logic to create or get the service
    return new SomeService();
  }
}
```

## Step 3: Create Tests for Your Agent

Create comprehensive tests for your agent:

```typescript
// In src/agents/tests/my-custom-agent.test.ts

import { MyCustomAgent } from '../specialized/my-custom-agent';
import { AgentRequest } from '../interfaces/base-agent.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { MockSomeService } from './mocks/mock-some-service';

describe('MyCustomAgent', () => {
  let agent: MyCustomAgent;
  let mockService: MockSomeService;
  
  beforeEach(() => {
    mockService = new MockSomeService();
    agent = new MyCustomAgent({
      logger: new ConsoleLogger(),
      someService: mockService,
    });
  });
  
  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await agent.initialize();
      expect(agent.getInitializationStatus()).toBe(true);
    });
  });
  
  describe('capabilities', () => {
    it('should register capabilities', () => {
      const capabilities = agent.getCapabilities();
      expect(capabilities.length).toBeGreaterThan(0);
      expect(capabilities.some(c => c.name === 'custom-capability')).toBe(true);
    });
    
    it('should handle the correct capability', () => {
      expect(agent.canHandle('custom-capability')).toBe(true);
      expect(agent.canHandle('unknown-capability')).toBe(false);
    });
  });
  
  describe('execution', () => {
    it('should process input correctly', async () => {
      const request: AgentRequest = {
        input: 'test input',
      };
      
      const response = await agent.execute(request);
      expect(response.output).toContain('Processed: test input');
    });
    
    it('should handle errors', async () => {
      const request: AgentRequest = {
        input: '',
      };
      
      await expect(agent.execute(request)).rejects.toThrow('Input is required');
    });
  });
});
```

## Step 4: Register Your Agent

Register your agent with the `AgentRegistryService`:

```typescript
import { AgentRegistryService } from '../services/agent-registry.service';
import { AgentFactory } from '../factories/agent-factory';

// Create the factory
const factory = new AgentFactory({
  logger: new ConsoleLogger(),
  // Other dependencies
});

// Create the agent
const customAgent = factory.createCustomAgent({
  id: 'my-custom-agent',
  wrapWithWorkflow: true,
  tracingEnabled: true,
});

// Register with the registry
const registry = AgentRegistryService.getInstance();
registry.registerAgent(customAgent);

// Later, retrieve the agent by ID or capability
const retrievedAgent = registry.getAgent('my-custom-agent');
// OR
const agentsWithCapability = registry.findAgentsWithCapability('custom-capability');
```

## Step 5: Use Your Agent in a Workflow

Create a workflow that uses your agent:

```typescript
import { MyCustomAgent } from '../specialized/my-custom-agent';
import { AgentWorkflow } from '../../langgraph/core/workflows/agent-workflow';

// Create the agent
const agent = new MyCustomAgent({
  logger: new ConsoleLogger(),
  // Other dependencies
});

// Create the workflow
const workflow = new AgentWorkflow(agent, {
  tracingEnabled: true,
});

// Execute the workflow
async function executeWorkflow() {
  const result = await workflow.execute({
    input: "Sample input",
    capability: "custom-capability",
  });
  
  console.log('Workflow result:', result);
}
```

## Best Practices

1. **Single Responsibility**: Each agent should do one thing well
2. **Dependency Injection**: Always use constructor DI for dependencies
3. **Proper Error Handling**: Use try/catch and pass errors to the base class
4. **Comprehensive Testing**: Test initialization, capabilities, and execution paths
5. **Capability-Based Design**: Define clear capabilities that your agent provides
6. **Stateless Design**: Prefer stateless agents when possible
7. **Metrics Collection**: Track execution metrics for performance monitoring
8. **Thorough Documentation**: Document your agent's purpose, capabilities, and usage
9. **Use the Factory**: Create agents via the factory pattern instead of direct instantiation
10. **Workflow Integration**: Always use `AgentWorkflow` for execution in production code

## Example Agents

For reference, these existing agents show best practices:

1. **KnowledgeRetrievalAgent**: Shows RAG-based knowledge retrieval
2. **MeetingAnalysisAgent**: Shows complex document processing
3. **DecisionTrackingAgent**: Shows integration with external services

## Common Pitfalls

1. **Direct Agent Execution**: Always use `AgentWorkflow` for execution, not direct agent execution
2. **Missing Error Handling**: Ensure proper error handling in `executeInternal`
3. **Incomplete Initialization**: Always call `super.initialize()` in your initialize method
4. **Hard-coded Dependencies**: Use DI instead of creating dependencies internally
5. **Missing Capability Registration**: Register all capabilities your agent provides
6. **Ignoring State Management**: Use the built-in state management from `BaseAgent`
7. **Skipping Metrics**: Use the metrics system to track performance

## Additional Resources

- [BaseAgentInterface Documentation](../interfaces/base-agent.interface.ts)
- [BaseAgent Implementation](../base/base-agent.ts)
- [AgentWorkflow Documentation](../../langgraph/core/workflows/agent-workflow.ts)
- [MIGRATION-PLAN.md](./MIGRATION-PLAN.md) - The architecture background 