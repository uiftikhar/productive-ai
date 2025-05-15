import { Injectable, Logger } from '@nestjs/common';
import { BaseMessage } from '@langchain/core/messages';
import { StateGraph } from '@langchain/langgraph';
import { AgentFactory } from '../agents/agent.factory';
import { MeetingAnalysisState, MeetingAnalysisStateType } from './state/meeting-analysis-state';

// LangGraph constants
const START = '__start__';
const END = '__end__';

@Injectable()
export class GraphBuilderService {
  private readonly logger = new Logger(GraphBuilderService.name);

  constructor(private readonly agentFactory: AgentFactory) {}

  /**
   * Build a basic sequential meeting analysis graph
   */
  buildBasicMeetingAnalysisGraph() {
    this.logger.debug('Building basic meeting analysis graph');

    // Create state graph with the Annotation-based state
    const graph: any = new StateGraph(MeetingAnalysisState);

    // Add agent nodes
    this.addAgentNodes(graph);
    
    // Add sequential flow
    graph.addEdge('__start__', 'topic_extraction');
    graph.addEdge('topic_extraction', 'action_item_extraction');
    graph.addEdge('action_item_extraction', 'sentiment_analysis');
    graph.addEdge('sentiment_analysis', 'participation_analysis');
    graph.addEdge('participation_analysis', 'context_integration');
    graph.addEdge('context_integration', 'summary_generation');
    graph.addEdge('summary_generation', '__end__');

    // Compile and return the graph
    return graph.compile();
  }

  /**
   * Build an advanced meeting analysis graph with conditional branching
   */
  buildAdvancedMeetingAnalysisGraph() {
    this.logger.debug('Building advanced meeting analysis graph');

    // Create state graph with the Annotation-based state
    const graph = new StateGraph(MeetingAnalysisState);

    // Add agent nodes
    this.addAgentNodes(graph);
    
    // Add conditional edges
    this.addConditionalRoutingEdges(graph);

    // Compile and return the graph
    return graph.compile();
  }

  /**
   * Add all agent nodes to the graph
   */
  private addAgentNodes(graph: any): void {
    // Topic extraction node
    graph.addNode('topic_extraction', async (state: MeetingAnalysisStateType) => {
      try {
        this.logger.debug('Executing topic extraction node');
        const topicAgent = this.agentFactory.getTopicExtractionAgent();
        const topics = await topicAgent.extractTopics(state.transcript);
        
        return {
          topics,
          completed_steps: ['topic_extraction'],
          currentPhase: 'topic_extraction_completed',
        };
      } catch (error) {
        this.logger.error(`Topic extraction failed: ${error.message}`);
        return {
          errors: [{
            step: 'topic_extraction',
            error: error.message,
            timestamp: new Date().toISOString(),
          }],
        };
      }
    });

    // Action item extraction node
    graph.addNode('action_item_extraction', async (state: MeetingAnalysisStateType) => {
      try {
        this.logger.debug('Executing action item extraction node');
        const actionItemAgent = this.agentFactory.getActionItemAgent();
        const actionItems = await actionItemAgent.extractActionItems(state.transcript);
        
        return {
          actionItems,
          completed_steps: ['action_item_extraction'],
          currentPhase: 'action_item_extraction_completed',
        };
      } catch (error) {
        this.logger.error(`Action item extraction failed: ${error.message}`);
        return {
          errors: [{
            step: 'action_item_extraction',
            error: error.message,
            timestamp: new Date().toISOString(),
          }],
        };
      }
    });

    // Sentiment analysis node
    graph.addNode('sentiment_analysis', async (state: MeetingAnalysisStateType) => {
      try {
        this.logger.debug('Executing sentiment analysis node');
        const sentimentAgent = this.agentFactory.getSentimentAnalysisAgent();
        const sentiment = await sentimentAgent.analyzeSentiment(state.transcript);
        
        return {
          sentiment,
          completed_steps: ['sentiment_analysis'],
          currentPhase: 'sentiment_analysis_completed',
        };
      } catch (error) {
        this.logger.error(`Sentiment analysis failed: ${error.message}`);
        return {
          errors: [{
            step: 'sentiment_analysis',
            error: error.message,
            timestamp: new Date().toISOString(),
          }],
        };
      }
    });

    // Participation analysis node
    graph.addNode('participation_analysis', async (state: MeetingAnalysisStateType) => {
      try {
        this.logger.debug('Executing participation analysis node');
        const participationAgent = this.agentFactory.getParticipationAgent();
        const participation = await participationAgent.analyzeParticipation(state.transcript, state.topics);
        
        return {
          participation,
          completed_steps: ['participation_analysis'],
          currentPhase: 'participation_analysis_completed',
        };
      } catch (error) {
        this.logger.error(`Participation analysis failed: ${error.message}`);
        return {
          errors: [{
            step: 'participation_analysis',
            error: error.message,
            timestamp: new Date().toISOString(),
          }],
        };
      }
    });

    // Context integration node
    graph.addNode('context_integration', async (state: MeetingAnalysisStateType) => {
      try {
        this.logger.debug('Executing context integration node');
        
        // Skip if no context is available
        if (!state.retrievedContext || state.retrievedContext.length === 0) {
          this.logger.warn('No context available for integration, skipping');
          return {
            completed_steps: ['context_integration'],
            currentPhase: 'context_integration_skipped',
          };
        }
        
        const contextAgent = this.agentFactory.getContextIntegrationAgent();
        const enrichedContext = await contextAgent.integrateContext(
          state.transcript,
          state.topics,
          state.retrievedContext
        );
        
        return {
          enrichedContext,
          completed_steps: ['context_integration'],
          currentPhase: 'context_integration_completed',
        };
      } catch (error) {
        this.logger.error(`Context integration failed: ${error.message}`);
        return {
          errors: [{
            step: 'context_integration',
            error: error.message,
            timestamp: new Date().toISOString(),
          }],
        };
      }
    });

    // Summary generation node
    graph.addNode('summary_generation', async (state: MeetingAnalysisStateType) => {
      try {
        this.logger.debug('Executing summary generation node');
        const summaryAgent = this.agentFactory.getSummaryAgent();
        const summary = await summaryAgent.generateSummary(
          state.transcript,
          state.topics,
          state.actionItems,
          state.sentiment
        );
        
        return {
          summary,
          completed_steps: ['summary_generation'],
          currentPhase: 'completed',
        };
      } catch (error) {
        this.logger.error(`Summary generation failed: ${error.message}`);
        return {
          errors: [{
            step: 'summary_generation',
            error: error.message,
            timestamp: new Date().toISOString(),
          }],
        };
      }
    });

    // Error recovery node
    graph.addNode('error_recovery', async (state: MeetingAnalysisStateType) => {
      this.logger.debug('Executing error recovery node');
      this.logger.warn(`Errors encountered: ${JSON.stringify(state.errors)}`);
      
      // Determine next step - skip the failed step
      const remainingSteps = state.remaining_steps.filter(
        step => !state.completed_steps.includes(step) && !state.errors.some(e => e.step === step)
      );
      
      return {
        remaining_steps: remainingSteps,
        next_step: remainingSteps.length > 0 ? remainingSteps[0] : 'complete',
        currentPhase: 'error_recovery',
      };
    });
  }

  /**
   * Add conditional routing edges to the graph
   */
  private addConditionalRoutingEdges(graph: any): void {
    // Start with topic extraction
    graph.addEdge('__start__', 'topic_extraction');
    
    // Add conditional edge from topic extraction
    graph.addConditionalEdges(
      'topic_extraction',
      (state: MeetingAnalysisStateType) => {
        if (state.errors && state.errors.some(e => e.step === 'topic_extraction')) {
          return 'error';
        }
        if (!state.topics || state.topics.length === 0) {
          return 'no_topics';
        }
        return 'topics_found';
      },
      {
        'error': 'error_recovery',
        'no_topics': 'summary_generation',
        'topics_found': 'action_item_extraction',
      }
    );
    
    // Add conditional edge from action item extraction
    graph.addConditionalEdges(
      'action_item_extraction',
      (state: MeetingAnalysisStateType) => {
        if (state.errors && state.errors.some(e => e.step === 'action_item_extraction')) {
          return 'error';
        }
        return 'continue';
      },
      {
        'error': 'error_recovery',
        'continue': 'sentiment_analysis',
      }
    );
    
    // Add conditional edge from sentiment analysis
    graph.addConditionalEdges(
      'sentiment_analysis',
      (state: MeetingAnalysisStateType) => {
        if (state.errors && state.errors.some(e => e.step === 'sentiment_analysis')) {
          return 'error';
        }
        return 'continue';
      },
      {
        'error': 'error_recovery',
        'continue': 'participation_analysis',
      }
    );
    
    // Add conditional edge from participation analysis
    graph.addConditionalEdges(
      'participation_analysis',
      (state: MeetingAnalysisStateType) => {
        if (state.errors && state.errors.some(e => e.step === 'participation_analysis')) {
          return 'error';
        }
        if (!state.retrievedContext || state.retrievedContext.length === 0) {
          return 'no_context';
        }
        return 'has_context';
      },
      {
        'error': 'error_recovery',
        'no_context': 'summary_generation',
        'has_context': 'context_integration',
      }
    );
    
    // Add conditional edge from context integration
    graph.addConditionalEdges(
      'context_integration',
      (state: MeetingAnalysisStateType) => {
        if (state.errors && state.errors.some(e => e.step === 'context_integration')) {
          return 'error';
        }
        return 'continue';
      },
      {
        'error': 'error_recovery',
        'continue': 'summary_generation',
      }
    );
    
    // Add conditional edge from summary generation
    graph.addConditionalEdges(
      'summary_generation',
      (state: MeetingAnalysisStateType) => {
        if (state.errors && state.errors.some(e => e.step === 'summary_generation')) {
          return 'error';
        }
        return 'complete';
      },
      {
        'error': 'error_recovery',
        'complete': '__end__',
      }
    );
    
    // Add conditional edge from error recovery
    graph.addConditionalEdges(
      'error_recovery',
      (state: MeetingAnalysisStateType) => {
        if (!state.remaining_steps || state.remaining_steps.length === 0) {
          return 'end';
        }
        return state.next_step ?? 'end';
      },
      {
        'end': '__end__',
        'topic_extraction': 'topic_extraction',
        'action_item_extraction': 'action_item_extraction',
        'sentiment_analysis': 'sentiment_analysis',
        'participation_analysis': 'participation_analysis',
        'context_integration': 'context_integration',
        'summary_generation': 'summary_generation',
        'complete': '__end__',
      }
    );
  }
} 