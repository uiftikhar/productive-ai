import { Test } from '@nestjs/testing';
import { RagService } from './rag.service';
import { RetrievalService } from './retrieval.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { LlmService } from '../langgraph/llm/llm.service';
import { StateService } from '../langgraph/state/state.service';
import { RETRIEVAL_SERVICE } from './constants/injection-tokens';
import { EMBEDDING_SERVICE } from '../embedding/constants/injection-tokens';
import { LLM_SERVICE } from '../langgraph/llm/constants/injection-tokens';
import { STATE_SERVICE } from '../langgraph/state/constants/injection-tokens';
import { PINECONE_SERVICE } from '../pinecone/constants/injection-tokens';
import { DimensionAdapterService } from '../embedding/dimension-adapter.service';
import { ConfigService } from '@nestjs/config';
import { server } from '../test/mocks/server';
import { http, HttpResponse } from 'msw';
import { VectorIndexes } from '../pinecone/pinecone-index.service';

describe('RagService', () => {
  let ragService: RagService;
  let mockRetrievalService: any;
  let mockEmbeddingService: any;
  let mockLlmService: any;
  let mockStateService: any;
  let mockPineconeService: any;
  let mockDimensionAdapter: any;
  let mockConfigService: any;
  let moduleRef: any;
  
  beforeEach(async () => {
    // Setup MSW handlers
    server.use(
      http.post('https://api.openai.com/v1/embeddings', () => {
        return HttpResponse.json({
          data: [
            {
              embedding: Array(1536).fill(0.1),
              index: 0,
              object: 'embedding'
            }
          ],
          model: 'text-embedding-3-large',
          object: 'list',
          usage: { prompt_tokens: 10, total_tokens: 10 }
        });
      }),
      
      // Mock OpenAI chat completions API
      http.post('https://api.openai.com/v1/chat/completions', () => {
        return HttpResponse.json({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677858242,
          model: 'gpt-4o',
          choices: [{
            message: {
              role: 'assistant',
              content: 'This is a response with context about projects and timelines.'
            },
            index: 0,
            finish_reason: 'stop'
          }]
        });
      })
    );
    
    // Create mocks
    mockRetrievalService = {
      retrieveDocuments: jest.fn().mockResolvedValue([
        {
          id: 'doc-1',
          content: 'Previous meeting discussed project timeline issues.',
          metadata: { meetingId: 'prev-meeting', date: '2023-06-15' },
          score: 0.85
        },
        {
          id: 'doc-2',
          content: 'Budget constraints affecting project timeline.',
          metadata: { meetingId: 'prev-meeting-2', date: '2023-06-20' },
          score: 0.78
        }
      ])
    };
    
    mockEmbeddingService = {
      generateEmbedding: jest.fn().mockResolvedValue(Array(1536).fill(0.1))
    };
    
    mockLlmService = {
      getChatModel: jest.fn().mockReturnValue({
        invoke: jest.fn().mockResolvedValue({
          content: 'This is a response with context about projects and timelines.'
        })
      })
    };
    
    mockStateService = {
      createMessagesAnnotation: jest.fn().mockReturnValue({ 
        messages: { reducer: (x: any, y: any) => [...x, ...y], default: () => [] } 
      })
    };
    
    mockPineconeService = {
      storeVector: jest.fn().mockResolvedValue(undefined),
      queryVectors: jest.fn().mockResolvedValue({
        matches: [
          { id: 'doc-1-chunk-0', score: 0.85, metadata: { content: 'Previous meeting discussed project timeline issues.' } },
          { id: 'doc-2-chunk-0', score: 0.78, metadata: { content: 'Budget constraints affecting project timeline.' } }
        ]
      })
    };
    
    // Mock ConfigService
    mockConfigService = {
      get: jest.fn().mockImplementation((key, defaultValue) => {
        if (key === 'PINECONE_DIMENSIONS') return 1024;
        return defaultValue;
      })
    };
    
    mockDimensionAdapter = {
      getTargetDimension: jest.fn().mockReturnValue(1024),
      needsAdaptation: jest.fn().mockReturnValue(true),
      adaptDimension: jest.fn().mockImplementation((embedding) => {
        return embedding.slice(0, 1024); // Just return first 1024 dimensions
      })
    };
    
    moduleRef = await Test.createTestingModule({
      providers: [
        RagService,
        {
          provide: RETRIEVAL_SERVICE,
          useValue: mockRetrievalService
        },
        {
          provide: EMBEDDING_SERVICE,
          useValue: mockEmbeddingService
        },
        {
          provide: LLM_SERVICE,
          useValue: mockLlmService
        },
        {
          provide: STATE_SERVICE,
          useValue: mockStateService
        },
        {
          provide: PINECONE_SERVICE,
          useValue: mockPineconeService
        },
        {
          provide: ConfigService,
          useValue: mockConfigService
        },
        {
          provide: DimensionAdapterService,
          useFactory: () => mockDimensionAdapter
        }
      ]
    }).compile();
    
    ragService = moduleRef.get(RagService);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });
  
  it('should retrieve context based on query', async () => {
    // Arrange
    const query = 'project timeline';
    
    // Act
    const context = await ragService.getContext(query);
    
    // Assert
    expect(context).toBeDefined();
    expect(context.length).toBe(2);
    expect(context[0].content).toBe('Previous meeting discussed project timeline issues.');
    expect(mockRetrievalService.retrieveDocuments).toHaveBeenCalledWith(query, expect.any(Object));
  });
  
  it('should chunk text correctly', () => {
    // Arrange
    const text = 'This is sentence one. This is sentence two. This is sentence three.';
    
    // Act
    const chunks = ragService.chunkText(text, { chunkSize: 30, chunkOverlap: 5 });
    
    // Assert
    expect(chunks).toBeDefined();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toBeDefined();
  });
  
  it('should process documents for RAG storage', async () => {
    // Arrange
    const documents = [
      {
        id: 'doc-1',
        content: 'Meeting about project timeline.',
        metadata: { meetingId: 'meeting-123' }
      }
    ];
    
    // Act
    const result = await ragService.processDocumentsForRag(documents, {
      indexName: VectorIndexes.MEETING_ANALYSIS,
      namespace: 'team-alpha'
    });
    
    // Assert
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalled();
    expect(mockDimensionAdapter.adaptDimension).toHaveBeenCalled();
    expect(mockPineconeService.storeVector).toHaveBeenCalled();
  });
  
  it('should enhance state with retrieved context', async () => {
    // Arrange
    const state = { transcript: 'Discussion about timeline' };
    const query = 'project timeline';
    
    // Act
    const enhancedState = await ragService.enhanceStateWithContext(state, query);
    
    // Assert
    expect(enhancedState).toBeDefined();
    expect(enhancedState.retrievedContext).toBeDefined();
    expect(enhancedState.retrievedContext.documents).toBeDefined();
    expect(enhancedState.retrievedContext.documents.length).toBe(2);
    expect(enhancedState.retrievedContext.query).toBe(query);
    expect(mockRetrievalService.retrieveDocuments).toHaveBeenCalled();
  });
  
  it('should create a RAG retrieval node for a graph', async () => {
    // Arrange
    const queryExtractor = (state: any) => state.transcript;
    const state = { transcript: 'Discussion about timeline' };
    
    // Act
    const ragNode = ragService.createRagRetrievalNode(queryExtractor);
    const result = await ragNode(state);
    
    // Assert
    expect(result).toBeDefined();
    expect(result.retrievedContext).toBeDefined();
    expect(mockRetrievalService.retrieveDocuments).toHaveBeenCalledWith(
      'Discussion about timeline',
      expect.any(Object)
    );
  });
  
  it('should add RAG to a graph', () => {
    // Arrange
    const mockGraph = {
      addNode: jest.fn().mockReturnThis(),
      addEdge: jest.fn().mockReturnThis(),
      addConditionalEdges: jest.fn().mockReturnThis(),
      edges: [{ source: '__start__', target: 'topic_extraction' }]
    };
    
    // Act
    ragService.addRagToGraph(mockGraph);
    
    // Assert
    expect(mockGraph.addNode).toHaveBeenCalledWith('rag_retrieval', expect.any(Function));
    expect(mockGraph.addEdge).toHaveBeenCalledWith('rag_retrieval', 'topic_extraction');
    expect(mockGraph.addEdge).toHaveBeenCalledWith('__start__', 'rag_retrieval');
  });
}); 