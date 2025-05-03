import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  PathHighlighting,
  GraphNodeState,
} from '../../interfaces/visualization.interface';
import { RealTimeGraphRendererImpl } from './real-time-graph-renderer.service';

/**
 * Implementation of the path highlighting service
 * This service manages highlighting of nodes and edges in workflow graphs
 */
export class PathHighlightingImpl implements PathHighlighting {
  private logger: Logger;
  private graphRenderer: RealTimeGraphRendererImpl;
  private highlightedElements: Map<
    string,
    { nodeIds: string[]; edgeIds: string[] }
  > = new Map(); // graphId -> highlighted elements
  private highlightListeners: Map<
    string,
    ((highlights: { nodeIds: string[]; edgeIds: string[] }) => void)[]
  > = new Map();
  private highlightTypes: Map<string, Map<string, string>> = new Map(); // graphId -> (elementId -> highlight type)
  private activeExecutions: Map<string, string[]> = new Map(); // graphId -> taskIds

  constructor(options: {
    logger?: Logger;
    graphRenderer: RealTimeGraphRendererImpl;
  }) {
    this.logger = options.logger || new ConsoleLogger();

    if (!options.graphRenderer) {
      throw new Error('Path highlighting service requires a graph renderer');
    }

    this.graphRenderer = options.graphRenderer;
    this.logger.info('Path highlighting service initialized');
  }

  /**
   * Highlight a specific node
   */
  highlightNode(
    graphId: string,
    nodeId: string,
    highlightType: string = 'default',
  ): boolean {
    try {
      // Get current graph state to validate nodeId
      const graph = this.graphRenderer.getGraph(graphId);

      // Check if node exists
      const nodeExists = graph.nodes.some((node) => node.id === nodeId);
      if (!nodeExists) {
        this.logger.warn(`Cannot highlight non-existent node: ${nodeId}`);
        return false;
      }

      // Update node state to highlighted
      this.graphRenderer.updateNode(graphId, nodeId, {
        state: GraphNodeState.HIGHLIGHTED,
      });

      // Store highlight
      this.addHighlightedElement(graphId, 'node', nodeId, highlightType);

      this.logger.debug(
        `Highlighted node ${nodeId} in graph ${graphId} with type ${highlightType}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Error highlighting node ${nodeId} in graph ${graphId}:`,
        { error },
      );
      return false;
    }
  }

  /**
   * Highlight a specific edge
   */
  highlightEdge(
    graphId: string,
    edgeId: string,
    highlightType: string = 'default',
  ): boolean {
    try {
      // Get current graph state to validate edgeId
      const graph = this.graphRenderer.getGraph(graphId);

      // Check if edge exists
      const edgeExists = graph.edges.some((edge) => edge.id === edgeId);
      if (!edgeExists) {
        this.logger.warn(`Cannot highlight non-existent edge: ${edgeId}`);
        return false;
      }

      // Update edge state
      this.graphRenderer.updateEdge(graphId, edgeId, {
        state: 'highlighted',
        animated: true,
      });

      // Store highlight
      this.addHighlightedElement(graphId, 'edge', edgeId, highlightType);

      this.logger.debug(
        `Highlighted edge ${edgeId} in graph ${graphId} with type ${highlightType}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Error highlighting edge ${edgeId} in graph ${graphId}:`,
        { error },
      );
      return false;
    }
  }

  /**
   * Highlight a path of nodes and edges
   */
  highlightPath(
    graphId: string,
    nodeIds: string[],
    edgeIds: string[],
    highlightType: string = 'default',
  ): boolean {
    let success = true;

    // Highlight all nodes in the path
    for (const nodeId of nodeIds) {
      const result = this.highlightNode(graphId, nodeId, highlightType);
      if (!result) {
        success = false;
      }
    }

    // Highlight all edges in the path
    for (const edgeId of edgeIds) {
      const result = this.highlightEdge(graphId, edgeId, highlightType);
      if (!result) {
        success = false;
      }
    }

    if (success) {
      this.logger.info(
        `Highlighted path with ${nodeIds.length} nodes and ${edgeIds.length} edges in graph ${graphId}`,
      );
    } else {
      this.logger.warn(`Partially highlighted path in graph ${graphId}`);
    }

    // Notify listeners
    this.notifyHighlightListeners(graphId);

    return success;
  }

  /**
   * Clear all highlights in a graph
   */
  clearHighlights(graphId: string): boolean {
    try {
      // Get current highlighted elements
      const highlights = this.highlightedElements.get(graphId);
      if (!highlights) {
        // No highlights to clear
        return true;
      }

      const { nodeIds, edgeIds } = highlights;

      // Reset node states
      for (const nodeId of nodeIds) {
        try {
          this.graphRenderer.updateNode(graphId, nodeId, {
            state: GraphNodeState.ACTIVE,
          });
        } catch (error) {
          // Node may have been removed, ignore
        }
      }

      // Reset edge states
      for (const edgeId of edgeIds) {
        try {
          this.graphRenderer.updateEdge(graphId, edgeId, {
            state: undefined,
            animated: false,
          });
        } catch (error) {
          // Edge may have been removed, ignore
        }
      }

      // Clear stored highlights
      this.highlightedElements.set(graphId, { nodeIds: [], edgeIds: [] });

      // Clear highlight types
      if (this.highlightTypes.has(graphId)) {
        this.highlightTypes.get(graphId)?.clear();
      }

      this.logger.info(`Cleared all highlights in graph ${graphId}`);

      // Notify listeners
      this.notifyHighlightListeners(graphId);

      return true;
    } catch (error) {
      this.logger.error(`Error clearing highlights in graph ${graphId}:`, {
        error,
      });
      return false;
    }
  }

  /**
   * Highlight the active execution path for a task
   */
  highlightActiveExecution(graphId: string, taskId: string): boolean {
    try {
      // Get current graph state
      const graph = this.graphRenderer.getGraph(graphId);

      // Find task node
      const taskNode = graph.nodes.find((node) => node.id === taskId);
      if (!taskNode) {
        this.logger.warn(`Task node ${taskId} not found in graph ${graphId}`);
        return false;
      }

      // Find all nodes and edges related to this task
      const relatedNodes: string[] = [taskId];
      const relatedEdges: string[] = [];

      // Find incoming and outgoing edges
      for (const edge of graph.edges) {
        if (edge.sourceId === taskId || edge.targetId === taskId) {
          relatedEdges.push(edge.id);

          // Add the node at the other end
          const relatedNodeId =
            edge.sourceId === taskId ? edge.targetId : edge.sourceId;
          if (!relatedNodes.includes(relatedNodeId)) {
            relatedNodes.push(relatedNodeId);
          }
        }
      }

      // Store active execution
      if (!this.activeExecutions.has(graphId)) {
        this.activeExecutions.set(graphId, []);
      }
      this.activeExecutions.get(graphId)?.push(taskId);

      // Highlight the path
      const success = this.highlightPath(
        graphId,
        relatedNodes,
        relatedEdges,
        'active-execution',
      );

      if (success) {
        this.logger.info(
          `Highlighted active execution for task ${taskId} in graph ${graphId}`,
        );
      }

      return success;
    } catch (error) {
      this.logger.error(
        `Error highlighting active execution for task ${taskId} in graph ${graphId}:`,
        { error },
      );
      return false;
    }
  }

  /**
   * Get currently highlighted elements in a graph
   */
  getHighlightedElements(graphId: string): {
    nodeIds: string[];
    edgeIds: string[];
  } {
    return (
      this.highlightedElements.get(graphId) || { nodeIds: [], edgeIds: [] }
    );
  }

  /**
   * Subscribe to highlight updates
   */
  subscribeToHighlightUpdates(
    graphId: string,
    callback: (highlights: { nodeIds: string[]; edgeIds: string[] }) => void,
  ): () => void {
    let listeners = this.highlightListeners.get(graphId);

    if (!listeners) {
      listeners = [];
      this.highlightListeners.set(graphId, listeners);
    }

    // Add listener
    listeners.push(callback);

    this.logger.debug(`Added highlight update listener for graph ${graphId}`);

    // Initial callback with current state
    const currentHighlights = this.getHighlightedElements(graphId);
    callback({ ...currentHighlights });

    // Return unsubscribe function
    return () => {
      const currentListeners = this.highlightListeners.get(graphId);

      if (currentListeners) {
        this.highlightListeners.set(
          graphId,
          currentListeners.filter((cb) => cb !== callback),
        );

        this.logger.debug(
          `Removed highlight update listener for graph ${graphId}`,
        );
      }
    };
  }

  /**
   * Notify highlight update listeners
   */
  private notifyHighlightListeners(graphId: string): void {
    const listeners = this.highlightListeners.get(graphId) || [];
    const highlights = this.getHighlightedElements(graphId);

    for (const listener of listeners) {
      try {
        listener({ ...highlights });
      } catch (error) {
        this.logger.error(
          `Error in highlight update listener for graph ${graphId}:`,
          { error },
        );
      }
    }
  }

  /**
   * Add a highlighted element to the tracking maps
   */
  private addHighlightedElement(
    graphId: string,
    elementType: 'node' | 'edge',
    elementId: string,
    highlightType: string,
  ): void {
    // Initialize maps if needed
    if (!this.highlightedElements.has(graphId)) {
      this.highlightedElements.set(graphId, { nodeIds: [], edgeIds: [] });
    }

    if (!this.highlightTypes.has(graphId)) {
      this.highlightTypes.set(graphId, new Map());
    }

    // Add element to the appropriate list
    const highlights = this.highlightedElements.get(graphId)!;

    if (elementType === 'node') {
      if (!highlights.nodeIds.includes(elementId)) {
        highlights.nodeIds.push(elementId);
      }
    } else {
      if (!highlights.edgeIds.includes(elementId)) {
        highlights.edgeIds.push(elementId);
      }
    }

    // Store highlight type
    this.highlightTypes.get(graphId)?.set(elementId, highlightType);

    // Notify listeners
    this.notifyHighlightListeners(graphId);
  }

  /**
   * Get highlight type for an element
   */
  getHighlightType(graphId: string, elementId: string): string | undefined {
    return this.highlightTypes.get(graphId)?.get(elementId);
  }

  /**
   * Get all elements with a specific highlight type
   */
  getElementsByHighlightType(
    graphId: string,
    highlightType: string,
  ): { nodeIds: string[]; edgeIds: string[] } {
    const result = { nodeIds: [] as string[], edgeIds: [] as string[] };

    const typeMap = this.highlightTypes.get(graphId);
    if (!typeMap) {
      return result;
    }

    // Find all elements with the matching type
    for (const [elementId, type] of typeMap.entries()) {
      if (type === highlightType) {
        const highlights = this.highlightedElements.get(graphId);
        if (highlights) {
          if (highlights.nodeIds.includes(elementId)) {
            result.nodeIds.push(elementId);
          } else if (highlights.edgeIds.includes(elementId)) {
            result.edgeIds.push(elementId);
          }
        }
      }
    }

    return result;
  }

  /**
   * Get active executions for a graph
   */
  getActiveExecutions(graphId: string): string[] {
    return this.activeExecutions.get(graphId) || [];
  }
}
