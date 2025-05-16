import { Injectable } from '@nestjs/common';
import { BaseAgent, AgentConfig } from './base-agent';
import { LlmService } from '../llm/llm.service';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface SentimentAnalysis {
  overall: 'positive' | 'negative' | 'neutral' | 'mixed';
  score: number; // -1 to 1 scale
  segments: Array<{
    text: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    speaker?: string;
    timestamp?: string;
  }>;
  keyEmotions: string[];
  toneShifts: Array<{
    from: string;
    to: string;
    approximate_time?: string;
    trigger?: string;
  }>;
}

@Injectable()
export class SentimentAnalysisAgent extends BaseAgent {
  constructor(protected readonly llmService: LlmService) {
    const config: AgentConfig = {
      name: 'SentimentAnalyzer',
      systemPrompt:
        'You are a specialized agent for analyzing sentiment in meeting transcripts. Identify emotions, tone, and overall sentiment of participants throughout the discussion.',
      llmOptions: {
        temperature: 0.3,
        model: 'gpt-4o',
      },
    };
    super(llmService, config);
  }

  /**
   * Analyze sentiment in a transcript
   */
  async analyzeSentiment(transcript: string): Promise<SentimentAnalysis> {
    const model = this.getChatModel();

    const prompt = `
    Analyze the sentiment in this meeting transcript.
    Please provide:
    
    1. Overall sentiment (positive, negative, neutral, or mixed)
    2. A sentiment score from -1 (very negative) to 1 (very positive)
    3. Key segments with their individual sentiment (include speaker and timestamp if available)
    4. Key emotions detected throughout the meeting
    5. Any significant tone shifts during the conversation
    
    Format the response as a JSON object with these properties.

    Transcript:
    ${transcript}
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
      return JSON.parse(jsonStr) as SentimentAnalysis;
    } catch (error) {
      this.logger.error(
        `Failed to parse sentiment analysis from response: ${error.message}`,
      );
      return {
        overall: 'neutral',
        score: 0,
        segments: [],
        keyEmotions: [],
        toneShifts: [],
      };
    }
  }

  /**
   * Process a state object for sentiment analysis
   */
  async processState(state: any): Promise<any> {
    this.logger.debug('Processing state for sentiment analysis');

    if (!state.transcript) {
      this.logger.warn('No transcript found in state');
      return state;
    }

    const sentiment = await this.analyzeSentiment(state.transcript);

    return {
      ...state,
      sentiment,
    };
  }
}
