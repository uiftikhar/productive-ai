import { ChatService } from '../chat.service';
import { UserContextFacade } from '../../shared/services/user-context/user-context.facade';
import { LanguageModelProvider } from '../../agents/interfaces/language-model-provider.interface';
import { AgentRegistryService } from '../../agents/services/agent-registry.service';
import { BaseAgent } from '../../agents/base/base-agent';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import {
  ChatErrorType,
  ChatServiceError,
  CreateSessionRequest,
  SendMessageRequest,
} from '../chat.types';
import { HistoryAwareSupervisor } from '../../langgraph/core/workflows/history-aware-supervisor';
import {
  AgentRequest,
  AgentResponse,
  BaseAgentInterface,
  WorkflowCompatibleAgent,
} from '../../agents/interfaces/base-agent.interface';

// Mock dependencies
jest.mock('../../shared/services/user-context/user-context.facade');
jest.mock('../../langgraph/core/workflows/history-aware-supervisor');
jest.mock('../../agents/services/agent-registry.service');

// Mock the singleton getInstance method
const mockAgentRegistryInstance = {
  registerAgent: jest.fn(),
  getAllAgents: jest.fn().mockReturnValue([]),
  getAgent: jest.fn(),
  getDefaultAgent: jest.fn(),
  findAgentsWithCapability: jest.fn(),
  listAgents: jest.fn(),
  listAgentsWithDetails: jest.fn(),
  initializeAgents: jest.fn().mockResolvedValue(undefined),
  unregisterAgent: jest.fn(),
};

(AgentRegistryService as any).getInstance = jest.fn(
  () => mockAgentRegistryInstance,
);

// Helper to create a mock agent
function createMockAgent(id: string, name: string): BaseAgentInterface {
  // Create a basic agent that implements the BaseAgentInterface
  const agent: BaseAgentInterface = {
    id,
    name,
    description: `Test agent: ${name}`,
    canHandle: jest.fn().mockReturnValue(true),
    getCapabilities: jest.fn().mockReturnValue([]),
    initialize: jest.fn().mockResolvedValue(undefined),
    execute: jest
      .fn()
      .mockImplementation(
        async (request: AgentRequest): Promise<AgentResponse> => {
          return {
            output: `Mock response from ${name} for: ${request.input}`,
            metadata: {
              executionTimeMs: 100,
              agentId: id,
            },
          } as unknown as AgentResponse;
        },
      ),
    getMetrics: jest.fn().mockReturnValue({ totalExecutions: 0 }),
    getState: jest.fn().mockReturnValue({ status: 'READY' }),
    getInitializationStatus: jest.fn().mockReturnValue(true),
    terminate: jest.fn().mockResolvedValue(undefined),
  };

  // Add executeInternal method only if needed in the tests
  return agent;
}

// Mock LLM connector
const mockLLMConnector: LanguageModelProvider = {
  initialize: jest.fn().mockResolvedValue(undefined),
  generateResponse: jest.fn().mockResolvedValue({ content: 'Mock response' }),
  generateStreamingResponse: jest.fn(),
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  generateBatchEmbeddings: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  createPromptTemplate: jest.fn(),
  formatPromptTemplate: jest.fn(),
} as unknown as LanguageModelProvider;

describe('ChatService', () => {
  let chatService: ChatService;
  let mockUserContextFacade: jest.Mocked<UserContextFacade>;
  let mockAgent: BaseAgentInterface;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mocks
    mockUserContextFacade =
      new UserContextFacade() as jest.Mocked<UserContextFacade>;
    mockUserContextFacade.storeConversationTurn = jest
      .fn()
      .mockResolvedValue('turn-123');
    mockUserContextFacade.getConversationHistory = jest
      .fn()
      .mockResolvedValue([]);

    // Create a test agent and set up the mock registry
    mockAgent = createMockAgent('test-agent-1', 'Test Agent');
    mockAgentRegistryInstance.getAllAgents.mockReturnValue([mockAgent]);
    mockAgentRegistryInstance.getAgent.mockReturnValue(mockAgent);

    // Setup HistoryAwareSupervisor mock
    (HistoryAwareSupervisor as jest.Mock).mockImplementation(() => ({
      registerAgent: jest.fn(),
      executeWithHistory: jest.fn().mockResolvedValue({
        finalResponse: 'Mock supervisor response',
        tasks: [],
        metrics: {
          totalExecutionTimeMs: 200,
          totalTokensUsed: 150,
        },
        agentsInvolved: ['test-agent-1'],
        primaryAgent: 'test-agent-1',
        createNewSegment: false,
      }),
    }));

    // Create the service
    chatService = new ChatService({
      userContextFacade: mockUserContextFacade,
      llmConnector: mockLLMConnector,
      agentRegistry: AgentRegistryService.getInstance(new ConsoleLogger()),
      logger: new ConsoleLogger(),
    });
  });

  describe('createSession', () => {
    it('should create a new chat session', async () => {
      const request: CreateSessionRequest = {
        userId: 'user-123',
        metadata: { source: 'web' },
      };

      const session = await chatService.createSession(request);

      expect(session).toBeDefined();
      expect(session.userId).toBe('user-123');
      expect(session.metadata).toEqual({ source: 'web' });
      expect(session.sessionId).toBeDefined();
      expect(session.conversationId).toBeDefined();
      expect(HistoryAwareSupervisor).toHaveBeenCalledTimes(1);
    });

    it('should use provided conversationId if specified', async () => {
      const request: CreateSessionRequest = {
        userId: 'user-123',
        conversationId: 'existing-convo-123',
      };

      const session = await chatService.createSession(request);

      expect(session.conversationId).toBe('existing-convo-123');
    });

    it('should register all agents from registry with supervisor', async () => {
      const request: CreateSessionRequest = {
        userId: 'user-123',
      };

      await chatService.createSession(request);

      // Get the mock instance of HistoryAwareSupervisor
      const mockSupervisor = (HistoryAwareSupervisor as jest.Mock).mock
        .results[0].value;
      expect(mockSupervisor.registerAgent).toHaveBeenCalled();
      expect(mockAgentRegistryInstance.getAllAgents).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    let sessionId: string;

    beforeEach(async () => {
      // Create a session first
      const session = await chatService.createSession({
        userId: 'user-123',
      });
      sessionId = session.sessionId;
    });

    it('should send a message and get a response', async () => {
      const request: SendMessageRequest = {
        sessionId,
        content: 'Hello, AI!',
      };

      const result = await chatService.sendMessage(request);

      // Check user message was stored
      expect(mockUserContextFacade.storeConversationTurn).toHaveBeenCalledWith(
        'user-123',
        expect.any(String), // conversation ID
        'Hello, AI!',
        expect.any(Array), // embeddings - now we expect an array with values
        'user',
        expect.any(String), // message ID
        {},
      );

      // Check response was generated and stored
      expect(result.message).toBeDefined();
      expect(result.message.content).toBe('Mock supervisor response');
      expect(mockUserContextFacade.storeConversationTurn).toHaveBeenCalledTimes(
        2,
      );
    });

    it('should throw error when session is not found', async () => {
      const request: SendMessageRequest = {
        sessionId: 'non-existent-session',
        content: 'Hello?',
      };

      await expect(chatService.sendMessage(request)).rejects.toThrow(
        new ChatServiceError(
          'Session not found: non-existent-session',
          ChatErrorType.SESSION_NOT_FOUND,
        ),
      );
    });
  });

  describe('getSessionHistory', () => {
    let sessionId: string;

    beforeEach(async () => {
      // Create a session first
      const session = await chatService.createSession({
        userId: 'user-123',
      });
      sessionId = session.sessionId;

      // Mock conversation history
      mockUserContextFacade.getConversationHistory.mockResolvedValue([
        {
          id: 'msg-1',
          content: 'Hello, AI!',
          role: 'user',
          timestamp: Date.now() - 1000,
          metadata: {},
        },
        {
          id: 'msg-2',
          content: 'Hello, human! How can I help you today?',
          role: 'assistant',
          timestamp: Date.now(),
          metadata: {
            agentId: 'test-agent-1',
          },
        },
      ]);
    });

    it('should retrieve session history', async () => {
      const history = await chatService.getSessionHistory(sessionId);

      expect(history).toHaveLength(2);
      expect(history[0].role).toBe('user');
      expect(history[1].role).toBe('assistant');
      expect(mockUserContextFacade.getConversationHistory).toHaveBeenCalledWith(
        'user-123',
        expect.any(String),
        15, // default limit
        expect.objectContaining({
          includeMetadata: true,
        }),
      );
    });

    it('should apply filtering options', async () => {
      const beforeDate = new Date();

      await chatService.getSessionHistory(sessionId, {
        limit: 5,
        beforeTimestamp: beforeDate,
        includeMetadata: false,
      });

      expect(mockUserContextFacade.getConversationHistory).toHaveBeenCalledWith(
        'user-123',
        expect.any(String),
        5,
        expect.objectContaining({
          beforeTimestamp: beforeDate.getTime(),
          includeMetadata: false,
        }),
      );
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', async () => {
      // Create a session first
      const session = await chatService.createSession({
        userId: 'user-123',
      });

      // Verify session exists before deletion
      expect(chatService.getSession(session.sessionId)).toBeDefined();

      // Delete the session
      const result = await chatService.deleteSession(session.sessionId);
      expect(result).toBe(true);

      // Verify the session was removed by checking if an error is thrown
      // when trying to get the deleted session
      try {
        chatService.getSession(session.sessionId);
        // If we get here, the test should fail because the session still exists
        fail('Expected session to be deleted but it still exists');
      } catch (error) {
        // Session should be deleted, so we expect an error
        expect(error).toBeInstanceOf(ChatServiceError);
        expect((error as ChatServiceError).type).toBe(
          ChatErrorType.SESSION_NOT_FOUND,
        );
      }
    });
  });
});
