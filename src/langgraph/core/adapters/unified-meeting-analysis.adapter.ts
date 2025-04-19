import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { v4 as uuidv4 } from 'uuid';

import { 
  BaseLangGraphAdapter, 
  BaseLangGraphState,
  WorkflowStatus
} from './base-langgraph.adapter';
import { MeetingAnalysisAgent } from '../../../agents/specialized/meeting-analysis-agent';
import { splitTranscript } from '../../../shared/utils/split-transcript';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * Meeting analysis state interface
 */
export interface MeetingAnalysisState extends BaseLangGraphState {
  // Meeting information
  meetingId: string;
  transcript: string;
  meetingTitle?: string;
  participantIds: string[];
  userId: string;
  
  // Processing state
  chunks: string[];
  currentChunkIndex: number;
  partialAnalyses: string[];
  
  // Results
  analysisResult?: any;
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
  success: boolean;
  metrics?: {
    executionTimeMs?: number;
    tokensUsed?: number;
  };
}

/**
 * UnifiedMeetingAnalysisAdapter
 * 
 * A meeting analysis adapter using the unified agent architecture
 * and standardized LangGraph approach
 * 
 * @status STABLE
 */
export class UnifiedMeetingAnalysisAdapter extends BaseLangGraphAdapter<
  MeetingAnalysisState, 
  ProcessMeetingTranscriptParams, 
  ProcessMeetingTranscriptResult
> {
  // Default configuration
  protected maxChunkSize: number;
  protected chunkOverlap: number;
  protected logger: Logger;

  /**
   * Creates a new instance of the UnifiedMeetingAnalysisAdapter
   */
  constructor(
    protected readonly agent: MeetingAnalysisAgent,
    options: {
      tracingEnabled?: boolean;
      maxChunkSize?: number;
      chunkOverlap?: number;
      logger?: Logger;
    } = {}
  ) {
    super({
      tracingEnabled: options.tracingEnabled,
    });
    
    this.maxChunkSize = options.maxChunkSize || 2000;
    this.chunkOverlap = options.chunkOverlap || 200;
    this.logger = options.logger || new ConsoleLogger();
  }

  /**
   * Convenient method to process a meeting transcript
   */
  async processMeetingTranscript(params: ProcessMeetingTranscriptParams): Promise<ProcessMeetingTranscriptResult> {
    // Initialize the agent if needed
    if (!this.agent.getInitializationStatus()) {
      await this.agent.initialize();
    }
    
    // Execute the workflow using the base class method
    return this.execute(params);
  }

  /**
   * Create the state schema for meeting analysis
   */
  protected createStateSchema() {
    return Annotation.Root({
      // Base state fields
      id: Annotation<string>(),
      runId: Annotation<string>(),
      status: Annotation<string>(),
      startTime: Annotation<number>(),
      endTime: Annotation<number | undefined>(),
      errorCount: Annotation<number>({
        default: () => 0,
        value: (curr, update) => (curr || 0) + (update || 0),
      }),
      errors: Annotation<any[]>({
        default: () => [],
        reducer: (curr, update) => [...(curr || []), ...(Array.isArray(update) ? update : [update])],
      }),
      metrics: Annotation<any>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
      metadata: Annotation<Record<string, any>>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
      
      // Meeting information
      meetingId: Annotation<string>(),
      transcript: Annotation<string>(),
      meetingTitle: Annotation<string | undefined>(),
      participantIds: Annotation<string[]>({
        default: () => [],
        value: (curr, update) => update
      }),
      userId: Annotation<string>(),
      
      // Processing state
      chunks: Annotation<string[]>({
        default: () => [],
        value: (curr, update) => update
      }),
      currentChunkIndex: Annotation<number>({
        default: () => 0,
        value: (curr, update) => update
      }),
      partialAnalyses: Annotation<string[]>({
        default: () => [],
        reducer: (curr, update) => [...(curr || []), ...(Array.isArray(update) ? update : [update])],
      }),
      
      // Results
      analysisResult: Annotation<any>(),
    });
  }

  /**
   * Create the state graph for meeting analysis workflow
   */
  protected createStateGraph(schema: ReturnType<typeof this.createStateSchema>): StateGraph<any> {
    const graph = new StateGraph(schema);
    
    // Add the nodes
    graph
      // Common nodes from base adapter
      .addNode("initialize", this.createInitializationNode())
      .addNode("error_handler", this.createErrorHandlerNode())
      .addNode("complete", this.createCompletionNode())
      
      // Meeting-specific nodes
      .addNode("process_chunk", this.createProcessChunkNode())
      .addNode("check_chunks", this.createCheckChunksNode())
      .addNode("generate_final_analysis", this.createGenerateFinalAnalysisNode())
      .addNode("store_results", this.createStoreResultsNode());
    
    // Conditional routing function
    const routeAfterChunkProcessing = (state: any) => {
      if (state.status === WorkflowStatus.ERROR) {
        return "error_handler";
      }
      return "check_chunks";
    };
    
    const routeAfterCheckChunks = (state: any) => {
      if (state.status === WorkflowStatus.ERROR) {
        return "error_handler";
      }
      
      // If there are more chunks to process, go back to process_chunk
      if (state.currentChunkIndex < state.chunks.length) {
        return "process_chunk";
      }
      
      // Otherwise proceed to final analysis
      return "generate_final_analysis";
    };
    
    const routeAfterFinalAnalysis = (state: any) => {
      if (state.status === WorkflowStatus.ERROR) {
        return "error_handler";
      }
      return "store_results";
    };
    
    const routeAfterStoreResults = (state: any) => {
      if (state.status === WorkflowStatus.ERROR) {
        return "error_handler";
      }
      return "complete";
    };
    
    // Define the edges
    const typedGraph = graph as any;
    
    typedGraph
      .addEdge(START, "initialize")
      .addEdge("initialize", "process_chunk")
      .addConditionalEdges("process_chunk", routeAfterChunkProcessing)
      .addConditionalEdges("check_chunks", routeAfterCheckChunks)
      .addConditionalEdges("generate_final_analysis", routeAfterFinalAnalysis)
      .addConditionalEdges("store_results", routeAfterStoreResults)
      .addEdge("complete", END)
      .addEdge("error_handler", END);
    
    return graph;
  }

  /**
   * Create the initial state for meeting analysis
   */
  protected createInitialState(input: ProcessMeetingTranscriptParams): MeetingAnalysisState {
    // Get the base state
    const baseState = super.createInitialState(input);
    
    // Split the transcript into chunks
    const chunks = splitTranscript(input.transcript, this.maxChunkSize, this.chunkOverlap);
    
    // Create the meeting-specific state
    return {
      ...baseState,
      meetingId: input.meetingId,
      transcript: input.transcript,
      meetingTitle: input.title || 'Untitled Meeting',
      participantIds: input.participantIds || [],
      userId: input.userId || 'anonymous',
      chunks,
      currentChunkIndex: 0,
      partialAnalyses: [],
      metadata: {
        ...baseState.metadata,
        includeTopics: input.includeTopics !== false, // Default to true
        includeActionItems: input.includeActionItems !== false, // Default to true
        includeSentiment: input.includeSentiment !== false, // Default to true
      }
    };
  }

  /**
   * Process the final state to produce the output
   */
  protected processResult(state: MeetingAnalysisState): ProcessMeetingTranscriptResult {
    // If error occurred, generate an error response
    if (state.status === WorkflowStatus.ERROR) {
      const errorMessage = state.errors && state.errors.length > 0
        ? state.errors[state.errors.length - 1].message
        : 'Unknown error occurred during meeting analysis';
        
      return {
        meetingId: state.meetingId,
        output: {
          error: errorMessage,
          details: state.errors,
        },
        success: false,
        metrics: this.getMetricsFromState(state),
      };
    }
    
    // Return the successful analysis
    return {
      meetingId: state.meetingId,
      output: state.analysisResult,
      success: true,
      metrics: this.getMetricsFromState(state),
    };
  }

  /**
   * Create the initialization node
   */
  private createInitializationNode() {
    return async (state: MeetingAnalysisState) => {
      this.logger.info(`Initializing meeting analysis for ${state.meetingId}`, {
        chunks: state.chunks.length,
        meetingTitle: state.meetingTitle,
      });
      
      return {
        ...state,
        status: WorkflowStatus.READY,
      };
    };
  }

  /**
   * Create the process chunk node
   */
  private createProcessChunkNode() {
    return async (state: MeetingAnalysisState) => {
      try {
        const chunkIndex = state.currentChunkIndex;
        const chunk = state.chunks[chunkIndex];
        
        this.logger.debug(`Processing chunk ${chunkIndex + 1}/${state.chunks.length}`, {
          chunkLength: chunk.length,
          meetingId: state.meetingId
        });
        
        // Process the current chunk using the agent's analyze-transcript-chunk capability
        const result = await this.agent.execute({
          input: chunk,
          capability: 'analyze-transcript-chunk',
          parameters: {
            chunkIndex,
            totalChunks: state.chunks.length,
            meetingId: state.meetingId,
            includeTopics: state.metadata?.includeTopics,
            includeActionItems: state.metadata?.includeActionItems,
            includeSentiment: state.metadata?.includeSentiment,
          }
        });
        
        // Extract response content
        const analysis = typeof result.output === 'string' 
          ? result.output 
          : result.output.content;
        
        // Update metrics
        const currentTokens = state.metrics?.tokensUsed || 0;
        const newTokens = result.metrics?.tokensUsed || 0;
        
        return {
          ...state,
          partialAnalyses: [...state.partialAnalyses, analysis],
          metrics: {
            ...state.metrics,
            tokensUsed: currentTokens + newTokens,
          },
          status: WorkflowStatus.READY,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'process_chunk'
        );
      }
    };
  }

  /**
   * Create the check chunks node
   */
  private createCheckChunksNode() {
    return async (state: MeetingAnalysisState) => {
      try {
        // Increment the chunk index
        const nextChunkIndex = state.currentChunkIndex + 1;
        
        return {
          ...state,
          currentChunkIndex: nextChunkIndex,
          status: WorkflowStatus.READY,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'check_chunks'
        );
      }
    };
  }

  /**
   * Create the generate final analysis node
   */
  private createGenerateFinalAnalysisNode() {
    return async (state: MeetingAnalysisState) => {
      try {
        this.logger.info(`Generating final analysis for meeting ${state.meetingId}`, {
          chunkCount: state.chunks.length,
          partialAnalysesCount: state.partialAnalyses.length,
        });
        
        // Combine the partial analyses and generate a final analysis
        const combinedAnalyses = state.partialAnalyses.join('\n\n');
        
        const result = await this.agent.execute({
          input: combinedAnalyses,
          capability: 'generate-final-analysis',
          parameters: {
            meetingId: state.meetingId,
            totalChunks: state.chunks.length,
            meetingTitle: state.meetingTitle,
            participantIds: state.participantIds,
            includeTopics: state.metadata?.includeTopics,
            includeActionItems: state.metadata?.includeActionItems,
            includeSentiment: state.metadata?.includeSentiment,
          }
        });
        
        // Parse the response as JSON if possible
        let analysisResult;
        try {
          const responseText = typeof result.output === 'string' 
            ? result.output 
            : result.output.content;
            
          // Try to parse as JSON
          analysisResult = JSON.parse(
            typeof responseText === 'string' 
              ? responseText 
              : JSON.stringify(responseText)
          );
        } catch (parseError) {
          // If parsing fails, use the raw text
          const rawContent = typeof result.output === 'string' 
            ? result.output 
            : result.output.content;
            
          analysisResult = {
            rawAnalysis: typeof rawContent === 'string'
              ? rawContent
              : JSON.stringify(rawContent)
          };
        }
        
        // Update metrics
        const currentTokens = state.metrics?.tokensUsed || 0;
        const newTokens = result.metrics?.tokensUsed || 0;
        
        return {
          ...state,
          analysisResult,
          metrics: {
            ...state.metrics,
            tokensUsed: currentTokens + newTokens,
          },
          status: WorkflowStatus.READY,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'generate_final_analysis'
        );
      }
    };
  }

  /**
   * Create the store results node
   */
  private createStoreResultsNode() {
    return async (state: MeetingAnalysisState) => {
      try {
        this.logger.info(`Storing results for meeting ${state.meetingId}`);
        
        // In a production implementation, this would save to a database
        // For now, we're just preparing the metadata and logging it
        
        const metadata = {
          meetingId: state.meetingId,
          userId: state.userId,
          title: state.meetingTitle,
          participantIds: state.participantIds,
          transcriptLength: state.transcript.length,
          chunkCount: state.chunks.length,
          analysisTimestamp: new Date().toISOString(),
        };
        
        this.logger.debug('Meeting analysis complete with metadata:', metadata);
        
        return {
          ...state,
          status: WorkflowStatus.COMPLETED,
          endTime: Date.now(),
          metadata: {
            ...state.metadata,
            ...metadata
          }
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'store_results'
        );
      }
    };
  }
} 