import { v4 as uuidv4 } from 'uuid';
import { StateGraph, START, END } from '@langchain/langgraph';
import { BaseAgent } from '../../../agents/base/base-agent';
import { AgentRequest, AgentResponse } from '../../../agents/interfaces/agent.interface';
import { BaseAgentAdapter } from './base-agent.adapter';
import { 
  AgentStatus,
  BaseAgentState
} from '../state/base-agent-state';
import { 
  logStateTransition, 
  startTrace, 
  endTrace 
} from '../utils/tracing';

/**
 * Task execution state definition
 */
interface TaskExecutionState {
  taskId: string;
  input: string;
  capability: string;
  parameters?: Record<string, any>;
  userId?: string;
  status: 'pending' | 'preparing' | 'executing' | 'completed' | 'error' | 'ready' | 'failed' | 'finalized';
  error?: string;
  errorTimestamp?: number;
  retryCount?: number;
  currentRetry?: number;
  maxRetries?: number;
  output?: any;
  tokensUsed?: number;
  executionTimeMs?: number;
  startTime?: number;
  endTime?: number;
  // Add these fields to make AsyncExecutionMarker compatible
  __needsAsync?: true;
  executeRequest?: AgentRequest;
  prepareTime?: number;
  retryTimestamp?: number;
  failureReason?: string;
  finalError?: string;
  finalizeTime?: number;
  totalExecutionTime?: number;
  metadata?: Record<string, any>;
}

/**
 * Parameters for executeTask method
 */
export interface ExecuteTaskParams {
  taskId?: string;
  input: string;
  capability?: string;
  parameters?: Record<string, any>;
  userId?: string;
  maxRetries?: number;
  timeout?: number;
}

/**
 * Results from executeTask
 */
export interface ExecuteTaskResult {
  taskId: string;
  output: any;
  status: string;
  success: boolean;
  metrics?: {
    executionTimeMs: number;
    tokensUsed?: number;
    startTime: number;
    endTime: number;
  };
}

/**
 * Node function type for task execution graph
 */
export type TaskNodeFunction = (
  state: TaskExecutionState,
) => Partial<TaskExecutionState>;

/**
 * TaskExecutionAdapter
 * 
 * This adapter extends the BaseAgentAdapter and specializes it for task execution.
 * It adds specific workflows for task execution with error handling and retries.
 */
export class TaskExecutionAdapter<T extends BaseAgent = BaseAgent> extends BaseAgentAdapter<T> {
  protected maxRetries: number;
  protected defaultTimeout: number;

  constructor(
    protected readonly agent: T,
    protected readonly options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
      maxRetries?: number;
      defaultTimeout?: number;
    } = {}
  ) {
    super(agent, options);
    this.maxRetries = options.maxRetries || 3;
    this.defaultTimeout = options.defaultTimeout || 30000; // 30 seconds default
  }

  /**
   * Execute a task with proper error handling and retries
   */
  async executeTask(params: ExecuteTaskParams): Promise<ExecuteTaskResult> {
    const startTime = Date.now();
    const taskId = params.taskId || uuidv4();
    const userId = params.userId || 'anonymous';
    const maxRetries = params.maxRetries !== undefined ? params.maxRetries : this.maxRetries;
    
    try {
      // 1. Initialize the agent if needed
      if (!this.agent.getInitializationStatus()) {
        await this.agent.initialize();
      }

      // 2. Create initial state
      const initialState: TaskExecutionState = {
        taskId,
        userId,
        input: params.input,
        capability: params.capability!,
        parameters: params.parameters || {},
        status: 'ready',
        currentRetry: 0,
        maxRetries,
        startTime,
        metadata: {
          agentId: this.agent.id
        }
      };

      // 3. Create and run the graph
      const graph = this.createTaskExecutionGraph();
      const traceId = startTrace('task-execution', initialState, {
        agentId: this.agent.id,
        taskId
      });
      
      // 4. Execute the graph
      const result = await graph.invoke(initialState);
      
      // 5. End the trace
      endTrace(traceId, 'task-execution', result, {
        agentId: this.agent.id,
        taskId,
        executionTimeMs: Date.now() - startTime
      });

      // 6. Process and return results
      return {
        taskId: taskId,
        output: result.output,
        status: result.error ? 'error' : 'completed',
        success: !result.error,
        metrics: {
          executionTimeMs: Date.now() - startTime,
          tokensUsed: result.tokensUsed,
          startTime: startTime,
          endTime: Date.now()
        }
      };
    } catch (error) {
      console.error(`Error in task execution for task ${taskId}:`, error);
      
      return {
        taskId: taskId,
        output: {
          error: `Error in task execution: ${error instanceof Error ? error.message : String(error)}`,
          details: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        },
        status: 'error',
        success: false,
        metrics: {
          executionTimeMs: Date.now() - startTime,
          startTime: startTime,
          endTime: Date.now()
        }
      };
    }
  }

  /**
   * Create a LangGraph workflow for task execution
   * Implements a robust execution flow with error handling and retry logic
   */
  private createTaskExecutionGraph() {
    // Define the node functions
    const prepareTask: TaskNodeFunction = (state) => {
      try {
        logStateTransition('prepare', state, {
          ...state,
          status: 'ready',
          prepareTime: Date.now()
        });
        
        const currentTime = Date.now();
        const userId = state.userId ?? "anonymous";
        
        return {
          status: 'ready',
          prepareTime: currentTime,
          userId: userId
        } as Partial<TaskExecutionState>;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error in prepare node:', errorMessage);
        
        return {
          status: 'error',
          error: errorMessage,
          errorTimestamp: Date.now()
        };
      }
    };
    
    const executeTask: TaskNodeFunction = (state) => {
      try {
        logStateTransition('execute', state, {
          ...state,
          status: 'executing'
        });
        
        // Create the agent request
        const request: AgentRequest = {
          input: state.input,
          capability: state.capability,
          parameters: state.parameters || {},
          context: {
            userId: state.userId
          }
        };
        
        // Mark this as requiring async execution via the wrapper
        return {
          __needsAsync: true,
          executeRequest: request
        } as Partial<TaskExecutionState>;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error in execute node:', errorMessage);
        
        return {
          status: 'error',
          error: errorMessage,
          errorTimestamp: Date.now()
        };
      }
    };
    
    const handleError: TaskNodeFunction = (state) => {
      try {
        logStateTransition('error_handler', state, {
          ...state,
          status: state.status
        });
        
        // Check if we should retry
        if (state.currentRetry && state.maxRetries && state.currentRetry < state.maxRetries) {
          return {
            status: 'ready',
            currentRetry: state.currentRetry + 1,
            retryTimestamp: Date.now()
          } as Partial<TaskExecutionState>;
        } else {
          // No more retries, fail the task
          return {
            status: 'failed',
            failureReason: 'Max retries exceeded',
            finalError: state.error
          } as Partial<TaskExecutionState>;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error in error_handler node:', errorMessage);
        
        return {
          status: 'error',
          error: errorMessage,
          errorTimestamp: Date.now()
        };
      }
    };
    
    const finalizeTask: TaskNodeFunction = (state) => {
      try {
        logStateTransition('finalize', state, {
          ...state,
          status: 'finalizing'
        });
        
        const endTime = Date.now();
        const totalExecutionTime = state.startTime ? endTime - state.startTime : 0;
        
        return {
          status: 'finalized',
          finalizeTime: endTime,
          totalExecutionTime
        } as Partial<TaskExecutionState>;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error in finalize node:', errorMessage);
        
        return {
          status: 'error',
          error: errorMessage,
          errorTimestamp: Date.now()
        };
      }
    };
    
    // Wrap node functions to make them compatible with LangGraph's expected type
    const wrapNodeFunction = (fn: TaskNodeFunction) => {
      return {
        invoke: async (state: TaskExecutionState) => {
          const result = fn(state);
          
          // Handle async execution if needed
          if (result && result.__needsAsync && result.executeRequest) {
            try {
              const response = await this.agent.execute(result.executeRequest);
              return {
                output: response.output,
                tokensUsed: response.metrics?.tokensUsed,
                executionTimeMs: response.metrics?.executionTimeMs,
                status: 'completed',
                endTime: Date.now()
              };
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error('Error in execute node:', errorMessage);
              
              return {
                status: 'error',
                error: errorMessage,
                errorTimestamp: Date.now()
              };
            }
          }
          
          return result;
        },
      };
    };
    
    // Create state channels for the graph
    const channels = {
      taskId: {
        value: (current: string, update?: string) => update ?? current,
        default: () => '',
      },
      userId: {
        value: (current: string, update?: string) => update ?? current,
        default: () => 'anonymous',
      },
      input: {
        value: (current: string, update?: string) => update ?? current,
        default: () => '',
      },
      output: {
        value: (current: any, update?: any) => update ?? current,
        default: () => undefined,
      },
      capability: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      parameters: {
        value: (current: Record<string, any> | undefined, update?: Record<string, any>) => {
          if (update) {
            return { ...current, ...update };
          }
          return current;
        },
        default: () => ({}),
      },
      status: {
        value: (current: string, update?: string) => update ?? current,
        default: () => 'initializing',
      },
      currentRetry: {
        value: (current: number, update?: number) => update ?? current,
        default: () => 0,
      },
      maxRetries: {
        value: (current: number, update?: number) => update ?? current,
        default: () => this.maxRetries,
      },
      startTime: {
        value: (current: number, update?: number) => update ?? current,
        default: () => Date.now(),
      },
      endTime: {
        value: (current: number | undefined, update?: number) => update ?? current,
        default: () => undefined,
      },
      tokensUsed: {
        value: (current: number | undefined, update?: number) => update ?? current,
        default: () => undefined,
      },
      executionTimeMs: {
        value: (current: number | undefined, update?: number) => update ?? current,
        default: () => undefined,
      },
      error: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      errorTimestamp: {
        value: (current: number | undefined, update?: number) => update ?? current,
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
      prepareTime: {
        value: (current: number | undefined, update?: number) => update ?? current,
        default: () => undefined,
      },
      retryTimestamp: {
        value: (current: number | undefined, update?: number) => update ?? current,
        default: () => undefined,
      },
      failureReason: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      finalError: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      finalizeTime: {
        value: (current: number | undefined, update?: number) => update ?? current,
        default: () => undefined,
      },
      totalExecutionTime: {
        value: (current: number | undefined, update?: number) => update ?? current,
        default: () => undefined,
      },
    };
    
    // Define the node types
    type NodeNames = 
      | "__start__"
      | "__end__"
      | "prepare"
      | "execute" 
      | "error_handler"
      | "finalize";

    // Create the graph with proper types
    const graph = new StateGraph<TaskExecutionState>({ channels: channels as any });

    // Add nodes to the graph with proper typing
    graph.addNode("prepare" as NodeNames, wrapNodeFunction(prepareTask));
    graph.addNode("execute" as NodeNames, wrapNodeFunction(executeTask));
    graph.addNode("error_handler" as NodeNames, wrapNodeFunction(handleError));
    graph.addNode("finalize" as NodeNames, wrapNodeFunction(finalizeTask));

    // Cast to any to fix TypeScript errors - this is the approach used in the examples
    const typedGraph = graph as any;

    // Add edges to connect the nodes
    typedGraph.addEdge(START, "prepare");
    typedGraph.addEdge("prepare", "execute");
    
    // Add conditional edges
    typedGraph.addConditionalEdges("execute", (state: TaskExecutionState) => {
      if (shouldFinalize(state)) {
        return "finalize";
      } else if (shouldHandleError(state)) {
        return "error_handler";
      }
      return null;
    });
    
    typedGraph.addConditionalEdges("error_handler", (state: TaskExecutionState) => {
      if (shouldFinalize(state)) {
        return "finalize";
      } else if (shouldRetry(state)) {
        return "execute";
      }
      return null;
    });
    
    typedGraph.addEdge("finalize", END);
    
    // Compile and return
    return typedGraph.compile();
  }
}

// Define the condition functions
function shouldFinalize(state: TaskExecutionState) {
  return state.status === 'completed' || state.status === 'finalized';
}

function shouldHandleError(state: TaskExecutionState) {
  return state.status === 'error' || state.status === 'failed';
}

function shouldRetry(state: TaskExecutionState) {
  const currentRetry = state.currentRetry || 0;
  const maxRetries = state.maxRetries || 3;
  return currentRetry < maxRetries;
} 