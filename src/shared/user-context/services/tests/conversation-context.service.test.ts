import { ConversationContextService } from '../conversation-context.service';
import { MetadataValidationService } from '../metadata-validation.service';
import { UserContextValidationError } from '../../types/context.types';
import { BaseContextService } from '../base-context.service';

// Mock dependencies
jest.mock('../base-context.service');
jest.mock('../metadata-validation.service');

describe('ConversationContextService', () => {
  let service: ConversationContextService;
  let mockPineconeService: any;
  let mockRetryCounter = 0;
  
  beforeEach(() => {
    mockRetryCounter = 0;
    
    // Mock the parent class behavior
    (BaseContextService.prototype as any).executeWithRetry = jest.fn().mockImplementation((fn, opName) => {
      mockRetryCounter++;
      return fn();
    });

    (BaseContextService.prototype as any).storeUserContext = jest.fn().mockResolvedValue('mock-id-123');
    
    // Create instance with mocked parent class
    service = new ConversationContextService();
    
    // Set up pinecone service mock
    mockPineconeService = {
      queryVectors: jest.fn(),
      deleteVectors: jest.fn().mockResolvedValue({ success: true })
    };
    (service as any).pineconeService = mockPineconeService;
  });
  
  afterEach(() => {
    jest.clearAllMocks();
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
        role
      );
      
      // Assert
      expect(result).toBe('mock-id-123');
      expect((BaseContextService.prototype as any).storeUserContext).toHaveBeenCalledWith(
        userId,
        message,
        embeddings,
        expect.objectContaining({
          contextType: 'conversation',
          conversationId,
          role,
          turnId: expect.any(String),
          recency: expect.any(Number)
        })
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
        turnId
      );
      
      // Assert
      expect((BaseContextService.prototype as any).storeUserContext).toHaveBeenCalledWith(
        userId,
        message,
        embeddings,
        expect.objectContaining({
          turnId: 'custom-turn-id'
        })
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
        sentiment: 'positive'
      };
      
      // Act
      const result = await service.storeConversationTurn(
        userId,
        conversationId,
        message,
        embeddings,
        role,
        undefined,
        additionalMetadata
      );
      
      // Assert
      expect((BaseContextService.prototype as any).storeUserContext).toHaveBeenCalledWith(
        userId,
        message,
        embeddings,
        expect.objectContaining({
          topic: 'test topic',
          sentiment: 'positive'
        })
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
      await expect(service.storeConversationTurn(
        userId,
        conversationId,
        message,
        embeddings,
        role
      )).rejects.toThrow(UserContextValidationError);
      
      expect((BaseContextService.prototype as any).storeUserContext).not.toHaveBeenCalled();
    });
  });
  
  describe('getConversationHistory', () => {
    test('should retrieve conversation history with correct filter', async () => {
      // Arrange
      const userId = 'user-123';
      const conversationId = 'conv-123';
      const limit = 10;
      
      const mockMatches = [
        { 
          id: 'match-1', 
          metadata: { 
            timestamp: 1000, 
            role: 'user', 
            content: 'Hello'
          }
        },
        { 
          id: 'match-2', 
          metadata: { 
            timestamp: 2000, 
            role: 'assistant', 
            content: 'Hi there'
          }
        }
      ];
      
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches
      });
      
      // Act
      const result = await service.getConversationHistory(userId, conversationId, limit);
      
      // Assert
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        expect.any(Array),
        {
          topK: limit,
          filter: {
            contextType: 'conversation',
            conversationId
          },
          includeValues: false,
          includeMetadata: true
        },
        userId
      );
      
      expect(result).toHaveLength(2);
      expect(result).toEqual(mockMatches.sort((a, b) => a.metadata.timestamp - b.metadata.timestamp));
    });
    
    test('should apply timestamp filter when beforeTimestamp is provided', async () => {
      // Arrange
      const userId = 'user-123';
      const conversationId = 'conv-123';
      const limit = 10;
      const beforeTimestamp = 1500;
      
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: []
      });
      
      // Act
      await service.getConversationHistory(userId, conversationId, limit, beforeTimestamp);
      
      // Assert
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        expect.any(Array),
        {
          topK: limit,
          filter: {
            contextType: 'conversation',
            conversationId,
            timestamp: { $lt: beforeTimestamp }
          },
          includeValues: false,
          includeMetadata: true
        },
        userId
      );
    });
    
    test('should sort results by timestamp', async () => {
      // Arrange
      const userId = 'user-123';
      const conversationId = 'conv-123';
      
      // Out of order timestamps
      const mockMatches = [
        { id: 'match-3', metadata: { timestamp: 3000 } },
        { id: 'match-1', metadata: { timestamp: 1000 } },
        { id: 'match-2', metadata: { timestamp: 2000 } }
      ];
      
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches
      });
      
      // Act
      const result = await service.getConversationHistory(userId, conversationId);
      
      // Assert
      expect(result[0].id).toBe('match-1');
      expect(result[1].id).toBe('match-2');
      expect(result[2].id).toBe('match-3');
    });
    
    test('should use retry mechanism', async () => {
      // Arrange
      const userId = 'user-123';
      const conversationId = 'conv-123';
      
      mockPineconeService.queryVectors.mockResolvedValue({ matches: [] });
      
      // Act
      await service.getConversationHistory(userId, conversationId);
      
      // Assert
      expect(mockRetryCounter).toBe(1);
      expect((BaseContextService.prototype as any).executeWithRetry).toHaveBeenCalledWith(
        expect.any(Function),
        `getConversationHistory:${userId}:${conversationId}`
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
        { id: 'turn-3' }
      ];
      
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches
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
            conversationId
          },
          includeValues: false,
          includeMetadata: false
        },
        userId
      );
      
      // Check deletion of the turns
      expect(mockPineconeService.deleteVectors).toHaveBeenCalledWith(
        'user-context',
        ['turn-1', 'turn-2', 'turn-3'],
        userId
      );
    });
    
    test('should return 0 when no turns found', async () => {
      // Arrange
      const userId = 'user-123';
      const conversationId = 'non-existent-conv';
      
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: []
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
        matches: [{ id: 'turn-1' }]
      });
      
      // Act
      await service.deleteConversation(userId, conversationId);
      
      // Assert
      expect(mockRetryCounter).toBe(2); // Two operations with retry
      expect((BaseContextService.prototype as any).executeWithRetry).toHaveBeenCalledTimes(2);
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
            timestamp: 1000 
          } 
        },
        { 
          id: 'turn-2', 
          metadata: { 
            conversationId: 'conv-1', 
            timestamp: 2000 
          } 
        },
        { 
          id: 'turn-3', 
          metadata: { 
            conversationId: 'conv-2', 
            timestamp: 1500 
          } 
        }
      ];
      
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches
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
        matches: []
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
            timestamp: 1000 
          } 
        },
        { 
          id: 'turn-2', 
          metadata: { 
            timestamp: 2000 
            // No conversationId
          } 
        }
      ];
      
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches
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
            timestamp: 1000 
          } 
        }
      ];
      
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches
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
            contextType: 'conversation'
          },
          includeValues: false,
          includeMetadata: true
        },
        userId
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
        metadata: mockMatches[0].metadata
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
        timeRangeEnd: 2000
      };
      
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: []
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
              $lte: 2000
            }
          },
          includeValues: false,
          includeMetadata: true
        },
        userId
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
        matches: mockMatches
      });
      
      // Act
      const result = await service.searchConversations(userId, queryEmbedding, {
        minRelevanceScore: 0.7
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
            message: 'Message format' 
          } 
        },
        { 
          id: 'turn-2', 
          score: 0.8,
          metadata: { 
            content: 'Content format' 
          } 
        }
      ];
      
      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches
      });
      
      // Act
      const result = await service.searchConversations(userId, queryEmbedding);
      
      // Assert
      expect(result[0].message).toBe('Message format');
      expect(result[1].message).toBe('Content format');
    });
  });
}); 