/**
 * Team Formation Integration Tests
 *
 * Tests the integration of various components for the Dynamic Team Formation system.
 * Follows the integration strategy for Milestones 1 and 2.
 */

import { AgentFactory } from '../../factories/agent-factory';
import { AgentRegistryService } from '../../services/agent-registry.service';
import { AgentDiscoveryService } from '../../services/agent-discovery.service';
import { CapabilityRegistryService } from '../../services/capability-registry.service';
import {
  AgentRecruitmentService,
  RecruitmentStatus,
} from '../../services/agent-recruitment.service';
import { TeamContractService } from '../../services/team-contract.service';
import { NegotiationEngineService } from '../../services/negotiation-engine.service';
import { RoleEmergenceService } from '../../services/role-emergence.service';
import { AdaptiveTeamOptimizationService } from '../../services/adaptive-team-optimization.service';
import { AgentWorkflow } from '../../../langgraph/core/workflows/agent-workflow';
import { WorkflowStatus } from '../../../langgraph/core/workflows/base-workflow';
import { MockLogger } from '../mocks/mock-logger';
import { BaseAgent } from '../../base/base-agent';
import { EventEmitter } from 'events';

import {
  RecruitmentMessageType,
  CapabilityAdvertisement,
  TeamContract,
  NegotiationStrategy,
} from '../../interfaces/recruitment-protocol.interface';

import {
  RoleEmergencePattern,
  EmergentRole,
  TeamRoleEventType,
} from '../../interfaces/emergent-roles.interface';

// Mock implementation of MessageBus
class MockMessageBus {
  private eventEmitter = new EventEmitter();

  async publish(topic: string, message: any): Promise<void> {
    this.eventEmitter.emit(topic, message);
  }

  subscribe(topic: string, handler: (message: any) => void): void {
    this.eventEmitter.on(topic, handler);
  }
}

// Mock agent class
class MockAgent extends BaseAgent {
  private mockCapabilities: string[] = [];
  private mockAffinity = 0.5; // Default affinity score

  constructor(options: {
    id: string;
    name: string;
    capabilities?: string[];
    affinity?: number;
  }) {
    super({
      id: options.id,
      name: options.name,
      description: `Mock agent with capabilities: ${options.capabilities?.join(', ') || 'none'}`,
    });

    if (options.capabilities) {
      this.mockCapabilities = options.capabilities;
    }

    if (options.affinity !== undefined) {
      this.mockAffinity = options.affinity;
    }
  }

  async executeInternal(request: any): Promise<any> {
    return {
      output: `${this.name} processed: ${request.input}`,
      artifacts: {
        result: 'mock-result',
      },
    };
  }

  getCapabilities(): string[] {
    return this.mockCapabilities;
  }

  // Mock method to simulate agent's affinity for a particular role
  calculateRoleAffinity(roleName: string): number {
    // In a real implementation, this would use more sophisticated logic
    return this.mockAffinity;
  }
}

// We're using jest.mock() to extend AgentWorkflow with the needed getLastState method
jest.mock('../../../langgraph/core/workflows/agent-workflow', () => {
  const original = jest.requireActual(
    '../../../langgraph/core/workflows/agent-workflow',
  );
  return {
    ...original,
    AgentWorkflow: jest.fn().mockImplementation((agent, options) => {
      const instance = new original.AgentWorkflow(agent, options);
      // Add mock getLastState method
      instance.getLastState = jest.fn().mockReturnValue({
        status: WorkflowStatus.READY,
        id: 'test-workflow',
        runId: 'test-run',
        agentId: agent.id,
      });
      return instance;
    }),
  };
});

describe('Team Formation Integration Tests', () => {
  // Test dependencies
  let logger: MockLogger;
  let registry: AgentRegistryService;
  let discoveryService: AgentDiscoveryService;
  let capabilityRegistry: CapabilityRegistryService;
  let recruitmentService: AgentRecruitmentService;
  let contractService: TeamContractService;
  let negotiationService: NegotiationEngineService;
  let roleEmergenceService: RoleEmergenceService;
  let teamOptimizationService: AdaptiveTeamOptimizationService;
  let messageBus: MockMessageBus;

  // Mock agents
  let researchAgent: MockAgent;
  let analysisAgent: MockAgent;
  let writingAgent: MockAgent;
  let programmingAgent: MockAgent;
  let designAgent: MockAgent;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    logger = new MockLogger();
    messageBus = new MockMessageBus();

    // Set up registries and services
    registry = AgentRegistryService.getInstance({ logger });
    capabilityRegistry = CapabilityRegistryService.getInstance({ logger });
    discoveryService = AgentDiscoveryService.getInstance({ logger, registry });

    // Initialize the recruitment services
    recruitmentService = AgentRecruitmentService.getInstance({
      logger,
      agentRegistry: registry,
      messageBus,
    });

    contractService = TeamContractService.getInstance({
      logger,
      recruitmentService,
      messageBus,
    });

    negotiationService = NegotiationEngineService.getInstance({
      logger,
      recruitmentService,
    });

    roleEmergenceService = RoleEmergenceService.getInstance({
      logger,
      agentRegistry: registry,
      messageBus,
    });

    teamOptimizationService = AdaptiveTeamOptimizationService.getInstance({
      logger,
      roleEmergenceService,
      messageBus,
    });

    // Create and register mock agents
    researchAgent = new MockAgent({
      id: 'research-agent-1',
      name: 'Research Agent',
      capabilities: ['web_research', 'information_gathering', 'search'],
      affinity: 0.9,
    });

    analysisAgent = new MockAgent({
      id: 'analysis-agent-1',
      name: 'Analysis Agent',
      capabilities: [
        'data_analysis',
        'information_synthesis',
        'pattern_recognition',
      ],
      affinity: 0.8,
    });

    writingAgent = new MockAgent({
      id: 'writing-agent-1',
      name: 'Writing Agent',
      capabilities: ['content_creation', 'writing', 'editing', 'summarization'],
      affinity: 0.95,
    });

    programmingAgent = new MockAgent({
      id: 'programming-agent-1',
      name: 'Programming Agent',
      capabilities: [
        'code_generation',
        'debugging',
        'code_review',
        'refactoring',
      ],
      affinity: 0.85,
    });

    designAgent = new MockAgent({
      id: 'design-agent-1',
      name: 'Design Agent',
      capabilities: ['ui_design', 'ux_evaluation', 'layout_optimization'],
      affinity: 0.75,
    });

    // Register agents
    registry.registerAgent(researchAgent);
    registry.registerAgent(analysisAgent);
    registry.registerAgent(writingAgent);
    registry.registerAgent(programmingAgent);
    registry.registerAgent(designAgent);

    // Register agent capabilities
    capabilityRegistry.registerCapability(
      {
        name: 'web_research',
        description: 'Ability to search and gather information from the web',
        level: 'advanced',
        taxonomy: ['research', 'perception'],
      },
      'research-agent-1',
    );

    capabilityRegistry.registerCapability(
      {
        name: 'information_synthesis',
        description:
          'Ability to combine information from multiple sources into coherent insights',
        level: 'expert',
        taxonomy: ['analysis', 'reasoning'],
      },
      'analysis-agent-1',
    );

    capabilityRegistry.registerCapability(
      {
        name: 'content_creation',
        description: 'Ability to create high-quality written content',
        level: 'expert',
        taxonomy: ['creation', 'generation'],
      },
      'writing-agent-1',
    );

    capabilityRegistry.registerCapability(
      {
        name: 'code_generation',
        description:
          'Ability to generate code in multiple programming languages',
        level: 'expert',
        taxonomy: ['code', 'generation'],
      },
      'programming-agent-1',
    );

    capabilityRegistry.registerCapability(
      {
        name: 'ui_design',
        description: 'Ability to design user interfaces',
        level: 'advanced',
        taxonomy: ['design', 'visual'],
      },
      'design-agent-1',
    );
  });

  afterEach(() => {
    // Unregister all agents to clean up the registry
    registry.unregisterAgent(researchAgent.id);
    registry.unregisterAgent(analysisAgent.id);
    registry.unregisterAgent(writingAgent.id);
    registry.unregisterAgent(programmingAgent.id);
    registry.unregisterAgent(designAgent.id);
  });

  /**
   * Test: Simple Capability-Based Agent Discovery
   *
   * Verifies that the system can correctly identify agents with the requested capabilities
   */
  test('should discover agents based on capabilities', async () => {
    // Discover agents with research capabilities
    const researchCapableAgents =
      await discoveryService.findAgentsByCapability('web_research');
    expect(researchCapableAgents).toHaveLength(1);
    expect(researchCapableAgents[0].id).toBe('research-agent-1');

    // Discover agents with content creation capabilities
    const contentCreationAgents =
      await discoveryService.findAgentsByCapability('content_creation');
    expect(contentCreationAgents).toHaveLength(1);
    expect(contentCreationAgents[0].id).toBe('writing-agent-1');

    // Test with a capability that no agent has
    const nonexistentCapabilityAgents =
      await discoveryService.findAgentsByCapability('quantum_computing');
    expect(nonexistentCapabilityAgents).toHaveLength(0);
  });

  /**
   * Test: Basic Recruitment Protocol
   *
   * Tests the basic recruitment workflow from inquiry to acceptance
   */
  test('should successfully recruit an agent using the recruitment protocol', async () => {
    // Create a task ID for this recruitment
    const taskId = 'task-123';

    // Setup spy on message bus to track events
    const messageSpy = jest.spyOn(messageBus, 'publish');

    // 1. Initiate recruitment inquiry
    const inquiryResult = await recruitmentService.initiateRecruitmentInquiry(
      researchAgent, // initiator agent
      analysisAgent.id, // target agent
      taskId,
      'analysis_role',
      ['data_analysis', 'information_synthesis'],
      'Need an agent that can analyze research findings',
    );

    expect(inquiryResult.type).toBe(RecruitmentMessageType.INQUIRY);
    expect(inquiryResult.status).toBe(RecruitmentStatus.INQUIRY_SENT);

    // 2. Target agent responds to inquiry (normally this would be handled by the agent itself)
    const inquiryResponsePromise = new Promise<void>((resolve) => {
      messageBus.subscribe(
        'agent.recruitment.inquiry.response',
        async (message) => {
          if (message.type === RecruitmentMessageType.INQUIRY_RESPONSE) {
            // 3. Initiator sends a proposal based on the inquiry response
            const proposalResult =
              await recruitmentService.sendRecruitmentProposal(
                researchAgent,
                analysisAgent.id,
                taskId,
                'analysis_role',
                [
                  'Analyze research findings',
                  'Generate insights',
                  'Identify patterns',
                ],
                ['data_analysis', 'information_synthesis'],
                'Analyze research data and provide insights',
                2 * 60 * 60 * 1000, // 2 hours
                30 * 60 * 1000, // 30 min expiration
              );

            expect(proposalResult.type).toBe(RecruitmentMessageType.PROPOSAL);
            expect(proposalResult.status).toBe(RecruitmentStatus.PROPOSAL_SENT);

            // 4. Target agent accepts the proposal
            messageBus.subscribe(
              'agent.recruitment.acceptance',
              async (acceptanceMessage) => {
                if (
                  acceptanceMessage.type === RecruitmentMessageType.ACCEPTANCE
                ) {
                  resolve();
                }
              },
            );

            // Simulate the target agent accepting the proposal
            await recruitmentService.acceptProposal(
              analysisAgent,
              proposalResult.proposalId,
              taskId,
            );
          }
        },
      );

      // Simulate the target agent responding to the inquiry
      recruitmentService.respondToInquiry(
        analysisAgent,
        inquiryResult.inquiryId,
        taskId,
        true,
        ['data_analysis', 'information_synthesis', 'pattern_recognition'],
        'I can help with analyzing research data',
      );
    });

    await inquiryResponsePromise;

    // Verify message bus was used correctly
    expect(messageSpy).toHaveBeenCalledWith(
      expect.stringContaining('agent.recruitment'),
      expect.objectContaining({
        type: expect.any(String),
        taskId,
      }),
    );

    // Check recruitment status for this task
    const recruitmentStatus = recruitmentService.getRecruitmentStatus(
      taskId,
      analysisAgent.id,
    );
    expect(recruitmentStatus).toBe(RecruitmentStatus.ACCEPTED);
  });

  /**
   * Test: Team Contract Creation
   *
   * Tests the creation and validation of a team contract after recruitment
   */
  test('should create and validate a team contract', async () => {
    const taskId = 'task-456';
    const teamId = 'team-456';

    // Create a team contract
    const contract = await recruitmentService.createTeamContract(
      researchAgent, // initiator
      taskId,
      'Research Project Team',
      'Team for analyzing and documenting research findings',
      [
        {
          agentId: researchAgent.id,
          role: 'lead_researcher',
          responsibilities: ['Coordinate research', 'Gather information'],
          requiredCapabilities: ['web_research', 'information_gathering'],
          expectedDeliverables: ['Research report', 'Data sources'],
        },
        {
          agentId: analysisAgent.id,
          role: 'data_analyst',
          responsibilities: ['Analyze data', 'Identify patterns'],
          requiredCapabilities: ['data_analysis', 'information_synthesis'],
          expectedDeliverables: ['Analysis report', 'Key insights'],
        },
        {
          agentId: writingAgent.id,
          role: 'content_writer',
          responsibilities: ['Write content', 'Edit documents'],
          requiredCapabilities: ['content_creation', 'writing'],
          expectedDeliverables: ['Final document', 'Executive summary'],
        },
      ],
      {
        startTime: Date.now(),
        endTime: Date.now() + 7 * 24 * 60 * 60 * 1000, // 1 week
        deadline: Date.now() + 6 * 24 * 60 * 60 * 1000, // 6 days
      },
      ['Complete research report', 'Present findings'],
      teamId,
    );

    expect(contract).toBeDefined();
    expect(contract.type).toBe(RecruitmentMessageType.CONTRACT);
    expect(contract.contractId).toBeDefined();
    expect(contract.participants).toHaveLength(3);
    expect(contract.status).toBe('draft');

    // Validate the contract
    const isValid = contractService.validateContract(contract);
    expect(isValid).toBe(true);

    // Update the contract status
    const updatedContract = await contractService.updateContractStatus(
      contract.contractId,
      'active',
      researchAgent.id,
      'All agents have signed',
    );

    expect(updatedContract.status).toBe('active');
    expect(updatedContract.statusHistory).toHaveLength(2);
  });

  /**
   * Test: Role Emergence and Transitions
   *
   * Tests dynamic role discovery and assignment
   */
  test('should discover and assign emergent roles', async () => {
    const teamId = 'team-789';
    const taskId = 'task-789';

    // Define some emergent role patterns
    const coordinatorRole: EmergentRole = {
      id: 'coordinator-role',
      name: 'Coordinator',
      description:
        'Coordinates team activities and ensures smooth collaboration',
      requiredCapabilities: ['communication', 'project_management'],
      responsibilityAreas: ['coordination', 'scheduling', 'tracking'],
      emergencePattern: RoleEmergencePattern.INTERACTION_BASED,
      discoveryTime: Date.now(),
      confidence: 0.85,
    };

    // Register the emergent role
    roleEmergenceService.registerEmergentRole(coordinatorRole);

    // Assign the role to an agent
    const assignment = await roleEmergenceService.assignRole({
      roleId: coordinatorRole.id,
      agentId: researchAgent.id,
      teamId,
      taskId,
      confidence: 0.8,
      startTime: Date.now(),
      assignmentReason: 'Agent exhibits strong coordination patterns',
    });

    expect(assignment).toBeDefined();
    expect(assignment.roleId).toBe(coordinatorRole.id);
    expect(assignment.agentId).toBe(researchAgent.id);

    // Verify the role assignment
    const currentRole = roleEmergenceService.getAgentRoleInTeam(
      researchAgent.id,
      teamId,
    );

    expect(currentRole).toBeDefined();
    expect(currentRole?.roleId).toBe(coordinatorRole.id);

    // Test role transition
    const editorRole: EmergentRole = {
      id: 'editor-role',
      name: 'Editor',
      description: 'Reviews and improves content',
      requiredCapabilities: ['editing', 'writing'],
      responsibilityAreas: ['quality_control', 'refinement'],
      emergencePattern: RoleEmergencePattern.CAPABILITY_BASED,
      discoveryTime: Date.now(),
      confidence: 0.9,
    };

    roleEmergenceService.registerEmergentRole(editorRole);

    // Transition the agent to a new role
    const transition = await roleEmergenceService.transitionRole({
      agentId: researchAgent.id,
      teamId,
      taskId,
      fromRoleId: coordinatorRole.id,
      toRoleId: editorRole.id,
      reason: 'Agent more suited to editing based on recent performance',
      initiatedBy: 'team_optimization',
    });

    expect(transition).toBeDefined();
    expect(transition.fromRoleId).toBe(coordinatorRole.id);
    expect(transition.toRoleId).toBe(editorRole.id);

    // Verify the new role assignment
    const updatedRole = roleEmergenceService.getAgentRoleInTeam(
      researchAgent.id,
      teamId,
    );

    expect(updatedRole).toBeDefined();
    expect(updatedRole?.roleId).toBe(editorRole.id);
  });

  /**
   * Test: Team Optimization
   *
   * Tests the adaptive team optimization process
   */
  test('should detect and optimize team performance', async () => {
    const teamId = 'team-optimization-test';
    const taskId = 'task-optimization';

    // Create a performance analysis
    const performanceAnalysisSpy = jest.spyOn(
      teamOptimizationService as any,
      'handlePerformanceUpdate',
    );

    // Publish a performance update
    await messageBus.publish('team.performance.updated', {
      teamId,
      taskId,
      metrics: {
        efficiency: 0.4, // Low efficiency
        quality: 0.6,
        collaboration: 0.5,
      },
      agentPerformance: [
        {
          agentId: programmingAgent.id,
          performanceScore: 0.35,
          improvementAreas: ['collaboration', 'task_completion'],
        },
        {
          agentId: writingAgent.id,
          performanceScore: 0.8,
          improvementAreas: [],
        },
      ],
      roleEffectiveness: [
        {
          roleId: 'programmer',
          effectivenessScore: 0.4,
          bottlenecks: ['technical_complexity'],
        },
      ],
    });

    // Wait for the event to be processed
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify the performance update was handled
    expect(performanceAnalysisSpy).toHaveBeenCalled();

    // Create a model and check if optimization recommendations are generated
    const model = await teamOptimizationService.createTeamOptimizationModel(
      teamId,
      [
        {
          factorName: 'efficiency',
          weight: 0.3,
          threshold: 0.6,
          description: 'Team work efficiency',
        },
        {
          factorName: 'quality',
          weight: 0.4,
          threshold: 0.7,
          description: 'Output quality',
        },
        {
          factorName: 'collaboration',
          weight: 0.3,
          threshold: 0.6,
          description: 'Team collaboration',
        },
      ],
    );

    expect(model).toBeDefined();
    expect(model.teamId).toBe(teamId);
    expect(model.optimizationFactors).toHaveLength(3);
  });

  /**
   * Test: End-to-End Team Formation
   *
   * Tests the complete team formation process from discovery to contract to roles
   */
  test('should execute end-to-end team formation workflow', async () => {
    const taskId = 'end-to-end-task';
    const teamId = 'end-to-end-team';

    // Step 1: Discover agents with required capabilities
    const researchAgents =
      await discoveryService.findAgentsByCapability('web_research');
    const analysisAgents = await discoveryService.findAgentsByCapability(
      'information_synthesis',
    );
    const writingAgents =
      await discoveryService.findAgentsByCapability('content_creation');

    expect(researchAgents).toHaveLength(1);
    expect(analysisAgents).toHaveLength(1);
    expect(writingAgents).toHaveLength(1);

    // Step 2: Recruit the analysis agent
    const initialAgent = researchAgents[0] as BaseAgent;
    const targetAgent = analysisAgents[0] as BaseAgent;

    // Setup a promise to track the recruitment process
    const recruitmentPromise = new Promise<void>((resolve) => {
      messageBus.subscribe('agent.recruitment.acceptance', async (message) => {
        if (message.type === RecruitmentMessageType.ACCEPTANCE) {
          resolve();
        }
      });

      // Start the recruitment process
      async function startRecruitment() {
        // Send inquiry
        const inquiry = await recruitmentService.initiateRecruitmentInquiry(
          initialAgent,
          targetAgent.id,
          taskId,
          'analyst',
          ['information_synthesis', 'data_analysis'],
          'Need an agent to analyze research data',
        );

        // Simulate response to inquiry
        await recruitmentService.respondToInquiry(
          targetAgent,
          inquiry.inquiryId,
          taskId,
          true,
          ['information_synthesis', 'data_analysis', 'pattern_recognition'],
          'I can help with analyzing research data',
        );

        // Send proposal based on inquiry
        messageBus.subscribe(
          'agent.recruitment.inquiry.response',
          async (response) => {
            if (
              response.type === RecruitmentMessageType.INQUIRY_RESPONSE &&
              response.inquiryId === inquiry.inquiryId
            ) {
              const proposal = await recruitmentService.sendRecruitmentProposal(
                initialAgent,
                targetAgent.id,
                taskId,
                'analyst',
                [
                  'Analyze research data',
                  'Identify patterns',
                  'Generate insights',
                ],
                ['information_synthesis', 'data_analysis'],
                'Analyze data and provide insights',
                4 * 60 * 60 * 1000, // 4 hours
                30 * 60 * 1000, // 30 min expiration
                { negotiationStrategy: NegotiationStrategy.COLLABORATIVE },
              );

              // Accept the proposal
              await recruitmentService.acceptProposal(
                targetAgent,
                proposal.proposalId,
                taskId,
              );
            }
          },
        );
      }

      startRecruitment();
    });

    // Wait for recruitment to complete
    await recruitmentPromise;

    // Step 3: Create a team contract
    const contract = await recruitmentService.createTeamContract(
      initialAgent,
      taskId,
      'Research Analysis Team',
      'Team for researching and analyzing data',
      [
        {
          agentId: initialAgent.id,
          role: 'lead_researcher',
          responsibilities: ['Coordinate research', 'Gather information'],
          requiredCapabilities: ['web_research'],
          expectedDeliverables: ['Research data'],
        },
        {
          agentId: targetAgent.id,
          role: 'analyst',
          responsibilities: ['Analyze data', 'Identify patterns'],
          requiredCapabilities: ['information_synthesis', 'data_analysis'],
          expectedDeliverables: ['Analysis report'],
        },
      ],
      {
        startTime: Date.now(),
        endTime: Date.now() + 24 * 60 * 60 * 1000, // 1 day
      },
      ['Complete research and analysis'],
      teamId,
    );

    expect(contract).toBeDefined();
    expect(contract.participants).toHaveLength(2);

    // Activate the contract
    const activatedContract = await contractService.updateContractStatus(
      contract.contractId,
      'active',
      initialAgent.id,
      'All team members have accepted',
    );

    expect(activatedContract.status).toBe('active');

    // Step 4: Detect emergent roles
    // Register a potential emergent role based on the task
    const coordinatorRole: EmergentRole = {
      id: 'coordinator-role',
      name: 'Coordinator',
      description:
        'Coordinates team activities and ensures smooth collaboration',
      requiredCapabilities: ['communication'],
      responsibilityAreas: ['coordination', 'tracking'],
      emergencePattern: RoleEmergencePattern.INTERACTION_BASED,
      discoveryTime: Date.now(),
      confidence: 0.85,
    };

    roleEmergenceService.registerEmergentRole(coordinatorRole);

    // Assign an emergent role to the leader
    const assignment = await roleEmergenceService.assignRole({
      roleId: coordinatorRole.id,
      agentId: initialAgent.id,
      teamId,
      taskId,
      confidence: 0.9,
      startTime: Date.now(),
      assignmentReason: 'Natural leader of the team',
    });

    expect(assignment).toBeDefined();
    expect(assignment.roleId).toBe(coordinatorRole.id);

    // Step 5: Simulate performance monitoring
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
          agentId: initialAgent.id,
          performanceScore: 0.75,
          improvementAreas: [],
        },
        {
          agentId: targetAgent.id,
          performanceScore: 0.8,
          improvementAreas: [],
        },
      ],
      roleEffectiveness: [
        {
          roleId: coordinatorRole.id,
          effectivenessScore: 0.8,
          bottlenecks: [],
        },
      ],
    });

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Step 6: Complete the contract
    const completedContract = await contractService.updateContractStatus(
      contract.contractId,
      'completed',
      initialAgent.id,
      'All deliverables have been provided',
    );

    expect(completedContract.status).toBe('completed');

    // Verify the appropriate events were emitted
    const emitSpy = jest.spyOn(roleEmergenceService as any, 'emitEvent');

    // Complete a role transition
    await roleEmergenceService.transitionRole({
      agentId: initialAgent.id,
      teamId,
      taskId,
      fromRoleId: coordinatorRole.id,
      toRoleId: null, // Removing role as the task is completed
      reason: 'Task completed',
      initiatedBy: 'task_completion',
    });

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: TeamRoleEventType.ROLE_TRANSITION_COMPLETED,
        teamId,
        taskId,
      }),
    );
  });
});
