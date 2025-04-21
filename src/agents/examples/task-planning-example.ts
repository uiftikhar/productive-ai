import { v4 as uuidv4 } from 'uuid';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { TaskPlanningService } from '../services/task-planning.service';
import {
  AgentTaskExecutorService,
  TaskExecutionEventType,
} from '../services/agent-task-executor.service';
import { AgentRegistryService } from '../services/agent-registry.service';
import { AgentDiscoveryService } from '../services/agent-discovery.service';
import { BaseAgent } from '../base/base-agent';
import {
  AgentRequest,
  AgentResponse,
} from '../interfaces/base-agent.interface';

// Create a logger instance
const logger = new ConsoleLogger();
logger.info('Starting Task Planning System Example');

// Initialize services
const agentRegistry = AgentRegistryService.getInstance();
const agentDiscovery = AgentDiscoveryService.getInstance();
const taskPlanningService = TaskPlanningService.getInstance();
const taskExecutor = AgentTaskExecutorService.getInstance();

// Define example specialized agents for different tasks
class ResearchAgent extends BaseAgent {
  constructor() {
    super('Research Agent', 'Gathers and analyzes information', {
      id: 'research-agent',
    });

    this.registerCapability({
      name: 'information-gathering',
      description: 'Research and gather information from various sources',
    });

    this.registerCapability({
      name: 'data-analysis',
      description: 'Analyze data and identify patterns or insights',
    });
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    logger.info(
      `ResearchAgent executing: ${typeof request.input === 'string' ? request.input : 'complex input'}`,
    );

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      output: `Research completed: Found relevant information on ${request.input}. Analysis shows promising results.`,
    };
  }
}

class ContentCreationAgent extends BaseAgent {
  constructor() {
    super('Content Creation Agent', 'Creates various types of content', {
      id: 'content-creation-agent',
    });

    this.registerCapability({
      name: 'content-writing',
      description: 'Write engaging and informative content',
    });

    this.registerCapability({
      name: 'content-editing',
      description: 'Edit and refine content for clarity and impact',
    });
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    logger.info(
      `ContentCreationAgent executing: ${typeof request.input === 'string' ? request.input : 'complex input'}`,
    );

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 700));

    return {
      output: `Content created successfully: "${request.input}".\nThe content is engaging and follows best practices.`,
    };
  }
}

class ProjectManagementAgent extends BaseAgent {
  constructor() {
    super(
      'Project Management Agent',
      'Manages projects and coordinates workflows',
      {
        id: 'project-management-agent',
      },
    );

    this.registerCapability({
      name: 'project-planning',
      description: 'Create and manage project plans',
    });

    this.registerCapability({
      name: 'workflow-coordination',
      description: 'Coordinate complex workflows across teams',
    });

    this.registerCapability({
      name: 'resource-allocation',
      description: 'Allocate resources efficiently for projects',
    });
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    logger.info(
      `ProjectManagementAgent executing: ${typeof request.input === 'string' ? request.input : 'complex input'}`,
    );

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 600));

    return {
      output: `Project management task completed: ${request.input}.\nWorkflow has been optimized and resources allocated efficiently.`,
    };
  }
}

// Register our agents
const researchAgent = new ResearchAgent();
const contentCreationAgent = new ContentCreationAgent();
const projectManagementAgent = new ProjectManagementAgent();

agentRegistry.registerAgent(researchAgent);
agentRegistry.registerAgent(contentCreationAgent);
agentRegistry.registerAgent(projectManagementAgent);

// Set up event listeners for task execution feedback loop
taskExecutor.subscribe((event) => {
  switch (event.type) {
    case TaskExecutionEventType.TASK_STARTED:
      logger.info(`⚙️ Task started: ${event.taskId}`);
      break;
    case TaskExecutionEventType.TASK_COMPLETED:
      logger.info(`✅ Task completed: ${event.taskId}`);
      logger.info(
        `  Result: ${JSON.stringify(event.result).substring(0, 100)}...`,
      );
      break;
    case TaskExecutionEventType.TASK_FAILED:
      logger.error(`❌ Task failed: ${event.taskId}`);
      logger.error(`  Error: ${event.error}`);
      break;
    case TaskExecutionEventType.TASK_STATUS_CHANGED:
      logger.info(`📊 Task status changed: ${event.taskId} -> ${event.status}`);
      break;
    case TaskExecutionEventType.PLAN_COMPLETED:
      logger.info(
        `🏁 Plan completed: ${event.planId} with status: ${event.status}`,
      );
      break;
  }
});

// Function to demonstrate task planning system
async function demonstrateTaskPlanningSystem() {
  logger.info('=== Demonstration: Task Planning System ===');

  // Step 1: Create a high-level task plan
  logger.info('\n📝 Step 1: Creating a high-level task plan');
  const planId = uuidv4();
  const plan = await taskPlanningService.createTaskPlan(
    'Content Marketing Campaign',
    'Plan and execute a comprehensive content marketing campaign for a new product launch',
    {
      context: {
        product: 'AI-Powered Task Management Tool',
        target_audience: 'Knowledge workers and project managers',
        timeline: '4 weeks',
        goals: [
          'Increase product awareness',
          'Generate qualified leads',
          'Position as thought leader in productivity space',
        ],
      },
      maxDepth: 2,
      maxSubtasks: 5,
    },
  );

  logger.info(`Created task plan: ${plan.id} with ${plan.tasks.length} tasks`);

  // Assign an agent to the root task
  const rootTaskId = plan.rootTaskIds[0];
  if (rootTaskId) {
    taskPlanningService.updateTaskStatus(
      plan.id, 
      rootTaskId,
      'pending',
      undefined,
      undefined,
      'project-management-agent'
    );
    logger.info(`Assigned Project Management Agent to the root task: ${rootTaskId}`);
  }

  // Step 2: Manually add some specific tasks to the plan
  logger.info('\n📋 Step 2: Adding specific tasks to the plan');

  // Research task
  const researchTaskId = uuidv4();
  taskPlanningService.addTask(plan.id, {
    id: researchTaskId,
    name: 'Market Research and Competitor Analysis',
    description:
      'Research the target market, identify key competitors, and analyze their content strategies',
    priority: 9,
    assignedTo: 'research-agent',
    estimatedDuration: 2 * 60 * 60 * 1000, // 2 hours
    requiredCapabilities: ['information-gathering', 'data-analysis'],
    metadata: {
      importance: 'high',
      deliverables: 'Market research report and competitor analysis',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'pending',
  });

  // Content creation task (depends on research)
  const contentTaskId = uuidv4();
  taskPlanningService.addTask(plan.id, {
    id: contentTaskId,
    name: 'Create Content Assets',
    description:
      'Create various content assets including blog posts, social media content, and email campaigns',
    priority: 7,
    assignedTo: 'content-creation-agent',
    estimatedDuration: 4 * 60 * 60 * 1000, // 4 hours
    dependencies: [researchTaskId], // Depends on research task
    requiredCapabilities: ['content-writing', 'content-editing'],
    metadata: {
      deliverables: [
        '3 blog posts',
        '10 social media posts',
        '2 email newsletters',
      ],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'pending',
  });

  // Coordination task (depends on content creation)
  const coordinationTaskId = uuidv4();
  taskPlanningService.addTask(plan.id, {
    id: coordinationTaskId,
    name: 'Campaign Coordination and Launch',
    description:
      'Coordinate the campaign launch, schedule content publishing, and allocate resources',
    priority: 5,
    assignedTo: 'project-management-agent',
    estimatedDuration: 3 * 60 * 60 * 1000, // 3 hours
    dependencies: [contentTaskId], // Depends on content creation
    requiredCapabilities: ['project-planning', 'workflow-coordination'],
    metadata: {
      deliverables: 'Published content assets and campaign launch report',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'pending',
  });

  logger.info(`Added 3 custom tasks to the plan`);

  // Step 3: Demonstrate task assignment process
  logger.info('\n🔍 Step 3: Reviewing task assignments');
  const readyTasks = taskPlanningService.getReadyTasks(plan.id);

  logger.info(`Ready tasks: ${readyTasks.length}`);
  readyTasks.forEach((task) => {
    const agent = task.assignedTo
      ? agentRegistry.getAgent(task.assignedTo)?.name || 'Unknown Agent'
      : 'Unassigned';

    logger.info(`  - ${task.name} (${task.id}) assigned to: ${agent}`);

    // If a task has no assigned agent, find one based on capabilities
    if (!task.assignedTo && task.requiredCapabilities?.length) {
      const capability = task.requiredCapabilities[0];
      const agents = agentRegistry.findAgentsWithCapability(capability);

      if (agents.length > 0) {
        const bestAgent = agents[0];
        logger.info(
          `    Auto-assigning to: ${bestAgent.name} (${bestAgent.id})`,
        );

        // Update the task with the assigned agent
        taskPlanningService.updateTaskStatus(
          plan.id,
          task.id,
          'pending',
          undefined,
          undefined,
          bestAgent.id,
        );
      }
    }
  });

  // Step 4: Execute the task plan
  logger.info('\n▶️ Step 4: Executing the task plan');

  try {
    const result = await taskExecutor.executePlan(plan.id, {
      parallelLimit: 2,
      timeout: 30 * 1000, // 30 seconds
      retryCount: 1,
      context: {
        executionPriority: 'high',
        notifyOnCompletion: true,
      },
    });

    // Step 5: Review task execution results
    logger.info('\n📊 Step 5: Reviewing execution results');
    logger.info(`Plan execution completed with status: ${result.status}`);
    logger.info(
      `Completed ${result.completedTasks}/${result.totalTasks} tasks`,
    );
    logger.info(`Failed tasks: ${result.failedTasks}`);
    logger.info(`Total execution time: ${result.executionTimeMs}ms`);

    // Display individual task results
    logger.info('\nTask Results:');
    result.results.forEach((taskResult) => {
      logger.info(`Task ${taskResult.taskId} - Status: ${taskResult.status}`);
      logger.info(`  Execution time: ${taskResult.executionTimeMs}ms`);

      if (taskResult.status === 'completed' && taskResult.result) {
        logger.info(
          `  Result: ${JSON.stringify(taskResult.result).substring(0, 100)}...`,
        );
      } else if (taskResult.status === 'failed' && taskResult.error) {
        logger.info(`  Error: ${taskResult.error}`);
      }
    });

    // Step 6: Demonstrate the feedback loop by updating a task and observing the effects
    logger.info('\n🔄 Step 6: Demonstrating feedback loop');

    if (result.status !== 'completed') {
      logger.info(
        'Some tasks failed. Retrying failed tasks with different parameters...',
      );

      const failedResults = result.results.filter((r) => r.status === 'failed');
      for (const failedResult of failedResults) {
        logger.info(`Retrying failed task: ${failedResult.taskId}`);

        // Reset the task status to pending
        taskPlanningService.updateTaskStatus(
          plan.id,
          failedResult.taskId,
          'pending',
        );

        // Execute the task directly with modified options
        const retryResult = await taskExecutor.executeTaskDirectly(
          plan.id,
          failedResult.taskId,
          {
            retryCount: 2,
            retryDelay: 2000,
            context: {
              isRetry: true,
              previousError: failedResult.error,
            },
          },
        );

        logger.info(`Retry result: ${retryResult.status}`);
        if (retryResult.status === 'completed') {
          logger.info('Task successfully completed on retry');
        } else {
          logger.info(`Task failed again: ${retryResult.error}`);
        }
      }
    } else {
      logger.info(
        'All tasks completed successfully. Simulating a feedback loop by updating a task...',
      );

      // Select a completed task to update
      const completedTask = plan.tasks.find((t) => t.status === 'completed');
      if (completedTask) {
        logger.info(
          `Updating task: ${completedTask.name} (${completedTask.id})`,
        );

        // Update the task with additional information
        taskPlanningService.updateTaskStatus(
          plan.id,
          completedTask.id,
          'completed',
          {
            ...completedTask.result,
            feedbackAdded: true,
            qualityScore: 9.2,
            feedback: 'Excellent work, exceeded expectations',
            nextSteps: 'Incorporate into final campaign',
          },
        );

        logger.info('Task updated with feedback');

        // Get the updated task to show the feedback loop in action
        const updatedPlan = taskPlanningService.getTaskPlan(plan.id);
        const updatedTask = updatedPlan?.tasks.find(
          (t) => t.id === completedTask.id,
        );

        if (updatedTask) {
          logger.info('Updated task information:');
          logger.info(`  Status: ${updatedTask.status}`);
          logger.info(
            `  Result: ${JSON.stringify(updatedTask.result).substring(0, 150)}...`,
          );
        }
      }
    }
  } catch (error) {
    logger.error('Error executing task plan:', { error: error instanceof Error ? error.message : String(error) });
  }

  // Step 7: Clean up
  logger.info('\n🧹 Step 7: Cleaning up');
  const deleted = taskPlanningService.deleteTaskPlan(plan.id);
  logger.info(`Task plan deleted: ${deleted}`);
}

// Run the demonstration
demonstrateTaskPlanningSystem()
  .then(() => {
    logger.info('\n✨ Task Planning System demonstration completed');
  })
  .catch((error) => {
    logger.error('Error in demonstration:', error);
  });
