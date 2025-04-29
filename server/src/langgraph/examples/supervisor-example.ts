import { v4 as uuidv4 } from 'uuid';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import {
  SupervisorAgent,
  Task,
} from '../../agents/specialized/facilitator-supervisor-agent';
import { SupervisorWorkflow } from '../core/workflows/supervisor-workflow';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { TaskPlanningService } from '../../agents/services/task-planning.service';
import { AgentTaskExecutorService } from '../../agents/services/agent-task-executor.service';
import { BaseAgent } from '../../agents/base/base-agent';
import {
  AgentRequest,
  AgentResponse,
} from '../../agents/interfaces/base-agent.interface';

// Define a local task interface for use in the example if needed
interface ExampleTask extends Task {}

// Create a logger instance
const logger = new ConsoleLogger();
logger.info('Starting Supervisor Workflow Example');

// Initialize services
const agentRegistry = AgentRegistryService.getInstance();
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
    await new Promise((resolve) => setTimeout(resolve, 2000));

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
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return {
      output: `Content created successfully: "${request.input}".\nThe content is engaging and follows best practices.`,
    };
  }
}

class DataVisualizationAgent extends BaseAgent {
  constructor() {
    super('Data Visualization Agent', 'Creates visualizations from data', {
      id: 'data-visualization-agent',
    });

    this.registerCapability({
      name: 'data-visualization',
      description: 'Create charts and visuals from data',
    });

    this.registerCapability({
      name: 'report-generation',
      description: 'Generate visual reports from analysis',
    });
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const inputStr = String(request.input);
    logger.info(
      `DataVisualizationAgent executing: ${typeof request.input === 'string' ? request.input : 'complex input'}`,
    );

    if (typeof inputStr === 'string' && inputStr.includes('fail')) {
      // Simulate a failure for testing error handling
      throw new Error('Failed to process visualization request');
    }

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 2500));

    return {
      output: `Visualization created for: ${request.input}.\nCreated 3 charts and 1 interactive dashboard.`,
    };
  }
}

// Register agents
const researchAgent = new ResearchAgent();
const contentCreationAgent = new ContentCreationAgent();
const dataVisualizationAgent = new DataVisualizationAgent();

agentRegistry.registerAgent(researchAgent);
agentRegistry.registerAgent(contentCreationAgent);
agentRegistry.registerAgent(dataVisualizationAgent);

// Create the supervisor agent
const supervisorAgent = new SupervisorAgent({
  name: 'Project Supervisor',
  description:
    'Coordinates research, content creation, and visualization tasks',
  id: 'project-supervisor',
  defaultTeamMembers: [
    {
      agent: researchAgent,
      role: 'Researcher',
      priority: 8,
      active: true,
    },
    {
      agent: contentCreationAgent,
      role: 'Content Creator',
      priority: 7,
      active: true,
    },
    {
      agent: dataVisualizationAgent,
      role: 'Visualizer',
      priority: 6,
      active: true,
    },
  ],
});

// Define our tasks for the market analysis project
const projectTasks = [
  {
    name: 'Research AI Tools Market',
    description: 'Research current AI tools market trends and competitors',
    priority: 10,
    requiredCapabilities: ['information-gathering'],
    status: 'pending',
  },
  {
    name: 'Write Executive Summary',
    description: 'Write an executive summary of market findings',
    priority: 8,
    requiredCapabilities: ['content-writing'],
    status: 'pending',
  },
  {
    name: 'Create Visualization Charts',
    description: 'Create visualization charts for market share data',
    priority: 6,
    requiredCapabilities: ['data-visualization'],
    status: 'pending',
  },
  {
    name: 'Create Failed Visualization',
    description: 'Create visualization that will fail for demonstration',
    priority: 4,
    requiredCapabilities: ['data-visualization'],
    status: 'pending',
  },
];

// Initialize the supervisor agent
(async () => {
  await supervisorAgent.initialize();

  // Register the supervisor agent
  agentRegistry.registerAgent(supervisorAgent);

  // Create the supervisor workflow
  const supervisorWorkflow = new SupervisorWorkflow(supervisorAgent, {
    tracingEnabled: true,
    includeStateInLogs: true,
    logger,
  });

  // Example of a multi-step project workflow
  const projectRequest: AgentRequest = {
    input: 'Create a comprehensive market analysis report on AI tools',
    capability: 'work-coordination',
    parameters: {
      // For direct work coordination without task planning
      tasks: projectTasks.map((task) => ({
        taskDescription: task.description,
        priority: task.priority,
        requiredCapabilities: task.requiredCapabilities,
      })),
      executionStrategy: 'sequential',
      // For workflow execution
      planName: 'Market Analysis Project',
      planDescription:
        'Comprehensive market analysis of AI tools with research, content, and visualizations',
    },
  };

  // For task planning stage, we need to provide these parameters
  const taskPlanningParams = {
    name: 'Market Analysis Project',
    description:
      'Comprehensive market analysis of AI tools with research, content, and visualizations',
    tasks: projectTasks,
  };

  try {
    logger.info('Starting supervisor workflow execution');

    // Manually prepare the workflow stages to ensure proper parameters are passed

    // 1. First, create a task plan
    logger.info('Creating task plan');
    const taskPlanResponse = await supervisorAgent.execute({
      input: 'Create comprehensive market analysis tasks',
      capability: 'task-planning',
      parameters: taskPlanningParams,
    });

    const taskPlan = taskPlanResponse.output;
    const planId = taskPlanResponse.artifacts?.planId || 'missing-plan-id';

    logger.info(`Created task plan with ID: ${planId}`);

    // 2. Then, perform task assignments
    logger.info('Assigning tasks to agents');
    const taskAssignments: Record<string, string> = {};

    for (const task of projectTasks) {
      const assignmentResponse = await supervisorAgent.execute({
        input: task.description,
        capability: 'task-assignment',
        parameters: {
          taskDescription: task.description,
          priority: task.priority,
          requiredCapabilities: task.requiredCapabilities,
        },
      });

      // Cast the output to our task interface
      const assignedTask = assignmentResponse.output as unknown as ExampleTask;

      // Check if we have a valid task with ID and assignment
      if (assignedTask && assignedTask.id && assignedTask.assignedTo) {
        logger.info(
          `Assigned task ${assignedTask.id} to agent ${assignedTask.assignedTo}`,
        );

        // Store the assignments
        taskAssignments[assignedTask.id] = assignedTask.assignedTo;
      } else {
        logger.warn(
          'Task assignment response did not contain expected task data',
          {
            taskDescription: task.description,
          },
        );
      }
    }

    // 3. Now execute all tasks using work coordination
    logger.info('Executing all tasks');
    const executionResponse = await supervisorAgent.execute({
      input: 'Execute all tasks for market analysis',
      capability: 'work-coordination',
      parameters: {
        tasks: projectTasks.map((task) => ({
          taskDescription: task.description,
          priority: task.priority,
          requiredCapabilities: task.requiredCapabilities,
        })),
        executionStrategy: 'sequential',
      },
    });

    // 4. Check progress
    logger.info('Checking task progress');
    const progressResponse = await supervisorAgent.execute({
      input: 'Get task progress',
      capability: 'progress-tracking',
    });

    // Log the task progress properly
    logger.info(
      'Task progress:',
      progressResponse.output as Record<string, any>,
    );

    // 5. Now run the full workflow
    logger.info('Running full workflow through SupervisorWorkflow');

    // Create a simple execution task with required structure
    const researchTask: Task = {
      id: uuidv4(),
      name: 'AI Market Research',
      description: 'Research current AI tools market trends and competitors',
      status: 'pending',
      priority: 10,
      createdAt: Date.now(),
      metadata: {
        requiredCapabilities: ['information-gathering'],
      },
    };

    const contentTask: Task = {
      id: uuidv4(),
      name: 'Content Creation',
      description: 'Write a summary about AI tools market',
      status: 'pending',
      priority: 8,
      createdAt: Date.now(),
      metadata: {
        requiredCapabilities: ['content-writing'],
      },
    };

    // Add debug logging for the tasks
    logger.info('Task structure before execution:');
    logger.info('Research task:', {
      task: { id: researchTask.id, name: researchTask.name },
    });
    logger.info('Content task:', {
      task: { id: contentTask.id, name: contentTask.name },
    });

    // Try a direct approach with the SupervisorAgent instead of using the workflow
    logger.info('Assigning and executing tasks directly with SupervisorAgent:');

    // Assign tasks directly
    const assignedResearchTask = await supervisorAgent.execute({
      input: researchTask.description,
      capability: 'task-assignment',
      parameters: {
        taskId: researchTask.id,
        taskName: researchTask.name,
        taskDescription: researchTask.description,
        priority: researchTask.priority,
        requiredCapabilities: researchTask.metadata?.requiredCapabilities,
      },
    });

    const assignedContentTask = await supervisorAgent.execute({
      input: contentTask.description,
      capability: 'task-assignment',
      parameters: {
        taskId: contentTask.id,
        taskName: contentTask.name,
        taskDescription: contentTask.description,
        priority: contentTask.priority,
        requiredCapabilities: contentTask.metadata?.requiredCapabilities,
      },
    });

    logger.info('Task assignments completed:', {
      researchTaskOutput:
        typeof assignedResearchTask.output === 'string'
          ? assignedResearchTask.output.substring(0, 50) + '...'
          : 'complex output',
      contentTaskOutput:
        typeof assignedContentTask.output === 'string'
          ? assignedContentTask.output.substring(0, 50) + '...'
          : 'complex output',
    });

    // Execute tasks
    const executionResult = await supervisorAgent.execute({
      input: 'Execute research and content tasks',
      capability: 'work-coordination',
      parameters: {
        tasks: [
          {
            taskId: researchTask.id,
            taskName: researchTask.name,
            taskDescription: researchTask.description,
            priority: researchTask.priority,
            requiredCapabilities: researchTask.metadata?.requiredCapabilities,
          },
          {
            taskId: contentTask.id,
            taskName: contentTask.name,
            taskDescription: contentTask.description,
            priority: contentTask.priority,
            requiredCapabilities: contentTask.metadata?.requiredCapabilities,
          },
        ],
        executionStrategy: 'sequential',
      },
    });

    logger.info('Task execution completed');
    logger.info('Execution result:', executionResult);

    // Now try the workflow again but with simplified parameters
    logger.info('Now trying the workflow with task planning parameters:');

    // Execute the workflow with task planning details
    const response = await supervisorWorkflow.execute({
      input: 'Research AI tools and create content',
      capability: 'task-planning',
      parameters: {
        name: 'Simple Research and Content',
        description: 'Research about AI tools and create a summary article',
        tasks: [
          {
            name: 'Research AI Tools',
            description: 'Research current AI tools and their market trends',
            priority: 10,
            metadata: {
              requiredCapabilities: ['information-gathering'],
            },
          },
          {
            name: 'Create Content Summary',
            description: 'Write a summary article about AI tools',
            priority: 7,
            metadata: {
              requiredCapabilities: ['content-writing'],
            },
          },
        ],
      },
    });

    logger.info('Supervisor workflow execution completed');
    logger.info('Response:', response);

    // Parse output if needed
    let parsedOutput: any = response.output;
    if (typeof response.output === 'string') {
      try {
        parsedOutput = JSON.parse(response.output);
      } catch {
        // If not parseable as JSON, keep as is
        parsedOutput = response.output;
      }
    }

    // Display the results
    if (parsedOutput && typeof parsedOutput === 'object') {
      if (parsedOutput.status) {
        logger.info('Status:', parsedOutput.status);
      }

      if (parsedOutput.summary) {
        logger.info('Summary:', parsedOutput.summary);
      }

      if (parsedOutput.stats) {
        logger.info('Stats:', parsedOutput.stats);
      }

      logger.info('Results:');
      if (parsedOutput.results) {
        for (const [taskName, result] of Object.entries(parsedOutput.results)) {
          logger.info(`  ${taskName}:`, result as Record<string, any>);
        }
      }
    } else {
      logger.info('Output:', parsedOutput);
    }

    // Display metrics
    if (response.metrics) {
      logger.info('Execution metrics:');
      logger.info(`  Total time: ${response.metrics.executionTimeMs}ms`);

      const taskCompletion = (response.metrics as any).taskCompletion;
      if (taskCompletion) {
        logger.info(
          `  Tasks: ${taskCompletion.completed}/${taskCompletion.total} completed (${taskCompletion.failed} failed)`,
        );
        logger.info(
          `  Success rate: ${Math.round(taskCompletion.rate * 100)}%`,
        );
      }
    }
  } catch (error) {
    logger.error(
      'Error executing supervisor workflow:',
      error as Record<string, any>,
    );
  }
})();
