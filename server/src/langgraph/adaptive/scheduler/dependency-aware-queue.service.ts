import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  DependencyAwareQueue,
  SchedulableTask,
  TaskDependency,
  TaskScheduleStatus,
} from '../interfaces/scheduler.interface';

/**
 * Dependency graph node for topological sorting
 */
interface DependencyNode {
  taskId: string;
  dependsOn: Set<string>; // Tasks this node depends on
  dependedBy: Set<string>; // Tasks that depend on this node
  visited?: boolean; // For graph traversal
  inPath?: boolean; // For cycle detection
}

/**
 * Implementation of a queue that's aware of task dependencies
 */
export class DependencyAwareQueueService implements DependencyAwareQueue {
  private tasks: Map<string, SchedulableTask> = new Map();
  private logger: Logger;
  private dependencyGraph: Map<string, DependencyNode> = new Map();
  private executionResults: Map<string, any> = new Map();
  private lastOptimizedOrder: string[] = [];

  constructor(options: { logger?: Logger } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.logger.info('Dependency-aware queue service initialized');
  }

  /**
   * Add a task to the queue
   */
  enqueue(task: SchedulableTask): void {
    // Add or update task in the map
    this.tasks.set(task.id, task);

    // Update dependency graph
    this.updateDependencyGraph(task);

    this.logger.debug(`Task ${task.id} added to dependency-aware queue`, {
      taskId: task.id,
      dependencies: task.dependencies.map((d) => d.taskId),
    });

    // Invalidate optimized order
    this.lastOptimizedOrder = [];
  }

  /**
   * Get the next task that has no pending dependencies
   */
  dequeue(): SchedulableTask | undefined {
    // If we don't have an optimized order or it's empty, recalculate
    if (this.lastOptimizedOrder.length === 0) {
      this.optimizeExecutionOrder();
    }

    // Find the first ready task in the optimized order
    while (this.lastOptimizedOrder.length > 0) {
      const taskId = this.lastOptimizedOrder.shift();
      if (!taskId) continue;

      const task = this.tasks.get(taskId);
      if (!task) continue;

      // Check if the task is blocked
      if (this.isBlocked(taskId)) {
        // Put it back at the end of the queue
        this.lastOptimizedOrder.push(taskId);
        continue;
      }

      // Remove from the tasks map
      this.tasks.delete(taskId);

      // Update dependency graph
      this.removeDependencyNode(taskId);

      this.logger.debug(`Task ${taskId} dequeued`, { taskId });
      return task;
    }

    return undefined;
  }

  /**
   * Peek at the next task without removing it
   */
  peek(): SchedulableTask | undefined {
    // If we don't have an optimized order or it's empty, recalculate
    if (this.lastOptimizedOrder.length === 0) {
      this.optimizeExecutionOrder();
    }

    // Find the first ready task in the optimized order
    for (const taskId of this.lastOptimizedOrder) {
      const task = this.tasks.get(taskId);
      if (!task) continue;

      if (!this.isBlocked(taskId)) {
        return task;
      }
    }

    return undefined;
  }

  /**
   * Update a task in the queue
   */
  update(taskId: string, updates: Partial<SchedulableTask>): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // Create updated task
    const updatedTask = { ...task, ...updates };

    // Update task in the map
    this.tasks.set(taskId, updatedTask);

    // If dependencies changed, update the graph
    if (updates.dependencies) {
      this.updateDependencyGraph(updatedTask);
      this.lastOptimizedOrder = []; // Invalidate optimized order
    }

    this.logger.debug(`Task ${taskId} updated in dependency-aware queue`, {
      taskId,
      updates,
    });

    return true;
  }

  /**
   * Remove a task from the queue
   */
  remove(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // Remove from the tasks map
    this.tasks.delete(taskId);

    // Update dependency graph
    this.removeDependencyNode(taskId);

    // Invalidate optimized order
    this.lastOptimizedOrder = [];

    this.logger.debug(`Task ${taskId} removed from dependency-aware queue`, {
      taskId,
    });
    return true;
  }

  /**
   * Get all tasks in the queue
   */
  getAll(): SchedulableTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get a task by its ID
   */
  getById(taskId: string): SchedulableTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get the number of tasks in the queue
   */
  size(): number {
    return this.tasks.size;
  }

  /**
   * Check if the queue is empty
   */
  isEmpty(): boolean {
    return this.tasks.size === 0;
  }

  /**
   * Get tasks that depend on the specified task
   */
  getDependents(taskId: string): SchedulableTask[] {
    const node = this.dependencyGraph.get(taskId);
    if (!node) {
      return [];
    }

    return Array.from(node.dependedBy)
      .map((id) => this.tasks.get(id))
      .filter((task): task is SchedulableTask => task !== undefined);
  }

  /**
   * Get tasks that the specified task depends on
   */
  getDependencies(taskId: string): SchedulableTask[] {
    const node = this.dependencyGraph.get(taskId);
    if (!node) {
      return [];
    }

    return Array.from(node.dependsOn)
      .map((id) => this.tasks.get(id))
      .filter((task): task is SchedulableTask => task !== undefined);
  }

  /**
   * Check if a task is blocked by dependencies
   */
  isBlocked(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false; // Task doesn't exist, so it's not blocked
    }

    // Check if any hard dependencies are not completed
    for (const dependency of task.dependencies) {
      if (dependency.type === 'hard') {
        // Check if the dependency is completed
        const dependencyResult = this.executionResults.get(dependency.taskId);

        if (dependencyResult === undefined) {
          // Dependency doesn't have a result, it's not completed
          return true;
        }

        // If there's a condition, check if it's satisfied
        if (dependency.condition && !dependency.condition(dependencyResult)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a task is ready to execute
   */
  isReadyToExecute(taskId: string): boolean {
    return !this.isBlocked(taskId);
  }

  /**
   * Update a task's status and record its result if completed
   */
  updateTaskStatus(
    taskId: string,
    status: TaskScheduleStatus,
    result?: any,
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(
        `Attempted to update status for non-existent task ${taskId}`,
      );
      return;
    }

    // Update the task status
    this.update(taskId, { status });

    // If completed, record the result
    if (status === TaskScheduleStatus.COMPLETED && result !== undefined) {
      this.executionResults.set(taskId, result);
      this.logger.debug(`Recorded result for task ${taskId}`, { taskId });
    }

    // If failed or canceled, we still need to handle dependencies
    if (
      status === TaskScheduleStatus.FAILED ||
      status === TaskScheduleStatus.CANCELED
    ) {
      // For now, we consider failed/canceled tasks as having no result
      // A more sophisticated approach might use error handling or fallback values
      this.executionResults.set(taskId, null);
    }
  }

  /**
   * Optimize the execution order of tasks based on dependencies
   */
  optimizeExecutionOrder(): SchedulableTask[] {
    // Perform topological sort to get dependency-respecting order
    const sortedTaskIds = this.topologicalSort();

    // Filter out tasks that are not ready
    this.lastOptimizedOrder = sortedTaskIds.filter(
      (taskId) => !this.isBlocked(taskId) && this.tasks.has(taskId),
    );

    // Get the actual tasks in order
    const orderedTasks = this.lastOptimizedOrder
      .map((id) => this.tasks.get(id))
      .filter((task): task is SchedulableTask => task !== undefined);

    this.logger.debug('Optimized execution order', {
      totalTasks: this.tasks.size,
      orderedCount: orderedTasks.length,
      readyCount: this.lastOptimizedOrder.length,
    });

    return orderedTasks;
  }

  /**
   * Perform topological sort on the dependency graph
   */
  private topologicalSort(): string[] {
    const result: string[] = [];
    const taskIds = Array.from(this.dependencyGraph.keys());

    // Reset visited flags
    for (const node of this.dependencyGraph.values()) {
      node.visited = false;
      node.inPath = false;
    }

    // Helper function for depth-first traversal
    const visit = (taskId: string): boolean => {
      const node = this.dependencyGraph.get(taskId);
      if (!node) return true;

      if (node.inPath) {
        this.logger.warn('Circular dependency detected', { taskId });
        return false; // Circular dependency
      }

      if (node.visited) return true;

      node.visited = true;
      node.inPath = true;

      // Visit all dependencies first
      for (const depId of node.dependsOn) {
        if (!visit(depId)) {
          return false;
        }
      }

      node.inPath = false;
      result.unshift(taskId); // Add to the beginning of the result
      return true;
    };

    // Try to visit all nodes
    for (const taskId of taskIds) {
      if (!visit(taskId)) {
        // If we have circular dependencies, resort to a simpler approach
        this.logger.warn(
          'Falling back to simple dependency ordering due to circular dependencies',
        );
        return this.simpleOrdering();
      }
    }

    return result;
  }

  /**
   * Simpler ordering algorithm for when there are circular dependencies
   */
  private simpleOrdering(): string[] {
    const result: string[] = [];
    const taskIds = Array.from(this.tasks.keys());

    // Groups tasks by the number of dependencies
    const byDependencyCount: Record<number, string[]> = {};

    for (const taskId of taskIds) {
      const node = this.dependencyGraph.get(taskId);
      const count = node ? node.dependsOn.size : 0;

      if (!byDependencyCount[count]) {
        byDependencyCount[count] = [];
      }

      byDependencyCount[count].push(taskId);
    }

    // Add tasks in order of ascending dependency count
    const counts = Object.keys(byDependencyCount)
      .map(Number)
      .sort((a, b) => a - b);

    for (const count of counts) {
      result.push(...byDependencyCount[count]);
    }

    return result;
  }

  /**
   * Update the dependency graph when a task is added or updated
   */
  private updateDependencyGraph(task: SchedulableTask): void {
    // Create or get the node for this task
    let node = this.dependencyGraph.get(task.id);
    if (!node) {
      node = {
        taskId: task.id,
        dependsOn: new Set<string>(),
        dependedBy: new Set<string>(),
      };
      this.dependencyGraph.set(task.id, node);
    }

    // Clear existing dependencies
    for (const depId of node.dependsOn) {
      const depNode = this.dependencyGraph.get(depId);
      if (depNode) {
        depNode.dependedBy.delete(task.id);
      }
    }

    // Reset dependencies
    node.dependsOn.clear();

    // Add new dependencies
    for (const dependency of task.dependencies) {
      const depId = dependency.taskId;
      node.dependsOn.add(depId);

      // Create the dependency node if it doesn't exist
      let depNode = this.dependencyGraph.get(depId);
      if (!depNode) {
        depNode = {
          taskId: depId,
          dependsOn: new Set<string>(),
          dependedBy: new Set<string>(),
        };
        this.dependencyGraph.set(depId, depNode);
      }

      // Update the "depended by" relationship
      depNode.dependedBy.add(task.id);
    }

    // Invalidate optimized order
    this.lastOptimizedOrder = [];
  }

  /**
   * Remove a node from the dependency graph
   */
  private removeDependencyNode(taskId: string): void {
    const node = this.dependencyGraph.get(taskId);
    if (!node) {
      return;
    }

    // Update nodes that this node depends on
    for (const depId of node.dependsOn) {
      const depNode = this.dependencyGraph.get(depId);
      if (depNode) {
        depNode.dependedBy.delete(taskId);
      }
    }

    // Update nodes that depend on this node
    for (const depById of node.dependedBy) {
      const depByNode = this.dependencyGraph.get(depById);
      if (depByNode) {
        depByNode.dependsOn.delete(taskId);
      }
    }

    // Remove the node
    this.dependencyGraph.delete(taskId);

    // Invalidate optimized order
    this.lastOptimizedOrder = [];
  }
}
