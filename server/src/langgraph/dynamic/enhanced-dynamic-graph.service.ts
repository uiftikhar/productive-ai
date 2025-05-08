import { DynamicGraphService, DynamicGraphState } from './dynamic-graph.service';
import { DynamicGraphNode, DynamicGraphEdge } from './interfaces/graph-modification.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { StateGraph } from '@langchain/langgraph';
import EventEmitter from 'events';
import { FileStorageAdapter } from '../../shared/storage/file-storage-adapter';
import { 
  StreamController, 
  StreamOptions, 
  StreamUpdate, 
  StreamUpdateType,
  StreamMiddleware,
  StreamTransformer
} from './stream-controller';

/**
 * Enhanced graph state tracking properties
 */
export interface EnhancedDynamicGraphState extends DynamicGraphState {
  visitedNodes: string[];
  completedNodes: string[];
  traversedEdges: string[];
  currentNode?: string;
  sessionId?: string;
}

/**
 * Enhanced node with tracking properties
 */
export interface EnhancedGraphNode extends DynamicGraphNode<any> {
  visited?: boolean;
  completed?: boolean;
}

/**
 * Enhanced edge with tracking properties
 */
export interface EnhancedGraphEdge extends DynamicGraphEdge {
  traversed?: boolean;
}

/**
 * Type definition for enhanced graph object
 */
export interface EnhancedGraph {
  graph: StateGraph<any>;
  on: (event: string, listener: (...args: any[]) => void) => EnhancedGraph;
  off: (event: string, listener: (...args: any[]) => void) => EnhancedGraph;
  once: (event: string, listener: (...args: any[]) => void) => EnhancedGraph;
  emit: (event: string, ...args: any[]) => boolean;
  getNodes: () => EnhancedGraphNode[];
  getEdges: () => EnhancedGraphEdge[];
  getCurrentNode: () => string | null;
  invoke: (state: any) => Promise<any>;
  streamInvoke: (state: any, options?: StreamOptions) => AsyncGenerator<StreamUpdate>;
  // Add new stream middleware registration methods
  addStreamMiddleware: (middleware: StreamMiddleware) => EnhancedGraph;
  addStreamTransformer: (transformer: StreamTransformer) => EnhancedGraph;
}

// Re-export stream-related types for ease of use
export { 
  StreamOptions, 
  StreamUpdate, 
  StreamUpdateType,
  StreamMiddleware,
  StreamTransformer
};

/**
 * Enhanced Graph Service with event emitter and visualization capabilities
 * 
 * This service extends the DynamicGraphService to provide additional functionality:
 * - Event emission for graph execution
 * - Node and edge tracking (visited, completed, traversed)
 * - Visualization support
 * - Persistent state management
 * - Streaming output
 */
export class EnhancedDynamicGraphService<
  TState extends EnhancedDynamicGraphState = EnhancedDynamicGraphState
> extends DynamicGraphService<TState> {
  private eventEmitter: EventEmitter;
  private enhancedNodes: Map<string, EnhancedGraphNode> = new Map();
  private enhancedEdges: Map<string, EnhancedGraphEdge> = new Map();
  private currentNodeId?: string;
  private storageAdapter?: FileStorageAdapter;
  // Add access to compiledGraph from parent class
  protected _compiledGraph: any;
  private streamMiddlewares: StreamMiddleware[] = [];
  private streamTransformers: StreamTransformer[] = [];

  /**
   * Create a new enhanced dynamic graph service
   */
  constructor(
    options: {
      initialNodes?: EnhancedGraphNode[];
      initialEdges?: EnhancedGraphEdge[];
      logger?: Logger;
      storageAdapter?: FileStorageAdapter;
      streamMiddlewares?: StreamMiddleware[];
      streamTransformers?: StreamTransformer[];
    } = {}
  ) {
    super({
      ...options,
      initialNodes: options.initialNodes,
      initialEdges: options.initialEdges,
      logger: options.logger
    });

    this.eventEmitter = new EventEmitter();
    this.storageAdapter = options.storageAdapter;
    this.streamMiddlewares = options.streamMiddlewares || [];
    this.streamTransformers = options.streamTransformers || [];
    
    // Increase max listeners to avoid memory leak warnings
    this.eventEmitter.setMaxListeners(50);

    // Store enhanced nodes and edges
    if (options.initialNodes) {
      for (const node of options.initialNodes) {
        this.enhancedNodes.set(node.id, node);
      }
    }

    if (options.initialEdges) {
      for (const edge of options.initialEdges) {
        this.enhancedEdges.set(edge.id, edge);
      }
    }
  }

  /**
   * Create a complete state object from partial state
   */
  private createCompleteState(initialState: Partial<TState>): TState {
    // Create a new object with all required properties
    const defaultState = {
      id: initialState.id || crypto.randomUUID(),
      runId: initialState.runId || crypto.randomUUID(),
      nodes: new Map(),
      edges: new Map(),
      modificationHistory: [],
      metadata: initialState.metadata || {},
      executionPath: [],
      visitedNodes: initialState.visitedNodes || [],
      completedNodes: initialState.completedNodes || [],
      traversedEdges: initialState.traversedEdges || []
    };

    // Combine the default state with initial state and cast to TState
    // This ensures type safety while still allowing proper merging
    return { ...defaultState, ...initialState } as unknown as TState;
  }

  /**
   * Add a stream middleware function
   */
  public addStreamMiddleware(middleware: StreamMiddleware): this {
    this.streamMiddlewares.push(middleware);
    return this;
  }

  /**
   * Add a stream transformer function
   */
  public addStreamTransformer(transformer: StreamTransformer): this {
    this.streamTransformers.push(transformer);
    return this;
  }

  /**
   * Create an enhanced graph with event emitter capabilities
   */
  public createEnhancedGraph(): EnhancedGraph {
    // Create base graph
    const baseGraph = super.createGraph();
    
    // Create enhanced graph with additional methods
    const enhancedGraph: EnhancedGraph = {
      graph: baseGraph,
      
      // Event emitter methods
      on: (event: string, listener: (...args: any[]) => void) => {
        this.eventEmitter.on(event, listener);
        return enhancedGraph;
      },
      
      off: (event: string, listener: (...args: any[]) => void) => {
        this.eventEmitter.off(event, listener);
        return enhancedGraph;
      },
      
      once: (event: string, listener: (...args: any[]) => void) => {
        this.eventEmitter.once(event, listener);
        return enhancedGraph;
      },
      
      emit: (event: string, ...args: any[]) => {
        return this.eventEmitter.emit(event, ...args);
      },
      
      // Graph state inspection methods
      getNodes: () => this.getEnhancedNodes(),
      getEdges: () => this.getEnhancedEdges(),
      getCurrentNode: () => this.getCurrentNode(),
      
      // Enhanced invoke method with tracking
      invoke: async (state: any) => {
        return this.invoke(state);
      },
      
      // Stream invoke method - use synchronous generator
      streamInvoke: (state: any, options?: StreamOptions) => {
        return this.streamExecute(state, options);
      },

      // Stream middleware registration
      addStreamMiddleware: (middleware: StreamMiddleware) => {
        this.addStreamMiddleware(middleware);
        return enhancedGraph;
      },

      // Stream transformer registration
      addStreamTransformer: (transformer: StreamTransformer) => {
        this.addStreamTransformer(transformer);
        return enhancedGraph;
      }
    };

    // Add node trackers to emit events and track progress
    this.setupNodeTracking();

    return enhancedGraph;
  }

  /**
   * Override the createGraph method to track the compiled graph
   */
  public createGraph(): StateGraph<any> {
    const graph = super.createGraph();
    // Store reference to compiledGraph for our own use
    this._compiledGraph = (graph as any).compiledModule || (graph as any).compiledGraph;
    return graph;
  }

  /**
   * Invoke the graph with state tracking and persistence
   */
  public async invoke(state: Partial<TState>): Promise<TState> {
    // Create a complete state
    const completeState = this.createCompleteState(state);
    
    // Emit start event
    this.eventEmitter.emit('graphStart', { state: completeState });
    
    try {
      // Ensure graph is compiled
      if (!this._compiledGraph) {
        this.createGraph();
      }
      
      // Save initial state if storage adapter is available and sessionId is provided
      if (this.storageAdapter && completeState.sessionId) {
        await this.storageAdapter.saveState(completeState.sessionId, completeState, {
          graphId: completeState.id,
          runId: completeState.runId,
          status: 'started'
        });
      }
      
      // Execute the graph
      const result = await (this._compiledGraph?.invoke ? 
        this._compiledGraph.invoke(completeState) : 
        super.execute(completeState));
      
      // Save final state if storage adapter is available
      if (this.storageAdapter && result.sessionId) {
        await this.storageAdapter.saveState(result.sessionId, result, {
          graphId: result.id,
          runId: result.runId,
          status: 'completed'
        });
      }
      
      // Emit complete event
      this.eventEmitter.emit('graphComplete', { state: result });
      
      return result as TState;
    } catch (error) {
      // Emit error event
      this.eventEmitter.emit('graphError', { error, state: completeState });
      
      // Save error state if storage adapter is available
      if (this.storageAdapter && completeState.sessionId) {
        await this.storageAdapter.saveState(completeState.sessionId, {
          ...completeState,
          error: error instanceof Error ? error.message : String(error)
        }, {
          graphId: completeState.id,
          runId: completeState.runId,
          status: 'failed'
        });
      }
      
      throw error;
    }
  }

  /**
   * Stream graph execution with real-time updates
   */
  public async *streamExecute(
    initialState: Partial<TState>,
    options: StreamOptions = {}
  ): AsyncGenerator<StreamUpdate> {
    // Create a stream controller with options and middlewares
    const streamController = new StreamController({
      ...options,
      middlewares: [...this.streamMiddlewares, ...(options.middlewares || [])],
    });
    
    // Add transformers
    for (const transformer of this.streamTransformers) {
      streamController.addTransformer(transformer);
    }
    
    // Set default options
    const streamOptions: StreamOptions = {
      mode: 'updates',
      includeNodeDetails: false,
      includeState: false,
      persistInterval: 5000, // 5 seconds default
      ...options
    };
    
    // Create a complete state object
    const completeState = this.createCompleteState(initialState);
    
    // Set up persistence interval if enabled
    let persistInterval: NodeJS.Timeout | null = null;
    let latestState: TState = completeState;
    
    if (this.storageAdapter && completeState.sessionId && streamOptions.persistInterval) {
      persistInterval = setInterval(async () => {
        try {
          await this.storageAdapter!.saveState(completeState.sessionId!, latestState, {
            graphId: latestState.id,
            runId: latestState.runId,
            status: 'running'
          });
        } catch (error) {
          console.error('Failed to persist state:', error);
        }
      }, streamOptions.persistInterval);
    }
    
    // Handle back-pressure
    streamController.onBackPressureStart(() => {
      this.logger.info('Stream back-pressure active: slowing down processing');
    });
    
    streamController.onBackPressureEnd(() => {
      this.logger.info('Stream back-pressure released: resuming normal processing');
    });
    
    // Set up event handlers based on stream mode
    const nodeStartHandler = (data: any) => {
      if (streamOptions.mode === 'steps' || streamOptions.mode === 'updates') {
        streamController.queueUpdate({
          type: StreamUpdateType.NODE_START,
          nodeId: data.id,
          ...(streamOptions.includeNodeDetails ? { node: this.enhancedNodes.get(data.id) } : {}),
          ...(streamOptions.includeState ? { state: data.state } : {})
        });
      }
      
      // Update latest state
      latestState = data.state;
    };
    
    const nodeCompleteHandler = (data: any) => {
      if (streamOptions.mode === 'steps' || streamOptions.mode === 'updates') {
        streamController.queueUpdate({
          type: StreamUpdateType.NODE_COMPLETE,
          nodeId: data.id,
          ...(streamOptions.includeNodeDetails ? { node: this.enhancedNodes.get(data.id) } : {}),
          ...(streamOptions.includeState ? { state: data.state } : {})
        });
      }
      
      // Update latest state
      latestState = data.state;
    };
    
    const progressHandler = (data: any) => {
      if (streamOptions.mode === 'updates') {
        streamController.queueUpdate({
          type: StreamUpdateType.PROGRESS,
          progress: data
        });
      }
    };
    
    const completeHandler = (data: any) => {
      if (streamOptions.mode === 'values' || streamOptions.mode === 'updates') {
        streamController.queueUpdate({
          type: StreamUpdateType.COMPLETE,
          ...(streamOptions.includeState ? { state: data.state } : {})
        });
      }
      
      // Update latest state
      latestState = data.state;
    };
    
    const errorHandler = (data: any) => {
      streamController.queueUpdate({
        type: StreamUpdateType.ERROR,
        error: data.error
      });
    };
    
    // Register handlers
    this.eventEmitter.on('nodeStart', nodeStartHandler);
    this.eventEmitter.on('nodeComplete', nodeCompleteHandler);
    this.eventEmitter.on('progressUpdate', progressHandler);
    this.eventEmitter.on('graphComplete', completeHandler);
    this.eventEmitter.on('graphError', errorHandler);
    
    // Start execution in a separate promise
    const executionPromise = this.invoke(completeState);
    
    try {
      // Yield stream updates
      for await (const update of streamController.getStream()) {
        yield update;
      }
      
      // Wait for execution to complete if not already done
      await executionPromise;
    } finally {
      // Clean up event listeners
      this.eventEmitter.off('nodeStart', nodeStartHandler);
      this.eventEmitter.off('nodeComplete', nodeCompleteHandler);
      this.eventEmitter.off('progressUpdate', progressHandler);
      this.eventEmitter.off('graphComplete', completeHandler);
      this.eventEmitter.off('graphError', errorHandler);
      
      // Clean up persistence interval
      if (persistInterval) {
        clearInterval(persistInterval);
      }
      
      // Final state persistence
      if (this.storageAdapter && completeState.sessionId) {
        try {
          await this.storageAdapter.saveState(completeState.sessionId, latestState, {
            graphId: latestState.id,
            runId: latestState.runId,
            status: 'completed'
          });
        } catch (error) {
          console.error('Failed to persist final state:', error);
        }
      }
      
      // Complete the stream controller
      streamController.complete();
    }
  }

  /**
   * Load a saved state from storage
   */
  public async loadState(sessionId: string): Promise<TState | null> {
    if (!this.storageAdapter) {
      throw new Error('Storage adapter not configured');
    }
    
    return this.storageAdapter.loadState(sessionId) as Promise<TState | null>;
  }

  /**
   * Set up node tracking to emit events during graph execution
   */
  private setupNodeTracking(): void {
    for (const node of this.enhancedNodes.values()) {
      // Wrap the original handler
      if (node.handler) {
        const originalHandler = node.handler;
        
        node.handler = async (state: TState) => {
          // Update tracking state
          const nodeId = node.id;
          this.currentNodeId = nodeId;
          
          // Ensure visitedNodes array exists
          if (!state.visitedNodes) {
            state.visitedNodes = [];
          }
          
          // Track node visited
          const isNewVisit = !state.visitedNodes.includes(nodeId);
          if (isNewVisit) {
            state.visitedNodes.push(nodeId);
            this.enhancedNodes.get(nodeId)!.visited = true;
          }
          
          // Emit node start event
          this.eventEmitter.emit('nodeStart', { id: nodeId, state });
          
          // Run the original handler
          const result = await originalHandler(state);
          
          // Ensure completedNodes array exists in result
          if (!result.completedNodes) {
            result.completedNodes = [];
          }
          
          // Track node completion
          if (!result.completedNodes.includes(nodeId)) {
            result.completedNodes.push(nodeId);
            this.enhancedNodes.get(nodeId)!.completed = true;
          }
          
          // Emit node complete event
          this.eventEmitter.emit('nodeComplete', { id: nodeId, state: result });
          
          // Emit progress update event
          this.emitProgressUpdate();
          
          return result;
        };
      }
    }
  }

  /**
   * Get all nodes with tracking information
   */
  private getEnhancedNodes(): EnhancedGraphNode[] {
    return Array.from(this.enhancedNodes.values()).map(node => ({
      ...node,
      visited: node.visited || false,
      completed: node.completed || false
    }));
  }

  /**
   * Get all edges with tracking information
   */
  private getEnhancedEdges(): EnhancedGraphEdge[] {
    return Array.from(this.enhancedEdges.values()).map(edge => ({
      ...edge,
      traversed: edge.traversed || false
    }));
  }

  /**
   * Get the current executing node ID
   */
  private getCurrentNode(): string | null {
    return this.currentNodeId || null;
  }

  /**
   * Emit progress update event
   */
  private emitProgressUpdate(): void {
    const nodes = this.getEnhancedNodes();
    const totalNodes = nodes.length;
    const visitedNodes = nodes.filter(n => n.visited).length;
    const completedNodes = nodes.filter(n => n.completed).length;
    
    this.eventEmitter.emit('progressUpdate', {
      totalNodes,
      visitedNodes,
      completedNodes,
      currentNode: this.currentNodeId,
      progress: totalNodes > 0 ? Math.floor((completedNodes / totalNodes) * 100) : 0
    });
  }
} 