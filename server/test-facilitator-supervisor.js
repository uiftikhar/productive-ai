/**
 * Test script for demonstrating the Facilitator Supervisor Agent capabilities
 * 
 * This script shows the transition from a controller-based supervisor to
 * a facilitator that enables collaborative task breakdown, team assembly,
 * consensus voting, and suggestion-based coordination.
 */

const { FacilitatorSupervisorAgent } = require('./dist/agents/specialized/facilitator-supervisor-agent');
const { ConsoleLogger } = require('./dist/shared/logger/console-logger');
const { BaseAgent } = require('./dist/agents/base/base-agent');

// Create a logger
const logger = new ConsoleLogger({ level: 'info' });

/**
 * Create a collection of simple test agents with different capabilities
 */
async function createTestAgents() {
  logger.info('Creating test agents with different capabilities');
  
  const agents = [];
  
  // Create a research agent
  const researchAgent = new BaseAgent(
    'Research Agent',
    'Specializes in finding and analyzing information',
    { id: 'research-agent-1' }
  );
  
  researchAgent.registerCapability({
    name: 'research',
    description: 'Find and analyze information on various topics',
  });
  
  researchAgent.registerCapability({
    name: 'data-analysis',
    description: 'Analyze data sets to extract insights',
  });
  
  await researchAgent.initialize();
  agents.push(researchAgent);
  
  // Create a planning agent
  const planningAgent = new BaseAgent(
    'Planning Agent',
    'Specializes in creating plans and strategies',
    { id: 'planning-agent-1' }
  );
  
  planningAgent.registerCapability({
    name: 'planning',
    description: 'Create detailed plans for complex tasks',
  });
  
  planningAgent.registerCapability({
    name: 'task-breakdown',
    description: 'Break down complex tasks into manageable steps',
  });
  
  await planningAgent.initialize();
  agents.push(planningAgent);
  
  // Create a writing agent
  const writingAgent = new BaseAgent(
    'Writing Agent',
    'Specializes in content creation and documentation',
    { id: 'writing-agent-1' }
  );
  
  writingAgent.registerCapability({
    name: 'writing',
    description: 'Create written content for various purposes',
  });
  
  writingAgent.registerCapability({
    name: 'editing',
    description: 'Edit and improve existing content',
  });
  
  await writingAgent.initialize();
  agents.push(writingAgent);
  
  // Create a coding agent
  const codingAgent = new BaseAgent(
    'Coding Agent',
    'Specializes in writing and reviewing code',
    { id: 'coding-agent-1' }
  );
  
  codingAgent.registerCapability({
    name: 'coding',
    description: 'Write code in various programming languages',
  });
  
  codingAgent.registerCapability({
    name: 'code-review',
    description: 'Review and improve existing code',
  });
  
  await codingAgent.initialize();
  agents.push(codingAgent);
  
  // Create a graphics agent
  const graphicsAgent = new BaseAgent(
    'Graphics Agent',
    'Specializes in creating visual assets',
    { id: 'graphics-agent-1' }
  );
  
  graphicsAgent.registerCapability({
    name: 'graphics-design',
    description: 'Create visual assets and designs',
  });
  
  await graphicsAgent.initialize();
  agents.push(graphicsAgent);
  
  return agents;
}

/**
 * Create and initialize the Facilitator Supervisor Agent
 */
async function createFacilitatorSupervisor(agentRegistry) {
  logger.info('Creating Facilitator Supervisor Agent');
  
  const supervisor = new FacilitatorSupervisorAgent({
    name: 'Facilitator Supervisor',
    description: 'Facilitates collaborative team decision-making and task execution',
    logger,
    agentRegistry,
  });
  
  await supervisor.initialize();
  
  logger.info('Facilitator Supervisor initialized');
  
  return supervisor;
}

/**
 * Demonstrate collaborative task breakdown
 */
async function demonstrateCollaborativeTaskBreakdown(supervisor, taskPlanningService) {
  logger.info('===== Demonstrating Collaborative Task Breakdown =====');
  
  // Create a task plan
  const plan = await taskPlanningService.createTaskPlan(
    'Website Redesign Project',
    'Create a modern, responsive website with improved UX and visual design',
    {}
  );
  
  logger.info(`Created task plan: ${plan.name} (${plan.id})`);
  
  // Get the root task to break down collaboratively
  const rootTask = plan.tasks.find(t => plan.rootTaskIds.includes(t.id));
  
  if (!rootTask) {
    logger.error('No root task found in the plan');
    return;
  }
  
  // Set up collaborative task breakdown
  const breakdownResult = await supervisor.execute({
    capability: 'collaborative-task-breakdown',
    input: {
      planId: plan.id,
      taskId: rootTask.id,
      minContributors: 2,
      maxContributors: 3,
      evaluationCriteria: [
        'Completeness - Does the breakdown cover all aspects of the task?',
        'Clarity - Are the subtasks clearly defined?',
        'Feasibility - Can the subtasks be realistically accomplished?',
      ],
    },
  });
  
  logger.info('Collaborative Task Breakdown Result:');
  logger.info(JSON.stringify(breakdownResult.output, null, 2));
  
  // Return the updated plan
  return plan;
}

/**
 * Demonstrate team assembly
 */
async function demonstrateTeamAssembly(supervisor) {
  logger.info('===== Demonstrating Team Assembly =====');
  
  // Assemble a team for a specific task
  const teamResult = await supervisor.execute({
    capability: 'team-assembly',
    input: {
      taskDescription: 'Develop a responsive navigation component for the website',
      requiredCapabilities: ['coding', 'graphics-design'],
      strategy: 'balanced',
      addToSupervisorTeam: true,
    },
  });
  
  logger.info('Team Assembly Result:');
  logger.info(JSON.stringify(teamResult.output, null, 2));
  
  // Return the team ID
  return teamResult.output.teamId;
}

/**
 * Demonstrate consensus building
 */
async function demonstrateConsensusBuilding(supervisor) {
  logger.info('===== Demonstrating Consensus Building =====');
  
  // Start a voting session
  const votingResult = await supervisor.execute({
    capability: 'consensus-building',
    input: {
      operation: 'start-vote',
      question: 'Which design direction should we take for the website?',
      options: [
        'Minimalist with focus on typography',
        'Bold colors with interactive elements',
        'Graphics-heavy with animations',
        'Traditional corporate look with modern touches',
      ],
      participants: 'team',
    },
  });
  
  logger.info('Voting Session Created:');
  logger.info(JSON.stringify(votingResult.output, null, 2));
  
  // Simulate votes from team members
  const votingId = votingResult.output.votingId;
  
  // Cast votes directly 
  await supervisor.execute({
    capability: 'consensus-building',
    input: {
      operation: 'cast-vote',
      votingId,
      agentId: 'coding-agent-1',
      vote: 'Bold colors with interactive elements',
    },
  });
  
  await supervisor.execute({
    capability: 'consensus-building',
    input: {
      operation: 'cast-vote',
      votingId,
      agentId: 'graphics-agent-1',
      vote: 'Bold colors with interactive elements',
    },
  });
  
  await supervisor.execute({
    capability: 'consensus-building',
    input: {
      operation: 'cast-vote',
      votingId,
      agentId: 'planning-agent-1',
      vote: 'Minimalist with focus on typography',
    },
  });
  
  // Get the voting result
  const finalResult = await supervisor.execute({
    capability: 'consensus-building',
    input: {
      operation: 'get-result',
      votingId,
      forceResult: true,
    },
  });
  
  logger.info('Voting Final Result:');
  logger.info(JSON.stringify(finalResult.output, null, 2));
  
  return votingId;
}

/**
 * Demonstrate task delegation
 */
async function demonstrateTaskDelegation(supervisor, teamId) {
  logger.info('===== Demonstrating Task Delegation =====');
  
  // Delegate a task
  const delegationResult = await supervisor.execute({
    capability: 'task-delegation',
    input: {
      title: 'Implement navigation component',
      description: 'Create a responsive navigation component with dropdown menus and mobile-friendly behavior',
      requiredCapabilities: ['coding'],
      teamId,
      advertisementStrategy: 'team-only',
      waitForResponses: 2000, // Wait 2 seconds for responses
      autoAssign: true,
    },
  });
  
  logger.info('Task Delegation Result:');
  logger.info(JSON.stringify(delegationResult.output, null, 2));
  
  return delegationResult.output.advertisementId;
}

/**
 * Demonstrate suggestion-based coordination
 */
async function demonstrateSuggestionCoordination(supervisor) {
  logger.info('===== Demonstrating Suggestion-Based Coordination =====');
  
  // Submit a suggestion
  const suggestionResult = await supervisor.execute({
    capability: 'suggestion-coordination',
    input: {
      operation: 'submit-suggestion',
      suggestion: 'We should create a shared design system before implementing individual components',
      agentId: 'planning-agent-1',
      weight: 3.0,
    },
  });
  
  logger.info('Suggestion Submitted:');
  logger.info(JSON.stringify(suggestionResult.output, null, 2));
  
  const suggestionId = suggestionResult.output.suggestionId;
  
  // Support the suggestion
  await supervisor.execute({
    capability: 'suggestion-coordination',
    input: {
      operation: 'support-suggestion',
      suggestionId,
      agentId: 'graphics-agent-1',
      additionalWeight: 2.0,
    },
  });
  
  // Resolve the suggestion
  const resolutionResult = await supervisor.execute({
    capability: 'suggestion-coordination',
    input: {
      operation: 'resolve-suggestion',
      suggestionId,
      outcome: 'Approved - Will prioritize creating a design system first',
      resolverId: supervisor.id,
    },
  });
  
  logger.info('Suggestion Resolution:');
  logger.info(JSON.stringify(resolutionResult.output, null, 2));
  
  // List all suggestions
  const listResult = await supervisor.execute({
    capability: 'suggestion-coordination',
    input: {
      operation: 'list-suggestions',
      status: 'all',
    },
  });
  
  logger.info('All Suggestions:');
  logger.info(JSON.stringify(listResult.output, null, 2));
  
  return suggestionId;
}

/**
 * Main test function
 */
async function runTest() {
  try {
    logger.info('Starting Facilitator Supervisor Test');
    
    // Create test agents
    const agents = await createTestAgents();
    
    // Mock the agent registry
    const mockAgentRegistry = {
      getAgent: (id) => agents.find(a => a.id === id),
      listAgents: () => agents,
    };
    
    // Mock the task planning service
    const mockTaskPlanningService = {
      createTaskPlan: async (name, description) => {
        const planId = `plan-${Date.now()}`;
        const taskId = `task-${Date.now()}`;
        
        return {
          id: planId,
          name,
          description,
          tasks: [{
            id: taskId,
            name,
            description,
            status: 'pending',
            priority: 5,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }],
          rootTaskIds: [taskId],
          status: 'pending',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
      getTaskPlan: () => ({}),
      addTask: () => true,
      listTaskPlans: () => [],
    };
    
    // Create supervisor agent
    const supervisor = await createFacilitatorSupervisor(mockAgentRegistry);
    
    // Add test agents to the supervisor's team
    for (const agent of agents) {
      supervisor.addTeamMember({
        agent,
        role: 'team-member',
        priority: 5,
        active: true,
      });
    }
    
    // Run the demos
    const plan = await demonstrateCollaborativeTaskBreakdown(supervisor, mockTaskPlanningService);
    const teamId = await demonstrateTeamAssembly(supervisor);
    const votingId = await demonstrateConsensusBuilding(supervisor);
    const advertisementId = await demonstrateTaskDelegation(supervisor, teamId);
    const suggestionId = await demonstrateSuggestionCoordination(supervisor);
    
    logger.info('===== Test Summary =====');
    logger.info(`Collaborative Task Breakdown: Plan ID ${plan.id}`);
    logger.info(`Team Assembly: Team ID ${teamId}`);
    logger.info(`Consensus Building: Voting ID ${votingId}`);
    logger.info(`Task Delegation: Advertisement ID ${advertisementId}`);
    logger.info(`Suggestion Coordination: Suggestion ID ${suggestionId}`);
    
    logger.info('Facilitator Supervisor Test Completed Successfully');
  } catch (error) {
    logger.error('Error running test:', error);
  }
}

// Run the test
runTest(); 