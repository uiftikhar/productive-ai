import { v4 as uuidv4 } from 'uuid';

import { MeetingAnalysisAgent } from '../../../agents/specialized/meeting-analysis-agent';
import { AgentRequest, AgentResponse } from '../../../agents/interfaces/agent.interface';
import { BaseAgentAdapter } from './base-agent.adapter';
import { RagRetrievalStrategy } from '../../../shared/services/rag-prompt-manager.service';
import { ContextType } from '../../../shared/user-context/types/context.types';
import { splitTranscript } from '../../../shared/utils/split-transcript';
import { MeetingAnalysisLangGraphAdapter } from './meeting-analysis-langgraph.adapter';
import { startTrace, endTrace } from '../utils/tracing';

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
  graph?: any;  // Graph for visualization
  traceId?: string; // For LangSmith tracing
}

/**
 * MeetingAnalysisAdapter
 * 
 * This adapter extends the BaseAgentAdapter and specializes it for meeting analysis.
 * It adds specialized processes for handling meeting transcripts, chunking,
 * and generating analyses.
 */
export class MeetingAnalysisAdapter extends BaseAgentAdapter<MeetingAnalysisAgent> {
  protected maxChunkSize: number;
  protected chunkOverlap: number;
  private langGraphAdapter: MeetingAnalysisLangGraphAdapter;

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
    
    // Create the LangGraph adapter for visualization
    this.langGraphAdapter = new MeetingAnalysisLangGraphAdapter(agent, {
      ...options,
      maxChunkSize: this.maxChunkSize,
      chunkOverlap: this.chunkOverlap
    });
  }

  /**
   * Process a meeting transcript through chunking and analysis
   */
  async processMeetingTranscript(params: ProcessMeetingTranscriptParams): Promise<ProcessMeetingTranscriptResult> {
    // Generate a trace ID for visualization
    const traceId = uuidv4();
    
    // Start tracing
    startTrace(`meeting-analysis-${traceId}`, {
      meetingId: params.meetingId,
      title: params.title,
      chunkSize: this.maxChunkSize,
      chunkOverlap: this.chunkOverlap
    }, {
      agentId: this.agent.id,
      agentName: this.agent.name
    });

    try {
      // 1. Create a graph using the LangGraph adapter
      const graph = (this.langGraphAdapter as any).createMeetingAnalysisGraph();
      
      // 2. Process via the traditional implementation
      const result = await this.processTranscriptTraditional(params);

      // 3. End tracing
      endTrace(`meeting-analysis-${traceId}`, `meeting-analysis-${traceId}`, result, {
        agentId: this.agent.id,
        meetingId: params.meetingId,
        status: result.status
      });

      // 4. Return the result with the graph for visualization
      return {
        ...result,
        graph,
        traceId
      };
    } catch (error) {
      // Log and end trace on error
      console.error("Error in processMeetingTranscript", error);
      
      endTrace(`meeting-analysis-${traceId}`, `meeting-analysis-${traceId}`, {
        error: error instanceof Error ? error.message : String(error)
      }, {
        agentId: this.agent.id,
        meetingId: params.meetingId,
        status: 'error'
      });
      
      return {
        meetingId: params.meetingId,
        output: {
          error: `Error in meeting analysis: ${error instanceof Error ? error.message : String(error)}`,
          details: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        },
        status: 'error',
        success: false,
        traceId
      };
    }
  }

  /**
   * Process a transcript using the traditional approach (not using LangGraph execution)
   * This is a helper method to extract the original implementation
   */
  private async processTranscriptTraditional(params: ProcessMeetingTranscriptParams): Promise<ProcessMeetingTranscriptResult> {
    try {
      // 1. Initialize the agent if needed
      if (!this.agent.getInitializationStatus()) {
        await this.agent.initialize();
      }

      // 2. Prepare the transcript (split into chunks)
      const chunks = splitTranscript(params.transcript, this.maxChunkSize, this.chunkOverlap);
      
      // 3. Process each chunk to get partial analyses
      const partialAnalyses: string[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Process chunk
        const chunkResult = await this.processChunk(
          chunk, 
          params.meetingId, 
          i, 
          chunks.length,
          params.userId || 'anonymous'
        );
        
        partialAnalyses.push(chunkResult);
      }

      // 4. Generate final analysis
      const finalAnalysis = await this.generateFinalAnalysis(
        partialAnalyses,
        params.meetingId,
        params.transcript,
        params.title || 'Untitled Meeting',
        params.participantIds || [],
        params.userId || 'anonymous'
      );

      // 5. Store the results
      await this.storeResults(finalAnalysis, params.meetingId, params.userId || 'anonymous');

      return {
        meetingId: params.meetingId,
        output: finalAnalysis,
        status: 'completed',
        success: true
      };
    } catch (error) {
      console.error("Error in processTranscriptTraditional", error);
      
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
   * Process a single chunk of the transcript
   */
  private async processChunk(
    chunk: string, 
    meetingId: string, 
    chunkIndex: number, 
    totalChunks: number,
    userId: string
  ): Promise<string> {
    // Create request for chunk analysis using the "chunk-analysis" capability
    const chunkRequest: AgentRequest = {
      input: chunk,
      capability: "chunk-analysis",
      parameters: {
        meetingId: meetingId,
        chunkIndex: chunkIndex,
        totalChunks: totalChunks,
        ragStrategy: RagRetrievalStrategy.HYBRID
      },
      context: {
        userId: userId
      }
    };
    
    // Execute agent for this chunk
    const response = await this.agent.execute(chunkRequest);
    
    // Get analysis text
    return typeof response.output === 'string' 
      ? response.output 
      : JSON.stringify(response.output);
  }

  /**
   * Generate final analysis after all chunks are processed
   */
  private async generateFinalAnalysis(
    partialAnalyses: string[],
    meetingId: string,
    transcript: string,
    meetingTitle: string,
    participantIds: string[],
    userId: string
  ): Promise<any> {
    // Create request for final analysis
    const finalRequest: AgentRequest = {
      input: JSON.stringify({
        partialAnalyses: partialAnalyses,
        meetingId: meetingId,
        transcript: transcript,
        meetingTitle: meetingTitle,
        participants: participantIds
      }),
      capability: "final-analysis",
      parameters: {
        meetingId: meetingId,
        meetingTitle: meetingTitle,
        isFinalAnalysis: true,
        ragStrategy: RagRetrievalStrategy.HYBRID,
        contentTypes: [
          ContextType.MEETING,
          ContextType.DECISION,
          ContextType.ACTION_ITEM,
        ]
      },
      context: {
        userId: userId
      }
    };
    
    // Execute agent for final analysis
    const finalResponse = await this.agent.execute(finalRequest);
    
    // Parse the analysis result
    try {
      return typeof finalResponse.output === 'string' 
        ? JSON.parse(finalResponse.output) 
        : finalResponse.output;
    } catch (error) {
      throw new Error(`Failed to parse analysis result: ${error}`);
    }
  }

  /**
   * Store the final analysis results
   */
  private async storeResults(
    analysisResult: any,
    meetingId: string,
    userId: string
  ): Promise<void> {
    // Create request to store results using the "store-analysis" capability
    const storeRequest: AgentRequest = {
      input: JSON.stringify({
        result: analysisResult,
        meetingId: meetingId
      }),
      capability: "store-analysis",
      context: {
        userId: userId
      }
    };
    
    await this.agent.execute(storeRequest);
  }
} 