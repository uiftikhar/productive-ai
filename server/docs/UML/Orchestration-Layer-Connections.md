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
!define CLEANUP_FLOW #FF6347
!define RESOURCE_FLOW #9370DB

legend
  |= Arrow Type |= Description |
  |<color:#3050B5>――→</color> | Control Flow |
  |<color:#2E8B57>――→</color> | Data Flow |
  |<color:#FF6347>- - →</color> | Cleanup Flow |
  |<color:#9370DB>··→</color> | Resource Registration |
endlegend

' Central Orchestration Layer
package "Orchestration Layer" #E0E4FF {
  [Master Orchestrator Agent] as Orchestrator
  [Task Planning Service] as TaskPlanner
  [Workflow Manager Service] as WorkflowManager
  [Agent Directory Service] as AgentDir
  [Agent Task Executor Service] as TaskExecutor
  
  ' Internal layout - place components in organized manner
  Orchestrator -[hidden]down- TaskPlanner
  TaskPlanner -[hidden]right- WorkflowManager
  WorkflowManager -[hidden]right- AgentDir
  AgentDir -[hidden]right- TaskExecutor
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

package "LangGraph" #F0F8FF {
  [Supervisor Workflow] as SupervisorWF
  [Supervisor Adapter] as SupervisorAdapter
}

package "Resource Management" #E8FFF8 {
  [Resource Manager] as ResourceMgr
}

' Add space between packages
Orchestrator -[hidden]down- CommBus
APIEndpoints -[hidden]down- Orchestrator
VectorDB -[hidden]left- Orchestrator
Orchestrator -[hidden]right- APIConnector
ResourceMgr -[hidden]down- Orchestrator

' Internal orchestration connections
Orchestrator -down-> TaskPlanner : <color:#3050B5>1. Task Decomposition</color>
Orchestrator -right-> WorkflowManager : <color:#3050B5>2. Workflow Execution</color>
Orchestrator -left-> AgentDir : <color:#3050B5>3. Agent Selection</color>
Orchestrator -down-> TaskExecutor : <color:#3050B5>4. Task Execution</color>

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

' LangGraph connections
WorkflowManager -down-> SupervisorAdapter : <color:#3050B5>Creates/Manages</color>
WorkflowManager -down-> SupervisorWF : <color:#3050B5>Creates/Manages</color>
SupervisorAdapter -right-> SupervisorWF : <color:#3050B5>Uses</color>

' Resource Manager registrations
ResourceMgr ..down..> WorkflowManager : <color:#9370DB>Registers</color>
ResourceMgr ..down..> TaskExecutor : <color:#9370DB>Registers</color>
ResourceMgr ..down..> CommBus : <color:#9370DB>Registers</color>
ResourceMgr ..down..> AgentDir : <color:#9370DB>Registers</color>

' Cleanup flows
WorkflowManager - -up-> ResourceMgr : <color:#FF6347>Cleanup</color>
TaskExecutor - -up-> ResourceMgr : <color:#FF6347>Cleanup</color>
CommBus - -up-> ResourceMgr : <color:#FF6347>Cleanup</color>
AgentDir - -up-> ResourceMgr : <color:#FF6347>Cleanup</color>

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
  <b>Workflow Management</b>
  - Creates and manages workflows
  - Tracks workflow lifecycles
  - Ensures proper resource cleanup
  - Manages workflow adapters
end note

note bottom of AgentDir
  <b>Agent Registry</b>
  Tracks agent capabilities
  and availability
end note

note bottom of SupervisorWF
  <b>State Management</b>
  - LangGraph-based workflow
  - Manages state transitions
  - Coordinates multi-agent tasks
end note

note bottom of ResourceMgr
  <b>Resource Management</b>
  - Centralized cleanup coordination
  - Ordered shutdown sequence
  - Prevents resource leaks
end note

note bottom of TaskExecutor
  <b>Task Execution</b>
  - Executes agent tasks
  - Manages execution timeouts
  - Handles retries and recovery
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