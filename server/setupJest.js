// Global Jest setup
// This file runs before your tests
const { MockLogger } = require('./src/shared/logger/mock-logger');

// Mock environment variables if needed
process.env.PINECONE_API_KEY = 'test-pinecone-key';
process.env.PINECONE_ENVIRONMENT = 'test-environment';
process.env.PINECONE_INDEX = 'test-index';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.NODE_ENV = 'test';

// Expose MockLogger globally for tests
global.MockLogger = MockLogger;

// Mock the logger for global use
global.mockLogger = new MockLogger();

// Reset the mockLogger before each test
beforeEach(() => {
  global.mockLogger = new MockLogger();
});

// Make jest.spyOn work properly with the mock system
const originalSpyOn = jest.spyOn;
jest.spyOn = function (object, methodName) {
  if (!object[methodName]) {
    object[methodName] = jest.fn();
  }
  return originalSpyOn(object, methodName);
};

// Mock LangChain's OpenAI implementation
jest.mock('@langchain/openai', () => {
  return {
    ChatOpenAI: jest.fn().mockImplementation(() => ({
      invoke: jest.fn().mockImplementation(async (messages) => {
        return {
          content: 'This is a mock response from LangChain ChatOpenAI',
          role: 'assistant',
        };
      }),
      stream: jest.fn().mockImplementation(async function* (messages) {
        yield {
          content:
            'This is a mock streaming response from LangChain ChatOpenAI',
          role: 'assistant',
        };
      }),
    })),
    OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
      embedDocuments: jest.fn().mockImplementation(async (args) => {
        const texts = args;
        return texts.map((_) =>
          Array(1536)
            .fill(0)
            .map((_, i) => i / 1536),
        );
      }),
      embedQuery: jest.fn().mockImplementation(async (args) => {
        const text = args;
        return Array(1536)
          .fill(0)
          .map((_, i) => i / 1536);
      }),
    })),
  };
});

// Properly mock the Pinecone Connection Service
jest.mock('./src/pinecone/pinecone-connection.service.ts', () => {
  const mockUpsertVectors = jest.fn().mockResolvedValue({ upsertedCount: 10 });
  const mockQueryVectors = jest.fn().mockResolvedValue({
    matches: [{ id: '1', score: 0.9 }],
  });
  const mockFetchVectors = jest.fn().mockResolvedValue({
    vectors: { 1: { id: '1', values: [0.1, 0.2], metadata: { key: 'value' } } },
  });
  const mockDeleteVectors = jest.fn().mockResolvedValue({ deletedCount: 1 });

  return {
    PineconeConnectionService: jest.fn().mockImplementation(() => {
      // Namespace function that returns this to allow chaining
      const namespaceFn = jest.fn().mockImplementation(() => mockIndex);

      // Mock index with all required methods
      const mockIndex = {
        upsert: jest.fn().mockResolvedValue({ upsertedCount: 10 }),
        query: jest.fn().mockResolvedValue({
          matches: [{ id: '1', score: 0.9 }],
        }),
        fetch: jest.fn().mockResolvedValue({
          vectors: { 1: { id: '1', values: [0.1, 0.2] } },
        }),
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
        delete: jest.fn().mockResolvedValue({ deletedCount: 1 }),
        deleteAll: jest.fn().mockResolvedValue({ deletedCount: 100 }),
        describeIndexStats: jest.fn().mockResolvedValue({
          namespaces: { 'test-namespace': { vectorCount: 100 } },
          dimension: 128,
          indexFullness: 0.5,
          totalVectorCount: 100,
        }),
        namespace: namespaceFn,
      };

      const indexCache = new Map();
      indexCache.set('test-index', mockIndex);

      return {
        initialize: jest.fn().mockImplementation(() => {
          global.mockLogger.info('Initializing PineconeConnectionService');
          return Promise.resolve({});
        }),
        cleanup: jest.fn().mockImplementation(() => {
          global.mockLogger.info('Cleaning up PineconeConnectionService');
          indexCache.clear();
          return Promise.resolve({});
        }),
        getIndex: jest.fn().mockImplementation((indexName) => {
          if (indexName === 'non-existent-index') {
            return Promise.reject(
              new Error(`Index ${indexName} does not exist`),
            );
          }
          return Promise.resolve(mockIndex);
        }),
        getTypedIndex: jest.fn().mockResolvedValue(mockIndex),
        queryVectors: mockQueryVectors,
        fetchVectors: mockFetchVectors,
        upsertVectors: mockUpsertVectors,
        deleteVectors: mockDeleteVectors,
        deleteVectorsByFilter: jest.fn().mockResolvedValue({ deletedCount: 5 }),
        deleteAllVectorsInNamespace: jest
          .fn()
          .mockResolvedValue({ deletedCount: 100 }),
        describeIndexStats: jest.fn().mockResolvedValue({
          namespaces: { 'test-namespace': { vectorCount: 100 } },
          dimension: 128,
          indexFullness: 0.5,
          totalVectorCount: 100,
        }),
        findSimilar: jest
          .fn()
          .mockImplementation((indexName, vector, topK, namespace) => {
            return mockQueryVectors(
              indexName,
              vector,
              { topK, includeMetadata: true },
              namespace,
            );
          }),
        namespaceExists: jest
          .fn()
          .mockImplementation((indexName, namespace) => {
            if (namespace === 'test-namespace') {
              return Promise.resolve(true);
            }
            return Promise.resolve(false);
          }),
        listNamespaces: jest.fn().mockImplementation((indexName) => {
          // Check mock call to decide what to return
          const mockStatsFunc = mockIndex.describeIndexStats;
          const lastCall =
            mockStatsFunc.mock.calls.length > 0
              ? mockStatsFunc.mock.results[mockStatsFunc.mock.calls.length - 1]
                  .value
              : { namespaces: { namespace1: {}, namespace2: {} } };
          return Promise.resolve(Object.keys(lastCall.namespaces || {}));
        }),
        getNamespaceVectorCount: jest
          .fn()
          .mockImplementation((indexName, namespace) => {
            if (namespace === 'test-namespace') {
              return Promise.resolve(100);
            }
            return Promise.resolve(0);
          }),
        executeWithRetry: jest
          .fn()
          .mockImplementation(async (fn, operationName, retries = 3) => {
            try {
              return await fn();
            } catch (error) {
              if (retries <= 0) {
                global.mockLogger.error(
                  `Max retries reached for Pinecone operation: ${operationName}`,
                  {
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
                );
                throw error;
              }

              global.mockLogger.warn(
                `Retrying Pinecone operation ${operationName}`,
                {
                  retriesLeft: retries - 1,
                  error: error instanceof Error ? error.message : String(error),
                },
              );

              return Promise.resolve({});
            }
          }),
        // Expose the mock index for direct manipulation in tests
        indexCache,
        mockIndex,
      };
    }),
  };
});

// Mock the PineconeIndexService
jest.mock('./src/pinecone/pinecone-index.service.ts', () => {
  const mockIndex = {
    upsert: jest.fn().mockResolvedValue({}),
    query: jest.fn().mockResolvedValue({}),
    fetch: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({}),
    deleteAll: jest.fn().mockResolvedValue({}),
    describeIndexStats: jest.fn().mockResolvedValue({}),
    namespace: jest.fn().mockReturnThis(),
  };

  return {
    VectorIndexes: {
      USER_CONTEXT: 'user-context',
      MEETING_CONTEXT: 'meeting-context',
    },
    PineconeIndexService: jest.fn().mockImplementation(() => ({
      getIndex: jest.fn().mockReturnValue(mockIndex),
      indexExists: jest.fn().mockResolvedValue(true),
    })),
  };
});

// Mock the EmbeddingService
jest.mock('./src/shared/services/embedding.service.ts', () => {
  return {
    EmbeddingService: jest.fn().mockImplementation(() => ({
      embedText: jest.fn().mockImplementation((text) => {
        const length = 1536;
        const embedding = new Array(length)
          .fill(0)
          .map((_, i) => 0.1 * (i % 10));
        return Promise.resolve({ embedding });
      }),
      embedBatch: jest.fn().mockImplementation((texts) => {
        return Promise.resolve(
          (texts || []).map((text) => {
            const length = 1536;
            const embedding = new Array(length)
              .fill(0)
              .map((_, i) => 0.1 * (i % 10));
            return { embedding };
          }),
        );
      }),
      getModelName: jest.fn().mockReturnValue('text-embedding-ada-002'),
      getDimensions: jest.fn().mockReturnValue(1536),
      getCost: jest.fn().mockReturnValue(0.0001),
    })),
  };
});

// Mock PineconeConfig service
jest.mock('./src/pinecone/pincone-config.service.ts', () => {
  const mockClient = {
    describeIndex: jest.fn().mockResolvedValue({
      dimension: 1536,
      metric: 'cosine',
      host: 'test-host',
      spec: { serverless: { cloud: 'aws', region: 'us-west-2' } },
      status: { ready: true },
    }),
    createIndex: jest.fn().mockResolvedValue({}),
    listIndexes: jest.fn().mockResolvedValue(['test-index']),
  };

  return {
    PineconeConfig: {
      getInstance: jest.fn().mockReturnValue({
        index: 'test-index',
        client: mockClient,
        getControllerHostUrl: jest
          .fn()
          .mockReturnValue('https://test-controller.pinecone.io'),
        getDimension: jest.fn().mockReturnValue(1536),
        getMetric: jest.fn().mockReturnValue('cosine'),
        getNamespace: jest.fn().mockReturnValue('test-namespace'),
        getEnvironment: jest.fn().mockReturnValue('gcp-starter'),
        getRegion: jest.fn().mockReturnValue('us-central1'),
      }),
    },
  };
});

// Reset all mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});
