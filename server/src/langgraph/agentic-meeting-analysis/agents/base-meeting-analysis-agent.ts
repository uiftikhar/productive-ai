/**
 * Base agent implementation for the Agentic Meeting Analysis System
 */
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  IMeetingAnalysisAgent,
  AgentExpertise,
  AnalysisGoalType,
  AnalysisTask,
  AgentOutput,
  ConfidenceLevel,
  AgentMessage,
  MessageType,
} from '../interfaces/agent.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  HumanMessage,
  AIMessage,
} from '@langchain/core/messages';

/**
 * Configuration options for BaseMeetingAnalysisAgent
 */
export interface BaseMeetingAnalysisAgentConfig {
  id?: string;
  name: string;
  expertise: AgentExpertise[];
  capabilities: AnalysisGoalType[];
  logger?: Logger;
  llm?: ChatOpenAI;
  systemPrompt?: string;
}

/**
 * Base implementation of a meeting analysis agent
 */
export class BaseMeetingAnalysisAgent
  extends EventEmitter
  implements IMeetingAnalysisAgent
{
  // Core agent properties
  public id: string;
  public name: string;
  public expertise: AgentExpertise[];
  public capabilities: Set<AnalysisGoalType>;

  // Services and utilities
  protected logger: Logger;
  protected llm: ChatOpenAI;
  protected systemPrompt: string;
  protected messageHistory: AgentMessage[] = [];
  protected memoryCache: Map<string, any> = new Map();
  protected memorySubscriptions: Map<string, ((value: any) => void)[]> =
    new Map();

  /**
   * Create a new meeting analysis agent
   */
  constructor(config: BaseMeetingAnalysisAgentConfig) {
    super();

    this.id = config.id || `agent-${uuidv4()}`;
    this.name = config.name;
    this.expertise = config.expertise;
    this.capabilities = new Set(config.capabilities);

    this.logger = config.logger || new ConsoleLogger();

    // Initialize LLM if provided or use default
    this.llm =
      config.llm ||
      new ChatOpenAI({
        modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4o',
        temperature: 0.2,
      });

    this.systemPrompt = config.systemPrompt || this.getDefaultSystemPrompt();

    this.logger.info(`Initialized ${this.name} agent with ID: ${this.id}`);
  }

  /**
   * Initialize the agent
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    try {
      this.logger.info(`Initializing ${this.name} agent...`);

      // Additional initialization can be implemented in subclasses

      this.logger.info(`Successfully initialized ${this.name} agent`);
    } catch (error) {
      this.logger.error(
        `Error initializing ${this.name} agent: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Process a task assigned to this agent
   */
  async processTask(task: AnalysisTask): Promise<AgentOutput> {
    try {
      this.logger.info(
        `Agent ${this.name} processing task: ${task.id} (${task.type})`,
      );

      // Validation
      if (!this.capabilities.has(task.type)) {
        throw new Error(
          `Agent ${this.name} does not have capability to handle task type: ${task.type}`,
        );
      }

      // This is a base implementation that should be overridden by specialized agents
      const response = await this.callLLM(
        `Process the following ${task.type} task for meeting analysis:`,
        JSON.stringify(task.input, null, 2),
      );

      // Generate output with confidence assessment
      const content = this.parseAgentResponse(response);
      const confidence = await this.assessConfidence(content);
      const reasoning = await this.explainReasoning(content);

      const output: AgentOutput = {
        content,
        confidence,
        reasoning,
        metadata: {
          taskId: task.id,
          taskType: task.type,
          agentId: this.id,
          agentName: this.name,
          expertise: this.expertise,
        },
        timestamp: Date.now(),
      };

      this.logger.info(
        `Agent ${this.name} completed task ${task.id} with confidence: ${confidence}`,
      );

      return output;
    } catch (error) {
      this.logger.error(
        `Error processing task ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Send a message to other agents
   */
  async sendMessage(message: AgentMessage): Promise<void> {
    try {
      this.logger.debug(`Agent ${this.name} sending message: ${message.id}`);

      // Store in message history
      this.messageHistory.push(message);

      // Emit an event for the message bus to pick up
      this.emit('message', message);

      this.logger.debug(`Message ${message.id} sent successfully`);
    } catch (error) {
      this.logger.error(
        `Error sending message: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Receive a message from other agents
   */
  async receiveMessage(message: AgentMessage): Promise<void> {
    try {
      this.logger.debug(
        `Agent ${this.name} received message: ${message.id} from ${message.sender}`,
      );

      // Store in message history
      this.messageHistory.push(message);

      // Process the message based on type
      switch (message.type) {
        case MessageType.REQUEST:
          // Handle request - should be implemented by subclasses
          this.emit('request', message);
          break;

        case MessageType.RESPONSE:
          // Handle response - should be implemented by subclasses
          this.emit('response', message);
          break;

        case MessageType.NOTIFICATION:
          // Handle notification - should be implemented by subclasses
          this.emit('notification', message);
          break;

        case MessageType.UPDATE:
          // Handle update - should be implemented by subclasses
          this.emit('update', message);
          break;

        case MessageType.QUERY:
          // Handle query - should be implemented by subclasses
          this.emit('query', message);
          break;

        default:
          this.logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.logger.error(
        `Error receiving message: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Read from shared memory
   */
  async readMemory(key: string, namespace: string = 'default'): Promise<any> {
    const fullKey = `${namespace}:${key}`;

    // First check local cache
    if (this.memoryCache.has(fullKey)) {
      return this.memoryCache.get(fullKey);
    }

    // This should be implemented to use a shared memory service
    this.logger.warn(
      'Memory service not implemented - using local memory cache only',
    );
    return null;
  }

  /**
   * Write to shared memory
   */
  async writeMemory(
    key: string,
    value: any,
    namespace: string = 'default',
  ): Promise<void> {
    const fullKey = `${namespace}:${key}`;

    // Update local cache
    this.memoryCache.set(fullKey, value);

    // Notify subscribers
    if (this.memorySubscriptions.has(fullKey)) {
      const callbacks = this.memorySubscriptions.get(fullKey) || [];
      for (const callback of callbacks) {
        try {
          callback(value);
        } catch (error) {
          this.logger.error(
            `Error in memory subscription callback: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    // This should be implemented to use a shared memory service
    this.logger.warn(
      'Memory service not implemented - using local memory cache only',
    );
  }

  /**
   * Subscribe to memory changes
   */
  subscribeToMemory(
    key: string,
    callback: (value: any) => void,
    namespace: string = 'default',
  ): void {
    const fullKey = `${namespace}:${key}`;

    if (!this.memorySubscriptions.has(fullKey)) {
      this.memorySubscriptions.set(fullKey, []);
    }

    const callbacks = this.memorySubscriptions.get(fullKey) || [];
    callbacks.push(callback);
    this.memorySubscriptions.set(fullKey, callbacks);
  }

  /**
   * Request assistance from another agent
   */
  async requestAssistance(
    taskId: string,
    requestedExpertise: AgentExpertise,
  ): Promise<void> {
    const message: AgentMessage = {
      id: `assist-req-${uuidv4()}`,
      type: MessageType.REQUEST,
      sender: this.id,
      recipients: 'broadcast', // This will be filtered by expertise by the communication service
      content: {
        taskId,
        requestedExpertise,
        message: `Agent ${this.name} requests assistance with expertise in ${requestedExpertise} for task ${taskId}`,
      },
      timestamp: Date.now(),
    };

    await this.sendMessage(message);
  }

  /**
   * Provide assistance to another agent
   */
  async provideAssistance(
    taskId: string,
    contribution: AgentOutput,
  ): Promise<void> {
    const message: AgentMessage = {
      id: `assist-resp-${uuidv4()}`,
      type: MessageType.RESPONSE,
      sender: this.id,
      recipients: ['coordinator'], // The coordinator should route this appropriately
      content: {
        taskId,
        expertise: this.expertise,
        contribution,
      },
      timestamp: Date.now(),
    };

    await this.sendMessage(message);
  }

  /**
   * Assess confidence in an output
   */
  async assessConfidence(output: any): Promise<ConfidenceLevel> {
    try {
      // Simple implementation - should be overridden by subclasses for more sophisticated assessment

      const response = await this.callLLM(
        `Assess your confidence in the following output. Respond with ONLY one of these confidence levels: "${ConfidenceLevel.HIGH}", "${ConfidenceLevel.MEDIUM}", "${ConfidenceLevel.LOW}", or "${ConfidenceLevel.UNCERTAIN}".`,
        JSON.stringify(output, null, 2),
      );

      const confidenceText = response.trim().toUpperCase();

      if (confidenceText.includes(ConfidenceLevel.HIGH.toUpperCase())) {
        return ConfidenceLevel.HIGH;
      } else if (
        confidenceText.includes(ConfidenceLevel.MEDIUM.toUpperCase())
      ) {
        return ConfidenceLevel.MEDIUM;
      } else if (confidenceText.includes(ConfidenceLevel.LOW.toUpperCase())) {
        return ConfidenceLevel.LOW;
      } else {
        return ConfidenceLevel.UNCERTAIN;
      }
    } catch (error) {
      this.logger.error(
        `Error assessing confidence: ${error instanceof Error ? error.message : String(error)}`,
      );
      return ConfidenceLevel.UNCERTAIN;
    }
  }

  /**
   * Explain reasoning for an output
   */
  async explainReasoning(output: any): Promise<string> {
    try {
      const response = await this.callLLM(
        `Explain your reasoning for the following output in a concise paragraph:`,
        JSON.stringify(output, null, 2),
      );

      return response.trim();
    } catch (error) {
      this.logger.error(
        `Error explaining reasoning: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'Unable to explain reasoning due to an error.';
    }
  }

  /**
   * Create a standard format agent message
   */
  protected createMessage(
    type: MessageType,
    recipients: string[] | 'broadcast',
    content: any,
    replyTo?: string,
  ): AgentMessage {
    return {
      id: `msg-${uuidv4()}`,
      type,
      sender: this.id,
      recipients,
      content,
      replyTo,
      timestamp: Date.now(),
    };
  }

  /**
   * Helper to call the LLM
   */
  protected async callLLM(
    instruction: string,
    content: string,
  ): Promise<string> {
    try {
      const messages: BaseMessage[] = [
        new SystemMessage(this.systemPrompt),
        new HumanMessage(`${instruction}\n\n${content}`),
      ];

      const response = await this.llm.invoke(messages);
      return response.content as string;
    } catch (error) {
      this.logger.error(
        `Error calling LLM: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Parse response from LLM
   */
  protected parseAgentResponse(response: string): any {
    try {
      // Try to parse as JSON if it looks like JSON
      if (response.trim().startsWith('{') && response.trim().endsWith('}')) {
        return JSON.parse(response);
      }

      // Otherwise return as string
      return response;
    } catch (error) {
      // If parsing fails, return the raw string
      return response;
    }
  }

  /**
   * Get default system prompt
   */
  protected getDefaultSystemPrompt(): string {
    return `You are ${this.name}, an AI agent specialized in ${this.expertise.join(', ')} for meeting analysis.
Your job is to analyze meeting transcripts and provide valuable insights.
You should be thorough, objective, and focus on extracting the most important information.
Always provide your confidence level in your analysis.

Your capabilities include:
${Array.from(this.capabilities)
  .map((capability) => `- ${capability.replace('_', ' ')}`)
  .join('\n')}

Respond in clear, structured formats as requested.`;
  }
}
