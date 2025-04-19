/**
 * Conversation adapter for implementing conversational workflows with LangGraph
 */
import { v4 as uuidv4 } from 'uuid';
import { StateGraph, START, END } from '@langchain/langgraph';
import { BaseAgent } from '../../../agents/base/base-agent';
import { AgentRequest, AgentResponse } from '../../../agents/interfaces/agent.interface';
import { BaseAgentAdapter } from './base-agent.adapter';
import { 
  AgentStatus,
  AgentMessage
} from '../state/base-agent-state';
import { 
  logStateTransition, 
  startTrace, 
  endTrace 
} from '../utils/tracing';

/**
 * Conversation state definition
 */
export interface ConversationState {
  // Core identifiers
  conversationId: string;
  userId: string;
  
  // Messages
  messages: AgentMessage[];
  currentMessageIndex: number;
  
  // Processing state
  status: string;
  thinking: boolean;
  
  // Content and context
  userInput?: string;
  agentResponse?: string;
  context?: Record<string, any>;
  
  // Metrics
  startTime: number;
  endTime?: number;
  tokensUsed?: number;
  executionTimeMs?: number;
  totalExecutionTimeMs?: number;
  
  // Miscellaneous
  metadata: Record<string, any>;
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
 * Node function type for conversation graph
 */
export type ConversationNodeFunction = (
  state: ConversationState,
) => Partial<ConversationState>;

/**
 * ConversationAdapter
 * 
 * This adapter specializes in conversational workflows using LangGraph
 */
export class ConversationAdapter<T extends BaseAgent = BaseAgent> extends BaseAgentAdapter<T> {
  constructor(
    protected readonly agent: T,
    protected readonly options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
    } = {}
  ) {
    super(agent, options);
  }

  /**
   * Send a message in a conversation and get a response
   */
  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const startTime = Date.now();
    const conversationId = params.conversationId || uuidv4();
    const userId = params.userId || 'anonymous';
    
    try {
      // 1. Initialize the agent if needed
      if (!this.agent.getInitializationStatus()) {
        await this.agent.initialize();
      }

      // 2. Create or update conversation state
      const initialState: ConversationState = {
        conversationId,
        userId,
        messages: [
          {
            role: 'user',
            content: params.message,
            timestamp: new Date().toISOString()
          }
        ],
        currentMessageIndex: 0,
        status: 'ready',
        thinking: false,
        userInput: params.message,
        context: params.context || {},
        startTime,
        metadata: {
          agentId: this.agent.id,
          capability: params.capability
        }
      };

      // 3. Create and run the graph
      const graph = this.createConversationGraph();
      const traceId = startTrace('conversation', initialState, {
        agentId: this.agent.id,
        conversationId
      });
      
      // 4. Execute the graph
      const result = await graph.invoke(initialState);
      
      // 5. End the trace
      endTrace(traceId, 'conversation', result, {
        agentId: this.agent.id,
        conversationId,
        executionTimeMs: Date.now() - startTime
      });

      // 6. Process and return results
      return {
        conversationId,
        userId,
        message: params.message,
        response: result.agentResponse || 'No response generated',
        status: result.status,
        success: result.status !== 'error',
        metrics: {
          executionTimeMs: Date.now() - startTime,
          tokensUsed: result.tokensUsed,
          totalMessages: result.messages?.length || 1
        }
      };
    } catch (error) {
      console.error(`Error in conversation for ${conversationId}:`, error);
      
      return {
        conversationId,
        userId,
        message: params.message,
        response: `Error in conversation: ${error instanceof Error ? error.message : String(error)}`,
        status: 'error',
        success: false,
        metrics: {
          executionTimeMs: Date.now() - startTime,
          totalMessages: 1
        }
      };
    }
  }

  /**
   * Create a LangGraph workflow for conversation
   */
  private createConversationGraph() {
    // Define node functions
    const processMessage: ConversationNodeFunction = (state) => {
      logStateTransition('process_message', state, {
        ...state,
        status: 'processing',
        thinking: true
      });
      
      return {
        status: 'processing',
        thinking: true,
        processStartTime: Date.now()
      };
    };
    
    const generateResponse: ConversationNodeFunction = (state) => {
      try {
        // Create the agent request
        const request: AgentRequest = {
          input: state.userInput || '',
          capability: state.metadata.capability,
          context: {
            userId: state.userId,
            conversationId: state.conversationId,
            ...(state.context || {})
          }
        };
        
        // This is async, but we need to wrap it to handle async properly
        return this.agent.execute(request).then(response => {
          // Create the agent message
          const message: AgentMessage = {
            role: 'assistant',
            content: typeof response.output === 'string' ? response.output : JSON.stringify(response.output),
            timestamp: new Date().toISOString(),
            metadata: {
              tokensUsed: response.metrics?.tokensUsed,
              executionTimeMs: response.metrics?.executionTimeMs
            }
          };
          
          // Add the message to the state
          const updatedMessages = [...state.messages, message];
          
          return {
            messages: updatedMessages,
            agentResponse: message.content,
            tokensUsed: response.metrics?.tokensUsed,
            executionTimeMs: response.metrics?.executionTimeMs,
            status: 'completed',
            thinking: false,
            endTime: Date.now()
          };
        }).catch(error => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('Error generating response:', errorMessage);
          
          // Create error message
          const errorMsg: AgentMessage = {
            role: 'system',
            content: `Error generating response: ${errorMessage}`,
            timestamp: new Date().toISOString(),
            metadata: {
              error: errorMessage
            }
          };
          
          return {
            messages: [...state.messages, errorMsg],
            agentResponse: errorMsg.content,
            status: 'error',
            thinking: false,
            endTime: Date.now()
          };
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error in generate response:', errorMessage);
        
        // Create error message
        const errorMsg: AgentMessage = {
          role: 'system',
          content: `Error generating response: ${errorMessage}`,
          timestamp: new Date().toISOString(),
          metadata: {
            error: errorMessage
          }
        };
        
        return {
          messages: [...state.messages, errorMsg],
          agentResponse: errorMsg.content,
          status: 'error',
          thinking: false,
          endTime: Date.now()
        };
      }
    };
    
    const finalizeConversation: ConversationNodeFunction = (state) => {
      // Calculate metrics and prepare final state
      const totalTimeMs = Date.now() - state.startTime;
      
      return {
        status: 'finished',
        totalExecutionTimeMs: totalTimeMs,
        metadata: {
          ...state.metadata,
          totalTimeMs,
          finalResponseTimestamp: new Date().toISOString()
        }
      };
    };
    
    // Wrap node functions to make them compatible with LangGraph's expected type
    const wrapNodeFunction = (fn: ConversationNodeFunction) => {
      return {
        invoke: async (state: ConversationState) => {
          return fn(state);
        },
      };
    };
    
    // Create state channels for the graph
    const channels = {
      conversationId: {
        value: (current: string, update?: string) => update ?? current,
        default: () => uuidv4(),
      },
      userId: {
        value: (current: string, update?: string) => update ?? current,
        default: () => 'anonymous',
      },
      messages: {
        value: (current: AgentMessage[], update?: AgentMessage[]) => {
          if (update) {
            return update;
          }
          return current;
        },
        default: () => [],
      },
      currentMessageIndex: {
        value: (current: number, update?: number) => update ?? current,
        default: () => 0,
      },
      status: {
        value: (current: string, update?: string) => update ?? current,
        default: () => 'initializing',
      },
      thinking: {
        value: (current: boolean, update?: boolean) => update ?? current,
        default: () => false,
      },
      userInput: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      agentResponse: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      context: {
        value: (current: Record<string, any> | undefined, update?: Record<string, any>) => {
          if (update) {
            return { ...current, ...update };
          }
          return current;
        },
        default: () => ({}),
      },
      startTime: {
        value: (current: number, update?: number) => update ?? current,
        default: () => Date.now(),
      },
      endTime: {
        value: (current: number | undefined, update?: number) => update ?? current,
        default: () => undefined,
      },
      tokensUsed: {
        value: (current: number | undefined, update?: number) => update ?? current,
        default: () => undefined,
      },
      executionTimeMs: {
        value: (current: number | undefined, update?: number) => update ?? current,
        default: () => undefined,
      },
      totalExecutionTimeMs: {
        value: (current: number | undefined, update?: number) => update ?? current,
        default: () => undefined,
      },
      metadata: {
        value: (current: Record<string, any>, update?: Record<string, any>) => {
          if (update) {
            return { ...current, ...update };
          }
          return current;
        },
        default: () => ({}),
      },
    };
    
    // Create the state graph with the defined channels
    const workflow = new StateGraph<ConversationState>({
      channels: channels as any,
    });
    
    // Add nodes to the graph (wrapped for compatibility)
    workflow.addNode("process_message", wrapNodeFunction(processMessage));
    workflow.addNode("generate_response", wrapNodeFunction(generateResponse));
    workflow.addNode("finalize", wrapNodeFunction(finalizeConversation));
    
    // Add edges
    workflow.addEdge(START, "process_message");
    workflow.addEdge("process_message", "generate_response");
    workflow.addEdge("generate_response", "finalize");
    workflow.addEdge("finalize", END);
    
    // Compile and return
    return workflow.compile();
  }
} 