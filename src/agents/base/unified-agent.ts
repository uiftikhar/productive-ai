import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  HumanMessage,
  AIMessage,
} from '@langchain/core/messages';

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { LangChainConfig } from '../../langchain/config';

import {
  UnifiedAgentInterface,
  AgentCapability,
  AgentResponse,
  AgentRequest,
  AgentContext,
  AgentState,
  AgentStatus,
  AgentMetrics,
} from '../interfaces/unified-agent.interface';

/**
 * Abstract unified agent class that provides common functionality for all agents
 * with built-in LangGraph compatibility
 */
export abstract class UnifiedAgent implements UnifiedAgentInterface {
  readonly id: string;

  protected logger: Logger;
  protected llm: ChatOpenAI;
  protected capabilities: Map<string, AgentCapability> = new Map();
  protected isInitialized: boolean = false;

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
    } = {},
  ) {
    this.id = options.id || uuidv4();
    this.logger = options.logger || new ConsoleLogger();

    // Initialize LLM with default configuration
    this.llm =
      options.llm ||
      new ChatOpenAI({
        modelName: LangChainConfig.llm.model,
        temperature: LangChainConfig.llm.temperature,
        maxTokens: LangChainConfig.llm.maxTokens,
      });

    // Initialize state
    this.state = {
      status: AgentStatus.INITIALIZING,
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
    this.setState({ status: AgentStatus.READY });
    this.isInitialized = true;
  }

  /**
   * Clean up any resources used by the agent
   */
  async terminate(): Promise<void> {
    this.logger.info(`Terminating agent: ${this.name}`);
    this.setState({ status: AgentStatus.TERMINATED });
    this.isInitialized = false;
  }

  /**
   * Get the current agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Get initialization status
   */
  getInitializationStatus(): boolean {
    return this.isInitialized;
  }

  /**
   * Update agent state
   */
  protected setState(update: Partial<AgentState>): void {
    this.state = { ...this.state, ...update };
  }

  /**
   * Get agent metrics
   */
  getMetrics(): AgentMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics to default values
   */
  protected resetMetrics(): void {
    this.metrics = {
      totalExecutions: 0,
      totalExecutionTimeMs: 0,
      averageExecutionTimeMs: 0,
      tokensUsed: 0,
      errorRate: 0,
    };
  }

  /**
   * Process metrics after execution
   */
  protected processMetrics(
    startTime: number,
    tokenUsage?: number,
    steps?: number,
  ): Partial<AgentResponse['metrics']> {
    const executionTimeMs = Date.now() - startTime;

    // Update agent metrics
    this.metrics.totalExecutions += 1;
    this.metrics.totalExecutionTimeMs += executionTimeMs;
    this.metrics.averageExecutionTimeMs =
      this.metrics.totalExecutionTimeMs / this.metrics.totalExecutions;
    this.metrics.lastExecutionTimeMs = executionTimeMs;

    if (tokenUsage) {
      this.metrics.tokensUsed += tokenUsage;
    }

    this.metrics.errorRate =
      this.state.errorCount / this.metrics.totalExecutions;

    // Return metrics for the response
    return {
      executionTimeMs,
      tokensUsed: tokenUsage,
      stepCount: steps,
    };
  }

  /**
   * Estimate token count (simple implementation)
   */
  protected estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Prepare chat messages from system prompt and user input
   */
  protected prepareMessages(
    systemPrompt: string,
    userInput: string | BaseMessage[],
  ): BaseMessage[] {
    const messages: BaseMessage[] = [new SystemMessage(systemPrompt)];

    if (typeof userInput === 'string') {
      messages.push(new HumanMessage(userInput));
    } else if (Array.isArray(userInput)) {
      messages.push(...userInput);
    }

    return messages;
  }

  /**
   * Pre-execution hook - can be overridden by child classes
   */
  protected async preExecute(request: AgentRequest): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Post-execution hook - can be overridden by child classes
   */
  protected async postExecute(
    request: AgentRequest,
    response: AgentResponse,
    executionTimeMs: number,
  ): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Handle errors during execution
   */
  protected async handleError(
    error: Error,
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const errorMessage = `Error executing agent: ${error.message}`;
    this.logger.error(errorMessage, { error, request });

    this.setState({
      status: AgentStatus.ERROR,
      errorCount: this.state.errorCount + 1,
    });

    return {
      output: `I encountered an error: ${error.message}. Please try again or contact support if the problem persists.`,
      metrics: {
        executionTimeMs: 0,
        tokensUsed: 0,
      },
    };
  }

  /**
   * Execute the agent
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    // Initialize if needed
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    this.setState({
      status: AgentStatus.EXECUTING,
      executionCount: this.state.executionCount + 1,
    });

    try {
      // Pre-execute hook
      await this.preExecute(request);

      // Execute the agent
      const response = await this.executeInternal(request);

      // Post-execute hook
      await this.postExecute(request, response, Date.now() - startTime);

      // Update metrics and state
      response.metrics = this.processMetrics(
        startTime,
        response.metrics?.tokensUsed,
        response.metrics?.stepCount,
      );

      this.setState({ status: AgentStatus.READY });

      return response;
    } catch (error) {
      return this.handleError(
        error instanceof Error ? error : new Error(String(error)),
        request,
      );
    }
  }

  /**
   * Internal execution method - to be implemented by child classes
   */
  protected abstract executeInternal(
    request: AgentRequest,
  ): Promise<AgentResponse>;
}
