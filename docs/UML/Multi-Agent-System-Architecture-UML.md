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
  [Agent Directory] as AgentDir
  
  Orchestrator -[hidden]right- TaskPlanner
  TaskPlanner -[hidden]right- AgentDir
  
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
  interface "Agent Interface" as AgentIF
  [Agent Base Class] as AgentBase
  
  AgentIF -[hidden]right- AgentBase
}

' Domain-Specific Agents
package "Domain-Specific Agents" {
  package "Intelligence Agents" #DDFBDD {
    [Meeting Analysis] as MeetingAgent
    [Decision Tracking] as DecisionAgent
    
    MeetingAgent -[hidden]right- DecisionAgent
  }
  
  package "Knowledge Agents" #EFEFFF {
    [Knowledge Gap] as GapAgent
    [Theme Management] as ThemeAgent
    
    GapAgent -[hidden]right- ThemeAgent
  }
  
  package "Expertise Agents" #FFE1E1 {
    [Expertise Detection] as ExpertiseAgent
    [Memory Management] as MemoryAgent
    
    ExpertiseAgent -[hidden]right- MemoryAgent
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
Orchestrator -down-> AgentDir : <color:#3050B5>Select</color>
Orchestrator -down-> CommBus : <color:#3050B5>Dispatch</color>

' Agent Framework
AgentIF <|-- AgentBase : <color:#9370DB></color>
AgentBase <|-- MeetingAgent : <color:#9370DB></color>
AgentBase <|-- DecisionAgent : <color:#9370DB></color>
AgentBase <|-- GapAgent : <color:#9370DB></color>
AgentBase <|-- ThemeAgent : <color:#9370DB></color>
AgentBase <|-- ExpertiseAgent : <color:#9370DB></color>
AgentBase <|-- MemoryAgent : <color:#9370DB></color>

' Agent Communication
CommBus -down-> MeetingAgent : <color:#3050B5>Tasks</color>
CommBus -down-> DecisionAgent : <color:#3050B5>Tasks</color>
CommBus -down-> GapAgent : <color:#3050B5>Tasks</color>
CommBus -down-> ThemeAgent : <color:#3050B5>Tasks</color>
CommBus -down-> ExpertiseAgent : <color:#3050B5>Tasks</color>
CommBus -down-> MemoryAgent : <color:#3050B5>Tasks</color>

' Model Integration
MeetingAgent -down-> ModelRouter : <color:#3050B5>Request</color>
DecisionAgent -down-> ModelRouter : <color:#3050B5>Request</color>
GapAgent -down-> ModelRouter : <color:#3050B5>Request</color>
ThemeAgent -down-> ModelRouter : <color:#3050B5>Request</color>
ExpertiseAgent -down-> ModelRouter : <color:#3050B5>Request</color>
MemoryAgent -down-> ModelRouter : <color:#3050B5>Request</color>

ModelRouter -down-> PromptMgmt : <color:#3050B5>Get Prompt</color>
ModelRouter -down-> AIModels : <color:#3050B5>Query</color>

' Data Layer
MeetingAgent -right-> VectorDB : <color:#2E8B57>Query</color>
ThemeAgent -right-> VectorDB : <color:#2E8B57>Store</color>
DecisionAgent -right-> DocStore : <color:#2E8B57>Store</color>
GapAgent -right-> DocStore : <color:#2E8B57>Query</color>

' RAG Operations
Orchestrator -right-> VectorDB : <color:#2E8B57>RAG</color>

' External Integration
DecisionAgent -right-> ExtConnectors : <color:#2E8B57>Sync</color>
ThemeAgent -right-> ExtConnectors : <color:#2E8B57>Sync</color>

' Response Flow - going back up
AIModels -up-> ModelRouter : <color:#3050B5>Response</color>
ModelRouter -up-> MeetingAgent : <color:#3050B5>Results</color>
ModelRouter -up-> DecisionAgent : <color:#3050B5>Results</color>
ModelRouter -up-> GapAgent : <color:#3050B5>Results</color>
ModelRouter -up-> ThemeAgent : <color:#3050B5>Results</color>
ModelRouter -up-> ExpertiseAgent : <color:#3050B5>Results</color>
ModelRouter -up-> MemoryAgent : <color:#3050B5>Results</color>

MeetingAgent -up-> CommBus : <color:#3050B5>Results</color>
DecisionAgent -up-> CommBus : <color:#3050B5>Results</color>
GapAgent -up-> CommBus : <color:#3050B5>Results</color>
ThemeAgent -up-> CommBus : <color:#3050B5>Results</color>
ExpertiseAgent -up-> CommBus : <color:#3050B5>Results</color>
MemoryAgent -up-> CommBus : <color:#3050B5>Results</color>

CommBus -up-> Orchestrator : <color:#3050B5>Aggregate</color>
Orchestrator -up-> APIEndpoints : <color:#3050B5>Response</color>
APIEndpoints -up-> APIGateway : <color:#3050B5>Format</color>
APIGateway -up-> WebApp : <color:#D2691E>Display</color>
APIGateway -up-> MeetingAssistant : <color:#D2691E>Insights</color>

@enduml