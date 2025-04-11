import { v4 as uuidv4 } from 'uuid';
import { MasterOrchestratorAgent } from './master-orchestrator.ts';
import { WorkflowDefinitionService, WorkflowDefinition } from './workflow-definition.service.ts';
import { GraphBuilder, WorkflowState } from './graph-builder.ts';
import { AgentRegistryService } from '../services/agent-registry.service.ts';
import { AgentCommunicationBus } from '../messaging/communication-bus-agent.ts';
import { AgentRequest, AgentResponse } from '../interfaces/agent.interface.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { AgentMessage, AgentMessageType, createAgentMessage, AgentMessagePriority } from '../messaging/messaging-agent.ts';

/**
 * Enhanced Orchestrator Service
 * 
 * Extends the master orchestrator with workflow definition capabilities
 * and enhanced graph management
 */
export class EnhancedOrchestratorService {
  private static instance: EnhancedOrchestratorService;
  private orchestrator: MasterOrchestratorAgent;
  private workflowService: WorkflowDefinitionService;
  private graphBuilder: GraphBuilder;
  private registry: AgentRegistryService;
  private comBus: AgentCommunicationBus;
  private logger: Logger;
  
  // Track active workflow executions
  private activeExecutions: Map<string, {
    workflowId: string;
    status: 'running' | 'completed' | 'failed';
    startTime: number;
    endTime?: number;
    state: Partial<WorkflowState>;
  }> = new Map();
  
  // Cache for compiled workflows
  private workflowGraphCache: Map<string, any> = new Map();
  
  private constructor(options: {
    orchestrator?: MasterOrchestratorAgent;
    workflowService?: WorkflowDefinitionService;
    graphBuilder?: GraphBuilder;
    registry?: AgentRegistryService;
    comBus?: AgentCommunicationBus;
    logger?: Logger;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.registry = options.registry || AgentRegistryService.getInstance();
    this.comBus = options.comBus || AgentCommunicationBus.getInstance();
    this.workflowService = options.workflowService || WorkflowDefinitionService.getInstance(this.logger);
    this.graphBuilder = options.graphBuilder || new GraphBuilder({
      logger: this.logger,
      registry: this.registry
    });
    
    // Initialize the orchestrator if not provided
    if (options.orchestrator) {
      this.orchestrator = options.orchestrator;
    } else {
      this.orchestrator = new MasterOrchestratorAgent({
        registry: this.registry,
        comBus: this.comBus,
        logger: this.logger
      });
    }
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(options: {
    orchestrator?: MasterOrchestratorAgent;
    workflowService?: WorkflowDefinitionService;
    graphBuilder?: GraphBuilder;
    registry?: AgentRegistryService;
    comBus?: AgentCommunicationBus;
    logger?: Logger;
  } = {}): EnhancedOrchestratorService {
    if (!EnhancedOrchestratorService.instance) {
      EnhancedOrchestratorService.instance = new EnhancedOrchestratorService(options);
    }
    return EnhancedOrchestratorService.instance;
  }
  
  /**
   * Initialize the orchestrator service
   */
  public async initialize(): Promise<void> {
    this.logger.info('Initializing Enhanced Orchestrator Service');
    
    // Initialize the base orchestrator
    await this.orchestrator.initialize();
    
    // Initialize default workflows
    this.workflowService.initializeDefaultWorkflows();
    
    // Preload workflow graphs into cache
    this.preloadWorkflowGraphs();
    
    this.logger.info('Enhanced Orchestrator Service initialized');
  }
  
  /**
   * Preload workflow graphs into cache
   */
  private preloadWorkflowGraphs(): void {
    const workflows = this.workflowService.listWorkflows();
    
    for (const workflow of workflows) {
      try {
        const graph = this.graphBuilder.createGraphFromWorkflow(workflow);
        this.workflowGraphCache.set(workflow.id, graph);
        this.logger.info(`Preloaded workflow graph: ${workflow.name} (${workflow.id})`);
      } catch (error) {
        this.logger.error(`Failed to preload workflow graph: ${workflow.name} (${workflow.id})`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
  
  /**
   * Get or create a compiled workflow graph
   */
  private getWorkflowGraph(workflowId: string): any {
    // Check cache first
    if (this.workflowGraphCache.has(workflowId)) {
      return this.workflowGraphCache.get(workflowId);
    }
    
    // Get workflow definition
    const workflow = this.workflowService.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    
    // Build and cache the graph
    const graph = this.graphBuilder.createGraphFromWorkflow(workflow);
    this.workflowGraphCache.set(workflowId, graph);
    
    return graph;
  }
  
  /**
   * Execute a workflow by name
   */
  public async executeWorkflowByName(
    name: string,
    input: string,
    context: {
      userId?: string;
      conversationId?: string;
      sessionId?: string;
      taskId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<AgentResponse> {
    const workflow = this.workflowService.getLatestWorkflow(name);
    if (!workflow) {
      throw new Error(`Workflow not found: ${name}`);
    }
    
    return this.executeWorkflow(workflow.id, input, context);
  }
  
  /**
   * Execute a workflow by ID
   */
  public async executeWorkflow(
    workflowId: string,
    input: string,
    context: {
      userId?: string;
      conversationId?: string;
      sessionId?: string;
      taskId?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    
    // Get workflow definition
    const workflow = this.workflowService.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    
    // Get compiled workflow graph
    const workflowGraph = this.getWorkflowGraph(workflowId);
    
    // Create execution ID
    const executionId = uuidv4();
    
    this.logger.info(`Executing workflow: ${workflow.name} (${workflowId})`, {
      executionId,
      userId: context.userId,
      conversationId: context.conversationId
    });
    
    try {
      // Initialize workflow state
      const initialState: WorkflowState = {
        input,
        userId: context.userId,
        conversationId: context.conversationId,
        sessionId: context.sessionId,
        taskId: context.taskId,
        workflow: workflow.name,
        workflowInstanceId: executionId,
        steps: [],
        activeAgents: [],
        metadata: context.metadata || {},
        variables: {}
      };
      
      // Register the execution
      this.activeExecutions.set(executionId, {
        workflowId,
        status: 'running',
        startTime,
        state: initialState
      });
      
      // Execute the workflow with the compiled graph
      const result = await workflowGraph.invoke(initialState);
      
      // Update execution status
      this.activeExecutions.set(executionId, {
        workflowId,
        status: 'completed',
        startTime,
        endTime: Date.now(),
        state: result
      });
      
      // Process the result
      return {
        output: result.result || 'Workflow completed successfully',
        artifacts: {
          executionId,
          workflowId,
          workflowName: workflow.name,
          steps: result.steps,
        },
        metrics: {
          executionTimeMs: Date.now() - startTime,
          stepCount: result.steps?.length || 0
        }
      };
    } catch (error) {
      // Update execution status
      this.activeExecutions.set(executionId, {
        workflowId,
        status: 'failed',
        startTime,
        endTime: Date.now(),
        state: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
      
      this.logger.error(`Workflow execution failed: ${workflow.name} (${workflowId})`, {
        executionId,
        error: error instanceof Error ? error.message : String(error),
        userId: context.userId,
        conversationId: context.conversationId
      });
      
      // Send error notification
      this.comBus.sendMessage(createAgentMessage({
        type: AgentMessageType.ERROR,
        senderId: this.orchestrator.id,
        content: {
          error: error instanceof Error ? error.message : String(error),
          workflow: workflow.name,
          executionId
        },
        priority: AgentMessagePriority.HIGH,
        metadata: {
          userId: context.userId,
          conversationId: context.conversationId
        }
      }));
      
      throw error;
    }
  }
  
  /**
   * Get the status of a workflow execution
   */
  public getExecutionStatus(executionId: string): {
    workflowId: string;
    status: 'running' | 'completed' | 'failed';
    startTime: number;
    endTime?: number;
    steps?: Array<any>;
    result?: string;
    error?: string;
  } | undefined {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      return undefined;
    }
    
    return {
      workflowId: execution.workflowId,
      status: execution.status,
      startTime: execution.startTime,
      endTime: execution.endTime,
      steps: execution.state.steps,
      result: execution.state.result,
      error: execution.state.error
    };
  }
  
  /**
   * Create a new workflow
   */
  public createWorkflow(
    name: string,
    description: string,
    steps: any[],
    branches: any[] = [],
    startAt?: string,
    metadata: Record<string, any> = {}
  ): WorkflowDefinition {
    const workflow = this.workflowService.createWorkflow(
      name,
      description,
      steps,
      branches,
      startAt,
      metadata
    );
    
    // Precompile and cache the workflow graph
    try {
      const graph = this.graphBuilder.createGraphFromWorkflow(workflow);
      this.workflowGraphCache.set(workflow.id, graph);
    } catch (error) {
      this.logger.warn(`Failed to precompile workflow graph: ${workflow.name} (${workflow.id})`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    return workflow;
  }
  
  /**
   * List active workflow executions
   */
  public listActiveExecutions(): Array<{
    executionId: string;
    workflowId: string;
    workflowName?: string;
    status: 'running' | 'completed' | 'failed';
    startTime: number;
    endTime?: number;
  }> {
    return Array.from(this.activeExecutions.entries())
      .map(([executionId, execution]) => {
        const workflow = this.workflowService.getWorkflow(execution.workflowId);
        return {
          executionId,
          workflowId: execution.workflowId,
          workflowName: workflow?.name,
          status: execution.status,
          startTime: execution.startTime,
          endTime: execution.endTime
        };
      });
  }
  
  /**
   * Clean up completed executions older than the specified age
   */
  public cleanupCompletedExecutions(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleanupCount = 0;
    
    for (const [executionId, execution] of this.activeExecutions.entries()) {
      if (execution.status !== 'running' && execution.endTime) {
        const age = now - execution.endTime;
        if (age > maxAgeMs) {
          this.activeExecutions.delete(executionId);
          cleanupCount++;
        }
      }
    }
    
    this.logger.info(`Cleaned up ${cleanupCount} completed workflow executions`);
    return cleanupCount;
  }
} 