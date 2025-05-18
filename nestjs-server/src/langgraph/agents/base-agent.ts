import { Logger, Inject, forwardRef } from '@nestjs/common';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { LlmService, LLMOptions } from '../llm/llm.service';
import { v4 as uuidv4 } from 'uuid';
import { AgentEventService } from '../visualization/agent-event.service';

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  llmOptions?: LLMOptions;
}

export class BaseAgent {
  protected readonly logger: Logger;
  protected readonly name: string;
  protected readonly systemPrompt: string;
  protected readonly llmOptions: LLMOptions;
  protected readonly agentEventService?: AgentEventService;

  constructor(
    protected readonly llmService: LlmService,
    config: AgentConfig,
    @Inject(forwardRef(() => AgentEventService))
    agentEventService?: AgentEventService,
  ) {
    this.name = config.name;
    this.systemPrompt = config.systemPrompt;
    this.llmOptions = config.llmOptions || {};
    this.logger = new Logger(`Agent:${this.name}`);
    this.agentEventService = agentEventService;
  }

  /**
   * Generate a unique ID for this agent instance
   */
  protected generateAgentId(): string {
    return `${this.name.toLowerCase().replace(/\s+/g, '-')}-${uuidv4().substring(0, 8)}`;
  }

  /**
   * Get a chat model instance for this agent
   */
  protected getChatModel(): BaseChatModel {
    return this.llmService.getChatModel(this.llmOptions);
  }

  /**
   * Process a user message
   */
  async processMessage(message: string, sessionId?: string, parentAgentId?: string): Promise<string> {
    const agentId = this.generateAgentId();
    const startTime = Date.now();

    // Emit agent.started event
    if (this.agentEventService) {
      this.agentEventService.emitAgentEvent('started', {
        agentId,
        agentType: this.name,
        sessionId: sessionId || 'unknown',
        parentAgentId,
        input: { message },
        timestamp: startTime,
      });
    }

    try {
      const model = this.getChatModel();
      const messages: BaseMessage[] = [
        new SystemMessage(this.systemPrompt),
        new HumanMessage(message),
      ];

      this.logger.debug(`Processing message with ${this.name} agent`);
      const response = await model.invoke(messages);
      const result = response.content.toString();

      // Emit agent.completed event
      if (this.agentEventService) {
        this.agentEventService.emitAgentEvent('completed', {
          agentId,
          agentType: this.name,
          sessionId: sessionId || 'unknown',
          parentAgentId,
          duration: Date.now() - startTime,
          output: { result },
          timestamp: Date.now(),
        });
      }

      return result;
    } catch (error) {
      // Emit agent.error event
      if (this.agentEventService) {
        this.agentEventService.emitAgentEvent('error', {
          agentId,
          agentType: this.name,
          sessionId: sessionId || 'unknown',
          parentAgentId,
          error: error.message,
          stack: error.stack,
          timestamp: Date.now(),
        });
      }

      this.logger.error(`Error processing message with ${this.name} agent: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process multiple messages
   */
  async processMessages(messages: BaseMessage[], sessionId?: string, parentAgentId?: string): Promise<BaseMessage> {
    const agentId = this.generateAgentId();
    const startTime = Date.now();

    // Emit agent.started event
    if (this.agentEventService) {
      this.agentEventService.emitAgentEvent('started', {
        agentId,
        agentType: this.name,
        sessionId: sessionId || 'unknown',
        parentAgentId,
        input: { 
          messageCount: messages.length,
          // Safely serialize messages without relying on private properties
          messageContent: messages.map(m => m.content.toString()) 
        },
        timestamp: startTime,
      });
    }

    try {
      const model = this.getChatModel();
      const fullMessages: BaseMessage[] = [
        new SystemMessage(this.systemPrompt),
        ...messages,
      ];

      this.logger.debug(
        `Processing ${messages.length} messages with ${this.name} agent`,
      );
      const response = await model.invoke(fullMessages);

      // Emit agent.completed event
      if (this.agentEventService) {
        this.agentEventService.emitAgentEvent('completed', {
          agentId,
          agentType: this.name,
          sessionId: sessionId || 'unknown',
          parentAgentId,
          duration: Date.now() - startTime,
          output: { 
            responseContent: response.content.toString() 
          },
          timestamp: Date.now(),
        });
      }

      return response;
    } catch (error) {
      // Emit agent.error event
      if (this.agentEventService) {
        this.agentEventService.emitAgentEvent('error', {
          agentId,
          agentType: this.name,
          sessionId: sessionId || 'unknown',
          parentAgentId,
          error: error.message,
          stack: error.stack,
          timestamp: Date.now(),
        });
      }

      this.logger.error(`Error processing messages with ${this.name} agent: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process a state object (for use in LangGraph nodes)
   */
  async processState(state: any): Promise<any> {
    const agentId = this.generateAgentId();
    const startTime = Date.now();
    const sessionId = state.sessionId || 'unknown';

    // Emit agent.processState.started event
    if (this.agentEventService) {
      this.agentEventService.emitAgentEvent('processState.started', {
        agentId,
        agentType: this.name,
        sessionId,
        parentAgentId: state.parentAgentId,
        input: state,
        timestamp: startTime,
      });
    }

    try {
      // Base implementation - should be overridden by subclasses
      this.logger.warn(
        `BaseAgent.processState called on ${this.name} - should be overridden`,
      );

      let result = state;
      if (state.messages && state.messages.length) {
        const lastMessage = state.messages[state.messages.length - 1];
        const response = await this.processMessage(
          lastMessage.content, 
          sessionId, 
          agentId
        );

        result = {
          messages: [
            ...state.messages,
            {
              role: 'assistant',
              content: response,
              name: this.name,
            },
          ],
        };
      }

      // Emit agent.processState.completed event
      if (this.agentEventService) {
        this.agentEventService.emitAgentEvent('processState.completed', {
          agentId,
          agentType: this.name,
          sessionId,
          parentAgentId: state.parentAgentId,
          duration: Date.now() - startTime,
          output: result,
          timestamp: Date.now(),
        });
      }

      return result;
    } catch (error) {
      // Emit agent.processState.error event
      if (this.agentEventService) {
        this.agentEventService.emitAgentEvent('processState.error', {
          agentId,
          agentType: this.name,
          sessionId,
          parentAgentId: state.parentAgentId,
          error: error.message,
          stack: error.stack,
          timestamp: Date.now(),
        });
      }

      this.logger.error(`Error in processState with ${this.name} agent: ${error.message}`);
      throw error;
    }
  }
}
