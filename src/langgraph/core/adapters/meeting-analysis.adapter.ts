import { StateGraph, END } from '@langchain/langgraph';
import { v4 as uuidv4 } from 'uuid';
import { Annotation } from '@langchain/langgraph';

import { MeetingAnalysisAgent } from '../../../agents/specialized/meeting-analysis-agent';
import { AgentRequest, AgentResponse } from '../../../agents/interfaces/agent.interface';
import { AgentStatus } from '../state/base-agent-state';
import { MeetingAnalysisState, createMeetingAnalysisState, addPartialAnalysis, setAnalysisResult } from '../state/meeting-analysis-state';
import { logStateTransition, startTrace, endTrace } from '../utils/tracing';
import { splitTranscript } from '../../../shared/utils/split-transcript';

/**
 * MeetingAnalysisAdapter
 * 
 * This adapter bridges the existing MeetingAnalysisAgent with LangGraph workflows.
 * It adds specific states and transitions for handling meeting transcripts, chunking,
 * and generating analyses.
 */
export class MeetingAnalysisAdapter {
  constructor(
    protected readonly agent: MeetingAnalysisAgent,
    protected readonly options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
      maxChunkSize?: number;
      chunkOverlap?: number;
    } = {}
  ) {}

  /**
   * Create a LangGraph workflow for meeting analysis
   */
  createGraph() {
    // Define state schema using Annotation
    const MeetingStateSchema = Annotation.Root({
      // Core identifiers
      agentId: Annotation<string>(),
      runId: Annotation<string>(),
      
      // Status tracking
      status: Annotation<string>(),
      errorCount: Annotation<number>({
        default: () => 0,
        reducer: (curr, update) => (curr || 0) + (update || 0),
      }),
      
      // Meeting details
      meetingId: Annotation<string>(),
      meetingTitle: Annotation<string | undefined>(),
      participants: Annotation<any[] | undefined>(),
      transcript: Annotation<string | undefined>(),
      
      // Processing state
      chunks: Annotation<string[] | undefined>(),
      currentChunkIndex: Annotation<number | undefined>(),
      partialAnalyses: Annotation<string[]>({
        default: () => [],
        reducer: (curr, update) => [...(curr || []), ...(Array.isArray(update) ? update : [update])],
      }),
      
      // Results
      analysisResult: Annotation<any | undefined>(),
      output: Annotation<string | undefined>(),
      artifacts: Annotation<any | undefined>(),
      
      // Errors
      errors: Annotation<any[]>({
        default: () => [],
        reducer: (curr, update) => [...(curr || []), ...(Array.isArray(update) ? update : [update])],
      }),
      
      // Metrics
      metrics: Annotation<Record<string, any>>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
      
      // Metadata
      metadata: Annotation<Record<string, any>>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
    });
    
    // Create a state graph with the defined schema
    const graph = new StateGraph(MeetingStateSchema);
    
    // Add nodes for workflow steps
    graph.addNode("initialize", async (state) => {
      try {
        if (!(this.agent as any).isInitialized) {
          await this.agent.initialize();
        }
        
        return {
          status: AgentStatus.READY,
          metadata: {
            ...state.metadata,
            initTimestamp: Date.now()
          }
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return {
          status: AgentStatus.ERROR,
          errorCount: 1,
          errors: [
            {
              type: 'initialization_error',
              message: errorMessage,
              node: 'initialize',
              timestamp: new Date().toISOString(),
              details: error
            }
          ],
          metadata: {
            ...state.metadata,
            initError: errorMessage
          }
        };
      }
    });
    
    return graph;
  }

  /**
   * Execute meeting analysis without using full LangGraph functionality
   * This method implements the workflow logic directly while we resolve the LangGraph integration
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    // Create initial state from the request
    let state = this.createInitialState(request);
    
    // Start tracing
    const traceId = startTrace(`meeting_analysis_${this.agent.id}`, state, {
      agentName: this.agent.name,
      capability: request.capability
    });
    
    const startTime = Date.now();
    
    try {
      // 1. Initialize agent if needed
      if (!(this.agent as any).isInitialized) {
        await this.agent.initialize();
      }
      
      state = {
        ...state,
        status: AgentStatus.READY,
        metadata: {
          ...state.metadata,
          initTimestamp: Date.now()
        }
      };
      
      logStateTransition("initialize", state, state, { 
        includeFullState: this.options.includeStateInLogs 
      });
      
      // 2. Prepare transcript - split into chunks
      const transcript = state.transcript;
      if (!transcript) {
        throw new Error("No transcript provided in request");
      }

      // Split transcript into chunks
      const maxChunkSize = this.options.maxChunkSize || 2000;
      const chunkOverlap = this.options.chunkOverlap || 200;
      const chunks = splitTranscript(transcript, maxChunkSize, chunkOverlap);
      
      state = {
        ...state,
        chunks,
        currentChunkIndex: 0,
        partialAnalyses: [],
        metadata: {
          ...state.metadata,
          chunkCount: chunks.length,
          prepareTimestamp: Date.now()
        }
      };
      
      logStateTransition("prepare_transcript", state, state, { 
        includeFullState: this.options.includeStateInLogs 
      });
      
      // 3. Process each chunk
      while (
        state.chunks && 
        state.currentChunkIndex !== undefined && 
        state.currentChunkIndex < state.chunks.length
      ) {
        const currentIndex = state.currentChunkIndex;
        const currentChunk = state.chunks[currentIndex];
        
        // Create request for chunk analysis
        const chunkRequest: AgentRequest = {
          input: currentChunk,
          capability: "chunk-analysis",
          parameters: {
            meetingId: state.meetingId,
            chunkIndex: currentIndex,
            totalChunks: state.chunks.length
          },
          context: state.metadata.context
        };
        
        // Execute agent for this chunk
        const response = await this.agent.execute(chunkRequest);
        
        // Add partial analysis to state
        const analysisText = typeof response.output === 'string' 
          ? response.output 
          : JSON.stringify(response.output);
        
        state = addPartialAnalysis(state, analysisText, currentIndex);
        
        logStateTransition("process_chunk", state, state, { 
          includeFullState: this.options.includeStateInLogs 
        });
        
        // Move to next chunk
        state = {
          ...state,
          currentChunkIndex: currentIndex + 1,
          metadata: {
            ...state.metadata,
            checkMoreChunksTimestamp: Date.now()
          }
        };
        
        logStateTransition("check_more_chunks", state, state, { 
          includeFullState: this.options.includeStateInLogs 
        });
      }
      
      // 4. Generate final analysis
      const finalRequest: AgentRequest = {
        input: JSON.stringify({
          partialAnalyses: state.partialAnalyses,
          meetingId: state.meetingId,
          transcript: state.transcript,
          meetingTitle: state.meetingTitle,
          participants: state.participants
        }),
        capability: "final-analysis",
        parameters: state.parameters,
        context: state.metadata.context
      };
      
      // Execute agent for final analysis
      const finalResponse = await this.agent.execute(finalRequest);
      
      // Parse the analysis result
      let analysisResult: any;
      try {
        analysisResult = typeof finalResponse.output === 'string' 
          ? JSON.parse(finalResponse.output) 
          : finalResponse.output;
      } catch (error) {
        throw new Error(`Failed to parse analysis result: ${error}`);
      }
      
      // Update state with final analysis
      state = setAnalysisResult(state, analysisResult);
      
      state = {
        ...state,
        status: AgentStatus.READY,
        output: JSON.stringify(analysisResult),
        artifacts: {
          ...finalResponse.artifacts,
          analysisResult
        }
      };
      
      logStateTransition("generate_final_analysis", state, state, { 
        includeFullState: this.options.includeStateInLogs 
      });
      
      // 5. Store results if the analysis was successful
      if (state.analysisResult) {
        const storeRequest: AgentRequest = {
          input: JSON.stringify({
            result: state.analysisResult,
            meetingId: state.meetingId
          }),
          capability: "store-analysis",
          parameters: state.parameters,
          context: state.metadata.context
        };
        
        await this.agent.execute(storeRequest);
        
        state = {
          ...state,
          metadata: {
            ...state.metadata,
            storeResultsTimestamp: Date.now()
          }
        };
        
        logStateTransition("store_results", state, state, { 
          includeFullState: this.options.includeStateInLogs 
        });
      }
      
      // End tracing
      endTrace(traceId, `meeting_analysis_${this.agent.id}`, state, {
        executionTimeMs: Date.now() - startTime
      });
      
      // Return response
      return {
        output: state.output || "No output generated",
        artifacts: state.artifacts || {
          analysisResult: state.analysisResult
        },
        metrics: {
          executionTimeMs: Date.now() - startTime,
          tokensUsed: finalResponse.metrics?.tokensUsed || 0,
          stepCount: state.chunks?.length ? state.chunks.length + 2 : 1 // Chunks + final analysis and storage
        }
      };
    } catch (error) {
      console.error("Error in MeetingAnalysis execution:", error);
      
      // Format error output
      const errorOutput = {
        error: `Error in meeting analysis agent ${this.agent.name}`,
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
      
      state = {
        ...state,
        status: AgentStatus.ERROR,
        errorCount: (state.errorCount || 0) + 1,
        output: JSON.stringify(errorOutput),
        errors: [
          ...(state.errors || []),
          {
            type: 'workflow_error',
            message: error instanceof Error ? error.message : String(error),
            node: 'workflow',
            timestamp: new Date().toISOString(),
            details: error
          }
        ],
        metadata: {
          ...state.metadata,
          errorHandlingTimestamp: Date.now()
        }
      };
      
      logStateTransition("handle_error", state, state, { 
        includeFullState: this.options.includeStateInLogs 
      });
      
      // End tracing with error
      endTrace(traceId, `meeting_analysis_${this.agent.id}`, state, {
        executionTimeMs: Date.now() - startTime,
        error: true
      });
      
      // Return error response
      return {
        output: `Error in meeting analysis: ${error instanceof Error ? error.message : String(error)}`,
        artifacts: {
          error: {
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
          }
        },
        metrics: {
          executionTimeMs: Date.now() - startTime,
          tokensUsed: 0,
          stepCount: 0
        }
      };
    }
  }

  /**
   * Create an initial state for the meeting analysis
   */
  createInitialState(request: AgentRequest): MeetingAnalysisState {
    const meetingData = typeof request.input === 'string'
      ? { transcript: request.input }
      : request.input as Record<string, any>;
    
    return createMeetingAnalysisState({
      agentId: this.agent.id,
      meetingId: meetingData.meetingId || uuidv4(),
      meetingTitle: meetingData.title || meetingData.meetingTitle,
      transcript: meetingData.transcript,
      transcriptSegments: meetingData.transcriptSegments,
      participants: meetingData.participants,
      meetingStartTime: meetingData.startTime || meetingData.meetingStartTime,
      meetingEndTime: meetingData.endTime || meetingData.meetingEndTime,
      previousMeetingIds: meetingData.previousMeetingIds,
      input: typeof request.input === 'string' 
        ? request.input 
        : JSON.stringify(request.input),
      capability: request.capability,
      parameters: request.parameters,
      metadata: {
        context: request.context,
        requestTimestamp: Date.now()
      }
    });
  }
} 