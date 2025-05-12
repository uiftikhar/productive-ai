/**
 * Context-Aware Base Agent
 * 
 * This abstract base class provides common RAG functionality for agents,
 * allowing them to easily integrate context retrieval in their operations.
 */

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { UnifiedRAGService } from '../core/unified-rag.service';
import { RetrievalOptions } from '../context/context-provider.interface';
import { PromptEnhancementOptions } from '../core/unified-rag.service.interface';
import { MessageConfig } from '../../connectors/language-model-provider.interface';

export interface ContextAwareAgentConfig {
  logger?: Logger;
  openAiConnector?: OpenAIConnector;
  ragService?: UnifiedRAGService;
}

export abstract class ContextAwareBaseAgent {
  protected logger: Logger;
  protected openAiConnector: OpenAIConnector;
  protected ragService: UnifiedRAGService;
  
  constructor(config: ContextAwareAgentConfig) {
    this.logger = config.logger || new ConsoleLogger();
    this.openAiConnector = config.openAiConnector || new OpenAIConnector({ logger: this.logger });
    
    if (!config.ragService) {
      throw new Error('RAG service is required for context-aware agents');
    }
    this.ragService = config.ragService;
  }

  /**
   * Get relevant context based on a query
   * @param query The query to retrieve context for
   * @param options Retrieval options
   * @returns Formatted context string
   */
  protected async getRelevantContext(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<string> {
    try {
      this.logger.debug('Getting relevant context', {
        query: query.substring(0, 100),
        contextType: options.contextType
      });
      
      const results = await this.ragService.retrieveContext(query, options);
      
      if (results.length === 0) {
        return '';
      }
      
      // Format the results as a string
      return results.map(result => {
        const source = result.sourceId ? ` (Source: ${result.sourceId})` : '';
        return `${result.content}${source}`;
      }).join('\n\n---\n\n');
    } catch (error) {
      this.logger.error('Error getting relevant context', {
        error: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 100)
      });
      return '';
    }
  }

  /**
   * Generate a response with context enhancement
   * @param query The query or instruction
   * @param systemPrompt The system prompt
   * @param retrievalOptions Options for context retrieval
   * @param promptOptions Options for prompt enhancement
   * @param modelOptions Options for the model
   * @returns Generated response
   */
  protected async generateResponseWithContext(
    query: string,
    systemPrompt: string,
    retrievalOptions: RetrievalOptions = {},
    promptOptions: PromptEnhancementOptions = {},
    modelOptions: { temperature?: number; maxTokens?: number } = {}
  ): Promise<string> {
    try {
      this.logger.debug('Generating response with context', {
        query: query.substring(0, 100),
        contextType: retrievalOptions.contextType
      });
      
      // Create template that includes system prompt
      const promptTemplate = `${systemPrompt}\n\nRespond to the following query based on the provided context.`;
      
      // Get context-enhanced prompt
      const enhancedPrompt = await this.ragService.createContextEnhancedPrompt(
        query,
        promptTemplate,
        {
          ...retrievalOptions,
          ...promptOptions
        }
      );
      
      // Prepare messages for the model
      const messages: MessageConfig[] = [
        { role: 'system', content: enhancedPrompt.prompt }
      ];
      
      // Generate response
      const response = await this.openAiConnector.generateResponse(
        messages,
        {
          temperature: modelOptions.temperature || 0.2,
          maxTokens: modelOptions.maxTokens || 1000
        }
      );
      
      return String(response);
    } catch (error) {
      this.logger.error('Error generating response with context', {
        error: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 100)
      });
      throw error;
    }
  }

  /**
   * Format retrieved context for analysis
   * @param retrievalResults Raw context retrieval results
   * @returns Formatted context string
   */
  protected formatContextForAnalysis(retrievalResults: any[]): string {
    if (!Array.isArray(retrievalResults) || retrievalResults.length === 0) {
      return 'No relevant context found.';
    }
    
    return retrievalResults.map((result, index) => {
      const content = result.content || result.text || 'No content';
      const source = result.sourceId || result.source || 'Unknown source';
      return `[${index + 1}] From ${source}:\n${content}`;
    }).join('\n\n');
  }

  /**
   * Analyze a query to determine needed context
   * @param query The query to analyze
   * @returns Analysis result with enhanced query and context types
   */
  protected async analyzeQueryForContext(query: string): Promise<{
    enhancedQuery: string;
    contextTypes: string[];
  }> {
    try {
      const analysis = await this.ragService.analyzeQuery(query, {
        deepAnalysis: true,
        extractEntities: true
      });
      
      return {
        enhancedQuery: analysis.enhancedQuery,
        contextTypes: analysis.requiredContextTypes
      };
    } catch (error) {
      this.logger.error('Error analyzing query for context', {
        error: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 100)
      });
      
      // Return original query and default context types
      return {
        enhancedQuery: query,
        contextTypes: ['meeting_transcript']
      };
    }
  }

  /**
   * Determine if a query needs context enhancement
   * @param query The query to check
   * @returns Whether context enhancement is needed
   */
  protected needsContextEnhancement(query: string): boolean {
    // Check if query is likely to benefit from context
    const lowerQuery = query.toLowerCase();
    
    // Simple heuristic check for queries that likely need context
    const contextIndicators = [
      'what was said about',
      'what did',
      'who mentioned',
      'when was',
      'in the meeting',
      'from the transcript',
      'in the conversation',
      'what is',
      'how does',
      'tell me about',
      'summarize',
      'explain'
    ];
    
    return contextIndicators.some(indicator => lowerQuery.includes(indicator));
  }
}