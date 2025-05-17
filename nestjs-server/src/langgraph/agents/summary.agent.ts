import { Injectable } from '@nestjs/common';
import { BaseAgent, AgentConfig } from './base-agent';
import { LlmService } from '../llm/llm.service';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface MeetingSummary {
  title: string;
  executive_summary: string;
  key_points: string[];
  decisions: Array<{
    description: string;
    rationale?: string;
    stakeholders?: string[];
  }>;
  next_steps: string[];
  meeting_effectiveness?: number; // 1-10 scale
  follow_up_items?: string[];
}

@Injectable()
export class SummaryAgent extends BaseAgent {
  constructor(protected readonly llmService: LlmService) {
    const config: AgentConfig = {
      name: 'SummaryAgent',
      systemPrompt:
        'You are a specialized agent for creating comprehensive yet concise summaries of meetings. Synthesize key discussions, decisions, action items, and insights from meeting transcripts.',
      llmOptions: {
        temperature: 0.4,
        model: 'gpt-4o',
      },
    };
    super(llmService, config);
  }

  /**
   * Generate a summary from a transcript and analysis data
   */
  async generateSummary(
    transcript: string,
    topics?: any[],
    actionItems?: any[],
    sentiment?: any,
  ): Promise<MeetingSummary> {
    const model = this.getChatModel();

    let prompt = `
    Generate a comprehensive summary of this meeting.
    
    Include:
    1. An appropriate title for the meeting
    2. A concise executive summary (2-3 sentences)
    3. Key points discussed
    4. Important decisions made
    5. Next steps
    6. Rate meeting effectiveness on a 1-10 scale
    7. Follow-up items or open questions

    Format the response as a JSON object with these properties.
    
    Transcript:
    ${transcript}
    `;

    // Add additional context if available
    if (topics && topics.length > 0) {
      prompt += `\nExtracted Topics:\n${JSON.stringify(topics, null, 2)}`;
    }

    if (actionItems && actionItems.length > 0) {
      prompt += `\nAction Items:\n${JSON.stringify(actionItems, null, 2)}`;
    }

    if (sentiment) {
      prompt += `\nSentiment Analysis:\n${JSON.stringify(sentiment, null, 2)}`;
    }

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
      return JSON.parse(jsonStr) as MeetingSummary;
    } catch (error) {
      this.logger.error(
        `Failed to parse summary from response: ${error.message}`,
      );
      return {
        title: 'Meeting Summary',
        executive_summary:
          'This is a placeholder summary due to parsing error.',
        key_points: ['Unable to parse summary details'],
        decisions: [],
        next_steps: [],
      };
    }
  }

  /**
   * Process a state object to generate a summary
   */
  async processState(state: any): Promise<any> {
    this.logger.debug('Processing state for summary generation');

    if (!state.transcript) {
      this.logger.warn('No transcript found in state');
      return state;
    }

    const summary = await this.generateSummary(
      state.transcript,
      state.topics,
      state.actionItems,
      state.sentiment,
    );

    return {
      ...state,
      summary,
    };
  }
}
