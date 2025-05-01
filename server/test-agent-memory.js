/**
 * Test script for the Agent Memory System (Milestone 3)
 *
 * This script demonstrates:
 * 1. Shared Team Workspace functionality
 * 2. Individual Agent Memory (episodic and semantic)
 * 3. Knowledge Sharing between agents
 */

// Import required modules
const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');

// Mock logger for testing
class MockLogger {
  info(message, context) {
    console.log(`[INFO] ${message}`, context || '');
  }

  debug(message, context) {
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${message}`, context || '');
    }
  }

  warn(message, context) {
    console.log(`[WARN] ${message}`, context || '');
  }

  error(message, context) {
    console.error(`[ERROR] ${message}`, context || '');
  }
}

// Mock implementations of services
class MockAgentRegistry {
  constructor() {
    this.agents = new Map();

    // Add some default agents
    this.agents.set('agent-1', {
      id: 'agent-1',
      name: 'Research Agent',
      capabilities: ['research', 'analysis'],
    });

    this.agents.set('agent-2', {
      id: 'agent-2',
      name: 'Knowledge Agent',
      capabilities: ['knowledge-management', 'information-retrieval'],
    });

    this.agents.set('agent-3', {
      id: 'agent-3',
      name: 'Planning Agent',
      capabilities: ['planning', 'coordination'],
    });
  }

  async getAgent(id) {
    return this.agents.get(id);
  }
}

class MockAgentMessaging {
  constructor() {
    this.conversations = new Map();
    this.messages = [];
    this.subscribers = [];
  }

  async createConversation(participants, topic) {
    const conversationId = uuidv4();
    this.conversations.set(conversationId, {
      conversationId,
      participants,
      topic,
      startTime: Date.now(),
    });
    return this.conversations.get(conversationId);
  }

  async sendMessage(message) {
    this.messages.push(message);

    // Notify subscribers
    for (const subscriber of this.subscribers) {
      subscriber.callback(message);
    }

    return message;
  }

  subscribeToMessages(subscriberId, callback) {
    this.subscribers.push({ subscriberId, callback });
  }
}

// Helper functions
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Import service implementations (mock implementations for testing)
const {
  WorkspaceManagementService,
} = require('./src/agents/services/workspace-management.service');
const {
  EpisodicMemoryService,
} = require('./src/agents/services/episodic-memory.service');
const {
  SemanticMemoryService,
} = require('./src/agents/services/semantic-memory.service');
const {
  KnowledgeSharingService,
} = require('./src/agents/services/knowledge-sharing.service');

// Import interfaces
const {
  AgentMemoryType,
  createEpisodicMemory,
  createSemanticMemory,
} = require('./src/agents/interfaces/agent-memory.interface');

const {
  ArtifactType,
  WorkspaceAccessLevel,
} = require('./src/agents/interfaces/team-workspace.interface');

const {
  KnowledgeSharingRequestType,
} = require('./src/agents/services/knowledge-sharing.service');

/**
 * Initialize services
 */
function initializeServices() {
  const logger = new MockLogger();
  const agentRegistry = new MockAgentRegistry();
  const messaging = new MockAgentMessaging();

  // Initialize memory services
  const workspaceService = new WorkspaceManagementService(logger);
  const episodicMemory = new EpisodicMemoryService(logger);
  const semanticMemory = new SemanticMemoryService(logger);
  const knowledgeSharing = new KnowledgeSharingService(
    messaging,
    episodicMemory,
    semanticMemory,
    agentRegistry,
    logger,
  );

  return {
    logger,
    agentRegistry,
    messaging,
    workspaceService,
    episodicMemory,
    semanticMemory,
    knowledgeSharing,
  };
}

/**
 * Test Team Workspace functionality
 */
async function testTeamWorkspace(services) {
  console.log('\n===== Testing Team Workspace =====');

  const { workspaceService } = services;

  // Create a team workspace
  console.log('\nCreating team workspace...');
  const workspace = workspaceService.createWorkspace(
    'Research Project Workspace',
    'team-1',
    'task-1',
    'agent-1',
    'A collaborative workspace for research project planning',
  );
  console.log(`Workspace created: ${workspace.id}`);

  // Create artifacts in the workspace
  console.log('\nCreating workspace artifacts...');

  const planArtifact = workspaceService.createArtifact(
    workspace.id,
    'Research Plan',
    ArtifactType.PLAN,
    {
      objectives: [
        'Gather information on agent memory systems',
        'Analyze existing implementation approaches',
        'Design new memory architecture',
      ],
      timeline: {
        start: Date.now(),
        end: Date.now() + 7 * 24 * 60 * 60 * 1000,
      },
    },
    'json',
    'agent-1',
    {
      description: 'Research plan for the agent memory system',
      metadata: { workspaceId: workspace.id },
    },
  );
  console.log(`Plan artifact created: ${planArtifact.id}`);

  const documentArtifact = workspaceService.createArtifact(
    workspace.id,
    'Memory System Overview',
    ArtifactType.DOCUMENT,
    'The agent memory system will consist of episodic, semantic, and procedural memory modules integrating with the existing agent architecture...',
    'text',
    'agent-2',
    {
      description: 'Overview document for the memory system design',
      metadata: { workspaceId: workspace.id },
      tags: ['memory', 'design', 'architecture'],
    },
  );
  console.log(`Document artifact created: ${documentArtifact.id}`);

  // Add annotations to artifacts
  console.log('\nAdding annotations to artifacts...');

  const annotation = workspaceService.addAnnotation(
    documentArtifact.id,
    'comment',
    'We should consider how this memory system will integrate with the dialogue system from Milestone 2.',
    'agent-3',
    { startIndex: 10, endIndex: 50 },
  );
  console.log(`Annotation added: ${annotation.id}`);

  // Search for artifacts
  console.log('\nSearching for artifacts...');

  const searchResults = workspaceService.searchArtifacts({
    workspaceId: workspace.id,
    searchText: 'memory',
    sortBy: 'createdAt',
    sortDirection: 'desc',
  });

  console.log(`Found ${searchResults.length} artifacts matching search query`);

  return {
    workspace,
    planArtifact,
    documentArtifact,
  };
}

/**
 * Test Agent Memory functionality
 */
async function testAgentMemory(services) {
  console.log('\n===== Testing Agent Memory =====');

  const { episodicMemory, semanticMemory } = services;

  // Create episodic memories
  console.log('\nCreating episodic memories...');

  const meeting = episodicMemory.createMemory(
    'agent-1',
    'Team Planning Meeting',
    'Initial planning meeting for the memory system design',
    'The team met to discuss the implementation of the agent memory system, focusing on the architecture and integration points.',
    [
      {
        timestamp: Date.now() - 3600000,
        description: 'Discussion of memory types',
        significance: 0.8,
      },
      {
        timestamp: Date.now() - 3000000,
        description: 'Debate about integration approach',
        significance: 0.9,
      },
    ],
    [
      'Agreement on three memory types',
      'Decision to implement semantic memory first',
    ],
    {
      participants: ['agent-1', 'agent-2', 'agent-3'],
      importance: 0.9,
      confidence: 0.95,
      tags: ['meeting', 'planning', 'memory-system'],
    },
  );
  console.log(`Episodic memory created: ${meeting.id}`);

  const implementation = episodicMemory.createMemory(
    'agent-2',
    'Implementation Session',
    'Working session to implement the semantic memory service',
    'Spent time implementing the semantic memory service with indexing capabilities and efficient search.',
    [
      {
        timestamp: Date.now() - 1800000,
        description: 'Created base interfaces',
        significance: 0.7,
      },
      {
        timestamp: Date.now() - 1200000,
        description: 'Implemented memory indexing',
        significance: 0.8,
      },
    ],
    [
      'Completed implementation of SemanticMemoryService',
      'Need to add knowledge verification',
    ],
    {
      importance: 0.85,
      confidence: 0.9,
      tags: ['implementation', 'semantic-memory'],
    },
  );
  console.log(`Episodic memory created: ${implementation.id}`);

  // Create semantic memories
  console.log('\nCreating semantic memories...');

  const memoryTypes = semanticMemory.createMemory(
    'agent-1',
    'Memory Types',
    'The agent memory system has three primary types: episodic, semantic, and procedural.',
    'cognitive-architecture',
    [
      {
        concept: 'Episodic Memory',
        relationshipType: 'is_a',
        relationshipStrength: 0.9,
      },
      {
        concept: 'Semantic Memory',
        relationshipType: 'is_a',
        relationshipStrength: 0.9,
      },
      {
        concept: 'Procedural Memory',
        relationshipType: 'is_a',
        relationshipStrength: 0.9,
      },
    ],
    {
      importance: 0.9,
      confidence: 0.95,
      isVerified: true,
      tags: ['memory', 'cognitive-architecture'],
    },
  );
  console.log(`Semantic memory created: ${memoryTypes.id}`);

  const episodicMemoryFact = semanticMemory.createMemory(
    'agent-2',
    'Episodic Memory',
    'Episodic memory stores experiences and events with temporal context, allowing agents to recall past experiences.',
    'cognitive-architecture',
    [
      {
        concept: 'Memory Types',
        relationshipType: 'is_part_of',
        relationshipStrength: 0.9,
      },
      {
        concept: 'Experience',
        relationshipType: 'stores',
        relationshipStrength: 0.8,
      },
    ],
    {
      importance: 0.85,
      confidence: 0.9,
      tags: ['memory', 'episodic'],
    },
  );
  console.log(`Semantic memory created: ${episodicMemoryFact.id}`);

  // Search memories
  console.log('\nSearching memories...');

  const episodicResults = episodicMemory.searchMemories({
    agentId: 'agent-1',
    query: 'meeting',
    importanceThreshold: 0.8,
  });
  console.log(`Found ${episodicResults.totalCount} episodic memories`);

  const semanticResults = semanticMemory.searchMemories({
    agentId: 'agent-1',
    query: 'memory',
    types: [AgentMemoryType.SEMANTIC],
  });
  console.log(`Found ${semanticResults.totalCount} semantic memories`);

  // Link concepts
  console.log('\nLinking concepts...');

  const linked = semanticMemory.linkConcepts(
    'agent-2',
    'Episodic Memory',
    'Experience',
    'stores',
    0.9,
    true,
  );
  console.log(`Concepts linked: ${linked}`);

  return {
    meeting,
    implementation,
    memoryTypes,
    episodicMemoryFact,
  };
}

/**
 * Test Knowledge Sharing functionality
 */
async function testKnowledgeSharing(services) {
  console.log('\n===== Testing Knowledge Sharing =====');

  const { knowledgeSharing } = services;

  // Create a knowledge sharing request
  console.log('\nCreating knowledge sharing request...');

  const request = await knowledgeSharing.createRequest(
    'agent-1',
    'agent-2',
    KnowledgeSharingRequestType.CONCEPT_EXPLANATION,
    'What is semantic memory?',
    {
      priority: 2,
    },
  );
  console.log(`Knowledge request created: ${request.id}`);

  // Create a response
  console.log('\nCreating knowledge response...');

  const response = await knowledgeSharing.createResponse(
    request.id,
    'agent-2',
    'Semantic memory is a type of declarative memory that stores knowledge and concepts rather than experiences. It allows agents to understand and reason about the world.',
    {
      format: 'text',
      confidence: 0.92,
      verificationStatus: 'verified',
    },
  );
  console.log(`Knowledge response created: ${response.id}`);

  // Share knowledge with team
  console.log('\nSharing knowledge with team...');

  const sharedResult = await knowledgeSharing.shareKnowledgeWithTeam(
    'agent-2',
    ['agent-1', 'agent-3'],
    AgentMemoryType.SEMANTIC,
    {
      concept: 'Episodic Memory',
      confidenceThreshold: 0.8,
    },
  );

  for (const [agentId, memoryIds] of Object.entries(sharedResult.sharedWith)) {
    console.log(`Shared ${memoryIds.length} memories with ${agentId}`);
  }

  return {
    request,
    response,
    sharedResult,
  };
}

/**
 * Main test function
 */
async function runTest() {
  console.log('=== AGENT MEMORY SYSTEM TEST ===');
  console.log('Testing Milestone 3 implementation\n');

  try {
    // Initialize services
    const services = initializeServices();

    // Test Team Workspace
    const workspaceResults = await testTeamWorkspace(services);

    // Test Agent Memory
    const memoryResults = await testAgentMemory(services);

    // Test Knowledge Sharing
    const sharingResults = await testKnowledgeSharing(services);

    console.log('\n=== TEST COMPLETED SUCCESSFULLY ===');

    return {
      workspaceResults,
      memoryResults,
      sharingResults,
    };
  } catch (error) {
    console.error('Test failed with error:', error);
    throw error;
  }
}

// Run the test
runTest()
  .then(() => {
    console.log('\nAll tests completed successfully!');
    console.log('Milestone 3: Agent Memory System has been implemented.');
  })
  .catch((error) => {
    console.error('Error running tests:', error);
    process.exit(1);
  });
