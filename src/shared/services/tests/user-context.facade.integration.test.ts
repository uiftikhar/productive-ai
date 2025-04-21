import { UserContextFacade } from '../user-context/user-context.facade';
import { BaseContextService } from '../user-context/base-context.service';
import { ConversationContextService } from '../user-context/conversation-context.service';
import { DocumentContextService } from '../user-context/document-context.service';
import { MemoryManagementService } from '../user-context/memory-management.service';
import { IntegrationService } from '../user-context/integration.service';
import {
  ContextType,
  BaseContextMetadata,
} from '../user-context/types/context.types';
import { PineconeConnectionService } from '../../../pinecone/pinecone-connection.service';
import { RecordMetadata } from '@pinecone-database/pinecone';
import { Logger } from '../../logger/logger.interface';

// Define type for MockLogger
interface MockLoggerType extends Logger {
  messages: Array<{ level: string; message: string; meta?: any }>;
  clear(): void;
  getLogsByLevel(
    level: string,
  ): Array<{ level: string; message: string; meta?: any }>;
  hasMessage(messageSubstring: string, level?: string): boolean;
  currentLogLevel: string;
}

// Define the global mockLogger for TypeScript
declare global {
  var mockLogger: MockLoggerType;
}

// Mock all the underlying services
jest.mock('../user-context/base-context.service');
jest.mock('../user-context/conversation-context.service');
jest.mock('../user-context/document-context.service');
jest.mock('../user-context/memory-management.service');
jest.mock('../user-context/integration.service');
jest.mock('../user-context/metadata-validation.service', () => {
  return {
    MetadataValidationService: jest.fn().mockImplementation(() => ({
      validate: jest.fn().mockReturnValue(true),
    })),
  };
});

// Mock Pinecone service
jest.mock('../../../pinecone/pinecone-connection.service');

describe('UserContextFacade Integration', () => {
  let userContextFacade: UserContextFacade;
  let mockBaseContextService: jest.Mocked<BaseContextService>;
  let mockConversationContextService: jest.Mocked<ConversationContextService>;
  let mockDocumentContextService: jest.Mocked<DocumentContextService>;
  let mockMemoryManagementService: jest.Mocked<MemoryManagementService>;
  let mockIntegrationService: jest.Mocked<IntegrationService>;
  let mockPineconeService: jest.Mocked<PineconeConnectionService>;
  let mockLogger: MockLoggerType;

  const testUserId = 'test-user-123';
  const testContextData = 'This is test context data for vector embeddings';
  const testEmbedding = new Array(1536).fill(0.1);
  const testMetadata = {
    contextType: ContextType.CONVERSATION,
    conversationId: 'test-conversation-123',
    timestamp: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock logger
    mockLogger = global.mockLogger || {
      messages: [],
      currentLogLevel: 'info',
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      setContext: jest.fn(),
      clearContext: jest.fn(),
      clear: jest.fn(),
      getLogsByLevel: jest.fn(),
      hasMessage: jest.fn(),
    };

    // Setup mock Pinecone service
    mockPineconeService =
      new PineconeConnectionService() as jest.Mocked<PineconeConnectionService>;

    // Setup mock services
    mockBaseContextService =
      new BaseContextService() as jest.Mocked<BaseContextService>;
    mockConversationContextService =
      new ConversationContextService() as jest.Mocked<ConversationContextService>;
    mockDocumentContextService =
      new DocumentContextService() as jest.Mocked<DocumentContextService>;
    mockMemoryManagementService =
      new MemoryManagementService() as jest.Mocked<MemoryManagementService>;
    mockIntegrationService =
      new IntegrationService() as jest.Mocked<IntegrationService>;

    // Setup success response for storeUserContext
    mockBaseContextService.storeUserContext = jest
      .fn()
      .mockResolvedValue('context-id-123');
    mockBaseContextService.batchStoreUserContext = jest
      .fn()
      .mockResolvedValue(['id-1', 'id-2']);
    mockBaseContextService.retrieveUserContext = jest.fn().mockResolvedValue([
      { id: 'item-1', content: 'Content 1', score: 0.9, metadata: {} },
      { id: 'item-2', content: 'Content 2', score: 0.8, metadata: {} },
    ]);
    mockBaseContextService.clearUserContext = jest
      .fn()
      .mockResolvedValue(undefined);
    mockBaseContextService.initialize = jest.fn().mockResolvedValue(undefined);

    // Setup mock conversation history with separate method
    // to avoid TypeScript issues with complex return types
    const mockConversationHistory = [
      {
        id: 'turn-1',
        content: 'User message',
        metadata: {
          role: 'user',
          timestamp: Date.now(),
        },
      },
      {
        id: 'turn-2',
        content: 'Assistant response',
        metadata: {
          role: 'assistant',
          timestamp: Date.now(),
        },
      },
    ];

    mockConversationContextService.storeConversationTurn = jest
      .fn()
      .mockResolvedValue('turn-id-123');
    mockConversationContextService.getConversationHistory = jest
      .fn()
      .mockResolvedValue(mockConversationHistory);

    // Setup mock document chunks with separate method
    // to avoid TypeScript issues with complex return types
    const mockDocumentChunks = [
      {
        id: 'chunk-1',
        content: 'Document content part 1',
        metadata: {
          chunkIndex: 0,
          timestamp: Date.now(),
        },
      },
      {
        id: 'chunk-2',
        content: 'Document content part 2',
        metadata: {
          chunkIndex: 1,
          timestamp: Date.now(),
        },
      },
    ];

    mockDocumentContextService.storeDocumentChunk = jest
      .fn()
      .mockResolvedValue('doc-chunk-id-123');
    mockDocumentContextService.getDocumentChunks = jest
      .fn()
      .mockResolvedValue(mockDocumentChunks);

    // Setup success response for memory management service
    mockMemoryManagementService.reinforceMemory = jest
      .fn()
      .mockResolvedValue(undefined);
    mockMemoryManagementService.connectMemories = jest
      .fn()
      .mockResolvedValue(undefined);

    // Setup success response for integration service
    mockIntegrationService.integrateActionItemWithExternalSystem = jest
      .fn()
      .mockResolvedValue('ext-123');
    mockIntegrationService.syncExternalSystemStatuses = jest
      .fn()
      .mockResolvedValue(5);

    // Setup mock implementations for constructors
    (BaseContextService as jest.Mock).mockImplementation(
      () => mockBaseContextService,
    );
    (ConversationContextService as jest.Mock).mockImplementation(
      () => mockConversationContextService,
    );
    (DocumentContextService as jest.Mock).mockImplementation(
      () => mockDocumentContextService,
    );
    (MemoryManagementService as jest.Mock).mockImplementation(
      () => mockMemoryManagementService,
    );
    (IntegrationService as jest.Mock).mockImplementation(
      () => mockIntegrationService,
    );
    (PineconeConnectionService as jest.Mock).mockImplementation(
      () => mockPineconeService,
    );

    // Create the facade with the mocked dependencies
    userContextFacade = new UserContextFacade({
      pineconeService: mockPineconeService,
      logger: mockLogger,
    });
  });

  describe('Basic Context Operations', () => {
    test('initialize should initialize BaseContextService', async () => {
      await userContextFacade.initialize();
      expect(mockBaseContextService.initialize).toHaveBeenCalled();
    });

    test('storeUserContext should delegate to BaseContextService', async () => {
      const result = await userContextFacade.storeUserContext(
        testUserId,
        testContextData,
        testEmbedding,
        testMetadata,
      );

      expect(mockBaseContextService.storeUserContext).toHaveBeenCalledWith(
        testUserId,
        testContextData,
        testEmbedding,
        testMetadata,
      );
      expect(result).toBe('context-id-123');
    });

    test('batchStoreUserContext should delegate to BaseContextService', async () => {
      const entries = [
        {
          contextData: 'Entry 1',
          embeddings: testEmbedding,
          metadata: testMetadata,
        },
        {
          contextData: 'Entry 2',
          embeddings: testEmbedding,
          metadata: testMetadata,
        },
      ];

      const result = await userContextFacade.batchStoreUserContext(
        testUserId,
        entries,
      );

      expect(mockBaseContextService.batchStoreUserContext).toHaveBeenCalledWith(
        testUserId,
        entries,
      );
      expect(result).toEqual(['id-1', 'id-2']);
    });

    test('retrieveUserContext should delegate to BaseContextService', async () => {
      const options = { topK: 5, includeEmbeddings: true };
      const result = await userContextFacade.retrieveUserContext(
        testUserId,
        testEmbedding,
        options,
      );

      expect(mockBaseContextService.retrieveUserContext).toHaveBeenCalledWith(
        testUserId,
        testEmbedding,
        options,
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('item-1');
    });

    test('clearUserContext should delegate to BaseContextService', async () => {
      await userContextFacade.clearUserContext(testUserId);
      expect(mockBaseContextService.clearUserContext).toHaveBeenCalledWith(
        testUserId,
      );
    });
  });

  describe('Conversation Context Operations', () => {
    test('storeConversationTurn should delegate to ConversationContextService', async () => {
      const result = await userContextFacade.storeConversationTurn(
        testUserId,
        'conv-123',
        'Hello AI assistant',
        testEmbedding,
        'user',
      );

      expect(
        mockConversationContextService.storeConversationTurn,
      ).toHaveBeenCalledWith(
        testUserId,
        'conv-123',
        'Hello AI assistant',
        testEmbedding,
        'user',
        undefined,
        {},
      );
      expect(result).toBe('turn-id-123');
    });

    test('getConversationHistory should delegate to ConversationContextService', async () => {
      const result = await userContextFacade.getConversationHistory(
        testUserId,
        'conv-123',
        10,
      );

      expect(
        mockConversationContextService.getConversationHistory,
      ).toHaveBeenCalledWith(testUserId, 'conv-123', 10, {});
      expect(result).toHaveLength(2);
      expect(result[0].metadata?.role).toBe('user');
    });
  });

  describe('Document Context Operations', () => {
    test('storeDocumentChunk should delegate to DocumentContextService', async () => {
      const result = await userContextFacade.storeDocumentChunk(
        testUserId,
        'doc-123',
        'Test Document',
        'Document content',
        testEmbedding,
        0,
        2,
      );

      expect(
        mockDocumentContextService.storeDocumentChunk,
      ).toHaveBeenCalledWith(
        testUserId,
        'doc-123',
        'Test Document',
        'Document content',
        testEmbedding,
        0,
        2,
        {},
      );
      expect(result).toBe('doc-chunk-id-123');
    });

    test('getDocumentChunks should delegate to DocumentContextService', async () => {
      const result = await userContextFacade.getDocumentChunks(
        testUserId,
        'doc-123',
      );

      expect(mockDocumentContextService.getDocumentChunks).toHaveBeenCalledWith(
        testUserId,
        'doc-123',
      );
      expect(result).toHaveLength(2);
      expect(result[0].metadata?.chunkIndex).toBe(0);
    });
  });

  describe('Memory Management Operations', () => {
    test('reinforceMemory should delegate to MemoryManagementService', async () => {
      await userContextFacade.reinforceMemory(testUserId, 'context-123', 0.5);

      expect(mockMemoryManagementService.reinforceMemory).toHaveBeenCalledWith(
        testUserId,
        'context-123',
        0.5,
      );
    });

    test('connectMemories should delegate to MemoryManagementService', async () => {
      await userContextFacade.connectMemories(
        testUserId,
        'source-123',
        'target-123',
        0.7,
      );

      expect(mockMemoryManagementService.connectMemories).toHaveBeenCalledWith(
        testUserId,
        'source-123',
        'target-123',
        0.7,
      );
    });
  });

  describe('Integration Operations', () => {
    test('integrateActionItemWithExternalSystem should delegate to IntegrationService', async () => {
      const result =
        await userContextFacade.integrateActionItemWithExternalSystem(
          testUserId,
          'action-123',
          'jira',
          undefined,
          { priority: 'high' },
        );

      expect(
        mockIntegrationService.integrateActionItemWithExternalSystem,
      ).toHaveBeenCalledWith(testUserId, 'action-123', 'jira', undefined, {
        priority: 'high',
      });
      expect(result).toBe('ext-123');
    });

    test('syncExternalSystemStatuses should delegate to IntegrationService', async () => {
      const result = await userContextFacade.syncExternalSystemStatuses(
        testUserId,
        'jira',
      );

      expect(
        mockIntegrationService.syncExternalSystemStatuses,
      ).toHaveBeenCalledWith(testUserId, 'jira');
      expect(result).toBe(5);
    });
  });

  describe('Advanced RAG Context Retrieval', () => {
    test('retrieveRagContext should apply filters correctly', async () => {
      const options = {
        topK: 5,
        minScore: 0.7,
        contextTypes: [ContextType.DOCUMENT, ContextType.MEETING],
        conversationId: 'conv-123',
        documentIds: ['doc-1', 'doc-2'],
        timeRangeStart: Date.now() - 86400000, // 1 day ago
        timeRangeEnd: Date.now(),
      };

      // Mock more items to test minScore filtering
      mockBaseContextService.retrieveUserContext = jest.fn().mockResolvedValue([
        { id: 'item-1', content: 'Content 1', score: 0.95, metadata: {} },
        { id: 'item-2', content: 'Content 2', score: 0.85, metadata: {} },
        { id: 'item-3', content: 'Content 3', score: 0.65, metadata: {} }, // Below minScore
        { id: 'item-4', content: 'Content 4', score: 0.75, metadata: {} },
      ]);

      const result = await userContextFacade.retrieveRagContext(
        testUserId,
        testEmbedding,
        options,
      );

      // Verify the filter object passed to baseContextService
      expect(mockBaseContextService.retrieveUserContext).toHaveBeenCalledWith(
        testUserId,
        testEmbedding,
        expect.objectContaining({
          topK: 5,
          filter: expect.objectContaining({
            contextType: { $in: [ContextType.DOCUMENT, ContextType.MEETING] },
            conversationId: 'conv-123',
            documentId: { $in: ['doc-1', 'doc-2'] },
            timestamp: expect.objectContaining({
              $gte: expect.any(Number),
              $lte: expect.any(Number),
            }),
          }),
        }),
      );

      // Verify items below minScore were filtered out
      expect(result).toHaveLength(3); // Only items with score >= 0.7
      expect(result.map((item) => item.id)).toEqual([
        'item-1',
        'item-2',
        'item-4',
      ]);
    });
  });
});
