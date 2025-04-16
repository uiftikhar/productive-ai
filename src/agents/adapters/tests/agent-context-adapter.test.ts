// @ts-nocheck
// src/agents/adapters/tests/agent-context-adapter.test.ts

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { AgentContextAdapter } from '../agent-context.adapter';
import { ConversationContextService } from '../../../shared/user-context/services/conversation-context.service';
import { DocumentContextService } from '../../../shared/user-context/services/document-context.service';
import { MemoryManagementService } from '../../../shared/user-context/services/memory-management.service';
import { KnowledgeGapService } from '../../../shared/user-context/services/knowledge-gap.service';
import { ContextType } from '../../../shared/user-context/types/context.types';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { AgentContext } from '../../interfaces/agent.interface';

// Mock all the context services
jest.mock(
  '../../../shared/user-context/services/conversation-context.service.ts',
);
jest.mock('../../../shared/user-context/services/document-context.service.ts');
jest.mock('../../../shared/user-context/services/memory-management.service.ts');
jest.mock('../../../shared/user-context/services/knowledge-gap.service.ts');

// Mock OpenAIEmbeddings
jest.mock('@langchain/openai', () => {
  const mockEmbedQuery = jest.fn().mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
  const mockEmbedDocuments = jest.fn().mockResolvedValue([
    [0.1, 0.2, 0.3, 0.4, 0.5],
    [0.6, 0.7, 0.8, 0.9, 1.0],
  ]);

  return {
    OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
      embedQuery: mockEmbedQuery,
      embedDocuments: mockEmbedDocuments,
    })),
  };
});

// Mock LangChainConfig
jest.mock('../../../langchain/config.ts', () => ({
  LangChainConfig: {
    embeddings: {
      model: 'text-embedding-3-large',
    },
  },
}));

describe('AgentContextAdapter', () => {
  let adapter: AgentContextAdapter;
  let mockConversationService: ConversationContextService;
  let mockDocumentService: DocumentContextService;
  let mockMemoryService: MemoryManagementService;
  let mockKnowledgeGapService: KnowledgeGapService;
  let mockLogger: ConsoleLogger;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as ConsoleLogger;

    // Create mock services
    mockConversationService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      getConversationHistory: jest.fn().mockResolvedValue([
        { role: 'user', content: 'Hello', timestamp: Date.now() - 60000 },
        {
          role: 'assistant',
          content: 'Hi there!',
          timestamp: Date.now() - 50000,
        },
      ]),
      storeConversationTurn: jest.fn().mockResolvedValue('conv-123'),
      storeUserContext: jest.fn().mockResolvedValue('ctx-123'),
      clearUserContext: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConversationContextService;

    mockDocumentService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      searchDocumentContent: jest.fn().mockResolvedValue([
        { documentId: 'doc1', content: 'Document content 1', relevance: 0.95 },
        { documentId: 'doc2', content: 'Document content 2', relevance: 0.85 },
      ]),
      storeDocumentChunk: jest.fn().mockResolvedValue('doc-123'),
      clearUserContext: jest.fn().mockResolvedValue(undefined),
    } as unknown as DocumentContextService;

    mockMemoryService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      retrieveUserContext: jest.fn().mockResolvedValue([
        { memoryId: 'mem1', content: 'Memory 1', importance: 0.8 },
        { memoryId: 'mem2', content: 'Memory 2', importance: 0.7 },
      ]),
      storeUserContext: jest.fn().mockResolvedValue('mem-123'),
      clearUserContext: jest.fn().mockResolvedValue(undefined),
    } as unknown as MemoryManagementService;

    mockKnowledgeGapService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      detectMissingInformation: jest.fn().mockResolvedValue([
        { topic: 'Topic 1', confidence: 0.9, details: 'Missing info 1' },
        { topic: 'Topic 2', confidence: 0.8, details: 'Missing info 2' },
      ]),
    } as unknown as KnowledgeGapService;

    // Create adapter with mocked dependencies
    adapter = new AgentContextAdapter({
      conversationContext: mockConversationService,
      documentContext: mockDocumentService,
      memoryContext: mockMemoryService,
      knowledgeGap: mockKnowledgeGapService,
      logger: mockLogger,
    });
  });

  test('initialize should initialize all context services', async () => {
    await adapter.initialize();

    expect(mockConversationService.initialize).toHaveBeenCalled();
    expect(mockDocumentService.initialize).toHaveBeenCalled();
    expect(mockMemoryService.initialize).toHaveBeenCalled();
    expect(mockKnowledgeGapService.initialize).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Initializing AgentContextAdapter',
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'AgentContextAdapter initialization complete',
    );
  });

  test('getContext should retrieve context from all available services', async () => {
    const userId = 'user123';
    const input = 'What is the meaning of life?';
    const options = {
      conversationId: 'conv123',
      sessionId: 'sess456',
      contextTypes: ['conversation', 'document', 'memory', 'knowledgeGap'],
      maxResults: 3,
    };

    const result = await adapter.getContext(userId, input, options);

    // Verify the OpenAIEmbeddings was used to generate embeddings
    const { OpenAIEmbeddings } = require('@langchain/openai');
    const mockEmbeddingsInstance = OpenAIEmbeddings.mock.results[0].value;
    expect(mockEmbeddingsInstance.embedQuery).toHaveBeenCalledWith(input);

    // Verify all services were called
    expect(mockConversationService.getConversationHistory).toHaveBeenCalledWith(
      userId,
      options.conversationId,
      20,
    );
    expect(mockDocumentService.searchDocumentContent).toHaveBeenCalled();
    expect(mockMemoryService.retrieveUserContext).toHaveBeenCalled();
    expect(mockKnowledgeGapService.detectMissingInformation).toHaveBeenCalled();

    // Verify the response shape
    expect(result).toHaveProperty('userId', userId);
    expect(result).toHaveProperty('conversationId', options.conversationId);
    expect(result).toHaveProperty('sessionId', options.sessionId);
    expect(result).toHaveProperty('metadata');
    expect(result.metadata).toHaveProperty('conversations');
    expect(result.metadata).toHaveProperty('documents');
    expect(result.metadata).toHaveProperty('memories');
    expect(result.metadata).toHaveProperty('knowledgeGaps');
    expect(result.metadata).toHaveProperty('input', input);
    expect(result.metadata).toHaveProperty('timestamp');
  });

  test('storeContext should store context in the appropriate service based on context type', async () => {
    const userId = 'user123';
    const content = 'This is important information to remember.';

    // Test storing conversation context
    await adapter.storeContext(userId, content, {
      contextType: ContextType.CONVERSATION,
      conversationId: 'conv123',
      role: 'assistant',
    });

    expect(mockConversationService.storeConversationTurn).toHaveBeenCalledWith(
      userId,
      'conv123',
      content,
      expect.any(Array), // embeddings
      'assistant',
      undefined,
      expect.any(Object),
    );

    // Test storing document context
    await adapter.storeContext(userId, content, {
      contextType: ContextType.DOCUMENT,
      documentId: 'doc123',
      documentTitle: 'Important Document',
    });

    expect(mockDocumentService.storeDocumentChunk).toHaveBeenCalledWith(
      userId,
      'doc123',
      'Important Document',
      content,
      expect.any(Array), // embeddings
      0,
      1,
      expect.any(Object),
    );

    // Test storing memory context
    await adapter.storeContext(userId, content, {
      contextType: 'memory',
      memoryType: 'general',
      importance: 0.8,
    });

    expect(mockMemoryService.storeUserContext).toHaveBeenCalledWith(
      userId,
      content,
      expect.any(Array), // embeddings
      expect.objectContaining({
        memoryType: 'general',
        importance: 0.8,
      }),
    );
  });

  test('clearContext should clear context from all services when contextType is all', async () => {
    const userId = 'user123';

    await adapter.clearContext(userId, { contextTypes: ['all'] });

    expect(mockConversationService.clearUserContext).toHaveBeenCalledWith(
      userId,
    );
    expect(mockDocumentService.clearUserContext).not.toHaveBeenCalled();
    expect(mockMemoryService.clearUserContext).not.toHaveBeenCalled();
  });

  test('clearContext should only clear context from specified services', async () => {
    const userId = 'user123';

    await adapter.clearContext(userId, {
      contextTypes: ['conversation', 'document'],
    });

    expect(mockConversationService.clearUserContext).toHaveBeenCalledWith(
      userId,
    );
    expect(mockDocumentService.clearUserContext).toHaveBeenCalledWith(userId);
    expect(mockMemoryService.clearUserContext).not.toHaveBeenCalled();
  });

  test('getContext should handle service errors gracefully', async () => {
    const userId = 'user123';
    const input = 'What is the meaning of life?';

    // Make one of the services throw an error
    mockDocumentService.searchDocumentContent.mockRejectedValueOnce(
      new Error('Service unavailable'),
    );

    // Should not throw
    const result = await adapter.getContext(userId, input);

    // Error should be logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error retrieving document context',
      expect.any(Object),
    );

    // Result should still contain other contexts
    expect(result).toHaveProperty('userId', userId);
    expect(result.metadata).toHaveProperty('documents', []);
  });
});
