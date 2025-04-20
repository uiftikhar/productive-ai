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

' Define layers
package "Presentation Layer" {
  [API Controllers] as APICtrl
  [WebSocket Handlers] as WSHandler
}

package "Agent System" {
  package "Core" {
    interface "BaseAgentInterface" as BaseAgentIF
    [BaseAgent] as BaseAgent
    [Agent Factory] as AgentFactory
    [Agent Registry Service] as AgentRegistry
  }

  package "Orchestration" {
    [Master Orchestrator] as MasterOrch
    [Workflow Manager] as WorkflowMgr
    [Communication Bus] as CommBus
  }

  package "Specialized Agents" {
    [Meeting Analysis Agent] as MeetingAgent
    [Knowledge Retrieval Agent] as KnowledgeAgent
    [Document Analysis Agent] as DocAgent
    [Integration Agent] as IntegrationAgent
  }
}

package "Core Services" {
  [Configuration Service] as ConfigSvc
  [Logging Service] as LoggingSvc
  [Telemetry Service] as TelemetrySvc
  [Error Handler] as ErrorHandler
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

' Orchestration relationships
MasterOrch --> AgentRegistry : "uses"
MasterOrch --> WorkflowMgr : "uses"
MasterOrch --> CommBus : "uses"
CommBus --> BaseAgentIF : "routes messages"

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

@enduml