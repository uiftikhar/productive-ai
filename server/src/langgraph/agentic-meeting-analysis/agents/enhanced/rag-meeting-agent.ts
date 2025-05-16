/**
 * RAG-Enhanced Meeting Analysis Agent
 * 
 * This agent extends the RAG-enhanced base agent to provide
 * context-aware meeting analysis capabilities.
 */
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { RagEnhancedAgent, RagEnhancedAgentConfig } from '../../../../rag/agents/rag-enhanced-agent';
import { IRagService } from '../../../../rag/interfaces/rag.interface';
import { OpenAIConnector } from '../../../../connectors/openai-connector';
import { MessageConfig } from '../../../../connectors/language-model-provider.interface';
import { RetrievalOptions } from '../../../../rag/context/context-provider.interface';
import { MeetingTranscript } from '../../interfaces/state.interface';
import { AgentExpertise } from '../../interfaces/agent.interface';

/**
 * Configuration for the RAG Meeting Analysis Agent
 */
export interface RagMeetingAgentConfig extends RagEnhancedAgentConfig {
  openAiConnector?: OpenAIConnector;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  expertise?: AgentExpertise[];
  specializedQueryTemplates?: Record<string, string>;
}

/**
 * RAG-Enhanced Meeting Analysis Agent Implementation
 */
export class RagMeetingAnalysisAgent extends RagEnhancedAgent {
  protected readonly openAiConnector: OpenAIConnector;
  protected readonly systemPrompt: string;
  protected readonly temperature: number;
  protected readonly maxTokens: number;
  protected readonly expertise: AgentExpertise[];
  protected readonly specializedQueryTemplates: Record<string, string>;
  
  /**
   * Create a new RAG Meeting Analysis Agent
   */
  constructor(
    ragService: IRagService,
    config: RagMeetingAgentConfig = {}
  ) {
    super(ragService, {
      id: config.id,
      name: config.name || 'RAG Meeting Analysis Agent',
      logger: config.logger,
      retrievalOptions: config.retrievalOptions,
      includeRetrievedContext: config.includeRetrievedContext,
      ragContextPromptTemplate: config.ragContextPromptTemplate
    });
    
    this.openAiConnector = config.openAiConnector || new OpenAIConnector({ 
      logger: this.logger 
    });
    
    this.systemPrompt = config.systemPrompt || 
      "You are an intelligent meeting analysis agent that provides insightful analysis " +
      "based on meeting transcripts and relevant context.";
    
    this.temperature = config.temperature || 0.2;
    this.maxTokens = config.maxTokens || 1000;
    this.expertise = config.expertise || [AgentExpertise.TOPIC_ANALYSIS];
    
    // Query templates for different analysis types
    this.specializedQueryTemplates = {
      [AgentExpertise.TOPIC_ANALYSIS]: "What are the main topics discussed in this meeting?",
      [AgentExpertise.ACTION_ITEM_EXTRACTION]: "What are the action items assigned in this meeting?",
      [AgentExpertise.SUMMARY_GENERATION]: "Provide a concise summary of this meeting.",
      [AgentExpertise.SENTIMENT_ANALYSIS]: "What is the sentiment and emotional tone of this meeting?",
      [AgentExpertise.PARTICIPANT_DYNAMICS]: "Analyze the participation patterns in this meeting.",
      [AgentExpertise.DECISION_TRACKING]: "What key decisions were made in this meeting?",
      [AgentExpertise.CONTEXT_INTEGRATION]: "How does this meeting connect to previous discussions?",
      ...config.specializedQueryTemplates
    };
  }
  
  /**
   * Analyze a meeting transcript with RAG enhancements
   */
  async analyzeMeeting(
    transcript: MeetingTranscript,
    task: string,
    options?: {
      retrievalOptions?: RetrievalOptions;
      meetingId?: string;
      expertise?: AgentExpertise;
    }
  ): Promise<string> {
    const meetingId = options?.meetingId || transcript.meetingId;
    const expertise = options?.expertise || AgentExpertise.TOPIC_ANALYSIS;
    
    // Extract transcript info - accommodate different transcript formats
    const participantNames = transcript.participants?.map(p => p.name).join(', ') || 'Unknown';
    const meetingDate = transcript.date || transcript.metadata?.date || 'Unknown';
    const meetingDuration = transcript.duration || transcript.metadata?.duration || 'Unknown';
    
    // Build the base prompt
    const basePrompt = `
Analyze the following meeting transcript:

TASK: ${task}

MEETING ID: ${meetingId}
PARTICIPANTS: ${participantNames}
DATE: ${meetingDate}
DURATION: ${meetingDuration} minutes

TRANSCRIPT CONTENT:
${this.getTranscriptText(transcript)}
`;
    
    // Create specialized query based on expertise
    const specializedQuery = this.specializedQueryTemplates[expertise] || task;
    
    // Add filter for specific meeting if meetingId is available
    const retrievalOptions: RetrievalOptions = {
      ...(options?.retrievalOptions || {}),
      filter: meetingId ? { meetingId } : undefined,
      minScore: 0.7
    };
    
    // Generate enhanced prompt with context
    const enhancedPrompt = await this.createContextEnhancedPrompt(
      basePrompt,
      specializedQuery,
      retrievalOptions
    );
    
    // Process with LLM
    return this.processPrompt(enhancedPrompt);
  }
  
  /**
   * Helper method to extract text from different transcript formats
   */
  private getTranscriptText(transcript: MeetingTranscript): string {
    // Handle different transcript formats
    if (transcript.segments && Array.isArray(transcript.segments)) {
      return transcript.segments.map(s => {
        const speaker = s.speaker ? `${s.speaker}: ` : '';
        return `${speaker}${s.content || s.text || ''}`;
      }).join('\n\n');
    } else if (transcript.content) {
      return transcript.content;
    } else if (transcript.text) {
      return transcript.text;
    } else if (typeof transcript === 'string') {
      return transcript;
    }
    
    return 'No transcript content available';
  }
  
  /**
   * Process a prompt to generate a response
   * Implementation of abstract method from RagEnhancedAgent
   */
  protected async processPrompt(prompt: string): Promise<string> {
    const messages: MessageConfig[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: prompt }
    ];
    
    try {
      const response = await this.openAiConnector.generateResponse(
        messages,
        {
          temperature: this.temperature,
          maxTokens: this.maxTokens
        }
      );
      
      return String(response);
    } catch (error) {
      this.logger.error('Error processing prompt', { error });
      throw error;
    }
  }
} 