@startuml RAG Implementation Components
!theme plain
skinparam BackgroundColor transparent
skinparam componentStyle rectangle
skinparam ComponentBorderColor #666666
skinparam ComponentBackgroundColor #FEFEFE
skinparam ArrowColor #555555
skinparam ComponentFontSize 14
skinparam NoteFontSize 12
skinparam padding 4
skinparam nodeSep 60
skinparam rankSep 80

' Define component styling
skinparam rectangle {
  BackgroundColor #FFFFFF
  BorderColor #666666
  FontSize 13
}

package "Retrieval-Augmented Generation (RAG) System" {
  package "User Interface Layer" {
    [User Input Processor] as UIP
    [Response Display] as RD
  }
  
  package "Orchestration Layer" {
    [Knowledge Request Manager] as KRM
    [Context Selection Engine] as CSE
    [Response Assembly] as RA
  }

  package "RAG Core Services" {
    [RAG Prompt Manager] as RPM
    [Relevance Scoring Service] as RSS
    [Context Formatting Service] as CFS
  }

  package "Query Processing" {
    [Query Analyzer] as QA
    [Query Optimizer] as QO
    [Search Strategy Selector] as SSS
  }

  package "Retrieval Layer" {
    [Knowledge Retrieval Agent] as KRA
    [Vector Query Service] as VQS
    [Hybrid Search Service] as HSS
  }

  package "Integration Layer" {
    [Pinecone Connection Service] as PCS
    [Embedding Service] as ES
  }

  package "Storage Layer" {
    component "Vector Store" as VS {
      [Pinecone Vector DB] as PVD
    }
    database "Knowledge Base" as KB {
      [Structured Knowledge] as SK
      [Unstructured Knowledge] as UK
    }
    database "Interaction History" as IH
  }

  package "LLM Integration" {
    [LLM Provider Facade] as LPF
    [LLM Request Formatter] as LRF
  }
}

' Define connections
UIP -down-> KRM : "user query"
KRM -down-> QA : "analyze query"
QA -right-> QO : "optimized query"
QO -right-> SSS : "search strategy"
SSS -down-> KRA : "search parameters"

KRM -right-> CSE : "retrieval parameters"
CSE -down-> RSS : "relevance criteria"

KRA -down-> VQS : "vector queries"
KRA -down-> HSS : "hybrid search queries"
VQS -down-> PCS : "Pinecone operations"
HSS -down-> PCS : "combined search"
PCS -down-> PVD : "vector DB operations"

KRA -right-> RPM : "format retrieved data"
RPM -right-> CFS : "format context"

CSE -down-> RSS : "score relevance"
RSS -down-> CFS : "filtered contexts"

CFS -right-> RA : "formatted context"
KRM -right-> RA : "assembly instructions" 
RA -up-> RD : "assembled response"

' Embedding connections
ES -up-> VQS : "query embeddings"
ES -up-> HSS : "content embeddings"
ES -down-> PVD : "store embeddings"

' LLM connections
RPM -down-> LRF : "formatted prompt"
LRF -right-> LPF : "LLM request"
LPF -up-> RA : "LLM response"

' History tracking
RPM -down-> IH : "store interactions"
KRA -down-> IH : "store retrievals"

note bottom of PVD
  Stores vector embeddings of 
  user context, knowledge, and resources
end note

note bottom of RPM
  Manages context formatting,
  prompt templates, and 
  retrieval strategies
end note

note bottom of KRA
  Coordinates knowledge retrieval
  using semantic search, metadata
  filtering, and hybrid strategies
end note

legend right
  **Component Types**
  |= Type |= Description |
  | User Interface | User-facing components |
  | Orchestration | Workflow coordination |
  | RAG Core | Central RAG functionality |
  | Query Processing | Query enhancement |
  | Retrieval | Knowledge access |
  | Storage | Data persistence |
  | Integration | External connections |
  | LLM | Language model services |
endlegend

@enduml
