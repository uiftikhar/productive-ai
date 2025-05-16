import { Injectable } from '@nestjs/common';
import { BaseAgent, AgentConfig } from './base-agent';
import { LlmService } from '../llm/llm.service';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface RetrievedContext {
  source: string;
  content: string;
  metadata?: Record<string, any>;
  relevance_score?: number;
}

export interface EnrichedContext {
  original_topics: any[];
  enriched_topics: any[];
  related_meetings?: Array<{
    meeting_id: string;
    title: string;
    date: string;
    relevance: number;
    relevant_topics: string[];
  }>;
  background_knowledge?: Array<{
    topic: string;
    context: string;
    source?: string;
  }>;
  historical_context?: string;
  domain_specific_insights?: Array<{
    topic: string;
    insight: string;
    confidence: number;
  }>;
}

@Injectable()
export class ContextIntegrationAgent extends BaseAgent {
  constructor(protected readonly llmService: LlmService) {
    const config: AgentConfig = {
      name: 'ContextIntegrationAgent',
      systemPrompt:
        'You are a specialized agent for integrating external context into meeting analysis. Connect current discussions with historical information, domain knowledge, and past meetings to provide deeper insights.',
      llmOptions: {
        temperature: 0.3,
        model: 'gpt-4o',
      },
    };
    super(llmService, config);
  }

  /**
   * Integrate retrieved context with the current meeting state
   */
  async integrateContext(
    transcript: string,
    topics: any[],
    retrievedContext: RetrievedContext[],
  ): Promise<EnrichedContext> {
    const model = this.getChatModel();

    const prompt = `
    You'll be given a meeting transcript, the topics extracted from it, and additional contextual information.
    
    Your task is to integrate this context with the meeting topics to provide deeper insights.
    
    Please:
    1. Enhance the existing topics with relevant context
    2. Connect to related meetings if mentioned in the context
    3. Add background knowledge and domain-specific insights
    4. Provide historical context when applicable
    
    Format the response as a JSON object with these properties:
    - original_topics: the input topics
    - enriched_topics: enhanced topics with context
    - related_meetings: related meetings found in context
    - background_knowledge: relevant domain knowledge
    - historical_context: historical information relevant to discussions
    - domain_specific_insights: specialized insights based on the domain
    
    Meeting Transcript:
    ${transcript}
    
    Extracted Topics:
    ${JSON.stringify(topics, null, 2)}
    
    Retrieved Context:
    ${JSON.stringify(retrievedContext, null, 2)}
    `;

    const messages = [
      new SystemMessage(this.systemPrompt),
      new HumanMessage(prompt),
    ];

    const response = await model.invoke(messages);

    try {
      // Extract JSON from the response
      const content = response.content.toString();
      const jsonMatch =
        content.match(/```json\n([\s\S]*?)\n```/) ||
        content.match(/```\n([\s\S]*?)\n```/) ||
        content.match(/(\{[\s\S]*\})/);

      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      return JSON.parse(jsonStr) as EnrichedContext;
    } catch (error) {
      this.logger.error(
        `Failed to parse context integration from response: ${error.message}`,
      );
      return {
        original_topics: topics,
        enriched_topics: topics,
      };
    }
  }

  /**
   * Process a state object for context integration
   */
  async processState(state: any): Promise<any> {
    this.logger.debug('Processing state for context integration');

    if (!state.transcript || !state.topics || !state.retrievedContext) {
      this.logger.warn('Missing required data for context integration');
      return state;
    }

    const enrichedContext = await this.integrateContext(
      state.transcript,
      state.topics,
      state.retrievedContext,
    );

    return {
      ...state,
      enrichedContext,
    };
  }
}
