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
  StreamOptions,
  UserPresence,
  UserStatus,
  PresenceUpdateEvent,
} from './chat.types';
import { BaseAgentInterface } from '../agents/interfaces/base-agent.interface';
import { ContextType } from '../shared/services/user-context/types/context.types';
import { EventEmitter } from 'events';

/**
 * Format file size from bytes to human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

/**
 * Configuration options for the chat service
 */
interface ChatServiceOptions {
  logger?: Logger;
  userContextFacade: UserContextFacade;
  llmConnector: LanguageModelProvider;
  agentRegistry?: AgentRegistryService;
  defaultHistoryLimit?: number;
  presenceTimeout?: number;
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

  // User presence tracking
  private userPresence: Map<string, UserPresence> = new Map();
  private presenceTimeout: number;
  private presenceEvents: EventEmitter = new EventEmitter();
  private presenceUpdateInterval?: NodeJS.Timeout;

  constructor(options: ChatServiceOptions) {
    this.logger = options.logger || new ConsoleLogger();
    this.userContextFacade = options.userContextFacade;
    this.llmConnector = options.llmConnector;
    this.agentRegistry = options.agentRegistry;
    this.defaultHistoryLimit = options.defaultHistoryLimit || 15;
    this.presenceTimeout = options.presenceTimeout || 5 * 60 * 1000; // 5 minutes default

    // Initialize presence monitoring
    this.startPresenceMonitoring();

    this.logger.info('ChatService initialized');
  }

  /**
   * Start monitoring user presence
   * @private
   */
  private startPresenceMonitoring(): void {
    // Check for stale presence every minute
    this.presenceUpdateInterval = setInterval(() => {
      this.checkStalePresence();
    }, 60 * 1000).unref();
  }

  /**
   * Check for stale user presence and update status
   * @private
   */
  private checkStalePresence(): void {
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - this.presenceTimeout);

    for (const [userId, presence] of this.userPresence.entries()) {
      // If user is online or typing but hasn't been active recently
      if (
        (presence.status === UserStatus.ONLINE ||
          presence.status === UserStatus.TYPING) &&
        presence.lastActive < staleCutoff
      ) {
        // Update to AWAY status
        this.updateUserPresence(userId, UserStatus.AWAY);
      }
    }
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
        metadata: request.metadata || {},
      };

      // Create a supervisor for this session
      const supervisor = new HistoryAwareSupervisor({
        userContextFacade: this.userContextFacade,
        llmConnector: this.llmConnector,
        logger: this.logger,
        userId: request.userId,
        conversationId,
        historyLimit: this.defaultHistoryLimit,
        includeMetadata: true,
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

      // Update user presence when creating a session
      this.updateUserPresence(request.userId, UserStatus.ONLINE, sessionId);

      this.logger.info('Chat session created', {
        sessionId,
        userId: request.userId,
        conversationId,
      });

      return session;
    } catch (error) {
      this.logger.error('Failed to create chat session', {
        error: error instanceof Error ? error.message : String(error),
        userId: request.userId,
      });

      throw new ChatServiceError(
        'Failed to create chat session',
        ChatErrorType.SERVICE_UNAVAILABLE,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
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
        ChatErrorType.SESSION_NOT_FOUND,
      );
    }

    return session;
  }

  /**
   * Send a user message and get the assistant response
   */
  async sendMessage(
    request: SendMessageRequest,
  ): Promise<MessageGenerationResult> {
    try {
      // Get the session
      const session = this.getSession(request.sessionId);

      // Update last active timestamp
      session.lastActive = new Date();

      // Update user presence status to indicate they're active
      this.updateUserPresence(
        session.userId,
        UserStatus.ONLINE,
        request.sessionId,
      );

      // Create user message
      const messageId = uuidv4();
      const userMessage: ChatMessage = {
        id: messageId,
        sessionId: request.sessionId,
        content: request.content,
        role: 'user',
        timestamp: new Date(),
        metadata: request.metadata || {},
      };

      // Generate embeddings for the user message
      let embeddings: number[] = [];
      try {
        embeddings = await this.llmConnector.generateEmbedding(request.content);
        if (!embeddings || !embeddings.length) {
          // Ensure we have at least one value in the embeddings
          this.logger.warn('Empty embeddings generated, using fallback value', {
            sessionId: request.sessionId,
          });
          embeddings = [0.1, 0.1, 0.1]; // Simple fallback embedding
        }
      } catch (embeddingError) {
        this.logger.warn(
          'Failed to generate embeddings for user message, using default empty array',
          {
            error:
              embeddingError instanceof Error
                ? embeddingError.message
                : String(embeddingError),
            sessionId: request.sessionId,
          },
        );
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
        request.metadata || {},
      );

      // Generate response using the supervisor
      const supervisor = this.supervisors.get(request.sessionId);
      if (!supervisor) {
        throw new ChatServiceError(
          'Supervisor not found for session',
          ChatErrorType.SESSION_NOT_FOUND,
        );
      }

      // Execute with history to get agent response
      const result = await supervisor.executeWithHistory(request.content, {
        userId: session.userId,
        conversationId: session.conversationId,
      });

      // Create assistant message
      const assistantMessageId = uuidv4();
      const responseContent =
        typeof result.finalResponse === 'string'
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
          tokenCount: result.metrics.totalTokensUsed,
        },
      };

      // Generate embeddings for the assistant response
      let responseEmbeddings: number[] = [];
      try {
        responseEmbeddings =
          await this.llmConnector.generateEmbedding(responseContent);
        if (!responseEmbeddings || !responseEmbeddings.length) {
          // Ensure we have at least one value in the embeddings
          this.logger.warn(
            'Empty embeddings generated for response, using fallback value',
            {
              sessionId: request.sessionId,
            },
          );
          responseEmbeddings = [0.1, 0.1, 0.1]; // Simple fallback embedding
        }
      } catch (embeddingError) {
        this.logger.warn(
          'Failed to generate embeddings for assistant response, using default empty array',
          {
            error:
              embeddingError instanceof Error
                ? embeddingError.message
                : String(embeddingError),
            sessionId: request.sessionId,
          },
        );
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
        assistantMessage.metadata,
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
          segmentSummary: result.segmentSummary,
        },
      };
    } catch (error) {
      this.logger.error('Error sending message', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: request.sessionId,
      });

      if (error instanceof ChatServiceError) {
        throw error;
      }

      throw new ChatServiceError(
        'Failed to generate response',
        ChatErrorType.GENERATION_FAILED,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Send a message with streaming response
   */
  async sendMessageStream(
    request: SendMessageRequest,
    streamOptions: StreamOptions,
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
        metadata: request.metadata || {},
      };

      // Generate embeddings for the user message
      let embeddings: number[] = [];
      try {
        embeddings = await this.llmConnector.generateEmbedding(request.content);
        if (!embeddings || !embeddings.length) {
          // Ensure we have at least one value in the embeddings
          this.logger.warn('Empty embeddings generated, using fallback value', {
            sessionId: request.sessionId,
          });
          embeddings = [0.1, 0.1, 0.1]; // Simple fallback embedding
        }
      } catch (embeddingError) {
        this.logger.warn(
          'Failed to generate embeddings for user message in streaming, using default empty array',
          {
            error:
              embeddingError instanceof Error
                ? embeddingError.message
                : String(embeddingError),
            sessionId: request.sessionId,
          },
        );
        // Provide fallback embeddings to prevent errors downstream
        embeddings = [0.1, 0.1, 0.1]; // Simple fallback embedding
      }

      // Store user message in conversation history
      await this.userContextFacade.storeConversationTurn(
        session.userId,
        session.conversationId,
        request.content,
        embeddings,
        'user',
        messageId,
        request.metadata || {},
      );

      // Get conversation history for context
      const history = await this.userContextFacade.getConversationHistory(
        session.userId,
        session.conversationId,
        this.defaultHistoryLimit,
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
          ChatErrorType.SESSION_NOT_FOUND,
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
          const messages = history.map((turn) => ({
            role: turn.role,
            content: turn.content,
          }));

          // Add the current user message
          messages.push({
            role: 'user',
            content: request.content,
          });

          // Call the language model with streaming
          await this.llmConnector.generateStreamingResponse(messages, {
            onToken: handleToken,
            onComplete: (fullResponse: string) => {
              // Do nothing here, we'll handle completion after streaming is done
            },
            onError: (error: Error) => {
              this.logger.error('Error in streaming response', {
                error: error.message,
                sessionId: request.sessionId,
              });
            },
          });
        } else {
          // If even direct streaming is unavailable, simulate streaming with the non-streaming API
          const result = await supervisor.executeWithHistory(request.content, {
            userId: session.userId,
            conversationId: session.conversationId,
          });

          const responseContent =
            typeof result.finalResponse === 'string'
              ? result.finalResponse
              : result.finalResponse.content;

          // Artificially stream the response by splitting it into chunks
          const chunks = responseContent.match(/.{1,5}/g) || [];
          for (const chunk of chunks) {
            // Simulate network delay
            await new Promise((resolve) => setTimeout(resolve, 50));
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
            isStreamed: true,
          },
        };

        // Generate embeddings for the assistant response
        let responseEmbeddings: number[] = [];
        try {
          responseEmbeddings =
            await this.llmConnector.generateEmbedding(accumulatedResponse);
          if (!responseEmbeddings || !responseEmbeddings.length) {
            // Ensure we have at least one value in the embeddings
            this.logger.warn(
              'Empty embeddings generated for response, using fallback value',
              {
                sessionId: request.sessionId,
              },
            );
            responseEmbeddings = [0.1, 0.1, 0.1]; // Simple fallback embedding
          }
        } catch (embeddingError) {
          this.logger.warn(
            'Failed to generate embeddings for assistant response in streaming, using default empty array',
            {
              error:
                embeddingError instanceof Error
                  ? embeddingError.message
                  : String(embeddingError),
              sessionId: request.sessionId,
            },
          );
          // Provide fallback embeddings to prevent errors downstream
          responseEmbeddings = [0.1, 0.1, 0.1]; // Simple fallback embedding
        }

        // Store the complete message in history
        await this.userContextFacade.storeConversationTurn(
          session.userId,
          session.conversationId,
          accumulatedResponse,
          responseEmbeddings,
          'assistant',
          responseMessageId,
          assistantMessage.metadata,
        );

        // Signal completion
        streamOptions.onComplete(assistantMessage);
      } catch (streamError) {
        streamOptions.onError(
          new ChatServiceError(
            'Streaming response failed',
            ChatErrorType.GENERATION_FAILED,
            {
              originalError:
                streamError instanceof Error
                  ? streamError.message
                  : String(streamError),
            },
          ),
        );
      }
    } catch (error) {
      streamOptions.onError(
        error instanceof ChatServiceError
          ? error
          : new ChatServiceError(
              'Failed to process streaming request',
              ChatErrorType.SERVICE_UNAVAILABLE,
              {
                originalError:
                  error instanceof Error ? error.message : String(error),
              },
            ),
      );
    }
  }

  /**
   * Get chat history for a session
   */
  async getSessionHistory(
    sessionId: string,
    options: HistoryOptions = {},
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
          includeMetadata: options.includeMetadata ?? true,
        },
      );

      // Map conversation turns to chat messages
      return history.map((turn) => ({
        id: turn.id || uuidv4(),
        sessionId,
        content: turn.content,
        role: turn.role as 'user' | 'assistant' | 'system',
        timestamp: turn.timestamp ? new Date(turn.timestamp) : new Date(),
        metadata: turn.metadata,
      }));
    } catch (error) {
      this.logger.error('Error retrieving session history', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });

      if (error instanceof ChatServiceError) {
        throw error;
      }

      throw new ChatServiceError(
        'Failed to retrieve chat history',
        ChatErrorType.SERVICE_UNAVAILABLE,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
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
        sessionId,
      });

      if (error instanceof ChatServiceError) {
        throw error;
      }

      throw new ChatServiceError(
        'Failed to delete session',
        ChatErrorType.SERVICE_UNAVAILABLE,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<ChatSession[]> {
    try {
      const userSessions = Array.from(this.sessions.values()).filter(
        (session) => session.userId === userId,
      );

      return userSessions;
    } catch (error) {
      this.logger.error('Error fetching user sessions', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });

      throw new ChatServiceError(
        'Failed to fetch user sessions',
        ChatErrorType.SERVICE_UNAVAILABLE,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Register an agent with a session
   */
  registerAgentWithSession(sessionId: string, agent: BaseAgentInterface): void {
    const session = this.getSession(sessionId);
    const supervisor = this.supervisors.get(sessionId);

    if (!supervisor) {
      throw new ChatServiceError(
        `Supervisor not found for session: ${sessionId}`,
        ChatErrorType.SESSION_NOT_FOUND,
      );
    }

    supervisor.registerAgent(agent as unknown as BaseAgent);
    this.logger.info('Agent registered with session', {
      sessionId,
      agentId: agent.id,
    });
  }

  /**
   * Updates the context for a session with additional information
   * Allows enriching the conversation with external data or metadata
   */
  async updateSessionContext(
    sessionId: string,
    context: Record<string, any>,
    options: {
      persist?: boolean;
      priority?: number;
      retentionPolicy?: string;
    } = {},
  ): Promise<void> {
    const session = this.getSession(sessionId);

    // Update the session metadata
    session.metadata = {
      ...session.metadata,
      ...context,
    };

    // If persist is true, store the context in the conversation context service
    if (options.persist) {
      try {
        // Convert the context to a string for storage
        const contextString = JSON.stringify(context);

        // Generate embeddings for the context
        const embeddings =
          await this.llmConnector.generateEmbedding(contextString);

        // Store as a system message in the conversation context
        await this.userContextFacade.storeConversationTurn(
          session.userId,
          session.conversationId,
          contextString,
          embeddings,
          'system',
          `ctx-${uuidv4()}`,
          {
            isContext: true,
            retentionPolicy: options.retentionPolicy,
            retentionPriority: options.priority,
            timestamp: Date.now(),
          },
        );

        this.logger.info('Session context updated and persisted', {
          sessionId,
          userId: session.userId,
          contextSize: Object.keys(context).length,
        });
      } catch (error) {
        this.logger.error('Failed to persist session context', {
          error: error instanceof Error ? error.message : String(error),
          sessionId,
        });

        throw new ChatServiceError(
          'Failed to persist session context',
          ChatErrorType.CONTEXT_STORAGE_ERROR,
          {
            originalError:
              error instanceof Error ? error.message : String(error),
          },
        );
      }
    } else {
      this.logger.info('Session context updated (in-memory only)', {
        sessionId,
        contextSize: Object.keys(context).length,
      });
    }
  }

  /**
   * Applies a retention policy to the conversation
   * Used to extend or shorten the retention period of conversation data
   */
  async updateConversationRetention(
    sessionId: string,
    policy: string,
    options: {
      turnIds?: string[];
      segmentId?: string;
      retentionPriority?: number;
      isHighValue?: boolean;
      retentionTags?: string[];
    } = {},
  ): Promise<number> {
    const session = this.getSession(sessionId);

    try {
      // Update retention policy using the user context facade
      const updatedCount = await this.userContextFacade.updateRetentionPolicy(
        session.userId,
        session.conversationId,
        policy,
        options,
      );

      this.logger.info('Conversation retention policy updated', {
        sessionId,
        policy,
        updatedCount,
      });

      return updatedCount;
    } catch (error) {
      this.logger.error('Failed to update conversation retention policy', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });

      throw new ChatServiceError(
        'Failed to update conversation retention policy',
        ChatErrorType.CONTEXT_MANAGEMENT_ERROR,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Gets an optimized context window for the conversation
   * Used to provide relevant context to LLM calls
   */
  async getContextWindow(
    sessionId: string,
    options: {
      windowSize?: number;
      includeCurrentSegmentOnly?: boolean;
      includeAgentIds?: string[];
      excludeAgentIds?: string[];
      relevanceQuery?: string;
      relevanceThreshold?: number;
      filterByCapabilities?: string[];
      maxTokens?: number;
    } = {},
  ): Promise<{
    messages: Array<any>;
    contextSummary?: string;
    segmentInfo?: {
      id: string;
      topic?: string;
    };
  }> {
    const session = this.getSession(sessionId);

    try {
      // Get relevant embeddings for query if provided
      let relevanceEmbedding: number[] | undefined;
      if (options.relevanceQuery) {
        relevanceEmbedding = await this.llmConnector.generateEmbedding(
          options.relevanceQuery,
        );
      }

      // Use facade to create context window
      // Note: If userContextFacade doesn't expose createContextWindow directly,
      // this would need to be reimplemented using the available context methods
      const messages = await this.userContextFacade.getConversationHistory(
        session.userId,
        session.conversationId,
        options.windowSize || this.defaultHistoryLimit,
        {
          includeMetadata: true,
          // Filter by agents if specified
          agentId:
            options.includeAgentIds?.length === 1
              ? options.includeAgentIds[0]
              : undefined,
        },
      );

      // Filter messages if needed
      const filteredMessages = messages.filter((message) => {
        // Filter by agents
        if (options.includeAgentIds && options.includeAgentIds.length > 0) {
          if (
            message.metadata?.agentId &&
            !options.includeAgentIds.includes(message.metadata.agentId)
          ) {
            return false;
          }
        }

        if (options.excludeAgentIds && options.excludeAgentIds.length > 0) {
          if (
            message.metadata?.agentId &&
            options.excludeAgentIds.includes(message.metadata.agentId)
          ) {
            return false;
          }
        }

        return true;
      });

      // Get segment info
      let segmentInfo;
      if (options.includeCurrentSegmentOnly) {
        const segments = await this.userContextFacade.getConversationSegments(
          session.userId,
          session.conversationId,
        );

        if (segments.length > 0) {
          // Get the most recent segment
          const latestSegment = segments.sort(
            (a, b) => b.lastTimestamp - a.lastTimestamp,
          )[0];
          segmentInfo = {
            id: latestSegment.segmentId,
            topic: latestSegment.segmentTopic,
          };
        }
      }

      this.logger.info('Retrieved context window for session', {
        sessionId,
        messageCount: filteredMessages.length,
        hasSegmentInfo: !!segmentInfo,
      });

      return {
        messages: filteredMessages,
        segmentInfo,
      };
    } catch (error) {
      this.logger.error('Failed to get context window', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });

      throw new ChatServiceError(
        'Failed to get context window',
        ChatErrorType.CONTEXT_RETRIEVAL_ERROR,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Multi-agent orchestration: Assign multiple agents to a session
   */
  async assignAgentsToSession(
    sessionId: string,
    agentIds: string[],
  ): Promise<{
    assignedAgents: string[];
    failedAssignments: { agentId: string; reason: string }[];
  }> {
    const session = this.getSession(sessionId);
    const supervisor = this.supervisors.get(sessionId);

    if (!supervisor) {
      throw new ChatServiceError(
        `Supervisor not found for session: ${sessionId}`,
        ChatErrorType.SESSION_NOT_FOUND,
      );
    }

    if (!this.agentRegistry) {
      throw new ChatServiceError(
        'Agent registry is not available',
        ChatErrorType.MULTI_AGENT_ERROR,
      );
    }

    // Track successful and failed assignments
    const assignedAgents: string[] = [];
    const failedAssignments: { agentId: string; reason: string }[] = [];

    // Assign each agent
    for (const agentId of agentIds) {
      try {
        const agent = this.agentRegistry.getAgent(agentId);
        if (agent) {
          supervisor.registerAgent(agent as unknown as BaseAgent);
          assignedAgents.push(agentId);

          this.logger.info('Agent assigned to session', {
            sessionId,
            agentId,
          });
        } else {
          failedAssignments.push({
            agentId,
            reason: 'Agent not found in registry',
          });
        }
      } catch (error) {
        failedAssignments.push({
          agentId,
          reason: error instanceof Error ? error.message : String(error),
        });

        this.logger.warn('Failed to assign agent to session', {
          sessionId,
          agentId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Update session metadata with assigned agents
    session.metadata = {
      ...session.metadata,
      assignedAgents,
    };

    return { assignedAgents, failedAssignments };
  }

  /**
   * Multi-agent orchestration: Get agents assigned to a session
   */
  getSessionAgents(sessionId: string): string[] {
    const session = this.getSession(sessionId);
    const supervisor = this.supervisors.get(sessionId);

    if (!supervisor) {
      throw new ChatServiceError(
        `Supervisor not found for session: ${sessionId}`,
        ChatErrorType.SESSION_NOT_FOUND,
      );
    }

    // Get assigned agents from session metadata
    return session.metadata?.assignedAgents || [];
  }

  /**
   * Multi-agent orchestration: Send a message to a specific agent
   */
  async sendMessageToAgent(
    request: SendMessageRequest & { agentId: string },
  ): Promise<MessageGenerationResult> {
    const session = this.getSession(request.sessionId);
    const supervisor = this.supervisors.get(request.sessionId);

    if (!supervisor) {
      throw new ChatServiceError(
        `Supervisor not found for session: ${request.sessionId}`,
        ChatErrorType.SESSION_NOT_FOUND,
      );
    }

    // Check if the agent is assigned to this session
    const assignedAgents = session.metadata?.assignedAgents || [];
    if (!assignedAgents.includes(request.agentId)) {
      throw new ChatServiceError(
        `Agent ${request.agentId} is not assigned to this session`,
        ChatErrorType.MULTI_AGENT_ERROR,
      );
    }

    try {
      // Create user message
      const messageId = uuidv4();
      const userMessage: ChatMessage = {
        id: messageId,
        sessionId: request.sessionId,
        content: request.content,
        role: 'user',
        timestamp: new Date(),
        metadata: {
          ...(request.metadata || {}),
          targetAgentId: request.agentId,
        },
      };

      // Generate embeddings for the user message
      let embeddings: number[] = [];
      try {
        embeddings = await this.llmConnector.generateEmbedding(request.content);
      } catch (embeddingError) {
        this.logger.warn('Failed to generate embeddings for user message', {
          error:
            embeddingError instanceof Error
              ? embeddingError.message
              : String(embeddingError),
          sessionId: request.sessionId,
        });
      }

      // Store user message with target agent metadata
      await this.userContextFacade.storeAgentConversationTurn(
        session.userId,
        session.conversationId,
        request.content,
        embeddings,
        'user',
        {
          turnId: messageId,
          targetAgentId: request.agentId,
          ...(request.metadata || {}),
        },
      );

      // Process the message with the appropriate agent from the supervisor
      // Use the standard sendMessage method but add the target agent ID to the metadata
      const agentResponse = await this.sendMessage({
        sessionId: request.sessionId,
        content: request.content,
        metadata: {
          ...request.metadata,
          targetAgentId: request.agentId,
        },
      });

      // Override the agent ID to ensure it's attributed to the correct agent
      agentResponse.primaryAgent = request.agentId;
      agentResponse.agentsInvolved = [request.agentId];

      return agentResponse;
    } catch (error) {
      this.logger.error('Failed to process message with agent', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: request.sessionId,
        agentId: request.agentId,
      });

      throw new ChatServiceError(
        `Failed to process message with agent ${request.agentId}`,
        ChatErrorType.MULTI_AGENT_ERROR,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Multi-agent orchestration: Get agent recommendations for a message
   */
  async getAgentRecommendations(
    sessionId: string,
    message: string,
  ): Promise<
    Array<{
      agentId: string;
      confidence: number;
      reasoning?: string;
    }>
  > {
    const session = this.getSession(sessionId);

    if (!this.agentRegistry) {
      throw new ChatServiceError(
        'Agent registry is not available',
        ChatErrorType.MULTI_AGENT_ERROR,
      );
    }

    try {
      // Get conversation history for context
      const history = await this.getSessionHistory(sessionId, { limit: 10 });

      // Convert to format needed for classifier
      const conversationHistory = history.map((msg) => ({
        role: msg.role,
        content: msg.content,
        agentId: msg.metadata?.agentId,
        timestamp: msg.timestamp.toISOString(),
      }));

      // Get all available agents
      const agents = this.agentRegistry.getAllAgents();

      // Since AgentRegistryService doesn't have a direct classifyMessage method,
      // we'll need to handle this differently - for example, just return the available agents
      // with a default confidence score
      const classificationResults = agents.map((agent) => ({
        agentId: agent.id,
        confidence: 0.5, // Default confidence
        reasoning: `${agent.name} is available for this conversation`,
      }));

      return classificationResults;
    } catch (error) {
      this.logger.error('Failed to get agent recommendations', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });

      throw new ChatServiceError(
        'Failed to get agent recommendations',
        ChatErrorType.MULTI_AGENT_ERROR,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * File attachment handling: Attach a file to a message
   *
   * @param sessionId The session ID
   * @param file The file to attach (buffer, metadata)
   * @param options Processing options for the file
   * @returns The attachment ID and processed content
   */
  async attachFile(
    sessionId: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    options: {
      extractText?: boolean;
      generateEmbeddings?: boolean;
      storeReference?: boolean;
      associatedMessageId?: string;
    } = {},
  ): Promise<{
    attachmentId: string;
    textContent?: string;
    contentTokens?: number;
  }> {
    const session = this.getSession(sessionId);

    try {
      // Generate a unique ID for the attachment
      const attachmentId = `file-${uuidv4()}`;

      // Extract text content if requested
      let textContent: string | undefined;
      let embeddings: number[] | undefined;

      if (options.extractText) {
        // In a real implementation, this would use specialized libraries
        // based on the file type: PDFParser, Mammoth for Word docs, etc.
        // For this implementation, we'll simulate text extraction by using the first 1000 bytes
        // as UTF-8 text when the file appears to be a text type

        const isTextType =
          file.mimetype.startsWith('text/') ||
          [
            'application/json',
            'application/xml',
            'application/javascript',
          ].includes(file.mimetype);

        if (isTextType) {
          // Extract first 1000 bytes as text for preview
          textContent = file.buffer.slice(0, 1000).toString('utf8');
        } else {
          this.logger.info('Text extraction not supported for this file type', {
            sessionId,
            mimetype: file.mimetype,
          });
        }
      }

      // Generate embeddings if requested
      if (options.generateEmbeddings && textContent) {
        try {
          embeddings = await this.llmConnector.generateEmbedding(textContent);
        } catch (embeddingError) {
          this.logger.warn('Failed to generate embeddings for file content', {
            error:
              embeddingError instanceof Error
                ? embeddingError.message
                : String(embeddingError),
            sessionId,
            attachmentId,
          });
        }
      }

      // Store as context if requested
      if (options.storeReference) {
        await this.userContextFacade.storeUserContext(
          session.userId,
          textContent || `File attachment: ${file.originalname}`,
          embeddings || [],
          {
            contextType: ContextType.DOCUMENT,
            fileType: file.mimetype,
            fileName: file.originalname,
            fileSize: file.size,
            attachmentId,
            conversationId: session.conversationId,
            messageId: options.associatedMessageId,
            timestamp: Date.now(),
          },
        );
      }

      // Update session metadata
      const fileAttachments = (session.metadata?.fileAttachments ||
        []) as any[];
      fileAttachments.push({
        id: attachmentId,
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        timestamp: Date.now(),
        messageId: options.associatedMessageId,
      });

      session.metadata = {
        ...session.metadata,
        fileAttachments,
      };

      this.logger.info('File attached to session', {
        sessionId,
        attachmentId,
        filename: file.originalname,
        size: file.size,
      });

      // Calculate token count if text was extracted
      const contentTokens = textContent
        ? Math.ceil(textContent.length / 4)
        : undefined;

      return {
        attachmentId,
        textContent,
        contentTokens,
      };
    } catch (error) {
      this.logger.error('Failed to attach file', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        filename: file.originalname,
      });

      throw new ChatServiceError(
        'Failed to attach file',
        ChatErrorType.FILE_UPLOAD_ERROR,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * File attachment handling: Get files attached to a session
   *
   * @param sessionId The session ID
   * @returns A list of file attachments for the session
   */
  getSessionAttachments(sessionId: string): Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    timestamp: number;
    messageId?: string;
  }> {
    const session = this.getSession(sessionId);
    return (session.metadata?.fileAttachments || []) as any[];
  }

  /**
   * File attachment handling: Reference a file attachment in a message
   *
   * @param sessionId The session ID
   * @param attachmentId The attachment ID to reference
   * @param message The message to append the reference to
   * @returns The updated message with file reference
   */
  referenceAttachment(
    sessionId: string,
    attachmentId: string,
    message: string,
  ): string {
    const session = this.getSession(sessionId);
    const attachments = this.getSessionAttachments(sessionId);
    const attachment = attachments.find((a) => a.id === attachmentId);

    if (!attachment) {
      throw new ChatServiceError(
        `Attachment not found: ${attachmentId}`,
        ChatErrorType.FILE_PROCESSING_ERROR,
      );
    }

    // Create a reference string for the attachment
    const reference = `[Attachment: ${attachment.name} (${formatFileSize(attachment.size)})]`;

    // Return message with attachment reference appended
    return `${message}\n\n${reference}`;
  }

  /**
   * Conversation search: Search through user's conversations
   */
  async searchConversations(
    userId: string,
    query: string,
    options: {
      conversationIds?: string[];
      role?: 'user' | 'assistant' | 'system';
      agentId?: string;
      minRelevanceScore?: number;
      maxResults?: number;
      timeRangeStart?: number;
      timeRangeEnd?: number;
      includeSessionData?: boolean;
    } = {},
  ): Promise<
    Array<{
      sessionId?: string;
      conversationId: string;
      turnId: string;
      timestamp: number;
      message: string;
      score: number;
      role: string;
      agentId?: string;
      segmentId?: string;
      segmentTopic?: string;
    }>
  > {
    try {
      // Generate embeddings for the search query
      const embeddings = await this.llmConnector.generateEmbedding(query);

      // Search conversations using the user context facade
      const searchResults = await this.userContextFacade.searchConversations(
        userId,
        embeddings,
        {
          conversationIds: options.conversationIds,
          role: options.role,
          // Pass agentId only if it's defined in the userContextFacade interface
          ...(options.agentId ? { agentId: options.agentId } : {}),
          minRelevanceScore: options.minRelevanceScore,
          maxResults: options.maxResults,
          timeRangeStart: options.timeRangeStart,
          timeRangeEnd: options.timeRangeEnd,
        },
      );

      // Map results to the expected format with explicit type conversions to avoid type errors
      const mappedResults = searchResults.map((result) => ({
        sessionId: undefined as string | undefined, // Will be populated below if requested
        conversationId: String(result.conversationId || ''),
        turnId: String(result.turnId || result.id || ''),
        timestamp: Number(result.timestamp || Date.now()),
        message: String(result.message || ''),
        score: Number(result.score || 0),
        role: String(result.role || ''),
        agentId: result.agentId ? String(result.agentId) : undefined,
        segmentId: result.segmentId ? String(result.segmentId) : undefined,
        segmentTopic: result.segmentTopic
          ? String(result.segmentTopic)
          : undefined,
      }));

      // If session data is requested, look up session IDs by conversation ID
      if (options.includeSessionData && mappedResults.length > 0) {
        // Get unique conversation IDs
        const conversationIds = [
          ...new Set(mappedResults.map((r) => r.conversationId)),
        ];

        // Build a mapping from conversation ID to session ID
        const sessionMap = new Map<string, string>();

        // Iterate through all sessions for this user
        const sessions = await this.getUserSessions(userId);

        for (const session of sessions) {
          if (conversationIds.includes(session.conversationId)) {
            sessionMap.set(session.conversationId, session.sessionId);
          }
        }

        // Update the results with session IDs
        for (const result of mappedResults) {
          const sessionId = sessionMap.get(result.conversationId);
          if (sessionId) {
            result.sessionId = sessionId;
          }
        }
      }

      this.logger.info('Conversation search completed', {
        userId,
        query,
        resultCount: mappedResults.length,
      });

      return mappedResults;
    } catch (error) {
      this.logger.error('Failed to search conversations', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        query,
      });

      throw new ChatServiceError(
        'Failed to search conversations',
        ChatErrorType.CONTEXT_RETRIEVAL_ERROR,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Conversation search: Retrieve similar messages to a given message
   */
  async findSimilarMessages(
    sessionId: string,
    messageId: string,
    options: {
      maxResults?: number;
      minRelevanceScore?: number;
      searchAcrossUsers?: boolean;
      includeCurrentConversation?: boolean;
    } = {},
  ): Promise<
    Array<{
      conversationId: string;
      turnId: string;
      timestamp: number;
      message: string;
      score: number;
      role: string;
      userId: string;
    }>
  > {
    const session = this.getSession(sessionId);

    try {
      // First, retrieve the message content by ID
      const history = await this.getSessionHistory(sessionId);
      const targetMessage = history.find((m) => m.id === messageId);

      if (!targetMessage) {
        throw new ChatServiceError(
          `Message not found: ${messageId}`,
          ChatErrorType.INVALID_REQUEST,
        );
      }

      // Generate embeddings for the message
      const embeddings = await this.llmConnector.generateEmbedding(
        targetMessage.content,
      );

      // Set up search options
      const searchOptions: any = {
        maxResults: options.maxResults || 10,
        minRelevanceScore: options.minRelevanceScore || 0.7,
      };

      // If we should exclude the current conversation
      if (!options.includeCurrentConversation) {
        searchOptions.conversationIds = ['*']; // All conversations
        searchOptions.excludeConversationIds = [session.conversationId];
      }

      // Determine which user IDs to search
      const userIds = options.searchAcrossUsers
        ? ['*'] // Search across all users (if allowed by security policy)
        : [session.userId]; // Just this user

      // Collect all results
      const allResults: any[] = [];

      for (const userId of userIds) {
        const results = await this.userContextFacade.searchConversations(
          userId,
          embeddings,
          searchOptions,
        );

        allResults.push(
          ...results.map((r) => ({
            ...r,
            userId,
          })),
        );
      }

      // Sort by relevance score
      const sortedResults = allResults
        .filter((r) => r.id !== messageId) // Remove the source message
        .sort((a, b) => b.score - a.score);

      this.logger.info('Similar message search completed', {
        sessionId,
        messageId,
        resultCount: sortedResults.length,
      });

      return sortedResults.map((r) => ({
        conversationId: r.conversationId,
        turnId: r.turnId || r.id,
        timestamp: r.timestamp,
        message: r.message,
        score: r.score,
        role: r.role,
        userId: r.userId,
      }));
    } catch (error) {
      this.logger.error('Failed to find similar messages', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
        messageId,
      });

      throw new ChatServiceError(
        'Failed to find similar messages',
        ChatErrorType.CONTEXT_RETRIEVAL_ERROR,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * User presence: Update user presence status
   *
   * @param userId User ID
   * @param status New status
   * @param sessionId Optional session ID
   * @param metadata Optional metadata
   */
  updateUserPresence(
    userId: string,
    status: UserStatus,
    sessionId?: string,
    metadata?: Record<string, any>,
  ): void {
    // Get existing presence or create new
    const existingPresence = this.userPresence.get(userId);

    const presence: UserPresence = {
      userId,
      status,
      lastActive: new Date(),
      currentSessionId: sessionId || existingPresence?.currentSessionId,
      metadata: {
        ...existingPresence?.metadata,
        ...metadata,
      },
    };

    // Store updated presence
    this.userPresence.set(userId, presence);

    // Emit presence update event
    const updateEvent: PresenceUpdateEvent = {
      userId,
      status,
      timestamp: presence.lastActive,
      sessionId: presence.currentSessionId,
    };

    this.presenceEvents.emit('presenceUpdate', updateEvent);

    this.logger.debug('User presence updated', {
      userId,
      status,
      sessionId: presence.currentSessionId,
    });
  }

  /**
   * User presence: Get current user presence
   *
   * @param userId User ID
   * @returns User presence or undefined if not tracked
   */
  getUserPresence(userId: string): UserPresence | undefined {
    return this.userPresence.get(userId);
  }

  /**
   * User presence: Get all active users
   *
   * @param status Optional filter by status
   * @returns Array of user presence objects
   */
  getActiveUsers(status?: UserStatus): UserPresence[] {
    const presences = Array.from(this.userPresence.values());

    if (status) {
      return presences.filter((p) => p.status === status);
    }

    return presences;
  }

  /**
   * User presence: Update user typing status
   *
   * @param sessionId Session ID
   * @param isTyping Whether the user is typing
   */
  updateTypingStatus(sessionId: string, isTyping: boolean): void {
    const session = this.getSession(sessionId);

    if (isTyping) {
      this.updateUserPresence(session.userId, UserStatus.TYPING, sessionId);
    } else {
      this.updateUserPresence(session.userId, UserStatus.ONLINE, sessionId);
    }
  }

  /**
   * User presence: Subscribe to presence updates
   *
   * @param callback Function to call on presence updates
   * @returns Function to unsubscribe
   */
  subscribeToPresenceUpdates(
    callback: (event: PresenceUpdateEvent) => void,
  ): () => void {
    this.presenceEvents.on('presenceUpdate', callback);

    // Return unsubscribe function
    return () => {
      this.presenceEvents.off('presenceUpdate', callback);
    };
  }

  /**
   * User presence: Set user as offline when they disconnect
   *
   * @param userId User ID
   * @param sessionId Optional session ID to check
   */
  handleUserDisconnect(userId: string, sessionId?: string): void {
    const presence = this.getUserPresence(userId);

    // If session ID is provided, only set offline if it matches current session
    if (sessionId && presence?.currentSessionId !== sessionId) {
      return;
    }

    this.updateUserPresence(userId, UserStatus.OFFLINE);
  }

  /**
   * Analytics: Generate conversation analytics
   *
   * @param userId User ID
   * @param options Analytics options
   * @returns Analytics results
   */
  async generateAnalytics(
    userId: string,
    options: {
      conversationId?: string;
      timeframe?: {
        startTime?: number;
        endTime?: number;
      };
      includeUsageStatistics?: boolean;
      includeTopicAnalysis?: boolean;
      includeSentimentAnalysis?: boolean;
      includeAgentPerformance?: boolean;
      includeQualityMetrics?: boolean;
      includeSegmentAnalytics?: boolean;
      forceRefresh?: boolean;
    } = {},
  ): Promise<any> {
    try {
      // Verify that the conversation exists if ID is provided
      if (options.conversationId) {
        const conversations =
          await this.userContextFacade.listUserConversations(userId);
        const exists = conversations.some(
          (c) => c.conversationId === options.conversationId,
        );

        if (!exists) {
          throw new ChatServiceError(
            `Conversation not found: ${options.conversationId}`,
            ChatErrorType.INVALID_REQUEST,
          );
        }
      }

      // Get analytics from the conversation analytics service
      // For simplicity in this implementation, we'll use the methods from userContextFacade
      // In a real implementation, you might have a dedicated ConversationAnalyticsService

      // First, prepare the analytics data
      // This is a simplified implementation - in a production system,
      // this would be handled by dedicated analytics services

      // Track conversation metrics
      let result: any = {
        userId,
        timestamp: Date.now(),
        timeframe: {
          start:
            options.timeframe?.startTime ||
            Date.now() - 30 * 24 * 60 * 60 * 1000, // Default to last 30 days
          end: options.timeframe?.endTime || Date.now(),
        },
      };

      // Get user's conversations
      const allConversations =
        await this.userContextFacade.listUserConversations(userId);

      // Filter by timeframe and conversationId if needed
      const conversations = allConversations.filter((conv) => {
        // Time range filter
        const inTimeRange =
          conv.lastTimestamp >= (options.timeframe?.startTime || 0) &&
          conv.firstTimestamp <= (options.timeframe?.endTime || Date.now());

        // Conversation ID filter
        const matchesConvId = options.conversationId
          ? conv.conversationId === options.conversationId
          : true;

        return inTimeRange && matchesConvId;
      });

      // Calculate basic usage statistics
      if (options.includeUsageStatistics !== false) {
        const totalConversations = conversations.length;
        const totalTurns = conversations.reduce(
          (sum, conv) => sum + conv.turnCount,
          0,
        );

        result.usageStatistics = {
          conversationCount: totalConversations,
          totalMessageCount: totalTurns,
          averageTurnsPerConversation:
            totalConversations > 0 ? totalTurns / totalConversations : 0,
          activeConversations: conversations.filter(
            (c) => c.lastTimestamp > Date.now() - 7 * 24 * 60 * 60 * 1000,
          ).length, // Active in last 7 days
          oldestConversation:
            conversations.length > 0
              ? Math.min(...conversations.map((c) => c.firstTimestamp))
              : null,
          newestConversation:
            conversations.length > 0
              ? Math.max(...conversations.map((c) => c.lastTimestamp))
              : null,
        };

        // Add message distribution by role (user vs assistant)
        // This would require additional queries in a real implementation
        result.usageStatistics.messageDistribution = {
          user: Math.floor(totalTurns / 2), // Approximate - would be actual counts in real implementation
          assistant: Math.ceil(totalTurns / 2), // Approximate - would be actual counts in real implementation
        };
      }

      // Include agent performance if requested
      if (options.includeAgentPerformance !== false) {
        // Group conversations by agent
        const agentStats = new Map();

        for (const conv of conversations) {
          if (conv.agentIds && conv.agentIds.length > 0) {
            for (const agentId of conv.agentIds) {
              if (!agentStats.has(agentId)) {
                agentStats.set(agentId, {
                  agentId,
                  conversationCount: 0,
                  messageCount: 0,
                });
              }

              const stats = agentStats.get(agentId);
              stats.conversationCount++;
              stats.messageCount += conv.turnCount / conv.agentIds.length; // Distribute turns among agents
            }
          }
        }

        result.agentPerformance = Array.from(agentStats.values());
      }

      // Get segment analytics if requested
      if (
        options.includeSegmentAnalytics !== false &&
        conversations.length > 0
      ) {
        const segmentCounts = new Map();
        const segmentData = [];

        // For each conversation, get segments
        for (const conv of conversations) {
          if (conv.segments && conv.segments > 0) {
            try {
              const segments =
                await this.userContextFacade.getConversationSegments(
                  userId,
                  conv.conversationId,
                );

              for (const segment of segments) {
                // Count by topic
                const topic = segment.segmentTopic || 'Unlabeled';
                segmentCounts.set(topic, (segmentCounts.get(topic) || 0) + 1);

                // Add segment data
                segmentData.push({
                  segmentId: segment.segmentId,
                  topic,
                  conversationId: conv.conversationId,
                  turnCount: segment.turnCount,
                  firstTimestamp: segment.firstTimestamp,
                  lastTimestamp: segment.lastTimestamp,
                });
              }
            } catch (error) {
              this.logger.warn(
                `Failed to get segments for conversation ${conv.conversationId}`,
                {
                  error: error instanceof Error ? error.message : String(error),
                  userId,
                },
              );
            }
          }
        }

        // Convert topic distribution to array format
        const topicDistribution = Array.from(segmentCounts.entries())
          .map(([topic, count]) => ({ topic, count }))
          .sort((a, b) => b.count - a.count);

        result.segmentAnalytics = {
          topicDistribution,
          segments: segmentData,
        };
      }

      this.logger.info('Generated conversation analytics', {
        userId,
        conversationId: options.conversationId,
        resultSections: Object.keys(result).filter(
          (k) => k !== 'userId' && k !== 'timestamp' && k !== 'timeframe',
        ),
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to generate analytics', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        conversationId: options.conversationId,
      });

      throw new ChatServiceError(
        'Failed to generate conversation analytics',
        ChatErrorType.ANALYTICS_ERROR,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Analytics: Track conversation metrics for a specific event
   *
   * @param sessionId Session ID
   * @param event Event to track
   * @param data Additional data for the event
   */
  trackEvent(
    sessionId: string,
    event: string,
    data: Record<string, any> = {},
  ): void {
    try {
      const session = this.getSession(sessionId);

      // In a real implementation, this would store events in a proper analytics system
      // For this implementation, we'll just log the event
      this.logger.info(`Analytics event: ${event}`, {
        sessionId,
        userId: session.userId,
        conversationId: session.conversationId,
        timestamp: Date.now(),
        ...data,
      });
    } catch (error) {
      // Log but don't throw errors for analytics
      this.logger.warn(`Failed to track analytics event: ${event}`, {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
    }
  }

  /**
   * Analytics: Get session metrics
   *
   * @param sessionId Session ID
   * @returns Session metrics
   */
  async getSessionMetrics(sessionId: string): Promise<any> {
    const session = this.getSession(sessionId);

    try {
      // Get session history
      const history = await this.getSessionHistory(sessionId);

      // Calculate metrics
      const userMessages = history.filter((m) => m.role === 'user');
      const assistantMessages = history.filter((m) => m.role === 'assistant');

      // Calculate response times
      const responseTimes: number[] = [];
      for (let i = 0; i < userMessages.length; i++) {
        const userMsg = userMessages[i];
        const assistantMsg = assistantMessages.find(
          (m) => m.timestamp > userMsg.timestamp,
        );

        if (assistantMsg) {
          const responseTime =
            assistantMsg.timestamp.getTime() - userMsg.timestamp.getTime();
          responseTimes.push(responseTime);
        }
      }

      // Calculate average response time
      const avgResponseTime =
        responseTimes.length > 0
          ? responseTimes.reduce((sum, time) => sum + time, 0) /
            responseTimes.length
          : null;

      return {
        sessionId,
        userId: session.userId,
        conversationId: session.conversationId,
        messageCount: history.length,
        userMessageCount: userMessages.length,
        assistantMessageCount: assistantMessages.length,
        avgResponseTimeMs: avgResponseTime,
        sessionDurationMs:
          history.length > 0
            ? new Date().getTime() - history[0].timestamp.getTime()
            : 0,
        createdAt: session.createdAt,
        lastActive: session.lastActive,
      };
    } catch (error) {
      this.logger.error('Failed to get session metrics', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });

      throw new ChatServiceError(
        'Failed to get session metrics',
        ChatErrorType.ANALYTICS_ERROR,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Error Recovery: Attempt to recover a failed session
   *
   * @param sessionId Session ID
   * @param options Recovery options
   * @returns Recovered session
   */
  async recoverSession(
    sessionId: string,
    options: {
      createNewIfNotFound?: boolean;
      preserveHistory?: boolean;
      maxRecoveryAttempts?: number;
    } = {},
  ): Promise<ChatSession> {
    const maxAttempts = options.maxRecoveryAttempts || 3;
    let attempts = 0;
    let lastError: Error | undefined;

    // Try to get the session directly first
    try {
      const session = this.sessions.get(sessionId);
      if (session) return session;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      this.logger.warn('Initial session recovery attempt failed', {
        sessionId,
        error: lastError.message,
      });
    }

    // Session not found in memory, try to recover
    while (attempts < maxAttempts) {
      attempts++;

      try {
        // First, check if we can find sessions for the user
        // Get all sessions and find one with matching sessionId or conversationId
        const allSessions = Array.from(this.sessions.values());

        // Try to find by conversationId if we have it
        let conversationId: string | undefined;
        let userId: string | undefined;

        // Look for a session with this ID in our historical logs
        for (const session of allSessions) {
          if (
            session.metadata &&
            session.metadata.previousSessionIds &&
            Array.isArray(session.metadata.previousSessionIds) &&
            session.metadata.previousSessionIds.includes(sessionId)
          ) {
            userId = session.userId;
            conversationId = session.conversationId;
            break;
          }
        }

        // If we found the user, try to create a new session
        if (userId && conversationId && options.createNewIfNotFound) {
          this.logger.info('Attempting to recreate session', {
            sessionId,
            userId,
            conversationId,
          });

          // Create new session with the same conversation
          const newSession = await this.createSession({
            userId,
            conversationId,
            metadata: {
              recoveredFrom: sessionId,
              recoveryAttempt: attempts,
              preserveHistory: options.preserveHistory,
              previousSessionIds: [sessionId],
            },
          });

          // Add the old session ID to the metadata if metadata exists
          if (newSession.metadata) {
            if (!newSession.metadata.previousSessionIds) {
              newSession.metadata.previousSessionIds = [];
            }

            // Only add if not already in the array
            if (!newSession.metadata.previousSessionIds.includes(sessionId)) {
              newSession.metadata.previousSessionIds.push(sessionId);
            }
          }

          this.logger.info(
            'Successfully recovered session by creating a new one',
            {
              oldSessionId: sessionId,
              newSessionId: newSession.sessionId,
              conversationId,
            },
          );

          return newSession;
        }

        // No recovery possible
        throw new ChatServiceError(
          `Cannot recover session: ${sessionId}`,
          ChatErrorType.SESSION_NOT_FOUND,
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Session recovery attempt ${attempts} failed`, {
          sessionId,
          error: lastError.message,
        });

        // Wait a moment before retrying
        await new Promise((resolve) => setTimeout(resolve, 100 * attempts));
      }
    }

    // All recovery attempts failed
    throw new ChatServiceError(
      `Failed to recover session after ${attempts} attempts: ${sessionId}`,
      ChatErrorType.SESSION_NOT_FOUND,
      { originalError: lastError?.message },
    );
  }

  /**
   * Error Recovery: Clean up corrupted data
   *
   * @param sessionId Session ID
   * @returns Whether the cleanup was successful
   */
  async cleanupCorruptedSession(sessionId: string): Promise<boolean> {
    try {
      const session = this.sessions.get(sessionId);

      if (!session) {
        throw new ChatServiceError(
          `Session not found: ${sessionId}`,
          ChatErrorType.SESSION_NOT_FOUND,
        );
      }

      // Remove from sessions map
      this.sessions.delete(sessionId);

      // Remove supervisor
      this.supervisors.delete(sessionId);

      // Log the cleanup
      this.logger.info('Cleaned up corrupted session', {
        sessionId,
        userId: session.userId,
        conversationId: session.conversationId,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to clean up corrupted session', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });

      return false;
    }
  }

  /**
   * Error Recovery: Create a diagnostic snapshot of the service state
   *
   * @returns Diagnostic information
   */
  createDiagnosticSnapshot(): Record<string, any> {
    try {
      // Collect diagnostic information
      const activeSessionCount = this.sessions.size;
      const activeSupervisorCount = this.supervisors.size;
      const activeUserCount = this.userPresence.size;

      // Get session status
      const sessionStatus = Array.from(this.sessions.entries()).map(
        ([id, session]) => ({
          sessionId: id,
          userId: session.userId,
          conversationId: session.conversationId,
          createdAt: session.createdAt,
          lastActive: session.lastActive,
          hasSupervisor: this.supervisors.has(id),
          agentId: session.agentId,
          metadataKeys: Object.keys(session.metadata || {}),
        }),
      );

      // Get supervisor status
      const supervisorIds = Array.from(this.supervisors.keys());

      // Get user presence
      const userStatus = Array.from(this.userPresence.entries()).map(
        ([id, presence]) => ({
          userId: id,
          status: presence.status,
          lastActive: presence.lastActive,
          currentSessionId: presence.currentSessionId,
        }),
      );

      // Get memory usage
      const memoryUsage = process.memoryUsage();

      // Return the snapshot
      return {
        timestamp: new Date(),
        activeSessionCount,
        activeSupervisorCount,
        activeUserCount,
        sessionStatus,
        supervisorIds,
        userStatus,
        memoryUsage: {
          rss: formatFileSize(memoryUsage.rss),
          heapTotal: formatFileSize(memoryUsage.heapTotal),
          heapUsed: formatFileSize(memoryUsage.heapUsed),
          external: formatFileSize(memoryUsage.external),
        },
      };
    } catch (error) {
      this.logger.error('Failed to create diagnostic snapshot', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return basic info if we hit an error
      return {
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
        sessionCount: this.sessions.size,
        userCount: this.userPresence.size,
      };
    }
  }

  /**
   * Error Recovery: Recover a conversation's message history if session is lost
   *
   * @param userId User ID
   * @param conversationId Conversation ID
   * @returns Recovered messages
   */
  async recoverConversationHistory(
    userId: string,
    conversationId: string,
  ): Promise<ChatMessage[]> {
    try {
      // Get conversation history from user context
      const historyTurns = await this.userContextFacade.getConversationHistory(
        userId,
        conversationId,
        100, // Get up to 100 messages to ensure we have the full history
        { includeMetadata: true },
      );

      // Convert to chat messages
      const messages: ChatMessage[] = historyTurns.map((turn) => ({
        id: turn.metadata?.turnId || `recovered-${uuidv4()}`,
        sessionId: turn.metadata?.sessionId || `recovered-session-${uuidv4()}`,
        content: turn.content || '',
        role: turn.role as 'user' | 'assistant' | 'system',
        timestamp: new Date(turn.timestamp || Date.now()),
        metadata: {
          ...turn.metadata,
          recovered: true,
          originalTimestamp: turn.timestamp,
        },
      }));

      this.logger.info('Recovered conversation history', {
        userId,
        conversationId,
        messageCount: messages.length,
      });

      return messages;
    } catch (error) {
      this.logger.error('Failed to recover conversation history', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        conversationId,
      });

      throw new ChatServiceError(
        'Failed to recover conversation history',
        ChatErrorType.CONTEXT_RETRIEVAL_ERROR,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Clean up resources used by the service
   */
  public cleanup(): void {
    if (this.presenceUpdateInterval) {
      clearInterval(this.presenceUpdateInterval);
      this.presenceUpdateInterval = undefined;
    }

    // Terminate all supervisor agents
    for (const [sessionId, supervisor] of this.supervisors.entries()) {
      try {
        // Call cleanup on the supervisor
        supervisor.cleanup();
        this.logger.info('Cleaned up supervisor for session', { sessionId });
      } catch (error) {
        this.logger.error('Failed to clean up supervisor for session', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Clear collections
    this.sessions.clear();
    this.supervisors.clear();
    this.userPresence.clear();

    // Remove all event listeners
    this.presenceEvents.removeAllListeners();

    this.logger.info('Chat service resources cleaned up');
  }
}
