@startuml Orchestration Layer Connections

skinparam backgroundColor white
skinparam packageBackgroundColor white
skinparam componentBackgroundColor #ECECFF
skinparam componentStyle uml2
skinparam componentBorderColor #3C7FC0
skinparam databaseBackgroundColor #FFEFCF
skinparam databaseBorderColor #DBA259
skinparam packageBorderColor #676767
skinparam packageStyle rectangle
skinparam linetype ortho
skinparam arrowColor #454645
skinparam padding 10
skinparam nodesep 80
skinparam ranksep 100

' Define colors for different types of flows
!define CONTROL_FLOW #3050B5
!define DATA_FLOW #2E8B57

legend
  |= Arrow Type |= Description |
  |<color:#3050B5>――→</color> | Control Flow |
  |<color:#2E8B57>――→</color> | Data Flow |
endlegend

' Central Orchestration Layer
package "Orchestration Layer" #E0E4FF {
  [Master Orchestrator Agent] as Orchestrator
  [Task Planning Engine] as TaskPlanner
  [Workflow Manager] as WorkflowManager
  [Agent Directory Service] as AgentDir
  
  ' Internal layout - place components in organized manner
  Orchestrator -[hidden]down- TaskPlanner
  TaskPlanner -[hidden]right- WorkflowManager
  WorkflowManager -[hidden]right- AgentDir
}

' Place packages around the Orchestration Layer
package "Agent Communication" #E0F3FF {
  [Agent Communication Bus] as CommBus
}

package "Client Interface" #F4F4FF {
  [API Endpoints] as APIEndpoints
}

package "Data Sources" #FFF7E9 {
  database "Vector Database" as VectorDB
  database "Expertise Graph" as ExpertiseDB
  
  ' Stack the databases
  VectorDB -[hidden]down- ExpertiseDB
}

package "External Systems" #FFF5F5 {
  [API Connectors] as APIConnector
}

' Add space between packages
Orchestrator -[hidden]down- CommBus
APIEndpoints -[hidden]down- Orchestrator
VectorDB -[hidden]left- Orchestrator
Orchestrator -[hidden]right- APIConnector

' Internal orchestration connections
Orchestrator -down-> TaskPlanner : <color:#3050B5>1. Task Decomposition</color>
Orchestrator -right-> WorkflowManager : <color:#3050B5>2. Workflow Execution</color>
Orchestrator -left-> AgentDir : <color:#3050B5>3. Agent Selection</color>

' Agent communication
Orchestrator -down-> CommBus : <color:#3050B5>Agent Tasks & Results</color>
CommBus -up-> Orchestrator : <color:#3050B5>Agent Responses</color>

' Client interface
APIEndpoints -down-> Orchestrator : <color:#3050B5>User Requests</color>

' Data access
Orchestrator -right-> VectorDB : <color:#2E8B57>RAG Queries</color>
Orchestrator -right-> ExpertiseDB : <color:#2E8B57>Expertise-weighted RAG</color>

' External connections
Orchestrator -left-> APIConnector : <color:#2E8B57>External System Integration</color>

' Add notes for additional clarity
note right of Orchestrator
  <b>Central Coordination Point</b>
  - Routes user requests
  - Manages task planning
  - Coordinates agent selection
  - Handles RAG operations
  - Synthesizes final responses
end note

note bottom of TaskPlanner
  <b>Task Decomposition</b>
  Breaks down complex requests
  into executable subtasks
end note

note bottom of WorkflowManager
  <b>Execution Management</b>
  Handles workflow state, 
  error recovery, and retries
end note

note bottom of AgentDir
  <b>Agent Registry</b>
  Tracks agent capabilities
  and availability
end note

note bottom of CommBus
  <b>Inter-Agent Communication</b>
  Manages message routing and
  event broadcasts between agents
end note

note bottom of VectorDB
  <b>Semantic Search</b>
  Powers retrieval-augmented
  generation operations
end note

@enduml