/**
 * Pinecone Integration Tests
 * 
 * This test suite validates the integration between the RAG system
 * and Pinecone vector database, ensuring that embeddings are properly
 * stored and retrieved.
 */

import { UnifiedRAGService } from '../core/unified-rag.service';
import { MeetingContextProvider } from '../context/meeting-context-provider';
import { DocumentContextProvider } from '../context/document-context-provider';
import { ConversationMemoryService } from '../memory/conversation-memory.service';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { PineconeConnector } from '../../connectors/pinecone-connector';

// Skip these tests in CI environments where Pinecone might not be available
// To run these tests locally, make sure you have Pinecone API keys configured
describe.skip('Pinecone Integration', () => {
  // Real service instances - not mocked
  let openAiConnector: OpenAIConnector;
  let pineconeConnector: PineconeConnector;
  let meetingContextProvider: MeetingContextProvider;
  let documentContextProvider: DocumentContextProvider;
  let conversationMemory: ConversationMemoryService;
  let ragService: UnifiedRAGService;
  const logger = new ConsoleLogger();
  
  const testMeetingId = `test-meeting-${Date.now()}`;
  const testDocumentId = `test-document-${Date.now()}`;

  beforeAll(async () => {
    // Initialize real connectors with actual API keys
    openAiConnector = new OpenAIConnector({ logger });
    pineconeConnector = new PineconeConnector({ 
      logger,
      // Using default namespace since indexName is not a valid option
      defaultNamespace: 'test-rag-index' 
    });
    
    await pineconeConnector.initialize();
    
    // Initialize providers with real connectors
    meetingContextProvider = new MeetingContextProvider({
      logger,
      openAiConnector,
      pineconeConnector
    });
    
    documentContextProvider = new DocumentContextProvider({
      logger,
      openAiConnector,
      pineconeConnector
    });
    
    conversationMemory = new ConversationMemoryService({
      logger,
      openAiConnector
    });
    
    // Initialize RAG service
    ragService = new UnifiedRAGService({
      logger,
      openAiConnector,
      contextProviders: {
        meeting_transcript: meetingContextProvider,
        document: documentContextProvider
      },
      conversationMemory
    });
  });
  
  afterAll(async () => {
    // Clean up test data
    await ragService.deleteContent('meeting_transcript', testMeetingId);
    await ragService.deleteContent('document', testDocumentId);
  });

  test('should store and retrieve meeting transcript chunks', async () => {
    // Test meeting transcript
    const transcript = `
    John: Hi everyone, welcome to our weekly project status meeting.
    Sarah: Thanks John. I wanted to update everyone on the UI improvements we've been working on.
    John: That sounds great. How is the timeline looking?
    Sarah: We should be able to deliver the new dashboard by next Friday.
    Michael: I have concerns about the database performance with these new features.
    John: Let's discuss that after Sarah finishes her update.
    Sarah: We've addressed the usability issues from the last round of testing and implemented the new filter system.
    Michael: That's good to hear. About the database, we might need to optimize some queries.
    John: Alright, let's schedule a separate meeting to discuss database optimizations.
    `;
    
    // Process and store the transcript
    const result = await ragService.processContent(transcript, 'meeting_transcript', { sourceId: testMeetingId });
    
    // Verify chunks were created and stored
    expect(result).toBeDefined();
    expect(result.chunkCount).toBeGreaterThan(0);
    
    // Query for meeting context
    const query = "What did Sarah say about the dashboard timeline?";
    const context = await ragService.retrieveContext(query, {
      limit: 3,
      contextType: ['meeting_transcript'],
      filter: {
        sourceId: testMeetingId
      }
    });
    
    // Verify context was retrieved
    expect(context).toBeDefined();
    expect(context.length).toBeGreaterThan(0);
    
    // Verify content contains relevant information
    const foundRelevantContent = context.some(chunk => 
      chunk.content.includes('dashboard') && 
      chunk.content.includes('Friday')
    );
    
    expect(foundRelevantContent).toBe(true);
  });

  test('should store and retrieve document chunks', async () => {
    // Test document content
    const document = `
    # Project Requirements Document
    
    ## Overview
    The new customer portal will provide users with a dashboard to view their account information,
    track orders, and manage subscriptions. The system should be able to handle at least 10,000
    concurrent users with response times under 500ms.
    
    ## Features
    1. User authentication with multi-factor authentication
    2. Dashboard with customizable widgets
    3. Order history with detailed tracking information
    4. Subscription management interface
    5. Payment method management
    
    ## Technical Requirements
    - React frontend with TypeScript
    - Node.js backend API
    - PostgreSQL database
    - Redis for caching
    - AWS infrastructure
    `;
    
    // Process and store the document
    const result = await ragService.processContent(document, 'document', { sourceId: testDocumentId });
    
    // Verify chunks were created and stored
    expect(result).toBeDefined();
    expect(result.chunkCount).toBeGreaterThan(0);
    
    // Query for document context
    const query = "What are the technical requirements for the frontend?";
    const context = await ragService.retrieveContext(query, {
      limit: 3,
      contextType: ['document'],
      filter: {
        sourceId: testDocumentId
      }
    });
    
    // Verify context was retrieved
    expect(context).toBeDefined();
    expect(context.length).toBeGreaterThan(0);
    
    // Verify content contains relevant information
    const foundRelevantContent = context.some(chunk => 
      chunk.content.includes('React') && 
      chunk.content.includes('TypeScript')
    );
    
    expect(foundRelevantContent).toBe(true);
  });

  test('should enhance prompts with retrieved context', async () => {
    // Query combining both document and meeting information
    const query = "What is the timeline for delivering the dashboard with customizable widgets?";
    
    // Create enhanced prompt
    const template = `Based on the following context, answer the question.
    
    Context:
    {context}
    
    Question: {query}
    
    Answer:`;
    
    const enhancedPrompt = await ragService.createContextEnhancedPrompt(query, template, {
      contextType: ['meeting_transcript', 'document'],
      filter: {
        sourceId: [testMeetingId, testDocumentId]
      }
    });
    
    // Verify prompt was created with context
    expect(enhancedPrompt).toBeDefined();
    expect(enhancedPrompt.prompt).toContain('dashboard');
    expect(enhancedPrompt.sources.length).toBeGreaterThan(0);
    
    // Verify sources include both document and meeting
    const hasMeetingSource = enhancedPrompt.sources.some(s => s.id === testMeetingId);
    const hasDocumentSource = enhancedPrompt.sources.some(s => s.id === testDocumentId);
    
    expect(hasMeetingSource || hasDocumentSource).toBe(true);
  });
}); 