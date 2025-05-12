/**
 * StreamingRAGService Tests
 * 
 * This test suite validates the streaming RAG functionality,
 * including real-time content retrieval and response generation.
 */
import { StreamingRAGService, StreamingPromptChunk } from '../core/streaming-rag.service';
import { UnifiedRAGService } from '../core/unified-rag.service';
import { MeetingContextProvider } from '../context/meeting-context-provider';
import { DocumentContextProvider } from '../context/document-context-provider';
import { ConversationMemoryService } from '../memory/conversation-memory.service';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { RetrievalResult } from '../context/context-provider.interface';

describe('StreamingRAGService', () => {
  // Mock dependencies
  const mockLogger = new ConsoleLogger();
  let mockOpenAIConnector: jest.Mocked<OpenAIConnector>;
  let mockRAGService: jest.Mocked<UnifiedRAGService>;
  let streamingService: StreamingRAGService;
  
  beforeEach(() => {
    // Setup mocks
    mockOpenAIConnector = {
      generateResponse: jest.fn().mockResolvedValue({
        content: 'Mock response',
        metadata: {}
      }),
      generateStreamingResponse: jest.fn().mockImplementation(
        (messages, streamHandler) => {
          // Simulate streaming by calling onToken a few times
          streamHandler.onToken('This ');
          streamHandler.onToken('is ');
          streamHandler.onToken('a ');
          streamHandler.onToken('streaming ');
          streamHandler.onToken('response.');
          streamHandler.onComplete('This is a streaming response.');
          return Promise.resolve();
        }
      ),
      generateEmbeddings: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
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
        },
        { 
          content: 'Test context item 2', 
          sourceId: 'test-2', 
          score: 0.8, 
          sourceType: 'document',
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
        getOpenAIConnector: jest.fn().mockReturnValue(mockOpenAIConnector)
      }),
      processContent: jest.fn().mockResolvedValue({
        chunkCount: 5,
        sourceId: 'test-doc-1'
      })
    } as unknown as jest.Mocked<UnifiedRAGService>;
    
    // Initialize streaming service
    streamingService = new StreamingRAGService({
      logger: mockLogger,
      openAiConnector: mockOpenAIConnector,
      ragService: mockRAGService
    });
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Streaming Response', () => {
    test('streamingResponse should yield chunks for each phase', async () => {
      // Track received chunks
      const receivedChunks: StreamingPromptChunk[] = [];
      const chunkCallback = (chunk: StreamingPromptChunk) => {
        receivedChunks.push(chunk);
      };
      
      // Execute streaming response
      const query = 'What is the project status?';
      const generator = streamingService.streamingResponse(query, { chunkCallback });
      
      // Collect all chunks
      const chunks: StreamingPromptChunk[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }
      
      // Assertions
      expect(mockRAGService.analyzeQuery).toHaveBeenCalledWith(query);
      expect(mockRAGService.retrieveContext).toHaveBeenCalled();
      expect(mockRAGService.createContextEnhancedPrompt).toHaveBeenCalled();
      expect(mockOpenAIConnector.generateStreamingResponse).toHaveBeenCalled();
      
      // Check chunks
      expect(chunks.length).toBeGreaterThan(0);
      
      // Verify chunk types appear in the correct order
      const chunkTypes = chunks.map(c => c.type);
      expect(chunkTypes).toContain('query_analysis');
      expect(chunkTypes).toContain('context_retrieval');
      expect(chunkTypes).toContain('context_chunk');
      expect(chunkTypes).toContain('prompt_creation');
      expect(chunkTypes).toContain('response');
      
      // Check final chunk has done flag
      expect(chunks[chunks.length - 1].done).toBe(true);
      
      // Check callback was called for each chunk
      expect(receivedChunks.length).toBeGreaterThanOrEqual(chunks.length - 5);
      expect(receivedChunks.length).toBeLessThanOrEqual(chunks.length + 5);
    });
    
    test('streamingResponse should handle conversation history', async () => {
      // Execute streaming response with conversation options
      const query = 'What is the next step?';
      const generator = streamingService.streamingResponse(query, {
        conversationId: 'test-conv-123',
        includeConversationHistory: true,
        maxHistoryMessages: 3
      });
      
      // Collect all chunks
      const chunks: StreamingPromptChunk[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }
      
      // Assertions
      expect(mockRAGService.createPromptWithConversationContext).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'test-conv-123',
        expect.objectContaining({
          includeConversationHistory: true,
          maxHistoryMessages: 3
        })
      );
      
      // Check final chunk has done flag
      expect(chunks[chunks.length - 1].done).toBe(true);
      
      // Verify message was stored in conversation memory
      const conversationMemory = mockRAGService.getConversationMemory();
      if (conversationMemory) {
        expect(conversationMemory.addMessage).toHaveBeenCalledWith(
          'test-conv-123',
          'user',
          query
        );
        expect(conversationMemory.addMessage).toHaveBeenCalledWith(
          'test-conv-123',
          'assistant',
          expect.any(String)
        );
      } else {
        fail('Conversation memory should be defined');
      }
    });
  });
  
  describe('Content Processing', () => {
    test('processContentStreaming should process content in phases', async () => {
      // Track phase callbacks
      const phaseUpdates: any[] = [];
      const chunkCallback = (info: {
        phase: 'chunking' | 'embedding' | 'storing';
        progress: number;
        total: number;
        message: string;
      }) => {
        phaseUpdates.push(info);
      };
      
      // Process content
      const content = 'This is test content to process and stream updates for.';
      const result = await streamingService.processContentStreaming(
        content,
        'document',
        { sourceId: 'test-doc-1' },
        chunkCallback
      );
      
      // Assertions
      expect(mockRAGService.processContent).toHaveBeenCalledWith(
        content,
        'document',
        { sourceId: 'test-doc-1' },
        expect.any(Object)
      );
      
      // Check phases were reported
      expect(phaseUpdates.length).toBeGreaterThan(0);
      expect(phaseUpdates.some(u => u.phase === 'chunking')).toBe(true);
      expect(phaseUpdates.some(u => u.phase === 'storing')).toBe(true);
      
      // Check result
      expect(result).toBeDefined();
      expect(result.chunkCount).toBe(5);
    });
  });
}); 