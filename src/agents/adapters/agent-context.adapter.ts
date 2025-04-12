import { OpenAIEmbeddings } from '@langchain/openai';
import { ContextAdapter } from './context-adapter.interface.ts';
import { AgentContext } from '../interfaces/agent.interface.ts';
import { BaseContextService } from '../../shared/user-context/services/base-context.service.ts';
import { ConversationContextService } from '../../shared/user-context/services/conversation-context.service.ts';
import { DocumentContextService } from '../../shared/user-context/services/document-context.service.ts';
import { MemoryManagementService } from '../../shared/user-context/services/memory-management.service.ts';
import { KnowledgeGapService } from '../../shared/user-context/services/knowledge-gap.service.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { LangChainConfig } from '../../langchain/config.ts';
import { ContextType } from '../../shared/user-context/types/context.types.ts';

/**
 * Primary context adapter that combines multiple context services
 * for use within the agent framework
 */
export class AgentContextAdapter implements ContextAdapter {
  private conversationContext: ConversationContextService;
  private documentContext: DocumentContextService;
  private memoryContext: MemoryManagementService;
  private knowledgeGap: KnowledgeGapService;
  private embeddings: OpenAIEmbeddings;
  private logger: Logger;

  constructor(
    options: {
      conversationContext?: ConversationContextService;
      documentContext?: DocumentContextService;
      memoryContext?: MemoryManagementService;
      knowledgeGap?: KnowledgeGapService;
      logger?: Logger;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();

    // Initialize context services
    this.conversationContext =
      options.conversationContext || new ConversationContextService();
    this.documentContext =
      options.documentContext || new DocumentContextService();
    this.memoryContext = options.memoryContext || new MemoryManagementService();
    this.knowledgeGap = options.knowledgeGap || new KnowledgeGapService();

    // Initialize OpenAI embeddings
    this.embeddings = new OpenAIEmbeddings({
      model: LangChainConfig.embeddings.model,
      // No dimensions needed for embedding models
    });
  }

  /**
   * Initialize the context adapter and all underlying services
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing AgentContextAdapter');

    // Initialize all context services in parallel
    await Promise.all([
      this.conversationContext.initialize(),
      this.documentContext.initialize(),
      this.memoryContext.initialize(),
      this.knowledgeGap.initialize(),
    ]);

    this.logger.info('AgentContextAdapter initialization complete');
  }

  /**
   * Get embeddings for text using OpenAI
   * @param text Text to get embeddings for
   */
  private async getEmbeddings(text: string): Promise<number[]> {
    try {
      const embeddings = await this.embeddings.embedQuery(text);
      return embeddings;
    } catch (error) {
      this.logger.error('Error generating embeddings', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get comprehensive context for an agent request
   */
  async getContext(
    userId: string,
    input: string,
    options: {
      conversationId?: string;
      sessionId?: string;
      contextTypes?: string[];
      maxResults?: number;
    } = {},
  ): Promise<AgentContext> {
    this.logger.debug('Getting context for agent request', { userId, options });

    // Generate embeddings for the input
    const embeddings = await this.getEmbeddings(input);

    // Default context types to retrieve
    const contextTypes = options.contextTypes || [
      'conversation',
      'document',
      'memory',
    ];
    const maxResults = options.maxResults || 5;

    // Prepare context retrieval promises
    const contextPromises: Promise<any>[] = [];

    // Get conversation context if requested
    if (contextTypes.includes('conversation') && options.conversationId) {
      contextPromises.push(
        this.conversationContext
          .getConversationHistory(userId, options.conversationId, 20)
          .then((history: any) => ({ conversations: history }))
          .catch((err: any) => {
            this.logger.error('Error retrieving conversation context', {
              error: err,
            });
            return { conversations: [] };
          }),
      );
    }

    // Get document context if requested
    if (contextTypes.includes('document')) {
      contextPromises.push(
        this.documentContext
          .searchDocumentContent(userId, embeddings, { maxResults })
          .then((docs: any) => ({ documents: docs }))
          .catch((err: any) => {
            this.logger.error('Error retrieving document context', {
              error: err,
            });
            return { documents: [] };
          }),
      );
    }

    // Get memory context if requested
    if (contextTypes.includes('memory')) {
      // The memory service doesn't have a direct retrieveMemories method
      // Instead we'll use generic user context retrieval
      contextPromises.push(
        this.memoryContext
          .retrieveUserContext(userId, embeddings, {
            topK: maxResults,
            filter: {
              // Filter for memory-related context
              memoryType: { $exists: true },
            },
          })
          .then((memories: any) => ({ memories: memories }))
          .catch((err: any) => {
            this.logger.error('Error retrieving memory context', {
              error: err,
            });
            return { memories: [] };
          }),
      );
    }

    // Get knowledge gaps if requested
    if (contextTypes.includes('knowledgeGap')) {
      contextPromises.push(
        this.knowledgeGap
          .detectMissingInformation(userId, { maxResults, minConfidence: 0.7 })
          .then((gaps: any) => ({ knowledgeGaps: gaps }))
          .catch((err: any) => {
            this.logger.error('Error analyzing knowledge gaps', { error: err });
            return { knowledgeGaps: [] };
          }),
      );
    }

    // Wait for all context retrieval to complete
    const contextResults = await Promise.all(contextPromises);

    // Merge all context results
    const contextData = contextResults.reduce(
      (result, context) => ({
        ...result,
        ...context,
      }),
      {},
    );

    // Return formatted agent context
    return {
      userId,
      conversationId: options.conversationId,
      sessionId: options.sessionId,
      metadata: {
        ...contextData,
        input,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Store context from an agent's execution
   */
  async storeContext(
    userId: string,
    content: string,
    metadata: Record<string, any> = {},
  ): Promise<string> {
    this.logger.debug('Storing context', { userId, metadata });

    // Generate embeddings for the content
    const embeddings = await this.getEmbeddings(content);

    // Determine context type
    const contextType = metadata.contextType || ContextType.CUSTOM;

    // Store in the appropriate service based on context type
    switch (contextType) {
      case ContextType.CONVERSATION:
        return this.conversationContext.storeConversationTurn(
          userId,
          metadata.conversationId,
          content,
          embeddings,
          metadata.role || 'assistant',
          undefined,
          metadata,
        );

      case ContextType.DOCUMENT:
        return this.documentContext.storeDocumentChunk(
          userId,
          metadata.documentId || `doc-${Date.now()}`,
          metadata.documentTitle || 'Untitled Document',
          content,
          embeddings,
          metadata.chunkIndex || 0,
          metadata.totalChunks || 1,
          metadata,
        );

      case 'memory':
        // Store as generic user context with memory metadata
        return this.memoryContext.storeUserContext(
          userId,
          content,
          embeddings,
          {
            ...metadata,
            memoryType: metadata.memoryType || 'general',
            importance: metadata.importance || 0.5,
          },
        );

      default:
        // Default to base context storage
        return this.conversationContext.storeUserContext(
          userId,
          content,
          embeddings,
          metadata,
        );
    }
  }

  /**
   * Clear context data for a user
   */
  async clearContext(
    userId: string,
    options: {
      contextTypes?: string[];
      olderThan?: number;
    } = {},
  ): Promise<void> {
    this.logger.debug('Clearing context', { userId, options });

    const contextTypes = options.contextTypes || ['all'];
    const clearPromises: Promise<any>[] = [];

    // Clear all context if specified
    if (contextTypes.includes('all')) {
      clearPromises.push(this.conversationContext.clearUserContext(userId));
      return;
    }

    // Clear specific context types
    if (contextTypes.includes('conversation')) {
      clearPromises.push(this.conversationContext.clearUserContext(userId));
    }

    if (contextTypes.includes('document')) {
      clearPromises.push(this.documentContext.clearUserContext(userId));
    }

    if (contextTypes.includes('memory')) {
      clearPromises.push(this.memoryContext.clearUserContext(userId));
    }

    await Promise.all(clearPromises);
  }
}
