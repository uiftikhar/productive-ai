// src/agents/tests/setup.ts

import { afterAll, beforeAll, beforeEach, jest } from '@jest/globals';

// Configure environment variables for testing
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.PINECONE_API_KEY = 'test-pinecone-key';
process.env.PINECONE_INDEX = 'test-index';
process.env.NODE_ENV = 'test';

// Mock LangChain's OpenAI implementation
jest.mock('@langchain/openai', () => {
  return {
    ChatOpenAI: jest.fn().mockImplementation(() => ({
      invoke: jest.fn().mockImplementation(async (messages) => {
        return {
          content: "This is a mock response from LangChain ChatOpenAI",
          role: "assistant"
        };
      }),
      stream: jest.fn().mockImplementation(async function* (messages) {
        yield {
          content: "This is a mock streaming response from LangChain ChatOpenAI",
          role: "assistant"
        };
      }),
    })),
    OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
      embedDocuments: jest.fn().mockImplementation(async (texts) => {
        return texts.map(_ => Array(1536).fill(0).map((_, i) => i / 1536));
      }),
      embedQuery: jest.fn().mockImplementation(async (text) => {
        return Array(1536).fill(0).map((_, i) => i / 1536);
      }),
    })),
  };
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});