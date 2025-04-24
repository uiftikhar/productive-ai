/**
 * Export interfaces for agent integrations
 */
export * from './openai-connector';
export * from './pinecone-connector';

// Export instances for module-wide singletons
import { OpenAIConnector } from './openai-connector';
import { PineconeConnector } from './pinecone-connector';

export const openAIConnector = new OpenAIConnector();
export const pineconeConnector = new PineconeConnector();
