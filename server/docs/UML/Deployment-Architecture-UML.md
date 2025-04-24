@startuml Deployment Architecture

!theme plain
' Custom styling for deployment diagram
skinparam BackgroundColor transparent
skinparam NodeBackgroundColor #F5F5F5
skinparam DatabaseBackgroundColor #E3F2FD
skinparam NodeBorderColor #BBBBBB
skinparam DatabaseBorderColor #90CAF9
skinparam CloudBackgroundColor #F3E5F5
skinparam CloudBorderColor #CE93D8
skinparam ArrowColor #555555

' Basic legend
legend right
  |= Component Type |= Description |
  |<#F5F5F5>| Application Service |
  |<#E3F2FD>| Database Service |
  |<#F3E5F5>| Cloud Provider Service |
endlegend

' Cloud container
cloud "Cloud Infrastructure" as CloudInfra {
  ' Web tier and API Gateway
  node "Application Cluster" as AppCluster {
    node "Web Application Pod" as WebApp {
      [Client Application] as ClientApp
      [API Gateway] as ApiGateway
      [Authentication Service] as AuthService
    }
  }
  
  ' Agent system tier
  node "Agent Orchestration Cluster" as AgentCluster {
    node "Orchestration Service Pod" as OrchPod {
      [Master Orchestrator] as MasterOrch
      [Task Planning Engine] as TaskPlanner
      [Workflow Manager] as WorkflowMgr
    }
    
    node "Agent Execution Pods" as AgentPod {
      [Knowledge Retrieval Agents] as KRAgents
      [Response Generation Agents] as RGAgents
      [Specialized Domain Agents] as SpecAgents
    }
    
    node "Support Service Pod" as SupportPod {
      [Agent Discovery Service] as AgentDiscovery
      [Communication Bus] as CommBus
      [Metrics Collector] as MetricsService
    }
  }
  
  ' Data persistence tier
  node "Database Cluster" as DBCluster {
    database "Primary Database" as PrimaryDB {
      [User Data] as UserDB
      [Session Data] as SessionDB
      [Agent Performance Metrics] as AgentMetricsDB
    }
    
    database "Vector Database" as VectorDB {
      [Knowledge Embeddings] as KnowledgeEmbeddings
      [Vector Indices] as VectorIndices
    }
    
    database "Time Series Database" as TimeSeriesDB {
      [System Metrics] as SystemMetricsDB
      [Performance Data] as PerformanceDB
    }
    
    database "Object Storage" as ObjStorage {
      [Document Store] as DocStore
      [Media Assets] as MediaAssets
    }
  }
  
  ' External integration tier
  node "Integration Services Cluster" as IntegrationCluster {
    [API Integration Service] as APIIntegration
    [Data Connectors] as DataConnectors
    [Webhook Service] as WebhookService
  }
}

' External model providers
cloud "LLM Service Providers" as LLMProviders {
  [OpenAI API Services] as OpenAI
  [Anthropic API Services] as Anthropic
  [Proprietary Model Services] as PropModels
}

' Enterprise tools for integration
cloud "Enterprise Tools" as EnterpriseTools {
  [CRM Systems] as CRM
  [Ticket Systems] as TicketSys
  [Knowledge Bases] as KnowledgeBases
  [Communication Platforms] as CommPlatforms
}

' Deployment connections
ClientApp -down-> ApiGateway : "HTTPS"
ApiGateway -down-> AuthService : "Internal HTTP"
ApiGateway -down-> MasterOrch : "gRPC"
ApiGateway -down-> UserDB : "SQL/NoSQL"

MasterOrch -down-> TaskPlanner : "Internal HTTP"
MasterOrch -down-> WorkflowMgr : "Internal HTTP"
MasterOrch -right-> AgentDiscovery : "Internal HTTP"
MasterOrch -down-> CommBus : "Message Queue"

TaskPlanner -down-> WorkflowMgr : "Internal HTTP"
WorkflowMgr -down-> KRAgents : "gRPC"
WorkflowMgr -down-> RGAgents : "gRPC"
WorkflowMgr -down-> SpecAgents : "gRPC"
WorkflowMgr -right-> MetricsService : "Internal HTTP"

KRAgents -down-> VectorDB : "Vector Query API"
KRAgents -down-> DocStore : "Object API"
KRAgents -down-> OpenAI : "HTTPS"

RGAgents -down-> KnowledgeEmbeddings : "Vector Query API"
RGAgents -down-> OpenAI : "HTTPS"
RGAgents -down-> Anthropic : "HTTPS"

SpecAgents -down-> PropModels : "HTTPS"
SpecAgents -down-> APIIntegration : "Internal HTTP"

CommBus -down-> AgentMetricsDB : "SQL/NoSQL"
CommBus -down-> TimeSeriesDB : "Time Series Protocol"

MetricsService -down-> SystemMetricsDB : "Time Series Protocol"
MetricsService -down-> PerformanceDB : "Time Series Protocol"

APIIntegration -down-> CRM : "HTTPS"
APIIntegration -down-> TicketSys : "HTTPS"
DataConnectors -down-> KnowledgeBases : "HTTPS/Custom Protocol"
WebhookService -down-> CommPlatforms : "HTTPS"

' High-level technical notes
note top of AppCluster
  Deployed as Kubernetes services 
  with autoscaling and load balancing
end note

note bottom of AgentCluster
  Each agent type can scale independently
  based on workload demands
end note

note bottom of DBCluster
  Data tier uses managed services 
  with automatic backup and high availability
end note

note top of IntegrationCluster
  Secure integration layer with 
  rate limiting and credential management
end note

@enduml
