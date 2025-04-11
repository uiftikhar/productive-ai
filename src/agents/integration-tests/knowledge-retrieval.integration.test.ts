///<reference types="jest" />
// @ts-nocheck
/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';
import { EmbeddingService } from '../../shared/embedding/embedding.service.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import {
  RagPromptManager,
  RagRetrievalStrategy,
} from '../../shared/services/rag-prompt-manager.service.ts';
import { KnowledgeRetrievalAgent } from '../specialized/knowledge-retrieval-agent.ts';
import { ContextType } from '../../shared/user-context/context-types.ts';
import { DocumentContextService } from '../../shared/user-context/services/document-context.service.ts';
import { ConversationContextService } from '../../shared/user-context/services/conversation-context.service.ts';
import { MeetingContextService } from '../../shared/user-context/services/meeting-context.service.ts';
import { RelevanceCalculationService } from '../../shared/user-context/services/relevance-calculation.service.ts';

// Mock dependencies
jest.mock('../../shared/services/rag-prompt-manager.service');
jest.mock('../../shared/embedding/embedding.service');
jest.mock('../../shared/user-context/services/document-context.service');
jest.mock('../../shared/user-context/services/conversation-context.service');
jest.mock('../../shared/user-context/services/meeting-context.service');
jest.mock('../../shared/user-context/services/relevance-calculation.service');
jest.mock('@langchain/core/messages', () => ({
  HumanMessage: jest
    .fn()
    .mockImplementation((props) => ({ content: props.content })),
}));

describe('KnowledgeRetrievalAgent Integration Tests', () => {
  // Use any to avoid TypeScript checking mocked implementations
  let knowledgeRetrievalAgent: any;
  let documentContextService: any;
  let conversationContextService: any;
  let meetingContextService: any;
  let relevanceCalculationService: any;
  let ragPromptManager: any;
  let embeddingService: any;
  let logger: ConsoleLogger;

  // Sample context items for testing
  const sampleContextItems = [
    {
      id: 'context-1',
      content: 'Important project milestone reached ahead of schedule.',
      source: 'meeting-notes',
      contextType: ContextType.DOCUMENT,
      score: 0.92,
      metadata: {
        userId: 'test-user-123',
        documentId: 'doc-123',
        documentTitle: 'Project Status Report',
        timestamp: Date.now() - 86400000, // 1 day ago
      },
    },
    {
      id: 'context-2',
      content: 'Team identified potential risks in the deployment plan.',
      source: 'risk-assessment',
      contextType: ContextType.CONVERSATION,
      score: 0.85,
      metadata: {
        userId: 'test-user-123',
        conversationId: 'conv-123',
        timestamp: Date.now() - 43200000, // 12 hours ago
      },
    },
    {
      id: 'context-3',
      content: 'Action item: Investigate performance issues in module X.',
      source: 'meeting',
      contextType: ContextType.MEETING,
      score: 0.78,
      metadata: {
        userId: 'test-user-123',
        meetingId: 'meeting-123',
        timestamp: Date.now() - 172800000, // 2 days ago
      },
    },
  ];

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mocked DocumentContextService
    documentContextService = new DocumentContextService();
    documentContextService.searchDocumentContent = jest
      .fn()
      .mockResolvedValue(
        sampleContextItems.filter(
          (item) => item.contextType === ContextType.DOCUMENT,
        ),
      );

    // Setup mocked ConversationContextService
    conversationContextService = new ConversationContextService();
    conversationContextService.searchConversations = jest
      .fn()
      .mockResolvedValue(
        sampleContextItems.filter(
          (item) => item.contextType === ContextType.CONVERSATION,
        ),
      );

    // Setup mocked MeetingContextService
    meetingContextService = new MeetingContextService();
    meetingContextService.findUnansweredQuestions = jest
      .fn()
      .mockResolvedValue(
        sampleContextItems.filter(
          (item) => item.contextType === ContextType.MEETING,
        ),
      );

    // Setup mocked RelevanceCalculationService
    relevanceCalculationService = new RelevanceCalculationService();
    relevanceCalculationService.calculateRelevanceScore = jest
      .fn()
      .mockReturnValue(0.85);

    // Setup mocked RagPromptManager
    ragPromptManager = new RagPromptManager();
    ragPromptManager.createRagPrompt = jest.fn().mockResolvedValue({
      messages: [{ role: 'user', content: 'test query' }],
      retrievedContext: {
        items: sampleContextItems,
        formattedContext: 'Formatted context for testing',
        sources: ['meeting-notes', 'risk-assessment'],
      },
    });
    ragPromptManager.storeRagInteraction = jest
      .fn()
      .mockResolvedValue('interaction-id');

    // Setup mocked EmbeddingService
    embeddingService = new EmbeddingService();
    embeddingService.createEmbeddings = jest.fn().mockResolvedValue({
      embeddings: [new Array(1536).fill(0).map((_, i) => i / 1536)],
    });

    // Setup logger
    logger = new ConsoleLogger();
    logger.setLogLevel('error'); // Reduce noise in tests

    // Setup mocked LLM for the agent
    const mockLlm = {
      invoke: jest.fn().mockResolvedValue({
        content: 'This is a test response from the LLM.',
      }),
    };

    // Create the KnowledgeRetrievalAgent instance
    knowledgeRetrievalAgent = new KnowledgeRetrievalAgent({
      documentContextService,
      conversationContextService,
      meetingContextService,
      relevanceCalculationService,
      ragPromptManager,
      embeddingService,
      logger,
    });

    // Mock the LLM
    knowledgeRetrievalAgent.llm = mockLlm;
  });

  test('Should retrieve knowledge successfully', async () => {
    // Prepare request
    const request = {
      input: 'What are the current project risks?',
      capability: 'retrieve_knowledge',
      context: {
        userId: 'test-user-123',
      },
      parameters: {
        maxItems: 5,
        minRelevanceScore: 0.7,
      },
    };

    // Execute the agent
    const response = await knowledgeRetrievalAgent.execute(request);

    // Test assertions
    expect(response).toBeDefined();
    expect(response.output).toBeDefined();
    expect(JSON.parse(response.output).length).toBeGreaterThan(0);

    // Verify that embeddings were created for the query
    expect(embeddingService.createEmbeddings).toHaveBeenCalledWith([
      request.input,
    ]);

    // Verify that document search was called
    expect(documentContextService.searchDocumentContent).toHaveBeenCalledWith(
      'test-user-123',
      expect.any(Array),
      expect.objectContaining({
        maxResults: expect.any(Number),
        minRelevanceScore: expect.any(Number),
      }),
    );

    // Verify that conversation search was called
    expect(conversationContextService.searchConversations).toHaveBeenCalledWith(
      'test-user-123',
      expect.any(Array),
      expect.objectContaining({
        maxResults: expect.any(Number),
        minRelevanceScore: expect.any(Number),
      }),
    );
  });

  test('Should answer with context successfully', async () => {
    // Prepare request
    const request = {
      input: 'Explain the current project status.',
      capability: 'answer_with_context',
      context: {
        userId: 'test-user-123',
        conversationId: 'test-conversation-123',
      },
      parameters: {
        retrievalOptions: {
          strategy: RagRetrievalStrategy.HYBRID,
          maxItems: 5,
          minRelevanceScore: 0.7,
        },
      },
    };

    // Execute the agent
    const response = await knowledgeRetrievalAgent.execute(request);

    // Test assertions
    expect(response).toBeDefined();
    expect(response.output).toBeDefined();
    expect(response.artifacts).toBeDefined();
    expect(response.artifacts.strategy).toBe(RagRetrievalStrategy.HYBRID);

    // Verify that embeddings were created for the query
    expect(embeddingService.createEmbeddings).toHaveBeenCalledWith([
      request.input,
    ]);

    // Verify that the RAG prompt was created
    expect(ragPromptManager.createRagPrompt).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      request.input,
      expect.objectContaining({
        userId: 'test-user-123',
        queryText: request.input,
        strategy: RagRetrievalStrategy.HYBRID,
      }),
    );

    // Verify that the RAG interaction was stored
    expect(ragPromptManager.storeRagInteraction).toHaveBeenCalledWith(
      'test-user-123',
      request.input,
      expect.any(Array),
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
      'test-conversation-123',
    );
  });

  test('Should handle empty search results gracefully', async () => {
    // Mock empty results
    documentContextService.searchDocumentContent = jest
      .fn()
      .mockResolvedValue([]);
    conversationContextService.searchConversations = jest
      .fn()
      .mockResolvedValue([]);
    meetingContextService.findUnansweredQuestions = jest
      .fn()
      .mockResolvedValue([]);

    // Prepare request
    const request = {
      input: 'Query with no results',
      capability: 'retrieve_knowledge',
      context: {
        userId: 'test-user-123',
      },
      parameters: {
        maxItems: 5,
        minRelevanceScore: 0.7,
      },
    };

    // Execute the agent
    const response = await knowledgeRetrievalAgent.execute(request);

    // Test assertions
    expect(response).toBeDefined();
    expect(JSON.parse(response.output)).toEqual([]);
    expect(response.artifacts).toBeDefined();
    expect(response.artifacts.resultsCount).toBe(0);
  });

  test('Should handle errors during retrieval', async () => {
    // Mock an error in document search
    documentContextService.searchDocumentContent = jest
      .fn()
      .mockRejectedValue(new Error('Test retrieval error'));

    // Prepare request
    const request = {
      input: 'Query that causes an error',
      capability: 'retrieve_knowledge',
      context: {
        userId: 'test-user-123',
      },
      parameters: {
        maxItems: 5,
        minRelevanceScore: 0.7,
      },
    };

    // Execute the agent and expect it to throw
    await expect(knowledgeRetrievalAgent.execute(request)).rejects.toThrow(
      'Test retrieval error',
    );
  });

  test('Should filter by specific context types', async () => {
    // Prepare request with context type filter
    const request = {
      input: 'Find information in documents only',
      capability: 'retrieve_knowledge',
      context: {
        userId: 'test-user-123',
      },
      parameters: {
        maxItems: 5,
        minRelevanceScore: 0.7,
        contextTypes: [ContextType.DOCUMENT],
      },
    };

    // Execute the agent
    const response = await knowledgeRetrievalAgent.execute(request);

    // Test assertions
    expect(response).toBeDefined();
    expect(JSON.parse(response.output).length).toBeGreaterThan(0);

    // Verify that only document search was used
    expect(documentContextService.searchDocumentContent).toHaveBeenCalled();
    expect(
      conversationContextService.searchConversations,
    ).not.toHaveBeenCalled();
    expect(
      meetingContextService.findUnansweredQuestions,
    ).not.toHaveBeenCalled();
  });
});
