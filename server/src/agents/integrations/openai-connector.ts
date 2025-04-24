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
import { LangChainConfig } from '../../langchain/config';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import {
  LanguageModelProvider,
  MessageConfig,
  StreamHandler,
  ModelResponse,
} from '../interfaces/language-model-provider.interface';
import { ResourceManager } from '../../shared/utils/resource-manager';

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
 * OpenAI connector for the agent framework
 * Provides a simplified interface for OpenAI API interactions
 */
export class OpenAIConnector implements LanguageModelProvider {
  private chatModel: ChatOpenAI;
  private embeddings: OpenAIEmbeddings;
  private logger: Logger;
  private resourceManager?: ResourceManager;

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
   * Generate a response using the language model
   * @param messages Array of messages for the conversation
   * @param options Additional model options
   */
  async generateResponse(
    messages: BaseMessage[] | MessageConfig[],
    options?: Partial<OpenAIModelConfig>,
  ): Promise<ModelResponse> {
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

      this.logger.info('********* Model Messages *********', {
        messages: modelMessages,
        responseFormat,
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
      return {
        content: response.content.toString(),
        metadata: {
          model: model.modelName,
          temperature: model.temperature,
          responseFormat: responseFormat?.type,
        },
      };
    } catch (error) {
      this.logger.error('Error generating response', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
        streaming: true,
      });

      // Track the full response
      let fullResponse = '';

      const wrappedCallbacks = {
        handleLLMNewToken(token: string) {
          fullResponse += token;
          streamHandler.onToken(token);
        },
      };

      try {
        // Stream the response
        await streamingModel.invoke(modelMessages, {
          callbacks: [wrappedCallbacks],
        } as ChatOpenAICallOptions);

        // Call the completion handler with the full response
        streamHandler.onComplete(fullResponse);
      } catch (error) {
        streamHandler.onError(
          error instanceof Error ? error : new Error(String(error)),
        );
        throw error;
      }
    } catch (error) {
      this.logger.error('Error generating streaming response', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate a chat completion
   * @param messages Array of messages for the conversation
   * @param options Additional model options
   */
  async generateChatCompletion(
    messages: MessageConfig[],
    options?: Partial<OpenAIModelConfig>,
  ): Promise<string> {
    const response = await this.generateResponse(messages, options);
    return response.content;
  }

  /**
   * Generate a chat completion with streaming
   * @param messages Array of messages for the conversation
   * @param streamHandler Handler for streaming responses
   * @param options Additional model options
   */
  async generateChatCompletionStream(
    messages: MessageConfig[],
    streamHandler: StreamHandler,
    options?: Partial<OpenAIModelConfig>,
  ): Promise<void> {
    return this.generateStreamingResponse(messages, streamHandler, options);
  }

  /**
   * Generate embeddings for text
   * @param text Text to generate embeddings for
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return this.generateEmbeddings(text);
  }

  /**
   * Generate embeddings for text
   * @param text Text to generate embeddings for
   */
  async generateEmbeddings(text: string): Promise<number[]> {
    try {
      return this.embeddings.embedQuery(text);
    } catch (error) {
      this.logger.error('Error generating embeddings', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts
   * @param texts Array of texts to generate embeddings for
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      return this.embeddings.embedDocuments(texts);
    } catch (error) {
      this.logger.error('Error generating batch embeddings', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create a prompt template
   * @param systemTemplate System message template
   * @param humanTemplate Human message template
   * @param inputVariables Variables to use in the template
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
   * Format a prompt template with variable values
   * @param template Prompt template
   * @param variables Variable values
   */
  async formatPromptTemplate(
    template: ChatPromptTemplate,
    variables: Record<string, any>,
  ): Promise<BaseMessage[]> {
    return template.formatMessages(variables);
  }

  /**
   * Cleanup method to release resources when the connector is no longer needed
   */
  public cleanup(): void {
    // Abort any ongoing requests if applicable
    // No active timers to clear in the current implementation

    this.logger.info('OpenAIConnector resources cleaned up');
  }
}
