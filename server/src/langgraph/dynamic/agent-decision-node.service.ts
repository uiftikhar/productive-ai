import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
// Note: Future implementation will likely use LLM-based decision making
// with imports such as ChatOpenAI, BaseMessage, SystemMessage, etc.

import {
  DynamicGraphService,
  DynamicGraphState,
} from './dynamic-graph.service';
import {
  GraphModification,
  GraphModificationType,
  DynamicGraphNode,
  DynamicGraphEdge,
} from './interfaces/graph-modification.interface';

/**
 * Decision type enum for agent decisions
 */
export enum DecisionType {
  ADD_NODE = 'add_node',
  REMOVE_NODE = 'remove_node',
  ADD_EDGE = 'add_edge',
  REMOVE_EDGE = 'remove_edge',
  MODIFY_NODE = 'modify_node',
  MODIFY_EDGE = 'modify_edge',
  CONTINUE = 'continue',
  RESTART = 'restart',
  TERMINATE = 'terminate',
}

/**
 * Interface for agent decisions that can modify the graph
 */
export interface AgentDecision {
  type: DecisionType;
  reasoning: string;
  confidence: number;
  payload?: any;
}

/**
 * Node that allows agents to make decisions that modify the graph structure
 */
export class AgentDecisionNodeService<
  TState extends DynamicGraphState = DynamicGraphState,
> {
  private readonly logger: Logger;
  private graphService: DynamicGraphService<TState>;

  /**
   * Create a new agent decision node service
   */
  constructor(
    graphService: DynamicGraphService<TState>,
    options: {
      logger?: Logger;
    } = {},
  ) {
    this.graphService = graphService;
    this.logger = options.logger || new ConsoleLogger();
  }

  /**
   * Create a decision node that can modify the graph
   */
  createDecisionNode(options: {
    id?: string;
    label?: string;
    agentId: string;
    maxDecisionsPerRun?: number;
    description?: string;
  }): DynamicGraphNode<TState> {
    const nodeId = options.id || `decision-node-${uuidv4()}`;

    // Create the node
    const node: DynamicGraphNode<TState> = {
      id: nodeId,
      type: 'agent_decision',
      label: options.label || `Agent Decision (${options.agentId})`,
      metadata: {
        agentId: options.agentId,
        description:
          options.description || 'Agent decision point for graph modification',
        maxDecisionsPerRun: options.maxDecisionsPerRun || 3,
        decisionsCount: 0,
      },
      handler: async (state: TState) => {
        return this.handleDecisionNode(state, options.agentId, nodeId);
      },
    };

    return node;
  }

  /**
   * Handle execution of a decision node
   */
  private async handleDecisionNode(
    state: TState,
    agentId: string,
    nodeId: string,
  ): Promise<TState> {
    try {
      this.logger.info('Executing agent decision node', {
        nodeId,
        agentId,
        runId: state.runId,
      });

      // Check if we've reached the maximum number of decisions
      const metadata = state.nodes.get(nodeId)?.metadata || {};
      const maxDecisions = metadata.maxDecisionsPerRun || 3;
      const decisionsCount = metadata.decisionsCount || 0;

      if (decisionsCount >= maxDecisions) {
        this.logger.warn('Maximum decisions reached for this run', {
          nodeId,
          agentId,
          maxDecisions,
          decisionsCount,
        });

        // Update state to indicate max decisions reached
        state.metadata.maxDecisionsReached = true;
        return state;
      }

      // Get the agent's decision
      const decision = await this.getAgentDecision(state, agentId);

      // Process the decision
      const updatedState = await this.processDecision(
        state,
        decision,
        agentId,
        nodeId,
      );

      // Increment the decision count
      if (state.nodes.has(nodeId)) {
        const currentNode = state.nodes.get(nodeId)!;
        const updatedNode = {
          ...currentNode,
          metadata: {
            ...currentNode.metadata,
            decisionsCount: decisionsCount + 1,
          },
        };
        state.nodes.set(nodeId, updatedNode);
      }

      return updatedState;
    } catch (error) {
      this.logger.error('Error in agent decision node', {
        nodeId,
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Add error to state
      state.metadata.lastError =
        error instanceof Error ? error.message : String(error);
      return state;
    }
  }

  /**
   * Get a decision from an agent
   */
  private async getAgentDecision(
    state: TState,
    agentId: string,
  ): Promise<AgentDecision> {
    // This is where integration with agent decision-making would occur
    // For now, we're using a simple mock decision

    // FUTURE IMPLEMENTATION NOTE:
    // In the future, this will be implemented with LLM-based decision making
    // using models like ChatOpenAI and message templates (SystemMessage, HumanMessage)
    // to enable agents to make intelligent decisions about graph modifications.
    // The JSON response from the LLM will be parsed using JsonOutputParser.

    // In a real implementation, we would call the agent's decision-making API
    // This might involve:
    // 1. Preparing context about the current workflow state
    // 2. Asking the agent for a decision
    // 3. Parsing and validating the decision

    // Mock implementation for testing
    return {
      type: DecisionType.CONTINUE,
      reasoning: 'Default continue decision - no agent integration yet',
      confidence: 1.0,
    };
  }

  /**
   * Process an agent's decision
   */
  private async processDecision(
    state: TState,
    decision: AgentDecision,
    agentId: string,
    nodeId: string,
  ): Promise<TState> {
    // Record the decision in state
    state.metadata.lastDecision = decision;

    switch (decision.type) {
      case DecisionType.ADD_NODE:
        await this.handleAddNodeDecision(state, decision, agentId);
        break;

      case DecisionType.REMOVE_NODE:
        await this.handleRemoveNodeDecision(state, decision, agentId);
        break;

      case DecisionType.ADD_EDGE:
        await this.handleAddEdgeDecision(state, decision, agentId);
        break;

      case DecisionType.REMOVE_EDGE:
        await this.handleRemoveEdgeDecision(state, decision, agentId);
        break;

      case DecisionType.MODIFY_NODE:
        await this.handleModifyNodeDecision(state, decision, agentId);
        break;

      case DecisionType.MODIFY_EDGE:
        await this.handleModifyEdgeDecision(state, decision, agentId);
        break;

      case DecisionType.RESTART:
        // Mark for restart - handling would occur at the controller level
        state.metadata.shouldRestart = true;
        break;

      case DecisionType.TERMINATE:
        // Mark for termination - handling would occur at the controller level
        state.metadata.shouldTerminate = true;
        break;

      case DecisionType.CONTINUE:
      default:
        // No modifications needed, just continue execution
        break;
    }

    return state;
  }

  /**
   * Handle a decision to add a node
   */
  private async handleAddNodeDecision(
    state: TState,
    decision: AgentDecision,
    agentId: string,
  ): Promise<void> {
    const payload = decision.payload;

    if (!payload || !payload.node) {
      throw new Error('Invalid payload for ADD_NODE decision');
    }

    const node: DynamicGraphNode = {
      id: payload.node.id || `node-${uuidv4()}`,
      type: payload.node.type || 'dynamic',
      label: payload.node.label,
      metadata: {
        ...payload.node.metadata,
        createdBy: agentId,
        createdAt: Date.now(),
      },
    };

    const modification: GraphModification = {
      id: uuidv4(),
      type: GraphModificationType.ADD_NODE,
      timestamp: Date.now(),
      agentId,
      reason: decision.reasoning,
      node,
    };

    await this.graphService.applyModification(modification);
  }

  /**
   * Handle a decision to remove a node
   */
  private async handleRemoveNodeDecision(
    state: TState,
    decision: AgentDecision,
    agentId: string,
  ): Promise<void> {
    const payload = decision.payload;

    if (!payload || !payload.nodeId) {
      throw new Error('Invalid payload for REMOVE_NODE decision');
    }

    const modification: GraphModification = {
      id: uuidv4(),
      type: GraphModificationType.REMOVE_NODE,
      timestamp: Date.now(),
      agentId,
      reason: decision.reasoning,
      nodeId: payload.nodeId,
    };

    await this.graphService.applyModification(modification);
  }

  /**
   * Handle a decision to add an edge
   */
  private async handleAddEdgeDecision(
    state: TState,
    decision: AgentDecision,
    agentId: string,
  ): Promise<void> {
    const payload = decision.payload;

    if (
      !payload ||
      !payload.edge ||
      !payload.edge.source ||
      !payload.edge.target
    ) {
      throw new Error('Invalid payload for ADD_EDGE decision');
    }

    const edge: DynamicGraphEdge = {
      id: payload.edge.id || `edge-${uuidv4()}`,
      source: payload.edge.source,
      target: payload.edge.target,
      label: payload.edge.label,
      metadata: {
        ...payload.edge.metadata,
        createdBy: agentId,
        createdAt: Date.now(),
      },
    };

    const modification: GraphModification = {
      id: uuidv4(),
      type: GraphModificationType.ADD_EDGE,
      timestamp: Date.now(),
      agentId,
      reason: decision.reasoning,
      edge,
    };

    await this.graphService.applyModification(modification);
  }

  /**
   * Handle a decision to remove an edge
   */
  private async handleRemoveEdgeDecision(
    state: TState,
    decision: AgentDecision,
    agentId: string,
  ): Promise<void> {
    const payload = decision.payload;

    if (!payload || !payload.edgeId) {
      throw new Error('Invalid payload for REMOVE_EDGE decision');
    }

    const modification: GraphModification = {
      id: uuidv4(),
      type: GraphModificationType.REMOVE_EDGE,
      timestamp: Date.now(),
      agentId,
      reason: decision.reasoning,
      edgeId: payload.edgeId,
    };

    await this.graphService.applyModification(modification);
  }

  /**
   * Handle a decision to modify a node
   */
  private async handleModifyNodeDecision(
    state: TState,
    decision: AgentDecision,
    agentId: string,
  ): Promise<void> {
    const payload = decision.payload;

    if (!payload || !payload.nodeId || !payload.updates) {
      throw new Error('Invalid payload for MODIFY_NODE decision');
    }

    const modification: GraphModification = {
      id: uuidv4(),
      type: GraphModificationType.UPDATE_NODE,
      timestamp: Date.now(),
      agentId,
      reason: decision.reasoning,
      nodeId: payload.nodeId,
      updates: {
        ...payload.updates,
        metadata: {
          ...(payload.updates.metadata || {}),
          modifiedBy: agentId,
          modifiedAt: Date.now(),
        },
      },
    };

    await this.graphService.applyModification(modification);
  }

  /**
   * Handle a decision to modify an edge
   */
  private async handleModifyEdgeDecision(
    state: TState,
    decision: AgentDecision,
    agentId: string,
  ): Promise<void> {
    const payload = decision.payload;

    if (!payload || !payload.edgeId || !payload.updates) {
      throw new Error('Invalid payload for MODIFY_EDGE decision');
    }

    const modification: GraphModification = {
      id: uuidv4(),
      type: GraphModificationType.UPDATE_EDGE,
      timestamp: Date.now(),
      agentId,
      reason: decision.reasoning,
      edgeId: payload.edgeId,
      updates: {
        ...payload.updates,
        metadata: {
          ...(payload.updates.metadata || {}),
          modifiedBy: agentId,
          modifiedAt: Date.now(),
        },
      },
    };

    await this.graphService.applyModification(modification);
  }
}
