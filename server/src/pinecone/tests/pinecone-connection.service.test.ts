// src/pinecone/tests/pinecone-connection.service.test.ts

import { Index, RecordMetadata } from '@pinecone-database/pinecone';
import { Logger } from '../../shared/logger/logger.interface';
import { PineconeConnectionService } from '../pinecone-connection.service';
import { PineconeIndexService } from '../pinecone-index.service';
import { MockLogger } from '../../agents/tests/mocks/mock-logger';

jest.unmock('../pinecone-connection.service.ts');
jest.unmock('../pinecone-index.service.ts');
jest.unmock('../../shared/logger/console-logger.ts');

// Mock Logger implementation is replaced with import

describe('PineconeConnectionService', () => {
  let service: PineconeConnectionService;
  let mockIndexService: jest.Mocked<PineconeIndexService>;
  let mockLogger: MockLogger;
  let mockIndex: Partial<Index>;

  beforeEach(() => {
    // Create mock index
    mockIndex = {
      upsert: jest.fn().mockResolvedValue({}),
      query: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
      deleteAll: jest.fn().mockResolvedValue({}),
      describeIndexStats: jest.fn().mockResolvedValue({}),
      fetch: jest.fn().mockResolvedValue({}),
      namespace: jest.fn().mockReturnThis(),
    };

    // Create mock index service
    mockIndexService = {
      getIndex: jest.fn().mockReturnValue(mockIndex as Index),
      indexExists: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<PineconeIndexService>;

    // Create mock logger
    mockLogger = new MockLogger();

    // Create service with mocks - fix the constructor options
    service = new PineconeConnectionService({
      indexService: mockIndexService,
      logger: mockLogger,
    });
  });

  describe('upsertVectors', () => {
    it('should log the operation details and results', async () => {
      const records = [
        { id: '1', values: [0.1, 0.2, 0.3] },
        { id: '2', values: [0.4, 0.5, 0.6] },
      ];

      await service.upsertVectors('test-index', records, 'test-namespace');

      // Verify the logs
      expect(mockLogger.messages.length).toBeGreaterThan(0);
      expect(
        mockLogger.messages.some(
          (log) =>
            log.level === 'info' &&
            log.message.includes('Upserting vectors') &&
            log.context?.indexName === 'test-index' &&
            log.context?.recordCount === 2 &&
            log.context?.namespace === 'test-namespace',
        ),
      ).toBe(true);

      expect(
        mockLogger.messages.some(
          (log) =>
            log.level === 'info' &&
            log.message.includes('Successfully upserted'),
        ),
      ).toBe(true);
    });

    it('should log retries on failures', async () => {
      const records = [{ id: '1', values: [0.1, 0.2, 0.3] }];

      // Make the first call fail, then succeed
      (mockIndex.upsert as jest.Mock)
        .mockRejectedValueOnce(new Error('Test error'))
        .mockResolvedValueOnce({});

      await service.upsertVectors('test-index', records);

      // Verify retry logs
      expect(
        mockLogger.messages.some(
          (log) =>
            log.level === 'warn' &&
            log.message.includes('Retrying Pinecone operation') &&
            log.context?.error === 'Test error',
        ),
      ).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should use custom batch size when provided', async () => {
      // Create service with custom batch size
      service = new PineconeConnectionService({
        indexService: mockIndexService,
        logger: mockLogger,
        config: {
          batchSize: 50,
        },
      });

      // Create 101 records to ensure multiple batches
      const records = Array.from({ length: 101 }).map((_, i) => ({
        id: `id-${i}`,
        values: [0.1, 0.2, 0.3],
      }));

      await service.upsertVectors('test-index', records);

      // Should call upsert 3 times (50 + 50 + 1)
      expect(mockIndex.upsert).toHaveBeenCalledTimes(3);

      // Verify batch sizes from logs
      const batchLogs = mockLogger.messages.filter(
        (log) =>
          log.level === 'debug' && log.message.includes('Processing batch'),
      );

      expect(batchLogs.length).toBe(3);
      expect(batchLogs[0].context?.batchSize).toBe(50);
      expect(batchLogs[1].context?.batchSize).toBe(50);
      expect(batchLogs[2].context?.batchSize).toBe(1);
    });

    it('should respect custom batch size in method options', async () => {
      // Create service with default batch size
      service = new PineconeConnectionService({
        indexService: mockIndexService,
        logger: mockLogger,
      });

      const records = Array.from({ length: 30 }).map((_, i) => ({
        id: `id-${i}`,
        values: [0.1, 0.2, 0.3],
      }));

      // Override batch size in method call - fix the parameter syntax
      await service.upsertVectors('test-index', records, undefined, {
        batchSize: 10,
      });

      // Should call upsert 3 times (10 + 10 + 10)
      expect(mockIndex.upsert).toHaveBeenCalledTimes(3);
    });

    it('should respect cache expiration settings', async () => {
      // Create service with short cache expiration
      service = new PineconeConnectionService({
        indexService: mockIndexService,
        logger: mockLogger,
        config: {
          cacheExpirationMs: 100, // 100ms expiration
        },
      });

      // First call should check if index exists
      await service.getIndex('test-index');
      expect(mockIndexService.indexExists).toHaveBeenCalledTimes(1);

      // Second immediate call should use cache
      await service.getIndex('test-index');
      expect(mockIndexService.indexExists).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Call after expiration should check again
      await service.getIndex('test-index');
      expect(mockIndexService.indexExists).toHaveBeenCalledTimes(2);
    });
  });

  // Additional test for cache management
  describe('cache management', () => {
    it('should evict oldest entries when cache reaches size limit', async () => {
      // Create service with small cache size
      service = new PineconeConnectionService({
        indexService: mockIndexService,
        logger: mockLogger,
        config: {
          maxCacheSize: 2, // Only allow 2 cached indexes
        },
      });

      // Setup index service to return different mock indexes
      const mockIndexA = { ...mockIndex, id: 'index-a' };
      const mockIndexB = { ...mockIndex, id: 'index-b' };
      const mockIndexC = { ...mockIndex, id: 'index-c' };

      (mockIndexService.getIndex as jest.Mock)
        .mockReturnValueOnce(mockIndexA as unknown as Index)
        .mockReturnValueOnce(mockIndexB as unknown as Index)
        .mockReturnValueOnce(mockIndexC as unknown as Index)
        .mockReturnValueOnce(mockIndexA as unknown as Index); // If index-a is requested again

      // Access three different indexes
      const indexA1 = await service.getIndex('index-a');
      expect((indexA1 as any).id).toBe('index-a');

      const indexB = await service.getIndex('index-b');
      expect((indexB as any).id).toBe('index-b');

      // This should evict index-a as it's the oldest
      const indexC = await service.getIndex('index-c');
      expect((indexC as any).id).toBe('index-c');

      // This should fetch index-a again as it was evicted
      mockIndexService.indexExists.mockClear();
      const indexA2 = await service.getIndex('index-a');

      // Should check if index exists again since it was evicted
      expect(mockIndexService.indexExists).toHaveBeenCalledTimes(1);
      expect((indexA2 as any).id).toBe('index-a');
    });

    it('should clear cache during cleanup', async () => {
      // Cache an index
      await service.getIndex('test-index');

      // Verify it's cached (no additional indexExists calls)
      mockIndexService.indexExists.mockClear();
      await service.getIndex('test-index');
      expect(mockIndexService.indexExists).not.toHaveBeenCalled();

      // Cleanup
      await service.cleanup();

      // Should check again after cleanup
      await service.getIndex('test-index');
      expect(mockIndexService.indexExists).toHaveBeenCalled();
    });
  });

  describe('queryVectors', () => {
    it('should query vectors with the correct parameters', async () => {
      const queryVector = [0.1, 0.2, 0.3];
      const mockResponse = {
        matches: [{ id: '1', score: 0.9, values: queryVector }],
      };
      (mockIndex.query as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.queryVectors(
        'test-index',
        queryVector,
        { topK: 5 },
        'test-namespace',
      );

      expect(mockIndex.namespace).toHaveBeenCalledWith('test-namespace');
      expect(mockIndex.query).toHaveBeenCalledWith({
        vector: queryVector,
        topK: 5,
        filter: undefined,
        includeMetadata: true,
        includeValues: false,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle query errors and retry', async () => {
      const queryVector = [0.1, 0.2, 0.3];
      (mockIndex.query as jest.Mock)
        .mockRejectedValueOnce(new Error('Connection error'))
        .mockResolvedValueOnce({ matches: [] });

      await service.queryVectors('test-index', queryVector);

      expect(
        mockLogger.messages.some(
          (log) =>
            log.level === 'warn' &&
            log.message.includes('Retrying Pinecone operation') &&
            log.context?.error === 'Connection error',
        ),
      ).toBe(true);
    });

    it('should use getTypedIndex for proper typing', async () => {
      const queryVector = [0.1, 0.2, 0.3];
      const getTypedIndexSpy = jest.spyOn(service as any, 'getTypedIndex');

      await service.queryVectors(
        'test-index',
        queryVector,
        {},
        'test-namespace',
      );

      expect(getTypedIndexSpy).toHaveBeenCalledWith(
        'test-index',
        'test-namespace',
      );
    });
  });

  describe('deleteVectors', () => {
    it('should delete vectors by IDs', async () => {
      const ids = ['1', '2', '3'];

      await service.deleteVectors('test-index', ids, 'test-namespace');

      expect(mockIndex.namespace).toHaveBeenCalledWith('test-namespace');
      expect(mockIndex.deleteMany).toHaveBeenCalledWith(ids);
      expect(
        mockLogger.messages.some(
          (log) =>
            log.level === 'info' &&
            log.message.includes('Successfully Deleted vectors by ids'),
        ),
      ).toBe(true);
    });

    it('should handle delete errors', async () => {
      const ids = ['1', '2', '3'];
      (mockIndex.deleteMany as jest.Mock)
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce({});

      await service.deleteVectors('test-index', ids);

      expect(
        mockLogger.messages.some(
          (log) =>
            log.level === 'warn' &&
            log.message.includes('Retrying Pinecone operation'),
        ),
      ).toBe(true);
    });
  });

  describe('deleteVectorsByFilter', () => {
    it('should delete vectors by filter', async () => {
      const filter = { metadata: { category: 'test' } };

      await service.deleteVectorsByFilter(
        'test-index',
        filter,
        'test-namespace',
      );

      expect(mockIndex.namespace).toHaveBeenCalledWith('test-namespace');
      expect(mockIndex.deleteMany).toHaveBeenCalledWith(filter);
    });
  });

  describe('deleteAllVectorsInNamespace', () => {
    it('should delete all vectors in a namespace', async () => {
      await service.deleteAllVectorsInNamespace('test-index', 'test-namespace');

      expect(mockIndex.namespace).toHaveBeenCalledWith('test-namespace');
      expect(mockIndex.deleteAll).toHaveBeenCalled();
    });
  });

  describe('describeIndexStats', () => {
    it('should retrieve index statistics', async () => {
      const mockStats = {
        namespaces: { 'test-namespace': { vectorCount: 100 } },
        dimension: 128,
        indexFullness: 0.5,
        totalVectorCount: 100,
      };
      (mockIndex.describeIndexStats as jest.Mock).mockResolvedValue(mockStats);

      const stats = await service.describeIndexStats('test-index');

      expect(stats).toEqual(mockStats);
    });
  });

  describe('fetchVectors', () => {
    it('should fetch specific vectors by ID', async () => {
      const ids = ['1', '2', '3'];
      const mockFetchResult = {
        vectors: { '1': { id: '1', values: [0.1, 0.2, 0.3] } },
      };
      (mockIndex.fetch as jest.Mock).mockResolvedValue(mockFetchResult);

      const result = await service.fetchVectors(
        'test-index',
        ids,
        'test-namespace',
      );

      expect(mockIndex.namespace).toHaveBeenCalledWith('test-namespace');
      expect(mockIndex.fetch).toHaveBeenCalledWith(ids);
      expect(result).toEqual(mockFetchResult);
    });
  });

  describe('findSimilar', () => {
    it('should call queryVectors with correct parameters', async () => {
      const vector = [0.1, 0.2, 0.3];
      const queryVectorsSpy = jest
        .spyOn(service, 'queryVectors')
        .mockResolvedValue({
          matches: [],
          namespace: 'test-namespace',
        });

      await service.findSimilar('test-index', vector, 5, 'test-namespace');

      expect(queryVectorsSpy).toHaveBeenCalledWith(
        'test-index',
        vector,
        { topK: 5, includeMetadata: true },
        'test-namespace',
      );
    });
  });

  describe('namespaceExists', () => {
    it('should return true when namespace exists', async () => {
      const mockStats = {
        namespaces: { 'test-namespace': { vectorCount: 100 } },
      };
      (mockIndex.describeIndexStats as jest.Mock).mockResolvedValue(mockStats);

      const exists = await service.namespaceExists(
        'test-index',
        'test-namespace',
      );

      expect(exists).toBe(true);
    });

    it('should return false when namespace does not exist', async () => {
      const mockStats = {
        namespaces: { 'other-namespace': { vectorCount: 100 } },
      };
      (mockIndex.describeIndexStats as jest.Mock).mockResolvedValue(mockStats);

      const exists = await service.namespaceExists(
        'test-index',
        'test-namespace',
      );

      expect(exists).toBe(false);
    });

    it('should return false when namespaces is empty', async () => {
      const mockStats = { namespaces: {} };
      (mockIndex.describeIndexStats as jest.Mock).mockResolvedValue(mockStats);

      const exists = await service.namespaceExists(
        'test-index',
        'test-namespace',
      );

      expect(exists).toBe(false);
    });
  });

  describe('listNamespaces', () => {
    it('should return all namespaces', async () => {
      const mockStats = {
        namespaces: {
          namespace1: { vectorCount: 100 },
          namespace2: { vectorCount: 50 },
        },
      };
      (mockIndex.describeIndexStats as jest.Mock).mockResolvedValue(mockStats);

      const namespaces = await service.listNamespaces('test-index');

      expect(namespaces).toEqual(['namespace1', 'namespace2']);
    });

    it('should return empty array when no namespaces exist', async () => {
      const mockStats = { namespaces: {} };
      (mockIndex.describeIndexStats as jest.Mock).mockResolvedValue(mockStats);

      const namespaces = await service.listNamespaces('test-index');

      expect(namespaces).toEqual([]);
    });
  });

  describe('getNamespaceVectorCount', () => {
    it('should return vector count for existing namespace', async () => {
      const mockStats = {
        namespaces: { 'test-namespace': { vectorCount: 100 } },
      };
      (mockIndex.describeIndexStats as jest.Mock).mockResolvedValue(mockStats);

      const count = await service.getNamespaceVectorCount(
        'test-index',
        'test-namespace',
      );

      expect(count).toBe(100);
    });

    it('should return 0 for non-existing namespace', async () => {
      const mockStats = {
        namespaces: { 'other-namespace': { vectorCount: 100 } },
      };
      (mockIndex.describeIndexStats as jest.Mock).mockResolvedValue(mockStats);

      const count = await service.getNamespaceVectorCount(
        'test-index',
        'test-namespace',
      );

      expect(count).toBe(0);
    });
  });

  describe('initialization and cleanup', () => {
    it('should initialize the service', async () => {
      await service.initialize();

      expect(
        mockLogger.messages.some(
          (log) =>
            log.level === 'info' &&
            log.message.includes('Initializing PineconeConnectionService'),
        ),
      ).toBe(true);
    });

    it('should clean up resources', async () => {
      // First cache an index
      await service.getIndex('test-index');

      // Verify something is cached
      expect((service as any).indexCache.size).toBeGreaterThan(0);

      // Clean up
      await service.cleanup();

      // Verify cache is cleared
      expect((service as any).indexCache.size).toBe(0);

      // Verify logs
      expect(
        mockLogger.messages.some(
          (log) =>
            log.level === 'info' &&
            log.message.includes('Cleaning up PineconeConnectionService'),
        ),
      ).toBe(true);
    });
  });

  describe('getIndex error handling', () => {
    it('should throw error when index does not exist', async () => {
      mockIndexService.indexExists.mockResolvedValue(false);

      await expect(service.getIndex('non-existent-index')).rejects.toThrow(
        'Index non-existent-index does not exist',
      );
    });

    it('should throw error after max retries', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error('Operation failed'));

      await expect(
        service.executeWithRetry(operation, 'test-operation', 0),
      ).rejects.toThrow('Operation failed');

      expect(
        mockLogger.messages.some(
          (log) =>
            log.level === 'error' &&
            log.message.includes('Max retries reached'),
        ),
      ).toBe(true);
    });
  });

  describe('Integration: full vector workflow', () => {
    it('should handle a complete vector lifecycle', async () => {
      // Mock responses for the sequence of operations
      const mockQueryResponse = { matches: [{ id: '1', score: 0.9 }] };
      const mockStats = {
        namespaces: { 'test-namespace': { vectorCount: 2 } },
      };
      const mockFetchResponse = {
        vectors: { '1': { id: '1', values: [0.1, 0.2, 0.3] } },
      };

      (mockIndex.upsert as jest.Mock).mockResolvedValue({});
      (mockIndex.query as jest.Mock).mockResolvedValue(mockQueryResponse);
      (mockIndex.describeIndexStats as jest.Mock).mockResolvedValue(mockStats);
      (mockIndex.fetch as jest.Mock).mockResolvedValue(mockFetchResponse);
      (mockIndex.deleteMany as jest.Mock).mockResolvedValue({});

      // Upserting vectors
      const records = [
        { id: '1', values: [0.1, 0.2, 0.3] },
        { id: '2', values: [0.4, 0.5, 0.6] },
      ];
      await service.upsertVectors('test-index', records, 'test-namespace');

      // Querying vectors
      const queryResult = await service.queryVectors(
        'test-index',
        [0.1, 0.2, 0.3],
        {},
        'test-namespace',
      );
      expect(queryResult).toEqual(mockQueryResponse);

      // Getting stats
      const exists = await service.namespaceExists(
        'test-index',
        'test-namespace',
      );
      expect(exists).toBe(true);

      const count = await service.getNamespaceVectorCount(
        'test-index',
        'test-namespace',
      );
      expect(count).toBe(2);

      // Fetching vectors
      const fetchResult = await service.fetchVectors(
        'test-index',
        ['1'],
        'test-namespace',
      );
      expect(fetchResult).toEqual(mockFetchResponse);

      // Deleting vectors
      await service.deleteVectors('test-index', ['1'], 'test-namespace');

      // Verify all expected methods were called
      expect(mockIndex.upsert).toHaveBeenCalled();
      expect(mockIndex.query).toHaveBeenCalled();
      expect(mockIndex.describeIndexStats).toHaveBeenCalled();
      expect(mockIndex.fetch).toHaveBeenCalled();
      expect(mockIndex.deleteMany).toHaveBeenCalled();
    });
  });
});
