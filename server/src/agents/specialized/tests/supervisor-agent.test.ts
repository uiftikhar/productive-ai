import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  SupervisorAgent,
  TeamMember,
  Task,
} from '../facilitator-supervisor-agent';
import { mock } from 'jest-mock-extended';
import {
  AgentCapability,
  BaseAgentInterface,
} from '../../interfaces/base-agent.interface';
import { MockLogger } from '../../tests/mocks/mock-logger';

describe('SupervisorAgent', () => {
  let supervisorAgent: SupervisorAgent;
  let mockLogger: MockLogger;
  let mockAgent1: BaseAgentInterface;
  let mockAgent2: BaseAgentInterface;

  beforeEach(() => {
    // Set up mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setLogLevel: jest.fn(),
      log: jest.fn(),
    } as any;

    // Set up mock agents with proper type casting
    mockAgent1 = mock<BaseAgentInterface>({
      id: 'mock-agent-1',
      name: 'Mock Agent 1',
      description: 'A mock agent for testing',
      getCapabilities: () =>
        [
          { name: 'test-capability-1', description: 'Test capability 1' },
        ] as AgentCapability[],
      getInitializationStatus: () => true,
    });

    mockAgent2 = mock<BaseAgentInterface>({
      id: 'mock-agent-2',
      name: 'Mock Agent 2',
      description: 'Another mock agent for testing',
      getCapabilities: () =>
        [
          { name: 'test-capability-2', description: 'Test capability 2' },
        ] as AgentCapability[],
      getInitializationStatus: () => true,
    });

    supervisorAgent = new SupervisorAgent({
      logger: mockLogger,
    });
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await supervisorAgent.initialize();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'SupervisorAgent initialized successfully',
      );
    });

    it('should initialize with default team members', async () => {
      const agentWithTeam = new SupervisorAgent({
        logger: mockLogger,
        defaultTeamMembers: [
          {
            agent: mockAgent1,
            role: 'test-role-1',
            priority: 5,
            active: true,
          },
        ],
      });

      await agentWithTeam.initialize();
      const teamMembers = agentWithTeam['listTeamMembers']();
      expect(teamMembers.length).toBe(1);
      expect(teamMembers[0].agent.id).toBe('mock-agent-1');
    });

    it('should apply configuration settings during initialization', async () => {
      await supervisorAgent.initialize({
        priorityThreshold: 7,
      });
      expect(supervisorAgent['priorityThreshold']).toBe(7);
    });
  });

  describe('team management', () => {
    it('should add team members correctly', () => {
      const teamMember: TeamMember = {
        agent: mockAgent1,
        role: 'test-role',
        priority: 5,
        active: true,
      };

      supervisorAgent['addTeamMember'](teamMember);
      const team = supervisorAgent['team'];
      expect(team.size).toBe(1);
      expect(team.get('mock-agent-1')).toBeDefined();
      expect(team.get('mock-agent-1')?.role).toBe('test-role');
    });

    it('should remove team members correctly', () => {
      // Add team members
      supervisorAgent['addTeamMember']({
        agent: mockAgent1,
        role: 'test-role-1',
        priority: 5,
        active: true,
      });

      supervisorAgent['addTeamMember']({
        agent: mockAgent2,
        role: 'test-role-2',
        priority: 3,
        active: true,
      });

      // Verify both are added
      let team = supervisorAgent['team'];
      expect(team.size).toBe(2);

      // Remove one
      const result = supervisorAgent['removeTeamMember']('mock-agent-1');
      expect(result).toBe(true);

      // Verify it's gone
      team = supervisorAgent['team'];
      expect(team.size).toBe(1);
      expect(team.has('mock-agent-1')).toBe(false);
      expect(team.has('mock-agent-2')).toBe(true);
    });

    it('should update team members correctly', () => {
      // Add a team member
      supervisorAgent['addTeamMember']({
        agent: mockAgent1,
        role: 'test-role',
        priority: 5,
        active: true,
      });

      // Update it
      const result = supervisorAgent['updateTeamMember']('mock-agent-1', {
        role: 'updated-role',
        priority: 7,
      });

      expect(result).toBe(true);
      const updatedMember = supervisorAgent['team'].get('mock-agent-1');
      expect(updatedMember?.role).toBe('updated-role');
      expect(updatedMember?.priority).toBe(7);
      expect(updatedMember?.active).toBe(true); // Unchanged
    });

    it('should list team members correctly', () => {
      // Add team members
      supervisorAgent['addTeamMember']({
        agent: mockAgent1,
        role: 'test-role-1',
        priority: 5,
        active: true,
      });

      supervisorAgent['addTeamMember']({
        agent: mockAgent2,
        role: 'test-role-2',
        priority: 3,
        active: false,
      });

      const members = supervisorAgent['listTeamMembers']();
      expect(members.length).toBe(2);
      expect(members[0].agent.id).toBe('mock-agent-1');
      expect(members[1].agent.id).toBe('mock-agent-2');
      expect(members[0].role).toBe('test-role-1');
      expect(members[1].active).toBe(false);
    });
  });

  describe('task assignment', () => {
    it('should create and assign tasks correctly', async () => {
      // Add a team member
      supervisorAgent['addTeamMember']({
        agent: mockAgent1,
        role: 'test-role',
        priority: 5,
        active: true,
      });

      // Execute a task assignment request
      const result = await supervisorAgent['handleTaskAssignment']({
        input: 'Test task',
        parameters: {
          taskDescription: 'This is a test task',
          priority: 3,
          preferredAgentId: 'mock-agent-1',
        },
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.assignedTo).toBe('mock-agent-1');
      expect(result.priority).toBe(3);

      // Verify task is stored
      const tasks = supervisorAgent['tasks'];
      expect(tasks.size).toBe(1);
      expect(tasks.get(result.id)).toBeDefined();
    });

    it('should find the best agent for a task', async () => {
      // Add team members with different capabilities
      supervisorAgent['addTeamMember']({
        agent: mockAgent1,
        role: 'test-role-1',
        priority: 5,
        active: true,
      });

      supervisorAgent['addTeamMember']({
        agent: mockAgent2,
        role: 'test-role-2',
        priority: 7, // Higher priority
        active: true,
      });

      // Create a task
      const task: Task = {
        id: 'test-task-1',
        name: 'Test Task',
        description: 'This is a test task',
        status: 'pending',
        priority: 5,
        createdAt: Date.now(),
      };

      // Find best agent with specific capability requirement
      const bestAgentId = await supervisorAgent['findBestAgentForTask'](task, {
        taskDescription: 'Test task',
        requiredCapabilities: ['test-capability-2'], // Only agent2 has this
      });

      expect(bestAgentId).toBe('mock-agent-2');
    });
  });

  describe('capability handling', () => {
    it('should have the correct capabilities registered', () => {
      const capabilities = supervisorAgent.getCapabilities();
      expect(capabilities.length).toBe(5);

      const capabilityNames = capabilities.map((c) => c.name);
      expect(capabilityNames).toContain('team-management');
      expect(capabilityNames).toContain('task-assignment');
      expect(capabilityNames).toContain('work-coordination');
      expect(capabilityNames).toContain('progress-tracking');
      expect(capabilityNames).toContain('task-planning');
    });

    it('should correctly check if it can handle a capability', () => {
      expect(supervisorAgent.canHandle('team-management')).toBe(true);
      expect(supervisorAgent.canHandle('unknown-capability')).toBe(false);
    });
  });
});
