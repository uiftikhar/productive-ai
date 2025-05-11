import { ChatOpenAI, ChatOpenAICallOptions } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import {
  ChatPromptTemplate,
  HumanMessagePromptTemplate,
  SystemMessagePromptTemplate,
} from '@langchain/core/prompts';
import { LangChainConfig } from '../langchain/config';
import { Logger } from '../shared/logger/logger.interface';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { ResourceManager } from '../shared/utils/resource-manager';
import { LanguageModelProvider, MessageConfig, ModelResponse, StreamHandler } from './language-model-provider.interface';

/**
 * Model configuration for OpenAI API calls
 */
export interface OpenAIModelConfig {
  model: string;
  temperature: number;
  maxTokens?: number;
  streaming?: boolean;
  responseFormat?: {
    type: 'json_object' | 'json_array' | 'text';
  };
}

/**
 * Embedding configuration for OpenAI API calls
 */
export interface EmbeddingConfig {
  model: string;
}

/**
 * Token usage statistics
 */
export interface TokenUsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  lastUpdated: number;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
}

/**
 * Circuit breaker states
 */
enum CircuitBreakerState {
  CLOSED,   // Normal operation
  OPEN,     // Failing, don't allow requests
  HALF_OPEN // Testing if system is back to normal
}

/**
 * OpenAI connector for the agent framework
 * Provides a simplified interface for OpenAI API interactions
 */
export class OpenAIConnector implements LanguageModelProvider {
  private chatModel: ChatOpenAI;
  private embeddings: OpenAIEmbeddings;
  private logger: Logger;
  private resourceManager?: ResourceManager;
  
  // Token usage tracking
  private tokenUsage: TokenUsageStats = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    lastUpdated: Date.now(),
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0
  };
  
  // Circuit breaker pattern
  private circuitBreakerState: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private circuitBreakerThreshold: number = 5; // Number of failures before opening circuit
  private circuitRecoveryTimeout: number = 30000; // Time before trying to close circuit (ms)
  private lastFailureTime: number = 0;
  private maxConsecutiveFailures: number = 3;

  constructor(
    options: {
      modelConfig?: Partial<OpenAIModelConfig>;
      embeddingConfig?: Partial<EmbeddingConfig>;
      logger?: Logger;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.resourceManager = ResourceManager.getInstance(this.logger);

    // Register the cleanup method with the ResourceManager
    this.resourceManager.register('OpenAIConnector', () => this.cleanup(), {
      priority: 40,
      description: 'Cleanup OpenAI connector resources',
    });

    const modelConfig: OpenAIModelConfig = {
      model: options.modelConfig?.model || LangChainConfig.llm.model,
      temperature:
        options.modelConfig?.temperature ?? LangChainConfig.llm.temperature,
      maxTokens:
        options.modelConfig?.maxTokens || LangChainConfig.llm.maxTokens,
      streaming:
        options.modelConfig?.streaming ?? LangChainConfig.llm.streaming,
    };

    this.chatModel = new ChatOpenAI({
      modelName: modelConfig.model,
      temperature: modelConfig.temperature,
      maxTokens: modelConfig.maxTokens,
      streaming: modelConfig.streaming,
    });

    const embeddingConfig: EmbeddingConfig = {
      model: options.embeddingConfig?.model || LangChainConfig.embeddings.model,
    };

    this.embeddings = new OpenAIEmbeddings({
      model: embeddingConfig.model,
    });
    
    // Log successful initialization
    this.logger.info(`OpenAIConnector initialized with model: ${modelConfig.model}, embedding model: ${embeddingConfig.model}`);
  }

  /**
   * Initialize the OpenAI adapter
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing OpenAIConnector');
    // No initialization needed for OpenAI models
  }

  /**
   * Create message objects from message configs
   */
  private createMessages(messages: MessageConfig[]): BaseMessage[] {
    return messages.map((msg) => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        default:
          throw new Error(`Unknown message role: ${msg.role}`);
      }
    });
  }

  /**
   * Check if the circuit breaker allows requests
   * @returns True if requests are allowed, false otherwise
   */
  private canMakeRequest(): boolean {
    const now = Date.now();
    
    // If circuit is OPEN, check if we should go to HALF_OPEN
    if (this.circuitBreakerState === CircuitBreakerState.OPEN) {
      if (now - this.lastFailureTime > this.circuitRecoveryTimeout) {
        this.logger.info('Circuit breaker transitioning from OPEN to HALF_OPEN');
        this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
      } else {
        return false; // Circuit is OPEN, don't allow requests
      }
    }
    
    return true;
  }
  
  /**
   * Handle successful request in circuit breaker
   */
  private handleSuccess(): void {
    if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      this.logger.info('Circuit breaker transitioning from HALF_OPEN to CLOSED');
      this.circuitBreakerState = CircuitBreakerState.CLOSED;
    }
    
    this.failureCount = 0;
    this.tokenUsage.successfulCalls++;
  }
  
  /**
   * Handle failed request in circuit breaker
   */
  private handleFailure(error: any): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.tokenUsage.failedCalls++;
    
    // If we've reached the threshold in CLOSED state, open the circuit
    if (this.circuitBreakerState === CircuitBreakerState.CLOSED && 
        this.failureCount >= this.circuitBreakerThreshold) {
      this.logger.warn(`Circuit breaker opening after ${this.failureCount} failures`, {
        lastError: error instanceof Error ? error.message : String(error)
      });
      this.circuitBreakerState = CircuitBreakerState.OPEN;
    }
    
    // If we failed in HALF_OPEN state, go back to OPEN
    if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      this.logger.warn('Circuit breaker transitioning from HALF_OPEN back to OPEN');
      this.circuitBreakerState = CircuitBreakerState.OPEN;
    }
  }

  /**
   * Generate a response using the language model
   * @param messages Array of messages for the conversation
   * @param options Additional model options
   */
  async generateResponse(
    messages: BaseMessage[] | MessageConfig[],
    options?: Partial<OpenAIModelConfig>,
  ): Promise<ModelResponse> {
    // Check if circuit breaker allows requests
    if (!this.canMakeRequest()) {
      throw new Error('OpenAI service temporarily unavailable (circuit breaker open)');
    }
    
    this.tokenUsage.totalCalls++;
    
    try {
      const modelMessages =
        Array.isArray(messages) && messages.length > 0 && 'role' in messages[0]
          ? this.createMessages(messages as MessageConfig[])
          : (messages as BaseMessage[]);

      // Check if response format is specified in messages
      let responseFormat = options?.responseFormat;
      if (
        !responseFormat &&
        Array.isArray(messages) &&
        messages.length > 0 &&
        'responseFormat' in messages[0]
      ) {
        responseFormat = (messages[0] as MessageConfig).responseFormat;
      }

      this.logger.debug('Preparing OpenAI request', {
        messageCount: modelMessages.length,
        responseFormat: responseFormat?.type || 'text'
      });

      let model = this.chatModel;
      if (options || responseFormat) {
        const modelOptions: any = {
          modelName: options?.model || this.chatModel.modelName,
          temperature: options?.temperature ?? this.chatModel.temperature,
          maxTokens: options?.maxTokens || this.chatModel.maxTokens,
          streaming: options?.streaming ?? this.chatModel.streaming,
        };

        if (responseFormat) {
          modelOptions.responseFormat = responseFormat;
        }

        model = new ChatOpenAI(modelOptions);
      }

      const response = await model.invoke(modelMessages);
      
      // Update token usage if available
      // Use type assertion since LangChain's types don't include usage but the runtime objects do
      const responseWithUsage = response as any;
      if (responseWithUsage.usage) {
        this.tokenUsage.promptTokens += responseWithUsage.usage.promptTokens || 0;
        this.tokenUsage.completionTokens += responseWithUsage.usage.completionTokens || 0;
        this.tokenUsage.totalTokens += responseWithUsage.usage.totalTokens || 0;
        this.tokenUsage.lastUpdated = Date.now();
      } else {
        // Estimate tokens if not provided
        const tokenEstimate = this.estimateTokenUsage(modelMessages, response.content.toString());
        this.tokenUsage.promptTokens += tokenEstimate.promptTokens;
        this.tokenUsage.completionTokens += tokenEstimate.completionTokens;
        this.tokenUsage.totalTokens += tokenEstimate.totalTokens;
        this.tokenUsage.lastUpdated = Date.now();
      }
      
      // Handle success in circuit breaker
      this.handleSuccess();
      
      return {
        content: response.content.toString(),
        metadata: {
          model: model.modelName,
          temperature: model.temperature,
          responseFormat: responseFormat?.type,
        },
      };
    } catch (error) {
      // Handle failure in circuit breaker
      this.handleFailure(error);
      
      this.logger.error('Error generating response', {
        error: error instanceof Error ? error.message : String(error),
        circuitBreakerState: CircuitBreakerState[this.circuitBreakerState],
        failureCount: this.failureCount
      });
      throw error;
    }
  }
  
  /**
   * Estimate token usage for a conversation
   */
  private estimateTokenUsage(messages: BaseMessage[], response: string): { 
    promptTokens: number;
    completionTokens: number;
    totalTokens: number; 
  } {
    // Rough heuristic estimation: ~4 chars per token
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);
    
    const promptTokens = messages.reduce((total, msg) => {
      return total + estimateTokens(msg.content.toString());
    }, 0);
    
    const completionTokens = estimateTokens(response);
    
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    };
  }

  /**
   * Generate a streaming response
   * @param messages Array of messages for the conversation
   * @param streamHandler Handler for streaming responses
   * @param options Additional model options
   */
  async generateStreamingResponse(
    messages: BaseMessage[] | MessageConfig[],
    streamHandler: StreamHandler,
    options?: Partial<OpenAIModelConfig>,
  ): Promise<void> {
    // Check if circuit breaker allows requests
    if (!this.canMakeRequest()) {
      throw new Error('OpenAI service temporarily unavailable (circuit breaker open)');
    }
    
    this.tokenUsage.totalCalls++;
    
    try {
      const modelMessages =
        Array.isArray(messages) && messages.length > 0 && 'role' in messages[0]
          ? this.createMessages(messages as MessageConfig[])
          : (messages as BaseMessage[]);

      // Ensure streaming is enabled
      const streamingModel = new ChatOpenAI({
        modelName: options?.model || this.chatModel.modelName,
        temperature: options?.temperature ?? this.chatModel.temperature,
        maxTokens: options?.maxTokens || this.chatModel.maxTokens,
        streaming: true, // Force streaming to be enabled
        callbacks: [
          {
            handleLLMNewToken(token: string) {
              streamHandler.onToken(token);
            },
          },
        ],
      });

      let responseFormat = options?.responseFormat;
      if (responseFormat) {
        // @ts-expect-error - responseFormat is not in types
        streamingModel.responseFormat = responseFormat;
      }

      // Start tracking estimated token usage
      const startTime = Date.now();
      const promptText = modelMessages.map(m => m.content.toString()).join(' ');
      const estimatedPromptTokens = Math.ceil(promptText.length / 4);
      
      // Call the streaming model
      const response = await streamingModel.invoke(modelMessages);
      streamHandler.onComplete(response.content.toString());
      
      // Estimate token usage for streaming case
      const responseText = response.content.toString();
      const estimatedCompletionTokens = Math.ceil(responseText.length / 4);
      
      // Update token usage estimates
      this.tokenUsage.promptTokens += estimatedPromptTokens;
      this.tokenUsage.completionTokens += estimatedCompletionTokens;
      this.tokenUsage.totalTokens += (estimatedPromptTokens + estimatedCompletionTokens);
      this.tokenUsage.lastUpdated = Date.now();
      
      // Handle success in circuit breaker
      this.handleSuccess();
    } catch (error) {
      // Handle failure in circuit breaker
      this.handleFailure(error);
      
      this.logger.error('Error in streaming response', {
        error: error instanceof Error ? error.message : String(error),
      });
      streamHandler.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate a chat completion response
   * Simplified interface for chat completions
   */
  async generateChatCompletion(
    messages: MessageConfig[],
    options?: Partial<OpenAIModelConfig>,
  ): Promise<string> {
    const response = await this.generateResponse(messages, options);
    return response.content;
  }

  /**
   * Generate a streaming chat completion
   * Simplified interface for streaming
   */
  async generateChatCompletionStream(
    messages: MessageConfig[],
    streamHandler: StreamHandler,
    options?: Partial<OpenAIModelConfig>,
  ): Promise<void> {
    await this.generateStreamingResponse(messages, streamHandler, options);
  }

  /**
   * Generate an embedding for a text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.canMakeRequest()) {
      throw new Error('OpenAI service temporarily unavailable (circuit breaker open)');
    }
    
    try {
      const embeddings = await this.embeddings.embedQuery(text);
      this.handleSuccess();
      return embeddings;
    } catch (error) {
      this.handleFailure(error);
      this.logger.error('Error generating embedding', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate embeddings for a text
   * Legacy method for backward compatibility
   */
  async generateEmbeddings(text: string): Promise<number[]> {
    return this.generateEmbedding(text);
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.canMakeRequest()) {
      throw new Error('OpenAI service temporarily unavailable (circuit breaker open)');
    }
    
    try {
      const results = await this.embeddings.embedDocuments(texts);
      this.handleSuccess();
      return results;
    } catch (error) {
      this.handleFailure(error);
      this.logger.error('Error generating batch embeddings', {
        error: error instanceof Error ? error.message : String(error),
        textCount: texts.length
      });
      throw error;
    }
  }

  /**
   * Create a prompt template
   */
  createPromptTemplate(
    systemTemplate: string,
    humanTemplate: string,
    inputVariables: string[] = [],
  ): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(systemTemplate),
      HumanMessagePromptTemplate.fromTemplate(humanTemplate),
    ]);
  }

  /**
   * Format a prompt template with variables
   */
  async formatPromptTemplate(
    template: ChatPromptTemplate,
    variables: Record<string, any>,
  ): Promise<BaseMessage[]> {
    return template.formatMessages(variables);
  }
  
  /**
   * Get token usage statistics
   */
  getTokenUsage(): TokenUsageStats {
    return { ...this.tokenUsage };
  }
  
  /**
   * Reset token usage statistics
   */
  resetTokenUsage(): void {
    this.tokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      lastUpdated: Date.now(),
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0
    };
  }
  
  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): {
    state: string;
    failureCount: number;
    lastFailureTime: number | null;
  } {
    return {
      state: CircuitBreakerState[this.circuitBreakerState],
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime > 0 ? this.lastFailureTime : null
    };
  }
  
  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreakerState = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.logger.info('Circuit breaker manually reset to CLOSED state');
  }

  /**
   * Clean up any resources
   */
  public cleanup(): void {
    // Nothing to clean up for OpenAI connector
    this.logger.debug('OpenAI connector cleanup called');
  }
}
