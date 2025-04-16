// src/agents/adapters/index.ts

// Export all adapters
export * from './agent-context.adapter';
export * from './pinecone-adapter';
export * from './openai-adapter';
export * from './context-adapter.interface';
export * from './language-model-adapter.interface';

// Export adapter factory
import { AgentContextAdapter } from './agent-context.adapter';
import { PineconeAdapter } from './pinecone-adapter';
import { OpenAIAdapter } from './openai-adapter';
import { Logger } from '../../shared/logger/logger.interface';

/**
 * Factory function for creating all adapters at once
 * @param logger Optional logger to use with all adapters
 */
export function createAdapters(logger?: Logger) {
  const openaiAdapter = new OpenAIAdapter({ logger });

  return {
    contextAdapter: new AgentContextAdapter({ logger }),
    pineconeAdapter: new PineconeAdapter({ logger }),
    openaiAdapter: openaiAdapter,
    languageModelAdapter: openaiAdapter, // The OpenAIAdapter implements LanguageModelAdapter
  };
}

/**
 * Initialize all adapters
 * @param adapters Object containing adapter instances
 */
export async function initializeAdapters(adapters: {
  contextAdapter?: AgentContextAdapter;
  pineconeAdapter?: PineconeAdapter;
  openaiAdapter?: OpenAIAdapter;
}) {
  const initPromises: Promise<void>[] = [];

  if (adapters.contextAdapter) {
    initPromises.push(adapters.contextAdapter.initialize());
  }

  if (adapters.pineconeAdapter) {
    initPromises.push(adapters.pineconeAdapter.initialize());
  }

  if (adapters.openaiAdapter) {
    initPromises.push(adapters.openaiAdapter.initialize());
  }

  await Promise.all(initPromises);
}
