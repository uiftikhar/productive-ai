// src/pinecone/tests/pinecone-connection.service.test.ts

import { Index, RecordMetadata } from '@pinecone-database/pinecone';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { PineconeConnectionService } from '../pinecone-connection.service.ts';
import { PineconeIndexService } from '../pinecone-index.service.ts';

// Create a mock logger to capture logs
class MockLogger implements Logger {
  logs: Array<{ level: string; message: string; context?: Record<string, any> }> = [];
  
  debug(message: string, context?: Record<string, any>): void {
    this.logs.push({ level: 'debug', message, context });
  }
  
  info(message: string, context?: Record<string, any>): void {
    this.logs.push({ level: 'info', message, context });
  }
  
  warn(message: string, context?: Record<string, any>): void {
    this.logs.push({ level: 'warn', message, context });
  }
  
  error(message: string, context?: Record<string, any>): void {
    this.logs.push({ level: 'error', message, context });
  }
}

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
      logger: mockLogger
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
      expect(mockLogger.logs.length).toBeGreaterThan(0);
      expect(mockLogger.logs.some(log => 
        log.level === 'info' && 
        log.message.includes('Upserting vectors') &&
        log.context?.indexName === 'test-index' &&
        log.context?.recordCount === 2 &&
        log.context?.namespace === 'test-namespace'
      )).toBe(true);
      
      expect(mockLogger.logs.some(log => 
        log.level === 'info' && 
        log.message.includes('Successfully upserted')
      )).toBe(true);
    });
    
    it('should log retries on failures', async () => {
      const records = [{ id: '1', values: [0.1, 0.2, 0.3] }];
      
      // Make the first call fail, then succeed
      (mockIndex.upsert as jest.Mock)
        .mockRejectedValueOnce(new Error('Test error'))
        .mockResolvedValueOnce({});
      
      await service.upsertVectors('test-index', records);
      
      // Verify retry logs
      expect(mockLogger.logs.some(log => 
        log.level === 'warn' && 
        log.message.includes('Retrying Pinecone operation') &&
        log.context?.error === 'Test error'
      )).toBe(true);
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
      const batchLogs = mockLogger.logs.filter(log => 
        log.level === 'debug' && 
        log.message.includes('Processing batch')
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
      await service.upsertVectors('test-index', records, undefined, { batchSize: 10 });
      
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
      await new Promise(resolve => setTimeout(resolve, 150));
      
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
});