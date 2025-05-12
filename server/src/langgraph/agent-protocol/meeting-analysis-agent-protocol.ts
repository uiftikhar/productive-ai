import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentProtocolService } from './agent-protocol.service';
import { AgentProtocolTools } from './agent-protocol-tools';
import { 
  Run, 
  RunStatus, 
  MessageRole, 
  Thread,
  ContentType,
  CreateThreadRequest, 
  CreateRunRequest 
} from './agent-protocol.interface';
import { ServiceRegistry } from '../agentic-meeting-analysis/services/service-registry';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { PineconeConnector } from '../../connectors/pinecone-connector';
import { MeetingRAGIntegrator } from '../agentic-meeting-analysis/api-compatibility/meeting-rag-integrator';
import { StateGraph } from '@langchain/langgraph';
import { BaseMeetingAnalysisAgent } from '../agentic-meeting-analysis/agents/base-meeting-analysis-agent';
import { AgentExpertise, AnalysisGoalType } from '../agentic-meeting-analysis/interfaces/agent.interface';

/**
 * Configuration for Meeting Analysis Agent Protocol
 */
export interface MeetingAnalysisAgentProtocolConfig {
  logger?: Logger;
  openAiConnector?: OpenAIConnector;
  pineconeConnector?: PineconeConnector;
  enableRag?: boolean;
  agentProtocolService?: AgentProtocolService;
}

/**
 * Meeting Analysis request using Agent Protocol
 */
export interface MeetingAnalysisAgentProtocolRequest {
  meetingId: string;
  transcript: string;
  title?: string;
  participants?: Array<{ id: string; name: string; role?: string }>;
  userId?: string;
  goals?: AnalysisGoalType[];
  options?: {
    visualization?: boolean;
    teamComposition?: {
      maxTeamSize?: number;
      requiredExpertise?: AgentExpertise[];
    };
  };
}

/**
 * Meeting Analysis response from Agent Protocol
 */
export interface MeetingAnalysisAgentProtocolResponse {
  runId: string;
  threadId: string;
  status: RunStatus;
  results?: any;
  metadata?: any;
}

/**
 * Meeting Analysis Agent Protocol
 * Implements the Agent Protocol for meeting analysis using LangGraph's recommended patterns
 */
export class MeetingAnalysisAgentProtocol {
  private logger: Logger;
  private agentProtocolService: AgentProtocolService;
  private agentProtocolTools: AgentProtocolTools;
  private openAiConnector: OpenAIConnector;
  private pineconeConnector?: PineconeConnector;
  private meetingRagIntegrator?: MeetingRAGIntegrator;
  private enableRag: boolean;
  
  /**
   * Create a new Meeting Analysis Agent Protocol
   */
  constructor(config: MeetingAnalysisAgentProtocolConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.enableRag = config.enableRag !== false;
    
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
    
    // Initialize RAG integrator if Pinecone is available and RAG is enabled
    if (this.pineconeConnector && this.enableRag) {
      this.initializeRagIntegrator();
    }
    
    // Use provided agent protocol service or create a new one
    if (config.agentProtocolService) {
      this.agentProtocolService = config.agentProtocolService;
    } else {
      this.agentProtocolService = new AgentProtocolService({
        logger: this.logger,
        openAiConnector: this.openAiConnector,
        pineconeConnector: this.pineconeConnector
      });
    }
    
    // Initialize agent protocol tools
    this.agentProtocolTools = new AgentProtocolTools({
      logger: this.logger,
      openAiConnector: this.openAiConnector,
      pineconeConnector: this.pineconeConnector
    });
    
    this.logger.info('Meeting Analysis Agent Protocol initialized');
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
          enabled: true,
          indexName: process.env.PINECONE_TRANSCRIPT_INDEX || 'transcript-embeddings'
        }
      });
      
      this.logger.info('Meeting RAG Integrator initialized for Agent Protocol');
    } catch (error) {
      this.logger.error('Failed to initialize Meeting RAG Integrator', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Analyze a meeting using the Agent Protocol
   */
  async analyzeMeeting(request: MeetingAnalysisAgentProtocolRequest): Promise<MeetingAnalysisAgentProtocolResponse> {
    this.logger.info(`Starting meeting analysis for ${request.meetingId}`);
    
    // Ensure we have the meeting analysis assistant registered
    const assistant = await this.ensureMeetingAnalysisAssistant();
    
    // Create a thread for the analysis
    const thread = await this.agentProtocolService.createThread({
      messages: [
        {
          role: MessageRole.SYSTEM,
          content: [
            {
              type: ContentType.TEXT,
              text: `You are a meeting analysis assistant. Analyze the meeting transcript to extract valuable insights including topics discussed, action items assigned, and generate a comprehensive summary.`
            }
          ]
        }
      ],
      metadata: {
        meetingId: request.meetingId,
        title: request.title || 'Untitled Meeting',
        userId: request.userId,
        startedAt: new Date().toISOString()
      }
    });
    
    // Add the transcript as a user message
    await this.agentProtocolService.createMessage(thread.id, {
      role: MessageRole.USER,
      content: [
        {
          type: ContentType.TEXT,
          text: `Please analyze this meeting transcript: ${request.title || 'Untitled Meeting'}`
        },
        {
          type: ContentType.TEXT,
          text: request.transcript
        }
      ]
    });
    
    // Process transcript with RAG if enabled
    if (this.enableRag && this.meetingRagIntegrator && request.transcript) {
      try {
        const sessionId = `session-${uuidv4()}`;
        this.logger.info(`Processing transcript with RAG for meeting ${request.meetingId}`, { sessionId });
        
        await this.meetingRagIntegrator.processTranscript(
          request.meetingId,
          request.transcript,
          sessionId
        );
        
        // Add a note about RAG processing
        await this.agentProtocolService.createMessage(thread.id, {
          role: MessageRole.SYSTEM,
          content: [
            {
              type: ContentType.TEXT,
              text: `Transcript processed with RAG for improved context retrieval. Session ID: ${sessionId}`
            }
          ]
        });
      } catch (error) {
        this.logger.error(`Error processing transcript with RAG: ${error instanceof Error ? error.message : String(error)}`);
        // Continue without RAG - it's not critical for the analysis to work
      }
    }
    
    // Create a run to execute the analysis
    const run = await this.agentProtocolService.createRun({
      assistant_id: assistant.id,
      thread_id: thread.id,
      metadata: {
        meetingId: request.meetingId,
        analysisGoals: request.goals || [AnalysisGoalType.FULL_ANALYSIS],
        options: request.options || {}
      }
    });
    
    // Return immediately with the run ID for async processing
    return {
      runId: run.id,
      threadId: thread.id,
      status: run.status,
      metadata: {
        meetingId: request.meetingId,
        startedAt: new Date().toISOString()
      }
    };
  }
  
  /**
   * Get the status and results of a meeting analysis run
   */
  async getMeetingAnalysisStatus(runId: string): Promise<MeetingAnalysisAgentProtocolResponse> {
    const run = await this.agentProtocolService.getRun(runId);
    
    if (!run) {
      throw new Error(`Run with ID ${runId} not found`);
    }
    
    // Get messages if the run is completed
    let results: any = undefined;
    
    if (run.status === RunStatus.COMPLETED) {
      const messages = await this.agentProtocolService.getMessages(run.thread_id);
      const assistantMessages = messages.filter(m => m.role === MessageRole.ASSISTANT);
      
      if (assistantMessages.length > 0) {
        // Get the last assistant message
        const lastMessage = assistantMessages[assistantMessages.length - 1];
        
        // Extract text content
        const textContents = lastMessage.content
          .filter(c => c.type === ContentType.TEXT)
          .map(c => (c as any).text);
        
        // Try to parse as JSON if possible
        if (textContents.length > 0) {
          try {
            results = JSON.parse(textContents[0]);
          } catch (error) {
            results = { summary: textContents.join('\n') };
          }
        }
      }
    }
    
    // Get thread metadata
    const thread = await this.agentProtocolService.getThread(run.thread_id);
    
    return {
      runId: run.id,
      threadId: run.thread_id,
      status: run.status,
      results,
      metadata: thread?.metadata
    };
  }
  
  /**
   * Ensure the meeting analysis assistant is registered
   */
  private async ensureMeetingAnalysisAssistant() {
    // Create the assistant if it doesn't exist already
    const assistant = this.agentProtocolService.registerMeetingAnalysisAssistant();
    return assistant;
  }
  
  /**
   * Submit tool outputs for a run requiring action
   */
  async submitToolOutputs(runId: string, toolOutputs: any[]): Promise<Run> {
    return this.agentProtocolService.submitToolOutputs(runId, {
      tool_outputs: toolOutputs
    });
  }
  
  /**
   * Cancel a meeting analysis run
   */
  async cancelMeetingAnalysis(runId: string): Promise<Run> {
    return this.agentProtocolService.cancelRun(runId);
  }
  
  /**
   * Get the Agent Protocol service
   */
  getAgentProtocolService(): AgentProtocolService {
    return this.agentProtocolService;
  }
  
  /**
   * Get the Agent Protocol tools
   */
  getAgentProtocolTools(): AgentProtocolTools {
    return this.agentProtocolTools;
  }
} 