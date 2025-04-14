// TODOO Remove User context service
import { PromptManager } from './prompt-manager.service.ts';
import { SystemRoleEnum, type SystemRole } from '../prompts/prompt-types.ts';
import {
  InstructionTemplateNameEnum,
  type InstructionTemplateName,
} from '../prompts/instruction-templates.ts';
import { ContextType } from '../user-context/context-types.ts';
import {
  PromptLibrary,
  PromptCompositionOptions,
} from '../prompts/prompt-library.ts';

// Import specialized context services instead of the deprecated UserContextService
import { BaseContextService } from '../user-context/services/base-context.service.ts';
import { DocumentContextService } from '../user-context/services/document-context.service.ts';
import { ConversationContextService } from '../user-context/services/conversation-context.service.ts';
import { RelevanceCalculationService } from '../user-context/services/relevance-calculation.service.ts';

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

  constructor() {
    this.baseContextService = new BaseContextService();
    this.documentContextService = new DocumentContextService();
    this.conversationContextService = new ConversationContextService();
    this.relevanceCalculationService = new RelevanceCalculationService();

    // Ensure the PromptLibrary is initialized
    PromptLibrary.initialize();

    // Initialize template library
    PromptTemplateLibrary.initialize();
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

    // 2. Use the base PromptManager to create the prompt with the retrieved context
    const prompt = PromptManager.createPrompt(
      role,
      templateName,
      content,
      retrievedContext.formattedContext,
    );

    // 3. Return the result with additional RAG-specific information
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
      // Add instruction components if available
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
      // Add context as a system message
      { role: 'system', content: enhancedContext },
      // Add the user query
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

    // Add RAG-specific components
    if (context.items.length > 0) {
      systemComponents.push('rag_prefix');

      // Add citation instruction if required
      if (options.requiresCitations !== false) {
        instructionComponents.push('rag_citation_instruction');
      }
    }

    // Add task-specific components
    if (options.taskType) {
      switch (options.taskType) {
        case 'summarization':
          instructionComponents.push('summarization_instruction');
          break;
        case 'code':
          instructionComponents.push('code_explanation_instruction');
          break;
        // Add other task types as needed
      }
    } else {
      // Analyze query to infer task type if not explicitly specified
      if (this.containsCodePatterns(query)) {
        instructionComponents.push('code_explanation_instruction');
      } else if (this.isSummarizationQuery(query)) {
        instructionComponents.push('summarization_instruction');
      }
    }

    // Add domain-specific components if available and relevant
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

    // Add common replacements
    replacements['query'] = query;
    replacements['context_count'] = String(context.items.length);
    replacements['context_sources'] = context.sources.join(', ');

    // Add audience-specific replacements
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

    // Add tone-specific replacements
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

    // Build the time range filter if specified
    let timeRangeStart: number | undefined;
    if (timeWindow) {
      timeRangeStart = Date.now() - timeWindow;
    }

    // Apply different retrieval strategies
    let contextItems: any[] = [];

    switch (strategy) {
      case RagRetrievalStrategy.SEMANTIC:
        // Semantic search using vector embeddings
        const semanticResults =
          await this.baseContextService.retrieveUserContext(
            userId,
            queryEmbedding,
            {
              topK: maxItems,
              filter: this.buildContextFilter(
                contentTypes,
                timeRangeStart,
                documentIds,
              ),
              includeEmbeddings: false,
            },
          );

        contextItems = semanticResults;
        break;

      case RagRetrievalStrategy.HYBRID:
        // First get semantic results
        const semanticMatches =
          await this.baseContextService.retrieveUserContext(
            userId,
            queryEmbedding,
            {
              topK: Math.ceil(maxItems / 2),
              filter: this.buildContextFilter(
                contentTypes,
                timeRangeStart,
                documentIds,
              ),
              includeEmbeddings: false,
            },
          );

        // Then get conversation context if applicable
        let conversationMatches: any[] = [];
        if (conversationId) {
          conversationMatches =
            await this.conversationContextService.getConversationHistory(
              userId,
              conversationId,
              Math.floor(maxItems / 2),
            );
        }

        // Combine both sources
        contextItems = [...semanticMatches, ...conversationMatches];

        // Deduplicate by ID
        const seenIds = new Set<string>();
        contextItems = contextItems.filter((item) => {
          if (item.id && seenIds.has(item.id)) {
            return false;
          }
          if (item.id) {
            seenIds.add(item.id);
          }
          return true;
        });
        break;

      case RagRetrievalStrategy.CONVERSATION:
        // Focus on conversation history
        if (!conversationId) {
          throw new Error(
            'conversationId is required for CONVERSATION strategy',
          );
        }

        contextItems =
          await this.conversationContextService.getConversationHistory(
            userId,
            conversationId,
            maxItems,
          );
        break;

      case RagRetrievalStrategy.DOCUMENT:
        // Retrieve document chunks
        if (!documentIds || documentIds.length === 0) {
          throw new Error('documentIds are required for DOCUMENT strategy');
        }

        for (const docId of documentIds) {
          const chunks = await this.documentContextService.getDocumentChunks(
            userId,
            docId,
          );
          contextItems.push(...chunks);
        }

        // Sort by chunk index to maintain document order
        contextItems = contextItems.sort(
          (a: any, b: any) =>
            (a.metadata?.chunkIndex || 0) - (b.metadata?.chunkIndex || 0),
        );
        break;

      case RagRetrievalStrategy.RECENCY:
        // Prioritize recent context with a more inclusive semantic search
        const recentResults = await this.baseContextService.retrieveUserContext(
          userId,
          queryEmbedding,
          {
            topK: maxItems * 2, // Get more items to filter later
            filter: this.buildContextFilter(contentTypes, timeRangeStart),
            includeEmbeddings: false,
          },
        );

        // Sort by timestamp (recency) and take the most recent ones
        contextItems = recentResults
          .sort(
            (a: any, b: any) =>
              (b.metadata?.timestamp || 0) - (a.metadata?.timestamp || 0),
          )
          .slice(0, maxItems);
        break;

      case RagRetrievalStrategy.CUSTOM:
        // Apply custom filter
        if (!options.customFilter) {
          throw new Error('customFilter is required for CUSTOM strategy');
        }

        const customResults = await this.baseContextService.retrieveUserContext(
          userId,
          queryEmbedding,
          {
            topK: maxItems,
            filter: {
              ...this.buildContextFilter(contentTypes),
              ...options.customFilter,
            },
            includeEmbeddings: false,
          },
        );

        contextItems = customResults;
        break;

      case RagRetrievalStrategy.METADATA:
        // Implement metadata-based filtering
        throw new Error('METADATA strategy not implemented');
        break;

      case RagRetrievalStrategy.COMBINED:
        // Implement combined strategy
        throw new Error('COMBINED strategy not implemented');
        break;

      default:
        throw new Error(`Unsupported retrieval strategy: ${strategy}`);
    }

    // Filter by minimum relevance score if specified
    if (minRelevanceScore > 0) {
      contextItems = contextItems.filter(
        (item) => (item.score || 0) >= minRelevanceScore,
      );
    }

    // Format the retrieved context
    const formattedItems = this.formatContextItems(contextItems);

    // Collect sources
    const sources = contextItems
      .map((item) => item.metadata?.source || item.metadata?.documentId)
      .filter(Boolean)
      .filter((value, index, self) => self.indexOf(value) === index); // Deduplicate

    return {
      items: formattedItems,
      formattedContext: this.formatContextForPrompt(formattedItems),
      sources,
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

    // Get all templates
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
}
