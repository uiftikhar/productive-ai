/**
 * Test script for demonstrating the Dynamic LangGraph System
 *
 * This script creates and runs a simple dynamic graph workflow
 * with runtime-generated nodes and edges.
 */

const {
  DynamicGraphService,
} = require('./dist/langgraph/dynamic/dynamic-graph.service');
const {
  AgentDecisionNodeService,
} = require('./dist/langgraph/dynamic/agent-decision-node.service');
const {
  EmergentControllerService,
  EmergentExecutionStatus,
} = require('./dist/langgraph/dynamic/emergent-controller.service');
const {
  ParallelExplorationService,
  BranchType,
  BranchStatus,
} = require('./dist/langgraph/dynamic/parallel-exploration.service');
const {
  PathEvaluationService,
} = require('./dist/langgraph/dynamic/path-evaluation.service');
const {
  PathMergingService,
} = require('./dist/langgraph/dynamic/path-merging.service');
const { v4: uuidv4 } = require('uuid');

// Create a console logger for the demo
const logger = {
  info: (message, context = {}) => console.log(`[INFO] ${message}`, context),
  debug: (message, context = {}) => console.log(`[DEBUG] ${message}`, context),
  warn: (message, context = {}) => console.log(`[WARN] ${message}`, context),
  error: (message, context = {}) => console.log(`[ERROR] ${message}`, context),
};

/**
 * Run the demonstration
 */
async function runDemo() {
  logger.info('Starting Dynamic LangGraph System Demo');

  // Create the dynamic graph service
  const graphService = new DynamicGraphService({
    logger,
  });

  // Create initial nodes
  const initialNodes = [
    {
      id: 'start',
      type: 'process',
      label: 'Start Node',
      handler: async (state) => {
        logger.info('Executing start node');
        return {
          ...state,
          data: {
            ...(state.data || {}),
            started: true,
            timestamp: Date.now(),
          },
        };
      },
    },
    {
      id: 'process',
      type: 'process',
      label: 'Process Node',
      handler: async (state) => {
        logger.info('Executing process node');

        // Simulate some processing
        const result = Math.random() > 0.3 ? 'success' : 'failure';

        return {
          ...state,
          data: {
            ...(state.data || {}),
            processResult: result,
            processingTime: 500,
          },
        };
      },
    },
    {
      id: 'decision',
      type: 'decision',
      label: 'Decision Node',
      handler: async (state) => {
        logger.info('Executing decision node');

        const result = state.data?.processResult || 'failure';

        // Add a runtime decision to create a new node based on the process result
        if (result === 'success') {
          // Add a new node and edge dynamically
          await graphService.applyModification({
            id: uuidv4(),
            type: 'add_node',
            timestamp: Date.now(),
            node: {
              id: 'success_handler',
              type: 'process',
              label: 'Success Handler',
              handler: async (s) => {
                logger.info('Executing dynamically created success handler');
                return {
                  ...s,
                  data: {
                    ...(s.data || {}),
                    successfullyHandled: true,
                  },
                };
              },
            },
          });

          // Add edge from this node to the new success handler
          await graphService.applyModification({
            id: uuidv4(),
            type: 'add_edge',
            timestamp: Date.now(),
            edge: {
              id: `decision_to_success_handler`,
              source: 'decision',
              target: 'success_handler',
              label: 'Success Path',
            },
          });

          // Add edge from success handler to end
          await graphService.applyModification({
            id: uuidv4(),
            type: 'add_edge',
            timestamp: Date.now(),
            edge: {
              id: `success_handler_to_end`,
              source: 'success_handler',
              target: 'end',
              label: 'Complete',
            },
          });
        } else {
          // Add a different node for failure handling
          await graphService.applyModification({
            id: uuidv4(),
            type: 'add_node',
            timestamp: Date.now(),
            node: {
              id: 'failure_handler',
              type: 'process',
              label: 'Failure Handler',
              handler: async (s) => {
                logger.info('Executing dynamically created failure handler');
                return {
                  ...s,
                  data: {
                    ...(s.data || {}),
                    failureHandled: true,
                    retryRecommended: true,
                  },
                };
              },
            },
          });

          // Add edge from this node to the failure handler
          await graphService.applyModification({
            id: uuidv4(),
            type: 'add_edge',
            timestamp: Date.now(),
            edge: {
              id: `decision_to_failure_handler`,
              source: 'decision',
              target: 'failure_handler',
              label: 'Failure Path',
            },
          });

          // Add edge from failure handler to end
          await graphService.applyModification({
            id: uuidv4(),
            type: 'add_edge',
            timestamp: Date.now(),
            edge: {
              id: `failure_handler_to_end`,
              source: 'failure_handler',
              target: 'end',
              label: 'Complete',
            },
          });
        }

        return {
          ...state,
          data: {
            ...(state.data || {}),
            decisionMade: true,
            path: result === 'success' ? 'success_path' : 'failure_path',
          },
        };
      },
    },
    {
      id: 'end',
      type: 'process',
      label: 'End Node',
      handler: async (state) => {
        logger.info('Executing end node');
        return {
          ...state,
          data: {
            ...(state.data || {}),
            completed: true,
            endTimestamp: Date.now(),
          },
        };
      },
    },
  ];

  // Create initial edges
  const initialEdges = [
    {
      id: 'start_to_process',
      source: 'start',
      target: 'process',
      label: 'Next',
    },
    {
      id: 'process_to_decision',
      source: 'process',
      target: 'decision',
      label: 'Next',
    },
  ];

  // Add initial nodes and edges
  for (const node of initialNodes) {
    await graphService.applyModification({
      id: uuidv4(),
      type: 'add_node',
      timestamp: Date.now(),
      node,
    });
  }

  for (const edge of initialEdges) {
    await graphService.applyModification({
      id: uuidv4(),
      type: 'add_edge',
      timestamp: Date.now(),
      edge,
    });
  }

  // Create the decision node service
  const decisionNodeService = new AgentDecisionNodeService(graphService, {
    logger,
  });

  // Create the controller
  const controller = new EmergentControllerService(
    graphService,
    decisionNodeService,
    { logger },
  );

  // Initialize and start the workflow
  const initialState = controller.initializeState({
    metadata: {
      name: 'Dynamic Graph Demo',
      description: 'Demonstration of dynamic graph generation',
    },
    data: {
      started: false,
    },
  });

  logger.info('Initialized state', {
    stateId: initialState.id,
    runId: initialState.runId,
  });

  // Execute the workflow
  const finalState = await controller.start(initialState);

  logger.info('Workflow completed', {
    status: finalState.status,
    executionPath: finalState.executionPath,
    data: finalState.data,
  });

  // Demonstrate parallel exploration
  logger.info('\n\n--- Parallel Exploration Demo ---\n');

  // Create a path evaluation service
  const evaluationService = new PathEvaluationService({ logger });

  // Create a parallel exploration service
  const explorationService = new ParallelExplorationService(graphService, {
    logger,
  });

  // Create a parallel execution state
  const parallelState = explorationService.initializeState({
    metadata: {
      name: 'Parallel Exploration Demo',
      description: 'Demonstration of parallel exploration',
    },
  });

  logger.info('Initialized parallel execution', {
    stateId: parallelState.id,
    primaryBranchId: parallelState.primaryBranchId,
  });

  // Create a few exploration branches
  const branch1 = explorationService.createBranch(parallelState, {
    type: BranchType.EXPLORATION,
    metadata: {
      description: 'First alternative branch',
    },
  });

  const branch2 = explorationService.createBranch(parallelState, {
    type: BranchType.VERIFICATION,
    metadata: {
      description: 'Verification branch',
    },
  });

  logger.info('Created branches', {
    branch1,
    branch2,
    totalBranches: Object.keys(parallelState.branches).length,
  });

  // Start the branches
  parallelState.branches[branch1].status = BranchStatus.RUNNING;
  parallelState.branches[branch2].status = BranchStatus.RUNNING;
  parallelState.branches[parallelState.primaryBranchId].status =
    BranchStatus.RUNNING;

  // Execute all branches
  await explorationService.executeAllBranches(parallelState);

  logger.info('Executed all branches', {
    branches: Object.entries(parallelState.branches).map(([id, branch]) => ({
      id,
      status: branch.status,
      type: branch.type,
    })),
  });

  // Evaluate one of the branches
  const branchEvaluation = evaluationService.evaluateBranch(
    parallelState.branches[branch1],
  );

  logger.info('Branch evaluation', {
    branchId: branch1,
    score: branchEvaluation.overallScore,
    strengths: branchEvaluation.strengths,
    weaknesses: branchEvaluation.weaknesses,
  });

  // Create the merging service
  const mergingService = new PathMergingService(
    graphService,
    explorationService,
    evaluationService,
    { logger },
  );

  // Find merge candidates
  const mergeCandidates = mergingService.findMergeCandidates(parallelState);

  logger.info('Merge candidates', {
    candidates: mergeCandidates,
  });

  // Clean up
  explorationService.cleanup();

  logger.info('Demo complete');
}

// Run the demo
runDemo().catch((err) => {
  console.error('Error in demo:', err);
  process.exit(1);
});
