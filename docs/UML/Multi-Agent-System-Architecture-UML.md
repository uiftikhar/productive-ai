@startuml Multi-Agent System Architecture

skinparam backgroundColor white
skinparam packageBackgroundColor white
skinparam componentBackgroundColor #ECECFF
skinparam componentStyle uml2
skinparam componentBorderColor #3C7FC0
skinparam databaseBackgroundColor #FFEFCF
skinparam databaseBorderColor #DBA259
skinparam cloudBackgroundColor #D7F8EC
skinparam cloudBorderColor #52C49E
skinparam interfaceBackgroundColor #FAE8F6
skinparam interfaceBorderColor #AD6F9E
skinparam packageBorderColor #676767
skinparam packageStyle rectangle
skinparam linetype ortho
skinparam padding 6
skinparam nodesep 50
skinparam ranksep 70
skinparam maxMessageSize 150

' Define colors for different flow types
!define CONTROL_FLOW #3050B5
!define DATA_FLOW #2E8B57
!define INHERITANCE #9370DB
!define USER_FLOW #D2691E

' Legend
legend
  |= Arrow |= Description |
  |<color:#D2691E>――→</color> | User Flow |
  |<color:#3050B5>――→</color> | Control Flow |
  |<color:#2E8B57>――→</color> | Data Flow |
  |<color:#9370DB>――|></color> | Inheritance |
endlegend

' Client Layer
package "Client Layer" #F4F4FF {
  [Web Application] as WebApp
  [Meeting Assistant] as MeetingAssistant
  
  WebApp -[hidden]right- MeetingAssistant
}

' API Layer
package "API Layer" #F0F0FF {
  [API Gateway] as APIGateway
  [Authentication] as AuthService
  [API Endpoints] as APIEndpoints
  
  APIGateway -[hidden]right- AuthService
  AuthService -[hidden]right- APIEndpoints
}

' Orchestration Layer
package "Orchestration Layer" #E0E4FF {
  [Master Orchestrator] as Orchestrator
  [Task Planner] as TaskPlanner
  [Agent Registry Service] as AgentRegistry
  
  Orchestrator -[hidden]right- TaskPlanner
  TaskPlanner -[hidden]right- AgentRegistry
  
  note left of Orchestrator
    Central coordination hub
    for all agent activities
  end note
}

' Communication
package "Communication" #E0F3FF {
  [Communication Bus] as CommBus
}

' Agent Framework
package "Agent Framework" #D7E7FF {
  interface "BaseAgentInterface" as BaseAgentIF
  [BaseAgent Class] as BaseAgent
  [Agent Factory] as AgentFactory
  
  BaseAgentIF -[hidden]right- BaseAgent
  BaseAgent -[hidden]right- AgentFactory
  
  note bottom of AgentFactory
    Creates and configures
    specialized agent instances
  end note
}

' Domain-Specific Agents
package "Domain-Specific Agents" {
  package "Analysis Agents" #DDFBDD {
    [Meeting Analysis Agent] as MeetingAgent
    [Document Analysis Agent] as DocumentAgent
    
    MeetingAgent -[hidden]right- DocumentAgent
  }
  
  package "Knowledge Agents" #EFEFFF {
    [Knowledge Retrieval Agent] as KnowledgeAgent
    [Knowledge Gap Agent] as GapAgent
    
    KnowledgeAgent -[hidden]right- GapAgent
  }
  
  package "Integration Agents" #FFE1E1 {
    [External Integration Agent] as IntegrationAgent
    [Data Sync Agent] as SyncAgent
    
    IntegrationAgent -[hidden]right- SyncAgent
  }
}

' Model Integration
package "Model Integration" #E0F8EF {
  [Model Router] as ModelRouter
  [Prompt Management] as PromptMgmt
  
  ModelRouter -[hidden]right- PromptMgmt
}

' LLM Services
package "LLM Services" #D0F0E0 {
  cloud "AI Models" as AIModels
}

' Core Data Layer
package "Data Layer" #FFF7E9 {
  database "Vector DB" as VectorDB
  database "Document Store" as DocStore
  
  VectorDB -[hidden]right- DocStore
}

' External Integrations
package "External Integrations" #FFF5F5 {
  [External Connectors] as ExtConnectors
}

'==================================
' Connection Flows - Vertical Focus
'==================================

' User Flow
WebApp -down-> APIGateway : <color:#D2691E>Request</color>
MeetingAssistant -down-> APIGateway : <color:#D2691E>Data</color>

' API Flow
APIGateway -down-> AuthService : <color:#3050B5>Auth</color>
AuthService -down-> APIEndpoints : <color:#3050B5>Validated</color>
APIEndpoints -down-> Orchestrator : <color:#3050B5>Process</color>

' Orchestration Flow
Orchestrator -down-> TaskPlanner : <color:#3050B5>Plan</color>
Orchestrator -down-> AgentRegistry : <color:#3050B5>Select</color>
Orchestrator -down-> CommBus : <color:#3050B5>Dispatch</color>

' Agent Factory Flow
AgentRegistry -left-> AgentFactory : <color:#3050B5>Create</color>

' Agent Framework
BaseAgentIF <|-- BaseAgent : <color:#9370DB></color>
BaseAgent <|-- MeetingAgent : <color:#9370DB></color>
BaseAgent <|-- DocumentAgent : <color:#9370DB></color>
BaseAgent <|-- KnowledgeAgent : <color:#9370DB></color>
BaseAgent <|-- GapAgent : <color:#9370DB></color>
BaseAgent <|-- IntegrationAgent : <color:#9370DB></color>
BaseAgent <|-- SyncAgent : <color:#9370DB></color>

' Agent Factory creates agents
AgentFactory ..> MeetingAgent : <color:#3050B5>creates</color>
AgentFactory ..> KnowledgeAgent : <color:#3050B5>creates</color>
AgentFactory ..> DocumentAgent : <color:#3050B5>creates</color>

' Agent Communication
CommBus -down-> MeetingAgent : <color:#3050B5>Tasks</color>
CommBus -down-> DocumentAgent : <color:#3050B5>Tasks</color>
CommBus -down-> KnowledgeAgent : <color:#3050B5>Tasks</color>
CommBus -down-> GapAgent : <color:#3050B5>Tasks</color>
CommBus -down-> IntegrationAgent : <color:#3050B5>Tasks</color>
CommBus -down-> SyncAgent : <color:#3050B5>Tasks</color>

' Model Integration
MeetingAgent -down-> ModelRouter : <color:#3050B5>Request</color>
DocumentAgent -down-> ModelRouter : <color:#3050B5>Request</color>
KnowledgeAgent -down-> ModelRouter : <color:#3050B5>Request</color>
GapAgent -down-> ModelRouter : <color:#3050B5>Request</color>
IntegrationAgent -down-> ModelRouter : <color:#3050B5>Request</color>
SyncAgent -down-> ModelRouter : <color:#3050B5>Request</color>

ModelRouter -down-> PromptMgmt : <color:#3050B5>Get Prompt</color>
ModelRouter -down-> AIModels : <color:#3050B5>Query</color>

' Data Layer
MeetingAgent -right-> VectorDB : <color:#2E8B57>Query</color>
KnowledgeAgent -right-> VectorDB : <color:#2E8B57>Store</color>
DocumentAgent -right-> DocStore : <color:#2E8B57>Store</color>
GapAgent -right-> DocStore : <color:#2E8B57>Query</color>

' RAG Operations
KnowledgeAgent -right-> VectorDB : <color:#2E8B57>RAG</color>

' External Integration
IntegrationAgent -right-> ExtConnectors : <color:#2E8B57>Sync</color>
SyncAgent -right-> ExtConnectors : <color:#2E8B57>Sync</color>

' Response Flow - going back up
AIModels -up-> ModelRouter : <color:#3050B5>Response</color>
ModelRouter -up-> MeetingAgent : <color:#3050B5>Results</color>
ModelRouter -up-> DocumentAgent : <color:#3050B5>Results</color>
ModelRouter -up-> KnowledgeAgent : <color:#3050B5>Results</color>
ModelRouter -up-> GapAgent : <color:#3050B5>Results</color>
ModelRouter -up-> IntegrationAgent : <color:#3050B5>Results</color>
ModelRouter -up-> SyncAgent : <color:#3050B5>Results</color>

MeetingAgent -up-> CommBus : <color:#3050B5>Results</color>
DocumentAgent -up-> CommBus : <color:#3050B5>Results</color>
KnowledgeAgent -up-> CommBus : <color:#3050B5>Results</color>
GapAgent -up-> CommBus : <color:#3050B5>Results</color>
IntegrationAgent -up-> CommBus : <color:#3050B5>Results</color>
SyncAgent -up-> CommBus : <color:#3050B5>Results</color>

CommBus -up-> Orchestrator : <color:#3050B5>Aggregate</color>
Orchestrator -up-> APIEndpoints : <color:#3050B5>Response</color>
APIEndpoints -up-> APIGateway : <color:#3050B5>Format</color>
APIGateway -up-> WebApp : <color:#D2691E>Display</color>
APIGateway -up-> MeetingAssistant : <color:#D2691E>Insights</color>

@enduml