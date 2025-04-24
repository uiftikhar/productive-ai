import {
  BedrockClassifier,
  BedrockClassifierOptions,
} from '../bedrock-classifier';
import { MockLogger } from '../../tests/mocks/mock-logger';
import { ClassifierResult } from '../../interfaces/classifier.interface';
import {
  ConversationMessage,
  ParticipantRole,
} from '../../types/conversation.types';
import { BedrockChat } from '@langchain/community/chat_models/bedrock';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

// Create a mock for the invoke method
const mockInvoke = jest.fn().mockImplementation(() => {
  return {
    content: JSON.stringify({
      selectedAgentId: 'test-agent',
      confidence: 0.9,
      reasoning: 'This is a test using Bedrock',
      isFollowUp: false,
      entities: ['bedrock', 'test'],
      intent: 'test_bedrock',
    }),
  };
});

// Mock for BedrockChat
jest.mock('@langchain/community/chat_models/bedrock', () => {
  return {
    BedrockChat: jest.fn().mockImplementation(() => {
      return {
        invoke: mockInvoke,
      };
    }),
  };
});

describe('BedrockClassifier', () => {
  let classifier: BedrockClassifier;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = new MockLogger();
    classifier = new BedrockClassifier({
      logger: mockLogger,
      modelId: 'anthropic.claude-3-sonnet-test',
      region: 'us-east-1',
      temperature: 0.1,
      maxTokens: 500,
    });

    // Clear mock calls
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    test('should initialize with default options', async () => {
      classifier = new BedrockClassifier();
      await classifier.initialize();

      expect(BedrockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.stringContaining('claude'),
          region: expect.any(String),
        }),
      );
    });

    test('should initialize with custom options', async () => {
      const options: BedrockClassifierOptions = {
        modelId: 'anthropic.claude-3-haiku',
        region: 'eu-west-1',
        temperature: 0.3,
        maxTokens: 1000,
        templateType: 'followup',
      };

      classifier = new BedrockClassifier(options);
      await classifier.initialize();

      expect(BedrockChat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'anthropic.claude-3-haiku',
          region: 'eu-west-1',
          temperature: 0.3,
          maxTokens: 1000,
        }),
      );
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
      expect(
        mockLogger
          .getLogs('debug')
          .some(
            (log) => log.context && log.context.domain === 'customer_support',
          ),
      ).toBe(true);
    });
  });

  describe('classification', () => {
    test('should classify input using Bedrock', async () => {
      const input = 'Help me with my order';
      const history: ConversationMessage[] = [
        {
          role: ParticipantRole.USER,
          content: 'Hello',
          timestamp: Date.now().toString(),
        },
      ];

      // Set up mock agents
      const mockAgents = {
        'test-agent': {
          id: 'test-agent',
          name: 'Test Agent',
          description: 'A test agent',
        },
      } as any;

      classifier.setAgents(mockAgents);

      const result = await classifier.classify(input, history);

      // Verify the expected result
      expect(result.selectedAgentId).toBe('test-agent');
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toBe('This is a test using Bedrock');
      expect(result.isFollowUp).toBe(false);

      // Verify that the LLM was called correctly
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.any(SystemMessage),
          expect.any(HumanMessage),
        ]),
      );

      // Check the human message contains the input
      const invokeCall = mockInvoke.mock.calls[0][0];
      const humanMessage = invokeCall.find(
        (msg: any) => msg instanceof HumanMessage,
      );
      expect(humanMessage.content).toBe(input);
    });

    test('should handle errors from LLM', async () => {
      // Clear any existing agents to avoid validation errors
      classifier.setAgents({});

      // Reset mock implementation for this specific test
      mockInvoke.mockReset();

      // Setup LLM to throw an error for this test
      mockInvoke.mockRejectedValueOnce(new Error('Bedrock LLM error'));

      // The BaseClassifier catches errors and returns a result with null agent and error message
      const result = await classifier.classify('test input', []);

      expect(result.selectedAgentId).toBeNull();
      expect(result.confidence).toBe(0);
      // Just verify there's an error message, but don't check exact content as it's implementation-dependent
      expect(result.reasoning).toContain('Classification error:');
    });

    test('should handle invalid JSON response', async () => {
      // Clear any existing agents to avoid validation errors
      classifier.setAgents({});

      // Reset mock implementation for this specific test
      mockInvoke.mockReset();

      // Setup LLM to return non-JSON response for this test
      mockInvoke.mockResolvedValueOnce({
        content: 'This is not JSON',
      });

      // The BaseClassifier catches errors and returns a result with null agent and error message
      const result = await classifier.classify('test input', []);

      expect(result.selectedAgentId).toBeNull();
      expect(result.confidence).toBe(0);
      // Just verify there's an error message, but don't check exact content as it's implementation-dependent
      expect(result.reasoning).toContain('Classification error:');
      expect(
        mockLogger.hasMessage('Error parsing classifier response', 'error'),
      ).toBe(true);
    });

    test('should handle specialized template', async () => {
      // Set specialized template
      classifier.setTemplateType('specialized', 'customer_support');

      // Setup LLM to return specialized response
      mockInvoke.mockResolvedValueOnce({
        content: JSON.stringify({
          selectedCapability: 'order_tracking',
          confidence: 0.95,
          reasoning: 'Customer wants to track order',
          entities: ['order'],
          intent: 'track_order',
        }),
      });

      const result = await classifier.classify('Where is my order?', []);

      expect(result.selectedAgentId).toBeNull(); // Specialized doesn't select an agent
      expect(result.confidence).toBe(0.95);
      expect(result.intent).toBe('track_order');
      expect(result).toHaveProperty('capability', 'order_tracking');
    });

    test('should handle followup template', async () => {
      // Set followup template
      classifier.setTemplateType('followup');

      // Set up mock agents to avoid validation failure
      const mockAgents = {
        'previous-agent': {
          id: 'previous-agent',
          name: 'Previous Agent',
          description: 'A previously used agent',
        },
      } as any;

      classifier.setAgents(mockAgents);

      // Setup LLM to return followup response
      mockInvoke.mockResolvedValueOnce({
        content: JSON.stringify({
          isFollowUp: true,
          confidence: 0.98,
          reasoning: 'This is a follow-up question',
          selectedAgentId: 'previous-agent',
        }),
      });

      const result = await classifier.classify('Yes, please do that', []);

      expect(result.selectedAgentId).toBe('previous-agent');
      expect(result.confidence).toBe(0.98);
      expect(result.isFollowUp).toBe(true);
      expect(result.intent).toBe('');
      expect(result.entities).toEqual([]);
    });

    test('should validate and handle non-existent agent IDs', async () => {
      // Setup LLM to return a non-existent agent
      mockInvoke.mockResolvedValueOnce({
        content: JSON.stringify({
          selectedAgentId: 'non-existent-agent',
          confidence: 0.85,
          reasoning: 'This agent does not exist',
          isFollowUp: false,
          entities: [],
          intent: 'test',
        }),
      });

      // Set up empty agents list
      classifier.setAgents({});

      const result = await classifier.classify('Hello', []);

      expect(result.selectedAgentId).toBeNull(); // Should reset to null
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('does not exist');
      expect(
        mockLogger.hasMessage('Classifier selected non-existent agent', 'warn'),
      ).toBe(true);
    });
  });
});
