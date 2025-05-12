/**
 * Dynamic RAG Graph
 * 
 * Implements a dynamic LangGraph-based RAG pipeline with distinct nodes for
 * query analysis, context retrieval, and content generation.
 * Uses the DynamicGraphService for better maintainability and runtime modifications.
 */

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { 
  UnifiedRAGService, 
  QueryAnalysisResult,
  PromptWithContext,
  AnalysisOptions
} from '../core/unified-rag.service';
import { DynamicGraphService, DynamicGraphState } from '../../langgraph/dynamic/dynamic-graph.service';
import { 
  DynamicGraphNode, 
  DynamicGraphEdge, 
  GraphModificationType 
} from '../../langgraph/dynamic/interfaces/graph-modification.interface';
import { v4 as uuidv4 } from 'uuid';
import { START, END } from '@langchain/langgraph';

// RAG State extending the DynamicGraphState
export interface RAGDynamicState extends DynamicGraphState {
  query: string;
  originalQuery?: string;
  analysisResult?: QueryAnalysisResult;
  retrievedContext?: string;
  contextSources?: Array<{ id: string; type: string }>;
  enhancedPrompt?: string;
  finalResponse?: string;
  ragMetadata: {
    userId?: string;
    conversationId?: string;
    timestamp: number;
    sourceTypes?: string[];
    [key: string]: any;
  };
  ragConfig: {
    promptTemplate?: string;
    maxContextLength?: number;
    retrievalLimit?: number;
    useAnalysis?: boolean;
    includeConversationContext?: boolean;
    temperature?: number;
    [key: string]: any;
  };
}

/**
 * Dynamic RAG Graph Factory
 * 
 * Creates and configures a dynamic RAG graph with analysis, retrieval, and generation nodes
 */
export class DynamicRAGGraphFactory {
  private ragService: UnifiedRAGService;
  private logger: Logger;
  private graphService: DynamicGraphService<RAGDynamicState>;
  
  constructor(ragService: UnifiedRAGService, logger: Logger = new ConsoleLogger()) {
    this.ragService = ragService;
    this.logger = logger;
    
    // Initialize the dynamic graph service with initial nodes and edges
    this.graphService = new DynamicGraphService<RAGDynamicState>({
      logger: this.logger
    });
    
    // Initialize the graph with standard RAG nodes and edges
    this.initializeGraph();
  }
  
  /**
   * Initialize the RAG graph with standard nodes and edges
   */
  private initializeGraph(): void {
    // Create node handlers
    
    // Query Analysis Node
    const queryAnalysisHandler = async (state: RAGDynamicState): Promise<RAGDynamicState> => {
      try {
        // Skip if analysis is disabled
        if (state.ragConfig.useAnalysis === false) {
          return state;
        }
        
        this.logger.info('Analyzing query', { query: state.query });
        
        // Store original query
        const originalQuery = state.query;
        
        // Perform query analysis
        const analysisResult = await this.ragService.analyzeQuery(state.query, {
          deepAnalysis: true,
          extractEntities: true
        });
        
        // Use enhanced query if available
        const enhancedQuery = analysisResult.enhancedQuery || state.query;
        
        this.logger.debug('Query analysis completed', {
          originalQuery,
          enhancedQuery,
          identifiedIntents: analysisResult.requiredContextTypes,
          recommendedSources: analysisResult.requiredContextTypes
        });
        
        // Return updated state
        return {
          ...state,
          query: enhancedQuery,
          originalQuery,
          analysisResult,
          ragMetadata: {
            ...state.ragMetadata,
            queryAnalysisTime: Date.now() - state.ragMetadata.timestamp
          }
        };
      } catch (error) {
        this.logger.error('Error in query analysis node', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Continue with original query on error
        return state;
      }
    };
    
    // Context Retrieval Node
    const contextRetrievalHandler = async (state: RAGDynamicState): Promise<RAGDynamicState> => {
      try {
        this.logger.info('Retrieving context', { query: state.query });
        
        // Set up retrieval options
        const retrievalOptions = {
          limit: state.ragConfig.retrievalLimit || 5,
          minScore: 0.7,
          distinctSources: true,
          userId: state.ragMetadata.userId,
          contextType: state.analysisResult?.requiredContextTypes || undefined
        };
        
        // Add conversation context if enabled
        if (state.ragConfig.includeConversationContext && state.ragMetadata.conversationId) {
          const memory = this.ragService.getConversationMemory();
          if (memory) {
            // Get conversation context
            const conversationContext = memory.getRecentContext(
              state.ragMetadata.conversationId,
              5 // Get last 5 messages
            );
            
            if (conversationContext) {
              this.logger.debug('Including conversation context', {
                conversationId: state.ragMetadata.conversationId
              });
              
              // Create enhanced prompt with both retrieval and conversation context
              const promptWithContext = await this.ragService.createPromptWithConversationContext(
                state.query,
                state.ragConfig.promptTemplate || "Answer the question based on the context:\n\nContext: {context}\n\nQuestion: {query}\n\nAnswer:",
                state.ragMetadata.conversationId,
                {
                  ...retrievalOptions,
                  includeConversationHistory: true,
                  maxHistoryMessages: 5
                }
              );
              
              return {
                ...state,
                retrievedContext: promptWithContext.context,
                contextSources: promptWithContext.sources,
                enhancedPrompt: promptWithContext.prompt,
                ragMetadata: {
                  ...state.ragMetadata,
                  contextRetrievalTime: Date.now() - state.ragMetadata.timestamp,
                  contextLength: promptWithContext.context.length,
                  sourceCount: promptWithContext.sources.length
                }
              };
            }
          }
        }
        
        // Standard context retrieval if conversation context wasn't used
        const promptWithContext = await this.ragService.createContextEnhancedPrompt(
          state.query,
          state.ragConfig.promptTemplate || "Answer the question based on the context:\n\nContext: {context}\n\nQuestion: {query}\n\nAnswer:",
          retrievalOptions
        );
        
        this.logger.debug('Context retrieved', {
          contextLength: promptWithContext.context.length,
          sourceCount: promptWithContext.sources.length
        });
        
        // Return updated state
        return {
          ...state,
          retrievedContext: promptWithContext.context,
          contextSources: promptWithContext.sources,
          enhancedPrompt: promptWithContext.prompt,
          ragMetadata: {
            ...state.ragMetadata,
            contextRetrievalTime: Date.now() - state.ragMetadata.timestamp,
            contextLength: promptWithContext.context.length,
            sourceCount: promptWithContext.sources.length
          }
        };
      } catch (error) {
        this.logger.error('Error in context retrieval node', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Continue without context on error
        const fallbackPrompt = state.ragConfig.promptTemplate?.replace(
          '{context}',
          'No relevant context found.'
        ).replace('{query}', state.query);
        
        return {
          ...state,
          retrievedContext: 'No relevant context could be retrieved due to an error.',
          enhancedPrompt: fallbackPrompt || state.query,
          contextSources: [],
          ragMetadata: {
            ...state.ragMetadata,
            retrieval_error: error instanceof Error ? error.message : String(error)
          }
        };
      }
    };
    
    // Response Generation Node
    const responseGenerationHandler = async (state: RAGDynamicState): Promise<RAGDynamicState> => {
      try {
        this.logger.info('Generating response', {
          queryLength: state.query.length,
          hasContext: !!state.retrievedContext
        });
        
        if (!state.enhancedPrompt) {
          throw new Error('No enhanced prompt available for response generation');
        }
        
        // Get OpenAI connector through the RAG service
        const memory = this.ragService.getConversationMemory();
        let openAiConnector;
        
        if (memory) {
          openAiConnector = memory.getOpenAIConnector();
        } else {
          // Fallback - create a new connector
          const { OpenAIConnector } = await import('../../connectors/openai-connector');
          openAiConnector = new OpenAIConnector({ logger: this.logger });
        }
        
        // Generate the response
        const response = await openAiConnector.generateResponse([
          { role: 'system', content: 'You are a helpful assistant that answers questions based on the provided context.' },
          { role: 'user', content: state.enhancedPrompt }
        ], {
          temperature: state.ragConfig.temperature || 0.3,
          maxTokens: 1000
        });
        
        // Store the conversation if memory is available
        if (state.ragMetadata.conversationId && memory) {
          await memory.addMessage(
            state.ragMetadata.conversationId,
            'assistant',
            String(response)
          );
        }
        
        this.logger.debug('Response generated', {
          responseLength: String(response).length
        });
        
        // Return updated state
        return {
          ...state,
          finalResponse: String(response),
          ragMetadata: {
            ...state.ragMetadata,
            responseGenerationTime: Date.now() - state.ragMetadata.timestamp,
            totalProcessingTime: Date.now() - state.ragMetadata.timestamp
          }
        };
      } catch (error) {
        this.logger.error('Error in response generation node', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Provide a fallback response
        return {
          ...state,
          finalResponse: "I'm sorry, but I couldn't generate a response based on the provided information. Please try again or rephrase your question.",
          ragMetadata: {
            ...state.ragMetadata,
            generation_error: error instanceof Error ? error.message : String(error)
          }
        };
      }
    };
    
    // Define nodes
    const queryAnalysisNode: DynamicGraphNode<RAGDynamicState> = {
      id: 'queryAnalysis',
      type: 'queryAnalysis',
      label: 'Query Analysis',
      handler: queryAnalysisHandler,
      metadata: {
        description: 'Analyzes the input query to improve retrieval effectiveness'
      }
    };
    
    const contextRetrievalNode: DynamicGraphNode<RAGDynamicState> = {
      id: 'contextRetrieval',
      type: 'contextRetrieval',
      label: 'Context Retrieval',
      handler: contextRetrievalHandler,
      metadata: {
        description: 'Retrieves relevant context based on the query'
      }
    };
    
    const responseGenerationNode: DynamicGraphNode<RAGDynamicState> = {
      id: 'responseGeneration',
      type: 'responseGeneration',
      label: 'Response Generation',
      handler: responseGenerationHandler,
      metadata: {
        description: 'Generates the final response based on the enhanced prompt'
      }
    };
    
    // Apply nodes to the graph service
    this.graphService.applyModification({
      id: uuidv4(),
      type: GraphModificationType.ADD_NODE,
      timestamp: Date.now(),
      node: queryAnalysisNode
    });
    
    this.graphService.applyModification({
      id: uuidv4(),
      type: GraphModificationType.ADD_NODE,
      timestamp: Date.now(),
      node: contextRetrievalNode
    });
    
    this.graphService.applyModification({
      id: uuidv4(),
      type: GraphModificationType.ADD_NODE,
      timestamp: Date.now(),
      node: responseGenerationNode
    });
    
    // Define edges
    const startToQueryEdge: DynamicGraphEdge = {
      id: 'start_to_query',
      source: START,
      target: 'queryAnalysis',
      label: 'Start → Query Analysis'
    };
    
    const queryToContextEdge: DynamicGraphEdge = {
      id: 'query_to_context',
      source: 'queryAnalysis',
      target: 'contextRetrieval',
      label: 'Query Analysis → Context Retrieval'
    };
    
    const contextToResponseEdge: DynamicGraphEdge = {
      id: 'context_to_response',
      source: 'contextRetrieval',
      target: 'responseGeneration',
      label: 'Context Retrieval → Response Generation'
    };
    
    const responseToEndEdge: DynamicGraphEdge = {
      id: 'response_to_end',
      source: 'responseGeneration',
      target: END,
      label: 'Response Generation → End'
    };
    
    // Apply edges to the graph service
    this.graphService.applyModification({
      id: uuidv4(),
      type: GraphModificationType.ADD_EDGE,
      timestamp: Date.now(),
      edge: startToQueryEdge
    });
    
    this.graphService.applyModification({
      id: uuidv4(),
      type: GraphModificationType.ADD_EDGE,
      timestamp: Date.now(),
      edge: queryToContextEdge
    });
    
    this.graphService.applyModification({
      id: uuidv4(),
      type: GraphModificationType.ADD_EDGE,
      timestamp: Date.now(),
      edge: contextToResponseEdge
    });
    
    this.graphService.applyModification({
      id: uuidv4(),
      type: GraphModificationType.ADD_EDGE,
      timestamp: Date.now(),
      edge: responseToEndEdge
    });
  }
  
  /**
   * Create the graph using the dynamic graph service
   * @returns Created StateGraph
   */
  createGraph() {
    return this.graphService.createGraph();
  }
  
  /**
   * Execute the RAG pipeline with a query
   * @param query User query
   * @param config Configuration options
   * @param metadata Additional metadata
   * @returns RAG execution result with final response
   */
  async execute(
    query: string,
    config: Partial<RAGDynamicState['ragConfig']> = {},
    metadata: Partial<RAGDynamicState['ragMetadata']> = {}
  ): Promise<RAGDynamicState> {
    // Create initial state
    const initialState: Partial<RAGDynamicState> = {
      query,
      ragMetadata: {
        timestamp: Date.now(),
        ...metadata
      },
      ragConfig: {
        useAnalysis: true,
        includeConversationContext: true,
        maxContextLength: 4000,
        retrievalLimit: 5,
        temperature: 0.3,
        ...config
      }
    };
    
    // Execute graph
    return this.graphService.execute(initialState);
  }
  
  /**
   * Get the underlying dynamic graph service
   * @returns The dynamic graph service
   */
  getGraphService(): DynamicGraphService<RAGDynamicState> {
    return this.graphService;
  }
} 