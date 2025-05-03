import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

import {
  DynamicGraphService,
  DynamicGraphState,
} from './dynamic-graph.service';
import {
  EmergentControllerService,
  EmergentControllerState,
  EmergentExecutionStatus,
} from './emergent-controller.service';
import {
  DecisionPoint,
  DecisionResult,
} from './interfaces/decision-point.interface';

/**
 * Observation made about the current state
 */
export interface Observation<TState = any> {
  id: string;
  observerId: string;
  timestamp: number;
  type: string;
  content: string;
  confidence: number;
  relevance: number;
  metadata?: Record<string, any>;
  stateSnapshot?: Partial<TState>;
}

/**
 * Action proposed based on observations
 */
export interface ProposedAction<TState = any> {
  id: string;
  proposerId: string;
  timestamp: number;
  type: string;
  description: string;
  reasoning: string;
  expectedOutcome: string;
  confidence: number;
  metadata?: Record<string, any>;
  stateUpdates?: Partial<TState>;
}

/**
 * Result of an executed action
 */
export interface ActionResult<TState = any> {
  id: string;
  actionId: string;
  timestamp: number;
  success: boolean;
  output?: any;
  error?: string;
  metadata?: Record<string, any>;
  stateUpdates?: Partial<TState>;
}

/**
 * Extended state for the observation-action loop
 */
export interface ObservationActionState extends EmergentControllerState {
  observations: Observation<ObservationActionState>[];
  proposedActions: ProposedAction<ObservationActionState>[];
  executedActions: {
    action: ProposedAction<ObservationActionState>;
    result: ActionResult<ObservationActionState>;
  }[];
  activeObservers: string[];
  activeProposers: string[];
  currentFocus?: string;
}

/**
 * Service implementing the observation-action-result loop for graph evolution
 */
export class ObservationActionLoopService {
  private readonly logger: Logger;
  private readonly graphService: DynamicGraphService<ObservationActionState>;
  private readonly controller: EmergentControllerService;
  private readonly observers: Map<
    string,
    (
      state: ObservationActionState,
    ) => Promise<Observation<ObservationActionState>[]>
  > = new Map();
  private readonly actionProposers: Map<
    string,
    (
      state: ObservationActionState,
      observations: Observation<ObservationActionState>[],
    ) => Promise<ProposedAction<ObservationActionState>[]>
  > = new Map();
  private readonly actionExecutors: Map<
    string,
    (
      state: ObservationActionState,
      action: ProposedAction<ObservationActionState>,
    ) => Promise<ActionResult<ObservationActionState>>
  > = new Map();

  /**
   * Create a new observation-action loop service
   */
  constructor(
    graphService: DynamicGraphService<ObservationActionState>,
    controller: EmergentControllerService,
    options: {
      logger?: Logger;
    } = {},
  ) {
    this.graphService = graphService;
    this.controller = controller;
    this.logger = options.logger || new ConsoleLogger();
  }

  /**
   * Register an observer function
   */
  public registerObserver(
    id: string,
    observer: (
      state: ObservationActionState,
    ) => Promise<Observation<ObservationActionState>[]>,
  ): void {
    this.observers.set(id, observer);
  }

  /**
   * Register an action proposer function
   */
  public registerActionProposer(
    id: string,
    proposer: (
      state: ObservationActionState,
      observations: Observation<ObservationActionState>[],
    ) => Promise<ProposedAction<ObservationActionState>[]>,
  ): void {
    this.actionProposers.set(id, proposer);
  }

  /**
   * Register an action executor function
   */
  public registerActionExecutor(
    id: string,
    executor: (
      state: ObservationActionState,
      action: ProposedAction<ObservationActionState>,
    ) => Promise<ActionResult<ObservationActionState>>,
  ): void {
    this.actionExecutors.set(id, executor);
  }

  /**
   * Initialize a new state for the observation-action loop
   */
  public initializeState(
    initialData: Partial<ObservationActionState> = {},
  ): ObservationActionState {
    const state: ObservationActionState = {
      id: initialData.id || uuidv4(),
      runId: initialData.runId || uuidv4(),
      nodes: initialData.nodes || new Map(),
      edges: initialData.edges || new Map(),
      modificationHistory: initialData.modificationHistory || [],
      metadata: initialData.metadata || {},
      executionPath: initialData.executionPath || [],
      status: initialData.status || EmergentExecutionStatus.CREATED,
      startTime: initialData.startTime || Date.now(),
      stepCount: initialData.stepCount || 0,
      activeDecisionNodeIds: initialData.activeDecisionNodeIds || [],
      completedNodeIds: initialData.completedNodeIds || [],
      observations: initialData.observations || [],
      proposedActions: initialData.proposedActions || [],
      executedActions: initialData.executedActions || [],
      activeObservers: Array.from(this.observers.keys()),
      activeProposers: Array.from(this.actionProposers.keys()),
      ...initialData,
    };

    this.logger.info('Initialized observation-action loop state', {
      id: state.id,
      runId: state.runId,
      observerCount: state.activeObservers.length,
      proposerCount: state.activeProposers.length,
    });

    return state;
  }

  /**
   * Start the observation-action loop
   */
  public async start(
    initialState?: Partial<ObservationActionState>,
  ): Promise<ObservationActionState> {
    // Initialize the state
    const state = initialState
      ? this.initializeState(initialState)
      : this.initializeState();

    this.logger.info('Starting observation-action loop', {
      id: state.id,
      runId: state.runId,
    });

    // Execute the loop
    const result = await this.controller.start(state);

    // Ensure the result is cast to the correct type
    return result as ObservationActionState;
  }

  /**
   * Execute a single iteration of the observation-action loop
   */
  public async executeIteration(
    state: ObservationActionState,
  ): Promise<ObservationActionState> {
    try {
      // 1. Collect observations
      const observations = await this.collectObservations(state);
      state.observations = [...state.observations, ...observations];

      // 2. Propose actions based on observations
      const proposedActions = await this.proposeActions(state, observations);
      state.proposedActions = [...state.proposedActions, ...proposedActions];

      // 3. Select the best action
      const selectedAction = await this.selectAction(state, proposedActions);

      if (selectedAction) {
        // 4. Execute the selected action
        const result = await this.executeAction(state, selectedAction);

        // 5. Record the result
        state.executedActions.push({
          action: selectedAction,
          result,
        });

        // 6. Apply the result to the state
        if (result.stateUpdates) {
          Object.assign(state, result.stateUpdates);
        }
      }

      return state;
    } catch (error) {
      this.logger.error('Error in observation-action loop iteration', {
        error: error instanceof Error ? error.message : String(error),
        id: state.id,
        runId: state.runId,
      });

      // Add error to state
      state.metadata.lastError =
        error instanceof Error ? error.message : String(error);
      return state;
    }
  }

  /**
   * Collect observations from all active observers
   */
  private async collectObservations(
    state: ObservationActionState,
  ): Promise<Observation<ObservationActionState>[]> {
    const allObservations: Observation<ObservationActionState>[] = [];

    // Collect observations from all active observers
    for (const observerId of state.activeObservers) {
      const observer = this.observers.get(observerId);

      if (observer) {
        try {
          const observations = await observer(state);
          allObservations.push(...observations);
        } catch (error) {
          this.logger.error(
            `Error collecting observations from observer ${observerId}`,
            {
              error: error instanceof Error ? error.message : String(error),
              id: state.id,
              runId: state.runId,
            },
          );
        }
      }
    }

    this.logger.debug('Collected observations', {
      count: allObservations.length,
      id: state.id,
      runId: state.runId,
    });

    return allObservations;
  }

  /**
   * Propose actions based on observations
   */
  private async proposeActions(
    state: ObservationActionState,
    observations: Observation<ObservationActionState>[],
  ): Promise<ProposedAction<ObservationActionState>[]> {
    const allProposedActions: ProposedAction<ObservationActionState>[] = [];

    // Skip if no observations
    if (observations.length === 0) {
      return [];
    }

    // Get proposals from all active proposers
    for (const proposerId of state.activeProposers) {
      const proposer = this.actionProposers.get(proposerId);

      if (proposer) {
        try {
          const proposedActions = await proposer(state, observations);
          allProposedActions.push(...proposedActions);
        } catch (error) {
          this.logger.error(
            `Error getting proposals from proposer ${proposerId}`,
            {
              error: error instanceof Error ? error.message : String(error),
              id: state.id,
              runId: state.runId,
            },
          );
        }
      }
    }

    this.logger.debug('Generated action proposals', {
      count: allProposedActions.length,
      id: state.id,
      runId: state.runId,
    });

    return allProposedActions;
  }

  /**
   * Select the best action from proposed actions
   */
  private async selectAction(
    state: ObservationActionState,
    proposedActions: ProposedAction<ObservationActionState>[],
  ): Promise<ProposedAction<ObservationActionState> | undefined> {
    // Skip if no proposed actions
    if (proposedActions.length === 0) {
      return undefined;
    }

    // Select the action with the highest confidence
    // A more sophisticated implementation would consider additional factors
    return proposedActions.reduce((best, current) => {
      return current.confidence > best.confidence ? current : best;
    }, proposedActions[0]);
  }

  /**
   * Execute an action
   */
  private async executeAction(
    state: ObservationActionState,
    action: ProposedAction<ObservationActionState>,
  ): Promise<ActionResult<ObservationActionState>> {
    this.logger.info('Executing action', {
      actionId: action.id,
      actionType: action.type,
      proposerId: action.proposerId,
      id: state.id,
      runId: state.runId,
    });

    // Find an executor for this action type
    const actionType = action.type;
    const executor = Array.from(this.actionExecutors.values())[0]; // Default to first executor

    if (!executor) {
      return {
        id: uuidv4(),
        actionId: action.id,
        timestamp: Date.now(),
        success: false,
        error: `No executor available for action type: ${actionType}`,
      };
    }

    try {
      // Execute the action
      const result = await executor(state, action);

      this.logger.info('Action execution completed', {
        actionId: action.id,
        success: result.success,
        id: state.id,
        runId: state.runId,
      });

      return result;
    } catch (error) {
      this.logger.error('Error executing action', {
        actionId: action.id,
        error: error instanceof Error ? error.message : String(error),
        id: state.id,
        runId: state.runId,
      });

      return {
        id: uuidv4(),
        actionId: action.id,
        timestamp: Date.now(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Create a default agent observer
   */
  public createAgentObserver(
    agentId: string,
    options: {
      types?: string[];
      focusAreas?: string[];
    } = {},
  ): (
    state: ObservationActionState,
  ) => Promise<Observation<ObservationActionState>[]> {
    // A real implementation would integrate with the agent system
    // This is a placeholder that returns empty observations
    return async (state: ObservationActionState) => {
      return [];
    };
  }

  /**
   * Create a default agent action proposer
   */
  public createAgentActionProposer(
    agentId: string,
    options: {
      capabilities?: string[];
    } = {},
  ): (
    state: ObservationActionState,
    observations: Observation<ObservationActionState>[],
  ) => Promise<ProposedAction<ObservationActionState>[]> {
    // A real implementation would integrate with the agent system
    // This is a placeholder that returns empty proposals
    return async (
      state: ObservationActionState,
      observations: Observation<ObservationActionState>[],
    ) => {
      return [];
    };
  }

  /**
   * Create a default action executor for graph modifications
   */
  public createGraphModificationExecutor(): (
    state: ObservationActionState,
    action: ProposedAction<ObservationActionState>,
  ) => Promise<ActionResult<ObservationActionState>> {
    return async (
      state: ObservationActionState,
      action: ProposedAction<ObservationActionState>,
    ) => {
      // This would apply the action as a graph modification
      // For now, just return a successful result
      return {
        id: uuidv4(),
        actionId: action.id,
        timestamp: Date.now(),
        success: true,
        output: { applied: true },
        stateUpdates: action.stateUpdates,
      };
    };
  }
}
