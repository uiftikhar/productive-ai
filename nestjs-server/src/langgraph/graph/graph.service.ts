import { Injectable, Logger } from '@nestjs/common';
import { StateGraph } from '@langchain/langgraph';
import { StateService } from '../state/state.service';
import { AgentFactory } from '../agents/agent.factory';
import { Topic } from '../agents/topic-extraction.agent';
import { ActionItem } from '../agents/action-item.agent';
import { SentimentAnalysis } from '../agents/sentiment-analysis.agent';
import { MeetingSummary } from '../agents/summary.agent';
import {
  MeetingAnalysisState,
  MeetingAnalysisStateType,
  createInitialState,
} from './state/meeting-analysis-state';
import { AgentEventService } from '../visualization/agent-event.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Result interface for meeting analysis
 */
interface MeetingAnalysisResult {
  transcript: string;
  topics: Topic[];
  actionItems: ActionItem[];
  sentiment: SentimentAnalysis | null;
  summary: MeetingSummary | null;
  errors: Array<{
    step: string;
    error: string;
    timestamp: string;
  }>;
  currentPhase: string;
}

// LangGraph constants
const START = '__start__';
const END = '__end__';

/**
 * Service for creating and managing LangGraph StateGraphs
 */
@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);

  constructor(
    private readonly stateService: StateService,
    private readonly agentFactory: AgentFactory,
    private readonly agentEventService: AgentEventService,
  ) {}

  /**
   * Create a new graph for meeting analysis using the LangGraph StateGraph
   */
  async analyzeMeeting(transcript: string, sessionId?: string): Promise<MeetingAnalysisResult> {
    // Use provided sessionId or create a new one
    const graphSessionId = sessionId || uuidv4();
    this.logger.debug(`Creating and running meeting analysis graph for session ${graphSessionId}`);

    // Create a supervisor agent ID that will be the parent of all other agents
    const supervisorId = `supervisor-${uuidv4()}`;

    // Emit supervisor agent started event
    this.agentEventService.emitAgentEvent('started', {
      agentId: supervisorId,
      agentType: 'SupervisorAgent',
      sessionId: graphSessionId,
      timestamp: Date.now(),
      input: { transcript: transcript.substring(0, 100) + '...' }
    });

    // Create the StateGraph with the defined state structure
    const graph: any = new StateGraph(MeetingAnalysisState);

    // Add agent nodes to the graph
    this.addAgentNodes(graph, graphSessionId, supervisorId);

    // Add sequential flow edges
    this.addSequentialEdges(graph);

    // Compile the graph
    const compiledGraph = graph.compile();

    // Create initial state
    const initialState = {
      ...createInitialState(transcript),
      sessionId: graphSessionId
    };

    try {
      // Run the graph
      this.logger.debug(`Executing meeting analysis graph for session ${graphSessionId}`);
      const finalState = await compiledGraph.invoke(initialState);

      // Save result
      await this.stateService.saveState(
        graphSessionId,
        'meeting_analysis',
        finalState,
      );

      // Emit supervisor completed event
      this.agentEventService.emitAgentEvent('completed', {
        agentId: supervisorId,
        agentType: 'SupervisorAgent',
        sessionId: graphSessionId,
        timestamp: Date.now(),
        duration: Date.now() - (finalState.metadata?.startTime || Date.now()),
        output: { 
          topicCount: finalState.topics?.length || 0,
          actionItemCount: finalState.actionItems?.length || 0
        }
      });

      // Convert to result format
      return this.stateToResult(finalState);
    } catch (error) {
      this.logger.error(
        `Graph execution failed: ${error.message}`,
        error.stack,
      );

      // Emit supervisor error event
      this.agentEventService.emitAgentEvent('error', {
        agentId: supervisorId,
        agentType: 'SupervisorAgent',
        sessionId: graphSessionId,
        timestamp: Date.now(),
        error: error.message,
        stack: error.stack
      });

      // Return error result
      return {
        transcript,
        topics: [],
        actionItems: [],
        sentiment: null,
        summary: null,
        errors: [
          {
            step: 'graph_execution',
            error: error.message,
            timestamp: new Date().toISOString(),
          },
        ],
        currentPhase: 'failed',
      };
    }
  }

  /**
   * Add agent nodes to the graph
   */
  private addAgentNodes(graph: any, sessionId: string, supervisorId: string): void {
    // Topic extraction node
    graph.addNode(
      'topic_extraction',
      async (state: MeetingAnalysisStateType) => {
        const agentId = `topic-extraction-${uuidv4()}`;
        const startTime = Date.now();
        
        // Emit agent started event
        this.agentEventService.emitAgentEvent('started', {
          agentId,
          agentType: 'TopicExtractionAgent',
          sessionId,
          parentAgentId: supervisorId,
          timestamp: startTime,
          input: { transcriptLength: state.transcript.length }
        });
        
        try {
          this.logger.debug('Executing topic extraction node');
          const topicAgent = this.agentFactory.getTopicExtractionAgent();
          const topics = await topicAgent.extractTopics(state.transcript);

          // Emit agent completed event
          this.agentEventService.emitAgentEvent('completed', {
            agentId,
            agentType: 'TopicExtractionAgent',
            sessionId,
            parentAgentId: supervisorId,
            timestamp: Date.now(),
            duration: Date.now() - startTime,
            output: { topicCount: topics.length }
          });

          return {
            topics,
            completed_steps: ['topic_extraction'],
            currentPhase: 'topic_extraction_completed',
          };
        } catch (error) {
          this.logger.error(`Topic extraction failed: ${error.message}`);
          
          // Emit agent error event
          this.agentEventService.emitAgentEvent('error', {
            agentId,
            agentType: 'TopicExtractionAgent',
            sessionId,
            parentAgentId: supervisorId,
            timestamp: Date.now(),
            error: error.message
          });
          
          return {
            errors: [
              {
                step: 'topic_extraction',
                error: error.message,
                timestamp: new Date().toISOString(),
              },
            ],
          };
        }
      },
    );

    // Action item extraction node
    graph.addNode(
      'action_item_extraction',
      async (state: MeetingAnalysisStateType) => {
        const agentId = `action-item-${uuidv4()}`;
        const startTime = Date.now();
        
        // Emit agent started event
        this.agentEventService.emitAgentEvent('started', {
          agentId,
          agentType: 'ActionItemAgent',
          sessionId,
          parentAgentId: supervisorId,
          timestamp: startTime,
          input: { transcriptLength: state.transcript.length }
        });
        
        try {
          this.logger.debug('Executing action item extraction node');
          const actionItemAgent = this.agentFactory.getActionItemAgent();
          const actionItems = await actionItemAgent.extractActionItems(
            state.transcript,
          );

          // Emit LLM service event
          this.agentEventService.emitServiceEvent(
            'llm',
            'extract_action_items',
            {
              agentId,
              agentType: 'ActionItemAgent',
              sessionId,
              timestamp: Date.now(),
            },
            { prompt: 'Extract action items from transcript' },
            { duration: Date.now() - startTime }
          );

          // Emit agent completed event
          this.agentEventService.emitAgentEvent('completed', {
            agentId,
            agentType: 'ActionItemAgent',
            sessionId,
            parentAgentId: supervisorId,
            timestamp: Date.now(),
            duration: Date.now() - startTime,
            output: { actionItemCount: actionItems.length }
          });

          return {
            actionItems,
            completed_steps: ['action_item_extraction'],
            currentPhase: 'action_item_extraction_completed',
          };
        } catch (error) {
          this.logger.error(`Action item extraction failed: ${error.message}`);
          
          // Emit agent error event
          this.agentEventService.emitAgentEvent('error', {
            agentId,
            agentType: 'ActionItemAgent',
            sessionId,
            parentAgentId: supervisorId,
            timestamp: Date.now(),
            error: error.message
          });
          
          return {
            errors: [
              {
                step: 'action_item_extraction',
                error: error.message,
                timestamp: new Date().toISOString(),
              },
            ],
          };
        }
      },
    );

    // Sentiment analysis node
    graph.addNode(
      'sentiment_analysis',
      async (state: MeetingAnalysisStateType) => {
        const agentId = `sentiment-${uuidv4()}`;
        const startTime = Date.now();
        
        // Emit agent started event
        this.agentEventService.emitAgentEvent('started', {
          agentId,
          agentType: 'SentimentAnalysisAgent',
          sessionId,
          parentAgentId: supervisorId,
          timestamp: startTime,
          input: { transcriptLength: state.transcript.length }
        });
        
        try {
          this.logger.debug('Executing sentiment analysis node');
          const sentimentAgent = this.agentFactory.getSentimentAnalysisAgent();
          const sentiment = await sentimentAgent.analyzeSentiment(
            state.transcript,
          );

          // Emit agent completed event
          this.agentEventService.emitAgentEvent('completed', {
            agentId,
            agentType: 'SentimentAnalysisAgent',
            sessionId,
            parentAgentId: supervisorId,
            timestamp: Date.now(),
            duration: Date.now() - startTime,
            output: { sentimentType: sentiment.overall || 'neutral' }
          });

          return {
            sentiment,
            completed_steps: ['sentiment_analysis'],
            currentPhase: 'sentiment_analysis_completed',
          };
        } catch (error) {
          this.logger.error(`Sentiment analysis failed: ${error.message}`);
          
          // Emit agent error event
          this.agentEventService.emitAgentEvent('error', {
            agentId,
            agentType: 'SentimentAnalysisAgent',
            sessionId,
            parentAgentId: supervisorId,
            timestamp: Date.now(),
            error: error.message
          });
          
          return {
            errors: [
              {
                step: 'sentiment_analysis',
                error: error.message,
                timestamp: new Date().toISOString(),
              },
            ],
          };
        }
      },
    );

    // Summary generation node
    graph.addNode(
      'summary_generation',
      async (state: MeetingAnalysisStateType) => {
        const agentId = `summary-${uuidv4()}`;
        const startTime = Date.now();
        
        // Emit agent started event
        this.agentEventService.emitAgentEvent('started', {
          agentId,
          agentType: 'SummaryAgent',
          sessionId,
          parentAgentId: supervisorId,
          timestamp: startTime,
          input: { 
            transcriptLength: state.transcript.length,
            topicsCount: state.topics?.length || 0,
            actionItemsCount: state.actionItems?.length || 0
          }
        });
        
        try {
          this.logger.debug('Executing summary generation node');
          const summaryAgent = this.agentFactory.getSummaryAgent();
          const summary = await summaryAgent.generateSummary(
            state.transcript,
            state.topics,
            state.actionItems,
            state.sentiment,
          );

          // Emit agent completed event
          this.agentEventService.emitAgentEvent('completed', {
            agentId,
            agentType: 'SummaryAgent',
            sessionId,
            parentAgentId: supervisorId,
            timestamp: Date.now(),
            duration: Date.now() - startTime,
            output: { 
              summaryLength: summary.summary.length,
              decisionsCount: summary.decisions?.length || 0
            }
          });

          return {
            summary,
            completed_steps: ['summary_generation'],
            currentPhase: 'completed',
          };
        } catch (error) {
          this.logger.error(`Summary generation failed: ${error.message}`);
          
          // Emit agent error event
          this.agentEventService.emitAgentEvent('error', {
            agentId,
            agentType: 'SummaryAgent',
            sessionId,
            parentAgentId: supervisorId,
            timestamp: Date.now(),
            error: error.message
          });
          
          return {
            errors: [
              {
                step: 'summary_generation',
                error: error.message,
                timestamp: new Date().toISOString(),
              },
            ],
          };
        }
      },
    );
  }

  /**
   * Add sequential flow edges to the graph
   */
  private addSequentialEdges(graph: any): void {
    graph.addEdge(START, 'topic_extraction');
    graph.addEdge('topic_extraction', 'action_item_extraction');
    graph.addEdge('action_item_extraction', 'sentiment_analysis');
    graph.addEdge('sentiment_analysis', 'summary_generation');
    graph.addEdge('summary_generation', END);
  }

  /**
   * Convert state to result format
   */
  private stateToResult(
    state: MeetingAnalysisStateType,
  ): MeetingAnalysisResult {
    return {
      transcript: state.transcript,
      topics: state.topics || [],
      actionItems: state.actionItems || [],
      sentiment: state.sentiment || null,
      summary: state.summary || null,
      errors:
        state.errors?.map((err) => ({
          step: err.step,
          error: err.error,
          timestamp: err.timestamp,
        })) || [],
      currentPhase: state.currentPhase || 'completed',
    };
  }
}
