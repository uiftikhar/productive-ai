// src/agents/orchestration/master-orchestrator.agent.ts

import { StateGraph, END, START } from '@langchain/langgraph';
import { BaseAgent } from '../base/base-agent.ts';
import { AgentRequest, AgentResponse } from '../interfaces/agent.interface.ts';
import { AgentCommunicationBus } from '../messaging/communication-bus-agent.ts';
import { AgentMessage, AgentMessageType, createAgentMessage, AgentMessagePriority } from '../messaging/messaging-agent.ts';
import { AgentRegistryService } from '../services/agent-registry.service.ts';
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
  
  constructor(options: {
    registry?: AgentRegistryService;
    comBus?: AgentCommunicationBus;
    logger?: any;
  } = {}) {
    super(
      'Master Orchestrator',
      'Coordinates workflows between specialized agents',
      { logger: options.logger }
    );
    
    this.registry = options.registry || AgentRegistryService.getInstance();
    this.comBus = options.comBus || AgentCommunicationBus.getInstance();
    
    // Register capabilities
    this.registerCapability({
      name: 'orchestrate_workflow',
      description: 'Orchestrate a multi-agent workflow',
      parameters: {
        workflow: 'Name of the workflow to execute',
        input: 'Input for the workflow',
        metadata: 'Additional metadata for the workflow'
      }
    });

    this.registerCapability({
      name: 'create_workflow',
      description: 'Create a new workflow definition',
      parameters: {
        name: 'Name of the workflow',
        steps: 'Array of workflow steps',
        metadata: 'Additional metadata for the workflow'
      }
    });
    
    // Subscribe to communication bus for message passing
    this.comBus.subscribeToRecipient(this.id, this.handleMessage.bind(this));
  }
  
  /**
   * Initialize the orchestrator
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);
    
    // Initialize default workflows
    this.initializeDefaultWorkflows();
    
    this.logger.info(`Master Orchestrator initialized with ${this.workflowGraphs.size} workflows`);
  }
  
  /**
   * Initialize default workflows
   */
  private initializeDefaultWorkflows(): void {
    // Create a simple process node that will handle any input
    const processNode = (state: OrchestratorState) => {
      // In a real implementation, this would process the state and dispatch
      // tasks to appropriate agents, but for now we just create a simple response
      return {
        result: `Processed input: ${state.input}`,
        // Record this execution as a step
        steps: [{
          agentId: 'process',
          input: state.input,
          output: `Processed: ${state.input}`,
          status: 'completed' as const
        }]
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
          value: (current: string | undefined, update?: string) => update ?? current,
          default: () => undefined,
        },
        conversationId: {
          value: (current: string | undefined, update?: string) => update ?? current,
          default: () => undefined,
        },
        sessionId: {
          value: (current: string | undefined, update?: string) => update ?? current,
          default: () => undefined,
        },
        taskId: {
          value: (current: string | undefined, update?: string) => update ?? current,
          default: () => undefined,
        },
        workflow: {
          value: (current: string | undefined, update?: string) => update ?? current,
          default: () => undefined,
        },
        currentStep: {
          value: (current: string | undefined, update?: string) => update ?? current,
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
          value: (current: string | undefined, update?: string) => update ?? current,
          default: () => undefined,
        },
        error: {
          value: (current: string | undefined, update?: string) => update ?? current,
          default: () => undefined,
        },
        metadata: {
          value: (current: Record<string, any>, update?: Record<string, any>) => {
            if (update) {
              return { ...current, ...update };
            }
            return current;
          },
          default: () => ({}),
        },
      }
    })
    // Add our process node
    .addNode("process", processNode)
    // Define edges using the START and END constants and casting as needed
    .addEdge(START, "process" as any)
    .addEdge("process" as any, END);

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
      messageId: message.id
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
          error: message.content
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
    
    const userId = request.context?.userId;
    const conversationId = request.context?.conversationId;
    const workflowName = request.parameters?.workflow || 'sequential';
    const input = typeof request.input === 'string' 
      ? request.input 
      : JSON.stringify(request.input);

    // Check if workflow exists
    if (!this.workflowGraphs.has(workflowName)) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }
    
    this.logger.info(`Executing workflow: ${workflowName}`, {
      userId,
      conversationId
    });
    
    try {
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
          ...request.context?.metadata
        }
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
          workflow: workflowName
        },
        metrics: this.processMetrics(
          startTime, 
          undefined, 
          result.steps.length
        )
      };
    } catch (error) {
      this.logger.error(`Workflow execution failed: ${workflowName}`, {
        error: error instanceof Error ? error.message : String(error),
        userId,
        conversationId
      });
      
      // Send error notification
      this.comBus.sendMessage(createAgentMessage({
        type: AgentMessageType.ERROR,
        senderId: this.id,
        content: {
          error: error instanceof Error ? error.message : String(error),
          workflow: workflowName
        },
        priority: AgentMessagePriority.HIGH,
        metadata: {
          userId,
          conversationId
        }
      }));
      
      throw error;
    }
  }
}