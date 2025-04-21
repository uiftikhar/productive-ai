/**
 * Simple test script to verify Pinecone vector storage and retrieval
 */

import { PineconeConnectionService } from '../pinecone/pinecone-connection.service';
import { PineconeIndexService } from '../pinecone/pinecone-index.service';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { v4 as uuidv4 } from 'uuid';
import { ContextType } from '../shared/services/user-context/types/context.types';

const logger = new ConsoleLogger();

// Function to generate mock embeddings
function generateMockEmbeddings(): number[] {
  return Array(3072)
    .fill(0)
    .map(() => Math.random() * 2 - 1);
}

// Helper function for delay
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Main test function
async function testPineconeStorage(): Promise<void> {
  logger.info('Starting Pinecone storage test');

  // Initialize Pinecone services
  const pineconeIndexService = new PineconeIndexService();

  const pineconeService = new PineconeConnectionService({
    logger,
    indexService: pineconeIndexService,
  });

  // Create unique test IDs
  const userId = `test-user-${uuidv4()}`;
  const recordId = `test-record-${uuidv4()}`;
  const conversationId = `test-conversation-${uuidv4()}`;
  const testMessage =
    'This is a test message for Pinecone storage verification';

  logger.info('Test configuration', {
    userId,
    recordId,
    conversationId,
  });

  try {
    // Step 1: Create a test vector record
    const testRecord = {
      id: recordId,
      values: generateMockEmbeddings(),
      metadata: {
        contextType: ContextType.CONVERSATION,
        conversationId,
        message: testMessage,
        role: 'user',
        userId,
        timestamp: Date.now(),
      },
    };

    // Step 2: Store the vector record
    logger.info('Storing test vector record');
    await pineconeService.upsertVectors('user-context', [testRecord], userId);

    logger.info(
      'Vector stored successfully, waiting 30 seconds for indexing...',
    );

    // Wait with progress indicators
    for (let i = 0; i < 6; i++) {
      await delay(5000);
      logger.info(`Waiting... ${(i + 1) * 5} seconds elapsed`);
    }

    // Step 3: Verify the namespace exists in the index stats
    const stats = await pineconeService.describeIndexStats('user-context');
    logger.info('Index stats after storage', {
      namespaces: Object.keys(stats.namespaces || {}),
      totalVectorCount: stats.totalVectorCount,
      hasOurNamespace:
        stats.namespaces && stats.namespaces[userId] ? true : false,
      ourNamespaceStats:
        stats.namespaces && stats.namespaces[userId]
          ? stats.namespaces[userId]
          : 'not found',
    });

    // Step 4: Try to retrieve the vector by ID
    logger.info('Attempting to fetch vector by ID');
    const fetchResult = await pineconeService.fetchVectors(
      'user-context',
      [recordId],
      userId,
    );

    // Handle the fetchResult without assuming its structure
    logger.info('Fetch result', {
      success: !!fetchResult,
      hasData: Object.keys(fetchResult || {}).length > 0,
      result: JSON.stringify(fetchResult).substring(0, 200) + '...',
    });

    // Try direct fetch via PineconeIndexService
    logger.info('Attempting direct fetch via PineconeIndexService');
    const directIndex = pineconeIndexService
      .getIndex('user-context')
      .namespace(userId);
    try {
      const directFetchResult = await directIndex.fetch([recordId]);
      logger.info('Direct fetch result', {
        success: !!directFetchResult,
        hasData: Object.keys(directFetchResult || {}).length > 0,
        result: JSON.stringify(directFetchResult).substring(0, 200) + '...',
      });
    } catch (error) {
      logger.error('Error in direct fetch', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Step 5: Try various queries to verify retrieval
    logger.info('Testing different query filter variations');

    const filterVariations = [
      { label: 'by id', filter: { id: recordId } },
      { label: 'by userId', filter: { userId } },
      { label: 'by conversationId', filter: { conversationId } },
      {
        label: 'by contextType',
        filter: { contextType: ContextType.CONVERSATION },
      },
      { label: 'by role', filter: { role: 'user' } },
      {
        label: 'by multiple filters',
        filter: { contextType: ContextType.CONVERSATION, role: 'user' },
      },
      {
        label: 'by timestamp range',
        filter: { timestamp: { $gte: Date.now() - 3600000 } },
      },
      { label: 'empty filter', filter: {} },
    ];

    for (const variation of filterVariations) {
      try {
        logger.info(`Trying filter: ${variation.label}`);
        const result = await pineconeService.queryVectors(
          'user-context',
          generateMockEmbeddings(),
          {
            topK: 10,
            includeMetadata: true,
            filter: variation.filter,
          },
          userId,
        );
        logger.info(
          `  Results for ${variation.label}: ${result.matches?.length || 0} matches`,
        );

        // If we got results, show the first match
        if (result.matches && result.matches.length > 0) {
          logger.info(`  First match metadata for ${variation.label}:`, {
            metadata:
              JSON.stringify(result.matches[0].metadata).substring(0, 200) +
              '...',
          });
        }
      } catch (error) {
        logger.warn(`  Error with filter ${variation.label}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Try to query without namespace to see if the data is there at all
    try {
      logger.info('Trying to query all vectors in the index (no namespace)');
      const result = await pineconeService.queryVectors(
        'user-context',
        generateMockEmbeddings(),
        {
          topK: 100,
          includeMetadata: true,
          filter: { contextType: ContextType.CONVERSATION },
        },
      );
      logger.info(
        `  Results in entire index: ${result.matches?.length || 0} matches`,
      );

      // Check if our vectors are in the results
      const foundOurRecord = result.matches?.some(
        (match) => match.id === recordId,
      );
      logger.info(`  Found our record in results: ${foundOurRecord}`);

      // Show all namespaces found in results
      const namespacesInResults = new Set(
        result.matches?.map(
          (match) => match.metadata?.['namespace'] || 'unknown',
        ) || [],
      );
      logger.info(
        `  Namespaces found in results: ${Array.from(namespacesInResults).join(', ')}`,
      );
    } catch (error) {
      logger.warn('Error querying all vectors:', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info('Test completed successfully');
  } catch (error) {
    logger.error('Error during test', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

// Run if this file is executed directly
if (require.main === module) {
  testPineconeStorage()
    .then(() => {
      console.log('Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}
