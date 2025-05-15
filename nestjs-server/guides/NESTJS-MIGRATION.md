# NestJS Migration Guide for Meeting Analysis System

## Overview

This guide outlines a comprehensive plan for migrating our current meeting analysis system to a NestJS-based architecture. The migration focuses on leveraging NestJS's dependency injection system to simplify our complex factory patterns while maintaining the LangGraph-based agent architecture outlined in the DEVELOPER-GUIDE.

## Why NestJS?

NestJS offers several advantages over our current implementation:

1. **Automatic Dependency Injection**: Eliminates manual dependency wiring
2. **Modular Architecture**: Encourages clean separation of concerns
3. **Lifecycle Management**: Built-in hooks for initialization and cleanup
4. **Standardized Structure**: Consistent patterns for services and controllers
5. **Testing Support**: First-class testing utilities
6. **API Support**: Built-in support for REST, WebSockets, GraphQL, and more

## Migration Strategy

We'll create a new NestJS application at `server/nestJs/` rather than refactoring the existing codebase in place. This allows us to:

- Develop and test the new implementation alongside the existing one
- Migrate features incrementally
- Maintain a working system throughout the migration

## Phase 1: Foundation and Infrastructure (2-3 weeks)

### Milestone 1.1: Project Setup

- [x] Initialize new NestJS project at `server/nestJs/`
- [x] Set up project structure following NestJS best practices
- [x] Configure TypeScript, linting, and testing
- [x] Establish CI/CD pipeline for the new project

### Milestone 1.2: Core Infrastructure

- [x] Implement configuration management (using `@nestjs/config`)
- [x] Set up logging module (leveraging `nestjs-pino` or similar)
- [x] Establish database connections and repositories
- [x] Create file storage service for transcript and analysis results
- [x] Implement state persistence adapters for LangGraph

### Milestone 1.3: Authentication and Authorization

- [x] Port authentication mechanisms to NestJS auth module
- [x] Implement guards for protected routes
- [x] Set up session management
- [x] Create user service and module

## Phase 2: Agent Core Implementation (3-4 weeks)

### Milestone 2.1: LangGraph Integration

- [x] Create LangGraph module for core functionality
- [x] Implement LLM service providers (for OpenAI, Anthropic, etc.)
- [x] Set up model configuration and selection services
- [x] Create base state management infrastructure

### Milestone 2.2: Base Agent Architecture

- [x] Design agent module structure
- [x] Implement base agent classes with proper dependency injection
- [x] Create factory providers for complex agent initialization
- [x] Set up agent state management with proper lifecycle hooks

### Milestone 2.3: Tool Integration

- [x] Implement tool module for shared tools
- [x] Create tool providers with proper dependency injection
- [x] Set up tool registration and discovery
- [x] Implement tool error handling and recovery patterns

## Phase 3: Agent Specialization (3-4 weeks)

### Milestone 3.1: Specialist Agent Implementation

- [ ] Implement domain-specific agent modules:
  - [ ] Topic discovery and analysis
  - [ ] Action item extraction
  - [ ] Context integration
  - [ ] Sentiment analysis
  - [ ] Participation dynamics
  - [ ] Summary synthesis
- [ ] Create specialized prompts and tools for each agent type
- [ ] Build proper injection for agent-specific dependencies

### Milestone 3.2: Supervisor Architecture

- [ ] Implement supervisor module
- [ ] Create routing service for agent coordination
- [ ] Design supervisor state management
- [ ] Implement enhanced supervisor capabilities

### Milestone 3.3: Team Formation

- [ ] Create team module for agent composition
- [ ] Implement team formation services
- [ ] Build dynamic team configuration
- [ ] Set up inter-team communication

## Phase 4: Graph Construction and Workflow (2-3 weeks)

### Milestone 4.1: Graph Definition

- [ ] Design module for graph construction
- [ ] Implement node providers for different agent types
- [ ] Create edge definition services
- [ ] Set up conditional routing

### Milestone 4.2: Workflow Patterns

- [ ] Implement workflow module
- [ ] Create services for sequential and conditional workflows
- [ ] Build workflow composition patterns
- [ ] Implement error recovery for workflows

### Milestone 4.3: Persistence and Resumability

- [ ] Implement state persistence for ongoing analyses
- [ ] Create services for workflow resumption
- [ ] Build workflow checkpointing
- [ ] Implement retry mechanisms for failed steps

## Phase 5: API and Integration (2-3 weeks)

### Milestone 5.1: REST API

- [ ] Implement controllers for meeting analysis
- [ ] Create DTOs for request/response types
- [ ] Set up validation using class-validator
- [ ] Implement proper error handling and response formatting

### Milestone 5.2: Real-time Communication

- [ ] Set up WebSocket gateway for real-time updates
- [ ] Implement event publishing for analysis progress
- [ ] Create subscription mechanisms for clients
- [ ] Build real-time visualization data streams

### Milestone 5.3: External Integrations

- [ ] Port existing integrations to NestJS modules
- [ ] Implement proper authentication for external services
- [ ] Set up webhook handlers
- [ ] Create integration testing infrastructure

## Phase 6: Testing and Optimization (2-3 weeks)

### Milestone 6.1: Unit and Integration Testing

- [ ] Set up comprehensive test suite
- [ ] Implement testing utilities and fixtures
- [ ] Create mocks for external dependencies
- [ ] Add test coverage reporting

### Milestone 6.2: Performance Optimization

- [ ] Implement caching strategies
- [ ] Optimize database queries
- [ ] Enhance parallel execution paths
- [ ] Benchmark and profile critical components

### Milestone 6.3: Documentation and Examples

- [ ] Create comprehensive API documentation
- [ ] Document internal architecture
- [ ] Provide example usage patterns
- [ ] Create developer guides for extensions

## Implementation Details

### Module Structure

Our NestJS application will be organized into these primary modules:

```
- AppModule (root)
  - ConfigModule
  - DatabaseModule
  - AuthModule
  - LangGraphModule
    - LlmModule
    - ToolModule
    - StateModule
  - AgentModule
    - BaseAgentModule
    - SpecialistAgentModule
    - SupervisorModule
    - TeamModule
  - WorkflowModule
    - GraphModule
    - EdgeModule
    - NodeModule
  - AnalysisModule
    - TranscriptModule
    - ResultModule
    - VisualizationModule
  - ApiModule
    - RestModule
    - WebsocketModule
    - IntegrationModule
```

### Converting Factory Pattern to NestJS Providers

The current `ServiceFactory` and team factory patterns will be replaced with NestJS providers:

#### Current Approach (ServiceFactory):

```typescript
export class ServiceFactory {
  public static createMeetingAnalysisSupervisorService(
    configOptions: MeetingAnalysisSupervisorOptions,
  ): MeetingAnalysisSupervisorService {
    // Complex initialization logic with many dependencies
    // ...
    return new MeetingAnalysisSupervisorService(/*...*/);
  }
}
```

#### NestJS Approach:

```typescript
// Module definition
@Module({
  imports: [ConfigModule, LlmModule, ToolModule],
  providers: [
    {
      provide: MeetingAnalysisSupervisorService,
      useFactory: (
        configService: ConfigService,
        llmService: LlmService,
        toolRegistryService: ToolRegistryService,
        // other dependencies
      ) => {
        const config = configService.get('meetingAnalysis');
        return new MeetingAnalysisSupervisorService(
          llmService,
          toolRegistryService,
          // other dependencies
          config
        );
      },
      inject: [ConfigService, LlmService, ToolRegistryService, /* other deps */],
    },
    // Other providers
  ],
  exports: [MeetingAnalysisSupervisorService],
})
export class SupervisorModule {}
```

### Agent Implementation with DI

Agents will be implemented as injectable services:

```typescript
@Injectable()
export class TopicAnalysisAgent extends BaseMeetingAnalysisAgent {
  constructor(
    private readonly llmService: LlmService,
    private readonly toolRegistryService: ToolRegistryService,
    private readonly promptService: PromptService,
    @Inject(CONFIG_TOKEN) private readonly config: TopicAnalysisConfig
  ) {
    super();
  }

  // Agent implementation
}
```

### Graph Construction in NestJS

Graphs will be built using provider factories:

```typescript
@Injectable()
export class MeetingAnalysisGraphService {
  constructor(
    @Inject(forwardRef(() => TopicAnalysisAgent))
    private readonly topicAgent: TopicAnalysisAgent,
    
    @Inject(forwardRef(() => ActionItemAgent))
    private readonly actionItemAgent: ActionItemAgent,
    
    // Other agent injections
    
    private readonly stateService: StateService,
    private readonly configService: ConfigService
  ) {}

  createAnalysisGraph(): StateGraph<MeetingAnalysisState> {
    const graph = new StateGraph({
      channels: MeetingAnalysisState,
    });

    // Add nodes
    graph
      .addNode("topicAnalysis", this.createTopicAnalysisNode())
      .addNode("actionItemExtraction", this.createActionItemNode())
      // Other nodes
      
    // Add edges
    graph
      .addEdge(START, "topicAnalysis")
      .addEdge("topicAnalysis", "actionItemExtraction")
      // Other edges
      
    return graph;
  }

  private createTopicAnalysisNode() {
    return (state: MeetingAnalysisState) => {
      return this.topicAgent.processState(state);
    };
  }
  
  // Other node factory methods
}
```

## Testing Strategy

NestJS provides excellent testing utilities that simplify testing complex systems:

```typescript
describe('TopicAnalysisAgent', () => {
  let topicAgent: TopicAnalysisAgent;
  let llmService: LlmService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TopicAnalysisAgent,
        {
          provide: LlmService,
          useValue: { /* mock implementation */ },
        },
        {
          provide: ToolRegistryService,
          useValue: { /* mock implementation */ },
        },
        {
          provide: PromptService,
          useValue: { /* mock implementation */ },
        },
        {
          provide: CONFIG_TOKEN,
          useValue: { /* mock config */ },
        },
      ],
    }).compile();

    topicAgent = moduleRef.get<TopicAnalysisAgent>(TopicAnalysisAgent);
    llmService = moduleRef.get<LlmService>(LlmService);
  });

  it('should extract topics from transcript', async () => {
    // Test implementation
  });
});
```

## Conclusion

This migration will significantly improve our codebase by:

1. **Simplifying Dependency Management**: Eliminating complex factory patterns
2. **Enhancing Modularity**: Creating clear boundaries between system components
3. **Improving Testing**: Making it easier to test individual components
4. **Standardizing Structure**: Following industry-standard patterns
5. **Enabling Scalability**: Building a foundation for future growth

The estimated timeline for the complete migration is 12-16 weeks, but the phased approach allows for incremental deployment and testing throughout the process. 