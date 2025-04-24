@startuml Enhanced Request Flow Sequence
!theme plain
skinparam BackgroundColor transparent
skinparam SequenceArrowColor #555555
skinparam SequenceLifeLineBorderColor #AAAAAA
skinparam SequenceParticipantBorderColor #BBBBBB
skinparam SequenceParticipantBackgroundColor #F8F8F8
skinparam SequenceGroupBorderColor #CCCCCC
skinparam SequenceGroupBackgroundColor #FAFAFA
skinparam NoteBackgroundColor #FFF9C4
skinparam NoteBorderColor #FFF59D

' Participants
actor "User" as User
participant "API Gateway" as API
participant "Authentication\nService" as Auth
participant "Master\nOrchestrator" as MOrch
participant "Task Planning\nEngine" as TPEngine
participant "Workflow\nManager" as WManager
participant "Agent\nDiscovery" as AgentDir
participant "Knowledge\nRetrieval Agent" as KRAgent
participant "RAG Prompt\nManager" as RAGPrompt
participant "Vector\nDatabase" as VectorDB
participant "Response\nGeneration Agent" as RGAgent
participant "Domain-Specific\nAgent" as DSAgent
participant "External\nIntegration" as ExtInt

' Initial request flow
User -> API: Submit request
activate API

API -> Auth: Authenticate request
activate Auth
Auth --> API: Authentication result
deactivate Auth

API -> MOrch: Forward authenticated request
activate MOrch
note right of MOrch: Request includes user context, query,\nand any specific requirements

' Task planning phase
MOrch -> TPEngine: Plan task execution
activate TPEngine
TPEngine -> TPEngine: Decompose task into subtasks
TPEngine -> AgentDir: Query available agents for task
activate AgentDir
AgentDir --> TPEngine: Return matching agent capabilities 
deactivate AgentDir
TPEngine --> MOrch: Return task execution plan
deactivate TPEngine

' Workflow management phase
MOrch -> WManager: Execute workflow with plan
activate WManager
note right of WManager: Workflow executes as a DAG\nwith parallel execution where possible

' Knowledge retrieval phase
group Knowledge Retrieval
    WManager -> KRAgent: Request relevant knowledge
    activate KRAgent
    
    KRAgent -> RAGPrompt: Format retrieval query
    activate RAGPrompt
    RAGPrompt --> KRAgent: Optimized query
    deactivate RAGPrompt
    
    KRAgent -> VectorDB: Query for relevant context
    activate VectorDB
    VectorDB --> KRAgent: Return matching vectors
    deactivate VectorDB
    
    KRAgent -> KRAgent: Process and filter context
    KRAgent --> WManager: Return processed knowledge
    deactivate KRAgent
end

' Domain-specific processing (optional)
alt Domain-Specific Processing Required
    WManager -> DSAgent: Process domain request
    activate DSAgent
    
    DSAgent -> ExtInt: Request external data (if needed)
    activate ExtInt
    ExtInt --> DSAgent: Return external data
    deactivate ExtInt
    
    DSAgent -> DSAgent: Apply domain expertise
    DSAgent --> WManager: Return domain-specific insights
    deactivate DSAgent
end

' Response generation phase
WManager -> RGAgent: Generate comprehensive response
activate RGAgent
RGAgent -> RGAgent: Synthesize knowledge and insights
RGAgent --> WManager: Return formatted response
deactivate RGAgent

WManager --> MOrch: Return workflow execution result
deactivate WManager

' Metrics and logging (asynchronous)
MOrch ->> MOrch: Log interaction metrics

MOrch --> API: Return orchestrated response
deactivate MOrch

API --> User: Deliver final response
deactivate API

' Async follow-up
opt Asynchronous Learning
    User ->> API: Provide feedback
    API ->> MOrch: Process feedback
    MOrch ->> RAGPrompt: Update prompt strategies
    MOrch ->> VectorDB: Update relevance scores
end

legend right
  |= Arrow |= Meaning |
  |---->| Synchronous Request/Response |
  |-->>| Asynchronous Message |
  Note: Workflow execution may include parallel processes
  and conditional branches not fully depicted here.
endlegend

@enduml
