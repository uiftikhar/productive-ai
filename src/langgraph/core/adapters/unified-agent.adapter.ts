import { StateGraph, Annotation } from '@langchain/langgraph';
import { END, START } from '@langchain/langgraph';

import { UnifiedAgent } from '../../../agents/base/unified-agent';
import { 
  AgentRequest, 
  AgentResponse, 
  AgentStatus
} from '../../../agents/interfaces/unified-agent.interface';
import { 
  BaseLangGraphAdapter, 
  BaseLangGraphState,
  WorkflowStatus
} from './base-langgraph.adapter';

/**
 * Agent workflow state interface
 */
export interface AgentWorkflowState extends BaseLangGraphState {
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
 * UnifiedAgentAdapter
 * 
 * This adapter bridges the UnifiedAgent class with LangGraph's structured workflow.
 * It implements a state machine pattern for standardized agent execution flows.
 */
export class UnifiedAgentAdapter<
  T extends UnifiedAgent = UnifiedAgent
> extends BaseLangGraphAdapter<AgentWorkflowState, AgentRequest, AgentResponse> {
  
  /**
   * Creates a new instance of the UnifiedAgentAdapter
   */
  constructor(
    protected readonly agent: T,
    options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
    } = {}
  ) {
    super({
      tracingEnabled: options.tracingEnabled,
      logger: options.includeStateInLogs ? undefined : undefined // Use default logger for now
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
        reducer: (curr, update) => [...(curr || []), ...(Array.isArray(update) ? update : [update])],
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
        reducer: (curr, update) => [...(curr || []), ...(Array.isArray(update) ? update : [update])],
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
  protected createStateGraph(schema: ReturnType<typeof this.createStateSchema>): StateGraph<any> {
    const workflow = new StateGraph(schema);

    type StateType = typeof schema.State;

    workflow
      // Common nodes from base adapter
      .addNode("initialize", this.createInitNode())
      .addNode("error_handler", this.createErrorHandlerNode())
      .addNode("complete", this.createCompletionNode())
      
      // Agent-specific nodes
      .addNode("pre_execute", this.createPreExecuteNode())
      .addNode("execute", this.createExecuteNode())
      .addNode("post_execute", this.createPostExecuteNode());

    // Function to determine routing after each step based on state
    const routeAfterExecution = (state: StateType) => {
      if (state.status === WorkflowStatus.ERROR) {
        return "error_handler";
      }
      return "post_execute";
    };

    // Function to determine routing after initialization
    const routeAfterInitialization = (state: StateType) => {
      if (state.status === WorkflowStatus.ERROR) {
        return "error_handler";
      }
      return "pre_execute";
    };

    // Function to determine routing after pre-execution
    const routeAfterPreExecution = (state: StateType) => {
      if (state.status === WorkflowStatus.ERROR) {
        return "error_handler";
      }
      return "execute";
    };
    
    // Function to determine routing after post-execution
    const routeAfterPostExecution = (state: StateType) => {
      if (state.status === WorkflowStatus.ERROR) {
        return "error_handler";
      }
      return "complete";
    };

    // Define the main flow
    const typedWorkflow = workflow as any;

    typedWorkflow
      .addEdge(START, "initialize")
      .addConditionalEdges("initialize", routeAfterInitialization)
      .addConditionalEdges("pre_execute", routeAfterPreExecution)
      .addConditionalEdges("execute", routeAfterExecution)
      .addConditionalEdges("post_execute", routeAfterPostExecution)
      .addEdge("complete", END)
      .addEdge("error_handler", END);

    // Compile the graph for use
    return typedWorkflow;
  }

  /**
   * Create the initial state for the agent workflow
   */
  protected createInitialState(request: AgentRequest): AgentWorkflowState {
    const baseState = super.createInitialState(request);
    
    return {
      ...baseState,
      agentId: this.agent.id,
      input: typeof request.input === 'string'
        ? request.input
        : JSON.stringify(request.input),
      capability: request.capability,
      parameters: request.parameters,
      messages: [],
      metadata: {
        ...baseState.metadata,
        context: request.context,
      }
    };
  }

  /**
   * Process the final state to create an agent response
   */
  protected processResult(state: AgentWorkflowState): AgentResponse {
    // If error occurred, generate an error response
    if (state.status === WorkflowStatus.ERROR) {
      const errorMessage = state.errors && state.errors.length > 0
        ? state.errors[state.errors.length - 1].message
        : 'Unknown error occurred during execution';
        
      return {
        output: `Error: ${errorMessage}`,
        metrics: {
          executionTimeMs: state.endTime && state.startTime 
            ? state.endTime - state.startTime 
            : 0,
          tokensUsed: 0,
        }
      };
    }
    
    // Create successful response
    return {
      output: state.output || 'Task completed successfully',
      artifacts: state.artifacts,
      metrics: {
        executionTimeMs: state.endTime && state.startTime 
          ? state.endTime - state.startTime 
          : 0,
        tokensUsed: state.metrics?.tokensUsed,
        stepCount: state.metrics?.stepCount,
      }
    };
  }

  /**
   * Create the pre-execute node
   */
  private createPreExecuteNode() {
    return async (state: AgentWorkflowState) => {
      try {
        // Build request from state
        const request: AgentRequest = {
          input: state.input,
          capability: state.capability,
          parameters: state.parameters,
          context: state.metadata?.context,
        };

        // Update state
        return {
          ...state,
          status: WorkflowStatus.EXECUTING,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'pre_execute'
        );
      }
    };
  }

  /**
   * Create the execute node - this performs the actual agent execution
   */
  private createExecuteNode() {
    return async (state: AgentWorkflowState) => {
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

        // Execute the agent
        const response = await this.agent.execute(request);

        // Parse the response
        const output = typeof response.output === 'string'
          ? response.output
          : response.output.content;

        // Update state with response
        return {
          ...state,
          output,
          artifacts: response.artifacts,
          metrics: {
            ...(state.metrics || {}),
            ...(response.metrics || {}),
          },
          status: WorkflowStatus.READY,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'execute'
        );
      }
    };
  }

  /**
   * Create the post-execute node
   */
  private createPostExecuteNode() {
    return async (state: AgentWorkflowState) => {
      try {
        // Record results in state
        return {
          ...state,
          status: WorkflowStatus.COMPLETED,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'post_execute'
        );
      }
    };
  }
} 