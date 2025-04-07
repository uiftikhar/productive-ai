import { Logger } from "../../shared/logger/logger.interface.ts";
import { PineconeConnectionService } from "../pinecone-connection.service.ts";
import { PineconeIndexService } from "../pinecone-index.service.ts";


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
  let mockIndex: any;
  
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
      getIndex: jest.fn().mockReturnValue(mockIndex),
      indexExists: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<PineconeIndexService>;
    
    // Create mock logger
    mockLogger = new MockLogger();
    
    // Create service with mocks
    service = new PineconeConnectionService(mockIndexService, mockLogger);
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
      mockIndex.upsert
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
});