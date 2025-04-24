import { EmbeddingAdapter } from '../embedding-adapter';
import { OpenAIConnector } from '../../../agents/integrations';
import { Logger, LogLevel } from '../../logger/logger.interface';
import { ConsoleLogger } from '../../logger/console-logger';
import { EmbeddingServiceFactory } from '../embedding.factory';
import { MockLogger } from '../../../agents/tests/mocks/mock-logger';

// Mock dependencies
jest.mock('../../../agents/integrations/openai-connector');
jest.mock('../embedding.factory');

// Mock Logger implementation is replaced with import

// Mock implementation for EmbeddingService
const mockGenerateEmbedding = jest.fn();
const mockCalculateCosineSimilarity = jest.fn();
const mockSearchInLongText = jest.fn();
const mockFindSimilarContent = jest.fn();

const mockEmbeddingService = {
  generateEmbedding: mockGenerateEmbedding,
  calculateCosineSimilarity: mockCalculateCosineSimilarity,
  searchInLongText: mockSearchInLongText,
  findSimilarContent: mockFindSimilarContent,
};

describe('EmbeddingAdapter', () => {
  let adapter: EmbeddingAdapter;
  let mockConnector: any;
  let mockLogger: MockLogger;
  let sampleEmbedding: number[];

  beforeEach(() => {
    mockConnector = {
      generateEmbedding: jest.fn().mockResolvedValue(sampleEmbedding),
      isInitialized: true,
    };

    mockLogger = new MockLogger();
    sampleEmbedding = [0.1, 0.2, 0.3];

    // Mock the EmbeddingServiceFactory
    (EmbeddingServiceFactory.getService as jest.Mock).mockImplementation(
      (options = {}) => {
        if (options.embeddingService) {
          return options.embeddingService;
        }
        return mockEmbeddingService;
      },
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with default options', () => {
      const adapter = new EmbeddingAdapter();
      expect(EmbeddingServiceFactory.getService).toHaveBeenCalledWith(
        expect.objectContaining({
          logger: expect.any(ConsoleLogger),
        }),
      );
    });

    test('should initialize with provided connector', () => {
      const mockConnector = new OpenAIConnector({} as any);
      const adapter = new EmbeddingAdapter({ connector: mockConnector });
      expect(EmbeddingServiceFactory.getService).toHaveBeenCalledWith(
        expect.objectContaining({
          connector: mockConnector,
          logger: expect.any(ConsoleLogger),
        }),
      );
    });

    test('should initialize with provided logger', () => {
      const adapter = new EmbeddingAdapter({ logger: mockLogger });
      expect(EmbeddingServiceFactory.getService).toHaveBeenCalledWith({
        logger: mockLogger,
      });
    });

    test('should initialize with provided service', () => {
      const customService = { ...mockEmbeddingService };
      const adapter = new EmbeddingAdapter({ embeddingService: customService });
      // For this test, ensure we're not calling getService at all since we provided the service
      expect(EmbeddingServiceFactory.getService).not.toHaveBeenCalled();
    });
  });

  describe('generateEmbedding', () => {
    test('should call underlying service generateEmbedding when available', async () => {
      // Arrange
      const mockEmbeddingService = {
        generateEmbedding: jest.fn().mockResolvedValue(sampleEmbedding),
      };

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      // Act
      const result = await adapter.generateEmbedding('test text');

      // Assert
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        'test text',
      );
      expect(result).toEqual(sampleEmbedding);
    });

    test('should fall back to embedText when generateEmbedding not available', async () => {
      // Arrange
      const mockEmbeddingService = {
        embedText: jest.fn().mockResolvedValue(sampleEmbedding),
      };

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      // Act
      const result = await adapter.generateEmbedding('test text');

      // Assert
      expect(mockEmbeddingService.embedText).toHaveBeenCalledWith('test text');
      expect(result).toEqual(sampleEmbedding);
      expect(
        mockLogger.hasMessage('Falling back to embedText method', 'debug'),
      ).toBe(true);
    });

    test('should fall back to embedQuery when other methods not available', async () => {
      // Arrange
      const mockEmbeddingService = {
        embedQuery: jest.fn().mockResolvedValue(sampleEmbedding),
      };

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      // Act
      const result = await adapter.generateEmbedding('test text');

      // Assert
      expect(mockEmbeddingService.embedQuery).toHaveBeenCalledWith('test text');
      expect(result).toEqual(sampleEmbedding);
      expect(
        mockLogger.hasMessage('Falling back to embedQuery method', 'debug'),
      ).toBe(true);
    });

    test('should return zero vector as last resort', async () => {
      // Arrange
      const mockEmbeddingService = {};

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      // Act
      const result = await adapter.generateEmbedding('test text');

      // Assert
      expect(result).toEqual(new Array(3072).fill(0));
      expect(mockLogger.hasMessage('No embedding method found', 'warn')).toBe(
        true,
      );
    });

    test('should handle and propagate errors', async () => {
      // Arrange
      const mockEmbeddingService = {
        generateEmbedding: jest.fn().mockRejectedValue(new Error('API error')),
      };

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      // Act & Assert
      await expect(adapter.generateEmbedding('test text')).rejects.toThrow(
        'Embedding generation failed: API error',
      );
      expect(
        mockLogger.hasMessage('Error generating embedding: API error', 'error'),
      ).toBe(true);
    });
  });

  describe('calculateCosineSimilarity', () => {
    test('should call underlying service method when available', () => {
      // Arrange
      const mockEmbeddingService = {
        calculateCosineSimilarity: jest.fn().mockReturnValue(0.75),
      };

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      const vec1 = [0.1, 0.2, 0.3];
      const vec2 = [0.4, 0.5, 0.6];

      // Act
      const result = adapter.calculateCosineSimilarity(vec1, vec2);

      // Assert
      expect(
        mockEmbeddingService.calculateCosineSimilarity,
      ).toHaveBeenCalledWith(vec1, vec2);
      expect(result).toBe(0.75);
    });

    test('should implement similarity locally when method not available', () => {
      // Arrange
      const mockEmbeddingService = {};

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      // Two orthogonal vectors should have similarity of 0
      const vec1 = [1, 0, 0];
      const vec2 = [0, 1, 0];

      // Act
      const result = adapter.calculateCosineSimilarity(vec1, vec2);

      // Assert
      expect(result).toBe(0);
      expect(
        mockLogger.hasMessage(
          'Implementing cosine similarity locally',
          'debug',
        ),
      ).toBe(true);
    });

    test('should throw error for mismatched dimensions', () => {
      // Arrange
      const mockEmbeddingService = {};

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      const vec1 = [1, 2, 3];
      const vec2 = [1, 2, 3, 4]; // Different dimensions

      // Act & Assert
      expect(() => adapter.calculateCosineSimilarity(vec1, vec2)).toThrow(
        'Embeddings must have the same dimensions',
      );
    });
  });

  describe('findSimilarEmbeddings', () => {
    test('should call underlying service method when available', () => {
      // Arrange
      const expectedResults = [
        { similarity: 0.95, metadata: { id: 1 } },
        { similarity: 0.85, metadata: { id: 2 } },
      ];

      const mockEmbeddingService = {
        findSimilarEmbeddings: jest.fn().mockReturnValue(expectedResults),
      };

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      const queryEmbedding = [0.1, 0.2, 0.3];
      const embeddingsWithMetadata = [
        { embedding: [0.1, 0.2, 0.3], metadata: { id: 1 } },
        { embedding: [0.4, 0.5, 0.6], metadata: { id: 2 } },
      ];

      // Act
      const result = adapter.findSimilarEmbeddings(
        queryEmbedding,
        embeddingsWithMetadata,
      );

      // Assert
      expect(mockEmbeddingService.findSimilarEmbeddings).toHaveBeenCalledWith(
        queryEmbedding,
        embeddingsWithMetadata,
        5,
      );
      expect(result).toBe(expectedResults);
    });

    test('should implement locally when method not available and use limit', () => {
      // Arrange
      const mockEmbeddingService = {
        // Only provide calculateCosineSimilarity to test the fallback path
        calculateCosineSimilarity: jest
          .fn()
          .mockReturnValueOnce(0.9) // First item
          .mockReturnValueOnce(0.8), // Second item
      };

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      const queryEmbedding = [0.1, 0.2, 0.3];
      const embeddingsWithMetadata = [
        { embedding: [0.1, 0.2, 0.3], metadata: { id: 1 } },
        { embedding: [0.4, 0.5, 0.6], metadata: { id: 2 } },
      ];
      const limit = 1;

      // Act
      const result = adapter.findSimilarEmbeddings(
        queryEmbedding,
        embeddingsWithMetadata,
        limit,
      );

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].similarity).toBe(0.9);
      expect(result[0].metadata.id).toBe(1);
      expect(
        mockLogger.hasMessage(
          'Implementing findSimilarEmbeddings locally',
          'debug',
        ),
      ).toBe(true);
    });
  });

  describe('combineEmbeddings', () => {
    test('should call underlying service method when available', () => {
      // Arrange
      const mockEmbeddingService = {
        combineEmbeddings: jest.fn().mockReturnValue(sampleEmbedding),
      };

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      const embeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ];

      // Act
      const result = adapter.combineEmbeddings(embeddings);

      // Assert
      expect(mockEmbeddingService.combineEmbeddings).toHaveBeenCalledWith(
        embeddings,
      );
      expect(result).toBe(sampleEmbedding);
    });

    test('should implement locally when method not available', () => {
      // Arrange
      const mockEmbeddingService = {};

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      const embeddings = [
        [1, 0, 0],
        [0, 1, 0],
      ];

      // Act
      const result = adapter.combineEmbeddings(embeddings);

      // Assert
      expect(result).toHaveLength(3);
      expect(
        mockLogger.hasMessage(
          'Implementing combineEmbeddings locally',
          'debug',
        ),
      ).toBe(true);

      // Verify it's a normalized vector
      const magnitude = Math.sqrt(
        result.reduce((sum, val) => sum + val * val, 0),
      );
      expect(magnitude).toBeCloseTo(1);
    });

    test('should throw error when no embeddings provided', () => {
      // Arrange
      const mockEmbeddingService = {};

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      // Act & Assert
      expect(() => adapter.combineEmbeddings([])).toThrow(
        'No embeddings provided to combine',
      );
    });

    test('should throw error for embeddings with different dimensions', () => {
      // Arrange
      const mockEmbeddingService = {};

      adapter = new EmbeddingAdapter({
        embeddingService: mockEmbeddingService,
        logger: mockLogger,
      });

      const embeddings = [
        [1, 2, 3],
        [4, 5, 6, 7], // Different dimensions
      ];

      // Act & Assert
      expect(() => adapter.combineEmbeddings(embeddings)).toThrow(
        'All embeddings must have the same dimensions',
      );
    });
  });

  describe('alternative interface methods', () => {
    test('embedText should delegate to generateEmbedding', async () => {
      // Arrange
      adapter = new EmbeddingAdapter({
        logger: mockLogger,
      });

      // Create a spy on the generateEmbedding method
      const generateEmbeddingSpy = jest
        .spyOn(adapter, 'generateEmbedding')
        .mockResolvedValue(sampleEmbedding);

      // Act
      const result = await adapter.embedText('test text');

      // Assert
      expect(generateEmbeddingSpy).toHaveBeenCalledWith('test text');
      expect(result).toBe(sampleEmbedding);
      expect(
        mockLogger.hasMessage(
          'Using embedText (alternative interface)',
          'debug',
        ),
      ).toBe(true);
    });

    test('embedBatch should call generateEmbedding for each text', async () => {
      // Arrange
      adapter = new EmbeddingAdapter({
        logger: mockLogger,
      });

      // Create a spy on the generateEmbedding method
      const generateEmbeddingSpy = jest
        .spyOn(adapter, 'generateEmbedding')
        .mockResolvedValueOnce([0.1, 0.2, 0.3])
        .mockResolvedValueOnce([0.4, 0.5, 0.6]);

      const texts = ['text1', 'text2'];

      // Act
      const result = await adapter.embedBatch(texts);

      // Assert
      expect(generateEmbeddingSpy).toHaveBeenCalledTimes(2);
      expect(generateEmbeddingSpy).toHaveBeenCalledWith('text1');
      expect(generateEmbeddingSpy).toHaveBeenCalledWith('text2');
      expect(result).toEqual([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]);
      expect(
        mockLogger.hasMessage(
          'Using embedBatch (alternative interface)',
          'debug',
        ),
      ).toBe(true);
    });

    test('getModelName should return the correct model name', () => {
      // Arrange
      adapter = new EmbeddingAdapter();

      // Act
      const result = adapter.getModelName();

      // Assert
      expect(result).toBe('text-embedding-3-large');
    });

    test('getDimensions should return the correct dimensions', () => {
      // Arrange
      adapter = new EmbeddingAdapter();

      // Act
      const result = adapter.getDimensions();

      // Assert
      expect(result).toBe(3072);
    });

    test('getCost should return the cost per 1K tokens', () => {
      // Arrange
      adapter = new EmbeddingAdapter();

      // Act
      const result = adapter.getCost();

      // Assert
      expect(result).toBe(0.00013);
    });
  });
});
