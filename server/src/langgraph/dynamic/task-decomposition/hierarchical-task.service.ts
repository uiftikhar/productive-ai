import { v4 as uuidv4 } from 'uuid';

import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

import {
  HierarchicalTask,
  TaskHierarchyManager,
  TaskMilestone,
  TaskPriority,
  TaskStatus,
  ParentChildRelationship,
  SubtaskAssignment,
  createHierarchicalTask,
} from './interfaces/hierarchical-task.interface';

/**
 * Service configuration
 */
export interface HierarchicalTaskConfig {
  logger?: Logger;
  persistence?: TaskHierarchyPersistence;
}

/**
 * Interface for task hierarchy persistence
 */
export interface TaskHierarchyPersistence {
  saveTask(task: HierarchicalTask): Promise<boolean>;
  loadTask(taskId: string): Promise<HierarchicalTask | null>;
  deleteTask(taskId: string): Promise<boolean>;
  saveMilestone(milestone: TaskMilestone): Promise<boolean>;
  loadMilestone(milestoneId: string): Promise<TaskMilestone | null>;
  saveAssignment(assignment: SubtaskAssignment): Promise<boolean>;
  loadAssignments(parentTaskId: string): Promise<SubtaskAssignment[]>;
}

/**
 * In-memory persistence implementation
 */
class InMemoryPersistence implements TaskHierarchyPersistence {
  private tasks: Map<string, HierarchicalTask> = new Map();
  private milestones: Map<string, TaskMilestone> = new Map();
  private assignments: Map<string, SubtaskAssignment> = new Map();

  async saveTask(task: HierarchicalTask): Promise<boolean> {
    this.tasks.set(task.id, task);
    return true;
  }

  async loadTask(taskId: string): Promise<HierarchicalTask | null> {
    return this.tasks.get(taskId) || null;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    return this.tasks.delete(taskId);
  }

  async saveMilestone(milestone: TaskMilestone): Promise<boolean> {
    this.milestones.set(milestone.id, milestone);
    return true;
  }

  async loadMilestone(milestoneId: string): Promise<TaskMilestone | null> {
    return this.milestones.get(milestoneId) || null;
  }

  async saveAssignment(assignment: SubtaskAssignment): Promise<boolean> {
    this.assignments.set(assignment.id, assignment);
    return true;
  }

  async loadAssignments(parentTaskId: string): Promise<SubtaskAssignment[]> {
    return Array.from(this.assignments.values())
      .filter(assignment => assignment.parentTaskId === parentTaskId);
  }
}

/**
 * Service for managing hierarchical tasks with parent-child relationships
 */
export class HierarchicalTaskService implements TaskHierarchyManager {
  private static instance: HierarchicalTaskService;
  private logger: Logger;
  private persistence: TaskHierarchyPersistence;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: HierarchicalTaskConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.persistence = config.persistence || new InMemoryPersistence();

    this.logger.info('HierarchicalTaskService initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(config: HierarchicalTaskConfig = {}): HierarchicalTaskService {
    if (!HierarchicalTaskService.instance) {
      HierarchicalTaskService.instance = new HierarchicalTaskService(config);
    }
    return HierarchicalTaskService.instance;
  }

  /**
   * Create a new task
   */
  public async createTask(
    details: Omit<HierarchicalTask, 'id' | 'childTaskIds' | 'createdAt' | 'updatedAt' | 'progress'>,
  ): Promise<HierarchicalTask> {
    const task: HierarchicalTask = {
      id: uuidv4(),
      ...details,
      childTaskIds: [],
      progress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Validate minimal required fields
    if (!task.name || !task.description) {
      throw new Error('Task requires at least a name and description');
    }

    try {
      await this.persistence.saveTask(task);
      
      // If this is a child task, update the parent
      if (task.parentTaskId) {
        const parentTask = await this.getTask(task.parentTaskId);
        if (parentTask) {
          parentTask.childTaskIds.push(task.id);
          parentTask.updatedAt = Date.now();
          await this.persistence.saveTask(parentTask);
        }
      }

      this.logger.info(`Created task: ${task.id} - ${task.name}`);
      return task;
    } catch (error) {
      this.logger.error(`Error creating task: ${error}`);
      throw error;
    }
  }

  /**
   * Get a task by ID
   */
  public async getTask(taskId: string): Promise<HierarchicalTask | null> {
    return this.persistence.loadTask(taskId);
  }

  /**
   * Update a task
   */
  public async updateTask(
    taskId: string,
    updates: Partial<HierarchicalTask>,
  ): Promise<HierarchicalTask> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Don't allow updating certain fields
    const { id, createdAt, ...allowedUpdates } = updates as any;

    const updatedTask: HierarchicalTask = {
      ...task,
      ...allowedUpdates,
      updatedAt: Date.now(),
    };

    // Update progress based on completed status
    if (updatedTask.status === TaskStatus.COMPLETED && !task.completedAt) {
      updatedTask.completedAt = Date.now();
      updatedTask.progress = 100;
    }

    await this.persistence.saveTask(updatedTask);
    this.logger.info(`Updated task: ${updatedTask.id} - ${updatedTask.name}`);

    // Update parent task progress if this is a child task
    if (updatedTask.parentTaskId) {
      await this.updateParentProgress(updatedTask.parentTaskId);
    }

    return updatedTask;
  }

  /**
   * Delete a task and optionally its children
   */
  public async deleteTask(taskId: string, deleteChildren = false): Promise<boolean> {
    const task = await this.getTask(taskId);
    if (!task) {
      return false;
    }

    // Delete children if requested
    if (deleteChildren && task.childTaskIds.length > 0) {
      for (const childId of task.childTaskIds) {
        await this.deleteTask(childId, true);
      }
    } else if (task.childTaskIds.length > 0) {
      // Otherwise, update children to remove parent reference
      for (const childId of task.childTaskIds) {
        const childTask = await this.getTask(childId);
        if (childTask) {
          childTask.parentTaskId = undefined;
          await this.persistence.saveTask(childTask);
        }
      }
    }

    // Remove reference from parent
    if (task.parentTaskId) {
      const parentTask = await this.getTask(task.parentTaskId);
      if (parentTask) {
        parentTask.childTaskIds = parentTask.childTaskIds.filter(id => id !== taskId);
        await this.persistence.saveTask(parentTask);
        await this.updateParentProgress(parentTask.id);
      }
    }

    return this.persistence.deleteTask(taskId);
  }

  /**
   * Add a child task to a parent task
   */
  public async addChildTask(
    parentTaskId: string,
    childTaskDetails: Omit<HierarchicalTask, 'id' | 'parentTaskId' | 'childTaskIds' | 'createdAt' | 'updatedAt' | 'progress'>,
    relationshipType: ParentChildRelationship,
  ): Promise<SubtaskAssignment> {
    const parentTask = await this.getTask(parentTaskId);
    if (!parentTask) {
      throw new Error(`Parent task not found: ${parentTaskId}`);
    }

    // Create the child task
    const childTask = await this.createTask({
      ...childTaskDetails,
      parentTaskId,
    });

    // Create the assignment
    const assignment: SubtaskAssignment = {
      id: uuidv4(),
      parentTaskId,
      childTaskId: childTask.id,
      relationshipType,
      assignedAt: Date.now(),
      status: 'pending',
      priority: childTask.priority,
      metadata: {},
    };

    await this.persistence.saveAssignment(assignment);
    this.logger.info(`Added child task ${childTask.id} to parent ${parentTaskId}`);

    return assignment;
  }

  /**
   * Remove a child task from a parent task
   */
  public async removeChildTask(parentTaskId: string, childTaskId: string): Promise<boolean> {
    const parentTask = await this.getTask(parentTaskId);
    const childTask = await this.getTask(childTaskId);

    if (!parentTask || !childTask) {
      return false;
    }

    // Check if the child is actually a child of the parent
    if (!parentTask.childTaskIds.includes(childTaskId) || childTask.parentTaskId !== parentTaskId) {
      return false;
    }

    // Update the parent
    parentTask.childTaskIds = parentTask.childTaskIds.filter(id => id !== childTaskId);
    parentTask.updatedAt = Date.now();
    await this.persistence.saveTask(parentTask);

    // Update the child
    childTask.parentTaskId = undefined;
    childTask.updatedAt = Date.now();
    await this.persistence.saveTask(childTask);

    // Update parent progress
    await this.updateParentProgress(parentTaskId);

    return true;
  }

  /**
   * Get all child tasks for a parent task
   */
  public async getChildTasks(parentTaskId: string): Promise<HierarchicalTask[]> {
    const parentTask = await this.getTask(parentTaskId);
    if (!parentTask || !parentTask.childTaskIds.length) {
      return [];
    }

    const childTasks: HierarchicalTask[] = [];
    for (const childId of parentTask.childTaskIds) {
      const childTask = await this.getTask(childId);
      if (childTask) {
        childTasks.push(childTask);
      }
    }

    return childTasks;
  }

  /**
   * Get the parent task for a child task
   */
  public async getParentTask(childTaskId: string): Promise<HierarchicalTask | null> {
    const childTask = await this.getTask(childTaskId);
    if (!childTask || !childTask.parentTaskId) {
      return null;
    }

    return this.getTask(childTask.parentTaskId);
  }

  /**
   * Get the full hierarchy of tasks starting from a root task
   */
  public async getTaskHierarchy(rootTaskId: string): Promise<HierarchicalTask[]> {
    const rootTask = await this.getTask(rootTaskId);
    if (!rootTask) {
      return [];
    }

    const hierarchy: HierarchicalTask[] = [rootTask];
    
    // Recursively get all descendant tasks
    const getDescendants = async (taskId: string): Promise<void> => {
      const task = await this.getTask(taskId);
      if (task && task.childTaskIds.length > 0) {
        for (const childId of task.childTaskIds) {
          const childTask = await this.getTask(childId);
          if (childTask) {
            hierarchy.push(childTask);
            await getDescendants(childId);
          }
        }
      }
    };

    await getDescendants(rootTaskId);
    return hierarchy;
  }

  /**
   * Add a milestone to a task
   */
  public async addMilestone(
    taskId: string,
    milestoneDetails: Omit<TaskMilestone, 'id' | 'taskId'>,
  ): Promise<TaskMilestone> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const milestone: TaskMilestone = {
      id: uuidv4(),
      taskId,
      ...milestoneDetails,
    };

    await this.persistence.saveMilestone(milestone);
    
    // Update the task
    task.milestones.push(milestone);
    task.updatedAt = Date.now();
    await this.persistence.saveTask(task);

    this.logger.info(`Added milestone ${milestone.id} to task ${taskId}`);
    return milestone;
  }

  /**
   * Update a milestone
   */
  public async updateMilestone(
    milestoneId: string,
    updates: Partial<TaskMilestone>,
  ): Promise<TaskMilestone> {
    const milestone = await this.persistence.loadMilestone(milestoneId);
    if (!milestone) {
      throw new Error(`Milestone not found: ${milestoneId}`);
    }

    // Don't allow updating certain fields
    const { id, taskId, ...allowedUpdates } = updates as any;

    const updatedMilestone: TaskMilestone = {
      ...milestone,
      ...allowedUpdates,
    };

    await this.persistence.saveMilestone(updatedMilestone);
    
    // Update the task's milestones array
    const task = await this.getTask(milestone.taskId);
    if (task) {
      const milestoneIndex = task.milestones.findIndex(m => m.id === milestoneId);
      if (milestoneIndex >= 0) {
        task.milestones[milestoneIndex] = updatedMilestone;
        task.updatedAt = Date.now();
        await this.persistence.saveTask(task);
      }
    }

    return updatedMilestone;
  }

  /**
   * Get all milestones for a task
   */
  public async getMilestones(taskId: string): Promise<TaskMilestone[]> {
    const task = await this.getTask(taskId);
    if (!task) {
      return [];
    }
    return task.milestones;
  }

  /**
   * Mark a milestone as achieved
   */
  public async achieveMilestone(milestoneId: string): Promise<TaskMilestone> {
    const milestone = await this.persistence.loadMilestone(milestoneId);
    if (!milestone) {
      throw new Error(`Milestone not found: ${milestoneId}`);
    }

    const updatedMilestone: TaskMilestone = {
      ...milestone,
      status: 'achieved',
      achievedAt: Date.now(),
      progress: 100,
    };

    await this.persistence.saveMilestone(updatedMilestone);
    
    // Update the task's milestones array and recalculate progress
    const task = await this.getTask(milestone.taskId);
    if (task) {
      const milestoneIndex = task.milestones.findIndex(m => m.id === milestoneId);
      if (milestoneIndex >= 0) {
        task.milestones[milestoneIndex] = updatedMilestone;
        task.updatedAt = Date.now();
        
        // Recalculate task progress based on milestones
        if (task.milestones.length > 0) {
          const totalProgress = task.milestones.reduce((sum, m) => sum + m.progress, 0);
          task.progress = Math.min(Math.round(totalProgress / task.milestones.length), 100);
        }
        
        await this.persistence.saveTask(task);
        
        // Update parent progress
        if (task.parentTaskId) {
          await this.updateParentProgress(task.parentTaskId);
        }
      }
    }

    return updatedMilestone;
  }

  /**
   * Assign a task to an agent
   */
  public async assignTask(taskId: string, agentId: string): Promise<HierarchicalTask> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updatedTask: HierarchicalTask = {
      ...task,
      assignedAgentId: agentId,
      updatedAt: Date.now(),
    };

    await this.persistence.saveTask(updatedTask);
    this.logger.info(`Assigned task ${taskId} to agent ${agentId}`);

    return updatedTask;
  }

  /**
   * Reassign a task to a different agent
   */
  public async reassignTask(taskId: string, newAgentId: string): Promise<HierarchicalTask> {
    return this.assignTask(taskId, newAgentId);
  }

  /**
   * Delegate subtasks to different agents
   */
  public async delegateSubtasks(
    parentTaskId: string,
    assignments: Array<{childTaskId: string, agentId: string}>,
  ): Promise<SubtaskAssignment[]> {
    const parentTask = await this.getTask(parentTaskId);
    if (!parentTask) {
      throw new Error(`Parent task not found: ${parentTaskId}`);
    }

    const results: SubtaskAssignment[] = [];

    // Get existing assignments
    const existingAssignments = await this.persistence.loadAssignments(parentTaskId);
    
    for (const { childTaskId, agentId } of assignments) {
      // Check if the child task exists and is a child of the parent
      if (!parentTask.childTaskIds.includes(childTaskId)) {
        this.logger.warn(`Task ${childTaskId} is not a child of ${parentTaskId}`);
        continue;
      }

      const childTask = await this.getTask(childTaskId);
      if (!childTask) {
        this.logger.warn(`Child task ${childTaskId} not found`);
        continue;
      }

      // Update the child task with the agent assignment
      childTask.assignedAgentId = agentId;
      childTask.updatedAt = Date.now();
      await this.persistence.saveTask(childTask);

      // Find or create assignment
      let assignment = existingAssignments.find(a => a.childTaskId === childTaskId);
      
      if (assignment) {
        // Update existing assignment
        assignment = {
          ...assignment,
          assignedAgentId: agentId,
          status: 'pending',
        };
      } else {
        // Create new assignment
        assignment = {
          id: uuidv4(),
          parentTaskId,
          childTaskId,
          assignedAgentId: agentId,
          relationshipType: ParentChildRelationship.DECOMPOSITION, // Default
          assignedAt: Date.now(),
          status: 'pending',
          priority: childTask.priority,
          metadata: {},
        };
      }

      await this.persistence.saveAssignment(assignment);
      results.push(assignment);
    }

    return results;
  }

  /**
   * Update progress of a parent task based on child task progress
   */
  private async updateParentProgress(parentTaskId: string): Promise<void> {
    const parentTask = await this.getTask(parentTaskId);
    if (!parentTask) {
      return;
    }

    if (parentTask.childTaskIds.length === 0) {
      return;
    }

    // Calculate progress based on child tasks
    let totalProgress = 0;
    let completedTasks = 0;

    for (const childId of parentTask.childTaskIds) {
      const childTask = await this.getTask(childId);
      if (childTask) {
        totalProgress += childTask.progress;
        if (childTask.status === TaskStatus.COMPLETED) {
          completedTasks++;
        }
      }
    }

    // Update parent task progress
    const newProgress = Math.min(Math.round(totalProgress / parentTask.childTaskIds.length), 100);
    parentTask.progress = newProgress;
    
    // Update parent task status if all children are complete
    if (completedTasks === parentTask.childTaskIds.length && completedTasks > 0) {
      parentTask.status = TaskStatus.COMPLETED;
      parentTask.completedAt = Date.now();
    }

    parentTask.updatedAt = Date.now();
    await this.persistence.saveTask(parentTask);

    // Recursively update grandparent if exists
    if (parentTask.parentTaskId) {
      await this.updateParentProgress(parentTask.parentTaskId);
    }
  }
} 