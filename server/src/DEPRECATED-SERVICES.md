# Deprecated Services - Migration to Agentic Architecture

This document provides a comprehensive list of services and components that are being deprecated as part of our transition from an orchestrated workflow system to a fully agentic architecture. This deprecation spans two major milestones:

1. **Phase 4, Milestone 1: Dynamic LangGraph System** - Replacing static workflows with dynamic, emergent task execution
2. **Phase 4, Milestone 2: Autonomous Task Decomposition** - Implementing collaborative task breakdown and negotiation

Services listed here should no longer be used in new code, and existing implementations should gradually migrate to the new services according to the migration paths provided.

## Phase 4, Milestone 1: Static Workflow System Deprecation

### Core Workflow Components

1. **`BaseWorkflow`** (`server/src/langgraph/core/workflows/base-workflow.ts`)
   - Purpose: Provides foundation for static workflow definitions
   - Replaced by: `DynamicGraphService`
   - Migration path: Use the `DynamicGraphService` for creating runtime-modifiable workflows

2. **`AgentWorkflow`** (`server/src/langgraph/core/workflows/agent-workflow.ts`) 
   - Purpose: Implements agent-driven workflows with predefined steps
   - Replaced by: `AgentDecisionNodeService` and `DynamicGraphService`
   - Migration path: Use dynamic agent decision nodes for agent-driven workflows

3. **`WorkflowManagerService`** (`server/src/langgraph/core/workflows/workflow-manager.service.ts`)
   - Purpose: Manages execution of static workflows
   - Replaced by: `EmergentControllerService`
   - Migration path: Use the emergent controller for managing dynamic workflow execution

4. **`SupervisorWorkflow`** (`server/src/langgraph/core/workflows/supervisor-workflow.ts`)
   - Purpose: Implements supervisory control over agent workflows
   - Replaced by: A combination of `EmergentControllerService` and `ObservationActionLoopService`
   - Migration path: Use the observation-action loop pattern for supervisory control

5. **`ExecutionMemoryService`** (`server/src/agents/services/execution-memory.service.ts`)
   - Purpose: Maintains memory of workflow execution
   - Replaced by: Dynamic path exploration and evaluation services
   - Migration path: Use `ParallelExplorationService` and `PathEvaluationService` for execution memory and learning

### Workflow Orchestration

1. **`OrchestratorAgentService`** (`server/src/agents/specialized/orchestrator-agent.ts`)
   - Purpose: Directly controls workflow steps in a rigid manner
   - Replaced by: `EmergentControllerService` and `AgentDecisionNodeService`
   - Migration path: Allow agents to make decisions that modify the graph structure during execution

2. **`SupervisorAgent`** (`server/src/agents/specialized/supervisor-agent.ts`)
   - Purpose: Acts as central coordinator with predefined workflows
   - Replaced by: Decentralized agent decision-making
   - Migration path: Implement peer-to-peer agent collaboration with dynamic coordination

3. **`VisualizationService`** (`server/src/agents/services/visualization.service.ts`)
   - Purpose: Visualizes predefined workflows
   - Replaced by: Dynamic graph visualization
   - Migration path: Implement visualization that captures emergent workflows and agent reasoning

## Phase 4, Milestone 2: Task Management Deprecation

### Task Building and Definition

1. **`PredefinedTaskBuilderService`**
   - Purpose: Creates predefined, static task structures
   - Replaced by: `ComplexityAssessmentService` and `CollaborativeTaskDefinitionService`
   - Migration path: Use collaborative definition and complexity analysis to dynamically generate tasks

2. **`StaticTaskHierarchyService`**
   - Purpose: Maintains a rigid hierarchy of predefined tasks
   - Replaced by: `HierarchicalTaskService`
   - Migration path: Create dynamic task hierarchies with proper parent-child relationships

3. **`TaskAssignmentOrchestrator`**
   - Purpose: Assigns tasks to agents based on predefined rules
   - Replaced by: `SubtaskDelegationService` and `TaskNegotiationService`
   - Migration path: Use capability-based matching and negotiation for task assignments

4. **`WorkflowStepDefinitionService`**
   - Purpose: Defines workflow steps in a static manner
   - Replaced by: `CollaborativeTaskDefinitionService` and `MilestoneDetectionService`
   - Migration path: Use collaborative definition with milestone tracking

### Responsibility Management

1. **`AgentResponsibilityManager`**
   - Purpose: Manages agent responsibilities in a static, predefined manner
   - Replaced by: `SharedResponsibilityService`
   - Migration path: Use dynamic responsibility assignment with contribution tracking

### Legacy Task Management

1. **`task-planning.service.ts`** (`server/src/agents/services/task-planning.service.ts`)
   - Purpose: Basic task planning with limited decomposition capabilities
   - Replaced by: New Task Analysis Framework services
   - Migration path: Use the new complexity assessment, dependency detection, and resource estimation

2. **`task-breakdown.service.ts`** (`server/src/agents/services/task-breakdown.service.ts`)
   - Purpose: Simple task breakdown with minimal collaboration
   - Replaced by: `CollaborativeTaskDefinitionService` and `HierarchicalTaskService`
   - Migration path: Use hierarchical task management with collaborative definition

3. **`task-coordination.service.ts`** (`server/src/agents/services/task-coordination.service.ts`)
   - Purpose: Basic coordination between agents for tasks
   - Replaced by: `SubtaskDelegationService` and `TaskNegotiationService`
   - Migration path: Use delegation and negotiation for advanced coordination

4. **`collaborative-task-breakdown.service.ts`** (`server/src/agents/services/collaborative-task-breakdown.service.ts`)
   - Purpose: Early implementation of collaborative task breakdown
   - Replaced by: `CollaborativeTaskDefinitionService` with consensus mechanisms
   - Migration path: Use the new proposal-based collaborative definition

5. **`responsibility-tracking.service.ts`**
   - Purpose: Basic tracking of agent responsibilities
   - Replaced by: `SharedResponsibilityService`
   - Migration path: Use advanced responsibility management with contribution tracking

## Additional Deprecated Services

### Agent Collaboration Model

1. **`team-assembly.service.ts`** (`server/src/agents/services/team-assembly.service.ts`)
   - Purpose: Static team formation based on predefined roles
   - Replaced by: Dynamic team formation through agent capabilities and negotiation
   - Migration path: Use the task decomposition framework to dynamically form teams

2. **`agent-registry.service.ts`** (`server/src/agents/services/agent-registry.service.ts`)
   - Purpose: Simple registry of available agents
   - Replaced by: `AgentDecisionNodeService` and dynamic agent integration
   - Migration path: Enable dynamic discovery and integration of agents

3. **`agent-task-executor.service.ts`** (`server/src/agents/services/agent-task-executor.service.ts`)
   - Purpose: Static task execution for agents
   - Replaced by: Dynamic graph execution with agent decision nodes
   - Migration path: Use the dynamic graph system for task execution

### Agent Communication

1. **`request-formulation.service.ts`** (`server/src/agents/services/request-formulation.service.ts`)
   - Purpose: Formulates requests in a predefined manner
   - Replaced by: Dynamic agent communication in the context of emergent workflows
   - Migration path: Implement peer-to-peer agent communication with negotiation

2. **`response-generation.service.ts`** (`server/src/agents/services/response-generation.service.ts`)
   - Purpose: Generates responses following rigid templates
   - Replaced by: Context-aware agent communication
   - Migration path: Integrate with dynamic task context for adaptive responses

## New Architecture Components

The new architecture consists of the following core components:

### Dynamic Graph Engine (Milestone 1)

- `DynamicGraphService` - For runtime node generation
- `GraphModification` interfaces - For graph structure changes
- `AgentDecisionNodeService` - For agent-driven path alterations
- `EmergentControllerService` - For state transitions
- `DecisionPoint` interfaces - For runtime path selection
- `ObservationActionLoopService` - For graph evolution
- `ParallelExplorationService` - For concurrent paths
- `PathEvaluationService` - For comparing outcomes
- `PathMergingService` - For reconciling parallel work

### Autonomous Task Decomposition (Milestone 2)

- `ComplexityAssessmentService` - For determining task difficulty
- `DependencyDetectionService` - For identifying relationships
- `ResourceEstimationService` - For calculating needs
- `HierarchicalTaskService` - For parent-child relationships
- `MilestoneDetectionService` - For progress tracking
- `SubtaskDelegationService` - For assignment
- `CollaborativeTaskDefinitionService` - For joint creation
- `TaskNegotiationService` - For proposal framework
- `SharedResponsibilityService` - For managing responsibilities and contributions

## Migration Strategy

1. **Identify Uses**: Locate all uses of deprecated services in your codebase
2. **Plan Transition**: Map each deprecated service to its replacement
3. **Gradual Migration**: Implement the new services alongside old ones for critical systems
4. **Testing**: Thoroughly test the new implementations before fully replacing old services
5. **Documentation**: Update documentation to reflect the new service architecture

## Benefits of the New Architecture

- **Autonomy**: Agents determine how to solve problems without central coordination
- **Emergent Behavior**: Complex workflows emerge from simple decision rules
- **Adaptability**: System adapts to changing requirements and unexpected situations
- **Dynamic Collaboration**: Teams form based on capabilities and task requirements
- **Transparency**: Visualization shows actual reasoning and collaboration journey
- **Flexibility**: Services are more adaptable to different task types and domains
- **Intelligence**: LLM-powered services provide sophisticated analysis and decision-making
- **Accountability**: Improved tracking of contributions and responsibilities

## Implementation Guidance

1. Use `DynamicGraphService` for creating dynamic workflows
2. Use `AgentDecisionNodeService` for agent decision points
3. Use `EmergentControllerService` for workflow execution
4. Use `ComplexityAssessmentService` to determine if tasks should be decomposed
5. Use `DependencyDetectionService` to identify relationships between tasks
6. Use `ResourceEstimationService` to calculate resource requirements
7. Use `HierarchicalTaskService` for managing task hierarchies
8. Use `MilestoneDetectionService` for tracking progress
9. Use `CollaborativeTaskDefinitionService` for joint task definition
10. Use `TaskNegotiationService` for handling disputes and negotiation
11. Use `SubtaskDelegationService` for assigning tasks to agents
12. Use `SharedResponsibilityService` for managing responsibilities

## Timeline

- **Immediate**: Begin using new services for new development
- **Short-term (1-2 months)**: Migrate non-critical systems to new services
- **Medium-term (3-6 months)**: Complete migration of all systems
- **Long-term**: Remove deprecated services from the codebase

## Support

The deprecated services will continue to function for a transition period but will not receive updates or bug fixes. All new development should use the services introduced in Phase 4 Milestones 1 and 2. 