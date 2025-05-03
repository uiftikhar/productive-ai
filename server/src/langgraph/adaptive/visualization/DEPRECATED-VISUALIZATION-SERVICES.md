# Deprecated Visualization Services

This document describes visualization services that are deprecated as part of Milestone 4 and provides migration guidance for transitioning to the new visualization architecture.

## Deprecated Services

### StaticVisualizationService
**Status**: DEPRECATED  
**Replaced By**: `RealTimeGraphRendererImpl`

The StaticVisualizationService only supported pre-defined, static visualizations that couldn't adapt to changing workflows. It has been completely replaced by the real-time graph renderer that supports dynamic updates and multiple layout algorithms.

#### Migration Path
```typescript
// Old approach
const staticVisualizer = new StaticVisualizationService();
staticVisualizer.renderWorkflow(workflowDefinition);

// New approach
const graphRenderer = new RealTimeGraphRendererImpl();
const graphId = graphRenderer.initializeGraph('workflow1', 'Main Workflow');

// Add nodes and edges dynamically
workflowSteps.forEach(step => {
  graphRenderer.addNode(graphId, {
    id: step.id,
    type: GraphNodeType.TASK,
    label: step.name,
    properties: step.properties,
    state: GraphNodeState.INACTIVE
  });
});

// Subscribe to updates
graphRenderer.subscribeToGraphUpdates(graphId, (updatedGraph) => {
  // Handle real-time updates
  updateVisualization(updatedGraph);
});
```

### PredefinedWorkflowVisualizer
**Status**: DEPRECATED  
**Replaced By**: Combination of `RealTimeGraphRendererImpl` and `PathHighlightingImpl`

This service only visualized workflows with predefined paths. The new system supports emergent path visualization based on actual execution.

#### Migration Path
```typescript
// Old approach
const predefinedVisualizer = new PredefinedWorkflowVisualizer();
predefinedVisualizer.displayWorkflow(workflowTemplate);
predefinedVisualizer.highlightStep(stepId);

// New approach
const graphRenderer = new RealTimeGraphRendererImpl();
const pathHighlighter = new PathHighlightingImpl();

const graphId = graphRenderer.initializeGraph('workflow1', 'Main Workflow');
// Add nodes and edges...

// Highlight the active execution path
pathHighlighter.highlightActiveExecution(graphId, taskId);
```

### LinearProcessVisualizationService
**Status**: DEPRECATED  
**Replaced By**: `RealTimeGraphRendererImpl` with hierarchical layout

The LinearProcessVisualizationService only supported straight-line processes without branches or parallel execution. The new visualization system supports complex graph structures with multiple layout options.

#### Migration Path
```typescript
// Old approach
const linearVisualizer = new LinearProcessVisualizationService();
linearVisualizer.visualizeProcess(processSteps);

// New approach
const graphRenderer = new RealTimeGraphRendererImpl();
const graphId = graphRenderer.initializeGraph('process1', 'Process Visualization', 'hierarchical');

// Add nodes and edges...

// Apply hierarchical layout for a process-like view
graphRenderer.applyLayout(graphId, 'hierarchical');
```

### CentralizedMonitoringDashboard
**Status**: DEPRECATED  
**Replaced By**: Distributed visualization services (Interactive Workflow Inspector)

The CentralizedMonitoringDashboard provided a monolithic view of all system components. This has been replaced with more flexible, component-specific visualizations that can be composed into custom dashboards.

#### Migration Path
```typescript
// Old approach
const dashboard = new CentralizedMonitoringDashboard();
dashboard.displaySystemStatus();
dashboard.monitorWorkflow(workflowId);

// New approach
// Use specific services for different visualization needs
const graphRenderer = new RealTimeGraphRendererImpl();
const stateInspector = new StateInspectionImpl();
const nodeExplorer = new InteractiveNodeImpl();

// Create custom dashboard components
const graphId = graphRenderer.initializeGraph('system', 'System Status');
const inspectionId = stateInspector.captureNodeState(nodeId);
const explorationView = nodeExplorer.createInteractiveView(graphId);

// Compose them into a dashboard
createDashboard({
  graphView: graphRenderer.getGraph(graphId),
  stateView: stateInspector.getNodeState(nodeId),
  explorationTools: nodeExplorer.getNodeDetails(explorationView, nodeId)
});
```

## Benefits of the New Architecture

### 1. Dynamic vs Static
The new visualization services support real-time updates as workflows evolve, rather than static, predefined visualizations.

### 2. Component-Based Architecture
Visualization is now split into specialized services that can be composed together, rather than monolithic visualizers.

### 3. Interactive Capabilities
The new services provide rich interaction capabilities, allowing users to explore, filter, and modify workflows.

### 4. Subscription-Based Updates
Components can subscribe to visualization updates, enabling responsive UIs that reflect the current system state.

### 5. Multiple Layout Algorithms
Visualizations can now use different layout algorithms optimized for different workflow types and use cases.

## Timeline for Removal

These deprecated services will remain available until the next major version release, but they should not be used for new development. All integrations should migrate to the new visualization services as soon as possible. 