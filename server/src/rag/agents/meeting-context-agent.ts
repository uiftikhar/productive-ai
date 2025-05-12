/**
 * Meeting Context Agent
 * 
 * Specialized agent that leverages RAG to provide enhanced context awareness
 * for meeting analysis tasks. Integrates with the agentic meeting analysis framework.
 */

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { UnifiedRAGService } from '../core/unified-rag.service';
// Import a generic base class since we'll implement our own agent interface
import { MeetingContextProvider } from '../context/meeting-context-provider';
import { DocumentContextProvider } from '../context/document-context-provider';
import { ConversationMemoryService } from '../memory/conversation-memory.service';
// Fix the import path for AnalysisGoalType
import { AgentExpertise, AnalysisGoalType } from '../../langgraph/agentic-meeting-analysis/interfaces/agent.interface';

// Define message interface used by agents
export interface AgentMessage {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, any>;
  createdAt?: string;
}

// Define agent configuration interface
export interface AgentConfig {
  agentName?: string;
  agentDescription?: string;
  agentRole?: string;
  capabilities?: string[];
  [key: string]: any;
}

export interface MeetingContextAgentConfig extends AgentConfig {
  meetingId?: string;
  organizationId?: string;
  useConversationMemory?: boolean;
  defaultPromptTemplate?: string;
  maxContextLength?: number;
}

// Implement as a standalone class without inheritance
export class MeetingContextAgent {
  private ragService: UnifiedRAGService;
  private conversationMemoryService?: ConversationMemoryService;
  private meetingId?: string;
  private organizationId?: string;
  private defaultPromptTemplate: string;
  private maxContextLength: number;
  protected logger: Logger;
  protected openAIConnector: OpenAIConnector;
  
  constructor(options: {
    ragService?: UnifiedRAGService;
    meetingId?: string;
    organizationId?: string;
    useConversationMemory?: boolean;
    defaultPromptTemplate?: string;
    maxContextLength?: number;
    logger?: Logger;
    openAIConnector?: OpenAIConnector;
    agentConfig?: MeetingContextAgentConfig;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.openAIConnector = options.openAIConnector || new OpenAIConnector({
      logger: this.logger
    });
    
    this.meetingId = options.meetingId || options.agentConfig?.meetingId;
    this.organizationId = options.organizationId || options.agentConfig?.organizationId;
    this.defaultPromptTemplate = options.defaultPromptTemplate || options.agentConfig?.defaultPromptTemplate || 
      "Based on the meeting context, please answer the following question:\n\nContext: {context}\n\nQuestion: {query}\n\nAnswer:";
    this.maxContextLength = options.maxContextLength || options.agentConfig?.maxContextLength || 4000;
    
    // Set up or use provided RAG service
    if (options.ragService) {
      this.ragService = options.ragService;
    } else {
      // Create context providers
      const meetingContextProvider = new MeetingContextProvider({
        logger: this.logger,
        openAiConnector: this.openAIConnector
      });
      
      const documentContextProvider = new DocumentContextProvider({
        logger: this.logger,
        openAiConnector: this.openAIConnector
      });
      
      // Set up conversation memory if requested
      if (options.useConversationMemory || options.agentConfig?.useConversationMemory) {
        this.conversationMemoryService = new ConversationMemoryService({
          logger: this.logger,
          openAiConnector: this.openAIConnector
        });
      }
      
      // Create RAG service with providers
      this.ragService = new UnifiedRAGService({
        logger: this.logger,
        openAiConnector: this.openAIConnector,
        contextProviders: {
          meeting_transcript: meetingContextProvider,
          document: documentContextProvider
        },
        conversationMemory: this.conversationMemoryService
      });
    }
    
    this.logger.info('Meeting Context Agent initialized', {
      meetingId: this.meetingId,
      hasConversationMemory: !!this.conversationMemoryService
    });
  }
  
  /**
   * Process a message with enhanced context
   * @param message Message to process
   * @returns Response message
   */
  async processMessage(message: AgentMessage): Promise<AgentMessage> {
    const startTime = performance.now();
    const query = message.content;
    let conversationId = message.metadata?.conversationId;
    
    try {
      this.logger.info('Processing message with context enhancement', {
        messageId: message.id,
        conversationId,
        contentLength: query.length
      });
      
      // Create conversation if needed and enabled
      if (this.conversationMemoryService && !conversationId) {
        conversationId = this.conversationMemoryService.createConversation(
          message.metadata?.userId || 'anonymous',
          query,
          { meetingId: this.meetingId, source: 'meeting-context-agent' }
        );
        
        this.logger.debug('Created new conversation', { conversationId });
      }
      
      // Store the user message in conversation memory if available
      if (this.conversationMemoryService && conversationId) {
        await this.conversationMemoryService.addMessage(
          conversationId,
          'user',
          query,
          message.metadata
        );
      }
      
      // Prepare retrieval options
      const retrievalOptions = {
        limit: 5,
        minScore: 0.7,
        distinctSources: true,
        userId: message.metadata?.userId,
        meetingId: this.meetingId
      };
      
      // Create prompt with context
      let enhancedPrompt;
      
      if (this.conversationMemoryService && conversationId) {
        // Use conversation context
        enhancedPrompt = await this.ragService.createPromptWithConversationContext(
          query,
          this.defaultPromptTemplate,
          conversationId,
          {
            ...retrievalOptions,
            includeConversationHistory: true,
            maxHistoryMessages: 5
          }
        );
      } else {
        // Standard context retrieval
        enhancedPrompt = await this.ragService.createContextEnhancedPrompt(
          query,
          this.defaultPromptTemplate,
          retrievalOptions
        );
      }
      
      // Generate response
      const systemPrompt = `You are a helpful assistant that specializes in analyzing meeting information. 
Answer questions based on the provided meeting context and be specific and accurate. 
If the context doesn't contain enough information, acknowledge the limitations of your knowledge.`;
      
      const response = await this.openAIConnector.generateResponse([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: enhancedPrompt.prompt }
      ], {
        temperature: 0.3,
        maxTokens: 1000
      });
      
      // Store the response in conversation memory if available
      if (this.conversationMemoryService && conversationId) {
        await this.conversationMemoryService.addMessage(
          conversationId,
          'assistant',
          String(response)
        );
      }
      
      const processingTime = performance.now() - startTime;
      this.logger.info('Generated context-enhanced response', {
        messageId: message.id,
        processingTimeMs: processingTime.toFixed(2),
        responseLength: String(response).length,
        contextSourceCount: enhancedPrompt.sources.length
      });
      
      // Return the response message
      return {
        id: `response-${message.id}`,
        role: 'assistant',
        content: String(response),
        metadata: {
          ...message.metadata,
          conversationId,
          processingTimeMs: processingTime,
          contextSources: enhancedPrompt.sources,
          contextLength: enhancedPrompt.context.length
        },
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error processing message with context', {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.id
      });
      
      // Fallback response when context enhancement fails
      return {
        id: `response-${message.id}`,
        role: 'assistant',
        content: "I'm sorry, but I couldn't process your question with the relevant context. Please try again or rephrase your question.",
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        },
        createdAt: new Date().toISOString()
      };
    }
  }
  
  /**
   * Store meeting transcript for later retrieval
   * @param transcript Meeting transcript
   * @param meetingId Meeting identifier
   * @returns Success status
   */
  async storeTranscript(transcript: string, meetingId: string = this.meetingId || 'unknown'): Promise<boolean> {
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
   * Get the RAG service
   * @returns RAG service instance
   */
  getRagService(): UnifiedRAGService {
    return this.ragService;
  }
  
  /**
   * Get conversation memory service
   * @returns Conversation memory service or undefined
   */
  getConversationMemory(): ConversationMemoryService | undefined {
    return this.conversationMemoryService;
  }
} 