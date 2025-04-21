import {
  ConversationAdapter,
  ConversationState,
} from '../conversation.adapter';
import { BaseAgent } from '../../../../agents/base/base-agent';
import { WorkflowStatus } from '../base-langgraph.adapter';
import { AgentWorkflow } from '../../workflows/agent-workflow';

// Mock the dependencies
jest.mock('../../../../agents/base/base-agent');
jest.mock('../../workflows/agent-workflow');

// Create a mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  setContext: jest.fn(),
  clearContext: jest.fn(),
};

describe('ConversationAdapter Unit Tests', () => {
  let adapter: ConversationAdapter;
  let mockAgent: jest.Mocked<BaseAgent>;
  let mockAgentWorkflow: jest.Mocked<AgentWorkflow>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock agent
    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      description: 'Agent for testing',
      capabilities: [
        { name: 'test-capability', description: 'Test capability' },
      ],
      getCapabilities: jest
        .fn()
        .mockReturnValue([
          { name: 'test-capability', description: 'Test capability' },
        ]),
      canHandle: jest.fn().mockReturnValue(true),
      execute: jest.fn().mockResolvedValue({ output: 'Test response' }),
      initialize: jest.fn().mockResolvedValue(undefined),
      getInitializationStatus: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<BaseAgent>;

    // Create mock agent workflow
    mockAgentWorkflow = {
      execute: jest.fn().mockResolvedValue({
        output: 'Test response',
        metrics: {
          executionTimeMs: 100,
          tokensUsed: 50,
        },
      }),
    } as unknown as jest.Mocked<AgentWorkflow>;

    // Mock AgentWorkflow constructor
    (AgentWorkflow as unknown as jest.Mock).mockImplementation(
      () => mockAgentWorkflow,
    );

    // Create the adapter instance
    adapter = new ConversationAdapter(mockAgent, {
      logger: mockLogger,
      tracingEnabled: false,
    });
  });

  describe('State schema', () => {
    test('should create a valid state schema', () => {
      // Access private method using type assertion
      const schema = (adapter as any).createStateSchema();

      // Verify schema exists and has the expected type
      expect(schema).toBeDefined();
      expect(schema.lc_graph_name).toBe('AnnotationRoot');
      expect(schema.spec).toBeDefined();

      // Check that the schema spec contains the expected fields
      expect(schema.spec).toHaveProperty('id');
      expect(schema.spec).toHaveProperty('runId');
      expect(schema.spec).toHaveProperty('status');
      expect(schema.spec).toHaveProperty('messages');
      expect(schema.spec).toHaveProperty('userInput');
      expect(schema.spec).toHaveProperty('agentResponse');
      expect(schema.spec).toHaveProperty('thinking');
      expect(schema.spec).toHaveProperty('conversationId');
      expect(schema.spec).toHaveProperty('userId');
    });
  });

  describe('Initial state creation', () => {
    test('should create a valid initial state', () => {
      const input = {
        message: 'Hello, agent!',
        userId: 'test-user',
        conversationId: 'test-conversation',
        capability: 'test-capability',
        context: { testKey: 'testValue' },
      };

      // Access private method using type assertion
      const initialState = (adapter as any).createInitialState(input);

      // Verify state properties
      expect(initialState.id).toBeDefined();
      expect(initialState.runId).toBeDefined();
      expect(initialState.status).toBe(WorkflowStatus.INITIALIZING);
      expect(initialState.conversationId).toBe('test-conversation');
      expect(initialState.userId).toBe('test-user');
      expect(initialState.messages).toHaveLength(1);
      expect(initialState.messages[0].role).toBe('user');
      expect(initialState.messages[0].content).toBe('Hello, agent!');
      expect(initialState.userInput).toBe('Hello, agent!');
      expect(initialState.context).toEqual({ testKey: 'testValue' });
      expect(initialState.metadata.agentId).toBe('test-agent');
      expect(initialState.metadata.capability).toBe('test-capability');
    });

    test('should generate a conversationId if not provided', () => {
      const input = {
        message: 'Hello, agent!',
        userId: 'test-user',
      };

      // Access private method using type assertion
      const initialState = (adapter as any).createInitialState(input);

      // Verify a conversationId was generated
      expect(initialState.conversationId).toBeDefined();
      expect(typeof initialState.conversationId).toBe('string');
    });
  });

  describe('Node functions', () => {
    test('initialization node should initialize agent if not already initialized', async () => {
      // Setup agent to be not initialized
      mockAgent.getInitializationStatus.mockReturnValueOnce(false);

      // Create a minimal state for testing
      const state: Partial<ConversationState> = {
        conversationId: 'test-conversation',
        userId: 'test-user',
        status: WorkflowStatus.INITIALIZING,
      };

      // Access private method using type assertion
      const initializationNode = (adapter as any).createInitializationNode();
      const result = await initializationNode(state);

      // Verify agent initialization was called
      expect(mockAgent.initialize).toHaveBeenCalled();
      expect(result.status).toBe(WorkflowStatus.READY);
    });

    test('process message node should update state correctly', async () => {
      // Create a minimal state for testing
      const state: Partial<ConversationState> = {
        conversationId: 'test-conversation',
        userId: 'test-user',
        status: WorkflowStatus.READY,
        thinking: false,
      };

      // Access private method using type assertion
      const processMessageNode = (adapter as any).createProcessMessageNode();
      const result = await processMessageNode(state);

      // Verify state changes
      expect(result.status).toBe(WorkflowStatus.EXECUTING);
      expect(result.thinking).toBe(true);
    });

    test('generate response node should call agent workflow and update state', async () => {
      // Create a message state for testing
      const state: Partial<ConversationState> = {
        conversationId: 'test-conversation',
        userId: 'test-user',
        status: WorkflowStatus.EXECUTING,
        thinking: true,
        userInput: 'Hello, agent!',
        metadata: { capability: 'test-capability' },
        messages: [
          {
            role: 'user',
            content: 'Hello, agent!',
            timestamp: new Date().toISOString(),
          },
        ],
        context: { testKey: 'testValue' },
      };

      // Access private method using type assertion
      const generateResponseNode = (
        adapter as any
      ).createGenerateResponseNode();
      const result = await generateResponseNode(state);

      // Verify agent workflow was called with correct parameters
      expect(mockAgentWorkflow.execute).toHaveBeenCalledWith({
        input: 'Hello, agent!',
        capability: 'test-capability',
        context: {
          userId: 'test-user',
          conversationId: 'test-conversation',
          testKey: 'testValue',
        },
      });

      // Verify state changes
      expect(result.status).toBe(WorkflowStatus.READY);
      expect(result.thinking).toBe(false);
      expect(result.agentResponse).toBe('Test response');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[1].content).toBe('Test response');
      expect(result.metrics).toEqual({
        tokensUsed: 50,
        executionTimeMs: 100,
      });
    });

    test('finalize node should update state correctly', async () => {
      // Create a minimal state for testing
      const state: Partial<ConversationState> = {
        conversationId: 'test-conversation',
        userId: 'test-user',
        status: WorkflowStatus.READY,
        startTime: Date.now() - 500, // 500ms ago
        metadata: {},
      };

      // Access private method using type assertion
      const finalizeNode = (adapter as any).createFinalizeNode();
      const result = await finalizeNode(state);

      // Verify state changes
      expect(result.status).toBe(WorkflowStatus.COMPLETED);
      expect(result.totalExecutionTimeMs).toBeGreaterThanOrEqual(500);
      expect(result.endTime).toBeDefined();
      expect(result.metadata.totalTimeMs).toBeGreaterThanOrEqual(500);
      expect(result.metadata.finalResponseTimestamp).toBeDefined();
    });

    test('error handler node should capture errors correctly', async () => {
      // Create a state with an error
      const state: Partial<ConversationState> = {
        conversationId: 'test-conversation',
        userId: 'test-user',
        status: WorkflowStatus.EXECUTING,
        errorCount: 1,
        errors: [
          {
            message: 'Test error',
            code: 'TEST_ERROR',
            node: 'generate_response',
            timestamp: new Date().toISOString(),
          },
        ],
      };

      // Access private method using type assertion
      const errorHandlerNode = (adapter as any).createErrorHandlerNode();
      const result = await errorHandlerNode(state);

      // Verify state changes
      expect(result.status).toBe(WorkflowStatus.ERROR);
      expect(result.endTime).toBeDefined();
    });
  });

  describe('Result processing', () => {
    test('should process successful result correctly', () => {
      // Create a completed state
      const state: ConversationState = {
        id: 'test-id',
        runId: 'test-run',
        conversationId: 'test-conversation',
        userId: 'test-user',
        status: WorkflowStatus.COMPLETED,
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        errorCount: 0,
        messages: [
          {
            role: 'user',
            content: 'Hello',
            timestamp: new Date().toISOString(),
          },
          {
            role: 'assistant',
            content: 'Hi there!',
            timestamp: new Date().toISOString(),
          },
        ],
        currentMessageIndex: 1,
        thinking: false,
        userInput: 'Hello',
        agentResponse: 'Hi there!',
        context: {},
        metadata: {},
        totalExecutionTimeMs: 1000,
      };

      // Access private method using type assertion
      const result = (adapter as any).processResult(state);

      // Verify result
      expect(result.conversationId).toBe('test-conversation');
      expect(result.userId).toBe('test-user');
      expect(result.message).toBe('Hello');
      expect(result.response).toBe('Hi there!');
      expect(result.status).toBe(WorkflowStatus.COMPLETED);
      expect(result.success).toBe(true);
      expect(result.metrics?.executionTimeMs).toBe(1000);
      expect(result.metrics?.totalMessages).toBe(2);
    });

    test('should process error result correctly', () => {
      // Create an error state
      const state: ConversationState = {
        id: 'test-id',
        runId: 'test-run',
        conversationId: 'test-conversation',
        userId: 'test-user',
        status: WorkflowStatus.ERROR,
        startTime: Date.now() - 1000,
        endTime: Date.now(),
        errorCount: 1,
        errors: [
          {
            message: 'Failed to generate response',
            code: 'EXECUTION_ERROR',
            node: 'generate_response',
            timestamp: new Date().toISOString(),
          },
        ],
        messages: [
          {
            role: 'user',
            content: 'Hello',
            timestamp: new Date().toISOString(),
          },
        ],
        currentMessageIndex: 0,
        thinking: false,
        userInput: 'Hello',
        context: {},
        metadata: {},
      };

      // Access private method using type assertion
      const result = (adapter as any).processResult(state);

      // Verify result
      expect(result.conversationId).toBe('test-conversation');
      expect(result.userId).toBe('test-user');
      expect(result.message).toBe('Hello');
      expect(result.response).toBe('Failed to generate response');
      expect(result.status).toBe('error');
      expect(result.success).toBe(false);
    });
  });

  describe('sendMessage method', () => {
    test('should execute workflow correctly', async () => {
      // We'll mock the execute method since it handles the workflow execution
      const mockExecute = jest
        .spyOn(adapter as any, 'execute')
        .mockResolvedValueOnce({
          conversationId: 'test-conversation',
          userId: 'test-user',
          message: 'Hello',
          response: 'Hi there!',
          status: 'completed',
          success: true,
        });

      const params = {
        message: 'Hello',
        userId: 'test-user',
        conversationId: 'test-conversation',
      };

      const result = await adapter.sendMessage(params);

      // Verify execute was called with correct parameters
      expect(mockExecute).toHaveBeenCalledWith(params);
      expect(result.conversationId).toBe('test-conversation');
      expect(result.response).toBe('Hi there!');
      expect(result.success).toBe(true);
    });
  });
});
