import { SupervisorAgent } from '../../agents/specialized/facilitator-supervisor-agent';
import { SupervisorAdapter } from '../core/adapters/supervisor-adapter';
import { BaseAgent } from '../../agents/base/base-agent';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import {
  AgentRequest,
  AgentResponse,
} from '../../agents/interfaces/base-agent.interface';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { TaskPlanningService } from '../../agents/services/task-planning.service';
import { AgentTaskExecutorService } from '../../agents/services/agent-task-executor.service';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Configure logger
const logger = new ConsoleLogger();
logger.setLogLevel('info');

// Get service instances
const agentRegistry = AgentRegistryService.getInstance();
const taskPlanningService = TaskPlanningService.getInstance();
const taskExecutorService = AgentTaskExecutorService.getInstance();

// Performance monitoring utilities
class PerformanceMonitor {
  private startTime: number;
  private checkpoints: Record<string, number> = {};
  private metrics: Record<string, any> = {};

  constructor() {
    this.startTime = Date.now();
  }

  checkpoint(name: string): void {
    this.checkpoints[name] = Date.now();
    logger.info(`Checkpoint: ${name} at ${Date.now() - this.startTime}ms`);
  }

  recordMetric(name: string, value: any): void {
    this.metrics[name] = value;
  }

  getElapsedMs(checkpointName?: string): number {
    if (checkpointName && this.checkpoints[checkpointName]) {
      return Date.now() - this.checkpoints[checkpointName];
    }
    return Date.now() - this.startTime;
  }

  getReport(): any {
    const totalTime = Date.now() - this.startTime;
    const checkpointDurations: Record<string, number> = {};

    // Calculate time between checkpoints
    const checkpointNames = Object.keys(this.checkpoints).sort(
      (a, b) => this.checkpoints[a] - this.checkpoints[b],
    );

    for (let i = 0; i < checkpointNames.length - 1; i++) {
      const current = checkpointNames[i];
      const next = checkpointNames[i + 1];
      checkpointDurations[`${current} to ${next}`] =
        this.checkpoints[next] - this.checkpoints[current];
    }

    return {
      totalDurationMs: totalTime,
      checkpoints: this.checkpoints,
      checkpointDurations,
      metrics: this.metrics,
    };
  }

  saveReport(filename: string): void {
    const report = this.getReport();
    const reportJson = JSON.stringify(report, null, 2);
    fs.writeFileSync(filename, reportJson, 'utf8');
    logger.info(`Performance report saved to ${filename}`);
  }
}

// Specialized agents for the simulation

// Research agent that can search for information
class ResearchAgent extends BaseAgent {
  constructor(id = `research-agent-${uuidv4().substring(0, 8)}`) {
    super('Research Agent', 'Performs research and information retrieval', {
      id,
    });
    this.registerCapability({
      name: 'research',
      description: 'Searches for and retrieves information on topics',
    });
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const query =
      typeof request.input === 'string'
        ? request.input
        : JSON.stringify(request.input);

    logger.info(`ResearchAgent executing: ${query.substring(0, 50)}...`);

    // Simulate research delay
    await new Promise((resolve) =>
      setTimeout(resolve, 300 + Math.random() * 700),
    );

    // Generate research results
    const results =
      `Research findings for: ${query}\n\n` +
      `• Found 3 relevant articles on the topic\n` +
      `• Key data points: X=${Math.round(Math.random() * 100)}, Y=${Math.round(Math.random() * 100)}\n` +
      `• Main insights: The topic shows significant correlation with related factors\n` +
      `• Recommended sources: Source A, Source B, Source C`;

    return {
      output: results,
      metrics: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed: query.length / 4 + results.length / 4,
      },
    };
  }
}

// Analysis agent that processes data
class AnalysisAgent extends BaseAgent {
  private errorRate: number = 0.2; // 20% chance of error for testing recovery

  constructor(id = `analysis-agent-${uuidv4().substring(0, 8)}`) {
    super('Analysis Agent', 'Analyzes data and extracts insights', { id });
    this.registerCapability({
      name: 'data-analysis',
      description: 'Analyzes datasets to extract patterns and insights',
    });
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const data =
      typeof request.input === 'string'
        ? request.input
        : JSON.stringify(request.input);

    logger.info(`AnalysisAgent executing: ${data.substring(0, 50)}...`);

    // Simulate analysis delay
    await new Promise((resolve) =>
      setTimeout(resolve, 400 + Math.random() * 600),
    );

    // Random failure for testing recovery
    if (Math.random() < this.errorRate) {
      logger.warn('AnalysisAgent encountered an error (simulated)');
      throw new Error('Analysis failed due to data inconsistency');
    }

    // Generate analysis results
    const analysis =
      `Analysis results:\n\n` +
      `• Processed data from research\n` +
      `• Found statistical significance (p=${(Math.random() * 0.05).toFixed(4)})\n` +
      `• Key correlations discovered between primary variables\n` +
      `• Confidence level: ${Math.round(70 + Math.random() * 25)}%`;

    return {
      output: analysis,
      metrics: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed: data.length / 3 + analysis.length / 3,
      },
    };
  }
}

// Content creation agent
class ContentAgent extends BaseAgent {
  constructor(id = `content-agent-${uuidv4().substring(0, 8)}`) {
    super('Content Agent', 'Creates written content from inputs', { id });
    this.registerCapability({
      name: 'content-creation',
      description: 'Creates written reports, articles, and summaries',
    });
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const input =
      typeof request.input === 'string'
        ? request.input
        : JSON.stringify(request.input);

    logger.info(`ContentAgent executing: ${input.substring(0, 50)}...`);

    // Simulate content creation delay
    await new Promise((resolve) =>
      setTimeout(resolve, 500 + Math.random() * 1000),
    );

    // Generate content
    const content =
      `# Report: ${request.parameters?.title || 'Analysis Results'}\n\n` +
      `## Executive Summary\n\n` +
      `This report presents findings based on research and analysis of the topic.\n\n` +
      `## Key Findings\n\n` +
      `1. First major finding with supporting evidence\n` +
      `2. Second major finding with data correlation\n` +
      `3. Third major finding showing actionable insights\n\n` +
      `## Methodology\n\n` +
      `The research methodology involved comprehensive data collection and rigorous analysis.\n\n` +
      `## Recommendations\n\n` +
      `Based on the findings, we recommend the following actions:\n\n` +
      `- Primary recommendation with implementation steps\n` +
      `- Secondary recommendation with expected outcomes\n` +
      `- Additional considerations for future work`;

    return {
      output: content,
      metrics: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed: input.length / 2 + content.length / 2,
      },
    };
  }
}

// Specialized agent for review and approval
class ReviewAgent extends BaseAgent {
  constructor(id = `review-agent-${uuidv4().substring(0, 8)}`) {
    super('Review Agent', 'Reviews and approves content', { id });
    this.registerCapability({
      name: 'content-review',
      description: 'Reviews content for quality, accuracy, and compliance',
    });
  }

  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const content =
      typeof request.input === 'string'
        ? request.input
        : JSON.stringify(request.input);

    logger.info(`ReviewAgent executing: reviewing content...`);

    // Simulate review delay
    await new Promise((resolve) =>
      setTimeout(resolve, 200 + Math.random() * 300),
    );

    // Generate review
    const review = {
      approved: Math.random() > 0.1, // 90% chance of approval
      score: Math.round(70 + Math.random() * 30),
      feedback:
        'Content meets quality standards with minor suggestions for improvement.',
      suggestedEdits: [
        'Consider strengthening the executive summary',
        'Add more quantitative data to support key finding #2',
        'Expand the recommendations section',
      ],
    };

    return {
      output: JSON.stringify(review),
      metrics: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed: content.length / 5 + JSON.stringify(review).length,
      },
    };
  }
}

// Main simulation orchestration
async function runMultiAgentSimulation() {
  const perfMonitor = new PerformanceMonitor();
  perfMonitor.checkpoint('start');

  try {
    logger.info('Starting multi-agent simulation with SupervisorAgent');

    // Create the specialized agents
    const researchAgent = new ResearchAgent();
    const analysisAgent = new AnalysisAgent();
    const contentAgent = new ContentAgent();
    const reviewAgent = new ReviewAgent();

    // Initialize all agents
    await Promise.all([
      researchAgent.initialize(),
      analysisAgent.initialize(),
      contentAgent.initialize(),
      reviewAgent.initialize(),
    ]);

    perfMonitor.checkpoint('agents_initialized');

    // Create supervisor agent with team members
    const supervisor = new SupervisorAgent({
      id: 'supervisor-' + uuidv4().substring(0, 8),
      logger,
      defaultTeamMembers: [
        { agent: researchAgent, role: 'Researcher', priority: 9, active: true },
        { agent: analysisAgent, role: 'Analyst', priority: 7, active: true },
        {
          agent: contentAgent,
          role: 'Content Creator',
          priority: 5,
          active: true,
        },
        { agent: reviewAgent, role: 'Reviewer', priority: 3, active: true },
      ],
      agentRegistry,
      taskPlanningService,
      agentTaskExecutor: taskExecutorService,
    });

    await supervisor.initialize();

    // Create the workflow adapter for easier interaction
    const adapter = new SupervisorAdapter(supervisor, {
      tracingEnabled: true,
      logger,
    });

    perfMonitor.checkpoint('supervisor_initialized');

    // Run debugging example first
    logger.info('\n=== DEBUG: Simple Task Assignment Test ===\n');
    perfMonitor.checkpoint('debug_example_start');

    // Direct execution through the supervisor
    const debugResult = await supervisor.execute({
      input: 'Test simple task assignment',
      capability: 'work-coordination',
      parameters: {
        tasks: [
          {
            id: 'research-task',
            name: 'Simple Research Task',
            description: 'Research renewable energy basics',
            requiredCapabilities: ['research'],
            priority: 5,
            status: 'pending',
          },
        ],
        executionStrategy: 'sequential',
      },
    });

    perfMonitor.checkpoint('debug_example_complete');
    logger.info('Debug example result:', {
      outputType: typeof debugResult.output,
      hasOutput: !!debugResult.output,
    });

    // Run various scenarios

    // 1. Sequential multi-stage pipeline
    logger.info('\n=== SCENARIO 1: Sequential Research Pipeline ===\n');
    perfMonitor.checkpoint('scenario1_start');

    const scenario1Result = await adapter.executeCoordinatedTask(
      'Research and create a comprehensive report on renewable energy technologies',
      [
        {
          description:
            'Research current renewable energy technologies and their adoption rates',
          requiredCapabilities: ['research'],
          priority: 9,
        },
        {
          description: 'Analyze research data to identify trends and patterns',
          requiredCapabilities: ['data-analysis'],
          priority: 7,
        },
        {
          description:
            'Create a detailed report based on research and analysis',
          requiredCapabilities: ['content-creation'],
          priority: 5,
        },
        {
          description: 'Review and approve the final report',
          requiredCapabilities: ['content-review'],
          priority: 3,
        },
      ],
      { executionStrategy: 'sequential' },
    );

    perfMonitor.checkpoint('scenario1_complete');
    perfMonitor.recordMetric(
      'scenario1_output_size',
      typeof scenario1Result.output === 'string'
        ? scenario1Result.output.length
        : JSON.stringify(scenario1Result.output).length,
    );

    // 2. Parallel execution with high load
    logger.info('\n=== SCENARIO 2: Parallel Research Tasks ===\n');
    perfMonitor.checkpoint('scenario2_start');

    // Create 5 parallel research tasks
    const parallelTasks = Array(5)
      .fill(0)
      .map((_, i) => ({
        description: `Research topic ${i + 1}: ${['Solar', 'Wind', 'Hydro', 'Biomass', 'Geothermal'][i]} energy`,
        requiredCapabilities: ['research'],
        priority: 5,
      }));

    const scenario2Result = await adapter.executeCoordinatedTask(
      'Conduct parallel research on multiple renewable energy sources',
      parallelTasks,
      { executionStrategy: 'parallel' },
    );

    perfMonitor.checkpoint('scenario2_complete');
    perfMonitor.recordMetric(
      'scenario2_output_size',
      typeof scenario2Result.output === 'string'
        ? scenario2Result.output.length
        : JSON.stringify(scenario2Result.output).length,
    );

    // 3. Priority-based execution with error handling
    logger.info(
      '\n=== SCENARIO 3: Priority-Based Tasks with Error Recovery ===\n',
    );
    perfMonitor.checkpoint('scenario3_start');

    // Ensure analysis agent will likely fail in this scenario (set higher error rate)
    analysisAgent['errorRate'] = 0.8; // 80% chance of error

    const scenario3Result = await adapter.executeCoordinatedTask(
      'Research and analyze energy consumption patterns with priority handling',
      [
        {
          description: 'URGENT: Analyze latest energy consumption data',
          requiredCapabilities: ['data-analysis'],
          priority: 10, // Highest priority, but likely to fail
        },
        {
          description: 'Research regional differences in energy usage',
          requiredCapabilities: ['research'],
          priority: 7, // Medium priority
        },
        {
          description: 'Create report summarizing findings',
          requiredCapabilities: ['content-creation'],
          priority: 4, // Low priority
        },
      ],
      { executionStrategy: 'prioritized' },
    );

    perfMonitor.checkpoint('scenario3_complete');
    perfMonitor.recordMetric(
      'scenario3_output_size',
      typeof scenario3Result.output === 'string'
        ? scenario3Result.output.length
        : JSON.stringify(scenario3Result.output).length,
    );

    // Reset error rate for final test
    analysisAgent['errorRate'] = 0.2;

    // 4. Complex dependency workflow
    logger.info('\n=== SCENARIO 4: Complex Task Dependencies ===\n');
    perfMonitor.checkpoint('scenario4_start');

    // Create tasks with dependencies to simulate DAG execution
    const researchTask1 = {
      id: 'research-1',
      name: 'Primary Research',
      description: 'Initial research on energy efficiency technologies',
      requiredCapabilities: ['research'],
      priority: 8,
      metadata: {
        dependencies: [], // No dependencies
      },
    };

    const researchTask2 = {
      id: 'research-2',
      name: 'Secondary Research',
      description: 'Follow-up research on implementation costs',
      requiredCapabilities: ['research'],
      priority: 7,
      metadata: {
        dependencies: [], // No dependencies
      },
    };

    const analysisTask = {
      id: 'analysis-1',
      name: 'Data Analysis',
      description: 'Analyze findings from both research tasks',
      requiredCapabilities: ['data-analysis'],
      priority: 6,
      metadata: {
        dependencies: ['research-1', 'research-2'], // Depends on both research tasks
      },
    };

    const contentTask = {
      id: 'content-1',
      name: 'Report Creation',
      description: 'Create comprehensive report based on analysis',
      requiredCapabilities: ['content-creation'],
      priority: 5,
      metadata: {
        dependencies: ['analysis-1'], // Depends on analysis
      },
    };

    const reviewTask = {
      id: 'review-1',
      name: 'Final Review',
      description: 'Review and approve the final report',
      requiredCapabilities: ['content-review'],
      priority: 4,
      metadata: {
        dependencies: ['content-1'], // Depends on content creation
      },
    };

    // Direct task execution through the supervisor
    const scenario4Result = await supervisor.execute({
      input: 'Execute complex workflow with dependencies',
      capability: 'work-coordination',
      parameters: {
        tasks: [
          researchTask1,
          researchTask2,
          analysisTask,
          contentTask,
          reviewTask,
        ],
        executionStrategy: 'parallel', // Will still respect dependencies
      },
    });

    perfMonitor.checkpoint('scenario4_complete');
    perfMonitor.recordMetric(
      'scenario4_output_size',
      typeof scenario4Result.output === 'string'
        ? scenario4Result.output.length
        : JSON.stringify(scenario4Result.output).length,
    );

    // Complete simulation
    perfMonitor.checkpoint('simulation_complete');

    // Generate final report
    const reportFile = path.join(
      os.tmpdir(),
      `supervisor-simulation-${Date.now()}.json`,
    );
    perfMonitor.saveReport(reportFile);

    logger.info('\n=== SIMULATION COMPLETE ===\n');
    logger.info(`Total execution time: ${perfMonitor.getElapsedMs()}ms`);
    logger.info(`Detailed performance report saved to: ${reportFile}`);

    return {
      scenarios: {
        sequential: scenario1Result,
        parallel: scenario2Result,
        prioritized: scenario3Result,
        complex: scenario4Result,
      },
      performance: perfMonitor.getReport(),
    };
  } catch (error) {
    logger.error('Simulation failed:', { error });
    throw error;
  }
}

// Run the simulation if executed directly
if (require.main === module) {
  runMultiAgentSimulation()
    .then((results) => {
      logger.info('Simulation completed successfully');
    })
    .catch((error) => {
      logger.error('Simulation failed with error:', error);
      process.exit(1);
    });
}

export { runMultiAgentSimulation };
