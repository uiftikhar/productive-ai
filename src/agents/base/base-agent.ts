// src/agents/base/base-agent.ts

import { v4 as uuidv4 } from 'uuid';

import { ChatOpenAI } from '@langchain/openai';
import { LangChainConfig } from '../../langchain/config.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { AgentInterface, AgentCapability, AgentResponse, AgentRequest } from '../interfaces/agent.interface.ts';

/**
 * Abstract base agent class that provides common functionality for all agents
 */
export abstract class BaseAgent implements AgentInterface {
  readonly id: string;

  protected logger: Logger;
  protected llm: ChatOpenAI;
  protected capabilities: Map<string, AgentCapability> = new Map();
  protected isInitialized: boolean = false;

  constructor(
    readonly name: string,
    readonly description: string,
    options: {
      id?: string;
      logger?: Logger;
      llm?: ChatOpenAI;
    } = {}
  ) {
    this.id = options.id || uuidv4();
    this.logger = options.logger || new ConsoleLogger();

    // Initialize LLM with default configuration
    this.llm = options.llm || new ChatOpenAI({
      modelName: LangChainConfig.llm.model,
      temperature: LangChainConfig.llm.temperature,
      maxTokens: LangChainConfig.llm.maxTokens
    });

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
    this.isInitialized = true;
  }

  /**
   * Process agent execution metrics
   */
  protected processMetrics(
    startTime: number,
    tokenUsage?: number,
    steps?: number
  ): Partial<AgentResponse['metrics']> {
    const executionTimeMs = Date.now() - startTime;
    return {
      executionTimeMs,
      tokensUsed: tokenUsage,
      stepCount: steps
    };
  }

  /**
   * Execute the agent with the given request
   * Child classes must implement this
   */
  abstract execute(request: AgentRequest): Promise<AgentResponse>;
}