# [DEPRECATED] Migration to Adaptive Execution Engine

This document outlines the services that are being deprecated as part of the migration to the new Adaptive Execution Engine (Milestone 3).

## Milestone 3: Adaptive Execution Engine (Status: COMPLETED)

The following services have been deprecated and replaced by our new implementation:

### Scheduling and Execution

| Deprecated Service | Replacement | Status |
|-------------------|-------------|--------|
| `SequentialExecutionService` | `DynamicPrioritizationService` | Completed |
| `BasicSchedulerService` | `ContextAwareSchedulerService` | Completed |
| `LinearTaskQueueService` | `DependencyAwareQueueService` | Completed |

### Resource Management

| Deprecated Service | Replacement | Status |
|-------------------|-------------|--------|
| `StaticAgentRegistry` | `AgentAvailabilityService` | Completed |
| `SimpleResourceAllocationService` | `CapabilityAllocationServiceImpl` | Completed |
| `FixedAssignmentService` | `LoadBalancingServiceImpl` | Completed |

### Parallel Execution

| Deprecated Service | Replacement | Status |
|-------------------|-------------|--------|
| `BasicBarrierService` | `SynchronizationManagerService` | Completed |
| `GlobalStateService` | `ParallelDataSharingServiceImpl` | Completed |
| `SingleTaskProgressTracker` | `MultiTaskProgressServiceImpl` | Completed |

### Execution Monitoring

| Deprecated Service | Replacement | Status |
|-------------------|-------------|--------|
| `SimpleMetricsCollector` | `PerformanceMonitorServiceImpl` | Completed |
| `StaticExecutionService` | `PlanAdjustmentServiceImpl` | Completed |
| `BasicErrorHandlerService` | `FailureRecoveryServiceImpl` | Completed |

## Migration Guide

For teams currently using the deprecated services, migration to the new adaptive execution services should follow these steps:

1. **Assess Dependencies**: Identify all components that depend on the deprecated services
2. **Update Interface Usage**: Modify code to use the new interfaces defined in the `interfaces/` directory
3. **Adapt to New API**: Update function calls to match the new service APIs
4. **Add Configuration**: Configure the new services with appropriate parameters
5. **Test Thoroughly**: Verify that functionality works correctly with the new services

## Implementation Benefits

The new Adaptive Execution Engine provides several advantages over the deprecated services:

1. **Intelligent Prioritization**: Tasks are now prioritized based on multiple factors including dependencies, deadlines, and execution context
2. **Dynamic Resource Allocation**: Resources are allocated based on capabilities, current load, and task priority
3. **Advanced Parallel Execution**: Sophisticated coordination between parallel execution paths
4. **Self-Healing Capabilities**: Automatic adaptation to failures and changing execution conditions
5. **Performance Optimization**: Continuous monitoring and adjustment for optimal performance

## Example Migration

```typescript
// Old code using deprecated services
const scheduler = new BasicSchedulerService();
scheduler.scheduleTask(task);

// New code using adaptive execution engine
const scheduler = new ContextAwareSchedulerService();
scheduler.scheduleTask(task, {
  priority: 5,
  deadlineMs: 30000,
  context: { urgency: 'high' }
});
```

## Timeline

- **Immediate**: Begin transitioning to new services
- **One Month**: Complete migration of critical system components
- **Three Months**: Finalize migration of all system components
- **Six Months**: Removal of deprecated services from codebase

## Support

For assistance with migration, please contact the Adaptive Execution Engine team. 