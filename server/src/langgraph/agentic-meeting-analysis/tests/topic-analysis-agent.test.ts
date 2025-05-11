/**
 * Integration tests for the Topic Analysis Agent
 */
import { TopicAnalysisAgent } from '../agents/topic/topic-analysis-agent';
import { AgentExpertise, AnalysisGoalType, AnalysisTaskStatus } from '../interfaces/agent.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { OpenAIConnector } from '../../../connectors/openai-connector';
import { AgentConfigService } from '../../../shared/config/agent-config.service';

describe('TopicAnalysisAgent', () => {
  // Test configuration
  const useMockMode = process.env.TEST_USE_MOCK_MODE !== 'false';
  const logger = new ConsoleLogger();
  let agent: TopicAnalysisAgent;
  let openAiConnector: OpenAIConnector;
  
  beforeAll(() => {
    // Initialize configuration
    const configService = AgentConfigService.getInstance();
    configService.updateConfig({
      useMockMode,
      openai: {
        ...configService.getOpenAIConfig(),
        // Use a less expensive model for testing if not using mock mode
        modelName: useMockMode ? 'gpt-4o' : 'gpt-3.5-turbo'
      }
    });
    
    // Log test mode
    logger.info(`Running tests in ${useMockMode ? 'MOCK' : 'REAL API'} mode`);
    
    // Initialize the OpenAI connector
    openAiConnector = new OpenAIConnector({
      logger,
      modelConfig: configService.getOpenAIConfig()
    });
  });
  
  beforeEach(() => {
    // Create a new instance before each test
    agent = new TopicAnalysisAgent({
      name: 'Test Topic Analysis Agent',
      expertise: [AgentExpertise.TOPIC_ANALYSIS],
      capabilities: [AnalysisGoalType.EXTRACT_TOPICS],
      logger,
      openAiConnector,
      useMockMode
    });
  });
  
  afterEach(async () => {
    // Clean up after each test
    jest.clearAllMocks();
  });
  
  /**
   * Real LLM calls can get expensive, so only run these tests when specifically enabled
   */
  const testWithLLM = useMockMode ? test.skip : test;
  
  test('should initialize with correct properties', () => {
    expect(agent).toBeInstanceOf(TopicAnalysisAgent);
    expect(agent.id).toContain('topic-agent-');
    expect(agent.name).toBe('Test Topic Analysis Agent');
    expect(agent.expertise).toContain(AgentExpertise.TOPIC_ANALYSIS);
  });
  
  test('should process task in mock mode', async () => {
    // Create a test task
    const task = {
      id: 'test-task-1',
      type: AnalysisGoalType.EXTRACT_TOPICS,
      status: AnalysisTaskStatus.PENDING,
      priority: 1,
      created: Date.now(),
      updated: Date.now(),
      input: {
        transcript: {
          meetingId: 'test-meeting',
          rawText: `
          Sarah (CEO): Good morning everyone. Today we need to discuss the Q3 product roadmap and make some decisions about resource allocation.
          Michael (Product): I've analyzed user feedback from the last release. Users are asking for better mobile support and more intuitive UI.
          Jane (Engineering): My team can work on the mobile improvements, but we'll need to delay the API upgrade if we prioritize that.
          Sarah (CEO): What's the timeline impact if we delay the API work?
          Jane (Engineering): About 2 months, but mobile improvements could be delivered in 6 weeks.
          Michael (Product): Mobile should be our focus - metrics show 60% of users now access via mobile.
          Tom (Marketing): I agree with Michael. Our competitors are all mobile-first now, and we're falling behind.
          Sarah (CEO): Alright, let's prioritize mobile for Q3. Jane, please prepare a detailed plan by next week.
          `,
          segments: [
            { id: 'seg-1', speakerId: 'sarah', speakerName: 'Sarah (CEO)', content: 'Good morning everyone. Today we need to discuss the Q3 product roadmap and make some decisions about resource allocation.' },
            { id: 'seg-2', speakerId: 'michael', speakerName: 'Michael (Product)', content: "I've analyzed user feedback from the last release. Users are asking for better mobile support and more intuitive UI." },
            { id: 'seg-3', speakerId: 'jane', speakerName: 'Jane (Engineering)', content: "My team can work on the mobile improvements, but we'll need to delay the API upgrade if we prioritize that." }
          ]
        },
        metadata: {
          title: 'Q3 Planning Meeting',
          participants: [
            { id: 'sarah', name: 'Sarah', role: 'CEO' },
            { id: 'michael', name: 'Michael', role: 'Product Manager' },
            { id: 'jane', name: 'Jane', role: 'Engineering Lead' }
          ]
        }
      }
    };
    
    // Process the task
    const result = await agent.processTask(task);
    
    // Verify the result
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content.topics).toBeInstanceOf(Array);
    expect(result.confidence).toBeDefined();
    expect(result.reasoning).toBeDefined();
    
    // In mock mode, we know what the expected topics should be
    if (useMockMode) {
      expect(result.content.topics).toHaveLength(3);
      expect(result.content.topics[0].name).toBe('Product Roadmap');
    }
  });
  
  testWithLLM('should process task with real OpenAI', async () => {
    // This test only runs when useMockMode is false
    
    // Create a test task with a simple transcript
    const task = {
      id: 'test-task-2',
      type: AnalysisGoalType.EXTRACT_TOPICS,
      status: AnalysisTaskStatus.PENDING,
      priority: 1,
      created: Date.now(),
      updated: Date.now(),
      input: {
        transcript: {
          meetingId: 'test-meeting-real-api',
          rawText: `
          Alice: I think we should discuss the budget for the new project.
          Bob: Yes, and we also need to talk about the timeline.
          Charlie: I'm concerned about the resources we have available.
          Alice: Good point. Let's start with the budget first, then timeline, and finally resources.
          Bob: For the budget, I think we need at least $50,000 for the initial phase.
          Charlie: That seems reasonable. For timeline, can we complete it in 3 months?
          Alice: I think 4 months is more realistic given our current workload.
          Bob: Alright, 4 months it is. Now about resources - we'll need 2 developers and 1 designer.
          `,
          segments: [
            { id: 'seg-1', speakerId: 'alice', speakerName: 'Alice', content: 'I think we should discuss the budget for the new project.' },
            { id: 'seg-2', speakerId: 'bob', speakerName: 'Bob', content: 'Yes, and we also need to talk about the timeline.' },
            { id: 'seg-3', speakerId: 'charlie', speakerName: 'Charlie', content: "I'm concerned about the resources we have available." }
          ]
        },
        metadata: {
          title: 'Project Planning Meeting',
          participants: [
            { id: 'alice', name: 'Alice', role: 'Project Manager' },
            { id: 'bob', name: 'Bob', role: 'Finance' },
            { id: 'charlie', name: 'Charlie', role: 'Team Lead' }
          ]
        }
      }
    };
    
    // Process the task
    const result = await agent.processTask(task);
    
    // Verify the result structure
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content.topics).toBeInstanceOf(Array);
    expect(result.content.topics.length).toBeGreaterThan(0);
    expect(result.confidence).toBeDefined();
    expect(result.reasoning).toBeDefined();
    
    // Verify topic properties
    const firstTopic = result.content.topics[0];
    expect(firstTopic.id).toBeDefined();
    expect(firstTopic.name).toBeDefined();
    expect(firstTopic.description).toBeDefined();
    expect(firstTopic.relevance).toBeGreaterThanOrEqual(0);
    expect(firstTopic.relevance).toBeLessThanOrEqual(1);
    
    // Log token usage
    const tokenUsage = agent.getTokenUsage();
    logger.info('Token usage for real API call:', tokenUsage);
  });
  
  test('should reject invalid task types', async () => {
    // Create a task with an invalid type
    const invalidTask = {
      id: 'test-task-invalid',
      type: AnalysisGoalType.ANALYZE_SENTIMENT, // Not a topic analysis task
      status: AnalysisTaskStatus.PENDING,
      priority: 1,
      created: Date.now(),
      updated: Date.now(),
      input: {
        transcript: {
          meetingId: 'test-meeting',
          rawText: 'This is a test meeting transcript.'
        }
      }
    };
    
    // Attempt to process the task
    await expect(agent.processTask(invalidTask)).rejects.toThrow();
  });
  
  test('should handle missing transcript data', async () => {
    // Create a task without transcript data
    const invalidTask = {
      id: 'test-task-missing-data',
      type: AnalysisGoalType.EXTRACT_TOPICS,
      status: AnalysisTaskStatus.PENDING,
      priority: 1,
      created: Date.now(),
      updated: Date.now(),
      input: {} // No transcript
    };
    
    // Attempt to process the task
    await expect(agent.processTask(invalidTask)).rejects.toThrow('Meeting transcript not found');
  });
}); 