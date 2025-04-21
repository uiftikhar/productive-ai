import { BaseClassifier } from './base-classifier';
import { ClassifierOptions, ClassifierResult, TemplateVariables } from '../interfaces/classifier.interface';
import { ConversationMessage } from '../types/conversation.types';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LangChainConfig } from '../../langchain/config';
import { 
  DEFAULT_CLASSIFIER_TEMPLATE, 
  FOLLOWUP_CLASSIFIER_TEMPLATE,
  SPECIALIZED_CLASSIFIER_TEMPLATE 
} from './templates/classifier-templates';

/**
 * Types of classification templates available
 */
export type ClassifierTemplateType = 'default' | 'followup' | 'specialized';

/**
 * Options specific to the OpenAI classifier
 */
export interface OpenAIClassifierOptions extends ClassifierOptions {
  /**
   * The model to use for classification
   * @default 'gpt-4o'
   */
  modelName?: string;
  
  /**
   * Temperature setting (0-1)
   * @default 0.2
   */
  temperature?: number;
  
  /**
   * Maximum tokens to generate
   */
  maxTokens?: number;
  
  /**
   * The type of classification template to use
   * @default 'default'
   */
  templateType?: ClassifierTemplateType;
  
  /**
   * Domain for specialized classifier (only used with specialized template)
   */
  domain?: string;
}

/**
 * Classifier implementation using OpenAI for agent selection
 */
export class OpenAIClassifier extends BaseClassifier {
  private llm: ChatOpenAI;
  private templateType: ClassifierTemplateType;
  private domain?: string;
  
  /**
   * Create a new OpenAI classifier
   */
  constructor(options: OpenAIClassifierOptions = {}) {
    super(options);
    
    // Create the LLM instance
    this.llm = new ChatOpenAI({
      modelName: options.modelName || LangChainConfig.llm.model || 'gpt-4o',
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens,
    });
    
    // Set template type
    this.templateType = options.templateType || 'default';
    this.domain = options.domain;
    
    // Set the appropriate template based on type
    this.setTemplateFromType(this.templateType);
    
    this.logger.debug('OpenAIClassifier initialized', {
      modelName: this.llm.modelName,
      templateType: this.templateType
    });
  }
  
  /**
   * Set the template based on the selected type
   */
  private setTemplateFromType(type: ClassifierTemplateType): void {
    switch (type) {
      case 'followup':
        this.setPromptTemplate(FOLLOWUP_CLASSIFIER_TEMPLATE);
        break;
      case 'specialized':
        this.setPromptTemplate(SPECIALIZED_CLASSIFIER_TEMPLATE);
        break;
      case 'default':
      default:
        this.setPromptTemplate(DEFAULT_CLASSIFIER_TEMPLATE);
    }
  }
  
  /**
   * Set the template type to use for classification
   */
  setTemplateType(type: ClassifierTemplateType, domain?: string): void {
    this.templateType = type;
    this.domain = domain;
    this.setTemplateFromType(type);
    
    this.logger.debug('Changed template type', { 
      templateType: type,
      domain 
    });
  }
  
  /**
   * Classify input using OpenAI
   */
  protected async classifyInternal(
    input: string,
    conversationHistory: ConversationMessage[],
    variables: TemplateVariables,
    metadata?: Record<string, any>
  ): Promise<ClassifierResult> {
    // Add domain for specialized template if needed
    if (this.templateType === 'specialized' && this.domain) {
      variables.DOMAIN = this.domain;
    }
    
    // Fill in the prompt template
    const systemPrompt = this.fillTemplate(this.promptTemplate, variables);
    
    // Create messages for the LLM
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(input)
    ];
    
    // Get the classification from the LLM
    const response = await this.llm.invoke(messages);
    
    try {
      // Extract the JSON response
      const responseText = response.content.toString();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('No JSON found in classifier response');
      }
      
      // Parse the JSON result
      const result = JSON.parse(jsonMatch[0]);
      
      // Handle specialized template format
      if (this.templateType === 'specialized' && result.selectedCapability) {
        // Transform specialized format to standard format
        return this.validateResult({
          selectedAgentId: null, // We don't select an agent, just a capability
          confidence: result.confidence || 0,
          reasoning: result.reasoning || 'No reasoning provided',
          isFollowUp: false,
          entities: result.entities || [],
          intent: result.intent || '',
          capability: result.selectedCapability // Add capability for specialized case
        });
      }
      
      // Handle follow-up specific format
      if (this.templateType === 'followup') {
        return this.validateResult({
          selectedAgentId: result.selectedAgentId,
          confidence: result.confidence || 0,
          reasoning: result.reasoning || 'No reasoning provided',
          isFollowUp: result.isFollowUp === true,
          entities: [],
          intent: ''
        });
      }
      
      // Standard format validation
      return this.validateResult({
        selectedAgentId: result.selectedAgentId,
        confidence: result.confidence || 0,
        reasoning: result.reasoning || 'No reasoning provided',
        isFollowUp: result.isFollowUp,
        entities: result.entities || [],
        intent: result.intent || ''
      });
    } catch (error) {
      this.logger.error('Error parsing classifier response', {
        error,
        response: response.content.toString()
      });
      
      throw new Error(`Failed to parse classifier response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Validate and normalize the classification result
   */
  private validateResult(result: Partial<ClassifierResult>): ClassifierResult {
    // Ensure all required fields are present
    const validated: ClassifierResult = {
      selectedAgentId: result.selectedAgentId || null,
      confidence: typeof result.confidence === 'number' ? Math.min(Math.max(result.confidence, 0), 1) : 0,
      reasoning: result.reasoning || 'No reasoning provided',
      isFollowUp: result.isFollowUp || false,
      entities: Array.isArray(result.entities) ? result.entities : [],
      intent: result.intent || ''
    };
    
    // Add any additional fields that were provided
    Object.entries(result).forEach(([key, value]) => {
      if (!(key in validated)) {
        (validated as any)[key] = value;
      }
    });
    
    // If a non-null agent ID was provided, ensure it exists
    if (validated.selectedAgentId && this.templateType !== 'specialized' && !this.agents[validated.selectedAgentId]) {
      this.logger.warn(`Classifier selected non-existent agent: ${validated.selectedAgentId}`, {
        availableAgents: Object.keys(this.agents)
      });
      
      validated.selectedAgentId = null;
      validated.confidence = 0;
      validated.reasoning = `Selected agent ID (${result.selectedAgentId}) does not exist in the available agents.`;
    }
    
    return validated;
  }
} 