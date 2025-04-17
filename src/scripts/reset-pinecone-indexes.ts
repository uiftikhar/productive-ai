/**
 * Script to delete and recreate all Pinecone indexes
 * Use this when you need to change index dimensions or other immutable settings
 */

import { PineconeIndexService, VectorIndexes } from '../pinecone/pinecone-index.service';
import { initializePineconeIndexes } from '../pinecone/initialize-indexes';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { PineconeConfig } from '../pinecone/pincone-config.service';
import { createInterface } from 'readline';

// Create an empty array to collect logs for debugging
const debugLogs: string[] = [];

// Function to log and collect debug information
function debugLog(message: string): void {
  debugLogs.push(message);
  console.log(message);
}

async function promptUser(question: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function resetPineconeIndexes(forceReset = false): Promise<void> {
  const logger = new ConsoleLogger();
  
  debugLog('=====================================================');
  debugLog('📚 PINECONE INDEX RESET SCRIPT - VERBOSE MODE');
  debugLog('=====================================================');
  debugLog(`Starting Pinecone index reset at ${new Date().toISOString()}`);
  debugLog(`Environment Variables:`);
  debugLog(`- PINECONE_REGION: ${process.env.PINECONE_REGION || 'Not set'}`);
  debugLog(`- PINECONE_CLOUD: ${process.env.PINECONE_CLOUD || 'Not set'}`);
  debugLog(`- PINECONE_API_KEY: ${process.env.PINECONE_API_KEY ? 'Set (hidden)' : 'Not set'}`);

  if (!forceReset) {
    const confirmed = await promptUser('WARNING: This will DELETE all Pinecone indexes and recreate them with 3072 dimensions. Continue?');
    if (!confirmed) {
      debugLog('Operation cancelled by user');
      return;
    }
  }

  try {
    // Get direct access to Pinecone client
    debugLog('Initializing Pinecone client...');
    const pineconeClient = PineconeConfig.getInstance();
    debugLog('Pinecone client initialized successfully');
    
    // Delete all existing indexes
    debugLog('Checking and deleting existing indexes...');
    
    // List all indexes first
    try {
      const indexList = await pineconeClient.listIndexes();
      debugLog(`Found ${indexList.indexes?.length || 0} existing indexes: ${JSON.stringify(indexList.indexes?.map(i => i.name) || [])}`);
      
      // Check if our indexes exist before trying to delete them
      let deletedCount = 0;
      
      // Delete our project indexes if they exist
      for (const indexName of Object.values(VectorIndexes)) {
        const indexExists = indexList.indexes?.some(idx => idx.name === indexName) || false;
        
        if (indexExists) {
          debugLog(`Attempting to delete index: ${indexName}`);
          try {
            await pineconeClient.deleteIndex(indexName);
            debugLog(`Successfully deleted index: ${indexName}`);
            deletedCount++;
          } catch (deleteError) {
            debugLog(`ERROR deleting index ${indexName}: ${deleteError}`);
            debugLog(`Error details: ${JSON.stringify(deleteError)}`);
          }
        } else {
          debugLog(`Index does not exist, no need to delete: ${indexName}`);
        }
      }

      // Wait longer for deletion to propagate if we deleted anything
      if (deletedCount > 0) {
        debugLog(`Waiting for deletion of ${deletedCount} indexes to propagate...`);
        debugLog(`Sleeping for 15 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
      
      // Verify indexes are actually deleted
      const afterDeletionList = await pineconeClient.listIndexes();
      const remainingIndexes = afterDeletionList.indexes?.filter(idx => 
        Object.values(VectorIndexes).includes(idx.name as VectorIndexes)
      ) || [];
      
      if (remainingIndexes.length > 0) {
        debugLog(`WARNING: Some indexes still exist after deletion: ${remainingIndexes.map(i => i.name).join(', ')}`);
        debugLog(`Waiting an additional 15 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
      } else {
        debugLog(`Verified all project indexes have been deleted successfully`);
      }
      
      // Create indexes with new configuration
      debugLog('Creating new indexes with 3072 dimensions...');
      debugLog('Calling initializePineconeIndexes()...');
      await initializePineconeIndexes();
      debugLog('Completed initializePineconeIndexes()');
      
      // Verify new indexes have correct dimensions
      debugLog('Verifying new indexes...');
      const newIndexList = await pineconeClient.listIndexes();
      
      let allSuccessful = true;
      for (const indexName of Object.values(VectorIndexes)) {
        if (newIndexList.indexes?.some(idx => idx.name === indexName)) {
          try {
            const indexInfo = await pineconeClient.describeIndex(indexName);
            debugLog(`Index ${indexName} created with:`);
            debugLog(`- Dimensions: ${indexInfo.dimension}`);
            debugLog(`- Metric: ${indexInfo.metric}`);
            debugLog(`- Status: ${indexInfo.status.ready ? 'Ready' : 'Not Ready'}`);
            
            if (indexInfo.dimension !== 3072) {
              debugLog(`ERROR: Index ${indexName} has wrong dimension: ${indexInfo.dimension} (expected 3072)`);
              allSuccessful = false;
            }
          } catch (describeError) {
            debugLog(`ERROR describing index ${indexName}: ${describeError}`);
            allSuccessful = false;
          }
        } else {
          debugLog(`ERROR: Index ${indexName} was not created successfully`);
          allSuccessful = false;
        }
      }
      
      if (allSuccessful) {
        debugLog('✅ Pinecone indexes have been successfully reset with 3072 dimensions');
      } else {
        debugLog('⚠️ Some issues were encountered during reset - see logs above');
      }
    } catch (listError) {
      debugLog(`ERROR listing indexes: ${listError}`);
      debugLog(`Error details: ${JSON.stringify(listError)}`);
      throw listError;
    }
  } catch (error) {
    debugLog(`FATAL ERROR: ${error}`);
    debugLog(`Error details: ${JSON.stringify(error)}`);
    throw error;
  } finally {
    // Write debug logs to file for reference
    debugLog('=====================================================');
    debugLog(`Script completed at ${new Date().toISOString()}`);
    debugLog('=====================================================');
    
    // Print summary of what happened
    debugLog('\nDEBUG LOGS SUMMARY:');
    debugLogs.forEach((log, index) => console.log(`[${index}] ${log}`));
  }
}

// Run when script is executed directly
if (require.main === module) {
  resetPineconeIndexes()
    .then(() => {
      console.log('✅ Pinecone indexes reset process completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Pinecone indexes reset failed:', error);
      process.exit(1);
    });
}

export { resetPineconeIndexes }; 