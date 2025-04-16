import { EmbeddingService } from '../embedding.service';

jest.mock('openai', () => {
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      embeddings: {
        create: jest.fn().mockImplementation(({ input }) => {
          const mockEmbedding = [0.1, 0.2, 0.3];
          if (Array.isArray(input)) {
            return {
              data: input.map(() => ({ embedding: mockEmbedding })),
            };
          }
          return {
            data: [{ embedding: mockEmbedding }],
          };
        }),
      },
    })),
  };
});

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  const mockLogger = {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmbeddingService({}, mockLogger as any);
  });

  describe('generateEmbedding', () => {
    it('should generate an embedding for a text', async () => {
      const result = await service.generateEmbedding('test text');
      expect(result).toEqual([0.1, 0.2, 0.3]);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Generating embedding for text of length 9',
      );
    });

    it('should handle errors', async () => {
      const openai = require('openai');
      openai.OpenAI.mockImplementationOnce(() => ({
        embeddings: {
          create: jest.fn().mockRejectedValue(new Error('API error')),
        },
      }));

      const errorService = new EmbeddingService({}, mockLogger as any);
      await expect(errorService.generateEmbedding('test')).rejects.toThrow(
        'Failed to generate embedding: API error',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings for multiple texts', async () => {
      const result = await service.generateEmbeddings(['text1', 'text2']);
      expect(result).toEqual([
        [0.1, 0.2, 0.3],
        [0.1, 0.2, 0.3],
      ]);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Generating embeddings for 2 texts',
      );
    });
  });

  describe('cosineSimilarity', () => {
    it('should calculate cosine similarity correctly', () => {
      const a = [1, 2, 3];
      const b = [4, 5, 6];
      const result = service.cosineSimilarity(a, b);
      // Expected: (1*4 + 2*5 + 3*6) / (sqrt(1^2 + 2^2 + 3^2) * sqrt(4^2 + 5^2 + 6^2))
      // = (4 + 10 + 18) / (sqrt(14) * sqrt(77))
      // = 32 / (3.74 * 8.77) = 32 / 32.8 ≈ 0.975
      expect(result).toBeCloseTo(0.975, 3);
    });

    it('should throw error if vectors have different dimensions', () => {
      expect(() => service.cosineSimilarity([1, 2], [1, 2, 3])).toThrow(
        'Vectors must have the same dimensions',
      );
    });
  });

  describe('findSimilarContent', () => {
    it('should return empty array for empty content', async () => {
      const result = await service.findSimilarContent('query', []);
      expect(result).toEqual([]);
    });

    it('should find and rank similar content', async () => {
      // Mock cosineSimilarity to return different values for different indices
      jest
        .spyOn(service, 'cosineSimilarity')
        .mockReturnValueOnce(0.9) // First call: 0.9
        .mockReturnValueOnce(0.5) // Second call: 0.5
        .mockReturnValueOnce(0.7); // Third call: 0.7

      const contents = ['content1', 'content2', 'content3'];
      const result = await service.findSimilarContent('query', contents, 2);

      // Should return top 2 results in descending order of similarity
      expect(result).toEqual([
        { content: 'content1', score: 0.9 },
        { content: 'content3', score: 0.7 },
      ]);
    });
  });

  describe('splitContentIntoChunks', () => {
    it('should split content into chunks with overlap', () => {
      const content = '0123456789';
      const result = service.splitContentIntoChunks(content, 5, 2);

      // Expected chunks:
      // 0-4: "01234"
      // 3-7: "34567"
      // 6-10: "6789"
      // 9-10: "9" (this is the actual behavior)
      expect(result).toEqual(['01234', '34567', '6789', '9']);
    });

    it('should handle content shorter than chunk size', () => {
      const content = '0123';
      const result = service.splitContentIntoChunks(content, 10, 2);
      expect(result).toEqual(['0123']);
    });
  });

  describe('searchInLongText', () => {
    it('should search within a long text by chunking it first', async () => {
      // Mock the required methods
      jest
        .spyOn(service, 'splitContentIntoChunks')
        .mockReturnValue(['chunk1', 'chunk2']);
      jest
        .spyOn(service, 'findSimilarContent')
        .mockResolvedValue([{ content: 'chunk2', score: 0.8 }]);

      const result = await service.searchInLongText(
        'query',
        'long text content',
        1,
      );

      expect(service.splitContentIntoChunks).toHaveBeenCalledWith(
        'long text content',
        1000,
        200,
      );
      expect(service.findSimilarContent).toHaveBeenCalledWith(
        'query',
        ['chunk1', 'chunk2'],
        1,
      );
      expect(result).toEqual([{ content: 'chunk2', score: 0.8 }]);
    });
  });
});
