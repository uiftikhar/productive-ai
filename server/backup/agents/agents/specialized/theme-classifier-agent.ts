/**
 * @deprecated This module is deprecated and will be removed in a future version.
 * Use the new agentic meeting analysis system in /langgraph/agentic-meeting-analysis instead.
 */

import { BaseAgent } from '../base/base-agent';
import {
  AgentRequest,
  AgentResponse,
  AgentCapability,
} from '../interfaces/base-agent.interface';
import { OpenAIConnector } from '../integrations/openai-connector';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Classification result interface for a themed transcript
 */
export interface ThemeClassificationResult {
  /** Main theme of the transcript */
  mainTheme: string;
  /** Confidence score for the main theme (0-1) */
  confidence: number;
  /** List of subthemes identified in the transcript */
  subThemes: Array<{
    name: string;
    confidence: number;
  }>;
  /** Key topics related to the themes */
  relatedTopics: string[];
  /** ID of the transcript that was classified */
  transcriptId: string;
}

/**
 * Agent specialized in classifying themes, topics, and sentiment in text data.
 * Can analyze meeting transcripts, conversations, or any text-based content.
 */
export class ThemeClassifierAgent extends BaseAgent {
  private openAIConnector: OpenAIConnector;
  private themeDefinitions: Map<string, string> = new Map();

  constructor(
    openAIConnector: OpenAIConnector,
    options: {
      logger?: Logger;
      id?: string;
      predefinedThemes?: Record<string, string>;
    } = {},
  ) {
    super(
      'Theme Classifier Agent',
      'Classifies themes, topics, and sentiment in text data',
      {
        logger: options.logger,
        id: options.id || 'theme-classifier-agent',
      },
    );

    this.openAIConnector = openAIConnector;

    // Initialize predefined themes if provided
    if (options.predefinedThemes) {
      Object.entries(options.predefinedThemes).forEach(
        ([theme, definition]) => {
          this.themeDefinitions.set(theme, definition);
        },
      );
    }

    this.registerCapabilities();
  }

  /**
   * Register the agent's capabilities
   */
  private registerCapabilities(): void {
    // Classify themes capability
    this.registerCapability({
      name: 'classify-themes',
      description:
        'Analyze text to identify and classify themes, topics, and sentiment',
      parameters: {
        text: 'Text content to analyze',
        minConfidence:
          'Minimum confidence threshold for theme classification (0.0-1.0)',
      },
    });

    // Define new themes capability
    this.registerCapability({
      name: 'define-themes',
      description:
        'Define new themes with descriptions for future classification',
      parameters: {
        themes: 'Object mapping theme names to their definitions',
      },
    });

    // Extract key phrases with themes capability
    this.registerCapability({
      name: 'extract-themed-phrases',
      description: 'Extract key phrases from text and categorize them by theme',
      parameters: {
        text: 'Text content to analyze',
        maxPhrases: 'Maximum number of phrases to extract',
      },
    });

    // Analyze sentiment by theme capability
    this.registerCapability({
      name: 'analyze-sentiment-by-theme',
      description: 'Analyze sentiment for specific themes in the text',
      parameters: {
        text: 'Text content to analyze',
        themes: 'Array of themes to analyze sentiment for',
      },
    });
  }

  /**
   * Implementation of abstract execute method
   */
  public async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const capability = request.capability || 'classify-themes';

    if (!this.canHandle(capability)) {
      throw new Error(`Capability not supported: ${capability}`);
    }

    try {
      switch (capability) {
        case 'classify-themes':
          const text = request.parameters?.text as string;
          const minConfidence = parseFloat(
            (request.parameters?.minConfidence as string) || '0.6',
          );

          if (!text) {
            throw new Error('Text content is required');
          }

          const result = await this.classifyThemes(text, minConfidence);
          return {
            output: JSON.stringify(result),
            success: true,
            metrics: this.processMetrics(startTime),
          };

        case 'define-themes':
          const themes = request.parameters?.themes as Record<string, string>;

          if (!themes || typeof themes !== 'object') {
            throw new Error('Themes object is required');
          }

          const defineResult = this.defineThemes(themes);
          return {
            output: JSON.stringify(defineResult),
            success: true,
            metrics: this.processMetrics(startTime),
          };

        case 'extract-themed-phrases':
          const phraseText = request.parameters?.text as string;
          const maxPhrases = parseInt(
            (request.parameters?.maxPhrases as string) || '10',
          );

          if (!phraseText) {
            throw new Error('Text content is required');
          }

          const phrasesResult = await this.extractThemedPhrases(
            phraseText,
            maxPhrases,
          );
          return {
            output: JSON.stringify(phrasesResult),
            success: true,
            metrics: this.processMetrics(startTime),
          };

        case 'analyze-sentiment-by-theme':
          const sentimentText = request.parameters?.text as string;
          const themesToAnalyze = request.parameters?.themes as string[];

          if (!sentimentText) {
            throw new Error('Text content is required');
          }

          if (!themesToAnalyze || !Array.isArray(themesToAnalyze)) {
            throw new Error('Themes array is required');
          }

          const sentimentResult = await this.analyzeSentimentByTheme(
            sentimentText,
            themesToAnalyze,
          );
          return {
            output: JSON.stringify(sentimentResult),
            success: true,
            metrics: this.processMetrics(startTime),
          };

        default:
          throw new Error(`Unsupported capability: ${capability}`);
      }
    } catch (error: any) {
      this.logger.error(`Error in ThemeClassifierAgent: ${error.message}`);

      this.setState({
        errorCount: this.getState().errorCount + 1,
      });

      throw error;
    }
  }

  /**
   * Define new themes with descriptions for future classification
   * @param themes Object mapping theme names to their definitions
   * @returns Object with operation status and counts
   */
  public defineThemes(themes: Record<string, string>): {
    status: string;
    added: number;
    updated: number;
    themes: string[];
  } {
    let added = 0;
    let updated = 0;

    Object.entries(themes).forEach(([theme, definition]) => {
      if (this.themeDefinitions.has(theme)) {
        updated++;
      } else {
        added++;
      }

      this.themeDefinitions.set(theme, definition);
    });

    this.logger.info(
      `Defined ${added} new themes and updated ${updated} existing themes`,
    );

    return {
      status: 'success',
      added,
      updated,
      themes: Array.from(this.themeDefinitions.keys()),
    };
  }

  /**
   * Analyze text to identify and classify themes, topics, and sentiment
   * @param text Text content to analyze
   * @param minConfidence Minimum confidence threshold (0.0-1.0)
   * @returns Analysis with identified themes, confidence scores, and overall sentiment
   */
  async classifyThemes(
    text: string,
    minConfidence: number = 0.6,
  ): Promise<any> {
    this.logger.info('Beginning theme classification');

    try {
      // Create themes context for the prompt
      const themesContext = Array.from(this.themeDefinitions.entries())
        .map(([theme, definition]) => `"${theme}": "${definition}"`)
        .join(',\n');

      // Create a system prompt for theme classification
      const systemPrompt = `
        You are a Theme Classification Expert. Your task is to analyze text content and classify it 
        according to themes, topics, and overall sentiment.
        
        ${
          this.themeDefinitions.size > 0
            ? `Use the following predefined themes as a reference:
        {
          ${themesContext}
        }`
            : 'Identify themes organically from the content.'
        }
        
        Analyze the text and identify:
        1. Main themes present in the content
        2. Confidence score for each theme (0.0-1.0)
        3. Overall sentiment analysis
        4. Key topic breakdown
        
        Only include themes with a confidence score above ${minConfidence}.
        
        Format your response as a JSON object with the following structure:
        {
          "themes": [
            {"name": "Theme Name", "confidence": 0.85, "mentions": 12},
            ...
          ],
          "sentiment": {
            "overall": "positive/negative/neutral",
            "score": 0.75,
            "brief": "Brief explanation of sentiment detection"
          },
          "topics": ["Topic 1", "Topic 2", ...],
          "summary": "Brief thematic summary of the content"
        }
      `;

      // Generate response using OpenAI connector
      const response = await this.openAIConnector.generateChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        {
          responseFormat: { type: 'json_object' },
        },
      );

      // Parse the response
      const parsedResponse = this.parseJsonResponse(response || '{}');

      this.logger.info(
        `Successfully classified ${parsedResponse.themes?.length || 0} themes`,
      );
      return parsedResponse;
    } catch (error: any) {
      this.logger.error(`Error classifying themes: ${error.message}`);
      return {
        error: `Failed to classify themes: ${error.message}`,
        themes: [],
        sentiment: {
          overall: 'neutral',
          score: 0.5,
          brief: 'Error in analysis',
        },
        topics: [],
        summary: 'Error occurred during analysis',
      };
    }
  }

  /**
   * Extract key phrases from text and categorize them by theme
   * @param text Text content to analyze
   * @param maxPhrases Maximum number of phrases to extract
   * @returns Object with phrases categorized by theme
   */
  async extractThemedPhrases(
    text: string,
    maxPhrases: number = 10,
  ): Promise<any> {
    this.logger.info(`Extracting up to ${maxPhrases} themed phrases`);

    try {
      // Create themes context for the prompt
      const themesContext = Array.from(this.themeDefinitions.entries())
        .map(([theme, definition]) => `"${theme}": "${definition}"`)
        .join(',\n');

      // Create a system prompt for phrase extraction
      const systemPrompt = `
        You are a Themed Phrase Extraction Expert. Your task is to extract key phrases from text content 
        and categorize them by theme.
        
        ${
          this.themeDefinitions.size > 0
            ? `Use the following predefined themes as a reference:
        {
          ${themesContext}
        }`
            : 'Identify themes organically from the content.'
        }
        
        Extract up to ${maxPhrases} key phrases from the text and categorize each by theme.
        Each phrase should be a direct quote from the text that represents a significant point, insight, or opinion.
        
        Format your response as a JSON object with the following structure:
        {
          "themesByPhrase": [
            {
              "phrase": "Direct quote from the text",
              "themes": ["Theme1", "Theme2"],
              "significance": "Brief explanation of why this phrase is significant"
            },
            ...
          ],
          "phrasesByTheme": {
            "Theme1": ["Phrase1", "Phrase2", ...],
            "Theme2": ["Phrase3", "Phrase4", ...],
            ...
          }
        }
      `;

      // Generate response using OpenAI connector
      const response = await this.openAIConnector.generateChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        {
          responseFormat: { type: 'json_object' },
        },
      );

      // Parse the response
      const parsedResponse = this.parseJsonResponse(response);

      const phraseCount = parsedResponse.themesByPhrase?.length || 0;
      this.logger.info(`Successfully extracted ${phraseCount} themed phrases`);
      return parsedResponse;
    } catch (error: any) {
      this.logger.error(`Error extracting themed phrases: ${error.message}`);
      return {
        error: `Failed to extract themed phrases: ${error.message}`,
        themesByPhrase: [],
        phrasesByTheme: {},
      };
    }
  }

  /**
   * Analyze sentiment for specific themes in the text
   * @param text Text content to analyze
   * @param themes Array of themes to analyze sentiment for
   * @returns Sentiment analysis for each theme
   */
  async analyzeSentimentByTheme(text: string, themes: string[]): Promise<any> {
    this.logger.info(`Analyzing sentiment for ${themes.length} themes`);

    try {
      // Validate themes exist in definitions
      const validThemes = themes.filter((theme) => {
        if (
          !this.themeDefinitions.has(theme) &&
          this.themeDefinitions.size > 0
        ) {
          this.logger.warn(`Theme "${theme}" not found in predefined themes`);
          return false;
        }
        return true;
      });

      if (validThemes.length === 0 && this.themeDefinitions.size > 0) {
        throw new Error('None of the provided themes are defined');
      }

      // Create themes context for the prompt
      const themesContext =
        validThemes.length > 0 && this.themeDefinitions.size > 0
          ? validThemes.map(
              (theme) => `"${theme}": "${this.themeDefinitions.get(theme)}"`,
            )
          : themes.map((theme) => `"${theme}": "Content related to ${theme}"`);

      // Create a system prompt for sentiment analysis
      const systemPrompt = `
        You are a Thematic Sentiment Analysis Expert. Your task is to analyze the sentiment 
        surrounding specific themes in text content.
        
        Analyze the sentiment for the following themes:
        {
          ${themesContext.join(',\n')}
        }
        
        For each theme, determine:
        1. Overall sentiment (positive, negative, neutral)
        2. Sentiment score (0.0-1.0, where 0.0 is most negative, 1.0 is most positive)
        3. Key sentiment indicators (phrases or words that indicate the sentiment)
        4. Sentiment trends (if sentiment changes throughout the text)
        
        Format your response as a JSON object with the following structure:
        {
          "themeSentiments": {
            "Theme1": {
              "overall": "positive/negative/neutral",
              "score": 0.75,
              "indicators": ["positive phrase", "negative phrase", ...],
              "trend": "Description of how sentiment changes through the text"
            },
            ...
          },
          "analysis": "Brief overall analysis of sentiment across themes"
        }
      `;

      // Generate response using OpenAI connector
      const response = await this.openAIConnector.generateChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        {
          responseFormat: { type: 'json_object' },
        },
      );

      // Parse the response
      const parsedResponse = this.parseJsonResponse(response);

      const themeCount = Object.keys(
        parsedResponse.themeSentiments || {},
      ).length;
      this.logger.info(
        `Successfully analyzed sentiment for ${themeCount} themes`,
      );
      return parsedResponse;
    } catch (error: any) {
      this.logger.error(`Error analyzing sentiment by theme: ${error.message}`);
      return {
        error: `Failed to analyze sentiment by theme: ${error.message}`,
        themeSentiments: {},
        analysis: 'Error occurred during analysis',
      };
    }
  }

  /**
   * Parse JSON response with error handling
   * @param response String response from LLM
   * @returns Parsed JSON object
   */
  private parseJsonResponse(response: string): any {
    try {
      return JSON.parse(response);
    } catch (error: any) {
      this.logger.error(`Error parsing JSON response: ${error.message}`);
      return {
        error: `Failed to parse response: ${error.message}`,
        rawResponse: response,
      };
    }
  }

  /**
   * Get all defined themes
   * @returns Map of themes and their definitions
   */
  public getDefinedThemes(): Map<string, string> {
    return new Map(this.themeDefinitions);
  }

  /**
   * Clean up resources used by the agent
   */
  public async terminate(): Promise<void> {
    // Implement any cleanup logic here
    this.logger.info(`Terminating ThemeClassifierAgent ${this.id}`);
  }

  /**
   * Cleans up resources used by the ThemeClassifierAgent
   * @returns Promise that resolves when cleanup is complete
   */
  public async cleanup(): Promise<void> {
    this.logger.info(
      `Cleaning up resources for ThemeClassifierAgent ${this.id}`,
    );

    // Clear theme definitions to release memory
    this.themeDefinitions.clear();

    // Any additional cleanup for OpenAI connector if needed

    this.logger.info(
      `ThemeClassifierAgent ${this.id} resources cleaned up successfully`,
    );
  }
}
