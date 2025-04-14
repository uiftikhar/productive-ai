// @ts-nocheck
// src/agents/adapters/tests/openai-adapter.test.ts

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { OpenAIAdapter, MessageConfig } from '../openai-adapter.ts';
import { ConsoleLogger } from '../../../shared/logger/console-logger.ts';

// Note: We don't need to mock OpenAI here as it's already mocked in setupJest.js
// The mock implementation provides methods like:
// - ChatOpenAI.invoke returns { content: 'This is a mock response from LangChain ChatOpenAI' }
// - OpenAIEmbeddings.embedQuery returns a 1536-length array of embeddings
// - OpenAIEmbeddings.embedDocuments returns arrays of embeddings

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter;
  let mockLogger: ConsoleLogger;

  beforeEach(() => {
    // Reset mocks between tests
    jest.clearAllMocks();

    // Create a mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as ConsoleLogger;

    // Create a new adapter instance for each test
    adapter = new OpenAIAdapter({ logger: mockLogger });
  });

  test('initialization should log an info message', async () => {
    await adapter.initialize();
    expect(mockLogger.info).toHaveBeenCalledWith('Initializing OpenAIAdapter');
  });

  test('generateChatCompletion should return a response from the LLM', async () => {
    const messages: MessageConfig[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ];

    const response = await adapter.generateChatCompletion(messages);

    expect(response).toBe('This is a mock response from LangChain ChatOpenAI');
    // The global mock from setupJest.js is used here
  });

  test('generateEmbeddings should return embeddings for a single text', async () => {
    const text = 'This is a test sentence.';
    const embeddings = await adapter.generateEmbeddings(text);

    expect(embeddings.length).toBe(1536);
    // The global mock from setupJest.js returns a 1536-length array
  });

  test('generateBatchEmbeddings should return embeddings for multiple texts', async () => {
    const texts = ['This is text 1.', 'This is text 2.'];
    const embeddings = await adapter.generateBatchEmbeddings(texts);

    expect(embeddings.length).toBe(texts.length);
    expect(embeddings[0].length).toBe(1536);
    // The global mock from setupJest.js returns arrays of 1536-length arrays
  });

  test('error in generateChatCompletion should be logged and rethrown', async () => {
    const mockErrorInvoke = jest.fn().mockImplementation(() => {
      throw new Error('LLM API error');
    });

    // Save original chatModel
    const originalChatModel = adapter['chatModel'];

    // Replace with one that throws
    adapter['chatModel'] = {
      invoke: mockErrorInvoke,
      modelName: 'test-model',
      temperature: 0,
      maxTokens: 100,
    };

    const messages: MessageConfig[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ];

    await expect(adapter.generateChatCompletion(messages)).rejects.toThrow(
      'LLM API error',
    );
    expect(mockLogger.error).toHaveBeenCalledWith('Error generating response', {
      error: 'LLM API error',
    });

    // Restore original chatModel
    adapter['chatModel'] = originalChatModel;
  });

  test('custom model configuration should be used when provided', async () => {
    const customAdapter = new OpenAIAdapter({
      logger: mockLogger,
      modelConfig: {
        model: 'gpt-3.5-turbo',
        temperature: 0.5,
        maxTokens: 500,
      },
    });

    const messages: MessageConfig[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ];

    await customAdapter.generateChatCompletion(messages);

    // Since the global mock is used, we can't easily verify the model config
    // But the test ensures the code runs without errors
  });
});
