import {
  ClassifierInterface,
  ClassifierOptions,
  ClassifierResult,
  TemplateVariables,
} from '../interfaces/classifier.interface';
import { BaseAgentInterface } from '../interfaces/base-agent.interface';
import {
  ConversationMessage,
  ParticipantRole,
} from '../types/conversation.types';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { DEFAULT_CLASSIFIER_TEMPLATE } from './templates/classifier-templates';

/**
 * Default prompt template for classification
 */
const DEFAULT_PROMPT_TEMPLATE = `
You are AgentMatcher, an intelligent assistant designed to analyze user queries and match them with the most suitable agent. Your task is to understand the user's request, identify key entities and intents, and determine which agent would be best equipped to handle the query.

Important: The user's input may be a follow-up response to a previous interaction. The conversation history, including the name of the previously selected agent, is provided. If the user's input appears to be a continuation of the previous conversation (e.g., "yes", "ok", "I want to know more", "1"), select the same agent as before.

Analyze the user's input and categorize it into one of the following agent types:
<agents>
{{AGENT_DESCRIPTIONS}}
</agents>

Guidelines for classification:
1. Agent Selection: Choose the most appropriate agent based on the nature of the query. For follow-up responses, use the same agent as the previous interaction.
2. Confidence: Provide a confidence score between 0-1, with 1 being absolute certainty.
3. Reasoning: Explain your decision process briefly.
4. Identify follow-ups: If the input appears to be a follow-up to a previous conversation, note this in your response.
5. Extract key entities: Identify important entities mentioned in the query.
6. Determine intent: Categorize the overall intent of the user's request.

Here is the conversation history that you need to take into account before answering:
<history>
{{CONVERSATION_HISTORY}}
</history>

Respond in the following JSON format:
{
  "selectedAgentId": "agent-id-here-or-null-if-none-matched",
  "confidence": 0.95,
  "reasoning": "Brief explanation of why this agent was selected",
  "isFollowUp": true/false,
  "entities": ["entity1", "entity2"],
  "intent": "user's primary intent"
}

Skip any preamble and provide only the JSON response.
`;

/**
 * Abstract base class for all classifiers
 */
export abstract class BaseClassifier implements ClassifierInterface {
  protected logger: Logger;
  protected agents: Record<string, BaseAgentInterface>;
  protected agentDescriptions: string;
  protected promptTemplate: string;
  protected options: ClassifierOptions;

  /**
   * Create a new classifier
   */
  constructor(options: ClassifierOptions = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.options = options;
    this.agents = {};
    this.agentDescriptions = '';
    this.promptTemplate = options.promptTemplate || DEFAULT_CLASSIFIER_TEMPLATE;
  }

  /**
   * Initialize the classifier
   */
  async initialize(options?: Record<string, any>): Promise<void> {
    this.logger.debug('Initializing classifier', { options });

    // Override options if provided
    if (options) {
      this.options = { ...this.options, ...options };
    }
  }

  /**
   * Set the available agents for classification
   */
  setAgents(agents: Record<string, BaseAgentInterface>): void {
    this.agents = agents;

    // Format agent descriptions for the prompt
    this.agentDescriptions = Object.entries(agents)
      .map(([id, agent]) => `${id}: ${agent.description}`)
      .join('\n\n');

    this.logger.debug('Set agents for classification', {
      agentCount: Object.keys(agents).length,
    });
  }

  /**
   * Set a custom prompt template for classification
   */
  setPromptTemplate(template: string): void {
    this.promptTemplate = template;
    this.logger.debug('Set custom prompt template');
  }

  /**
   * Classify user input to determine the most appropriate agent
   */
  async classify(
    input: string,
    conversationHistory: ConversationMessage[],
    metadata?: Record<string, any>,
  ): Promise<ClassifierResult> {
    const startTime = Date.now();

    try {
      this.logger.debug('Classifying input', {
        inputLength: input.length,
        historyLength: conversationHistory.length,
        metadata,
      });

      // Check for previous agent in conversation history
      const previousAgent = this.findPreviousAgent(conversationHistory);

      // Prepare the formatted conversation history
      const formattedHistory =
        this.formatConversationHistory(conversationHistory);

      // Format template variables
      const variables: TemplateVariables = {
        AGENT_DESCRIPTIONS: this.agentDescriptions,
        CONVERSATION_HISTORY: formattedHistory,
        PREVIOUS_AGENT: previousAgent || '',
        USER_INPUT: input,
      };

      // Apply maximum retries for classification
      const maxRetries = this.options.maxRetries || 3;
      let retries = 0;
      let error: Error | null = null;

      while (retries < maxRetries) {
        try {
          // Call the classifier implementation
          const result = await this.classifyInternal(
            input,
            conversationHistory,
            variables,
            metadata,
          );

          // Log the result
          const executionTime = Date.now() - startTime;
          this.logger.debug('Classification completed', {
            executionTimeMs: executionTime,
            selectedAgent: result.selectedAgentId,
            confidence: result.confidence,
          });

          return result;
        } catch (err) {
          retries++;
          error = err as Error;
          this.logger.warn(`Classification attempt ${retries} failed`, {
            error,
          });

          // Slight delay before retry
          if (retries < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      // If we get here, all retries failed
      throw error || new Error('Classification failed after all retries');
    } catch (error) {
      this.logger.error('Classification error', { error });

      // Return a default "no match" result
      return {
        selectedAgentId: null,
        confidence: 0,
        reasoning: `Classification error: ${error instanceof Error ? error.message : String(error)}`,
        isFollowUp: false,
        entities: [],
        intent: '',
      };
    }
  }

  /**
   * Format conversation history for the prompt
   */
  protected formatConversationHistory(history: ConversationMessage[]): string {
    return history
      .map((msg) => {
        const role =
          msg.role === ParticipantRole.ASSISTANT
            ? `Assistant${msg.agentId ? ` [${msg.agentId}]` : ''}`
            : msg.role;

        return `${role}: ${msg.content}`;
      })
      .join('\n');
  }

  /**
   * Find the most recent agent ID in the conversation history
   */
  protected findPreviousAgent(history: ConversationMessage[]): string | null {
    // Search in reverse to find most recent
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg.role === ParticipantRole.ASSISTANT && msg.agentId) {
        return msg.agentId;
      }
    }
    return null;
  }

  /**
   * Fill template placeholders with values
   */
  protected fillTemplate(
    template: string,
    variables: TemplateVariables,
  ): string {
    let filledTemplate = template;

    // First pass: replace known variables
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      filledTemplate = filledTemplate.replace(
        new RegExp(placeholder, 'g'),
        value !== undefined && value !== null ? String(value) : '',
      );
    }

    // Second pass: replace any remaining template variables with empty strings
    filledTemplate = filledTemplate.replace(/\{\{[^}]+\}\}/g, '');

    return filledTemplate;
  }

  /**
   * Internal classification implementation to be provided by subclasses
   */
  protected abstract classifyInternal(
    input: string,
    conversationHistory: ConversationMessage[],
    variables: TemplateVariables,
    metadata?: Record<string, any>,
  ): Promise<ClassifierResult>;
}
