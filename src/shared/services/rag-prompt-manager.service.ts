import { PromptManager } from './prompt-manager.service.ts';
import {
  UserContextService,
  ContextType,
} from '../../shared/user-context/user-context.service.ts';
import type { SystemRole } from '../prompts/prompt-types.ts';
import type { InstructionTemplateName } from '../prompts/instruction-templates.ts';

/**
 * Different strategies for retrieving context for RAG
 */
export enum RagRetrievalStrategy {
  SEMANTIC = 'semantic', // Pure vector similarity search
  HYBRID = 'hybrid', // Combination of semantic and keyword-based search
  RECENCY = 'recency', // Prioritize recent context
  CONVERSATION = 'conversation', // Focus on current conversation
  DOCUMENT = 'document', // Document-specific context
  CUSTOM = 'custom', // Custom retrieval logic
}

/**
 * Options for retrieving context for RAG
 */
export interface RagContextOptions {
  userId: string;
  queryText: string;
  queryEmbedding: number[];
  strategy?: RagRetrievalStrategy;
  maxItems?: number;
  minRelevanceScore?: number;
  conversationId?: string;
  documentIds?: string[];
  contentTypes?: ContextType[];
  timeWindow?: number; // Only include context from the last N milliseconds
  customFilter?: Record<string, any>;
}

/**
 * Result of context retrieval
 */
export interface RetrievedContext {
  items: Array<{
    content: string;
    source?: string;
    score?: number;
    metadata?: Record<string, any>;
  }>;
  formattedContext: string;
  sources: string[];
}

/**
 * Result of a RAG prompt generation
 */
export interface RagPromptResult {
  messages: Array<{ role: string; content: string }>;
  retrievedContext: RetrievedContext;
  templateName: InstructionTemplateName;
  systemRole: SystemRole;
}

/**
 * Extended PromptManager with RAG capabilities
 * This service extends the base PromptManager to include
 * retrieval-augmented generation features
 */
export class RagPromptManager {
  private userContextService: UserContextService;

  constructor() {
    this.userContextService = new UserContextService();
  }

  /**
   * Create a RAG-enhanced prompt by retrieving relevant context
   * from the user's context store
   */
  async createRagPrompt(
    role: SystemRole,
    templateName: InstructionTemplateName,
    content: string,
    ragOptions: RagContextOptions,
  ): Promise<RagPromptResult> {
    // 1. Retrieve relevant context based on the query
    const retrievedContext = await this.retrieveUserContext(ragOptions);

    // 2. Use the base PromptManager to create the prompt with the retrieved context
    const prompt = PromptManager.createPrompt(
      role,
      templateName,
      content,
      retrievedContext.formattedContext,
    );

    // 3. Return the result with additional RAG-specific information
    return {
      messages: prompt.messages,
      retrievedContext,
      templateName,
      systemRole: role,
    };
  }

  /**
   * Retrieve context from the user's context store
   */
  private async retrieveUserContext(
    options: RagContextOptions,
  ): Promise<RetrievedContext> {
    const {
      userId,
      queryEmbedding,
      strategy = RagRetrievalStrategy.SEMANTIC,
      maxItems = 5,
      minRelevanceScore = 0.6,
      conversationId,
      documentIds,
      contentTypes,
      timeWindow,
    } = options;

    // Build the time range filter if specified
    let timeRangeStart: number | undefined;
    if (timeWindow) {
      timeRangeStart = Date.now() - timeWindow;
    }

    // Apply different retrieval strategies
    let contextItems: any[] = [];

    switch (strategy) {
      case RagRetrievalStrategy.SEMANTIC:
        // Semantic search using vector embeddings
        const semanticResults =
          await this.userContextService.retrieveRagContext(
            userId,
            queryEmbedding,
            {
              topK: maxItems,
              minScore: minRelevanceScore,
              contextTypes: contentTypes,
              conversationId,
              documentIds,
              timeRangeStart,
              includeEmbeddings: false,
            },
          );

        contextItems = semanticResults;
        break;

      case RagRetrievalStrategy.HYBRID:
        // First get semantic results
        const semanticMatches =
          await this.userContextService.retrieveRagContext(
            userId,
            queryEmbedding,
            {
              topK: Math.ceil(maxItems / 2),
              minScore: minRelevanceScore,
              contextTypes: contentTypes,
              documentIds,
              timeRangeStart,
              includeEmbeddings: false,
            },
          );

        // Then get conversation context if applicable
        let conversationMatches: any[] = [];
        if (conversationId) {
          conversationMatches =
            await this.userContextService.getConversationHistory(
              userId,
              conversationId,
              Math.floor(maxItems / 2),
            );
        }

        // Combine both sources
        contextItems = [...semanticMatches, ...conversationMatches];

        // Deduplicate by ID
        const seenIds = new Set<string>();
        contextItems = contextItems.filter((item) => {
          if (item.id && seenIds.has(item.id)) {
            return false;
          }
          if (item.id) {
            seenIds.add(item.id);
          }
          return true;
        });
        break;

      case RagRetrievalStrategy.CONVERSATION:
        // Focus on conversation history
        if (!conversationId) {
          throw new Error(
            'conversationId is required for CONVERSATION strategy',
          );
        }

        contextItems = await this.userContextService.getConversationHistory(
          userId,
          conversationId,
          maxItems,
        );
        break;

      case RagRetrievalStrategy.DOCUMENT:
        // Retrieve document chunks
        if (!documentIds || documentIds.length === 0) {
          throw new Error('documentIds are required for DOCUMENT strategy');
        }

        for (const docId of documentIds) {
          const chunks = await this.userContextService.getDocumentChunks(
            userId,
            docId,
          );
          contextItems.push(...chunks);
        }

        // Sort by chunk index to maintain document order
        contextItems = contextItems.sort(
          (a: any, b: any) =>
            (a.metadata?.chunkIndex || 0) - (b.metadata?.chunkIndex || 0),
        );
        break;

      case RagRetrievalStrategy.RECENCY:
        // Prioritize recent context
        const recentResults = await this.userContextService.retrieveRagContext(
          userId,
          queryEmbedding,
          {
            topK: maxItems * 2, // Get more items to filter later
            contextTypes: contentTypes,
            timeRangeStart,
            includeEmbeddings: false,
          },
        );

        // Sort by timestamp (recency) and take the most recent ones
        contextItems = recentResults
          .sort(
            (a: any, b: any) =>
              (b.metadata?.timestamp || 0) - (a.metadata?.timestamp || 0),
          )
          .slice(0, maxItems);
        break;

      case RagRetrievalStrategy.CUSTOM:
        // Apply custom filter
        if (!options.customFilter) {
          throw new Error('customFilter is required for CUSTOM strategy');
        }

        const customResults = await this.userContextService.retrieveRagContext(
          userId,
          queryEmbedding,
          {
            topK: maxItems,
            minScore: minRelevanceScore,
            contextTypes: contentTypes,
            includeEmbeddings: false,
          },
        );

        contextItems = customResults;
        break;

      default:
        throw new Error(`Unsupported retrieval strategy: ${strategy}`);
    }

    // Format the retrieved context
    const formattedItems = this.formatContextItems(contextItems);

    // Collect sources
    const sources = contextItems
      .map((item) => item.metadata?.source || item.metadata?.documentId)
      .filter(Boolean)
      .filter((value, index, self) => self.indexOf(value) === index); // Deduplicate

    return {
      items: formattedItems,
      formattedContext: this.formatContextForPrompt(formattedItems),
      sources,
    };
  }

  /**
   * Format context items into a structured format
   */
  private formatContextItems(results: any[]): Array<{
    content: string;
    source?: string;
    score?: number;
    metadata?: Record<string, any>;
  }> {
    return results
      .map((result) => {
        const metadata = result.metadata || {};

        let content = '';
        if (metadata.contextType === ContextType.CONVERSATION) {
          content = `${metadata.role || 'unknown'}: ${metadata.message || ''}`;
        } else if (metadata.contextType === ContextType.DOCUMENT) {
          content = metadata.content || '';
        } else {
          content = metadata.content || metadata.text || metadata.message || '';
        }

        return {
          content,
          source: metadata.source || metadata.documentId,
          score: result.score,
          metadata,
        };
      })
      .filter((item) => item.content && item.content.trim() !== '');
  }

  /**
   * Format context items into a string for inclusion in the prompt
   */
  private formatContextForPrompt(
    contextItems: Array<{
      content: string;
      source?: string;
      score?: number;
    }>,
  ): string {
    if (!contextItems || contextItems.length === 0) {
      return 'No relevant context found.';
    }

    const formattedContext = contextItems
      .map((item, index) => {
        const sourceInfo = item.source ? ` (Source: ${item.source})` : '';
        return `[${index + 1}] ${item.content}${sourceInfo}`;
      })
      .join('\n\n');

    return `# Relevant Context\n\n${formattedContext}`;
  }

  /**
   * Store a completed RAG interaction in the user's context
   */
  async storeRagInteraction(
    userId: string,
    query: string,
    queryEmbedding: number[],
    response: string,
    responseEmbedding: number[],
    retrievedContext: RetrievedContext,
    conversationId?: string,
  ): Promise<string> {
    // Store the query and response in the user's context
    let interactionId: string;

    if (conversationId) {
      // Store as part of conversation history
      interactionId = await this.userContextService.storeConversationTurn(
        userId,
        conversationId,
        query,
        queryEmbedding,
        'user',
      );

      await this.userContextService.storeConversationTurn(
        userId,
        conversationId,
        response,
        responseEmbedding,
        'assistant',
        undefined, // Auto-generate turnId
        {
          // Include metadata about the context used
          contextCount: retrievedContext.items.length,
          contextSources: retrievedContext.sources,
          ragEnabled: true,
        },
      );
    } else {
      // Store as standalone context
      interactionId = await this.userContextService.storeUserContext(
        userId,
        query,
        queryEmbedding,
        {
          contextType: ContextType.CUSTOM,
          category: 'rag-interaction',
          response,
          // Include metadata about the context used
          contextCount: retrievedContext.items.length,
          contextSources: retrievedContext.sources,
          ragEnabled: true,
        },
      );
    }

    return interactionId;
  }
}
