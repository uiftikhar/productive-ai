import { BaseAgentInterface } from './base-agent.interface';
import { ConversationMessage } from '../types/conversation.types';
import { Logger } from '../../shared/logger/logger.interface';

/**
 * Result of classification operation
 */
export interface ClassifierResult {
  /**
   * ID of the selected agent, or null if no agent was selected
   */
  selectedAgentId: string | null;

  /**
   * Confidence score for the classification (0-1)
   */
  confidence: number;

  /**
   * Reasoning for the classification decision
   */
  reasoning: string;

  /**
   * Whether the message is a follow-up to a previous conversation
   */
  isFollowUp: boolean;

  /**
   * Entities extracted from the user input
   */
  entities: any[];

  /**
   * Detected intent of the user input
   */
  intent: string;

  /**
   * For specialized classifiers, the identified capability to use
   */
  capability?: string;

  /**
   * Any additional metadata related to the classification
   */
  [key: string]: any;
}

/**
 * Configuration options for classifiers
 */
export interface ClassifierOptions {
  /**
   * Optional logger instance for the classifier
   */
  logger?: Logger;

  /**
   * Model ID to use for classification (if applicable)
   */
  modelId?: string;

  /**
   * Temperature setting for the classification model (0-1)
   */
  temperature?: number;

  /**
   * Custom prompt template to use for classification
   */
  promptTemplate?: string;

  /**
   * Whether to log the classification process (for debugging)
   */
  debug?: boolean;

  /**
   * Maximum number of retries for failed classification attempts
   */
  maxRetries?: number;

  /**
   * Additional metadata or configuration options
   */
  metadata?: Record<string, any>;
}

/**
 * Core interface for agent classifiers
 */
export interface ClassifierInterface {
  /**
   * Initialize the classifier with agents and configuration
   */
  initialize(options?: Record<string, any>): Promise<void>;

  /**
   * Set the available agents for classification
   */
  setAgents(agents: Record<string, BaseAgentInterface>): void;

  /**
   * Classify user input to determine the most appropriate agent
   */
  classify(
    input: string,
    conversationHistory: ConversationMessage[],
    metadata?: Record<string, any>,
  ): Promise<ClassifierResult>;

  /**
   * Set a custom prompt template for classification
   */
  setPromptTemplate(template: string): void;
}

/**
 * Template variables for prompt construction
 */
export interface TemplateVariables {
  [key: string]: string | number | boolean | null | undefined;
}
