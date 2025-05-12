import OpenAI from 'openai';

import { splitTranscript } from '../shared/utils/split-transcript';
import { isValidJSON, cleanJsonArray, Ticket } from './jira-ticket-generator';
import {
  RagRetrievalStrategy,
  RagPromptManager,
} from '../shared/services/rag-prompt-manager.service';
import { ContextType } from '../shared/services/user-context/context-types';
import { InstructionTemplateNameEnum } from '../shared/prompts/instruction-templates';
import { SystemRoleEnum } from '../shared/prompts/prompt-types';
import { Logger } from '../shared/logger/logger.interface';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { OpenAIConnector } from '../connectors/openai-connector';
import { UnifiedRAGService } from '../rag/core/unified-rag.service';
import { DocumentContextProvider } from '../rag/context/document-context-provider';
import { ConversationMemoryService } from '../rag/memory/conversation-memory.service';

/**
 * Generate Jira tickets using RAG-enhanced context
 *
 * This version enhances the basic ticket generator by:
 * 1. Using relevant past tickets as context
 * 2. Including domain-specific documentation
 * 3. Considering user preferences and project context
 *
 * @param transcript The meeting transcript to generate tickets from
 * @param userId The user's ID for context retrieval
 * @param embeddings Vector embeddings of the transcript (pre-computed)
 * @param options Additional options for ticket generation
 * @returns Array of generated Jira tickets
 */
export async function generateRagTickets(
  transcript: string,
  userId: string,
  embeddings: number[],
  options: {
    projectId?: string;
    teamIds?: string[];
    conversationId?: string;
    previousTicketIds?: string[];
    retrievalStrategy?: RagRetrievalStrategy;
  } = {},
): Promise<Ticket[]> {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chunks = splitTranscript(transcript, 1600, 4);
    const ragManager = new RagPromptManager();

    // Process each chunk with RAG-enhanced context
    const partialTickets: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Calculate chunk-specific embeddings (simplified - in practice you'd use a proper embedding API)
      const chunkEmbedding =
        i === 0
          ? embeddings // Use the full transcript embedding for first chunk as approximation
          : embeddings.map((v) => v * (1 - i * 0.1)); // Crude approximation for demonstration

      // Build context retrieval options
      const contextOptions = {
        userId,
        queryText: chunk,
        queryEmbedding: chunkEmbedding,
        strategy: options.retrievalStrategy || RagRetrievalStrategy.HYBRID,
        maxItems: 5,
        minRelevanceScore: 0.7,
        conversationId: options.conversationId,
        documentIds: options.previousTicketIds,
        contentTypes: [ContextType.DOCUMENT, ContextType.CONVERSATION],
        timeWindow: 30 * 24 * 60 * 60 * 1000, // Last 30 days
      };

      // Generate RAG-enhanced prompt with context
      const ragPrompt = await ragManager.createRagPrompt(
        SystemRoleEnum.AGILE_COACH,
        InstructionTemplateNameEnum.TICKET_GENERATION,
        chunk,
        contextOptions,
      );

      // Make API call with the enhanced prompt
      const completion = await client.chat.completions.create({
        messages:
          ragPrompt.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        model: 'gpt-4',
        max_tokens: 1500,
        temperature: 0.2,
      });

      const chunkResult = completion.choices[0].message?.content?.trim();
      if (chunkResult) {
        partialTickets.push(chunkResult);

        // Store this interaction for future context
        if (options.conversationId) {
          await ragManager.storeRagInteraction(
            userId,
            chunk,
            chunkEmbedding,
            chunkResult,
            chunkEmbedding, // Simplified - should use proper embedding for response
            ragPrompt.retrievedContext,
            options.conversationId,
          );
        }
      }
    }

    // Clean and combine the ticket results
    const cleanedTickets: Ticket[] = [];
    partialTickets.forEach((partialTicket) => {
      const cleanedPartialTickets: Ticket[] =
        cleanJsonArray<Ticket>(partialTicket);
      cleanedTickets.push(...cleanedPartialTickets);
    });

    return cleanedTickets;
  } catch (error) {
    console.error('Error in generateRagTickets:', error);
    throw error;
  }
}

export interface JiraTicket {
  summary: string;
  description: string;
  priority: 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
  type: 'Bug' | 'Task' | 'Story' | 'Epic';
  labels?: string[];
  components?: string[];
  assignee?: string;
  reporterId?: string;
  projectKey: string;
  acceptanceCriteria?: string;
  stepsToReproduce?: string[];
  affectedVersions?: string[];
}

export interface TicketGenerationOptions {
  userInput: string;
  projectKey: string;
  userId?: string;
  conversationId?: string;
  includeContext?: boolean;
  sourceDocuments?: string[];
  similarTicketsLimit?: number;
}

/**
 * RAG-powered Jira ticket generator
 */
export class RAGTicketGenerator {
  private logger: Logger;
  private openAiConnector: OpenAIConnector;
  private ragService: UnifiedRAGService;
  private conversationMemory?: ConversationMemoryService;
  
  constructor(options: {
    logger?: Logger;
    openAiConnector?: OpenAIConnector;
    ragService?: UnifiedRAGService;
    enableConversationMemory?: boolean;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.openAiConnector = options.openAiConnector || new OpenAIConnector({ logger: this.logger });
    
    if (options.ragService) {
      this.ragService = options.ragService;
    } else {
      // Initialize document context provider
      const documentProvider = new DocumentContextProvider({
        logger: this.logger,
        openAiConnector: this.openAiConnector
      });
      
      // Initialize conversation memory if requested
      if (options.enableConversationMemory) {
        this.conversationMemory = new ConversationMemoryService({
          logger: this.logger,
          openAiConnector: this.openAiConnector
        });
      }
      
      // Initialize RAG service
      this.ragService = new UnifiedRAGService({
        logger: this.logger,
        openAiConnector: this.openAiConnector,
        contextProviders: {
          document: documentProvider
        },
        conversationMemory: this.conversationMemory
      });
    }
    
    this.logger.info('RAG Ticket Generator initialized', {
      hasConversationMemory: !!this.conversationMemory
    });
  }
  
  /**
   * Generate a Jira ticket using RAG techniques
   * @param options Ticket generation options
   * @returns Generated Jira ticket
   */
  async generateTicket(options: TicketGenerationOptions): Promise<JiraTicket> {
    const startTime = performance.now();
    
    try {
      this.logger.info('Generating Jira ticket', {
        projectKey: options.projectKey,
        inputLength: options.userInput.length
      });
      
      // Store conversation if enabled
      if (this.conversationMemory && options.conversationId) {
        await this.conversationMemory.addMessage(
          options.conversationId,
          'user',
          options.userInput,
          { projectKey: options.projectKey }
        );
      }
      
      // Generate enhanced prompt with context if requested
      let enhancedPrompt;
      
      if (options.includeContext !== false) {
        const promptTemplate = `
Based on the provided context and user request, generate a well-formatted Jira ticket.

CONTEXT:
{context}

USER REQUEST:
{query}

Create a complete Jira ticket with the following fields:
- Summary (concise, clear title)
- Description (detailed explanation with context)
- Type (Bug, Task, Story, or Epic)
- Priority (Highest, High, Medium, Low, or Lowest)
- Labels (relevant categories)
- Components (affected parts of the system)
- Acceptance Criteria (for Stories/Tasks)
- Steps to Reproduce (for Bugs)

Format your response as a valid JSON object matching the JiraTicket interface.
`;
        
        // If we have conversation memory and ID, use it for additional context
        if (this.conversationMemory && options.conversationId) {
          enhancedPrompt = await this.ragService.createPromptWithConversationContext(
            options.userInput,
            promptTemplate,
            options.conversationId,
            {
              limit: options.similarTicketsLimit || 3,
              minScore: 0.7,
              distinctSources: true,
              includeConversationHistory: true,
              maxHistoryMessages: 5
            }
          );
        } else {
          // Standard context retrieval
          enhancedPrompt = await this.ragService.createContextEnhancedPrompt(
            options.userInput,
            promptTemplate,
            {
              limit: options.similarTicketsLimit || 3,
              minScore: 0.7,
              distinctSources: true
            }
          );
        }
      } else {
        // No context enhancement
        enhancedPrompt = {
          prompt: `
Based on the user request, generate a well-formatted Jira ticket.

USER REQUEST:
${options.userInput}

Create a complete Jira ticket with the following fields:
- Summary (concise, clear title)
- Description (detailed explanation)
- Type (Bug, Task, Story, or Epic)
- Priority (Highest, High, Medium, Low, or Lowest)
- Labels (relevant categories)
- Components (affected parts of the system)
- Acceptance Criteria (for Stories/Tasks)
- Steps to Reproduce (for Bugs)

Format your response as a valid JSON object matching the JiraTicket interface.
`,
          context: '',
          sources: []
        };
      }
      
      // Generate ticket content
      const systemPrompt = `You are an AI assistant that specializes in generating well-structured Jira tickets based on user requirements. 
Create detailed, actionable tickets that follow Jira best practices. Always include the projectKey provided by the user.
Format your response as a valid JSON object with no additional explanatory text.`;
      
      const response = await this.openAiConnector.generateResponse([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: enhancedPrompt.prompt }
      ], {
        temperature: 0.3,
        maxTokens: 1500,
        responseFormat: { type: 'json_object' }
      });
      
      // Parse response as JSON
      let ticket: JiraTicket;
      try {
        ticket = JSON.parse(String(response));
        
        // Ensure project key is set
        if (!ticket.projectKey) {
          ticket.projectKey = options.projectKey;
        }
        
        // Add metadata about context sources
        if (enhancedPrompt.sources && enhancedPrompt.sources.length > 0) {
          const contextSources = enhancedPrompt.sources.map(source => 
            `- ${source.type}: ${source.id}`
          ).join('\n');
          
          // Append sources to description
          ticket.description += `\n\n---\nThis ticket was generated with context from:\n${contextSources}`;
        }
      } catch (error) {
        this.logger.error('Error parsing ticket JSON', {
          error: error instanceof Error ? error.message : String(error),
          rawResponse: String(response)
        });
        
        // Fallback to basic ticket
        ticket = {
          summary: "Failed to parse AI-generated ticket",
          description: String(response),
          priority: "Medium",
          type: "Task",
          projectKey: options.projectKey
        };
      }
      
      // Store assistant response if conversation memory is enabled
      if (this.conversationMemory && options.conversationId) {
        await this.conversationMemory.addMessage(
          options.conversationId,
          'assistant',
          JSON.stringify(ticket, null, 2)
        );
      }
      
      const processingTime = performance.now() - startTime;
      this.logger.info('Generated Jira ticket', {
        ticketType: ticket.type,
        priority: ticket.priority,
        processingTimeMs: processingTime.toFixed(2)
      });
      
      return ticket;
    } catch (error) {
      this.logger.error('Error generating Jira ticket', {
        error: error instanceof Error ? error.message : String(error),
        projectKey: options.projectKey
      });
      
      // Return a basic error ticket
      return {
        summary: "Error generating ticket",
        description: `Failed to generate Jira ticket from input: ${error instanceof Error ? error.message : String(error)}`,
        priority: "Medium",
        type: "Task",
        projectKey: options.projectKey
      };
    }
  }
  
  /**
   * Index existing Jira tickets and documentation for context retrieval
   * @param documents Array of document content and metadata
   * @returns Success status
   */
  async indexDocuments(documents: Array<{
    content: string;
    metadata: Record<string, any>;
    sourceType?: string;
  }>): Promise<{ success: boolean; indexedCount: number }> {
    try {
      this.logger.info('Indexing documents for RAG', {
        documentCount: documents.length
      });
      
      let indexedCount = 0;
      
      // Process each document
      for (const doc of documents) {
        await this.ragService.processContent(
          doc.content,
          doc.sourceType || 'document',
          doc.metadata,
          {
            chunkSize: 500,
            chunkOverlap: 50,
            metadata: doc.metadata
          }
        );
        
        indexedCount++;
      }
      
      this.logger.info('Successfully indexed documents', {
        indexedCount
      });
      
      return { success: true, indexedCount };
    } catch (error) {
      this.logger.error('Error indexing documents', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return { success: false, indexedCount: 0 };
    }
  }
}
