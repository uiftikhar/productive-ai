import {
  PineconeIndexService,
  VectorIndexes,
  IndexConfig,
} from './pinecone-index.service';
import { ConsoleLogger } from '../shared/logger/console-logger';

/**
 * Script to initialize all required Pinecone indexes
 */
async function initializePineconeIndexes(): Promise<void> {
  const logger = new ConsoleLogger();
  const indexService = new PineconeIndexService();

  logger.info('Initializing Pinecone indexes...');

  try {
    // Common configuration for all indexes
    const baseConfig: IndexConfig = {
      dimension: 3072, // For OpenAI text-embedding-3-large (3072 dimensions)
      metric: 'cosine',
      serverless: true,
      cloud: process.env.PINECONE_CLOUD || 'aws',
      region: process.env.PINECONE_REGION || 'us-west-2',
      embeddingModel: 'text-embedding-3-large', // This is just for Pinecone's managed embeddings
      tags: { project: 'productive-ai' },
    };

    // Initialize all required indexes
    await indexService.ensureIndexExists(
      VectorIndexes.USER_CONTEXT,
      baseConfig,
    );
    await indexService.ensureIndexExists(
      VectorIndexes.USER_FEEDBACK,
      baseConfig,
    );
    await indexService.ensureIndexExists(
      VectorIndexes.TRANSCRIPT_EMBEDDINGS,
      baseConfig,
    );

    logger.info('Successfully initialized all Pinecone indexes');
  } catch (error) {
    logger.error('Failed to initialize Pinecone indexes', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Run the initialization when script is executed directly
if (require.main === module) {
  initializePineconeIndexes()
    .then(() => {
      console.log('✅ Pinecone indexes initialization complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Pinecone indexes initialization failed:', error);
      process.exit(1);
    });
}

export { initializePineconeIndexes };
