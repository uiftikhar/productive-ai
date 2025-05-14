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
  const indexService = new PineconeIndexService({ logger });

  logger.info('Initializing Pinecone indexes...');

  // Common configuration for all indexes
  const baseConfig: IndexConfig = {
    // CreateInforForModel does not take dimenasion as an argument
    // dimension: 1024, // For llama-text-embed-v2 (4096 dimensions)
    metric: 'cosine',
    serverless: true,
    cloud: process.env.PINECONE_CLOUD || 'aws',
    region: process.env.PINECONE_REGION || 'us-west-2',
    embeddingModel: 'llama-text-embed-v2', // Changed to supported model
    tags: { project: 'productive-ai' },
  };

  // Initialize all required indexes
  let successCount = 0;
  let errorCount = 0;
  
  try {
    await indexService.ensureIndexExists(
      VectorIndexes.USER_CONTEXT,
      baseConfig,
    );
    logger.info(`Index ${VectorIndexes.USER_CONTEXT} initialized successfully`);
    successCount++;
  } catch (error) {
    logger.error(`Failed to initialize ${VectorIndexes.USER_CONTEXT} index`, {
      error: error instanceof Error ? error.message : String(error),
      config: {
        model: baseConfig.embeddingModel,
        dimension: baseConfig.dimension
      }
    });
    errorCount++;
    // Continue with other indexes
  }

  try {
    await indexService.ensureIndexExists(
      VectorIndexes.USER_FEEDBACK,
      baseConfig,
    );
    logger.info(`Index ${VectorIndexes.USER_FEEDBACK} initialized successfully`);
    successCount++;
  } catch (error) {
    logger.error(`Failed to initialize ${VectorIndexes.USER_FEEDBACK} index`, {
      error: error instanceof Error ? error.message : String(error),
    });
    errorCount++;
    // Continue with other indexes
  }

  try {
    await indexService.ensureIndexExists(
      VectorIndexes.TRANSCRIPT_EMBEDDINGS,
      baseConfig,
    );
    logger.info(`Index ${VectorIndexes.TRANSCRIPT_EMBEDDINGS} initialized successfully`);
    successCount++;
  } catch (error) {
    logger.error(`Failed to initialize ${VectorIndexes.TRANSCRIPT_EMBEDDINGS} index`, {
      error: error instanceof Error ? error.message : String(error),
    });
    errorCount++;
    // Continue with other indexes
  }

  try {
    await indexService.ensureIndexExists(
      VectorIndexes.MEETING_ANALYSIS,
      baseConfig,
    );
    logger.info(`Index ${VectorIndexes.MEETING_ANALYSIS} initialized successfully`);
    successCount++;
  } catch (error) {
    logger.error(`Failed to initialize ${VectorIndexes.MEETING_ANALYSIS} index`, {
      error: error instanceof Error ? error.message : String(error),
    });
    errorCount++;
    // Continue with other indexes
  }

  logger.info(`Pinecone index initialization completed. Success: ${successCount}, Errors: ${errorCount}`);
  
  // Throw error if no indexes were successfully initialized
  if (successCount === 0 && errorCount > 0) {
    throw new Error('Failed to initialize any Pinecone indexes');
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
