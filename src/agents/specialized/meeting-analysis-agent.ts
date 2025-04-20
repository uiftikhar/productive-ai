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
import { ContextType } from '../../shared/user-context/types/context.types';

// Import embedding and connector services
import { EmbeddingService } from '../../shared/embedding/embedding.service';
import { OpenAIConnector } from '../integrations/openai-connector';
import { BaseContextService } from '../../shared/user-context/services/base-context.service';

/**
 * Agent for analyzing meeting transcripts
 * @status STABLE
 */
export class MeetingAnalysisAgent extends BaseAgent {
  private ragPromptManager: RagPromptManager;
  private embeddingService: EmbeddingService;
  private openAIConnector: OpenAIConnector;
  private baseContextService: BaseContextService;

  /**
   * Create a new meeting analysis agent
   */
  constructor(
    name: string = 'Meeting Analysis Agent',
    description: string = 'Analyzes meeting transcripts to extract key information, action items, and insights',
    options: any = {},
  ) {
    super(name, description, options);
    this.logger = options.logger || new ConsoleLogger();

    this.openAIConnector =
      options.openAIConnector ||
      new OpenAIConnector({
        logger: this.logger,
      });

    this.embeddingService =
      options.embeddingService ||
      new EmbeddingService(this.openAIConnector, this.logger);

    this.baseContextService =
      options.baseContextService ||
      new BaseContextService({
        logger: this.logger,
      });

    this.ragPromptManager = new RagPromptManager();

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
   * Process transcript through the agent
   */
  async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const capability = request.capability || 'analyze-transcript-chunk';

    this.logger.debug(`Executing capability: ${capability}`, {
      parameters: request.parameters,
    });

    try {
      const { template, role } =
        this.getTemplateAndRoleForCapability(capability);

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

      // Handle custom instruction cases
      let customInstruction = '';
      if (template === InstructionTemplateNameEnum.CUSTOM) {
        switch (capability) {
          case 'extract-action-items':
            customInstruction = `
              Focus specifically on identifying action items from the transcript.
              For each action item, extract:
              - The task description
              - The person responsible (if mentioned)
              - The deadline or timeframe (if mentioned)
              - The context or related topic
              
              Format your response as a JSON array of action items.
            `;
            break;
          case 'extract-topics':
            customInstruction = `
              Focus specifically on identifying the main topics discussed in the meeting.
              For each topic:
              - Provide a clear title
              - Note when it was discussed (beginning, middle, end)
              - Identify the main participants discussing this topic
              - Summarize key points made about this topic
              
              Format your response as a JSON array of topics.
            `;
            break;
          case 'extract-decisions':
            customInstruction = `
              Focus specifically on identifying decisions made during the meeting.
              For each decision:
              - Clearly state what was decided
              - Note who made or approved the decision
              - Identify any conditions attached to the decision
              - Note if there was consensus or disagreement
              
              Format your response as a JSON array of decisions.
            `;
            break;
        }
      }

      // Prepare RAG options with real embeddings
      const { ragOptions, embeddingGenerated } =
        await this.prepareRagContextOptions(
          capability,
          inputText,
          request.parameters,
        );

      const ragResult = await this.ragPromptManager.createRagPrompt(
        role,
        template,
        // For custom templates, combine the input with our custom instruction
        template === InstructionTemplateNameEnum.CUSTOM
          ? `${customInstruction}\n\nTranscript to analyze:\n${inputText}`
          : inputText,
        ragOptions,
      );

      // Log information about retrieved context
      this.logger.debug('Retrieved context for analysis', {
        contextCount: ragResult.retrievedContext.items.length,
        sources: ragResult.retrievedContext.sources,
        embeddingGenerated,
      });

      const messages = ragResult.messages.map((msg) => {
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

      // Call the language model
      const response = await this.llm.invoke(messages);

      const inputTokens = this.estimateTokenCount(
        messages
          .map((m) =>
            typeof m.content === 'string'
              ? m.content
              : JSON.stringify(m.content),
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
          capability,
          request.parameters,
        );
      }

      // Format the response
      return {
        output: response,
        artifacts: {
          capability,
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
}
