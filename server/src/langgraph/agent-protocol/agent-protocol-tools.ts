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
import { InstructionTemplates } from '../../shared/prompts/instruction-templates';

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
   * Extract topics from meeting transcript
   */
  private async extractTopics(parameters: { transcript: string }): Promise<any> {
    const { transcript } = parameters;
    
    if (!transcript) {
      throw new Error('Transcript is required');
    }
    
    try {
      // Use the topic extraction service if available
      if (this.topicExtractionService) {
        const meetingId = `meeting-${Date.now()}`;
        const result = await this.topicExtractionService.extractTopics(meetingId, {
          minConfidenceThreshold: 0.6,
          maxTopicsPerMeeting: 10
        });
        
        return {
          topics: result.topics.map(topic => ({
            name: topic.name,
            description: topic.description || '',
            keywords: topic.keywords,
            relevanceScore: topic.relevanceScore,
            confidence: topic.confidence
          }))
        };
      }
      
      // Build instruction content for topic extraction
      const instructionContent = `
        Extract the main topics discussed in this meeting transcript.
        Follow the required JSON schema for topic extraction.
        Each topic should have a name, description, keywords, and relevanceScore.
        
        TRANSCRIPT:
        ${transcript.substring(0, 8000)}
      `;
      
      // Generate real embeddings using OpenAI
      let queryEmbedding: number[];
      try {
        // Create a concise version of the query for embedding
        const queryText = `Extract topics from: ${transcript.substring(0, 500)}`;
        queryEmbedding = await this.openAiConnector.generateEmbedding(queryText);
        this.logger.info('Generated real embeddings for topic extraction query');
      } catch (error) {
        this.logger.error('Error generating embeddings for topic extraction', { error });
        // Fallback to dummy embeddings if generation fails
        queryEmbedding = new Array(1536).fill(0).map(() => Math.random() - 0.5);
        this.logger.warn('Using fallback dummy embeddings due to error');
      }
      
      // Create RAG options with real embeddings
      const ragOptions = {
        userId: 'system',
        queryText: 'Extract main topics from meeting transcript',
        queryEmbedding,
        strategy: RagRetrievalStrategy.SEMANTIC,
      };
      
      // Get the instruction template details
      const templateDetails = InstructionTemplates.TOPIC_DISCOVERY;
      
      // Create specialized system message with template details
      const systemMessage = `You are a topic extraction specialist who identifies key topics from meeting transcripts.

REQUIRED JSON SCHEMA:
{
  "topics": [
    {
      "name": "Topic name",
      "description": "Detailed description of the topic",
      "keywords": ["keyword1", "keyword2", ...],
      "relevanceScore": 0.95
    },
    ...
  ]
}

RULES:
${templateDetails.rules?.map(rule => `- ${rule}`).join('\n') || '- Identify main discussion topics and subtopics'}

OUTPUT REQUIREMENTS:
${templateDetails.outputRequirements?.map(req => `- ${req}`).join('\n') || '- Topics should be specific and descriptive'}

Your output should strictly follow the JSON schema provided. Return ONLY a valid JSON object with no additional text or formatting.`;
      
      // Use RAG prompt manager with the proper template
      const ragPrompt = await this.ragPromptManager.createRagPrompt(
        SystemRoleEnum.MEETING_ANALYST,
        InstructionTemplateNameEnum.TOPIC_DISCOVERY,
        instructionContent,
        ragOptions
      );
      
      // Define response format
      const responseFormat: { type: "json_object" | "json_array" | "text" } = { type: 'json_object' };
      
      // Call OpenAI with the RAG-optimized prompt
      const response = await this.openAiConnector.generateResponse([
        { role: 'system', content: systemMessage },
        { role: 'user', content: ragPrompt.messages[0].content || instructionContent }
      ], {
        temperature: 0.2,
        maxTokens: 2000,
        responseFormat: responseFormat
      });
      
      // Parse the response
      try {
        const result = JSON.parse(response.content);
        return result;
      } catch (error) {
        this.logger.error('Error parsing topics JSON', { 
          error,
          responseContent: response.content.substring(0, 500) // Log part of the response for debugging
        });
        
        // Return a properly formatted error response
        return { 
          topics: [], 
          error: 'Failed to parse topics JSON',
          error_details: error instanceof Error ? error.message : String(error)
        };
      }
    } catch (error) {
      this.logger.error('Error extracting topics', { error });
      
      // Return a properly formatted error response
      return { 
        topics: [], 
        error: error instanceof Error ? error.message : String(error)
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
      
      // Build instruction content for action item extraction
      const instructionContent = `
        Analyze this meeting transcript to extract structured information.
        Follow the required JSON schema with actionItems, decisions, questions, and keyTopics fields.
        
        ${topics && topics.length > 0 ? `TOPICS DISCUSSED: ${JSON.stringify(topics)}` : ''}
        
        TRANSCRIPT:
        ${transcript.substring(0, 8000)}
      `;
      
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
      
      // Create RAG options with real embeddings
      const ragOptions = {
        userId: 'system',
        queryText: 'Extract action items and key information from meeting transcript',
        queryEmbedding,
        strategy: RagRetrievalStrategy.SEMANTIC,
      };
      
      // Get the instruction template details
      const templateDetails = InstructionTemplates.MEETING_ANALYSIS_CHUNK;
      
      // Create specialized system message with template details
      const systemMessage = `You are a meeting analysis assistant that extracts structured data from meeting transcripts.

REQUIRED JSON SCHEMA:
{
  "actionItems": [
    {
      "description": "Detailed description of the action item",
      "assignees": ["Person Name", "Another Person"],
      "dueDate": "2023-06-15",
      "priority": "high"
    },
    ...
  ],
  "decisions": [
    "Decision 1",
    "Decision 2",
    ...
  ],
  "questions": [
    {
      "question": "What is the question?",
      "answered": true/false,
      "answer": "The answer if available"
    },
    ...
  ],
  "keyTopics": [
    "Topic 1",
    "Topic 2",
    ...
  ]
}

RULES:
${templateDetails.rules?.map(rule => `- ${rule}`).join('\n') || '- Extract all action items with assignees and due dates'}

OUTPUT REQUIREMENTS:
${templateDetails.outputRequirements?.map(req => `- ${req}`).join('\n') || '- Complete structured data in JSON format'}

Your output should strictly follow the JSON schema provided. Return ONLY a valid JSON object with no additional text or formatting.`;
      
      // Use RAG prompt manager with MEETING_ANALYSIS_CHUNK template
      const ragPrompt = await this.ragPromptManager.createRagPrompt(
        SystemRoleEnum.MEETING_ANALYST,
        InstructionTemplateNameEnum.MEETING_ANALYSIS_CHUNK,
        instructionContent,
        ragOptions
      );
      
      // Define response format to match template
      const responseFormat: { type: "json_object" | "json_array" | "text" } = { type: 'json_object' };
      
      // Call OpenAI with the RAG-optimized prompt
      const response = await this.openAiConnector.generateResponse([
        { role: 'system', content: systemMessage },
        { role: 'user', content: ragPrompt.messages[0].content || instructionContent }
      ], {
        temperature: 0.2,
        maxTokens: 2000,
        responseFormat: responseFormat
      });
      
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
      // Build instruction content that directly incorporates the transcript
      let instructionContent = `
        Generate a comprehensive summary of this meeting based on the following transcript.
        Follow the required JSON schema with meetingTitle, summary, and decisions fields.
        
        TRANSCRIPT:
        ${transcript.substring(0, 8000)}
      `;
      
      if (topics && topics.length > 0) {
        instructionContent += `\n\nTOPICS DISCUSSED:\n${JSON.stringify(topics)}`;
      }
      
      if (action_items && action_items.length > 0) {
        instructionContent += `\n\nACTION ITEMS:\n${JSON.stringify(action_items)}`;
      }
      
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
      
      // Create RAG options with real embeddings
      const ragOptions = {
        userId: 'system',
        queryText: 'Generate comprehensive meeting summary',
        queryEmbedding,
        strategy: RagRetrievalStrategy.SEMANTIC,
      };
      
      // Get the instruction template details to construct a more specialized system message
      const templateDetails = InstructionTemplates.FINAL_MEETING_SUMMARY;
      
      // Include template rules and output requirements in system message
      const systemMessage = `You are a meeting analysis assistant that produces structured JSON output in the exact format required.

REQUIRED JSON SCHEMA:
{
  "meetingTitle": "A concise, descriptive title for the meeting",
  "summary": "Comprehensive meeting summary with speaker details and discussion flow",
  "decisions": [
    {
      "title": "Decision title",
      "content": "Detailed explanation of the decision including context and contributors"
    },
    ...
  ]
}

RULES:
${templateDetails.rules?.map(rule => `- ${rule}`).join('\n') || '- Follow the required JSON schema'}

OUTPUT REQUIREMENTS:
${templateDetails.outputRequirements?.map(req => `- ${req}`).join('\n') || '- Return only a valid JSON object'}

Your output should strictly follow the JSON schema provided. Return ONLY a valid JSON object with no additional text or formatting.`;
      
      // Use RAG prompt manager with FINAL_MEETING_SUMMARY template
      const ragPrompt = await this.ragPromptManager.createRagPrompt(
        SystemRoleEnum.MEETING_ANALYST,
        InstructionTemplateNameEnum.FINAL_MEETING_SUMMARY,
        instructionContent,
        ragOptions
      );
      
      // Get the appropriate response format from the template definition
      const responseFormat: { type: "json_object" | "json_array" | "text" } = { type: 'json_object' };
      
      // Call OpenAI with the RAG-optimized prompt
      // Pass both the system message with detailed schema requirements AND the user message containing the transcript
      const response = await this.openAiConnector.generateResponse([
        { role: 'system', content: systemMessage },
        { role: 'user', content: ragPrompt.messages[0].content || instructionContent }
      ], {
        temperature: 0.3,
        maxTokens: 2000,
        responseFormat: responseFormat
      });
      
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