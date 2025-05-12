/**
 * Unified RAG Service
 * 
 * Central service for Retrieval Augmented Generation functionality.
 * This service orchestrates the entire RAG pipeline:
 * 1. Content processing (chunking, embedding, storing)
 * 2. Context retrieval
 * 3. Prompt enhancement with context
 * 4. Query analysis for improved retrieval
 */

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { 
  ContentChunk, 
  ChunkingOptions, 
  ChunkingResult 
} from './chunking.interface';
import { 
  RetrievalOptions, 
  RetrievalResult, 
  ContextProcessingOptions, 
  ProcessedContext,
  ContextStorageOptions
} from '../context/context-provider.interface';
import {
  UnifiedRAGService as IUnifiedRAGService,
  EmbeddingOptions,
  PromptEnhancementOptions,
  QueryAnalysisResult,
  PromptWithContext,
  AnalysisOptions
} from './unified-rag.service.interface';
import { AdvancedChunkingService } from './advanced-chunking.service';
import { RAGQueryAnalyzerService } from './rag-query-analyzer.service';
import { ContextProvider } from '../context/context-provider.interface';
import { ConversationMemoryService } from '../memory/conversation-memory.service';
import { performance } from 'perf_hooks';

// Export interfaces needed by other modules
export { QueryAnalysisResult, PromptWithContext, AnalysisOptions } from './unified-rag.service.interface';

export class UnifiedRAGService implements IUnifiedRAGService {
  private logger: Logger;
  private openAiConnector: OpenAIConnector;
  private chunkingService: AdvancedChunkingService;
  private queryAnalyzer: RAGQueryAnalyzerService;
  private contextProviders: Map<string, ContextProvider> = new Map();
  private conversationMemory?: ConversationMemoryService;
  
  constructor(options: {
    logger?: Logger;
    openAiConnector?: OpenAIConnector;
    chunkingService?: AdvancedChunkingService;
    queryAnalyzer?: RAGQueryAnalyzerService;
    contextProviders?: { [key: string]: ContextProvider };
    conversationMemory?: ConversationMemoryService;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.openAiConnector = options.openAiConnector || new OpenAIConnector({ logger: this.logger });
    this.chunkingService = options.chunkingService || new AdvancedChunkingService({ 
      logger: this.logger,
      openAiConnector: this.openAiConnector
    });
    this.queryAnalyzer = options.queryAnalyzer || new RAGQueryAnalyzerService({
      logger: this.logger,
      openAiConnector: this.openAiConnector
    });
    
    // Set conversation memory if provided
    this.conversationMemory = options.conversationMemory;
    
    // Register context providers
    if (options.contextProviders) {
      for (const [key, provider] of Object.entries(options.contextProviders)) {
        this.registerContextProvider(key, provider);
      }
    }
  }

  /**
   * Register a context provider for a specific content type
   * @param contentType Type of content (e.g., 'meeting_transcript', 'document')
   * @param provider Context provider implementation
   */
  registerContextProvider(contentType: string, provider: ContextProvider): void {
    this.contextProviders.set(contentType, provider);
    this.logger.info('Registered context provider', { contentType });
  }

  /**
   * Get a context provider for a specific content type
   * @param contentType Type of content
   * @returns Context provider or undefined if not found
   */
  getContextProvider(contentType: string): ContextProvider | undefined {
    return this.contextProviders.get(contentType);
  }

  /**
   * Process content for RAG (chunking and indexing)
   * @param content The content to process
   * @param contentType Type of content (e.g., 'transcript', 'document')
   * @param metadata Additional metadata for the content
   * @param options Processing options
   * @returns Information about the processed content
   */
  async processContent(
    content: string | object,
    contentType: string,
    metadata: Record<string, any>,
    options: ChunkingOptions & ContextStorageOptions = {}
  ): Promise<{ chunkCount: number; sourceId: string }> {
    const startTime = performance.now();
    const provider = this.getContextProvider(contentType);
    
    if (!provider) {
      throw new Error(`No context provider registered for content type: ${contentType}`);
    }
    
    try {
      const sourceId = metadata.sourceId || options.userId || `source-${Date.now()}`;
      
      this.logger.info('Processing content for RAG', {
        contentType,
        contentSize: typeof content === 'string' ? content.length : JSON.stringify(content).length,
        sourceId
      });
      
      // Apply appropriate chunking options for the content type
      const chunkingOptions: ChunkingOptions & { contentType: string } = {
        ...options,
        contentType
      };
      
      // Perform chunking
      const chunkingResult = await this.chunkingService.chunkContent(content, chunkingOptions);
      
      this.logger.debug('Content chunked successfully', {
        contentType,
        chunkCount: chunkingResult.chunks.length,
        avgChunkSize: chunkingResult.avgChunkSize.toFixed(2),
        strategy: chunkingResult.metadata.chunkingStrategy
      });
      
      // Store the chunks using the appropriate provider with storage options
      const storageOptions: ContextStorageOptions = {
        ...options,
        metadata: {
          ...metadata,
          sourceId, // Include sourceId in metadata
          chunkingStrategy: chunkingResult.metadata.chunkingStrategy,
          processingTime: chunkingResult.metadata.processingTime
        }
      };
      
      // Store chunks
      const storedIds = await provider.storeContext(chunkingResult.chunks, storageOptions);
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      this.logger.info('Content processed and stored successfully', {
        contentType,
        chunkCount: chunkingResult.chunks.length,
        storedIds: storedIds.length,
        sourceId,
        processingTimeMs: totalTime.toFixed(2)
      });
      
      return {
        chunkCount: chunkingResult.chunks.length,
        sourceId
      };
    } catch (error) {
      this.logger.error('Error processing content', {
        error: error instanceof Error ? error.message : String(error),
        contentType,
        sourceId: metadata.sourceId || options.userId
      });
      throw error;
    }
  }

  /**
   * Retrieve relevant context based on a query
   * @param query The query to retrieve context for
   * @param options Retrieval options
   * @returns Array of retrieval results
   */
  async retrieveContext(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult[]> {
    const startTime = performance.now();
    
    try {
      this.logger.debug('Retrieving context', {
        query: query.substring(0, 100),
        contextType: options.contextType,
        limit: options.limit
      });
      
      // Enhance query if requested
      let enhancedQuery = query;
      if (options.contextType === 'auto') {
        // Analyze query to determine context type
        const analysis = await this.analyzeQuery(query, { deepAnalysis: true });
        enhancedQuery = analysis.enhancedQuery;
        
        // Override context type based on analysis
        options.contextType = analysis.requiredContextTypes.length > 0 
          ? analysis.requiredContextTypes 
          : ['general'];
      }
      
      // Determine which providers to use
      let providers: ContextProvider[] = [];
      
      if (options.contextType) {
        if (Array.isArray(options.contextType)) {
          // Use multiple providers
          providers = options.contextType
            .map(type => this.getContextProvider(type))
            .filter((p): p is ContextProvider => p !== undefined);
        } else {
          // Use a single provider
          const provider = this.getContextProvider(options.contextType);
          if (provider) {
            providers = [provider];
          }
        }
      } else {
        // If no context type specified, use all registered providers
        providers = Array.from(this.contextProviders.values());
      }
      
      if (providers.length === 0) {
        this.logger.warn('No suitable context providers found', {
          contextType: options.contextType
        });
        return [];
      }
      
      // Retrieve from all selected providers
      const providerResults = await Promise.all(
        providers.map(provider => provider.retrieveContext(enhancedQuery, options))
      );
      
      // Combine results from all providers
      let combinedResults = providerResults.flat();
      
      // Sort by score
      combinedResults.sort((a, b) => b.score - a.score);
      
      // Limit results if needed
      const limit = options.limit || 10;
      if (combinedResults.length > limit) {
        combinedResults = combinedResults.slice(0, limit);
      }
      
      const endTime = performance.now();
      this.logger.info('Context retrieved successfully', {
        query: query.substring(0, 50),
        resultCount: combinedResults.length,
        topScore: combinedResults.length > 0 ? combinedResults[0].score.toFixed(2) : 'N/A',
        processingTimeMs: (endTime - startTime).toFixed(2),
        providers: providers.length
      });
      
      return combinedResults;
    } catch (error) {
      this.logger.error('Error retrieving context', {
        error: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 100)
      });
      return [];
    }
  }

  /**
   * Create a prompt enhanced with relevant context
   * @param query The user query or base prompt
   * @param promptTemplate Template for constructing the final prompt
   * @param options Options for context retrieval and prompt construction
   * @returns Enhanced prompt with context
   */
  async createContextEnhancedPrompt(
    query: string,
    promptTemplate: string,
    options: RetrievalOptions & PromptEnhancementOptions = {}
  ): Promise<PromptWithContext> {
    const startTime = performance.now();
    
    try {
      this.logger.debug('Creating context-enhanced prompt', {
        query: query.substring(0, 100),
        contextType: options.contextType
      });
      
      // Retrieve relevant context
      const contextResults = await this.retrieveContext(query, options);
      
      if (contextResults.length === 0) {
        // No context found, return prompt without context
        return {
          prompt: this.applyTemplateWithoutContext(query, promptTemplate),
          context: '',
          sources: [],
          metadata: { contextFound: false }
        };
      }
      
      // Process context according to options
      const processingOptions: ContextProcessingOptions = {
        format: options.formatAsList ? 'structured' : 'condensed',
        maxLength: options.maxContextLength || 4000,
        highlightRelevance: options.highlightRelevantSections || false,
        removeRedundancy: true,
        structureOutput: true
      };
      
      // Find the first provider that can process the context
      let processedContext: ProcessedContext | undefined;
      
      for (const contentType of new Set(contextResults.map(r => r.sourceType))) {
        const provider = this.getContextProvider(contentType);
        if (provider) {
          try {
            processedContext = await provider.processContext(
              contextResults.filter(r => r.sourceType === contentType),
              processingOptions
            );
            break;
          } catch (error) {
            this.logger.warn(`Error processing context with provider for ${contentType}`, {
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }
      
      if (!processedContext) {
        // Fall back to basic processing
        processedContext = {
          formattedContent: contextResults.map(r => r.content).join('\n\n---\n\n'),
          sources: contextResults.map(r => ({ id: r.sourceId, type: r.sourceType })),
          totalSources: new Set(contextResults.map(r => r.sourceId)).size,
          truncated: false,
          metadata: {}
        };
      }
      
      // Apply prompt template with context
      const enhancedPrompt = this.applyTemplateWithContext(
        query, 
        promptTemplate, 
        processedContext.formattedContent,
        options
      );
      
      const endTime = performance.now();
      this.logger.info('Context-enhanced prompt created', {
        query: query.substring(0, 50),
        contextLength: processedContext.formattedContent.length,
        sourceCount: processedContext.totalSources,
        processingTimeMs: (endTime - startTime).toFixed(2)
      });
      
      return {
        prompt: enhancedPrompt,
        context: processedContext.formattedContent,
        sources: processedContext.sources,
        metadata: {
          ...processedContext.metadata,
          contextFound: true,
          truncated: processedContext.truncated
        }
      };
    } catch (error) {
      this.logger.error('Error creating context-enhanced prompt', {
        error: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 100)
      });
      
      // Return prompt without context on error
      return {
        prompt: this.applyTemplateWithoutContext(query, promptTemplate),
        context: '',
        sources: [],
        metadata: { 
          contextFound: false,
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * Apply template with context
   * @param query User query
   * @param template Prompt template
   * @param context Context to include
   * @param options Enhancement options
   * @returns Formatted prompt
   */
  private applyTemplateWithContext(
    query: string,
    template: string,
    context: string,
    options: PromptEnhancementOptions
  ): string {
    // Check if the template has placeholders
    const hasQueryPlaceholder = template.includes('{query}');
    const hasContextPlaceholder = template.includes('{context}');
    
    if (hasQueryPlaceholder && hasContextPlaceholder) {
      // Replace both placeholders
      return template
        .replace('{query}', query)
        .replace('{context}', context);
    } else if (hasQueryPlaceholder) {
      // Only query placeholder, append context
      return template.replace('{query}', query) +
        `\n\nRelevant context:\n${context}`;
    } else if (hasContextPlaceholder) {
      // Only context placeholder, append query
      return template.replace('{context}', context) +
        `\n\nUser query: ${query}`;
    } else {
      // No placeholders, use default format
      return `${template}\n\nRelevant context:\n${context}\n\nUser query: ${query}`;
    }
  }

  /**
   * Apply template without context
   * @param query User query
   * @param template Prompt template
   * @returns Formatted prompt
   */
  private applyTemplateWithoutContext(query: string, template: string): string {
    // Check if the template has query placeholder
    if (template.includes('{query}')) {
      return template.replace('{query}', query);
    } else {
      // No placeholder, append query
      return `${template}\n\nUser query: ${query}`;
    }
  }

  /**
   * Analyze a query to enhance retrieval effectiveness
   * @param query The query to analyze
   * @param options Analysis options
   * @returns Analysis of the query
   */
  async analyzeQuery(
    query: string,
    options: AnalysisOptions = {}
  ): Promise<QueryAnalysisResult> {
    return this.queryAnalyzer.analyzeQuery(query, options);
  }

  /**
   * Generate embedding for text
   * @param text Text to embed
   * @param options Embedding options
   * @returns Vector embedding
   */
  async generateEmbedding(
    text: string,
    options: EmbeddingOptions = {}
  ): Promise<number[]> {
    try {
      return await this.openAiConnector.generateEmbedding(text);
    } catch (error) {
      this.logger.error('Error generating embedding', {
        error: error instanceof Error ? error.message : String(error),
        textLength: text.length
      });
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts
   * @param texts Array of texts to embed
   * @param options Embedding options
   * @returns Array of vector embeddings
   */
  async generateEmbeddings(
    texts: string[],
    options: EmbeddingOptions = {}
  ): Promise<number[][]> {
    try {
      // Process in batches to ensure correct typing
      if (texts.length === 0) {
        return [];
      }
      
      // Process in smaller batches to avoid rate limits
      const batchSize = 10;
      const allEmbeddings: number[][] = [];
      
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(text => this.openAiConnector.generateEmbedding(text))
        );
        allEmbeddings.push(...batchResults);
      }
      
      return allEmbeddings;
    } catch (error) {
      this.logger.error('Error generating embeddings', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Delete content from the knowledge base
   * @param sourceId Source identifier
   * @param sourceType Type of source
   * @returns Whether delete was successful
   */
  async deleteContent(sourceId: string, sourceType: string): Promise<boolean> {
    try {
      const provider = this.getContextProvider(sourceType);
      
      if (!provider) {
        this.logger.warn('No context provider found for content type', {
          sourceType,
          sourceId
        });
        return false;
      }
      
      return provider.deleteContext(sourceId, sourceType);
    } catch (error) {
      this.logger.error('Error deleting content', {
        error: error instanceof Error ? error.message : String(error),
        sourceId,
        sourceType
      });
      return false;
    }
  }

  /**
   * Set the conversation memory service
   * @param conversationMemory ConversationMemoryService instance
   */
  setConversationMemory(conversationMemory: ConversationMemoryService): void {
    this.conversationMemory = conversationMemory;
    this.logger.info('Conversation memory service set');
  }

  /**
   * Get the conversation memory service
   * @returns ConversationMemoryService instance or undefined
   */
  getConversationMemory(): ConversationMemoryService | undefined {
    return this.conversationMemory;
  }

  /**
   * Create a context-enhanced prompt with conversation history
   * @param query User query
   * @param promptTemplate Template for the prompt
   * @param conversationId Conversation ID to include history from
   * @param options Options for context retrieval and prompt enhancement
   * @returns Enhanced prompt with context
   */
  async createPromptWithConversationContext(
    query: string,
    promptTemplate: string,
    conversationId: string,
    options: RetrievalOptions & PromptEnhancementOptions & {
      includeConversationHistory?: boolean;
      maxHistoryMessages?: number;
    } = {}
  ): Promise<PromptWithContext> {
    const startTime = performance.now();
    
    if (!this.conversationMemory) {
      this.logger.warn('No conversation memory service available');
      return this.createContextEnhancedPrompt(query, promptTemplate, options);
    }
    
    try {
      // Get conversation history
      const includeHistory = options.includeConversationHistory !== false;
      const maxMessages = options.maxHistoryMessages || 5;
      
      let conversationContext = '';
      
      if (includeHistory) {
        conversationContext = this.conversationMemory.getRecentContext(
          conversationId, 
          maxMessages
        );
      }
      
      // Get regular context
      const enhancedPrompt = await this.createContextEnhancedPrompt(
        query, 
        promptTemplate, 
        options
      );
      
      // If no conversation context, just return the regular enhanced prompt
      if (!conversationContext) {
        return enhancedPrompt;
      }
      
      // Combine conversation history with retrieved context
      const combinedContext = `CONVERSATION HISTORY:\n${conversationContext}\n\nRETRIEVED CONTEXT:\n${enhancedPrompt.context}`;
      
      // Apply template with combined context
      const finalPrompt = this.applyTemplateWithContext(
        query,
        promptTemplate,
        combinedContext,
        options
      );
      
      const endTime = performance.now();
      this.logger.info('Created prompt with conversation context', {
        query: query.substring(0, 50),
        conversationId,
        historyIncluded: includeHistory,
        processingTimeMs: (endTime - startTime).toFixed(2)
      });
      
      return {
        prompt: finalPrompt,
        context: combinedContext,
        sources: enhancedPrompt.sources,
        metadata: {
          ...enhancedPrompt.metadata,
          conversationHistoryIncluded: true
        }
      };
    } catch (error) {
      this.logger.error('Error creating prompt with conversation context', {
        error: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 100),
        conversationId
      });
      
      // Fall back to regular context-enhanced prompt
      return this.createContextEnhancedPrompt(query, promptTemplate, options);
    }
  }

  /**
   * Store conversation as context
   * @param conversationId Conversation ID
   * @param options Storage options
   * @returns Whether storage was successful
   */
  async storeConversationAsContext(
    conversationId: string,
    options: ContextStorageOptions & { contextType?: string } = {}
  ): Promise<boolean> {
    if (!this.conversationMemory) {
      this.logger.warn('No conversation memory service available');
      return false;
    }
    
    try {
      // Get conversation chunks
      const chunks = this.conversationMemory.getConversationChunks(conversationId);
      
      if (chunks.length === 0) {
        this.logger.warn('No conversation chunks found', { conversationId });
        return false;
      }
      
      // Determine context type
      const contextType = options.contextType || 'conversation';
      const provider = this.getContextProvider(contextType);
      
      if (!provider) {
        this.logger.warn('No context provider for conversation storage', { contextType });
        return false;
      }
      
      // Store the chunks
      const storageOptions: ContextStorageOptions = {
        ...options,
        metadata: {
          ...options.metadata,
          conversationId,
          contentType: 'conversation'
        }
      };
      
      await provider.storeContext(chunks, storageOptions);
      
      this.logger.info('Stored conversation as context', {
        conversationId,
        contextType,
        chunkCount: chunks.length
      });
      
      return true;
    } catch (error) {
      this.logger.error('Error storing conversation as context', {
        error: error instanceof Error ? error.message : String(error),
        conversationId
      });
      return false;
    }
  }
}