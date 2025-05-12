/**
 * Test script for RAG integration with the meeting analysis system
 * This script tests the integration of the MeetingRAGService, SemanticChunkingService, 
 * and PineconeConnector with the meeting analysis workflow.
 * 
 * Run with: ts-node src/test-rag-integration.ts
 */

import dotenv from 'dotenv';
import { ConsoleLogger } from './shared/logger/console-logger';
import { OpenAIConnector } from './connectors/openai-connector';
import { PineconeConnector } from './connectors/pinecone-connector';
import { MeetingRAGIntegrator } from './langgraph/agentic-meeting-analysis/api-compatibility/meeting-rag-integrator';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config();

// Sample meeting transcript for testing
const SAMPLE_TRANSCRIPT = `
John: Good morning everyone, let's get started with our project status update meeting.
Sarah: Hi team, I've completed the frontend dashboard and it's ready for review.
Michael: Great work Sarah! I've been working on the backend API and it's about 80% complete.
John: That sounds promising. What's the status on the database migration?
Michael: We're still waiting on the DevOps team to provision the new database instance.
Sarah: I can help with some of the migration scripts once the instance is ready.
John: Perfect, that would be helpful. Let's also discuss the upcoming client demo next week.
Sarah: I think we should prepare a slide deck highlighting the key features we've implemented.
Michael: Agreed, and we should also schedule a dry run before the actual demo.
John: Good point. I'll create the slide deck and share it with the team by Thursday.
Sarah: I'll handle the feature documentation part.
Michael: And I'll make sure the demo environment is stable and all APIs are functioning correctly.
John: Great! Any blockers or issues we need to address?
Michael: The authentication service is a bit unstable, but I'm working with the security team to resolve it.
Sarah: No blockers from my side, but I need Michael's API documentation to complete the UI integration.
Michael: I'll send that over to you by tomorrow morning, Sarah.
John: Perfect! Let's assign action items. Michael, please finalize the API by Friday.
Michael: Understood, I'll get it done.
John: Sarah, please complete the UI integration once you have Michael's documentation.
Sarah: Will do, I should be able to finish it by Monday.
John: And I'll prepare the slide deck and coordinate with the client for the demo.
John: Any other items we need to discuss?
Sarah: That covers everything from my side.
Michael: I'm good too.
John: Alright, let's wrap up. Thanks everyone for the update!
`;

async function testRAGIntegration() {
  const logger = new ConsoleLogger();
  
  logger.info('Starting RAG integration test');
  
  try {
    // Initialize OpenAI connector
    const openAiConnector = new OpenAIConnector({
      logger,
      modelConfig: {
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        temperature: 0.2,
        maxTokens: 2000
      },
      embeddingConfig: {
        model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large'
      }
    });
    
    // Initialize Pinecone connector
    const pineconeConnector = new PineconeConnector({ logger });
    
    // Initialize MeetingRAGIntegrator
    const meetingRagIntegrator = new MeetingRAGIntegrator({
      logger,
      openAiConnector,
      pineconeConnector,
      config: {
        enabled: true,
        indexName: 'transcript-embeddings'
      }
    });
    
    // Create a test meeting ID and session ID
    const meetingId = `test-meeting-${uuidv4().substring(0, 8)}`;
    const sessionId = `test-session-${uuidv4().substring(0, 8)}`;
    
    logger.info('Processing transcript', { meetingId, sessionId });
    
    // Process the transcript
    const chunksStored = await meetingRagIntegrator.processTranscript(
      meetingId,
      SAMPLE_TRANSCRIPT,
      sessionId
    );
    
    logger.info('Transcript processed and stored in Pinecone', {
      meetingId,
      sessionId,
      chunksStored
    });
    
    // Test retrieving context
    logger.info('Testing context retrieval capabilities');
    
    // Test different queries
    const queries = [
      "What action items were assigned in the meeting?",
      "What is the status of the backend API?",
      "Who is preparing the slide deck for the client demo?",
      "What issues or blockers were mentioned in the meeting?"
    ];
    
    for (const query of queries) {
      logger.info(`Running test query: "${query}"`);
      
      const results = await meetingRagIntegrator.queryContext(
        query,
        meetingId,
        3  // Get top 3 results
      );
      
      logger.info('Query results:', {
        query,
        resultCount: results.length,
        topScore: results.length > 0 ? results[0].relevance.toFixed(2) : 'N/A'
      });
      
      if (results.length > 0) {
        logger.info('Top result content:', {
          content: results[0].content.substring(0, 200) + 
            (results[0].content.length > 200 ? '...' : '')
        });
      }
    }
    
    logger.info('RAG integration test completed successfully');
  } catch (error) {
    logger.error('Error in RAG integration test', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Run the test
testRAGIntegration().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 