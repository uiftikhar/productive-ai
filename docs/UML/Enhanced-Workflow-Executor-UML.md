@startuml Enhanced Workflow Executor Architecture

!define RECTANGLE class
!define INTERFACE interface

' Color definitions
!define DARK_BLUE #1a3263
!define LIGHT_BLUE #4c7bcf 
!define TEAL #009688
!define PURPLE #673ab7
!define ORANGE #ff9800
!define GREEN #4caf50
!define RED #f44336
!define GRAY #607d8b

' Apply a modern style
skinparam shadowing false
skinparam DefaultFontName "Arial"
skinparam DefaultFontSize 14
skinparam ClassFontStyle bold
skinparam Padding 5
skinparam RoundCorner 8

skinparam class {
  BackgroundColor white
  ArrowColor DARK_BLUE
  BorderColor DARK_BLUE
  BorderThickness 2
}

skinparam package {
  BackgroundColor white
  BorderColor GRAY
  BorderThickness 2
}

skinparam note {
  BackgroundColor #fffacd
  BorderColor GRAY
}

' Define packages
package "Orchestration Core" as OrchCore {
  RECTANGLE EnhancedWorkflowExecutorService {
    + executeWorkflow(workflowDefinition, input, options): Promise<Result>
    + createAdaptiveQueryWorkflow(): WorkflowDefinition
    + discoverAgentsForCapability(capability, criteria): Promise<Agent[]>
    + trackMetrics(workflowId, metrics): void
    + handleError(workflowId, stepId, error): void
    - executeStep(step, context): Promise<StepResult>
    - resolveAgentForStep(step): Promise<Agent>
  }
  
  RECTANGLE WorkflowDefinition {
    + steps: WorkflowStep[]
    + edges: WorkflowEdge[]
    + metadata: WorkflowMetadata
    + addStep(step): void
    + addEdge(fromStep, toStep, condition?): void
    + validateDAG(): boolean
  }
  
  RECTANGLE WorkflowStep {
    + id: string
    + capability: string
    + agentId?: string
    + input: Record<string, any>
    + retryPolicy?: RetryPolicy
    + execute(context): Promise<StepResult>
  }
  
  RECTANGLE WorkflowExecutionContext {
    + workflowId: string
    + globalState: Map<string, any>
    + stepResults: Map<string, StepResult>
    + startTime: Date
    + options: ExecutionOptions
    + updateState(key, value): void
    + getStepResult(stepId): StepResult | null
  }
}

package "Agent Management" as AgentMgmt {
  INTERFACE IAgentRegistry {
    + registerAgent(agent): void
    + unregisterAgent(agentId): void
    + getAgent(agentId): Agent | null
    + getAllAgents(): Agent[]
  }
  
  RECTANGLE AgentRegistryService {
    + registerAgent(agent): void
    + unregisterAgent(agentId): void
    + getAgent(agentId): Agent | null
    + getAllAgents(): Agent[]
  }
  
  RECTANGLE AgentDiscoveryService {
    + discoverAgentsForCapability(capability, criteria): Promise<Agent[]>
    + rankAgentsByPerformance(agents, criteria): Agent[]
    + getCapabilityCatalog(): Record<string, string[]>
  }
  
  RECTANGLE BaseAgent {
    + id: string
    + capabilities: string[]
    + metadata: AgentMetadata
    + execute(input, context): Promise<AgentResult>
    + getDescription(): string
  }
}

package "Communication" as Comm {
  RECTANGLE CommunicationBusService {
    + publishMessage(topic, message): void
    + subscribe(topic, callback): Subscription
    + unsubscribe(subscription): void
    + createMessageChannel(channelId): MessageChannel
  }
  
  RECTANGLE MessageChannel {
    + id: string
    + send(message): void
    + receive(): Promise<Message>
    + addMiddleware(middleware): void
    + close(): void
  }
  
  RECTANGLE Message {
    + id: string
    + sender: string
    + recipient?: string
    + type: string
    + content: any
    + metadata: MessageMetadata
    + timestamp: Date
  }
}

package "Monitoring" as Monitor {
  RECTANGLE MetricsCollectorService {
    + recordMetric(name, value, tags): void
    + startTimer(name, tags): Timer
    + getMetrics(): Metrics
    + exportMetrics(format): string
  }
  
  RECTANGLE WorkflowTracer {
    + startWorkflowTrace(workflowId): TraceContext
    + startStepTrace(traceCtx, stepId): void
    + endStepTrace(traceCtx, stepId, result): void
    + endWorkflowTrace(traceCtx, result): void
    + getTrace(workflowId): WorkflowTrace
  }
  
  RECTANGLE Logger {
    + debug(message, context?): void
    + info(message, context?): void
    + warn(message, context?): void
    + error(message, error?, context?): void
  }
}

' Example domain-specific agent
package "Agent Implementations" as Agents {
  RECTANGLE KnowledgeRetrievalAgent {
    + capabilities: ["knowledge_retrieval", "context_augmentation"]
    + execute(input, context): Promise<AgentResult>
    - retrieveKnowledge(query): Promise<KnowledgeItems[]>
    - rankResults(items, query): KnowledgeItems[]
  }
  
  RECTANGLE ResponseGenerationAgent {
    + capabilities: ["response_generation", "summarization"]
    + execute(input, context): Promise<AgentResult>
    - generateResponse(query, context): Promise<string>
    - streamResponse(callback): void
  }
}

' Relationships
EnhancedWorkflowExecutorService --> WorkflowDefinition: creates
EnhancedWorkflowExecutorService --> WorkflowExecutionContext: uses
EnhancedWorkflowExecutorService --> IAgentRegistry: uses
EnhancedWorkflowExecutorService --> AgentDiscoveryService: discovers agents through
EnhancedWorkflowExecutorService --> CommunicationBusService: coordinates using
EnhancedWorkflowExecutorService --> MetricsCollectorService: tracks metrics with
EnhancedWorkflowExecutorService --> Logger: logs using

WorkflowDefinition "1" *-- "many" WorkflowStep: contains
AgentRegistryService ..|> IAgentRegistry: implements
AgentDiscoveryService --> AgentRegistryService: uses
BaseAgent <|-- KnowledgeRetrievalAgent: extends
BaseAgent <|-- ResponseGenerationAgent: extends

WorkflowStep --> BaseAgent: executed by
CommunicationBusService "1" *-- "many" MessageChannel: manages
CommunicationBusService "1" *-- "many" Message: transmits
WorkflowTracer --> MetricsCollectorService: uses

' Notes
note right of EnhancedWorkflowExecutorService
  Core component that orchestrates
  the execution of agent workflows
end note

note bottom of AgentDiscoveryService
  Discovers and ranks agents
  based on capabilities and
  performance metrics
end note

note bottom of CommunicationBusService
  Facilitates asynchronous
  message passing between
  agents and services
end note

' Legend
legend
  |= Component |= Description |
  |<back:LIGHT_BLUE>   </back>| Orchestration Core |
  |<back:GREEN>   </back>| Agent Management |
  |<back:ORANGE>   </back>| Communication |
  |<back:PURPLE>   </back>| Monitoring |
  |<back:TEAL>   </back>| Agent Implementations |
endlegend

@enduml
