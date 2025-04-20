/**
 * Conversation adapter for implementing conversational workflows with LangGraph
 */
import { v4 as uuidv4 } from 'uuid';
import {
  StateGraph,
  START,
  END,
  Annotation,
  AnnotationRoot,
} from '@langchain/langgraph';
import { BaseAgent } from '../../../agents/base/base-agent';
import {
  AgentRequest,
  AgentResponse,
} from '../../../agents/interfaces/base-agent.interface';
import {
  BaseLangGraphAdapter,
  BaseLangGraphState,
  WorkflowStatus,
} from './base-langgraph.adapter';
import { AgentStatus, AgentMessage } from '../state/base-agent-state';
import { logStateTransition, startTrace, endTrace } from '../utils/tracing';
import { AgentWorkflow } from '../workflows/agent-workflow';

/**
 * Conversation state definition
 */
export interface ConversationState extends BaseLangGraphState {
  // Core identifiers
  conversationId: string;
  userId: string;

  // Messages
  messages: AgentMessage[];
  currentMessageIndex: number;

  // Processing state
  thinking: boolean;

  // Content and context
  userInput?: string;
  agentResponse?: string;
  context?: Record<string, any>;

  // Additional metrics
  totalExecutionTimeMs?: number;
}

/**
 * Parameters for sendMessage method
 */
export interface SendMessageParams {
  conversationId?: string;
  userId?: string;
  message: string;
  capability?: string;
  context?: Record<string, any>;
}

/**
 * Results from sendMessage
 */
export interface SendMessageResult {
  conversationId: string;
  userId: string;
  message: string;
  response: string;
  status: string;
  success: boolean;
  metrics?: {
    executionTimeMs: number;
    tokensUsed?: number;
    totalMessages: number;
  };
}

/**
 * Node function type for conversation graph - kept for internal usage
 */
type ConversationNodeFunction = (
  state: ConversationState,
) => Partial<ConversationState> | Promise<Partial<ConversationState>>;

/**
 * ConversationAdapter
 *
 * This adapter specializes in conversational workflows using LangGraph
 */
export class ConversationAdapter extends BaseLangGraphAdapter<
  ConversationState,
  SendMessageParams,
  SendMessageResult
> {
  protected readonly agent: BaseAgent;
  protected readonly agentWorkflow: AgentWorkflow;

  constructor(
    agent: BaseAgent,
    options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
      logger?: any;
    } = {},
  ) {
    super({
      tracingEnabled: options.tracingEnabled,
      logger: options.logger,
    });

    this.agent = agent;
    // Create a workflow for the agent
    this.agentWorkflow = new AgentWorkflow(this.agent, {
      tracingEnabled: options.tracingEnabled,
    });
  }

  /**
   * Send a message in a conversation and get a response
   */
  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    return this.execute(params);
  }

  /**
   * Create the state schema for conversation
   */
  protected createStateSchema(): AnnotationRoot<any> {
    return Annotation.Root({
      // Base state fields
      id: Annotation<string>(),
      runId: Annotation<string>(),
      status: Annotation<string>(),
      startTime: Annotation<number>(),
      endTime: Annotation<number | undefined>(),
      errorCount: Annotation<number>(),
      errors: Annotation<any[]>({
        default: () => [],
        reducer: (curr, update) => [
          ...(curr || []),
          ...(Array.isArray(update) ? update : [update]),
        ],
      }),
      metrics: Annotation<any>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
      metadata: Annotation<Record<string, any>>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),

      // Conversation-specific fields
      conversationId: Annotation<string>(),
      userId: Annotation<string>(),
      messages: Annotation<AgentMessage[]>({
        default: () => [],
        reducer: (curr, update) => [
          ...(curr || []),
          ...(Array.isArray(update) ? update : [update]),
        ],
      }),
      currentMessageIndex: Annotation<number>({
        default: () => 0,
        value: (curr, update) => update ?? curr,
      }),
      thinking: Annotation<boolean>({
        default: () => false,
        value: (curr, update) => update ?? curr,
      }),
      userInput: Annotation<string | undefined>(),
      agentResponse: Annotation<string | undefined>(),
      context: Annotation<Record<string, any>>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
      totalExecutionTimeMs: Annotation<number | undefined>(),
    });
  }

  /**
   * Create the state graph for conversation workflow
   */
  protected createStateGraph(
    schema: ReturnType<typeof this.createStateSchema>,
  ): StateGraph<any> {
    const graph = new StateGraph(schema);

    // Add the nodes
    graph
      // Common nodes from base adapter
      .addNode('initialize', this.createInitializationNode())
      .addNode('error_handler', this.createErrorHandlerNode())
      .addNode('complete', this.createCompletionNode())

      // Conversation-specific nodes
      .addNode('process_message', this.createProcessMessageNode())
      .addNode('generate_response', this.createGenerateResponseNode())
      .addNode('finalize', this.createFinalizeNode());

    // Conditional routing function
    const routeAfterProcessMessage = (state: any) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'generate_response';
    };

    const routeAfterGenerateResponse = (state: any) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'finalize';
    };

    // Define the edges
    const typedGraph = graph as any;

    typedGraph
      .addEdge(START, 'initialize')
      .addEdge('initialize', 'process_message')
      .addConditionalEdges('process_message', routeAfterProcessMessage)
      .addConditionalEdges('generate_response', routeAfterGenerateResponse)
      .addEdge('finalize', 'complete')
      .addEdge('error_handler', END)
      .addEdge('complete', END);

    return graph;
  }

  /**
   * Create the initial state for conversation
   */
  protected createInitialState(input: SendMessageParams): ConversationState {
    // Get the base state
    const baseState = super.createInitialState(input);

    const conversationId = input.conversationId || uuidv4();
    const userId = input.userId || 'anonymous';

    return {
      ...baseState,
      conversationId,
      userId,
      messages: [
        {
          role: 'user',
          content: input.message,
          timestamp: new Date().toISOString(),
        },
      ],
      currentMessageIndex: 0,
      thinking: false,
      userInput: input.message,
      context: input.context || {},
      metadata: {
        ...baseState.metadata,
        agentId: this.agent.id,
        capability: input.capability,
      },
    };
  }

  /**
   * Process the final state to produce the output
   */
  protected processResult(state: ConversationState): SendMessageResult {
    // Calculate metrics
    const executionTimeMs =
      state.totalExecutionTimeMs ||
      (state.endTime || Date.now()) - (state.startTime || Date.now());

    // If error occurred, generate an error response
    if ((state.status as string) === WorkflowStatus.ERROR) {
      const errorMessage =
        state.errors && state.errors.length > 0
          ? state.errors[state.errors.length - 1].message
          : 'Unknown error occurred during conversation';

      return {
        conversationId: state.conversationId,
        userId: state.userId,
        message: state.userInput || '',
        response: errorMessage,
        status: 'error',
        success: false,
        metrics: {
          executionTimeMs,
          tokensUsed: state.metrics?.tokensUsed,
          totalMessages: state.messages?.length || 1,
        },
      };
    }

    // Return the successful conversation result
    return {
      conversationId: state.conversationId,
      userId: state.userId,
      message: state.userInput || '',
      response: state.agentResponse || 'No response generated',
      status: String(state.status),
      success: (state.status as string) !== WorkflowStatus.ERROR,
      metrics: {
        executionTimeMs,
        tokensUsed: state.metrics?.tokensUsed,
        totalMessages: state.messages?.length || 1,
      },
    };
  }

  /**
   * Create the initialization node
   */
  private createInitializationNode() {
    return async (state: ConversationState) => {
      this.logger.info(
        `Initializing conversation ${state.conversationId} for user ${state.userId}`,
      );

      // Initialize the agent if needed
      if (!this.agent.getInitializationStatus()) {
        try {
          await this.agent.initialize();
        } catch (error) {
          return this.addErrorToState(
            state,
            error instanceof Error ? error : new Error(String(error)),
            'initialize',
          );
        }
      }

      return {
        ...state,
        status: WorkflowStatus.READY,
      };
    };
  }

  /**
   * Create the process message node
   */
  private createProcessMessageNode() {
    return async (state: ConversationState) => {
      try {
        this.logger.debug(
          `Processing message for conversation ${state.conversationId}`,
        );

        logStateTransition('process_message', state, {
          ...state,
          status: WorkflowStatus.EXECUTING,
          thinking: true,
        });

        return {
          status: WorkflowStatus.EXECUTING,
          thinking: true,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'process_message',
        );
      }
    };
  }

  /**
   * Create the node that generates responses
   */
  private createGenerateResponseNode() {
    return async (state: ConversationState) => {
      try {
        // Create the agent request
        const request: AgentRequest = {
          input: state.userInput || '',
          capability: state.metadata?.capability as string,
          context: {
            userId: state.userId,
            conversationId: state.conversationId,
            ...(state.context || {}),
          },
        };

        try {
          // Execute the agent request using the workflow instead of direct execution
          const response = await this.agentWorkflow.execute(request);

          // Create the agent message
          const message: AgentMessage = {
            role: 'assistant',
            content:
              typeof response.output === 'string'
                ? response.output
                : JSON.stringify(response.output),
            timestamp: new Date().toISOString(),
            metadata: {
              tokensUsed: response.metrics?.tokensUsed,
              executionTimeMs: response.metrics?.executionTimeMs,
            },
          };

          // Add the message to the state
          const updatedMessages = [...state.messages, message];

          return {
            messages: updatedMessages,
            agentResponse: message.content,
            metrics: {
              ...state.metrics,
              tokensUsed: response.metrics?.tokensUsed,
              executionTimeMs: response.metrics?.executionTimeMs,
            },
            status: WorkflowStatus.READY,
            thinking: false,
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          // this.logger.error('Error generating response:', errorMessage);

          // Create error message
          const errorMsg: AgentMessage = {
            role: 'system',
            content: `Error generating response: ${errorMessage}`,
            timestamp: new Date().toISOString(),
            metadata: {
              errorMessage: errorMessage,
            },
          };

          const errorObj =
            error instanceof Error
              ? error
              : new Error(`Error in generate response: ${String(error)}`);

          return this.addErrorToState(
            {
              ...state,
              messages: [...state.messages, errorMsg],
              agentResponse: errorMsg.content,
              thinking: false,
            },
            errorObj,
            'generate_response',
          );
        }
      } catch (error) {
        const errorObj =
          error instanceof Error
            ? error
            : new Error(`Error in generate response: ${String(error)}`);

        return this.addErrorToState(state, errorObj, 'generate_response');
      }
    };
  }

  /**
   * Create the finalize node
   */
  private createFinalizeNode() {
    return async (state: ConversationState) => {
      try {
        // Calculate metrics and prepare final state
        const totalTimeMs =
          state.startTime !== undefined ? Date.now() - state.startTime : 0;

        return {
          status: WorkflowStatus.COMPLETED,
          totalExecutionTimeMs: totalTimeMs,
          endTime: Date.now(),
          metadata: {
            ...state.metadata,
            totalTimeMs,
            finalResponseTimestamp: new Date().toISOString(),
          },
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : new Error(String(error)),
          'finalize',
        );
      }
    };
  }
}
