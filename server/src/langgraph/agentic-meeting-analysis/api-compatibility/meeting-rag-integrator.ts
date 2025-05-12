/**
 * Meeting RAG Integrator Service
 * 
 * This service integrates the MeetingRAGService and SemanticChunkingService
 * into the meeting analysis workflow, ensuring that all meeting transcripts
 * are properly processed, chunked, embedded, and stored in Pinecone.
 */

import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { OpenAIConnector } from '../../../connectors/openai-connector';
import { PineconeConnector } from '../../../connectors/pinecone-connector';
import { SemanticChunkingService } from '../services/semantic-chunking.service';
import { MeetingRAGService } from '../services/meeting-rag.service';
import { RawTranscript, TranscriptFormat } from '../../../langgraph/core/transcript/enhanced-transcript-processor';
import { BaseMeetingAnalysisAgent } from '../agents/base-meeting-analysis-agent';
import { AgentExpertise } from '../interfaces/agent.interface';

/**
 * Configuration options for the Meeting RAG Integrator
 */
export interface MeetingRAGIntegratorConfig {
  // Whether to enable RAG integration
  enabled: boolean;
  
  // Name of the Pinecone index to use
  indexName: string;
  
  // RAG configuration
  chunkingConfig?: {
    minChunkSize: number;
    maxChunkSize: number;
    overlapRatio: number;
    preserveActionItems: boolean;
    preserveDecisions: boolean;
    preserveSpeakerTurns: boolean;
    contentImportanceStrategy: 'standard' | 'conservative' | 'aggressive';
    detectTopicTransitions: boolean;
    llmTopicDetection: boolean;
  };
  
  // Embedding configuration
  embeddingConfig?: {
    model: string;
    minRelevanceScore: number;
    maxRetrievalResults: number;
    reRankResults: boolean;
  };
}

/**
 * Default configuration for the Meeting RAG Integrator
 */
const DEFAULT_CONFIG: MeetingRAGIntegratorConfig = {
  enabled: true,
  indexName: 'transcript-embeddings',
  chunkingConfig: {
    minChunkSize: 800,
    maxChunkSize: 3500,
    overlapRatio: 0.1,
    preserveActionItems: true,
    preserveDecisions: true,
    preserveSpeakerTurns: true,
    contentImportanceStrategy: 'standard',
    detectTopicTransitions: true,
    llmTopicDetection: true
  },
  embeddingConfig: {
    model: 'text-embedding-3-large',
    minRelevanceScore: 0.7,
    maxRetrievalResults: 10, 
    reRankResults: true
  }
};

/**
 * Meeting RAG Integrator Service implementation
 */
export class MeetingRAGIntegrator {
  private logger: Logger;
  private openAiConnector: OpenAIConnector;
  private pineconeConnector: PineconeConnector;
  private semanticChunkingService: SemanticChunkingService = {} as SemanticChunkingService;
  private meetingRagService: MeetingRAGService = {} as MeetingRAGService;
  private config: MeetingRAGIntegratorConfig;
  
  /**
   * Create a new Meeting RAG Integrator
   */
  constructor(options: {
    logger?: Logger;
    openAiConnector: OpenAIConnector;
    pineconeConnector: PineconeConnector;
    config?: Partial<MeetingRAGIntegratorConfig>;
  }) {
    this.logger = options.logger || new ConsoleLogger();
    this.openAiConnector = options.openAiConnector;
    this.pineconeConnector = options.pineconeConnector;
    this.config = { ...DEFAULT_CONFIG, ...(options.config || {}) };
    
    // Initialize services
    this.initializeServices();
  }
  
  /**
   * Initialize RAG services
   */
  private initializeServices(): void {
    // Initialize semantic chunking service
    this.semanticChunkingService = new SemanticChunkingService({
      logger: this.logger,
      openAiConnector: this.openAiConnector,
      config: this.config.chunkingConfig
    });
    
    // Initialize meeting RAG service
    this.meetingRagService = new MeetingRAGService({
      logger: this.logger,
      openAiConnector: this.openAiConnector,
      pineconeConnector: this.pineconeConnector,
      chunkingService: this.semanticChunkingService,
      config: {
        indexName: this.config.indexName,
        namespace: 'meeting-transcripts',
        embeddingModel: this.config.embeddingConfig?.model || 'text-embedding-3-large',
        minRelevanceScore: this.config.embeddingConfig?.minRelevanceScore || 0.7,
        maxRetrievalResults: this.config.embeddingConfig?.maxRetrievalResults || 10,
        reRankResults: this.config.embeddingConfig?.reRankResults || true,
        logRetrievalStats: true,
        trackUsage: true
      }
    });
    
    this.logger.info('Meeting RAG Integrator initialized', {
      enabled: this.config.enabled,
      indexName: this.config.indexName
    });
  }
  
  /**
   * Process a raw transcript and store in Pinecone
   * 
   * @param meetingId - The meeting ID
   * @param transcript - The raw transcript text
   * @param sessionId - The analysis session ID
   * @returns Number of chunks stored
   */
  async processTranscript(meetingId: string, transcript: string | RawTranscript, sessionId: string): Promise<number> {
    if (!this.config.enabled) {
      this.logger.info('Meeting RAG is disabled, skipping transcript processing', { meetingId, sessionId });
      return 0;
    }
    
    try {
      this.logger.info('Processing transcript for RAG integration', { meetingId, sessionId });
      
      // Convert to structured format if needed
      let structuredTranscript: RawTranscript;
      if (typeof transcript === 'string') {
        structuredTranscript = {
          meetingId,
          entries: this.parseTranscriptToEntries(transcript),
          sourceFormat: 'plain_text' as TranscriptFormat
        };
      } else {
        structuredTranscript = transcript;
      }
      
      // Set the namespace to the meeting ID for isolation
      if (this.meetingRagService['config']) {
        this.meetingRagService['config'].namespace = meetingId;
      }
      
      // Process and store in Pinecone
      const startTime = Date.now();
      const chunksStored = await this.meetingRagService.processTranscript(structuredTranscript, sessionId);
      const duration = Date.now() - startTime;
      
      this.logger.info('Transcript processed and stored in Pinecone', {
        meetingId,
        sessionId,
        chunksStored,
        durationMs: duration
      });
      
      return chunksStored;
    } catch (error) {
      this.logger.error('Error processing transcript for RAG', {
        meetingId,
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Don't fail the whole process if RAG integration fails
      return 0;
    }
  }
  
  /**
   * Enhance agent team with RAG capabilities
   * 
   * @param agents - Array of meeting analysis agents
   * @param meetingId - The meeting ID (for namespacing)
   */
  enhanceAgentTeam(agents: BaseMeetingAnalysisAgent[], meetingId: string): void {
    if (!this.config.enabled) {
      this.logger.info('Meeting RAG is disabled, skipping agent enhancement', { meetingId });
      return;
    }
    
    try {
      // Set the namespace to the meeting ID for isolation
      if (this.meetingRagService['config']) {
        this.meetingRagService['config'].namespace = meetingId;
      }
      
      // Count of enhanced agents
      let enhancedCount = 0;
      
      // Enhance agents that can benefit from RAG
      for (const agent of agents) {
        // Check if the agent should use RAG capabilities
        const shouldEnhance = this.shouldEnhanceAgent(agent);
        
        if (shouldEnhance) {
          // Add the meeting RAG service to the agent
          if ('setMeetingRagService' in agent) {
            agent.setMeetingRagService(this.meetingRagService);
            enhancedCount++;
          } else {
            // Fallback for agents without the setter
            (agent as any).meetingRagService = this.meetingRagService;
            enhancedCount++;
          }
        }
      }
      
      this.logger.info('Enhanced agent team with RAG capabilities', {
        meetingId,
        totalAgents: agents.length,
        enhancedAgents: enhancedCount
      });
    } catch (error) {
      this.logger.error('Error enhancing agent team with RAG', {
        meetingId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Determine if an agent should be enhanced with RAG capabilities
   */
  private shouldEnhanceAgent(agent: BaseMeetingAnalysisAgent): boolean {
    // Add RAG to these agent types
    const ragEnabledExpertise = [
      AgentExpertise.SUMMARY_GENERATION,
      AgentExpertise.TOPIC_ANALYSIS,
      AgentExpertise.CONTEXT_INTEGRATION,
      AgentExpertise.DECISION_TRACKING
    ];
    
    // Check if the agent has any of the RAG-enabled expertise
    return agent.expertise.some(expertise => 
      ragEnabledExpertise.includes(expertise as AgentExpertise)
    );
  }
  
  /**
   * Parse a raw transcript text into structured entries
   * This is a simple implementation - in production this would be more sophisticated
   */
  private parseTranscriptToEntries(transcript: string): any[] {
    const lines = transcript.split('\n');
    const entries = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Try to extract speaker and content
      const match = line.match(/^([^:]+):\s*(.+)$/);
      
      if (match) {
        entries.push({
          speakerId: `speaker-${entries.length}`,
          speakerName: match[1].trim(),
          content: match[2].trim(),
          startTime: entries.length * 10, // Dummy timing information
          endTime: (entries.length + 1) * 10
        });
      } else {
        // For lines without a clear speaker, append to the previous entry or create a new one
        if (entries.length > 0) {
          entries[entries.length - 1].content += ' ' + line;
        } else {
          entries.push({
            speakerId: 'unknown',
            speakerName: 'Unknown',
            content: line,
            startTime: 0,
            endTime: 10
          });
        }
      }
    }
    
    return entries;
  }
  
  /**
   * Get the RAG service for direct access if needed
   */
  getRagService(): MeetingRAGService {
    return this.meetingRagService;
  }
  
  /**
   * Get the semantic chunking service for direct access if needed
   */
  getChunkingService(): SemanticChunkingService {
    return this.semanticChunkingService;
  }
  
  /**
   * Perform a context query against the stored transcript
   * 
   * @param query - The search query
   * @param meetingId - The meeting ID to search within
   * @param maxResults - Maximum number of results to return
   */
  async queryContext(query: string, meetingId: string, maxResults: number = 5): Promise<any[]> {
    if (!this.config.enabled) {
      this.logger.info('Meeting RAG is disabled, skipping context query', { meetingId });
      return [];
    }
    
    try {
      // Set the namespace to the meeting ID for isolation
      if (this.meetingRagService['config']) {
        this.meetingRagService['config'].namespace = meetingId;
      }
      
      // Query for relevant chunks
      const chunks = await this.meetingRagService.retrieveRelevantChunks(
        query,
        meetingId
      );
      
      // Limit to requested number of results
      const limitedChunks = chunks.slice(0, maxResults);
      
      this.logger.info('Retrieved context from Pinecone', {
        meetingId,
        query: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
        totalResults: chunks.length,
        returnedResults: limitedChunks.length
      });
      
      // Format results for easier consumption
      return limitedChunks.map(chunk => ({
        content: chunk.content,
        relevance: chunk.score,
        metadata: {
          chunkIndex: chunk.metadata.chunkIndex,
          speakerIds: chunk.metadata.speakerIds || []
        }
      }));
    } catch (error) {
      this.logger.error('Error querying context from Pinecone', {
        meetingId,
        query: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
        error: error instanceof Error ? error.message : String(error)
      });
      
      return [];
    }
  }
} 