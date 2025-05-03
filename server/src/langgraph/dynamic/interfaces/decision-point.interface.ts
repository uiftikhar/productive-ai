import { DynamicGraphState } from '../dynamic-graph.service';

/**
 * Types of decisions that can be made at decision points
 */
export enum DecisionPointType {
  PATH_SELECTION = 'path_selection',
  CONTINUE_OR_STOP = 'continue_or_stop',
  BRANCH_CREATION = 'branch_creation',
  RESOURCE_ALLOCATION = 'resource_allocation',
  STRATEGY_SELECTION = 'strategy_selection',
  ERROR_HANDLING = 'error_handling',
  CUSTOM = 'custom',
}

/**
 * Represents a decision made at a decision point
 */
export interface DecisionResult<TState = any> {
  id: string;
  type: string;
  agentId: string;
  timestamp: number;
  confidence: number;
  reasoning: string;
  selectedOption?: string;
  metadata?: Record<string, any>;
  updatedState?: Partial<TState>;
}

/**
 * Represents an option at a decision point
 */
export interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * Base interface for decision points in the dynamic graph
 */
export interface DecisionPoint<
  TState extends DynamicGraphState = DynamicGraphState,
> {
  /**
   * Unique identifier for the decision point
   */
  id: string;

  /**
   * Type of decision to be made
   */
  type: DecisionPointType | string;

  /**
   * Description of the decision point
   */
  description?: string;

  /**
   * Options available at this decision point
   */
  options?: DecisionOption[];

  /**
   * Agent responsible for making the decision
   */
  agentId: string;

  /**
   * Execute the decision point with the current state
   */
  execute(state: TState): Promise<DecisionResult<TState>>;

  /**
   * Check if the decision point should be activated
   */
  shouldActivate?(state: TState): boolean | Promise<boolean>;

  /**
   * Get available options for the current state
   */
  getOptions?(state: TState): DecisionOption[] | Promise<DecisionOption[]>;

  /**
   * Apply the result of a decision to the state
   */
  applyResult?(
    state: TState,
    result: DecisionResult<TState>,
  ): TState | Promise<TState>;
}

/**
 * Factory for creating decision points
 */
export interface DecisionPointFactory<
  TState extends DynamicGraphState = DynamicGraphState,
> {
  /**
   * Create a decision point with the given configuration
   */
  createDecisionPoint(config: {
    id?: string;
    type: DecisionPointType | string;
    description?: string;
    options?: DecisionOption[];
    agentId: string;
    executeFunction: (
      state: TState,
      options: DecisionOption[],
    ) => Promise<DecisionResult<TState>>;
    shouldActivateFunction?: (state: TState) => boolean | Promise<boolean>;
    getOptionsFunction?: (
      state: TState,
    ) => DecisionOption[] | Promise<DecisionOption[]>;
    applyResultFunction?: (
      state: TState,
      result: DecisionResult<TState>,
    ) => TState | Promise<TState>;
  }): DecisionPoint<TState>;
}

/**
 * Registry for decision points
 */
export interface DecisionPointRegistry<
  TState extends DynamicGraphState = DynamicGraphState,
> {
  /**
   * Register a decision point
   */
  registerDecisionPoint(decisionPoint: DecisionPoint<TState>): void;

  /**
   * Get a decision point by ID
   */
  getDecisionPoint(id: string): DecisionPoint<TState> | undefined;

  /**
   * Get all decision points
   */
  getAllDecisionPoints(): DecisionPoint<TState>[];

  /**
   * Get decision points by type
   */
  getDecisionPointsByType(
    type: DecisionPointType | string,
  ): DecisionPoint<TState>[];

  /**
   * Get decision points by agent
   */
  getDecisionPointsByAgent(agentId: string): DecisionPoint<TState>[];
}

/**
 * Manager for handling decision points during execution
 */
export interface DecisionPointManager<
  TState extends DynamicGraphState = DynamicGraphState,
> {
  /**
   * Process all applicable decision points for the current state
   */
  processDecisionPoints(state: TState): Promise<TState>;

  /**
   * Check which decision points should be activated
   */
  findActiveDecisionPoints(state: TState): Promise<DecisionPoint<TState>[]>;

  /**
   * Execute a specific decision point
   */
  executeDecisionPoint(
    state: TState,
    decisionPointId: string,
  ): Promise<DecisionResult<TState>>;
}
