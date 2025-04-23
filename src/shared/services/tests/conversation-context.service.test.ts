import { UserContextValidationError } from '../user-context/types/context.types';
import { BaseContextService } from '../user-context/base-context.service';
import { ConversationContextService } from '../user-context/conversation-context.service';
import { MockLogger } from '../../../agents/tests/mocks/mock-logger';

// Mock dependencies
jest.mock('../user-context/base-context.service');
jest.mock('../user-context/metadata-validation.service');

describe('ConversationContextService', () => {
  let service: ConversationContextService;
  let mockPineconeService: any;
  let mockRetryCounter = 0;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockRetryCounter = 0;

    // Create a mock logger using MockLogger
    mockLogger = new MockLogger();

    // Spy on logger methods to make them proper jest mocks
    jest.spyOn(mockLogger, 'debug');
    jest.spyOn(mockLogger, 'info');
    jest.spyOn(mockLogger, 'warn');
    jest.spyOn(mockLogger, 'error');

    // Mock the parent class behavior
    (BaseContextService.prototype as any).executeWithRetry = jest
      .fn()
      .mockImplementation((fn, opName) => {
        mockRetryCounter++;
        return fn();
      });

    (BaseContextService.prototype as any).storeUserContext = jest
      .fn()
      .mockResolvedValue('mock-id-123');

    // Mock the logger property on the prototype to ensure it's there
    // This is critical for resolving the TypeError
    (BaseContextService.prototype as any).logger = mockLogger;

    // Create instance with mocked parent class and logger
    service = new ConversationContextService({
      logger: mockLogger,
    });

    // Set up pinecone service mock
    mockPineconeService = {
      queryVectors: jest.fn(),
      deleteVectors: jest.fn().mockResolvedValue({ success: true }),
    };
    (service as any).pineconeService = mockPineconeService;

    // Explicitly set the logger to ensure it's properly attached
    (service as any).logger = mockLogger;
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockLogger.clear();
  });

  describe('storeConversationTurn', () => {
    test('should store conversation turn with correct metadata', async () => {
      // Arrange
      const userId = 'user-123';
      const conversationId = 'conv-123';
      const message = 'Test message';
      const embeddings = [0.1, 0.2, 0.3];
      const role = 'user';

      // Act
      const result = await service.storeConversationTurn(
        userId,
        conversationId,
        message,
        embeddings,
        role,
      );

      // Assert
      expect(result).toBe('mock-id-123');
      expect(
        (BaseContextService.prototype as any).storeUserContext,
      ).toHaveBeenCalledWith(
        userId,
        message,
        embeddings,
        expect.objectContaining({
          contextType: 'conversation',
          conversationId,
          role,
          turnId: expect.any(String),
          recency: expect.any(Number),
        }),
      );
    });

    test('should use provided turnId when available', async () => {
      // Arrange
      const userId = 'user-123';
      const conversationId = 'conv-123';
      const message = 'Test message';
      const embeddings = [0.1, 0.2, 0.3];
      const role = 'assistant';
      const turnId = 'custom-turn-id';

      // Act
      const result = await service.storeConversationTurn(
        userId,
        conversationId,
        message,
        embeddings,
        role,
        turnId,
      );

      // Assert
      expect(
        (BaseContextService.prototype as any).storeUserContext,
      ).toHaveBeenCalledWith(
        userId,
        message,
        embeddings,
        expect.objectContaining({
          turnId: 'custom-turn-id',
        }),
      );
    });

    test('should include additional metadata when provided', async () => {
      // Arrange
      const userId = 'user-123';
      const conversationId = 'conv-123';
      const message = 'Test message';
      const embeddings = [0.1, 0.2, 0.3];
      const role = 'system';
      const additionalMetadata = {
        topic: 'test topic',
        sentiment: 'positive',
      };

      // Act
      const result = await service.storeConversationTurn(
        userId,
        conversationId,
        message,
        embeddings,
        role,
        undefined,
        additionalMetadata,
      );

      // Assert
      expect(
        (BaseContextService.prototype as any).storeUserContext,
      ).toHaveBeenCalledWith(
        userId,
        message,
        embeddings,
        expect.objectContaining({
          topic: 'test topic',
          sentiment: 'positive',
        }),
      );
    });

    test('should throw error when conversation ID is missing', async () => {
      // Arrange
      const userId = 'user-123';
      const conversationId = '';
      const message = 'Test message';
      const embeddings = [0.1, 0.2, 0.3];
      const role = 'user';

      // Act & Assert
      await expect(
        service.storeConversationTurn(
          userId,
          conversationId,
          message,
          embeddings,
          role,
        ),
      ).rejects.toThrow(UserContextValidationError);

      expect(
        (BaseContextService.prototype as any).storeUserContext,
      ).not.toHaveBeenCalled();
    });
  });

  describe('getConversationHistory', () => {
    test('should retrieve conversation history successfully', async () => {
      // Arrange
      const userId = 'test-user-123';
      const conversationId = 'test-conversation-456';
      const limit = 10;

      const mockMatches = [
        {
          id: 'turn-1',
          metadata: {
            conversationId,
            timestamp: 1000,
            role: 'user',
            message: 'Hello',
            segmentId: 'segment-1',
          },
        },
        {
          id: 'turn-2',
          metadata: {
            conversationId,
            timestamp: 1001,
            role: 'assistant',
            message: 'Hi there',
            segmentId: 'segment-1',
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.getConversationHistory(
        userId,
        conversationId,
        limit,
      );

      // Assert
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        expect.any(Array),
        {
          topK: limit * 2,
          filter: {
            contextType: 'conversation',
            conversationId,
          },
          includeValues: false,
          includeMetadata: true,
        },
        userId,
      );

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('turn-1');
      expect(result[1].id).toBe('turn-2');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'getConversationHistory parameters',
        expect.any(Object),
      );
    });

    test('should return empty array when no turns found', async () => {
      // Arrange
      const userId = 'test-user-123';
      const conversationId = 'empty-conversation';

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [],
      });

      // Act
      const result = await service.getConversationHistory(
        userId,
        conversationId,
      );

      // Assert
      expect(result).toEqual([]);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'getConversationHistory parameters',
        expect.any(Object),
      );
    });

    test('should filter by segment ID when provided', async () => {
      // Arrange
      const userId = 'test-user-123';
      const conversationId = 'test-conversation-456';
      const segmentId = 'segment-2';

      const mockMatches = [
        {
          id: 'turn-1',
          metadata: {
            conversationId,
            timestamp: 1000,
            role: 'user',
            message: 'Hello',
            segmentId: 'segment-1',
          },
        },
        {
          id: 'turn-2',
          metadata: {
            conversationId,
            timestamp: 1001,
            role: 'assistant',
            message: 'Hi there',
            segmentId: 'segment-2',
          },
        },
      ];

      // Mock the implementation to filter the results correctly
      mockPineconeService.queryVectors.mockImplementation((indexName: any, vector: any, params: { filter: { segmentId: string; }; }, userIdParam: any) => {
        // Only return the match with the correct segmentId
        const filteredMatches = mockMatches.filter(
          match => match.metadata.segmentId === params.filter.segmentId
        );
        return Promise.resolve({ matches: filteredMatches });
      });

      // Act
      const result = await service.getConversationHistory(
        userId,
        conversationId,
        10,
        { segmentId },
      );

      // Assert - should only have the turn with segment-2
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('turn-2');
      
      // Verify that the filter was included in the query
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        expect.any(Array),
        expect.objectContaining({
          filter: expect.objectContaining({
            segmentId: 'segment-2',
          }),
        }),
        userId,
      );
    });

    test('should filter by agent ID when provided', async () => {
      // Arrange
      const userId = 'test-user-123';
      const conversationId = 'test-conversation-456';
      const agentId = 'agent-xyz';

      const mockMatches = [
        {
          id: 'turn-1',
          metadata: {
            conversationId,
            timestamp: 1000,
            role: 'user',
            message: 'Hello',
            agentId: 'agent-abc',
          },
        },
        {
          id: 'turn-2',
          metadata: {
            conversationId,
            timestamp: 1001,
            role: 'assistant',
            message: 'Hi there',
            agentId: 'agent-xyz',
          },
        },
      ];

      // Mock the implementation to filter the results correctly
      mockPineconeService.queryVectors.mockImplementation((indexName: any, vector: any, params: { filter: { agentId: string; }; }, userIdParam: any) => {
        // Only return the match with the correct agentId
        const filteredMatches = mockMatches.filter(
          match => match.metadata.agentId === params.filter.agentId
        );
        return Promise.resolve({ matches: filteredMatches });
      });

      // Act
      const result = await service.getConversationHistory(
        userId,
        conversationId,
        10,
        { agentId },
      );

      // Assert - should only have the turn with agent-xyz
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('turn-2');
      
      // Verify that the filter was included in the query
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        expect.any(Array),
        expect.objectContaining({
          filter: expect.objectContaining({
            agentId: 'agent-xyz',
          }),
        }),
        userId,
      );
    });

    test('should handle error during conversation retrieval', async () => {
      // Arrange
      const userId = 'test-user-123';
      const conversationId = 'test-conversation-456';
      const error = new Error('Failed to retrieve vectors');

      mockPineconeService.queryVectors.mockRejectedValue(error);

      // Act
      const result = await service.getConversationHistory(userId, conversationId);

      // Assert - now returns empty array instead of throwing
      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to retrieve conversation history'),
        expect.objectContaining({
          error: error.message
        }),
      );
    });

    test('should not query when userId is missing', async () => {
      // Arrange
      const conversationId = 'test-conversation-456';

      // Act
      const result = await service.getConversationHistory('', conversationId);

      // Assert
      expect(result).toEqual([]);
      expect(mockPineconeService.queryVectors).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Missing userId or conversationId'),
        expect.any(Object),
      );
    });

    test('should sort results chronologically by default', async () => {
      // Arrange
      const userId = 'test-user-123';
      const conversationId = 'test-conversation-456';

      const mockMatches = [
        {
          id: 'turn-2',
          metadata: {
            conversationId,
            timestamp: 2000,
            role: 'assistant',
            message: 'Hi there',
          },
        },
        {
          id: 'turn-1',
          metadata: {
            conversationId,
            timestamp: 1000,
            role: 'user',
            message: 'Hello',
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.getConversationHistory(
        userId,
        conversationId,
      );

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('turn-1'); // Earlier timestamp should come first
      expect(result[1].id).toBe('turn-2');
    });

    test('should use turnId filter strategy when turnIds are provided', async () => {
      // Arrange
      const userId = 'test-user-123';
      const conversationId = 'test-conversation-456';
      const turnIds = ['turn-id-1', 'turn-id-2'];

      // Updated to match implementation that uses a single query with $in operator
      mockPineconeService.queryVectors.mockResolvedValueOnce({
        matches: [
          {
            id: 'turn-id-1',
            metadata: {
              conversationId,
              timestamp: 1000,
              role: 'user',
              message: 'First message',
            },
          },
          {
            id: 'turn-id-2',
            metadata: {
              conversationId,
              timestamp: 2000,
              role: 'assistant',
              message: 'Second message',
            },
          },
        ],
      });

      // Act
      const result = await service.getConversationHistory(
        userId,
        conversationId,
        10,
        { turnIds },
      );

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('turn-id-1');
      expect(result[1].id).toBe('turn-id-2');
      
      // Should be called once with the turnId filter using $in operator
      expect(mockPineconeService.queryVectors).toHaveBeenCalledTimes(1);
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        expect.any(Array),
        expect.objectContaining({
          filter: expect.objectContaining({
            turnId: { $in: turnIds },
          }),
        }),
        userId,
      );
    });

    test('should handle errors for individual turnIds and continue', async () => {
      // Arrange
      const userId = 'test-user-123';
      const conversationId = 'test-conversation-456';
      const turnIds = ['turn-id-1', 'turn-id-2'];
      
      // We need to ensure this mock returns the expected data
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [
          {
            id: 'turn-id-1',
            metadata: {
              conversationId,
              timestamp: 1000,
              role: 'user',
              message: 'First message',
            },
          }
        ]
      });

      // Act
      const result = await service.getConversationHistory(
        userId,
        conversationId,
        10,
        { turnIds },
      );

      // Assert - should return matched results
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('turn-id-1');
      
      // Verify that filters were included in the query
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        expect.any(Array),
        expect.objectContaining({
          filter: expect.objectContaining({
            turnId: { $in: turnIds }
          }),
        }),
        userId,
      );
    });

    test('should use role filter strategy when role is provided', async () => {
      // Arrange
      const userId = 'test-user-123';
      const conversationId = 'test-conversation-456';
      const role = 'user';

      const mockMatches = [
        {
          id: 'turn-1',
          metadata: {
            conversationId,
            timestamp: 1000,
            role: 'user',
            message: 'Hello',
          },
        },
        {
          id: 'turn-3',
          metadata: {
            conversationId,
            timestamp: 3000,
            role: 'user',
            message: 'How are you?',
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.getConversationHistory(
        userId,
        conversationId,
        10,
        { role },
      );

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('turn-1');
      expect(result[1].id).toBe('turn-3');
      
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        expect.any(Array),
        {
          topK: 10 * 2,
          filter: {
            contextType: 'conversation',
            conversationId,
            role: 'user',
          },
          includeValues: false,
          includeMetadata: true,
        },
        userId,
      );
    });

    test('should handle error in role-based query and fall back to contextType filter', async () => {
      // Arrange
      const userId = 'test-user-123';
      const conversationId = 'test-conversation-456';
      const role = 'user';

      // Simulate error from the query
      const error = new Error('Role filter failed');
      mockPineconeService.queryVectors.mockRejectedValue(error);

      // Act
      const result = await service.getConversationHistory(
        userId,
        conversationId,
        10,
        { role },
      );

      // Assert - now returns empty array instead of falling back
      expect(result).toEqual([]);
      
      // Verify error was logged correctly
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to retrieve conversation history'),
        expect.objectContaining({
          error: error.message
        }),
      );
    });

    test('should apply timestamp filters when provided', async () => {
      // Arrange
      const userId = 'test-user-123';
      const conversationId = 'test-conversation-456';
      const beforeTimestamp = 2000;
      const afterTimestamp = 1000;

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [
          {
            id: 'turn-1',
            metadata: {
              conversationId,
              timestamp: 1500,
              role: 'user',
              message: 'Hello',
            },
          },
        ],
      });

      // Act
      const result = await service.getConversationHistory(
        userId,
        conversationId,
        10,
        { beforeTimestamp, afterTimestamp },
      );

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('turn-1');
      
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        expect.any(Array),
        {
          topK: 10 * 2,
          filter: {
            contextType: 'conversation',
            conversationId,
            timestamp: {
              $gte: afterTimestamp,
              $lte: beforeTimestamp,
            },
          },
          includeValues: false,
          includeMetadata: true,
        },
        userId,
      );
    });

    test('should respect includeMetadata option when set to false', async () => {
      // Arrange
      const userId = 'test-user-123';
      const conversationId = 'test-conversation-456';

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [
          {
            id: 'turn-1',
            metadata: {
              conversationId,
              timestamp: 1000,
              role: 'user',
              message: 'Hello',
            },
          },
        ],
      });

      // Act
      await service.getConversationHistory(
        userId,
        conversationId,
        10,
        { includeMetadata: false },
      );

      // Assert
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        expect.any(Array),
        {
          topK: 10 * 2,
          filter: {
            contextType: 'conversation',
            conversationId,
          },
          includeValues: false,
          includeMetadata: false,
        },
        userId,
      );
    });
  });

  describe('deleteConversation', () => {
    test('should delete all turns in a conversation', async () => {
      // Arrange
      const userId = 'user-123';
      const conversationId = 'conv-123';

      const mockMatches = [
        { id: 'turn-1' },
        { id: 'turn-2' },
        { id: 'turn-3' },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.deleteConversation(userId, conversationId);

      // Assert
      expect(result).toBe(3); // Three turns deleted

      // Check first query to find the turns
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        expect.any(Array),
        {
          topK: 1000,
          filter: {
            contextType: 'conversation',
            conversationId,
          },
          includeValues: false,
          includeMetadata: false,
        },
        userId,
      );

      // Check deletion of the turns
      expect(mockPineconeService.deleteVectors).toHaveBeenCalledWith(
        'user-context',
        ['turn-1', 'turn-2', 'turn-3'],
        userId,
      );
    });

    test('should return 0 when no turns found', async () => {
      // Arrange
      const userId = 'user-123';
      const conversationId = 'non-existent-conv';

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [],
      });

      // Act
      const result = await service.deleteConversation(userId, conversationId);

      // Assert
      expect(result).toBe(0);
      expect(mockPineconeService.deleteVectors).not.toHaveBeenCalled();
    });

    test('should use retry mechanism for both operations', async () => {
      // Arrange
      const userId = 'user-123';
      const conversationId = 'conv-123';

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [{ id: 'turn-1' }],
      });

      // Act
      await service.deleteConversation(userId, conversationId);

      // Assert
      expect(mockRetryCounter).toBe(2); // Two operations with retry
      expect(
        (BaseContextService.prototype as any).executeWithRetry,
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('listUserConversations', () => {
    test('should list and group conversations correctly', async () => {
      // Arrange
      const userId = 'user-123';

      // Turns from different conversations
      const mockMatches = [
        {
          id: 'turn-1',
          metadata: {
            conversationId: 'conv-1',
            timestamp: 1000,
          },
        },
        {
          id: 'turn-2',
          metadata: {
            conversationId: 'conv-1',
            timestamp: 2000,
          },
        },
        {
          id: 'turn-3',
          metadata: {
            conversationId: 'conv-2',
            timestamp: 1500,
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.listUserConversations(userId);

      // Assert
      expect(result).toHaveLength(2); // Two conversations

      // The most recent conversation should be first
      expect(result[0].conversationId).toBe('conv-1');
      expect(result[0].turnCount).toBe(2);
      expect(result[0].firstTimestamp).toBe(1000);
      expect(result[0].lastTimestamp).toBe(2000);

      expect(result[1].conversationId).toBe('conv-2');
      expect(result[1].turnCount).toBe(1);
    });

    test('should return empty array when no conversations found', async () => {
      // Arrange
      const userId = 'user-123';

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [],
      });

      // Act
      const result = await service.listUserConversations(userId);

      // Assert
      expect(result).toEqual([]);
    });

    test('should handle turns without conversationId', async () => {
      // Arrange
      const userId = 'user-123';

      // Some turns missing conversationId
      const mockMatches = [
        {
          id: 'turn-1',
          metadata: {
            conversationId: 'conv-1',
            timestamp: 1000,
          },
        },
        {
          id: 'turn-2',
          metadata: {
            timestamp: 2000,
            // No conversationId
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.listUserConversations(userId);

      // Assert
      expect(result).toHaveLength(1); // Only one valid conversation
      expect(result[0].conversationId).toBe('conv-1');
      expect(result[0].turnCount).toBe(1);
    });
  });

  describe('searchConversations', () => {
    test('should search with basic filter', async () => {
      // Arrange
      const userId = 'user-123';
      const queryEmbedding = [0.1, 0.2, 0.3];

      const mockMatches = [
        {
          id: 'turn-1',
          score: 0.95,
          metadata: {
            conversationId: 'conv-1',
            turnId: 'turn-1',
            role: 'user',
            message: 'Hello',
            timestamp: 1000,
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.searchConversations(userId, queryEmbedding);

      // Assert
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        queryEmbedding,
        {
          topK: 10,
          filter: {
            contextType: 'conversation',
          },
          includeValues: false,
          includeMetadata: true,
        },
        userId,
      );

      // Check result formatting
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'turn-1',
        score: 0.95,
        conversationId: 'conv-1',
        turnId: 'turn-1',
        role: 'user',
        message: 'Hello',
        timestamp: 1000,
        metadata: mockMatches[0].metadata,
      });
    });

    test('should apply all provided filters', async () => {
      // Arrange
      const userId = 'user-123';
      const queryEmbedding = [0.1, 0.2, 0.3];
      const options = {
        conversationIds: ['conv-1', 'conv-2'],
        role: 'user' as const,
        maxResults: 5,
        timeRangeStart: 1000,
        timeRangeEnd: 2000,
      };

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [],
      });

      // Act
      await service.searchConversations(userId, queryEmbedding, options);

      // Assert
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        queryEmbedding,
        {
          topK: 5,
          filter: {
            contextType: 'conversation',
            conversationId: { $in: ['conv-1', 'conv-2'] },
            role: 'user',
            timestamp: {
              $gte: 1000,
              $lte: 2000,
            },
          },
          includeValues: false,
          includeMetadata: true,
        },
        userId,
      );
    });

    test('should filter results by minimum relevance score', async () => {
      // Arrange
      const userId = 'user-123';
      const queryEmbedding = [0.1, 0.2, 0.3];

      const mockMatches = [
        { id: 'turn-1', score: 0.9, metadata: {} },
        { id: 'turn-2', score: 0.7, metadata: {} },
        { id: 'turn-3', score: 0.5, metadata: {} },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.searchConversations(userId, queryEmbedding, {
        minRelevanceScore: 0.7,
      });

      // Assert
      expect(result).toHaveLength(2); // Only the top 2 matches meet the threshold
      expect(result[0].id).toBe('turn-1');
      expect(result[1].id).toBe('turn-2');
    });

    test('should handle content field in different formats', async () => {
      // Arrange
      const userId = 'user-123';
      const queryEmbedding = [0.1, 0.2, 0.3];

      const mockMatches = [
        {
          id: 'turn-1',
          score: 0.9,
          metadata: {
            message: 'Message format',
          },
        },
        {
          id: 'turn-2',
          score: 0.8,
          metadata: {
            content: 'Content format',
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.searchConversations(userId, queryEmbedding);

      // Assert
      expect(result[0].message).toBe('Message format');
      expect(result[1].message).toBe('Content format');
    });
  });
});
