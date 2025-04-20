import { PineconeConnector } from '../../integrations/pinecone-connector';
import { PineconeConnectionService } from '../../../pinecone/pinecone-connection.service';
import { VectorIndexes } from '../../../pinecone/pinecone-index.service';
import { Logger } from '../../../shared/logger/logger.interface';
import { RecordMetadata } from '@pinecone-database/pinecone';
import {
  VectorRecord,
  QueryOptions,
  QueryResponse,
} from '../../../pinecone/pinecone.type';

// Mock the PineconeConnectionService
jest.mock('../../../pinecone/pinecone-connection.service');

// Define the MockLoggerType
interface MockLoggerType extends Logger {
  messages: Array<{ level: string; message: string; meta?: any }>;
  clear(): void;
  getLogsByLevel(
    level: string,
  ): Array<{ level: string; message: string; meta?: any }>;
  hasMessage(messageSubstring: string, level?: string): boolean;
  currentLogLevel: string;
}

// Declare the global mockLogger
declare global {
  var mockLogger: MockLoggerType;
}

// Define sample test data
interface TestMetadata extends RecordMetadata {
  title: string;
  category: string;
  timestamp: number;
}

// Define mock fetch response type
interface MockFetchResponse<T extends RecordMetadata = RecordMetadata> {
  records: Record<string, VectorRecord<T>>;
  namespace: string;
}

describe('PineconeConnector Integration Tests', () => {
  let connector: PineconeConnector;
  let mockPineconeService: jest.Mocked<PineconeConnectionService>;

  // Test data
  const testUserId = 'test-user-123';
  const testIndexName = VectorIndexes.USER_CONTEXT;
  const testVectorId = 'test-vector-' + Date.now();
  const testVector = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
  const testMetadata: TestMetadata = {
    title: 'Test Vector',
    category: 'integration-test',
    timestamp: Date.now(),
  };

  // Mock vector records for tests
  const mockVectorRecords: Record<string, VectorRecord<TestMetadata>> = {
    [testVectorId]: {
      id: testVectorId,
      values: testVector,
      metadata: testMetadata,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Clear the global mockLogger
    global.mockLogger?.clear();

    // Create mock Pinecone service
    mockPineconeService = {
      upsertVectors: jest.fn().mockResolvedValue(undefined),
      fetchVectors: jest
        .fn()
        .mockImplementation(
          (
            indexName: string,
            ids: string[],
            namespace?: string,
          ): Promise<MockFetchResponse<TestMetadata>> => {
            const records: Record<string, VectorRecord<TestMetadata>> = {};
            ids.forEach((id: string) => {
              if (mockVectorRecords[id]) {
                records[id] = mockVectorRecords[id];
              }
            });
            return Promise.resolve({
              records,
              namespace: namespace || 'default',
            });
          },
        ),
      queryVectors: jest
        .fn()
        .mockImplementation(
          (
            indexName: string,
            queryVector: number[],
            options: QueryOptions = {},
            namespace?: string,
          ): Promise<QueryResponse<TestMetadata>> => {
            const matches = Object.values(mockVectorRecords)
              .filter((record) => {
                // Apply filter if provided
                if (options.filter) {
                  const filterKeys = Object.keys(options.filter);
                  return filterKeys.every(
                    (key) =>
                      record.metadata &&
                      record.metadata[key as keyof TestMetadata] ===
                        options.filter?.[key],
                  );
                }
                return true;
              })
              .map((record) => ({
                id: record.id,
                score: 0.95, // Default high score
                metadata: record.metadata,
                values: options.includeValues ? record.values : undefined,
              }))
              .slice(0, options.topK || 10);

            return Promise.resolve({
              matches,
              namespace: namespace || 'default',
            });
          },
        ),
      deleteVectors: jest
        .fn()
        .mockImplementation(
          (indexName: string, ids: string[], namespace?: string) => {
            ids.forEach((id: string) => {
              delete mockVectorRecords[id];
            });
            return Promise.resolve();
          },
        ),
      deleteVectorsByFilter: jest.fn().mockResolvedValue(undefined),
      namespaceExists: jest.fn().mockResolvedValue(true),
      getIndex: jest.fn().mockResolvedValue({ name: 'test-index' }),
      initialize: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PineconeConnectionService>;

    // Create connector instance with mock service
    connector = new PineconeConnector({
      pineconeService: mockPineconeService,
      logger: global.mockLogger,
      defaultNamespace: testUserId,
    });
  });

  describe('Initialization', () => {
    test('should initialize successfully', async () => {
      await connector.initialize();
      expect(
        global.mockLogger.hasMessage(
          'Initializing PineconeConnector connection',
          'info',
        ),
      ).toBe(true);
      expect(mockPineconeService.getIndex).toHaveBeenCalledWith(
        VectorIndexes.USER_CONTEXT,
      );
    });
  });

  describe('Vector Operations', () => {
    test('should store and retrieve a vector', async () => {
      // Store the vector
      await connector.storeVector<TestMetadata>(
        testIndexName,
        testVectorId,
        testVector,
        testMetadata,
        testUserId,
      );

      // Verify upsertVectors was called correctly
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        testIndexName,
        [
          {
            id: testVectorId,
            values: testVector,
            metadata: testMetadata,
          },
        ],
        testUserId,
      );

      // Add the vector to our mock records for the next fetch
      mockVectorRecords[testVectorId] = {
        id: testVectorId,
        values: testVector,
        metadata: testMetadata,
      };

      // Fetch the vector
      const result = await connector.fetchVectors<TestMetadata>(
        testIndexName,
        [testVectorId],
        testUserId,
      );

      // Verify the results
      expect(result).toBeDefined();
      expect(result[testVectorId]).toBeDefined();
      expect(result[testVectorId].id).toBe(testVectorId);
      expect(result[testVectorId].values).toHaveLength(testVector.length);
      expect(result[testVectorId].metadata).toMatchObject(testMetadata);
    });

    test('should store and query similar vectors', async () => {
      // Vector IDs for test
      const similarVector1Id = `test-vector-similar-1-${Date.now()}`;
      const similarVector2Id = `test-vector-similar-2-${Date.now()}`;
      const differentVectorId = `test-vector-different-${Date.now()}`;

      // Store multiple vectors with different categories
      const vectors = [
        {
          id: similarVector1Id,
          vector: testVector,
          metadata: {
            title: 'Similar Vector 1',
            category: 'test-similar',
            timestamp: Date.now(),
          } as TestMetadata,
        },
        {
          id: similarVector2Id,
          vector: testVector.map((v) => v * 0.9), // Slightly different
          metadata: {
            title: 'Similar Vector 2',
            category: 'test-similar',
            timestamp: Date.now(),
          } as TestMetadata,
        },
        {
          id: differentVectorId,
          vector: testVector.map((v) => v * -0.5), // More different
          metadata: {
            title: 'Different Vector',
            category: 'test-different',
            timestamp: Date.now(),
          } as TestMetadata,
        },
      ];

      // Store the vectors
      await connector.storeVectors<TestMetadata>(
        testIndexName,
        vectors,
        testUserId,
      );

      // Verify storeVectors was called correctly
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        testIndexName,
        expect.arrayContaining([
          expect.objectContaining({ id: similarVector1Id }),
          expect.objectContaining({ id: similarVector2Id }),
          expect.objectContaining({ id: differentVectorId }),
        ]),
        testUserId,
      );

      // Add the vectors to our mock records for the query
      vectors.forEach((v) => {
        mockVectorRecords[v.id] = {
          id: v.id,
          values: v.vector,
          metadata: v.metadata,
        };
      });

      // Query for similar vectors
      const similarVectors = await connector.querySimilar<TestMetadata>(
        testIndexName,
        testVector,
        {
          topK: 3,
          includeValues: true,
        },
        testUserId,
      );

      // Verify results
      expect(similarVectors).toBeDefined();
      expect(similarVectors.length).toBeGreaterThan(0);

      // The most similar vector should have a high similarity score
      expect(similarVectors[0].score).toBeGreaterThan(0.8);
    });

    test('should filter vectors by metadata', async () => {
      // Vector IDs for test
      const category1VectorId = `test-vector-category-1-${Date.now()}`;
      const category2VectorId = `test-vector-category-2-${Date.now()}`;

      // Store multiple vectors with different categories
      const vectors = [
        {
          id: category1VectorId,
          vector: testVector,
          metadata: {
            title: 'Category 1 Vector',
            category: 'test-category-1',
            timestamp: Date.now(),
          } as TestMetadata,
        },
        {
          id: category2VectorId,
          vector: testVector,
          metadata: {
            title: 'Category 2 Vector',
            category: 'test-category-2',
            timestamp: Date.now(),
          } as TestMetadata,
        },
      ];

      // Store the vectors
      await connector.storeVectors<TestMetadata>(
        testIndexName,
        vectors,
        testUserId,
      );

      // Add the vectors to our mock records
      vectors.forEach((v) => {
        mockVectorRecords[v.id] = {
          id: v.id,
          values: v.vector,
          metadata: v.metadata,
        };
      });

      // Set up custom mock for category filtering
      mockPineconeService.queryVectors.mockImplementation(
        (
          indexName: string,
          queryVector: number[],
          options: QueryOptions = {},
          namespace?: string,
        ): Promise<QueryResponse<TestMetadata>> => {
          const filter = options.filter as { category: string };
          const matches = Object.values(mockVectorRecords)
            .filter((record) => record.metadata?.category === filter?.category)
            .map((record) => ({
              id: record.id,
              score: 0.95,
              metadata: record.metadata,
              values: options.includeValues ? record.values : undefined,
            }));

          return Promise.resolve({
            matches,
            namespace: namespace || 'default',
          });
        },
      );

      // Query with filter for category 1
      const category1Results = await connector.querySimilar<TestMetadata>(
        testIndexName,
        testVector,
        {
          topK: 10,
          filter: { category: 'test-category-1' },
        },
        testUserId,
      );

      // Verify only category 1 results are returned
      expect(category1Results).toBeDefined();
      expect(category1Results.length).toBeGreaterThan(0);
      expect(
        category1Results.every(
          (item) => item.metadata?.category === 'test-category-1',
        ),
      ).toBe(true);

      // Reset mock for category 2 query
      mockPineconeService.queryVectors.mockImplementation(
        (
          indexName: string,
          queryVector: number[],
          options: QueryOptions = {},
          namespace?: string,
        ): Promise<QueryResponse<TestMetadata>> => {
          const filter = options.filter as { category: string };
          const matches = Object.values(mockVectorRecords)
            .filter((record) => record.metadata?.category === filter?.category)
            .map((record) => ({
              id: record.id,
              score: 0.95,
              metadata: record.metadata,
              values: options.includeValues ? record.values : undefined,
            }));

          return Promise.resolve({
            matches,
            namespace: namespace || 'default',
          });
        },
      );

      // Query with filter for category 2
      const category2Results = await connector.querySimilar<TestMetadata>(
        testIndexName,
        testVector,
        {
          topK: 10,
          filter: { category: 'test-category-2' },
        },
        testUserId,
      );

      // Verify only category 2 results are returned
      expect(category2Results).toBeDefined();
      expect(category2Results.length).toBeGreaterThan(0);
      expect(
        category2Results.every(
          (item) => item.metadata?.category === 'test-category-2',
        ),
      ).toBe(true);
    });

    test('should delete vectors by ID', async () => {
      const deleteVectorId = `test-vector-delete-${Date.now()}`;

      // Add the vector to our mock records
      mockVectorRecords[deleteVectorId] = {
        id: deleteVectorId,
        values: testVector,
        metadata: testMetadata,
      };

      // Store a vector to delete
      await connector.storeVector<TestMetadata>(
        testIndexName,
        deleteVectorId,
        testVector,
        testMetadata,
        testUserId,
      );

      // Verify it exists
      let result = await connector.fetchVectors<TestMetadata>(
        testIndexName,
        [deleteVectorId],
        testUserId,
      );

      expect(result[deleteVectorId]).toBeDefined();

      // Delete the vector
      await connector.deleteVectors(
        testIndexName,
        [deleteVectorId],
        testUserId,
      );

      // Remove from our mock records to simulate deletion
      delete mockVectorRecords[deleteVectorId];

      // Verify deleteVectors was called correctly
      expect(mockPineconeService.deleteVectors).toHaveBeenCalledWith(
        testIndexName,
        [deleteVectorId],
        testUserId,
      );

      // Verify it's gone by ensuring fetchVectors returns empty for this ID
      mockPineconeService.fetchVectors.mockResolvedValueOnce({
        records: {},
        namespace: testUserId,
      });

      result = await connector.fetchVectors<TestMetadata>(
        testIndexName,
        [deleteVectorId],
        testUserId,
      );

      expect(result[deleteVectorId]).toBeUndefined();
    });

    test('should check if namespace exists', async () => {
      // Mock namespaceExists to return true
      mockPineconeService.namespaceExists.mockResolvedValueOnce(true);

      // Check if namespace exists
      const exists = await connector.namespaceExists(testIndexName, testUserId);

      expect(exists).toBe(true);
      expect(mockPineconeService.namespaceExists).toHaveBeenCalledWith(
        testIndexName,
        testUserId,
      );

      // Mock for non-existent namespace
      mockPineconeService.namespaceExists.mockResolvedValueOnce(false);

      // Check for non-existent namespace
      const nonExistentNamespace = `non-existent-namespace-${Date.now()}`;
      const nonExistentExists = await connector.namespaceExists(
        testIndexName,
        nonExistentNamespace,
      );

      expect(nonExistentExists).toBe(false);
      expect(mockPineconeService.namespaceExists).toHaveBeenCalledWith(
        testIndexName,
        nonExistentNamespace,
      );
    });
  });
});
