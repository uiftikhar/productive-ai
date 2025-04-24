/**
 * History-Aware Supervisor Integration
 *
 * Extends the standard supervisor workflow with conversation history awareness
 * and analytics capabilities for improved decision making.
 *
 * FIXME: This file contains multiple type errors that need to be addressed:
 * 1. Type mismatch between HistoryAwareSupervisorState and SupervisorExecutionState
 * 2. Missing or incorrect properties in the SupervisorWorkflow parent class
 * 3. Incorrect parameter types for API calls (conversationService/userContextService)
 * 4. Missing properties for API calls (query parameter, history, relevantSegments)
 * 5. Parameter type mismatches in several method calls
 *
 * A comprehensive refactoring would require:
 * - Reviewing the SupervisorWorkflow class API and correcting all references
 * - Updating the HistoryAwareSupervisorState interface to match expected types
 * - Fixing parameter types in API calls to match the correct interfaces
 * - Adding type annotations to avoid implicit any types
 */

import {
  SupervisorExecutionState,
  SupervisorWorkflow,
} from './supervisor-workflow';
import { ConversationContextService } from '../../../shared/services/user-context/conversation-context.service';
import { ConversationAnalyticsService } from '../../../shared/services/analytics/conversation-analytics.service';
import { ConversationIndexingService } from '../../../shared/services/user-context/conversation-indexing.service';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { PineconeConnectionService } from '../../../pinecone/pinecone-connection.service';
import { AgentExecutionState } from './agent-workflow';
import { UserContextFacade } from '../../../shared/services/user-context/user-context.facade';
import { LanguageModelProvider } from '../../../agents/interfaces/language-model-provider.interface';
import { BaseAgent } from '../../../agents/base/base-agent';
import { logger } from '../../../shared/utils/logger';
import { ConversationHistoryItem } from '../../../shared/services/user-context/interfaces/conversation-history-item.interface';
import {
  AgentRequest,
  AgentResponse,
} from '../../../agents/interfaces/base-agent.interface';
import { AgentCapabilities } from '../../types/agent-capabilities.enum';
import {
  SupervisorAgent,
  SupervisorAgentConfig,
} from '../../../agents/specialized/supervisor-agent';
import { WorkflowStatus } from './base-workflow';

/**
 * Configuration options for the history-aware supervisor
 */
export interface HistoryAwareSupervisorOptions {
  logger?: Logger;
  conversationContextService?: ConversationContextService;
  conversationAnalyticsService?: ConversationAnalyticsService;
  conversationIndexingService?: ConversationIndexingService;
  pineconeService?: PineconeConnectionService;
  historyWindowSize?: number;
  useRelevanceRanking?: boolean;
  includeAnalytics?: boolean;
  summarizeHistory?: boolean;
  maxHistoryTokens?: number;
  agentContextFilters?: {
    includeAgentIds?: string[];
    excludeAgentIds?: string[];
  };
  userContextFacade: UserContextFacade;
  llmConnector: LanguageModelProvider;
  userId?: string;
  conversationId?: string;
  historyLimit?: number;
  includeMetadata?: boolean;
}

/**
 * Enhanced state for history-aware supervisor
 */
export interface HistoryAwareSupervisorState
  extends Omit<SupervisorExecutionState, 'input'> {
  conversationHistory?: any[];
  conversationSummary?: string;
  conversationAnalytics?: any;
  relevantContextSnippets?: any[];
  historyIndex?: string;
  userId?: string;
  conversationId?: string;
  input?: string;
  systemPrompt?: string;
  output?: any;
}

// Define the execution result interface
export interface HistoryAwareExecutionResult {
  finalResponse: any;
  tasks: any[];
  metrics: {
    totalExecutionTimeMs: number;
    taskExecutionTimes?: Record<string, number>;
    totalTokensUsed?: number;
  };
  agentsInvolved: string[];
  primaryAgent?: string;
  createNewSegment?: boolean;
  segmentTitle?: string;
  segmentSummary?: string;
  conversationId?: string;
  userId?: string;
}

/**
 * A supervisor implementation that utilizes conversation history
 * and analytics for improved decision making
 */
export class HistoryAwareSupervisor extends SupervisorWorkflow {
  private conversationContextService: ConversationContextService;
  private conversationAnalyticsService: ConversationAnalyticsService;
  private conversationIndexingService: ConversationIndexingService;
  private historyWindowSize: number;
  private useRelevanceRanking: boolean;
  private includeAnalytics: boolean;
  private summarizeHistory: boolean;
  private maxHistoryTokens: number;
  private agentContextFilters: {
    includeAgentIds?: string[];
    excludeAgentIds?: string[];
  };
  private userContextFacade: UserContextFacade;
  private historyLimit: number;
  private userId?: string;
  private conversationId?: string;
  private includeMetadata: boolean;
  private registeredAgents: Map<string, BaseAgent> = new Map();
  private workflow: SupervisorWorkflow;
  private llmConnector: LanguageModelProvider;

  constructor(options: Partial<HistoryAwareSupervisorOptions> = {}) {
    // Create a SupervisorAgent for the parent class constructor
    const logger = options.logger || new ConsoleLogger();
    const supervisorConfig: SupervisorAgentConfig = {
      name: 'HistoryAwareSupervisor',
      description:
        'A supervisor that incorporates conversation history for improved decision making',
      logger,
    };

    const supervisorAgent = new SupervisorAgent(supervisorConfig);

    // Initialize parent class with the supervisor agent
    super(supervisorAgent, { logger });

    // Assign this as workflow for internal references
    this.workflow = this;

    // Create or store Pinecone service
    const pineconeService =
      options.pineconeService ||
      new PineconeConnectionService({
        logger,
      });

    // Create or store context service
    this.conversationContextService =
      options.conversationContextService ||
      new ConversationContextService({
        pineconeService,
        logger,
      });

    // Create or store analytics service
    this.conversationAnalyticsService =
      options.conversationAnalyticsService ||
      new ConversationAnalyticsService({
        logger,
      });

    // Create or store indexing service
    this.conversationIndexingService =
      options.conversationIndexingService ||
      new ConversationIndexingService({
        conversationService: this.conversationContextService,
        pineconeService,
        logger,
      });

    // Store configuration
    this.historyWindowSize = options.historyWindowSize || 20;
    this.useRelevanceRanking = options.useRelevanceRanking ?? true;
    this.includeAnalytics = options.includeAnalytics ?? true;
    this.summarizeHistory = options.summarizeHistory ?? true;
    this.maxHistoryTokens = options.maxHistoryTokens || 4000;
    this.agentContextFilters = options.agentContextFilters || {};

    // Check for required properties
    if (!options.userContextFacade) {
      throw new Error(
        'userContextFacade is required for HistoryAwareSupervisor',
      );
    }
    this.userContextFacade = options.userContextFacade;

    // Check for required properties
    if (!options.llmConnector) {
      throw new Error('llmConnector is required for HistoryAwareSupervisor');
    }
    this.llmConnector = options.llmConnector;

    this.historyLimit = options.historyLimit || 10;
    this.userId = options.userId;
    this.conversationId = options.conversationId;
    this.includeMetadata = options.includeMetadata || false;
  }

  /**
   * Extend the state schema for history-aware supervision
   */
  protected createStateSchema() {
    // Get the base schema from parent class
    const baseSchema = super.createStateSchema();

    // Add history-aware fields
    return {
      ...baseSchema,
      conversationHistory: {
        type: 'array',
        items: {
          type: 'object',
        },
        description: 'Relevant conversation history for context',
      },
      conversationSummary: {
        type: 'string',
        description: 'A summary of the conversation history',
      },
      conversationAnalytics: {
        type: 'object',
        description: 'Analytics data for the conversation',
      },
      relevantContextSnippets: {
        type: 'array',
        items: {
          type: 'object',
        },
        description: 'Context snippets relevant to the current task',
      },
      historyIndex: {
        type: 'string',
        description: 'ID of the conversation history index',
      },
    };
  }

  /**
   * Initialize the supervisor state with history context
   */
  async initializeStateWithHistory(
    state: AgentExecutionState,
    options: any = {},
  ): Promise<HistoryAwareSupervisorState> {
    try {
      // Create a new state with workflow-specific properties
      const baseState: HistoryAwareSupervisorState = {
        ...state,
        status: WorkflowStatus.INITIALIZING,
        teamMembers: [],
        tasks: {},
        taskAssignments: {},
        taskStatus: {},
        taskResults: {},
        taskErrors: {},
        currentPhase: 'planning',
      };

      // Only initialize history context if user and conversation IDs are available
      if (baseState.userId && baseState.conversationId) {
        await this.enrichStateWithHistoryContext(baseState);
      }

      return baseState;
    } catch (error) {
      this.logger.error('Error initializing history-aware supervisor state', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return a basic state if enrichment fails
      return {
        ...state,
        status: WorkflowStatus.INITIALIZING,
        teamMembers: [],
        tasks: {},
        taskAssignments: {},
        taskStatus: {},
        taskResults: {},
        taskErrors: {},
        currentPhase: 'planning',
      };
    }
  }

  /**
   * Enrich the state with history context and analytics
   */
  private async enrichStateWithHistoryContext(
    state: HistoryAwareSupervisorState,
  ): Promise<void> {
    const { userId, conversationId, input } = state;

    if (!userId || !conversationId) {
      return;
    }

    try {
      // Retrieve conversation history
      const historyOptions: any = {
        limit: this.historyWindowSize,
      };

      // Apply agent filters if configured
      if (this.agentContextFilters.includeAgentIds?.length) {
        historyOptions.agentIds = this.agentContextFilters.includeAgentIds;
      }

      // Get conversation history, either by relevance or chronologically
      let history;
      if (this.useRelevanceRanking && input) {
        // Get history based on relevance to the current input
        const contextWindow =
          await this.conversationContextService.createContextWindow(
            userId,
            conversationId,
            {
              windowSize: this.historyWindowSize,
              includeAgentIds: this.agentContextFilters.includeAgentIds,
              excludeAgentIds: this.agentContextFilters.excludeAgentIds,
              filterByCapabilities: [AgentCapabilities.HISTORY_AWARE],
              maxTokens: this.maxHistoryTokens,
              relevanceQuery: input, // Use the correct property name
            },
          );

        history = contextWindow.messages; // Use the correct property name
        state.relevantContextSnippets = []; // Initialize empty array, we don't have segments
      } else {
        // Get chronological history
        history = await this.conversationContextService.getConversationHistory(
          userId,
          conversationId,
          this.historyWindowSize,
          historyOptions,
        );
      }

      // Store history in state
      state.conversationHistory = history;

      // Generate a summary if configured
      if (this.summarizeHistory && history.length > 0) {
        const summary =
          await this.conversationContextService.generateContextSummary(
            userId,
            conversationId,
          );

        state.conversationSummary = summary;
      }

      // Include analytics if configured
      if (this.includeAnalytics) {
        const analytics =
          await this.conversationAnalyticsService.generateAnalytics(userId, {
            timeframe: {
              // Use the last 30 days
              startTime: Date.now() - 30 * 24 * 60 * 60 * 1000,
              endTime: Date.now(),
            },
            includeUsageStatistics: true,
            includeTopicAnalysis: true,
            includeSentimentAnalysis: true,
          });

        state.conversationAnalytics = analytics;
      }

      // Create or get index for optimized retrieval
      const indices =
        await this.conversationIndexingService.listIndices(userId);
      let historyIndex = indices.find((idx) =>
        idx.conversations.includes(conversationId),
      );

      if (!historyIndex) {
        // Create a new index if none exists for this conversation
        historyIndex = await this.conversationIndexingService.createIndex(
          userId,
          { conversationIds: [conversationId] },
        );
      }

      state.historyIndex = historyIndex.indexId;
    } catch (error) {
      this.logger.error(
        'Error enriching supervisor state with history context',
        {
          userId,
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Custom assessment logic that includes history-aware decision making
   */
  async assessWithHistory(
    state: HistoryAwareSupervisorState,
  ): Promise<HistoryAwareSupervisorState> {
    // Ensure state has necessary history context
    if (state.userId && state.conversationId && !state.conversationHistory) {
      await this.enrichStateWithHistoryContext(state);
    }

    // Include history awareness in the prompt to the supervisor
    if (state.systemPrompt && state.conversationSummary) {
      state.systemPrompt += `\n\nCONVERSATION SUMMARY: ${state.conversationSummary}\n`;

      // Include analytics insights if available
      if (state.conversationAnalytics) {
        const analytics = state.conversationAnalytics;

        if (analytics.sentimentAnalysis) {
          state.systemPrompt += `\nSENTIMENT ANALYSIS: Overall sentiment is ${analytics.sentimentAnalysis.overallSentiment}. `;

          if (analytics.sentimentAnalysis.sentimentTrend) {
            state.systemPrompt += `Trend is ${analytics.sentimentAnalysis.sentimentTrend}.`;
          }
        }

        if (analytics.topicAnalysis?.mainTopics?.length) {
          state.systemPrompt += `\nMAIN TOPICS: ${analytics.topicAnalysis.mainTopics.join(', ')}`;
        }
      }
    }

    // Since we can't directly call super.assess, we'll implement similar logic
    // but we would need to implement the full assessment logic from the parent class
    state.status = WorkflowStatus.EXECUTING;

    return state;
  }

  /**
   * Search conversation history for relevant context
   */
  async searchConversationHistory(
    state: HistoryAwareSupervisorState,
    query: string,
    options: {
      limit?: number;
      minRelevanceScore?: number;
    } = {},
  ): Promise<any[]> {
    if (!state.userId || !state.historyIndex) {
      return [];
    }

    try {
      // Search using the indexing service
      const searchResults = await this.conversationIndexingService.search(
        state.userId,
        query,
        {
          limit: options.limit || 5,
          minScore: options.minRelevanceScore || 0.7,
          includeMetadata: true,
        },
      );

      return searchResults;
    } catch (error) {
      this.logger.error('Error searching conversation history', {
        userId: state.userId,
        query,
        error: error instanceof Error ? error.message : String(error),
      });

      return [];
    }
  }

  /**
   * Custom task execution with history context enhancement
   */
  async executeTaskWithHistory(
    state: HistoryAwareSupervisorState,
    task: any,
    agent: any,
  ): Promise<HistoryAwareSupervisorState> {
    try {
      // For agents with HISTORY_AWARE capability, include relevant history
      if (
        agent.capabilities?.includes(AgentCapabilities.HISTORY_AWARE) &&
        state.conversationHistory?.length
      ) {
        // Find task-specific relevant context if a task description is available
        let relevantHistory = state.conversationHistory;

        if (task.description && state.userId && state.historyIndex) {
          // Search for context relevant to this specific task
          const searchResults = await this.searchConversationHistory(
            state,
            task.description,
            { limit: 10 },
          );

          if (searchResults.length > 0) {
            relevantHistory = searchResults;
          }
        }

        // Include relevant history in the task context
        if (!task.context) {
          task.context = {};
        }

        task.context.conversationHistory = relevantHistory;

        // Include summary if available
        if (state.conversationSummary) {
          task.context.conversationSummary = state.conversationSummary;
        }

        // Include relevant analytics if available
        if (state.conversationAnalytics) {
          task.context.conversationAnalytics = state.conversationAnalytics;
        }
      }

      // Since we can't directly call super.executeTask, we would need to implement
      // equivalent logic for task execution here
      // For now, we'll make a simplified version that executes the task

      const result = await agent.execute({
        input: task.input,
        context: task.context,
        capability: task.capability,
        parameters: task.parameters,
      } as AgentRequest);

      // Update the state with task results
      if (!state.taskResults) {
        state.taskResults = {};
      }

      state.taskResults[task.id] = result;

      return state;
    } catch (error) {
      this.logger.error('Error executing task with history context', {
        taskId: task.id,
        agentId: agent.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Fall back to basic error handling
      if (!state.taskErrors) {
        state.taskErrors = {};
      }

      state.taskErrors[task.id] =
        error instanceof Error ? error.message : String(error);

      return state;
    }
  }

  /**
   * After execution completes, update analytics with new conversation data
   */
  async afterExecution(
    state: HistoryAwareSupervisorState,
  ): Promise<HistoryAwareSupervisorState> {
    // Since we can't call super.afterExecution, we'll just focus on our specific additions

    try {
      // Only update analytics if execution was successful and we have required data
      if (
        state.userId &&
        state.conversationId &&
        state.output &&
        this.includeAnalytics
      ) {
        // Update analytics in the background
        this.conversationAnalyticsService
          .generateAnalytics(state.userId, {
            timeframe: {
              startTime: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
              endTime: Date.now(),
            },
            includeTopicAnalysis: true,
            includeSentimentAnalysis: true,
            includeUsageStatistics: true,
          })
          .catch((error) => {
            this.logger.error('Error updating analytics after execution', {
              userId: state.userId,
              conversationId: state.conversationId,
              error: error instanceof Error ? error.message : String(error),
            });
          });

        // Refresh index in the background
        if (state.historyIndex) {
          this.conversationIndexingService
            .refreshIndex(state.historyIndex)
            .catch((error) => {
              this.logger.error('Error refreshing index after execution', {
                userId: state.userId,
                indexId: state.historyIndex,
                error: error instanceof Error ? error.message : String(error),
              });
            });
        }
      }
    } catch (error) {
      this.logger.error(
        'Error in afterExecution for history-aware supervisor',
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }

    // Set status to completed
    state.status = WorkflowStatus.COMPLETED;

    return state;
  }

  /**
   * Register an agent with this history-aware supervisor
   * This overrides the parent registerAgent method
   */
  registerAgent(agent: BaseAgent): void {
    this.registeredAgents.set(agent.name, agent);
    // Note: we don't call this.workflow.registerAgent here to avoid the error
  }

  /**
   * Add a dependency between agents in this history-aware supervisor
   * This overrides the parent addAgentDependency method
   */
  addAgentDependency(
    dependentAgentName: string,
    dependencyAgentName: string,
  ): void {
    // Note: we don't call this.workflow.addAgentDependency here to avoid the error
    // In a production environment, you would need to implement the dependency logic here
  }

  /**
   * Execute the workflow with history awareness
   */
  async executeWithHistory(
    userInput: string,
    options?: {
      userId?: string;
      conversationId?: string;
      historyLimit?: number;
      includeMetadata?: boolean;
    },
  ): Promise<HistoryAwareExecutionResult> {
    const startTime = Date.now();

    // Determine the user and conversation IDs to use
    const userId = options?.userId || this.userId;
    const conversationId = options?.conversationId || this.conversationId;

    if (!userId || !conversationId) {
      throw new Error(
        'userId and conversationId must be provided either in constructor or in executeWithHistory options',
      );
    }

    // Retrieve conversation history
    const historyLimit = options?.historyLimit || this.historyLimit;
    const includeMetadata =
      options?.includeMetadata !== undefined
        ? options.includeMetadata
        : this.includeMetadata;

    let conversationHistory: ConversationHistoryItem[] = [];
    try {
      conversationHistory = await this.userContextFacade.getConversationHistory(
        userId,
        conversationId,
        historyLimit,
        { includeMetadata },
      );

      logger.debug(
        `Retrieved ${conversationHistory.length} history items for conversation`,
        {
          userId,
          conversationId,
          historyLimit,
        },
      );
    } catch (error) {
      logger.warn(
        'Failed to retrieve conversation history, proceeding without it',
        {
          error,
          userId,
          conversationId,
        },
      );
    }

    // Check if this is a topic change that might require a new segment
    const needsNewSegment = this.detectTopicChange(
      userInput,
      conversationHistory,
    );

    // Prepare enhanced prompt with history context
    const enhancedPrompt = this.createHistoryAwarePrompt(
      userInput,
      conversationHistory,
    );

    // Since we can't directly execute using this.workflow.execute, we'll need
    // to create our own execution logic that mimics the supervisor workflow

    // First, create our result object with placeholders
    const result = {
      finalResponse: enhancedPrompt, // This would normally be the response from the agent
      taskResults: [], // Placeholder for task results
      metrics: {
        totalTokensUsed: 0,
      },
    };

    // Determine which agents were involved - in this stub implementation, none
    const agentsInvolved: string[] = [];

    // Analyze results to determine primary agent - none in our stub
    const primaryAgent = undefined;

    // Calculate task execution times - none in our stub
    const taskExecutionTimes: Record<string, number> = {};

    // Prepare the final result
    const executionResult: HistoryAwareExecutionResult = {
      finalResponse: result.finalResponse,
      tasks: result.taskResults || [],
      metrics: {
        totalExecutionTimeMs: Date.now() - startTime,
        totalTokensUsed: result.metrics?.totalTokensUsed,
        taskExecutionTimes,
      },
      agentsInvolved,
      primaryAgent,
      createNewSegment: needsNewSegment,
      userId,
      conversationId,
    };

    // If we need a new segment, generate a title and summary
    if (needsNewSegment) {
      try {
        const segmentInfo = await this.generateSegmentInfo(
          userInput,
          conversationHistory,
        );
        executionResult.segmentTitle = segmentInfo.title;
        executionResult.segmentSummary = segmentInfo.summary;
      } catch (error) {
        logger.error('Failed to generate segment information', { error });
      }
    }

    return executionResult;
  }

  /**
   * Creates an enhanced prompt that includes relevant conversation history
   */
  private createHistoryAwarePrompt(
    userInput: string,
    history: ConversationHistoryItem[],
  ): string {
    if (!history || history.length === 0) {
      return userInput;
    }

    // Create a formatted history string
    const formattedHistory = history
      .map((item) => {
        return `${item.role.toUpperCase()}: ${item.content}`;
      })
      .join('\n\n');

    // Create the enhanced prompt
    return `
I'll provide you with the conversation history and a new user query.
Please use this context to provide a contextually relevant response.

--- CONVERSATION HISTORY ---
${formattedHistory}

--- NEW USER QUERY ---
${userInput}
`;
  }

  /**
   * Detects if the user input represents a significant topic change
   * that might warrant creating a new conversation segment
   */
  private detectTopicChange(
    userInput: string,
    history: ConversationHistoryItem[],
  ): boolean {
    // If there's no history, it's not a topic change
    if (!history || history.length === 0) {
      return false;
    }

    // Simple heuristic: check for explicit topic change indicators
    const topicChangeIndicators = [
      'different topic',
      'new topic',
      'change subject',
      'switch gears',
      'move on to',
      'talk about something else',
      "let's discuss",
    ];

    // Check if any indicators are present in the user input
    return topicChangeIndicators.some((indicator) =>
      userInput.toLowerCase().includes(indicator.toLowerCase()),
    );

    // Note: In a real implementation, you might use more sophisticated
    // techniques like semantic similarity comparison between the new input
    // and recent conversation history
  }

  /**
   * Determines which agent was the primary contributor based on task results
   */
  private determinePrimaryAgent(taskResults: any[]): string | undefined {
    if (!taskResults || taskResults.length === 0) {
      return undefined;
    }

    // Simple approach: count contributions by agent and return the one with most tasks
    const agentContributions: Record<string, number> = {};

    taskResults.forEach((task) => {
      const agentName = task.agentName;
      if (!agentName) return;

      agentContributions[agentName] = (agentContributions[agentName] || 0) + 1;
    });

    // Find the agent with the highest contribution count
    let maxContributions = 0;
    let primaryAgent: string | undefined = undefined;

    Object.entries(agentContributions).forEach(([agent, count]) => {
      if (count > maxContributions) {
        maxContributions = count;
        primaryAgent = agent;
      }
    });

    return primaryAgent;
  }

  /**
   * Generates title and summary for a new conversation segment
   */
  private async generateSegmentInfo(
    userInput: string,
    history: ConversationHistoryItem[],
  ): Promise<{ title: string; summary: string }> {
    // Default values if generation fails
    const defaultResult = {
      title: 'New Topic',
      summary: 'Conversation on a new topic',
    };

    // If we don't have any agents registered with LLM capabilities, return defaults
    const agent = this.findSuitableAgentForGeneration();
    if (!agent) {
      return defaultResult;
    }

    try {
      // Generate a title for the segment
      const titleRequest: AgentRequest = {
        input: `Based on the following user query, please generate a concise, descriptive title (5-7 words) for this new conversation topic.\n\nUser query: ${userInput}`,
        capability: 'text-generation',
      };

      const titleResponse = await agent.execute(titleRequest);

      // Generate a summary for the segment
      const summaryRequest: AgentRequest = {
        input: `Please provide a brief summary (2-3 sentences) of what this new conversation topic is about, based on the user's query.\n\nUser query: ${userInput}`,
        capability: 'text-generation',
      };

      const summaryResponse = await agent.execute(summaryRequest);

      return {
        title:
          typeof titleResponse.output === 'string'
            ? titleResponse.output.trim()
            : defaultResult.title,
        summary:
          typeof summaryResponse.output === 'string'
            ? summaryResponse.output.trim()
            : defaultResult.summary,
      };
    } catch (error) {
      logger.error('Error generating segment information', { error });
      return defaultResult;
    }
  }

  /**
   * Finds a suitable agent for generating segment information
   */
  private findSuitableAgentForGeneration(): BaseAgent | undefined {
    // Try to find an agent with 'content' in the name first
    for (const [name, agent] of this.registeredAgents.entries()) {
      if (name.toLowerCase().includes('content')) {
        return agent;
      }
    }

    // Fall back to any registered agent
    if (this.registeredAgents.size > 0) {
      return this.registeredAgents.values().next().value;
    }

    return undefined;
  }

  /**
   * Clean up resources used by this supervisor.
   * Should be called when the supervisor is no longer needed.
   */
  public cleanup(): void {
    this.logger.info('Cleaning up HistoryAwareSupervisor resources');
    
    // Call the base workflow cleanup method
    super.cleanup();
    
    // Clear registered agents
    this.registeredAgents.clear();
    
    this.logger.info('HistoryAwareSupervisor resources cleaned up');
  }
}
