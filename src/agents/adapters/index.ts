// src/agents/adapters/index.ts

/**
 * Export all adapter implementations
 */
export * from './language-model-adapter.interface';
export * from './context-adapter.interface';
export * from './openai-adapter';

// Export instances for module-wide singletons
import { OpenAIAdapter } from './openai-adapter';

// Create exports for direct use
export const openAIAdapter = new OpenAIAdapter();

// Export adapter factory
import { PineconeAdapter } from './pinecone-adapter';
import { Logger } from '../../shared/logger/logger.interface';

/**
 * Factory function for creating all adapters at once
 * @param logger Optional logger to use with all adapters
 */
export function createAdapters(logger?: Logger) {
  const openaiAdapter = new OpenAIAdapter({ logger });

  return {
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
  pineconeAdapter?: PineconeAdapter;
  openaiAdapter?: OpenAIAdapter;
}) {
  const initPromises: Promise<void>[] = [];

  if (adapters.pineconeAdapter) {
    initPromises.push(adapters.pineconeAdapter.initialize());
  }

  if (adapters.openaiAdapter) {
    initPromises.push(adapters.openaiAdapter.initialize());
  }

  await Promise.all(initPromises);
}
