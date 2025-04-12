/**
 * Streaming Response Manager
 * 
 * Organizes streaming functionality across the system, providing:
 * - Token-by-token streaming
 * - Event handling for streaming responses
 * - Utilities for streaming response formatting and processing
 */

import { Logger } from '../../shared/logger/logger.interface.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { TokenUsageManager } from './token-usage-manager.ts';

/**
 * Base streaming response handler interface
 */
export interface StreamingResponseHandler {
  onToken: (token: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: Error) => void;
}

/**
 * Streaming response options
 */
export interface StreamingOptions {
  userId?: string;
  conversationId?: string;
  sessionId?: string;
  modelName: string;
  modelProvider: string;
  recordTokenUsage?: boolean;
  formatOptions?: {
    prefix?: string;
    suffix?: string;
    removeNewlines?: boolean;
    transformFn?: (token: string) => string;
  };
}

/**
 * Event types for streaming response
 */
export enum StreamingEventType {
  TOKEN = 'token',
  COMPLETE = 'complete',
  ERROR = 'error',
  START = 'start',
  THINKING = 'thinking',
}

/**
 * Streaming event
 */
export interface StreamingEvent {
  type: StreamingEventType;
  timestamp: number;
  payload?: any;
  metadata?: Record<string, any>;
}

/**
 * Completion status for token streaming
 */
export interface StreamingStatus {
  inProgress: boolean;
  startTime?: number;
  endTime?: number;
  totalTokens: number;
  hasError: boolean;
  error?: Error;
  response?: string;
}

/**
 * Manages streaming responses in the application
 */
export class StreamingResponseManager {
  private logger: Logger;
  private tokenUsageManager: TokenUsageManager;
  
  // Store active streaming sessions
  private activeStreams: Map<string, StreamingStatus> = new Map();
  
  private static instance: StreamingResponseManager;

  /**
   * Get singleton instance
   */
  public static getInstance(logger?: Logger): StreamingResponseManager {
    if (!StreamingResponseManager.instance) {
      StreamingResponseManager.instance = new StreamingResponseManager(logger);
    }
    return StreamingResponseManager.instance;
  }

  /**
   * Private constructor for singleton pattern
   */
  private constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
    this.tokenUsageManager = TokenUsageManager.getInstance();
  }

  /**
   * Create a streaming handler
   */
  public createStreamingHandler(
    streamId: string,
    callback: StreamingResponseHandler,
    options: StreamingOptions,
  ): StreamingResponseHandler {
    // Initialize stream status
    this.activeStreams.set(streamId, {
      inProgress: false,
      totalTokens: 0,
      hasError: false
    });

    // Return a handler that processes the stream
    return {
      onToken: (token: string) => {
        // Start streaming if not already started
        const status = this.activeStreams.get(streamId);
        if (status && !status.inProgress) {
          status.inProgress = true;
          status.startTime = Date.now();
          this.activeStreams.set(streamId, status);
        }

        // Apply formatting if needed
        let processedToken = token;
        if (options.formatOptions) {
          const { prefix, removeNewlines, transformFn } = options.formatOptions;
          
          if (prefix && status?.totalTokens === 0) {
            processedToken = prefix + processedToken;
          }
          
          if (removeNewlines) {
            processedToken = processedToken.replace(/\n/g, ' ');
          }
          
          if (transformFn) {
            processedToken = transformFn(processedToken);
          }
        }
        
        // Update token count
        if (status) {
          status.totalTokens += 1;
          this.activeStreams.set(streamId, status);
        }
        
        // Call the original handler
        callback.onToken(processedToken);
      },
      
      onComplete: (fullResponse: string) => {
        // Update stream status
        const status = this.activeStreams.get(streamId);
        if (status) {
          status.inProgress = false;
          status.endTime = Date.now();
          status.response = fullResponse;
          this.activeStreams.set(streamId, status);
          
          // Apply suffix if needed
          let finalResponse = fullResponse;
          if (options.formatOptions?.suffix) {
            finalResponse += options.formatOptions.suffix;
          }
          
          // Record token usage if enabled
          if (options.recordTokenUsage) {
            const completionTokens = this.tokenUsageManager.estimateTokenCount(fullResponse);
            // We don't have exact prompt tokens, so we'll estimate based on response length
            const promptTokens = Math.floor(completionTokens * 0.3); // Rough estimate
            
            this.tokenUsageManager.recordUsage({
              userId: options.userId,
              conversationId: options.conversationId,
              sessionId: options.sessionId,
              modelName: options.modelName,
              modelProvider: options.modelProvider,
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens
            });
          }
          
          // Call the original handler
          callback.onComplete(finalResponse);
        }
      },
      
      onError: (error: Error) => {
        // Update stream status
        const status = this.activeStreams.get(streamId);
        if (status) {
          status.inProgress = false;
          status.hasError = true;
          status.error = error;
          this.activeStreams.set(streamId, status);
        }
        
        // Log the error
        this.logger.error('Streaming error', {
          streamId,
          error: error.message,
          modelName: options.modelName
        });
        
        // Call the original handler
        callback.onError(error);
      }
    };
  }

  /**
   * Get status of a streaming session
   */
  public getStreamingStatus(streamId: string): StreamingStatus | undefined {
    return this.activeStreams.get(streamId);
  }

  /**
   * Create a web-friendly streaming handler that emits events
   */
  public createEventStreamHandler(
    streamId: string,
    eventCallback: (event: StreamingEvent) => void,
    options: StreamingOptions
  ): StreamingResponseHandler {
    let responseBuffer = '';
    
    return this.createStreamingHandler(
      streamId,
      {
        onToken: (token: string) => {
          responseBuffer += token;
          
          // Emit token event
          eventCallback({
            type: StreamingEventType.TOKEN,
            timestamp: Date.now(),
            payload: token,
            metadata: {
              streamId,
              modelName: options.modelName
            }
          });
        },
        
        onComplete: (fullResponse: string) => {
          // Emit complete event
          eventCallback({
            type: StreamingEventType.COMPLETE,
            timestamp: Date.now(),
            payload: fullResponse,
            metadata: {
              streamId,
              modelName: options.modelName,
              tokenCount: this.tokenUsageManager.estimateTokenCount(fullResponse)
            }
          });
        },
        
        onError: (error: Error) => {
          // Emit error event
          eventCallback({
            type: StreamingEventType.ERROR,
            timestamp: Date.now(),
            payload: error,
            metadata: {
              streamId,
              modelName: options.modelName
            }
          });
        }
      },
      options
    );
  }

  /**
   * Create a "thinking" indicator that shows before actual streaming starts
   */
  public createThinkingIndicator(
    streamId: string,
    eventCallback: (event: StreamingEvent) => void,
    options: {
      thinkingMessage?: string;
      intervalMs?: number;
      maxDots?: number;
    } = {}
  ): { start: () => void; stop: () => void } {
    const thinkingMessage = options.thinkingMessage || 'Thinking';
    const intervalMs = options.intervalMs || 500;
    const maxDots = options.maxDots || 3;
    
    let intervalId: NodeJS.Timeout | null = null;
    let dotCount = 0;
    
    return {
      start: () => {
        // Emit initial thinking event
        eventCallback({
          type: StreamingEventType.THINKING,
          timestamp: Date.now(),
          payload: `${thinkingMessage}`,
          metadata: {
            streamId,
            isComplete: false
          }
        });
        
        // Set up interval for thinking animation
        intervalId = setInterval(() => {
          dotCount = (dotCount % maxDots) + 1;
          const dots = '.'.repeat(dotCount);
          
          eventCallback({
            type: StreamingEventType.THINKING,
            timestamp: Date.now(),
            payload: `${thinkingMessage}${dots}`,
            metadata: {
              streamId,
              isComplete: false
            }
          });
        }, intervalMs);
      },
      
      stop: () => {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
          
          // Emit final thinking event
          eventCallback({
            type: StreamingEventType.THINKING,
            timestamp: Date.now(),
            payload: '',
            metadata: {
              streamId,
              isComplete: true
            }
          });
        }
      }
    };
  }

  /**
   * Clear completed streaming sessions
   */
  public clearCompletedStreams(): void {
    for (const [streamId, status] of this.activeStreams.entries()) {
      if (!status.inProgress) {
        this.activeStreams.delete(streamId);
      }
    }
  }
} 