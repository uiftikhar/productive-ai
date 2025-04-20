import { KnowledgeRetrievalAgent } from '../../specialized/knowledge-retrieval-agent';
import { DocumentContextService } from '../../../shared/user-context/services/document-context.service';
import { ConversationContextService } from '../../../shared/user-context/services/conversation-context.service';
import { MeetingContextService } from '../../../shared/user-context/services/meeting-context.service';
import { RelevanceCalculationService } from '../../../shared/user-context/services/relevance-calculation.service';
import { RagPromptManager, RagRetrievalStrategy } from '../../../shared/services/rag-prompt-manager.service';
import { EmbeddingService } from '../../../shared/services/embedding.service';
import { OpenAIConnector } from '../../integrations/openai-connector';
import { Logger } from '../../../shared/logger/logger.interface';
import { ContextType } from '../../../shared/user-context/context-types';
import { MockLogger } from '../mocks/mock-logger';

// Define the MockLoggerType
interface MockLoggerType extends Logger {
  messages: Array<{level: string, message: string, meta?: any}>;
  clear(): void;
  getLogsByLevel(level: string): Array<{level: string, message: string, meta?: any}>;
  hasMessage(messageSubstring: string, level?: string): boolean;
  currentLogLevel: string;
}

// Declare the global mockLogger
declare global {
  var mockLogger: MockLoggerType;
}

// Mock service implementations
jest.mock('../../../shared/user-context/services/document-context.service');
jest.mock('../../../shared/user-context/services/conversation-context.service');
jest.mock('../../../shared/user-context/services/meeting-context.service');
jest.mock('../../../shared/user-context/services/relevance-calculation.service');
jest.mock('../../../shared/services/rag-prompt-manager.service');
jest.mock('../../../shared/services/embedding.service');
jest.mock('../../integrations/openai-connector');

describe('KnowledgeRetrievalAgent Integration', () => {
  let agent: KnowledgeRetrievalAgent;
  let mockDocumentContextService: jest.Mocked<DocumentContextService>;
  let mockConversationContextService: jest.Mocked<ConversationContextService>;
  let mockMeetingContextService: jest.Mocked<MeetingContextService>;
  let mockRelevanceCalculationService: jest.Mocked<RelevanceCalculationService>;
  let mockRagPromptManager: jest.Mocked<RagPromptManager>;
  let mockEmbeddingService: jest.Mocked<EmbeddingService>;
  let mockOpenAIConnector: jest.Mocked<OpenAIConnector>;

  // Sample context search results
  const sampleDocumentContext = [
    {
      id: 'doc1',
      content: 'This is a sample document about AI',
      source: 'document.pdf',
      contextType: ContextType.DOCUMENT,
      metadata: { title: 'AI Documentation', timestamp: Date.now() - 86400000 },
      score: 0.85
    },
    {
      id: 'doc2',
      content: 'Machine learning concepts and applications',
      source: 'ml-guide.pdf',
      contextType: ContextType.DOCUMENT,
      metadata: { title: 'ML Guide', timestamp: Date.now() - 172800000 },
      score: 0.75
    }
  ];

  const sampleConversationContext = [
    {
      id: 'conv1',
      content: 'Let\'s discuss the AI project timeline',
      source: 'conversation-1234',
      contextType: ContextType.CONVERSATION,
      metadata: { title: 'AI Project Discussion', timestamp: Date.now() - 43200000 },
      score: 0.8
    }
  ];

  const sampleMeetingContext = [
    {
      id: 'meeting1',
      content: 'We need to prioritize the ML model training',
      source: 'meeting-5678',
      contextType: ContextType.MEETING,
      metadata: { title: 'Project Planning Meeting', timestamp: Date.now() - 129600000 },
      score: 0.7
    }
  ];

  beforeEach(() => {
    // Clear the global mockLogger
    global.mockLogger.clear();
    
    // Create mock document context service
    mockDocumentContextService = {
      searchDocumentContent: jest.fn().mockResolvedValue(sampleDocumentContext),
      initialize: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<DocumentContextService>;
    
    // Create mock conversation context service
    mockConversationContextService = {
      searchConversations: jest.fn().mockResolvedValue(sampleConversationContext),
      initialize: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<ConversationContextService>;
    
    // Create mock meeting context service
    mockMeetingContextService = {
      findUnansweredQuestions: jest.fn().mockResolvedValue(sampleMeetingContext),
      initialize: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<MeetingContextService>;
    
    // Create mock relevance calculation service
    mockRelevanceCalculationService = {
      calculateRelevanceScore: jest.fn().mockReturnValue(0.9),
      initialize: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<RelevanceCalculationService>;
    
    // Create mock rag prompt manager
    mockRagPromptManager = {
      createRagPrompt: jest.fn().mockResolvedValue({
        messages: [
          { role: 'system', content: 'You are a knowledge assistant' },
          { role: 'user', content: 'Tell me about AI' }
        ],
        retrievedContext: {
          items: [...sampleDocumentContext, ...sampleConversationContext],
          sources: ['document.pdf', 'conversation-1234']
        }
      }),
      storeRagInteraction: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<RagPromptManager>;
    
    // Create mock embedding service
    mockEmbeddingService = {
      generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
      initialize: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<EmbeddingService>;
    
    // Create mock OpenAI connector
    mockOpenAIConnector = {
      initialize: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<OpenAIConnector>;

    // Create agent instance with mocked dependencies
    agent = new KnowledgeRetrievalAgent({
      documentContextService: mockDocumentContextService,
      conversationContextService: mockConversationContextService,
      meetingContextService: mockMeetingContextService,
      relevanceCalculationService: mockRelevanceCalculationService,
      ragPromptManager: mockRagPromptManager,
      embeddingService: mockEmbeddingService,
      openAIConnector: mockOpenAIConnector,
      logger: global.mockLogger,
      llm: {
        invoke: jest.fn().mockResolvedValue({
          content: 'AI is a field of computer science that focuses on creating machines that can perform tasks typically requiring human intelligence.'
        }),
        modelName: 'gpt-4-test'
      } as any
    });
  });

  test('should initialize successfully', async () => {
    await agent.initialize();
    
    expect(agent.getInitializationStatus()).toBe(true);
    expect(global.mockLogger.hasMessage('Knowledge Retrieval Agent initialized', 'info')).toBe(true);
  });

  test('should register the correct capabilities', () => {
    const capabilities = agent.getCapabilities();
    
    // Should have 2 capabilities
    expect(capabilities).toHaveLength(2);
    
    // Verify specific capabilities
    const retrieveCapability = capabilities.find(c => c.name === 'retrieve_knowledge');
    const answerCapability = capabilities.find(c => c.name === 'answer_with_context');
    
    expect(retrieveCapability).toBeDefined();
    expect(answerCapability).toBeDefined();
  });

  test('should correctly check if it can handle capabilities', () => {
    expect(agent.canHandle('retrieve_knowledge')).toBe(true);
    expect(agent.canHandle('answer_with_context')).toBe(true);
    expect(agent.canHandle('unknown_capability')).toBe(false);
  });

  test('should retrieve knowledge from user context', async () => {
    await agent.initialize();
    
    const response = await agent.execute({
      input: 'Tell me about AI',
      capability: 'retrieve_knowledge',
      context: {
        userId: 'user123'
      }
    });
    
    // Verify the embedding service was called to generate embeddings
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('Tell me about AI');
    
    // Verify document context service was queried
    expect(mockDocumentContextService.searchDocumentContent).toHaveBeenCalled();
    
    // Verify conversation context service was queried
    expect(mockConversationContextService.searchConversations).toHaveBeenCalled();
    
    // Verify meeting context service was queried
    expect(mockMeetingContextService.findUnansweredQuestions).toHaveBeenCalled();
    
    // Verify successful execution
    expect(response.output).toBeDefined();
    
    // Parse and verify the output format
    const results = JSON.parse(String(response.output));
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    
    // Check the structure of the results
    const firstResult = results[0];
    expect(firstResult).toHaveProperty('content');
    expect(firstResult).toHaveProperty('source');
    expect(firstResult).toHaveProperty('contextType');
    expect(firstResult).toHaveProperty('score');
    
    // Verify metrics
    expect(response.metrics).toBeDefined();
    expect(response.metrics?.executionTimeMs).toBeGreaterThan(0);
  });

  test('should answer questions using context', async () => {
    await agent.initialize();
    
    const response = await agent.execute({
      input: 'What is AI?',
      capability: 'answer_with_context',
      context: {
        userId: 'user123',
        conversationId: 'conv456'
      }
    });
    
    // Verify embedding was generated
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('What is AI?');
    
    // Verify RAG was used to create a prompt
    expect(mockRagPromptManager.createRagPrompt).toHaveBeenCalled();
    
    // Verify the interaction was stored
    expect(mockRagPromptManager.storeRagInteraction).toHaveBeenCalled();
    
    // Verify successful execution
    expect(response.output).toBeDefined();
    expect(typeof response.output).toBe('string');
    expect(String(response.output)).toContain('AI');
    
    // Verify artifacts
    expect(response.artifacts).toBeDefined();
    expect(response.artifacts?.query).toBe('What is AI?');
    expect(response.artifacts?.contextSources).toBeDefined();
    
    // Verify metrics
    expect(response.metrics).toBeDefined();
    expect(response.metrics?.executionTimeMs).toBeGreaterThan(0);
  });

  test('should pass optional parameters correctly for knowledge retrieval', async () => {
    await agent.initialize();
    
    await agent.execute({
      input: 'Tell me about ML',
      capability: 'retrieve_knowledge',
      context: {
        userId: 'user123'
      },
      parameters: {
        maxItems: 3,
        minRelevanceScore: 0.7,
        contextTypes: [ContextType.DOCUMENT, ContextType.CONVERSATION],
        timeRangeStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        timeRangeEnd: new Date()
      }
    });
    
    // Verify the search was called at least once
    expect(mockDocumentContextService.searchDocumentContent).toHaveBeenCalled();
    
    // Verify parameters were passed correctly - with type assertion
    const searchCallArgs = mockDocumentContextService.searchDocumentContent.mock.calls[0][2] as any;
    expect(searchCallArgs.maxResults).toBe(3);
    expect(searchCallArgs.minRelevanceScore).toBe(0.7);
  });

  test('should handle retrieval strategy parameters for answer_with_context', async () => {
    await agent.initialize();
    
    await agent.execute({
      input: 'Explain machine learning',
      capability: 'answer_with_context',
      context: {
        userId: 'user123'
      },
      parameters: {
        retrievalOptions: {
          strategy: RagRetrievalStrategy.SEMANTIC,
          maxItems: 2,
          minRelevanceScore: 0.8,
          contextTypes: [ContextType.DOCUMENT]
        }
      }
    });
    
    // Verify parameters were passed correctly to RAG prompt manager
    const ragOptions = mockRagPromptManager.createRagPrompt.mock.calls[0][3];
    expect(ragOptions.strategy).toBe(RagRetrievalStrategy.SEMANTIC);
    expect(ragOptions.maxItems).toBe(2);
    expect(ragOptions.minRelevanceScore).toBe(0.8);
    expect(ragOptions.contentTypes).toEqual([ContextType.DOCUMENT]);
  });

  test('should handle error when no query is provided', async () => {
    await agent.initialize();
    
    const response = await agent.execute({
      input: '',
      capability: 'retrieve_knowledge',
      context: {
        userId: 'user123'
      }
    });
    
    // Verify error was handled and returned in the output
    expect(response.output).toContain('Error: No query provided');
  });

  test('should handle error when no user ID is provided', async () => {
    await agent.initialize();
    
    const response = await agent.execute({
      input: 'Tell me about AI',
      capability: 'retrieve_knowledge',
      context: {}
    });
    
    // Verify error was handled and returned in the output
    expect(response.output).toContain('Error: User ID is required');
  });

  test('should handle error for unsupported capability', async () => {
    await agent.initialize();
    
    const response = await agent.execute({
      input: 'Tell me about AI',
      capability: 'unsupported_capability',
      context: {
        userId: 'user123'
      }
    });
    
    // Verify error was handled and returned in the output
    expect(response.output).toContain('Error: Capability not supported');
  });

  test('should handle embedding generation errors', async () => {
    await agent.initialize();
    
    // Force embedding generation to fail
    mockEmbeddingService.generateEmbedding.mockRejectedValueOnce(
      new Error('Embedding generation failed')
    );
    
    const response = await agent.execute({
      input: 'Tell me about AI',
      capability: 'retrieve_knowledge',
      context: {
        userId: 'user123'
      }
    });
    
    // Verify error was handled and returned in the output
    expect(response.output).toContain('Error: Embedding generation failed');
  });

  test('should handle context service failures', async () => {
    await agent.initialize();
    
    // Force document context service to fail
    mockDocumentContextService.searchDocumentContent.mockRejectedValueOnce(
      new Error('Document service unavailable')
    );
    
    const response = await agent.execute({
      input: 'Tell me about AI',
      capability: 'retrieve_knowledge',
      context: {
        userId: 'user123'
      }
    });
    
    // Verify error was handled and returned in the output
    expect(response.output).toContain('Error: Document service unavailable');
  });
}); 