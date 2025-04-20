@startuml Workflow Data Flow

!theme plain
' Custom styling
skinparam BackgroundColor transparent
skinparam ComponentStyle rectangle
skinparam RectangleBackgroundColor #FAFAFA
skinparam ArrowColor #555555
skinparam rectangleBorderColor #CCCCCC
skinparam ComponentBorderColor #AAAAAA
skinparam DatabaseBorderColor #AAAAAA
skinparam DatabaseBackgroundColor #FAFAFA
skinparam NoteBackgroundColor #FFF9C4
skinparam NoteBorderColor #FFE082

' Define the components
rectangle "Client Application" as Client {
  (User Request) as Request
  (Workflow Result) as Result
}

rectangle "Enhanced Workflow Executor" as WorkflowSystem {
  rectangle "WorkflowExecutorService" as Executor {
    (executeWorkflow) as Execute
    (resolveNextSteps) as NextSteps
  }
  
  rectangle "WorkflowDefinition" as Definition {
    (Step Dependencies) as Dependencies
    (Capability Definitions) as Capabilities
  }
  
  rectangle "WorkflowExecutionContext" as Context {
    (State Store) as State
    (Intermediate Results) as Intermediate
  }
  
  database "MetricsCollector" as Metrics {
    [Execution Metrics] as ExecMetrics
    [Performance Data] as PerfData
  }
}

rectangle "Agent System" as AgentSystem {
  rectangle "AgentDiscoveryService" as Discovery {
    (Capability Matching) as CapabilityMatch
    (Performance Ranking) as Ranking
  }
  
  rectangle "Agents" as Agents {
    (KnowledgeRetrievalAgent) as KRAgent
    (ResponseGenerationAgent) as RGAgent
  }
  
  rectangle "CommunicationBusService" as CommBus {
    (Message Broker) as Broker
    (Event Distribution) as Events
  }
}

database "External Systems" as External {
  [Knowledge Base] as KB
  [Vector Store] as VS
  [Model Providers] as Models
}

' Define data flows with labeled arrows
Request --> Execute : "1. Workflow Request\n(definition, input, options)"
Execute --> Dependencies : "2. Validate\nWorkflow DAG"
Dependencies --> Execute : "3. Valid DAG\nConfirmation"

Execute --> Context : "4. Create Execution\nContext with Input"
Execute --> Metrics : "5. Initialize\nTrace Data"

' Agent discovery flow
Execute --> Capabilities : "6. Get\nStarting Steps"
Capabilities --> Execute : "7. Initial Steps\nwith Capabilities"
Execute --> CapabilityMatch : "8. Discover Agents\nfor Capabilities"
CapabilityMatch --> Ranking : "9. Candidate\nAgents"
Ranking --> Execute : "10. Ranked Agents\nby Performance"

' Step execution flows
Execute --> KRAgent : "11a. Step Input\n+ Context"
KRAgent --> Broker : "12a. Status\nUpdates"
KRAgent --> KB : "13a. Knowledge\nQuery"
KB --> KRAgent : "14a. Raw\nKnowledge"
KRAgent --> VS : "13b. Vector\nQuery"
VS --> KRAgent : "14b. Vector\nResults"
KRAgent --> Execute : "15a. Processed\nKnowledge"

Execute --> RGAgent : "11b. Step Input\n+ Context"
RGAgent --> Broker : "12b. Status\nUpdates"
RGAgent --> Models : "13c. Prompt\nwith Context"
Models --> RGAgent : "14c. Generated\nResponse"
RGAgent --> Execute : "15b. Formatted\nResponse"

' State management
Execute --> State : "16. Update Step\nState"
Execute --> Metrics : "17. Record Step\nMetrics"
Execute --> NextSteps : "18. Get Next\nSteps"
NextSteps --> Execute : "19. Next Steps\nto Process"

' Completion
State --> Execute : "20. Aggregate\nFinal Result"
Execute --> Metrics : "21. Complete\nWorkflow Trace"
Execute --> Events : "22. Publish\nCompletion Event"
Execute --> Result : "23. Return\nFinal Result"

' Error paths
KRAgent --> Execute : "E1. Error\nNotification"
Execute --> Metrics : "E2. Record\nError"
Execute --> State : "E3. Mark Step\nFailed"
Execute --> Events : "E4. Publish\nError Event"

' Notes for clarity
note bottom of Dependencies
  DAG validation ensures steps 
  have proper dependencies and
  no circular references
end note

note right of Context
  Execution Context maintains:
  - Input parameters
  - Step results
  - Workflow state
  - Execution metadata
end note

note bottom of External
  External systems include:
  - Vector databases
  - Document stores
  - LLM providers
  - API integrations
end note

note right of Metrics
  Metrics tracked include:
  - Step execution time
  - Agent performance
  - Error rates
  - Resource usage
end note

@enduml
