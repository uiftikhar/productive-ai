/**
 * WebSocket Visualization Test Script
 * 
 * This script tests the WebSocket visualization system by sending
 * test data to simulate agent activities.
 */

// Import required modules
const { ServiceRegistry } = require('../dist/langgraph/agentic-meeting-analysis/services/service-registry');
const { broadcastStateUpdate } = require('../dist/api/controllers/visualization.controller');

// Session ID to use for testing
const TEST_SESSION_ID = process.argv[2] || 'test-session-123';

// Create test data
const testData = {
  nodes: [
    {
      id: 'supervisor',
      label: 'Supervisor Agent',
      type: 'agent',
      state: 'active',
      properties: {
        agentType: 'supervisor',
        expertise: ['coordination']
      }
    },
    {
      id: 'manager-1',
      label: 'Manager: Topics',
      type: 'agent',
      state: 'highlighted',
      properties: {
        agentType: 'manager',
        expertise: ['topic_extraction']
      }
    },
    {
      id: 'worker-1',
      label: 'Worker: Topic Analyzer',
      type: 'agent',
      state: 'inactive',
      properties: {
        agentType: 'worker',
        expertise: ['topic_extraction']
      }
    },
    {
      id: 'topic-1',
      label: 'Project Timeline',
      type: 'topic',
      state: 'inactive',
      properties: {
        relevance: 0.8
      }
    }
  ],
  edges: [
    {
      id: 'edge-1',
      sourceId: 'supervisor',
      targetId: 'manager-1',
      type: 'collaboration',
      label: 'Delegates to',
      strength: 0.8
    },
    {
      id: 'edge-2',
      sourceId: 'manager-1',
      targetId: 'worker-1',
      type: 'dependency',
      label: 'Manages',
      strength: 0.7
    },
    {
      id: 'edge-3',
      sourceId: 'worker-1',
      targetId: 'topic-1',
      type: 'relation',
      label: 'Extracts',
      animated: true,
      strength: 0.9
    }
  ]
};

console.log(`Broadcasting test data for session: ${TEST_SESSION_ID}`);

// Broadcast the test data
broadcastStateUpdate(TEST_SESSION_ID, testData);

// Keep the process alive for a moment to ensure message is sent
setTimeout(() => {
  console.log('Test complete - check client to see if data was received');
  process.exit(0);
}, 2000); 