import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { BaseAgent } from '../base/base-agent.ts';
import { AgentRequest, AgentResponse } from '../interfaces/agent.interface.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { MeetingContextService } from '../../shared/user-context/services/meeting-context.service.ts';
import { OpenAIAdapter } from '../adapters/openai-adapter.ts';
import { EmbeddingService } from '../../shared/embedding/embedding.service.ts';
import { ContextType } from '../../shared/user-context/types/context.types.ts';
import { v4 as uuidv4 } from 'uuid';

export interface MeetingAnalysisResult {
  summary: string;
  decisions: {
    id: string;
    text: string;
    summary?: string;
  }[];
  actionItems: {
    id: string;
    text: string;
    assignee: string;
    dueDate?: number;
  }[];
  questions: {
    id: string;
    text: string;
    isAnswered: boolean;
    answerContextId?: string;
  }[];
  keyTopics: string[];
  sentimentAnalysis?: {
    overall: 'positive' | 'neutral' | 'negative';
    participantSentiments?: Record<string, 'positive' | 'neutral' | 'negative'>;
  };
  participantStats?: {
    speakingTime: Record<string, number>;
    contributionCount: Record<string, number>;
  };
}

/**
 * MeetingAnalysisAgent
 * Specialized agent that analyzes meeting transcripts and extracts key information
 */
export class MeetingAnalysisAgent extends BaseAgent {
  private meetingContextService: MeetingContextService;
  private embeddingService: EmbeddingService;

  constructor(
    options: {
      name?: string;
      description?: string;
      id?: string;
      logger?: Logger;
      openaiAdapter?: OpenAIAdapter;
      meetingContextService?: MeetingContextService;
      embeddingService?: EmbeddingService;
    } = {},
  ) {
    super(
      options.name || 'Meeting Analysis Agent',
      options.description ||
        'Analyzes meeting transcripts and extracts key information',
      {
        id: options.id,
        logger: options.logger,
        openaiAdapter: options.openaiAdapter,
      },
    );

    this.meetingContextService =
      options.meetingContextService || new MeetingContextService();

    // Use provided embedding service or create a new one with the OpenAI adapter
    if (options.embeddingService) {
      this.embeddingService = options.embeddingService;
    } else if (options.openaiAdapter) {
      this.embeddingService = new EmbeddingService(
        options.openaiAdapter,
        this.logger,
      );
    } else {
      this.embeddingService = new EmbeddingService({} as any, this.logger);
      this.logger.warn(
        'No embeddingService or openaiAdapter provided, embedding functionality will be limited',
      );
    }

    // Register capabilities
    this.registerCapability({
      name: 'analyze_meeting',
      description: 'Analyzes a meeting transcript and extracts key information',
      parameters: {
        meetingId: 'Unique identifier for the meeting',
        transcript: 'Meeting transcript text',
        meetingTitle: 'Title of the meeting',
        participantIds: 'IDs of meeting participants',
        meetingStartTime: 'Start time of the meeting (timestamp)',
        meetingEndTime: 'End time of the meeting (timestamp)',
      },
    });

    this.registerCapability({
      name: 'extract_action_items',
      description: 'Extracts action items from a meeting transcript',
      parameters: {
        meetingId: 'Unique identifier for the meeting',
        transcript: 'Meeting transcript text or segment',
      },
    });

    this.registerCapability({
      name: 'extract_decisions',
      description: 'Extracts decisions from a meeting transcript',
      parameters: {
        meetingId: 'Unique identifier for the meeting',
        transcript: 'Meeting transcript text or segment',
      },
    });

    this.registerCapability({
      name: 'extract_questions',
      description: 'Extracts questions from a meeting transcript',
      parameters: {
        meetingId: 'Unique identifier for the meeting',
        transcript: 'Meeting transcript text or segment',
      },
    });

    this.registerCapability({
      name: 'summarize_meeting',
      description: 'Generates a summary of a meeting',
      parameters: {
        meetingId: 'Unique identifier for the meeting',
        transcript: 'Meeting transcript text',
        maxLength: 'Maximum length of the summary in characters',
      },
    });

    // Don't auto-initialize to allow for testing with mocks
    // this.initialize();
  }

  /**
   * Initialize the agent with runtime configuration
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    try {
      // Set the agent state to initializing
      this.setState({ status: 'initializing' });

      // Only initialize openAI adapter if it exists and has an initialize method
      if (
        this.openaiAdapter &&
        typeof this.openaiAdapter.initialize === 'function'
      ) {
        try {
          await this.openaiAdapter.initialize();
        } catch (error) {
          this.logger.error('Failed to initialize OpenAI adapter', {
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue initialization despite OpenAI adapter failure
        }
      }

      // Mark the agent as initialized
      this.isInitialized = true;
      this.setState({ status: 'ready' });

      this.logger.info('Meeting Analysis Agent initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Meeting Analysis Agent', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.setState({ status: 'error' });
      throw error;
    }
  }

  /**
   * Implementation of abstract execute method
   */
  protected async executeInternal(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const capability = request.capability || 'analyze_meeting';

    if (!this.canHandle(capability)) {
      throw new Error(`Capability not supported: ${capability}`);
    }

    const userId = request.context?.userId;
    if (!userId) {
      throw new Error('User ID is required');
    }

    try {
      switch (capability) {
        case 'analyze_meeting':
          return await this.analyzeMeeting(userId, request.parameters || {});

        case 'extract_action_items':
          return await this.extractActionItems(
            userId,
            request.parameters || {},
          );

        case 'extract_decisions':
          return await this.extractDecisions(userId, request.parameters || {});

        case 'extract_questions':
          return await this.extractQuestions(userId, request.parameters || {});

        case 'summarize_meeting':
          return await this.summarizeMeeting(userId, request.parameters || {});

        default:
          throw new Error(`Unsupported capability: ${capability}`);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`Error in MeetingAnalysisAgent: ${errorMessage}`, {
        userId,
        capability,
      });
      throw error;
    }
  }

  /**
   * Generate embeddings for a text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    return await this.embeddingService.generateEmbedding(text);
  }

  /**
   * Analyze a meeting transcript and extract all key information
   */
  private async analyzeMeeting(
    userId: string,
    parameters: Record<string, any>,
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    if (!parameters?.transcript) {
      throw new Error('Meeting transcript is required');
    }

    if (!parameters?.meetingId) {
      throw new Error('Meeting ID is required');
    }

    const meetingId = parameters.meetingId;
    const transcript = parameters.transcript;
    const meetingTitle = parameters.meetingTitle || `Meeting ${meetingId}`;
    const participantIds = parameters.participantIds || [];
    const meetingStartTime = parameters.meetingStartTime || Date.now();
    const meetingEndTime = parameters.meetingEndTime || Date.now();

    // Generate embedding for the transcript
    const transcriptEmbeddings =
      await this.embeddingService.generateEmbedding(transcript);

    // Store the meeting content in the database
    await this.meetingContextService.storeMeetingContent(
      userId,
      meetingId,
      meetingTitle,
      transcript,
      transcriptEmbeddings,
      participantIds,
      meetingStartTime,
      meetingEndTime,
    );

    // Process the transcript to extract key information
    const analysisPrompt = `
    You are an AI assistant tasked with analyzing a meeting transcript.
    Extract the following information:
    1. A concise summary (max 3 paragraphs)
    2. All decisions made during the meeting
    3. All action items, including who they are assigned to
    4. Any questions that were asked but not answered
    5. Key topics discussed
    6. Overall sentiment analysis

    For each action item, include the assignee name and any mentioned due date.
    For each decision, provide the specific decision text.
    For unanswered questions, list the question text.

    Format your response as JSON with the following structure:
    {
      "summary": "Meeting summary text",
      "decisions": [{"text": "Decision text", "summary": "Brief decision summary"}],
      "actionItems": [{"text": "Action item text", "assignee": "Assignee name", "dueDate": "Due date (if mentioned)"}],
      "questions": [{"text": "Question text", "isAnswered": false}],
      "keyTopics": ["Topic 1", "Topic 2"],
      "sentimentAnalysis": {"overall": "positive/neutral/negative"}
    }

    Transcript:
    ${transcript}
    `;

    if (!this.openaiAdapter) {
      throw new Error('OpenAI adapter is required for meeting analysis');
    }

    // Call the LLM to analyze the meeting
    const llmResponse = await this.openaiAdapter.generateChatCompletion([
      { role: 'user', content: analysisPrompt },
    ]);

    if (!llmResponse) {
      throw new Error('Failed to analyze meeting transcript');
    }

    let analysisResult: MeetingAnalysisResult;
    try {
      analysisResult = JSON.parse(llmResponse);
    } catch (e) {
      this.logger.error('Failed to parse meeting analysis result', {
        error: e instanceof Error ? e.message : String(e),
        content: llmResponse,
      });
      throw new Error('Failed to parse meeting analysis result');
    }

    // Store extracted data in the context database
    await this.storeExtractedMeetingData(userId, meetingId, analysisResult);

    return {
      output: JSON.stringify(analysisResult),
      artifacts: {
        result: analysisResult,
        meetingId,
        meetingTitle,
        analysisTimestamp: Date.now(),
        participantCount: participantIds.length,
      },
      metrics: this.processMetrics(startTime, undefined, 1),
    };
  }

  /**
   * Store the extracted meeting data in the context database
   */
  private async storeExtractedMeetingData(
    userId: string,
    meetingId: string,
    analysisResult: MeetingAnalysisResult,
  ): Promise<void> {
    // Store decisions
    for (const decision of analysisResult.decisions) {
      const decisionId = decision.id || uuidv4();
      const decisionEmbedding = await this.generateEmbedding(decision.text);

      await this.meetingContextService.storeDecision(
        userId,
        meetingId,
        decisionId,
        decision.text,
        decision.summary || null,
        decisionEmbedding,
      );
    }

    // Store action items
    for (const actionItem of analysisResult.actionItems) {
      const actionItemId = actionItem.id || uuidv4();
      const actionItemEmbedding = await this.generateEmbedding(actionItem.text);

      await this.meetingContextService.storeActionItem(
        userId,
        meetingId,
        actionItemId,
        actionItem.text,
        actionItem.assignee,
        actionItem.dueDate || null,
        actionItemEmbedding,
      );
    }

    // Store questions
    for (const question of analysisResult.questions) {
      const questionId = question.id || uuidv4();
      const questionEmbedding = await this.generateEmbedding(question.text);

      await this.meetingContextService.storeQuestion(
        userId,
        meetingId,
        questionId,
        question.text,
        questionEmbedding,
        question.isAnswered,
        question.answerContextId,
      );
    }
  }

  /**
   * Extract action items from a meeting transcript
   */
  private async extractActionItems(
    userId: string,
    parameters: Record<string, any>,
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    if (!parameters?.transcript) {
      throw new Error('Meeting transcript is required');
    }

    if (!parameters?.meetingId) {
      throw new Error('Meeting ID is required');
    }

    const meetingId = parameters.meetingId;
    const transcript = parameters.transcript;

    const prompt = `
    Extract all action items from the following meeting transcript.
    For each action item, identify:
    1. The action to be taken
    2. Who is assigned to do it
    3. Any due date or timeline mentioned
    
    Format your response as JSON with the following structure:
    [
      {
        "text": "Full action item text",
        "assignee": "Name of person assigned",
        "dueDate": "Due date (if mentioned, in natural language)"
      }
    ]

    Transcript:
    ${transcript}
    `;

    if (!this.openaiAdapter) {
      throw new Error('OpenAI adapter is required for action item extraction');
    }

    const llmResponse = await this.openaiAdapter.generateChatCompletion([
      { role: 'user', content: prompt },
    ]);

    if (!llmResponse) {
      throw new Error('Failed to extract action items');
    }

    let actionItems = [];
    try {
      actionItems = JSON.parse(llmResponse);
    } catch (e) {
      throw new Error('Failed to parse action items extraction result');
    }

    // Store the extracted action items
    for (const item of actionItems) {
      const actionItemId = uuidv4();
      const embedding = await this.generateEmbedding(item.text);

      // Convert date string to timestamp if present
      let dueDate = null;
      if (item.dueDate) {
        try {
          dueDate = new Date(item.dueDate).getTime();
        } catch (e) {
          // If we can't parse the date, leave it as null
          this.logger.warn(`Could not parse due date: ${item.dueDate}`);
        }
      }

      await this.meetingContextService.storeActionItem(
        userId,
        meetingId,
        actionItemId,
        item.text,
        item.assignee,
        dueDate,
        embedding,
      );
    }

    return {
      output: JSON.stringify(actionItems),
      artifacts: {
        result: actionItems,
        meetingId,
        actionItemCount: actionItems.length,
      },
      metrics: this.processMetrics(startTime, undefined, 1),
    };
  }

  /**
   * Extract decisions from a meeting transcript
   */
  private async extractDecisions(
    userId: string,
    parameters: Record<string, any>,
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    if (!parameters?.transcript) {
      throw new Error('Meeting transcript is required');
    }

    if (!parameters?.meetingId) {
      throw new Error('Meeting ID is required');
    }

    const meetingId = parameters.meetingId;
    const transcript = parameters.transcript;

    const prompt = `
    Extract all decisions made during the following meeting transcript.
    For each decision, provide:
    1. The complete decision text
    2. A brief one-sentence summary of the decision
    
    Format your response as JSON with the following structure:
    [
      {
        "text": "Full decision text",
        "summary": "Brief decision summary"
      }
    ]

    Transcript:
    ${transcript}
    `;

    if (!this.openaiAdapter) {
      throw new Error('OpenAI adapter is required for decision extraction');
    }

    const llmResponse = await this.openaiAdapter.generateChatCompletion([
      { role: 'user', content: prompt },
    ]);

    if (!llmResponse) {
      throw new Error('Failed to extract decisions');
    }

    let decisions = [];
    try {
      decisions = JSON.parse(llmResponse);
    } catch (e) {
      throw new Error('Failed to parse decisions extraction result');
    }

    // Store the extracted decisions
    for (const decision of decisions) {
      const decisionId = uuidv4();
      const embedding = await this.generateEmbedding(decision.text);

      await this.meetingContextService.storeDecision(
        userId,
        meetingId,
        decisionId,
        decision.text,
        decision.summary,
        embedding,
      );
    }

    return {
      output: JSON.stringify(decisions),
      artifacts: {
        result: decisions,
        meetingId,
        decisionCount: decisions.length,
      },
      metrics: this.processMetrics(startTime, undefined, 1),
    };
  }

  /**
   * Extract questions from a meeting transcript
   */
  private async extractQuestions(
    userId: string,
    parameters: Record<string, any>,
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    if (!parameters?.transcript) {
      throw new Error('Meeting transcript is required');
    }

    if (!parameters?.meetingId) {
      throw new Error('Meeting ID is required');
    }

    const meetingId = parameters.meetingId;
    const transcript = parameters.transcript;

    const prompt = `
    Extract all questions asked during the following meeting transcript.
    For each question, determine if it was answered during the meeting.
    
    Format your response as JSON with the following structure:
    [
      {
        "text": "Question text",
        "isAnswered": true/false
      }
    ]

    Transcript:
    ${transcript}
    `;

    if (!this.openaiAdapter) {
      throw new Error('OpenAI adapter is required for question extraction');
    }

    const llmResponse = await this.openaiAdapter.generateChatCompletion([
      { role: 'user', content: prompt },
    ]);

    if (!llmResponse) {
      throw new Error('Failed to extract questions');
    }

    let questions = [];
    try {
      questions = JSON.parse(llmResponse);
    } catch (e) {
      throw new Error('Failed to parse questions extraction result');
    }

    // Store the extracted questions
    for (const question of questions) {
      const questionId = uuidv4();
      const embedding = await this.generateEmbedding(question.text);

      await this.meetingContextService.storeQuestion(
        userId,
        meetingId,
        questionId,
        question.text,
        embedding,
        question.isAnswered,
      );
    }

    return {
      output: JSON.stringify(questions),
      artifacts: {
        result: questions,
        meetingId,
        questionCount: questions.length,
        unansweredCount: questions.filter((q: any) => !q.isAnswered).length,
      },
      metrics: this.processMetrics(startTime, undefined, 1),
    };
  }

  /**
   * Generate a summary of a meeting
   */
  private async summarizeMeeting(
    userId: string,
    parameters: Record<string, any>,
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    if (!parameters?.transcript) {
      throw new Error('Meeting transcript is required');
    }

    if (!parameters?.meetingId) {
      throw new Error('Meeting ID is required');
    }

    const meetingId = parameters.meetingId;
    const transcript = parameters.transcript;
    const maxLength = parameters.maxLength || 1500;

    const prompt = `
    Summarize the following meeting transcript in a concise, informative way.
    Focus on the main topics discussed, key decisions made, and important action items.
    Include the most important points and insights from the meeting.
    Keep the summary under ${maxLength} characters.

    Transcript:
    ${transcript}
    `;

    if (!this.openaiAdapter) {
      throw new Error('OpenAI adapter is required for meeting summarization');
    }

    const llmResponse = await this.openaiAdapter.generateChatCompletion([
      { role: 'user', content: prompt },
    ]);

    if (!llmResponse) {
      throw new Error('Failed to summarize meeting');
    }

    const summary = llmResponse;

    // Store the summary as meeting context metadata
    // First generate embedding for the summary
    const summaryEmbedding = await this.generateEmbedding(summary);

    // Create a meeting summary record
    await this.meetingContextService.storeMeetingContent(
      userId,
      `${meetingId}-summary`,
      `Summary: ${parameters.meetingTitle || `Meeting ${meetingId}`}`,
      summary,
      summaryEmbedding,
      [],
      undefined,
      undefined,
      {
        isSummary: true,
        originalMeetingId: meetingId,
        contextType: ContextType.MEETING,
      },
    );

    return {
      output: summary,
      artifacts: {
        result: summary,
        meetingId,
        summaryLength: summary.length,
        timestamp: Date.now(),
      },
      metrics: this.processMetrics(startTime, undefined, 1),
    };
  }
}
