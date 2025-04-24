@startuml Analytics and Metrics Architecture

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
skinparam padding 6
skinparam nodesep 50
skinparam ranksep 70

' Define colors for different flow types
!define TELEMETRY_FLOW #4B0082
!define ANALYTICS_FLOW #008080
!define REPORTING_FLOW #8B4513
!define USER_FLOW #D2691E

' Legend
legend
  |= Arrow |= Description |
  |<color:#4B0082>――→</color> | Telemetry Flow |
  |<color:#008080>――→</color> | Analytics Flow |
  |<color:#8B4513>――→</color> | Reporting Flow |
  |<color:#D2691E>――→</color> | User Flow |
endlegend

' Client Layer
package "Client Layer" #F4F4FF {
  [Analytics Dashboard] as Dashboard
  [Executive Reports] as ExecReports
  [Admin Console] as AdminConsole
  
  Dashboard -[hidden]right- ExecReports
  ExecReports -[hidden]right- AdminConsole
  
  note left of Dashboard
    Real-time analytics with
    customizable visualizations
  end note
}

' API Layer
package "API Layer" #F0F0FF {
  [Analytics API] as AnalyticsAPI
  [Reporting API] as ReportingAPI
  
  AnalyticsAPI -[hidden]right- ReportingAPI
}

' Analytics Engine
package "Analytics Engine" #E6E6FA {
  [Metrics Collector] as MetricsCollector
  [Event Processor] as EventProcessor
  [Time Series Analyzer] as TimeSeriesAnalyzer
  
  MetricsCollector -[hidden]right- EventProcessor
  EventProcessor -[hidden]right- TimeSeriesAnalyzer
  
  note left of MetricsCollector
    Collects performance metrics
    from all system components
  end note
}

' Core Analytics
package "Core Analytics" #E0E4FF {
  [User Behavior Analytics] as UserBehavior
  [Agent Performance Analyzer] as AgentAnalyzer
  [System Health Monitor] as HealthMonitor
  [ROI Calculator] as ROICalc
  
  UserBehavior -[hidden]right- AgentAnalyzer
  AgentAnalyzer -[hidden]right- HealthMonitor
  HealthMonitor -[hidden]right- ROICalc
}

' Machine Learning Layer
package "ML Analytics" #FFF0F5 {
  [Usage Pattern Learner] as PatternLearner
  [Anomaly Detector] as AnomalyDetector
  [Predictive Analytics Engine] as PredictiveEngine
  
  PatternLearner -[hidden]right- AnomalyDetector
  AnomalyDetector -[hidden]right- PredictiveEngine
}

' Multi-Agent System
package "Multi-Agent System" #E0F3FF {
  [Orchestrator] as Orchestrator
  [Agent Base] as AgentBase
  [Domain Agents] as DomainAgents
  
  Orchestrator -[hidden]right- AgentBase
  AgentBase -[hidden]right- DomainAgents
}

' Storage Layer
package "Analytics Storage" #FFF7E9 {
  database "Metrics Database" as MetricsDB
  database "Event Store" as EventStore
  database "Reports Database" as ReportsDB
  
  MetricsDB -[hidden]right- EventStore
  EventStore -[hidden]right- ReportsDB
}

' Reporting Engine
package "Reporting Engine" #FFECDA {
  [Report Generator] as ReportGen
  [Visualization Engine] as VisEngine
  [Alert Manager] as AlertManager
  
  ReportGen -[hidden]right- VisEngine
  VisEngine -[hidden]right- AlertManager
  
  note left of ReportGen
    Generates customizable reports
    for different stakeholders
  end note
}

'==================================
' Connection Flows - Vertical Focus
'==================================

' Telemetry collection
Orchestrator -down-> MetricsCollector : <color:#4B0082>1. System metrics</color>
AgentBase -down-> MetricsCollector : <color:#4B0082>2. Agent telemetry</color>
DomainAgents -down-> MetricsCollector : <color:#4B0082>3. Domain-specific metrics</color>

' Metrics processing
MetricsCollector -down-> EventProcessor : <color:#4B0082>4. Raw metrics</color>
EventProcessor -down-> TimeSeriesAnalyzer : <color:#4B0082>5. Processed events</color>

' Core analytics
TimeSeriesAnalyzer -down-> UserBehavior : <color:#008080>6a. User metrics</color>
TimeSeriesAnalyzer -down-> AgentAnalyzer : <color:#008080>6b. Agent metrics</color>
TimeSeriesAnalyzer -down-> HealthMonitor : <color:#008080>6c. System metrics</color>
TimeSeriesAnalyzer -down-> ROICalc : <color:#008080>6d. Business metrics</color>

' ML analytics
UserBehavior -down-> PatternLearner : <color:#008080>7a. Usage patterns</color>
AgentAnalyzer -down-> AnomalyDetector : <color:#008080>7b. Performance anomalies</color>
HealthMonitor -down-> PredictiveEngine : <color:#008080>7c. System trends</color>

' Storage operations
MetricsCollector -right-> MetricsDB : <color:#008080>8. Store metrics</color>
EventProcessor -right-> EventStore : <color:#008080>9. Store events</color>
TimeSeriesAnalyzer -right-> MetricsDB : <color:#008080>10. Store analyzed data</color>

' Report generation
UserBehavior -down-> ReportGen : <color:#8B4513>11a. User insights</color>
AgentAnalyzer -down-> ReportGen : <color:#8B4513>11b. Agent performance</color>
HealthMonitor -down-> AlertManager : <color:#8B4513>11c. System alerts</color>
ROICalc -down-> ReportGen : <color:#8B4513>11d. ROI metrics</color>

PatternLearner -down-> ReportGen : <color:#8B4513>12a. Pattern insights</color>
AnomalyDetector -down-> AlertManager : <color:#8B4513>12b. Anomaly alerts</color>
PredictiveEngine -down-> ReportGen : <color:#8B4513>12c. Predictive insights</color>

' Report visualization and storage
ReportGen -right-> ReportsDB : <color:#8B4513>13. Store reports</color>
ReportGen -down-> VisEngine : <color:#8B4513>14. Visualization data</color>
AlertManager -down-> VisEngine : <color:#8B4513>15. Alert visualizations</color>

' API access
VisEngine -down-> AnalyticsAPI : <color:#8B4513>16. Visualization data</color>
ReportGen -down-> ReportingAPI : <color:#8B4513>17. Report data</color>
AlertManager -down-> AnalyticsAPI : <color:#8B4513>18. Alert data</color>

' User interface
AnalyticsAPI -down-> Dashboard : <color:#D2691E>19. Dashboard data</color>
ReportingAPI -down-> ExecReports : <color:#D2691E>20. Executive reports</color>
AnalyticsAPI -down-> AdminConsole : <color:#D2691E>21. Admin metrics</color>
ReportingAPI -down-> AdminConsole : <color:#D2691E>22. System reports</color>

' User feedback flow
Dashboard -up-> AnalyticsAPI : <color:#D2691E>23. User interactions</color>
ExecReports -up-> ReportingAPI : <color:#D2691E>24. Report requests</color>
AdminConsole -up-> AnalyticsAPI : <color:#D2691E>25. Configuration changes</color>

@enduml