// src/agents/base/base-agent.ts

import { v4 as uuidv4 } from 'uuid';

import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  HumanMessage,
} from '@langchain/core/messages';
import { LangChainConfig } from '../../langchain/config.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import {
  AgentInterface,
  AgentCapability,
  AgentResponse,
  AgentRequest,
  AgentContext,
} from '../interfaces/agent.interface.ts';

import {
  AgentContextAdapter,
  PineconeAdapter,
  OpenAIAdapter,
  createAdapters,
} from '../adapters/index.ts';

import { TokenUsageManager } from '../orchestration/token-usage-manager.ts';
import { StreamingResponseManager } from '../orchestration/streaming-response-manager.ts';
import {
  StreamAggregationStrategy,
  AgentStreamMetadata,
  MultiAgentStreamingAggregator,
} from '../orchestration/multi-agent-streaming-aggregator.ts';

/**
 * Agent state types
 */
export type AgentStatus =
  | 'initializing'
  | 'ready'
  | 'executing'
  | 'error'
  | 'terminated';

/**
 * Agent state interface
 */
export interface AgentState {
  status: AgentStatus;
  lastExecutionTime?: number;
  errorCount: number;
  executionCount: number;
  metadata: Record<string, any>;
}

/**
 * Agent metrics interface
 */
export interface AgentMetrics {
  totalExecutions: number;
  totalExecutionTimeMs: number;
  averageExecutionTimeMs: number;
  tokensUsed: number;
  errorRate: number;
  lastExecutionTimeMs?: number;
}

/**
 * Abstract base agent class that provides common functionality for all agents
 */
export abstract class BaseAgent implements AgentInterface {
  readonly id: string;

  protected logger: Logger;
  protected llm: ChatOpenAI;
  protected capabilities: Map<string, AgentCapability> = new Map();
  protected isInitialized: boolean = false;

  // Adapters
  protected contextAdapter?: AgentContextAdapter;
  protected pineconeAdapter?: PineconeAdapter;
  protected openaiAdapter?: OpenAIAdapter;

  // Managers
  protected tokenUsageManager: TokenUsageManager;
  protected streamingManager: StreamingResponseManager;

  // State and metrics
  protected state: AgentState;
  protected metrics: AgentMetrics;

  constructor(
    readonly name: string,
    readonly description: string,
    options: {
      id?: string;
      logger?: Logger;
      llm?: ChatOpenAI;
      contextAdapter?: AgentContextAdapter;
      pineconeAdapter?: PineconeAdapter;
      openaiAdapter?: OpenAIAdapter;
    } = {},
  ) {
    this.id = options.id || uuidv4();
    this.logger = options.logger || new ConsoleLogger();

    // Initialize managers
    this.tokenUsageManager = TokenUsageManager.getInstance(this.logger);
    this.streamingManager = StreamingResponseManager.getInstance(this.logger);

    // Initialize LLM with default configuration
    this.llm =
      options.llm ||
      new ChatOpenAI({
        modelName: LangChainConfig.llm.model,
        temperature: LangChainConfig.llm.temperature,
        maxTokens: LangChainConfig.llm.maxTokens,
      });

    // Set up adapters
    if (
      options.contextAdapter ||
      options.pineconeAdapter ||
      options.openaiAdapter
    ) {
      this.contextAdapter = options.contextAdapter;
      this.pineconeAdapter = options.pineconeAdapter;
      this.openaiAdapter = options.openaiAdapter;
    } else {
      // Create default adapters if none provided
      const adapters = createAdapters(this.logger);
      this.contextAdapter = adapters.contextAdapter;
      this.pineconeAdapter = adapters.pineconeAdapter;
      this.openaiAdapter = adapters.openaiAdapter;
    }

    // Initialize state
    this.state = {
      status: 'initializing',
      errorCount: 0,
      executionCount: 0,
      metadata: {},
    };

    // Initialize metrics
    this.metrics = {
      totalExecutions: 0,
      totalExecutionTimeMs: 0,
      averageExecutionTimeMs: 0,
      tokensUsed: 0,
      errorRate: 0,
    };

    // Register capabilities in child classes using this.registerCapability()
  }

  /**
   * Register a capability that this agent provides
   */
  protected registerCapability(capability: AgentCapability): void {
    this.capabilities.set(capability.name, capability);
  }

  /**
   * Get all capabilities this agent provides
   */
  getCapabilities(): AgentCapability[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Check if agent can handle a specific capability
   */
  canHandle(capability: string): boolean {
    return this.capabilities.has(capability);
  }

  /**
   * Initialize the agent with runtime configuration
   * Child classes should override this and call super.initialize()
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    this.logger.info(`Initializing agent: ${this.name}`);

    // Initialize adapters if available
    const initPromises: Promise<void>[] = [];

    if (this.contextAdapter) {
      initPromises.push(
        this.contextAdapter.initialize().catch((error) => {
          this.logger.warn(
            `Failed to initialize context adapter: ${error.message}`,
          );
        }),
      );
    }

    if (this.pineconeAdapter) {
      initPromises.push(
        this.pineconeAdapter.initialize().catch((error) => {
          this.logger.warn(
            `Failed to initialize pinecone adapter: ${error.message}`,
          );
        }),
      );
    }

    if (this.openaiAdapter) {
      initPromises.push(
        this.openaiAdapter.initialize().catch((error) => {
          this.logger.warn(
            `Failed to initialize openai adapter: ${error.message}`,
          );
        }),
      );
    }

    // Wait for all adapters to initialize
    await Promise.all(initPromises);

    this.state.status = 'ready';
    this.isInitialized = true;
    this.logger.info(`Agent initialized: ${this.name}`);
  }

  /**
   * Terminate the agent and clean up resources
   */
  async terminate(): Promise<void> {
    this.logger.info(`Terminating agent: ${this.name}`);
    this.state.status = 'terminated';
    // Child classes can override this to clean up resources
  }

  /**
   * Get the current agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Update agent state
   */
  setState(update: Partial<AgentState>): void {
    this.state = { ...this.state, ...update };
  }

  /**
   * Get agent metrics
   */
  getMetrics(): AgentMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset agent metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalExecutions: 0,
      totalExecutionTimeMs: 0,
      averageExecutionTimeMs: 0,
      tokensUsed: 0,
      errorRate: 0,
    };
  }

  /**
   * Process and store metrics from execution
   */
  protected processMetrics(
    startTime: number,
    tokenUsage?: number,
    steps?: number,
  ): Partial<AgentResponse['metrics']> {
    const executionTimeMs = Date.now() - startTime;

    // Update agent metrics
    this.metrics.totalExecutions++;
    this.metrics.totalExecutionTimeMs += executionTimeMs;
    this.metrics.averageExecutionTimeMs =
      this.metrics.totalExecutionTimeMs / this.metrics.totalExecutions;
    this.metrics.lastExecutionTimeMs = executionTimeMs;

    if (tokenUsage) {
      this.metrics.tokensUsed += tokenUsage;
    }

    this.metrics.errorRate =
      this.state.errorCount / this.metrics.totalExecutions;

    // Update state
    this.state.lastExecutionTime = Date.now();

    // Return metrics for this execution
    return {
      executionTimeMs,
      tokensUsed: tokenUsage,
      stepCount: steps
    };
  }

  /**
   * Track token usage for a model interaction
   */
  protected trackTokenUsage(
    request: AgentRequest,
    promptText: string,
    responseText: string,
    modelInfo: { modelName: string; modelProvider: string }
  ): void {
    // Estimate token counts
    const promptTokens = this.estimateTokenCount(promptText);
    const completionTokens = this.estimateTokenCount(responseText);
    const totalTokens = promptTokens + completionTokens;

    // Record via TokenUsageManager
    this.tokenUsageManager.recordUsage({
      userId: request.context?.userId || 'unknown',
      conversationId: request.context?.conversationId,
      sessionId: request.context?.sessionId,
      modelName: modelInfo.modelName,
      modelProvider: modelInfo.modelProvider,
      promptTokens,
      completionTokens,
      totalTokens
    });

    // Update local metrics
    this.metrics.tokensUsed += totalTokens;
  }

  /**
   * Create a streaming handler for this agent
   */
  protected createStreamingHandler(
    request: AgentRequest,
    streamingHandler: any,
    modelInfo: { modelName: string; modelProvider: string },
    streamingAggregator?: MultiAgentStreamingAggregator,
    streamingRole?: 'leader' | 'follower' | 'parallel'
  ): any {
    // If we have an aggregator, register with it
    if (streamingAggregator) {
      const metadata: AgentStreamMetadata = {
        agentId: this.id,
        agentName: this.name,
        priority: streamingRole === 'leader' ? 1 : (streamingRole === 'follower' ? 2 : 3),
        role: streamingRole
      };

      // Create streaming options
      const streamingOptions = {
        userId: request.context?.userId || 'unknown',
        conversationId: request.context?.conversationId,
        sessionId: request.context?.sessionId,
        modelName: modelInfo.modelName,
        modelProvider: modelInfo.modelProvider,
        recordTokenUsage: true
      };

      // Register with the aggregator
      return streamingAggregator.registerAgentStream(metadata, streamingOptions);
    }

    // Otherwise create a direct streaming handler
    const requestId = uuidv4();
    
    return this.streamingManager.createStreamingHandler(
      requestId,
      streamingHandler,
      {
        userId: request.context?.userId || 'unknown',
        conversationId: request.context?.conversationId,
        sessionId: request.context?.sessionId,
        modelName: modelInfo.modelName,
        modelProvider: modelInfo.modelProvider,
        recordTokenUsage: true
      }
    );
  }

  /**
   * Estimate token count from text
   */
  protected estimateTokenCount(text: string): number {
    // Simple estimation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Get context from context adapter
   */
  protected async getContext(request: AgentRequest): Promise<AgentContext> {
    if (!this.contextAdapter || !request.context?.userId) {
      return request.context || {};
    }

    try {
      const input =
        typeof request.input === 'string'
          ? request.input
          : request.input.map((msg) => msg.content).join('\n');

      return await this.contextAdapter.getContext(
        request.context.userId,
        input,
        {
          conversationId: request.context.conversationId,
          sessionId: request.context.sessionId,
        },
      );
    } catch (error) {
      this.logger.error('Error retrieving context', {
        error: error instanceof Error ? error.message : String(error),
      });
      return request.context || {};
    }
  }

  /**
   * Store context from agent execution
   */
  protected async storeContext(
    userId: string,
    content: string,
    metadata: Record<string, any> = {},
  ): Promise<string | undefined> {
    if (!this.contextAdapter) {
      return undefined;
    }

    try {
      return await this.contextAdapter.storeContext(userId, content, metadata);
    } catch (error) {
      this.logger.error('Error storing context', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  /**
   * Helper method to prepare messages for LLM
   */
  protected prepareMessages(
    systemPrompt: string,
    userMessage: string | BaseMessage[],
  ): BaseMessage[] {
    const messages: BaseMessage[] = [new SystemMessage(systemPrompt)];

    if (typeof userMessage === 'string') {
      messages.push(new HumanMessage(userMessage));
    } else {
      messages.push(...userMessage);
    }

    return messages;
  }

  /**
   * Pre-execution hook for subclasses to override
   */
  protected async preExecute(request: AgentRequest): Promise<void> {
    // Update agent state
    this.state.status = 'executing';
    this.state.executionCount++;

    this.logger.debug(`Starting execution for agent: ${this.name}`, {
      agentId: this.id,
      capability: request.capability,
    });
  }

  /**
   * Post-execution hook for subclasses to override
   */
  protected async postExecute(
    request: AgentRequest,
    response: AgentResponse,
    executionTimeMs: number,
  ): Promise<void> {
    // Update agent state
    this.state.status = 'ready';
    this.state.lastExecutionTime = Date.now();

    this.logger.debug(`Completed execution for agent: ${this.name}`, {
      agentId: this.id,
      executionTimeMs,
    });

    // Store execution result if we have a userId
    if (request.context?.userId) {
      // Don't await this to avoid blocking
      this.storeContext(
        request.context.userId,
        typeof response.output === 'string'
          ? response.output
          : response.output.content.toString(),
        {
          agentId: this.id,
          agentName: this.name,
          capability: request.capability,
          executionTimeMs,
          conversationId: request.context.conversationId,
        },
      ).catch((error) => {
        // Just log errors, don't fail the main execution
        this.logger.error('Failed to store execution result', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  /**
   * Error handling hook for subclasses to override
   */
  protected async handleError(
    error: Error,
    request: AgentRequest,
  ): Promise<AgentResponse> {
    // Update error stats
    this.state.status = 'error';
    this.state.errorCount++;

    this.logger.error(`Error in agent execution: ${this.name}`, {
      agentId: this.id,
      error: error.message,
      stack: error.stack,
      capability: request.capability,
    });

    // Return a generic error response
    return {
      output: `Error in agent ${this.name}: ${error.message}`,
      artifacts: {
        error: {
          message: error.message,
          stack: error.stack,
        },
      },
    };
  }

  /**
   * Execute the agent with the given request
   * This provides common functionality and calls executeInternal for specific implementation
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Run pre-execution hook
      await this.preExecute(request);

      // Check if we're initialized
      if (!this.isInitialized) {
        throw new Error(`Agent ${this.name} is not initialized`);
      }

      // Check if the request has a capability and if we can handle it
      if (request.capability && !this.canHandle(request.capability)) {
        throw new Error(
          `Agent ${this.name} cannot handle capability: ${request.capability}`,
        );
      }

      // Get context if available
      const enrichedContext = await this.getContext(request);

      // Execute the internal implementation
      const requestWithContext: AgentRequest = {
        ...request,
        context: enrichedContext,
      };

      const response = await this.executeInternal(requestWithContext);

      // Add metrics
      const metrics = this.processMetrics(startTime);
      response.metrics = {
        ...(response.metrics || {}),
        ...metrics,
      };

      // Run post-execution hook
      await this.postExecute(request, response, metrics!.executionTimeMs || 0);

      return response;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return this.handleError(err, request);
    }
  }

  /**
   * Internal implementation of agent execution
   * Child classes must implement this
   */
  protected abstract executeInternal(
    request: AgentRequest,
  ): Promise<AgentResponse>;
}
