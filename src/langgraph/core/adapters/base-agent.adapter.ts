import { v4 as uuidv4 } from 'uuid';
import { StateGraph, Annotation } from '@langchain/langgraph';

import { BaseAgent } from '../../../agents/base/base-agent';
import { AgentRequest, AgentResponse } from '../../../agents/interfaces/agent.interface';
import { AgentStatus, BaseAgentState, createBaseAgentState } from '../state/base-agent-state';
import { logStateTransition, startTrace, endTrace } from '../utils/tracing';

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
  ) {}

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
      
      channels: Annotation<Record<string, any>>(),
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
    const graph = new StateGraph(AgentStateSchema);
    
    // 1. Initialization node - initializes the agent if needed
    graph.addNode("initialize", async (state) => {
      try {
        if (!(this.agent as any).isInitialized) {
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
    });

    // 2. Pre-execution node - handles pre-execution tasks
    graph.addNode("pre_execute", async (state) => {
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
    });

    // 3. Execute node - runs the agent's execution logic
    graph.addNode("execute", async (state) => {
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
    });

    // 4. Post-execution node - handles post-execution tasks
    graph.addNode("post_execute", async (state) => {
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
    });

    // 5. Error handling node
    graph.addNode("handle_error", async (state) => {
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
    });

    return graph;
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
      // 1. Initialization step
      state = await this.initialize(state);
      if (state.status === AgentStatus.ERROR) {
        state = await this.handleError(state);
        return this.createResponseFromState(state, startTime);
      }
      
      // 2. Pre-execution step
      state = await this.preExecute(state);
      if (state.status === AgentStatus.ERROR) {
        state = await this.handleError(state);
        return this.createResponseFromState(state, startTime);
      }
      
      // 3. Execution step
      state = await this.executeAgent(state);
      if (state.status === AgentStatus.ERROR) {
        state = await this.handleError(state);
        return this.createResponseFromState(state, startTime);
      }
      
      // 4. Post-execution step
      state = await this.postExecute(state);
      
      // End tracing
      endTrace(traceId, `agent_${this.agent.id}`, state, {
        executionTimeMs: Date.now() - startTime
      });
      
      // Return response
      return this.createResponseFromState(state, startTime);
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
            type: 'adapter_execution_error',
            message: error instanceof Error ? error.message : String(error),
            node: 'execute',
            timestamp: new Date().toISOString(),
            details: error
          }
        ]
      };
      
      // End tracing with error
      endTrace(traceId, `agent_${this.agent.id}`, state, {
        executionTimeMs: Date.now() - startTime,
        error: true
      });
      
      // Return error response
      return {
        output: `Error in agent ${this.agent.name}: ${error instanceof Error ? error.message : String(error)}`,
        artifacts: {
          error: {
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
          }
        },
        metrics: {
          executionTimeMs: Date.now() - startTime,
          tokensUsed: 0,
          stepCount: 0
        }
      };
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
      if (!(this.agent as any).isInitialized) {
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
} 