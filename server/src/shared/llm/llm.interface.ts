import { BaseMessage } from '@langchain/core/messages';

/**
 * Interface for language models within the agent framework
 * Provides a standardized way to interact with different LLM implementations
 */
export interface LLMInterface {
  /**
   * Invoke the language model with a set of messages and return the response
   * @param messages Array of messages to send to the LLM
   * @param options Optional parameters for the LLM call
   * @returns Promise that resolves to the LLM response
   */
  invoke(
    messages: BaseMessage[],
    options?: Record<string, any>,
  ): Promise<{ content: string | object }>;

  /**
   * Stream the LLM response for a set of messages
   * @param messages Array of messages to send to the LLM
   * @param options Optional parameters for the LLM call
   * @returns AsyncIterable of token chunks
   */
  stream?(
    messages: BaseMessage[],
    options?: Record<string, any>,
  ): AsyncIterable<{ content: string }>;
}
