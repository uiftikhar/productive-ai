import { MeetingAnalysisAgent } from '../meeting-analysis-agent';
import { AgentRequest } from '../../interfaces/agent.interface';
import { MeetingContextService } from '../../../shared/user-context/services/meeting-context.service';
import { OpenAIAdapter } from '../../adapters/openai-adapter';
import { EmbeddingService } from '../../../shared/embedding/embedding.service';
import { BaseMessage } from '@langchain/core/messages';

jest.mock('../../../shared/user-context/services/meeting-context.service');
jest.mock('../../adapters/openai-adapter');
jest.mock('../../../shared/embedding/embedding.service');

describe('MeetingAnalysisAgent', () => {
  let agent: MeetingAnalysisAgent;
  let mockMeetingContextService: jest.Mocked<MeetingContextService>;
  let mockOpenAIAdapter: jest.Mocked<OpenAIAdapter>;
  let mockEmbeddingService: jest.Mocked<EmbeddingService>;

  const sampleMeetingId = 'meeting-123';
  const sampleUserId = 'user-456';
  const sampleTranscript = `
    John: Good morning everyone, let's start the weekly planning meeting.
    Sarah: Hi John. Before we begin, I want to update everyone on the client project.
    John: Great, go ahead.
    Sarah: We've completed the first phase of the project. The client is happy with the results.
    David: That's good news. When do we start the second phase?
    Sarah: We should start next week. I'll need John and Emma for this phase.
    Emma: I'm available starting Tuesday. What's the timeline for phase two?
    Sarah: We have approximately three weeks to complete it.
    John: Great. Let's make a decision on the technology stack for phase two.
    David: I suggest we continue with the same stack as phase one for consistency.
    John: Does everyone agree?
    Sarah: Yes, I agree.
    Emma: Agreed.
    John: Okay, decision made. We'll use the same tech stack for phase two.
    David: What about the budget concerns from last meeting?
    Sarah: I've spoken with finance. They've approved our request for additional resources.
    John: Excellent. So our action items are: Emma and I will start working on phase two on Tuesday.
    Sarah: And I'll prepare the documentation by Friday.
    David: I'll coordinate with the client for a progress meeting next Thursday.
    John: Any questions before we end?
    Emma: Will we be getting any assistance from the design team?
    Sarah: I'm not sure yet. I'll check and get back to you.
    John: Anything else? No? Then we're done for today. Thanks everyone.
  `;

  const sampleAnalysisResult = {
    summary:
      "The team held their weekly planning meeting, discussing the client project's progress. They've completed phase one successfully, with the client expressing satisfaction. The team decided to maintain the same technology stack for phase two, which will start next week with John and Emma leading development. Sarah will handle documentation, while David will coordinate with the client. The finance department has approved their request for additional resources.",
    decisions: [
      {
        id: 'decision-1',
        text: "We'll use the same tech stack for phase two as we used in phase one for consistency.",
        summary: 'Maintain same technology stack for phase two',
      },
    ],
    actionItems: [
      {
        id: 'action-1',
        text: 'Emma and John will start working on phase two on Tuesday',
        assignee: 'Emma and John',
        dueDate: new Date().getTime() + 86400000 * 2, // 2 days from now
      },
      {
        id: 'action-2',
        text: 'Sarah will prepare the documentation by Friday',
        assignee: 'Sarah',
        dueDate: new Date().getTime() + 86400000 * 5, // 5 days from now
      },
      {
        id: 'action-3',
        text: 'David will coordinate with the client for a progress meeting next Thursday',
        assignee: 'David',
        dueDate: new Date().getTime() + 86400000 * 7, // 7 days from now
      },
    ],
    questions: [
      {
        id: 'question-1',
        text: 'Will we be getting any assistance from the design team?',
        isAnswered: false,
      },
    ],
    keyTopics: [
      'Client project phase one completion',
      'Phase two planning',
      'Technology stack decision',
      'Budget approval',
      'Team assignments',
    ],
    sentimentAnalysis: {
      overall: 'positive',
    },
  };

  beforeEach(async () => {
    mockMeetingContextService =
      new MeetingContextService() as jest.Mocked<MeetingContextService>;
    mockOpenAIAdapter = new OpenAIAdapter() as jest.Mocked<OpenAIAdapter>;

    // Create the EmbeddingService with a mock OpenAIAdapter
    const mockAdapter = {} as any; // Use 'any' type to bypass the type-checking for the mock
    mockEmbeddingService = new EmbeddingService(
      mockAdapter,
    ) as jest.Mocked<EmbeddingService>;

    // Setup mocks
    mockEmbeddingService.generateEmbedding = jest
      .fn()
      .mockResolvedValue([0.1, 0.2, 0.3]);

    mockOpenAIAdapter.generateChatCompletion = jest
      .fn()
      .mockResolvedValue(JSON.stringify(sampleAnalysisResult));

    mockMeetingContextService.storeMeetingContent = jest
      .fn()
      .mockResolvedValue(undefined);
    mockMeetingContextService.storeDecision = jest
      .fn()
      .mockResolvedValue(undefined);
    mockMeetingContextService.storeActionItem = jest
      .fn()
      .mockResolvedValue(undefined);
    mockMeetingContextService.storeQuestion = jest
      .fn()
      .mockResolvedValue(undefined);

    // Mock the initialize method to avoid external dependencies
    mockOpenAIAdapter.initialize = jest.fn().mockResolvedValue(undefined);

    agent = new MeetingAnalysisAgent({
      meetingContextService: mockMeetingContextService,
      openaiAdapter: mockOpenAIAdapter,
      embeddingService: mockEmbeddingService,
    });

    // Explicitly initialize the agent before testing
    await agent.initialize();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default values', async () => {
    const defaultAgent = new MeetingAnalysisAgent();
    await defaultAgent.initialize(); // Explicitly initialize
    expect(defaultAgent).toBeDefined();
    expect(defaultAgent['name']).toBe('Meeting Analysis Agent');
  });

  it('should register all required capabilities', () => {
    const capabilities = agent.getCapabilities();
    expect(capabilities).toHaveLength(5);

    const capabilityNames = capabilities.map((c) => c.name);
    expect(capabilityNames).toContain('analyze_meeting');
    expect(capabilityNames).toContain('extract_action_items');
    expect(capabilityNames).toContain('extract_decisions');
    expect(capabilityNames).toContain('extract_questions');
    expect(capabilityNames).toContain('summarize_meeting');
  });

  it('should analyze a meeting transcript', async () => {
    const request: AgentRequest = {
      input: sampleTranscript,
      capability: 'analyze_meeting',
      parameters: {
        meetingId: sampleMeetingId,
        transcript: sampleTranscript,
        meetingTitle: 'Weekly Planning',
        participantIds: ['user-john', 'user-sarah', 'user-david', 'user-emma'],
        meetingStartTime: Date.now() - 3600000,
        meetingEndTime: Date.now(),
      },
      context: {
        userId: sampleUserId,
      },
    };

    const response = await agent.execute(request);

    // Check the correct services were called
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
      sampleTranscript,
    );
    expect(mockOpenAIAdapter.generateChatCompletion).toHaveBeenCalled();
    expect(mockMeetingContextService.storeMeetingContent).toHaveBeenCalledWith(
      sampleUserId,
      sampleMeetingId,
      'Weekly Planning',
      sampleTranscript,
      [0.1, 0.2, 0.3],
      ['user-john', 'user-sarah', 'user-david', 'user-emma'],
      expect.any(Number),
      expect.any(Number),
    );

    // Verify the response structure (using artifacts instead of result/metadata)
    expect(response.output).toBeTruthy();
    expect(response.artifacts).toBeTruthy();
    if (response.artifacts) {
      expect(response.artifacts.result).toEqual(sampleAnalysisResult);
      expect(response.artifacts.meetingId).toBe(sampleMeetingId);
      expect(response.artifacts.meetingTitle).toBe('Weekly Planning');
      expect(response.artifacts.participantCount).toBe(4);
    }
  });

  it('should extract action items from a meeting transcript', async () => {
    mockOpenAIAdapter.generateChatCompletion = jest
      .fn()
      .mockResolvedValue(JSON.stringify(sampleAnalysisResult.actionItems));

    const request: AgentRequest = {
      input: sampleTranscript,
      capability: 'extract_action_items',
      parameters: {
        meetingId: sampleMeetingId,
        transcript: sampleTranscript,
      },
      context: {
        userId: sampleUserId,
      },
    };

    const response = await agent.execute(request);

    // Check the correct methods were called
    expect(mockOpenAIAdapter.generateChatCompletion).toHaveBeenCalled();
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(3); // Once for each action item
    expect(mockMeetingContextService.storeActionItem).toHaveBeenCalledTimes(3);

    // Verify the response structure using artifacts
    expect(response.output).toBeTruthy();
    expect(response.artifacts).toBeTruthy();
    if (response.artifacts) {
      expect(response.artifacts.result).toEqual(
        sampleAnalysisResult.actionItems,
      );
      expect(response.artifacts.meetingId).toBe(sampleMeetingId);
      expect(response.artifacts.actionItemCount).toBe(3);
    }
  });

  it('should extract decisions from a meeting transcript', async () => {
    mockOpenAIAdapter.generateChatCompletion = jest
      .fn()
      .mockResolvedValue(JSON.stringify(sampleAnalysisResult.decisions));

    const request: AgentRequest = {
      input: sampleTranscript,
      capability: 'extract_decisions',
      parameters: {
        meetingId: sampleMeetingId,
        transcript: sampleTranscript,
      },
      context: {
        userId: sampleUserId,
      },
    };

    const response = await agent.execute(request);

    // Check the correct methods were called
    expect(mockOpenAIAdapter.generateChatCompletion).toHaveBeenCalled();
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1); // Once for the single decision
    expect(mockMeetingContextService.storeDecision).toHaveBeenCalledTimes(1);

    // Verify the response structure using artifacts
    expect(response.output).toBeTruthy();
    expect(response.artifacts).toBeTruthy();
    if (response.artifacts) {
      expect(response.artifacts.result).toEqual(sampleAnalysisResult.decisions);
      expect(response.artifacts.meetingId).toBe(sampleMeetingId);
      expect(response.artifacts.decisionCount).toBe(1);
    }
  });

  it('should extract questions from a meeting transcript', async () => {
    mockOpenAIAdapter.generateChatCompletion = jest
      .fn()
      .mockResolvedValue(JSON.stringify(sampleAnalysisResult.questions));

    const request: AgentRequest = {
      input: sampleTranscript,
      capability: 'extract_questions',
      parameters: {
        meetingId: sampleMeetingId,
        transcript: sampleTranscript,
      },
      context: {
        userId: sampleUserId,
      },
    };

    const response = await agent.execute(request);

    // Check the correct methods were called
    expect(mockOpenAIAdapter.generateChatCompletion).toHaveBeenCalled();
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1); // Once for the single question
    expect(mockMeetingContextService.storeQuestion).toHaveBeenCalledTimes(1);

    // Verify the response structure using artifacts
    expect(response.output).toBeTruthy();
    expect(response.artifacts).toBeTruthy();
    if (response.artifacts) {
      expect(response.artifacts.result).toEqual(sampleAnalysisResult.questions);
      expect(response.artifacts.meetingId).toBe(sampleMeetingId);
      expect(response.artifacts.questionCount).toBe(1);
      expect(response.artifacts.unansweredCount).toBe(1);
    }
  });

  it('should summarize a meeting transcript', async () => {
    mockOpenAIAdapter.generateChatCompletion = jest
      .fn()
      .mockResolvedValue(sampleAnalysisResult.summary);

    const request: AgentRequest = {
      input: sampleTranscript,
      capability: 'summarize_meeting',
      parameters: {
        meetingId: sampleMeetingId,
        transcript: sampleTranscript,
        maxLength: 500,
      },
      context: {
        userId: sampleUserId,
      },
    };

    const response = await agent.execute(request);

    // Check the correct methods were called
    expect(mockOpenAIAdapter.generateChatCompletion).toHaveBeenCalled();
    expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(1);
    expect(mockMeetingContextService.storeMeetingContent).toHaveBeenCalledTimes(
      1,
    );

    // Verify the response structure using artifacts
    expect(response.output).toBeTruthy();
    expect(response.artifacts).toBeTruthy();
    if (response.artifacts) {
      expect(response.artifacts.result).toBe(sampleAnalysisResult.summary);
      expect(response.artifacts.meetingId).toBe(sampleMeetingId);
      expect(response.artifacts.summaryLength).toBeDefined();
      expect(response.artifacts.timestamp).toBeDefined();
    }
  });

  it('should throw an error when capability is not supported', async () => {
    const request: AgentRequest = {
      input: 'test',
      capability: 'unsupported_capability',
      parameters: {},
      context: {
        userId: sampleUserId,
      },
    };

    const response = await agent.execute(request);
    // Check that the error is contained in the response
    expect(response.artifacts?.error?.message).toContain(
      'cannot handle capability: unsupported_capability',
    );
  });

  it('should throw an error when userId is missing', async () => {
    const request: AgentRequest = {
      input: sampleTranscript,
      capability: 'analyze_meeting',
      parameters: {
        meetingId: sampleMeetingId,
        transcript: sampleTranscript,
      },
      context: {}, // Missing userId
    };

    const response = await agent.execute(request);
    // Check that the error is contained in the response
    expect(response.artifacts?.error?.message).toBe('User ID is required');
  });

  it('should throw an error when meeting transcript is missing', async () => {
    const request: AgentRequest = {
      input: '',
      capability: 'analyze_meeting',
      parameters: {
        meetingId: sampleMeetingId,
        // Missing transcript
      },
      context: {
        userId: sampleUserId,
      },
    };

    const response = await agent.execute(request);
    // Check that the error is contained in the response
    expect(response.artifacts?.error?.message).toBe(
      'Meeting transcript is required',
    );
  });

  it('should throw an error when meetingId is missing', async () => {
    const request: AgentRequest = {
      input: sampleTranscript,
      capability: 'analyze_meeting',
      parameters: {
        // Missing meetingId
        transcript: sampleTranscript,
      },
      context: {
        userId: sampleUserId,
      },
    };

    const response = await agent.execute(request);
    // Check that the error is contained in the response
    expect(response.artifacts?.error?.message).toBe('Meeting ID is required');
  });
});
