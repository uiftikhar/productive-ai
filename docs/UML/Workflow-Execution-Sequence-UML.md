@startuml Workflow Execution Sequence

!theme plain
skinparam SequenceMessageAlignment center
skinparam MaxMessageSize 250
skinparam WrapWidth 250
skinparam SequenceGroupBodyBackgroundColor transparent

' Define participants with colored backgrounds
participant "Client\nApplication" as Client #F5F5F5
participant "EnhancedWorkflow\nExecutorService" as WorkflowExecutor #E3F2FD
participant "AgentDiscovery\nService" as AgentDiscovery #E0F7FA
participant "WorkflowDefinition" as WorkflowDef #FFF9C4
participant "WorkflowExecution\nContext" as ExecutionContext #E8F5E9
participant "CommunicationBus\nService" as CommBus #FFF3E0
participant "KnowledgeRetrieval\nAgent" as KRAgent #EDE7F6
participant "ResponseGeneration\nAgent" as RGAgent #F3E5F5
participant "MetricsCollector\nService" as Metrics #FFEBEE

' Start sequence
title Workflow Execution Sequence

== Workflow Initialization ==
autonumber 1
Client -> WorkflowExecutor : executeWorkflow(definition, input, options)
activate WorkflowExecutor

WorkflowExecutor -> WorkflowDef : validateDAG()
activate WorkflowDef
WorkflowDef --> WorkflowExecutor : true
deactivate WorkflowDef

WorkflowExecutor -> ExecutionContext : create(workflowId, input, options)
activate ExecutionContext
ExecutionContext --> WorkflowExecutor : context
deactivate ExecutionContext

WorkflowExecutor -> Metrics : startWorkflowTrace(workflowId)
activate Metrics
Metrics --> WorkflowExecutor : traceContext
deactivate Metrics

== Agent Discovery and Resolution ==
WorkflowExecutor -> WorkflowDef : getStartingSteps()
activate WorkflowDef
WorkflowDef --> WorkflowExecutor : initialSteps
deactivate WorkflowDef

loop for each initial step
  WorkflowExecutor -> AgentDiscovery : discoverAgentsForCapability(step.capability, criteria)
  activate AgentDiscovery
  
  AgentDiscovery -> AgentDiscovery : rankAgentsByPerformance(agents, criteria)
  AgentDiscovery --> WorkflowExecutor : rankedAgents
  deactivate AgentDiscovery
  
  WorkflowExecutor -> WorkflowExecutor : selectBestAgent(rankedAgents)
end

== Workflow Execution ==
loop until all steps complete
  WorkflowExecutor -> Metrics : startStepTrace(traceContext, stepId)
  activate Metrics
  
  alt Knowledge Retrieval Step
    WorkflowExecutor -> KRAgent : execute(input, context)
    activate KRAgent
    
    KRAgent -> CommBus : publishMessage("log", statusMessage)
    activate CommBus
    CommBus --> KRAgent : void
    deactivate CommBus
    
    KRAgent -> KRAgent : retrieveKnowledge(query)
    KRAgent -> KRAgent : rankResults(items, query)
    KRAgent --> WorkflowExecutor : result
    deactivate KRAgent
    
  else Response Generation Step
    WorkflowExecutor -> RGAgent : execute(input, context)
    activate RGAgent
    
    RGAgent -> CommBus : publishMessage("log", statusMessage)
    activate CommBus
    CommBus --> RGAgent : void
    deactivate CommBus
    
    RGAgent -> RGAgent : generateResponse(query, context)
    RGAgent --> WorkflowExecutor : result
    deactivate RGAgent
  end
  
  WorkflowExecutor -> ExecutionContext : updateState(stepId, result)
  activate ExecutionContext
  ExecutionContext --> WorkflowExecutor : void
  deactivate ExecutionContext
  
  WorkflowExecutor -> Metrics : endStepTrace(traceContext, stepId, result)
  Metrics --> WorkflowExecutor : void
  deactivate Metrics
  
  WorkflowExecutor -> WorkflowDef : getNextSteps(currentStep, result)
  activate WorkflowDef
  WorkflowDef --> WorkflowExecutor : nextSteps
  deactivate WorkflowDef
end

== Workflow Completion ==
WorkflowExecutor -> ExecutionContext : aggregateFinalResult()
activate ExecutionContext
ExecutionContext --> WorkflowExecutor : finalResult
deactivate ExecutionContext

WorkflowExecutor -> Metrics : endWorkflowTrace(traceContext, finalResult)
activate Metrics
Metrics --> WorkflowExecutor : workflowTrace
deactivate Metrics

WorkflowExecutor -> CommBus : publishMessage("workflow.complete", workflowResult)
activate CommBus
CommBus --> WorkflowExecutor : void
deactivate CommBus

WorkflowExecutor --> Client : workflowResult
deactivate WorkflowExecutor

== Error Handling (Alternative Flow) ==
note over WorkflowExecutor, Metrics
  Error handling flow (if an error occurs during execution)
end note

alt On Error During Step Execution
  KRAgent --> WorkflowExecutor : throws error
  activate WorkflowExecutor
  
  WorkflowExecutor -> WorkflowExecutor : handleError(workflowId, stepId, error)
  WorkflowExecutor -> Metrics : recordMetric("workflow.step.error", 1, tags)
  activate Metrics
  Metrics --> WorkflowExecutor : void
  deactivate Metrics
  
  alt Retry Available
    WorkflowExecutor -> WorkflowExecutor : scheduleRetry(step, context, retryCount + 1)
    
  else Max Retries Exceeded
    WorkflowExecutor -> CommBus : publishMessage("workflow.error", errorDetails)
    activate CommBus
    CommBus --> WorkflowExecutor : void
    deactivate CommBus
    
    WorkflowExecutor -> ExecutionContext : markStepFailed(stepId, error)
    activate ExecutionContext
    ExecutionContext --> WorkflowExecutor : void
    deactivate ExecutionContext
    
    alt Fallback Available
      WorkflowExecutor -> WorkflowExecutor : executeFallbackStrategy(step, context)
    else
      WorkflowExecutor -> Metrics : endWorkflowTrace(traceContext, error)
      activate Metrics
      Metrics --> WorkflowExecutor : workflowTrace
      deactivate Metrics
      
      WorkflowExecutor --> Client : errorResult
    end
  end
  deactivate WorkflowExecutor
end

@enduml
