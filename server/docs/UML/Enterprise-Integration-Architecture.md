@startuml Enterprise Integration Architecture

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
skinparam ranksep 100

' Define colors for different flow types
!define CONTROL_FLOW #3050B5
!define DATA_FLOW #2E8B57
!define SECURITY_FLOW #B22222
!define CONFIG_FLOW #8A2BE2

' Legend
legend
  |= Arrow |= Description |
  |<color:#3050B5>――→</color> | Control Flow |
  |<color:#2E8B57>――→</color> | Data Flow |
  |<color:#B22222>――→</color> | Security Flow |
  |<color:#8A2BE2>――→</color> | Config Flow |
endlegend

' Client System
package "Client Systems" #F4F4FF {
  [Enterprise Applications] as EnterpriseApps
  [Legacy Systems] as LegacySystems
  
  EnterpriseApps -[hidden]right- LegacySystems
}

' Security & Authentication
package "Security Layer" #FFE6E6 {
  [Enterprise SSO] as SSO
  [Identity Provider] as IDP
  [Permissions Manager] as PermManager
  
  SSO -[hidden]right- IDP
  IDP -[hidden]right- PermManager
  
  note left of SSO
    Integrates with enterprise
    identity systems (Okta,
    Azure AD, etc.)
  end note
}

' Enterprise Integration Hub
package "Enterprise Integration Hub" #FFECDA {
  [API Gateway Manager] as APIManager
  [Data Exchange Layer] as DataExchange
  [Integration Controller] as IntController
  
  APIManager -[hidden]right- DataExchange
  DataExchange -[hidden]right- IntController
  
  note left of APIManager
    Central control point for
    all enterprise connections
  end note
}

' Connector Systems
package "Connector Systems" #FFF5E6 {
  [PM Connectors] as PMConnector
  [KB Connectors] as KBConnector
  [CRM Connectors] as CRMConnector
  [ERP Connectors] as ERPConnector
  [Communication Connectors] as CommConnector
  
  PMConnector -[hidden]right- KBConnector
  KBConnector -[hidden]right- CRMConnector
  CRMConnector -[hidden]right- ERPConnector
  ERPConnector -[hidden]right- CommConnector
}

' Data Transformation
package "Data Transformation" #E6F5FF {
  [ETL Pipeline] as ETLPipeline
  [Schema Mapper] as SchemaMapper
  [Data Validator] as DataValidator
  
  ETLPipeline -[hidden]right- SchemaMapper
  SchemaMapper -[hidden]right- DataValidator
}

' Multi-Agent System
package "Multi-Agent System" #E0E4FF {
  [Orchestrator] as Orchestrator
  [Integration Agent] as IntAgent
  
  Orchestrator -[hidden]right- IntAgent
}

' Storage Layer
package "Enterprise Storage" #FFF7E9 {
  database "Integration DB" as IntegrationDB
  database "Sync Metadata" as SyncMetaDB
  
  IntegrationDB -[hidden]right- SyncMetaDB
}

' Add extra spacing
CommConnector -[hidden]down- dummy1
dummy1 -[hidden]down- dummy2
dummy2 -[hidden]down- dummy3

' External Enterprise Systems
cloud "External Enterprise Systems" #F0F0F0 {
  [Jira] as Jira
  [Confluence] as Confluence
  [Salesforce] as Salesforce
  [MS Teams] as Teams
  [Slack] as Slack
  
  Jira -[hidden]right- Confluence
  Confluence -[hidden]right- Salesforce
  Salesforce -[hidden]right- Teams
  Teams -[hidden]right- Slack
}

'==================================
' Connection Flows - Vertical Focus
'==================================

' Top-level integration flow
EnterpriseApps -down-> SSO : <color:#B22222>1. Authentication request</color>
LegacySystems -down-> SSO : <color:#B22222>1. Authentication request</color>

' Security flow
SSO -down-> IDP : <color:#B22222>2. Identity verification</color>
IDP -down-> PermManager : <color:#B22222>3. Access control</color>
PermManager -down-> APIManager : <color:#B22222>4. Authorized access</color>

' Integration hub flow
APIManager -down-> DataExchange : <color:#3050B5>5. Route request</color>
DataExchange -down-> IntController : <color:#3050B5>6. Process integration</color>

' Connector selection
IntController -down-> PMConnector : <color:#3050B5>7a. Project management</color>
IntController -down-> KBConnector : <color:#3050B5>7b. Knowledge base</color>
IntController -down-> CRMConnector : <color:#3050B5>7c. Customer data</color>
IntController -down-> ERPConnector : <color:#3050B5>7d. Enterprise resources</color>
IntController -down-> CommConnector : <color:#3050B5>7e. Communication tools</color>

' Data transformation flow
PMConnector -down-> ETLPipeline : <color:#2E8B57>8. Raw data</color>
KBConnector -down-> ETLPipeline : <color:#2E8B57>8. Raw data</color>
CRMConnector -down-> ETLPipeline : <color:#2E8B57>8. Raw data</color>
ERPConnector -down-> ETLPipeline : <color:#2E8B57>8. Raw data</color>
CommConnector -down-> ETLPipeline : <color:#2E8B57>8. Raw data</color>

ETLPipeline -down-> SchemaMapper : <color:#2E8B57>9. Transform data</color>
SchemaMapper -down-> DataValidator : <color:#2E8B57>10. Validate data</color>

' Integration with core system
DataValidator -down-> IntAgent : <color:#2E8B57>11. Processed data</color>
IntAgent -down-> Orchestrator : <color:#2E8B57>12. Integration data</color>

' Storage operations
IntAgent -right-> IntegrationDB : <color:#2E8B57>13. Store integration data</color>
IntAgent -right-> SyncMetaDB : <color:#2E8B57>14. Track sync metadata</color>

' External system connections with longer vertical connections
PMConnector ----down----> Jira : <color:#2E8B57>15a. Jira integration</color>
KBConnector ----down----> Confluence : <color:#2E8B57>15b. Confluence integration</color>
CRMConnector ----down----> Salesforce : <color:#2E8B57>15c. Salesforce integration</color>
CommConnector ------down-------> Teams : <color:#2E8B57>15d. Teams integration</color>
CommConnector ------down-------> Slack : <color:#2E8B57>15e. Slack integration</color>

' Configuration flows
IntController -left-> PMConnector : <color:#8A2BE2>16. Configure connector</color>
IntController -left-> KBConnector : <color:#8A2BE2>16. Configure connector</color>
IntController -left-> CRMConnector : <color:#8A2BE2>16. Configure connector</color>
IntController -left-> ERPConnector : <color:#8A2BE2>16. Configure connector</color>
IntController -left-> CommConnector : <color:#8A2BE2>16. Configure connector</color>

' Return flow for synchronization
Jira ----up----> PMConnector : <color:#2E8B57>17. Sync data</color>
Confluence ----up----> KBConnector : <color:#2E8B57>17. Sync data</color>
Salesforce ----up----> CRMConnector : <color:#2E8B57>17. Sync data</color>
Teams ------up-------> CommConnector : <color:#2E8B57>17. Sync data</color>
Slack ------up-------> CommConnector : <color:#2E8B57>17. Sync data</color>

@enduml