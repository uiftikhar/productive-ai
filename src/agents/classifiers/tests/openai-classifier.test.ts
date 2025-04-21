import { OpenAIClassifier, OpenAIClassifierOptions } from '../openai-classifier';
import { ConversationMessage, ParticipantRole } from '../../types/conversation.types';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { MockLogger } from '../../tests/mocks/mock-logger';

// Define mock instance at file level scope
const mockInstance = {
  invoke: jest.fn().mockResolvedValue({
    content: JSON.stringify({
      selectedAgentId: 'test-agent',
      confidence: 0.85,
      reasoning: 'This is a test',
      isFollowUp: false,
      entities: ['test'],
      intent: 'get_info'
    })
  })
};

const mockInvoke = mockInstance.invoke;

// Mock for ChatOpenAI
jest.mock('@langchain/openai', () => {
  const MockChatOpenAI = jest.fn().mockImplementation(() => mockInstance);
  
  return {
    ChatOpenAI: MockChatOpenAI
  };
});

describe('OpenAIClassifier', () => {
  let classifier: OpenAIClassifier;
  let mockLogger: MockLogger;
  
  beforeEach(() => {
    mockLogger = new MockLogger();
    classifier = new OpenAIClassifier({ 
      logger: mockLogger,
      modelName: 'gpt-4-test',
      temperature: 0.1,
      maxTokens: 500
    });
    
    // Clear mock calls
    jest.clearAllMocks();
  });
  
  describe('initialization', () => {
    test('should initialize with default options', async () => {
      classifier = new OpenAIClassifier();
      await classifier.initialize();
      
      expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        modelName: expect.stringContaining('gpt-'),
        temperature: expect.any(Number)
      }));
    });
    
    test('should initialize with custom options', async () => {
      const options: OpenAIClassifierOptions = {
        modelName: 'gpt-4-turbo',
        temperature: 0.3,
        maxTokens: 1000,
        templateType: 'followup'
      };
      
      classifier = new OpenAIClassifier(options);
      await classifier.initialize();
      
      expect(ChatOpenAI).toHaveBeenCalledWith(expect.objectContaining({
        modelName: 'gpt-4-turbo',
        temperature: 0.3,
        maxTokens: 1000
      }));
    });
  });
  
  describe('template handling', () => {
    test('should set template based on type', () => {
      // Set a followup template type
      classifier.setTemplateType('followup');
      expect(mockLogger.hasMessage('Changed template type')).toBe(true);
      
      // Test specialized template with domain
      classifier.setTemplateType('specialized', 'customer_support');
      expect(mockLogger.hasMessage('Changed template type')).toBe(true);
      expect(mockLogger.getLogs('debug').some(log => 
        log.context && log.context.domain === 'customer_support'
      )).toBe(true);
    });
  });
  
  describe('classification', () => {
    test('should classify input using OpenAI', async () => {
      const input = 'Help me with my order';
      const history: ConversationMessage[] = [
        {
          role: ParticipantRole.USER,
          content: 'Hello',
          timestamp: Date.now().toString()
        }
      ];
      
      // Set up mock agents
      const mockAgents = {
        'test-agent': {
          id: 'test-agent',
          name: 'Test Agent',
          description: 'A test agent'
        }
      } as any;
      
      classifier.setAgents(mockAgents);
      
      const result = await classifier.classify(input, history);
      
      // Verify the expected result
      expect(result.selectedAgentId).toBe('test-agent');
      expect(result.confidence).toBe(0.85);
      expect(result.reasoning).toBe('This is a test');
      expect(result.isFollowUp).toBe(false);
      
      // Verify that the LLM was called correctly
      const mockedChatOpenAI = jest.mocked(ChatOpenAI);
      const mockInstance = mockedChatOpenAI.mock.results[0].value;
      
      expect(mockInstance.invoke).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.any(SystemMessage),
          expect.any(HumanMessage)
        ])
      );
      
      // Check the human message contains the input
      const invokeCall = mockInstance.invoke.mock.calls[0][0];
      const humanMessage = invokeCall.find((msg: any) => msg instanceof HumanMessage);
      expect(humanMessage.content).toBe(input);
    });
    
    test('should handle errors from LLM', async () => {
      // Setup LLM to throw an error
      const mockedChatOpenAI = jest.mocked(ChatOpenAI);
      const mockInstance = mockedChatOpenAI.mock.results[0].value;
      mockInstance.invoke = jest.fn().mockRejectedValue(new Error('LLM error'));
      
      try {
        await classifier.classify('test input', []);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Failed to parse classifier response');
        expect(mockLogger.hasMessage('Error parsing classifier response', 'error')).toBe(true);
      }
    });
    
    test('should handle invalid JSON response', async () => {
      // Setup LLM to return non-JSON response
      const mockedChatOpenAI = jest.mocked(ChatOpenAI);
      const mockInstance = mockedChatOpenAI.mock.results[0].value;
      mockInstance.invoke = jest.fn().mockResolvedValue({
        content: 'This is not JSON'
      });
      
      try {
        await classifier.classify('test input', []);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('No JSON found in classifier response');
        expect(mockLogger.hasMessage('Error parsing classifier response', 'error')).toBe(true);
      }
    });
    
    test('should handle specialized template', async () => {
      // Set specialized template
      classifier.setTemplateType('specialized', 'customer_support');
      
      // Setup LLM to return specialized response
      const mockedChatOpenAI = jest.mocked(ChatOpenAI);
      const mockInstance = mockedChatOpenAI.mock.results[0].value;
      mockInstance.invoke = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          selectedCapability: 'order_tracking',
          confidence: 0.9,
          reasoning: 'Customer wants to track order',
          entities: ['order'],
          intent: 'track_order'
        })
      });
      
      const result = await classifier.classify('Where is my order?', []);
      
      expect(result.selectedAgentId).toBeNull(); // Specialized doesn't select an agent
      expect(result.confidence).toBe(0.9);
      expect(result.intent).toBe('track_order');
      expect(result).toHaveProperty('capability', 'order_tracking');
    });
    
    test('should handle followup template', async () => {
      // Set followup template
      classifier.setTemplateType('followup');
      
      // Setup LLM to return followup response
      const mockedChatOpenAI = jest.mocked(ChatOpenAI);
      const mockInstance = mockedChatOpenAI.mock.results[0].value;
      mockInstance.invoke = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          isFollowUp: true,
          confidence: 0.95,
          reasoning: 'This is a follow-up question',
          selectedAgentId: 'previous-agent'
        })
      });
      
      const result = await classifier.classify('Yes, please do that', []);
      
      expect(result.selectedAgentId).toBe('previous-agent');
      expect(result.confidence).toBe(0.95);
      expect(result.isFollowUp).toBe(true);
      expect(result.intent).toBe('');
      expect(result.entities).toEqual([]);
    });
    
    test('should validate and handle non-existent agent IDs', async () => {
      // Setup LLM to return a non-existent agent
      const mockedChatOpenAI = jest.mocked(ChatOpenAI);
      const mockInstance = mockedChatOpenAI.mock.results[0].value;
      mockInstance.invoke = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          selectedAgentId: 'non-existent-agent',
          confidence: 0.8,
          reasoning: 'This agent does not exist',
          isFollowUp: false,
          entities: [],
          intent: 'test'
        })
      });
      
      // Set up empty agents list
      classifier.setAgents({});
      
      const result = await classifier.classify('Hello', []);
      
      expect(result.selectedAgentId).toBeNull(); // Should reset to null
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('does not exist');
      expect(mockLogger.hasMessage('Classifier selected non-existent agent', 'warn')).toBe(true);
    });
  });
}); 