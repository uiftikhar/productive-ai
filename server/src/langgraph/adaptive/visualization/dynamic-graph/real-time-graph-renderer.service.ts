import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  RealTimeGraphRenderer,
  Graph,
  GraphNode,
  GraphEdge,
  GraphNodeState,
} from '../../interfaces/visualization.interface';

/**
 * Implementation of the real-time graph rendering service
 * This service manages graph data and provides real-time updates to visualization clients
 */
export class RealTimeGraphRendererImpl implements RealTimeGraphRenderer {
  private logger: Logger;
  private graphs: Map<string, Graph> = new Map();
  private graphUpdateListeners: Map<string, ((graph: Graph) => void)[]> =
    new Map();
  private layoutEngines: Map<
    string,
    (nodes: GraphNode[], edges: GraphEdge[]) => void
  > = new Map();

  constructor(
    options: {
      logger?: Logger;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();

    // Register default layout engines
    this.registerDefaultLayoutEngines();

    this.logger.info('Real-time graph renderer service initialized');
  }

  /**
   * Register default layout engines
   */
  private registerDefaultLayoutEngines(): void {
    // Force-directed layout
    this.layoutEngines.set(
      'force-directed',
      this.applyForceDirectedLayout.bind(this),
    );

    // Hierarchical layout
    this.layoutEngines.set(
      'hierarchical',
      this.applyHierarchicalLayout.bind(this),
    );

    // Circular layout
    this.layoutEngines.set('circular', this.applyCircularLayout.bind(this));

    // Grid layout
    this.layoutEngines.set('grid', this.applyGridLayout.bind(this));
  }

  /**
   * Initialize a new graph
   */
  initializeGraph(
    graphId: string,
    name: string,
    layout: string = 'force-directed',
  ): string {
    const id = graphId || uuidv4();

    const graph: Graph = {
      id,
      name,
      nodes: [],
      edges: [],
      layout,
      timestamp: new Date(),
      version: 1,
    };

    this.graphs.set(id, graph);
    this.graphUpdateListeners.set(id, []);

    this.logger.info(`Initialized graph ${id}: ${name}`);

    return id;
  }

  /**
   * Add a node to a graph
   */
  addNode(
    graphId: string,
    node: Omit<GraphNode, 'createdAt' | 'updatedAt'>,
  ): GraphNode {
    const graph = this.graphs.get(graphId);

    if (!graph) {
      this.logger.warn(`Cannot add node to non-existent graph: ${graphId}`);
      throw new Error(`Graph not found: ${graphId}`);
    }

    const now = new Date();
    const newNode: GraphNode = {
      ...node,
      id: node.id || uuidv4(),
      createdAt: now,
      updatedAt: now,
      state: node.state || GraphNodeState.INACTIVE,
    };

    // Add the node
    graph.nodes.push(newNode);

    // Update graph
    graph.timestamp = now;
    graph.version += 1;

    this.logger.debug(`Added node ${newNode.id} to graph ${graphId}`);

    // Notify listeners
    this.notifyGraphListeners(graphId);

    return newNode;
  }

  /**
   * Add an edge to a graph
   */
  addEdge(
    graphId: string,
    edge: Omit<GraphEdge, 'createdAt' | 'updatedAt'>,
  ): GraphEdge {
    const graph = this.graphs.get(graphId);

    if (!graph) {
      this.logger.warn(`Cannot add edge to non-existent graph: ${graphId}`);
      throw new Error(`Graph not found: ${graphId}`);
    }

    // Validate source and target nodes
    const sourceNodeExists = graph.nodes.some(
      (node) => node.id === edge.sourceId,
    );
    const targetNodeExists = graph.nodes.some(
      (node) => node.id === edge.targetId,
    );

    if (!sourceNodeExists || !targetNodeExists) {
      this.logger.warn(
        `Cannot add edge with non-existent source or target node: ${edge.sourceId} -> ${edge.targetId}`,
      );
      throw new Error(
        `Source or target node not found for edge: ${edge.sourceId} -> ${edge.targetId}`,
      );
    }

    const now = new Date();
    const newEdge: GraphEdge = {
      ...edge,
      id: edge.id || uuidv4(),
      createdAt: now,
      updatedAt: now,
    };

    // Add the edge
    graph.edges.push(newEdge);

    // Update graph
    graph.timestamp = now;
    graph.version += 1;

    this.logger.debug(
      `Added edge ${newEdge.id} to graph ${graphId}: ${edge.sourceId} -> ${edge.targetId}`,
    );

    // Notify listeners
    this.notifyGraphListeners(graphId);

    return newEdge;
  }

  /**
   * Update a node in a graph
   */
  updateNode(
    graphId: string,
    nodeId: string,
    updates: Partial<GraphNode>,
  ): GraphNode {
    const graph = this.graphs.get(graphId);

    if (!graph) {
      this.logger.warn(`Cannot update node in non-existent graph: ${graphId}`);
      throw new Error(`Graph not found: ${graphId}`);
    }

    const nodeIndex = graph.nodes.findIndex((node) => node.id === nodeId);

    if (nodeIndex === -1) {
      this.logger.warn(
        `Cannot update non-existent node: ${nodeId} in graph ${graphId}`,
      );
      throw new Error(`Node not found: ${nodeId}`);
    }

    const node = graph.nodes[nodeIndex];
    const now = new Date();

    // Create updated node
    const updatedNode: GraphNode = {
      ...node,
      ...updates,
      id: nodeId, // Ensure ID is not changed
      createdAt: node.createdAt, // Preserve creation time
      updatedAt: now,
    };

    // Update the node
    graph.nodes[nodeIndex] = updatedNode;

    // Update graph
    graph.timestamp = now;
    graph.version += 1;

    this.logger.debug(`Updated node ${nodeId} in graph ${graphId}`);

    // Notify listeners
    this.notifyGraphListeners(graphId);

    return updatedNode;
  }

  /**
   * Update an edge in a graph
   */
  updateEdge(
    graphId: string,
    edgeId: string,
    updates: Partial<GraphEdge>,
  ): GraphEdge {
    const graph = this.graphs.get(graphId);

    if (!graph) {
      this.logger.warn(`Cannot update edge in non-existent graph: ${graphId}`);
      throw new Error(`Graph not found: ${graphId}`);
    }

    const edgeIndex = graph.edges.findIndex((edge) => edge.id === edgeId);

    if (edgeIndex === -1) {
      this.logger.warn(
        `Cannot update non-existent edge: ${edgeId} in graph ${graphId}`,
      );
      throw new Error(`Edge not found: ${edgeId}`);
    }

    const edge = graph.edges[edgeIndex];
    const now = new Date();

    // Create updated edge
    const updatedEdge: GraphEdge = {
      ...edge,
      ...updates,
      id: edgeId, // Ensure ID is not changed
      sourceId: updates.sourceId || edge.sourceId, // Allow updating source
      targetId: updates.targetId || edge.targetId, // Allow updating target
      createdAt: edge.createdAt, // Preserve creation time
      updatedAt: now,
    };

    // If source or target was updated, validate that nodes exist
    if (updates.sourceId || updates.targetId) {
      const sourceNodeExists = graph.nodes.some(
        (node) => node.id === updatedEdge.sourceId,
      );
      const targetNodeExists = graph.nodes.some(
        (node) => node.id === updatedEdge.targetId,
      );

      if (!sourceNodeExists || !targetNodeExists) {
        this.logger.warn(
          `Cannot update edge with non-existent source or target node: ${updatedEdge.sourceId} -> ${updatedEdge.targetId}`,
        );
        throw new Error(
          `Source or target node not found for updated edge: ${updatedEdge.sourceId} -> ${updatedEdge.targetId}`,
        );
      }
    }

    // Update the edge
    graph.edges[edgeIndex] = updatedEdge;

    // Update graph
    graph.timestamp = now;
    graph.version += 1;

    this.logger.debug(`Updated edge ${edgeId} in graph ${graphId}`);

    // Notify listeners
    this.notifyGraphListeners(graphId);

    return updatedEdge;
  }

  /**
   * Remove a node from a graph
   */
  removeNode(graphId: string, nodeId: string): boolean {
    const graph = this.graphs.get(graphId);

    if (!graph) {
      this.logger.warn(
        `Cannot remove node from non-existent graph: ${graphId}`,
      );
      return false;
    }

    const nodeIndex = graph.nodes.findIndex((node) => node.id === nodeId);

    if (nodeIndex === -1) {
      this.logger.warn(
        `Cannot remove non-existent node: ${nodeId} from graph ${graphId}`,
      );
      return false;
    }

    // Remove the node
    graph.nodes.splice(nodeIndex, 1);

    // Remove any edges connected to this node
    graph.edges = graph.edges.filter(
      (edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId,
    );

    // Update graph
    graph.timestamp = new Date();
    graph.version += 1;

    this.logger.debug(
      `Removed node ${nodeId} and its connected edges from graph ${graphId}`,
    );

    // Notify listeners
    this.notifyGraphListeners(graphId);

    return true;
  }

  /**
   * Remove an edge from a graph
   */
  removeEdge(graphId: string, edgeId: string): boolean {
    const graph = this.graphs.get(graphId);

    if (!graph) {
      this.logger.warn(
        `Cannot remove edge from non-existent graph: ${graphId}`,
      );
      return false;
    }

    const edgeIndex = graph.edges.findIndex((edge) => edge.id === edgeId);

    if (edgeIndex === -1) {
      this.logger.warn(
        `Cannot remove non-existent edge: ${edgeId} from graph ${graphId}`,
      );
      return false;
    }

    // Remove the edge
    graph.edges.splice(edgeIndex, 1);

    // Update graph
    graph.timestamp = new Date();
    graph.version += 1;

    this.logger.debug(`Removed edge ${edgeId} from graph ${graphId}`);

    // Notify listeners
    this.notifyGraphListeners(graphId);

    return true;
  }

  /**
   * Get a graph by ID
   */
  getGraph(graphId: string): Graph {
    const graph = this.graphs.get(graphId);

    if (!graph) {
      this.logger.warn(`Graph not found: ${graphId}`);
      throw new Error(`Graph not found: ${graphId}`);
    }

    return JSON.parse(JSON.stringify(graph)); // Return a copy to prevent modification
  }

  /**
   * Apply a layout to a graph
   */
  applyLayout(graphId: string, layoutType: string): boolean {
    const graph = this.graphs.get(graphId);

    if (!graph) {
      this.logger.warn(`Cannot apply layout to non-existent graph: ${graphId}`);
      return false;
    }

    const layoutEngine = this.layoutEngines.get(layoutType);

    if (!layoutEngine) {
      this.logger.warn(`Layout engine not found: ${layoutType}`);
      return false;
    }

    // Apply the layout
    layoutEngine(graph.nodes, graph.edges);

    // Update graph
    graph.layout = layoutType;
    graph.timestamp = new Date();
    graph.version += 1;

    this.logger.info(`Applied ${layoutType} layout to graph ${graphId}`);

    // Notify listeners
    this.notifyGraphListeners(graphId);

    return true;
  }

  /**
   * Subscribe to graph updates
   */
  subscribeToGraphUpdates(
    graphId: string,
    callback: (graph: Graph) => void,
  ): () => void {
    const graph = this.graphs.get(graphId);

    if (!graph) {
      this.logger.warn(`Cannot subscribe to non-existent graph: ${graphId}`);
      throw new Error(`Graph not found: ${graphId}`);
    }

    let listeners = this.graphUpdateListeners.get(graphId);

    if (!listeners) {
      listeners = [];
      this.graphUpdateListeners.set(graphId, listeners);
    }

    // Add listener
    listeners.push(callback);

    this.logger.debug(`Added graph update listener for graph ${graphId}`);

    // Initial callback with current state
    callback(JSON.parse(JSON.stringify(graph)));

    // Return unsubscribe function
    return () => {
      const currentListeners = this.graphUpdateListeners.get(graphId);

      if (currentListeners) {
        this.graphUpdateListeners.set(
          graphId,
          currentListeners.filter((cb) => cb !== callback),
        );

        this.logger.debug(`Removed graph update listener for graph ${graphId}`);
      }
    };
  }

  /**
   * Notify graph update listeners
   */
  private notifyGraphListeners(graphId: string): void {
    const graph = this.graphs.get(graphId);
    const listeners = this.graphUpdateListeners.get(graphId);

    if (!graph || !listeners) {
      return;
    }

    const graphCopy = JSON.parse(JSON.stringify(graph));

    for (const listener of listeners) {
      try {
        listener(graphCopy);
      } catch (error) {
        this.logger.error(
          `Error in graph update listener for graph ${graphId}`,
          { error },
        );
      }
    }
  }

  /**
   * Apply force-directed layout to nodes
   * This is a simplified simulation - in a real implementation, we would use a proper physics engine
   */
  private applyForceDirectedLayout(
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): void {
    if (nodes.length === 0) {
      return;
    }

    // Set initial random positions if not already set
    for (const node of nodes) {
      if (!node.position) {
        node.position = {
          x: Math.random() * 1000,
          y: Math.random() * 1000,
        };
      }
    }

    // In a real implementation, we would run the force simulation here
    // For this simplified version, we'll just add some randomness to give the appearance of a layout
    for (const node of nodes) {
      if (node.position) {
        node.position.x += (Math.random() - 0.5) * 50;
        node.position.y += (Math.random() - 0.5) * 50;
      }
    }
  }

  /**
   * Apply hierarchical layout to nodes
   */
  private applyHierarchicalLayout(
    nodes: GraphNode[],
    edges: GraphEdge[],
  ): void {
    if (nodes.length === 0) {
      return;
    }

    // Create a map of node levels (how deep in the hierarchy)
    const nodeLevels = new Map<string, number>();

    // Find root nodes (no incoming edges)
    const nodeInDegree = new Map<string, number>();
    for (const node of nodes) {
      nodeInDegree.set(node.id, 0);
    }

    for (const edge of edges) {
      const targetInDegree = nodeInDegree.get(edge.targetId) || 0;
      nodeInDegree.set(edge.targetId, targetInDegree + 1);
    }

    const rootNodes = nodes
      .filter((node) => (nodeInDegree.get(node.id) || 0) === 0)
      .map((node) => node.id);

    // If no root nodes found, use the first node as root
    if (rootNodes.length === 0 && nodes.length > 0) {
      rootNodes.push(nodes[0].id);
    }

    // Assign levels starting from roots
    for (const rootId of rootNodes) {
      nodeLevels.set(rootId, 0);
    }

    // BFS to assign levels
    let changed = true;
    while (changed) {
      changed = false;

      for (const edge of edges) {
        const sourceLevel = nodeLevels.get(edge.sourceId);

        if (sourceLevel !== undefined) {
          const targetLevel = nodeLevels.get(edge.targetId);
          const newLevel = sourceLevel + 1;

          if (targetLevel === undefined || targetLevel < newLevel) {
            nodeLevels.set(edge.targetId, newLevel);
            changed = true;
          }
        }
      }
    }

    // Group nodes by level
    const nodesByLevel = new Map<number, string[]>();
    for (const [nodeId, level] of nodeLevels.entries()) {
      if (!nodesByLevel.has(level)) {
        nodesByLevel.set(level, []);
      }
      nodesByLevel.get(level)?.push(nodeId);
    }

    // Position nodes by level
    const maxLevel = Math.max(...Array.from(nodeLevels.values()));
    const levelHeight = 150;
    const levelWidth = 1000;

    for (const [level, nodeIds] of nodesByLevel.entries()) {
      const nodesInLevel = nodeIds.length;
      const spacing = levelWidth / (nodesInLevel + 1);

      for (let i = 0; i < nodeIds.length; i++) {
        const nodeId = nodeIds[i];
        const node = nodes.find((n) => n.id === nodeId);

        if (node) {
          node.position = {
            x: spacing * (i + 1),
            y: level * levelHeight,
          };
        }
      }
    }

    // For nodes without levels, position them at the bottom
    for (const node of nodes) {
      if (!nodeLevels.has(node.id)) {
        node.position = {
          x: Math.random() * levelWidth,
          y: (maxLevel + 1) * levelHeight,
        };
      }
    }
  }

  /**
   * Apply circular layout to nodes
   */
  private applyCircularLayout(nodes: GraphNode[], edges: GraphEdge[]): void {
    if (nodes.length === 0) {
      return;
    }

    const radius = Math.min(500, nodes.length * 50);
    const centerX = 500;
    const centerY = 500;

    // Position nodes in a circle
    for (let i = 0; i < nodes.length; i++) {
      const angle = (i / nodes.length) * 2 * Math.PI;

      nodes[i].position = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    }
  }

  /**
   * Apply grid layout to nodes
   */
  private applyGridLayout(nodes: GraphNode[], edges: GraphEdge[]): void {
    if (nodes.length === 0) {
      return;
    }

    const cellSize = 150;
    const gridWidth = Math.ceil(Math.sqrt(nodes.length));

    for (let i = 0; i < nodes.length; i++) {
      const row = Math.floor(i / gridWidth);
      const col = i % gridWidth;

      nodes[i].position = {
        x: col * cellSize + 50,
        y: row * cellSize + 50,
      };
    }
  }
}
