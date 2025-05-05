import { StateGraph, AnnotationRoot } from '@langchain/langgraph';
import { v4 as uuidv4 } from 'uuid';

import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { ISharedMemory } from '../../agentic-meeting-analysis/interfaces/memory.interface';
import { IStateRepository } from '../../agentic-meeting-analysis/interfaces/state.interface';

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
 * Standard base state interface for LangGraph adapters
 */
export interface BaseLangGraphState {
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
 * Base adapter for LangGraph-based workflows
 *
 * This class provides common functionality and standardized patterns
 * for implementing LangGraph workflows with shared memory integration.
 */
export abstract class BaseLangGraphAdapter<
  TState extends BaseLangGraphState = BaseLangGraphState,
  TInput = any,
  TOutput = any,
> {
  protected logger: Logger;
  protected sharedMemory?: ISharedMemory;
  protected stateRepository?: IStateRepository;
  protected tracingEnabled: boolean;
  protected memoryNamespace: string;

  /**
   * Creates a new instance of the base LangGraph adapter
   */
  constructor(
    options: {
      logger?: Logger;
      tracingEnabled?: boolean;
      sharedMemory?: ISharedMemory;
      stateRepository?: IStateRepository;
      memoryNamespace?: string;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.sharedMemory = options.sharedMemory;
    this.stateRepository = options.stateRepository;
    this.tracingEnabled = options.tracingEnabled || false;
    this.memoryNamespace = options.memoryNamespace || 'workflow';
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
    const baseState: BaseLangGraphState = {
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
   * Initialize shared memory for this workflow run
   * @param state The initial state
   */
  protected async initializeSharedMemory(state: TState): Promise<void> {
    if (!this.sharedMemory) {
      return;
    }

    try {
      // Store the initial state in shared memory
      await this.sharedMemory.write(
        `workflow:${state.id}:state`,
        state,
        this.memoryNamespace,
        'system',
        { operation: 'initialize' }
      );

      // Store execution metadata
      await this.sharedMemory.write(
        `workflow:${state.id}:metadata`,
        {
          adapterId: this.constructor.name,
          startTime: state.startTime,
          status: state.status
        },
        this.memoryNamespace,
        'system',
        { operation: 'initialize' }
      );

      this.logger.debug('Initialized shared memory for workflow', {
        workflowId: state.id,
        runId: state.runId
      });
    } catch (error) {
      this.logger.error('Failed to initialize shared memory', {
        error: error instanceof Error ? error.message : String(error),
        workflowId: state.id
      });
    }
  }

  /**
   * Update shared memory with latest state
   * @param state The current state
   */
  protected async updateSharedMemory(state: TState): Promise<void> {
    if (!this.sharedMemory) {
      return;
    }

    try {
      // Update the state in shared memory
      await this.sharedMemory.write(
        `workflow:${state.id}:state`,
        state,
        this.memoryNamespace,
        'system',
        { operation: 'update' }
      );

      // Update status
      await this.sharedMemory.write(
        `workflow:${state.id}:status`,
        state.status,
        this.memoryNamespace,
        'system',
        { operation: 'update' }
      );

      // Add to execution timeline
      await this.sharedMemory.atomicUpdate<any[]>(
        `workflow:${state.id}:timeline`,
        (timeline = []) => [
          ...timeline,
          {
            timestamp: Date.now(),
            status: state.status,
            metrics: state.metrics
          }
        ],
        this.memoryNamespace,
        'system',
        { operation: 'append' }
      );

      this.logger.debug('Updated shared memory with latest state', {
        workflowId: state.id,
        status: state.status
      });
    } catch (error) {
      this.logger.error('Failed to update shared memory', {
        error: error instanceof Error ? error.message : String(error),
        workflowId: state.id
      });
    }
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
        adapterId: this.constructor.name,
      });

      const schema = this.createStateSchema();

      const graph = this.createStateGraph(schema);

      // Compile the graph
      const compiledGraph = graph.compile();

      const initialState = this.createInitialState(input);
      
      // Initialize shared memory with initial state
      await this.initializeSharedMemory(initialState);

      // Execute the graph
      const finalState = (await compiledGraph.invoke(initialState)) as TState;
      
      // Update shared memory with final state
      await this.updateSharedMemory(finalState);

      const result = this.processResult(finalState);

      // Log execution metrics
      this.logger.info('Workflow completed successfully', {
        executionTimeMs: Date.now() - startTime,
        adapterId: this.constructor.name,
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
  protected addErrorToState(
    state: TState,
    error: Error | string,
    node?: string,
  ): TState {
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

    const updatedState = {
      ...state,
      status: WorkflowStatus.ERROR,
      errorCount: state.errorCount + 1,
      errors: [...(state.errors || []), errorObj],
    } as TState;

    // Update shared memory with error state
    this.updateSharedMemory(updatedState).catch(e => {
      this.logger.error('Failed to update shared memory with error state', {
        error: e instanceof Error ? e.message : String(e),
        workflowId: state.id
      });
    });

    return updatedState;
  }

  /**
   * Handle an error that occurred during execution
   * @param error The error that occurred
   * @param input The input that was being processed
   * @param startTime The time when execution started
   * @returns An error result
   */
  protected async handleExecutionError(
    error: unknown,
    input: TInput,
    startTime: number,
  ): Promise<TOutput> {
    const executionTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    this.logger.error('Error executing workflow', {
      error: errorMessage,
      input: typeof input === 'object' ? JSON.stringify(input) : String(input),
      executionTimeMs,
      adapterId: this.constructor.name,
    });

    // Update shared memory with error information
    if (this.sharedMemory) {
      try {
        // Create an error entry in shared memory
        await this.sharedMemory.write(
          `workflow:errors:${Date.now()}`,
          {
            error: errorMessage,
            adapterId: this.constructor.name,
            input: typeof input === 'object' ? JSON.stringify(input) : String(input),
            timestamp: new Date().toISOString(),
            executionTimeMs
          },
          'errors',
          'system',
          { operation: 'log_error' }
        );
      } catch (e) {
        this.logger.error('Failed to log error to shared memory', {
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }

    // Child classes should override this method to provide specific error handling
    throw new WorkflowError(
      `Workflow execution failed: ${errorMessage}`,
      'EXECUTION_FAILURE',
      { executionTimeMs },
    );
  }

  /**
   * Process the final state to produce the output
   * @param state The final state
   * @returns The output
   */
  protected abstract processResult(state: TState): TOutput;

  /**
   * Create a standard error handler node for the graph
   * @returns A function that handles errors in the graph
   */
  protected createErrorHandlerNode() {
    return async (state: TState) => {
      this.logger.warn('Error handler node activated', {
        errorCount: state.errorCount,
        adapterId: this.constructor.name,
      });

      // If no errors present, add a generic one
      if (!state.errors || state.errors.length === 0) {
        return this.addErrorToState(
          state,
          'Unknown error occurred during workflow execution',
          'error_handler',
        );
      }

      return state;
    };
  }

  /**
   * Create a standard completion node for the graph
   * @returns A function that handles workflow completion
   */
  protected createCompletionNode() {
    return async (state: TState) => {
      const now = Date.now();
      const completedState = {
        ...state,
        status: WorkflowStatus.COMPLETED,
        endTime: now,
        metadata: {
          ...state.metadata,
          completedAt: new Date(now).toISOString(),
        },
      };

      this.logger.info('Workflow completed', {
        workflowId: state.id,
        runId: state.runId,
        executionTimeMs: now - (state.startTime || now),
      });

      // Update shared memory with completed state
      await this.updateSharedMemory(completedState);

      return completedState;
    };
  }

  /**
   * Create a standard initialization node for the graph
   * @returns A function that handles workflow initialization
   */
  protected createInitNode() {
    return async (state: TState) => {
      const initializedState = {
        ...state,
        status: WorkflowStatus.READY,
        metadata: {
          ...state.metadata,
          initializedAt: new Date().toISOString(),
        },
      };

      this.logger.info('Workflow initialized', {
        workflowId: state.id,
        runId: state.runId,
      });

      return initializedState;
    };
  }

  /**
   * Create a condition function to route to error handler if errors exist
   * @returns A function that determines if an error exists
   */
  protected createErrorRouteCondition() {
    return (state: TState) => {
      const hasErrors = state.errorCount > 0;
      return hasErrors ? 'error' : 'continue';
    };
  }

  /**
   * Extract standard metrics from state for monitoring
   * @param state The current state
   * @returns Object containing metrics
   */
  protected getMetricsFromState(state: TState): Record<string, any> {
    const now = Date.now();
    return {
      workflowId: state.id,
      runId: state.runId,
      status: state.status,
      errorCount: state.errorCount,
      executionTimeMs: now - (state.startTime || now),
      ...(state.metrics || {}),
    };
  }
}
