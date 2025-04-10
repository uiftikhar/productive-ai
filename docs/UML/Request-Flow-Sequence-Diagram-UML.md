
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
participant "Agent Directory" as AgentDir
participant "Communication Bus" as CommBus
participant "Domain-Specific Agent" as Agent
participant "Model Integration Layer" as ModelLayer
database "Vector Database" as VectorDB
database "Expertise Graph" as ExpertiseDB

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
Orchestrator -> AgentDir: Find appropriate agents
activate AgentDir
AgentDir --> Orchestrator: Return agent list
deactivate AgentDir

' RAG Phase
Orchestrator -> VectorDB: Query relevant context
activate VectorDB
VectorDB --> Orchestrator: Return context
deactivate VectorDB

Orchestrator -> ExpertiseDB: Query expertise
activate ExpertiseDB
ExpertiseDB --> Orchestrator: Return expertise
deactivate ExpertiseDB

' Task Execution Phase
Orchestrator -> CommBus: Dispatch tasks to agents
activate CommBus
CommBus -> Agent: Execute task
activate Agent

Agent -> ModelLayer: Generate response
activate ModelLayer
ModelLayer --> Agent: Return generated content
deactivate ModelLayer

Agent -> VectorDB: Store results
activate VectorDB
VectorDB --> Agent: Confirm storage
deactivate VectorDB

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