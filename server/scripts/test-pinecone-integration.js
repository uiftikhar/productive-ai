/**
 * Test script for Pinecone vector database integration
 * 
 * This script tests indexing meeting transcripts into Pinecone and retrieving
 * them through semantic search, using real embeddings from OpenAI.
 * 
 * Usage:
 *   node scripts/test-pinecone-integration.js [--mock] [--clean]
 * 
 * Options:
 *   --mock       Use mock mode (default: false for this script)
 *   --clean      Clean up test vectors after running
 *   --verbose    Enable verbose logging
 */

// Load environment variables
require('dotenv').config();

// Set NODE_ENV to development for better error messages
process.env.NODE_ENV = 'development';

// Handle command line arguments
const args = process.argv.slice(2);
const useMockMode = args.includes('--mock');
const cleanup = args.includes('--clean');
const verbose = args.includes('--verbose');

// Import required modules
const { PineconeConnector } = require('../dist/src/connectors/pinecone-connector');
const { OpenAIConnector } = require('../dist/src/connectors/openai-connector');
const { ConsoleLogger } = require('../dist/src/shared/logger/console-logger');
const { AgentConfigService } = require('../dist/src/shared/config/agent-config.service');
const { RagPromptManager } = require('../dist/src/shared/services/rag-prompt-manager.service');
const { v4: uuidv4 } = require('uuid');

// Establish test namespace and user
const TEST_NAMESPACE = 'pinecone-test';
const TEST_USER_ID = `test-user-${uuidv4().slice(0, 8)}`;

// Create logger
const logger = new ConsoleLogger();

/**
 * Sample meeting transcripts for testing
 */
const TEST_TRANSCRIPTS = [
  {
    title: 'Product Roadmap Planning',
    content: `
      Sarah (CEO): Good morning everyone. Today we need to discuss the Q3 product roadmap and make some decisions about resource allocation.
      Michael (Product): I've analyzed user feedback from the last release. Users are asking for better mobile support and more intuitive UI.
      Jane (Engineering): My team can work on the mobile improvements, but we'll need to delay the API upgrade if we prioritize that.
      Sarah (CEO): What's the timeline impact if we delay the API work?
      Jane (Engineering): About 2 months, but mobile improvements could be delivered in 6 weeks.
      Michael (Product): Mobile should be our focus - metrics show 60% of users now access via mobile.
      Tom (Marketing): I agree with Michael. Our competitors are all mobile-first now, and we're falling behind.
      Sarah (CEO): Alright, let's prioritize mobile for Q3. Jane, please prepare a detailed plan by next week.
    `
  },
  {
    title: 'Budget Allocation Meeting',
    content: `
      John (CFO): Thanks for joining today. We need to review the department budgets for the next fiscal year.
      Maria (Marketing): Marketing is requesting an increase of 15% to support our expansion into new markets.
      David (IT): The IT department needs additional budget for cybersecurity upgrades. We've seen more attacks lately.
      John (CFO): How critical are these security upgrades?
      David (IT): Very critical. We've identified vulnerabilities that need immediate attention.
      Lisa (HR): HR also needs additional funding for our new recruitment platform.
      John (CFO): Let's prioritize the security upgrades first, then the marketing expansion, and we'll see what's left for the recruitment platform.
      Maria (Marketing): That sounds reasonable. When can we finalize the numbers?
      John (CFO): I'll have draft allocations ready by Friday for review.
    `
  },
  {
    title: 'Project Status Review',
    content: `
      Alex (PM): Let's go through the status of our key projects.
      Priya (Dev): The checkout optimization project is on track. We've completed 70% of the planned work.
      Alex (PM): That's good news. Any blockers?
      Priya (Dev): We need input from the payment processor about the new API. I've reached out but haven't heard back.
      Alex (PM): I'll escalate that with their account manager.
      Jason (QA): The automated testing framework is behind schedule. We've encountered some integration issues.
      Alex (PM): How long will it take to resolve?
      Jason (QA): Probably another week, which puts us about 10 days behind the original timeline.
      Alex (PM): Let's adjust the timeline and inform stakeholders. Can we pull in any additional resources?
      Jason (QA): An additional QA engineer would help expedite things.
      Alex (PM): I'll see what I can do. Let's meet again on Thursday to reassess.
    `
  }
];

/**
 * Sample search queries to test
 */
const TEST_QUERIES = [
  'What are the mobile development priorities?',
  'When will the budget allocations be finalized?',
  'How is the checkout optimization project progressing?',
  'What security concerns were discussed?',
  'Who is preparing the mobile implementation plan?'
];

/**
 * Run the integration test
 */
async function runTest() {
  try {
    logger.info(`Starting Pinecone integration test with mock mode ${useMockMode ? 'enabled' : 'disabled'}`);
    
    // Initialize configuration
    const configService = AgentConfigService.getInstance();
    configService.updateConfig({
      useMockMode,
      openai: {
        ...configService.getOpenAIConfig(),
        // Use a less expensive model for testing
        modelName: 'gpt-3.5-turbo',
        embeddingModelName: 'text-embedding-3-small'
      },
      pinecone: {
        ...configService.getPineconeConfig(),
        indexName: 'meeting-analysis',
        namespace: TEST_NAMESPACE
      }
    });
    
    // Initialize connectors
    const openAiConnector = new OpenAIConnector({
      logger,
      modelConfig: configService.getOpenAIConfig()
    });
    
    const pineconeConnector = new PineconeConnector({
      logger,
      defaultNamespace: TEST_NAMESPACE
    });
    
    // Create RAG manager for embeddings
    const ragManager = new RagPromptManager({
      openAiConnector,
      pineconeConnector,
      logger,
      useMockMode
    });
    
    // Initialize Pinecone
    await pineconeConnector.initialize();
    logger.info('Pinecone connection initialized');
    
    // Store sample meeting transcripts
    const indexedDocuments = [];
    
    logger.info(`Indexing ${TEST_TRANSCRIPTS.length} sample transcripts...`);
    
    for (const [index, transcript] of TEST_TRANSCRIPTS.entries()) {
      const documentId = `test-transcript-${index}-${uuidv4().slice(0, 8)}`;
      
      // Generate embedding
      logger.info(`Generating embedding for "${transcript.title}"...`);
      const embedding = await ragManager.generateEmbedding(transcript.content);
      
      // Store in Pinecone
      await pineconeConnector.storeVector(
        'meeting-analysis',
        documentId,
        embedding,
        {
          userId: TEST_USER_ID,
          title: transcript.title,
          content: transcript.content,
          type: 'meeting_transcript',
          timestamp: Date.now(),
          source: 'pinecone-integration-test'
        },
        TEST_NAMESPACE
      );
      
      indexedDocuments.push({
        id: documentId,
        title: transcript.title
      });
      
      logger.info(`Indexed document ${index + 1}/${TEST_TRANSCRIPTS.length} with ID ${documentId}`);
    }
    
    // Wait a moment for consistency
    logger.info('Waiting for index consistency...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Run sample queries
    logger.info(`\nTesting ${TEST_QUERIES.length} sample queries...\n`);
    
    for (const [index, query] of TEST_QUERIES.entries()) {
      logger.info(`\nQuery ${index + 1}: "${query}"`);
      
      // Generate embedding for query
      const queryEmbedding = await ragManager.generateEmbedding(query);
      
      // Search in Pinecone
      const searchResults = await pineconeConnector.querySimilar(
        'meeting-analysis',
        queryEmbedding,
        {
          topK: 3,
          filter: { userId: TEST_USER_ID },
          includeValues: false
        },
        TEST_NAMESPACE
      );
      
      logger.info(`Found ${searchResults.length} results:`);
      
      // Print results
      for (const [resultIndex, result] of searchResults.entries()) {
        const title = typeof result.metadata.title === 'string' 
          ? result.metadata.title 
          : `Document ${result.id}`;
        
        console.log(`  ${resultIndex + 1}. ${title} (Score: ${result.score.toFixed(4)})`);
        
        if (verbose) {
          const preview = typeof result.metadata.content === 'string'
            ? result.metadata.content.slice(0, 100) + '...'
            : '[No content preview available]';
            
          console.log(`     ${preview}`);
        }
      }
    }
    
    // Clean up if requested
    if (cleanup) {
      logger.info('\nCleaning up test vectors...');
      
      await pineconeConnector.deleteVectorsByFilter(
        'meeting-analysis',
        { userId: TEST_USER_ID },
        TEST_NAMESPACE
      );
      
      logger.info('Test vectors cleaned up');
    } else {
      logger.info('\nTest vectors were not cleaned up. To clean them manually, run with --clean');
    }
    
    logger.info('\nPinecone integration test completed successfully');
  } catch (error) {
    logger.error(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run the test
runTest(); 