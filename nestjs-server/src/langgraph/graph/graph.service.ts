import { Injectable, Logger } from '@nestjs/common';
import { StateService } from '../state/state.service';
import { AgentFactory } from '../agents/agent.factory';
import { Topic } from '../agents/topic-extraction.agent';
import { ActionItem } from '../agents/action-item.agent';
import { SentimentAnalysis } from '../agents/sentiment-analysis.agent';
import { MeetingSummary } from '../agents/summary.agent';

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
    message: string;
    timestamp: string;
  }>;
  currentPhase: string;
}

/**
 * Service for creating and managing LangGraph StateGraphs
 */
@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);

  constructor(
    private readonly stateService: StateService,
    private readonly agentFactory: AgentFactory,
  ) {}

  /**
   * Create a new graph for meeting analysis
   * Instead of using StateGraph directly, we'll use the agents directly in a workflow pattern
   */
  async analyzeMeeting(transcript: string): Promise<MeetingAnalysisResult> {
    this.logger.debug('Running meeting analysis workflow');
    
    // Initialize result object
    const result: MeetingAnalysisResult = {
      transcript,
      topics: [],
      actionItems: [],
      sentiment: null,
      summary: null,
      errors: [],
      currentPhase: 'initialization',
    };
    
    // Step 1: Extract topics
    try {
      result.currentPhase = 'topic_extraction';
      const topicAgent = this.agentFactory.getTopicExtractionAgent();
      result.topics = await topicAgent.extractTopics(transcript);
    } catch (error) {
      this.logger.error(`Topic extraction failed: ${error.message}`);
      result.errors.push({
        step: 'topic_extraction',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    // Step 2: Extract action items
    try {
      result.currentPhase = 'action_item_extraction';
      const actionItemAgent = this.agentFactory.getActionItemAgent();
      result.actionItems = await actionItemAgent.extractActionItems(transcript);
    } catch (error) {
      this.logger.error(`Action item extraction failed: ${error.message}`);
      result.errors.push({
        step: 'action_item_extraction',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    // Step 3: Analyze sentiment
    try {
      result.currentPhase = 'sentiment_analysis';
      const sentimentAgent = this.agentFactory.getSentimentAnalysisAgent();
      result.sentiment = await sentimentAgent.analyzeSentiment(transcript);
    } catch (error) {
      this.logger.error(`Sentiment analysis failed: ${error.message}`);
      result.errors.push({
        step: 'sentiment_analysis',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    // Step 4: Generate summary
    try {
      result.currentPhase = 'summary_generation';
      const summaryAgent = this.agentFactory.getSummaryAgent();
      result.summary = await summaryAgent.generateSummary(
        transcript,
        result.topics,
        result.actionItems,
        result.sentiment
      );
    } catch (error) {
      this.logger.error(`Summary generation failed: ${error.message}`);
      result.errors.push({
        step: 'summary_generation',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
    
    // Set final phase
    result.currentPhase = 'completed';
    
    // Save result if needed
    await this.stateService.saveState(
      'latest', 
      'meeting_analysis', 
      result
    );
    
    return result;
  }
} 