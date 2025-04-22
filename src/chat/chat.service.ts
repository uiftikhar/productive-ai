/**
 * Chat Service Implementation
 * 
 * Core service layer integrating with agent system and user context services
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../shared/logger/logger.interface';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { UserContextFacade } from '../shared/services/user-context/user-context.facade';
import { HistoryAwareSupervisor } from '../langgraph/core/workflows/history-aware-supervisor';
import { LanguageModelProvider } from '../agents/interfaces/language-model-provider.interface';
import { BaseAgent } from '../agents/base/base-agent';
import { AgentRegistryService } from '../agents/services/agent-registry.service';
import {
  ChatSession,
  ChatMessage,
  CreateSessionRequest,
  SendMessageRequest,
  HistoryOptions,
  MessageGenerationResult,
  ChatServiceError,
  ChatErrorType,
  StreamOptions
} from './chat.types';
import { BaseAgentInterface } from '../agents/interfaces/base-agent.interface';

/**
 * Configuration options for the chat service
 */
interface ChatServiceOptions {
  logger?: Logger;
  userContextFacade: UserContextFacade;
  llmConnector: LanguageModelProvider;
  agentRegistry?: AgentRegistryService;
  defaultHistoryLimit?: number;
}

/**
 * Core chat service implementation
 * Integrates with agents and conversation context
 */
export class ChatService {
  private logger: Logger;
  private userContextFacade: UserContextFacade;
  private llmConnector: LanguageModelProvider;
  private agentRegistry?: AgentRegistryService;
  private defaultHistoryLimit: number;
  private sessions: Map<string, ChatSession> = new Map();
  private supervisors: Map<string, HistoryAwareSupervisor> = new Map();
  
  constructor(options: ChatServiceOptions) {
    this.logger = options.logger || new ConsoleLogger();
    this.userContextFacade = options.userContextFacade;
    this.llmConnector = options.llmConnector;
    this.agentRegistry = options.agentRegistry;
    this.defaultHistoryLimit = options.defaultHistoryLimit || 15;
    
    this.logger.info('ChatService initialized');
  }
  
  /**
   * Create a new chat session
   */
  async createSession(request: CreateSessionRequest): Promise<ChatSession> {
    try {
      const sessionId = uuidv4();
      const conversationId = request.conversationId || uuidv4();
      
      const session: ChatSession = {
        sessionId,
        userId: request.userId,
        conversationId,
        createdAt: new Date(),
        lastActive: new Date(),
        agentId: request.agentId,
        metadata: request.metadata || {}
      };
      
      // Create a supervisor for this session
      const supervisor = new HistoryAwareSupervisor({
        userContextFacade: this.userContextFacade,
        llmConnector: this.llmConnector,
        logger: this.logger,
        userId: request.userId,
        conversationId,
        historyLimit: this.defaultHistoryLimit,
        includeMetadata: true
      });
      
      // If we have an agent registry, register available agents with the supervisor
      if (this.agentRegistry) {
        const agents = this.agentRegistry.getAllAgents();
        for (const agent of agents) {
          // Cast agent to BaseAgent if necessary for compatibility
          supervisor.registerAgent(agent as unknown as BaseAgent);
        }
      }
      
      // If a specific agent is requested, ensure it's registered
      if (request.agentId && this.agentRegistry) {
        const agent = this.agentRegistry.getAgent(request.agentId);
        if (agent) {
          // Cast agent to BaseAgent if necessary for compatibility
          supervisor.registerAgent(agent as unknown as BaseAgent);
        }
      }
      
      // Store session and supervisor
      this.sessions.set(sessionId, session);
      this.supervisors.set(sessionId, supervisor);
      
      this.logger.info('Chat session created', { 
        sessionId, 
        userId: request.userId,
        conversationId
      });
      
      return session;
    } catch (error) {
      this.logger.error('Failed to create chat session', {
        error: error instanceof Error ? error.message : String(error),
        userId: request.userId
      });
      
      throw new ChatServiceError(
        'Failed to create chat session',
        ChatErrorType.SERVICE_UNAVAILABLE,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }
  
  /**
   * Get an existing session by ID
   */
  getSession(sessionId: string): ChatSession {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new ChatServiceError(
        `Session not found: ${sessionId}`,
        ChatErrorType.SESSION_NOT_FOUND
      );
    }
    
    return session;
  }
  
  /**
   * Send a user message and get the assistant response
   */
  async sendMessage(request: SendMessageRequest): Promise<MessageGenerationResult> {
    try {
      // Get the session
      const session = this.getSession(request.sessionId);
      
      // Update last active timestamp
      session.lastActive = new Date();
      
      // Create user message
      const messageId = uuidv4();
      const userMessage: ChatMessage = {
        id: messageId,
        sessionId: request.sessionId,
        content: request.content,
        role: 'user',
        timestamp: new Date(),
        metadata: request.metadata || {}
      };
      
      // Generate embeddings for the user message
      let embeddings: number[] = [];
      try {
        embeddings = await this.llmConnector.generateEmbedding(request.content);
      } catch (embeddingError) {
        this.logger.warn('Failed to generate embeddings for user message, using default empty array', {
          error: embeddingError instanceof Error ? embeddingError.message : String(embeddingError),
          sessionId: request.sessionId
        });
        // Continue with empty embeddings - the conversation will still work
        // but semantic search functionality may be limited
      }
      
      // Store user message in conversation history
      await this.userContextFacade.storeConversationTurn(
        session.userId,
        session.conversationId,
        request.content,
        embeddings, // Now passing the generated embeddings
        'user',
        messageId,
        request.metadata || {}
      );
      
      // Generate response using the supervisor
      const supervisor = this.supervisors.get(request.sessionId);
      if (!supervisor) {
        throw new ChatServiceError(
          'Supervisor not found for session',
          ChatErrorType.SESSION_NOT_FOUND
        );
      }
      
      // Execute with history to get agent response
      const result = await supervisor.executeWithHistory(
        request.content, 
        {
          userId: session.userId,
          conversationId: session.conversationId
        }
      );
      
      // Create assistant message
      const assistantMessageId = uuidv4();
      const responseContent = typeof result.finalResponse === 'string' 
        ? result.finalResponse 
        : result.finalResponse.content;
      
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        sessionId: request.sessionId,
        content: responseContent,
        role: 'assistant',
        timestamp: new Date(),
        metadata: {
          agentsInvolved: result.agentsInvolved,
          primaryAgent: result.primaryAgent,
          executionTimeMs: result.metrics.totalExecutionTimeMs,
          tokenCount: result.metrics.totalTokensUsed
        }
      };
      
      // Generate embeddings for the assistant response
      let responseEmbeddings: number[] = [];
      try {
        responseEmbeddings = await this.llmConnector.generateEmbedding(responseContent);
      } catch (embeddingError) {
        this.logger.warn('Failed to generate embeddings for assistant response, using default empty array', {
          error: embeddingError instanceof Error ? embeddingError.message : String(embeddingError),
          sessionId: request.sessionId
        });
        // Continue with empty embeddings
      }
      
      // Store assistant message in conversation history
      await this.userContextFacade.storeConversationTurn(
        session.userId,
        session.conversationId,
        responseContent,
        responseEmbeddings, // Now passing the generated embeddings
        'assistant',
        assistantMessageId,
        assistantMessage.metadata
      );
      
      // Return the message generation result
      return {
        message: assistantMessage,
        agentsInvolved: result.agentsInvolved,
        primaryAgent: result.primaryAgent,
        executionTimeMs: result.metrics.totalExecutionTimeMs,
        tokenCount: result.metrics.totalTokensUsed,
        segmentInfo: {
          isNewSegment: result.createNewSegment || false,
          segmentTitle: result.segmentTitle,
          segmentSummary: result.segmentSummary
        }
      };
    } catch (error) {
      this.logger.error('Error sending message', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: request.sessionId
      });
      
      if (error instanceof ChatServiceError) {
        throw error;
      }
      
      throw new ChatServiceError(
        'Failed to generate response',
        ChatErrorType.GENERATION_FAILED,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }
  
  /**
   * Send a message with streaming response
   */
  async sendMessageStream(
    request: SendMessageRequest, 
    streamOptions: StreamOptions
  ): Promise<void> {
    try {
      // Get the session and create the user message (same as non-streaming)
      const session = this.getSession(request.sessionId);
      session.lastActive = new Date();
      
      const messageId = uuidv4();
      const userMessage: ChatMessage = {
        id: messageId,
        sessionId: request.sessionId,
        content: request.content,
        role: 'user',
        timestamp: new Date(),
        metadata: request.metadata || {}
      };
      
      // Generate embeddings for the user message
      let embeddings: number[] = [];
      try {
        embeddings = await this.llmConnector.generateEmbedding(request.content);
      } catch (embeddingError) {
        this.logger.warn('Failed to generate embeddings for user message in streaming, using default empty array', {
          error: embeddingError instanceof Error ? embeddingError.message : String(embeddingError),
          sessionId: request.sessionId
        });
      }
      
      // Store user message in conversation history
      await this.userContextFacade.storeConversationTurn(
        session.userId,
        session.conversationId,
        request.content,
        embeddings,
        'user',
        messageId,
        request.metadata || {}
      );
      
      // Get conversation history for context
      const history = await this.userContextFacade.getConversationHistory(
        session.userId,
        session.conversationId,
        this.defaultHistoryLimit
      );
      
      // Create a streaming handler that will forward tokens to the client
      let accumulatedResponse = '';
      
      // Create a custom handler for the streaming response
      const handleToken = (token: string) => {
        accumulatedResponse += token;
        streamOptions.onToken(token);
      };
      
      // Get the supervisor for this session
      const supervisor = this.supervisors.get(request.sessionId);
      if (!supervisor) {
        throw new ChatServiceError(
          'Supervisor not found for session',
          ChatErrorType.SESSION_NOT_FOUND
        );
      }
      
      try {
        // Execute the streaming response through the supervisor
        // (assuming the supervisor or language model provider has streaming capabilities)
        // If supervisor doesn't support streaming, we'll need to modify it or use direct LLM streaming
        const responseMessageId = uuidv4();
        
        // This would be the ideal implementation, but we might not have streaming in the supervisor
        // Uncomment this if the supervisor supports streaming, otherwise use the fallback below
        /*
        await supervisor.executeWithHistoryStreaming(
          request.content,
          {
            userId: session.userId,
            conversationId: session.conversationId,
            onToken: handleToken
          }
        );
        */
        
        // Fallback implementation:
        // If supervisor doesn't support streaming, we'll use direct LLM streaming
        if (this.llmConnector.generateStreamingResponse) {
          // Create a context from conversation history
          const messages = history.map(turn => ({
            role: turn.role,
            content: turn.content
          }));
          
          // Add the current user message
          messages.push({
            role: 'user',
            content: request.content
          });
          
          // Call the language model with streaming
          await this.llmConnector.generateStreamingResponse(
            messages,
            {
              onToken: handleToken,
              onComplete: (fullResponse: string) => {
                // Do nothing here, we'll handle completion after streaming is done
              },
              onError: (error: Error) => {
                this.logger.error('Error in streaming response', {
                  error: error.message,
                  sessionId: request.sessionId
                });
              }
            }
          );
        } else {
          // If even direct streaming is unavailable, simulate streaming with the non-streaming API
          const result = await supervisor.executeWithHistory(
            request.content, 
            {
              userId: session.userId,
              conversationId: session.conversationId
            }
          );
          
          const responseContent = typeof result.finalResponse === 'string' 
            ? result.finalResponse 
            : result.finalResponse.content;
          
          // Artificially stream the response by splitting it into chunks
          const chunks = responseContent.match(/.{1,5}/g) || [];
          for (const chunk of chunks) {
            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 50));
            handleToken(chunk);
          }
        }
        
        // After streaming is complete, store the complete assistant message in history
        const assistantMessage: ChatMessage = {
          id: responseMessageId,
          sessionId: request.sessionId,
          content: accumulatedResponse,
          role: 'assistant',
          timestamp: new Date(),
          metadata: {
            isStreamed: true
          }
        };
        
        // Generate embeddings for the assistant response
        let responseEmbeddings: number[] = [];
        try {
          responseEmbeddings = await this.llmConnector.generateEmbedding(accumulatedResponse);
        } catch (embeddingError) {
          this.logger.warn('Failed to generate embeddings for assistant response in streaming, using default empty array', {
            error: embeddingError instanceof Error ? embeddingError.message : String(embeddingError),
            sessionId: request.sessionId
          });
        }
        
        // Store the complete message in history
        await this.userContextFacade.storeConversationTurn(
          session.userId,
          session.conversationId,
          accumulatedResponse,
          responseEmbeddings,
          'assistant',
          responseMessageId,
          assistantMessage.metadata
        );
        
        // Signal completion
        streamOptions.onComplete(assistantMessage);
      } catch (streamError) {
        streamOptions.onError(
          new ChatServiceError(
            'Streaming response failed',
            ChatErrorType.GENERATION_FAILED,
            { originalError: streamError instanceof Error ? streamError.message : String(streamError) }
          )
        );
      }
    } catch (error) {
      streamOptions.onError(
        error instanceof ChatServiceError 
          ? error 
          : new ChatServiceError(
              'Failed to process streaming request',
              ChatErrorType.SERVICE_UNAVAILABLE,
              { originalError: error instanceof Error ? error.message : String(error) }
            )
      );
    }
  }
  
  /**
   * Get chat history for a session
   */
  async getSessionHistory(
    sessionId: string, 
    options: HistoryOptions = {}
  ): Promise<ChatMessage[]> {
    try {
      const session = this.getSession(sessionId);
      
      // Convert date objects to timestamps if present
      const convertedOptions: any = { ...options };
      if (options.beforeTimestamp) {
        convertedOptions.beforeTimestamp = options.beforeTimestamp.getTime();
      }
      if (options.afterTimestamp) {
        convertedOptions.afterTimestamp = options.afterTimestamp.getTime();
      }
      
      // Get conversation history from user context facade
      const history = await this.userContextFacade.getConversationHistory(
        session.userId,
        session.conversationId,
        options.limit || this.defaultHistoryLimit,
        {
          beforeTimestamp: convertedOptions.beforeTimestamp,
          afterTimestamp: convertedOptions.afterTimestamp,
          includeMetadata: options.includeMetadata ?? true
        }
      );
      
      // Map conversation turns to chat messages
      return history.map(turn => ({
        id: turn.id || uuidv4(),
        sessionId,
        content: turn.content,
        role: turn.role as "user" | "assistant" | "system",
        timestamp: turn.timestamp ? new Date(turn.timestamp) : new Date(),
        metadata: turn.metadata
      }));
    } catch (error) {
      this.logger.error('Error retrieving session history', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      });
      
      if (error instanceof ChatServiceError) {
        throw error;
      }
      
      throw new ChatServiceError(
        'Failed to retrieve chat history',
        ChatErrorType.SERVICE_UNAVAILABLE,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }
  
  /**
   * End and cleanup a chat session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const session = this.getSession(sessionId);
      
      // Remove from maps
      this.sessions.delete(sessionId);
      this.supervisors.delete(sessionId);
      
      this.logger.info('Chat session deleted', { sessionId });
      return true;
    } catch (error) {
      this.logger.error('Error deleting session', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      });
      
      if (error instanceof ChatServiceError) {
        throw error;
      }
      
      throw new ChatServiceError(
        'Failed to delete session',
        ChatErrorType.SERVICE_UNAVAILABLE,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }
  
  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<ChatSession[]> {
    try {
      const userSessions = Array.from(this.sessions.values())
        .filter(session => session.userId === userId);
      
      return userSessions;
    } catch (error) {
      this.logger.error('Error fetching user sessions', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      
      throw new ChatServiceError(
        'Failed to fetch user sessions',
        ChatErrorType.SERVICE_UNAVAILABLE,
        { originalError: error instanceof Error ? error.message : String(error) }
      );
    }
  }
  
  /**
   * Register an agent with a session's supervisor
   */
  registerAgentWithSession(sessionId: string, agent: BaseAgentInterface): void {
    const supervisor = this.supervisors.get(sessionId);
    if (!supervisor) {
      throw new ChatServiceError(
        'Session not found',
        ChatErrorType.SESSION_NOT_FOUND
      );
    }
    
    supervisor.registerAgent(agent as unknown as BaseAgent);
    this.logger.info('Agent registered with session', {
      sessionId,
      agentId: agent.id,
      agentName: agent.name
    });
  }
} 