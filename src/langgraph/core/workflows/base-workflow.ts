import { StateGraph, AnnotationRoot } from '@langchain/langgraph';
import { v4 as uuidv4 } from 'uuid';

import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * Execution status enum for workflows
 */
export enum WorkflowStatus {
  INITIALIZING = 'initializing',
  READY = 'ready',
  EXECUTING = 'executing',
  ERROR = 'error',
  COMPLETED = 'completed',
  TERMINATED = 'terminated',
}

/**
 * Base error type for LangGraph workflow errors
 */
export class WorkflowError extends Error {
  constructor(
    message: string,
    readonly code: string = 'WORKFLOW_ERROR',
    readonly details?: Record<string, any>,
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}

/**
 * Standard base state interface for LangGraph workflows
 */
export interface BaseWorkflowState {
  // Core identifiers
  id: string;
  runId: string;

  // Status tracking
  status: WorkflowStatus;
  startTime?: number;
  endTime?: number;
  errorCount: number;

  // Error tracking
  errors?: Array<{
    message: string;
    code: string;
    node?: string;
    timestamp: string;
    details?: Record<string, any>;
  }>;

  // Metrics and metadata
  metrics?: Record<string, any>;
  metadata: Record<string, any>;
}

/**
 * Base workflow class for LangGraph-based workflow orchestration
 *
 * This class provides common functionality and standardized patterns
 * for implementing LangGraph workflows.
 */
export abstract class BaseWorkflow<
  TState extends BaseWorkflowState = BaseWorkflowState,
  TInput = any,
  TOutput = any,
> {
  protected logger: Logger;

  /**
   * Creates a new instance of the base workflow
   */
  constructor(
    options: {
      logger?: Logger;
      tracingEnabled?: boolean;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
  }

  /**
   * Create the state annotation schema for the LangGraph workflow
   * This must be implemented by child classes
   */
  protected abstract createStateSchema(): AnnotationRoot<any>;

  /**
   * Create the state graph for the workflow
   * This must be implemented by child classes
   */
  protected abstract createStateGraph(
    schema: ReturnType<typeof this.createStateSchema>,
  ): StateGraph<any>;

  /**
   * Create the initial state for the workflow
   * @param input The input to the workflow
   * @returns The initial state
   */
  protected createInitialState(input: TInput): TState {
    const baseState: BaseWorkflowState = {
      id: uuidv4(),
      runId: uuidv4(),
      status: WorkflowStatus.INITIALIZING,
      startTime: Date.now(),
      errorCount: 0,
      metadata: {
        input,
        createdAt: new Date().toISOString(),
      },
    };

    return baseState as TState;
  }

  /**
   * Execute the workflow with the given input
   * @param input The input to the workflow
   * @returns The output of the workflow
   */
  async execute(input: TInput): Promise<TOutput> {
    const startTime = Date.now();

    try {
      this.logger.info('Executing workflow', {
        input:
          typeof input === 'object' ? JSON.stringify(input) : String(input),
        workflowId: this.constructor.name,
      });

      // Create the state schema
      const schema = this.createStateSchema();

      // Create the state graph
      const graph = this.createStateGraph(schema);

      // Compile the graph
      const compiledGraph = graph.compile();

      // Create the initial state
      const initialState = this.createInitialState(input);

      // Execute the graph
      const finalState = (await compiledGraph.invoke(initialState)) as TState;

      // Process the result
      const result = this.processResult(finalState);

      // Log execution metrics
      this.logger.info('Workflow completed successfully', {
        executionTimeMs: Date.now() - startTime,
        workflowId: this.constructor.name,
      });

      return result;
    } catch (error) {
      return this.handleExecutionError(error, input, startTime);
    }
  }

  /**
   * Add an error to the state
   * @param state The current state
   * @param error The error that occurred
   * @param node The node where the error occurred (optional)
   * @returns The updated state with the error added
   */
  protected addErrorToState<T extends BaseWorkflowState>(
    state: T,
    error: Error | string,
    node?: string,
  ): T {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorCode =
      error instanceof WorkflowError ? error.code : 'UNKNOWN_ERROR';
    const errorDetails =
      error instanceof WorkflowError ? error.details : undefined;

    const errorObj = {
      message: errorMessage,
      code: errorCode,
      node,
      timestamp: new Date().toISOString(),
      details: errorDetails,
    };

    return {
      ...state,
      status: WorkflowStatus.ERROR,
      errorCount: state.errorCount + 1,
      errors: [...(state.errors || []), errorObj],
    } as T;
  }

  /**
   * Handle execution errors
   * @param error The error that occurred
   * @param input The input that caused the error
   * @param startTime The time the execution started
   * @returns A standard error response
   */
  protected async handleExecutionError(
    error: unknown,
    input: TInput,
    startTime: number,
  ): Promise<TOutput> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    this.logger.error(`Workflow execution error: ${errorMessage}`, {
      error,
      input: typeof input === 'object' ? JSON.stringify(input) : String(input),
      executionTimeMs: Date.now() - startTime,
      workflowId: this.constructor.name,
    });

    // Let child classes handle the error
    throw error;
  }

  /**
   * Process the final state to create the output
   * This must be implemented by child classes
   */
  protected abstract processResult(state: TState): TOutput;

  /**
   * Create a standard error handler node for the graph
   * @returns A function that handles errors in the graph
   */
  protected createErrorHandlerNode() {
    return async (state: TState) => {
      try {
        this.logger.warn('Error handler node activated', {
          errors: state.errors,
          status: state.status,
          runId: state.runId,
        });

        // Update the state with terminated status
        return {
          ...state,
          status: WorkflowStatus.ERROR,
          endTime: Date.now(),
        };
      } catch (error) {
        this.logger.error('Error in error handler node', {
          error: error instanceof Error ? error.message : String(error),
        });
        return state;
      }
    };
  }

  /**
   * Create a standard completion node for the graph
   * @returns A function that finalizes the workflow
   */
  protected createCompletionNode() {
    return async (state: TState) => {
      try {
        return {
          ...state,
          status: WorkflowStatus.COMPLETED,
          endTime: Date.now(),
        };
      } catch (error) {
        return this.addErrorToState(state, 'Error in completion node');
      }
    };
  }

  /**
   * Create a standard initialization node for the graph
   * @returns A function that initializes the workflow
   */
  protected createInitNode() {
    return async (state: TState) => {
      this.logger.debug('Initializing workflow', {
        runId: state.runId,
        workflowId: this.constructor.name,
      });

      return {
        ...state,
        status: WorkflowStatus.READY,
      };
    };
  }

  /**
   * Create a standard error route condition
   * @returns A function that determines if the state has an error
   */
  protected createErrorRouteCondition() {
    return (state: TState) => {
      return state.status === WorkflowStatus.ERROR;
    };
  }

  /**
   * Get metrics from the state
   * @param state The current state
   * @returns A metrics object
   */
  protected getMetricsFromState(state: TState): Record<string, any> {
    return {
      ...(state.metrics || {}),
      executionTimeMs:
        state.endTime && state.startTime
          ? state.endTime - state.startTime
          : undefined,
      errorCount: state.errorCount,
    };
  }
}
