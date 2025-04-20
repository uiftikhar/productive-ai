import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { BaseAgent } from '../base/base-agent';
import {
  AgentRequest,
  AgentResponse,
  AgentCapability,
} from '../interfaces/base-agent.interface';
import {
  RagPromptManager,
  RagRetrievalStrategy,
} from '../../shared/services/rag-prompt-manager.service';
import { ContextType } from '../../shared/user-context/context-types';
import { UserRole } from '../../shared/user-context/types/context.types';
import {
  EmbeddingService,
  EmbeddingProvider,
} from '../../shared/embedding/embedding.service';
import { DocumentContextService } from '../../shared/user-context/services/document-context.service';
import { ConversationContextService } from '../../shared/user-context/services/conversation-context.service';
import { MeetingContextService } from '../../shared/user-context/services/meeting-context.service';
import { RelevanceCalculationService } from '../../shared/user-context/services/relevance-calculation.service';
import { OpenAIConnector } from '../integrations/openai-connector';
import { Logger } from '../../shared/logger/logger.interface';
import { ChatOpenAI } from '@langchain/openai';

/**
 * KnowledgeRetrievalAgent
 * Specialized agent that retrieves relevant information from the user's knowledge base
 */
export class KnowledgeRetrievalAgent extends BaseAgent {
  private documentContextService: DocumentContextService;
  private conversationContextService: ConversationContextService;
  private meetingContextService: MeetingContextService;
  private relevanceCalculationService: RelevanceCalculationService;
  private ragPromptManager: RagPromptManager;
  private embeddingService: EmbeddingService;
  private openAIConnector?: OpenAIConnector;

  constructor(
    options: {
      documentContextService?: DocumentContextService;
      conversationContextService?: ConversationContextService;
      meetingContextService?: MeetingContextService;
      relevanceCalculationService?: RelevanceCalculationService;
      ragPromptManager?: RagPromptManager;
      embeddingService?: EmbeddingService;
      openAIConnector?: OpenAIConnector;
      logger?: Logger;
      llm?: ChatOpenAI;
      id?: string;
    } = {},
  ) {
    super(
      'Knowledge Retrieval Agent',
      'Retrieves relevant knowledge from user context',
      {
        logger: options.logger,
        llm: options.llm,
        id: options.id || 'knowledge-retrieval-agent',
      },
    );

    this.documentContextService =
      options.documentContextService || new DocumentContextService();
    this.conversationContextService =
      options.conversationContextService || new ConversationContextService();
    this.meetingContextService =
      options.meetingContextService || new MeetingContextService();
    this.relevanceCalculationService =
      options.relevanceCalculationService || new RelevanceCalculationService();
    this.ragPromptManager = options.ragPromptManager || new RagPromptManager();
    this.openAIConnector = options.openAIConnector;

    // Use provided embedding service or create a new one with proper parameters
    if (options.embeddingService) {
      this.embeddingService = options.embeddingService;
    } else if (options.openAIConnector) {
      this.embeddingService = new EmbeddingService(
        options.openAIConnector,
        this.logger,
      );
    } else {
      throw new Error(
        'Either embeddingService or openAIConnector must be provided',
      );
    }

    // Register capabilities
    this.registerCapability({
      name: 'retrieve_knowledge',
      description: 'Retrieve relevant knowledge from user context',
      parameters: {
        query: 'Query to search for',
        strategy: 'Retrieval strategy to use',
        maxItems: 'Maximum number of items to retrieve',
        minRelevanceScore: 'Minimum relevance score for retrieved items',
        contextTypes: 'Types of context to search for',
      },
    });

    this.registerCapability({
      name: 'answer_with_context',
      description: 'Generate an answer using retrieved context',
      parameters: {
        query: 'Query to answer',
        retrievalOptions: 'Options for context retrieval',
      },
    });
  }

  /**
   * Initialize the agent with runtime configuration
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);
    this.logger.info('Knowledge Retrieval Agent initialized');
  }

  /**
   * Implementation of abstract execute method
   */
  public async executeInternal(
    request: AgentRequest,
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    const capability = request.capability || 'retrieve_knowledge';

    if (!this.canHandle(capability)) {
      throw new Error(`Capability not supported: ${capability}`);
    }

    const query =
      typeof request.input === 'string'
        ? request.input
        : request.parameters?.query || '';

    if (!query) {
      throw new Error('No query provided');
    }

    const userId = request.context?.userId;
    if (!userId) {
      throw new Error('User ID is required');
    }

    try {
      switch (capability) {
        case 'retrieve_knowledge':
          return await this.retrieveKnowledge(
            userId,
            query,
            request.parameters,
          );

        case 'answer_with_context':
          return await this.answerWithContext(
            userId,
            query,
            request.parameters,
            request.context?.conversationId,
          );

        default:
          throw new Error(`Unsupported capability: ${capability}`);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`Error in KnowledgeRetrievalAgent: ${errorMessage}`, {
        userId,
        query,
        capability,
      });
      throw error;
    }
  }

  private async retrieveContextFromAllSources(
    userId: string,
    queryEmbedding: number[],
    options: {
      topK?: number;
      minScore?: number;
      contextTypes?: ContextType[];
      timeRangeStart?: Date;
      timeRangeEnd?: Date;
    },
  ) {
    const results = [];
    const { topK = 5, minScore = 0.6 } = options;

    // Retrieve from documents
    if (
      !options.contextTypes ||
      options.contextTypes.includes(ContextType.DOCUMENT)
    ) {
      const documentResults =
        await this.documentContextService.searchDocumentContent(
          userId,
          queryEmbedding,
          { maxResults: topK, minRelevanceScore: minScore },
        );
      results.push(...documentResults);
    }

    // Retrieve from conversations
    if (
      !options.contextTypes ||
      options.contextTypes.includes(ContextType.CONVERSATION)
    ) {
      const conversationResults =
        await this.conversationContextService.searchConversations(
          userId,
          queryEmbedding,
          { maxResults: topK, minRelevanceScore: minScore },
        );
      results.push(...conversationResults);
    }

    // Retrieve from meetings
    if (
      !options.contextTypes ||
      options.contextTypes.includes(ContextType.MEETING)
    ) {
      const meetingResults =
        await this.meetingContextService.findUnansweredQuestions(userId, {
          timeRangeStart: options.timeRangeStart?.getTime(),
          timeRangeEnd: options.timeRangeEnd?.getTime(),
        });
      results.push(...meetingResults.slice(0, topK));
    }

    // Calculate relevance scores for each result
    const scoredResults = results.map((result) => ({
      ...result,
      score: this.relevanceCalculationService.calculateRelevanceScore(
        'user' as UserRole,
        result.metadata,
        Date.now(),
      ),
    }));

    // Sort by score and take top K
    return scoredResults.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * Retrieve knowledge from user context
   */
  private async retrieveKnowledge(
    userId: string,
    query: string,
    parameters?: Record<string, any>,
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    // Generate embedding for the query
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    const results = await this.retrieveContextFromAllSources(
      userId,
      queryEmbedding,
      {
        topK: parameters?.maxItems || 5,
        minScore: parameters?.minRelevanceScore || 0.6,
        contextTypes: parameters?.contextTypes,
        timeRangeStart: parameters?.timeRangeStart,
        timeRangeEnd: parameters?.timeRangeEnd,
      },
    );

    // Format results remains the same...
    const formattedResults = results.map((match) => ({
      content: match.content,
      source: match.source,
      contextType: match.contextType,
      score: match.score,
      metadata: match.metadata,
    }));

    return {
      output: JSON.stringify(formattedResults),
      artifacts: {
        query,
        strategy: parameters?.strategy,
        resultsCount: formattedResults.length,
        results: formattedResults,
      },
      metrics: this.processMetrics(startTime, undefined, 1),
    };
  }

  /**
   * Generate an answer using retrieved context
   */
  private async answerWithContext(
    userId: string,
    query: string,
    parameters?: Record<string, any>,
    conversationId?: string,
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    // Create embedding for the query
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    // Determine retrieval options
    const retrievalOptions = parameters?.retrievalOptions || {};
    const strategy = retrievalOptions.strategy || RagRetrievalStrategy.HYBRID;

    // Create a RAG prompt
    const ragResult = await this.ragPromptManager.createRagPrompt(
      'default' as any, // Use 'default' system role, casting to any to avoid type issues
      'rag_qa' as any, // Cast to any to accommodate the expected InstructionTemplateName type
      query,
      {
        userId,
        queryText: query,
        queryEmbedding,
        strategy,
        maxItems: retrievalOptions.maxItems || 5,
        minRelevanceScore: retrievalOptions.minRelevanceScore || 0.6,
        conversationId,
        contentTypes: retrievalOptions.contextTypes,
        timeWindow: retrievalOptions.timeWindow,
        customFilter: retrievalOptions.customFilter,
      },
    );

    // Generate response using LLM with RAG-enhanced prompt
    const llmMessages = ragResult.messages;
    const llmResponse = await this.llm.invoke(llmMessages);

    // Extract content and ensure it's a string
    const responseContent =
      typeof llmResponse.content === 'string'
        ? llmResponse.content
        : JSON.stringify(llmResponse.content);

    // Store the interaction for future reference
    await this.ragPromptManager.storeRagInteraction(
      userId,
      query,
      queryEmbedding,
      responseContent,
      [], // Would need to generate embeddings for response
      ragResult.retrievedContext,
      conversationId,
    );

    return {
      output: responseContent,
      artifacts: {
        query,
        strategy,
        contextSources: ragResult.retrievedContext.sources,
        promptMessages: llmMessages,
        response: llmResponse,
      },
      metrics: this.processMetrics(startTime, undefined, 1),
    };
  }
}
