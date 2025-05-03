import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  InteractiveNodeExploration,
  RealTimeGraphRenderer,
  Graph,
  GraphNode
} from '../../interfaces/visualization.interface';

/**
 * Implementation of the interactive node exploration service
 * This service provides interactive exploration of graph nodes and custom views
 */
export class InteractiveNodeExplorationImpl implements InteractiveNodeExploration {
  private logger: Logger;
  private graphRenderer: RealTimeGraphRenderer;
  private views: Map<string, {
    graphId: string;
    focusedNodeId?: string;
    filters: Map<string, Record<string, any>>;
    activeFilters: Set<string>;
    customData: Record<string, any>;
  }> = new Map();

  constructor(options: {
    logger?: Logger;
    graphRenderer: RealTimeGraphRenderer;
  }) {
    this.logger = options.logger || new ConsoleLogger();
    this.graphRenderer = options.graphRenderer;
    
    if (!this.graphRenderer) {
      throw new Error('Graph renderer is required for interactive node exploration');
    }
    
    this.logger.info('Interactive node exploration service initialized');
  }

  /**
   * Create a new interactive view for a graph
   */
  createInteractiveView(graphId: string): string {
    // Verify the graph exists
    try {
      this.graphRenderer.getGraph(graphId);
    } catch (error) {
      this.logger.warn(`Cannot create view for non-existent graph: ${graphId}`);
      throw new Error(`Graph not found: ${graphId}`);
    }
    
    const viewId = uuidv4();
    
    this.views.set(viewId, {
      graphId,
      filters: new Map(),
      activeFilters: new Set(),
      customData: {}
    });
    
    this.logger.debug(`Created interactive view ${viewId} for graph ${graphId}`);
    
    return viewId;
  }

  /**
   * Focus on a specific node in a view
   */
  focusOnNode(viewId: string, nodeId: string): boolean {
    const view = this.getView(viewId);
    
    // Verify the node exists in the graph
    const graph = this.graphRenderer.getGraph(view.graphId);
    const nodeExists = graph.nodes.some(node => node.id === nodeId);
    
    if (!nodeExists) {
      this.logger.warn(`Cannot focus on non-existent node: ${nodeId}`);
      return false;
    }
    
    // Update the view's focus
    view.focusedNodeId = nodeId;
    
    this.logger.debug(`Focused view ${viewId} on node ${nodeId}`);
    
    return true;
  }

  /**
   * Expand a node to show its related nodes
   */
  expandNode(viewId: string, nodeId: string): string[] {
    const view = this.getView(viewId);
    
    // Get the graph and verify the node exists
    const graph = this.graphRenderer.getGraph(view.graphId);
    const node = graph.nodes.find(n => n.id === nodeId);
    
    if (!node) {
      this.logger.warn(`Cannot expand non-existent node: ${nodeId}`);
      throw new Error(`Node not found: ${nodeId}`);
    }
    
    // Find edges connected to this node
    const relatedEdges = graph.edges.filter(
      edge => edge.sourceId === nodeId || edge.targetId === nodeId
    );
    
    // Get IDs of related nodes
    const relatedNodeIds = new Set<string>();
    
    for (const edge of relatedEdges) {
      if (edge.sourceId === nodeId) {
        relatedNodeIds.add(edge.targetId);
      } else {
        relatedNodeIds.add(edge.sourceId);
      }
    }
    
    // Return array of related node IDs
    const relatedNodes = Array.from(relatedNodeIds);
    
    this.logger.debug(`Expanded node ${nodeId}, found ${relatedNodes.length} related nodes`);
    
    return relatedNodes;
  }

  /**
   * Get detailed information about a node
   */
  getNodeDetails(viewId: string, nodeId: string): Record<string, any> {
    const view = this.getView(viewId);
    
    // Get the graph and verify the node exists
    const graph = this.graphRenderer.getGraph(view.graphId);
    const node = graph.nodes.find(n => n.id === nodeId);
    
    if (!node) {
      this.logger.warn(`Cannot get details for non-existent node: ${nodeId}`);
      throw new Error(`Node not found: ${nodeId}`);
    }
    
    // Find edges connected to this node
    const incomingEdges = graph.edges.filter(edge => edge.targetId === nodeId);
    const outgoingEdges = graph.edges.filter(edge => edge.sourceId === nodeId);
    
    // Count relations by type
    const relationsByType: Record<string, number> = {};
    
    for (const edge of [...incomingEdges, ...outgoingEdges]) {
      relationsByType[edge.type] = (relationsByType[edge.type] || 0) + 1;
    }
    
    // Find parent and child nodes if applicable
    const parentNode = node.parentId 
      ? graph.nodes.find(n => n.id === node.parentId) 
      : undefined;
      
    const childNodes = node.childIds 
      ? node.childIds.map(id => graph.nodes.find(n => n.id === id)).filter(Boolean)
      : [];
    
    // Create detailed node information
    const details = {
      ...node,
      connections: {
        incoming: incomingEdges.length,
        outgoing: outgoingEdges.length,
        total: incomingEdges.length + outgoingEdges.length
      },
      relationsByType,
      parent: parentNode ? {
        id: parentNode.id,
        type: parentNode.type,
        label: parentNode.label
      } : null,
      children: childNodes.map(child => ({
        id: child!.id,
        type: child!.type,
        label: child!.label
      })),
      metadata: {
        ...node.metadata
      }
    };
    
    this.logger.debug(`Retrieved details for node ${nodeId}`);
    
    return details;
  }

  /**
   * Navigate to a related node
   */
  navigateToRelatedNode(viewId: string, sourceNodeId: string, targetNodeId: string): boolean {
    const view = this.getView(viewId);
    
    // Get the graph
    const graph = this.graphRenderer.getGraph(view.graphId);
    
    // Verify both nodes exist
    const sourceExists = graph.nodes.some(node => node.id === sourceNodeId);
    const targetExists = graph.nodes.some(node => node.id === targetNodeId);
    
    if (!sourceExists || !targetExists) {
      this.logger.warn(`Cannot navigate between non-existent nodes: ${sourceNodeId} -> ${targetNodeId}`);
      return false;
    }
    
    // Verify there is a direct relationship between the nodes
    const directConnection = graph.edges.some(
      edge => (edge.sourceId === sourceNodeId && edge.targetId === targetNodeId) ||
              (edge.sourceId === targetNodeId && edge.targetId === sourceNodeId)
    );
    
    if (!directConnection) {
      this.logger.warn(`No direct connection between nodes: ${sourceNodeId} and ${targetNodeId}`);
      return false;
    }
    
    // Update the view to focus on the target node
    view.focusedNodeId = targetNodeId;
    
    this.logger.debug(`Navigated from node ${sourceNodeId} to ${targetNodeId}`);
    
    return true;
  }

  /**
   * Create a custom filter for a view
   */
  createCustomFilter(viewId: string, filterCriteria: Record<string, any>): string {
    const view = this.getView(viewId);
    
    const filterId = uuidv4();
    
    // Store the filter
    view.filters.set(filterId, filterCriteria);
    
    this.logger.debug(`Created custom filter ${filterId} for view ${viewId}`);
    
    return filterId;
  }

  /**
   * Apply a filter to a view
   */
  applyFilter(viewId: string, filterId: string): boolean {
    const view = this.getView(viewId);
    
    // Verify the filter exists
    if (!view.filters.has(filterId)) {
      this.logger.warn(`Cannot apply non-existent filter: ${filterId}`);
      return false;
    }
    
    // Apply the filter
    view.activeFilters.add(filterId);
    
    this.logger.debug(`Applied filter ${filterId} to view ${viewId}`);
    
    return true;
  }

  /**
   * Helper method to get a view by ID
   */
  private getView(viewId: string): {
    graphId: string;
    focusedNodeId?: string;
    filters: Map<string, Record<string, any>>;
    activeFilters: Set<string>;
    customData: Record<string, any>;
  } {
    const view = this.views.get(viewId);
    
    if (!view) {
      this.logger.warn(`View not found: ${viewId}`);
      throw new Error(`View not found: ${viewId}`);
    }
    
    return view;
  }
} 