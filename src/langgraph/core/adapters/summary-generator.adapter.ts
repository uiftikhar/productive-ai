import { v4 as uuidv4 } from 'uuid';
import {
  StateGraph,
  START,
  END,
  Annotation,
  AnnotationRoot,
} from '@langchain/langgraph';

import {
  BaseLangGraphAdapter,
  BaseLangGraphState,
  WorkflowStatus,
} from './base-langgraph.adapter';
import { BaseAgent } from '../../../agents/base/base-agent';
import { AgentWorkflow } from '../workflows/agent-workflow';
import { ContextType } from '../../../shared/services/user-context/types/context.types';

/**
 * Summary generator state interface
 */
export interface SummaryGenerationState extends BaseLangGraphState {
  // Core identifiers
  documentId: string;
  userId: string;

  // Content
  content: string;
  contentType: string;
  title?: string;

  // Processing state
  chunks: string[];
  currentChunkIndex: number;
  partialSummaries: string[];

  // Results
  generatedSummary?: string;
  keypoints?: string[];
  tags?: string[];
}

/**
 * Parameters for generateSummary method
 */
export interface GenerateSummaryParams {
  documentId?: string;
  userId?: string;
  content: string;
  contentType?: string;
  title?: string;
  includeTags?: boolean;
  includeKeypoints?: boolean;
  maxSummaryLength?: number;
}

/**
 * Results from generateSummary
 */
export interface GenerateSummaryResult {
  documentId: string;
  userId: string;
  summary: string;
  keypoints?: string[];
  tags?: string[];
  status: string;
  success: boolean;
  metrics?: {
    executionTimeMs: number;
    tokensUsed?: number;
    contentLength: number;
  };
}

/**
 * SummaryGeneratorAdapter
 * 
 * This adapter specializes in generating summaries from various content types
 */
export class SummaryGeneratorAdapter extends BaseLangGraphAdapter<
  SummaryGenerationState,
  GenerateSummaryParams,
  GenerateSummaryResult
> {
  protected readonly agent: BaseAgent;
  protected readonly agentWorkflow: AgentWorkflow;
  protected readonly maxChunkSize: number;
  protected readonly chunkOverlap: number;

  constructor(
    agent: BaseAgent,
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

    this.agent = agent;
    this.agentWorkflow = new AgentWorkflow(this.agent, {
      tracingEnabled: options.tracingEnabled,
    });
    this.maxChunkSize = options.maxChunkSize || 4000;
    this.chunkOverlap = options.chunkOverlap || 200;
  }

  /**
   * Generate a summary from content
   */
  async generateSummary(params: GenerateSummaryParams): Promise<GenerateSummaryResult> {
    return this.execute(params);
  }

  /**
   * Create the state schema for summary generation
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

      // Summary-specific fields
      documentId: Annotation<string>(),
      userId: Annotation<string>(),
      content: Annotation<string>(),
      contentType: Annotation<string>(),
      title: Annotation<string | undefined>(),
      
      // Processing state
      chunks: Annotation<string[]>({
        default: () => [],
        value: (curr, update) => update,
      }),
      currentChunkIndex: Annotation<number>({
        default: () => 0,
        value: (curr, update) => update,
      }),
      partialSummaries: Annotation<string[]>({
        default: () => [],
        reducer: (curr, update) => [
          ...(curr || []),
          ...(Array.isArray(update) ? update : [update]),
        ],
      }),
      
      // Results
      generatedSummary: Annotation<string | undefined>(),
      keypoints: Annotation<string[] | undefined>({
        default: () => [],
        value: (curr, update) => update,
      }),
      tags: Annotation<string[] | undefined>({
        default: () => [],
        value: (curr, update) => update,
      }),
    });
  }

  /**
   * Create the state graph for summary generation workflow
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

      // Summary-specific nodes
      .addNode('prepare_content', this.createPrepareContentNode())
      .addNode('process_chunk', this.createProcessChunkNode())
      .addNode('check_chunks', this.createCheckChunksNode())
      .addNode('generate_final_summary', this.createGenerateFinalSummaryNode())
      .addNode('store_results', this.createStoreResultsNode());

    // Conditional routing functions
    const routeAfterPrepareContent = (state: any) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'process_chunk';
    };

    const routeAfterProcessChunk = (state: any) => {
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

      // Otherwise proceed to final summary
      return 'generate_final_summary';
    };

    const routeAfterFinalSummary = (state: any) => {
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
      .addEdge('initialize', 'prepare_content')
      .addConditionalEdges('prepare_content', routeAfterPrepareContent)
      .addConditionalEdges('process_chunk', routeAfterProcessChunk)
      .addConditionalEdges('check_chunks', routeAfterCheckChunks)
      .addConditionalEdges('generate_final_summary', routeAfterFinalSummary)
      .addConditionalEdges('store_results', routeAfterStoreResults)
      .addEdge('complete', END)
      .addEdge('error_handler', END);

    return graph;
  }

  /**
   * Create the initial state for summary generation
   */
  protected createInitialState(input: GenerateSummaryParams): SummaryGenerationState {
    const baseState = super.createInitialState(input);

    const documentId = input.documentId || uuidv4();
    const userId = input.userId || 'anonymous';

    return {
      ...baseState,
      documentId,
      userId,
      content: input.content,
      contentType: input.contentType || 'text',
      title: input.title,
      chunks: [],
      currentChunkIndex: 0,
      partialSummaries: [],
      metadata: {
        ...baseState.metadata,
        agentId: this.agent.id,
        includeTags: input.includeTags !== false,
        includeKeypoints: input.includeKeypoints !== false,
        maxSummaryLength: input.maxSummaryLength || 500,
      },
    };
  }

  /**
   * Process the final state to produce the output
   */
  protected processResult(state: SummaryGenerationState): GenerateSummaryResult {
    const executionTimeMs =
      (state.endTime || Date.now()) - (state.startTime || Date.now());

    // If error occurred, generate an error response
    if (state.status === WorkflowStatus.ERROR) {
      const errorMessage =
        state.errors && state.errors.length > 0
          ? state.errors[state.errors.length - 1].message
          : 'Unknown error occurred during summary generation';

      return {
        documentId: state.documentId,
        userId: state.userId,
        summary: `Error: ${errorMessage}`,
        status: 'error',
        success: false,
        metrics: {
          executionTimeMs,
          tokensUsed: state.metrics?.tokensUsed,
          contentLength: state.content.length,
        },
      };
    }

    return {
      documentId: state.documentId,
      userId: state.userId,
      summary: state.generatedSummary || 'No summary generated',
      keypoints: state.keypoints,
      tags: state.tags,
      status: String(state.status),
      success: String(state.status) !== String(WorkflowStatus.ERROR),
      metrics: {
        executionTimeMs,
        tokensUsed: state.metrics?.tokensUsed,
        contentLength: state.content.length,
      },
    };
  }

  /**
   * Create the initialization node
   */
  private createInitializationNode() {
    return async (state: SummaryGenerationState) => {
      this.logger.info(
        `Initializing summary generation for document ${state.documentId}`,
      );

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
   * Create node to prepare the content for processing
   */
  private createPrepareContentNode() {
    return async (state: SummaryGenerationState) => {
      try {
        this.logger.debug(`Preparing content for summary generation`);
        
        // Simple splitting logic - this would be enhanced with proper text splitting
        const chunks: string[] = [];
        let content = state.content;
        
        while (content.length > 0) {
          const chunkSize = Math.min(this.maxChunkSize, content.length);
          const chunk = content.substring(0, chunkSize);
          chunks.push(chunk);
          
          // Remove the processed chunk, considering overlap if any
          const nextStart = Math.max(0, chunkSize - this.chunkOverlap);
          content = content.substring(nextStart);
        }
        
        return {
          ...state,
          chunks,
          status: WorkflowStatus.READY,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'prepare_content',
        );
      }
    };
  }

  /**
   * Create node to process individual chunks
   */
  private createProcessChunkNode() {
    return async (state: SummaryGenerationState) => {
      try {
        const chunkIndex = state.currentChunkIndex;
        const chunk = state.chunks[chunkIndex];
        
        this.logger.debug(
          `Processing chunk ${chunkIndex + 1}/${state.chunks.length}`,
          {
            chunkLength: chunk.length,
            documentId: state.documentId,
          },
        );

        const result = await this.agentWorkflow.execute({
          input: chunk,
          capability: 'summarize-chunk',
          parameters: {
            userId: state.userId,
            chunkIndex,
            totalChunks: state.chunks.length,
            documentId: state.documentId,
            documentTitle: state.title,
            contentType: state.contentType,
            storeInContext: true,
            documentIds: [state.documentId],
          },
        });

        // Extract response content
        const summary =
          typeof result.output === 'string'
            ? result.output
            : result.output.content;

        const currentTokens = state.metrics?.tokensUsed || 0;
        const newTokens = result.metrics?.tokensUsed || 0;

        return {
          partialSummaries: [...state.partialSummaries, summary],
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
   * Create node to check chunk processing status
   */
  private createCheckChunksNode() {
    return async (state: SummaryGenerationState) => {
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
   * Create node to generate the final summary
   */
  private createGenerateFinalSummaryNode() {
    return async (state: SummaryGenerationState) => {
      try {
        this.logger.info(
          `Generating final summary for document ${state.documentId}`,
          {
            chunkCount: state.chunks.length,
            partialSummariesCount: state.partialSummaries.length,
          },
        );

        // Combine the partial analyses and generate a final summary
        const combinedSummaries = state.partialSummaries.join('\n\n');

        // Use the workflow to generate final summary
        const result = await this.agentWorkflow.execute({
          input: combinedSummaries,
          capability: 'generate-final-summary',
          parameters: {
            userId: state.userId,
            documentId: state.documentId,
            documentTitle: state.title,
            totalChunks: state.chunks.length,
            contentType: state.contentType,
            includeTags: state.metadata?.includeTags,
            includeKeypoints: state.metadata?.includeKeypoints,
            maxSummaryLength: state.metadata?.maxSummaryLength,
            storeInContext: true,
            documentIds: [state.documentId],
          },
        });

        // Parse the response
        let summary: string;
        let keypoints: string[] = [];
        let tags: string[] = [];
        
        try {
          // First try to parse as JSON
          const responseText =
            typeof result.output === 'string'
              ? result.output
              : typeof result.output.content === 'string'
                ? result.output.content
                : JSON.stringify(result.output.content);
          
          const parsedResponse = JSON.parse(
            typeof responseText === 'string'
              ? responseText
              : JSON.stringify(responseText),
          );
          
          summary = parsedResponse.summary || responseText;
          keypoints = parsedResponse.keypoints || [];
          tags = parsedResponse.tags || [];
        } catch (parseError) {
          // If parsing fails, use the raw text as summary
          summary = typeof result.output === 'string'
            ? result.output
            : typeof result.output.content === 'string'
              ? result.output.content
              : JSON.stringify(result.output.content);
        }

        const currentTokens = state.metrics?.tokensUsed || 0;
        const newTokens = result.metrics?.tokensUsed || 0;

        return {
          ...state,
          generatedSummary: summary,
          keypoints: keypoints,
          tags: tags,
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
          'generate_final_summary',
        );
      }
    };
  }

  /**
   * Create node to store the results
   */
  private createStoreResultsNode() {
    return async (state: SummaryGenerationState) => {
      try {
        this.logger.info(`Storing results for document ${state.documentId}`);

        // Prepare a storage request for the summary
        const storageRequest = {
          documentId: state.documentId,
          userId: state.userId,
          summary: state.generatedSummary,
          keypoints: state.keypoints,
          tags: state.tags,
          contextType: ContextType.DOCUMENT,
          metadata: {
            title: state.title,
            contentType: state.contentType,
            contentLength: state.content.length,
            chunkCount: state.chunks.length,
            generationTimestamp: new Date().toISOString(),
          },
        };

        // Store the results - this would be implemented with actual storage in a production system
        this.logger.debug('Would store summary with request:', storageRequest);

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