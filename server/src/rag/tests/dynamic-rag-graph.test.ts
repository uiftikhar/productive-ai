/**
 * Dynamic RAG Graph Tests
 * 
 * This test suite validates the functionality of the dynamic RAG graph,
 * which integrates the RAG system with the DynamicGraphService.
 */

import { DynamicRAGGraphFactory, RAGDynamicState } from '../graph/dynamic-rag-graph';
import { UnifiedRAGService } from '../core/unified-rag.service';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { DynamicGraphService } from '../../langgraph/dynamic/dynamic-graph.service';

// We need to mock the DynamicGraphService execution
jest.mock('../../langgraph/dynamic/dynamic-graph.service', () => {
  const originalModule = jest.requireActual('../../langgraph/dynamic/dynamic-graph.service');
  
  // Create a class that extends the original one
  class MockDynamicGraphService extends originalModule.DynamicGraphService {
    constructor(options = {}) {
      super(options);
    }
    
    // Override execute to return a mock result
    async execute(initialState: any): Promise<any> {
      return {
        ...initialState,
        finalResponse: 'This is a mock response from the dynamic graph service',
        id: 'test-graph-execution-id',
        runId: 'test-run-id',
        executionPath: ['queryAnalysis', 'contextRetrieval', 'responseGeneration'],
        nodes: new Map(),
        edges: new Map(),
        modificationHistory: []
      };
    }
    
    // Override createGraph to return a simple object
    createGraph() {
      return {
        invoke: async (state: any): Promise<any> => {
          return this.execute(state);
        }
      };
    }
  }
  
  return {
    ...originalModule,
    DynamicGraphService: MockDynamicGraphService
  };
});

describe('DynamicRAGGraphFactory', () => {
  // Mock dependencies
  const mockLogger = new ConsoleLogger();
  let mockOpenAIConnector: jest.Mocked<OpenAIConnector>;
  let mockRAGService: jest.Mocked<UnifiedRAGService>;
  let graphFactory: DynamicRAGGraphFactory;
  
  beforeEach(() => {
    // Setup mocks
    mockOpenAIConnector = {
      generateResponse: jest.fn().mockResolvedValue('Mock response from OpenAI'),
      generateEmbeddings: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
      generateStructuredOutput: jest.fn().mockResolvedValue({ result: 'success' })
    } as unknown as jest.Mocked<OpenAIConnector>;
    
    // Mock the RAG service
    mockRAGService = {
      analyzeQuery: jest.fn().mockResolvedValue({
        enhancedQuery: 'Enhanced test query',
        requiredContextTypes: ['meeting_transcript'],
        extractedEntities: ['test'],
        inferredIntent: 'question',
        confidence: 0.9
      }),
      retrieveContext: jest.fn().mockResolvedValue([
        { 
          content: 'Test context item 1', 
          sourceId: 'test-1', 
          score: 0.9, 
          sourceType: 'meeting_transcript',
          metadata: {}
        }
      ]),
      createContextEnhancedPrompt: jest.fn().mockResolvedValue({
        prompt: 'Enhanced prompt with context',
        context: 'Test context',
        sources: [{ id: 'test-1', type: 'meeting_transcript' }],
        metadata: {}
      }),
      createPromptWithConversationContext: jest.fn().mockResolvedValue({
        prompt: 'Enhanced prompt with conversation context',
        context: 'Test context with conversation',
        sources: [{ id: 'test-1', type: 'meeting_transcript' }],
        metadata: {}
      }),
      getConversationMemory: jest.fn().mockReturnValue({
        addMessage: jest.fn().mockResolvedValue(true),
        getOpenAIConnector: jest.fn().mockReturnValue(mockOpenAIConnector),
        getRecentContext: jest.fn().mockReturnValue('Recent conversation context')
      })
    } as unknown as jest.Mocked<UnifiedRAGService>;
    
    // Initialize graph factory
    graphFactory = new DynamicRAGGraphFactory(mockRAGService, mockLogger);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  test('createGraph should initialize the graph with nodes and edges', () => {
    // Create graph
    const graph = graphFactory.createGraph();
    
    // Assertions - verify the graph was created properly
    expect(graph).toBeDefined();
    // @ts-ignore: mock implementation adds invoke method
    expect(graph.invoke).toBeDefined();
  });
  
  test('execute should run the graph with provided query and options', async () => {
    // Execute the graph
    const query = 'What is the project status?';
    const config = {
      useAnalysis: true,
      includeConversationContext: true,
      temperature: 0.2
    };
    const metadata = {
      userId: 'user-123',
      conversationId: 'conv-456'
    };
    
    const result = await graphFactory.execute(query, config, metadata);
    
    // Assertions
    expect(result).toBeDefined();
    expect(result.query).toBe(query);
    expect(result.ragConfig).toEqual(expect.objectContaining(config));
    expect(result.ragMetadata).toEqual(expect.objectContaining(metadata));
    expect(result.finalResponse).toBeDefined();
    expect(result.executionPath).toContain('queryAnalysis');
    expect(result.executionPath).toContain('contextRetrieval');
    expect(result.executionPath).toContain('responseGeneration');
  });
  
  test('getGraphService should return the underlying dynamic graph service', () => {
    const graphService = graphFactory.getGraphService();
    expect(graphService).toBeDefined();
    expect(graphService).toBeInstanceOf(DynamicGraphService);
  });
}); 