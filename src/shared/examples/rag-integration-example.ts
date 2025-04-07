import OpenAI from 'openai';
import { generateRagTickets } from '../../jira-ticket-generator/rag-ticket-generator.ts';
import { generateRagSummary } from '../../summary-generator/rag-summary-generator.ts';
import {
  UserContextService,
  ContextType,
} from '../user-context/user-context.service.ts';
import { VectorIndexes } from '../../pinecone/pinecone-index.service.ts';
import { RagRetrievalStrategy } from '../services/rag-prompt-manager.service.ts';

/**
 * Example of how to use RAG-enhanced ticket and summary generators
 * This is a demonstration of the workflow, not production code
 */
async function ragIntegrationExample() {
  // Initialize services
  const userContextService = new UserContextService();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Set up user and project information
  const userId = 'user123';
  const projectId = 'project456';
  const conversationId = `meeting-${Date.now()}`;

  // Sample transcript
  const transcript = `
  Team Lead: Alright everyone, let's begin our sprint planning. We need to discuss the new user authentication feature.
  Developer 1: I've been looking at the requirements. We need to implement OAuth with Google and Microsoft.
  Developer 2: What about password recovery? The current flow is complicated.
  Team Lead: Good point. Let's include password recovery in this sprint too.
  Product Owner: I think we should prioritize the OAuth implementation first, then tackle password recovery in the next sprint.
  Team Lead: Agreed. Let's also make sure we have proper unit tests for the authentication flow.
  Developer 1: I estimate the OAuth implementation will take about 3 days.
  Developer 2: And we'll need at least 2 days for writing tests.
  Team Lead: Let's add a day for code review and potential refactoring.
  Product Owner: Perfect. We'll need proper documentation for the OAuth setup too.
  `;

  // Step 1: Generate embeddings for the transcript
  // In a real application, you would use an embedding model
  console.log('Generating embeddings for transcript...');
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: transcript,
  });

  const embeddings = embeddingResponse.data[0].embedding;

  // Step 2: Store some example context in Pinecone
  console.log('Storing context data for demonstration...');

  // Ensure index exists (in real app, would be done during setup)
  // This is simplified - you'd normally use the PineconeIndexService
  console.log('Setting up index (simulated)...');

  // Store example document
  await userContextService.storeDocumentChunk(
    userId,
    'auth-requirements-doc',
    'OAuth 2.0 implementation requires registering the application with identity providers. Google requires setting up API keys and redirect URIs in Google Cloud Console.',
    embeddings.slice(0, embeddings.length / 2), // Simplified for demo
    0,
    1,
    {
      category: 'requirements',
      source: 'Authentication Requirements Doc',
    },
  );

  // Store previous meeting context
  await userContextService.storeConversationTurn(
    userId,
    'previous-meeting',
    'We should follow the security team guidelines for authentication implementation',
    embeddings.slice(embeddings.length / 2), // Simplified for demo
    'user', // Changed from 'team_lead' to valid role
    undefined,
    {
      category: 'meeting',
      source: 'Previous Sprint Planning',
    },
  );

  // Step 3: Generate tickets with RAG
  console.log('Generating tickets with RAG...');
  const tickets = await generateRagTickets(transcript, userId, embeddings, {
    projectId,
    conversationId,
    retrievalStrategy: RagRetrievalStrategy.HYBRID,
  });

  console.log(`Generated ${tickets.length} tickets with RAG:`);
  console.log(JSON.stringify(tickets, null, 2));

  // Step 4: Generate meeting summary with RAG
  console.log('\nGenerating meeting summary with RAG...');
  const summary = await generateRagSummary(transcript, userId, embeddings, {
    projectId,
    conversationId,
    retrievalStrategy: RagRetrievalStrategy.HYBRID,
  });

  console.log('Generated meeting summary with RAG:');
  console.log(JSON.stringify(summary, null, 2));

  // Step 5: Retrieve and display user context stats
  console.log('\nRetrieving user context statistics...');
  const stats = await userContextService.getUserContextStats(userId);

  console.log('User Context Statistics:');
  console.log(`Total context entries: ${stats.totalContextEntries}`);
  console.log(`Context types: ${JSON.stringify(stats.contextTypeCounts)}`);
  console.log(`Categories: ${JSON.stringify(stats.categoryCounts)}`);

  console.log('\nRAG Integration Example Complete!');
}

// Note: This function is for demonstration only and not meant to be run directly
// In a real application, you would call the RAG functions from your controllers
console.log('This is a demonstration file showing how to use RAG functions.');
console.log(
  'To use in your application, import the functions and call them with appropriate parameters.',
);
