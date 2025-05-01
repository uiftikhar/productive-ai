/**
 * Test Team Formation System
 *
 * This script demonstrates the team formation capabilities including:
 * - Capability discovery
 * - Recruitment protocol
 * - Team contracts
 * - Emergent roles
 * - Adaptive team optimization
 */

const {
  AgentRegistryService,
} = require('./dist/agents/services/agent-registry.service');
const {
  AgentDiscoveryService,
} = require('./dist/agents/services/agent-discovery.service');
const {
  CapabilityRegistryService,
} = require('./dist/agents/services/capability-registry.service');
const {
  AgentRecruitmentService,
  RecruitmentStatus,
} = require('./dist/agents/services/agent-recruitment.service');
const {
  TeamContractService,
} = require('./dist/agents/services/team-contract.service');
const {
  RoleEmergenceService,
} = require('./dist/agents/services/role-emergence.service');
const {
  AdaptiveTeamOptimizationService,
} = require('./dist/agents/services/adaptive-team-optimization.service');
const { BaseAgent } = require('./dist/agents/base/base-agent');
const { ConsoleLogger } = require('./dist/shared/logger/console-logger');
const { EventEmitter } = require('events');

// Mock message bus
class MessageBus {
  constructor() {
    this.emitter = new EventEmitter();
  }

  async publish(topic, message) {
    console.log(`[MESSAGE BUS] Publishing to ${topic}`);
    this.emitter.emit(topic, message);
    return Promise.resolve();
  }

  subscribe(topic, handler) {
    this.emitter.on(topic, handler);
  }
}

// Test scenarios
const scenarios = {
  // Simple 2-agent scenario
  twoAgentScenario: {
    name: 'Two-Agent Collaboration',
    description:
      'Basic collaboration between a research agent and an analysis agent',
    agents: [
      {
        id: 'research-agent-1',
        name: 'Research Agent',
        capabilities: [
          {
            name: 'web_research',
            level: 'advanced',
            taxonomy: ['research', 'perception'],
          },
          {
            name: 'information_gathering',
            level: 'advanced',
            taxonomy: ['research', 'perception'],
          },
        ],
      },
      {
        id: 'analysis-agent-1',
        name: 'Analysis Agent',
        capabilities: [
          {
            name: 'data_analysis',
            level: 'expert',
            taxonomy: ['analysis', 'reasoning'],
          },
          {
            name: 'information_synthesis',
            level: 'advanced',
            taxonomy: ['analysis', 'reasoning'],
          },
        ],
      },
    ],
    task: {
      id: 'task-research-analyze',
      description: 'Research and analyze market trends for AI applications',
    },
  },

  // Complex multi-agent scenario
  multiAgentScenario: {
    name: 'Multi-Agent Team',
    description: 'Complex collaboration with 5 specialized agents',
    agents: [
      {
        id: 'research-agent-1',
        name: 'Research Agent',
        capabilities: [
          {
            name: 'web_research',
            level: 'advanced',
            taxonomy: ['research', 'perception'],
          },
        ],
      },
      {
        id: 'analysis-agent-1',
        name: 'Analysis Agent',
        capabilities: [
          {
            name: 'data_analysis',
            level: 'expert',
            taxonomy: ['analysis', 'reasoning'],
          },
        ],
      },
      {
        id: 'writing-agent-1',
        name: 'Writing Agent',
        capabilities: [
          {
            name: 'content_creation',
            level: 'expert',
            taxonomy: ['creation', 'generation'],
          },
        ],
      },
      {
        id: 'programming-agent-1',
        name: 'Programming Agent',
        capabilities: [
          {
            name: 'code_generation',
            level: 'expert',
            taxonomy: ['code', 'generation'],
          },
        ],
      },
      {
        id: 'design-agent-1',
        name: 'Design Agent',
        capabilities: [
          {
            name: 'ui_design',
            level: 'advanced',
            taxonomy: ['design', 'visual'],
          },
        ],
      },
    ],
    task: {
      id: 'task-product-development',
      description:
        'Develop a prototype for a new AI-powered analytics dashboard',
    },
  },

  // Conflict resolution scenario
  conflictScenario: {
    name: 'Conflict Resolution',
    description: 'Team with conflicting goals requiring negotiation',
    agents: [
      {
        id: 'efficiency-agent',
        name: 'Efficiency Agent',
        capabilities: [
          {
            name: 'optimization',
            level: 'expert',
            taxonomy: ['optimization', 'efficiency'],
          },
        ],
        goals: ['Maximize efficiency', 'Reduce resource usage'],
      },
      {
        id: 'quality-agent',
        name: 'Quality Agent',
        capabilities: [
          {
            name: 'quality_assurance',
            level: 'expert',
            taxonomy: ['quality', 'testing'],
          },
        ],
        goals: ['Maximize quality', 'Add comprehensive testing'],
      },
      {
        id: 'feature-agent',
        name: 'Feature Agent',
        capabilities: [
          {
            name: 'feature_development',
            level: 'advanced',
            taxonomy: ['development', 'features'],
          },
        ],
        goals: ['Add more features', 'Increase functionality'],
      },
    ],
    task: {
      id: 'task-product-improvement',
      description: 'Improve an existing product with competing constraints',
    },
  },
};

// Mock agent class for testing
class TestAgent extends BaseAgent {
  constructor(config) {
    super({
      id: config.id,
      name: config.name,
      description: config.description || `Test agent with role: ${config.name}`,
      capabilities: config.capabilities || [],
    });

    this.simulatedCapabilities = config.capabilities || [];
    this.goals = config.goals || [];
  }

  // Override methods for testing
  async executeInternal(request) {
    console.log(`[${this.name}] Processing: ${request.input}`);
    return {
      output: `${this.name} processed: ${request.input}`,
      artifacts: {
        result: 'simulated-result',
      },
    };
  }
}

// Helper for delayed execution to simulate async agent behavior
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Run the test scenarios
async function runTest() {
  console.log('=== Testing Team Formation System ===\n');

  // Initialize services
  const logger = new ConsoleLogger();
  const messageBus = new MessageBus();
  const registry = AgentRegistryService.getInstance({ logger });
  const capabilityRegistry = CapabilityRegistryService.getInstance({ logger });
  const discoveryService = AgentDiscoveryService.getInstance({
    logger,
    registry,
  });

  const recruitmentService = AgentRecruitmentService.getInstance({
    logger,
    agentRegistry: registry,
    messageBus,
  });

  const contractService = TeamContractService.getInstance({
    logger,
    recruitmentService,
    messageBus,
  });

  const roleEmergenceService = RoleEmergenceService.getInstance({
    logger,
    agentRegistry: registry,
    messageBus,
  });

  const teamOptimizationService = AdaptiveTeamOptimizationService.getInstance({
    logger,
    roleEmergenceService,
    messageBus,
  });

  // Set up event listeners
  messageBus.subscribe('agent.recruitment.inquiry', (message) => {
    console.log(
      `[EVENT] Recruitment inquiry from ${message.senderName} to ${message.recipientId}`,
    );
  });

  messageBus.subscribe('agent.recruitment.proposal', (message) => {
    console.log(
      `[EVENT] Recruitment proposal for role: ${message.proposedRole}`,
    );
  });

  messageBus.subscribe('agent.recruitment.acceptance', (message) => {
    console.log(`[EVENT] Proposal accepted by agent: ${message.senderId}`);
  });

  messageBus.subscribe('agent.role.transition', (message) => {
    console.log(
      `[EVENT] Role transition: ${message.data.fromRoleId} -> ${message.data.toRoleId}`,
    );
  });

  messageBus.subscribe('team.performance.updated', (message) => {
    console.log(
      `[EVENT] Team performance update: ${message.teamId}, score: ${message.metrics.efficiency}`,
    );
  });

  // Run the simple two-agent scenario
  console.log(`\n === SCENARIO 1: ${scenarios.twoAgentScenario.name} ===`);
  console.log(scenarios.twoAgentScenario.description);

  // Create agents
  const twoAgentScenarioAgents = {};
  for (const agentConfig of scenarios.twoAgentScenario.agents) {
    const agent = new TestAgent(agentConfig);
    registry.registerAgent(agent);

    // Register capabilities
    if (agentConfig.capabilities) {
      for (const capability of agentConfig.capabilities) {
        capabilityRegistry.registerCapability(capability, agentConfig.id);
      }
    }

    twoAgentScenarioAgents[agentConfig.id] = agent;
  }

  const taskId = scenarios.twoAgentScenario.task.id;
  const teamId = `team-${taskId}`;

  // Start recruitment workflow
  console.log('\n1. Starting recruitment process...');
  const researchAgent = twoAgentScenarioAgents['research-agent-1'];
  const analysisAgent = twoAgentScenarioAgents['analysis-agent-1'];

  try {
    // 1. Send recruitment inquiry
    const inquiry = await recruitmentService.initiateRecruitmentInquiry(
      researchAgent,
      analysisAgent.id,
      taskId,
      'analyst',
      ['data_analysis', 'information_synthesis'],
      'Need an agent to analyze the research findings',
    );

    console.log(`Inquiry sent with ID: ${inquiry.inquiryId}`);

    // 2. Simulate response to inquiry
    await delay(500);
    await recruitmentService.respondToInquiry(
      analysisAgent,
      inquiry.inquiryId,
      taskId,
      true, // is interested
      ['data_analysis', 'information_synthesis'], // capabilities
      'I can help with analyzing the research data',
    );

    // 3. Send recruitment proposal
    await delay(500);
    const proposal = await recruitmentService.sendRecruitmentProposal(
      researchAgent,
      analysisAgent.id,
      taskId,
      'data_analyst',
      ['Analyze research findings', 'Identify patterns', 'Generate insights'],
      ['data_analysis', 'information_synthesis'],
      'Analyze data and provide insights',
      2 * 60 * 60 * 1000, // 2 hours
      30 * 60 * 1000, // 30 min expiration
    );

    console.log(`Proposal sent with ID: ${proposal.proposalId}`);

    // 4. Accept the proposal
    await delay(500);
    const acceptanceResult = await recruitmentService.acceptProposal(
      analysisAgent,
      proposal.proposalId,
      taskId,
    );

    console.log(`Proposal accepted: ${acceptanceResult.proposalId}`);

    // 5. Create a team contract
    await delay(500);
    console.log('\n2. Creating team contract...');
    const contract = await recruitmentService.createTeamContract(
      researchAgent,
      taskId,
      'Research Analysis Team',
      'Team for researching and analyzing market trends',
      [
        {
          agentId: researchAgent.id,
          role: 'lead_researcher',
          responsibilities: ['Coordinate research', 'Gather information'],
          requiredCapabilities: ['web_research', 'information_gathering'],
          expectedDeliverables: ['Research data'],
        },
        {
          agentId: analysisAgent.id,
          role: 'data_analyst',
          responsibilities: ['Analyze data', 'Identify patterns'],
          requiredCapabilities: ['data_analysis', 'information_synthesis'],
          expectedDeliverables: ['Analysis report'],
        },
      ],
      {
        startTime: Date.now(),
        endTime: Date.now() + 24 * 60 * 60 * 1000, // 1 day
      },
      ['Complete research and analysis report'],
      teamId,
    );

    console.log(`Team contract created with ID: ${contract.contractId}`);

    // 6. Activate the contract
    await delay(500);
    const activatedContract = await contractService.updateContractStatus(
      contract.contractId,
      'active',
      researchAgent.id,
      'All team members have accepted',
    );

    console.log(`Contract activated: ${activatedContract.status}`);

    // 7. Setup role emergence and optimization
    console.log('\n3. Setting up emergent roles...');
    // Define coordinator role
    const coordinatorRole = {
      id: 'coordinator-role',
      name: 'Team Coordinator',
      description: 'Coordinates team activities and communication',
      requiredCapabilities: ['communication', 'organization'],
      responsibilityAreas: ['coordination', 'scheduling'],
      emergencePattern: 'interaction_based',
      discoveryTime: Date.now(),
      confidence: 0.85,
    };

    roleEmergenceService.registerEmergentRole(coordinatorRole);

    // Assign role to research agent
    await delay(500);
    const assignment = await roleEmergenceService.assignRole({
      roleId: coordinatorRole.id,
      agentId: researchAgent.id,
      teamId,
      taskId,
      confidence: 0.9,
      startTime: Date.now(),
      assignmentReason: 'Natural leadership qualities demonstrated',
    });

    console.log(
      `Role ${coordinatorRole.name} assigned to ${researchAgent.name}`,
    );

    // 8. Submit performance metrics and trigger optimization
    console.log('\n4. Simulating performance monitoring...');
    await delay(1000);

    // Publish performance metrics
    await messageBus.publish('team.performance.updated', {
      teamId,
      taskId,
      metrics: {
        efficiency: 0.7,
        quality: 0.8,
        collaboration: 0.75,
      },
      agentPerformance: [
        {
          agentId: researchAgent.id,
          performanceScore: 0.75,
          improvementAreas: [],
        },
        {
          agentId: analysisAgent.id,
          performanceScore: 0.8,
          improvementAreas: [],
        },
      ],
      roleEffectiveness: [
        {
          roleId: coordinatorRole.id,
          effectivenessScore: 0.75,
          bottlenecks: [],
        },
      ],
    });

    // 9. Complete the contract
    await delay(1000);
    console.log('\n5. Completing the contract...');
    const completedContract = await contractService.updateContractStatus(
      contract.contractId,
      'completed',
      researchAgent.id,
      'All deliverables have been provided',
    );

    console.log(`Contract completed: ${completedContract.status}`);

    console.log('\nScenario 1 completed successfully!\n');

    // ----------------------------------------
    // Clean up for next scenario
    // ----------------------------------------
    for (const agentConfig of scenarios.twoAgentScenario.agents) {
      registry.unregisterAgent(agentConfig.id);
    }
  } catch (error) {
    console.error('Error running scenario 1:', error);
  }

  console.log('\n === Simulation completed ===');
}

// Run the test
runTest().catch(console.error);
