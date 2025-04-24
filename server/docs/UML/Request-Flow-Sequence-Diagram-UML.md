@startuml Request Flow Sequence

skinparam backgroundColor white
skinparam sequenceArrowThickness 2
skinparam sequenceParticipantBorderThickness 2
skinparam noteBackgroundColor #FFF2D1
skinparam noteBorderColor #E6A735

' Color coding for participants
skinparam participantBackgroundColor #F4F4FF
skinparam participantBorderColor #3C7FC0
skinparam actorBackgroundColor #ECECFF
skinparam actorBorderColor #3C7FC0
skinparam databaseBackgroundColor #FFEFCF
skinparam databaseBorderColor #DBA259

actor "User" as User
participant "Web Application" as WebApp
participant "API Endpoints" as API
participant "Master Orchestrator" as Orchestrator
participant "Task Planning Engine" as TaskPlanner
participant "Agent Registry Service" as AgentRegistry
participant "Agent Factory" as AgentFactory
participant "Communication Bus" as CommBus
participant "Specialized Agent" as Agent #DDFBDD
participant "Knowledge Retrieval Agent" as KnowledgeAgent #EFEFFF
participant "Model Integration Layer" as ModelLayer
database "Vector Database" as VectorDB
database "Document Store" as DocStore

' Request Flow
User -> WebApp: Submit request
activate WebApp

WebApp -> API: Forward request
activate API

API -> Orchestrator: Process request
activate Orchestrator
note right of Orchestrator: Request enters the system

' Task Planning Phase
Orchestrator -> TaskPlanner: Decompose into subtasks
activate TaskPlanner
TaskPlanner --> Orchestrator: Return task plan
deactivate TaskPlanner

' Agent Selection Phase
Orchestrator -> AgentRegistry: Find appropriate agents
activate AgentRegistry
AgentRegistry -> AgentFactory: Create if not exists
activate AgentFactory
AgentFactory --> AgentRegistry: Return agent instance
deactivate AgentFactory
AgentRegistry --> Orchestrator: Return agent list
deactivate AgentRegistry

' RAG Phase
Orchestrator -> KnowledgeAgent: Retrieve context
activate KnowledgeAgent
KnowledgeAgent -> VectorDB: Query relevant context
activate VectorDB
VectorDB --> KnowledgeAgent: Return context
deactivate VectorDB
KnowledgeAgent --> Orchestrator: Return enriched context
deactivate KnowledgeAgent

' Task Execution Phase
Orchestrator -> CommBus: Dispatch tasks to agents
activate CommBus
CommBus -> Agent: Execute task
activate Agent

Agent -> ModelLayer: Generate response
activate ModelLayer
ModelLayer --> Agent: Return generated content
deactivate ModelLayer

Agent -> DocStore: Store results
activate DocStore
DocStore --> Agent: Confirm storage
deactivate DocStore

Agent --> CommBus: Return results
deactivate Agent

CommBus --> Orchestrator: Aggregate results
deactivate CommBus

' Response Synthesis
Orchestrator -> ModelLayer: Synthesize final response
activate ModelLayer
ModelLayer --> Orchestrator: Return synthesized response
deactivate ModelLayer

Orchestrator --> API: Return response
deactivate Orchestrator

API --> WebApp: Forward response
deactivate API

WebApp --> User: Display results
deactivate WebApp

@enduml