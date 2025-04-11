import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { BaseAgent } from '../base/base-agent.ts';
import { AgentRequest, AgentResponse } from '../interfaces/agent.interface.ts';
import { UserContextService } from '../../shared/user-context/user-context.service.ts';
import { RagPromptManager, RagRetrievalStrategy } from '../../shared/services/rag-prompt-manager.service.ts';
import { ContextType } from '../../shared/user-context/context-types.ts';
import { EmbeddingService } from '../../shared/embedding/embedding.service.ts';

/**
 * KnowledgeRetrievalAgent
 * Specialized agent that retrieves relevant information from the user's knowledge base
 */
export class KnowledgeRetrievalAgent extends BaseAgent {
  private userContextService: UserContextService;
  private ragPromptManager: RagPromptManager;
  private embeddingService: EmbeddingService;

  constructor(options: {
    userContextService?: UserContextService;
    ragPromptManager?: RagPromptManager;
    embeddingService?: EmbeddingService;
    logger?: any;
  } = {}) {
    super(
      'Knowledge Retrieval Agent',
      'Retrieves relevant knowledge from user context',
      { logger: options.logger }
    );

    this.userContextService = options.userContextService || new UserContextService();
    this.ragPromptManager = options.ragPromptManager || new RagPromptManager();
    this.embeddingService = options.embeddingService || new EmbeddingService();

    // Register capabilities
    this.registerCapability({
      name: 'retrieve_knowledge',
      description: 'Retrieve relevant knowledge from user context',
      parameters: {
        query: 'Query to search for',
        strategy: 'Retrieval strategy to use',
        maxItems: 'Maximum number of items to retrieve',
        minRelevanceScore: 'Minimum relevance score for retrieved items',
        contextTypes: 'Types of context to search for'
      }
    });

    this.registerCapability({
      name: 'answer_with_context',
      description: 'Generate an answer using retrieved context',
      parameters: {
        query: 'Query to answer',
        retrievalOptions: 'Options for context retrieval'
      }
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
   * Execute the agent with the given request
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const capability = request.capability || 'retrieve_knowledge';

    if (!this.canHandle(capability)) {
      throw new Error(`Capability not supported: ${capability}`);
    }

    const query = typeof request.input === 'string'
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
            request.parameters
          );

        case 'answer_with_context':
          return await this.answerWithContext(
            userId, 
            query, 
            request.parameters,
            request.context?.conversationId
          );
          
        default:
          throw new Error(`Unsupported capability: ${capability}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : String(error);

      this.logger.error(`Error in KnowledgeRetrievalAgent: ${errorMessage}`, { 
        userId, 
        query,
        capability 
      });
      throw error;
    }
  }

  /**
   * Retrieve knowledge from user context
   */
  private async retrieveKnowledge(
    userId: string,
    query: string,
    parameters?: Record<string, any>
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    // Create embeddings for the query
    const embeddingResult = await this.embeddingService.createEmbeddings([query]);
    if (!embeddingResult || !embeddingResult.embeddings[0]) {
      throw new Error('Failed to create embeddings for query');
    }

    const queryEmbedding = embeddingResult.embeddings[0];
    
    // Determine retrieval strategy
    const strategy = parameters?.strategy || RagRetrievalStrategy.SEMANTIC;
    
    // Get context types to search
    const contextTypes = parameters?.contextTypes || [
      ContextType.DOCUMENT,
      ContextType.MEETING,
      ContextType.TOPIC,
      ContextType.CONVERSATION,
      ContextType.NOTE
    ];

    // Retrieve relevant context
    const results = await this.userContextService.retrieveRagContext(
      userId,
      queryEmbedding,
      {
        topK: parameters?.maxItems || 5,
        minScore: parameters?.minRelevanceScore || 0.6,
        contextTypes,
        timeRangeStart: parameters?.timeRangeStart,
        timeRangeEnd: parameters?.timeRangeEnd,
        conversationId: parameters?.conversationId,
        documentIds: parameters?.documentIds,
        includeEmbeddings: false
      }
    );

    // Process and format results
    const formattedResults = results.map(match => {
      const metadata = match.metadata || {};
      const content = metadata.content || metadata.text || '';
      const source = metadata.source || metadata.documentId || '';
      const contextType = metadata.contextType || 'unknown';
      
      return {
        content,
        source,
        contextType,
        score: match.score,
        metadata: {
          ...metadata,
          id: match.id
        }
      };
    });

    return {
      output: JSON.stringify(formattedResults),
      artifacts: {
        query,
        strategy,
        resultsCount: formattedResults.length,
        results: formattedResults
      },
      metrics: this.processMetrics(
        startTime,
        undefined,
        1
      )
    };
  }

  /**
   * Generate an answer using retrieved context
   */
  private async answerWithContext(
    userId: string,
    query: string,
    parameters?: Record<string, any>,
    conversationId?: string
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    // Create embeddings for the query
    const embeddingResult = await this.embeddingService.createEmbeddings([query]);
    if (!embeddingResult || !embeddingResult.embeddings[0]) {
      throw new Error('Failed to create embeddings for query');
    }

    const queryEmbedding = embeddingResult.embeddings[0];
    
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
        customFilter: retrievalOptions.customFilter
      }
    );

    // Generate response using LLM with RAG-enhanced prompt
    const llmMessages = ragResult.messages;
    const llmResponse = await this.llm.invoke(llmMessages);
    
    // Extract content and ensure it's a string
    const responseContent = typeof llmResponse.content === 'string'
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
      conversationId
    );

    return {
      output: responseContent,
      artifacts: {
        query,
        strategy,
        contextSources: ragResult.retrievedContext.sources,
        promptMessages: llmMessages,
        response: llmResponse
      },
      metrics: this.processMetrics(
        startTime,
        undefined,
        1
      )
    };
  }
} 