import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import {
  GraphHistory,
  GraphHistorySnapshot,
  Graph,
  GraphNode,
  GraphEdge,
  RealTimeGraphRenderer
} from '../../interfaces/visualization.interface';

/**
 * Implementation of the graph history tracking service
 * This service manages snapshots of graph evolution over time,
 * tracking changes and allowing for comparison and reversion
 */
export class GraphHistoryImpl implements GraphHistory {
  private logger: Logger;
  private graphRenderer: RealTimeGraphRenderer;
  private snapshots: Map<string, GraphHistorySnapshot> = new Map();
  private graphSnapshots: Map<string, string[]> = new Map(); // graphId -> snapshotIds[]
  private maxSnapshotsPerGraph: number;

  constructor(options: {
    logger?: Logger;
    graphRenderer: RealTimeGraphRenderer;
    maxSnapshotsPerGraph?: number;
  }) {
    this.logger = options.logger || new ConsoleLogger();
    
    if (!options.graphRenderer) {
      throw new Error('Graph history service requires a real-time graph renderer');
    }
    
    this.graphRenderer = options.graphRenderer;
    this.maxSnapshotsPerGraph = options.maxSnapshotsPerGraph || 50;
    
    this.logger.info('Graph history service initialized');
  }

  /**
   * Record a snapshot of the current graph state
   */
  recordSnapshot(graphId: string, event?: string): string {
    try {
      // Get the current graph state
      const currentGraph = this.graphRenderer.getGraph(graphId);
      
      // Check if there are previous snapshots for this graph
      const snapshotIds = this.graphSnapshots.get(graphId) || [];
      let previousSnapshot: GraphHistorySnapshot | null = null;
      
      if (snapshotIds.length > 0) {
        const previousSnapshotId = snapshotIds[snapshotIds.length - 1];
        previousSnapshot = this.snapshots.get(previousSnapshotId) || null;
      }
      
      // Calculate changes since the previous snapshot
      const addedNodes: GraphNode[] = [];
      const removedNodeIds: string[] = [];
      const updatedNodes: GraphNode[] = [];
      const addedEdges: GraphEdge[] = [];
      const removedEdgeIds: string[] = [];
      const updatedEdges: GraphEdge[] = [];
      
      if (previousSnapshot) {
        // Process nodes
        const previousNodeMap = new Map<string, GraphNode>();
        previousSnapshot.addedNodes.forEach(node => previousNodeMap.set(node.id, node));
        previousSnapshot.updatedNodes.forEach(node => previousNodeMap.set(node.id, node));
        
        // Find added and updated nodes
        currentGraph.nodes.forEach(node => {
          const previousNode = previousNodeMap.get(node.id);
          
          if (!previousNode) {
            addedNodes.push(node);
          } else {
            // Check if node has been updated
            const nodeStr = JSON.stringify(node);
            const prevNodeStr = JSON.stringify(previousNode);
            
            if (nodeStr !== prevNodeStr) {
              updatedNodes.push(node);
            }
          }
          
          // Remove from map to track removed nodes
          previousNodeMap.delete(node.id);
        });
        
        // Remaining nodes in the map have been removed
        removedNodeIds.push(...Array.from(previousNodeMap.keys()));
        
        // Process edges
        const previousEdgeMap = new Map<string, GraphEdge>();
        previousSnapshot.addedEdges.forEach(edge => previousEdgeMap.set(edge.id, edge));
        previousSnapshot.updatedEdges.forEach(edge => previousEdgeMap.set(edge.id, edge));
        
        // Find added and updated edges
        currentGraph.edges.forEach(edge => {
          const previousEdge = previousEdgeMap.get(edge.id);
          
          if (!previousEdge) {
            addedEdges.push(edge);
          } else {
            // Check if edge has been updated
            const edgeStr = JSON.stringify(edge);
            const prevEdgeStr = JSON.stringify(previousEdge);
            
            if (edgeStr !== prevEdgeStr) {
              updatedEdges.push(edge);
            }
          }
          
          // Remove from map to track removed edges
          previousEdgeMap.delete(edge.id);
        });
        
        // Remaining edges in the map have been removed
        removedEdgeIds.push(...Array.from(previousEdgeMap.keys()));
      } else {
        // First snapshot - all nodes and edges are considered "added"
        addedNodes.push(...currentGraph.nodes);
        addedEdges.push(...currentGraph.edges);
      }
      
      // Create the snapshot
      const snapshotId = uuidv4();
      const snapshot: GraphHistorySnapshot = {
        id: snapshotId,
        graphId,
        timestamp: new Date(),
        addedNodes,
        removedNodeIds,
        updatedNodes,
        addedEdges,
        removedEdgeIds,
        updatedEdges,
        event,
        metadata: {
          graphVersion: currentGraph.version,
          nodesCount: currentGraph.nodes.length,
          edgesCount: currentGraph.edges.length
        }
      };
      
      // Store the snapshot
      this.snapshots.set(snapshotId, snapshot);
      
      // Update graph snapshot mapping
      if (!this.graphSnapshots.has(graphId)) {
        this.graphSnapshots.set(graphId, []);
      }
      this.graphSnapshots.get(graphId)!.push(snapshotId);
      
      // Enforce max snapshots limit
      this.cleanupOldSnapshots(graphId);
      
      this.logger.debug(`Recorded graph snapshot ${snapshotId} for graph ${graphId}`, {
        addedNodes: addedNodes.length,
        removedNodes: removedNodeIds.length,
        updatedNodes: updatedNodes.length,
        addedEdges: addedEdges.length,
        removedEdges: removedEdgeIds.length,
        updatedEdges: updatedEdges.length
      });
      
      return snapshotId;
    } catch (error) {
      this.logger.error(`Error recording graph snapshot:`, { error, graphId });
      throw new Error(`Failed to record graph snapshot for graph ${graphId}`);
    }
  }

  /**
   * Get a specific snapshot by ID
   */
  getSnapshot(snapshotId: string): GraphHistorySnapshot {
    const snapshot = this.snapshots.get(snapshotId);
    
    if (!snapshot) {
      this.logger.warn(`Snapshot not found: ${snapshotId}`);
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }
    
    return JSON.parse(JSON.stringify(snapshot)); // Return a copy to prevent modification
  }

  /**
   * Get all snapshots for a graph within the specified time range
   */
  getSnapshotsByGraph(graphId: string, startTime?: Date, endTime?: Date): GraphHistorySnapshot[] {
    const snapshotIds = this.graphSnapshots.get(graphId) || [];
    
    if (snapshotIds.length === 0) {
      return [];
    }
    
    let snapshots = snapshotIds
      .map(id => this.snapshots.get(id)!)
      .filter(snapshot => snapshot !== undefined);
    
    // Apply time filters if specified
    if (startTime) {
      snapshots = snapshots.filter(snapshot => 
        snapshot.timestamp.getTime() >= startTime.getTime()
      );
    }
    
    if (endTime) {
      snapshots = snapshots.filter(snapshot => 
        snapshot.timestamp.getTime() <= endTime.getTime()
      );
    }
    
    // Sort by timestamp
    snapshots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    return JSON.parse(JSON.stringify(snapshots)); // Return copies to prevent modification
  }

  /**
   * Get the graph state at a specific point in time
   */
  getGraphStateAtTime(graphId: string, timestamp: Date): Graph {
    // Get all snapshots for the graph
    const snapshots = this.getSnapshotsByGraph(graphId);
    
    if (snapshots.length === 0) {
      this.logger.warn(`No snapshots found for graph ${graphId}`);
      throw new Error(`No snapshots found for graph ${graphId}`);
    }
    
    // Find the closest snapshot before the specified timestamp
    let closestSnapshot: GraphHistorySnapshot | null = null;
    
    for (const snapshot of snapshots) {
      if (snapshot.timestamp.getTime() <= timestamp.getTime()) {
        closestSnapshot = snapshot;
      } else {
        break; // Snapshots are sorted by time, so we can stop once we pass the timestamp
      }
    }
    
    if (!closestSnapshot) {
      this.logger.warn(`No snapshots found before timestamp ${timestamp.toISOString()} for graph ${graphId}`);
      throw new Error(`No snapshots found before the specified timestamp for graph ${graphId}`);
    }
    
    // Reconstruct the graph state at the given snapshot
    return this.reconstructGraphFromSnapshot(closestSnapshot);
  }

  /**
   * Get the evolution of a graph over a time period
   */
  getGraphEvolution(graphId: string, startTime: Date, endTime: Date): GraphHistorySnapshot[] {
    return this.getSnapshotsByGraph(graphId, startTime, endTime);
  }

  /**
   * Revert a graph to a previous snapshot
   */
  revertToSnapshot(graphId: string, snapshotId: string): boolean {
    try {
      const snapshot = this.snapshots.get(snapshotId);
      
      if (!snapshot) {
        this.logger.warn(`Snapshot not found: ${snapshotId}`);
        return false;
      }
      
      if (snapshot.graphId !== graphId) {
        this.logger.warn(`Snapshot ${snapshotId} belongs to graph ${snapshot.graphId}, not ${graphId}`);
        return false;
      }
      
      // Reconstruct the graph state and apply it to the current graph
      const reconstructedGraph = this.reconstructGraphFromSnapshot(snapshot);
      
      // Apply the reconstructed state to the current graph
      // First, remove all nodes and edges
      const currentGraph = this.graphRenderer.getGraph(graphId);
      
      // Remove edges first (to avoid issues with node dependencies)
      for (const edge of currentGraph.edges) {
        this.graphRenderer.removeEdge(graphId, edge.id);
      }
      
      // Remove nodes
      for (const node of currentGraph.nodes) {
        this.graphRenderer.removeNode(graphId, node.id);
      }
      
      // Add nodes from reconstructed graph
      for (const node of reconstructedGraph.nodes) {
        this.graphRenderer.addNode(graphId, node);
      }
      
      // Add edges from reconstructed graph
      for (const edge of reconstructedGraph.edges) {
        this.graphRenderer.addEdge(graphId, edge);
      }
      
      // Record a new snapshot after reversion
      this.recordSnapshot(graphId, `Reverted to snapshot ${snapshotId}`);
      
      this.logger.info(`Reverted graph ${graphId} to snapshot ${snapshotId}`);
      
      return true;
    } catch (error) {
      this.logger.error(`Error reverting to snapshot:`, { error, graphId, snapshotId });
      return false;
    }
  }

  /**
   * Compare two snapshots to identify differences
   */
  compareSnapshots(snapshot1Id: string, snapshot2Id: string): {
    addedNodes: GraphNode[];
    removedNodes: GraphNode[];
    changedNodes: Array<{ before: GraphNode; after: GraphNode }>;
    addedEdges: GraphEdge[];
    removedEdges: GraphEdge[];
    changedEdges: Array<{ before: GraphEdge; after: GraphEdge }>;
  } {
    try {
      const snapshot1 = this.snapshots.get(snapshot1Id);
      const snapshot2 = this.snapshots.get(snapshot2Id);
      
      if (!snapshot1 || !snapshot2) {
        throw new Error(`Snapshot not found: ${!snapshot1 ? snapshot1Id : snapshot2Id}`);
      }
      
      // Reconstruct both graph states
      const graph1 = this.reconstructGraphFromSnapshot(snapshot1);
      const graph2 = this.reconstructGraphFromSnapshot(snapshot2);
      
      // Compare nodes
      const addedNodes: GraphNode[] = [];
      const removedNodes: GraphNode[] = [];
      const changedNodes: Array<{ before: GraphNode; after: GraphNode }> = [];
      
      // Create node maps for efficient lookup
      const graph1Nodes = new Map<string, GraphNode>();
      const graph2Nodes = new Map<string, GraphNode>();
      
      graph1.nodes.forEach(node => graph1Nodes.set(node.id, node));
      graph2.nodes.forEach(node => graph2Nodes.set(node.id, node));
      
      // Find added and changed nodes
      for (const [nodeId, node2] of graph2Nodes.entries()) {
        const node1 = graph1Nodes.get(nodeId);
        
        if (!node1) {
          addedNodes.push(node2);
        } else {
          // Compare properties to detect changes
          const node1Str = JSON.stringify(node1);
          const node2Str = JSON.stringify(node2);
          
          if (node1Str !== node2Str) {
            changedNodes.push({ before: node1, after: node2 });
          }
        }
      }
      
      // Find removed nodes
      for (const [nodeId, node1] of graph1Nodes.entries()) {
        if (!graph2Nodes.has(nodeId)) {
          removedNodes.push(node1);
        }
      }
      
      // Compare edges
      const addedEdges: GraphEdge[] = [];
      const removedEdges: GraphEdge[] = [];
      const changedEdges: Array<{ before: GraphEdge; after: GraphEdge }> = [];
      
      // Create edge maps for efficient lookup
      const graph1Edges = new Map<string, GraphEdge>();
      const graph2Edges = new Map<string, GraphEdge>();
      
      graph1.edges.forEach(edge => graph1Edges.set(edge.id, edge));
      graph2.edges.forEach(edge => graph2Edges.set(edge.id, edge));
      
      // Find added and changed edges
      for (const [edgeId, edge2] of graph2Edges.entries()) {
        const edge1 = graph1Edges.get(edgeId);
        
        if (!edge1) {
          addedEdges.push(edge2);
        } else {
          // Compare properties to detect changes
          const edge1Str = JSON.stringify(edge1);
          const edge2Str = JSON.stringify(edge2);
          
          if (edge1Str !== edge2Str) {
            changedEdges.push({ before: edge1, after: edge2 });
          }
        }
      }
      
      // Find removed edges
      for (const [edgeId, edge1] of graph1Edges.entries()) {
        if (!graph2Edges.has(edgeId)) {
          removedEdges.push(edge1);
        }
      }
      
      return {
        addedNodes,
        removedNodes,
        changedNodes,
        addedEdges,
        removedEdges,
        changedEdges
      };
    } catch (error) {
      this.logger.error(`Error comparing snapshots:`, { error, snapshot1Id, snapshot2Id });
      throw new Error(`Failed to compare snapshots ${snapshot1Id} and ${snapshot2Id}`);
    }
  }

  /**
   * Private helper to reconstruct a graph from snapshot history
   */
  private reconstructGraphFromSnapshot(snapshot: GraphHistorySnapshot): Graph {
    // For simplicity, we'll get the current graph and reconstruct it
    try {
      const currentGraph = this.graphRenderer.getGraph(snapshot.graphId);
      
      // Create a new graph object with the same metadata
      const reconstructedGraph: Graph = {
        id: currentGraph.id,
        name: currentGraph.name,
        nodes: [],
        edges: [],
        layout: currentGraph.layout,
        timestamp: snapshot.timestamp,
        version: snapshot.metadata?.graphVersion || 1
      };
      
      // Get all snapshots up to and including the target snapshot
      const allSnapshots = this.getSnapshotsByGraph(snapshot.graphId);
      const targetIndex = allSnapshots.findIndex(s => s.id === snapshot.id);
      
      if (targetIndex === -1) {
        throw new Error(`Snapshot ${snapshot.id} not found in history for graph ${snapshot.graphId}`);
      }
      
      const relevantSnapshots = allSnapshots.slice(0, targetIndex + 1);
      
      // Maps to track the latest state of each node and edge
      const nodeMap = new Map<string, GraphNode>();
      const edgeMap = new Map<string, GraphEdge>();
      const removedNodeIds = new Set<string>();
      const removedEdgeIds = new Set<string>();
      
      // Apply each snapshot in sequence
      for (const s of relevantSnapshots) {
        // Apply node changes
        s.addedNodes.forEach(node => {
          nodeMap.set(node.id, JSON.parse(JSON.stringify(node)));
          removedNodeIds.delete(node.id);
        });
        
        s.updatedNodes.forEach(node => {
          nodeMap.set(node.id, JSON.parse(JSON.stringify(node)));
        });
        
        s.removedNodeIds.forEach(nodeId => {
          nodeMap.delete(nodeId);
          removedNodeIds.add(nodeId);
        });
        
        // Apply edge changes
        s.addedEdges.forEach(edge => {
          edgeMap.set(edge.id, JSON.parse(JSON.stringify(edge)));
          removedEdgeIds.delete(edge.id);
        });
        
        s.updatedEdges.forEach(edge => {
          edgeMap.set(edge.id, JSON.parse(JSON.stringify(edge)));
        });
        
        s.removedEdgeIds.forEach(edgeId => {
          edgeMap.delete(edgeId);
          removedEdgeIds.add(edgeId);
        });
      }
      
      // Build final graph
      reconstructedGraph.nodes = Array.from(nodeMap.values());
      reconstructedGraph.edges = Array.from(edgeMap.values());
      
      return reconstructedGraph;
    } catch (error) {
      this.logger.error(`Error reconstructing graph from snapshot:`, { error, snapshotId: snapshot.id });
      throw new Error(`Failed to reconstruct graph from snapshot ${snapshot.id}`);
    }
  }

  /**
   * Clean up old snapshots to prevent memory issues
   */
  private cleanupOldSnapshots(graphId: string): void {
    const snapshotIds = this.graphSnapshots.get(graphId) || [];
    
    if (snapshotIds.length <= this.maxSnapshotsPerGraph) {
      return;
    }
    
    // Remove oldest snapshots
    const excessCount = snapshotIds.length - this.maxSnapshotsPerGraph;
    const toRemove = snapshotIds.slice(0, excessCount);
    
    for (const id of toRemove) {
      this.snapshots.delete(id);
    }
    
    // Update graph snapshots list
    this.graphSnapshots.set(graphId, snapshotIds.slice(excessCount));
    
    this.logger.debug(`Cleaned up ${excessCount} old snapshots for graph ${graphId}`);
  }
} 