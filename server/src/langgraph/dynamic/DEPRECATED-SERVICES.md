# [DEPRECATED] Migration to Dynamic Graph System

**NOTE: This file is outdated. Please refer to the consolidated deprecated services documentation at: server/src/DEPRECATED-SERVICES.md**

As part of **Phase 4, Milestone 1: Dynamic LangGraph System**, the following services and components have been deprecated and will be replaced by the new dynamic graph system:

## Deprecated Services

### Static Workflow System

The following components of the static workflow system are now deprecated:

1. **`BaseWorkflow`** (`server/src/langgraph/core/workflows/base-workflow.ts`)
   - Replaced by: `DynamicGraphService`
   - Migration path: Use the `DynamicGraphService` for creating runtime-modifiable workflows

2. **`AgentWorkflow`** (`server/src/langgraph/core/workflows/agent-workflow.ts`) 
   - Replaced by: `AgentDecisionNodeService` and `DynamicGraphService`
   - Migration path: Use dynamic agent decision nodes for agent-driven workflows

3. **`WorkflowManagerService`** (`server/src/langgraph/core/workflows/workflow-manager.service.ts`)
   - Replaced by: `EmergentControllerService`
   - Migration path: Use the emergent controller for managing dynamic workflow execution

4. **`SupervisorWorkflow`** (`server/src/langgraph/core/workflows/supervisor-workflow.ts`)
   - Replaced by: A combination of `EmergentControllerService` and `ObservationActionLoopService`
   - Migration path: Use the observation-action loop pattern for supervisory control

5. **`ExecutionMemoryService`** (`server/src/agents/services/execution-memory.service.ts`)
   - Replaced by: Dynamic path exploration and evaluation services
   - Migration path: Use `ParallelExplorationService` and `PathEvaluationService` for execution memory and learning

### PredefinedNodeRegistry

The predefined node registry system has been replaced with a fully dynamic node generation system that allows:
- Runtime creation of nodes based on agent decisions
- Dynamic reconfiguration of workflow paths
- Emergent behavior through self-organizing workflows

## New System Components

The new Dynamic LangGraph System consists of the following core components:

### Core Dynamic Graph Engine
- `DynamicGraphService` - For runtime node generation
- `GraphModification` interfaces - For graph structure changes
- `AgentDecisionNodeService` - For agent-driven path alterations

### Emergent Graph Controller
- `EmergentControllerService` - For state transitions
- `DecisionPoint` interfaces - For runtime path selection
- `ObservationActionLoopService` - For graph evolution

### Parallel Path Execution
- `ParallelExplorationService` - For concurrent paths
- `PathEvaluationService` - For comparing outcomes
- `PathMergingService` - For reconciling parallel work

## Migration Guidelines

To migrate from the static workflow system to the new dynamic graph system:

1. **Replace static workflow definitions** with dynamic graph service initialization
2. **Convert predefined nodes** to dynamically generated nodes
3. **Replace workflow manager calls** with emergent controller service calls
4. **Implement observation-action loops** for adaptive behavior
5. **Use parallel exploration** for complex problem-solving

## Benefits of the Dynamic System

The new dynamic graph system offers several advantages:

- **Runtime Adaptability**: Workflows can evolve during execution
- **Emergent Behavior**: Complex workflows can emerge from simple decision rules
- **Parallel Exploration**: Multiple strategies can be tried simultaneously
- **Self-Recovery**: Workflows can automatically adapt to errors and unexpected situations
- **Learning from Experience**: Successful execution paths can be reinforced

## Timeline

The static workflow system will be fully removed in a future milestone. All new development should use the dynamic graph system. 