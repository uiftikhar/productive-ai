/**
 * Multi-Agent Streaming Aggregator
 *
 * Utilities for aggregating streaming responses from multiple agents:
 * - Combines parallel agent streams
 * - Coordinates sequential streaming from multiple sources
 * - Provides strategies for merging and presenting multi-agent outputs
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import {
  StreamingResponseManager,
  StreamingResponseHandler,
  StreamingOptions,
  StreamingEvent,
  StreamingEventType,
} from './streaming-response-manager';

/**
 * Agent stream metadata
 */
export interface AgentStreamMetadata {
  agentId: string;
  agentName: string;
  priority: number;
  role?: string;
  capabilities?: string[];
}

/**
 * Stream entry for multi-agent aggregation
 */
export interface AgentStreamEntry {
  streamId: string;
  metadata: AgentStreamMetadata;
  buffer: string;
  isComplete: boolean;
  hasError: boolean;
  error?: Error;
}

/**
 * Aggregation strategy for combining multiple streams
 */
export enum StreamAggregationStrategy {
  PARALLEL = 'parallel', // Show all streams at once, side by side
  SEQUENTIAL = 'sequential', // Show streams one after another
  PRIORITY = 'priority', // Show streams in priority order
  LEADER_FOLLOWER = 'leader_follower', // One stream leads, others follow/assist
  COMBINED = 'combined', // Combine streams into a single coherent output
}

/**
 * Format options for aggregated output
 */
export interface StreamAggregationFormatOptions {
  showAgentNames: boolean; // Prefix each response with agent name
  separator: string; // Separator between agent responses
  indentFollowers: boolean; // Indent secondary agent responses
  indentSize: number; // Size of indentation
  useMarkdown: boolean; // Format output using markdown
  aggregateAsTable: boolean; // Format output as a table (for parallel only)
}

/**
 * Callback for aggregated stream events
 */
export interface StreamAggregationCallback {
  onToken: (token: string, metadata?: Record<string, any>) => void;
  onComplete: (fullResponse: string, metadata?: Record<string, any>) => void;
  onError: (error: Error, metadata?: Record<string, any>) => void;
}

/**
 * Aggregator for multi-agent streaming responses
 */
export class MultiAgentStreamingAggregator {
  private logger: Logger;
  private streamingManager: StreamingResponseManager;
  private streams: Map<string, AgentStreamEntry> = new Map();
  private aggregationId: string;
  private strategy: StreamAggregationStrategy;
  private formatOptions: StreamAggregationFormatOptions;
  private callback: StreamAggregationCallback;
  private isCompleted: boolean = false;
  private aggregatedOutput: string = '';
  private agentCount: number = 0;
  private completedCount: number = 0;

  constructor(
    callback: StreamAggregationCallback,
    options: {
      aggregationId?: string;
      strategy?: StreamAggregationStrategy;
      formatOptions?: Partial<StreamAggregationFormatOptions>;
      logger?: Logger;
    } = {},
  ) {
    this.aggregationId = options.aggregationId || uuidv4();
    this.strategy = options.strategy || StreamAggregationStrategy.SEQUENTIAL;
    this.formatOptions = {
      showAgentNames: true,
      separator: '\n\n',
      indentFollowers: true,
      indentSize: 2,
      useMarkdown: true,
      aggregateAsTable: false,
      ...options.formatOptions,
    };
    this.callback = callback;
    this.logger = options.logger || new ConsoleLogger();
    this.streamingManager = StreamingResponseManager.getInstance(this.logger);
  }

  /**
   * Register a new agent stream with the aggregator
   */
  public registerAgentStream(
    metadata: AgentStreamMetadata,
    streamingOptions: StreamingOptions,
  ): StreamingResponseHandler {
    const streamId = `${this.aggregationId}-${metadata.agentId}`;

    // Create an entry for this stream
    this.streams.set(streamId, {
      streamId,
      metadata,
      buffer: '',
      isComplete: false,
      hasError: false,
    });

    this.agentCount++;

    // Create a handler that will update our aggregation
    return this.streamingManager.createStreamingHandler(
      streamId,
      {
        onToken: (token: string) => {
          this.handleAgentToken(streamId, token);
        },
        onComplete: (fullResponse: string) => {
          this.handleAgentComplete(streamId, fullResponse);
        },
        onError: (error: Error) => {
          this.handleAgentError(streamId, error);
        },
      },
      streamingOptions,
    );
  }

  /**
   * Handle a token from an agent stream
   */
  private handleAgentToken(streamId: string, token: string): void {
    const streamEntry = this.streams.get(streamId);
    if (!streamEntry || streamEntry.isComplete) return;

    // Update the stream buffer
    streamEntry.buffer += token;
    this.streams.set(streamId, streamEntry);

    // Perform aggregation based on strategy
    this.aggregateStreams();
  }

  /**
   * Handle completion of an agent stream
   */
  private handleAgentComplete(streamId: string, fullResponse: string): void {
    const streamEntry = this.streams.get(streamId);
    if (!streamEntry || streamEntry.isComplete) return;

    // Mark the stream as complete
    streamEntry.isComplete = true;
    streamEntry.buffer = fullResponse; // Ensure we have the full response
    this.streams.set(streamId, streamEntry);

    this.completedCount++;

    // Perform final aggregation for this stream
    this.aggregateStreams();

    // Check if all streams are complete
    if (this.completedCount === this.agentCount && !this.isCompleted) {
      this.finalizeAggregation();
    }
  }

  /**
   * Handle error in an agent stream
   */
  private handleAgentError(streamId: string, error: Error): void {
    const streamEntry = this.streams.get(streamId);
    if (!streamEntry) return;

    // Mark the stream as errored
    streamEntry.isComplete = true;
    streamEntry.hasError = true;
    streamEntry.error = error;
    this.streams.set(streamId, streamEntry);

    this.completedCount++;

    // Log the error
    this.logger.error(`Error in agent stream: ${streamId}`, {
      aggregationId: this.aggregationId,
      agentId: streamEntry.metadata.agentId,
      error: error.message,
    });

    // Continue with other streams
    this.aggregateStreams();

    // Check if all streams are complete
    if (this.completedCount === this.agentCount && !this.isCompleted) {
      this.finalizeAggregation();
    }
  }

  /**
   * Aggregate streams based on the selected strategy
   */
  private aggregateStreams(): void {
    if (this.isCompleted) return;

    let newAggregatedOutput = '';

    switch (this.strategy) {
      case StreamAggregationStrategy.PARALLEL:
        newAggregatedOutput = this.aggregateParallelStreams();
        break;

      case StreamAggregationStrategy.SEQUENTIAL:
        newAggregatedOutput = this.aggregateSequentialStreams();
        break;

      case StreamAggregationStrategy.PRIORITY:
        newAggregatedOutput = this.aggregatePriorityStreams();
        break;

      case StreamAggregationStrategy.LEADER_FOLLOWER:
        newAggregatedOutput = this.aggregateLeaderFollowerStreams();
        break;

      case StreamAggregationStrategy.COMBINED:
        newAggregatedOutput = this.aggregateCombinedStreams();
        break;
    }

    // If output has changed, send the delta
    if (newAggregatedOutput !== this.aggregatedOutput) {
      const delta = newAggregatedOutput.substring(this.aggregatedOutput.length);
      this.aggregatedOutput = newAggregatedOutput;

      // Send the delta to the callback
      this.callback.onToken(delta, {
        aggregationId: this.aggregationId,
        strategy: this.strategy,
        completedCount: this.completedCount,
        totalCount: this.agentCount,
      });
    }
  }

  /**
   * Aggregate streams in parallel (side by side)
   */
  private aggregateParallelStreams(): string {
    if (this.formatOptions.aggregateAsTable) {
      return this.aggregateAsTable();
    }

    // Sort streams by priority
    const sortedEntries = Array.from(this.streams.values()).sort(
      (a, b) => a.metadata.priority - b.metadata.priority,
    );

    // Build the output
    return sortedEntries
      .map((entry) => {
        const prefix = this.formatOptions.showAgentNames
          ? this.formatAgentPrefix(entry.metadata)
          : '';

        return `${prefix}${entry.buffer}`;
      })
      .join(this.formatOptions.separator);
  }

  /**
   * Aggregate streams as a markdown table
   */
  private aggregateAsTable(): string {
    // Sort streams by priority
    const sortedEntries = Array.from(this.streams.values()).sort(
      (a, b) => a.metadata.priority - b.metadata.priority,
    );

    // Create table header
    let table = '| Agent | Response |\n| --- | --- |\n';

    // Add table rows
    sortedEntries.forEach((entry) => {
      const agentName = entry.metadata.agentName;
      const response = entry.buffer.replace(/\n/g, '<br>');
      table += `| ${agentName} | ${response} |\n`;
    });

    return table;
  }

  /**
   * Aggregate streams sequentially (one after another)
   */
  private aggregateSequentialStreams(): string {
    // Sort streams by priority
    const sortedEntries = Array.from(this.streams.values()).sort(
      (a, b) => a.metadata.priority - b.metadata.priority,
    );

    let output = '';
    let currentStreamIndex = 0;

    // Find the current active stream
    for (let i = 0; i < sortedEntries.length; i++) {
      const entry = sortedEntries[i];

      // If this entry is not complete, it's the current one
      if (!entry.isComplete) {
        currentStreamIndex = i;
        break;
      }

      // Add completed entry to the output
      const prefix = this.formatOptions.showAgentNames
        ? this.formatAgentPrefix(entry.metadata)
        : '';

      output += `${prefix}${entry.buffer}${this.formatOptions.separator}`;
    }

    // Add the current stream if we have one
    if (currentStreamIndex < sortedEntries.length) {
      const currentEntry = sortedEntries[currentStreamIndex];
      const prefix = this.formatOptions.showAgentNames
        ? this.formatAgentPrefix(currentEntry.metadata)
        : '';

      output += `${prefix}${currentEntry.buffer}`;
    }

    return output;
  }

  /**
   * Aggregate streams by priority
   */
  private aggregatePriorityStreams(): string {
    // Sort streams by priority
    const sortedEntries = Array.from(this.streams.values()).sort(
      (a, b) => a.metadata.priority - b.metadata.priority,
    );

    // Only show the highest priority stream that is not complete
    // If all are complete, show the highest priority stream
    const activeEntry =
      sortedEntries.find((entry) => !entry.isComplete) || sortedEntries[0];

    const prefix = this.formatOptions.showAgentNames
      ? this.formatAgentPrefix(activeEntry.metadata)
      : '';

    return `${prefix}${activeEntry.buffer}`;
  }

  /**
   * Aggregate streams in leader-follower mode
   */
  private aggregateLeaderFollowerStreams(): string {
    // Sort streams by priority
    const sortedEntries = Array.from(this.streams.values()).sort(
      (a, b) => a.metadata.priority - b.metadata.priority,
    );

    // The leader is the first entry
    const leader = sortedEntries[0];
    const followers = sortedEntries.slice(1);

    // Start with the leader
    const leaderPrefix = this.formatOptions.showAgentNames
      ? this.formatAgentPrefix(leader.metadata)
      : '';

    let output = `${leaderPrefix}${leader.buffer}`;

    // Add followers if leader is complete
    if (leader.isComplete) {
      followers.forEach((follower) => {
        if (follower.buffer.trim().length > 0) {
          const followerPrefix = this.formatOptions.showAgentNames
            ? this.formatAgentPrefix(follower.metadata)
            : '';

          const indent = this.formatOptions.indentFollowers
            ? ' '.repeat(this.formatOptions.indentSize)
            : '';

          const followerContent = this.formatOptions.indentFollowers
            ? follower.buffer
                .split('\n')
                .map((line) => `${indent}${line}`)
                .join('\n')
            : follower.buffer;

          output += `${this.formatOptions.separator}${followerPrefix}${followerContent}`;
        }
      });
    }

    return output;
  }

  /**
   * Aggregate streams as a combined coherent output
   */
  private aggregateCombinedStreams(): string {
    // When combining, don't show agent names, just combine the content
    const sortedEntries = Array.from(this.streams.values()).sort(
      (a, b) => a.metadata.priority - b.metadata.priority,
    );

    // This strategy attempts to produce a coherent output
    // We might need more sophisticated logic depending on use case
    return sortedEntries
      .map((entry) => entry.buffer)
      .filter((buffer) => buffer.trim().length > 0)
      .join(' ');
  }

  /**
   * Format the agent prefix based on format options
   */
  private formatAgentPrefix(metadata: AgentStreamMetadata): string {
    if (this.formatOptions.useMarkdown) {
      return `**${metadata.agentName}**: `;
    }
    return `${metadata.agentName}: `;
  }

  /**
   * Finalize the aggregation when all streams are complete
   */
  private finalizeAggregation(): void {
    this.isCompleted = true;

    // Ensure we have the final aggregated output
    this.aggregateStreams();

    // Call the completion callback
    this.callback.onComplete(this.aggregatedOutput, {
      aggregationId: this.aggregationId,
      strategy: this.strategy,
      completedCount: this.completedCount,
      totalCount: this.agentCount,
      agents: Array.from(this.streams.values()).map((entry) => ({
        agentId: entry.metadata.agentId,
        agentName: entry.metadata.agentName,
        hasError: entry.hasError,
      })),
    });
  }

  /**
   * Force completion of the aggregation
   */
  public complete(): void {
    // Mark all incomplete streams as complete
    for (const [streamId, entry] of this.streams.entries()) {
      if (!entry.isComplete) {
        entry.isComplete = true;
        this.completedCount++;
      }
    }

    if (!this.isCompleted) {
      this.finalizeAggregation();
    }
  }

  /**
   * Cancel the aggregation
   */
  public cancel(reason: string = 'Aggregation cancelled'): void {
    if (this.isCompleted) return;

    this.isCompleted = true;

    // Create an error
    const error = new Error(reason);

    // Call the error callback
    this.callback.onError(error, {
      aggregationId: this.aggregationId,
      strategy: this.strategy,
      completedCount: this.completedCount,
      totalCount: this.agentCount,
    });
  }
}
