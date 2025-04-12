// @ts-nocheck
// src/agents/adapters/tests/pinecone-adapter.test.ts

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { PineconeAdapter } from '../pinecone-adapter.ts';
import { PineconeConnectionService } from '../../../pinecone/pinecone-connection.service.ts';
import { ConsoleLogger } from '../../../shared/logger/console-logger.ts';

// Note: PineconeConnectionService is already mocked in setupJest.js
// We don't need to provide mock implementations here

describe('PineconeAdapter', () => {
  let adapter: PineconeAdapter;
  let mockPineconeService: Partial<PineconeConnectionService>;
  let mockLogger: ConsoleLogger;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as ConsoleLogger;

    // Create mock Pinecone service using the global mock
    mockPineconeService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      upsertVectors: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
      queryVectors: jest.fn().mockResolvedValue({
        matches: [
          { id: 'doc1', score: 0.9, metadata: { title: 'Test Document' } },
        ],
        namespace: 'test-namespace',
      }),
      deleteVectors: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      fetchVectors: jest.fn().mockResolvedValue({
        records: {
          doc1: {
            id: 'doc1',
            values: [0.1, 0.2, 0.3],
            metadata: { title: 'Test Document' },
          },
        },
        namespace: 'test-namespace',
      }),
      namespaceExists: jest.fn().mockResolvedValue(true),
    };

    // Create adapter with mocked dependencies
    adapter = new PineconeAdapter({
      pineconeService: mockPineconeService as PineconeConnectionService,
      logger: mockLogger,
      defaultNamespace: 'test-namespace',
    });
  });

  test('initialize should call through to the Pinecone service', async () => {
    await adapter.initialize();

    expect(mockPineconeService.initialize).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Initializing PineconeAdapter',
    );
  });

  test('storeVector should properly format and call upsertVectors', async () => {
    const indexName = 'test-index';
    const id = 'doc1';
    const vector = [0.1, 0.2, 0.3];
    const metadata = { title: 'Test Document' };

    await adapter.storeVector(indexName, id, vector, metadata);

    expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
      indexName,
      [
        {
          id,
          values: vector,
          metadata,
        },
      ],
      'test-namespace',
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Storing vector',
      expect.any(Object),
    );
  });

  test('storeVectors should properly format multiple vectors and call upsertVectors', async () => {
    const indexName = 'test-index';
    const records = [
      { id: 'doc1', vector: [0.1, 0.2, 0.3], metadata: { title: 'Doc 1' } },
      { id: 'doc2', vector: [0.4, 0.5, 0.6], metadata: { title: 'Doc 2' } },
    ];

    await adapter.storeVectors(indexName, records);

    expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
      indexName,
      [
        { id: 'doc1', values: [0.1, 0.2, 0.3], metadata: { title: 'Doc 1' } },
        { id: 'doc2', values: [0.4, 0.5, 0.6], metadata: { title: 'Doc 2' } },
      ],
      'test-namespace',
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'Storing multiple vectors',
      expect.any(Object),
    );
  });

  test('querySimilar should properly format query options and transform results', async () => {
    const indexName = 'test-index';
    const queryVector = [0.1, 0.2, 0.3];
    const options = {
      topK: 5,
      filter: { category: 'article' },
      includeValues: true,
      minScore: 0.8,
    };

    // Configure mock response
    mockPineconeService.queryVectors.mockResolvedValueOnce({
      matches: [
        {
          id: 'doc1',
          score: 0.95,
          metadata: { title: 'Doc 1' },
          values: [0.1, 0.2, 0.3],
        },
        {
          id: 'doc2',
          score: 0.85,
          metadata: { title: 'Doc 2' },
          values: [0.4, 0.5, 0.6],
        },
        {
          id: 'doc3',
          score: 0.75,
          metadata: { title: 'Doc 3' },
          values: [0.7, 0.8, 0.9],
        },
      ],
      namespace: 'test-namespace',
    });

    const results = await adapter.querySimilar(indexName, queryVector, options);

    // Check if queryVectors was called with correct parameters
    expect(mockPineconeService.queryVectors).toHaveBeenCalledWith(
      indexName,
      queryVector,
      {
        topK: 5,
        filter: { category: 'article' },
        includeValues: true,
        includeMetadata: true,
      },
      'test-namespace',
    );

    // Check if results were properly filtered by minScore
    expect(results.length).toBe(2); // Only scores 0.95 and 0.85 should pass the 0.8 threshold
    expect(results[0].id).toBe('doc1');
    expect(results[1].id).toBe('doc2');
    expect(results[0].score).toBe(0.95);
    expect(results[0].metadata).toEqual({ title: 'Doc 1' });
  });

  test('deleteVectors should call through to the Pinecone service', async () => {
    const indexName = 'test-index';
    const ids = ['doc1', 'doc2'];

    await adapter.deleteVectors(indexName, ids);

    expect(mockPineconeService.deleteVectors).toHaveBeenCalledWith(
      indexName,
      ids,
      'test-namespace',
    );
  });

  test('fetchVectors should properly transform the response format', async () => {
    const indexName = 'test-index';
    const ids = ['doc1', 'doc2'];

    // Configure mock response
    mockPineconeService.fetchVectors.mockResolvedValueOnce({
      records: {
        doc1: {
          id: 'doc1',
          values: [0.1, 0.2, 0.3],
          metadata: { title: 'Doc 1', category: 'article' },
        },
        doc2: {
          id: 'doc2',
          values: [0.4, 0.5, 0.6],
          metadata: { title: 'Doc 2', category: 'blog' },
        },
      },
      namespace: 'test-namespace',
    });

    const result = await adapter.fetchVectors(indexName, ids);

    expect(mockPineconeService.fetchVectors).toHaveBeenCalledWith(
      indexName,
      ids,
      'test-namespace',
    );

    expect(result).toEqual({
      doc1: {
        id: 'doc1',
        values: [0.1, 0.2, 0.3],
        metadata: { title: 'Doc 1', category: 'article' },
      },
      doc2: {
        id: 'doc2',
        values: [0.4, 0.5, 0.6],
        metadata: { title: 'Doc 2', category: 'blog' },
      },
    });
  });

  test('custom namespace should override the default namespace', async () => {
    const indexName = 'test-index';
    const id = 'doc1';
    const vector = [0.1, 0.2, 0.3];
    const metadata = { title: 'Test Document' };
    const customNamespace = 'custom-namespace';

    await adapter.storeVector(indexName, id, vector, metadata, customNamespace);

    expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
      indexName,
      [
        {
          id,
          values: vector,
          metadata,
        },
      ],
      customNamespace,
    );
  });

  test('namespaceExists should call through to the Pinecone service', async () => {
    const indexName = 'test-index';
    const namespace = 'test-namespace';

    const exists = await adapter.namespaceExists(indexName, namespace);

    expect(mockPineconeService.namespaceExists).toHaveBeenCalledWith(
      indexName,
      namespace,
    );
    expect(exists).toBe(true);
  });
});
