import { UserContextValidationError } from '../user-context/types/context.types';
import { BaseContextService } from '../user-context/base-context.service';
import { DocumentContextService } from '../user-context/document-context.service';

// Mock dependencies
jest.mock('../user-context/base-context.service');
jest.mock('../user-context/metadata-validation.service');

describe('DocumentContextService', () => {
  let service: DocumentContextService;
  let mockPineconeService: any;
  let mockRetryCounter = 0;

  beforeEach(() => {
    mockRetryCounter = 0;

    // Mock the parent class behavior
    (BaseContextService.prototype as any).executeWithRetry = jest
      .fn()
      .mockImplementation((fn, opName) => {
        mockRetryCounter++;
        return fn();
      });

    (BaseContextService.prototype as any).storeUserContext = jest
      .fn()
      .mockResolvedValue('mock-doc-id-123');

    // Create instance with mocked parent class
    service = new DocumentContextService();

    // Set up pinecone service mock
    mockPineconeService = {
      queryVectors: jest.fn(),
      deleteVectors: jest.fn().mockResolvedValue({ success: true }),
    };
    (service as any).pineconeService = mockPineconeService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('storeDocumentChunk', () => {
    test('should store document chunk with correct metadata', async () => {
      // Arrange
      const userId = 'user-123';
      const documentId = 'doc-123';
      const documentTitle = 'Test Document';
      const content = 'Document content';
      const embeddings = [0.1, 0.2, 0.3];
      const chunkIndex = 1;
      const totalChunks = 5;

      // Act
      const result = await service.storeDocumentChunk(
        userId,
        documentId,
        documentTitle,
        content,
        embeddings,
        chunkIndex,
        totalChunks,
      );

      // Assert
      expect(result).toBe('mock-doc-id-123');
      expect(
        (BaseContextService.prototype as any).storeUserContext,
      ).toHaveBeenCalledWith(
        userId,
        content,
        embeddings,
        expect.objectContaining({
          contextType: 'document',
          documentId,
          documentTitle,
          chunkIndex,
          totalChunks,
          timestamp: expect.any(Number),
        }),
      );
    });

    test('should use default values for chunkIndex and totalChunks when not provided', async () => {
      // Arrange
      const userId = 'user-123';
      const documentId = 'doc-123';
      const documentTitle = 'Test Document';
      const content = 'Document content';
      const embeddings = [0.1, 0.2, 0.3];

      // Act
      const result = await service.storeDocumentChunk(
        userId,
        documentId,
        documentTitle,
        content,
        embeddings,
      );

      // Assert
      expect(
        (BaseContextService.prototype as any).storeUserContext,
      ).toHaveBeenCalledWith(
        userId,
        content,
        embeddings,
        expect.objectContaining({
          chunkIndex: 0,
          totalChunks: 1,
        }),
      );
    });

    test('should include additional metadata when provided', async () => {
      // Arrange
      const userId = 'user-123';
      const documentId = 'doc-123';
      const documentTitle = 'Test Document';
      const content = 'Document content';
      const embeddings = [0.1, 0.2, 0.3];
      const additionalMetadata = {
        author: 'Test Author',
        category: 'test-category',
      };

      // Act
      await service.storeDocumentChunk(
        userId,
        documentId,
        documentTitle,
        content,
        embeddings,
        0,
        1,
        additionalMetadata,
      );

      // Assert
      expect(
        (BaseContextService.prototype as any).storeUserContext,
      ).toHaveBeenCalledWith(
        userId,
        content,
        embeddings,
        expect.objectContaining({
          author: 'Test Author',
          category: 'test-category',
        }),
      );
    });

    test('should throw error when document ID is missing', async () => {
      // Arrange
      const userId = 'user-123';
      const documentId = '';
      const documentTitle = 'Test Document';
      const content = 'Document content';
      const embeddings = [0.1, 0.2, 0.3];

      // Act & Assert
      await expect(
        service.storeDocumentChunk(
          userId,
          documentId,
          documentTitle,
          content,
          embeddings,
        ),
      ).rejects.toThrow(UserContextValidationError);

      expect(
        (BaseContextService.prototype as any).storeUserContext,
      ).not.toHaveBeenCalled();
    });
  });

  describe('getDocumentChunks', () => {
    test('should retrieve document chunks with correct filter', async () => {
      // Arrange
      const userId = 'user-123';
      const documentId = 'doc-123';

      const mockMatches = [
        {
          id: 'chunk-1',
          metadata: {
            chunkIndex: 1,
            content: 'First chunk',
          },
        },
        {
          id: 'chunk-0',
          metadata: {
            chunkIndex: 0,
            content: 'Introduction',
          },
        },
        {
          id: 'chunk-2',
          metadata: {
            chunkIndex: 2,
            content: 'Last chunk',
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.getDocumentChunks(userId, documentId);

      // Assert
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        [],
        {
          topK: 1000,
          filter: {
            contextType: 'document',
            documentId,
          },
          includeValues: false,
          includeMetadata: true,
        },
        userId,
      );

      expect(result).toHaveLength(3);
      // Should be ordered by chunkIndex
      expect(result[0].id).toBe('chunk-0');
      expect(result[1].id).toBe('chunk-1');
      expect(result[2].id).toBe('chunk-2');
    });

    test('should sort results by chunkIndex', async () => {
      // Arrange
      const userId = 'user-123';
      const documentId = 'doc-123';

      // Out of order chunkIndexes
      const mockMatches = [
        { id: 'chunk-2', metadata: { chunkIndex: 2 } },
        { id: 'chunk-0', metadata: { chunkIndex: 0 } },
        { id: 'chunk-1', metadata: { chunkIndex: 1 } },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.getDocumentChunks(userId, documentId);

      // Assert
      expect(result[0].id).toBe('chunk-0');
      expect(result[1].id).toBe('chunk-1');
      expect(result[2].id).toBe('chunk-2');
    });

    test('should use retry mechanism', async () => {
      // Arrange
      const userId = 'user-123';
      const documentId = 'doc-123';

      mockPineconeService.queryVectors.mockResolvedValue({ matches: [] });

      // Act
      await service.getDocumentChunks(userId, documentId);

      // Assert
      expect(mockRetryCounter).toBe(1);
      expect(
        (BaseContextService.prototype as any).executeWithRetry,
      ).toHaveBeenCalledWith(
        expect.any(Function),
        `getDocumentChunks:${userId}:${documentId}`,
      );
    });
  });

  describe('deleteDocument', () => {
    test('should delete all chunks of a document', async () => {
      // Arrange
      const userId = 'user-123';
      const documentId = 'doc-123';

      const mockMatches = [
        { id: 'chunk-0' },
        { id: 'chunk-1' },
        { id: 'chunk-2' },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.deleteDocument(userId, documentId);

      // Assert
      expect(result).toBe(3); // Three chunks deleted

      // Check first query to find the chunks
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        [],
        {
          topK: 1000,
          filter: {
            contextType: 'document',
            documentId,
          },
          includeValues: false,
          includeMetadata: false,
        },
        userId,
      );

      // Check deletion of the chunks
      expect(mockPineconeService.deleteVectors).toHaveBeenCalledWith(
        'user-context',
        ['chunk-0', 'chunk-1', 'chunk-2'],
        userId,
      );
    });

    test('should return 0 when no chunks found', async () => {
      // Arrange
      const userId = 'user-123';
      const documentId = 'non-existent-doc';

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [],
      });

      // Act
      const result = await service.deleteDocument(userId, documentId);

      // Assert
      expect(result).toBe(0);
      expect(mockPineconeService.deleteVectors).not.toHaveBeenCalled();
    });

    test('should use retry mechanism for both operations', async () => {
      // Arrange
      const userId = 'user-123';
      const documentId = 'doc-123';

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [{ id: 'chunk-0' }],
      });

      // Act
      await service.deleteDocument(userId, documentId);

      // Assert
      expect(mockRetryCounter).toBe(2); // Two operations with retry
      expect(
        (BaseContextService.prototype as any).executeWithRetry,
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('searchDocumentContent', () => {
    test('should search with basic filter', async () => {
      // Arrange
      const userId = 'user-123';
      const queryEmbedding = [0.1, 0.2, 0.3];

      const mockMatches = [
        {
          id: 'chunk-1',
          score: 0.95,
          metadata: {
            documentId: 'doc-1',
            documentTitle: 'Test Document',
            chunkIndex: 2,
            totalChunks: 5,
            content: 'Relevant content',
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.searchDocumentContent(
        userId,
        queryEmbedding,
      );

      // Assert
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        queryEmbedding,
        {
          topK: 10,
          filter: {
            contextType: 'document',
          },
          includeValues: false,
          includeMetadata: true,
        },
        userId,
      );

      // Check result formatting
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'chunk-1',
        score: 0.95,
        documentId: 'doc-1',
        documentTitle: 'Test Document',
        chunkIndex: 2,
        totalChunks: 5,
        content: undefined, // includeContent default is false
        metadata: mockMatches[0].metadata,
      });
    });

    test('should apply document ID filter when provided', async () => {
      // Arrange
      const userId = 'user-123';
      const queryEmbedding = [0.1, 0.2, 0.3];
      const options = {
        documentIds: ['doc-1', 'doc-2'],
        maxResults: 5,
      };

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [],
      });

      // Act
      await service.searchDocumentContent(userId, queryEmbedding, options);

      // Assert
      expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
        'user-context',
        queryEmbedding,
        {
          topK: 5,
          filter: {
            contextType: 'document',
            documentId: { $in: ['doc-1', 'doc-2'] },
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
        { id: 'chunk-1', score: 0.9, metadata: {} },
        { id: 'chunk-2', score: 0.7, metadata: {} },
        { id: 'chunk-3', score: 0.5, metadata: {} },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.searchDocumentContent(
        userId,
        queryEmbedding,
        {
          minRelevanceScore: 0.7,
        },
      );

      // Assert
      expect(result).toHaveLength(2); // Only the top 2 matches meet the threshold
      expect(result[0].id).toBe('chunk-1');
      expect(result[1].id).toBe('chunk-2');
    });

    test('should include content when includeContent option is true', async () => {
      // Arrange
      const userId = 'user-123';
      const queryEmbedding = [0.1, 0.2, 0.3];

      const mockMatches = [
        {
          id: 'chunk-1',
          score: 0.9,
          metadata: {
            content: 'Document chunk content',
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.searchDocumentContent(
        userId,
        queryEmbedding,
        {
          includeContent: true,
        },
      );

      // Assert
      expect(result[0].content).toBe('Document chunk content');
    });
  });

  describe('listUserDocuments', () => {
    test('should list and group documents correctly', async () => {
      // Arrange
      const userId = 'user-123';

      // Chunks from different documents
      const mockMatches = [
        {
          id: 'chunk-1',
          metadata: {
            documentId: 'doc-1',
            documentTitle: 'Document One',
            timestamp: 1000,
          },
        },
        {
          id: 'chunk-2',
          metadata: {
            documentId: 'doc-1',
            documentTitle: 'Document One',
            timestamp: 2000,
          },
        },
        {
          id: 'chunk-3',
          metadata: {
            documentId: 'doc-2',
            documentTitle: 'Document Two',
            timestamp: 1500,
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.listUserDocuments(userId);

      // Assert
      expect(result).toHaveLength(2); // Two documents

      // First document should have 2 chunks
      expect(result[0].documentId).toBe('doc-1');
      expect(result[0].documentTitle).toBe('Document One');
      expect(result[0].chunkCount).toBe(2);
      expect(result[0].lastUpdated).toBe(2000); // The most recent timestamp

      // Second document should have 1 chunk
      expect(result[1].documentId).toBe('doc-2');
      expect(result[1].documentTitle).toBe('Document Two');
      expect(result[1].chunkCount).toBe(1);
    });

    test('should return empty array when no documents found', async () => {
      // Arrange
      const userId = 'user-123';

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: [],
      });

      // Act
      const result = await service.listUserDocuments(userId);

      // Assert
      expect(result).toEqual([]);
    });

    test('should handle chunks without documentId', async () => {
      // Arrange
      const userId = 'user-123';

      // Some chunks missing documentId
      const mockMatches = [
        {
          id: 'chunk-1',
          metadata: {
            documentId: 'doc-1',
            documentTitle: 'Document One',
            timestamp: 1000,
          },
        },
        {
          id: 'chunk-2',
          metadata: {
            timestamp: 2000,
            // No documentId
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.listUserDocuments(userId);

      // Assert
      expect(result).toHaveLength(1); // Only one valid document
      expect(result[0].documentId).toBe('doc-1');
      expect(result[0].chunkCount).toBe(1);
    });

    test('should use document ID as title when title is missing', async () => {
      // Arrange
      const userId = 'user-123';

      const mockMatches = [
        {
          id: 'chunk-1',
          metadata: {
            documentId: 'doc-1',
            // No documentTitle
            timestamp: 1000,
          },
        },
      ];

      mockPineconeService.queryVectors.mockResolvedValue({
        matches: mockMatches,
      });

      // Act
      const result = await service.listUserDocuments(userId);

      // Assert
      expect(result[0].documentTitle).toBe('doc-1'); // Falls back to ID
    });
  });
});
