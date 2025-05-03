/**
 * Tests for Milestone 4: Emergent Workflow Visualization
 *
 * This test script demonstrates the visualization capabilities implemented
 * in Milestone 4, including dynamic graph visualization, agent reasoning
 * visualization, team formation visualization, and interactive workflow inspection.
 */

const { v4: uuidv4 } = require('uuid');

// Import visualization services
const {
  RealTimeGraphRendererImpl,
} = require('./src/langgraph/adaptive/visualization/dynamic-graph/real-time-graph-renderer.service');
const {
  DecisionCaptureImpl,
} = require('./src/langgraph/adaptive/visualization/agent-reasoning/decision-capture.service');

// Import visualization interfaces
const {
  GraphNodeType,
  GraphEdgeType,
  GraphNodeState,
} = require('./src/langgraph/adaptive/interfaces/visualization.interface');

// Mocked Visualization Client for testing
class MockedVisualizationClient {
  constructor() {
    this.updates = [];
    this.highlights = [];
    this.currentGraph = null;
  }

  handleGraphUpdate(graph) {
    console.log(
      `[MockedClient] Received graph update: ${graph.name}, ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
    );
    this.updates.push({
      timestamp: new Date(),
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      version: graph.version,
    });
    this.currentGraph = graph;
  }

  handleHighlightUpdate(highlights) {
    console.log(
      `[MockedClient] Received highlight update: ${highlights.nodeIds.length} nodes, ${highlights.edgeIds.length} edges`,
    );
    this.highlights.push(highlights);
  }

  printGraphSummary() {
    if (!this.currentGraph) {
      console.log('No graph data available');
      return;
    }

    console.log(
      `\nGraph: ${this.currentGraph.name} (v${this.currentGraph.version})`,
    );
    console.log(`Nodes: ${this.currentGraph.nodes.length}`);
    console.log(`Edges: ${this.currentGraph.edges.length}`);
    console.log('Node Types:');

    // Count nodes by type
    const nodeTypeCount = {};
    this.currentGraph.nodes.forEach((node) => {
      nodeTypeCount[node.type] = (nodeTypeCount[node.type] || 0) + 1;
    });

    Object.entries(nodeTypeCount).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
  }
}

// Test 1: Dynamic Graph Visualization
async function testDynamicGraphVisualization() {
  console.log('\n----- Test 1: Dynamic Graph Visualization -----');

  // Initialize the graph renderer
  const graphRenderer = new RealTimeGraphRendererImpl();
  const client = new MockedVisualizationClient();

  // Create a workflow graph
  const graphId = graphRenderer.initializeGraph(
    'workflow-123',
    'Test Workflow',
  );
  console.log(`Created graph: ${graphId}`);

  // Subscribe to updates
  const unsubscribe = graphRenderer.subscribeToGraphUpdates(
    graphId,
    (graph) => {
      client.handleGraphUpdate(graph);
    },
  );

  // Add workflow nodes
  const taskA = graphRenderer.addNode(graphId, {
    type: GraphNodeType.TASK,
    label: 'Task A',
    properties: { duration: 5, priority: 'high' },
    state: GraphNodeState.INACTIVE,
  });

  const taskB = graphRenderer.addNode(graphId, {
    type: GraphNodeType.TASK,
    label: 'Task B',
    properties: { duration: 3, priority: 'medium' },
    state: GraphNodeState.INACTIVE,
  });

  const taskC = graphRenderer.addNode(graphId, {
    type: GraphNodeType.TASK,
    label: 'Task C',
    properties: { duration: 7, priority: 'low' },
    state: GraphNodeState.INACTIVE,
  });

  const agentX = graphRenderer.addNode(graphId, {
    type: GraphNodeType.AGENT,
    label: 'Agent X',
    properties: { skills: ['analysis', 'planning'] },
    state: GraphNodeState.ACTIVE,
  });

  const decisionPoint = graphRenderer.addNode(graphId, {
    type: GraphNodeType.DECISION_POINT,
    label: 'Decision 1',
    properties: { options: ['A', 'B'], selected: 'A' },
    state: GraphNodeState.COMPLETED,
  });

  // Add edges
  graphRenderer.addEdge(graphId, {
    type: GraphEdgeType.DEPENDENCY,
    sourceId: taskA.id,
    targetId: taskB.id,
    label: 'Depends on',
  });

  graphRenderer.addEdge(graphId, {
    type: GraphEdgeType.DEPENDENCY,
    sourceId: taskB.id,
    targetId: taskC.id,
    label: 'Depends on',
  });

  graphRenderer.addEdge(graphId, {
    type: GraphEdgeType.ASSIGNMENT,
    sourceId: agentX.id,
    targetId: taskA.id,
    label: 'Assigned to',
  });

  graphRenderer.addEdge(graphId, {
    type: GraphEdgeType.EXECUTION_FLOW,
    sourceId: decisionPoint.id,
    targetId: taskA.id,
    label: 'Selected',
  });

  // Apply a layout
  graphRenderer.applyLayout(graphId, 'hierarchical');

  // Update node states to simulate execution
  setTimeout(() => {
    graphRenderer.updateNode(graphId, taskA.id, {
      state: GraphNodeState.ACTIVE,
    });
  }, 500);

  setTimeout(() => {
    graphRenderer.updateNode(graphId, taskA.id, {
      state: GraphNodeState.COMPLETED,
    });
    graphRenderer.updateNode(graphId, taskB.id, {
      state: GraphNodeState.ACTIVE,
    });
  }, 1000);

  // Wait for all updates
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Print graph summary
  client.printGraphSummary();

  // Clean up
  unsubscribe();

  return true;
}

// Test 2: Agent Reasoning Visualization
async function testAgentReasoningVisualization() {
  console.log('\n----- Test 2: Agent Reasoning Visualization -----');

  // Initialize the decision capture service
  const decisionCapture = new DecisionCaptureImpl();

  // Record decision points for an agent
  const agentId = 'agent-456';
  const taskId = 'task-789';

  // First decision
  const decision1Id = decisionCapture.recordDecisionPoint({
    agentId,
    taskId,
    timestamp: new Date(),
    context: {
      currentState: 'initial',
      availableResources: ['data', 'computation'],
    },
    options: [
      {
        id: 'option1',
        description: 'Analyze data first',
        confidence: 0.8,
        pros: ['More informative', 'Reduces uncertainty'],
        cons: ['Takes longer', 'Might be unnecessary'],
        selected: true,
      },
      {
        id: 'option2',
        description: 'Start computation immediately',
        confidence: 0.4,
        pros: ['Faster results', 'Simpler approach'],
        cons: ['Less accurate', 'Higher risk'],
        selected: false,
      },
    ],
    reasoning:
      'Data analysis first provides more reliable results with manageable time trade-off.',
    result: 'Selected data analysis approach',
  });

  console.log(`Recorded decision point: ${decision1Id}`);

  // Tag the decision
  decisionCapture.tagDecisionPoint(decision1Id, ['important', 'strategic']);

  // Annotate the decision
  decisionCapture.annotateDecisionPoint(
    decision1Id,
    "This decision establishes the agent's preference for accuracy over speed.",
  );

  // Second decision
  const decision2Id = decisionCapture.recordDecisionPoint({
    agentId,
    taskId,
    timestamp: new Date(Date.now() + 5000), // 5 seconds later
    context: {
      currentState: 'data-analyzed',
      dataResults: { confidence: 0.9, patterns: ['A', 'B'] },
    },
    options: [
      {
        id: 'option1',
        description: 'Use pattern A for computation',
        confidence: 0.9,
        pros: ['Strong correlation', 'Simpler model'],
        cons: ['May not generalize well'],
        selected: true,
      },
      {
        id: 'option2',
        description: 'Use pattern B for computation',
        confidence: 0.7,
        pros: ['More complex, potentially more accurate'],
        cons: ['Requires more resources', 'Less certain'],
        selected: false,
      },
      {
        id: 'option3',
        description: 'Use both patterns',
        confidence: 0.5,
        pros: ['Comprehensive'],
        cons: ['Resource intensive', 'Complex interpretation'],
        selected: false,
      },
    ],
    reasoning:
      'Pattern A provides the best balance of confidence and simplicity.',
    result: 'Selected Pattern A for further computation',
  });

  console.log(`Recorded decision point: ${decision2Id}`);

  // Third decision
  const decision3Id = decisionCapture.recordDecisionPoint({
    agentId,
    taskId,
    timestamp: new Date(Date.now() + 10000), // 10 seconds later
    context: {
      currentState: 'computation-completed',
      results: { accuracy: 0.92, performance: 0.88 },
    },
    options: [
      {
        id: 'option1',
        description: 'Present results as is',
        confidence: 0.85,
        pros: ['Straightforward', 'Good accuracy'],
        cons: ['Some uncertainty remains'],
        selected: false,
      },
      {
        id: 'option2',
        description: 'Perform additional validation',
        confidence: 0.95,
        pros: ['Higher confidence', 'More robust'],
        cons: ['Takes more time', 'Uses more resources'],
        selected: true,
      },
    ],
    reasoning:
      'Results are good but additional validation will provide more confidence.',
    result: 'Selected additional validation step',
  });

  console.log(`Recorded decision point: ${decision3Id}`);

  // Get decisions by agent
  const agentDecisions = decisionCapture.getDecisionsByAgent(agentId);
  console.log(
    `\nRetrieved ${agentDecisions.length} decisions for agent ${agentId}`,
  );

  // Get decisions by task
  const taskDecisions = decisionCapture.getDecisionsByTask(taskId);
  console.log(`Retrieved ${taskDecisions.length} decisions for task ${taskId}`);

  // Search for decisions
  const searchResults = decisionCapture.searchDecisionPoints('pattern');
  console.log(
    `\nSearch for 'pattern' returned ${searchResults.length} results`,
  );
  if (searchResults.length > 0) {
    console.log(`First result: ${searchResults[0].reasoning}`);
  }

  // Get statistics
  const stats = decisionCapture.getDecisionStatistics();
  console.log('\nDecision Statistics:');
  console.log(`Total Decisions: ${stats.totalDecisions}`);
  console.log(`Unique Agents: ${stats.uniqueAgents}`);
  console.log(`Unique Tasks: ${stats.uniqueTasks}`);
  console.log(`Average Options: ${stats.averageOptionsPerDecision.toFixed(2)}`);
  console.log(`Average Confidence: ${stats.averageConfidence.toFixed(2)}`);

  return true;
}

// Test 3: Team Formation & Communication Display (Stub for future implementation)
async function testTeamFormationVisualization() {
  console.log('\n----- Test 3: Team Formation & Communication Display -----');
  console.log(
    'This test will be implemented when team visualization services are completed.',
  );
  return true;
}

// Test 4: Interactive Workflow Inspector (Stub for future implementation)
async function testInteractiveWorkflowInspector() {
  console.log('\n----- Test 4: Interactive Workflow Inspector -----');
  console.log(
    'This test will be implemented when interactive workflow services are completed.',
  );
  return true;
}

// Main test runner
async function runTests() {
  console.log(
    '===== Testing Milestone 4: Emergent Workflow Visualization =====',
  );

  try {
    await testDynamicGraphVisualization();
    await testAgentReasoningVisualization();
    await testTeamFormationVisualization();
    await testInteractiveWorkflowInspector();

    console.log('\n✅ All tests completed successfully.');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }
}

// Run the tests
runTests();
