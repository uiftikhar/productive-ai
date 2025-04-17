import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { BaseAgent } from '../base/base-agent';
import { AgentRequest, AgentResponse } from '../interfaces/agent.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { MeetingContextService } from '../../shared/user-context/services/meeting-context.service';
import { OpenAIAdapter } from '../adapters/openai-adapter';
import { EmbeddingService } from '../../shared/embedding/embedding.service';
import { ContextType } from '../../shared/user-context/types/context.types';
import { v4 as uuidv4 } from 'uuid';
import {
  RagPromptManager,
  RagRetrievalStrategy,
} from '../../shared/services/rag-prompt-manager.service';
import { splitTranscript } from '../../shared/utils/split-transcript';
import { SystemRole, SystemRoleEnum } from '../../shared/prompts/prompt-types';
import {
  InstructionTemplateName,
  InstructionTemplateNameEnum,
} from '../../shared/prompts/instruction-templates';
import { MessageConfig } from '../adapters/language-model-adapter.interface';

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
  private ragPromptManager: RagPromptManager;

  constructor(
    options: {
      name?: string;
      description?: string;
      id?: string;
      logger?: Logger;
      openaiAdapter?: OpenAIAdapter;
      meetingContextService?: MeetingContextService;
      embeddingService?: EmbeddingService;
      ragPromptManager?: RagPromptManager;
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

    // Initialize RAG prompt manager
    this.ragPromptManager = options.ragPromptManager || new RagPromptManager();

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
        previousMeetingIds:
          'IDs of related previous meetings to provide context',
      },
    });

    this.registerCapability({
      name: 'extract_action_items',
      description: 'Extracts action items from a meeting transcript',
      parameters: {
        meetingId: 'Unique identifier for the meeting',
        transcript: 'Meeting transcript text or segment',
        previousMeetingIds:
          'IDs of related previous meetings to provide context',
      },
    });

    this.registerCapability({
      name: 'extract_decisions',
      description: 'Extracts decisions from a meeting transcript',
      parameters: {
        meetingId: 'Unique identifier for the meeting',
        transcript: 'Meeting transcript text or segment',
        previousMeetingIds:
          'IDs of related previous meetings to provide context',
      },
    });

    this.registerCapability({
      name: 'extract_questions',
      description: 'Extracts questions from a meeting transcript',
      parameters: {
        meetingId: 'Unique identifier for the meeting',
        transcript: 'Meeting transcript text or segment',
        previousMeetingIds:
          'IDs of related previous meetings to provide context',
      },
    });

    this.registerCapability({
      name: 'summarize_meeting',
      description: 'Generates a summary of a meeting',
      parameters: {
        meetingId: 'Unique identifier for the meeting',
        transcript: 'Meeting transcript text',
        maxLength: 'Maximum length of the summary in characters',
        previousMeetingIds:
          'IDs of related previous meetings to provide context',
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
   * Updated to use RAG prompt manager instead of hardcoded prompts
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
    const previousMeetingIds = parameters.previousMeetingIds || [];

    try {
      // Generate embedding for the transcript - the embedding service now handles large texts
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

      // Split transcript into manageable chunks
      const chunks = splitTranscript(transcript, 2000, 3);
      const partialAnalyses: string[] = [];

      // Process each chunk with RAG context
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        this.logger.info(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`);

        // Create RAG context options with previous meetings as context
        const contextOptions = {
          userId,
          queryText: chunk,
          // Use the transcript embeddings for all chunks to maintain consistency
          queryEmbedding: transcriptEmbeddings,
          strategy: RagRetrievalStrategy.HYBRID,
          maxItems: 3,
          documentIds: previousMeetingIds,
          contentTypes: [
            ContextType.MEETING,
            ContextType.DECISION,
            ContextType.ACTION_ITEM,
          ],
        };

        // Generate prompt using RAG prompt manager
        const ragPrompt = await this.ragPromptManager.createRagPrompt(
          SystemRoleEnum.ASSISTANT,
          InstructionTemplateNameEnum.MEETING_ANALYSIS_CHUNK,
          chunk,
          contextOptions,
        );

        if (!this.openaiAdapter) {
          throw new Error('OpenAI adapter is required for meeting analysis');
        }

        // Generate analysis for this chunk
        const messages: MessageConfig[] = ragPrompt.messages.map((m) => {
          // Create the basic message config
          const messageConfig: MessageConfig = {
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          };
          
          // Preserve responseFormat if it exists
          if ((m as any).responseFormat) {
            messageConfig.responseFormat = (m as any).responseFormat;
          }
          
          return messageConfig;
        });

        const chunkAnalysis =
          await this.openaiAdapter.generateChatCompletion(messages);

        if (chunkAnalysis) {
          partialAnalyses.push(chunkAnalysis);
        }
      }

      // Combine the partial analyses into a final prompt
      const combinedAnalysis = partialAnalyses.join('\n\n');

      // Create final analysis context options
      const finalContextOptions = {
        userId,
        queryText: `Final meeting analysis for ${meetingTitle}`,
        queryEmbedding: transcriptEmbeddings,
        strategy: RagRetrievalStrategy.HYBRID,
        maxItems: 5,
        documentIds: previousMeetingIds,
        contentTypes: [
          ContextType.MEETING,
          ContextType.DECISION,
          ContextType.ACTION_ITEM,
        ],
      };

      // Generate final prompt with RAG context
      const finalRagPrompt = await this.ragPromptManager.createRagPrompt(
        SystemRoleEnum.MEETING_ANALYST,
        InstructionTemplateNameEnum.FINAL_MEETING_SUMMARY,
        combinedAnalysis,
        finalContextOptions,
      );

      // Generate final analysis
      const finalMessages: MessageConfig[] = finalRagPrompt.messages.map((m) => {
        // Create the basic message config
        const messageConfig: MessageConfig = {
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        };
        
        // Preserve responseFormat if it exists
        if ((m as any).responseFormat) {
          messageConfig.responseFormat = (m as any).responseFormat;
        }
        
        return messageConfig;
      });


      const llmResponse = await this.openaiAdapter!.generateChatCompletion(finalMessages);

      if (!llmResponse) {
        throw new Error('Failed to analyze meeting transcript');
      }

      let analysisResult: MeetingAnalysisResult;
      try {
        // Parse the JSON response directly - now it's guaranteed to be proper JSON
        analysisResult = JSON.parse(llmResponse);
      } catch (e) {
        this.logger.error('Failed to parse meeting analysis result', {
          error: e instanceof Error ? e.message : String(e),
          content: llmResponse,
        });
        throw new Error('Failed to parse meeting analysis result');
      }

      this.logger.info("********* Analysis Result *********", {
        analysisResult,
      });
      // Store extracted data in the context database
      await this.storeExtractedMeetingData(userId, meetingId, analysisResult);

      // Store the RAG interaction for future context
      // Use a truncated version of the transcript in the RAG interaction
      const truncatedTranscript = 
        transcript.length > 1000 ? transcript.substring(0, 1000) + '...' : transcript;
        
      await this.ragPromptManager.storeRagInteraction(
        userId,
        truncatedTranscript,
        transcriptEmbeddings,
        JSON.stringify(analysisResult),
        transcriptEmbeddings, // Simplified - should get proper embedding for response
        finalRagPrompt.retrievedContext,
        meetingId, // Using meetingId as conversationId for context tracking
      );

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
    } catch (error) {
      this.logger.error('Error analyzing meeting', {
        error: error instanceof Error ? error.message : String(error),
        meetingId,
      });
      throw error;
    }
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
    if (analysisResult.decisions && Array.isArray(analysisResult.decisions)) {
      for (const decision of analysisResult.decisions) {
        if (!decision.text) {
          this.logger.warn('Skipping decision with empty text');
          continue;
        }
        
        const decisionId = decision.id || uuidv4();
        try {
          const decisionEmbedding = await this.generateEmbedding(decision.text);

          await this.meetingContextService.storeDecision(
            userId,
            meetingId,
            decisionId,
            decision.text,
            decision.summary || null,
            decisionEmbedding,
          );
        } catch (error) {
          this.logger.error('Error storing decision', {
            error: error instanceof Error ? error.message : String(error),
            decisionText: decision.text.substring(0, 100) + '...',
          });
        }
      }
    }

    // Store action items
    if (analysisResult.actionItems && Array.isArray(analysisResult.actionItems)) {
      for (const actionItem of analysisResult.actionItems) {
        if (!actionItem.text) {
          this.logger.warn('Skipping action item with empty text');
          continue;
        }
        
        const actionItemId = actionItem.id || uuidv4();
        try {
          const actionItemEmbedding = await this.generateEmbedding(actionItem.text);

          await this.meetingContextService.storeActionItem(
            userId,
            meetingId,
            actionItemId,
            actionItem.text,
            actionItem.assignee || 'Unassigned',
            actionItem.dueDate || null,
            actionItemEmbedding,
          );
        } catch (error) {
          this.logger.error('Error storing action item', {
            error: error instanceof Error ? error.message : String(error),
            actionItemText: actionItem.text.substring(0, 100) + '...',
          });
        }
      }
    }

    // Store questions
    if (analysisResult.questions && Array.isArray(analysisResult.questions)) {
      for (const question of analysisResult.questions) {
        if (!question.text) {
          this.logger.warn('Skipping question with empty text');
          continue;
        }
        
        const questionId = question.id || uuidv4();
        try {
          const questionEmbedding = await this.generateEmbedding(question.text);

          await this.meetingContextService.storeQuestion(
            userId,
            meetingId,
            questionId,
            question.text,
            questionEmbedding,
            question.isAnswered || false,
            question.answerContextId,
          );
        } catch (error) {
          this.logger.error('Error storing question', {
            error: error instanceof Error ? error.message : String(error),
            questionText: question.text.substring(0, 100) + '...',
          });
        }
      }
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
      { 
        role: 'user', 
        content: prompt,
        responseFormat: { type: 'json_array' }
      },
    ]);

    if (!llmResponse) {
      throw new Error('Failed to extract action items');
    }

    let actionItems = [];
    try {
      // Parse the response with normal JSON.parse - no markdown cleanup needed
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
      { 
        role: 'user', 
        content: prompt,
        responseFormat: { type: 'json_array' }
      },
    ]);

    if (!llmResponse) {
      throw new Error('Failed to extract decisions');
    }

    let decisions = [];
    try {
      // Parse the response with normal JSON.parse - no markdown cleanup needed
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
      { 
        role: 'user', 
        content: prompt,
        responseFormat: { type: 'json_array' }
      },
    ]);

    if (!llmResponse) {
      throw new Error('Failed to extract questions');
    }

    let questions = [];
    try {
      // Parse the response with normal JSON.parse - no markdown cleanup needed
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
