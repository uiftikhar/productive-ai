import { v4 as uuidv4 } from 'uuid';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { SupervisorAgent } from '../../agents/specialized/supervisor-agent';
import { SupervisorWorkflow } from '../core/workflows/supervisor-workflow';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { TaskPlanningService } from '../../agents/services/task-planning.service';
import { AgentTaskExecutorService } from '../../agents/services/agent-task-executor.service';
import { BaseAgent } from '../../agents/base/base-agent';
import {
  AgentRequest,
  AgentResponse,
} from '../../agents/interfaces/base-agent.interface';

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
    super(
      'Data Visualization Agent',
      'Creates visualizations from data',
      {
        id: 'data-visualization-agent',
      },
    );

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
    logger.info(
      `DataVisualizationAgent executing: ${typeof request.input === 'string' ? request.input : 'complex input'}`,
    );

    if (request.input.includes('fail')) {
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
  description: 'Coordinates research, content creation, and visualization tasks',
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
      tasks: [
        {
          taskDescription: 'Research current AI tools market trends and competitors',
          priority: 10,
          requiredCapabilities: ['information-gathering', 'data-analysis'],
        },
        {
          taskDescription: 'Write an executive summary of market findings',
          priority: 8,
          requiredCapabilities: ['content-writing'],
        },
        {
          taskDescription: 'Create visualization charts for market share data',
          priority: 6,
          requiredCapabilities: ['data-visualization'],
        },
        {
          // This task will fail to test error handling
          taskDescription: 'Create visualization that will fail for demonstration',
          priority: 4,
          requiredCapabilities: ['data-visualization'],
        },
      ],
      executionStrategy: 'sequential',
      useTaskPlanningService: true,
      planName: 'Market Analysis Project',
      planDescription: 'Comprehensive market analysis of AI tools with research, content, and visualizations',
    },
  };
  
  try {
    logger.info('Starting supervisor workflow execution');
    const response = await supervisorWorkflow.execute(projectRequest);
    
    logger.info('Supervisor workflow execution completed');
    logger.info('Response:', response);
    
    // Display the results
    if (typeof response.output === 'object') {
      logger.info('Status:', response.output.status);
      logger.info('Summary:', response.output.summary);
      logger.info('Stats:', response.output.stats);
      
      logger.info('Results:');
      for (const [taskName, result] of Object.entries(response.output.results || {})) {
        logger.info(`  ${taskName}:`, result);
      }
    } else {
      logger.info('Output:', response.output);
    }
    
    // Display metrics
    if (response.metrics) {
      logger.info('Execution metrics:');
      logger.info(`  Total time: ${response.metrics.executionTimeMs}ms`);
      
      if (response.metrics.taskCompletion) {
        const tc = response.metrics.taskCompletion;
        logger.info(`  Tasks: ${tc.completed}/${tc.total} completed (${tc.failed} failed)`);
        logger.info(`  Success rate: ${Math.round(tc.rate * 100)}%`);
      }
    }
  } catch (error) {
    logger.error('Error executing supervisor workflow:', error);
  }
})(); 