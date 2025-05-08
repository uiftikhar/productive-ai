import { v4 as uuidv4 } from 'uuid';
import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

import {
  DynamicGraphNode,
  DynamicGraphEdge,
  GraphModification,
  GraphModificationType,
  GraphModifier,
  AddNodeModification,
  RemoveNodeModification,
  AddEdgeModification,
  RemoveEdgeModification,
  UpdateNodeModification,
  UpdateEdgeModification,
} from './interfaces/graph-modification.interface';

/**
 * Dynamic graph state interface
 */
export interface DynamicGraphState {
  id: string;
  runId: string;
  nodes: Map<string, DynamicGraphNode>;
  edges: Map<string, DynamicGraphEdge>;
  modificationHistory: GraphModification[];
  metadata: Record<string, any>;
  executionPath: string[];
  currentNodeId?: string;
  [key: string]: any;
}

/**
 * Service for creating and managing dynamic graphs that can be modified at runtime
 */
export class DynamicGraphService<
  TState extends DynamicGraphState = DynamicGraphState,
> implements GraphModifier<TState>
{
  private nodes: Map<string, DynamicGraphNode<TState>> = new Map();
  private edges: Map<string, DynamicGraphEdge> = new Map();
  private modificationHistory: GraphModification<TState>[] = [];
  private graph?: StateGraph<any>;
  private compiledGraph?: any;
  private needsRecompilation: boolean = true;
  logger: Logger;

  /**
   * Create a new dynamic graph service
   */
  constructor(
    options: {
      initialNodes?: DynamicGraphNode<TState>[];
      initialEdges?: DynamicGraphEdge[];
      logger?: Logger;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();

    // Add initial nodes
    if (options.initialNodes) {
      for (const node of options.initialNodes) {
        this.nodes.set(node.id, node);
      }
    }

    // Add initial edges
    if (options.initialEdges) {
      for (const edge of options.initialEdges) {
        this.edges.set(edge.id, edge);
      }
    }

    this.logger.info('Dynamic graph service initialized', {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
    });
  }

  /**
   * Create the state schema for our dynamic graph
   */
  private createSchema() {
    return {
      id: Annotation<string>({
        default: () => uuidv4(),
        value: (curr, update) => update || curr,
      }),
      runId: Annotation<string>({
        default: () => uuidv4(),
        value: (curr, update) => update || curr,
      }),
      nodes: Annotation<Map<string, DynamicGraphNode<TState>>>({
        default: () => new Map(),
        value: (curr, update) => update || curr,
      }),
      edges: Annotation<Map<string, DynamicGraphEdge>>({
        default: () => new Map(),
        value: (curr, update) => update || curr,
      }),
      modificationHistory: Annotation<GraphModification<TState>[]>({
        default: () => [],
        value: (curr, update) => update || curr || [],
      }),
      metadata: Annotation<Record<string, any>>({
        default: () => ({}),
        value: (curr, update) =>
          update ? { ...(curr || {}), ...update } : curr || {},
      }),
      executionPath: Annotation<string[]>({
        default: () => [],
        value: (curr, update) => update || curr || [],
      }),
      currentNodeId: Annotation<string | undefined>({
        default: () => undefined,
        value: (curr, update) => (update !== undefined ? update : curr),
      }),
    };
  }

  /**
   * Create and initialize the graph
   */
  public createGraph(): StateGraph<any> {
    // Create a new graph with schema
    const schema = this.createSchema();
    this.graph = new StateGraph(schema);

    // Cast the graph to any to avoid TypeScript errors when adding edges/nodes
    const typedGraph = this.graph as any;

    // Add all nodes to the graph
    for (const node of this.nodes.values()) {
      if (node.handler) {
        const handler = node.handler; // Store handler to avoid undefined checks
        typedGraph.addNode(node.id, async (state: any) => {
          // Execute the node handler with state tracking
          const result = await handler(state);

          return {
            ...result,
            // Add execution path and current node ID
            executionPath: [...(state.executionPath || []), node.id],
            currentNodeId: node.id,
          };
        });
      }
    }

    // Add all edges to the graph
    for (const edge of this.edges.values()) {
      if (edge.condition) {
        // For conditional edges, use addConditionalEdges
        typedGraph.addConditionalEdges(edge.source, (state: any) => {
          return edge.condition && edge.condition(state) ? edge.target : null;
        });
      } else {
        // Handle special nodes START and END
        if (edge.source === START && typeof edge.target === 'string') {
          // Start edge
          typedGraph.addEdge(START, edge.target);
        } else if (edge.target === END && typeof edge.source === 'string') {
          // End edge
          typedGraph.addEdge(edge.source, END);
        } else if (
          typeof edge.source === 'string' &&
          typeof edge.target === 'string'
        ) {
          // Normal edge between normal nodes
          typedGraph.addEdge(edge.source, edge.target);
        }
      }
    }

    // Set start and end nodes if not already connected
    if (!this.hasStartConnections()) {
      // Find potential start nodes (nodes with no incoming edges)
      const startNodes = this.findStartNodes();
      for (const nodeId of startNodes) {
        typedGraph.addEdge(START, nodeId);
      }
    }

    if (!this.hasEndConnections()) {
      // Find potential end nodes (nodes with no outgoing edges)
      const endNodes = this.findEndNodes();
      for (const nodeId of endNodes) {
        typedGraph.addEdge(nodeId, END);
      }
    }

    // Compile the graph
    this.compiledGraph = typedGraph.compile();
    this.needsRecompilation = false;

    return this.graph;
  }

  /**
   * Execute the graph with initial state
   */
  public async execute(initialState: Partial<TState>): Promise<TState> {
    if (this.needsRecompilation || !this.compiledGraph) {
      this.createGraph();
    }

    // Create a complete state object from partial state
    const completeState = {
      id: initialState.id || uuidv4(),
      runId: initialState.runId || uuidv4(),
      nodes: new Map(this.nodes),
      edges: new Map(this.edges),
      modificationHistory: [...this.modificationHistory],
      metadata: initialState.metadata || {},
      executionPath: [],
      ...initialState,
    };

    this.logger.info('Executing dynamic graph', {
      graphId: completeState.id,
      runId: completeState.runId,
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
    });

    // Execute the graph
    try {
      const result = await this.compiledGraph.invoke(completeState);
      return result as TState;
    } catch (error) {
      this.logger.error('Error executing dynamic graph', {
        error: error instanceof Error ? error.message : String(error),
        graphId: completeState.id,
        runId: completeState.runId,
      });
      throw error;
    }
  }

  /**
   * Apply a modification to the graph
   */
  public async applyModification(
    modification: GraphModification<TState>,
  ): Promise<boolean> {
    try {
      let success = false;

      switch (modification.type) {
        case GraphModificationType.ADD_NODE:
          success = this.addNode(
            (modification as AddNodeModification<TState>).node,
          );
          break;

        case GraphModificationType.REMOVE_NODE:
          success = this.removeNode(
            (modification as RemoveNodeModification).nodeId,
          );
          break;

        case GraphModificationType.ADD_EDGE:
          success = this.addEdge((modification as AddEdgeModification).edge);
          break;

        case GraphModificationType.REMOVE_EDGE:
          success = this.removeEdge(
            (modification as RemoveEdgeModification).edgeId,
          );
          break;

        case GraphModificationType.UPDATE_NODE:
          const updateNodeMod = modification as UpdateNodeModification<TState>;
          success = this.updateNode(
            updateNodeMod.nodeId,
            updateNodeMod.updates,
          );
          break;

        case GraphModificationType.UPDATE_EDGE:
          const updateEdgeMod = modification as UpdateEdgeModification;
          success = this.updateEdge(
            updateEdgeMod.edgeId,
            updateEdgeMod.updates,
          );
          break;
      }

      if (success) {
        // Add the modification to history
        this.modificationHistory.push(modification);

        // Mark for recompilation
        this.needsRecompilation = true;

        this.logger.info('Applied graph modification', {
          type: modification.type,
          id: modification.id,
        });
      }

      return success;
    } catch (error) {
      this.logger.error('Error applying graph modification', {
        error: error instanceof Error ? error.message : String(error),
        modificationType: modification.type,
        modificationId: modification.id,
      });
      return false;
    }
  }

  /**
   * Apply multiple modifications to the graph
   */
  public async applyModifications(
    modifications: GraphModification<TState>[],
  ): Promise<boolean[]> {
    const results: boolean[] = [];

    for (const modification of modifications) {
      const result = await this.applyModification(modification);
      results.push(result);
    }

    return results;
  }

  /**
   * Get the modification history
   */
  public getModificationHistory(): GraphModification<TState>[] {
    return [...this.modificationHistory];
  }

  /**
   * Add a node to the graph
   */
  private addNode(node: DynamicGraphNode<TState>): boolean {
    // Check if node already exists
    if (this.nodes.has(node.id)) {
      return false;
    }

    // Add the node
    this.nodes.set(node.id, node);
    return true;
  }

  /**
   * Remove a node from the graph
   */
  private removeNode(nodeId: string): boolean {
    // Check if node exists
    if (!this.nodes.has(nodeId)) {
      return false;
    }

    // Remove all edges connected to this node
    for (const [edgeId, edge] of this.edges.entries()) {
      if (edge.source === nodeId || edge.target === nodeId) {
        this.edges.delete(edgeId);
      }
    }

    // Remove the node
    this.nodes.delete(nodeId);
    return true;
  }

  /**
   * Add an edge to the graph
   */
  private addEdge(edge: DynamicGraphEdge): boolean {
    // Check if edge already exists
    if (this.edges.has(edge.id)) {
      return false;
    }

    // Check if source and target nodes exist
    if (!this.nodes.has(edge.source) && edge.source !== START) {
      return false;
    }
    if (!this.nodes.has(edge.target) && edge.target !== END) {
      return false;
    }

    // Add the edge
    this.edges.set(edge.id, edge);
    return true;
  }

  /**
   * Remove an edge from the graph
   */
  private removeEdge(edgeId: string): boolean {
    // Check if edge exists
    if (!this.edges.has(edgeId)) {
      return false;
    }

    // Remove the edge
    this.edges.delete(edgeId);
    return true;
  }

  /**
   * Update a node in the graph
   */
  private updateNode(
    nodeId: string,
    updates: Partial<DynamicGraphNode<TState>>,
  ): boolean {
    // Check if node exists
    if (!this.nodes.has(nodeId)) {
      return false;
    }

    // Get the current node
    const currentNode = this.nodes.get(nodeId)!;

    // Update the node
    this.nodes.set(nodeId, {
      ...currentNode,
      ...updates,
      id: nodeId, // Ensure ID doesn't change
    });

    return true;
  }

  /**
   * Update an edge in the graph
   */
  private updateEdge(
    edgeId: string,
    updates: Partial<DynamicGraphEdge>,
  ): boolean {
    // Check if edge exists
    if (!this.edges.has(edgeId)) {
      return false;
    }

    // Get the current edge
    const currentEdge = this.edges.get(edgeId)!;

    // Update the edge
    this.edges.set(edgeId, {
      ...currentEdge,
      ...updates,
      id: edgeId, // Ensure ID doesn't change
    });

    return true;
  }

  /**
   * Check if the graph has connections from START
   */
  private hasStartConnections(): boolean {
    for (const edge of this.edges.values()) {
      if (edge.source === START) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if the graph has connections to END
   */
  private hasEndConnections(): boolean {
    for (const edge of this.edges.values()) {
      if (edge.target === END) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find nodes with no incoming edges (potential start nodes)
   */
  private findStartNodes(): string[] {
    const nodesWithIncomingEdges = new Set<string>();

    // Find all nodes that have incoming edges
    for (const edge of this.edges.values()) {
      if (edge.target !== START) {
        nodesWithIncomingEdges.add(edge.target);
      }
    }

    // Find nodes without incoming edges
    const startNodes: string[] = [];
    for (const nodeId of this.nodes.keys()) {
      if (!nodesWithIncomingEdges.has(nodeId)) {
        startNodes.push(nodeId);
      }
    }

    return startNodes;
  }

  /**
   * Find nodes with no outgoing edges (potential end nodes)
   */
  private findEndNodes(): string[] {
    const nodesWithOutgoingEdges = new Set<string>();

    // Find all nodes that have outgoing edges
    for (const edge of this.edges.values()) {
      if (edge.source !== END) {
        nodesWithOutgoingEdges.add(edge.source);
      }
    }

    // Find nodes without outgoing edges
    const endNodes: string[] = [];
    for (const nodeId of this.nodes.keys()) {
      if (!nodesWithOutgoingEdges.has(nodeId)) {
        endNodes.push(nodeId);
      }
    }

    return endNodes;
  }
}
