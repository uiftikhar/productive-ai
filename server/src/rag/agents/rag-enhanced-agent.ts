/**
 * RagEnhancedAgent - Base class for agents with RAG capabilities
 * 
 * This class extends the BaseAgent with Retrieval Augmented Generation capabilities,
 * using proper dependency injection to avoid circular dependencies.
 */
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { BaseAgent } from '../../langgraph/agents/base-agent';
import { IRagService } from '../interfaces/rag.interface';
import { RetrievalOptions, RetrievalResult } from '../context/context-provider.interface';
import { PromptWithContext } from '../core/unified-rag.service.interface';

export interface RagEnhancedAgentConfig {
  id?: string;
  name?: string;
  logger?: Logger;
  retrievalOptions?: RetrievalOptions;
  includeRetrievedContext?: boolean;
  ragContextPromptTemplate?: string;
}

/**
 * Base class for agents enhanced with RAG capabilities
 */
export class RagEnhancedAgent extends BaseAgent {
  protected readonly logger: Logger;
  protected readonly retrievalOptions: RetrievalOptions;
  protected readonly includeRetrievedContext: boolean;
  protected readonly ragContextPromptTemplate: string;
  protected readonly ragService: IRagService;

  constructor(
    ragService: IRagService, 
    config: RagEnhancedAgentConfig = {}
  ) {
    super({
      id: config.id,
      name: config.name || 'RAG-Enhanced Agent',
    });
    
    this.ragService = ragService;
    this.logger = config.logger || new ConsoleLogger();
    this.retrievalOptions = config.retrievalOptions || {};
    this.includeRetrievedContext = config.includeRetrievedContext !== false;
    this.ragContextPromptTemplate = config.ragContextPromptTemplate || 
      'Here is relevant context from previous documents or knowledge:\n\n{context}\n\n' +
      'Use this context to help answer the following question or task.';
  }

  /**
   * Retrieve context from the RAG service
   */
  protected async retrieveContext(query: string, options?: RetrievalOptions): Promise<RetrievalResult[]> {
    try {
      const mergedOptions = { ...this.retrievalOptions, ...options };
      const results = await this.ragService.retrieveContext(query, mergedOptions);
      return results;
    } catch (error) {
      this.logger.error('Error retrieving context from RAG service', { error });
      return [];
    }
  }

  /**
   * Format retrieved context into a string for prompt enhancement
   */
  protected formatRetrievedContext(contextResults: RetrievalResult[]): string {
    if (!contextResults || contextResults.length === 0) {
      return '';
    }

    return contextResults
      .map((result, index) => {
        const score = result.score ? ` (Relevance: ${(result.score * 100).toFixed(1)}%)` : '';
        return `[${index + 1}]${score}\n${result.content}`;
      })
      .join('\n\n');
  }

  /**
   * Create a context-enhanced prompt using the RAG service
   */
  protected async createContextEnhancedPrompt(
    basePrompt: string,
    query: string,
    options?: RetrievalOptions
  ): Promise<string> {
    // Skip if context enhancement is disabled
    if (!this.includeRetrievedContext) {
      return basePrompt;
    }

    try {
      // Create a template that includes the base prompt
      const promptTemplate = `${this.ragContextPromptTemplate}\n\n${basePrompt}`;
      
      // Use the RAG service's built-in method for context-enhanced prompts
      const enhancedPrompt: PromptWithContext = await this.ragService.createContextEnhancedPrompt(
        query,
        promptTemplate,
        options
      );
      
      return enhancedPrompt.prompt;
    } catch (error) {
      this.logger.error('Error creating context-enhanced prompt', { error });
      return basePrompt;
    }
  }

  /**
   * Process input with RAG-enhanced context
   */
  public async processWithRagContext(input: string, query?: string): Promise<string> {
    const queryText = query || input;
    const enhancedPrompt = await this.createContextEnhancedPrompt(input, queryText);
    
    // Process the enhanced prompt using the agent's standard processing
    return this.processPrompt(enhancedPrompt);
  }
  
  /**
   * Process a prompt to generate a response
   * This should be implemented by derived classes
   */
  protected async processPrompt(prompt: string): Promise<string> {
    throw new Error('Method processPrompt must be implemented by derived classes');
  }
} 