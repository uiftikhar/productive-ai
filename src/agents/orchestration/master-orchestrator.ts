// src/agents/orchestration/master-orchestrator.ts

import { StateGraph, END, START } from '@langchain/langgraph';
import { BaseAgent } from '../base/base-agent.ts';
import { AgentRequest, AgentResponse } from '../interfaces/agent.interface.ts';
import { AgentCommunicationBus } from '../messaging/communication-bus-agent.ts';
import {
  AgentMessage,
  AgentMessageType,
  createAgentMessage,
  AgentMessagePriority,
} from '../messaging/messaging-agent.ts';
import { AgentRegistryService } from '../services/agent-registry.service.ts';
import { EnhancedOrchestratorService } from './enhanced-orchestrator.service.ts';
import { WorkflowDefinitionService } from './workflow-definition.service.ts';
import { GraphBuilder } from './graph-builder.ts';

/**
 * Orchestrator state type
 */
interface OrchestratorState {
  input: string;
  userId?: string;
  conversationId?: string;
  sessionId?: string;
  taskId?: string;
  workflow?: string;
  currentStep?: string;
  steps: Array<{
    agentId: string;
    input: string;
    output?: string;
    artifacts?: Record<string, any>;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    error?: string;
  }>;
  activeAgents: string[];
  result?: string;
  error?: string;
  metadata: Record<string, any>;
}

/**
 * Master Orchestrator Agent
 * Coordinates workflows between specialized agents using LangGraph
 */
export class MasterOrchestratorAgent extends BaseAgent {
  private registry: AgentRegistryService;
  private comBus: AgentCommunicationBus;
  private workflowGraphs: Map<string, any> = new Map();
  private enhancedOrchestrator: EnhancedOrchestratorService | null = null;
  private workflowService: WorkflowDefinitionService | null = null;
  private graphBuilder: GraphBuilder | null = null;
  private useEnhancedOrchestration: boolean = false;

  constructor(
    options: {
      registry?: AgentRegistryService;
      comBus?: AgentCommunicationBus;
      logger?: any;
      useEnhancedOrchestration?: boolean;
    } = {},
  ) {
    super(
      'Master Orchestrator',
      'Coordinates workflows between specialized agents',
      { logger: options.logger },
    );

    this.registry = options.registry || AgentRegistryService.getInstance();
    this.comBus = options.comBus || AgentCommunicationBus.getInstance();
    this.useEnhancedOrchestration =
      options.useEnhancedOrchestration !== undefined
        ? options.useEnhancedOrchestration
        : true; // Use enhanced orchestration by default

    // Register capabilities
    this.registerCapability({
      name: 'orchestrate_workflow',
      description: 'Orchestrate a multi-agent workflow',
      parameters: {
        workflow: 'Name of the workflow to execute',
        input: 'Input for the workflow',
        metadata: 'Additional metadata for the workflow',
      },
    });

    this.registerCapability({
      name: 'create_workflow',
      description: 'Create a new workflow definition',
      parameters: {
        name: 'Name of the workflow',
        description: 'Description of the workflow',
        steps: 'Array of workflow steps',
        branches: 'Array of workflow branches',
        startAt: 'ID of the first step',
        metadata: 'Additional metadata for the workflow',
      },
    });

    this.registerCapability({
      name: 'get_workflow_status',
      description: 'Get the status of a workflow execution',
      parameters: {
        executionId: 'ID of the workflow execution',
      },
    });

    // Subscribe to communication bus for message passing
    this.comBus.subscribeToRecipient(this.id, this.handleMessage.bind(this));
  }

  /**
   * Initialize the orchestrator
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);

    if (this.useEnhancedOrchestration) {
      this.logger.info('Initializing enhanced orchestration');

      // Initialize enhanced orchestration components
      this.workflowService = WorkflowDefinitionService.getInstance(this.logger);
      this.graphBuilder = new GraphBuilder({
        logger: this.logger,
        registry: this.registry,
      });

      // Initialize the enhanced orchestrator
      this.enhancedOrchestrator = EnhancedOrchestratorService.getInstance({
        orchestrator: this,
        workflowService: this.workflowService,
        graphBuilder: this.graphBuilder,
        registry: this.registry,
        comBus: this.comBus,
        logger: this.logger,
      });

      await this.enhancedOrchestrator.initialize();

      this.logger.info('Enhanced orchestration initialized');
    } else {
      // Initialize default workflows with legacy approach
      this.initializeDefaultWorkflows();

      this.logger.info(
        `Master Orchestrator initialized with ${this.workflowGraphs.size} workflows`,
      );
    }
  }

  /**
   * Initialize default workflows (legacy approach)
   */
  private initializeDefaultWorkflows(): void {
    // Create a simple process node that will handle any input
    const processNode = (state: OrchestratorState) => {
      // In a real implementation, this would process the state and dispatch
      // tasks to appropriate agents, but for now we just create a simple response
      return {
        result: `Processed input: ${state.input}`,
        // Record this execution as a step
        steps: [
          {
            agentId: 'process',
            input: state.input,
            output: `Processed: ${state.input}`,
            status: 'completed' as const,
          },
        ],
      };
    };

    // Create and compile the graph - using method chaining pattern
    const graph = new StateGraph<OrchestratorState>({
      channels: {
        input: {
          value: (current: string, update?: string) => update ?? current,
          default: () => '',
        },
        userId: {
          value: (current: string | undefined, update?: string) =>
            update ?? current,
          default: () => undefined,
        },
        conversationId: {
          value: (current: string | undefined, update?: string) =>
            update ?? current,
          default: () => undefined,
        },
        sessionId: {
          value: (current: string | undefined, update?: string) =>
            update ?? current,
          default: () => undefined,
        },
        taskId: {
          value: (current: string | undefined, update?: string) =>
            update ?? current,
          default: () => undefined,
        },
        workflow: {
          value: (current: string | undefined, update?: string) =>
            update ?? current,
          default: () => undefined,
        },
        currentStep: {
          value: (current: string | undefined, update?: string) =>
            update ?? current,
          default: () => undefined,
        },
        steps: {
          value: (current: Array<any>, update?: Array<any>) => {
            if (update) {
              return [...current, ...update];
            }
            return current;
          },
          default: () => [],
        },
        activeAgents: {
          value: (current: string[], update?: string[]) => {
            if (update) {
              return [...current, ...update];
            }
            return current;
          },
          default: () => [],
        },
        result: {
          value: (current: string | undefined, update?: string) =>
            update ?? current,
          default: () => undefined,
        },
        error: {
          value: (current: string | undefined, update?: string) =>
            update ?? current,
          default: () => undefined,
        },
        metadata: {
          value: (
            current: Record<string, any>,
            update?: Record<string, any>,
          ) => {
            if (update) {
              return { ...current, ...update };
            }
            return current;
          },
          default: () => ({}),
        },
      },
    })
      // Add our process node
      .addNode('process', processNode)
      // Define edges using the START and END constants and casting as needed
      .addEdge(START, 'process' as any)
      .addEdge('process' as any, END);

    // Compile the graph
    const compiledGraph = graph.compile();

    // Store the workflow
    this.workflowGraphs.set('sequential', compiledGraph);
  }

  /**
   * Handle incoming messages to the orchestrator
   */
  private handleMessage(message: AgentMessage): void {
    this.logger.debug(`Received message: ${message.type}`, {
      from: message.senderId,
      messageId: message.id,
    });

    // Process message based on type
    switch (message.type) {
      case AgentMessageType.REQUEST:
        // Handle agent requests
        break;
      case AgentMessageType.RESPONSE:
        // Handle agent responses
        break;
      case AgentMessageType.ERROR:
        // Handle error messages
        this.logger.error(`Error message from agent ${message.senderId}`, {
          error: message.content,
        });
        break;
    }
  }

  /**
   * Execute the orchestrator to coordinate a workflow
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const capability = request.capability || 'orchestrate_workflow';

    if (!this.canHandle(capability)) {
      throw new Error(`Capability not supported: ${capability}`);
    }

    try {
      switch (capability) {
        case 'orchestrate_workflow':
          return await this.executeWorkflow(request);

        case 'create_workflow':
          return await this.createWorkflow(request);

        case 'get_workflow_status':
          return await this.getWorkflowStatus(request);

        default:
          throw new Error(`Capability not implemented: ${capability}`);
      }
    } catch (error) {
      this.logger.error(`Error executing ${capability}:`, {
        error: error instanceof Error ? error.message : String(error),
      });

      // Send error notification
      this.comBus.sendMessage(
        createAgentMessage({
          type: AgentMessageType.ERROR,
          senderId: this.id,
          content: {
            error: error instanceof Error ? error.message : String(error),
            capability,
          },
          priority: AgentMessagePriority.HIGH,
          metadata: {
            userId: request.context?.userId,
            conversationId: request.context?.conversationId,
          },
        }),
      );

      throw error;
    }
  }

  /**
   * Execute a workflow
   */
  private async executeWorkflow(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const userId = request.context?.userId;
    const conversationId = request.context?.conversationId;
    const workflowName = request.parameters?.workflow || 'sequential';
    const input =
      typeof request.input === 'string'
        ? request.input
        : JSON.stringify(request.input);

    // If using enhanced orchestration, delegate to the enhanced orchestrator
    if (this.useEnhancedOrchestration && this.enhancedOrchestrator) {
      return this.enhancedOrchestrator.executeWorkflowByName(
        workflowName,
        input,
        {
          userId,
          conversationId,
          sessionId: request.context?.sessionId,
          taskId: request.parameters?.taskId,
          metadata: {
            ...request.parameters,
            ...request.context?.metadata,
          },
        },
      );
    }

    // Legacy workflow execution
    // Check if workflow exists
    if (!this.workflowGraphs.has(workflowName)) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    this.logger.info(`Executing workflow: ${workflowName}`, {
      userId,
      conversationId,
    });

    // Initialize workflow state
    const initialState: OrchestratorState = {
      input,
      userId,
      conversationId,
      sessionId: request.context?.sessionId,
      taskId: request.parameters?.taskId,
      workflow: workflowName,
      steps: [],
      activeAgents: [],
      metadata: {
        ...request.parameters,
        ...request.context?.metadata,
      },
    };

    // Get the workflow
    const workflowGraph = this.workflowGraphs.get(workflowName);
    if (!workflowGraph) {
      throw new Error(`Workflow ${workflowName} not found`);
    }

    // Execute the workflow with the compiled graph
    const result = await workflowGraph.invoke(initialState);

    // Process the result
    return {
      output: result.result || 'Workflow completed successfully',
      artifacts: {
        steps: result.steps,
        workflow: workflowName,
      },
      metrics: this.processMetrics(startTime, undefined, result.steps.length),
    };
  }

  /**
   * Create a new workflow
   */
  private async createWorkflow(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();

    // Validate required parameters
    if (!request.parameters?.name) {
      throw new Error('Workflow name is required');
    }
    if (
      !request.parameters?.steps ||
      !Array.isArray(request.parameters.steps)
    ) {
      throw new Error('Workflow steps are required');
    }

    const name = request.parameters.name;
    const description = request.parameters.description || '';
    const steps = request.parameters.steps;
    const branches = request.parameters.branches || [];
    const startAt = request.parameters.startAt;
    const metadata = request.parameters.metadata || {};

    // If using enhanced orchestration, delegate to the enhanced orchestrator
    if (this.useEnhancedOrchestration && this.enhancedOrchestrator) {
      const workflow = this.enhancedOrchestrator.createWorkflow(
        name,
        description,
        steps,
        branches,
        startAt,
        metadata,
      );

      return {
        output: `Workflow created: ${workflow.name} (${workflow.id})`,
        artifacts: {
          workflow: {
            id: workflow.id,
            name: workflow.name,
            version: workflow.version,
            steps: workflow.steps.length,
            branches: workflow.branches.length,
          },
        },
        metrics: this.processMetrics(startTime),
      };
    }

    // Legacy workflow creation (simplified)
    this.logger.info(`Creating workflow: ${name} (legacy mode)`);

    return {
      output: `Legacy workflow creation not fully supported. Please enable enhanced orchestration.`,
      metrics: this.processMetrics(startTime),
    };
  }

  /**
   * Get workflow status
   */
  private async getWorkflowStatus(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    // Validate required parameters
    if (!request.parameters?.executionId) {
      throw new Error('Workflow execution ID is required');
    }

    const executionId = request.parameters.executionId;

    // If using enhanced orchestration, delegate to the enhanced orchestrator
    if (this.useEnhancedOrchestration && this.enhancedOrchestrator) {
      const status = this.enhancedOrchestrator.getExecutionStatus(executionId);

      if (!status) {
        return {
          output: `Workflow execution not found: ${executionId}`,
          metrics: this.processMetrics(startTime),
        };
      }

      return {
        output: `Workflow status: ${status.status}`,
        artifacts: {
          status,
        },
        metrics: this.processMetrics(startTime),
      };
    }

    // Legacy implementation (simplified)
    return {
      output: `Legacy workflow status not supported. Please enable enhanced orchestration.`,
      metrics: this.processMetrics(startTime),
    };
  }
}
