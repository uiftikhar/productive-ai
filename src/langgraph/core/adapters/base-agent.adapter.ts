import { StateGraph, Annotation } from '@langchain/langgraph';
import { END, START, MessageGraph } from '@langchain/langgraph';

import { BaseAgent } from '../../../agents/base/base-agent';
import { AgentRequest, AgentResponse } from '../../../agents/interfaces/agent.interface';
import { AgentStatus, BaseAgentState, createBaseAgentState } from '../state/base-agent-state';
import { logStateTransition, startTrace, endTrace } from '../utils/tracing';
import { routeOnError } from '../utils/edge-conditions';

// Define node names as a type to ensure consistency
type NodeNames =
  | "__start__"
  | "__end__"
  | "initialize"
  | "pre_execute"
  | "execute"
  | "post_execute"
  | "handle_error";

/**
 * BaseAgentAdapter
 * 
 * This adapter bridges the existing BaseAgent class with a structured workflow.
 * It implements a state machine pattern that provides structure and traceability
 * while avoiding dependency on complex LangGraph APIs.
 */
export class BaseAgentAdapter<T extends BaseAgent = BaseAgent> {
  constructor(
    protected readonly agent: T,
    protected readonly options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
    } = {}
  ) { }

  /**
   * Create a LangGraph StateGraph for the agent
   * 
   * This creates a basic graph without edges that can be expanded incrementally.
   */
  createGraph() {
    // Define state schema using Annotation
    const AgentStateSchema = Annotation.Root({
      // Core identifiers
      agentId: Annotation<string>(),
      runId: Annotation<string>(),

      // Channel is not required as seen in the example - remove it

      // Status tracking
      status: Annotation<string>(),
      lastExecutionTime: Annotation<number | undefined>(),
      errorCount: Annotation<number>({
        default: () => 0,
        reducer: (curr, update) => (curr || 0) + (update || 0),
      }),
      executionCount: Annotation<number>({
        default: () => 0,
        reducer: (curr, update) => (curr || 0) + (update || 0),
      }),

      // Messages and interactions
      messages: Annotation<any[]>({
        default: () => [],
        reducer: (curr, update) => [...(curr || []), ...(Array.isArray(update) ? update : [update])],
      }),
      errors: Annotation<any[]>({
        default: () => [],
        reducer: (curr, update) => [...(curr || []), ...(Array.isArray(update) ? update : [update])],
      }),

      // Request data
      input: Annotation<string>(),
      capability: Annotation<string>(),
      parameters: Annotation<any>(),

      // Response data
      output: Annotation<string>(),
      artifacts: Annotation<any>(),

      // Metrics and metadata
      metrics: Annotation<any>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
      metadata: Annotation<Record<string, any>>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
    });

    // Create a state graph with the defined schema
    // Following the example pattern from data-enrichment-js
    const workflow = new StateGraph(AgentStateSchema);

    type StateType = typeof AgentStateSchema.State;

    workflow
      // 1. Initialization node - initializes the agent if needed
      .addNode("initialize", this._init.bind(this))
      // 2. Pre-execution node - handles pre-execution tasks
      .addNode("pre_execute", this._preExecute.bind(this))
      // 3. Execute node - runs the agent's execution logic
      .addNode("execute", this._execute.bind(this))
      // 4. Post-execution node - handles post-execution tasks
      .addNode("post_execute", this._postExecute.bind(this))
      // 5. Error handling node
      .addNode("handle_error", this._handleError.bind(this))


    // Function to determine routing after each step based on state
    const routeAfterExecution = (state: StateType) => {
      if (state.status === AgentStatus.ERROR) {
        return "handle_error";
      }
      return "post_execute";
    };

    // Function to determine routing after initialization
    const routeAfterInitialization = (state: StateType) => {
      if (state.status === AgentStatus.ERROR) {
        return "handle_error";
      }
      return "pre_execute";
    };

    // Function to determine routing after pre-execution
    const routeAfterPreExecution = (state: StateType) => {
      if (state.status === AgentStatus.ERROR) {
        return "handle_error";
      }
      return "execute";
    };

    // Cast to any to fix TypeScript errors - this is the approach used in the example
    const typedWorkflow = workflow as any;

    // Define the main flow - using the example pattern
    typedWorkflow
      .addEdge(START, "initialize")
      .addConditionalEdges("initialize", routeAfterInitialization)
      .addConditionalEdges("pre_execute", routeAfterPreExecution)
      .addConditionalEdges("execute", routeAfterExecution)
      .addEdge("post_execute", END)
      .addEdge("handle_error", END);

    // Compile the graph for use
    return typedWorkflow.compile();
  }

  /**
   * Create an initial state for the agent workflow from an agent request
   */
  createInitialState(request: AgentRequest): BaseAgentState {
    return createBaseAgentState({
      agentId: this.agent.id,
      input: typeof request.input === 'string'
        ? request.input
        : JSON.stringify(request.input),
      capability: request.capability,
      parameters: request.parameters,
      metadata: {
        context: request.context,
        requestTimestamp: Date.now()
      }
    });
  }

  /**
   * Execute a structured agent workflow
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    // Create initial state from the request
    let state = this.createInitialState(request);

    // Start tracing
    const traceId = startTrace(`agent_${this.agent.id}`, state, {
      agentName: this.agent.name,
      capability: request.capability
    });

    const startTime = Date.now();

    try {
      // Create and compile the graph on demand to ensure fresh state
      const compiledGraph = this.createGraph();

      // Execute the state graph with the initial state
      // Using 'as any' because the return type from LangGraph may not match our BaseAgentState exactly
      const finalState = await compiledGraph.invoke(state) as any;

      // End tracing
      endTrace(traceId, `agent_${this.agent.id}`, finalState, {
        executionTimeMs: Date.now() - startTime
      });

      // Return response
      return this.createResponseFromState(finalState, startTime);
    } catch (error) {
      console.error("Error in agent execution:", error);

      // Update state with error
      state = {
        ...state,
        status: AgentStatus.ERROR,
        errorCount: (state.errorCount || 0) + 1,
        errors: [
          ...(state.errors || []),
          {
            type: 'graph_execution_error',
            message: error instanceof Error ? error.message : String(error),
            node: 'execute',
            timestamp: new Date().toISOString(),
            details: error
          }
        ]
      };

      // Try to handle the error through the error handling node
      try {
        state = await this.handleError(state);
      } catch (secondaryError) {
        console.error("Error in error handling:", secondaryError);
        // Don't throw this secondary error, continue with the original state
      }

      // End tracing with error
      endTrace(traceId, `agent_${this.agent.id}`, state, {
        executionTimeMs: Date.now() - startTime,
        error: true
      });

      // Return error response
      return this.createResponseFromState(state, startTime);
    }
  }

  /**
   * Create a response object from the current state
   */
  private createResponseFromState(state: BaseAgentState, startTime: number): AgentResponse {
    return {
      output: state.output || "No output generated",
      artifacts: state.artifacts || {},
      metrics: {
        executionTimeMs: state.metrics?.lastExecutionTimeMs || (Date.now() - startTime),
        tokensUsed: state.metrics?.tokensUsed || 0,
        stepCount: 4 // Initialize, PreExecute, Execute, PostExecute
      }
    };
  }

  /**
   * Initialize the agent
   */
  private async initialize(state: BaseAgentState): Promise<BaseAgentState> {
    try {
      if (!this.agent.getInitializationStatus()) {
        await this.agent.initialize();
      }

      const newState = {
        ...state,
        status: AgentStatus.READY,
        metadata: {
          ...state.metadata,
          initTimestamp: Date.now()
        }
      };

      logStateTransition("initialize", state, newState, {
        includeFullState: this.options.includeStateInLogs
      });

      return newState;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const errorState = {
        ...state,
        status: AgentStatus.ERROR,
        errorCount: (state.errorCount || 0) + 1,
        errors: [
          ...(state.errors || []),
          {
            type: 'initialization_error',
            message: errorMessage,
            node: 'initialize',
            timestamp: new Date().toISOString(),
            details: error
          }
        ],
        metadata: {
          ...state.metadata,
          initError: errorMessage
        }
      };

      logStateTransition("initialize_error", state, errorState, {
        includeFullState: this.options.includeStateInLogs
      });

      return errorState;
    }
  }

  /**
   * Pre-execution step
   */
  private async preExecute(state: BaseAgentState): Promise<BaseAgentState> {
    try {
      const newState = {
        ...state,
        status: AgentStatus.EXECUTING,
        executionCount: (state.executionCount || 0) + 1,
        metadata: {
          ...state.metadata,
          preExecuteTimestamp: Date.now()
        }
      };

      logStateTransition("pre_execute", state, newState, {
        includeFullState: this.options.includeStateInLogs
      });

      return newState;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const errorState = {
        ...state,
        status: AgentStatus.ERROR,
        errorCount: (state.errorCount || 0) + 1,
        errors: [
          ...(state.errors || []),
          {
            type: 'pre_execution_error',
            message: errorMessage,
            node: 'pre_execute',
            timestamp: new Date().toISOString(),
            details: error
          }
        ],
        metadata: {
          ...state.metadata,
          preExecuteError: errorMessage
        }
      };

      logStateTransition("pre_execute_error", state, errorState, {
        includeFullState: this.options.includeStateInLogs
      });

      return errorState;
    }
  }

  /**
   * Execute the agent
   */
  private async executeAgent(state: BaseAgentState): Promise<BaseAgentState> {
    const startTime = Date.now();

    try {
      // Prepare request from state
      const request: AgentRequest = {
        input: state.input || '',
        capability: state.capability || '',
        parameters: state.parameters,
        context: state.metadata?.context
      };

      // Execute the agent
      const response = await this.agent.execute(request);

      // Update state with response
      const newState = {
        ...state,
        output: typeof response.output === 'string'
          ? response.output
          : JSON.stringify(response.output),
        artifacts: response.artifacts,
        metrics: {
          ...(state.metrics || {
            totalExecutions: 0,
            totalExecutionTimeMs: 0,
            averageExecutionTimeMs: 0,
            tokensUsed: 0,
            errorRate: 0
          }),
          lastExecutionTimeMs: Date.now() - startTime,
          ...(response.metrics || {})
        },
        metadata: {
          ...state.metadata,
          executionTimestamp: Date.now(),
          executionDuration: Date.now() - startTime
        }
      };

      logStateTransition("execute", state, newState, {
        includeFullState: this.options.includeStateInLogs
      });

      return newState;
    } catch (error) {
      // Handle execution error
      const errorMessage = error instanceof Error ? error.message : String(error);

      const errorState = {
        ...state,
        status: AgentStatus.ERROR,
        errorCount: (state.errorCount || 0) + 1,
        errors: [
          ...(state.errors || []),
          {
            type: 'execution_error',
            message: errorMessage,
            node: 'execute',
            timestamp: new Date().toISOString(),
            details: error
          }
        ],
        metadata: {
          ...state.metadata,
          executionTimestamp: Date.now(),
          executionError: errorMessage
        }
      };

      logStateTransition("execute_error", state, errorState, {
        includeFullState: this.options.includeStateInLogs
      });

      return errorState;
    }
  }

  /**
   * Post-execution step
   */
  private async postExecute(state: BaseAgentState): Promise<BaseAgentState> {
    try {
      const newState = {
        ...state,
        status: AgentStatus.READY,
        lastExecutionTime: Date.now(),
        metadata: {
          ...state.metadata,
          postExecuteTimestamp: Date.now()
        }
      };

      logStateTransition("post_execute", state, newState, {
        includeFullState: this.options.includeStateInLogs
      });

      return newState;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const errorState = {
        ...state,
        status: AgentStatus.ERROR,
        errorCount: (state.errorCount || 0) + 1,
        errors: [
          ...(state.errors || []),
          {
            type: 'post_execution_error',
            message: errorMessage,
            node: 'post_execute',
            timestamp: new Date().toISOString(),
            details: error
          }
        ],
        metadata: {
          ...state.metadata,
          postExecuteError: errorMessage
        }
      };

      logStateTransition("post_execute_error", state, errorState, {
        includeFullState: this.options.includeStateInLogs
      });

      return errorState;
    }
  }

  /**
   * Handle errors
   */
  private async handleError(state: BaseAgentState): Promise<BaseAgentState> {
    try {
      // Format error output
      const errorOutput = {
        error: `Error in agent ${this.agent.name}`,
        details: state.errors && Array.isArray(state.errors) && state.errors.length > 0
          ? state.errors[0].message
          : "Unknown error",
        timestamp: new Date().toISOString()
      };

      const newState = {
        ...state,
        output: JSON.stringify(errorOutput),
        status: AgentStatus.ERROR,
        metadata: {
          ...state.metadata,
          errorHandlingTimestamp: Date.now()
        }
      };

      logStateTransition("handle_error", state, newState, {
        includeFullState: this.options.includeStateInLogs
      });

      return newState;
    } catch (error) {
      // Meta error handling (error during error handling)
      console.error("Error in error handling:", error);
      return state;
    }
  }

  private async _init(state: BaseAgentState) {
    try {
      if (!this.agent.getInitializationStatus()) {
        await this.agent.initialize();
      }

      return {
        status: AgentStatus.READY,
        metadata: {
          ...state.metadata,
          initTimestamp: Date.now()
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        status: AgentStatus.ERROR,
        errorCount: 1,
        errors: [
          {
            type: 'initialization_error',
            message: errorMessage,
            node: 'initialize',
            timestamp: new Date().toISOString(),
            details: error
          }
        ],
        metadata: {
          ...state.metadata,
          initError: errorMessage
        }
      };
    }
  }

  private async _preExecute(state: BaseAgentState) {
    try {
      return {
        status: AgentStatus.EXECUTING,
        executionCount: 1,
        metadata: {
          ...state.metadata,
          preExecuteTimestamp: Date.now()
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        status: AgentStatus.ERROR,
        errorCount: 1,
        errors: [
          {
            type: 'pre_execution_error',
            message: errorMessage,
            node: 'pre_execute',
            timestamp: new Date().toISOString(),
            details: error
          }
        ],
        metadata: {
          ...state.metadata,
          preExecuteError: errorMessage
        }
      };
    }
  }

  private async _execute(state: BaseAgentState) {
    const startTime = Date.now();

    try {
      // Prepare request from state
      const request: AgentRequest = {
        input: state.input || '',
        capability: state.capability || '',
        parameters: state.parameters,
        context: state.metadata?.context
      };

      // Execute the agent
      const response = await this.agent.execute(request);

      // Return updated state
      return {
        output: typeof response.output === 'string'
          ? response.output
          : JSON.stringify(response.output),
        artifacts: response.artifacts,
        metrics: {
          lastExecutionTimeMs: Date.now() - startTime,
          ...(response.metrics || {})
        },
        metadata: {
          ...state.metadata,
          executionTimestamp: Date.now(),
          executionDuration: Date.now() - startTime
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        status: AgentStatus.ERROR,
        errorCount: 1,
        errors: [
          {
            type: 'execution_error',
            message: errorMessage,
            node: 'execute',
            timestamp: new Date().toISOString(),
            details: error
          }
        ],
        metadata: {
          ...state.metadata,
          executionTimestamp: Date.now(),
          executionError: errorMessage
        }
      };
    }
  }

  private async _postExecute(state: BaseAgentState) {
    try {
      return {
        status: AgentStatus.READY,
        lastExecutionTime: Date.now(),
        metadata: {
          ...state.metadata,
          postExecuteTimestamp: Date.now()
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        status: AgentStatus.ERROR,
        errorCount: 1,
        errors: [
          {
            type: 'post_execution_error',
            message: errorMessage,
            node: 'post_execute',
            timestamp: new Date().toISOString(),
            details: error
          }
        ],
        metadata: {
          ...state.metadata,
          postExecuteError: errorMessage
        }
      };
    }
  }

  private async _handleError(state: BaseAgentState) {
    try {
      // Format error output
      const errorOutput = {
        error: `Error in agent ${this.agent.name}`,
        details: state.errors && Array.isArray(state.errors) && state.errors.length > 0
          ? state.errors[0].message
          : "Unknown error",
        timestamp: new Date().toISOString()
      };

      return {
        output: JSON.stringify(errorOutput),
        status: AgentStatus.ERROR,
        metadata: {
          ...state.metadata,
          errorHandlingTimestamp: Date.now()
        }
      };
    } catch (error) {
      // Meta error handling (error during error handling)
      console.error("Error in error handling:", error);
      return {};
    }
  }
} 