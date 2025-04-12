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
import { LangChainConfig } from '../../langchain/config.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';

/**
 * Model configuration for OpenAI API calls
 */
export interface OpenAIModelConfig {
  model: string;
  temperature: number;
  maxTokens?: number;
  streaming?: boolean;
}

/**
 * Configuration for embeddings generation
 */
export interface EmbeddingConfig {
  model: string;
}

/**
 * Message type for OpenAI conversations
 */
export interface MessageConfig {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Stream handler for OpenAI streaming responses
 */
export interface StreamHandler {
  onToken(token: string): void;
  onComplete(fullResponse: string): void;
  onError(error: Error): void;
}

/**
 * OpenAI adapter for the agent framework
 * Provides a simplified interface for OpenAI API interactions
 */
export class OpenAIAdapter {
  private chatModel: ChatOpenAI;
  private embeddings: OpenAIEmbeddings;
  private logger: Logger;

  constructor(
    options: {
      modelConfig?: Partial<OpenAIModelConfig>;
      embeddingConfig?: Partial<EmbeddingConfig>;
      logger?: Logger;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();

    // Set up the chat model
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

    // Set up the embeddings
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
    this.logger.info('Initializing OpenAIAdapter');
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
   * Generate a chat completion
   * @param messages Array of messages for the conversation
   * @param options Additional model options
   */
  async generateChatCompletion(
    messages: MessageConfig[],
    options?: Partial<OpenAIModelConfig>,
  ): Promise<string> {
    try {
      const modelMessages = this.createMessages(messages);

      // Create a temporary model with different options if needed
      let model = this.chatModel;
      if (options) {
        model = new ChatOpenAI({
          modelName: options.model || this.chatModel.modelName,
          temperature: options.temperature ?? this.chatModel.temperature,
          maxTokens: options.maxTokens || this.chatModel.maxTokens,
          streaming: options.streaming ?? this.chatModel.streaming,
        });
      }

      const response = await model.invoke(modelMessages);
      return response.content.toString();
    } catch (error) {
      this.logger.error('Error generating chat completion', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
    try {
      const modelMessages = this.createMessages(messages);

      // Ensure streaming is enabled
      const streamingModel = new ChatOpenAI({
        modelName: options?.model || this.chatModel.modelName,
        temperature: options?.temperature ?? this.chatModel.temperature,
        maxTokens: options?.maxTokens || this.chatModel.maxTokens,
        streaming: true,
      });

      // Create callback handlers for streaming
      const callbacks = {
        handleLLMNewToken(token: string) {
          streamHandler.onToken(token);
        },
      };

      // Track the full response
      let fullResponse = '';

      // Override the token handler to build the full response
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
      this.logger.error('Error generating streaming chat completion', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
}
