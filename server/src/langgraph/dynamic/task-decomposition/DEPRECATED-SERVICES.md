# [DEPRECATED] Services in Milestone 2: Autonomous Task Decomposition

**NOTE: This file is outdated. Please refer to the consolidated deprecated services documentation at: server/src/DEPRECATED-SERVICES.md**

This document outlines the services that have been deprecated as part of implementing Milestone 2 (Autonomous Task Decomposition). These services should no longer be used in new code, and existing implementations should gradually migrate to the new services.

## Services Being Deprecated

### Task Building and Definition
- **PredefinedTaskBuilderService**
   - Purpose: Creates predefined, static task structures
   - Replaced by: `ComplexityAssessmentService` and `CollaborativeTaskDefinitionService`
   - Migration path: Use collaborative definition and complexity analysis to dynamically generate tasks

### Task Hierarchy Management
- **StaticTaskHierarchyService**
   - Purpose: Maintains a rigid hierarchy of predefined tasks
   - Replaced by: `HierarchicalTaskService`
   - Migration path: Create dynamic task hierarchies with proper parent-child relationships

### Task Assignment
- **TaskAssignmentOrchestrator**
   - Purpose: Assigns tasks to agents based on predefined rules
   - Replaced by: `SubtaskDelegationService` and `TaskNegotiationService`
   - Migration path: Use capability-based matching and negotiation for task assignments

### Workflow Step Definition
- **WorkflowStepDefinitionService**
   - Purpose: Defines workflow steps in a static manner
   - Replaced by: `CollaborativeTaskDefinitionService` and `MilestoneDetectionService`
   - Migration path: Use collaborative definition with milestone tracking

### Responsibility Management
- **AgentResponsibilityManager**
   - Purpose: Manages agent responsibilities in a static, predefined manner
   - Replaced by: `SharedResponsibilityService`
   - Migration path: Use dynamic responsibility assignment with contribution tracking

### Legacy Task Management
- **task-planning.service.ts**
   - Purpose: Basic task planning with limited decomposition capabilities
   - Replaced by: New Task Analysis Framework services
   - Migration path: Use the new complexity assessment, dependency detection, and resource estimation

- **task-breakdown.service.ts**
   - Purpose: Simple task breakdown with minimal collaboration
   - Replaced by: `CollaborativeTaskDefinitionService` and `HierarchicalTaskService`
   - Migration path: Use hierarchical task management with collaborative definition

- **task-coordination.service.ts**
   - Purpose: Basic coordination between agents for tasks
   - Replaced by: `SubtaskDelegationService` and `TaskNegotiationService`
   - Migration path: Use delegation and negotiation for advanced coordination

- **collaborative-task-breakdown.service.ts**
   - Purpose: Early implementation of collaborative task breakdown
   - Replaced by: `CollaborativeTaskDefinitionService` with consensus mechanisms
   - Migration path: Use the new proposal-based collaborative definition

- **responsibility-tracking.service.ts**
   - Purpose: Basic tracking of agent responsibilities
   - Replaced by: `SharedResponsibilityService`
   - Migration path: Use advanced responsibility management with contribution tracking

## Migration Strategy

1. **Identify Uses**: Locate all uses of deprecated services in your codebase
2. **Plan Transition**: Map each deprecated service to its replacement
3. **Gradual Migration**: Implement the new services alongside old ones for critical systems
4. **Testing**: Thoroughly test the new implementations before fully replacing old services
5. **Documentation**: Update documentation to reflect the new service architecture

## New Architecture Benefits

- **Flexibility**: The new services are more adaptable to different task types and domains
- **Autonomy**: Agents can now operate with greater independence in task management
- **Collaboration**: Enhanced support for multi-agent collaboration and consensus
- **Intelligence**: LLM-powered services provide more sophisticated analysis and decision-making
- **Integration**: Better integration with the Dynamic Graph Engine from Milestone 1
- **Accountability**: Improved tracking of contributions and responsibilities

## Implementation Guidance

1. Use `ComplexityAssessmentService` to determine if tasks should be decomposed
2. Use `DependencyDetectionService` to identify relationships between tasks
3. Use `ResourceEstimationService` to calculate resource requirements
4. Use `HierarchicalTaskService` for managing task hierarchies and parent-child relationships
5. Use `MilestoneDetectionService` for tracking progress within tasks
6. Use `CollaborativeTaskDefinitionService` for multi-agent task boundary definition
7. Use `TaskNegotiationService` for handling disputes and negotiating task properties
8. Use `SubtaskDelegationService` for assigning tasks to appropriate agents
9. Use `SharedResponsibilityService` for managing peer-based task responsibilities and contributions

## Timeline

- **Immediate**: Begin using new services for new development
- **Short-term (1-2 months)**: Migrate non-critical systems to new services
- **Medium-term (3-6 months)**: Complete migration of all systems
- **Long-term**: Remove deprecated services from the codebase

## Support

The deprecated services will continue to function for a transition period but will not receive updates or bug fixes. All new development should use the services introduced in Milestone 2. 