/**
 * RAG Context Agent
 * 
 * Provides context-enhanced responses for meeting analysis using
 * Retrieval Augmented Generation techniques.
 */

import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { OpenAIConnector } from '../../../../connectors/openai-connector';
import { PineconeConnector } from '../../../../connectors/pinecone-connector';
import { UnifiedRAGService } from '../../../../rag/core/unified-rag.service';
import { MeetingContextProvider } from '../../../../rag/context/meeting-context-provider';
import { DocumentContextProvider } from '../../../../rag/context/document-context-provider';
import { ConversationMemoryService } from '../../../../rag/memory/conversation-memory.service';

export interface RAGContextAgentConfig {
  id: string;
  name: string;
  openAiConnector?: OpenAIConnector;
  pineconeConnector?: PineconeConnector;
  logger?: Logger;
  useMockMode?: boolean;
  retrievalLimit?: number;
  meetingId?: string;
  organizationId?: string;
}

/**
 * RAG Context Agent for meeting analysis
 * 
 * Provides context-aware responses by retrieving relevant information
 * from meeting transcripts and other context sources
 */
export class RAGContextAgent {
  private id: string;
  private name: string;
  private logger: Logger;
  private openAiConnector: OpenAIConnector;
  private pineconeConnector?: PineconeConnector;
  private ragService: UnifiedRAGService;
  private conversationMemoryService: ConversationMemoryService;
  private meetingId?: string;
  private organizationId?: string;
  private retrievalLimit: number;
  private useMockMode: boolean;
  
  constructor(config: RAGContextAgentConfig) {
    this.id = config.id;
    this.name = config.name;
    this.logger = config.logger || new ConsoleLogger();
    this.openAiConnector = config.openAiConnector || new OpenAIConnector({ logger: this.logger });
    this.pineconeConnector = config.pineconeConnector;
    this.retrievalLimit = config.retrievalLimit || 5;
    this.meetingId = config.meetingId;
    this.organizationId = config.organizationId;
    this.useMockMode = config.useMockMode || false;
    
    // Initialize conversation memory
    this.conversationMemoryService = new ConversationMemoryService({
      logger: this.logger,
      openAiConnector: this.openAiConnector
    });
    
    // Initialize context providers
    const meetingContextProvider = new MeetingContextProvider({
      logger: this.logger,
      openAiConnector: this.openAiConnector,
      pineconeConnector: this.pineconeConnector
    });
    
    const documentContextProvider = new DocumentContextProvider({
      logger: this.logger,
      openAiConnector: this.openAiConnector,
      pineconeConnector: this.pineconeConnector
    });
    
    // Initialize RAG service
    this.ragService = new UnifiedRAGService({
      logger: this.logger,
      openAiConnector: this.openAiConnector,
      contextProviders: {
        meeting_transcript: meetingContextProvider,
        document: documentContextProvider
      },
      conversationMemory: this.conversationMemoryService
    });
    
    this.logger.info('RAG Context Agent initialized', {
      agentId: this.id,
      hasPinecone: !!this.pineconeConnector
    });
  }
  
  /**
   * Process a message to provide a context-enhanced response
   * @param message The input message
   * @returns Context-enhanced response
   */
  async processMessage(message: { id: string; content: string; metadata?: any }): Promise<{ id: string; content: string; metadata?: any }> {
    if (this.useMockMode) {
      return this.mockProcessMessage(message);
    }
    
    try {
      const startTime = performance.now();
      const query = message.content;
      let conversationId = message.metadata?.conversationId;
      
      this.logger.info('Processing query with RAG', {
        messageId: message.id,
        queryLength: query.length
      });
      
      // Create or retrieve conversation
      if (!conversationId) {
        conversationId = this.conversationMemoryService.createConversation(
          message.metadata?.userId || 'anonymous',
          query,
          { meetingId: this.meetingId, source: 'rag-context-agent' }
        );
      }
      
      // Store user message
      await this.conversationMemoryService.addMessage(
        conversationId,
        'user',
        query,
        message.metadata
      );
      
      // Analyze query
      const analysisResult = await this.ragService.analyzeQuery(query, {
        deepAnalysis: true,
        extractEntities: true
      });
      
      // Enhanced query
      const enhancedQuery = analysisResult.enhancedQuery || query;
      
      // Retrieval options
      const retrievalOptions = {
        limit: this.retrievalLimit,
        minScore: 0.7,
        distinctSources: true,
        userId: message.metadata?.userId,
        meetingId: this.meetingId,
        contextType: analysisResult.requiredContextTypes,
        includeConversationHistory: true,
        maxHistoryMessages: 5
      };
      
      // Get context-enhanced prompt
      const enhancedPrompt = await this.ragService.createPromptWithConversationContext(
        enhancedQuery,
        "Based on the meeting context, please answer the following query:\n\nContext: {context}\n\nQuery: {query}\n\nAnswer:",
        conversationId,
        retrievalOptions
      );
      
      // Generate response
      const systemPrompt = `You are a helpful assistant that provides concise, accurate answers based on meeting context. 
Use only the provided context and avoid making assumptions or adding information not present in the context.
If you don't have enough information to answer, acknowledge the limitations.`;
      
      const response = await this.openAiConnector.generateResponse([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: enhancedPrompt.prompt }
      ], {
        temperature: 0.3,
        maxTokens: 1000
      });
      
      // Store assistant response
      await this.conversationMemoryService.addMessage(
        conversationId,
        'assistant',
        String(response)
      );
      
      const processingTime = performance.now() - startTime;
      
      this.logger.info('Generated context-enhanced response', {
        messageId: message.id,
        processingTimeMs: processingTime.toFixed(2),
        sourceCount: enhancedPrompt.sources.length
      });
      
      // Format response
      return {
        id: `response-${message.id}`,
        content: String(response),
        metadata: {
          ...message.metadata,
          conversationId,
          processingTimeMs: processingTime,
          contextSources: enhancedPrompt.sources,
          enhancedQuery: enhancedQuery !== query ? enhancedQuery : undefined
        }
      };
    } catch (error) {
      this.logger.error('Error processing message with RAG', {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.id
      });
      
      return {
        id: `response-${message.id}`,
        content: "I'm sorry, but I couldn't retrieve the relevant context to answer your question. Please try again or rephrase your question.",
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
  
  /**
   * Store meeting transcript for retrieval
   * @param transcript Meeting transcript text
   * @param meetingId Meeting identifier
   * @returns Success status
   */
  async storeTranscript(transcript: string, meetingId = this.meetingId): Promise<boolean> {
    try {
      this.logger.info('Storing meeting transcript', {
        meetingId,
        transcriptLength: transcript.length
      });
      
      const result = await this.ragService.processContent(
        transcript,
        'meeting_transcript',
        {
          meetingId,
          organizationId: this.organizationId,
          sourceType: 'meeting_transcript'
        },
        {
          chunkSize: 300,
          chunkOverlap: 50,
          metadata: {
            meetingId,
            organizationId: this.organizationId
          }
        }
      );
      
      this.logger.info('Transcript stored successfully', {
        meetingId,
        chunkCount: result.chunkCount
      });
      
      return true;
    } catch (error) {
      this.logger.error('Error storing transcript', {
        error: error instanceof Error ? error.message : String(error),
        meetingId
      });
      
      return false;
    }
  }
  
  /**
   * Mock response for testing
   */
  private mockProcessMessage(message: { id: string; content: string; metadata?: any }): { id: string; content: string; metadata?: any } {
    this.logger.info('Generating mock RAG response', { messageId: message.id });
    
    return {
      id: `response-${message.id}`,
      content: `This is a mock RAG response to: "${message.content}".\n\nWith mock context about meetings and discussions.`,
      metadata: {
        ...message.metadata,
        mockResponse: true,
        contextSources: [
          { id: 'mock-1', type: 'meeting_transcript' },
          { id: 'mock-2', type: 'document' }
        ]
      }
    };
  }
  
  /**
   * Get the RAG service
   */
  getRagService(): UnifiedRAGService {
    return this.ragService;
  }
  
  /**
   * Get agent ID
   */
  getId(): string {
    return this.id;
  }
  
  /**
   * Get agent name
   */
  getName(): string {
    return this.name;
  }
} 