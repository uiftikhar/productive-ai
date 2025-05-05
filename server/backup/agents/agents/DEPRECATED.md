# DEPRECATED: Agent System

## Status: Deprecated

The agent system in this directory is deprecated and will be removed in a future version. It has been replaced by the new agentic meeting analysis system located in `/server/src/langgraph/agentic-meeting-analysis`.

## Migration Guide

To migrate from the old agent system to the new agentic meeting analysis system:

1. For meeting analysis functionality, use the new APIs from `langgraph/agentic-meeting-analysis` directory.
2. For backward compatibility, use the API compatibility layer in `langgraph/agentic-meeting-analysis/api-compatibility`.

## Differences between old and new systems

The new agentic meeting analysis system offers several advantages:

- **Goal-Oriented Analysis**: Analysis is driven by objectives rather than predefined steps
- **Dynamic Team Formation**: Specialized agents are assembled based on meeting characteristics 
- **Collaborative Analysis**: Agents share context, communicate, and collaborate
- **Self-Directed Analysis**: Agents autonomously determine the most effective analysis approach
- **Confidence Scoring**: Agents provide confidence levels for their analyses
- **Rich Visualization**: Visualizations of both analysis results and the analysis process

## Deprecated Components

The following components are deprecated:

### Base Components
- `BaseAgent` - Base agent implementation
- `MetacognitiveBaseAgent` - Base agent with metacognitive capabilities
- `MetacognitiveAgentImplementation` - Implementation of a metacognitive agent

### Specialized Agents
- `MeetingAnalysisAgent` - Analyze meeting transcripts
- `KnowledgeRetrievalAgent` - Retrieve knowledge from context
- `DocumentRetrievalAgent` - Retrieve documents
- `DecisionTrackingAgent` - Track decisions made during meetings
- `ThemeClassifierAgent` - Classify themes in text
- `SupervisorAgent` - Coordinate multiple agents

### Factories
- `AgentFactory` - Factory for creating agent instances
- `ClassifierFactory` - Factory for creating classifiers
- `ClassifierConfigService` - Configuration for classifiers

### Services
- `AgentRegistryService` - Central registry for agent instances
- `AgentTaskExecutorService` - Execute agent tasks
- `TaskPlanningService` - Plan and orchestrate tasks
- `AgentMessagingService` - Handle messaging between agents
- `ProgressMonitoringService` - Monitor agent progress
- Various other services for agent coordination and collaboration

### Interfaces
- `BaseAgentInterface` - Core interface for all agents
- `WorkflowCompatibleAgent` - Interface for workflow compatibility
- `MetacognitiveAgent` - Interface for agents with metacognitive capabilities
- Various other interfaces for agent memory, dialogue, etc.

## Timeline for Removal

This deprecated system will remain available for backward compatibility but will not receive new features. It will be completely removed in a future major version.

## References

For more information about the new agentic meeting analysis system, see:
- `/server/src/langgraph/agentic-meeting-analysis/README.md`
- `/server/src/langgraph/agentic-meeting-analysis/PHASE6-SUMMARY.md` 