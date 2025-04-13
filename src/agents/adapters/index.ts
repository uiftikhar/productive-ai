// src/agents/adapters/index.ts

// Export all adapters
export * from './agent-context.adapter.ts';
export * from './pinecone-adapter.ts';
export * from './openai-adapter.ts';
export * from './context-adapter.interface.ts';
export * from './language-model-adapter.interface.ts';

// Export adapter factory
import { AgentContextAdapter } from './agent-context.adapter.ts';
import { PineconeAdapter } from './pinecone-adapter.ts';
import { OpenAIAdapter } from './openai-adapter.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';

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
