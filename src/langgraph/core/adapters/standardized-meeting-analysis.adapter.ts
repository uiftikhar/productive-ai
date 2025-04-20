import { Annotation, StateGraph, START, END } from '@langchain/langgraph';

import {
  BaseLangGraphAdapter,
  BaseLangGraphState,
  WorkflowStatus,
} from './base-langgraph.adapter';
import { MeetingAnalysisAgent } from '../../../agents/specialized/meeting-analysis-agent';
import { splitTranscript } from '../../../shared/utils/split-transcript';
import { ContextType } from '../../../shared/user-context/types/context.types';
import { AgentWorkflow } from '../workflows/agent-workflow';

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
 * StandardizedMeetingAnalysisAdapter
 *
 * A refined implementation of the meeting analysis adapter using
 * the standardized BaseLangGraphAdapter pattern.
 */
export class StandardizedMeetingAnalysisAdapter extends BaseLangGraphAdapter<
  MeetingAnalysisState,
  ProcessMeetingTranscriptParams,
  ProcessMeetingTranscriptResult
> {
  // Default configuration
  protected maxChunkSize: number;
  protected chunkOverlap: number;
  protected agentWorkflow: AgentWorkflow<MeetingAnalysisAgent>;

  /**
   * Creates a new instance of the StandardizedMeetingAnalysisAdapter
   */
  constructor(
    protected readonly agent: MeetingAnalysisAgent,
    options: {
      tracingEnabled?: boolean;
      maxChunkSize?: number;
      chunkOverlap?: number;
      logger?: any;
    } = {},
  ) {
    super({
      tracingEnabled: options.tracingEnabled,
      logger: options.logger,
    });

    this.maxChunkSize = options.maxChunkSize || 2000;
    this.chunkOverlap = options.chunkOverlap || 200;
    
    // Create an agent workflow for the agent
    this.agentWorkflow = new AgentWorkflow(this.agent, {
      tracingEnabled: options.tracingEnabled,
    });
  }

  /**
   * Convenient method to process a meeting transcript
   */
  async processMeetingTranscript(
    params: ProcessMeetingTranscriptParams,
  ): Promise<ProcessMeetingTranscriptResult> {
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

      // Meeting information
      meetingId: Annotation<string>(),
      transcript: Annotation<string>(),
      meetingTitle: Annotation<string | undefined>(),
      participantIds: Annotation<string[]>({
        default: () => [],
        value: (curr, update) => update,
      }),
      userId: Annotation<string>(),

      // Processing state
      chunks: Annotation<string[]>({
        default: () => [],
        value: (curr, update) => update,
      }),
      currentChunkIndex: Annotation<number>({
        default: () => 0,
        value: (curr, update) => update,
      }),
      partialAnalyses: Annotation<string[]>({
        default: () => [],
        reducer: (curr, update) => [
          ...(curr || []),
          ...(Array.isArray(update) ? update : [update]),
        ],
      }),

      // Results
      analysisResult: Annotation<any>(),
    });
  }

  /**
   * Create the state graph for meeting analysis workflow
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

      // Meeting-specific nodes
      .addNode('process_chunk', this.createProcessChunkNode())
      .addNode('check_chunks', this.createCheckChunksNode())
      .addNode(
        'generate_final_analysis',
        this.createGenerateFinalAnalysisNode(),
      )
      .addNode('store_results', this.createStoreResultsNode());

    // Conditional routing function
    const routeAfterChunkProcessing = (state: any) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'check_chunks';
    };

    const routeAfterCheckChunks = (state: any) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }

      // If there are more chunks to process, go back to process_chunk
      if (state.currentChunkIndex < state.chunks.length) {
        return 'process_chunk';
      }

      // Otherwise proceed to final analysis
      return 'generate_final_analysis';
    };

    const routeAfterFinalAnalysis = (state: any) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'store_results';
    };

    const routeAfterStoreResults = (state: any) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'complete';
    };

    // Define the edges
    const typedGraph = graph as any;

    typedGraph
      .addEdge(START, 'initialize')
      .addEdge('initialize', 'process_chunk')
      .addConditionalEdges('process_chunk', routeAfterChunkProcessing)
      .addConditionalEdges('check_chunks', routeAfterCheckChunks)
      .addConditionalEdges('generate_final_analysis', routeAfterFinalAnalysis)
      .addConditionalEdges('store_results', routeAfterStoreResults)
      .addEdge('complete', END)
      .addEdge('error_handler', END);

    return graph;
  }

  /**
   * Create the initial state for meeting analysis
   */
  protected createInitialState(
    input: ProcessMeetingTranscriptParams,
  ): MeetingAnalysisState {
    // Get the base state
    const baseState = super.createInitialState(input);

    // Split the transcript into chunks
    const chunks = splitTranscript(
      input.transcript,
      this.maxChunkSize,
      this.chunkOverlap,
    );

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
      },
    };
  }

  /**
   * Process the final state to produce the output
   */
  protected processResult(
    state: MeetingAnalysisState,
  ): ProcessMeetingTranscriptResult {
    // If error occurred, generate an error response
    if (state.status === WorkflowStatus.ERROR) {
      const errorMessage =
        state.errors && state.errors.length > 0
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

        this.logger.debug(
          `Processing chunk ${chunkIndex + 1}/${state.chunks.length}`,
          {
            chunkLength: chunk.length,
            meetingId: state.meetingId,
          },
        );

        // Process the current chunk using the workflow instead of direct agent execution
        const result = await this.agentWorkflow.execute({
          input: chunk,
          capability: 'analyze-transcript-chunk',
          parameters: {
            userId: state.userId,
            chunkIndex,
            totalChunks: state.chunks.length,
            meetingId: state.meetingId,
            meetingTitle: state.meetingTitle,
            participantIds: state.participantIds,
            includeTopics: state.metadata?.includeTopics,
            includeActionItems: state.metadata?.includeActionItems,
            includeSentiment: state.metadata?.includeSentiment,
            conversationId: state.runId, // Using runId as a conversationId for tracking
            storeInContext: true, // Enable storage of analysis in context
            documentIds: [state.meetingId], // Include the meetingId as a document filter
          },
        });

        // Extract response content
        const analysis =
          typeof result.output === 'string'
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
          'process_chunk',
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
          'check_chunks',
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
        this.logger.info(
          `Generating final analysis for meeting ${state.meetingId}`,
          {
            chunkCount: state.chunks.length,
            partialAnalysesCount: state.partialAnalyses.length,
          },
        );

        // Combine the partial analyses and generate a final analysis
        const combinedAnalyses = state.partialAnalyses.join('\n\n');

        // Use the workflow instead of direct agent execution
        const result = await this.agentWorkflow.execute({
          input: combinedAnalyses,
          capability: 'generate-final-analysis',
          parameters: {
            userId: state.userId,
            meetingId: state.meetingId,
            meetingTitle: state.meetingTitle,
            totalChunks: state.chunks.length,
            participantIds: state.participantIds,
            includeTopics: state.metadata?.includeTopics,
            includeActionItems: state.metadata?.includeActionItems,
            includeSentiment: state.metadata?.includeSentiment,
            conversationId: state.runId, // Using runId as a conversationId for tracking
            storeInContext: true, // Enable storage of analysis in context
            documentIds: [state.meetingId], // Include the meetingId as a document filter
            includeHistorical: true, // Include historical data for final analysis
          },
        });

        // Parse the response as JSON if possible
        let analysisResult;
        try {
          const responseText =
            typeof result.output === 'string'
              ? result.output
              : result.output.content;

          // Try to parse as JSON
          analysisResult = JSON.parse(
            typeof responseText === 'string'
              ? responseText
              : JSON.stringify(responseText),
          );
        } catch (parseError) {
          // If parsing fails, use the raw text
          analysisResult = {
            rawAnalysis:
              typeof result.output === 'string'
                ? result.output
                : result.output.content,
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
          'generate_final_analysis',
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

        // Prepare a storage request for the meeting analysis
        // This would typically save to a database, but for now we just prepare the request
        const storageRequest = {
          meetingId: state.meetingId,
          userId: state.userId,
          analysisResult: state.analysisResult,
          contextType: ContextType.MEETING,
          metadata: {
            title: state.meetingTitle,
            participantIds: state.participantIds,
            transcriptLength: state.transcript.length,
            chunkCount: state.chunks.length,
            analysisTimestamp: new Date().toISOString(),
          },
        };

        // Store the results - this would be implemented with actual storage in a production system
        // For now, we just log the request
        this.logger.debug(
          'Would store meeting analysis with request:',
          storageRequest,
        );

        return {
          ...state,
          status: WorkflowStatus.COMPLETED,
          endTime: Date.now(),
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'store_results',
        );
      }
    };
  }
}
