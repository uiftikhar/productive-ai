import { GraphBuilder, WorkflowState } from './graph-builder.ts';
import { WorkflowDefinition } from './workflow-definition.service.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { ModelRouterService, ModelSelectionCriteria } from './model-router.service.ts';
import { AgentRegistryService } from '../services/agent-registry.service.ts';
import { v4 as uuid } from 'uuid';

/**
 * Options for workflow execution
 */
export interface WorkflowExecutionOptions {
  userId: string;
  conversationId?: string;
  sessionId?: string;
  taskId?: string;
  metadata?: Record<string, any>;
  initialVariables?: Record<string, any>;
  modelCriteria?: ModelSelectionCriteria;
  streamingCallback?: (token: string) => void;
}

/**
 * Result of workflow execution
 */
export interface WorkflowExecutionResult {
  workflowInstanceId: string;
  result: string;
  steps: Array<{
    id: string;
    stepId: string;
    name: string;
    input: string;
    output?: string;
    status: 'completed' | 'failed';
    startTime?: number;
    endTime?: number;
  }>;
  error?: string;
  metadata: Record<string, any>;
}

/**
 * Service for executing workflows with the Model Router
 */
export class WorkflowExecutorService {
  private logger: Logger;
  private graphBuilder: GraphBuilder;
  private modelRouter: ModelRouterService;
  private registry: AgentRegistryService;
  
  private static instance: WorkflowExecutorService;
  
  /**
   * Get singleton instance
   */
  public static getInstance(options: {
    logger?: Logger;
    graphBuilder?: GraphBuilder;
    modelRouter?: ModelRouterService;
    registry?: AgentRegistryService;
  } = {}): WorkflowExecutorService {
    if (!WorkflowExecutorService.instance) {
      WorkflowExecutorService.instance = new WorkflowExecutorService(options);
    }
    return WorkflowExecutorService.instance;
  }
  
  /**
   * Private constructor for singleton pattern
   */
  private constructor(options: {
    logger?: Logger;
    graphBuilder?: GraphBuilder;
    modelRouter?: ModelRouterService;
    registry?: AgentRegistryService;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.graphBuilder = options.graphBuilder || new GraphBuilder();
    this.modelRouter = options.modelRouter || ModelRouterService.getInstance();
    this.registry = options.registry || AgentRegistryService.getInstance();
  }
  
  /**
   * Execute a workflow with the given input and options
   */
  public async executeWorkflow(
    workflowDefinition: WorkflowDefinition,
    input: string,
    options: WorkflowExecutionOptions
  ): Promise<WorkflowExecutionResult> {
    const workflowInstanceId = uuid();
    const startTime = Date.now();
    
    this.logger.info(`Starting workflow execution`, {
      workflowName: workflowDefinition.name,
      workflowInstanceId,
      userId: options.userId
    });
    
    try {
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
        variables: options.initialVariables || {}
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
      
      // Execute the workflow
      const finalState = await graph.invoke(initialState);
      
      // Prepare the execution result
      const executionResult: WorkflowExecutionResult = {
        workflowInstanceId,
        result: finalState.result || '',
        steps: finalState.steps.map((step: {
          id: string;
          stepId: string;
          name: string;
          input: any;
          output: any;
          status: string;
          startTime: Date;
          endTime: Date;
        }) => ({
          id: step.id,
          stepId: step.stepId,
          name: step.name,
          input: step.input,
          output: step.output,
          status: step.status === 'failed' ? 'failed' : 'completed',
          startTime: step.startTime,
          endTime: step.endTime
        })),
        metadata: {
          ...finalState.metadata,
          executionTime: Date.now() - startTime
        }
      };
      
      if (finalState.error) {
        executionResult.error = finalState.error;
      }
      
      this.logger.info(`Workflow execution completed`, {
        workflowInstanceId,
        stepCount: executionResult.steps.length,
        executionTime: executionResult.metadata.executionTime
      });
      
      return executionResult;
    } catch (error) {
      this.logger.error(`Workflow execution failed`, {
        workflowInstanceId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        workflowInstanceId,
        result: '',
        steps: [],
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          executionTime: Date.now() - startTime
        }
      };
    }
  }
  
  /**
   * Get a specific workflow by name
   */
  public getWorkflowByName(name: string): WorkflowDefinition | undefined {
    // In a real implementation, this would look up workflows from a registry or configuration
    // For now, we'll return a simple workflow for demonstration
    if (name === 'adaptive-query') {
      return {
        id: 'adaptive-query-workflow',
        name: 'adaptive-query',
        description: 'Process queries with adaptive model selection',
        startAt: 'analyzeQuery',
        version: '1.0.0',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        steps: [
          {
            id: 'analyzeQuery',
            name: 'Analyze Query',
            description: 'Analyze the query complexity and determine appropriate processing',
            onSuccess: ['determineModelRequirements']
          },
          {
            id: 'determineModelRequirements',
            name: 'Determine Model Requirements',
            description: 'Select appropriate model based on query analysis',
            onSuccess: ['generateResponse']
          },
          {
            id: 'generateResponse',
            name: 'Generate Response',
            description: 'Generate a response using the selected model'
          }
        ],
        branches: []
      };
    }
    
    return undefined;
  }
  
  /**
   * Create a new adaptive query workflow configuration
   */
  public createAdaptiveQueryWorkflow(): WorkflowDefinition {
    return {
      id: 'adaptive-query-workflow',
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
          agentId: 'knowledge-retrieval',
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
          // This step would be handled by the workflow executor with the model router
          onSuccess: ['generateResponse']
        },
        {
          id: 'generateResponse',
          name: 'Generate Response',
          description: 'Generate a response using the selected model and context',
          // This step would be handled by the workflow executor with the model router
        }
      ],
      branches: []
    };
  }
} 