/**
 * Export interfaces for agent integrations
 */
export * from './openai-connector';
export * from './pinecone-connector';

// Export instances for module-wide singletons
import { OpenAIConnector } from './openai-connector';
import { PineconeConnector } from './pinecone-connector';

// Create exports for direct use
export const openAIConnector = new OpenAIConnector();
export const pineconeConnector = new PineconeConnector();

// Add any other connectors here as they are created
