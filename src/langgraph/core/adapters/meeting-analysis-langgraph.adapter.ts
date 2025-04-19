import { v4 as uuidv4 } from 'uuid';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { MeetingAnalysisAgent } from '../../../agents/specialized/meeting-analysis-agent';
import { AgentRequest, AgentResponse } from '../../../agents/interfaces/agent.interface';
import { BaseAgentAdapter } from './base-agent.adapter';
import { splitTranscript } from '../../../shared/utils/split-transcript';
import { RagRetrievalStrategy } from '../../../shared/services/rag-prompt-manager.service';
import { ContextType } from '../../../shared/user-context/types/context.types';
import { 
  logStateTransition, 
  startTrace, 
  endTrace 
} from '../utils/tracing';

/**
 * Define the state schema using Annotation pattern for meeting analysis workflow
 */
export const MeetingAnalysisAnnotation = Annotation.Root({
  // Meeting information
  meetingId: Annotation<string>,
  transcript: Annotation<string>,
  meetingTitle: Annotation<string | undefined>,
  participantIds: Annotation<string[]>,
  userId: Annotation<string>,
  
  // Processing state
  chunks: Annotation<string[]>,
  currentChunkIndex: Annotation<number>,
  partialAnalyses: Annotation<string[]>,
  
  // Results
  analysisResult: Annotation<any>,
  
  // Status tracking
  status: Annotation<string>,
  error: Annotation<string | undefined>,
  
  // Metrics
  startTime: Annotation<number>,
  endTime: Annotation<number | undefined>,
  tokensUsed: Annotation<number | undefined>,
  executionTimeMs: Annotation<number | undefined>,
});

// Define node names as constants to avoid string literals
const NODE_NAMES = {
  START: "__start__",
  END: "__end__",
  INITIALIZE: "initialize",
  PROCESS_CHUNK: "process_chunk",
  CHECK_CHUNKS: "check_chunks",
  GENERATE_FINAL_ANALYSIS: "generate_final_analysis",
  STORE_RESULTS: "store_results",
  HANDLE_ERROR: "handle_error"
} as const;

// Define the state interface manually to avoid complex type issues
interface MeetingAnalysisState {
  meetingId: string;
  transcript: string;
  meetingTitle: string | undefined;
  participantIds: string[];
  userId: string;
  chunks: string[];
  currentChunkIndex: number;
  partialAnalyses: string[];
  analysisResult: any;
  status: string;
  error?: string;
  startTime: number;
  endTime?: number;
  tokensUsed?: number;
  executionTimeMs?: number;
}

/**
 * Parameters for processMeetingTranscript method
 */
export interface ProcessMeetingTranscriptParams {
  meetingId: string;
  transcript: string;
  title?: string;
  participantIds?: string[];
  userId?: string;
  includeTopics?: boolean;
  includeActionItems?: boolean;
  includeSentiment?: boolean;
}

/**
 * Results from processMeetingTranscript
 */
export interface ProcessMeetingTranscriptResult {
  meetingId: string;
  output: any;
  status: string;
  success: boolean;
}

/**
 * MeetingAnalysisLangGraphAdapter
 * 
 * This adapter uses LangGraph's Annotation pattern to implement a structured workflow
 * for meeting transcript analysis.
 */
export class MeetingAnalysisLangGraphAdapter extends BaseAgentAdapter<MeetingAnalysisAgent> {
  protected maxChunkSize: number;
  protected chunkOverlap: number;

  constructor(
    protected readonly agent: MeetingAnalysisAgent,
    protected readonly options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
      maxChunkSize?: number;
      chunkOverlap?: number;
    } = {}
  ) {
    super(agent, options);
    this.maxChunkSize = options.maxChunkSize || 2000;
    this.chunkOverlap = options.chunkOverlap || 200;
  }

  /**
   * Process a meeting transcript through the LangGraph workflow
   */
  async processMeetingTranscript(params: ProcessMeetingTranscriptParams): Promise<ProcessMeetingTranscriptResult> {
    try {
      // 1. Initialize the agent if needed
      if (!this.agent.getInitializationStatus()) {
        await this.agent.initialize();
      }

      // 2. Prepare the transcript by splitting into chunks
      const chunks = splitTranscript(params.transcript, this.maxChunkSize, this.chunkOverlap);
      
      // 3. Prepare the initial state for the graph
      const initialState = {
        meetingId: params.meetingId,
        transcript: params.transcript,
        meetingTitle: params.title || 'Untitled Meeting',
        participantIds: params.participantIds || [],
        userId: params.userId || 'anonymous',
        chunks,
        currentChunkIndex: 0,
        partialAnalyses: [],
        analysisResult: undefined,
        status: 'ready',
        error: undefined,
        startTime: Date.now(),
        endTime: undefined,
        tokensUsed: 0,
        executionTimeMs: 0,
      };

      // 4. Create the graph
      const graph = this.createMeetingAnalysisGraph();
      
      // 5. Start tracing
      const traceId = startTrace('meeting-analysis', initialState, {
        agentId: this.agent.id,
        meetingId: params.meetingId
      });
      
      // 6. Execute the graph
      const result = await graph.invoke(initialState);
      
      // 7. End tracing
      endTrace(traceId, 'meeting-analysis', result, {
        agentId: this.agent.id,
        meetingId: params.meetingId,
        executionTimeMs: Date.now() - initialState.startTime
      });

      // 8. Return results
      return {
        meetingId: params.meetingId,
        output: result.analysisResult,
        status: result.error ? 'error' : 'completed',
        success: !result.error
      };
    } catch (error) {
      console.error("Error in processMeetingTranscript", error);
      
      return {
        meetingId: params.meetingId,
        output: {
          error: `Error in meeting analysis: ${error instanceof Error ? error.message : String(error)}`,
          details: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        },
        status: 'error',
        success: false
      };
    }
  }

  /**
   * Create the LangGraph workflow for meeting analysis
   */
  private createMeetingAnalysisGraph() {
    // Define the state schema using Annotation.Root
    const MeetingAnalysisState = Annotation.Root({
      meetingId: Annotation<string>(),
      transcript: Annotation<string>(),
      meetingTitle: Annotation<string>(),
      participantIds: Annotation<string[]>(),
      userId: Annotation<string>(),
      chunks: Annotation<string[]>(),
      currentChunkIndex: Annotation<number>(),
      partialAnalyses: Annotation<string[]>({
        reducer: (current, update) => [...current, ...update],
        default: () => []
      }),
      analysisResult: Annotation<any>(),
      status: Annotation<string>(),
      error: Annotation<string | undefined>(),
      startTime: Annotation<number>(),
      endTime: Annotation<number | undefined>(),
      tokensUsed: Annotation<number>({
        reducer: (current, update) => current + update,
        default: () => 0
      }),
      executionTimeMs: Annotation<number>({
        reducer: (current, update) => current + update,
        default: () => 0
      })
    });
    
    // Create a type alias for the state type
    type MeetingAnalysisStateType = typeof MeetingAnalysisState.State;

    // Define node types
    type NodeNames = 
      | "__start__"
      | "__end__"
      | "initialize" 
      | "process_chunk" 
      | "check_chunks" 
      | "generate_final_analysis" 
      | "store_results" 
      | "handle_error";

    // Create the state graph with the annotation schema
    const graph = new StateGraph(MeetingAnalysisState);
    
    // Cast to any to fix TypeScript errors - this is the approach used in the examples
    const typedGraph = graph as any;
    
    // 1. Initialize and prepare for processing
    typedGraph.addNode("initialize", {
      invoke: async (state: MeetingAnalysisStateType) => {
        logStateTransition("initialize", state, { status: 'initializing' });
        
        return {
          status: "ready",
          startTime: Date.now()
        };
      }
    });
    
    // 2. Process current chunk
    typedGraph.addNode("process_chunk", {
      invoke: async (state: MeetingAnalysisStateType) => {
        const currentChunkIndex = state.currentChunkIndex;
        const chunk = state.chunks[currentChunkIndex];
        
        logStateTransition("process_chunk", state, { 
          status: 'processing',
          currentChunkIndex 
        });
        
        try {
          // Create request for chunk analysis
          const chunkRequest: AgentRequest = {
            input: chunk,
            capability: "chunk-analysis",
            parameters: {
              meetingId: state.meetingId,
              chunkIndex: currentChunkIndex,
              totalChunks: state.chunks.length,
              ragStrategy: RagRetrievalStrategy.HYBRID
            },
            context: {
              userId: state.userId
            }
          };
          
          // Execute agent for this chunk
          const response = await this.agent.execute(chunkRequest);
          
          // Get analysis text
          const analysisText = typeof response.output === 'string' 
            ? response.output 
            : JSON.stringify(response.output);
          
          // Update partial analyses and metrics
          return {
            partialAnalyses: [analysisText],
            tokensUsed: response.metrics?.tokensUsed || 0,
            executionTimeMs: response.metrics?.executionTimeMs || 0,
            status: 'chunk_processed'
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error processing chunk ${currentChunkIndex}:`, errorMessage);
          
          return {
            error: `Error processing chunk ${currentChunkIndex}: ${errorMessage}`,
            status: 'error'
          };
        }
      }
    });
    
    // 3. Check if more chunks to process
    typedGraph.addNode("check_chunks", {
      invoke: async (state: MeetingAnalysisStateType) => {
        const currentChunkIndex = state.currentChunkIndex;
        const totalChunks = state.chunks.length;
        
        // If we have more chunks to process, increment the index
        if (currentChunkIndex < totalChunks - 1) {
          return {
            currentChunkIndex: currentChunkIndex + 1,
            status: 'processing_chunks'
          };
        }
        
        // Otherwise, mark as ready for final analysis
        return {
          status: 'chunks_completed'
        };
      }
    });
    
    // 4. Generate final analysis
    typedGraph.addNode("generate_final_analysis", {
      invoke: async (state: MeetingAnalysisStateType) => {
        logStateTransition("generate_final_analysis", state, { status: 'finalizing' });
        
        try {
          // Create request for final analysis
          const finalRequest: AgentRequest = {
            input: JSON.stringify({
              partialAnalyses: state.partialAnalyses,
              meetingId: state.meetingId,
              transcript: state.transcript,
              meetingTitle: state.meetingTitle,
              participants: state.participantIds
            }),
            capability: "final-analysis",
            parameters: {
              meetingId: state.meetingId,
              meetingTitle: state.meetingTitle,
              isFinalAnalysis: true,
              ragStrategy: RagRetrievalStrategy.HYBRID,
              contentTypes: [
                ContextType.MEETING,
                ContextType.DECISION,
                ContextType.ACTION_ITEM,
              ]
            },
            context: {
              userId: state.userId
            }
          };
          
          // Execute agent for final analysis
          const finalResponse = await this.agent.execute(finalRequest);
          
          // Parse the analysis result
          let analysisResult;
          try {
            analysisResult = typeof finalResponse.output === 'string' 
              ? JSON.parse(finalResponse.output) 
              : finalResponse.output;
          } catch (error) {
            throw new Error(`Failed to parse analysis result: ${error}`);
          }
          
          // Update state with final analysis result and metrics
          return {
            analysisResult,
            tokensUsed: finalResponse.metrics?.tokensUsed || 0,
            executionTimeMs: finalResponse.metrics?.executionTimeMs || 0,
            status: 'analysis_completed'
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('Error generating final analysis:', errorMessage);
          
          return {
            error: `Error generating final analysis: ${errorMessage}`,
            status: 'error'
          };
        }
      }
    });
    
    // 5. Store results
    typedGraph.addNode("store_results", {
      invoke: async (state: MeetingAnalysisStateType) => {
        logStateTransition("store_results", state, { status: 'storing' });
        
        try {
          // Create request to store results
          const storeRequest: AgentRequest = {
            input: JSON.stringify({
              result: state.analysisResult,
              meetingId: state.meetingId
            }),
            capability: "store-analysis",
            context: {
              userId: state.userId
            }
          };
          
          // Execute agent to store results
          await this.agent.execute(storeRequest);
          
          // Update state with completion information
          return {
            status: 'completed',
            endTime: Date.now()
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('Error storing results:', errorMessage);
          
          return {
            error: `Error storing results: ${errorMessage}`,
            status: 'error'
          };
        }
      }
    });
    
    // 6. Error handler
    typedGraph.addNode("handle_error", {
      invoke: async (state: MeetingAnalysisStateType) => {
        logStateTransition("handle_error", state, { 
          status: 'error',
          error: state.error
        });
        
        return {
          status: 'error_handled',
          endTime: Date.now()
        };
      }
    });
    
    // Add edges to connect the nodes
    typedGraph.addEdge(START, "initialize");
    typedGraph.addEdge("initialize", "process_chunk");
    
    // Add conditional edges for state-based routing
    typedGraph.addConditionalEdges("process_chunk", (state: MeetingAnalysisStateType) => {
      return state.status === 'error' ? "handle_error" : "check_chunks";
    });
    
    typedGraph.addConditionalEdges("check_chunks", (state: MeetingAnalysisStateType) => {
      return state.status === 'processing_chunks' ? "process_chunk" : "generate_final_analysis";
    });
    
    typedGraph.addConditionalEdges("generate_final_analysis", (state: MeetingAnalysisStateType) => {
      return state.status === 'error' ? "handle_error" : "store_results";
    });
    
    typedGraph.addConditionalEdges("store_results", (state: MeetingAnalysisStateType) => {
      return state.status === 'error' ? "handle_error" : END;
    });
    
    typedGraph.addEdge("handle_error", END);
    
    // Compile and return the graph
    return typedGraph.compile();
  }
} 