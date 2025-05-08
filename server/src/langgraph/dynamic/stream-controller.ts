import { EventEmitter } from 'events';

/**
 * Streaming options
 */
export interface StreamOptions {
  mode?: 'updates' | 'values' | 'steps';
  includeNodeDetails?: boolean;
  includeState?: boolean;
  persistInterval?: number; // ms between state persistence, 0 to disable
  batchSize?: number; // Number of updates to batch before yielding
  middlewares?: StreamMiddleware[]; // Middleware functions for processing updates
  maxBufferSize?: number; // Maximum number of updates to buffer before applying back-pressure
}

/**
 * Stream update types
 */
export enum StreamUpdateType {
  NODE_START = 'nodeStart',
  NODE_COMPLETE = 'nodeComplete',
  PROGRESS = 'progress',
  COMPLETE = 'complete',
  ERROR = 'error',
  CUSTOM = 'custom'
}

/**
 * Stream update structure
 */
export interface StreamUpdate {
  type: StreamUpdateType | string;
  timestamp: number;
  [key: string]: any;
}

/**
 * Stream middleware function type
 */
export type StreamMiddleware = (update: StreamUpdate, next: (update: StreamUpdate) => void) => void;

/**
 * Stream transformation function type
 */
export type StreamTransformer = (update: StreamUpdate) => StreamUpdate | null;

/**
 * Controller for handling streaming with back-pressure
 */
export class StreamController {
  private queue: StreamUpdate[] = [];
  private resolvers: ((value: IteratorResult<StreamUpdate>) => void)[] = [];
  private done = false;
  private middlewares: StreamMiddleware[] = [];
  private transformers: StreamTransformer[] = [];
  private batchedUpdates: StreamUpdate[] = [];
  private options: Required<StreamOptions>;
  private eventEmitter = new EventEmitter();
  private backPressure = false;

  /**
   * Create a new stream controller
   */
  constructor(options: StreamOptions = {}) {
    // Default options
    this.options = {
      mode: 'updates',
      includeNodeDetails: false,
      includeState: false,
      persistInterval: 5000,
      batchSize: 1,
      middlewares: [],
      maxBufferSize: 100,
      ...options
    };

    // Add middlewares
    this.middlewares = [...(options.middlewares || [])];
    
    // Setup event handling
    this.setupEvents();
  }

  /**
   * Set up internal event handling
   */
  private setupEvents(): void {
    // Monitor queue size for back-pressure
    this.eventEmitter.on('queue:update', () => {
      if (this.queue.length > this.options.maxBufferSize && !this.backPressure) {
        this.backPressure = true;
        this.eventEmitter.emit('backpressure:start');
      } else if (this.queue.length <= this.options.maxBufferSize / 2 && this.backPressure) {
        this.backPressure = false;
        this.eventEmitter.emit('backpressure:end');
      }
    });
  }

  /**
   * Add a middleware function
   */
  addMiddleware(middleware: StreamMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Add a transformer function
   */
  addTransformer(transformer: StreamTransformer): this {
    this.transformers.push(transformer);
    return this;
  }

  /**
   * Process an update through middleware chain
   */
  private processMiddleware(update: StreamUpdate): void {
    if (this.middlewares.length === 0) {
      this.applyTransformers(update);
      return;
    }

    let index = 0;
    const next = (processedUpdate: StreamUpdate) => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        middleware(processedUpdate, next);
      } else {
        this.applyTransformers(processedUpdate);
      }
    };

    next(update);
  }

  /**
   * Apply transformers to an update
   */
  private applyTransformers(update: StreamUpdate): void {
    let transformedUpdate = { ...update };
    
    for (const transformer of this.transformers) {
      const result = transformer(transformedUpdate);
      if (result === null) {
        // Filter out this update
        return;
      }
      transformedUpdate = result;
    }

    this.addToBatch(transformedUpdate);
  }

  /**
   * Add an update to the current batch
   */
  private addToBatch(update: StreamUpdate): void {
    this.batchedUpdates.push(update);
    
    if (this.batchedUpdates.length >= this.options.batchSize || 
        update.type === StreamUpdateType.COMPLETE || 
        update.type === StreamUpdateType.ERROR) {
      
      // Process the batch
      const batch = this.options.batchSize === 1
        ? this.batchedUpdates[0] // Single update
        : { 
            type: 'batch', 
            updates: [...this.batchedUpdates],
            timestamp: Date.now()
          };
      
      // Add to queue
      this.enqueueUpdate(batch as StreamUpdate);
      
      // Clear batch
      this.batchedUpdates = [];
    }
  }

  /**
   * Add an update to the queue
   */
  private enqueueUpdate(update: StreamUpdate): void {
    if (this.done) return;

    // Check if there are waiting resolvers
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value: update, done: false });
    } else {
      this.queue.push(update);
      this.eventEmitter.emit('queue:update');
    }
  }

  /**
   * Queue an update to be streamed
   */
  queueUpdate(updateData: Record<string, any>): void {
    // Create a proper update object
    const update: StreamUpdate = {
      ...updateData,
      timestamp: Date.now(),
      type: updateData.type || StreamUpdateType.CUSTOM
    };

    // Process through middleware chain
    this.processMiddleware(update);
  }

  /**
   * Get the async generator for this stream
   */
  async *getStream(): AsyncGenerator<StreamUpdate> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
        this.eventEmitter.emit('queue:update');
      } else if (this.done) {
        break;
      } else {
        const result = await new Promise<IteratorResult<StreamUpdate>>(resolve => {
          this.resolvers.push(resolve);
        });
        
        if (result.done) {
          break;
        }
        
        yield result.value;
      }
    }
  }

  /**
   * Check if back-pressure is being applied
   */
  isBackPressureActive(): boolean {
    return this.backPressure;
  }

  /**
   * Get the current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Register a callback for when back-pressure starts
   */
  onBackPressureStart(callback: () => void): this {
    this.eventEmitter.on('backpressure:start', callback);
    return this;
  }

  /**
   * Register a callback for when back-pressure ends
   */
  onBackPressureEnd(callback: () => void): this {
    this.eventEmitter.on('backpressure:end', callback);
    return this;
  }

  /**
   * Complete the stream
   */
  complete(): void {
    this.done = true;
    
    // Process any remaining batched updates
    if (this.batchedUpdates.length > 0) {
      const batch = this.options.batchSize === 1
        ? this.batchedUpdates[0]
        : { 
            type: 'batch', 
            updates: [...this.batchedUpdates],
            timestamp: Date.now()
          };
      
      this.enqueueUpdate(batch as StreamUpdate);
      this.batchedUpdates = [];
    }
    
    // Resolve any pending waiters with done
    for (const resolve of this.resolvers) {
      resolve({ value: undefined, done: true });
    }
    
    this.resolvers = [];
    
    // Clean up event listeners
    this.eventEmitter.removeAllListeners();
  }
} 