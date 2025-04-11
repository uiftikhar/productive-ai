// src/config/langchain-config.ts

import { env } from 'process';

/**
 * LangChain configuration for the agent system
 */
export const LangChainConfig = {
  llm: {
    model: env.DEFAULT_MODEL || 'gpt-4-turbo',
    temperature: parseFloat(env.AGENT_TEMPERATURE || '0.1'),
    maxTokens: parseInt(env.MAX_TOKENS || '4000'),
    streaming: env.ENABLE_STREAMING !== 'false',
  },
  embeddings: {
    model: env.EMBEDDING_MODEL || 'text-embedding-3-large',
  },
  agents: {
    maxIterations: parseInt(env.MAX_AGENT_ITERATIONS || '10'),
    maxRetries: parseInt(env.MAX_AGENT_RETRIES || '3'),
  },
  vectorDb: {
    // Reuse your existing Pinecone config
    pineconeIndex: env.PINECONE_INDEX || 'user-context',
    namespace: env.PINECONE_NAMESPACE || '',
  },
  memory: {
    longTermTtlDays: parseInt(env.LONG_TERM_MEMORY_TTL_DAYS || '90'),
    workingTtlHours: parseInt(env.WORKING_MEMORY_TTL_HOURS || '24'),
  },
};
