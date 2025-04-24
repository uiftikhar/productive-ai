import { configureTracing } from '../../langgraph/core/utils/tracing';

export interface TraceNode {
  id: string;
  name: string;
  type: 'node' | 'edge' | 'state';
  data: Record<string, any>;
  timestamp: number;
}

export interface TraceEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: Record<string, any>;
}

export interface TracedWorkflow {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed';
  nodes: TraceNode[];
  edges: TraceEdge[];
  stateTransitions: Record<string, any>[];
}

/**
 * TracingManager is responsible for collecting and managing traces from LangGraph workflows
 * It provides methods to register, retrieve, and visualize workflow executions
 */
export class TracingManager {
  private static instance: TracingManager;
  private traces: Map<string, TracedWorkflow> = new Map();
  private listeners: Set<(trace: TracedWorkflow) => void> = new Set();

  private constructor() {
    // Enable tracing in LangGraph
    configureTracing({
      enabled: true,
      consoleLogging: true,
    });
  }

  /**
   * Get the singleton instance of TracingManager
   */
  public static getInstance(): TracingManager {
    if (!TracingManager.instance) {
      TracingManager.instance = new TracingManager();
    }
    return TracingManager.instance;
  }

  /**
   * Register a new workflow trace
   */
  public registerWorkflow(workflow: {
    id: string;
    name: string;
    initialState: Record<string, any>;
  }): string {
    const traceId = workflow.id;

    this.traces.set(traceId, {
      id: traceId,
      name: workflow.name,
      startTime: Date.now(),
      status: 'running',
      nodes: [],
      edges: [],
      stateTransitions: [workflow.initialState],
    });

    return traceId;
  }

  /**
   * Record a node execution in a workflow
   */
  public recordNodeExecution(
    traceId: string,
    node: {
      id: string;
      name: string;
      data: Record<string, any>;
    },
  ): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    const nodeId = `${node.id}-${Date.now()}`;

    trace.nodes.push({
      id: nodeId,
      name: node.name,
      type: 'node',
      data: node.data,
      timestamp: Date.now(),
    });

    // If this isn't the first node, add an edge from the previous node
    if (trace.nodes.length > 1) {
      const previousNode = trace.nodes[trace.nodes.length - 2];

      trace.edges.push({
        id: `${previousNode.id}->${nodeId}`,
        source: previousNode.id,
        target: nodeId,
        label: `${previousNode.name} -> ${node.name}`,
      });
    }

    this.notifyListeners(trace);
  }

  /**
   * Record a state transition in a workflow
   */
  public recordStateTransition(
    traceId: string,
    state: Record<string, any>,
  ): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    trace.stateTransitions.push(state);
    this.notifyListeners(trace);
  }

  /**
   * Complete a workflow trace
   */
  public completeWorkflow(
    traceId: string,
    state: Record<string, any>,
    status: 'completed' | 'failed' = 'completed',
  ): void {
    const trace = this.traces.get(traceId);
    if (!trace) return;

    trace.endTime = Date.now();
    trace.status = status;
    trace.stateTransitions.push(state);

    this.notifyListeners(trace);
  }

  /**
   * Get all workflow traces
   */
  public getTraces(): TracedWorkflow[] {
    return Array.from(this.traces.values());
  }

  /**
   * Get a specific workflow trace by ID
   */
  public getTrace(traceId: string): TracedWorkflow | undefined {
    return this.traces.get(traceId);
  }

  /**
   * Subscribe to trace updates
   */
  public subscribe(listener: (trace: TracedWorkflow) => void): () => void {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of a trace update
   */
  private notifyListeners(trace: TracedWorkflow): void {
    this.listeners.forEach((listener) => {
      try {
        listener(trace);
      } catch (error) {
        console.error('Error in trace listener:', error);
      }
    });
  }

  /**
   * Clear all traces
   */
  public clearTraces(): void {
    this.traces.clear();
  }

  /**
   * Convert traces to a format suitable for graph visualization
   */
  public tracesToGraph(traceId?: string): {
    nodes: any[];
    edges: any[];
  } {
    const traces = traceId
      ? ([this.traces.get(traceId)].filter(Boolean) as TracedWorkflow[])
      : this.getTraces();

    const nodes: any[] = [];
    const edges: any[] = [];

    traces.forEach((trace) => {
      // Add nodes with formatted data for visualization
      trace.nodes.forEach((node) => {
        nodes.push({
          id: node.id,
          type: 'custom',
          data: {
            label: node.name,
            type: node.type,
            metadata: node.data,
            timestamp: node.timestamp,
          },
          position: { x: 0, y: 0 }, // Positions would be calculated by the layout algorithm
        });
      });

      // Add edges
      trace.edges.forEach((edge) => {
        edges.push({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          data: edge.data,
        });
      });
    });

    return { nodes, edges };
  }
}
