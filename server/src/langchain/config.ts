// TODO LangSmith¶ tracing
// set up LangSmith for best-in-class observability. Setup is simple - add the following variables to your environment and update the LANGCHAIN_API_KEY value with your API key.


// Optional, add tracing in LangSmith
// process.env.LANGCHAIN_API_KEY = "ls__...";
// process.env.LANGCHAIN_CALLBACKS_BACKGROUND = "true";
// process.env.LANGCHAIN_TRACING_V2 = "true";
// process.env.LANGCHAIN_PROJECT = "Quickstart: LangGraphJS";
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

