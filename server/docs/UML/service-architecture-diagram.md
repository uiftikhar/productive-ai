@startuml Service Architecture

!theme plain
skinparam BackgroundColor white
skinparam componentBackgroundColor #ECECFF
skinparam componentBorderColor #3C7FC0
skinparam interfaceBackgroundColor #FAE8F6
skinparam interfaceBorderColor #AD6F9E
skinparam databaseBackgroundColor #FFEFCF
skinparam databaseBorderColor #DBA259
skinparam ArrowColor #555555
skinparam packageBorderColor #676767
skinparam packageStyle rectangle
skinparam linetype ortho
skinparam padding 8
skinparam shadowing false

' Define new colors
!define CLEANUP_FLOW #FF6347
!define REGISTRY_FLOW #4682B4

legend
  |= Arrow Type |= Description |
  |<color:black>――→</color> | Normal Dependency |
  |<color:#FF6347>- - →</color> | Cleanup Flow |
  |<color:#4682B4>..→</color> | Registration |
endlegend

' Define layers
package "Presentation Layer" {
  [API Controllers] as APICtrl
  [WebSocket Handlers] as WSHandler
}

package "Resource Management" #E8FFF8 {
  [Resource Manager] as ResourceMgr
}

package "Agent System" {
  package "Core" {
    interface "BaseAgentInterface" as BaseAgentIF
    [BaseAgent] as BaseAgent
    [Agent Factory] as AgentFactory
    [Agent Registry Service] as AgentRegistry
    [Agent Discovery Service] as AgentDiscovery
    [Agent Task Executor Service] as TaskExecutor
  }

  package "Orchestration" {
    [Master Orchestrator] as MasterOrch
    [Workflow Manager Service] as WorkflowMgr
    [Communication Bus] as CommBus
    [Task Planning Service] as TaskPlanner
    [Classifier Config Service] as ClassifierConfig
  }

  package "Specialized Agents" {
    [Meeting Analysis Agent] as MeetingAgent
    [Knowledge Retrieval Agent] as KnowledgeAgent
    [Document Analysis Agent] as DocAgent
    [Integration Agent] as IntegrationAgent
  }
  
  package "LangGraph" {
    [Supervisor Workflow] as SupervisorWF
    [Supervisor Adapter] as SupervisorAdapter
  }
}

package "Core Services" {
  [Configuration Service] as ConfigSvc
  [Logging Service] as LoggingSvc
  [Telemetry Service] as TelemetrySvc
  [Error Handler] as ErrorHandler
  [Performance Monitor] as PerfMonitor
}

package "Data Layer" {
  [Repository Factory] as RepoFactory
  
  package "Repositories" {
    [User Repository] as UserRepo
    [Document Repository] as DocRepo
    [Vector Repository] as VectorRepo
  }
  
  package "Data Sources" {
    database "SQL Database" as SQLDb
    database "Vector Database" as VectorDb
    database "Document Store" as DocStore
  }
}

package "External Integration" {
  [OAuth Service] as OAuthSvc
  [External API Clients] as APIClients
  [Webhook Handler] as WebhookHandler
}

package "LLM Integration" {
  [LLM Provider Factory] as LLMFactory
  [Prompt Template Manager] as PromptMgr
  [LLM Response Cache] as LLMCache
}

package "User Context" {
  [User Context Facade] as UserContextFacade
  [Conversation Indexing Service] as ConvIndexing
}

package "WebSocket" {
  [Socket Service] as SocketService
  [Chat Service] as ChatService
}

' Define relationships
' Presentation to Orchestration
APICtrl --> MasterOrch : "requests"
WSHandler --> MasterOrch : "events"

' Core to Specialized
BaseAgentIF <|.. BaseAgent : "implements"
BaseAgent <|-- MeetingAgent : "extends"
BaseAgent <|-- KnowledgeAgent : "extends"
BaseAgent <|-- DocAgent : "extends"
BaseAgent <|-- IntegrationAgent : "extends"

AgentFactory ..> MeetingAgent : "creates"
AgentFactory ..> KnowledgeAgent : "creates"
AgentFactory ..> DocAgent : "creates"
AgentFactory ..> IntegrationAgent : "creates"

AgentRegistry --> AgentFactory : "uses"
AgentRegistry --> BaseAgentIF : "registers"
AgentDiscovery --> AgentRegistry : "uses"

' Orchestration relationships
MasterOrch --> AgentRegistry : "uses"
MasterOrch --> WorkflowMgr : "uses"
MasterOrch --> CommBus : "uses"
CommBus --> BaseAgentIF : "routes messages"
MasterOrch --> TaskPlanner : "uses"
TaskExecutor --> TaskPlanner : "uses"
TaskExecutor --> AgentRegistry : "uses"

' LangGraph relationships
WorkflowMgr --> SupervisorWF : "creates"
WorkflowMgr --> SupervisorAdapter : "creates"
SupervisorAdapter --> SupervisorWF : "uses"

' Service connections
BaseAgent --> ConfigSvc : "uses"
BaseAgent --> LoggingSvc : "uses"
BaseAgent --> TelemetrySvc : "uses"
BaseAgent --> ErrorHandler : "uses"

' Data layer
KnowledgeAgent --> VectorRepo : "uses"
MeetingAgent --> DocRepo : "uses"
DocAgent --> DocRepo : "uses"
RepoFactory ..> UserRepo : "creates"
RepoFactory ..> DocRepo : "creates"
RepoFactory ..> VectorRepo : "creates"

UserRepo --> SQLDb : "accesses"
DocRepo --> DocStore : "accesses"
VectorRepo --> VectorDb : "accesses"

' External integration
IntegrationAgent --> APIClients : "uses"
APIClients --> OAuthSvc : "uses"
WebhookHandler --> AgentRegistry : "triggers"

' LLM integration
MeetingAgent --> PromptMgr : "uses"
KnowledgeAgent --> PromptMgr : "uses"
PromptMgr --> LLMFactory : "uses"
LLMFactory --> LLMCache : "uses"

' WebSocket and Chat connections
WSHandler --> SocketService : "uses"
SocketService --> ChatService : "uses"
ChatService --> UserContextFacade : "uses"
ChatService --> AgentRegistry : "uses"

' User Context relationships
UserContextFacade --> ConvIndexing : "uses"

' Resource Manager registrations
ResourceMgr .up.> SocketService : <color:#4682B4>"registers cleanup"</color>
ResourceMgr .up.> ChatService : <color:#4682B4>"registers cleanup"</color>
ResourceMgr .up.> UserContextFacade : <color:#4682B4>"registers cleanup"</color>
ResourceMgr .up.> PerfMonitor : <color:#4682B4>"registers cleanup"</color>
ResourceMgr .up.> AgentRegistry : <color:#4682B4>"registers cleanup"</color>
ResourceMgr .up.> TaskExecutor : <color:#4682B4>"registers cleanup"</color>
ResourceMgr .up.> ClassifierConfig : <color:#4682B4>"registers cleanup"</color>
ResourceMgr .up.> WorkflowMgr : <color:#4682B4>"registers cleanup"</color>
ResourceMgr .up.> AgentDiscovery : <color:#4682B4>"registers cleanup"</color>

' Cleanup flows
SocketService - -> ResourceMgr : <color:#CLEANUP_FLOW>"cleanup()"</color>
ChatService - -> ResourceMgr : <color:#CLEANUP_FLOW>"cleanup()"</color>
UserContextFacade - -> ResourceMgr : <color:#CLEANUP_FLOW>"cleanup()"</color>
PerfMonitor - -> ResourceMgr : <color:#CLEANUP_FLOW>"cleanup()"</color>
AgentRegistry - -> ResourceMgr : <color:#CLEANUP_FLOW>"cleanup()"</color>
TaskExecutor - -> ResourceMgr : <color:#CLEANUP_FLOW>"cleanup()"</color>
ClassifierConfig - -> ResourceMgr : <color:#CLEANUP_FLOW>"cleanup()"</color>
WorkflowMgr - -> ResourceMgr : <color:#CLEANUP_FLOW>"cleanup()"</color>
AgentDiscovery - -> ResourceMgr : <color:#CLEANUP_FLOW>"cleanup()"</color>

' Workflow cleanup flows
WorkflowMgr - -> SupervisorAdapter : <color:#CLEANUP_FLOW>"cleanup()"</color>
WorkflowMgr - -> SupervisorWF : <color:#CLEANUP_FLOW>"cleanup()"</color>
SupervisorAdapter - -> SupervisorWF : <color:#CLEANUP_FLOW>"cleanup()"</color>

note bottom of ResourceMgr
  Centralized resource management
  ensures proper cleanup of all services
  during application shutdown
end note

note bottom of WorkflowMgr
  Manages LangGraph workflow lifecycle
  including creation and cleanup
end note

@enduml