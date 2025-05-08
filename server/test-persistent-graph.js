/**
 * Test script for validating the persistence layer and enhanced graph service
 */
const path = require('path');
require('dotenv').config();

// Ensure TypeScript is properly loaded
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    target: 'es2020',
  },
});

// Import storage configuration and initialize storage
const { storageConfig, initializeStorage } = require('./src/config/storage.config');
initializeStorage();

// Import necessary components
const { FileStorageAdapter } = require('./src/shared/storage/file-storage-adapter');
const { SessionManager, SessionStatus } = require('./src/shared/storage/session-manager');
const { EnhancedDynamicGraphService, EnhancedGraphNode, EnhancedGraphEdge } = require('./src/langgraph/dynamic/enhanced-dynamic-graph.service');
const { ConsoleLogger } = require('./src/shared/logger/console-logger');

// Import constants from LangGraph for start/end nodes
const { START, END } = require('@langchain/langgraph');

// Create a logger for the test
const logger = new ConsoleLogger();
logger.info('Starting persistence layer test');

/**
 * Create a sample graph with nodes and edges
 */
function createSampleGraph() {
  // Create nodes
  const nodes = [
    {
      id: 'node1',
      type: 'process',
      label: 'Node 1',
      handler: async (state) => {
        logger.info('Processing Node 1');
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
          ...state,
          node1Processed: true,
          counter: (state.counter || 0) + 1
        };
      }
    },
    {
      id: 'node2',
      type: 'process',
      label: 'Node 2',
      handler: async (state) => {
        logger.info('Processing Node 2');
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
          ...state,
          node2Processed: true,
          counter: (state.counter || 0) + 1
        };
      }
    },
    {
      id: 'node3',
      type: 'process',
      label: 'Node 3',
      handler: async (state) => {
        logger.info('Processing Node 3');
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
          ...state,
          node3Processed: true,
          counter: (state.counter || 0) + 1
        };
      }
    }
  ];

  // Create edges
  const edges = [
    {
      id: 'edge1',
      source: START,
      target: 'node1',
      label: 'Start → Node 1'
    },
    {
      id: 'edge2',
      source: 'node1',
      target: 'node2',
      label: 'Node 1 → Node 2'
    },
    {
      id: 'edge3',
      source: 'node2',
      target: 'node3',
      label: 'Node 2 → Node 3'
    },
    {
      id: 'edge4',
      source: 'node3',
      target: END,
      label: 'Node 3 → End'
    }
  ];

  return { nodes, edges };
}

/**
 * Run the test
 */
async function runTest() {
  try {
    // Create storage adapter
    logger.info('Creating storage adapter');
    const storageAdapter = new FileStorageAdapter({
      storageDir: storageConfig.graphState.dir,
      expirationTime: storageConfig.graphState.expirationTime,
      compressionEnabled: storageConfig.compression.enabled,
      logger
    });

    // Create session manager
    logger.info('Creating session manager');
    const sessionManager = new SessionManager({
      storageAdapter,
      logger
    });

    // Create the graph
    logger.info('Creating graph');
    const { nodes, edges } = createSampleGraph();
    const graphService = new EnhancedDynamicGraphService({
      initialNodes: nodes,
      initialEdges: edges,
      storageAdapter,
      logger
    });

    // Create enhanced graph
    const graph = graphService.createEnhancedGraph();

    // Add event listeners
    graph.on('nodeStart', (data) => {
      logger.info(`Node started: ${data.id}`);
    });

    graph.on('nodeComplete', (data) => {
      logger.info(`Node completed: ${data.id}`);
    });

    graph.on('progressUpdate', (data) => {
      logger.info(`Progress: ${data.progress}%`);
    });

    // Create a session
    const sessionId = await sessionManager.createSession({
      graph,
      initialState: {
        counter: 0,
        testData: 'This is test data'
      },
      metadata: {
        test: true,
        createdBy: 'test-persistent-graph.js'
      }
    });

    logger.info(`Created session with ID: ${sessionId}`);

    // Prepare initial state with session ID
    const initialState = {
      sessionId,
      counter: 0,
      testData: 'This is test data'
    };

    // Execute the graph with streaming
    logger.info('Executing graph with streaming');
    for await (const update of graph.streamInvoke(initialState, {
      mode: 'updates',
      includeNodeDetails: true,
      persistInterval: 1000 // 1 second
    })) {
      logger.info(`Stream update: ${JSON.stringify(update.type)}`);
      
      if (update.type === 'complete') {
        logger.info('Graph execution completed');
      }
    }

    // Get the updated session
    const session = await sessionManager.getSession(sessionId);
    logger.info('Session after execution:', {
      id: session.id,
      status: session.status,
      progress: session.progress
    });

    // Update session status to completed
    await sessionManager.updateSession(sessionId, {
      status: SessionStatus.COMPLETED,
      progress: 100
    });

    // List all active sessions
    const activeSessions = await sessionManager.listActiveSessions();
    logger.info(`Found ${activeSessions.length} active sessions`);

    // Clean up
    logger.info('Test completed successfully');
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runTest()
  .then(() => {
    logger.info('Test finished');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Unhandled error in test:', error);
    process.exit(1);
  }); 