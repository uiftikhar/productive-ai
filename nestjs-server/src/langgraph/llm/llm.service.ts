import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export type LLMProvider = 'openai' | 'anthropic';

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  provider?: LLMProvider;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly defaultModel: string;
  private readonly defaultProvider: LLMProvider;
  private readonly openaiApiKey: string;
  private readonly anthropicApiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.defaultModel =
      this.configService.get<string>('llm.defaultModel') || 'gpt-4o';
    this.defaultProvider = (this.configService.get<string>('llm.provider') ||
      'openai') as LLMProvider;
    this.openaiApiKey = this.configService.get<string>('llm.apiKey') || '';
    this.anthropicApiKey =
      this.configService.get<string>('llm.anthropicApiKey') || '';
  }

  /**
   * Get a chat model instance based on the provided options
   */
  getChatModel(options: LLMOptions = {}): BaseChatModel {
    const provider = options.provider || this.defaultProvider;

    switch (provider) {
      case 'openai':
        return this.getOpenAIModel(options);
      case 'anthropic':
        // Use type assertion as BaseChatModel for compatibility
        // TODO CHeck if this type asserion is necessary or should strong ttype the getAnthropicmodel properly
        return this.getAnthropicModel(options) as unknown as BaseChatModel;
      default:
        this.logger.warn(
          `Unknown provider: ${provider}, falling back to OpenAI`,
        );
        return this.getOpenAIModel(options);
    }
  }

  /**
   * Get an OpenAI chat model instance
   */
  private getOpenAIModel(options: LLMOptions): ChatOpenAI {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    return new ChatOpenAI({
      openAIApiKey: this.openaiApiKey,
      modelName: options.model || this.defaultModel,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens,
    });
  }

  /**
   * Get an Anthropic chat model instance
   */
  private getAnthropicModel(options: LLMOptions): ChatAnthropic {
    if (!this.anthropicApiKey) {
      throw new Error('Anthropic API key is not configured');
    }

    return new ChatAnthropic({
      anthropicApiKey: this.anthropicApiKey,
      modelName: options.model || 'claude-3-opus-20240229',
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens,
    });
  }
}
