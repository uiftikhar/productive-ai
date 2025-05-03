/**
 * @deprecated This service is deprecated as part of Phase 4, Milestone 1: Dynamic LangGraph System.
 * Please use AgentDecisionNodeService and DynamicGraphService from the langgraph/dynamic directory instead.
 * See server/src/DEPRECATED-SERVICES.md for migration guidance.
 */

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
import * as fs from 'fs';
import * as path from 'path';
import { generateVisualization } from '../utils/visualization-generator';
// Import the broadcastStateUpdate function if available, otherwise handle gracefully
let broadcastStateUpdate: ((runId: string, state: any) => void) | null = null;
try {
  // Use dynamic import to avoid circular dependencies
  import('../../../api/controllers/visualization.controller')
    .then((module) => {
      broadcastStateUpdate = module.broadcastStateUpdate;
    })
    .catch((err) => {
      // Silently ignore if the module isn't available
    });
} catch (err) {
  // Silently handle any import errors
}

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

  // Visualization
  visualizationUrl?: string;
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
 *
 * @deprecated This static workflow system is deprecated as part of Phase 4 Milestone 1.
 * It will be replaced by the dynamic graph system using:
 * - DynamicGraphService for runtime graph creation
 * - AgentDecisionNodeService for agent-driven workflows
 * - Observation-action loop for adaptive execution
 *
 * New development should use the dynamic graph system for more flexible and emergent behaviors.
 */
export class AgentWorkflow<
  T extends BaseAgent = BaseAgent,
> extends BaseWorkflow<AgentExecutionState, AgentRequest, AgentResponse> {
  private visualizationsPath: string;
  private enableVisualization: boolean;
  private enableRealtimeUpdates: boolean;

  /**
   * Creates a new instance of the AgentWorkflow
   */
  constructor(
    protected readonly agent: T,
    options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
      visualizationsPath?: string;
      enableRealtimeUpdates?: boolean;
    } = {},
  ) {
    super({
      tracingEnabled: options.tracingEnabled,
      logger: options.includeStateInLogs ? undefined : undefined, // Use default logger for now
    });

    this.visualizationsPath = options.visualizationsPath || 'visualizations';
    this.enableVisualization = !!options.visualizationsPath || false;
    this.enableRealtimeUpdates = options.enableRealtimeUpdates !== false;

    // Ensure visualizations directory exists
    if (this.enableVisualization) {
      const dirPath = path.join(process.cwd(), this.visualizationsPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
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
        value: (curr, update) => (curr || 0) + (update || 0),
      }),
      errors: Annotation<any[]>({
        default: () => [],
        value: (curr, update) => [
          ...(curr || []),
          ...(Array.isArray(update) ? update : [update]),
        ],
      }),
      metrics: Annotation<any>({
        default: () => ({}),
        value: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
      metadata: Annotation<Record<string, any>>({
        default: () => ({}),
        value: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),

      // Agent-specific fields
      agentId: Annotation<string>(),

      // Messages and interactions - agent specific
      messages: Annotation<any[]>({
        default: () => [],
        value: (curr, update) => [
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

      // Visualization
      visualizationUrl: Annotation<string | undefined>(),
    });
  }

  /**
   * Broadcast state update to any connected clients
   * This enables real-time visualization of the workflow execution
   */
  private broadcastState(state: AgentExecutionState): void {
    if (!this.enableRealtimeUpdates || !broadcastStateUpdate || !state.runId) {
      return;
    }

    try {
      // Create a simplified version of the state suitable for visualization
      const broadcastState = {
        runId: state.runId,
        id: state.id,
        status: state.status,
        startTime: state.startTime,
        endTime: state.endTime,
        agentId: state.agentId,
        capability: state.capability,
        errorCount: state.errorCount,
        currentNode: state.metadata?.currentNode || 'unknown',
        progressPercent: this.calculateProgress(state),
        output:
          typeof state.output === 'string' && state.output.length > 100
            ? state.output.substring(0, 100) + '...'
            : state.output,
        timestamp: Date.now(),
      };

      // Broadcast the state update
      broadcastStateUpdate(state.runId, broadcastState);
    } catch (error) {
      // Silently handle errors in broadcasting - this should not impact the workflow
      this.logger?.warn('Failed to broadcast state update', {
        error: error instanceof Error ? error.message : String(error),
        runId: state.runId,
      });
    }
  }

  /**
   * Calculate a progress percentage for visualization
   */
  private calculateProgress(state: AgentExecutionState): number {
    if (state.status === WorkflowStatus.COMPLETED) {
      return 100;
    }

    if (state.status === WorkflowStatus.ERROR) {
      return 0;
    }

    // Get the current node from state metadata if available
    const currentNode = state.metadata?.currentNode;

    // Define progress values for different nodes
    switch (currentNode) {
      case 'initialize':
        return 10;
      case 'pre_execute':
        return 30;
      case 'execute':
        return 60;
      case 'post_execute':
        return 90;
      default:
        // For unknown nodes, use a formula based on start time
        if (state.startTime) {
          const elapsed = Date.now() - state.startTime;
          // Assume most executions take 3-5 seconds
          const progress = Math.min(90, Math.floor((elapsed / 5000) * 100));
          return progress;
        }
        return 50; // Default progress
    }
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
   * Run the workflow with a given input and return the result
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    // Create initial state
    const initialState = this.createInitialState(request);

    // Create state graph
    const graph = this.createStateGraph(this.createStateSchema());

    // Compile the graph
    const graphRunner = graph.compile();

    // Broadcast initial state if real-time updates are enabled
    this.broadcastState({
      ...initialState,
      metadata: {
        ...initialState.metadata,
        currentNode: 'initialize',
      },
    });

    // Execute the graph
    let finalState: AgentExecutionState;
    try {
      if (this.enableRealtimeUpdates && broadcastStateUpdate) {
        const onStateChange = (
          state: AgentExecutionState,
          nodeName: string,
        ) => {
          this.broadcastState({
            ...state,
            metadata: {
              ...state.metadata,
              currentNode: nodeName,
            },
          });
        };

        // Execute the graph step by step, broadcasting updates at each node
        let currentState = initialState;

        // Define node execution order based on our graph definition
        const nodeOrder = [
          'initialize',
          'pre_execute',
          'execute',
          'post_execute',
          'complete',
          'error_handler',
        ];
        const edgeMap: Record<string, string> = {
          initialize: 'pre_execute',
          pre_execute: 'execute',
          execute: 'post_execute',
          post_execute: 'complete',
        };

        let currentNode = 'initialize';

        while (
          currentNode &&
          currentNode !== END &&
          currentNode !== 'complete' &&
          currentNode !== 'error_handler'
        ) {
          // Update metadata with current node and broadcast state
          currentState = {
            ...currentState,
            metadata: {
              ...currentState.metadata,
              currentNode,
            },
          };

          onStateChange(currentState, currentNode);

          // Execute the current node
          try {
            // Extract the node object
            const nodeObj = (graph.nodes as any)[currentNode];
            if (!nodeObj) {
              throw new Error(`Node "${currentNode}" not found in graph`);
            }

            // Access the runnable function from the node object structure
            if (
              !nodeObj.runnable ||
              typeof nodeObj.runnable.func !== 'function'
            ) {
              throw new Error(
                `No executable function found for node "${currentNode}"`,
              );
            }

            // Call the node's function with the current state
            currentState = await nodeObj.runnable.func(currentState);
          } catch (error) {
            this.logger.error(`Error executing node ${currentNode}`, {
              error: error instanceof Error ? error.message : String(error),
            });
            currentState = {
              ...currentState,
              status: WorkflowStatus.ERROR,
              errors: [
                ...(currentState.errors || []),
                {
                  message:
                    error instanceof Error ? error.message : String(error),
                  code: 'NODE_EXECUTION_ERROR',
                  timestamp: new Date().toISOString(),
                },
              ],
            };
            currentNode = 'error_handler';
            continue; // Skip the rest of the iteration
          }

          // Find the next node based on state and our routing rules
          if (currentState.status === WorkflowStatus.ERROR) {
            currentNode = 'error_handler';
          } else {
            try {
              // Check for branches in graph (conditional edges)
              const branches = (graph as any).branches || {};
              const branch = branches[currentNode];

              if (
                branch &&
                branch.condition &&
                typeof branch.condition.test === 'function'
              ) {
                // Execute the branch condition to determine next node
                try {
                  currentNode = branch.condition.test(currentState);
                  this.logger.debug(
                    `Branch condition for ${currentNode} returned next node: ${currentNode}`,
                  );
                } catch (error) {
                  this.logger.error(
                    `Error in branch condition from ${currentNode}`,
                    {
                      error:
                        error instanceof Error ? error.message : String(error),
                    },
                  );
                  currentNode = 'error_handler';
                }
              } else {
                // Use our predefined edge map
                currentNode = edgeMap[currentNode] || END;
              }
            } catch (error) {
              this.logger.error(`Error finding next node from ${currentNode}`, {
                error: error instanceof Error ? error.message : String(error),
              });
              currentNode = 'error_handler';
            }
          }
        }

        finalState = currentState;
      } else {
        // Standard execution without intercepting state changes
        const result = await graphRunner.invoke(initialState);
        finalState = result as unknown as AgentExecutionState;
      }
    } catch (error) {
      this.logger.error('Error executing agent workflow', {
        error: error instanceof Error ? error.message : String(error),
        agentId: this.agent.id,
        runId: initialState.runId,
      });

      // Create an error state
      finalState = {
        ...initialState,
        status: WorkflowStatus.ERROR,
        errors: [
          ...(initialState.errors || []),
          {
            message: error instanceof Error ? error.message : String(error),
            code: 'WORKFLOW_ERROR',
            timestamp: new Date().toISOString(),
          },
        ],
        endTime: Date.now(),
      };

      // Broadcast final error state
      this.broadcastState({
        ...finalState,
        metadata: {
          ...finalState.metadata,
          currentNode: 'error_handler',
        },
      });
    }

    // Broadcast final state
    this.broadcastState({
      ...finalState,
      metadata: {
        ...finalState.metadata,
        currentNode:
          finalState.status === WorkflowStatus.ERROR
            ? 'error_handler'
            : 'complete',
      },
    });

    // Process the result
    return this.processResult(finalState);
  }

  /**
   * Process the final state into a response
   */
  protected processResult(state: AgentExecutionState): AgentResponse {
    // Generate HTML visualization if requested
    let visualizationUrl: string | undefined = undefined;

    if (
      this.enableVisualization &&
      state.metadata?.visualization &&
      state.runId
    ) {
      // Use our custom visualization generator
      const visUrl = generateVisualization(state, {
        visualizationsPath: this.visualizationsPath,
        logger: this.logger,
      });

      if (visUrl) {
        visualizationUrl = visUrl;
      }
    }

    if (state.status === WorkflowStatus.ERROR) {
      const errorMessage =
        state.errors && state.errors.length > 0
          ? state.errors[state.errors.length - 1].message
          : 'Unknown error during agent execution';

      return {
        id: state.id,
        agentId: state.agentId,
        runId: state.runId,
        success: false,
        error: errorMessage,
        executionTimeMs:
          state.endTime && state.startTime
            ? state.endTime - state.startTime
            : undefined,
        visualizationUrl,
      };
    }

    return {
      id: state.id,
      agentId: state.agentId,
      runId: state.runId,
      success: true,
      output: state.output || '',
      artifacts: state.artifacts,
      executionTimeMs:
        state.endTime && state.startTime
          ? state.endTime - state.startTime
          : undefined,
      metrics: state.metrics,
      visualizationUrl,
    };
  }

  /**
   * Create the pre-execute node - this performs any setup before execution
   */
  private createPreExecuteNode() {
    return async (state: AgentExecutionState) => {
      try {
        if (!this.agent.getInitializationStatus()) {
          await this.agent.initialize();
        }

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
   */
  private createExecuteNode() {
    return async (state: AgentExecutionState) => {
      const agentId = state.agentId || 'unknown';

      try {
        // Ensure agent exists
        if (!this.agent) {
          this.logger?.error(`Agent is undefined for workflow execution`, {
            agentId,
          });
          throw new Error(
            `Agent is undefined. Cannot execute workflow for agentId: ${agentId}`,
          );
        }

        // Check if agent is initialized
        if (!this.agent.getInitializationStatus()) {
          this.logger?.debug(
            `Agent not initialized, initializing: ${this.agent.id}`,
          );
          try {
            await this.agent.initialize();
          } catch (initError) {
            this.logger?.error(`Failed to initialize agent: ${this.agent.id}`, {
              error:
                initError instanceof Error
                  ? initError.message
                  : String(initError),
            });
            throw initError;
          }
        }

        // Safely handle agent state - common source of errors
        this.ensureAgentStateExists(this.agent);

        // Prepare request from state
        const request: AgentRequest = {
          input: state.input,
          capability: state.capability,
          parameters: state.parameters,
          context: state.metadata?.context,
        };

        // Track execution time
        const startTime = Date.now();

        // Safe update of execution count
        this.safelyIncrementCounter(this.agent, 'executionCount');

        // Execute the agent using the most direct and safe method
        let response: AgentResponse;

        // Use proper typed checking for workflow compatibility
        if (isWorkflowCompatible(this.agent)) {
          // Direct access to executeInternal via interface
          response = await this.agent.executeInternal(request);
        } else {
          // Fallback for agents that don't implement WorkflowCompatibleAgent
          response = await (this.agent as BaseAgentInterface).execute(request);
        }

        // Calculate execution time
        const executionTimeMs = Math.max(1, Date.now() - startTime);

        // Update agent metrics (safely)
        this.safelyUpdateAgentMetrics(
          this.agent,
          executionTimeMs,
          response.metrics?.tokensUsed,
        );

        // Parse the response output - handle both object and string formats safely
        let outputStr = '';

        if (typeof response.output === 'string') {
          outputStr = response.output;
        } else if (response.output) {
          // Safely extract content or stringify
          outputStr = JSON.stringify(response.output);
        }

        return {
          ...state,
          output: outputStr,
          artifacts: response.artifacts || {},
          metrics: {
            ...(state.metrics || {}),
            ...(response.metrics || {}),
            executionTimeMs,
          },
          status: WorkflowStatus.READY,
        };
      } catch (error) {
        // Comprehensive error handling
        const errorObject =
          error instanceof Error ? error : new Error(String(error));

        // Log the error with structured metadata
        this.logger?.error(`Error executing agent workflow`, {
          agentId,
          errorMessage: errorObject.message,
          stack: errorObject.stack,
          capability: state.capability,
        });

        // Safely increment error count
        this.safelyIncrementCounter(this.agent, 'errorCount');

        // Safely update agent status
        this.safelyUpdateAgentStatus(this.agent, AgentStatus.ERROR);

        // Update error metrics
        this.safelyUpdateErrorRate(this.agent);

        return this.addErrorToState(state, errorObject, 'execute');
      }
    };
  }

  /**
   * Safely ensure agent state exists
   * @param agent The agent to check
   */
  private ensureAgentStateExists(agent: BaseAgentInterface): void {
    if (!agent) return;

    try {
      if (!(agent as any).state) {
        this.logger?.warn(
          `Agent state is undefined, initializing state for: ${agent.id}`,
        );
        (agent as any).state = {
          status: AgentStatus.READY,
          errorCount: 0,
          executionCount: 0,
          metadata: {},
        };
      }
    } catch (error) {
      this.logger?.error(`Failed to initialize agent state: ${agent.id}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Safely increment a counter on the agent state
   * @param agent The agent to update
   * @param counterName The name of the counter to increment
   */
  private safelyIncrementCounter(
    agent: BaseAgentInterface,
    counterName: 'errorCount' | 'executionCount',
  ): void {
    if (!agent) return;

    try {
      if ((agent as any).state) {
        (agent as any).state[counterName] =
          ((agent as any).state[counterName] || 0) + 1;
      } else {
        this.logger?.warn(
          `Cannot increment ${counterName}: agent state is undefined`,
          {
            agentId: agent.id,
          },
        );
      }
    } catch (error) {
      this.logger?.error(
        `Failed to increment ${counterName} for agent: ${agent.id}`,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Safely update agent status
   * @param agent The agent to update
   * @param status The new status
   */
  private safelyUpdateAgentStatus(
    agent: BaseAgentInterface,
    status: AgentStatus,
  ): void {
    if (!agent) return;

    try {
      if ((agent as any).state) {
        (agent as any).state.status = status;
      } else {
        this.logger?.warn(`Cannot update status: agent state is undefined`, {
          agentId: agent.id,
          status,
        });
      }
    } catch (error) {
      this.logger?.error(`Failed to update status for agent: ${agent.id}`, {
        error: error instanceof Error ? error.message : String(error),
        status,
      });
    }
  }

  /**
   * Safely update error rate in metrics
   * @param agent The agent to update
   */
  private safelyUpdateErrorRate(agent: BaseAgentInterface): void {
    if (!agent) return;

    try {
      const errorCount = (agent as any).state?.errorCount || 0;
      const metrics = agent.getMetrics();
      const totalExecutions =
        metrics.totalExecutions > 0 ? metrics.totalExecutions : 1;

      // Use type assertion to handle the updateMetrics method
      (agent as any).updateMetrics?.({
        errorRate: errorCount / totalExecutions,
      });
    } catch (error) {
      this.logger?.error(`Failed to update error rate for agent: ${agent.id}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Safely update agent metrics
   * @param agent The agent to update
   * @param executionTimeMs Execution time in ms
   * @param tokensUsed Number of tokens used
   */
  private safelyUpdateAgentMetrics(
    agent: BaseAgentInterface,
    executionTimeMs: number,
    tokensUsed?: number,
  ): void {
    if (!agent) return;

    try {
      const currentMetrics = agent.getMetrics();
      const newTotalExecutions = currentMetrics.totalExecutions + 1;
      const newTotalTime =
        currentMetrics.totalExecutionTimeMs + executionTimeMs;

      // Use type assertion to handle the updateMetrics method
      (agent as any).updateMetrics?.({
        totalExecutions: newTotalExecutions,
        totalExecutionTimeMs: newTotalTime,
        averageExecutionTimeMs: newTotalTime / newTotalExecutions,
        lastExecutionTimeMs: executionTimeMs,
        tokensUsed: currentMetrics.tokensUsed + (tokensUsed || 0),
      });
    } catch (error) {
      this.logger?.error(`Failed to update metrics for agent: ${agent.id}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
