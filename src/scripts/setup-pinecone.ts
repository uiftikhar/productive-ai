/**
 * Standalone script to initialize Pinecone indexes
 * 
 * NOTE: This script is intended ONLY for:
 * 1. Manual setup during development
 * 2. CI/CD pipeline initialization
 * 3. First-time deployment setup
 * 
 * The application DOES NOT use this script during normal startup.
 * Normal initialization happens centrally in src/index.ts after database connection.
 * 
 * Run with: npm run setup:pinecone
 */

import { initializePineconeIndexes } from '../pinecone/initialize-indexes';

console.log('Starting manual Pinecone setup...');

initializePineconeIndexes()
  .then(() => {
    console.log('✅ Pinecone indexes have been successfully created/verified');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to initialize Pinecone indexes:', error);
    process.exit(1);
  }); 