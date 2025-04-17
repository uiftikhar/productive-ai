/**
 * Script to check the current dimensions of Pinecone indexes
 */

import { ConsoleLogger } from '../shared/logger/console-logger';
import { PineconeConfig } from '../pinecone/pincone-config.service';
import { VectorIndexes } from '../pinecone/pinecone-index.service';

async function checkPineconeIndexes(): Promise<void> {
  const logger = new ConsoleLogger();
  
  logger.info('Checking Pinecone indexes...');

  try {
    // Get direct access to Pinecone client
    const pineconeClient = PineconeConfig.getInstance();
    
    // List all indexes
    const indexList = await pineconeClient.listIndexes();
    logger.info(`Found ${indexList.indexes?.length || 0} total indexes`);
    
    if (!indexList.indexes || indexList.indexes.length === 0) {
      logger.info('No indexes found in your Pinecone account');
      return;
    }
    
    // Check dimensions of our project indexes
    logger.info('Checking project indexes:');
    console.log('-------------------------------');
    
    for (const indexName of Object.values(VectorIndexes)) {
      const indexExists = indexList.indexes.some(idx => idx.name === indexName);
      
      if (indexExists) {
        try {
          const indexInfo = await pineconeClient.describeIndex(indexName);
          console.log(`✅ ${indexName}:`);
          console.log(`   - Dimensions: ${indexInfo.dimension}`);
          console.log(`   - Metric: ${indexInfo.metric}`);
          console.log(`   - Status: ${indexInfo.status.ready ? 'Ready' : 'Not Ready'}`);
          console.log(`   - Vector Count: ${indexInfo.status?.ready ? 'Available' : 'Not Available'}`);
          console.log('-------------------------------');
        } catch (error) {
          console.log(`❌ Error getting info for ${indexName}: ${error}`);
        }
      } else {
        console.log(`❌ ${indexName}: Not found`);
        console.log('-------------------------------');
      }
    }
    
    logger.info('Pinecone index check complete');
  } catch (error) {
    logger.error('Failed to check Pinecone indexes', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

// Run when script is executed directly
if (require.main === module) {
  checkPineconeIndexes()
    .then(() => {
      console.log('✅ Pinecone index check complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Pinecone index check failed:', error);
      process.exit(1);
    });
}

export { checkPineconeIndexes }; 