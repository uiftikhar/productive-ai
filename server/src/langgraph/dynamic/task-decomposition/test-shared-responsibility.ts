// Sample test script for the SharedResponsibilityService
import { v4 as uuidv4 } from 'uuid';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { SharedResponsibilityService } from './shared-responsibility.service';
import { CollaborativeTaskDefinitionService } from './collaborative-task-definition.service';
import { ResponsibilityType } from './interfaces/peer-task.interface';
import { TaskPriority, TaskStatus } from './interfaces/hierarchical-task.interface';
import { ComplexityLevel } from './interfaces/task-analysis.interface';

// Mock implementations for testing
class MockHierarchicalTaskService {
  private tasks = new Map<string, any>();

  async createTask(details: any): Promise<any> {
    const taskId = uuidv4();
    const task = {
      id: taskId,
      ...details,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: TaskStatus.DRAFT,
      childTaskIds: [],
    };
    this.tasks.set(taskId, task);
    return task;
  }

  async getTask(taskId: string): Promise<any> {
    return this.tasks.get(taskId) || null;
  }

  async updateTask(taskId: string, updates: any): Promise<any> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    const updatedTask = {
      ...task,
      ...updates,
      updatedAt: Date.now(),
    };
    
    this.tasks.set(taskId, updatedTask);
    return updatedTask;
  }
}

// Mock collaborative task service for testing
class MockCollaborativeTaskService {
  constructor(private hierarchicalTaskService: MockHierarchicalTaskService) {}
  
  // Add any methods needed for testing
}

// Main test function
async function testSharedResponsibilityService() {
  const logger = new ConsoleLogger();
  logger.info('Starting SharedResponsibilityService test');

  // Create mock services
  const mockHierarchicalTaskService = new MockHierarchicalTaskService();
  const mockCollaborativeTaskService = new MockCollaborativeTaskService(mockHierarchicalTaskService);

  // Create the SharedResponsibilityService
  const sharedResponsibilityService = new SharedResponsibilityService(
    mockCollaborativeTaskService as unknown as CollaborativeTaskDefinitionService,
    mockHierarchicalTaskService as any,
    { logger }
  );

  try {
    // Step 1: Create a test task
    logger.info('1. Creating a test task...');
    const task = await mockHierarchicalTaskService.createTask({
      name: 'Implement Shared Responsibility Feature',
      description: 'Create a service for managing shared responsibilities in peer tasks',
      priority: TaskPriority.HIGH,
      complexity: ComplexityLevel.MODERATE,
    });
    logger.info(`Created task: ${task.id}`);

    // Step 2: Assign responsibilities to different agents
    logger.info('2. Assigning responsibilities...');
    
    // Primary implementer
    const primaryResp = await sharedResponsibilityService.assignResponsibility(
      task.id,
      'agent-1',
      ResponsibilityType.PRIMARY,
      'Implement core functionality'
    );
    logger.info(`Assigned PRIMARY responsibility: ${primaryResp.id}`);
    
    // Secondary implementer
    const secondaryResp = await sharedResponsibilityService.assignResponsibility(
      task.id,
      'agent-2',
      ResponsibilityType.SECONDARY,
      'Implement helper methods and tests'
    );
    logger.info(`Assigned SECONDARY responsibility: ${secondaryResp.id}`);
    
    // Reviewer
    const reviewerResp = await sharedResponsibilityService.assignResponsibility(
      task.id,
      'agent-3',
      ResponsibilityType.REVIEWER,
      'Review implementation and provide feedback'
    );
    logger.info(`Assigned REVIEWER responsibility: ${reviewerResp.id}`);

    // Step 3: Accept responsibilities
    logger.info('3. Accepting responsibilities...');
    await sharedResponsibilityService.acceptResponsibility(primaryResp.id);
    await sharedResponsibilityService.acceptResponsibility(secondaryResp.id);
    await sharedResponsibilityService.acceptResponsibility(reviewerResp.id);
    
    // Step 4: Record contributions
    logger.info('4. Recording contributions...');
    
    // Primary agent contributions
    const contrib1 = await sharedResponsibilityService.recordContribution(
      task.id,
      'agent-1',
      primaryResp.id,
      'code',
      'Implemented core service methods',
      { timeSpent: 7200000, linesOfCode: 250 }
    );
    logger.info(`Recorded contribution: ${contrib1.id}`);
    
    // Secondary agent contributions
    const contrib2 = await sharedResponsibilityService.recordContribution(
      task.id,
      'agent-2',
      secondaryResp.id,
      'testing',
      'Created unit tests for the service',
      { timeSpent: 3600000, linesOfCode: 120 }
    );
    logger.info(`Recorded contribution: ${contrib2.id}`);
    
    // Step 5: Review contributions
    logger.info('5. Reviewing contributions...');
    const reviewedContrib = await sharedResponsibilityService.reviewContribution(
      contrib1.id,
      'agent-3',
      'approved'
    );
    logger.info(`Reviewed contribution: ${reviewedContrib.id}, status: ${reviewedContrib.reviewStatus}`);
    
    // Step 6: Complete responsibilities
    logger.info('6. Completing responsibilities...');
    await sharedResponsibilityService.completeResponsibility(primaryResp.id);
    await sharedResponsibilityService.completeResponsibility(secondaryResp.id);
    
    // Step 7: Get contribution summaries
    logger.info('7. Getting contribution summaries...');
    const agent1Summary = await sharedResponsibilityService.getAgentContributionSummary(task.id, 'agent-1');
    logger.info('Agent 1 contribution summary:', agent1Summary);
    
    // Step 8: Get task progress
    logger.info('8. Getting task responsibility progress...');
    const progress = await sharedResponsibilityService.getTaskResponsibilityProgress(task.id);
    logger.info('Task responsibility progress:', progress);
    
    // Step 9: Complete the last responsibility and check if task is marked complete
    logger.info('9. Completing last responsibility...');
    await sharedResponsibilityService.completeResponsibility(reviewerResp.id);
    
    // Step 10: Get updated task to verify it's completed
    logger.info('10. Checking task status...');
    const updatedTask = await mockHierarchicalTaskService.getTask(task.id);
    logger.info(`Task status: ${updatedTask.status}`);
    
    // Step 11: Auto-distribute responsibilities for a new task
    logger.info('11. Testing auto-distribution of responsibilities...');
    const newTask = await mockHierarchicalTaskService.createTask({
      name: 'New Collaborative Task',
      description: 'Testing auto-distribution of responsibilities',
      priority: TaskPriority.MEDIUM,
      complexity: ComplexityLevel.SIMPLE, // Using SIMPLE instead of LOW
    });
    
    const agents = ['agent-4', 'agent-5', 'agent-6', 'agent-7'];
    const autoAssignments = await sharedResponsibilityService.autoDistributeResponsibilities(
      newTask.id,
      agents,
      'balanced'
    );
    
    logger.info(`Auto-assigned ${autoAssignments.length} responsibilities`);
    for (const assignment of autoAssignments) {
      logger.info(`- ${assignment.agentId}: ${assignment.type} (${assignment.percentage}%)`);
    }
    
    logger.info('SharedResponsibilityService test completed successfully!');
  } catch (error) {
    logger.error('Error in test:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

// Run the test
testSharedResponsibilityService().catch(console.error); 