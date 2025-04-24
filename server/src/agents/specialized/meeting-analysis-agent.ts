import { BaseAgent } from '../base/base-agent';
import {
  AgentRequest,
  AgentResponse,
} from '../interfaces/base-agent.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  HumanMessage,
  AIMessage,
} from '@langchain/core/messages';

// Import RagPromptManager and template types
import {
  RagPromptManager,
  RagRetrievalStrategy,
  RagContextOptions,
} from '../../shared/services/rag-prompt-manager.service';
import { SystemRoleEnum, SystemRole } from '../../shared/prompts/prompt-types';
import {
  InstructionTemplateNameEnum,
  InstructionTemplateName,
} from '../../shared/prompts/instruction-templates';
import { ContextType } from '../../shared/services/user-context/types/context.types';

// Import embedding services and interfaces
import { IEmbeddingService } from '../../shared/services/embedding.interface';
import { EmbeddingServiceFactory } from '../../shared/services/embedding.factory';
import { OpenAIConnector } from '../integrations/openai-connector';
import { BaseContextService } from '../../shared/services/user-context/base-context.service';

/**
 * Agent for analyzing meeting transcripts
 * @status STABLE
 */
export class MeetingAnalysisAgent extends BaseAgent {
  private ragPromptManager: RagPromptManager;
  private embeddingService: IEmbeddingService;
  private openAIConnector: OpenAIConnector;
  private baseContextService: BaseContextService;

  /**
   * Create a new meeting analysis agent
   */
  constructor(
    name: string = 'Meeting Analysis Agent',
    description: string = 'Analyzes meeting transcripts to extract key information, action items, and insights',
    options: {
      openAIConnector?: OpenAIConnector;
      logger?: Logger;
      embeddingService?: IEmbeddingService;
      baseContextService?: BaseContextService;
      llm?: ChatOpenAI;
      id?: string;
    } = {},
  ) {
    super(name, description, {
      logger: options.logger,
      llm: options.llm,
      id: options.id,
    });

    // Initialize required services
    this.openAIConnector =
      options.openAIConnector ||
      new OpenAIConnector({
        logger: this.logger,
      });

    // Initialize embedding service if not provided
    this.embeddingService =
      options.embeddingService ||
      EmbeddingServiceFactory.getService({
        connector: this.openAIConnector,
        logger: this.logger,
      });

    this.baseContextService =
      options.baseContextService ||
      new BaseContextService({
        logger: this.logger,
      });

    this.ragPromptManager = new RagPromptManager();

    // Register capabilities
    this.registerCapability({
      name: 'analyze-transcript-chunk',
      description:
        'Analyze a chunk of a meeting transcript to extract key information',
    });

    this.registerCapability({
      name: 'generate-final-analysis',
      description:
        'Generate a comprehensive analysis from partial analyses of transcript chunks',
    });

    this.registerCapability({
      name: 'extract-action-items',
      description:
        'Extract action items and their owners from a meeting transcript',
    });

    this.registerCapability({
      name: 'extract-topics',
      description: 'Extract main topics discussed in a meeting',
    });

    this.registerCapability({
      name: 'extract-decisions',
      description: 'Extract decisions made during a meeting',
    });
  }

  /**
   * Initialize the agent
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);

    try {
      await this.baseContextService.initialize();

      this.logger.info(
        `Initializing ${this.name} with model: ${this.llm.modelName}`,
      );
    } catch (error) {
      this.logger.error(
        `Error initializing MeetingAnalysisAgent: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get template and role for a specific capability
   */
  private getTemplateAndRoleForCapability(capability: string): {
    template: InstructionTemplateName;
    role: SystemRole;
  } {
    switch (capability) {
      case 'analyze-transcript-chunk':
        return {
          template: InstructionTemplateNameEnum.MEETING_ANALYSIS_CHUNK,
          role: SystemRoleEnum.MEETING_ANALYST,
        };

      case 'generate-final-analysis':
        return {
          template: InstructionTemplateNameEnum.FINAL_MEETING_SUMMARY,
          role: SystemRoleEnum.FINAL_SUMMARY_GENERATOR,
        };

      case 'extract-action-items':
        // For specialized extraction, we're using a custom template
        return {
          template: InstructionTemplateNameEnum.CUSTOM,
          role: SystemRoleEnum.MEETING_ANALYST,
        };

      case 'extract-topics':
        return {
          template: InstructionTemplateNameEnum.CUSTOM,
          role: SystemRoleEnum.MEETING_ANALYST,
        };

      case 'extract-decisions':
        return {
          template: InstructionTemplateNameEnum.CUSTOM,
          role: SystemRoleEnum.MEETING_ANALYST,
        };

      default:
        return {
          template: InstructionTemplateNameEnum.MEETING_ANALYSIS_CHUNK,
          role: SystemRoleEnum.MEETING_ANALYST,
        };
    }
  }

  /**
   * Generate embeddings for the input query
   * @param text Text to generate embeddings for
   */
  private async generateEmbeddings(text: string): Promise<number[]> {
    try {
      return await this.embeddingService.generateEmbedding(text);
    } catch (error) {
      this.logger.error(
        `Error generating embeddings: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fallback to a zero vector if embedding generation fails
      return new Array(1536).fill(0);
    }
  }

  /**
   * Prepare RAG context options for retrieval
   */
  private async prepareRagContextOptions(
    capability: string,
    inputText: string,
    parameters: any,
  ): Promise<{
    ragOptions: RagContextOptions;
    embeddingGenerated: boolean;
  }> {
    // Generate embeddings for the input text
    let queryEmbedding: number[] = [];
    let embeddingGenerated = false;

    try {
      // Generate embeddings for relevant RAG lookup
      queryEmbedding = await this.generateEmbeddings(
        inputText.substring(0, 5000),
      ); // Limit input length
      embeddingGenerated = true;
    } catch (error) {
      this.logger.warn(
        `Failed to generate embeddings, using fallback: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fallback to a zero vector if embedding generation fails
      queryEmbedding = new Array(1536).fill(0);
    }

    // Determine relevant context types based on capability
    const contentTypes: ContextType[] = [ContextType.MEETING];

    // TODO CHeck if needed
    if (capability === 'generate-final-analysis') {
      contentTypes.push(ContextType.DECISION);
      contentTypes.push(ContextType.ACTION_ITEM);
    }

    const ragOptions: RagContextOptions = {
      userId: parameters?.userId || 'system',
      queryText: capability,
      queryEmbedding,
      strategy: RagRetrievalStrategy.HYBRID,
      maxItems: 5, // Retrieve up to 5 relevant items
      minRelevanceScore: 0.6, // Minimum relevance score threshold
      conversationId: parameters?.conversationId,
      contentTypes,
      // Only include context from the last 30 days (if not analyzing historical data)
      timeWindow: parameters?.includeHistorical
        ? undefined
        : 30 * 24 * 60 * 60 * 1000,
      documentIds: parameters?.documentIds,
    };

    return { ragOptions, embeddingGenerated };
  }

  /**
   * Implementation of abstract executeInternal method
   */
  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const capability = request.capability || 'analyze-transcript-chunk';

    this.logger.debug(`Executing capability: ${capability}`, {
      parameters: request.parameters,
    });

    try {
      // Dispatch to the appropriate handler based on capability
      switch (capability) {
        case 'analyze-transcript-chunk':
          return await this.analyzeMeeting(request);

        case 'generate-final-analysis':
          return await this.generateMeetingSummary(request);

        case 'extract-action-items':
          return await this.extractActionItems(request);

        case 'generate-follow-up-questions':
          return await this.generateFollowUpQuestions(request);

        case 'extract-topics':
        case 'extract-decisions':
          // Extract specific information based on capability
          const infoType =
            capability === 'extract-topics' ? 'topics' : 'decisions';
          const result = await this.extractSpecificInformation(
            typeof request.input === 'string'
              ? request.input
              : JSON.stringify(request.input),
            infoType as 'action-items' | 'topics' | 'decisions',
            request.parameters,
          );

          return {
            output: result,
            success: true,
            metrics: {
              executionTimeMs: Date.now() - startTime,
            },
          };

        default:
          throw new Error(`Unsupported capability: ${capability}`);
      }
    } catch (error) {
      this.logger.error(
        `Error in MeetingAnalysisAgent: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Store analysis results in the user's context for future reference
   * @param content Analysis content to store
   * @param capability The capability that generated this content
   * @param parameters Request parameters
   */
  private async storeAnalysisInContext(
    content: string,
    capability: string,
    parameters: any,
  ): Promise<void> {
    try {
      // Don't store if no userId provided
      if (!parameters.userId) return;

      // Generate embeddings for the content
      const embeddings = await this.generateEmbeddings(content);

      // Determine context type based on capability
      let contextType = ContextType.MEETING;
      if (capability === 'extract-action-items') {
        contextType = ContextType.ACTION_ITEM;
      } else if (capability === 'extract-decisions') {
        contextType = ContextType.DECISION;
      }

      // Store in context
      await this.baseContextService.storeUserContext(
        parameters.userId,
        content,
        embeddings,
        {
          contextType,
          meetingId: parameters.meetingId,
          category: `meeting-analysis-${capability}`,
          timestamp: Date.now(),
          capability,
          // Include additional metadata from parameters
          documentId: parameters.meetingId,
          title: parameters.meetingTitle || 'Meeting Analysis',
        },
      );

      this.logger.debug('Stored analysis in context', {
        userId: parameters.userId,
        contextType,
        capability,
      });
    } catch (error) {
      // Log but don't fail if storage fails
      this.logger.error(
        `Failed to store analysis in context: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Extract specific information from a transcript
   */
  async extractSpecificInformation(
    transcript: string,
    infoType: 'action-items' | 'topics' | 'decisions',
    options: Record<string, any> = {},
  ): Promise<any> {
    const capability = `extract-${infoType}`;

    // TODO make this production ready
    // This is a simplified approach - in a production app, you would likely use a more reusable pattern
    const {
      AgentWorkflow,
    } = require('../../langgraph/core/workflows/agent-workflow');
    const workflow = new AgentWorkflow(this, {
      tracingEnabled: options.tracingEnabled || false,
    });

    // Execute using the workflow instead of direct agent execution
    const response = await workflow.execute({
      input: transcript,
      capability,
      parameters: {
        ...options,
        storeInContext: options.storeInContext !== false, // Default to true
      },
    });

    return response;
  }

  /**
   * Analyze a meeting transcript
   */
  private async analyzeMeeting(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const inputText =
      typeof request.input === 'string'
        ? request.input
        : Array.isArray(request.input)
          ? request.input
              .map((m) =>
                typeof m.content === 'string'
                  ? m.content
                  : JSON.stringify(m.content),
              )
              .join('\n')
          : '';

    const { template, role } = this.getTemplateAndRoleForCapability(
      'analyze-transcript-chunk',
    );

    // Prepare RAG context options
    const { ragOptions, embeddingGenerated } =
      await this.prepareRagContextOptions(
        'analyze-transcript-chunk',
        inputText,
        request.parameters,
      );

    const ragResult = await this.ragPromptManager.createRagPrompt(
      role,
      template,
      inputText,
      ragOptions,
    );

    // Log information about retrieved context
    this.logger.debug('Retrieved context for transcript analysis', {
      contextCount: ragResult.retrievedContext.items.length,
      sources: ragResult.retrievedContext.sources,
      embeddingGenerated,
    });

    const messages = this.convertRagMessagesToLangchainMessages(
      ragResult.messages,
    );

    // Call the language model
    const response = await this.llm.invoke(messages);

    const inputTokens = this.estimateTokenCount(
      messages
        .map((m) =>
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        )
        .join('\n'),
    );
    const outputTokens = this.estimateTokenCount(
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content),
    );

    // Store analysis results in context if needed
    if (request.parameters?.storeInContext && request.parameters?.userId) {
      await this.storeAnalysisInContext(
        response.content.toString(),
        'analyze-transcript-chunk',
        request.parameters,
      );
    }

    // Format the response
    return {
      output: response.content.toString(),
      success: true,
      artifacts: {
        capability: 'analyze-transcript-chunk',
        parameters: request.parameters,
        templateUsed: template,
        roleUsed: role,
        contextRetrieved: {
          count: ragResult.retrievedContext.items.length,
          sources: ragResult.retrievedContext.sources,
        },
      },
      metrics: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed: inputTokens + outputTokens,
        stepCount: 1,
      },
    };
  }

  /**
   * Generate a summary from meeting analysis
   */
  private async generateMeetingSummary(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const inputText =
      typeof request.input === 'string'
        ? request.input
        : Array.isArray(request.input)
          ? request.input
              .map((m) =>
                typeof m.content === 'string'
                  ? m.content
                  : JSON.stringify(m.content),
              )
              .join('\n')
          : '';

    const { template, role } = this.getTemplateAndRoleForCapability(
      'generate-final-analysis',
    );

    // Prepare RAG context options
    const { ragOptions, embeddingGenerated } =
      await this.prepareRagContextOptions(
        'generate-final-analysis',
        inputText,
        request.parameters,
      );

    const ragResult = await this.ragPromptManager.createRagPrompt(
      role,
      template,
      inputText,
      ragOptions,
    );

    const messages = this.convertRagMessagesToLangchainMessages(
      ragResult.messages,
    );

    // Call the language model
    const response = await this.llm.invoke(messages);

    const inputTokens = this.estimateTokenCount(
      messages
        .map((m) =>
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        )
        .join('\n'),
    );
    const outputTokens = this.estimateTokenCount(
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content),
    );

    // Store analysis results in context if needed
    if (request.parameters?.storeInContext && request.parameters?.userId) {
      await this.storeAnalysisInContext(
        response.content.toString(),
        'generate-final-analysis',
        request.parameters,
      );
    }

    // Format the response
    return {
      output: response.content.toString(),
      success: true,
      artifacts: {
        capability: 'generate-final-analysis',
        parameters: request.parameters,
        templateUsed: template,
        roleUsed: role,
        contextRetrieved: {
          count: ragResult.retrievedContext.items.length,
          sources: ragResult.retrievedContext.sources,
        },
      },
      metrics: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed: inputTokens + outputTokens,
        stepCount: 1,
      },
    };
  }

  /**
   * Extract action items from a meeting transcript
   */
  private async extractActionItems(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const inputText =
      typeof request.input === 'string'
        ? request.input
        : Array.isArray(request.input)
          ? request.input
              .map((m) =>
                typeof m.content === 'string'
                  ? m.content
                  : JSON.stringify(m.content),
              )
              .join('\n')
          : '';

    const { template, role } = this.getTemplateAndRoleForCapability(
      'extract-action-items',
    );

    // Create custom instruction for action items
    const customInstruction = `
      Focus specifically on identifying action items from the transcript.
      For each action item, extract:
      - The task description
      - The person responsible (if mentioned)
      - The deadline or timeframe (if mentioned)
      - The context or related topic
      
      Format your response as a JSON array of action items.
    `;

    // Prepare RAG context options
    const { ragOptions, embeddingGenerated } =
      await this.prepareRagContextOptions(
        'extract-action-items',
        inputText,
        request.parameters,
      );

    const ragResult = await this.ragPromptManager.createRagPrompt(
      role,
      template,
      `${customInstruction}\n\nTranscript to analyze:\n${inputText}`,
      ragOptions,
    );

    const messages = this.convertRagMessagesToLangchainMessages(
      ragResult.messages,
    );

    // Call the language model
    const response = await this.llm.invoke(messages);

    const inputTokens = this.estimateTokenCount(
      messages
        .map((m) =>
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        )
        .join('\n'),
    );
    const outputTokens = this.estimateTokenCount(
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content),
    );

    // Store analysis results in context if needed
    if (request.parameters?.storeInContext && request.parameters?.userId) {
      await this.storeAnalysisInContext(
        response.content.toString(),
        'extract-action-items',
        request.parameters,
      );
    }

    // Format the response
    return {
      output: response.content.toString(),
      success: true,
      artifacts: {
        capability: 'extract-action-items',
        parameters: request.parameters,
        templateUsed: template,
        roleUsed: role,
        contextRetrieved: {
          count: ragResult.retrievedContext.items.length,
          sources: ragResult.retrievedContext.sources,
        },
      },
      metrics: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed: inputTokens + outputTokens,
        stepCount: 1,
      },
    };
  }

  /**
   * Generate follow-up questions based on meeting transcript
   */
  private async generateFollowUpQuestions(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const inputText =
      typeof request.input === 'string'
        ? request.input
        : Array.isArray(request.input)
          ? request.input
              .map((m) =>
                typeof m.content === 'string'
                  ? m.content
                  : JSON.stringify(m.content),
              )
              .join('\n')
          : '';

    const { template, role } = this.getTemplateAndRoleForCapability(
      'analyze-transcript-chunk',
    );

    // Create custom instruction for follow-up questions
    const customInstruction = `
      Based on the meeting transcript, generate a list of thoughtful follow-up questions that would be valuable to ask.
      Focus on:
      - Clarifying ambiguous points
      - Exploring topics that were mentioned but not fully discussed
      - Addressing potential gaps or risks
      - Ensuring next steps are clear and actionable
      
      Format your response as a JSON array of questions with a brief explanation of why each question is important.
    `;

    // Prepare RAG context options
    const { ragOptions, embeddingGenerated } =
      await this.prepareRagContextOptions(
        'analyze-transcript-chunk',
        inputText,
        { ...request.parameters, focusOn: 'follow-up-questions' },
      );

    const ragResult = await this.ragPromptManager.createRagPrompt(
      role,
      template,
      `${customInstruction}\n\nMeeting transcript:\n${inputText}`,
      ragOptions,
    );

    const messages = this.convertRagMessagesToLangchainMessages(
      ragResult.messages,
    );

    // Call the language model
    const response = await this.llm.invoke(messages);

    const inputTokens = this.estimateTokenCount(
      messages
        .map((m) =>
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        )
        .join('\n'),
    );
    const outputTokens = this.estimateTokenCount(
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content),
    );

    // Format the response
    return {
      output: response.content.toString(),
      success: true,
      artifacts: {
        capability: 'generate-follow-up-questions',
        parameters: request.parameters,
        templateUsed: template,
        roleUsed: role,
        contextRetrieved: {
          count: ragResult.retrievedContext.items.length,
          sources: ragResult.retrievedContext.sources,
        },
      },
      metrics: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed: inputTokens + outputTokens,
        stepCount: 1,
      },
    };
  }

  /**
   * Helper method to convert RAG messages to LangChain messages
   */
  private convertRagMessagesToLangchainMessages(
    messages: { role: string; content: string }[],
  ): BaseMessage[] {
    return messages.map((msg) => {
      if (msg.role === 'system') {
        return new SystemMessage(msg.content);
      } else if (msg.role === 'user') {
        return new HumanMessage(msg.content);
      } else if (msg.role === 'assistant') {
        return new AIMessage(msg.content);
      } else {
        // Default to user message for any other role
        return new HumanMessage(msg.content);
      }
    });
  }
}
