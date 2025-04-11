import { v4 as uuid } from 'uuid';
import { GraphBuilder, WorkflowState } from './graph-builder.ts';
import { WorkflowDefinition } from './workflow-definition.service.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { ModelRouterService, ModelSelectionCriteria } from './model-router.service.ts';
import { AgentRegistryService } from '../services/agent-registry.service.ts';
import { AgentDiscoveryService } from '../services/agent-discovery.service.ts';
import { CommunicationBusService } from '../messaging/communication-bus.service.ts';
import { AgentMessage, MessageType, createTaskMessage, createNotificationMessage } from '../messaging/agent-message.interface.ts';

/**
 * Options for workflow execution
 */
export interface EnhancedWorkflowExecutionOptions {
  userId: string;
  conversationId?: string;
  sessionId?: string;
  taskId?: string;
  metadata?: Record<string, any>;
  initialVariables?: Record<string, any>;
  modelCriteria?: ModelSelectionCriteria;
  streamingCallback?: (token: string) => void;
  messageCallback?: (message: AgentMessage) => void;
  discoveryOptions?: {
    performanceWeight?: number;
    reliabilityWeight?: number;
    preferredAgentIds?: Record<string, string[]>;
  };
}

/**
 * Result of workflow execution
 */
export interface EnhancedWorkflowExecutionResult {
  workflowInstanceId: string;
  result: string;
  steps: Array<{
    id: string;
    stepId: string;
    name: string;
    agentId?: string;
    capability?: string;
    input: string;
    output?: string;
    status: 'completed' | 'failed' | 'skipped';
    startTime?: number;
    endTime?: number;
    executionTimeMs?: number;
  }>;
  metrics: {
    totalExecutionTimeMs: number;
    stepMetrics: Record<string, {
      executionTimeMs: number;
      agentId?: string;
      capability?: string;
      success: boolean;
    }>;
  };
  error?: string;
  metadata: Record<string, any>;
  messages: AgentMessage[];
}

/**
 * Enhanced service for executing workflows with integrated agent discovery and messaging
 */
export class EnhancedWorkflowExecutorService {
  private logger: Logger;
  private graphBuilder: GraphBuilder;
  private modelRouter: ModelRouterService;
  private registry: AgentRegistryService;
  private discovery: AgentDiscoveryService;
  private communicationBus: CommunicationBusService;
  
  private static instance: EnhancedWorkflowExecutorService;
  
  /**
   * Get singleton instance
   */
  public static getInstance(options: {
    logger?: Logger;
    graphBuilder?: GraphBuilder;
    modelRouter?: ModelRouterService;
    registry?: AgentRegistryService;
    discovery?: AgentDiscoveryService;
    communicationBus?: CommunicationBusService;
  } = {}): EnhancedWorkflowExecutorService {
    if (!EnhancedWorkflowExecutorService.instance) {
      EnhancedWorkflowExecutorService.instance = new EnhancedWorkflowExecutorService(options);
    }
    return EnhancedWorkflowExecutorService.instance;
  }
  
  /**
   * Private constructor for singleton pattern
   */
  private constructor(options: {
    logger?: Logger;
    graphBuilder?: GraphBuilder;
    modelRouter?: ModelRouterService;
    registry?: AgentRegistryService;
    discovery?: AgentDiscoveryService;
    communicationBus?: CommunicationBusService;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.graphBuilder = options.graphBuilder || new GraphBuilder();
    this.modelRouter = options.modelRouter || ModelRouterService.getInstance();
    this.registry = options.registry || AgentRegistryService.getInstance();
    this.discovery = options.discovery || AgentDiscoveryService.getInstance();
    this.communicationBus = options.communicationBus || CommunicationBusService.getInstance();
  }
  
  /**
   * Execute a workflow with agent discovery and message passing
   */
  public async executeWorkflow(
    workflowDefinition: WorkflowDefinition,
    input: string,
    options: EnhancedWorkflowExecutionOptions
  ): Promise<EnhancedWorkflowExecutionResult> {
    const workflowInstanceId = uuid();
    const startTime = Date.now();
    const messageHistory: AgentMessage[] = [];
    
    // Track metrics for each step
    const stepMetrics: Record<string, {
      executionTimeMs: number;
      agentId?: string;
      capability?: string;
      success: boolean;
    }> = {};
    
    this.logger.info(`Starting enhanced workflow execution`, {
      workflowName: workflowDefinition.name,
      workflowInstanceId,
      userId: options.userId
    });
    
    // Set up message subscription to track all workflow messages
    const messageSubscriptionId = this.communicationBus.subscribe(
      { topic: `workflow:${workflowInstanceId}` },
      (message) => {
        // Store message in history
        messageHistory.push(message);
        
        // Call message callback if provided
        if (options.messageCallback) {
          options.messageCallback(message);
        }
      }
    );
    
    try {
      // Publish workflow start message
      await this.communicationBus.publish(
        createNotificationMessage(
          'workflow-executor',
          undefined,
          {
            workflowId: workflowDefinition.id,
            workflowName: workflowDefinition.name,
            workflowInstanceId,
            input
          },
          {
            topic: `workflow:${workflowInstanceId}`,
            contentType: 'application/json',
            metadata: {
              userId: options.userId,
              conversationId: options.conversationId
            }
          }
        )
      );
      
      // Build the workflow graph
      const graph = this.graphBuilder.createGraphFromWorkflow(workflowDefinition);
      
      // Prepare initial state
      const initialState: WorkflowState = {
        input,
        userId: options.userId,
        conversationId: options.conversationId,
        sessionId: options.sessionId,
        taskId: options.taskId,
        workflow: workflowDefinition.name,
        workflowInstanceId,
        steps: [],
        activeAgents: [],
        metadata: options.metadata || {},
        variables: {
          ...(options.initialVariables || {}),
          discoveryOptions: options.discoveryOptions || {},
          workflowMessages: []
        }
      };
      
      // If model criteria was provided, add it to the initial variables
      if (options.modelCriteria) {
        initialState.variables.modelSelectionCriteria = options.modelCriteria;
      }
      
      // Set up streaming callback if provided
      if (options.streamingCallback) {
        initialState.variables.streamingHandler = {
          handleNewToken: options.streamingCallback,
          handleError: (error: Error) => {
            this.logger.error('Streaming error in workflow', {
              workflowInstanceId,
              error: error.message
            });
          },
          handleComplete: (fullResponse: string) => {
            this.logger.info('Response complete in workflow', {
              workflowInstanceId,
              responseLength: fullResponse.length
            });
          }
        };
        
        // Set streaming required flag
        initialState.variables.streamingRequired = true;
      }
      
      // Intercept the graph execution to enhance steps with agent discovery and messaging
      const enhancedGraph = this.enhanceGraphWithDiscovery(graph, workflowInstanceId, stepMetrics);
      
      // Execute the workflow
      const finalState = await enhancedGraph.invoke(initialState);
      
      // Calculate total execution time
      const totalExecutionTimeMs = Date.now() - startTime;
      
      // Publish workflow completion message
      await this.communicationBus.publish(
        createNotificationMessage(
          'workflow-executor',
          undefined,
          {
            workflowId: workflowDefinition.id,
            workflowName: workflowDefinition.name,
            workflowInstanceId,
            result: finalState.result,
            executionTimeMs: totalExecutionTimeMs,
            type: MessageType.WORKFLOW_COMPLETED
          },
          {
            topic: `workflow:${workflowInstanceId}`,
            contentType: 'application/json',
            metadata: {
              userId: options.userId,
              conversationId: options.conversationId
            }
          }
        )
      );
      
      // Prepare the execution result
      const executionResult: EnhancedWorkflowExecutionResult = {
        workflowInstanceId,
        result: finalState.result || '',
        steps: finalState.steps.map((step: {
          id: string;
          stepId: string;
          name: string;
          agentId?: string;
          capability?: string;
          input: string;
          output?: string;
          status: 'pending' | 'in_progress' | 'completed' | 'failed';
          startTime?: number;
          endTime?: number;
        }) => ({
          id: step.id,
          stepId: step.stepId,
          name: step.name,
          agentId: step.agentId,
          capability: step.capability,
          input: step.input,
          output: step.output,
          status: step.status === 'failed' ? 'failed' : 'completed',
          startTime: step.startTime,
          endTime: step.endTime,
          executionTimeMs: step.endTime && step.startTime ? step.endTime - step.startTime : undefined
        })),
        metrics: {
          totalExecutionTimeMs,
          stepMetrics
        },
        metadata: {
          ...finalState.metadata,
          executionTime: totalExecutionTimeMs
        },
        messages: messageHistory
      };
      
      if (finalState.error) {
        executionResult.error = finalState.error;
      }
      
      this.logger.info(`Enhanced workflow execution completed`, {
        workflowInstanceId,
        stepCount: executionResult.steps.length,
        executionTime: executionResult.metrics.totalExecutionTimeMs
      });
      
      return executionResult;
    } catch (error) {
      this.logger.error(`Enhanced workflow execution failed`, {
        workflowInstanceId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Publish workflow failure message
      await this.communicationBus.publish(
        createNotificationMessage(
          'workflow-executor',
          undefined,
          {
            workflowId: workflowDefinition.id,
            workflowName: workflowDefinition.name,
            workflowInstanceId,
            error: error instanceof Error ? error.message : String(error),
            type: MessageType.WORKFLOW_FAILED
          },
          {
            topic: `workflow:${workflowInstanceId}`,
            contentType: 'application/json',
            metadata: {
              userId: options.userId,
              conversationId: options.conversationId
            }
          }
        )
      );
      
      return {
        workflowInstanceId,
        result: '',
        steps: [],
        metrics: {
          totalExecutionTimeMs: Date.now() - startTime,
          stepMetrics
        },
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          executionTime: Date.now() - startTime
        },
        messages: messageHistory
      };
    } finally {
      // Clean up message subscription
      this.communicationBus.unsubscribe(messageSubscriptionId);
    }
  }
  
  /**
   * Enhance a graph with agent discovery and messaging capabilities
   */
  private enhanceGraphWithDiscovery(
    graph: any,
    workflowInstanceId: string,
    stepMetrics: Record<string, any>
  ): any {
    // In a real implementation, this would wrap each step with discovery and messaging
    // For now, we'll return the graph as-is, but in a real system you would:
    // 1. Intercept each step's execution
    // 2. Use agent discovery to find the best agent for the capability
    // 3. Send messages when steps start and complete
    // 4. Track metrics for each step
    return graph;
  }
  
  /**
   * Discover the best agent for a capability
   */
  private async discoverAgentForCapability(
    capability: string,
    options: {
      preferredAgentIds?: string[];
      excludedAgentIds?: string[];
      performanceWeight?: number;
      reliabilityWeight?: number;
    } = {}
  ): Promise<string | null> {
    // Use the agent discovery service to find the best agent
    const discoveryResult = this.discovery.discoverAgent({
      capability,
      preferredAgentIds: options.preferredAgentIds,
      excludedAgentIds: options.excludedAgentIds,
      performanceWeight: options.performanceWeight,
      reliabilityWeight: options.reliabilityWeight
    });
    
    if (!discoveryResult) {
      this.logger.warn(`No agent found for capability: ${capability}`);
      return null;
    }
    
    return discoveryResult.agentId;
  }
  
  /**
   * Create a new adaptive query workflow configuration
   */
  public createAdaptiveQueryWorkflow(): WorkflowDefinition {
    return {
      id: uuid(),
      name: 'adaptive-query',
      description: 'Process queries with adaptive model selection and knowledge retrieval',
      startAt: 'retrieveKnowledge',
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      
      steps: [
        {
          id: 'retrieveKnowledge',
          name: 'Retrieve Knowledge',
          description: 'Retrieve relevant knowledge for the query',
          capability: 'retrieve_knowledge',
          parameters: (state: Record<string, any>) => ({
            strategy: 'hybrid',
            maxItems: 5,
            minRelevanceScore: 0.6
          }),
          onSuccess: ['selectModel']
        },
        {
          id: 'selectModel',
          name: 'Select Model',
          description: 'Select the appropriate model based on query and context',
          capability: 'select_model',
          onSuccess: ['generateResponse']
        },
        {
          id: 'generateResponse',
          name: 'Generate Response',
          description: 'Generate a response using the selected model and context',
          capability: 'generate_response'
        }
      ],
      
      branches: []
    };
  }
} 