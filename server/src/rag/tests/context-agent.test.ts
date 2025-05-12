/**
 * Context Agent Tests
 * 
 * This test suite validates the functionality of the RAG-based context agents,
 * including the MeetingContextAgent and RAGContextAgent.
 */
import { MeetingContextAgent } from '../agents/meeting-context-agent';
import { RAGContextAgent } from '../../langgraph/agentic-meeting-analysis/agents/context/rag-context-agent';
import { UnifiedRAGService } from '../core/unified-rag.service';
import { ConversationMemoryService } from '../memory/conversation-memory.service';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { PineconeConnector } from '../../connectors/pinecone-connector';
import { ModelResponse } from '../../connectors/language-model-provider.interface';

// TODO Write integration tests with MSW for end to end flow
describe('Context Agents', () => {
  // Mock dependencies
  const mockLogger = new ConsoleLogger();
  let mockOpenAIConnector: jest.Mocked<OpenAIConnector>;
  let mockPineconeConnector: jest.Mocked<PineconeConnector>;
  let mockRAGService: jest.Mocked<UnifiedRAGService>;
  let mockConversationMemory: jest.Mocked<ConversationMemoryService>;
  
  // Helper function to create a response object that mimics the OpenAI response behavior
  function createMockResponse(content: string): ModelResponse {
    // Create an object that can be both used as an object with .content
    // and as a string with String(response)
    const response = {
      content,
      metadata: {
        model: 'gpt-4',
        temperature: 0.7
      },
      toString: () => content
    };
    
    return response;
  }
  
  beforeEach(() => {
    // Setup mocks
    mockOpenAIConnector = {
      generateEmbeddings: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
      generateResponse: jest.fn().mockImplementation(() => {
        return Promise.resolve(createMockResponse('Mock agent response'));
      }),
      generateStructuredOutput: jest.fn().mockResolvedValue({ result: 'success' }),
    } as unknown as jest.Mocked<OpenAIConnector>;
    
    mockPineconeConnector = {
      initialize: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockResolvedValue({ upsertedCount: 5 }),
      query: jest.fn().mockResolvedValue({
        matches: [
          { id: 'doc1', score: 0.95, metadata: { source: 'test' } },
          { id: 'doc2', score: 0.85, metadata: { source: 'test' } }
        ]
      }),
    } as unknown as jest.Mocked<PineconeConnector>;
    
    mockConversationMemory = {
      createConversation: jest.fn().mockReturnValue('conv-123'),
      addMessage: jest.fn().mockResolvedValue(true),
      getRecentMessages: jest.fn().mockReturnValue([
        { role: 'user', content: 'Previous question?', timestamp: Date.now() - 2000 },
        { role: 'assistant', content: 'Previous answer', timestamp: Date.now() - 1000 }
      ]),
      getRecentContext: jest.fn().mockReturnValue('Recent conversation history')
    } as unknown as jest.Mocked<ConversationMemoryService>;
    
    // Mock the RAG service with properly implemented methods
    mockRAGService = {
      processContent: jest.fn().mockResolvedValue({ success: true, chunkCount: 5 }),
      createContextEnhancedPrompt: jest.fn().mockResolvedValue({
        prompt: 'Enhanced prompt with context',
        context: 'Test context',
        sources: [{ id: 'test-1', type: 'meeting_transcript' }]
      }),
      createPromptWithConversationContext: jest.fn().mockResolvedValue({
        prompt: 'Enhanced prompt with conversation context',
        context: 'Test context with conversation',
        sources: [{ id: 'test-1', type: 'meeting_transcript' }]
      }),
      analyzeQuery: jest.fn().mockResolvedValue({
        enhancedQuery: 'Enhanced test query',
        requiredContextTypes: ['meeting_transcript'],
        entities: ['test']
      }),
      getConversationMemory: jest.fn().mockReturnValue(mockConversationMemory)
    } as unknown as jest.Mocked<UnifiedRAGService>;
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('MeetingContextAgent', () => {
    let meetingContextAgent: MeetingContextAgent;
    
    beforeEach(() => {
      // Initialize agent
      meetingContextAgent = new MeetingContextAgent({
        ragService: mockRAGService,
        meetingId: 'meeting-123',
        organizationId: 'org-456',
        logger: mockLogger,
        openAIConnector: mockOpenAIConnector,
        useConversationMemory: true // Enable conversation memory
      });
      
      // Set the conversationMemoryService property directly for testing
      (meetingContextAgent as any).conversationMemoryService = mockConversationMemory;
    });
    
    test('processMessage should handle messages with conversation context', async () => {
      // Test message
      const message = {
        id: 'msg-123',
        role: 'user',
        content: 'What was discussed about the budget?',
        metadata: {
          conversationId: 'conv-123',
          userId: 'user-456'
        }
      };
      
      // Process message
      const response = await meetingContextAgent.processMessage(message);
      
      // Assertions
      expect(mockRAGService.createPromptWithConversationContext).toHaveBeenCalledWith(
        'What was discussed about the budget?',
        expect.any(String),
        'conv-123',
        expect.objectContaining({
          includeConversationHistory: true,
          maxHistoryMessages: 5
        })
      );
      expect(mockOpenAIConnector.generateResponse).toHaveBeenCalled();
      expect(mockConversationMemory.addMessage).toHaveBeenCalledWith(
        'conv-123',
        'user',
        'What was discussed about the budget?',
        expect.objectContaining({
          conversationId: 'conv-123',
          userId: 'user-456'
        })
      );
      
      // Check response format
      expect(response).toBeDefined();
      expect(response.id).toContain('response-msg-123');
      expect(response.role).toBe('assistant');
      expect(response.content).toBe('Mock agent response');
      expect(response.metadata).toBeDefined();
    });
    
    test('processMessage should create new conversation if needed', async () => {
      // Test message without conversation ID
      const message = {
        id: 'msg-456',
        role: 'user',
        content: 'What decisions were made?',
        metadata: {
          userId: 'user-789'
        }
      };
      
      // Process message
      const response = await meetingContextAgent.processMessage(message);
      
      // Assertions
      expect(mockConversationMemory.createConversation).toHaveBeenCalledWith(
        'user-789',
        'What decisions were made?',
        { meetingId: 'meeting-123', source: 'meeting-context-agent' }
      );
      expect(mockRAGService.createPromptWithConversationContext).toHaveBeenCalled();
      expect(response).toBeDefined();
      expect(response.content).toBe('Mock agent response');
    });
    
    test('storeTranscript should process and store meeting content', async () => {
      // Test transcript
      const transcript = 'This is a test meeting transcript with discussions about the project.';
      
      // Store transcript
      const result = await meetingContextAgent.storeTranscript(transcript);
      
      // Assertions
      expect(mockRAGService.processContent).toHaveBeenCalledWith(
        transcript,
        'meeting_transcript',
        expect.objectContaining({ 
          meetingId: 'meeting-123',
          organizationId: 'org-456',
          sourceType: 'meeting_transcript'
        }),
        expect.objectContaining({
          chunkSize: 300,
          chunkOverlap: 50
        })
      );
      expect(result).toBe(true);
    });
  });
  
  describe('RAGContextAgent', () => {
    let ragContextAgent: RAGContextAgent;
    
    beforeEach(() => {
      // Initialize agent
      ragContextAgent = new RAGContextAgent({
        id: 'agent-123',
        name: 'Test RAG Agent',
        openAiConnector: mockOpenAIConnector,
        pineconeConnector: mockPineconeConnector,
        logger: mockLogger,
        meetingId: 'meeting-789'
      });
      
      // Mock the internal RAG service and conversation memory
      (ragContextAgent as any).ragService = mockRAGService;
      (ragContextAgent as any).conversationMemoryService = mockConversationMemory;
    });
    
    test('processMessage should provide context-enhanced responses', async () => {
      // Test message
      const message = {
        id: 'msg-789',
        content: 'What was the conclusion of the discussion?',
        metadata: {
          userId: 'user-123',
          conversationId: 'conv-456'
        }
      };
      
      // Process message
      const response = await ragContextAgent.processMessage(message);
      
      // Assertions
      expect(mockRAGService.analyzeQuery).toHaveBeenCalledWith(
        'What was the conclusion of the discussion?',
        expect.anything()
      );
      expect(mockRAGService.createPromptWithConversationContext).toHaveBeenCalled();
      expect(mockOpenAIConnector.generateResponse).toHaveBeenCalled();
      
      // Check response format
      expect(response).toBeDefined();
      expect(response.id).toContain('response-msg-789');
      expect(response.content).toBe('Mock agent response');
      expect(response.metadata).toBeDefined();
    });
    
    test('storeTranscript should process and store meeting content', async () => {
      // Test transcript
      const transcript = 'This is a test meeting transcript for the RAG context agent.';
      const meetingId = 'meeting-specific-id';
      
      // Store transcript
      const result = await ragContextAgent.storeTranscript(transcript, meetingId);
      
      // Assertions
      expect(mockRAGService.processContent).toHaveBeenCalledWith(
        transcript,
        'meeting_transcript',
        expect.objectContaining({ 
          meetingId,
          sourceType: 'meeting_transcript'
        }),
        expect.anything()
      );
      expect(result).toBe(true);
    });
  });
}); 