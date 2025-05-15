/**
 * Instruction Template Service
 * 
 * Centralized service for managing instruction templates and creating
 * optimized prompts for various AI tasks. Provides integration with
 * Retrieval-Augmented Generation (RAG) capabilities.
 */

import { 
  InstructionTemplates,
  InstructionTemplateNameEnum, 
  type InstructionTemplateName 
} from '../prompts/instruction-templates';
import { SystemRoleEnum, type SystemRole, type InstructionTemplate } from '../prompts/prompt-types';
import { RagPromptManager, RagRetrievalStrategy, type RagContextOptions } from './rag-prompt-manager.service';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { Logger } from '../logger/logger.interface';
import { ConsoleLogger } from '../logger/console-logger';
import { MessageConfig } from '../../connectors/language-model-provider.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * Response format types for AI responses
 */
export enum ResponseFormatType {
  JSON_OBJECT = 'json_object',
  JSON_ARRAY = 'json_array',
  TEXT = 'text'
}

/**
 * Options for creating prompts
 */
export interface PromptOptions {
  systemRole?: SystemRole;
  templateName?: InstructionTemplateName;
  content: string;
  additionalContext?: Record<string, any>;
  enhanceWithRag?: boolean;
  ragOptions?: Partial<RagContextOptions>;
  modelParams?: {
    temperature?: number;
    maxTokens?: number;
    model?: string;
  };
}

/**
 * Result of creating a prompt
 */
export interface PromptResult {
  messages: MessageConfig[];
  systemPrompt: string;
  userPrompt: string;
  responseFormat: ResponseFormatType;
  retrievedContext?: {
    sources: string[];
    items: Array<{
      content: string;
      source?: string;
      score?: number;
    }>;
  };
}

/**
 * Configuration for InstructionTemplateService
 */
export interface InstructionTemplateServiceConfig {
  openAiConnector?: OpenAIConnector;
  ragPromptManager?: RagPromptManager;
  logger?: Logger;
  useMockMode?: boolean;
}

/**
 * Service for managing instruction templates and creating optimized prompts
 */
export class InstructionTemplateService {
  private openAiConnector?: OpenAIConnector;
  private ragPromptManager?: RagPromptManager;
  private logger: Logger;
  private useMockMode: boolean;
  
  /**
   * Register of custom templates beyond the default ones
   */
  private customTemplates: Map<string, InstructionTemplate> = new Map();
  
  /**
   * Create a new InstructionTemplateService
   */
  constructor(config: InstructionTemplateServiceConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.useMockMode = config.useMockMode ?? (process.env.USE_MOCK_IMPLEMENTATIONS === 'true');
    
    // Initialize OpenAI connector
    this.openAiConnector = config.openAiConnector || new OpenAIConnector({
      logger: this.logger
    });
    
    // Initialize RAG prompt manager
    this.ragPromptManager = config.ragPromptManager || new RagPromptManager({
      openAiConnector: this.openAiConnector,
      logger: this.logger,
      useMockMode: this.useMockMode
    });
    
    this.logger.info('InstructionTemplateService initialized');
  }
  
  /**
   * Get a template by name
   */
  public getTemplate(templateName: InstructionTemplateName): InstructionTemplate | undefined {
    // Check custom templates first
    if (this.customTemplates.has(templateName)) {
      return this.customTemplates.get(templateName);
    }
    
    // Then check built-in templates
    return InstructionTemplates[templateName];
  }
  
  /**
   * Add a custom template
   */
  public addTemplate(name: string, template: InstructionTemplate): void {
    this.customTemplates.set(name, template);
    this.logger.info(`Custom template added: ${name}`);
  }
  
  /**
   * List all available template names
   */
  public listTemplateNames(): string[] {
    const builtInNames = Object.keys(InstructionTemplates);
    const customNames = Array.from(this.customTemplates.keys());
    
    return [...builtInNames, ...customNames];
  }
  
  /**
   * Create a prompt based on template and options
   */
  public async createPrompt(options: PromptOptions): Promise<PromptResult> {
    const {
      systemRole = SystemRoleEnum.ASSISTANT,
      templateName = InstructionTemplateNameEnum.CUSTOM,
      content,
      additionalContext = {},
      enhanceWithRag = false,
      ragOptions,
      modelParams = {}
    } = options;
    
    // Get template
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }
    
    // Build system prompt with template rules and output requirements
    const systemPrompt = this.buildSystemPrompt(systemRole, template);
    
    let userPrompt = content;
    let retrievedContext = undefined;
    
    // Enhance with RAG if requested
    if (enhanceWithRag && ragOptions) {
      try {
        // Generate embeddings for query
        let queryEmbedding: number[];
        try {
          const queryText = content.substring(0, 500); // Take first 500 chars for embedding
          queryEmbedding = await this.openAiConnector!.generateEmbedding(queryText);
        } catch (error) {
          this.logger.error('Error generating embeddings', { error });
          queryEmbedding = this.generateDummyEmbedding();
        }
        
        // Prepare complete RAG options
        const fullRagOptions: RagContextOptions = {
          userId: ragOptions.userId || 'system',
          queryText: ragOptions.queryText || content.substring(0, 500),
          queryEmbedding,
          strategy: ragOptions.strategy || RagRetrievalStrategy.SEMANTIC,
          maxItems: ragOptions.maxItems || 5,
          minRelevanceScore: ragOptions.minRelevanceScore || 0.7,
          conversationId: ragOptions.conversationId,
          documentIds: ragOptions.documentIds,
          contentTypes: ragOptions.contentTypes,
          timeWindow: ragOptions.timeWindow,
          customFilter: ragOptions.customFilter || { type: { $exists: true } }
        };
        
        // Get RAG-enhanced prompt
        const ragResult = await this.ragPromptManager!.createRagPrompt(
          systemRole,
          templateName,
          content,
          fullRagOptions
        );
        
        userPrompt = ragResult.messages[0].content || content;
        retrievedContext = {
          sources: ragResult.retrievedContext.sources,
          items: ragResult.retrievedContext.items
        };
      } catch (error) {
        this.logger.error('Error enhancing prompt with RAG', { error });
        // Continue with non-RAG prompt
      }
    }
    
    // Add additional context to the prompt if provided
    if (Object.keys(additionalContext).length > 0) {
      userPrompt += `\n\nADDITIONAL CONTEXT:\n${JSON.stringify(additionalContext, null, 2)}`;
    }
    
    // Determine response format
    const responseFormat = this.getResponseFormat(template);
    
    return {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      systemPrompt,
      userPrompt,
      responseFormat,
      retrievedContext
    };
  }
  
  /**
   * Create a specialized prompt for specific use case
   */
  public async createSpecializedPrompt(
    type: 'topic_discovery' | 'action_item_extraction' | 'meeting_summary' | 'decision_analysis' | 'sentiment_analysis' | 'participant_dynamics',
    content: string,
    specializedOptions: Record<string, any> = {}
  ): Promise<PromptResult> {
    // Map type to appropriate template and system role
    let templateName: InstructionTemplateName;
    let systemRole: SystemRole;
    
    switch (type) {
      case 'topic_discovery':
        templateName = InstructionTemplateNameEnum.TOPIC_DISCOVERY;
        systemRole = SystemRoleEnum.MEETING_ANALYST;
        break;
      case 'action_item_extraction':
        templateName = InstructionTemplateNameEnum.ACTION_ITEM_EXTRACTION;
        systemRole = SystemRoleEnum.MEETING_ANALYST;
        break;
      case 'meeting_summary':
        templateName = InstructionTemplateNameEnum.FINAL_MEETING_SUMMARY;
        systemRole = SystemRoleEnum.FINAL_SUMMARY_GENERATOR;
        break;
      case 'decision_analysis':
        templateName = InstructionTemplateNameEnum.MEETING_ANALYSIS_CHUNK;
        systemRole = SystemRoleEnum.MEETING_ANALYST;
        break;
      case 'sentiment_analysis':
        templateName = InstructionTemplateNameEnum.CUSTOM;
        systemRole = SystemRoleEnum.MEETING_ANALYST;
        break;
      case 'participant_dynamics':
        templateName = InstructionTemplateNameEnum.PARTICIPANT_DYNAMICS;
        systemRole = SystemRoleEnum.MEETING_ANALYST;
        break;
      default:
        templateName = InstructionTemplateNameEnum.CUSTOM;
        systemRole = SystemRoleEnum.ASSISTANT;
    }
    
    // Add specialized enhancements based on type
    return this.createPrompt({
      systemRole,
      templateName,
      content,
      additionalContext: specializedOptions,
      enhanceWithRag: true,
      ragOptions: {
        userId: specializedOptions.userId || 'system',
        strategy: RagRetrievalStrategy.SEMANTIC,
        maxItems: 5,
        customFilter: specializedOptions.filter || { type: { $exists: true } }
      }
    });
  }
  
  /**
   * Build a system prompt based on role and template
   */
  private buildSystemPrompt(role: SystemRole, template: InstructionTemplate): string {
    let systemPrompt = this.getSystemRolePrompt(role);
    
    // Add template rules
    if (template.rules && template.rules.length > 0) {
      systemPrompt += '\n\nRULES:';
      for (const rule of template.rules) {
        systemPrompt += `\n${rule}`;
      }
    }
    
    // Add output requirements
    if (template.outputRequirements && template.outputRequirements.length > 0) {
      systemPrompt += '\n\nOUTPUT REQUIREMENTS:';
      for (const requirement of template.outputRequirements) {
        systemPrompt += `\n${requirement}`;
      }
    }
    
    // Add response format details based on template format
    if (template.format) {
      const format = template.format as any; // Cast to any for flexibility
      
      if (format.outputFormat === 'json_object' && format.jsonSchema) {
        systemPrompt += '\n\nRESPONSE FORMAT:';
        systemPrompt += '\nYour response must be a valid JSON object with the following structure:';
        systemPrompt += `\n${JSON.stringify(format.jsonSchema, null, 2)}`;
      } else if (format.outputFormat === 'json_array') {
        systemPrompt += '\n\nRESPONSE FORMAT:';
        systemPrompt += '\nYour response must be a valid JSON array.';
      }
    }
    
    return systemPrompt;
  }
  
  /**
   * Get system prompt for role
   */
  private getSystemRolePrompt(role: SystemRole): string {
    switch (role) {
      case SystemRoleEnum.MEETING_ANALYST:
        return 'You are an expert meeting analyst who specializes in extracting structured information from meeting transcripts. Your job is to identify key insights, patterns, and actionable outcomes.';
      
      case SystemRoleEnum.AGILE_COACH:
        return 'You are an experienced Agile Coach who specializes in helping teams implement agile methodologies effectively. Your expertise includes creating well-structured user stories, epics, and tasks.';
      
      case SystemRoleEnum.MEETING_CHUNK_SUMMARIZER:
        return 'You are a meeting summarization specialist who excels at condensing transcript segments into focused, actionable summaries that capture key points, decisions, and action items.';
      
      case SystemRoleEnum.FINAL_SUMMARY_GENERATOR:
        return 'You are a senior executive communication specialist who creates comprehensive, structured meeting summaries that distill complex discussions into clear, actionable insights and outcomes.';
      
      case SystemRoleEnum.ASSISTANT:
      default:
        return 'You are a helpful assistant that provides concise, accurate information. You follow instructions carefully and format your responses as requested.';
    }
  }
  
  /**
   * Get response format based on template
   */
  private getResponseFormat(template: InstructionTemplate): ResponseFormatType {
    const format = template.format as any; // Cast to any for flexibility
    
    if (format.outputFormat === 'json_object') {
      return ResponseFormatType.JSON_OBJECT;
    } else if (format.outputFormat === 'json_array') {
      return ResponseFormatType.JSON_ARRAY;
    }
    
    return ResponseFormatType.TEXT;
  }
  
  /**
   * Generate dummy embeddings for fallback
   */
  private generateDummyEmbedding(): number[] {
    return new Array(1536).fill(0).map(() => Math.random() - 0.5);
  }

  /**
   * Initialize the InstructionTemplateService
   * This sets up any necessary resources and verifies the service is ready to use
   */
  async initialize(): Promise<void> {
    // Log initialization
    this.logger.debug('Initializing InstructionTemplateService');
    
    // Verify access to required dependencies
    if (!this.openAiConnector) {
      this.logger.warn('InstructionTemplateService: No OpenAI connector provided, some features will be limited');
    }
    
    if (!this.ragPromptManager) {
      this.logger.warn('InstructionTemplateService: No RAG prompt manager provided, RAG features will be limited');
    }
    
    // TODO: Prepare caching structures
    // this.templateCache = new Map();
    
    // Log successful initialization
    this.logger.info('InstructionTemplateService initialized successfully');
    
    return Promise.resolve();
  }
} 