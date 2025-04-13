import { BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Message configuration for language model requests
 */
export interface MessageConfig {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Stream handler for streaming responses from language models
 */
export interface StreamHandler {
  onToken: (token: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: Error) => void;
}

/**
 * Model response interface
 */
export interface ModelResponse {
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  metadata?: Record<string, any>;
}

/**
 * Interface for language model adapters
 * Provides standardized access to various language model providers
 */
export interface LanguageModelAdapter {
  /**
   * Initialize the language model adapter
   */
  initialize(): Promise<void>;

  /**
   * Generate a response using the language model
   * @param messages Array of messages for the conversation
   * @param options Additional model options
   */
  generateResponse(
    messages: BaseMessage[] | MessageConfig[],
    options?: Record<string, any>,
  ): Promise<ModelResponse>;

  /**
   * Generate a response with streaming
   * @param messages Array of messages for the conversation
   * @param streamHandler Handler for streaming responses
   * @param options Additional model options
   */
  generateStreamingResponse(
    messages: BaseMessage[] | MessageConfig[],
    streamHandler: StreamHandler,
    options?: Record<string, any>,
  ): Promise<void>;

  /**
   * Generate embeddings for text
   * @param text Text to generate embeddings for
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts
   * @param texts Array of texts to generate embeddings for
   */
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;

  /**
   * Create a prompt template
   * @param systemTemplate System message template
   * @param humanTemplate Human message template
   * @param inputVariables Variables to use in the template
   */
  createPromptTemplate(
    systemTemplate: string,
    humanTemplate: string,
    inputVariables?: string[],
  ): ChatPromptTemplate;

  /**
   * Format a prompt template with variable values
   * @param template Prompt template
   * @param variables Variable values
   */
  formatPromptTemplate(
    template: ChatPromptTemplate,
    variables: Record<string, any>,
  ): Promise<BaseMessage[]>;
}
