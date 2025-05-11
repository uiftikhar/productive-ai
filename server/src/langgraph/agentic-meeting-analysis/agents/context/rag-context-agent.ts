import { BaseMeetingAnalysisAgent, BaseMeetingAnalysisAgentConfig } from '../base-meeting-analysis-agent';
import { 
  AgentOutput, 
  ConfidenceLevel, 
  ISpecialistAnalysisAgent,
  AgentExpertise,
  AgentRole,
  AnalysisGoalType
} from '../../interfaces/agent.interface';
import { Logger } from '../../../../shared/logger/logger.interface';
import { OpenAIConnector } from '../../../../connectors/openai-connector';
import { PineconeConnector } from '../../../../connectors/pinecone-connector';
import { MeetingRAGService } from '../../services/meeting-rag.service';
import { SemanticChunkingService } from '../../services/semantic-chunking.service';
import { RawTranscript } from '../../../../langgraph/core/transcript/enhanced-transcript-processor';

/**
 * Configuration for RAG Context Agent
 */
interface RAGContextAgentConfig extends Omit<BaseMeetingAnalysisAgentConfig, 'expertise' | 'capabilities'> {
  pineconeConnector: PineconeConnector;
  ragService?: MeetingRAGService;
  useMockMode?: boolean;
}

/**
 * Agent that uses RAG to provide context for meeting analysis
 */
export class RAGContextAgent extends BaseMeetingAnalysisAgent implements ISpecialistAnalysisAgent {
  private ragService: MeetingRAGService;
  public readonly role: AgentRole = AgentRole.WORKER;
  private sessionId?: string;
  
  /**
   * Create a new RAG Context Agent
   */
  constructor(options: RAGContextAgentConfig) {
    super({
      id: options.id,
      name: options.name || 'RAG Context Agent',
      expertise: [AgentExpertise.CONTEXT_INTEGRATION],
      capabilities: [AnalysisGoalType.INTEGRATE_CONTEXT],
      logger: options.logger,
      openAiConnector: options.openAiConnector,
      systemPrompt: options.systemPrompt,
      useMockMode: options.useMockMode
    });
    
    // Create or use provided RAG service
    if (options.ragService) {
      this.ragService = options.ragService;
    } else {
      // Make sure we have a valid OpenAIConnector
      if (!this.openAiConnector) {
        throw new Error('OpenAIConnector is required for RAGContextAgent');
      }
      
      const chunkingService = new SemanticChunkingService({
        logger: this.logger,
        openAiConnector: this.openAiConnector
      });
      
      this.ragService = new MeetingRAGService({
        logger: this.logger,
        openAiConnector: this.openAiConnector,
        pineconeConnector: options.pineconeConnector,
        chunkingService,
        config: {
          namespace: 'meeting-analysis',
          reRankResults: true
        }
      });
    }
  }
  
  /**
   * Set the session ID for this analysis
   */
  public setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }
  
  /**
   * Process the transcript data when first received
   */
  async processTranscript(transcript: RawTranscript): Promise<boolean> {
    try {
      this.logger.info('Processing transcript for RAG indexing', {
        agentId: this.id,
        transcriptLength: JSON.stringify(transcript).length
      });
      
      // Store the transcript in the RAG service
      const sessionId = this.getSessionId();
      const storedChunks = await this.ragService.processTranscript(transcript, sessionId);
      
      this.logger.info('Transcript processed and indexed successfully', {
        agentId: this.id,
        storedChunks
      });
      
      return true;
    } catch (error) {
      this.logger.error('Error processing transcript for RAG', {
        agentId: this.id,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
  
  /**
   * Gets the session ID for this analysis
   */
  private getSessionId(): string {
    // Use the agent ID as a fallback
    return this.sessionId || this.id;
  }
  
  /**
   * Analyze a transcript segment with RAG-enhanced context
   */
  async analyzeTranscriptSegment(
    segment: string,
    context?: Record<string, any>
  ): Promise<AgentOutput> {
    this.logger.info('Analyzing transcript segment with RAG context', {
      agentId: this.id,
      segmentLength: segment.length,
      hasContext: !!context
    });
    
    try {
      // Generate query from the segment to retrieve relevant context
      const query = await this.generateContextQuery(segment);
      
      // Retrieve relevant information from previous meetings
      const retrievalResults = await this.ragService.retrieveRelevantChunks(
        query,
        undefined, // Don't filter by meeting ID to get cross-meeting context
        undefined  // Don't filter by session either
      );
      
      // Format the retrieved context
      let formattedContext = "";
      if (retrievalResults.length > 0) {
        formattedContext = "RELEVANT CONTEXT FROM PREVIOUS MEETINGS:\n\n" + 
          retrievalResults.map((result, index) => {
            return `[${index + 1}] From meeting ${result.metadata.meetingId}:\n${result.content}\n`;
          }).join("\n");
      } else {
        formattedContext = "No relevant context from previous meetings found.";
      }
      
      // Use the LLM to analyze the segment with the retrieved context
      const instruction = `
        You are a Context Analysis Agent specialized in connecting current discussions with historical meeting data.
        
        Analyze the meeting transcript segment below, using the provided context from previous meetings.
        
        Focus on:
        1. Identifying relationships between current topics and previous discussions
        2. Noting continuity of projects, decisions, or action items
        3. Highlighting when current discussions contradict or change previous decisions
        4. Providing contextual understanding for topics that might be unclear
        
        Format your response as a structured JSON object with these fields:
        - continuity: array of topics showing continuity from previous meetings
        - changes: array of topics that contradict or change previous decisions
        - references: array of specific references to previous meetings
        - insights: array of contextual insights that help understand the current discussion
      `;
      
      const content = `${formattedContext}\n\nCURRENT TRANSCRIPT SEGMENT:\n${segment}`;
      
      // Call LLM with the instruction and content
      const result = await this.callLLM(instruction, content);
      
      // Parse the response
      try {
        const parsedResult = JSON.parse(result);
        
        return {
          content: parsedResult,
          confidence: await this.determineConfidence(parsedResult, retrievalResults.length),
          timestamp: Date.now()
        };
      } catch (parseError) {
        this.logger.warn('Error parsing LLM response as JSON', {
          agentId: this.id,
          error: parseError instanceof Error ? parseError.message : String(parseError),
          response: result
        });
        
        // Return a simplified version if JSON parsing fails
        return {
          content: { analysis: result },
          confidence: ConfidenceLevel.LOW,
          timestamp: Date.now()
        };
      }
    } catch (error) {
      this.logger.error('Error in RAG context analysis', {
        agentId: this.id,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        content: { error: 'Failed to provide context analysis' },
        confidence: ConfidenceLevel.UNCERTAIN,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Generate a context query from the transcript segment
   */
  private async generateContextQuery(segment: string): Promise<string> {
    try {
      const instruction = `
        Extract 3-5 key topics or themes from this meeting transcript segment.
        Format them as search queries that would help find related information from previous meetings.
        Focus on specific projects, decisions, action items, or unique terminology.
        Return the queries separated by semicolons (;).
      `;
      
      const result = await this.callLLM(instruction, segment);
      return result;
    } catch (error) {
      this.logger.warn('Error generating context query', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Fallback to using the first 200 chars of the segment
      return segment.substring(0, 200);
    }
  }
  
  /**
   * Assess confidence level based on results and context
   */
  private async determineConfidence(
    result: Record<string, any>,
    retrievalCount: number
  ): Promise<ConfidenceLevel> {
    // Higher confidence if we found relevant context and have substantial insights
    if (retrievalCount > 2 && 
        result.insights && 
        Array.isArray(result.insights) && 
        result.insights.length > 2) {
      return ConfidenceLevel.HIGH;
    }
    
    // Medium confidence if we have some context and insights
    if (retrievalCount > 0 && 
        result.insights && 
        Array.isArray(result.insights) && 
        result.insights.length > 0) {
      return ConfidenceLevel.MEDIUM;
    }
    
    // Default to low confidence
    return ConfidenceLevel.LOW;
  }
  
  /**
   * Implement the required assessConfidence method from the interface
   */
  async assessConfidence(output: any): Promise<ConfidenceLevel> {
    const content = output as Record<string, any>;
    
    // If it's a result with insights array, use that to assess
    if (content.insights && Array.isArray(content.insights)) {
      return content.insights.length > 2 
        ? ConfidenceLevel.HIGH 
        : content.insights.length > 0 
          ? ConfidenceLevel.MEDIUM 
          : ConfidenceLevel.LOW;
    }
    
    // Fall back to super implementation
    return super.assessConfidence(output);
  }
  
  /**
   * Merge multiple analyses 
   */
  async mergeAnalyses(analyses: AgentOutput[]): Promise<AgentOutput> {
    if (analyses.length === 0) {
      return {
        content: {},
        confidence: ConfidenceLevel.UNCERTAIN,
        timestamp: Date.now()
      };
    }
    
    if (analyses.length === 1) {
      return analyses[0];
    }
    
    // For context analysis, we'll create a merged set of insights
    const mergedContent: Record<string, any> = {
      continuity: [],
      changes: [],
      references: [],
      insights: []
    };
    
    let maxConfidence: ConfidenceLevel = ConfidenceLevel.UNCERTAIN;
    
    // Collect all items from each analysis
    for (const analysis of analyses) {
      const content = analysis.content as Record<string, any>;
      
      // Update max confidence
      if (analysis.confidence > maxConfidence) {
        maxConfidence = analysis.confidence;
      }
      
      // Merge continuity items
      if (content.continuity && Array.isArray(content.continuity)) {
        mergedContent.continuity.push(...content.continuity);
      }
      
      // Merge changes items
      if (content.changes && Array.isArray(content.changes)) {
        mergedContent.changes.push(...content.changes);
      }
      
      // Merge references items
      if (content.references && Array.isArray(content.references)) {
        mergedContent.references.push(...content.references);
      }
      
      // Merge insights items
      if (content.insights && Array.isArray(content.insights)) {
        mergedContent.insights.push(...content.insights);
      }
    }
    
    // Helper function for deduplication
    function deduplicateItems<T>(items: T[]): T[] {
      const stringified = items.map(item => JSON.stringify(item));
      const uniqueStrings = [...new Set(stringified)];
      return uniqueStrings.map(str => JSON.parse(str) as T);
    }
    
    // Deduplicate items
    mergedContent.continuity = deduplicateItems(mergedContent.continuity);
    mergedContent.changes = deduplicateItems(mergedContent.changes);
    mergedContent.references = deduplicateItems(mergedContent.references);
    mergedContent.insights = deduplicateItems(mergedContent.insights);
    
    return {
      content: mergedContent,
      confidence: maxConfidence,
      timestamp: Date.now()
    };
  }
  
  /**
   * Prioritize information for the final output
   */
  async prioritizeInformation(analysis: AgentOutput): Promise<AgentOutput> {
    const content = analysis.content as Record<string, any>;
    
    // If there's nothing to prioritize, return as is
    if (!content.insights || content.insights.length === 0) {
      return analysis;
    }
    
    // For this simple implementation, just limit the number of items
    const maxItems = 5;
    
    const prioritized = {
      ...content,
      continuity: content.continuity?.slice(0, maxItems) || [],
      changes: content.changes?.slice(0, maxItems) || [],
      references: content.references?.slice(0, maxItems) || [],
      insights: content.insights?.slice(0, maxItems) || []
    };
    
    return {
      content: prioritized,
      confidence: analysis.confidence,
      timestamp: Date.now()
    };
  }
  
  /**
   * Get enhanced system prompt for this agent
   */
  protected getDefaultSystemPrompt(): string {
    return `
      You are a Context Integration Agent specializing in connecting current discussions with historical data.
      
      Your responsibilities include:
      1. Identifying relationships between current topics and previous discussions
      2. Detecting continuity in projects, decisions, or action items across meetings
      3. Highlighting contradictions or changes to previous decisions
      4. Providing valuable context to ensure discussions are properly understood
      
      Always format your analysis clearly and focus on the most relevant insights.
    `;
  }
} 