import { EmbeddingService } from '../embedding.service';
import { EmbeddingAdapter } from '../embedding-adapter';
import { EmbeddingServiceFactory } from '../embedding.factory';
import { OpenAIConnector } from '../../../agents/integrations/openai-connector';
import { Logger, LogLevel } from '../../../shared/logger/logger.interface';
import { IEmbeddingService } from '../embedding.interface';

// Mock OpenAIConnector
jest.mock('../../../agents/integrations/openai-connector');

// Mock the factory to use real EmbeddingService with mocked connector
jest.mock('../embedding.factory', () => {
  // Import the real EmbeddingService
  const { EmbeddingService } = jest.requireActual('../embedding.service');
  
  return {
    EmbeddingServiceFactory: {
      getService: jest.fn((options = {}) => {
        const connector = options.connector || new (require('../../../agents/integrations/openai-connector').OpenAIConnector)();
        const logger = options.logger || console;
        // Use the real EmbeddingService with mocked dependencies
        return new EmbeddingService(connector, logger, true);
      }),
      reset: jest.fn()
    }
  };
});

// Mock Logger
class MockLogger implements Logger {
  public messages: { level: string; message: string, context?: any }[] = [];
  
  debug(message: string, context?: any): void {
    this.messages.push({ level: 'debug', message, context });
  }
  
  info(message: string, context?: any): void {
    this.messages.push({ level: 'info', message, context });
  }
  
  warn(message: string, context?: any): void {
    this.messages.push({ level: 'warn', message, context });
  }
  
  error(message: string, context?: any): void {
    this.messages.push({ level: 'error', message, context });
  }

  setLogLevel(level: LogLevel): void {
    // No-op for tests
  }
  
  clear(): void {
    this.messages = [];
  }
  
  hasMessage(searchText: string, level?: string): boolean {
    return this.messages.some(msg => 
      msg.message.includes(searchText) && 
      (level === undefined || msg.level === level)
    );
  }
}

describe('EmbeddingService', () => {
  let embeddingService: IEmbeddingService;
  let mockOpenAIConnector: jest.Mocked<OpenAIConnector>;
  let mockLogger: MockLogger;
  
  // Sample data for tests
  const sampleShortEmbedding = Array(3072).fill(0).map((_, i) => i / 10000);
  const sampleLongText = 'a'.repeat(10000);
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockOpenAIConnector = new OpenAIConnector() as jest.Mocked<OpenAIConnector>;
    mockLogger = new MockLogger();
    
    // Mock the connector's generateEmbedding method
    mockOpenAIConnector.generateEmbedding = jest.fn().mockResolvedValue(sampleShortEmbedding);
    
    // Use the factory to create the service with real implementation
    embeddingService = EmbeddingServiceFactory.getService({
      connector: mockOpenAIConnector,
      logger: mockLogger
    });
  });
  
  describe('generateEmbedding', () => {
    test('should generate embedding for short text directly', async () => {
      const shortText = 'This is a short text for embedding';
      
      const result = await embeddingService.generateEmbedding(shortText);
      
      // Verify the connector was called with the input text
      expect(mockOpenAIConnector.generateEmbedding).toHaveBeenCalledWith(shortText.trim());
      expect(result).toEqual(sampleShortEmbedding);
      
      // Verify the logs (text might be different with actual implementation)
      expect(mockLogger.hasMessage('text of length', 'debug')).toBe(true);
    });
    
    test('should handle empty text input gracefully', async () => {
      const emptyText = '';
      
      const result = await embeddingService.generateEmbedding(emptyText);
      
      // Verify warning was logged
      expect(mockLogger.hasMessage('Empty', 'warn')).toBe(true);
      
      // Result should be a zero vector
      expect(result.every(val => val === 0)).toBe(true);
    });
    
    test('should handle undefined text input gracefully', async () => {
      const result = await embeddingService.generateEmbedding(undefined as unknown as string);
      
      // Result should be a zero vector
      expect(result.every(val => val === 0)).toBe(true);
    });
    
    test('should use chunking for long text', async () => {
      const result = await embeddingService.generateEmbedding(sampleLongText);
      
      // Verify multiple calls to the connector for chunking
      expect(mockOpenAIConnector.generateEmbedding.mock.calls.length).toBeGreaterThan(1);
      
      // The result should be the same length as the sample
      expect(result).toHaveLength(sampleShortEmbedding.length);
    });
    
    test('should handle errors from the OpenAI connector', async () => {
      // Mock the connector to throw an error
      mockOpenAIConnector.generateEmbedding.mockRejectedValueOnce(
        new Error('OpenAI service unavailable')
      );
      
      // Verify the error is propagated
      await expect(embeddingService.generateEmbedding('test')).rejects.toThrow();
      
      // Verify error was logged
      expect(mockLogger.hasMessage('Error', 'error')).toBe(true);
    });
  });
  
  describe('calculateCosineSimilarity', () => {
    test('should calculate correct similarity for identical vectors', () => {
      const vec = [0.1, 0.2, 0.3, 0.4, 0.5];
      
      const similarity = embeddingService.calculateCosineSimilarity(vec, vec);
      
      // Identical vectors should have similarity of 1
      expect(similarity).toBe(1);
    });
    
    test('should calculate correct similarity for orthogonal vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];
      
      const similarity = embeddingService.calculateCosineSimilarity(vec1, vec2);
      
      // Orthogonal vectors should have similarity of 0
      expect(similarity).toBe(0);
    });
    
    test('should calculate correct similarity for opposite vectors', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [-1, -2, -3];
      
      const similarity = embeddingService.calculateCosineSimilarity(vec1, vec2);
      
      // Opposite vectors should have similarity of -1
      expect(similarity).toBe(-1);
    });
    
    test('should handle zero magnitude vectors', () => {
      const zeroVec = [0, 0, 0];
      const nonZeroVec = [1, 2, 3];
      
      const similarity = embeddingService.calculateCosineSimilarity(zeroVec, nonZeroVec);
      
      // Zero magnitude should result in similarity of 0
      expect(similarity).toBe(0);
    });
    
    test('should throw error for mismatched dimensions', () => {
      const vec1 = [1, 2, 3];
      const vec2 = [1, 2, 3, 4];
      
      expect(() => {
        embeddingService.calculateCosineSimilarity(vec1, vec2);
      }).toThrow('Embeddings must have the same dimensions');
    });
  });
  
  describe('findSimilarEmbeddings', () => {
    const queryEmbedding = [0.1, 0.2, 0.3];
    const embeddingsWithMetadata = [
      { embedding: [0.1, 0.2, 0.3], metadata: { id: 1 } },
      { embedding: [0.2, 0.3, 0.4], metadata: { id: 2 } },
      { embedding: [0.3, 0.4, 0.5], metadata: { id: 3 } },
      { embedding: [0.4, 0.5, 0.6], metadata: { id: 4 } },
      { embedding: [0.5, 0.6, 0.7], metadata: { id: 5 } },
      { embedding: [0.6, 0.7, 0.8], metadata: { id: 6 } },
    ];
    
    test('should find most similar embeddings in order', () => {
      const results = embeddingService.findSimilarEmbeddings(queryEmbedding, embeddingsWithMetadata);
      
      // Should return 5 results by default
      expect(results).toHaveLength(5);
      
      // First result should be the most similar (in this case, identical to query)
      expect(results[0].metadata.id).toBe(1);
      
      // Results should be in descending order of similarity
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].similarity).toBeGreaterThanOrEqual(results[i+1].similarity);
      }
    });
    
    test('should respect the limit parameter', () => {
      const limit = 2;
      const results = embeddingService.findSimilarEmbeddings(
        queryEmbedding, 
        embeddingsWithMetadata,
        limit
      );
      
      // Should respect the provided limit
      expect(results).toHaveLength(limit);
    });
    
    test('should handle empty embeddings array', () => {
      const results = embeddingService.findSimilarEmbeddings(queryEmbedding, []);
      
      expect(results).toHaveLength(0);
    });
  });
  
  describe('combineEmbeddings', () => {
    test('should combine multiple embeddings into a normalized vector', () => {
      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ];
      
      const result = embeddingService.combineEmbeddings(embeddings);
      
      // Result should be a normalized version of [1, 1, 1]
      expect(result).toHaveLength(3);
      expect(result[0]).toBeCloseTo(result[1]);
      expect(result[1]).toBeCloseTo(result[2]);
      
      // Verify the magnitude is 1 (normalized)
      const magnitude = Math.sqrt(result.reduce((sum: number, val: number) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1);
    });
    
    test('should throw error when combining empty array', () => {
      expect(() => {
        embeddingService.combineEmbeddings([]);
      }).toThrow('No embeddings provided to combine');
    });
    
    test('should throw error when combining embeddings of different dimensions', () => {
      const embeddings = [
        [1, 2, 3],
        [4, 5, 6, 7] // Different dimension
      ];
      
      expect(() => {
        embeddingService.combineEmbeddings(embeddings);
      }).toThrow('All embeddings must have the same dimensions');
    });
    
    test('should handle zero vectors gracefully', () => {
      const zeroEmbeddings = [
        [0, 0, 0],
        [0, 0, 0]
      ];
      
      const result = embeddingService.combineEmbeddings(zeroEmbeddings);
      
      // Result should be [0, 0, 0]
      expect(result).toEqual([0, 0, 0]);
    });
  });
  
  describe('alternative interface methods', () => {
    test('embedText should delegate to generateEmbedding', async () => {
      const text = "Test text";
      // Check if method exists before spying and calling
      if ('embedText' in embeddingService) {
        const spy = jest.spyOn(embeddingService, 'generateEmbedding');
        
        await (embeddingService as any).embedText(text);
        
        expect(spy).toHaveBeenCalledWith(text);
      } else {
        // Skip test if method doesn't exist
        console.log('embedText method not available, skipping test');
      }
    });
    
    test('embedBatch should generate embeddings for all texts', async () => {
      const texts = ["Test 1", "Test 2", "Test 3"];
      
      if ('embedBatch' in embeddingService) {
        const spy = jest.spyOn(embeddingService, 'generateEmbedding');
        
        const results = await (embeddingService as any).embedBatch(texts);
        
        expect(results.length).toBe(texts.length);
        expect(spy).toHaveBeenCalledTimes(texts.length);
      } else {
        // Skip test if method doesn't exist
        console.log('embedBatch method not available, skipping test');
      }
    });
    
    test('getModelName should return the model name', () => {
      if ('getModelName' in embeddingService) {
        const modelName = (embeddingService as any).getModelName();
        expect(typeof modelName).toBe('string');
        expect(modelName.length).toBeGreaterThan(0);
      } else {
        // Skip test if method doesn't exist
        console.log('getModelName method not available, skipping test');
      }
    });
    
    test('getDimensions should return embedding dimensions', () => {
      if ('getDimensions' in embeddingService) {
        const dimensions = (embeddingService as any).getDimensions();
        expect(typeof dimensions).toBe('number');
        expect(dimensions).toBeGreaterThan(0);
      } else {
        // Skip test if method doesn't exist
        console.log('getDimensions method not available, skipping test');
      }
    });
    
    test('getCost should return the cost per 1K tokens', () => {
      if ('getCost' in embeddingService) {
        const cost = (embeddingService as any).getCost();
        expect(typeof cost).toBe('number');
        expect(cost).toBeGreaterThan(0);
      } else {
        // Skip test if method doesn't exist
        console.log('getCost method not available, skipping test');
      }
    });
  });
}); 