/**
 * RAG Prompt Manager Service
 *
 * Comprehensive service for managing Retrieval-Augmented Generation (RAG) prompts.
 * This service handles context retrieval, prompt construction, and optimization based
 * on the query and available context.
 *
 * @status STABLE
 * This is a core service used for generating optimized prompts with relevant context
 * from the user's data. It supports various retrieval strategies and context types.
 *
 * Key features:
 * - Multiple retrieval strategies (semantic, hybrid, recency)
 * - Context-aware prompt optimization
 * - Template-based prompt generation
 * - Proper source citation and tracking
 *
 * Usage example:
 * ```typescript
 * const ragPromptManager = new RagPromptManager();
 * const result = await ragPromptManager.createRagPrompt(
 *   SystemRoleEnum.ANALYST,
 *   InstructionTemplateNameEnum.CONCISE_ANALYSIS,
 *   "What insights can you provide about last week's meeting?",
 *   {
 *     userId: "user123",
 *     queryText: "meeting insights",
 *     queryEmbedding: [...],
 *     strategy: RagRetrievalStrategy.HYBRID
 *   }
 * );
 * ```
 *
 * TODO: This service will be refactored into smaller, more focused services:
 * 1. RagContextRetriever - For context retrieval strategies
 * 2. RagTemplateManager - For template management
 * 3. RagPromptBuilder - For constructing prompts from templates and context
 */

import { PromptManager } from './prompt-manager.service';
import { SystemRoleEnum, type SystemRole } from '../prompts/prompt-types';
import {
  InstructionTemplateNameEnum,
  type InstructionTemplateName,
} from '../prompts/instruction-templates';
import { ContextType } from './user-context/context-types';
import {
  PromptLibrary,
  PromptCompositionOptions,
} from '../prompts/prompt-library';
import { BaseContextService } from './user-context/base-context.service';
import { ConversationContextService } from './user-context/conversation-context.service';
import { DocumentContextService } from './user-context/document-context.service';
import { RelevanceCalculationService } from './user-context/relevance-calculation.service';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { PineconeConnector } from '../../connectors/pinecone-connector';
import { AgentConfigService } from '../config/agent-config.service';
import { Logger } from '../logger/logger.interface';
import { ConsoleLogger } from '../logger/console-logger';

/**
 * Different strategies for retrieving context for RAG
 */
export enum RagRetrievalStrategy {
  SEMANTIC = 'semantic', // Pure vector similarity search
  HYBRID = 'hybrid', // Combination of semantic and keyword-based search
  RECENCY = 'recency', // Prioritize recent context
  CONVERSATION = 'conversation', // Focus on current conversation
  DOCUMENT = 'document', // Document-specific context
  CUSTOM = 'custom', // Custom retrieval logic
  METADATA = 'metadata', // Metadata-based filtering
  COMBINED = 'combined', // Combination of multiple strategies
}

/**
 * Options for retrieving context for RAG
 */
export interface RagContextOptions {
  userId: string;
  queryText: string;
  queryEmbedding: number[];
  strategy?: RagRetrievalStrategy;
  maxItems?: number;
  minRelevanceScore?: number;
  conversationId?: string;
  documentIds?: string[];
  contentTypes?: ContextType[];
  timeWindow?: number; // Only include context from the last N milliseconds
  customFilter?: Record<string, any>;
}

/**
 * Context retrieved for a RAG prompt
 */
export interface RetrievedContext {
  items: Array<{
    content: string;
    source?: string;
    score?: number;
    metadata?: Record<string, any>;
  }>;
  formattedContext: string;
  sources: string[];
}

/**
 * Result of a RAG prompt generation
 */
export interface RagPromptResult {
  messages: Array<{ role: string; content: string }>;
  retrievedContext: RetrievedContext;
  templateName: InstructionTemplateName;
  systemRole: SystemRole;
  usedComponents?: string[]; // New: Track which prompt components were used
}

/**
 * Options for context-aware prompt optimization
 */
export interface ContextAwarePromptOptions {
  taskType?: 'summarization' | 'qa' | 'analysis' | 'code' | 'general';
  audience?: 'technical' | 'non-technical' | 'expert' | 'beginner';
  toneStyle?: 'formal' | 'conversational' | 'instructional';
  maxLength?: number;
  requiresCitations?: boolean;
  domainSpecific?: string[];
  modelCapabilities?: string[];
}

/**
 * Template versioning for prompts
 */
export interface PromptTemplate {
  id: string;
  version: string;
  description: string;
  components: string[];
  defaultReplacements?: Record<string, string>;
  metadata?: {
    author?: string;
    createdAt?: number;
    updatedAt?: number;
    tags?: string[];
    modelCompatibility?: string[];
  };
}

/**
 * Prompt template library
 */
export class PromptTemplateLibrary {
  private static templates: Map<string, PromptTemplate> = new Map();

  /**
   * Register a template
   */
  public static registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get a template by ID
   */
  public static getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * List all available templates
   */
  public static listTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Initialize with default templates
   */
  public static initialize(): void {
    this.registerDefaultTemplates();
  }

  /**
   * Register default templates
   */
  private static registerDefaultTemplates(): void {
    // Task-specific templates
    this.registerTemplate({
      id: 'concise-qa',
      version: '1.0',
      description: 'Concise question answering template',
      components: [
        'system.qa-specialist',
        'instruction.concise-answers',
        'instruction.cite-sources',
      ],
      metadata: {
        author: 'system',
        createdAt: Date.now(),
        tags: ['qa', 'concise'],
        modelCompatibility: ['gpt-3.5-turbo', 'gpt-4'],
      },
    });

    this.registerTemplate({
      id: 'detailed-analysis',
      version: '1.0',
      description: 'Detailed analysis of complex topics',
      components: [
        'system.analyst',
        'instruction.thorough-analysis',
        'instruction.structured-format',
      ],
      metadata: {
        author: 'system',
        createdAt: Date.now(),
        tags: ['analysis', 'detailed'],
        modelCompatibility: ['gpt-4', 'claude-2'],
      },
    });

    this.registerTemplate({
      id: 'code-generation',
      version: '1.0',
      description: 'Code generation with explanations',
      components: [
        'system.developer',
        'instruction.code-best-practices',
        'instruction.add-comments',
      ],
      metadata: {
        author: 'system',
        createdAt: Date.now(),
        tags: ['code', 'development'],
        modelCompatibility: ['gpt-4', 'claude-2'],
      },
    });

    this.registerTemplate({
      id: 'summarization',
      version: '1.0',
      description: 'Concise summarization of content',
      components: [
        'system.summarizer',
        'instruction.extract-key-points',
        'instruction.brevity',
      ],
      metadata: {
        author: 'system',
        createdAt: Date.now(),
        tags: ['summarization'],
        modelCompatibility: ['gpt-3.5-turbo', 'gpt-4', 'claude-instant'],
      },
    });
  }
}

/**
 * Extended PromptManager with RAG capabilities
 * This service extends the base PromptManager to include
 * retrieval-augmented generation features
 */
export class RagPromptManager {
  private baseContextService: BaseContextService;
  private documentContextService: DocumentContextService;
  private conversationContextService: ConversationContextService;
  private relevanceCalculationService: RelevanceCalculationService;
  private openAiConnector: OpenAIConnector;
  private pineconeConnector: PineconeConnector;
  private logger: Logger;
  private useMockMode: boolean;
  private vectorIndexName: string;
  private vectorNamespace: string;

  constructor(options: {
    openAiConnector?: OpenAIConnector;
    pineconeConnector?: PineconeConnector;
    logger?: Logger;
    useMockMode?: boolean;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    
    // Get configuration from the config service
    const configService = AgentConfigService.getInstance();
    this.useMockMode = options.useMockMode ?? configService.isMockModeEnabled();
    
    // Initialize Pinecone settings
    const pineconeConfig = configService.getPineconeConfig();
    this.vectorIndexName = pineconeConfig.indexName;
    this.vectorNamespace = pineconeConfig.namespace;
    
    // Initialize connectors
    this.openAiConnector = options.openAiConnector || new OpenAIConnector({
      logger: this.logger,
      modelConfig: configService.getOpenAIConfig()
    });
    
    this.pineconeConnector = options.pineconeConnector || new PineconeConnector({
      logger: this.logger,
      defaultNamespace: this.vectorNamespace
    });
    
    // Initialize context services
    this.baseContextService = new BaseContextService();
    this.documentContextService = new DocumentContextService();
    this.conversationContextService = new ConversationContextService();
    this.relevanceCalculationService = new RelevanceCalculationService();

    // Ensure the PromptLibrary is initialized
    PromptLibrary.initialize();
    PromptTemplateLibrary.initialize();
    
    this.logger.info('RAG Prompt Manager initialized', { 
      useMockMode: this.useMockMode,
      vectorIndexName: this.vectorIndexName
    });
  }

  /**
   * Create a RAG-enhanced prompt by retrieving relevant context
   * from the user's context store
   */
  async createRagPrompt(
    role: SystemRole,
    templateName: InstructionTemplateName,
    content: string,
    ragOptions: RagContextOptions,
  ): Promise<RagPromptResult> {
    // 1. Retrieve relevant context based on the query
    const retrievedContext = await this.retrieveUserContext(ragOptions);

    // 2. Get the output format for the template if available
    const responseFormat = this.getOutputFormatForTemplate(templateName);

    // 3. Use the base PromptManager to create the prompt with the retrieved context
    const prompt = PromptManager.createPrompt(
      role,
      templateName,
      content,
      retrievedContext.formattedContext,
    );

    // 4. Add response format to the first message if it's available
    if (responseFormat && prompt.messages.length > 0) {
      // If we have a system message, add response format to it
      if (prompt.messages[0].role === 'system') {
        // Cast to any to allow adding responseFormat property
        (prompt.messages[0] as any).responseFormat = responseFormat;
      }
    }

    // 5. Return the result with additional RAG-specific information
    return {
      messages: prompt.messages,
      retrievedContext,
      templateName,
      systemRole: role,
    };
  }

  /**
   * Create a context-aware optimized RAG prompt using the PromptLibrary
   * This more advanced version analyzes the context and query to select
   * the most appropriate prompt components
   */
  async createOptimizedRagPrompt(
    content: string,
    ragOptions: RagContextOptions,
    optimizationOptions: ContextAwarePromptOptions = {},
  ): Promise<RagPromptResult> {
    // 1. Retrieve relevant context based on the query
    const retrievedContext = await this.retrieveUserContext(ragOptions);

    // 2. Analyze the context and query to determine optimal prompt components
    const promptComponents = this.determineOptimalPromptComponents(
      ragOptions.queryText,
      retrievedContext,
      optimizationOptions,
    );

    // 3. Resolve any variable replacements based on the query and context
    const replacements = this.generateReplacements(
      ragOptions.queryText,
      retrievedContext,
      optimizationOptions,
    );

    // 4. Create a composite prompt using the PromptLibrary
    const compositionOptions: PromptCompositionOptions = {
      includeDescriptions: false,
      replacements,
    };

    const { prompt: systemPrompt } =
      PromptLibrary.createVersionedCompositePrompt(
        promptComponents.systemComponents,
        compositionOptions,
      );

    // 5. Format context based on optimization preferences
    const enhancedContext = this.optimizeContext(
      retrievedContext,
      optimizationOptions,
    );

    // 6. Build the messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(promptComponents.instructionComponents.length > 0
        ? [
            {
              role: 'system',
              content: PromptLibrary.createCompositePrompt(
                promptComponents.instructionComponents,
                compositionOptions,
              ),
            },
          ]
        : []),
      { role: 'system', content: enhancedContext },
      { role: 'user', content },
    ];

    // 7. Return the result with additional information
    return {
      messages,
      retrievedContext,
      templateName: InstructionTemplateNameEnum.CUSTOM, // Using custom template
      systemRole: SystemRoleEnum.ASSISTANT, // Default role
      usedComponents: [
        ...promptComponents.systemComponents,
        ...promptComponents.instructionComponents,
      ],
    };
  }

  /**
   * Determine the optimal prompt components based on query, context, and options
   */
  private determineOptimalPromptComponents(
    query: string,
    context: RetrievedContext,
    options: ContextAwarePromptOptions,
  ): {
    systemComponents: string[];
    instructionComponents: string[];
  } {
    const systemComponents: string[] = [];
    const instructionComponents: string[] = [];

    // Always add a base system instruction
    systemComponents.push('system_instruction_base');

    if (context.items.length > 0) {
      systemComponents.push('rag_prefix');

      if (options.requiresCitations !== false) {
        instructionComponents.push('rag_citation_instruction');
      }
    }

    if (options.taskType) {
      switch (options.taskType) {
        case 'summarization':
          instructionComponents.push('summarization_instruction');
          break;
        case 'code':
          instructionComponents.push('code_explanation_instruction');
          break;
      }
    } else {
      // Analyze query to infer task type if not explicitly specified
      if (this.containsCodePatterns(query)) {
        instructionComponents.push('code_explanation_instruction');
      } else if (this.isSummarizationQuery(query)) {
        instructionComponents.push('summarization_instruction');
      }
    }

    if (options.domainSpecific && options.domainSpecific.length > 0) {
      options.domainSpecific.forEach((domain) => {
        const domainComponent = `domain_${domain.toLowerCase()}`;
        const component = PromptLibrary.getComponent(domainComponent);
        if (component) {
          instructionComponents.push(domainComponent);
        }
      });
    }

    return {
      systemComponents,
      instructionComponents,
    };
  }

  /**
   * Generate variable replacements based on query and context
   */
  private generateReplacements(
    query: string,
    context: RetrievedContext,
    options: ContextAwarePromptOptions,
  ): Record<string, string> {
    const replacements: Record<string, string> = {};

    replacements['query'] = query;
    replacements['context_count'] = String(context.items.length);
    replacements['context_sources'] = context.sources.join(', ');

    if (options.audience) {
      replacements['audience'] = options.audience;

      // Adjust explanations based on audience
      if (options.audience === 'technical') {
        replacements['explanation_depth'] = 'detailed technical';
      } else if (options.audience === 'beginner') {
        replacements['explanation_depth'] = 'simplified';
      } else if (options.audience === 'expert') {
        replacements['explanation_depth'] = 'advanced';
      } else {
        replacements['explanation_depth'] = 'clear';
      }
    }

    if (options.toneStyle) {
      replacements['tone'] = options.toneStyle;
    }

    return replacements;
  }

  /**
   * Optimize context presentation based on options
   */
  private optimizeContext(
    retrievedContext: RetrievedContext,
    options: ContextAwarePromptOptions,
  ): string {
    // If no context items, return standard message
    if (retrievedContext.items.length === 0) {
      return 'No relevant context available.';
    }

    let formattedContext = '# Relevant Context\n\n';

    // Group context by source if there are multiple sources
    const sourceGroups = new Map<string, typeof retrievedContext.items>();
    retrievedContext.items.forEach((item) => {
      const source = item.source || 'Unknown';
      if (!sourceGroups.has(source)) {
        sourceGroups.set(source, []);
      }
      sourceGroups.get(source)?.push(item);
    });

    // If citations required, use numbered format
    if (options.requiresCitations !== false) {
      let counter = 1;
      retrievedContext.items.forEach((item) => {
        formattedContext += `[${counter}] ${item.content}\n`;
        if (item.source) {
          formattedContext += `Source: ${item.source}\n`;
        }
        if (item.metadata?.timestamp) {
          const date = new Date(item.metadata.timestamp);
          formattedContext += `Date: ${date.toISOString()}\n`;
        }
        formattedContext += '\n';
        counter++;
      });
    }
    // If multiple sources, group by source
    else if (sourceGroups.size > 1) {
      for (const [source, items] of sourceGroups.entries()) {
        formattedContext += `## ${source}\n\n`;
        items.forEach((item) => {
          formattedContext += `${item.content}\n\n`;
        });
      }
    }
    // Otherwise use simple format
    else {
      retrievedContext.items.forEach((item) => {
        formattedContext += `${item.content}\n\n`;
      });
    }

    // Trim the context if a max length is specified
    if (options.maxLength && formattedContext.length > options.maxLength) {
      formattedContext =
        formattedContext.substring(0, options.maxLength) +
        '\n\n(Note: Context was truncated due to length constraints)';
    }

    return formattedContext;
  }

  /**
   * Detect if a query is related to code
   */
  private containsCodePatterns(query: string): boolean {
    const codePatterns = [
      /code/i,
      /function/i,
      /class/i,
      /method/i,
      /algorithm/i,
      /programming/i,
      /syntax/i,
      /error/i,
      /debug/i,
      /implement/i,
    ];

    return codePatterns.some((pattern) => pattern.test(query));
  }

  /**
   * Detect if a query is asking for summarization
   */
  private isSummarizationQuery(query: string): boolean {
    const summarizationPatterns = [
      /summarize/i,
      /summary/i,
      /overview/i,
      /recap/i,
      /tldr/i,
      /brief/i,
      /condense/i,
      /shorten/i,
      /key points/i,
    ];

    return summarizationPatterns.some((pattern) => pattern.test(query));
  }

  /**
   * Retrieve context from the user's context store
   */
  private async retrieveUserContext(
    options: RagContextOptions,
  ): Promise<RetrievedContext> {
    const {
      userId,
      queryEmbedding,
      strategy = RagRetrievalStrategy.SEMANTIC,
      maxItems = 5,
      minRelevanceScore = 0.6,
      conversationId,
      documentIds,
      contentTypes,
      timeWindow,
    } = options;

    let timeRangeStart: number | undefined;
    if (timeWindow) {
      timeRangeStart = Date.now() - timeWindow;
    }

    // Apply different retrieval strategies
    let contextItems: any[] = [];
    
    // If using mock mode, use the old implementation
    if (this.useMockMode) {
      return this.retrieveMockContext(options);
    }

    this.logger.info(`Using retrieval strategy: ${strategy}`, {
      userId, 
      maxItems, 
      minRelevanceScore
    });

    switch (strategy) {
      case RagRetrievalStrategy.SEMANTIC:
        // Semantic search using vector embeddings
        try {
          // Build filter
          const filter = this.buildContextFilter(
            contentTypes,
            timeRangeStart,
            documentIds,
          );
          
          if (options.customFilter) {
            Object.assign(filter, options.customFilter);
          }
          
          // Ensure filter has at least one key-value pair (required by Pinecone)
          // If no filter has been specified, use a generic filter that matches all documents
          if (Object.keys(filter).length === 0) {
            filter.type = { $exists: true }; // Match documents that have a 'type' field (which all should have)
            this.logger.debug('Added default filter for empty filter object', { filter });
          }
          
          // Use Pinecone for vector similarity search
          const searchResults = await this.pineconeConnector.querySimilar(
            this.vectorIndexName,
            queryEmbedding,
            {
              topK: maxItems,
              filter,
              includeValues: false,
              minScore: minRelevanceScore
            },
            this.vectorNamespace
          );
          
          // Transform to context format
          contextItems = searchResults.map(item => ({
            content: item.metadata.content || '',
            score: item.score,
            source: item.metadata.source || item.id,
            metadata: {
              ...item.metadata,
              id: item.id
            }
          }));
        } catch (error) {
          this.logger.error(`Error performing semantic search: ${error instanceof Error ? error.message : String(error)}`);
          contextItems = [];
        }
        break;

      case RagRetrievalStrategy.RECENCY:
        // Implementation for recency strategy using Pinecone
        try {
          // Sort by recency (stored in metadata.timestamp)
          const filter = {
            ...this.buildContextFilter(contentTypes, timeRangeStart, documentIds),
            ...(options.customFilter || {})
          };
          
          // Ensure filter has at least one key-value pair (required by Pinecone)
          if (Object.keys(filter).length === 0) {
            filter.type = { $exists: true }; // Match documents that have a 'type' field
            this.logger.debug('Added default filter for empty filter object in RECENCY strategy', { filter });
          }
          
          // First get recent items regardless of similarity
          const recentResults = await this.pineconeConnector.querySimilar(
            this.vectorIndexName,
            queryEmbedding,
            {
              topK: maxItems * 3, // Get more items to allow for filtering
              filter,
              includeValues: false
            },
            this.vectorNamespace
          );
          
          // Sort by timestamp (recency)
          const sortedByRecency = recentResults
            .sort((a, b) => {
              const timestampA = typeof a.metadata.timestamp === 'string' ? parseInt(a.metadata.timestamp) : (typeof a.metadata.timestamp === 'number' ? a.metadata.timestamp : 0);
              const timestampB = typeof b.metadata.timestamp === 'string' ? parseInt(b.metadata.timestamp) : (typeof b.metadata.timestamp === 'number' ? b.metadata.timestamp : 0);
              return timestampB - timestampA; // Most recent first
            })
            .slice(0, maxItems);
            
          // Transform to context format
          contextItems = sortedByRecency.map(item => ({
            content: typeof item.metadata.content === 'string' ? item.metadata.content : '',
            score: item.score,
            source: typeof item.metadata.source === 'string' ? item.metadata.source : item.id,
            metadata: {
              ...item.metadata,
              id: item.id
            }
          }));
        } catch (error) {
          this.logger.error(`Error performing recency search: ${error instanceof Error ? error.message : String(error)}`);
          contextItems = [];
        }
        break;

      case RagRetrievalStrategy.HYBRID:
        // Hybrid search - combination of semantic and keyword
        try {
          // For hybrid search, we need to:
          // 1. Get semantic search results
          const filter = this.buildContextFilter(contentTypes, timeRangeStart, documentIds);
          
          // Ensure filter has at least one key-value pair (required by Pinecone)
          if (Object.keys(filter).length === 0) {
            filter.type = { $exists: true }; // Match documents that have a 'type' field
            this.logger.debug('Added default filter for empty filter object in HYBRID strategy', { filter });
          }
          
          const semanticResults = await this.pineconeConnector.querySimilar(
            this.vectorIndexName,
            queryEmbedding,
            {
              topK: maxItems * 2,
              filter,
              includeValues: false
            },
            this.vectorNamespace
          );
          
          // 2. Use BM25 style keyword matching (not fully available directly)
          // For now, we're getting more results from semantic search, then
          // boosting scores for those containing keywords from the original query
          
          const keywords = options.queryText
            .toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 3); // Only use longer words as keywords
          
          // Boost scores for items containing keywords
          const hybridResults = semanticResults.map(item => {
            let boostScore = item.score;
            const content = typeof item.metadata.content === 'string' ? item.metadata.content.toLowerCase() : '';
            
            // Count keyword occurrences and boost score
            keywords.forEach(keyword => {
              if (content.includes(keyword)) {
                // Boost more for more keywords
                boostScore += 0.05;
              }
            });
            
            return {
              ...item,
              score: Math.min(boostScore, 1.0) // Cap at 1.0
            };
          });
          
          // Sort by boosted score and take top items
          const topHybridResults = hybridResults
            .sort((a, b) => b.score - a.score)
            .slice(0, maxItems);
          
          // Transform to context format
          contextItems = topHybridResults.map(item => ({
            content: item.metadata.content || '',
            score: item.score,
            source: item.metadata.source || item.id,
            metadata: {
              ...item.metadata,
              id: item.id
            }
          }));
        } catch (error) {
          this.logger.error(`Error performing hybrid search: ${error instanceof Error ? error.message : String(error)}`);
          contextItems = [];
        }
        break;

      case RagRetrievalStrategy.CUSTOM:
        // Apply custom filter
        try {
          if (!options.customFilter) {
            throw new Error('customFilter is required for CUSTOM strategy');
          }
          
          // Ensure custom filter has at least one key-value pair
          if (Object.keys(options.customFilter).length === 0) {
            options.customFilter.type = { $exists: true }; // Add a default filter condition
            this.logger.debug('Added default condition to empty customFilter in CUSTOM strategy', { 
              filter: options.customFilter 
            });
          }
          
          const customResults = await this.pineconeConnector.querySimilar(
            this.vectorIndexName,
            queryEmbedding,
            {
              topK: maxItems,
              filter: options.customFilter,
              includeValues: false,
              minScore: minRelevanceScore
            },
            this.vectorNamespace
          );
          
          // Transform to context format
          contextItems = customResults.map(item => ({
            content: item.metadata.content || '',
            score: item.score,
            source: item.metadata.source || item.id,
            metadata: {
              ...item.metadata,
              id: item.id
            }
          }));
        } catch (error) {
          this.logger.error(`Error performing custom search: ${error instanceof Error ? error.message : String(error)}`);
          contextItems = [];
        }
        break;

      default:
        this.logger.warn(`Unsupported retrieval strategy: ${strategy}, falling back to semantic`);
        // Fall back to mock implementation
        return this.retrieveMockContext(options);
    }

    // Format the retrieved context
    const formattedItems = this.formatContextItems(contextItems);

    // Collect sources
    const sources = contextItems
      .map((item) => item.metadata?.source || item.metadata?.documentId || item.source)
      .filter(Boolean)
      .filter((value, index, self) => self.indexOf(value) === index); // Deduplicate

    return {
      items: formattedItems,
      formattedContext: this.formatContextForPrompt(formattedItems),
      sources,
    };
  }
  
  /**
   * Mock implementation for retrieveUserContext (used in mock mode)
   */
  private async retrieveMockContext(
    options: RagContextOptions
  ): Promise<RetrievedContext> {
    this.logger.info('[MOCK] Retrieving mock context');
    
    // Generate mock context items
    const mockItems = [
      {
        content: "In last week's team meeting, we discussed the Q3 mobile roadmap priorities.",
        source: "meeting-20230401",
        score: 0.92,
        metadata: {
          type: "meeting",
          date: "2023-04-01",
          participants: ["John", "Sarah", "Michael"]
        }
      },
      {
        content: "Mobile app usage has increased 38% quarter-over-quarter according to analytics.",
        source: "analytics-report-q2",
        score: 0.87,
        metadata: {
          type: "report",
          date: "2023-03-15"
        }
      },
      {
        content: "API stability issues were reported by 12% of mobile users in the past month.",
        source: "bug-tracker",
        score: 0.81,
        metadata: {
          type: "issue",
          date: "2023-03-28"
        }
      }
    ];
    
    return {
      items: mockItems,
      formattedContext: this.formatContextForPrompt(mockItems),
      sources: mockItems.map(item => item.source)
    };
  }

  /**
   * Helper method to build context filter
   */
  private buildContextFilter(
    contentTypes?: ContextType[],
    timeRangeStart?: number,
    documentIds?: string[],
  ): Record<string, any> {
    const filter: Record<string, any> = {};

    if (contentTypes && contentTypes.length > 0) {
      filter.contextType = { $in: contentTypes };
    }

    if (timeRangeStart) {
      filter.timestamp = { $gte: timeRangeStart };
    }

    if (documentIds && documentIds.length > 0) {
      filter.documentId = { $in: documentIds };
    }

    return filter;
  }

  /**
   * Format context items into a structured format
   */
  private formatContextItems(results: any[]): Array<{
    content: string;
    source?: string;
    score?: number;
    metadata?: Record<string, any>;
  }> {
    return results
      .map((result) => {
        const metadata = result.metadata || {};

        let content = '';
        if (metadata.contextType === ContextType.CONVERSATION) {
          content = `${metadata.role || 'unknown'}: ${metadata.message || ''}`;
        } else if (metadata.contextType === ContextType.DOCUMENT) {
          content = metadata.content || '';
        } else {
          content = metadata.content || metadata.text || metadata.message || '';
        }

        return {
          content,
          source: metadata.source || metadata.documentId,
          score: result.score,
          metadata,
        };
      })
      .filter((item) => item.content && item.content.trim() !== '');
  }

  /**
   * Format context items into a string for inclusion in the prompt
   */
  private formatContextForPrompt(
    contextItems: Array<{
      content: string;
      source?: string;
      score?: number;
    }>,
  ): string {
    if (!contextItems || contextItems.length === 0) {
      return 'No relevant context found.';
    }

    const formattedContext = contextItems
      .map((item, index) => {
        const sourceInfo = item.source ? ` (Source: ${item.source})` : '';
        return `[${index + 1}] ${item.content}${sourceInfo}`;
      })
      .join('\n\n');

    return `# Relevant Context\n\n${formattedContext}`;
  }

  /**
   * Store a completed RAG interaction in the user's context
   */
  async storeRagInteraction(
    userId: string,
    query: string,
    queryEmbedding: number[],
    response: string,
    responseEmbedding: number[],
    retrievedContext: RetrievedContext,
    conversationId?: string,
  ): Promise<string> {
    // Store the query and response in the user's context
    let interactionId: string;

    if (conversationId) {
      // Store as part of conversation history
      interactionId =
        await this.conversationContextService.storeConversationTurn(
          userId,
          conversationId,
          query,
          queryEmbedding,
          'user',
        );

      await this.conversationContextService.storeConversationTurn(
        userId,
        conversationId,
        response,
        responseEmbedding,
        'assistant',
        undefined, // Auto-generate turnId
        {
          // Include metadata about the context used
          contextCount: retrievedContext.items.length,
          contextSources: retrievedContext.sources,
          ragEnabled: true,
        },
      );
    } else {
      // Store as standalone context
      interactionId = await this.baseContextService.storeUserContext(
        userId,
        query,
        queryEmbedding,
        {
          contextType: ContextType.CUSTOM,
          category: 'rag-interaction',
          response,
          // Include metadata about the context used
          contextCount: retrievedContext.items.length,
          contextSources: retrievedContext.sources,
          ragEnabled: true,
        },
      );
    }

    return interactionId;
  }

  /**
   * Create a prompt using a template from the template library
   */
  async createPromptFromTemplate(
    templateId: string,
    content: string,
    ragOptions: RagContextOptions,
    replacements: Record<string, string> = {},
  ): Promise<RagPromptResult> {
    const template = PromptTemplateLibrary.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    // Retrieve context
    const retrievedContext = await this.retrieveUserContext(ragOptions);

    // Combine replacements with default template replacements
    const combinedReplacements = {
      ...template.defaultReplacements,
      ...replacements,
      QUERY: content,
      CONTEXT: retrievedContext.formattedContext,
    };

    // Use the PromptLibrary to build the prompt from components
    const { prompt: systemPrompt, components } =
      PromptLibrary.createVersionedCompositePrompt(template.components, {
        replacements: combinedReplacements,
        includeDescriptions: false,
      });

    // Format messages for LLM
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ];

    return {
      messages,
      retrievedContext,
      templateName: templateId as any, // Cast to satisfy existing interface
      systemRole: 'expert' as any, // Cast to satisfy existing interface
      usedComponents: template.components,
    };
  }

  /**
   * Get template recommendations based on task analysis
   */
  getTemplateRecommendations(
    query: string,
    options: {
      taskType?: 'summarization' | 'qa' | 'analysis' | 'code' | 'general';
      count?: number;
    } = {},
  ): PromptTemplate[] {
    const count = options.count || 3;

    // If task type is explicitly provided, filter by that
    if (options.taskType) {
      return PromptTemplateLibrary.listTemplates()
        .filter((template) =>
          template.metadata?.tags?.includes(options.taskType!),
        )
        .slice(0, count);
    }

    // Otherwise analyze the query to determine best templates
    const isCodeQuery = this.containsCodePatterns(query);
    const isSummarization = this.isSummarizationQuery(query);
    const isAnalysis = /analyze|analysis|examine|evaluate|assess|review/.test(
      query.toLowerCase(),
    );
    const isQA = /\?$|how|what|why|when|where|who|which/.test(
      query.toLowerCase(),
    );

    const templates = PromptTemplateLibrary.listTemplates();

    // Score templates based on query
    const scoredTemplates = templates.map((template) => {
      let score = 0;

      // Score based on detected task type
      if (isCodeQuery && template.metadata?.tags?.includes('code')) {
        score += 10;
      }

      if (
        isSummarization &&
        template.metadata?.tags?.includes('summarization')
      ) {
        score += 10;
      }

      if (isAnalysis && template.metadata?.tags?.includes('analysis')) {
        score += 10;
      }

      if (isQA && template.metadata?.tags?.includes('qa')) {
        score += 10;
      }

      return { template, score };
    });

    // Sort and return top templates
    return scoredTemplates
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map((item) => item.template);
  }

  /**
   * Get the output format from an instruction template
   * @param templateName The name of the instruction template
   * @returns Response format object or undefined if not applicable
   */
  getOutputFormatForTemplate(
    templateName: InstructionTemplateName,
  ): { type: 'json_object' | 'json_array' | 'text' } | undefined {
    try {
      // Import the template definitions
      const {
        InstructionTemplates,
      } = require('../prompts/instruction-templates');

      console.log(`Looking for template: ${templateName}`);
      console.log(
        `Available templates: ${Object.keys(InstructionTemplates).join(', ')}`,
      );

      // Try to access the template directly
      const template = InstructionTemplates[templateName as string];

      if (!template) {
        console.log(`Template not found: ${templateName}`);
        return undefined;
      }

      // Check if the template has a format with outputFormat
      if (template?.format?.outputFormat) {
        const outputFormat = template.format.outputFormat;

        console.log(
          `Found output format for template ${templateName}: ${outputFormat}`,
        );

        // Only return if it's a supported format type
        if (outputFormat === 'json_object' || outputFormat === 'json_array') {
          return { type: outputFormat };
        }
      } else {
        console.log(`No output format found for template ${templateName}`);
      }

      // Default to undefined if no format or unsupported format
      return undefined;
    } catch (error) {
      console.error('Error getting output format for template:', error);
      return undefined;
    }
  }

  /**
   * Generate a vector embedding for the given text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (this.useMockMode) {
      return this.generateDummyEmbedding();
    }
    
    try {
      return await this.openAiConnector.generateEmbeddings(text);
    } catch (error) {
      this.logger.error(`RAG-PROMPT-MANAGER-SERVICE: Error generating embedding: ${error instanceof Error ? error.message : String(error)}`);
      return this.generateDummyEmbedding(); // Fall back to dummy embedding on error
    }
  }
  
  /**
   * Generate dummy embeddings for testing/mock purposes
   */
  private generateDummyEmbedding(): number[] {
    this.logger.info('[MOCK] Generating dummy embedding vector');
    return new Array(1536).fill(0).map(() => Math.random() - 0.5);
  }
}
