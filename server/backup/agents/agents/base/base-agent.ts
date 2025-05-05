/**
 * @deprecated This module is deprecated and will be removed in a future version.
 * Use the new agentic meeting analysis system in /langgraph/agentic-meeting-analysis instead.
 * 
 * Abstract base agent class that provides common functionality for all agents
 * with built-in LangGraph compatibility
 */
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
  BaseAgentInterface,
  WorkflowCompatibleAgent,
  AgentCapability,
  AgentResponse,
  AgentRequest,
  AgentContext,
  AgentState,
  AgentStatus,
  AgentMetrics,
} from '../interfaces/base-agent.interface';

export abstract class BaseAgent implements WorkflowCompatibleAgent {
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

    this.llm =
      options.llm ||
      new ChatOpenAI({
        modelName: LangChainConfig.llm.model,
        temperature: LangChainConfig.llm.temperature,
        maxTokens: LangChainConfig.llm.maxTokens,
      });

    this.state = {
      status: AgentStatus.INITIALIZING,
      errorCount: 0,
      executionCount: 0,
      metadata: {},
    };

    this.metrics = {
      totalExecutions: 0,
      totalExecutionTimeMs: 0,
      averageExecutionTimeMs: 0,
      tokensUsed: 0,
      errorRate: 0,
    };
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
   * Update agent metrics - useful for external tracking systems
   */
  updateMetrics(update: Partial<AgentMetrics>): void {
    this.metrics = { ...this.metrics, ...update };
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
    // Calculate execution time, ensuring a minimum value of 1ms to avoid zero values
    const executionTimeMs = Math.max(1, Date.now() - startTime);

    // Update the agent metrics
    this.metrics.totalExecutions += 1;
    this.metrics.totalExecutionTimeMs += executionTimeMs;
    this.metrics.averageExecutionTimeMs =
      this.metrics.totalExecutionTimeMs / this.metrics.totalExecutions;
    this.metrics.lastExecutionTimeMs = executionTimeMs;

    if (tokenUsage) {
      this.metrics.tokensUsed += tokenUsage;
    }

    // Update error rate if there are executions
    if (this.metrics.totalExecutions > 0) {
      this.metrics.errorRate =
        this.state.errorCount / this.metrics.totalExecutions;
    }

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
   * Prepare messages for the LLM
   */
  protected prepareMessages(
    systemPrompt: string,
    userInput: string | BaseMessage[],
  ): BaseMessage[] {
    if (Array.isArray(userInput)) {
      return [new SystemMessage(systemPrompt), ...userInput];
    }
    return [new SystemMessage(systemPrompt), new HumanMessage(userInput)];
  }

  /**
   * Pre-execution hook that runs before executing the agent
   */
  protected async preExecute(request: AgentRequest): Promise<void> {
    // Default implementation does nothing
    // Child classes can override this to add custom logic
  }

  /**
   * Post-execution hook that runs after executing the agent
   */
  protected async postExecute(
    request: AgentRequest,
    response: AgentResponse,
    executionTimeMs: number,
  ): Promise<void> {
    // Default implementation does nothing
    // Child classes can override this to add custom logic
  }

  /**
   * Handle errors that occur during execution
   */
  protected async handleError(
    error: Error,
    request: AgentRequest,
  ): Promise<AgentResponse> {
    this.logger.error(`Error executing agent: ${error.message}`, {
      stack: error.stack,
      request,
    });

    // Increment error count in state
    this.state.errorCount += 1;

    // Update error rate in metrics
    // Use max of 1 for totalExecutions to avoid division by zero
    const totalExecutions = Math.max(1, this.metrics.totalExecutions);
    this.metrics.errorRate = this.state.errorCount / totalExecutions;

    return {
      output: `Error: ${error.message}`,
      success: false,
      metrics: {
        executionTimeMs: 0,
      },
    };
  }

  /**
   * Execute the agent with the given request
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Update the execution count in the state
      this.setState({
        status: AgentStatus.EXECUTING,
        executionCount: this.state.executionCount + 1,
      });

      // Pre-execution hook
      await this.preExecute(request);

      // Execute agent-specific logic
      const response = await this.executeInternal(request);

      this.setState({ status: AgentStatus.READY });

      const metrics = this.processMetrics(
        startTime,
        response.metrics?.tokensUsed,
        response.metrics?.stepCount,
      );

      // Merge metrics with response
      const finalResponse: AgentResponse = {
        ...response,
        metrics: {
          ...response.metrics,
          ...metrics,
        },
      };

      const executionTimeMs =
        metrics?.executionTimeMs || Date.now() - startTime;

      // Post-execution hook
      await this.postExecute(request, finalResponse, executionTimeMs);

      return finalResponse;
    } catch (error) {
      // Handle errors
      this.setState({ status: AgentStatus.ERROR });
      return this.handleError(
        error instanceof Error ? error : new Error(String(error)),
        request,
      );
    }
  }

  /**
   * Internal execution logic for the agent
   * Child classes must implement this method
   */
  public abstract executeInternal(
    request: AgentRequest,
  ): Promise<AgentResponse>;
}
