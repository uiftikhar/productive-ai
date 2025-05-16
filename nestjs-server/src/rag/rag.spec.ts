import { Test, TestingModule } from '@nestjs/testing';
import { RagService, RetrievedContext } from './rag.service';
import { RetrievalService } from './retrieval.service';
import { AdaptiveRagService } from './adaptive-rag.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Logger } from '@nestjs/common';

// Define the state interface with retrieved context
interface TranscriptState {
  transcript: string;
  retrievedContext?: RetrievedContext;
}

describe('RAG Services', () => {
  let ragService: RagService;
  let retrievalService: RetrievalService;
  let adaptiveRagService: AdaptiveRagService;
  let moduleRef: TestingModule;

  // Mock services
  const mockEmbeddingService = {
    generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    chunkText: jest.fn().mockReturnValue(['chunk1', 'chunk2']),
  };

  const mockPineconeService = {
    storeVector: jest.fn().mockResolvedValue(undefined),
    querySimilar: jest.fn().mockResolvedValue([
      {
        id: 'test-doc-1',
        score: 0.95,
        metadata: { content: 'This is a test document content for the product roadmap' },
      },
    ]),
  };

  const mockLlmService = {
    getChatModel: jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        content: '{"strategy": "hybrid", "topK": 5, "minScore": 0.8}',
      }),
    }),
  };

  const mockStateService = {
    createStateGraph: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    // Create testing module with mocks
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        RagService,
        RetrievalService,
        AdaptiveRagService,
        {
          provide: 'EmbeddingService',
          useValue: mockEmbeddingService,
        },
        {
          provide: 'PineconeService',
          useValue: mockPineconeService,
        },
        {
          provide: 'LlmService',
          useValue: mockLlmService,
        },
        {
          provide: 'StateService',
          useValue: mockStateService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'PINECONE_INDEX') return 'test-index';
              return 'mock-value';
            }),
          },
        },
      ],
    })
      .overrideProvider(RetrievalService)
      .useFactory({
        factory: () => {
          return new RetrievalService(
            mockPineconeService as any,
            mockEmbeddingService as any,
            mockCacheManager as any,
          );
        },
      })
      .overrideProvider(RagService)
      .useFactory({
        factory: () => {
          return new RagService(
            new RetrievalService(
              mockPineconeService as any, 
              mockEmbeddingService as any, 
              mockCacheManager as any
            ),
            mockEmbeddingService as any,
            mockLlmService as any,
            mockStateService as any,
          );
        },
      })
      .overrideProvider(AdaptiveRagService)
      .useFactory({
        factory: () => {
          return new AdaptiveRagService(
            new RagService(
              new RetrievalService(
                mockPineconeService as any, 
                mockEmbeddingService as any, 
                mockCacheManager as any
              ),
              mockEmbeddingService as any,
              mockLlmService as any,
              mockStateService as any,
            ),
            new RetrievalService(
              mockPineconeService as any, 
              mockEmbeddingService as any, 
              mockCacheManager as any
            ),
            mockLlmService as any,
          );
        },
      })
      .compile();

    // Get services
    ragService = moduleRef.get<RagService>(RagService);
    retrievalService = moduleRef.get<RetrievalService>(RetrievalService);
    adaptiveRagService = moduleRef.get<AdaptiveRagService>(AdaptiveRagService);
    
    // Replace loggers with mock to avoid console noise during tests
    const mockLogger = { debug: jest.fn(), log: jest.fn(), error: jest.fn(), warn: jest.fn() };
    jest.spyOn(Logger, 'error').mockImplementation(() => mockLogger as any);
    jest.spyOn(Logger, 'log').mockImplementation(() => mockLogger as any);
    jest.spyOn(Logger, 'debug').mockImplementation(() => mockLogger as any);
    jest.spyOn(Logger, 'warn').mockImplementation(() => mockLogger as any);
  });

  afterAll(async () => {
    await moduleRef.close();
    jest.clearAllMocks();
  });

  describe('RetrievalService', () => {
    it('should retrieve relevant documents for a query', async () => {
      // Test query
      const query = "What were the key points discussed in the last meeting about the product roadmap?";
      
      const results = await retrievalService.retrieveDocuments(query);
      
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Check structure of the first result
      expect(results[0]).toHaveProperty('id', 'test-doc-1');
      expect(results[0]).toHaveProperty('content');
      expect(results[0]).toHaveProperty('metadata');
      expect(results[0]).toHaveProperty('score', 0.95);
      
      // Verify that the embedding service was called
      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(query);
    });
  });

  describe('RagService', () => {
    it('should enhance state with retrieved context', async () => {
      const query = "What were the key points discussed in the last meeting about the product roadmap?";
      const state: TranscriptState = { transcript: "Discussion about product roadmap and feature priorities" };
      
      const enhancedState = await ragService.enhanceStateWithContext(state, query);
      
      expect(enhancedState).toBeDefined();
      expect(enhancedState).toHaveProperty('transcript');
      expect(enhancedState).toHaveProperty('retrievedContext');
      
      if (enhancedState.retrievedContext) {
        expect(enhancedState.retrievedContext).toHaveProperty('query', query);
        expect(enhancedState.retrievedContext).toHaveProperty('documents');
        expect(Array.isArray(enhancedState.retrievedContext.documents)).toBe(true);
      }
    });
  });

  describe('AdaptiveRagService', () => {
    it('should determine appropriate retrieval strategy for a query', async () => {
      const query = "What were the key points discussed in the last meeting about the product roadmap?";
      
      const result = await adaptiveRagService.determineRetrievalStrategy(query);
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('strategy', 'hybrid');
      expect(result).toHaveProperty('settings');
      expect(result.settings).toHaveProperty('topK', 5);
      expect(result.settings).toHaveProperty('minScore', 0.8);
      
      // Verify LLM was called
      expect(mockLlmService.getChatModel).toHaveBeenCalled();
    });
  });
}); 