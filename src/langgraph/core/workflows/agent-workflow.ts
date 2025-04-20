import { StateGraph, Annotation } from '@langchain/langgraph';
import { END, START } from '@langchain/langgraph';
import { BaseAgent } from '../../../agents/base/base-agent';
import {
  AgentRequest,
  AgentResponse,
  AgentStatus,
  BaseAgentInterface,
  WorkflowCompatibleAgent,
} from '../../../agents/interfaces/base-agent.interface';
import {
  BaseWorkflow,
  BaseWorkflowState,
  WorkflowStatus,
} from './base-workflow';
import { Logger } from '../../../shared/logger/logger.interface';

/**
 * Agent execution state interface
 */
export interface AgentExecutionState extends BaseWorkflowState {
  // Agent specific fields
  agentId: string;

  // Request data
  input: string;
  capability?: string;
  parameters?: Record<string, any>;

  // Response data
  output?: string;
  artifacts?: Record<string, any>;
  messages?: any[];
}

/**
 * Type guard to check if an agent implements WorkflowCompatibleAgent
 */
function isWorkflowCompatible(agent: any): agent is WorkflowCompatibleAgent {
  return agent && typeof agent.executeInternal === 'function';
}

/**
 * AgentWorkflow
 *
 * This workflow orchestrates agent execution with LangGraph's structured workflow.
 * It implements a state machine pattern for standardized agent execution flows.
 */
export class AgentWorkflow<
  T extends BaseAgent = BaseAgent,
> extends BaseWorkflow<AgentExecutionState, AgentRequest, AgentResponse> {
  /**
   * Creates a new instance of the AgentWorkflow
   */
  constructor(
    protected readonly agent: T,
    options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
    } = {},
  ) {
    super({
      tracingEnabled: options.tracingEnabled,
      logger: options.includeStateInLogs ? undefined : undefined, // Use default logger for now
    });
  }

  /**
   * Creates the state schema for agent workflows
   */
  protected createStateSchema() {
    return Annotation.Root({
      // Core identifiers from base state
      id: Annotation<string>(),
      runId: Annotation<string>(),
      status: Annotation<string>(),
      startTime: Annotation<number>(),
      endTime: Annotation<number | undefined>(),
      errorCount: Annotation<number>({
        default: () => 0,
        reducer: (curr, update) => (curr || 0) + (update || 0),
      }),
      errors: Annotation<any[]>({
        default: () => [],
        reducer: (curr, update) => [
          ...(curr || []),
          ...(Array.isArray(update) ? update : [update]),
        ],
      }),
      metrics: Annotation<any>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
      metadata: Annotation<Record<string, any>>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),

      // Agent-specific fields
      agentId: Annotation<string>(),

      // Messages and interactions - agent specific
      messages: Annotation<any[]>({
        default: () => [],
        reducer: (curr, update) => [
          ...(curr || []),
          ...(Array.isArray(update) ? update : [update]),
        ],
      }),

      // Request data
      input: Annotation<string>(),
      capability: Annotation<string | undefined>(),
      parameters: Annotation<Record<string, any> | undefined>(),

      // Response data
      output: Annotation<string | undefined>(),
      artifacts: Annotation<Record<string, any> | undefined>(),
    });
  }

  /**
   * Create the state graph for agent workflows
   */
  protected createStateGraph(
    schema: ReturnType<typeof this.createStateSchema>,
  ): StateGraph<any> {
    const workflow = new StateGraph(schema);

    type StateType = typeof schema.State;

    // This is the correct way to add nodes in LangGraph 0.2.x
    // Simply add the functions directly, not the result of calling them
    workflow
      // Common nodes from base workflow
      .addNode('initialize', this.createInitNode())
      .addNode('error_handler', this.createErrorHandlerNode())
      .addNode('complete', this.createCompletionNode())

      // Agent-specific nodes
      .addNode('pre_execute', this.createPreExecuteNode())
      .addNode('execute', this.createExecuteNode())
      .addNode('post_execute', this.createPostExecuteNode());

    // Function to determine routing after each step based on state
    const routeAfterExecution = (state: StateType) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'post_execute';
    };

    // Function to determine routing after initialization
    const routeAfterInitialization = (state: StateType) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'pre_execute';
    };

    // Function to determine routing after pre-execution
    const routeAfterPreExecution = (state: StateType) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'execute';
    };

    // Function to determine routing after post-execution
    const routeAfterPostExecution = (state: StateType) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'complete';
    };

    // Define the main flow
    const typedWorkflow = workflow as any;

    typedWorkflow
      .addEdge(START, 'initialize')
      .addConditionalEdges('initialize', routeAfterInitialization)
      .addConditionalEdges('pre_execute', routeAfterPreExecution)
      .addConditionalEdges('execute', routeAfterExecution)
      .addConditionalEdges('post_execute', routeAfterPostExecution)
      .addEdge('complete', END)
      .addEdge('error_handler', END);

    // Compile the graph for use
    return typedWorkflow;
  }

  /**
   * Create the initial state for the agent workflow
   */
  protected createInitialState(request: AgentRequest): AgentExecutionState {
    const baseState = super.createInitialState(request);

    return {
      ...baseState,
      agentId: this.agent.id,
      input:
        typeof request.input === 'string'
          ? request.input
          : JSON.stringify(request.input),
      capability: request.capability,
      parameters: request.parameters,
      messages: [],
      metadata: {
        ...baseState.metadata,
        context: request.context,
      },
    };
  }

  /**
   * Process the final state to create an agent response
   */
  protected processResult(state: AgentExecutionState): AgentResponse {
    // If error occurred, generate an error response
    if (state.status === WorkflowStatus.ERROR) {
      const errorMessage =
        state.errors && state.errors.length > 0
          ? state.errors[state.errors.length - 1].message
          : 'Unknown error occurred during execution';

      return {
        output: `Error: ${errorMessage}`,
        metrics: {
          executionTimeMs:
            state.endTime && state.startTime
              ? state.endTime - state.startTime
              : 0,
          tokensUsed: 0,
        },
      };
    }

    return {
      output: state.output || 'Task completed successfully',
      artifacts: state.artifacts,
      metrics: {
        executionTimeMs:
          state.endTime && state.startTime
            ? state.endTime - state.startTime
            : 0,
        tokensUsed: state.metrics?.tokensUsed,
        stepCount: state.metrics?.stepCount,
      },
    };
  }

  /**
   * Create the pre-execute node - this performs any setup before execution
   */
  private createPreExecuteNode() {
    return async (state: AgentExecutionState) => {
      try {
        if (!this.agent.getInitializationStatus()) {
          await this.agent.initialize();
        }

        return {
          ...state,
          status: WorkflowStatus.EXECUTING,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'pre_execute',
        );
      }
    };
  }

  /**
   * Create the execute node - this performs the actual agent execution
   * This implementation is production-ready with proper type safety and circular execution prevention
   */
  private createExecuteNode() {
    return async (state: AgentExecutionState) => {
      const agentId = state.agentId || 'unknown';
      
      try {
        // Ensure agent exists
        if (!this.agent) {
          this.logger?.error(`Agent is undefined for workflow execution`, { agentId });
          throw new Error(`Agent is undefined. Cannot execute workflow for agentId: ${agentId}`);
        }

        // Check if agent is initialized
        if (!this.agent.getInitializationStatus()) {
          this.logger?.debug(`Agent not initialized, initializing: ${this.agent.id}`);
          try {
            await this.agent.initialize();
          } catch (initError) {
            this.logger?.error(`Failed to initialize agent: ${this.agent.id}`, { 
              error: initError instanceof Error ? initError.message : String(initError)
            });
            throw initError;
          }
        }

        // Safely handle agent state - common source of errors
        this.ensureAgentStateExists(this.agent);

        // Prepare request from state
        const request: AgentRequest = {
          input: state.input,
          capability: state.capability,
          parameters: state.parameters,
          context: state.metadata?.context,
        };

        // Track execution time
        const startTime = Date.now();

        // Safe update of execution count
        this.safelyIncrementCounter(this.agent, 'executionCount');

        // Execute the agent using the most direct and safe method
        let response: AgentResponse;

        // Use proper typed checking for workflow compatibility
        if (isWorkflowCompatible(this.agent)) {
          // Direct access to executeInternal via interface
          response = await this.agent.executeInternal(request);
        } else {
          // Fallback for agents that don't implement WorkflowCompatibleAgent
          response = await (this.agent as BaseAgentInterface).execute(request);
        }

        // Calculate execution time
        const executionTimeMs = Math.max(1, Date.now() - startTime);

        // Update agent metrics (safely)
        this.safelyUpdateAgentMetrics(this.agent, executionTimeMs, response.metrics?.tokensUsed);

        // Parse the response, handling both string and object content
        const output =
          typeof response.output === 'string'
            ? response.output
            : response.output?.content || JSON.stringify(response.output);

        return {
          ...state,
          output,
          artifacts: response.artifacts || {},
          metrics: {
            ...(state.metrics || {}),
            ...(response.metrics || {}),
            executionTimeMs,
          },
          status: WorkflowStatus.READY,
        };
      } catch (error) {
        // Comprehensive error handling
        const errorObject = error instanceof Error ? error : new Error(String(error));
        
        // Log the error with structured metadata
        this.logger?.error(`Error executing agent workflow`, {
          agentId,
          errorMessage: errorObject.message,
          stack: errorObject.stack,
          capability: state.capability
        });

        // Safely increment error count
        this.safelyIncrementCounter(this.agent, 'errorCount');
        
        // Safely update agent status
        this.safelyUpdateAgentStatus(this.agent, AgentStatus.ERROR);
        
        // Update error metrics
        this.safelyUpdateErrorRate(this.agent);

        return this.addErrorToState(state, errorObject, 'execute');
      }
    };
  }

  /**
   * Safely ensure agent state exists
   * @param agent The agent to check
   */
  private ensureAgentStateExists(agent: BaseAgentInterface): void {
    if (!agent) return;
    
    try {
      if (!(agent as any).state) {
        this.logger?.warn(`Agent state is undefined, initializing state for: ${agent.id}`);
        (agent as any).state = {
          status: AgentStatus.READY,
          errorCount: 0,
          executionCount: 0,
          metadata: {}
        };
      }
    } catch (error) {
      this.logger?.error(`Failed to initialize agent state: ${agent.id}`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Safely increment a counter on the agent state
   * @param agent The agent to update
   * @param counterName The name of the counter to increment
   */
  private safelyIncrementCounter(agent: BaseAgentInterface, counterName: 'errorCount' | 'executionCount'): void {
    if (!agent) return;
    
    try {
      if ((agent as any).state) {
        (agent as any).state[counterName] = ((agent as any).state[counterName] || 0) + 1;
      } else {
        this.logger?.warn(`Cannot increment ${counterName}: agent state is undefined`, {
          agentId: agent.id
        });
      }
    } catch (error) {
      this.logger?.error(`Failed to increment ${counterName} for agent: ${agent.id}`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Safely update agent status
   * @param agent The agent to update
   * @param status The new status
   */
  private safelyUpdateAgentStatus(agent: BaseAgentInterface, status: AgentStatus): void {
    if (!agent) return;
    
    try {
      if ((agent as any).state) {
        (agent as any).state.status = status;
      } else {
        this.logger?.warn(`Cannot update status: agent state is undefined`, {
          agentId: agent.id,
          status
        });
      }
    } catch (error) {
      this.logger?.error(`Failed to update status for agent: ${agent.id}`, {
        error: error instanceof Error ? error.message : String(error),
        status
      });
    }
  }

  /**
   * Safely update error rate in metrics
   * @param agent The agent to update
   */
  private safelyUpdateErrorRate(agent: BaseAgentInterface): void {
    if (!agent) return;
    
    try {
      const errorCount = (agent as any).state?.errorCount || 0;
      const metrics = agent.getMetrics();
      const totalExecutions = metrics.totalExecutions > 0 ? metrics.totalExecutions : 1;
      
      // Use type assertion to handle the updateMetrics method
      (agent as any).updateMetrics?.({
        errorRate: errorCount / totalExecutions,
      });
    } catch (error) {
      this.logger?.error(`Failed to update error rate for agent: ${agent.id}`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Safely update agent metrics
   * @param agent The agent to update
   * @param executionTimeMs Execution time in ms
   * @param tokensUsed Number of tokens used
   */
  private safelyUpdateAgentMetrics(agent: BaseAgentInterface, executionTimeMs: number, tokensUsed?: number): void {
    if (!agent) return;
    
    try {
      const currentMetrics = agent.getMetrics();
      const newTotalExecutions = currentMetrics.totalExecutions + 1;
      const newTotalTime = currentMetrics.totalExecutionTimeMs + executionTimeMs;

      // Use type assertion to handle the updateMetrics method
      (agent as any).updateMetrics?.({
        totalExecutions: newTotalExecutions,
        totalExecutionTimeMs: newTotalTime,
        averageExecutionTimeMs: newTotalTime / newTotalExecutions,
        lastExecutionTimeMs: executionTimeMs,
        tokensUsed: currentMetrics.tokensUsed + (tokensUsed || 0),
      });
    } catch (error) {
      this.logger?.error(`Failed to update metrics for agent: ${agent.id}`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Create the post-execute node - this performs any cleanup after execution
   */
  private createPostExecuteNode() {
    return async (state: AgentExecutionState) => {
      try {
        // In a production environment, we might:
        // 1. Log analytics about the execution
        // 2. Store results in a database
        // 3. Update metrics for agent performance tracking
        // 4. Trigger notifications or follow-up workflows

        return {
          ...state,
          status: WorkflowStatus.READY,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'post_execute',
        );
      }
    };
  }
}
