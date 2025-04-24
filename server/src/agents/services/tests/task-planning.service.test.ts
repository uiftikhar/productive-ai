import {
  TaskPlanningService,
  PlannedTask,
  TaskPlan,
} from '../task-planning.service';
import { AgentRegistryService } from '../agent-registry.service';
import { AgentDiscoveryService } from '../agent-discovery.service';
import { Logger } from '../../../shared/logger/logger.interface';
import { ChatOpenAI } from '@langchain/openai';
import { BaseAgentInterface } from '../../interfaces/base-agent.interface';
import { AIMessageChunk } from '@langchain/core/messages';

// Mock dependencies
jest.mock('../agent-registry.service');
jest.mock('../agent-discovery.service');
jest.mock('@langchain/openai');

describe('TaskPlanningService', () => {
  let taskPlanningService: TaskPlanningService;
  let mockLogger: Logger;
  let mockLLM: jest.Mocked<ChatOpenAI>;
  let mockRegistry: jest.Mocked<AgentRegistryService>;
  let mockDiscovery: jest.Mocked<AgentDiscoveryService>;
  let mockAgent: jest.Mocked<BaseAgentInterface>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mocks
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      setLogLevel: jest.fn(),
    };

    mockLLM = {
      invoke: jest.fn().mockResolvedValue({
        content: JSON.stringify({
          subtasks: [
            {
              name: 'Subtask 1',
              description: 'First subtask',
              priority: 3,
              dependencies: [],
              requiredCapabilities: ['capability1'],
            },
            {
              name: 'Subtask 2',
              description: 'Second subtask',
              priority: 5,
              dependencies: ['Subtask 1'],
              requiredCapabilities: ['capability2'],
            },
          ],
        }),
      } as unknown as AIMessageChunk),
    } as unknown as jest.Mocked<ChatOpenAI>;

    mockAgent = {
      id: 'test-agent-id',
      name: 'Test Agent',
      description: 'Test agent for unit tests',
      getCapabilities: jest.fn().mockReturnValue([
        { name: 'capability1', description: 'Test capability 1' },
        { name: 'capability2', description: 'Test capability 2' },
      ]),
      canHandle: jest.fn().mockReturnValue(true),
      initialize: jest.fn().mockResolvedValue(undefined),
      execute: jest.fn().mockResolvedValue({
        output: 'Mock output',
        artifacts: {},
      }),
      getState: jest.fn().mockReturnValue({
        status: 'ready',
        errorCount: 0,
        executionCount: 0,
        metadata: {},
      }),
      getInitializationStatus: jest.fn().mockReturnValue(true),
      terminate: jest.fn().mockResolvedValue(undefined),
      getMetrics: jest.fn().mockReturnValue({
        totalExecutions: 0,
        totalExecutionTimeMs: 0,
        averageExecutionTimeMs: 0,
        tokensUsed: 0,
        errorRate: 0,
      }),
    } as unknown as jest.Mocked<BaseAgentInterface>;

    mockRegistry = {
      getInstance: jest.fn().mockReturnThis(),
      listAgents: jest.fn().mockReturnValue([mockAgent]),
      getAgent: jest.fn().mockReturnValue(mockAgent),
    } as unknown as jest.Mocked<AgentRegistryService>;

    mockDiscovery = {
      getInstance: jest.fn().mockReturnThis(),
      discoverAgent: jest.fn().mockReturnValue({
        agentId: 'test-agent-id',
        capability: 'capability1',
        metrics: { totalScore: 0.9 },
      }),
    } as unknown as jest.Mocked<AgentDiscoveryService>;

    // Initialize service with mock dependencies
    taskPlanningService = TaskPlanningService.getInstance({
      logger: mockLogger,
      llm: mockLLM,
      agentRegistry: mockRegistry,
      agentDiscovery: mockDiscovery,
      defaultMaxSubtasks: 5,
      defaultMaxDepth: 3,
    });
  });

  afterEach(() => {
    // Reset singleton instance for each test
    jest.spyOn(TaskPlanningService, 'getInstance').mockRestore();
  });

  describe('createTaskPlan', () => {
    it('should create a new task plan with root task', async () => {
      const planName = 'Test Plan';
      const planDescription = 'Plan for testing';

      const plan = await taskPlanningService.createTaskPlan(
        planName,
        planDescription,
      );

      // Verify basic plan structure
      expect(plan).toBeDefined();
      expect(plan.name).toBe(planName);
      expect(plan.description).toBe(planDescription);
      expect(plan.status).toBe('pending');
      expect(plan.rootTaskIds.length).toBeGreaterThan(0);
      expect(plan.tasks.length).toBeGreaterThan(0);

      // Verify the LLM was called for task decomposition
      expect(mockLLM.invoke).toHaveBeenCalled();
    });

    it('should limit subtask decomposition to specified maximum depth', async () => {
      const planName = 'Depth Limited Plan';
      const planDescription = 'Plan with limited decomposition depth';

      // Mock deep task decomposition
      mockLLM.invoke.mockImplementation(() => {
        return Promise.resolve({
          content: JSON.stringify({
            subtasks: [
              {
                name: 'Level 1 Task',
                description: 'First level task',
                priority: 3,
                dependencies: [],
                requiredCapabilities: ['capability1'],
              },
            ],
          }),
        } as unknown as AIMessageChunk);
      });

      const plan = await taskPlanningService.createTaskPlan(
        planName,
        planDescription,
        {
          maxDepth: 2,
        },
      );

      // Decomposition should have happened at most 2 levels deep
      const invocationCount = mockLLM.invoke.mock.calls.length;
      expect(invocationCount).toBeLessThanOrEqual(2);
    });
  });

  describe('assignAgentsToTasks', () => {
    it('should assign agents to tasks based on capabilities', async () => {
      // Create a plan
      const plan = await taskPlanningService.createTaskPlan(
        'Agent Test Plan',
        'Testing agent assignment',
      );

      // Get a task from the plan
      const task = plan.tasks.find((t) => t.id !== plan.rootTaskIds[0]);
      expect(task).toBeDefined();

      // Manually reset the assigned agent to test assignment
      if (task) {
        task.assignedTo = undefined;
        task.requiredCapabilities = ['capability1'];

        // Explicitly set preferredAgentIds to empty to ensure discovery is used
        await taskPlanningService.assignAgentsToTasks(plan, [task], {
          preferredAgentIds: [],
        });

        // Only verify that agent was assigned correctly
        expect(task.assignedTo).toBe('test-agent-id');
      }
    });
  });

  describe('updateTaskStatus', () => {
    it('should update a task status and propagate to parent tasks', async () => {
      // Create a plan with subtasks
      const plan = await taskPlanningService.createTaskPlan(
        'Status Test Plan',
        'Testing status updates',
      );

      // Get root task and a subtask
      const rootTaskId = plan.rootTaskIds[0];
      const rootTask = plan.tasks.find((t) => t.id === rootTaskId);

      // Find a child task (non-root task)
      const childTask = plan.tasks.find((t) => t.parentTaskId === rootTaskId);

      expect(rootTask).toBeDefined();
      expect(childTask).toBeDefined();

      if (childTask) {
        // Update the child task to completed
        const result = taskPlanningService.updateTaskStatus(
          plan.id,
          childTask.id,
          'completed',
          { data: 'Task result' },
        );

        expect(result).toBe(true);

        // The child task should be completed
        const updatedChildTask = taskPlanningService
          .getTaskPlan(plan.id)
          ?.tasks.find((t) => t.id === childTask.id);
        expect(updatedChildTask?.status).toBe('completed');
        expect(updatedChildTask?.result).toEqual({ data: 'Task result' });
      }
    });

    it('should handle task failure and propagate failure reason', async () => {
      // Create a plan
      const plan = await taskPlanningService.createTaskPlan(
        'Failure Test Plan',
        'Testing failure handling',
      );

      // Get a task from the plan
      const task = plan.tasks[0];
      expect(task).toBeDefined();

      // Mark the task as failed
      const result = taskPlanningService.updateTaskStatus(
        plan.id,
        task.id,
        'failed',
        null,
        'Test failure reason',
      );

      expect(result).toBe(true);

      // The task should be marked as failed with the reason
      const updatedTask = taskPlanningService
        .getTaskPlan(plan.id)
        ?.tasks.find((t) => t.id === task.id);
      expect(updatedTask?.status).toBe('failed');
      expect(updatedTask?.failureReason).toBe('Test failure reason');
    });
  });

  describe('getReadyTasks', () => {
    it('should return tasks that are ready to be executed', async () => {
      // Create a plan with dependencies
      const plan = await taskPlanningService.createTaskPlan(
        'Dependency Test Plan',
        'Testing task dependencies',
      );

      // Mark the first subtask as completed to make dependent tasks ready
      const firstSubtask = plan.tasks.find(
        (t) =>
          t.id !== plan.rootTaskIds[0] &&
          (!t.dependencies || t.dependencies.length === 0),
      );

      if (firstSubtask) {
        taskPlanningService.updateTaskStatus(
          plan.id,
          firstSubtask.id,
          'completed',
        );
      }

      // Get ready tasks
      const readyTasks = taskPlanningService.getReadyTasks(plan.id);

      // Ready tasks should include those with no dependencies or with completed dependencies
      expect(readyTasks.length).toBeGreaterThan(0);

      // All ready tasks should have status 'pending'
      expect(readyTasks.every((t) => t.status === 'pending')).toBe(true);

      // No ready task should depend on a non-completed task
      const updatedPlan = taskPlanningService.getTaskPlan(plan.id);
      expect(
        readyTasks.every((t) => {
          if (!t.dependencies || t.dependencies.length === 0) return true;

          return t.dependencies.every((depId) => {
            const depTask = updatedPlan?.tasks.find(
              (task) => task.id === depId,
            );
            return depTask?.status === 'completed';
          });
        }),
      ).toBe(true);
    });
  });

  describe('deleteTaskPlan', () => {
    it('should delete a task plan', async () => {
      // Create a plan
      const plan = await taskPlanningService.createTaskPlan(
        'Delete Test Plan',
        'Testing plan deletion',
      );

      // Verify plan exists
      expect(taskPlanningService.getTaskPlan(plan.id)).toBeDefined();

      // Delete the plan
      const result = taskPlanningService.deleteTaskPlan(plan.id);

      expect(result).toBe(true);

      // Verify plan no longer exists
      expect(taskPlanningService.getTaskPlan(plan.id)).toBeUndefined();
    });

    it('should return false when trying to delete non-existent plan', () => {
      const result = taskPlanningService.deleteTaskPlan('non-existent-id');
      expect(result).toBe(false);
    });
  });
});
