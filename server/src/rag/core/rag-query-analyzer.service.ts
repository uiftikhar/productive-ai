/**
 * RAG Query Analyzer Service
 * 
 * This service analyzes queries to enhance retrieval effectiveness by:
 * 1. Identifying key entities and concepts
 * 2. Inferring user intent
 * 3. Determining relevant context types
 * 4. Expanding or refining queries
 */

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { QueryAnalysisResult, AnalysisOptions } from './unified-rag.service.interface';
import { MessageConfig } from '../../connectors/language-model-provider.interface';

export class RAGQueryAnalyzerService {
  private logger: Logger;
  private openAiConnector: OpenAIConnector;

  constructor(options: {
    logger?: Logger;
    openAiConnector?: OpenAIConnector;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.openAiConnector = options.openAiConnector || new OpenAIConnector({ logger: this.logger });
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
    this.logger.debug('Analyzing query', { query: query.substring(0, 100), options });
    
    try {
      // For deep analysis, use LLM to analyze the query
      if (options.deepAnalysis) {
        return this.performDeepQueryAnalysis(query, options);
      }
      
      // For simple analysis, use heuristics
      return this.performSimpleQueryAnalysis(query, options);
    } catch (error) {
      this.logger.error('Error analyzing query', {
        error: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 100)
      });
      
      // Return basic analysis on error
      return {
        enhancedQuery: query,
        extractedEntities: [],
        inferredIntent: 'information_retrieval',
        requiredContextTypes: ['general'],
        confidence: 0.5
      };
    }
  }

  /**
   * Perform simple query analysis using heuristics
   * @param query The query to analyze
   * @param options Analysis options
   * @returns Analysis of the query
   */
  private performSimpleQueryAnalysis(
    query: string,
    options: AnalysisOptions
  ): QueryAnalysisResult {
    // Extract potential entities (capitalized words, quoted phrases)
    const entities = this.extractEntitiesWithRegex(query);
    
    // Determine intent based on question words
    const intent = this.inferIntentFromKeywords(query);
    
    // Determine relevant context types
    const contextTypes = this.determineContextTypes(query, intent);
    
    return {
      enhancedQuery: query,
      extractedEntities: entities,
      inferredIntent: intent,
      requiredContextTypes: contextTypes,
      confidence: 0.7
    };
  }

  /**
   * Perform deep query analysis using LLM
   * @param query The query to analyze
   * @param options Analysis options
   * @returns Analysis of the query
   */
  private async performDeepQueryAnalysis(
    query: string,
    options: AnalysisOptions
  ): Promise<QueryAnalysisResult> {
    const analysisPrompt = `
    Analyze the following query for retrieval-augmented generation:
    
    Query: "${query}"
    
    Your task is to:
    1. Extract key entities and concepts from the query
    2. Infer the user's intent (e.g., information_retrieval, summarization, comparison, etc.)
    3. Determine what types of context would be most relevant (e.g., meeting_transcript, documentation, code, etc.)
    4. Provide an enhanced version of the query that might improve retrieval
    
    Format your response as JSON:
    {
      "enhancedQuery": "string",
      "extractedEntities": ["entity1", "entity2", ...],
      "inferredIntent": "string",
      "requiredContextTypes": ["type1", "type2", ...],
      "confidence": number (0.0-1.0)
    }
    `;
    
    try {
      const messages: MessageConfig[] = [
        { role: 'system', content: 'You are a query analysis assistant that helps improve retrieval for RAG systems.' },
        { role: 'user', content: analysisPrompt }
      ];
      
      const response = await this.openAiConnector.generateResponse(messages, {
        temperature: 0.1,
        maxTokens: 800
      });
      
      // Parse JSON response
      try {
        // Get response as string
        const responseText = String(response);
        
        // Find JSON object in response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]) as QueryAnalysisResult;
          return {
            enhancedQuery: result.enhancedQuery || query,
            extractedEntities: result.extractedEntities || [],
            inferredIntent: result.inferredIntent || 'information_retrieval',
            requiredContextTypes: result.requiredContextTypes || ['general'],
            confidence: result.confidence || 0.8
          };
        }
      } catch (parseError) {
        const responsePreview = String(response).slice(0, 200);
        this.logger.warn('Failed to parse LLM response as JSON', {
          error: parseError instanceof Error ? parseError.message : String(parseError),
          response: responsePreview
        });
      }
      
      // Fallback to simple analysis if parsing fails
      return this.performSimpleQueryAnalysis(query, options);
    } catch (error) {
      this.logger.error('Error in deep query analysis', {
        error: error instanceof Error ? error.message : String(error)
      });
      return this.performSimpleQueryAnalysis(query, options);
    }
  }

  /**
   * Extract entities using regex patterns
   * @param query The query text
   * @returns Extracted entities
   */
  private extractEntitiesWithRegex(query: string): string[] {
    const entities: string[] = [];
    
    // Extract quoted phrases
    const quotedPattern = /"([^"]+)"|'([^']+)'/g;
    let match;
    while ((match = quotedPattern.exec(query)) !== null) {
      entities.push(match[1] || match[2]);
    }
    
    // Extract capitalized words that might be proper nouns
    const capitalizedPattern = /\b([A-Z][a-z]+)\b/g;
    while ((match = capitalizedPattern.exec(query)) !== null) {
      if (!entities.includes(match[1])) {
        entities.push(match[1]);
      }
    }
    
    return entities;
  }

  /**
   * Infer intent based on keywords in the query
   * @param query The query text
   * @returns Inferred intent
   */
  private inferIntentFromKeywords(query: string): string {
    const lowerQuery = query.toLowerCase();
    
    // Check for summarization intent
    if (
      lowerQuery.includes('summarize') ||
      lowerQuery.includes('summary') ||
      lowerQuery.includes('overview') ||
      lowerQuery.includes('key points')
    ) {
      return 'summarization';
    }
    
    // Check for comparison intent
    if (
      lowerQuery.includes('compare') ||
      lowerQuery.includes('difference') ||
      lowerQuery.includes('versus') ||
      lowerQuery.includes('vs')
    ) {
      return 'comparison';
    }
    
    // Check for decision intent
    if (
      lowerQuery.includes('decide') ||
      lowerQuery.includes('decision') ||
      lowerQuery.includes('which should') ||
      lowerQuery.includes('what should')
    ) {
      return 'decision_support';
    }
    
    // Default to information retrieval
    return 'information_retrieval';
  }

  /**
   * Determine relevant context types based on query and intent
   * @param query The query text
   * @param intent The inferred intent
   * @returns Relevant context types
   */
  private determineContextTypes(query: string, intent: string): string[] {
    const lowerQuery = query.toLowerCase();
    const contextTypes: string[] = [];
    
    // Check for meeting-related context
    if (
      lowerQuery.includes('meeting') ||
      lowerQuery.includes('discussion') ||
      lowerQuery.includes('call') ||
      lowerQuery.includes('conversation') ||
      lowerQuery.includes('said')
    ) {
      contextTypes.push('meeting_transcript');
    }
    
    // Check for document-related context
    if (
      lowerQuery.includes('document') ||
      lowerQuery.includes('doc') ||
      lowerQuery.includes('report') ||
      lowerQuery.includes('paper')
    ) {
      contextTypes.push('document');
    }
    
    // Check for code-related context
    if (
      lowerQuery.includes('code') ||
      lowerQuery.includes('function') ||
      lowerQuery.includes('api') ||
      lowerQuery.includes('implementation')
    ) {
      contextTypes.push('code');
    }
    
    // Default to general context if nothing specific was identified
    if (contextTypes.length === 0) {
      contextTypes.push('general');
    }
    
    return contextTypes;
  }
} 