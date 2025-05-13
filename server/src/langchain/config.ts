/**
 * LangChain configuration
 */
export const LangChainConfig = {
  llm: {
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo',
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.2'),
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000'),
    streaming: process.env.OPENAI_STREAMING === 'true',
  },
  embeddings: {
    model: process.env.EMBEDDING_MODEL || 'llama-text-embed-v2',
  },
  agents: {
    maxIterations: parseInt(process.env.MAX_AGENT_ITERATIONS || '10'),
    maxRetries: parseInt(process.env.MAX_AGENT_RETRIES || '3'),
  },
};
