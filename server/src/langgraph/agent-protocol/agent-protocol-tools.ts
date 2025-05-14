import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { PineconeConnector } from '../../connectors/pinecone-connector';
import { ServiceRegistry } from '../agentic-meeting-analysis/services/service-registry';
import { MeetingRAGIntegrator } from '../agentic-meeting-analysis/api-compatibility/meeting-rag-integrator';
import { Tool } from './agent-protocol.interface';
import { 
  InstructionTemplateNameEnum 
} from '../../shared/prompts/instruction-templates';
import { SystemRoleEnum } from '../../shared/prompts/prompt-types';
import { TopicExtractionServiceImpl } from '../agentic-meeting-analysis/services/topic-extraction.service';
import { ActionItemExtractionServiceImpl } from '../agentic-meeting-analysis/services/action-extraction.service';
import { RagPromptManager, RagRetrievalStrategy } from '../../shared/services/rag-prompt-manager.service';
import { InstructionTemplateService, ResponseFormatType } from '../../shared/services/instruction-template.service';
import { MessageConfig } from '../../connectors/language-model-provider.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * Configuration for Agent Protocol Tools
 */
export interface AgentProtocolToolsConfig {
  logger?: Logger;
  openAiConnector?: OpenAIConnector;
  pineconeConnector?: PineconeConnector;
}

/**
 * Tool implementation for meeting analysis
 */
export class AgentProtocolTools {
  private logger: Logger;
  private openAiConnector: OpenAIConnector;
  private pineconeConnector?: PineconeConnector;
  private meetingRagIntegrator?: MeetingRAGIntegrator;
  private topicExtractionService?: TopicExtractionServiceImpl;
  private actionItemExtractionService?: ActionItemExtractionServiceImpl;
  private ragPromptManager: RagPromptManager;
  private instructionTemplateService: InstructionTemplateService;
  
  /**
   * Create a new Agent Protocol Tools instance
   */
  constructor(config: AgentProtocolToolsConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    
    // Get OpenAI connector from config or service registry
    if (config.openAiConnector) {
      this.openAiConnector = config.openAiConnector;
    } else {
      const registry = ServiceRegistry.getInstance();
      const openAiConnector = registry.getOpenAIConnector();
      
      if (!openAiConnector) {
        throw new Error('OpenAI connector is required but not available in service registry');
      }
      
      this.openAiConnector = openAiConnector;
    }
    
    // Get Pinecone connector if available
    if (config.pineconeConnector) {
      this.pineconeConnector = config.pineconeConnector;
    } else {
      const registry = ServiceRegistry.getInstance();
      this.pineconeConnector = registry.getPineconeConnector();
    }
    
    // Initialize services
    this.topicExtractionService = new TopicExtractionServiceImpl(this.logger);
    this.actionItemExtractionService = new ActionItemExtractionServiceImpl({
      logger: this.logger
    });
    this.ragPromptManager = new RagPromptManager({
      openAiConnector: this.openAiConnector,
      logger: this.logger
    });
    
    // Initialize instruction template service
    this.instructionTemplateService = new InstructionTemplateService({
      openAiConnector: this.openAiConnector,
      ragPromptManager: this.ragPromptManager,
      logger: this.logger
    });
    
    // Initialize RAG integrator if Pinecone is available
    if (this.pineconeConnector) {
      this.initializeRagIntegrator();
    }
    
    this.logger.info('Agent Protocol Tools initialized');
  }
  
  /**
   * Initialize the RAG integrator
   */
  private initializeRagIntegrator(): void {
    try {
      this.meetingRagIntegrator = new MeetingRAGIntegrator({
        logger: this.logger,
        openAiConnector: this.openAiConnector,
        pineconeConnector: this.pineconeConnector!,
        config: {
          enabled: process.env.ENABLE_RAG !== 'false', // Enable by default unless explicitly disabled
          indexName: process.env.PINECONE_TRANSCRIPT_INDEX || 'transcript-embeddings'
        }
      });
      
      this.logger.info('Meeting RAG Integrator initialized for Agent Protocol Tools');
    } catch (error) {
      this.logger.error('Failed to initialize Meeting RAG Integrator', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Get the available tools
   */
  getAvailableTools(): Tool[] {
    const tools: Tool[] = [
      {
        name: "extract_topics",
        description: "Extract main topics from meeting transcript",
        parameters: {
          type: "object",
          properties: {
            transcript: {
              type: "string",
              description: "The meeting transcript to analyze"
            }
          },
          required: ["transcript"]
        }
      },
      {
        name: "identify_action_items",
        description: "Identify action items and their assignees",
        parameters: {
          type: "object",
          properties: {
            transcript: {
              type: "string",
              description: "The meeting transcript to analyze"
            },
            topics: {
              type: "array",
              description: "Previously identified topics (optional)",
              items: { type: "string" }
            }
          },
          required: ["transcript"]
        }
      },
      {
        name: "generate_summary",
        description: "Generate a summary of the meeting",
        parameters: {
          type: "object",
          properties: {
            transcript: {
              type: "string",
              description: "The meeting transcript to analyze"
            },
            topics: {
              type: "array",
              description: "Identified topics",
              items: { type: "string" }
            },
            action_items: {
              type: "array",
              description: "Identified action items",
              items: { type: "object" }
            }
          },
          required: ["transcript"]
        }
      }
    ];
    
    // Add RAG-specific tools if available
    if (this.meetingRagIntegrator) {
      tools.push({
        name: "retrieve_meeting_context",
        description: "Retrieve relevant context from previous meetings",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query for relevant context"
            },
            meeting_id: {
              type: "string",
              description: "Current meeting ID"
            },
            max_results: {
              type: "number",
              description: "Maximum number of results to return"
            }
          },
          required: ["query"]
        }
      });
      
      tools.push({
        name: "process_transcript",
        description: "Process and store meeting transcript for RAG",
        parameters: {
          type: "object",
          properties: {
            meeting_id: {
              type: "string",
              description: "Meeting ID"
            },
            transcript: {
              type: "string",
              description: "Meeting transcript"
            },
            session_id: {
              type: "string",
              description: "Analysis session ID"
            }
          },
          required: ["meeting_id", "transcript"]
        }
      });
    }
    
    return tools;
  }
  
  /**
   * Execute a tool
   */
  async executeTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    this.logger.info(`Executing tool: ${toolName}`, { parameters });
    
    switch (toolName) {
      case 'extract_topics':
        return this.extractTopics(parameters as { transcript: string });
        
      case 'identify_action_items':
        return this.identifyActionItems(parameters as { transcript: string; topics?: string[] });
        
      case 'generate_summary':
        return this.generateSummary(parameters as { transcript: string; topics?: any[]; action_items?: any[] });
        
      case 'retrieve_meeting_context':
        return this.retrieveMeetingContext(parameters as { query: string; meeting_id?: string; max_results?: number });
        
      case 'process_transcript':
        return this.processTranscript(parameters as { meeting_id: string; transcript: string; session_id?: string });
        
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
  
  /**
   * Extract topics from a transcript
   */
  private async extractTopics(parameters: { transcript: string }): Promise<any> {
    this.logger.info('Extracting topics from transcript');
    const { transcript } = parameters;
    
    if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
      return {
        error: 'Invalid or empty transcript provided',
        topics: []
      };
    }
    
    try {
      // Generate query embedding for RAG
      let queryEmbedding: number[];
      try {
        const queryText = `Extract topics from: ${transcript.substring(0, 500)}`;
        queryEmbedding = await this.openAiConnector.generateEmbedding(queryText);
        this.logger.info('Generated real embeddings for topic extraction query');
      } catch (error) {
        this.logger.error('Error generating embeddings for topic extraction', { error });
        // Fallback to dummy embeddings
        queryEmbedding = new Array(1536).fill(0).map(() => Math.random() - 0.5);
        this.logger.warn('Using fallback dummy embeddings due to error');
      }
      
      // Use the instruction template service to create a specialized prompt
      const promptResult = await this.instructionTemplateService.createSpecializedPrompt(
        'topic_discovery',
        transcript,
        {
          userId: 'system',
          transcript: transcript.substring(0, 2000),
          // Use RAG context retrieval with proper options
          ragOptions: {
            userId: 'system',
            queryEmbedding: queryEmbedding,
            strategy: RagRetrievalStrategy.SEMANTIC,
            maxItems: 3,
            filters: { type: { $exists: true } }
          }
        }
      );
      
      // Call to language model to extract topics
      try {
        const response = await this.openAiConnector.generateResponse(
          promptResult.messages as MessageConfig[],
          {
            temperature: 0.3,
            model: process.env.OPENAI_TOPICS_MODEL || process.env.OPENAI_MODEL_NAME || 'gpt-4o',
            maxTokens: 2000,
            responseFormat: 
              promptResult.responseFormat === ResponseFormatType.JSON_OBJECT 
                ? { type: 'json_object' } 
                : undefined
          }
        );
        
        const responseText = response.content || response.toString();
        
        // Parse JSON safely with proper error handling
        try {
          // Extract JSON from the response if it's not pure JSON
          const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || 
                          responseText.match(/```\s*([\s\S]*?)\s*```/) ||
                          responseText.match(/{[\s\S]*}/);
          
          let parsedResponse;
          if (jsonMatch) {
            parsedResponse = JSON.parse(jsonMatch[0].startsWith('{') ? jsonMatch[0] : jsonMatch[1]);
          } else {
            parsedResponse = JSON.parse(responseText);
          }
          
          // Validate and ensure the response has the correct structure
          if (!parsedResponse.topics || !Array.isArray(parsedResponse.topics)) {
            parsedResponse.topics = [];
          }
          
          // Ensure each topic has an ID and all required fields
          parsedResponse.topics = parsedResponse.topics.map((topic: any) => ({
            id: topic.id || `topic-${uuidv4().substring(0, 8)}`,
            name: topic.name || 'Undefined Topic',
            description: topic.description || 'No description provided',
            keywords: Array.isArray(topic.keywords) ? topic.keywords : [],
            relevance: typeof topic.relevance === 'number' ? 
              Math.min(Math.max(topic.relevance, 0), 1) : 0.5
          }));
          
          return parsedResponse;
        } catch (jsonError) {
          this.logger.error('Error parsing JSON response', {
            error: jsonError instanceof Error ? jsonError.message : String(jsonError),
            response: responseText
          });
          
          // Return a structured error response
          return {
            error: 'Failed to parse topic extraction results',
            topics: [],
            rawResponse: responseText
          };
        }
      } catch (llmError) {
        this.logger.error('Error calling OpenAI for topic extraction', {
          error: llmError instanceof Error ? llmError.message : String(llmError)
        });
        
        // Fallback response
        return {
          error: 'Failed to extract topics due to LLM error',
          topics: [],
          errorDetails: llmError instanceof Error ? llmError.message : String(llmError)
        };
      }
    } catch (error) {
      this.logger.error('Unexpected error in topic extraction', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        error: 'Unexpected error in topic extraction process',
        topics: []
      };
    }
  }
  
  /**
   * Identify action items from meeting transcript
   */
  private async identifyActionItems(parameters: { transcript: string; topics?: string[] }): Promise<any> {
    const { transcript, topics } = parameters;
    
    if (!transcript) {
      throw new Error('Transcript is required');
    }
    
    try {
      // Use action item extraction service if available
      if (this.actionItemExtractionService) {
        const meetingId = `meeting-${Date.now()}`;
        const meetingTitle = "Meeting Analysis";
        
        const actionItems = await this.actionItemExtractionService.extractActionItems(
          transcript,
          meetingId,
          meetingTitle
        );
        
        return {
          actionItems: actionItems.map(item => ({
            description: item.description,
            assignees: item.assignees.map(a => a.name),
            dueDate: item.deadline,
            priority: item.priority,
            status: item.status
          }))
        };
      }
      
      // Generate real embeddings using OpenAI
      let queryEmbedding: number[];
      try {
        // Create a concise version of the query for embedding
        const queryText = `Extract action items from: ${transcript.substring(0, 500)}`;
        queryEmbedding = await this.openAiConnector.generateEmbedding(queryText);
        this.logger.info('Generated real embeddings for action item extraction query');
      } catch (error) {
        this.logger.error('Error generating embeddings for action item extraction', { error });
        // Fallback to dummy embeddings if generation fails
        queryEmbedding = new Array(1536).fill(0).map(() => Math.random() - 0.5);
        this.logger.warn('Using fallback dummy embeddings due to error');
      }
      
      // Use the instruction template service to create a specialized prompt
      const promptResult = await this.instructionTemplateService.createSpecializedPrompt(
        'action_item_extraction',
        transcript,
        {
          userId: 'system',
          topics: topics,
          transcript: transcript.substring(0, 2000),
          // Use RAG context retrieval with proper options
          ragOptions: {
            userId: 'system',
            queryEmbedding: queryEmbedding,
            queryText: 'Extract action items and key information from meeting transcript',
            strategy: RagRetrievalStrategy.SEMANTIC,
            maxItems: 3,
            filters: { type: { $exists: true } }
          }
        }
      );
      
      // Call OpenAI with the specialized prompt
      const response = await this.openAiConnector.generateResponse(
        promptResult.messages as MessageConfig[], 
        {
          temperature: 0.2,
          maxTokens: 2000,
          responseFormat: 
            promptResult.responseFormat === ResponseFormatType.JSON_OBJECT 
              ? { type: 'json_object' } 
              : undefined
        }
      );
      
      // Parse the response
      try {
        const result = JSON.parse(response.content);
        return result;
      } catch (error) {
        this.logger.error('Error parsing action items JSON', { 
          error, 
          responseContent: response.content 
        });
        
        // Return error with formatted output matching schema
        return { 
          actionItems: [], 
          decisions: [],
          questions: [],
          keyTopics: [],
          error: 'Failed to parse action items result'
        };
      }
    } catch (error) {
      this.logger.error('Error identifying action items', { error });
      
      // Return error with formatted output matching schema
      return { 
        actionItems: [], 
        decisions: [],
        questions: [],
        keyTopics: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Generate a summary of the meeting
   */
  private async generateSummary(parameters: { transcript: string; topics?: any[]; action_items?: any[] }): Promise<any> {
    const { transcript, topics, action_items } = parameters;
    
    if (!transcript) {
      throw new Error('Transcript is required');
    }
    
    try {
      // Generate real embeddings using OpenAI instead of dummy ones
      let queryEmbedding: number[];
      try {
        // Create a concise version of the query for embedding
        const queryText = `Meeting summary: ${transcript.substring(0, 500)}`;
        queryEmbedding = await this.openAiConnector.generateEmbedding(queryText);
        this.logger.info('Generated real embeddings for meeting summary query');
      } catch (error) {
        this.logger.error('Error generating embeddings for meeting summary', { error });
        // Fallback to a simpler dummy embedding if generation fails
        queryEmbedding = new Array(1536).fill(0).map(() => Math.random() - 0.5);
        this.logger.warn('Using fallback dummy embeddings due to error');
      }
      
      // Use the instruction template service to create a specialized prompt
      const promptResult = await this.instructionTemplateService.createSpecializedPrompt(
        'meeting_summary',
        transcript,
        {
          userId: 'system',
          topics: topics,
          actionItems: action_items,
          // Use RAG context retrieval with proper options
          ragOptions: {
            userId: 'system',
            queryEmbedding: queryEmbedding,
            queryText: 'Generate comprehensive meeting summary',
            strategy: RagRetrievalStrategy.SEMANTIC,
            maxItems: 3,
            filters: { type: { $exists: true } }
          }
        }
      );
      
      // Call OpenAI with the specialized prompt
      const response = await this.openAiConnector.generateResponse(
        promptResult.messages as MessageConfig[],
        {
          temperature: 0.3,
          maxTokens: 2000,
          responseFormat: 
            promptResult.responseFormat === ResponseFormatType.JSON_OBJECT 
              ? { type: 'json_object' } 
              : undefined
        }
      );
      
      // Parse the response
      try {
        const summary = JSON.parse(response.content);
        return summary;
      } catch (error) {
        this.logger.error('Error parsing summary JSON', { 
          error, 
          responseContent: response.content 
        });
        
        // Return error with formatted output matching schema
        return { 
          meetingTitle: "Meeting Summary (Error Parsing)",
          summary: "There was an error generating the meeting summary.",
          decisions: [
            {
              title: "Error Parsing JSON",
              content: "The system was unable to parse the generated summary. Please try again."
            }
          ],
          error: 'Failed to parse summary JSON'
        };
      }
    } catch (error) {
      this.logger.error('Error generating summary', { error });
      
      // Return error with formatted output matching schema
      return { 
        meetingTitle: "Meeting Summary (Error)",
        summary: "There was an error generating the meeting summary.",
        decisions: [
          {
            title: "Error Generating Summary",
            content: error instanceof Error ? error.message : String(error)
          }
        ],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Retrieve relevant context from previous meetings
   */
  private async retrieveMeetingContext(parameters: { query: string; meeting_id?: string; max_results?: number }): Promise<any> {
    const { query, meeting_id, max_results = 5 } = parameters;
    
    if (!query) {
      throw new Error('Query is required');
    }
    
    if (!this.meetingRagIntegrator) {
      throw new Error('RAG integrator is not available');
    }
    
    try {
      const results = await this.meetingRagIntegrator.queryContext(
        query,
        meeting_id || '',
        max_results
      );
      
      return {
        contexts: results,
        query,
        meeting_id,
        result_count: results.length
      };
    } catch (error) {
      this.logger.error('Error retrieving meeting context', { error });
      return { 
        contexts: [],
        query,
        meeting_id,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Process and store meeting transcript for RAG
   */
  private async processTranscript(parameters: { meeting_id: string; transcript: string; session_id?: string }): Promise<any> {
    const { meeting_id, transcript, session_id = `session-${Date.now()}` } = parameters;
    
    if (!meeting_id || !transcript) {
      throw new Error('Meeting ID and transcript are required');
    }
    
    if (!this.meetingRagIntegrator) {
      throw new Error('RAG integrator is not available');
    }
    
    try {
      const chunksStored = await this.meetingRagIntegrator.processTranscript(
        meeting_id,
        transcript,
        session_id
      );
      
      return {
        meeting_id,
        session_id,
        chunks_stored: chunksStored,
        success: true,
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error('Error processing transcript for RAG', { 
        error,
        meeting_id,
        session_id
      });
      
      // Check if error is a JSON parsing error
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isJsonError = errorMessage.includes('JSON') || 
                          errorMessage.includes('parse') || 
                          errorMessage.includes('unexpected token');
      
      return { 
        meeting_id,
        session_id,
        chunks_stored: 0,
        success: false,
        error: errorMessage,
        error_type: isJsonError ? 'json_parsing_error' : 'processing_error',
        timestamp: Date.now()
      };
    }
  }
} 