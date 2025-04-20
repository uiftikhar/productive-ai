import { BaseContextService } from '../base-context.service';
import { PineconeConnectionService } from '../../../../pinecone/pinecone-connection.service';
import { MockLogger } from '../../../../agents/tests/mocks/mock-logger';
import { UserContextValidationError, UserContextNotFoundError, UserContextError } from '../../types/context.types';
import { ContextType } from '../../context-types';

// Create mock for PineconeConnectionService
jest.mock('../../../../pinecone/pinecone-connection.service');

describe('BaseContextService', () => {
  let service: BaseContextService;
  let mockPineconeService: jest.Mocked<PineconeConnectionService>;
  let mockLogger: MockLogger;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create fresh mock instances
    mockPineconeService = new PineconeConnectionService() as jest.Mocked<PineconeConnectionService>;
    mockLogger = new MockLogger();

    // Create service with mocks
    service = new BaseContextService({
      pineconeService: mockPineconeService,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    mockLogger.clear();
  });

  describe('initialization', () => {
    it('should initialize pinecone service on startup', async () => {
      // Setup
      mockPineconeService.initialize = jest.fn().mockResolvedValue(undefined);
      mockPineconeService.getIndex = jest.fn().mockResolvedValue({});

      // Execute
      await service.initialize();

      // Verify
      expect(mockPineconeService.initialize).toHaveBeenCalled();
      expect(mockPineconeService.getIndex).toHaveBeenCalled();
    });

    it('should log warning if index does not exist', async () => {
      // Setup
      mockPineconeService.initialize = jest.fn().mockResolvedValue(undefined);
      mockPineconeService.getIndex = jest.fn().mockRejectedValue(new Error('Index not found'));

      // Execute
      await service.initialize();

      // Verify
      expect(mockPineconeService.initialize).toHaveBeenCalled();
      expect(mockLogger.hasMessage('User context index', 'warn')).toBe(true);
    });

    it('should check if index exists', async () => {
      // Setup
      mockPineconeService.getIndex = jest.fn().mockResolvedValue({});
      
      // Execute
      const result = await (service as any).indexExists();
      
      // Verify
      expect(result).toBe(true);
      expect(mockPineconeService.getIndex).toHaveBeenCalled();
    });

    it('should return false when index does not exist', async () => {
      // Setup
      mockPineconeService.getIndex = jest.fn().mockRejectedValue(new Error('Not found'));
      
      // Execute
      const result = await (service as any).indexExists();
      
      // Verify
      expect(result).toBe(false);
    });
  });

  describe('executeWithRetry', () => {
    it('should execute operation successfully on first try', async () => {
      // Setup
      const operation = jest.fn().mockResolvedValue('success');
      
      // Execute
      const result = await (service as any).executeWithRetry(operation, 'testOperation');
      
      // Verify
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry operation on failure and succeed', async () => {
      // Setup
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValueOnce('finally succeeded');
      
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
        cb();
        return 1 as any;
      });
      
      // Execute
      const result = await (service as any).executeWithRetry(operation, 'testOperation');
      
      // Verify
      expect(result).toBe('finally succeeded');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(mockLogger.hasMessage('Retrying UserContextService operation', 'warn')).toBe(true);
      
      // Cleanup
      setTimeoutSpy.mockRestore();
    });

    it('should stop retrying after max retries', async () => {
      // Setup
      const error = new Error('Persistent failure');
      const operation = jest.fn().mockRejectedValue(error);
      
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
        cb();
        return 1 as any;
      });
      
      // Execute & Verify
      await expect((service as any).executeWithRetry(operation, 'testOperation')).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes((service as any).maxRetries + 1);
      expect(mockLogger.hasMessage('Max retries reached', 'error')).toBe(true);
      
      // Cleanup
      setTimeoutSpy.mockRestore();
    });
  });

  describe('storeUserContext', () => {
    it('should store user context successfully', async () => {
      // Setup
      const userId = 'test-user';
      const contextData = 'test context data';
      const embeddings = [0.1, 0.2, 0.3];
      const metadata = { contextType: ContextType.CONVERSATION };

      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue(undefined);

      // Execute
      const result = await service.storeUserContext(
        userId,
        contextData,
        embeddings,
        metadata
      );

      // Verify
      expect(result).toBeDefined();
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            values: embeddings,
            metadata: expect.objectContaining({
              userId,
              contextType: ContextType.CONVERSATION,
              timestamp: expect.any(Number),
            }),
          }),
        ]),
        userId
      );
    });

    it('should throw validation error if userId is empty', async () => {
      // Execute & Verify
      await expect(
        service.storeUserContext(
          '',
          'context',
          [0.1, 0.2, 0.3],
          {}
        )
      ).rejects.toThrow(UserContextValidationError);
    });

    it('should throw validation error if embeddings array is empty', async () => {
      // Execute & Verify
      await expect(
        service.storeUserContext(
          'test-user',
          'context',
          [],
          {}
        )
      ).rejects.toThrow(UserContextValidationError);
    });

    it('should retry on temporary failure', async () => {
      // Setup
      const userId = 'test-user';
      const contextData = 'test context data';
      const embeddings = [0.1, 0.2, 0.3];

      // Mock first call to fail, second to succeed
      mockPineconeService.upsertVectors = jest
        .fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce(undefined);

      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
        cb();
        return 1 as any;
      });

      // Execute
      const result = await service.storeUserContext(
        userId,
        contextData,
        embeddings
      );

      // Verify
      expect(result).toBeDefined();
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledTimes(2);
      expect(mockLogger.hasMessage('Retrying UserContextService operation', 'warn')).toBe(true);

      // Cleanup
      setTimeoutSpy.mockRestore();
    });

    it('should handle fatal errors and throw UserContextError', async () => {
      // Setup
      const userId = 'test-user';
      const contextData = 'test context data';
      const embeddings = [0.1, 0.2, 0.3];

      // Mock max retries exhausted
      mockPineconeService.upsertVectors = jest.fn().mockRejectedValue(new Error('Fatal error'));
      
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
        cb();
        return 1 as any;
      });

      // Execute & Verify
      await expect(
        service.storeUserContext(userId, contextData, embeddings)
      ).rejects.toThrow(UserContextError);
      
      expect(mockLogger.hasMessage('Failed to store user context', 'error')).toBe(true);

      // Cleanup
      setTimeoutSpy.mockRestore();
    });
  });

  describe('batchStoreUserContext', () => {
    it('should store multiple context entries in batch', async () => {
      // Setup
      const userId = 'test-user';
      const entries = [
        { contextData: 'data1', embeddings: [0.1, 0.2, 0.3] },
        { 
          contextData: 'data2', 
          embeddings: [0.4, 0.5, 0.6], 
          metadata: { contextType: ContextType.DOCUMENT } 
        }
      ];

      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue(undefined);

      // Execute
      const result = await service.batchStoreUserContext(userId, entries);

      // Verify
      expect(result).toHaveLength(2);
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            values: entries[0].embeddings,
            metadata: expect.objectContaining({
              userId,
            }),
          }),
          expect.objectContaining({
            values: entries[1].embeddings,
            metadata: expect.objectContaining({
              userId,
              contextType: ContextType.DOCUMENT,
            }),
          }),
        ]),
        userId
      );
    });

    it('should handle empty entries array', async () => {
      // Setup
      const userId = 'test-user';
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue(undefined);
      
      // Execute
      const result = await service.batchStoreUserContext(userId, []);
      
      // Verify
      expect(result).toEqual([]);
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([]),
        userId
      );
    });
  });

  describe('retrieveUserContext', () => {
    it('should retrieve similar context based on query embedding', async () => {
      // Setup
      const userId = 'test-user';
      const queryEmbedding = [0.1, 0.2, 0.3];
      const mockMatches = [
        { id: 'id1', score: 0.9, metadata: { contextType: ContextType.CONVERSATION } },
        { id: 'id2', score: 0.8, metadata: { contextType: ContextType.DOCUMENT } }
      ];

      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: mockMatches
      });

      // Execute
      const result = await service.retrieveUserContext(userId, queryEmbedding);

      // Verify
      expect(result).toEqual(mockMatches);
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        expect.any(String),
        queryEmbedding,
        expect.objectContaining({
          topK: 5,
          includeValues: false,
          includeMetadata: true,
        }),
        userId
      );
    });

    it('should apply filters when specified', async () => {
      // Setup
      const userId = 'test-user';
      const queryEmbedding = [0.1, 0.2, 0.3];
      const filter = { contextType: ContextType.DOCUMENT };

      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: []
      });

      // Execute
      await service.retrieveUserContext(userId, queryEmbedding, {
        filter,
        topK: 10,
        includeEmbeddings: true
      });

      // Verify
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        expect.any(String),
        queryEmbedding,
        expect.objectContaining({
          topK: 10,
          filter,
          includeValues: true,
          includeMetadata: true,
        }),
        userId
      );
    });

    it('should return empty array when no matches found', async () => {
      // Setup
      const userId = 'test-user';
      const queryEmbedding = [0.1, 0.2, 0.3];
      
      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({});
      
      // Execute
      const result = await service.retrieveUserContext(userId, queryEmbedding);
      
      // Verify
      expect(result).toEqual([]);
    });
  });

  describe('utility methods', () => {
    it('should calculate cosine similarity correctly', () => {
      // This is a direct test of a protected method using TypeScript type assertion
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      const vec3 = [1, 1, 0];

      // Use type assertion to access protected method
      const similarity1to2 = (service as any).calculateCosineSimilarity(vec1, vec2);
      const similarity1to3 = (service as any).calculateCosineSimilarity(vec1, vec3);

      expect(similarity1to2).toBeCloseTo(0); // Orthogonal vectors
      expect(similarity1to3).toBeCloseTo(0.7071, 4); // 45 degree angle, cos(45) ≈ 0.7071
    });

    it('should throw error when vectors have different dimensions', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1];

      expect(() => {
        (service as any).calculateCosineSimilarity(vec1, vec2);
      }).toThrow('Vectors must have the same dimensions');
    });

    it('should prepare metadata for storage correctly', () => {
      const metadata = {
        userId: 'test-user',
        contextType: ContextType.DOCUMENT,
        complexObject: { key: 'value', nested: { key2: 'value2' } }
      };

      const result = (service as any).prepareMetadataForStorage(metadata);

      expect(result.userId).toBe('test-user');
      expect(result.contextType).toBe(ContextType.DOCUMENT);
      expect(typeof result.complexObject).toBe('string');
      expect(JSON.parse(result.complexObject as string)).toEqual(metadata.complexObject);
    });

    it('should generate unique context IDs with prefix', () => {
      const userId = 'test-user';
      const prefix = 'test-';
      
      const id1 = (service as any).generateContextId(userId, prefix);
      const id2 = (service as any).generateContextId(userId, prefix);
      
      expect(id1).toContain(prefix);
      expect(id1).toContain(userId);
      expect(id1).not.toEqual(id2); // Should be unique
    });

    it('should ensure number array returns empty array for undefined input', () => {
      const result = (service as any).ensureNumberArray(undefined);
      expect(result).toEqual([]);
    });

    it('should ensure number array returns original array for valid input', () => {
      const input = [1, 2, 3];
      const result = (service as any).ensureNumberArray(input);
      expect(result).toEqual(input);
    });

    it('should remove duplicates based on property', () => {
      const input = [
        { id: '1', value: 'a' },
        { id: '2', value: 'b' },
        { id: '1', value: 'c' }, // Duplicate id
        { id: '3', value: 'd' }
      ];
      
      const result = (service as any).removeDuplicatesByProperty(input, 'id');
      
      expect(result).toHaveLength(3);
      expect(result.map((item: any) => item.id)).toEqual(['1', '2', '3']);
      expect(result[0].value).toBe('a'); // Keep first occurrence
    });
  });

  describe('clearUserContext', () => {
    it('should delete all context for a user', async () => {
      // Setup
      const userId = 'test-user';
      mockPineconeService.deleteAllVectorsInNamespace = jest.fn().mockResolvedValue(undefined);

      // Execute
      await service.clearUserContext(userId);

      // Verify
      expect(mockPineconeService.deleteAllVectorsInNamespace).toHaveBeenCalledWith(
        expect.any(String),
        userId
      );
    });
  });

  describe('deleteExpiredContext', () => {
    it('should delete expired context entries', async () => {
      // Setup
      const userId = 'test-user';
      const mockExpiredMatches = [
        { id: 'id1', metadata: { expiresAt: Date.now() - 1000 } },
        { id: 'id2', metadata: { expiresAt: Date.now() - 2000 } }
      ];

      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: mockExpiredMatches
      });
      mockPineconeService.deleteVectors = jest.fn().mockResolvedValue(undefined);

      // Execute
      const result = await service.deleteExpiredContext(userId);

      // Verify
      expect(result).toBe(2);
      expect(mockPineconeService.deleteVectors).toHaveBeenCalledWith(
        expect.any(String),
        ['id1', 'id2'],
        userId
      );
    });

    it('should return 0 when no expired entries found', async () => {
      // Setup
      const userId = 'test-user';
      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: []
      });

      // Execute
      const result = await service.deleteExpiredContext(userId);

      // Verify
      expect(result).toBe(0);
      expect(mockPineconeService.deleteVectors).not.toHaveBeenCalled();
    });
  });

  describe('getUserContextStats', () => {
    it('should return user context statistics', async () => {
      // Setup
      const userId = 'test-user';
      const now = Date.now();
      const oneHourAgo = now - 3600000;
      
      // Mock index stats
      mockPineconeService.describeIndexStats = jest.fn().mockResolvedValue({
        dimensions: 3072,
        count: 100
      });
      
      // Mock query results
      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: [
          { 
            id: 'id1', 
            metadata: { 
              category: 'meeting',
              contextType: ContextType.CONVERSATION,
              documentId: 'doc1',
              conversationId: 'conv1',
              timestamp: now
            } 
          },
          { 
            id: 'id2', 
            metadata: { 
              category: 'personal',
              contextType: ContextType.DOCUMENT,
              documentId: 'doc1',
              timestamp: oneHourAgo
            } 
          },
          { 
            id: 'id3', 
            metadata: { 
              category: 'meeting',
              contextType: ContextType.CONVERSATION,
              conversationId: 'conv2',
              timestamp: now - 1000
            } 
          }
        ]
      });
      
      // Execute
      const stats = await service.getUserContextStats(userId);
      
      // Verify
      expect(stats.totalContextEntries).toBe(3);
      expect(stats.categoryCounts).toEqual({
        meeting: 2,
        personal: 1
      });
      expect(stats.contextTypeCounts).toEqual({
        [ContextType.CONVERSATION]: 2,
        [ContextType.DOCUMENT]: 1
      });
      expect(stats.documentCounts).toEqual({
        doc1: 2
      });
      expect(stats.conversationCounts).toEqual({
        conv1: 1,
        conv2: 1
      });
      expect(stats.oldestEntry).toBe(oneHourAgo);
      expect(stats.newestEntry).toBe(now);
    });

    it('should handle empty results correctly', async () => {
      // Setup
      const userId = 'test-user';
      
      mockPineconeService.describeIndexStats = jest.fn().mockResolvedValue({});
      mockPineconeService.queryVectors = jest.fn().mockResolvedValue({
        matches: []
      });
      
      // Execute
      const stats = await service.getUserContextStats(userId);
      
      // Verify
      expect(stats.totalContextEntries).toBe(0);
      expect(stats.categoryCounts).toEqual({});
      expect(stats.contextTypeCounts).toEqual({});
      expect(stats.documentCounts).toEqual({});
      expect(stats.conversationCounts).toEqual({});
      expect(stats.oldestEntry).toBeUndefined();
      expect(stats.newestEntry).toBeUndefined();
    });
  });

  describe('recordContextAccess', () => {
    it('should record a view of a context item', async () => {
      // Setup
      const userId = 'test-user';
      const contextId = 'test-context-id';
      const existingRecord = {
        records: {
          'test-context-id': {
            id: contextId,
            values: [0.1, 0.2, 0.3],
            metadata: {
              viewCount: 5,
              lastAccessedAt: Date.now() - 10000
            }
          }
        }
      };
      
      mockPineconeService.fetchVectors = jest.fn().mockResolvedValue(existingRecord);
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue(undefined);
      
      // Execute
      await service.recordContextAccess(userId, contextId);
      
      // Verify
      expect(mockPineconeService.fetchVectors).toHaveBeenCalledWith(
        expect.any(String),
        [contextId],
        userId
      );
      
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            id: contextId,
            metadata: expect.objectContaining({
              viewCount: 6, // Incremented
              lastAccessedAt: expect.any(Number),
            }),
          }),
        ]),
        userId
      );
      
      expect(mockLogger.hasMessage('Recorded context access', 'debug')).toBe(true);
    });

    it('should handle not found context items', async () => {
      // Setup
      const userId = 'test-user';
      const contextId = 'nonexistent-id';
      
      mockPineconeService.fetchVectors = jest.fn().mockResolvedValue({
        records: {}
      });
      
      // Execute
      await service.recordContextAccess(userId, contextId);
      
      // Verify the error was logged via our mockLogger
      expect(mockLogger.hasMessage('Failed to record context access', 'error')).toBe(true);
    });

    it('should log errors but not throw for non-critical operations', async () => {
      // Setup
      const userId = 'test-user';
      const contextId = 'test-context-id';
      const error = new Error('Network error');
      
      mockPineconeService.fetchVectors = jest.fn().mockRejectedValue(error);
      
      // Execute
      await service.recordContextAccess(userId, contextId);
      
      // Verify error was logged but not thrown
      expect(mockLogger.hasMessage('Failed to record context access', 'error')).toBe(true);
    });
  });

  describe('provideRelevanceFeedback', () => {
    it('should update relevance feedback for a context item', async () => {
      // Setup
      const userId = 'test-user';
      const contextId = 'test-context-id';
      const relevanceFeedback = 0.8;
      const existingRecord = {
        records: {
          'test-context-id': {
            id: contextId,
            values: [0.1, 0.2, 0.3],
            metadata: {
              relevanceFeedback: 0.5
            }
          }
        }
      };
      
      mockPineconeService.fetchVectors = jest.fn().mockResolvedValue(existingRecord);
      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue(undefined);
      
      // Execute
      await service.provideRelevanceFeedback(userId, contextId, relevanceFeedback);
      
      // Verify
      expect(mockPineconeService.fetchVectors).toHaveBeenCalledWith(
        expect.any(String),
        [contextId],
        userId
      );
      
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            id: contextId,
            metadata: expect.objectContaining({
              explicitRelevanceFeedback: relevanceFeedback,
              lastUpdatedAt: expect.any(Number),
            }),
          }),
        ]),
        userId
      );
      
      expect(mockLogger.hasMessage('Recorded relevance feedback', 'debug')).toBe(true);
    });

    it('should throw validation error if feedback value is out of range', async () => {
      // Setup
      const userId = 'test-user';
      const contextId = 'test-context-id';
      const invalidFeedback = 2.0; // Greater than 1
      
      // Execute & Verify
      await expect(
        service.provideRelevanceFeedback(userId, contextId, invalidFeedback)
      ).rejects.toThrow(UserContextValidationError);
      
      // Also test for negative values
      await expect(
        service.provideRelevanceFeedback(userId, contextId, -0.5)
      ).rejects.toThrow(UserContextValidationError);
    });

    it('should throw not found error if context does not exist', async () => {
      // Setup
      const userId = 'test-user';
      const contextId = 'nonexistent-id';
      const relevanceFeedback = 0.5;
      
      mockPineconeService.fetchVectors = jest.fn().mockResolvedValue({
        records: {}
      });
      
      // Execute & Verify
      await expect(
        service.provideRelevanceFeedback(userId, contextId, relevanceFeedback)
      ).rejects.toThrow(UserContextError);
      
      // Also verify the error message contains the expected text
      await expect(
        service.provideRelevanceFeedback(userId, contextId, relevanceFeedback)
      ).rejects.toThrow(/not found/i);
    });

    it('should handle and wrap errors properly', async () => {
      // Setup
      const userId = 'test-user';
      const contextId = 'test-context-id';
      const relevanceFeedback = 0.5;
      const error = new Error('Database error');
      
      mockPineconeService.fetchVectors = jest.fn().mockRejectedValue(error);
      
      // Execute & Verify
      await expect(
        service.provideRelevanceFeedback(userId, contextId, relevanceFeedback)
      ).rejects.toThrow(UserContextError);
      
      expect(mockLogger.hasMessage('Failed to record relevance feedback', 'error')).toBe(true);
    });
  });
}); 