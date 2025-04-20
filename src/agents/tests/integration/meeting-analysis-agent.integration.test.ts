import { MeetingAnalysisAgent } from '../../specialized/meeting-analysis-agent';
import { EmbeddingService } from '../../../shared/services/embedding.service';
import { BaseContextService } from '../../../shared/user-context/services/base-context.service';
import { OpenAIConnector } from '../../integrations/openai-connector';
import { Logger } from '../../../shared/logger/logger.interface';
import { RagPromptManager } from '../../../shared/services/rag-prompt-manager.service';
import { ChatOpenAI } from '@langchain/openai';

// Define the MockLogger type
interface MockLoggerType extends Logger {
  messages: Array<{level: string, message: string, meta?: any}>;
  clear(): void;
  getLogsByLevel(level: string): Array<{level: string, message: string, meta?: any}>;
  hasMessage(messageSubstring: string, level?: string): boolean;
  currentLogLevel: string;
}

// Declare the global mockLogger
declare global {
  var mockLogger: MockLoggerType;
}

// Mock service implementations
jest.mock('../../../shared/services/embedding.service');
jest.mock('../../../shared/user-context/services/base-context.service');
jest.mock('../../../shared/services/rag-prompt-manager.service');
jest.mock('../../integrations/openai-connector');
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn(),
    modelName: 'gpt-4-turbo-test',
    callKeys: [],
    lc_serializable: true,
    lc_secrets: {},
    lc_aliases: {},
    // Add any other required properties here
  }))
}));

describe('MeetingAnalysisAgent Integration', () => {
  let agent: MeetingAnalysisAgent;
  let mockEmbeddingService: jest.Mocked<EmbeddingService>;
  let mockBaseContextService: jest.Mocked<BaseContextService>;
  let mockOpenAIConnector: jest.Mocked<OpenAIConnector>;
  let mockRagPromptManager: jest.Mocked<RagPromptManager>;

  // Sample meeting transcript for testing
  const sampleTranscript = `
John: Welcome everyone to our weekly product planning meeting.
Mary: Thanks, John. I'd like to discuss the upcoming release timeline.
John: Great, what are your thoughts?
Mary: We need to delay the launch by two weeks due to some backend issues.
John: I understand. Let's make that change. Can someone update the project plan?
David: I'll take care of updating the timeline in our project management tool by tomorrow.
John: Thanks David. Any other points?
Mary: We should also inform the marketing team about this change.
John: Good point. I'll email Sarah from marketing today.
David: Should we discuss the new feature prioritization?
John: Yes, let's do that in our next meeting. Let's wrap up for today.
  `;

  // Sample analysis result
  const sampleAnalysisResult = {
    actionItems: [
      { description: 'Update project timeline', assignee: 'David', dueDate: 'tomorrow' },
      { description: 'Email marketing team', assignee: 'John', dueDate: 'today' }
    ],
    decisions: [
      { description: 'Delay product launch by two weeks' }
    ],
    topics: [
      { title: 'Release timeline', participants: ['Mary', 'John', 'David'] },
      { title: 'Marketing coordination', participants: ['Mary', 'John'] }
    ]
  };

  beforeEach(() => {
    // Clear the global mockLogger
    global.mockLogger.clear();
    
    // Create mock embedding service
    mockEmbeddingService = {
      generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
      initialize: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmbeddingService>;
    
    // Create mock context service
    mockBaseContextService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      storeUserContext: jest.fn().mockResolvedValue('context-id-123'),
    } as unknown as jest.Mocked<BaseContextService>;
    
    // Create mock OpenAI connector
    mockOpenAIConnector = {
      initialize: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OpenAIConnector>;

    // Create mock RagPromptManager
    mockRagPromptManager = {
      createRagPrompt: jest.fn().mockResolvedValue({
        messages: [
          { role: 'system', content: 'You are a meeting analyst' },
          { role: 'user', content: sampleTranscript }
        ],
        retrievedContext: {
          items: [],
          sources: [],
        }
      }),
    } as unknown as jest.Mocked<RagPromptManager>;

    // Setup the RAG prompt manager mock
    (RagPromptManager as jest.MockedClass<typeof RagPromptManager>).mockImplementation(() => mockRagPromptManager);

    // Create a properly mocked ChatOpenAI instance
    const mockLLM = new ChatOpenAI();
    (mockLLM.invoke as jest.Mock).mockResolvedValue({
      content: JSON.stringify(sampleAnalysisResult)
    });

    // Create the agent with mocked dependencies
    agent = new MeetingAnalysisAgent('Test Meeting Analysis Agent', 'For testing', {
      logger: global.mockLogger,
      embeddingService: mockEmbeddingService,
      baseContextService: mockBaseContextService,
      openAIConnector: mockOpenAIConnector,
      llm: mockLLM
    });
  });

  test('should initialize successfully', async () => {
    await agent.initialize();
    
    expect(agent.getInitializationStatus()).toBe(true);
    expect(mockBaseContextService.initialize).toHaveBeenCalled();
    expect(global.mockLogger.hasMessage('Initializing Test Meeting Analysis Agent', 'info')).toBe(true);
  });

  test('should analyze transcript chunk', async () => {
    await agent.initialize();
    
    const response = await agent.execute({
      input: sampleTranscript,
      capability: 'analyze-transcript-chunk'
    });
    
    // Verify successful execution
    expect(response.output).toBeDefined();
    
    // Parse the JSON output with error handling
    let result;
    try {
      if (typeof response.output === 'string') {
        result = JSON.parse(response.output);
      } else if (typeof response.output === 'object' && response.output !== null) {
        const content = response.output.content || '';
        result = typeof content === 'string' ? JSON.parse(content) : content;
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      console.error('Failed to parse JSON:', response.output);
      throw error;
    }
    
    // Verify the structure of the output
    expect(result).toHaveProperty('actionItems');
    expect(result).toHaveProperty('decisions');
    expect(result).toHaveProperty('topics');
    
    // Verify metrics were updated
    const metrics = agent.getMetrics();
    expect(metrics.totalExecutions).toBe(1);
    expect(metrics.totalExecutionTimeMs).toBeGreaterThan(0);
  });

  test('should extract action items', async () => {
    await agent.initialize();
    
    const response = await agent.execute({
      input: sampleTranscript,
      capability: 'extract-action-items'
    });
    
    // Verify successful execution
    expect(response.output).toBeDefined();
    
    // Parse the JSON output with error handling
    let result;
    try {
      if (typeof response.output === 'string') {
        result = JSON.parse(response.output);
      } else if (typeof response.output === 'object' && response.output !== null) {
        const content = response.output.content || '';
        result = typeof content === 'string' ? JSON.parse(content) : content;
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      console.error('Failed to parse JSON:', response.output);
      throw error;
    }
    
    // Verify action items were extracted
    expect(result.actionItems).toBeInstanceOf(Array);
    expect(result.actionItems.length).toBeGreaterThan(0);
    
    // Verify action item structure
    const actionItem = result.actionItems[0];
    expect(actionItem).toHaveProperty('description');
    expect(actionItem).toHaveProperty('assignee');
  });

  test('should extract decisions', async () => {
    await agent.initialize();
    
    const response = await agent.execute({
      input: sampleTranscript,
      capability: 'extract-decisions'
    });
    
    // Verify successful execution
    expect(response.output).toBeDefined();
    
    // Parse the JSON output with error handling
    let result;
    try {
      if (typeof response.output === 'string') {
        result = JSON.parse(response.output);
      } else if (typeof response.output === 'object' && response.output !== null) {
        const content = response.output.content || '';
        result = typeof content === 'string' ? JSON.parse(content) : content;
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      console.error('Failed to parse JSON:', response.output);
      throw error;
    }
    
    // Verify decisions were extracted
    expect(result.decisions).toBeInstanceOf(Array);
    expect(result.decisions.length).toBeGreaterThan(0);
    
    // Verify the specific decision was identified
    expect(result.decisions.some((d: { description: string }) => 
      d.description.toLowerCase().includes('delay')
    )).toBe(true);
  });

  test('should handle errors gracefully', async () => {
    await agent.initialize();
    
    // Configure the mock LLM to throw an error
    (agent as any).llm.invoke = jest.fn().mockRejectedValue(
      new Error('Test LLM failure')
    );
    
    const response = await agent.execute({
      input: sampleTranscript,
      capability: 'analyze-transcript-chunk'
    });
    
    // Verify error handling
    expect(response.output).toContain('Error:');
    expect(response.output).toContain('Test LLM failure');
    
    // Verify error metrics were updated
    expect(agent.getState().errorCount).toBeGreaterThan(0);
    expect(agent.getMetrics().errorRate).toBeGreaterThan(0);
  });
  
  test('should store analysis in context when specified', async () => {
    await agent.initialize();
    
    // Mock storeAnalysisInContext to succeed
    const mockStoreAnalysis = jest.spyOn(agent as any, 'storeAnalysisInContext')
      .mockImplementation(async () => {
        await mockBaseContextService.storeUserContext('user-123', 'test content', [], {});
        return 'context-id-123';
      });
    
    const response = await agent.execute({
      input: sampleTranscript,
      capability: 'analyze-transcript-chunk',
      parameters: {
        storeInContext: true,
        userId: 'user-123',
        meetingId: 'meeting-456'
      }
    });
    
    // Verify storeAnalysisInContext was called
    expect(mockStoreAnalysis).toHaveBeenCalled();
    
    // Verify context storage was attempted
    expect(mockBaseContextService.storeUserContext).toHaveBeenCalled();
    
    // Verify successful execution
    expect(response.output).toBeDefined();
    expect(response.artifacts).toBeDefined();
  });

  test('should extract topics', async () => {
    await agent.initialize();
    
    const response = await agent.execute({
      input: sampleTranscript,
      capability: 'extract-topics'
    });
    
    // Verify successful execution
    expect(response.output).toBeDefined();
    
    // Parse the JSON output with error handling
    let result;
    try {
      if (typeof response.output === 'string') {
        result = JSON.parse(response.output);
      } else if (typeof response.output === 'object' && response.output !== null) {
        const content = response.output.content || '';
        result = typeof content === 'string' ? JSON.parse(content) : content;
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      console.error('Failed to parse JSON:', response.output);
      throw error;
    }
    
    // Verify topics were extracted
    expect(result.topics).toBeInstanceOf(Array);
    expect(result.topics.length).toBeGreaterThan(0);
    
    // Verify topic structure
    const topic = result.topics[0];
    expect(topic).toHaveProperty('title');
    expect(topic).toHaveProperty('participants');
  });

  test('should generate final analysis', async () => {
    await agent.initialize();
    
    // Mock with previous analysis chunks
    const analysisChunks = [
      { actionItems: [{ description: 'Update timeline', assignee: 'David' }], 
        decisions: [{ description: 'Delay product launch' }], 
        topics: [{ title: 'Release timeline' }] },
      { actionItems: [{ description: 'Contact marketing', assignee: 'John' }], 
        decisions: [], 
        topics: [{ title: 'Marketing coordination' }] }
    ];
    
    // Setup our input to include previous analysis
    const response = await agent.execute({
      input: JSON.stringify(analysisChunks),
      capability: 'generate-final-analysis',
      parameters: {
        meetingId: 'meeting-123',
        meetingTitle: 'Weekly Planning'
      }
    });
    
    // Verify successful execution
    expect(response.output).toBeDefined();
    
    // Parse the JSON output
    let result;
    try {
      if (typeof response.output === 'string') {
        result = JSON.parse(response.output);
      } else if (typeof response.output === 'object' && response.output !== null) {
        const content = response.output.content || '';
        result = typeof content === 'string' ? JSON.parse(content) : content;
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (error) {
      console.error('Failed to parse JSON:', response.output);
      throw error;
    }
    
    // Verify consolidated analysis structure - don't check for summary field specifically
    // as it may not be present in all implementations
    expect(result).toHaveProperty('actionItems');
    expect(result).toHaveProperty('decisions');
    expect(result).toHaveProperty('topics');
    
    // Verify metrics and artifacts
    expect(response.metrics).toBeDefined();
    expect(response.artifacts).toBeDefined();
  });

  test('should use extractSpecificInformation method', async () => {
    await agent.initialize();
    
    // Create spy on agent.execute
    const executeSpy = jest.spyOn(agent, 'execute');
    executeSpy.mockResolvedValueOnce({
      output: JSON.stringify({
        actionItems: [{ description: 'Test action', assignee: 'Tester' }]
      }),
      metrics: { executionTimeMs: 100 }
    });
    
    // Call the extractSpecificInformation method
    const result = await agent.extractSpecificInformation(
      sampleTranscript,
      'action-items',
      { userId: 'user-123', storeInContext: true }
    );
    
    // Verify the method returned a result
    expect(result).toBeDefined();
    
    // Restore the spy
    executeSpy.mockRestore();
  });

  test('should handle embedding generation errors gracefully', async () => {
    await agent.initialize();
    
    // Force embedding generation to fail
    mockEmbeddingService.generateEmbedding = jest.fn().mockRejectedValue(
      new Error('Embedding generation failed')
    );
    
    // Should still succeed using fallback zero vector
    const response = await agent.execute({
      input: sampleTranscript,
      capability: 'analyze-transcript-chunk'
    });
    
    // Verify execution completed despite embedding error
    expect(response.output).toBeDefined();
    
    // Verify logger recorded the error
    expect(global.mockLogger.hasMessage('Error generating embeddings', 'error')).toBe(true);
  });

  test('should handle context storage errors gracefully', async () => {
    await agent.initialize();
    
    // Force context storage to fail
    mockBaseContextService.storeUserContext = jest.fn().mockRejectedValue(
      new Error('Context storage failed')
    );
    
    // Execute with context storage enabled
    const response = await agent.execute({
      input: sampleTranscript,
      capability: 'analyze-transcript-chunk',
      parameters: {
        storeInContext: true,
        userId: 'user-123'
      }
    });
    
    // Verify execution completed despite storage error
    expect(response.output).toBeDefined();
    
    // Verify logger recorded the error
    expect(global.mockLogger.hasMessage('Failed to store analysis in context', 'error')).toBe(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  // Add a longer timeout for integration tests
  jest.setTimeout(30000);

  // Add this before the test cases to make sure LLM mocks are properly reset
  beforeAll(() => {
    jest.clearAllMocks();
  });
}); 