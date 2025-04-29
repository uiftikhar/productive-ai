import {
  Annotation,
  AnnotationRoot,
  StateGraph,
  START,
  END,
} from '@langchain/langgraph';

import {
  BaseLangGraphAdapter,
  BaseLangGraphState,
  WorkflowStatus,
} from './base-langgraph.adapter';
import { MeetingAnalysisAgent } from '../../../agents/specialized/meeting-analysis-agent';
import { splitTranscript } from '../../../shared/utils/split-transcript';
import {
  chunkTranscriptAdaptively,
  AdaptiveChunkingConfig,
} from '../../../shared/utils/adaptive-chunking';
import { ContextType } from '../../../shared/services/user-context/types/context.types';
import { AgentWorkflow } from '../workflows/agent-workflow';
import { BaseAgent } from '../../../agents/base/base-agent';
import { AgentStatus } from '../../../agents/interfaces/base-agent.interface';
import { generateVisualization } from '../utils/visualization-generator';
import { identifyContentSegments } from '../../../shared/utils/identify-content-segments';

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
  chunkImportance?: Record<number, number>; // Tracks importance of each chunk

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
  visualization?: boolean;
  adaptiveChunking?: boolean; // Whether to use adaptive chunking
  chunkingConfig?: Partial<AdaptiveChunkingConfig>; // Custom chunking configuration
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
  visualizationUrl?: string;
}

/**
 * StandardizedMeetingAnalysisAdapter
 *
 * A refined implementation of the meeting analysis adapter using
 * the standardized BaseLangGraphAdapter pattern.
 * Enhanced with adaptive chunking strategies.
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
  protected visualizationsPath: string;
  protected useAdaptiveChunking: boolean;
  protected adaptiveChunkingConfig: Partial<AdaptiveChunkingConfig>;

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
      visualizationsPath?: string;
      useAdaptiveChunking?: boolean;
      adaptiveChunkingConfig?: Partial<AdaptiveChunkingConfig>;
    } = {},
  ) {
    super({
      ...options,
    });

    this.maxChunkSize = options.maxChunkSize || 2000;
    this.chunkOverlap = options.chunkOverlap || 200;
    this.visualizationsPath = options.visualizationsPath || 'visualizations';
    this.useAdaptiveChunking = options.useAdaptiveChunking || false;
    this.adaptiveChunkingConfig = options.adaptiveChunkingConfig || {};

    this.agentWorkflow = new AgentWorkflow(this.agent, {
      tracingEnabled: options.tracingEnabled,
      visualizationsPath: this.visualizationsPath,
      enableRealtimeUpdates: true,
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
      chunkImportance: Annotation<Record<number, number>>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
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
    const baseState = super.createInitialState(input);

    // Determine whether to use adaptive chunking
    const useAdaptiveChunking =
      input.adaptiveChunking !== undefined
        ? input.adaptiveChunking
        : this.useAdaptiveChunking;

    // Split the transcript into chunks using appropriate strategy
    let chunks: string[] = [];
    let chunkImportance: Record<number, number> = {};

    if (useAdaptiveChunking) {
      // Use advanced adaptive chunking for better content boundary detection
      const chunkingConfig = {
        ...this.adaptiveChunkingConfig,
        ...(input.chunkingConfig || {}),
        baseChunkSize: this.maxChunkSize,
        overlapSize: this.chunkOverlap,
      };

      // First, identify segments by content type to create importance map
      const segments = identifyContentSegments(input.transcript);

      // Get the chunked transcript
      chunks = chunkTranscriptAdaptively(input.transcript, chunkingConfig);

      // Track importance of each chunk based on the segments it contains
      const chunkSizes = chunks.map((chunk) => chunk.length);
      let cumulativeLength = 0;

      // Map each chunk to its importance based on overlapping segments
      chunks.forEach((chunk, index) => {
        const chunkStart = cumulativeLength;
        const chunkEnd = chunkStart + chunk.length;

        // Find segments that overlap with this chunk
        const overlappingSegments = segments.filter((segment) => {
          return segment.startIndex < chunkEnd && segment.endIndex > chunkStart;
        });

        // Calculate overall importance as weighted average of segment importances
        if (overlappingSegments.length > 0) {
          const totalOverlapLength = overlappingSegments.reduce(
            (sum, segment) => {
              const overlapStart = Math.max(chunkStart, segment.startIndex);
              const overlapEnd = Math.min(chunkEnd, segment.endIndex);
              return sum + (overlapEnd - overlapStart);
            },
            0,
          );

          const weightedImportance = overlappingSegments.reduce(
            (sum, segment) => {
              const overlapStart = Math.max(chunkStart, segment.startIndex);
              const overlapEnd = Math.min(chunkEnd, segment.endIndex);
              const overlapLength = overlapEnd - overlapStart;
              return sum + segment.importance * overlapLength;
            },
            0,
          );

          chunkImportance[index] =
            totalOverlapLength > 0
              ? weightedImportance / totalOverlapLength
              : 0.5;
        } else {
          chunkImportance[index] = 0.5; // Default importance
        }

        cumulativeLength += chunk.length;
      });

      this.logger.info(
        `Using adaptive chunking strategy for meeting ${input.meetingId}`,
        {
          chunkCount: chunks.length,
          useAdaptiveChunking: true,
          importanceTracking: true,
        },
      );
    } else {
      // Use basic transcript splitting if adaptive chunking is disabled
      chunks = splitTranscript(
        input.transcript,
        this.maxChunkSize,
        this.chunkOverlap,
      );

      // For standard chunking, assign uniform importance
      chunks.forEach((_, index) => {
        chunkImportance[index] = 0.5;
      });

      this.logger.info(
        `Using standard chunking strategy for meeting ${input.meetingId}`,
        {
          chunkCount: chunks.length,
          useAdaptiveChunking: false,
        },
      );
    }

    return {
      ...baseState,
      meetingId: input.meetingId,
      transcript: input.transcript,
      meetingTitle: input.title || 'Untitled Meeting',
      participantIds: input.participantIds || [],
      userId: input.userId || 'anonymous',
      chunks,
      chunkImportance,
      currentChunkIndex: 0,
      partialAnalyses: [],
      metadata: {
        ...baseState.metadata,
        includeTopics: input.includeTopics !== false, // Default to true
        includeActionItems: input.includeActionItems !== false, // Default to true
        includeSentiment: input.includeSentiment !== false, // Default to true
        visualization: input.visualization || false,
        useAdaptiveChunking,
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
        output: `Error: ${errorMessage}`,
        success: false,
        metrics: {
          executionTimeMs:
            state.endTime && state.startTime
              ? state.endTime - state.startTime
              : undefined,
        },
      };
    }

    // Check if visualization was requested
    let visualizationUrl: string | undefined = undefined;
    if (state.metadata?.visualization) {
      // Generate visualization
      const visUrl = generateVisualization(state, {
        visualizationsPath: this.visualizationsPath || 'visualizations',
        logger: this.logger,
      });

      if (visUrl) {
        visualizationUrl = visUrl;
      }
    }

    // Return successful result
    return {
      meetingId: state.meetingId,
      output: state.analysisResult || {},
      success: true,
      metrics: {
        executionTimeMs:
          state.endTime && state.startTime
            ? state.endTime - state.startTime
            : undefined,
        tokensUsed: state.metrics?.tokensUsed,
      },
      visualizationUrl,
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
        const analysis = !result.output
          ? ''
          : typeof result.output === 'string'
            ? result.output
            : (result.output as any)?.content || '';

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

        // First, detect if we need to merge partial analyses intelligently
        let combinedAnalyses = '';
        if (state.partialAnalyses.length > 1) {
          this.logger.info(
            'Performing intelligent merging of partial analyses',
          );

          // Step 1: Try to parse each partial analysis as JSON
          const parsedAnalyses: any[] = [];
          const unparsedAnalyses: string[] = [];

          for (const analysis of state.partialAnalyses) {
            try {
              // Extract JSON content if wrapped in text
              const jsonMatch =
                analysis.match(/```json\s*([\s\S]*?)\s*```/) ||
                analysis.match(/{[\s\S]*}/);

              const jsonContent = jsonMatch ? jsonMatch[0] : analysis;
              const parsed = JSON.parse(
                jsonContent.replace(/```json|```/g, '').trim(),
              );
              parsedAnalyses.push(parsed);
            } catch (error) {
              // If parsing fails, keep as text
              unparsedAnalyses.push(analysis);
            }
          }

          // Step 2: If we have parsed analyses, merge them intelligently
          if (parsedAnalyses.length > 0) {
            // Create a consolidated analysis by merging specific sections
            const mergedAnalysis: any = {
              summary: '',
              topics: [],
              actionItems: [],
              decisions: [],
              sentimentAnalysis: {},
              keyPoints: [],
            };

            // Merge summaries with weights favoring analyses of important segments
            let summaryText = '';
            parsedAnalyses.forEach((analysis, index) => {
              if (analysis.summary) {
                const importance = state.chunkImportance?.[index] || 1;
                summaryText += `${analysis.summary} `;
              }
            });
            mergedAnalysis.summary = summaryText.trim();

            // Collect and deduplicate topics
            const topicMap = new Map<
              string,
              { title: string; description: string; confidence: number }
            >();
            parsedAnalyses.forEach((analysis) => {
              if (Array.isArray(analysis.topics)) {
                analysis.topics.forEach((topic: any) => {
                  if (topic.title && !topicMap.has(topic.title.toLowerCase())) {
                    topicMap.set(topic.title.toLowerCase(), topic);
                  }
                });
              }
            });
            mergedAnalysis.topics = Array.from(topicMap.values());

            // Collect and deduplicate action items
            const actionItemMap = new Map<string, any>();
            parsedAnalyses.forEach((analysis) => {
              if (Array.isArray(analysis.actionItems)) {
                analysis.actionItems.forEach((item: any) => {
                  const key = `${item.action}-${item.assignee || 'unassigned'}`;
                  if (!actionItemMap.has(key)) {
                    actionItemMap.set(key, item);
                  }
                });
              }
            });
            mergedAnalysis.actionItems = Array.from(actionItemMap.values());

            // Collect and deduplicate decisions
            const decisionMap = new Map<string, any>();
            parsedAnalyses.forEach((analysis) => {
              if (Array.isArray(analysis.decisions)) {
                analysis.decisions.forEach((decision: any) => {
                  if (
                    decision.decision &&
                    !decisionMap.has(decision.decision)
                  ) {
                    decisionMap.set(decision.decision, decision);
                  }
                });
              }
            });
            mergedAnalysis.decisions = Array.from(decisionMap.values());

            // For sentiment, take the average across all analyses
            let sentimentCount = 0;
            const sentimentTotals: Record<string, number> = {
              overall: 0,
              positive: 0,
              negative: 0,
              neutral: 0,
            };

            parsedAnalyses.forEach((analysis) => {
              if (analysis.sentimentAnalysis) {
                sentimentCount++;
                const sentiment = analysis.sentimentAnalysis;

                sentimentTotals.overall += sentiment.overall || 0;
                sentimentTotals.positive += sentiment.positive || 0;
                sentimentTotals.negative += sentiment.negative || 0;
                sentimentTotals.neutral += sentiment.neutral || 0;
              }
            });

            if (sentimentCount > 0) {
              mergedAnalysis.sentimentAnalysis = {
                overall: sentimentTotals.overall / sentimentCount,
                positive: sentimentTotals.positive / sentimentCount,
                negative: sentimentTotals.negative / sentimentCount,
                neutral: sentimentTotals.neutral / sentimentCount,
              };
            }

            // Include any unparsed analysis content for completeness
            if (unparsedAnalyses.length > 0) {
              mergedAnalysis.additionalAnalysis = unparsedAnalyses.join('\n\n');
            }

            // Convert merged analysis back to a combined string for processing
            combinedAnalyses = JSON.stringify(mergedAnalysis, null, 2);

            this.logger.info(
              'Successfully merged analyses with smart deduplication',
              {
                topicCount: mergedAnalysis.topics.length,
                actionItemCount: mergedAnalysis.actionItems.length,
                decisionCount: mergedAnalysis.decisions.length,
              },
            );
          } else {
            // If we couldn't parse as JSON, concatenate with separators
            combinedAnalyses = state.partialAnalyses.join(
              '\n\n--- Analysis Segment ---\n\n',
            );
          }
        } else {
          // Default fallback to simple concatenation if we only have one analysis or intelligent merging fails
          combinedAnalyses = state.partialAnalyses.join('\n\n');
        }

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
          if (typeof result.output === 'string') {
            // Try to extract JSON content if wrapped in text
            const jsonMatch =
              result.output.match(/```json\s*([\s\S]*?)\s*```/) ||
              result.output.match(/{[\s\S]*}/);

            const jsonContent = jsonMatch ? jsonMatch[0] : result.output;
            analysisResult = JSON.parse(
              jsonContent.replace(/```json|```/g, '').trim(),
            );
          } else {
            analysisResult = result.output;
          }
        } catch (parseError) {
          this.logger.warn('Failed to parse analysis result as JSON', {
            error: parseError,
          });
          analysisResult = {
            rawOutput: result.output,
            error: 'Failed to parse analysis result as structured data',
          };
        }

        return {
          ...state,
          analysisResult,
          status: WorkflowStatus.READY,
          metrics: {
            ...state.metrics,
            tokensUsed:
              (state.metrics?.tokensUsed || 0) +
              (result.metrics?.tokensUsed || 0),
          },
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.error('Error generating final analysis', { error });
        return this.addErrorToState(state, error, 'generate_final_analysis');
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
