/**
 * Integration tests for the RagPromptManager service
 * 
 * These tests connect to the real Pinecone and OpenAI services to test vector embeddings
 * and semantic search. They are intended to be run manually, not in the CI pipeline.
 * 
 * To run the tests:
 * 1. Set up your .env file with Pinecone and OpenAI API keys
 * 2. Run: TEST_USE_MOCK_MODE=false npm test -- rag-prompt-manager-integration.test.ts
 */

import { RagPromptManager, RagRetrievalStrategy } from '../rag-prompt-manager.service';
import { OpenAIConnector } from '../../../connectors/openai-connector';
import { PineconeConnector } from '../../../connectors/pinecone-connector';
import { ConsoleLogger } from '../../logger/console-logger';
import { AgentConfigService } from '../../config/agent-config.service';
import { SystemRoleEnum } from '../../prompts/prompt-types';
import { InstructionTemplateNameEnum } from '../../prompts/instruction-templates';
import { v4 as uuidv4 } from 'uuid';

// Test configuration
const useMockMode = process.env.TEST_USE_MOCK_MODE !== 'false';
const logger = new ConsoleLogger();
// Fix for setVerbose not being a standard method - implement it ad hoc if needed
if (typeof (logger as any).setVerbose === 'function') {
  (logger as any).setVerbose(true);
}

describe('RagPromptManager Integration Tests', () => {
  let ragPromptManager: RagPromptManager;
  let openAiConnector: OpenAIConnector;
  let pineconeConnector: PineconeConnector;
  const testUserId = `test-user-${uuidv4().slice(0, 8)}`;
  
  beforeAll(async () => {
    // Initialize the config service
    const configService = AgentConfigService.getInstance();
    configService.updateConfig({
      useMockMode,
      openai: {
        ...configService.getOpenAIConfig(),
        // Use a less expensive model for testing
        modelName: 'gpt-3.5-turbo',
        embeddingModelName: 'text-embedding-3-small'
      }
    });
    
    logger.info(`Running tests in ${useMockMode ? 'MOCK' : 'REAL API'} mode`);
    
    // Initialize the connectors
    openAiConnector = new OpenAIConnector({
      logger,
      modelConfig: configService.getOpenAIConfig()
    });
    
    pineconeConnector = new PineconeConnector({
      logger,
      defaultNamespace: 'test-namespace'
    });
    
    // Initialize Pinecone if not using mock mode
    if (!useMockMode) {
      await pineconeConnector.initialize();
    }
    
    // Create the RAG prompt manager
    ragPromptManager = new RagPromptManager({
      openAiConnector,
      pineconeConnector,
      logger,
      useMockMode
    });
  });

  afterAll(async () => {
    // Clean up test data
    if (!useMockMode) {
      try {
        // Delete test vectors
        await pineconeConnector.deleteVectorsByFilter(
          'meeting-analysis', 
          { userId: testUserId },
          'test-namespace'
        );
        logger.info('Cleaned up test vectors');
      } catch (error) {
        logger.error(`Error cleaning up: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });
  
  // Skip tests that use real API calls when in mock mode
  const testWithAPI = useMockMode ? test.skip : test;
  
  test('should generate embeddings', async () => {
    const text = 'This is a test document for embedding generation';
    const embedding = await ragPromptManager.generateEmbedding(text);
    
    expect(embedding).toBeDefined();
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);
    
    // In mock mode, we expect a specific size
    if (useMockMode) {
      expect(embedding.length).toBe(1536);
    }
  });
  
  testWithAPI('should store and retrieve vectors from Pinecone', async () => {
    // Only run this test when not in mock mode
    
    // Generate a test document with embedding
    const testDocument = {
      id: `test-doc-${uuidv4()}`,
      content: 'This is a test meeting transcript about product roadmap planning and mobile development priorities.',
      metadata: {
        userId: testUserId,
        type: 'meeting',
        title: 'Product Roadmap Planning',
        date: new Date().toISOString(),
        source: 'integration-test'
      }
    };
    
    // Generate embedding for the test document
    const embedding = await ragPromptManager.generateEmbedding(testDocument.content);
    
    // Store the vector in Pinecone
    await pineconeConnector.storeVector(
      'meeting-analysis',
      testDocument.id,
      embedding,
      {
        ...testDocument.metadata,
        content: testDocument.content
      },
      'test-namespace'
    );
    
    logger.info(`Stored test vector with ID: ${testDocument.id}`);
    
    // Wait a moment for consistency
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test semantic search
    const queryText = 'mobile roadmap priorities';
    const queryEmbedding = await ragPromptManager.generateEmbedding(queryText);
    
    const searchResults = await pineconeConnector.querySimilar(
      'meeting-analysis',
      queryEmbedding,
      {
        topK: 5,
        filter: { userId: testUserId },
        includeValues: false
      },
      'test-namespace'
    );
    
    // Verify results
    expect(searchResults).toBeDefined();
    expect(Array.isArray(searchResults)).toBe(true);
    expect(searchResults.length).toBeGreaterThan(0);
    
    // At least one result should be our test document
    const foundDocument = searchResults.find(result => result.id === testDocument.id);
    expect(foundDocument).toBeDefined();
  });
  
  test('should create RAG prompt with context', async () => {
    // Query to test
    const query = 'What were the mobile development priorities discussed?';
    
    // Generate embedding
    const queryEmbedding = await ragPromptManager.generateEmbedding(query);
    
    // Create a RAG prompt
    const ragPromptResult = await ragPromptManager.createRagPrompt(
      SystemRoleEnum.MEETING_ANALYST,
      InstructionTemplateNameEnum.MEETING_ANALYSIS_CHUNK,
      query,
      {
        userId: testUserId,
        queryText: query,
        queryEmbedding,
        strategy: RagRetrievalStrategy.SEMANTIC,
        maxItems: 3,
        minRelevanceScore: 0.6
      }
    );
    
    // Verify the result
    expect(ragPromptResult).toBeDefined();
    expect(ragPromptResult.messages).toBeDefined();
    expect(Array.isArray(ragPromptResult.messages)).toBe(true);
    expect(ragPromptResult.messages.length).toBeGreaterThan(0);
    
    // Verify the context
    expect(ragPromptResult.retrievedContext).toBeDefined();
    expect(ragPromptResult.retrievedContext.items).toBeDefined();
    
    // Log the prompt for manual inspection
    logger.info('Generated RAG prompt:', { 
      messages: ragPromptResult.messages.map(m => ({ role: m.role, contentLength: m.content.length })),
      contextItems: ragPromptResult.retrievedContext.items.length,
      systemRole: ragPromptResult.systemRole,
      templateName: ragPromptResult.templateName
    });
  });
  
  testWithAPI('should optimize RAG prompt based on context', async () => {
    // Only run with real API
    
    // Store several test documents if not in mock mode
    if (!useMockMode) {
      const testDocuments = [
        {
          id: `test-doc-mobile-${uuidv4().slice(0, 8)}`,
          content: 'The mobile app development team reported that they need to prioritize the iOS version first due to the larger user base on that platform. The Android version will follow two months later.',
          type: 'meeting'
        },
        {
          id: `test-doc-budget-${uuidv4().slice(0, 8)}`,
          content: 'The budget for Q3 mobile development has been increased by 20% to accommodate the new features requested by the marketing team.',
          type: 'report'
        },
        {
          id: `test-doc-timeline-${uuidv4().slice(0, 8)}`,
          content: 'Project timeline for mobile app v2.0: Design phase - 2 weeks, Development - 6 weeks, QA - 2 weeks, Release - week of September 15.',
          type: 'document'
        }
      ];
      
      // Store each document
      for (const doc of testDocuments) {
        const embedding = await ragPromptManager.generateEmbedding(doc.content);
        await pineconeConnector.storeVector(
          'meeting-analysis',
          doc.id,
          embedding,
          {
            userId: testUserId,
            content: doc.content,
            type: doc.type,
            source: `test-${doc.type}`,
            timestamp: Date.now()
          },
          'test-namespace'
        );
      }
      
      logger.info(`Stored ${testDocuments.length} test documents`);
      
      // Wait for consistency
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Create optimized RAG prompt
    const query = 'What is the timeline for the mobile app development?';
    const queryEmbedding = await ragPromptManager.generateEmbedding(query);
    
    const optimizedPrompt = await ragPromptManager.createOptimizedRagPrompt(
      query,
      {
        userId: testUserId,
        queryText: query,
        queryEmbedding,
        strategy: RagRetrievalStrategy.HYBRID,
        maxItems: 5
      },
      {
        taskType: 'analysis',
        audience: 'technical',
        requiresCitations: true
      }
    );
    
    // Verify results
    expect(optimizedPrompt).toBeDefined();
    expect(optimizedPrompt.messages).toBeDefined();
    expect(optimizedPrompt.retrievedContext).toBeDefined();
    
    // In real mode, we expect usedComponents to be populated
    if (!useMockMode) {
      expect(optimizedPrompt.usedComponents).toBeDefined();
      expect(Array.isArray(optimizedPrompt.usedComponents)).toBe(true);
    }
    
    // Log the optimized prompt
    logger.info('Generated optimized RAG prompt:', {
      messageCount: optimizedPrompt.messages.length,
      contextItems: optimizedPrompt.retrievedContext.items.length,
      usedComponents: optimizedPrompt.usedComponents
    });
  });
}); 