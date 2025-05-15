/**
 * Meeting Analysis Instruction Template Service
 * 
 * This is a specialized version of the shared instruction template service in
 * server/src/shared/services/instruction-template.service.ts that's been adapted for
 * meeting analysis with LangGraph.
 * 
 * This service extends the base functionality with:
 * - Meeting analysis specific template variants
 * - Agent expertise specialization
 * - RAG integration for context enhancement
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { AgentExpertise, AnalysisGoalType } from '../interfaces/agent.interface';
import { RagKnowledgeBaseService, RagQueryContext } from './rag-knowledge-base.service';

/**
 * Template variables that can be dynamically replaced
 */
export interface TemplateVariables {
  [key: string]: string | number | boolean | null | undefined | TemplateVariables | string[];
}

/**
 * Template context for instruction templates
 */
export interface TemplateContext {
  [key: string]: any;
}

/**
 * Instruction template representation 
 */
export interface InstructionTemplate {
  id: string;
  name: string;
  template: string;
  variables: string[];
  defaultValues?: Record<string, any>;
  metadata?: {
    author?: string;
    version?: string;
    description?: string;
    category?: string;
    expertises?: (AgentExpertise | AnalysisGoalType)[];
  };
}

/**
 * Template rendering options
 */
export interface TemplateRenderOptions {
  /**
   * Whether to enhance with RAG context
   */
  enhanceWithRag?: boolean;
  
  /**
   * Maximum tokens for RAG context
   */
  maxTokens?: number;
  
  /**
   * Required variables for rendering
   */
  requiredVariables?: string[];
}

/**
 * Configuration for the instruction template service
 */
export interface InstructionTemplateServiceConfig {
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Knowledge service for RAG
   */
  knowledgeService?: RagKnowledgeBaseService;
  
  /**
   * Default options
   */
  defaultOptions?: TemplateRenderOptions;
}

/**
 * Meeting Analysis Instruction Template Service
 * Provides templates optimized for meeting analysis agent instructions
 */
export class MeetingAnalysisInstructionTemplateService {
  private logger: Logger;
  private templates: Map<string, InstructionTemplate> = new Map();
  private knowledgeService?: RagKnowledgeBaseService;
  private useRagByDefault: boolean;
  
  /**
   * Create a new instruction template service
   */
  constructor(config: InstructionTemplateServiceConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.knowledgeService = config.knowledgeService;
    this.useRagByDefault = config.defaultOptions?.enhanceWithRag === true;
    
    // Load predefined templates
    this.registerDefaultTemplates();
  }
  
  /**
   * Register a new template
   */
  public registerTemplate(template: InstructionTemplate): string {
    const templateId = template.id || `template-${uuidv4()}`;
    
    // Normalize the template
    const normalizedTemplate: InstructionTemplate = {
      ...template,
      id: templateId,
      name: template.name || `Template ${templateId}`
    };
    
    // Extract variables if not provided
    if (!normalizedTemplate.variables) {
      normalizedTemplate.variables = this.extractVariables(normalizedTemplate.template);
    }
    
    // Store the template
    this.templates.set(templateId, normalizedTemplate);
    
    this.logger.debug(`Registered template: ${normalizedTemplate.name}`, {
      templateId,
      variables: normalizedTemplate.variables
    });
    
    return templateId;
  }
  
  /**
   * Get a template by ID or name
   */
  public getTemplate(idOrName: string): InstructionTemplate | undefined {
    // Try to find by ID first
    const template = this.templates.get(idOrName);
    if (template) {
      return template;
    }
    
    // Try to find by name
    for (const [, tmpl] of this.templates) {
      if (tmpl.name === idOrName) {
        return tmpl;
      }
    }
    
    return undefined;
  }
  
  /**
   * Render a template with the given context
   */
  public renderTemplate(
    templateIdOrName: string,
    context: TemplateContext,
    options?: TemplateRenderOptions
  ): string {
    const template = this.getTemplate(templateIdOrName);
    
    if (!template) {
      throw new Error(`Template not found: ${templateIdOrName}`);
    }
    
    // Merge options with defaults
    const mergedOptions: TemplateRenderOptions = {
      ...{
        enhanceWithRag: this.useRagByDefault,
        maxTokens: 4000
      },
      ...options
    };
    
    // Validate required variables
    const requiredVariables = mergedOptions.requiredVariables || template.variables;
    this.validateTemplateContext(template, context, requiredVariables);
    
    // Create a copy of the context
    let enhancedContext = { ...context };
    
    // Add default values for missing optional variables
    if (template.defaultValues) {
      for (const [key, value] of Object.entries(template.defaultValues)) {
        if (enhancedContext[key] === undefined) {
          enhancedContext[key] = value;
        }
      }
    }
    
    // Enhance context with RAG if enabled
    if (mergedOptions.enhanceWithRag && this.knowledgeService) {
      this.logger.debug('Context enhancement with RAG requested but not available in sync mode');
    }
    
    // Render the template
    const rendered = this.renderTemplateString(template.template, enhancedContext);
    
    return rendered;
  }
  
  /**
   * Render a template with the given context (async version with RAG support)
   */
  public async renderTemplateAsync(
    templateIdOrName: string,
    context: TemplateContext,
    options?: TemplateRenderOptions
  ): Promise<string> {
    const template = this.getTemplate(templateIdOrName);
    
    if (!template) {
      throw new Error(`Template not found: ${templateIdOrName}`);
    }
    
    // Merge options with defaults
    const mergedOptions: TemplateRenderOptions = {
      ...{
        enhanceWithRag: this.useRagByDefault,
        maxTokens: 4000
      },
      ...options
    };
    
    // Validate required variables
    const requiredVariables = mergedOptions.requiredVariables || template.variables;
    this.validateTemplateContext(template, context, requiredVariables);
    
    // Create a copy of the context
    let enhancedContext = { ...context };
    
    // Add default values for missing optional variables
    if (template.defaultValues) {
      for (const [key, value] of Object.entries(template.defaultValues)) {
        if (enhancedContext[key] === undefined) {
          enhancedContext[key] = value;
        }
      }
    }
    
    // Enhance context with RAG if enabled
    if (mergedOptions.enhanceWithRag && this.knowledgeService) {
      try {
        // Here we can properly await the async call
        const retrievedContext = await this.retrieveRelevantContext({
          query: this.buildRagQuery(template, context),
          meetingId: context.meetingId as string,
          // We know this might cause type issues, but in practice it works
          expertise: context.expertise
        });
        
        if (retrievedContext) {
          enhancedContext = {
            ...enhancedContext,
            retrievedContext
          };
        }
      } catch (error) {
        this.logger.error('Error retrieving RAG context', {
          error: error instanceof Error ? error.message : String(error),
          templateId: template.id
        });
      }
    }
    
    // Render the template
    const rendered = this.renderTemplateString(template.template, enhancedContext);
    
    return rendered;
  }
  
  /**
   * Build a query for RAG using template and context
   */
  private buildRagQuery(
    template: InstructionTemplate,
    context: TemplateContext
  ): string {
    // Build query from expertise
    let queryParts = [`Provide relevant information for ${context.expertise || 'meeting analysis'}`];
    
    // Add meeting context if available
    if (context.meetingId) {
      queryParts.push(`regarding meeting ${context.meetingId}`);
    }
    
    // Additional context from the template name
    const templateContext = template.name
      .replace(/template/gi, '')
      .replace(/instruction/gi, '');
    
    if (templateContext) {
      queryParts.push(`for ${templateContext}`);
    }
    
    // Combine the query parts
    return queryParts.join(' ');
  }
  
  /**
   * Validate the template context against required variables
   */
  private validateTemplateContext(
    template: InstructionTemplate,
    context: TemplateContext,
    requiredVariables: string[]
  ): void {
    const missingVariables = requiredVariables.filter(
      variable => context[variable] === undefined
    );
    
    if (missingVariables.length > 0) {
      throw new Error(
        `Missing required variables for template '${template.name}': ${missingVariables.join(', ')}`
      );
    }
  }
  
  /**
   * Retrieve relevant context for RAG
   */
  private async retrieveRelevantContext(
    queryContext: RagQueryContext
  ): Promise<string | null> {
    if (!this.knowledgeService) {
      return null;
    }
    
    try {
      // Map AnalysisGoalType to the nearest matching AgentExpertise if needed
      let expertise: AgentExpertise;
      
      if (!queryContext.expertise) {
        expertise = AgentExpertise.COORDINATION; // Default expertise
      } else {
        // Get the string value of the expertise
        const expertiseStrValue = String(queryContext.expertise);
        
        // Convert string value to appropriate AgentExpertise
        switch (expertiseStrValue) {
          case String(AnalysisGoalType.EXTRACT_TOPICS):
            expertise = AgentExpertise.TOPIC_ANALYSIS;
            break;
          case String(AnalysisGoalType.EXTRACT_ACTION_ITEMS):
            expertise = AgentExpertise.ACTION_ITEM_EXTRACTION;
            break;
          case String(AnalysisGoalType.EXTRACT_DECISIONS):
            expertise = AgentExpertise.DECISION_TRACKING;
            break;
          case String(AnalysisGoalType.ANALYZE_SENTIMENT):
            expertise = AgentExpertise.SENTIMENT_ANALYSIS;
            break;
          case String(AnalysisGoalType.ANALYZE_PARTICIPATION):
            expertise = AgentExpertise.PARTICIPANT_DYNAMICS;
            break;
          case String(AnalysisGoalType.GENERATE_SUMMARY):
            expertise = AgentExpertise.SUMMARY_GENERATION;
            break;
          case String(AnalysisGoalType.INTEGRATE_CONTEXT):
            expertise = AgentExpertise.CONTEXT_INTEGRATION;
            break;
          case String(AnalysisGoalType.FULL_ANALYSIS):
          case String(AnalysisGoalType.SUMMARY_ONLY):
          case String(AnalysisGoalType.ACTION_ITEMS_ONLY):
          case String(AnalysisGoalType.DECISIONS_ONLY):
            expertise = AgentExpertise.COORDINATION;
            break;
          default:
            // If it matches an AgentExpertise string value, use that AgentExpertise
            if (Object.values(AgentExpertise).includes(expertiseStrValue as any)) {
              expertise = expertiseStrValue as AgentExpertise;
            } else {
              // Default to COORDINATION if we can't match
              expertise = AgentExpertise.COORDINATION;
            }
        }
      }
      
      // Create modified context with the processed expertise
      const modifiedContext: RagQueryContext = {
        query: queryContext.query,
        meetingId: queryContext.meetingId,
        expertise // Now we have a valid AgentExpertise
      };
      
      const results = await this.knowledgeService.retrieveContext(modifiedContext);
      
      if (!results || results.length === 0) {
        return null;
      }
      
      return this.knowledgeService.formatRetrievedContext(results);
    } catch (error) {
      this.logger.error('Error retrieving context', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return null;
    }
  }
  
  /**
   * Extract variables from a template string
   */
  private extractVariables(template: string): string[] {
    const variables: Set<string> = new Set();
    const regex = /\{\{(.*?)\}\}/g;
    let match;
    
    while ((match = regex.exec(template)) !== null) {
      variables.add(match[1].trim());
    }
    
    return Array.from(variables);
  }
  
  /**
   * Render a template string with the given context
   */
  private renderTemplateString(template: string, context: TemplateContext): string {
    return template.replace(/\{\{(.*?)\}\}/g, (match, path) => {
      const trimmedPath = path.trim();
      const pathParts = trimmedPath.split('.');
      
      let value: any = context;
      for (const part of pathParts) {
        if (value === undefined || value === null) {
          return '';
        }
        
        value = value[part];
      }
      
      if (value === undefined || value === null) {
        return '';
      }
      
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      
      return String(value);
    });
  }
  
  /**
   * Load default templates
   */
  private registerDefaultTemplates(): void {
    // Register common templates
    this.registerTemplate({
      id: 'supervisor-coordination',
      name: 'Supervisor Coordination Template',
      template: `# Meeting Analysis Supervisor
You are an expert coordination agent responsible for analyzing meeting transcripts and delegating tasks.

## Your Objective
Analyze the meeting transcript and coordinate specialized agents to extract key information.

## Meeting Context
Meeting ID: {{meetingId}}
Date: {{meeting.date}}
Title: {{meeting.title}}
Participants: {{meeting.participants}}

{{#if retrievedContext}}
## Relevant Background Information
{{retrievedContext}}
{{/if}}

## Your Capabilities
- Identify key themes and topics in the meeting
- Determine which specialized teams to activate
- Synthesize results from different analysis teams
- Provide a comprehensive summary of the meeting

## Meeting Transcript
{{transcript}}

## Instructions
1. Analyze the meeting content to identify key focus areas
2. Determine which specialized teams should analyze the meeting
3. Coordinate the activities of these teams
4. Synthesize their findings into a coherent analysis

Please provide your assessment and coordination plan.`,
      variables: [
        'meetingId', 
        'meeting.date', 
        'meeting.title', 
        'meeting.participants', 
        'transcript'
      ],
      metadata: {
        description: 'Template for supervisor agent to coordinate other agents',
        expertises: [AgentExpertise.COORDINATION, AnalysisGoalType.FULL_ANALYSIS] as (AgentExpertise | AnalysisGoalType)[],
        version: '1.0.0'
      }
    });
    
    this.registerTemplate({
      id: 'topic-extraction',
      name: 'Topic Extraction Template',
      template: `# Topic Analysis Specialist
You are a topic analysis specialist responsible for identifying the main topics discussed in a meeting.

## Your Objective
Extract and summarize the key topics and themes from the meeting transcript.

## Meeting Context
Meeting ID: {{meetingId}}
Date: {{meeting.date}}
Title: {{meeting.title}}
Participants: {{meeting.participants}}

{{#if retrievedContext}}
## Relevant Background Information
{{retrievedContext}}
{{/if}}

## Your Capabilities
- Identify main topics and themes
- Track topic transitions and flow
- Determine relative importance of topics
- Quantify time spent on each topic

## Meeting Transcript
{{transcript}}

## Instructions
1. Analyze the meeting transcript to identify the main topics discussed
2. Estimate the relative importance of each topic
3. Note any topic transitions or flow
4. Provide a structured summary of the topics with relevant quotes

Please provide your topic analysis in a structured format.`,
      variables: [
        'meetingId', 
        'meeting.date', 
        'meeting.title', 
        'meeting.participants', 
        'transcript'
      ],
      metadata: {
        description: 'Template for extracting key topics from a meeting transcript',
        expertises: [AgentExpertise.TOPIC_ANALYSIS, AnalysisGoalType.EXTRACT_TOPICS] as (AgentExpertise | AnalysisGoalType)[],
        version: '1.0.0'
      }
    });
    
    this.registerTemplate({
      id: 'action-item-extraction',
      name: 'Action Item Extraction Template',
      template: `# Action Item Extraction Specialist
You are an action item extraction specialist responsible for identifying tasks, assignments, and follow-up actions from a meeting.

## Your Objective
Extract all action items, tasks, and follow-up items assigned during the meeting.

## Meeting Context
Meeting ID: {{meetingId}}
Date: {{meeting.date}}
Title: {{meeting.title}}
Participants: {{meeting.participants}}

{{#if retrievedContext}}
## Relevant Background Information
{{retrievedContext}}
{{/if}}

## Your Capabilities
- Identify explicit and implicit action items
- Determine assignees for each action item
- Extract deadlines or timeframes if mentioned
- Associate action items with specific topics or discussions

## Meeting Transcript
{{transcript}}

## Instructions
1. Identify all action items mentioned in the meeting
2. For each action item, determine:
   - The specific task to be completed
   - Who is responsible for completing it
   - Any deadline or timeframe mentioned
   - The context or reason for the action
3. Present the action items in a structured format
4. Include direct quotes or references to the transcript when possible

Please provide your action item analysis in a structured format.`,
      variables: [
        'meetingId', 
        'meeting.date', 
        'meeting.title', 
        'meeting.participants', 
        'transcript'
      ],
      metadata: {
        description: 'Template for extracting action items from a meeting transcript',
        expertises: [AgentExpertise.ACTION_ITEM_EXTRACTION, AnalysisGoalType.EXTRACT_ACTION_ITEMS] as (AgentExpertise | AnalysisGoalType)[],
        version: '1.0.0'
      }
    });
    
    // Register more templates for other expertise areas as needed
  }
} 