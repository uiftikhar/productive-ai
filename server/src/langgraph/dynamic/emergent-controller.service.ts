import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

import {
  DynamicGraphService,
  DynamicGraphState,
} from './dynamic-graph.service';
import {
  AgentDecisionNodeService,
  DecisionType,
} from './agent-decision-node.service';

/**
 * Status of the emergent workflow execution
 */
export enum EmergentExecutionStatus {
  CREATED = 'created',
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TERMINATED = 'terminated',
}

/**
 * Configuration for the emergent controller
 */
export interface EmergentControllerConfig {
  maxSteps?: number;
  maxDecisionNodes?: number;
  maxExecutionTimeMs?: number;
  automaticRecovery?: boolean;
  persistStateAfterEachStep?: boolean;
  allowParallelExecution?: boolean;
  recordAllStates?: boolean;
}

/**
 * Extended state for the emergent controller
 */
export interface EmergentControllerState extends DynamicGraphState {
  status: EmergentExecutionStatus;
  startTime: number;
  endTime?: number;
  stepCount: number;
  stateHistory?: DynamicGraphState[];
  activeDecisionNodeIds: string[];
  completedNodeIds: string[];
}

/**
 * Service that manages emergent workflow execution through a dynamic graph
 */
export class EmergentControllerService {
  private readonly logger: Logger;
  private readonly graphService: DynamicGraphService<EmergentControllerState>;
  private readonly decisionNodeService: AgentDecisionNodeService<EmergentControllerState>;
  private readonly config: EmergentControllerConfig;
  private executionPromise?: Promise<EmergentControllerState>;
  private currentState?: EmergentControllerState;
  private isRunning: boolean = false;

  /**
   * Create a new emergent controller service
   */
  constructor(
    graphService: DynamicGraphService<EmergentControllerState>,
    decisionNodeService: AgentDecisionNodeService<EmergentControllerState>,
    options: {
      config?: EmergentControllerConfig;
      logger?: Logger;
    } = {},
  ) {
    this.graphService = graphService;
    this.decisionNodeService = decisionNodeService;
    this.logger = options.logger || new ConsoleLogger();

    // Set default configuration
    this.config = {
      maxSteps: 100,
      maxDecisionNodes: 10,
      maxExecutionTimeMs: 5 * 60 * 1000, // 5 minutes
      automaticRecovery: true,
      persistStateAfterEachStep: false,
      allowParallelExecution: false,
      recordAllStates: false,
      ...options.config,
    };
  }

  /**
   * Initialize a new execution state
   */
  public initializeState(
    initialData: Partial<EmergentControllerState> = {},
  ): EmergentControllerState {
    const state: EmergentControllerState = {
      id: initialData.id || uuidv4(),
      runId: initialData.runId || uuidv4(),
      nodes: initialData.nodes || new Map(),
      edges: initialData.edges || new Map(),
      modificationHistory: initialData.modificationHistory || [],
      metadata: initialData.metadata || {},
      executionPath: initialData.executionPath || [],
      status: EmergentExecutionStatus.CREATED,
      startTime: Date.now(),
      stepCount: 0,
      activeDecisionNodeIds: [],
      completedNodeIds: [],
      ...initialData,
    };

    this.currentState = state;

    this.logger.info('Initialized emergent controller state', {
      id: state.id,
      runId: state.runId,
    });

    return state;
  }

  /**
   * Start the execution of the emergent workflow
   */
  public async start(
    initialState?: Partial<EmergentControllerState>,
  ): Promise<EmergentControllerState> {
    if (this.isRunning) {
      throw new Error('Controller is already running');
    }

    // Initialize or use provided state
    const state = initialState
      ? this.initializeState(initialState)
      : this.currentState || this.initializeState();
    state.status = EmergentExecutionStatus.INITIALIZING;

    // Start execution
    this.isRunning = true;

    try {
      this.executionPromise = this.executeLoop(state);
      return await this.executionPromise;
    } catch (error) {
      this.logger.error('Error in emergent controller execution', {
        error: error instanceof Error ? error.message : String(error),
        id: state.id,
        runId: state.runId,
      });

      // Update state to indicate failure
      if (this.currentState) {
        this.currentState.status = EmergentExecutionStatus.FAILED;
        this.currentState.metadata.lastError =
          error instanceof Error ? error.message : String(error);
        this.currentState.endTime = Date.now();
      }

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Main execution loop for the emergent workflow
   */
  private async executeLoop(
    state: EmergentControllerState,
  ): Promise<EmergentControllerState> {
    state.status = EmergentExecutionStatus.RUNNING;
    const startTime = Date.now();

    while (state.status === EmergentExecutionStatus.RUNNING) {
      // Check termination conditions
      if (this.shouldTerminate(state, startTime)) {
        this.logger.info('Terminating execution due to constraints', {
          id: state.id,
          runId: state.runId,
          stepCount: state.stepCount,
          executionTimeMs: Date.now() - startTime,
        });

        state.status = EmergentExecutionStatus.TERMINATED;
        break;
      }

      // Execute single step
      await this.executeStep(state);

      // Save state history if configured
      if (this.config.recordAllStates) {
        state.stateHistory = [...(state.stateHistory || []), { ...state }];
      }

      // Handle state persistence if configured
      if (this.config.persistStateAfterEachStep) {
        await this.persistState(state);
      }

      // Process decision results
      this.processDecisionResults(state);

      // Check for completion
      if (this.isWorkflowComplete(state)) {
        state.status = EmergentExecutionStatus.COMPLETED;
        state.endTime = Date.now();

        this.logger.info('Emergent workflow completed', {
          id: state.id,
          runId: state.runId,
          stepCount: state.stepCount,
          executionTimeMs: Date.now() - startTime,
        });
      }
    }

    // Update current state reference
    this.currentState = state;

    return state;
  }

  /**
   * Execute a single step of the emergent workflow
   */
  private async executeStep(state: EmergentControllerState): Promise<void> {
    state.stepCount++;

    this.logger.debug('Executing emergent workflow step', {
      id: state.id,
      runId: state.runId,
      step: state.stepCount,
    });

    try {
      // Execute the graph for one step
      const updatedState = await this.graphService.execute(state);

      // Update the current state
      Object.assign(state, updatedState);

      // Update completed nodes
      if (
        state.currentNodeId &&
        !state.completedNodeIds.includes(state.currentNodeId)
      ) {
        state.completedNodeIds.push(state.currentNodeId);
      }
    } catch (error) {
      this.logger.error('Error executing step', {
        id: state.id,
        runId: state.runId,
        step: state.stepCount,
        error: error instanceof Error ? error.message : String(error),
      });

      // Check if we should attempt recovery
      if (this.config.automaticRecovery) {
        await this.attemptRecovery(state, error);
      } else {
        // Mark as failed if no recovery
        state.status = EmergentExecutionStatus.FAILED;
        state.metadata.lastError =
          error instanceof Error ? error.message : String(error);
        state.endTime = Date.now();
        throw error;
      }
    }
  }

  /**
   * Process any decision results from the last step
   */
  private processDecisionResults(state: EmergentControllerState): void {
    // Check if there was a decision to restart or terminate
    if (state.metadata.shouldRestart) {
      this.logger.info('Restarting workflow based on agent decision', {
        id: state.id,
        runId: state.runId,
      });

      // Reset execution path and completed nodes
      state.executionPath = [];
      state.completedNodeIds = [];
      state.metadata.shouldRestart = false;
    }

    if (state.metadata.shouldTerminate) {
      this.logger.info('Terminating workflow based on agent decision', {
        id: state.id,
        runId: state.runId,
      });

      state.status = EmergentExecutionStatus.TERMINATED;
      state.endTime = Date.now();
    }
  }

  /**
   * Check if the workflow should terminate based on constraints
   */
  private shouldTerminate(
    state: EmergentControllerState,
    startTime: number,
  ): boolean {
    // Check step limit
    if (this.config.maxSteps && state.stepCount >= this.config.maxSteps) {
      state.metadata.terminationReason = 'Maximum steps reached';
      return true;
    }

    // Check time limit
    if (
      this.config.maxExecutionTimeMs &&
      Date.now() - startTime > this.config.maxExecutionTimeMs
    ) {
      state.metadata.terminationReason = 'Maximum execution time reached';
      return true;
    }

    return false;
  }

  /**
   * Check if the workflow is complete
   */
  private isWorkflowComplete(state: EmergentControllerState): boolean {
    // This would check for completion conditions, such as:
    // 1. No active nodes left to execute
    // 2. Reached an end node
    // 3. All required outputs are present

    // For now, we'll use a simple check based on if we've reached an END node
    const hasReachedEnd = state.executionPath.some(
      (nodeId) => nodeId === '__end__',
    );

    return hasReachedEnd;
  }

  /**
   * Attempt to recover from an error
   */
  private async attemptRecovery(
    state: EmergentControllerState,
    error: unknown,
  ): Promise<boolean> {
    this.logger.info('Attempting to recover from error', {
      id: state.id,
      runId: state.runId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Simple recovery strategy: skip the failing node
    // A more sophisticated strategy would be to create alternative paths or fallback nodes

    if (state.currentNodeId) {
      state.metadata.skippedNodes = [
        ...(state.metadata.skippedNodes || []),
        state.currentNodeId,
      ];

      // Add the node to completed so we don't try it again
      if (!state.completedNodeIds.includes(state.currentNodeId)) {
        state.completedNodeIds.push(state.currentNodeId);
      }

      // Create a recovery modification by potentially adding a bypass edge
      // A real implementation would do more sophisticated error recovery

      return true;
    }

    return false;
  }

  /**
   * Persist the current state (for long-running workflows)
   */
  private async persistState(state: EmergentControllerState): Promise<void> {
    // In a real implementation, this would save the state to a persistent store
    this.logger.debug('Persisting state', {
      id: state.id,
      runId: state.runId,
      step: state.stepCount,
    });

    // For now, just update the current state reference
    this.currentState = state;
  }

  /**
   * Get the current state
   */
  public getCurrentState(): EmergentControllerState | undefined {
    return this.currentState;
  }

  /**
   * Pause the execution (if supported)
   */
  public pause(): boolean {
    if (!this.isRunning || !this.currentState) {
      return false;
    }

    this.currentState.status = EmergentExecutionStatus.PAUSED;
    return true;
  }

  /**
   * Resume a paused execution
   */
  public async resume(): Promise<EmergentControllerState | undefined> {
    if (
      !this.currentState ||
      this.currentState.status !== EmergentExecutionStatus.PAUSED
    ) {
      return undefined;
    }

    this.currentState.status = EmergentExecutionStatus.RUNNING;
    return this.start(this.currentState);
  }

  /**
   * Stop and terminate the execution
   */
  public terminate(): boolean {
    if (!this.isRunning || !this.currentState) {
      return false;
    }

    this.currentState.status = EmergentExecutionStatus.TERMINATED;
    this.currentState.endTime = Date.now();
    return true;
  }
}
