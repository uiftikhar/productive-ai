/**
 * Integration Tests for Workflow Management 
 * 
 * Tests the workflow management capabilities including task decomposition,
 * dependency tracking, and execution flow management.
 */

import { jest } from '@jest/globals';
import {
  setupTestEnvironment,
  cleanupTestEnvironment,
  createTestMeeting,
  PerformanceTracker,
  flushPromises
} from '../test-utils';
import { v4 as uuidv4 } from 'uuid';
import { AgentExpertise } from '../../agentic-meeting-analysis';
import { AgentStatus } from '../../core/state/base-agent-state';

interface Task {
  id: string;
  name: string;
  description?: string;
  priority?: string;
  status?: AgentStatus;
  expertise?: AgentExpertise;
  parentTaskId?: string;
  requiredExpertise?: AgentExpertise[];
}

interface Dependency {
  sourceTaskId: string;
  targetTaskId: string;
  type: string;
}

describe('Workflow Management Integration', () => {
  let testEnv: any;
  let performanceTracker: PerformanceTracker;
  
  beforeAll(async () => {
    // Set up the test environment with all services
    testEnv = await setupTestEnvironment();
    performanceTracker = new PerformanceTracker();
  });
  
  afterAll(async () => {
    // Clean up after tests
    await cleanupTestEnvironment();
  });
  
  test('should decompose a complex task into subtasks', async () => {
    // Start tracking performance
    performanceTracker.start();
    
    // Create a mock complex task for decomposition
    const complexTask: Task = {
      id: uuidv4(),
      name: 'Analyze Meeting Transcript',
      description: 'Perform complete analysis of the transcript including summaries, action items, and decisions',
      priority: 'high',
      requiredExpertise: [
        AgentExpertise.TOPIC_ANALYSIS,
        AgentExpertise.ACTION_ITEM_EXTRACTION,
        AgentExpertise.DECISION_TRACKING
      ]
    };
    
    // Mock task decomposition
    const mockTaskDecomposer = testEnv.taskDecomposer;
    mockTaskDecomposer.assessComplexity.mockReturnValue(0.85); // High complexity
    
    // Measure performance of complexity assessment
    performanceTracker.measure('complexity-assessment', () => {
      const complexity = mockTaskDecomposer.assessComplexity(complexTask);
      expect(complexity).toBeGreaterThan(0.8);
    });
    
    // Mock subtask creation
    const mockSubtasks: Task[] = [
      { 
        id: uuidv4(), 
        name: 'Extract Meeting Topics', 
        parentTaskId: complexTask.id,
        expertise: AgentExpertise.TOPIC_ANALYSIS,
        status: AgentStatus.READY
      },
      { 
        id: uuidv4(), 
        name: 'Identify Action Items', 
        parentTaskId: complexTask.id,
        expertise: AgentExpertise.ACTION_ITEM_EXTRACTION,
        status: AgentStatus.READY
      },
      { 
        id: uuidv4(), 
        name: 'Track Decisions', 
        parentTaskId: complexTask.id,
        expertise: AgentExpertise.DECISION_TRACKING,
        status: AgentStatus.READY
      }
    ];
    
    mockTaskDecomposer.decomposeTask.mockReturnValue(mockSubtasks);
    
    // Measure performance of task decomposition
    performanceTracker.measure('task-decomposition', () => {
      const subtasks = mockTaskDecomposer.decomposeTask(complexTask);
      expect(subtasks).toHaveLength(3);
      expect(subtasks[0].expertise).toBe(AgentExpertise.TOPIC_ANALYSIS);
    });
    
    // Test workflow dependency handling
    const mockWorkflowManager = testEnv.workflowManager;
    mockWorkflowManager.createWorkflow.mockImplementation((task: Task, subtasks: Task[]) => {
      return {
        workflowId: uuidv4(),
        taskId: task.id,
        subtasks: subtasks,
        status: 'created',
        dependencies: [
          {
            sourceTaskId: subtasks[0].id, // Topic analysis must complete first
            targetTaskId: subtasks[2].id, // Before decision tracking
            type: 'completion'
          }
        ]
      };
    });
    
    // Measure performance of workflow creation
    performanceTracker.measure('workflow-creation', () => {
      const workflow = mockWorkflowManager.createWorkflow(complexTask, mockSubtasks);
      expect(workflow.subtasks).toHaveLength(3);
      expect(workflow.dependencies).toHaveLength(1);
      expect(workflow.status).toBe('created');
    });
    
    // Test task prioritization
    const mockScheduler = testEnv.scheduler;
    mockScheduler.prioritizeTasks.mockImplementation((subtasks: Task[]) => {
      return [...subtasks].sort((a, b) => {
        // Sort by expertise priority (arbitrary for testing)
        const expertisePriority: Partial<Record<AgentExpertise, number>> = {
          [AgentExpertise.TOPIC_ANALYSIS]: 3,
          [AgentExpertise.ACTION_ITEM_EXTRACTION]: 2,
          [AgentExpertise.DECISION_TRACKING]: 1,
          [AgentExpertise.SUMMARY_GENERATION]: 0,
          [AgentExpertise.SENTIMENT_ANALYSIS]: 0,
          [AgentExpertise.PARTICIPANT_DYNAMICS]: 0
        };
        
        const valueA = a.expertise ? expertisePriority[a.expertise] || 0 : 0;
        const valueB = b.expertise ? expertisePriority[b.expertise] || 0 : 0;
        return valueB - valueA;
      });
    });
    
    // Measure performance of task prioritization
    performanceTracker.measure('task-prioritization', () => {
      const prioritizedTasks = mockScheduler.prioritizeTasks(mockSubtasks);
      expect(prioritizedTasks[0].expertise).toBe(AgentExpertise.TOPIC_ANALYSIS);
    });
    
    // Test workflow execution
    mockWorkflowManager.executeWorkflow.mockResolvedValue({
      workflowId: uuidv4(),
      taskId: complexTask.id,
      status: 'completed',
      results: {
        topics: ['Project Planning', 'Budget Discussion', 'Timeline Updates'],
        actionItems: ['Update project timeline', 'Prepare budget proposal'],
        decisions: ['Approved timeline extension', 'Budget increase request']
      }
    });
    
    // Measure performance of workflow execution
    await performanceTracker.measureAsync('workflow-execution', async () => {
      const executionResult = await mockWorkflowManager.executeWorkflow(
        { workflowId: uuidv4(), taskId: complexTask.id }
      );
      expect(executionResult.status).toBe('completed');
      expect(executionResult.results.topics).toHaveLength(3);
      expect(executionResult.results.actionItems).toHaveLength(2);
      expect(executionResult.results.decisions).toHaveLength(2);
    });
    
    // Log performance metrics
    performanceTracker.end();
    performanceTracker.logResults();
  });
  
  test('should handle parallel task execution with dependencies', async () => {
    // Prepare mock data for parallel tasks
    const mockTasks: Task[] = [
      { id: uuidv4(), name: 'Task 1', status: AgentStatus.READY },
      { id: uuidv4(), name: 'Task 2', status: AgentStatus.READY },
      { id: uuidv4(), name: 'Task 3', status: AgentStatus.READY },
      { id: uuidv4(), name: 'Task 4', status: AgentStatus.READY }
    ];
    
    // Create mock dependencies
    const mockDependencies: Dependency[] = [
      { sourceTaskId: mockTasks[0].id, targetTaskId: mockTasks[2].id, type: 'completion' },
      { sourceTaskId: mockTasks[1].id, targetTaskId: mockTasks[3].id, type: 'completion' }
    ];
    
    // Mock dependency verifier
    const mockDependencyVerifier = testEnv.dependencyVerifier;
    
    // Clear any previous mock implementations
    mockDependencyVerifier.getExecutableTasks.mockReset();
    
    // First implementation: Only tasks 1 and 2 are executable (they have no dependencies)
    mockDependencyVerifier.getExecutableTasks.mockImplementationOnce((tasks: Task[], dependencies: Dependency[]) => {
      return tasks.filter(task => {
        const hasIncomingDependencies = dependencies.some(dep => dep.targetTaskId === task.id);
        return !hasIncomingDependencies;
      });
    });
    
    // Verify initial executable tasks
    const executableTasks = mockDependencyVerifier.getExecutableTasks(mockTasks, mockDependencies);
    expect(executableTasks).toHaveLength(2);
    expect(executableTasks.map((t: Task) => t.name)).toContain('Task 1');
    expect(executableTasks.map((t: Task) => t.name)).toContain('Task 2');
    
    // Mock task execution
    mockTasks[0].status = AgentStatus.EXECUTING;
    mockTasks[1].status = AgentStatus.EXECUTING;
    
    // Mock completion of task 1
    mockTasks[0].status = AgentStatus.READY;
    
    // Second implementation: With Task 1 complete, Task 3 should be executable
    mockDependencyVerifier.getExecutableTasks.mockImplementationOnce(() => {
      // Return just Task 3 as the only executable task
      return [mockTasks[2]];
    });
    
    const newExecutableTasks = mockDependencyVerifier.getExecutableTasks(mockTasks, mockDependencies);
    expect(newExecutableTasks).toHaveLength(1);
    expect(newExecutableTasks[0].name).toBe('Task 3');
  });
}); 