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

    // Create successful response
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
        // Initialize the agent if not already initialized
        if (!this.agent.getInitializationStatus()) {
          await this.agent.initialize();
        }

        // Return updated state
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
      try {
        // Check if agent is initialized
        if (!this.agent.getInitializationStatus()) {
          await this.agent.initialize();
        }

        // Build request from state
        const request: AgentRequest = {
          input: state.input,
          capability: state.capability,
          parameters: state.parameters,
          context: state.metadata?.context,
        };

        // Execute the agent using the most direct and safe method
        let response: AgentResponse;
        
        // PRODUCTION-READY IMPLEMENTATION:
        // First check if the agent implements WorkflowCompatibleAgent
        if (isWorkflowCompatible(this.agent)) {
          // Preferred: direct access to executeInternal via the interface
          response = await this.agent.executeInternal(request);
        } else {
          // Fallback for agents that don't implement WorkflowCompatibleAgent
          response = await (this.agent as BaseAgentInterface).execute(request);
        }

        // Parse the response, handling both string and object content
        const output = typeof response.output === 'string'
          ? response.output
          : response.output?.content || JSON.stringify(response.output);

        // Update state with response and artifacts
        return {
          ...state,
          output,
          artifacts: response.artifacts || {},
          metrics: {
            ...(state.metrics || {}),
            ...(response.metrics || {}),
          },
          status: WorkflowStatus.READY,
        };
      } catch (error) {
        // Comprehensive error handling
        const errorObject = error instanceof Error 
          ? error 
          : new Error(String(error));
          
        return this.addErrorToState(
          state,
          errorObject,
          'execute',
        );
      }
    };
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
