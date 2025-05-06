/**
 * Language Model Mock Implementation
 * 
 * This module provides a mock implementation of language model APIs
 * for use in integration tests without calling actual LLM services.
 */

import { jest } from '@jest/globals';

/**
 * Configuration for mock language model responses
 */
export interface MockLanguageModelConfig {
  /**
   * Default response for any prompt
   */
  defaultResponse?: string;
  
  /**
   * Map of specific prompts to responses
   */
  promptResponses?: Map<string, string>;
  
  /**
   * Response delay in milliseconds
   */
  responseDelay?: number;
  
  /**
   * Function to generate dynamic responses
   */
  responseGenerator?: (prompt: string, options: any) => string | Promise<string>;
}

/**
 * Creates a mock language model API implementation
 */
export function createMockLanguageModel(config: MockLanguageModelConfig = {}) {
  const {
    defaultResponse = 'This is a mock response from the language model.',
    promptResponses = new Map<string, string>(),
    responseDelay = 0,
    responseGenerator = null
  } = config;
  
  const callHistory: Array<{
    prompt: string;
    options: any;
    response: string;
    timestamp: number;
  }> = [];
  
  /**
   * Helper function to determine the response for a prompt
   */
  async function determineResponse(prompt: string, options: any): Promise<string> {
    // Use response generator if provided
    if (responseGenerator) {
      return await responseGenerator(prompt, options);
    } 
    // Use prompt-specific response if available
    if (promptResponses.has(prompt)) {
      return promptResponses.get(prompt) as string;
    } 
    // Search for partial matches in prompt responses
    const partialMatch = Array.from(promptResponses.keys()).find(key => prompt.includes(key));
    if (partialMatch) {
      return promptResponses.get(partialMatch) as string;
    }
    // Fall back to default response
    return defaultResponse;
  }
  
  // Create the mock object with mock functions
  const mockLangModel = {
    /**
     * Mock implementation of the language model completion API
     */
    complete: async function(prompt: string, options: any = {}) {
      // Add artificial delay if configured
      if (responseDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, responseDelay));
      }
      
      // Get the response
      const response = await determineResponse(prompt, options);
      
      // Record the call
      callHistory.push({
        prompt,
        options,
        response,
        timestamp: Date.now()
      });
      
      return {
        id: `mock-completion-${Math.random().toString(36).substring(2, 15)}`,
        object: 'text_completion',
        created: Math.floor(Date.now() / 1000),
        model: options.model || 'mock-model',
        choices: [
          {
            text: response,
            index: 0,
            logprobs: null,
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: prompt.length,
          completion_tokens: response.length,
          total_tokens: prompt.length + response.length
        }
      };
    },
    
    /**
     * Mock implementation of the language model chat API
     */
    chat: async function(messages: any[], options: any = {}) {
      // Add artificial delay if configured
      if (responseDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, responseDelay));
      }
      
      // Combine messages into a single prompt for lookup
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      
      // Get the response
      const response = await determineResponse(prompt, options);
      
      // Record the call
      callHistory.push({
        prompt,
        options,
        response,
        timestamp: Date.now()
      });
      
      return {
        id: `mock-chat-${Math.random().toString(36).substring(2, 15)}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: options.model || 'mock-chat-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: response
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: prompt.length,
          completion_tokens: response.length,
          total_tokens: prompt.length + response.length
        }
      };
    },
    
    callHistory,
    
    /**
     * Add a specific response for a prompt
     */
    addPromptResponse(prompt: string, response: string) {
      promptResponses.set(prompt, response);
    },
    
    /**
     * Clear all recorded call history
     */
    clearHistory() {
      callHistory.length = 0;
    },
    
    /**
     * Get calls matching a filter
     */
    getCallsMatching(filter: (call: typeof callHistory[0]) => boolean) {
      return callHistory.filter(filter);
    }
  };
  
  // Convert methods to Jest mock functions to enable Jest's mock functionality
  mockLangModel.complete = jest.fn(mockLangModel.complete);
  mockLangModel.chat = jest.fn(mockLangModel.chat);
  
  return mockLangModel;
} 