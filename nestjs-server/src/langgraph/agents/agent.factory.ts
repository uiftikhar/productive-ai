import { Injectable } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { BaseAgent, AgentConfig } from './base-agent';

/**
 * Factory for creating different types of agents
 */
@Injectable()
export class AgentFactory {
  constructor(private readonly llmService: LlmService) {}

  /**
   * Create a base agent instance
   */
  createBaseAgent(config: AgentConfig): BaseAgent {
    return new BaseAgent(this.llmService, config);
  }

  /**
   * Create a specialized agent for topic extraction
   */
  createTopicExtractionAgent(customConfig?: Partial<AgentConfig>): BaseAgent {
    const defaultConfig: AgentConfig = {
      name: 'TopicExtractor',
      systemPrompt: 'You are a specialized agent for extracting key topics from meeting transcripts. Identify main themes, discussions, and subject areas covered in the transcript.',
      llmOptions: {
        temperature: 0.3,
        model: 'gpt-4o',
      },
    };

    const config = { ...defaultConfig, ...customConfig };
    return this.createBaseAgent(config);
  }

  /**
   * Create a specialized agent for action item extraction
   */
  createActionItemAgent(customConfig?: Partial<AgentConfig>): BaseAgent {
    const defaultConfig: AgentConfig = {
      name: 'ActionItemExtractor',
      systemPrompt: 'You are a specialized agent for identifying action items from meeting transcripts. Extract tasks, responsibilities, deadlines, and assignees from the discussion.',
      llmOptions: {
        temperature: 0.2,
        model: 'gpt-4o',
      },
    };

    const config = { ...defaultConfig, ...customConfig };
    return this.createBaseAgent(config);
  }

  /**
   * Create a specialized agent for sentiment analysis
   */
  createSentimentAnalysisAgent(customConfig?: Partial<AgentConfig>): BaseAgent {
    const defaultConfig: AgentConfig = {
      name: 'SentimentAnalyzer',
      systemPrompt: 'You are a specialized agent for analyzing sentiment in meeting transcripts. Identify emotions, tone, and overall sentiment of participants throughout the discussion.',
      llmOptions: {
        temperature: 0.3,
        model: 'gpt-4o',
      },
    };

    const config = { ...defaultConfig, ...customConfig };
    return this.createBaseAgent(config);
  }

  /**
   * Create a meeting summary agent
   */
  createSummaryAgent(customConfig?: Partial<AgentConfig>): BaseAgent {
    const defaultConfig: AgentConfig = {
      name: 'SummaryAgent',
      systemPrompt: 'You are a specialized agent for creating concise summaries of meetings. Synthesize the key points, decisions, action items, and overall purpose of the meeting.',
      llmOptions: {
        temperature: 0.4,
        model: 'gpt-4o',
      },
    };

    const config = { ...defaultConfig, ...customConfig };
    return this.createBaseAgent(config);
  }

  /**
   * Create a coordinator/supervisor agent
   */
  createCoordinatorAgent(customConfig?: Partial<AgentConfig>): BaseAgent {
    const defaultConfig: AgentConfig = {
      name: 'Coordinator',
      systemPrompt: 'You are a coordination agent responsible for orchestrating the analysis of meeting transcripts. You delegate tasks to specialized agents and synthesize their results.',
      llmOptions: {
        temperature: 0.4,
        model: 'gpt-4o',
      },
    };

    const config = { ...defaultConfig, ...customConfig };
    return this.createBaseAgent(config);
  }
} 