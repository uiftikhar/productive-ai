import { Logger } from '../../../shared/logger/logger.interface';
import { v4 as uuidv4 } from 'uuid';
import { PersistentStateManager } from '../../core/state/persistent-state-manager';
import { HierarchicalStateRepository, MeetingAnalysisResult } from '../../core/state/hierarchical-state-repository';
import { ChatAgentInterface } from '../../core/chat/chat-agent-interface';
import { EnhancedTranscriptProcessor, ProcessedTranscript, TranscriptFormat, TranscriptInput } from '../../core/transcript/enhanced-transcript-processor';
import { IntegrationRegistry } from '../../core/integration/integration-framework';
import { AnalysisGoalType, AnalysisTaskStatus } from '../interfaces/agent.interface';
import { MeetingMetadata, AnalysisProgress } from '../interfaces/state.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { TextTranscriptParser } from '../../core/transcript/parsers/text-transcript-parser';

/**
 * Interface for the session mapping from meeting ID to session ID
 */
interface MeetingSessionMapping {
  /**
   * The ID of the analysis session
   */
  sessionId: string;
  
  /**
   * When the mapping was created
   */
  createdAt: number;
  
  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Input for starting a new meeting analysis
 */
export interface AnalysisInput {
  /**
   * Meeting ID (optional, will be generated if not provided)
   */
  meetingId?: string;
  
  /**
   * Raw meeting transcript
   */
  transcript: string;
  
  /**
   * Format of the transcript (will be auto-detected if not specified)
   */
  transcriptFormat?: TranscriptFormat;
  
  /**
   * Meeting title
   */
  title?: string;
  
  /**
   * Meeting description
   */
  description?: string;
  
  /**
   * Participant information
   */
  participants?: {
    id: string;
    name: string;
    role?: string;
    email?: string;
  }[];
  
  /**
   * User ID initiating the analysis
   */
  userId?: string;
  
  /**
   * Analysis goals to focus on
   */
  goals?: AnalysisGoalType[];
  
  /**
   * Context information for the analysis
   */
  context?: {
    /**
     * IDs of related previous meetings
     */
    previousMeetings?: string[];
    
    /**
     * Related document references
     */
    relatedDocuments?: string[];
    
    /**
     * Project information
     */
    projectInfo?: Record<string, any>;
    
    /**
     * Organization information
     */
    organizationInfo?: Record<string, any>;
  };
  
  /**
   * Analysis options
   */
  options?: {
    /**
     * Whether to generate visualizations
     */
    visualization?: boolean;
    
    /**
     * Whether to include detailed reasoning
     */
    detailedReasoning?: boolean;
    
    /**
     * Maximum execution time in milliseconds
     */
    maxExecutionTime?: number;
    
    /**
     * External system integrations to use
     */
    integrations?: string[];
  };
}

/**
 * Analysis session representing an ongoing or completed analysis
 */
export interface AnalysisSession {
  /**
   * Meeting ID
   */
  meetingId: string;
  
  /**
   * Session ID
   */
  sessionId: string;
  
  /**
   * Current session status
   */
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  
  /**
   * Analysis progress information
   */
  progress: AnalysisProgress;
  
  /**
   * Analysis start time
   */
  startTime: number;
  
  /**
   * Analysis end time (if completed)
   */
  endTime?: number;
  
  /**
   * Error information (if failed)
   */
  error?: {
    message: string;
    code: string;
    details?: any;
  };
  
  /**
   * Meeting metadata
   */
  metadata: MeetingMetadata;
  
  /**
   * User who initiated the analysis
   */
  userId?: string;
  
  /**
   * Options that were applied for this analysis
   */
  options: Record<string, any>;
}

/**
 * Information about related meetings
 */
export interface RelatedMeetingInfo {
  /**
   * Meeting ID
   */
  meetingId: string;
  
  /**
   * Meeting title
   */
  title?: string;
  
  /**
   * Meeting timestamp
   */
  timestamp: number;
  
  /**
   * Meeting duration in seconds
   */
  duration?: number;
  
  /**
   * Meeting participants
   */
  participants: {
    id: string;
    name: string;
  }[];
  
  /**
   * Key topics
   */
  topics?: {
    name: string;
    relevance: number;
  }[];
  
  /**
   * Relevance score to the target meeting
   */
  relevance: number;
  
  /**
   * Relation type
   */
  relationType: 'previous' | 'follow-up' | 'similar' | 'related-project';
}

/**
 * Search result for similar meetings
 */
interface MeetingSearchResult {
  meetingId: string;
  score: number;
  meeting: MeetingAnalysisResult;
}

/**
 * Meeting search parameters
 */
interface MeetingSearchParams {
  topics?: string[];
  participants?: string[];
  timeRange?: {
    start: number;
    end: number;
  };
  limit?: number;
  offset?: number;
}

/**
 * Meeting search result interface
 */
interface MeetingSearchResponse {
  meetingId: string;
  relevance: number;
  [key: string]: any;
}

/**
 * Coordination service for supervisor integration
 * Provides a unified interface for working with the hierarchical agent architecture
 */
export class SupervisorCoordinationService {
  private logger: Logger;
  
  /**
   * Create a new supervisor coordination service
   */
  constructor(
    private persistentState: PersistentStateManager,
    private stateRepository: HierarchicalStateRepository,
    private chatInterface: ChatAgentInterface,
    private transcriptProcessor: EnhancedTranscriptProcessor,
    private integrationRegistry: IntegrationRegistry,
    options?: {
      logger?: Logger;
    }
  ) {
    this.logger = options?.logger || new ConsoleLogger();
    this.logger.info('Initialized SupervisorCoordinationService');
  }
  
  /**
   * Initialize a new meeting analysis
   */
  async initializeAnalysis(input: AnalysisInput): Promise<AnalysisSession> {
    const meetingId = input.meetingId || `meeting-${uuidv4()}`;
    const sessionId = `session-${uuidv4()}`;
    const startTime = Date.now();
    
    this.logger.info(`Initializing analysis for meeting ${meetingId}`, {
      meetingId,
      sessionId,
      userId: input.userId,
      goals: input.goals
    });
    
    try {
      // Process the transcript
      const transcriptFormat = input.transcriptFormat || TranscriptFormat.AUTO_DETECT;
      const processedTranscript = await this.processTranscript(
        meetingId,
        input.transcript,
        transcriptFormat
      );
      
      // Create meeting metadata
      const metadata: MeetingMetadata = {
        meetingId,
        title: input.title || `Meeting ${meetingId}`,
        description: input.description,
        date: new Date(startTime).toISOString(),
        participants: input.participants || this.extractParticipantsFromTranscript(processedTranscript),
        context: input.context
      };
      
      // Determine analysis goals
      const goals = input.goals || [
        AnalysisGoalType.GENERATE_SUMMARY,
        AnalysisGoalType.EXTRACT_TOPICS,
        AnalysisGoalType.EXTRACT_ACTION_ITEMS
      ];
      
      // Initialize analysis progress
      const progress: AnalysisProgress = {
        meetingId,
        goals: goals.map(type => ({
          type,
          status: AnalysisTaskStatus.PENDING,
          progress: 0
        })),
        taskStatuses: {},
        overallProgress: 0,
        started: startTime,
        lastUpdated: startTime
      };
      
      // Create analysis session
      const session: AnalysisSession = {
        meetingId,
        sessionId,
        status: 'pending',
        progress,
        startTime,
        metadata,
        userId: input.userId,
        options: {
          goals,
          visualization: input.options?.visualization || false,
          detailedReasoning: input.options?.detailedReasoning || false,
          maxExecutionTime: input.options?.maxExecutionTime || 300000, // 5 minutes default
          integrations: input.options?.integrations || []
        }
      };
      
      // Save session in persistent state
      await this.persistentState.saveState(
        `analysis_session:${sessionId}`,
        session,
        { 
          ttl: 7 * 24 * 60 * 60, // 7 days TTL
          description: 'Initial analysis session creation'
        }
      );
      
      // Save meeting to session mapping
      await this.persistentState.saveState(
        `meeting:${meetingId}`,
        {
          sessionId,
          createdAt: startTime,
          metadata: {
            title: metadata.title,
            userId: input.userId
          }
        } as MeetingSessionMapping,
        { 
          ttl: 7 * 24 * 60 * 60, // 7 days TTL
          description: 'Meeting to session mapping'
        }
      );
      
      // Save processed transcript
      await this.persistentState.saveState(
        `processed_transcript:${meetingId}`,
        processedTranscript,
        { 
          ttl: 30 * 24 * 60 * 60, // 30 days TTL
          description: 'Processed transcript storage'
        }
      );
      
      // Connect requested integrations
      if (input.options?.integrations?.length) {
        await this.setupIntegrations(input.options.integrations);
      }
      
      // Begin the analysis process asynchronously
      this.startAnalysisProcess(session).catch(error => {
        this.logger.error(`Error starting analysis process for meeting ${meetingId}`, {
          meetingId,
          sessionId,
          error: error.message,
          stack: error.stack
        });
        
        // Update session status to failed
        this.updateSessionStatus(sessionId, 'failed', {
          message: error.message,
          code: 'ANALYSIS_INITIALIZATION_ERROR'
        });
      });
      
      return session;
    } catch (error: any) {
      this.logger.error(`Error initializing analysis for meeting ${meetingId}`, {
        meetingId,
        error: error.message,
        stack: error.stack
      });
      
      // Create failed session
      const failedSession: AnalysisSession = {
        meetingId,
        sessionId,
        status: 'failed',
        progress: {
          meetingId,
          goals: [],
          taskStatuses: {},
          overallProgress: 0,
          started: startTime,
          lastUpdated: startTime
        },
        startTime,
        endTime: Date.now(),
        error: {
          message: error.message,
          code: 'INITIALIZATION_FAILED'
        },
        metadata: {
          meetingId,
          title: input.title || `Meeting ${meetingId}`,
          participants: []
        },
        options: {}
      };
      
      // Save failed session
      await this.persistentState.saveState(
        `analysis_session:${sessionId}`,
        failedSession,
        { 
          ttl: 7 * 24 * 60 * 60, // 7 days TTL
          description: 'Failed analysis session'
        }
      );
      
      // Save meeting to session mapping even for failed sessions
      await this.persistentState.saveState(
        `meeting:${meetingId}`,
        {
          sessionId,
          createdAt: startTime,
          metadata: {
            title: failedSession.metadata.title,
            userId: input.userId,
            status: 'failed'
          }
        } as MeetingSessionMapping,
        { 
          ttl: 7 * 24 * 60 * 60, // 7 days TTL
          description: 'Meeting to session mapping (failed)'
        }
      );
      
      return failedSession;
    }
  }
  
  /**
   * Resume an existing analysis session
   */
  async resumeAnalysis(sessionId: string): Promise<AnalysisSession> {
    this.logger.info(`Resuming analysis session ${sessionId}`);
    
    // Get session from persistent state
    const rawSession = await this.getStateData<AnalysisSession>(`analysis_session:${sessionId}`);
    if (!rawSession) {
      throw new Error(`Analysis session ${sessionId} not found`);
    }
    
    // If session is completed or failed, just return it
    if (rawSession.status === 'completed' || rawSession.status === 'failed') {
      return rawSession;
    }
    
    // If session is pending or in_progress, resume it
    if (rawSession.status === 'pending') {
      // Start the analysis process
      this.startAnalysisProcess(rawSession).catch(error => {
        this.logger.error(`Error starting analysis process for session ${sessionId}`, {
          sessionId,
          meetingId: rawSession.meetingId,
          error: error.message,
          stack: error.stack
        });
        
        // Update session status to failed
        this.updateSessionStatus(sessionId, 'failed', {
          message: error.message,
          code: 'ANALYSIS_RESUME_ERROR'
        });
      });
    } else if (rawSession.status === 'in_progress') {
      // Check if the session has been stalled for too long
      const now = Date.now();
      const lastUpdated = rawSession.progress.lastUpdated;
      const stallThreshold = 10 * 60 * 1000; // 10 minutes
      
      if (now - lastUpdated > stallThreshold) {
        this.logger.warn(`Analysis session ${sessionId} appears to be stalled, restarting`);
        
        // Update last updated timestamp
        await this.persistentState.updateState(
          `analysis_session:${sessionId}`,
          { progress: { lastUpdated: now } },
          { 
            ttl: 7 * 24 * 60 * 60, // 7 days TTL
            description: 'Update stalled session timestamp'
          }
        );
        
        // Restart the analysis process
        this.resumeAnalysisProcess(rawSession).catch(error => {
          this.logger.error(`Error resuming analysis process for session ${sessionId}`, {
            sessionId,
            meetingId: rawSession.meetingId,
            error: error.message,
            stack: error.stack
          });
          
          // Update session status to failed
          this.updateSessionStatus(sessionId, 'failed', {
            message: error.message,
            code: 'ANALYSIS_RESUME_ERROR'
          });
        });
      }
    }
    
    return rawSession;
  }
  
  /**
   * Get information about meetings related to the given session
   */
  async getRelatedMeetings(sessionId: string): Promise<RelatedMeetingInfo[]> {
    // Get session from persistent state
    const session = await this.getStateData<AnalysisSession>(`analysis_session:${sessionId}`);
    if (!session) {
      throw new Error(`Analysis session ${sessionId} not found`);
    }
    
    // Get explicit previous meetings from context if available
    const previousMeetingIds = session.metadata.context?.previousMeetings || [];
    
    // Find explicitly related meetings
    const explicitlyRelatedMeetings: RelatedMeetingInfo[] = [];
    
    if (previousMeetingIds.length > 0) {
      for (const meetingId of previousMeetingIds) {
        try {
          const meetingResult = await this.getMeetingResult(meetingId);
          if (meetingResult) {
            explicitlyRelatedMeetings.push(this.convertToRelatedMeetingInfo(meetingResult, 'previous', 0.9));
          }
        } catch (error) {
          this.logger.warn(`Error fetching related meeting ${meetingId}`, { error });
        }
      }
    }
    
    // Find semantically similar meetings
    let similarMeetings: RelatedMeetingInfo[] = [];
    
    try {
      // Get the current meeting's topics, if analysis is completed
      const currentMeetingResult = await this.getMeetingResult(session.meetingId);
      
      if (currentMeetingResult && currentMeetingResult.topics && currentMeetingResult.topics.length > 0) {
        // Extract topics as keywords
        const topicKeywords = currentMeetingResult.topics
          .filter(topic => topic.relevance > 0.6)
          .flatMap(topic => [topic.name, ...(topic.keywords || [])]);
        
        if (topicKeywords.length > 0) {
          // Search for meetings with similar topics
          const searchResults = await this.searchMeetingsByTopics(topicKeywords, 5);
          
          // Convert search results to related meeting info
          similarMeetings = searchResults
            .filter(result => result.meetingId !== session.meetingId) // Exclude current meeting
            .map(result => this.convertToRelatedMeetingInfo(
              result.meeting,
              'similar',
              result.score
            ));
        }
      }
    } catch (error) {
      this.logger.warn('Error searching for similar meetings', { error });
    }
    
    // Combine and deduplicate results
    const allMeetings = [...explicitlyRelatedMeetings, ...similarMeetings];
    const meetingMap = new Map<string, RelatedMeetingInfo>();
    
    for (const meeting of allMeetings) {
      // If meeting already exists, keep the one with higher relevance
      if (meetingMap.has(meeting.meetingId)) {
        const existing = meetingMap.get(meeting.meetingId)!;
        if (meeting.relevance > existing.relevance) {
          meetingMap.set(meeting.meetingId, meeting);
        }
      } else {
        meetingMap.set(meeting.meetingId, meeting);
      }
    }
    
    return Array.from(meetingMap.values())
      .sort((a, b) => b.relevance - a.relevance);
  }
  
  /**
   * Get state data from persistent storage with proper typing
   */
  private async getStateData<T>(stateId: string): Promise<T | null> {
    try {
      const state = await this.persistentState.hasState(stateId);
      if (!state) {
        return null;
      }
      
      // Use the storage adapter's get method directly since getState doesn't exist
      const rawData = await this.persistentState['storageAdapter'].get(
        this.persistentState['getStateKey'] ? 
          this.persistentState['getStateKey'](stateId) : 
          `state:${stateId}`
      );
      
      // Handle auto-deserialization if needed
      if (rawData && typeof rawData === 'object' && 'data' in rawData) {
        return rawData.data as T;
      }
      
      return rawData as T;
    } catch (error) {
      this.logger.error(`Error getting state data for ${stateId}`, { error });
      return null;
    }
  }
  
  /**
   * Process a raw transcript into a structured format
   */
  private async processTranscript(
    meetingId: string,
    content: string,
    format: TranscriptFormat = TranscriptFormat.AUTO_DETECT
  ): Promise<ProcessedTranscript> {
    try {
      this.logger.info('Processing transcript', {
        format,
        meetingId,
        contentLength: content.length
      });
      
      // Create transcript processor with text parser registered
      const processor = new EnhancedTranscriptProcessor({
        logger: this.logger,
        defaultFormat: TranscriptFormat.PLAIN_TEXT
      });
      
      // Register text parser to handle plain text format
      processor.registerParser(new TextTranscriptParser({ logger: this.logger }));
      
      // Process the transcript
      const input: TranscriptInput = {
        meetingId,
        content,
        format
      };
      
      return await processor.process(input);
    } catch (error: any) {
      this.logger.error('Error processing transcript', {
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      
      throw new Error(`Failed to process transcript: ${(error as Error).message}`);
    }
  }
  
  /**
   * Extract participants from processed transcript
   */
  private extractParticipantsFromTranscript(transcript: ProcessedTranscript): MeetingMetadata['participants'] {
    const participantsMap = new Map<string, {
      id: string;
      name: string;
    }>();
    
    // Extract unique speakers from the transcript
    for (const entry of transcript.entries) {
      if (!participantsMap.has(entry.normalizedSpeakerId)) {
        const speakerName = entry.speakerName || `Speaker ${entry.normalizedSpeakerId}`;
        participantsMap.set(entry.normalizedSpeakerId, {
          id: entry.normalizedSpeakerId,
          name: speakerName
        });
      }
    }
    
    return Array.from(participantsMap.values());
  }
  
  /**
   * Start the analysis process for a session
   */
  private async startAnalysisProcess(session: AnalysisSession): Promise<void> {
    // Update session status
    await this.updateSessionStatus(session.sessionId, 'in_progress');
    
    // Get processed transcript
    const transcript = await this.getStateData<ProcessedTranscript>(`processed_transcript:${session.meetingId}`);
    if (!transcript) {
      throw new Error(`Processed transcript for meeting ${session.meetingId} not found`);
    }
    
    // TODO: Implement the actual analysis process using the chatInterface and integrations
    
    // For now, we'll simulate the analysis process with a timeout
    setTimeout(async () => {
      try {
        this.logger.info(`Completing simulated analysis for session ${session.sessionId}`);
        
        // Update progress to 100%
        const updatedSession = await this.getStateData<AnalysisSession>(`analysis_session:${session.sessionId}`);
        if (!updatedSession) {
          this.logger.warn(`Session ${session.sessionId} not found during completion`);
          return;
        }
        
        if (updatedSession.status === 'in_progress') {
          // Update progress for all goals
          updatedSession.progress.goals = updatedSession.progress.goals.map(goal => ({
            ...goal,
            status: AnalysisTaskStatus.COMPLETED,
            progress: 100,
            endTime: Date.now()
          }));
          
          updatedSession.progress.overallProgress = 100;
          updatedSession.progress.lastUpdated = Date.now();
          
          // Mark session as completed
          updatedSession.status = 'completed';
          updatedSession.endTime = Date.now();
          
          // Save updated session
          await this.persistentState.updateState(
            `analysis_session:${session.sessionId}`,
            updatedSession,
            { 
              ttl: 7 * 24 * 60 * 60, // 7 days TTL
              description: 'Complete analysis session'
            }
          );
        }
      } catch (error: any) {
        this.logger.error(`Error in simulated analysis completion for session ${session.sessionId}`, {
          sessionId: session.sessionId,
          error: error.message
        });
      }
    }, 10000); // 10 seconds for simulation
  }
  
  /**
   * Resume an analysis process that was previously started
   */
  private async resumeAnalysisProcess(session: AnalysisSession): Promise<void> {
    // Similar to startAnalysisProcess but with state recovery
    // This would pick up where the analysis left off
    
    // For demo purposes, use the same simulated approach as startAnalysisProcess
    await this.startAnalysisProcess(session);
  }
  
  /**
   * Update the status of an analysis session
   */
  private async updateSessionStatus(
    sessionId: string,
    status: AnalysisSession['status'],
    error?: AnalysisSession['error']
  ): Promise<void> {
    try {
      const session = await this.getStateData<AnalysisSession>(`analysis_session:${sessionId}`);
      if (!session) {
        this.logger.warn(`Session ${sessionId} not found during status update`);
        return;
      }
      
      const updates: Partial<AnalysisSession> = {
        status,
        progress: {
          ...session.progress,
          lastUpdated: Date.now()
        }
      };
      
      if (status === 'completed') {
        updates.endTime = Date.now();
      } else if (status === 'failed' && error) {
        updates.endTime = Date.now();
        updates.error = error;
      }
      
      await this.persistentState.updateState(
        `analysis_session:${sessionId}`,
        updates,
        { 
          ttl: 7 * 24 * 60 * 60, // 7 days TTL
          description: `Update session status to ${status}`
        }
      );
    } catch (error: any) {
      this.logger.error(`Error updating session status for ${sessionId}`, {
        sessionId,
        status,
        error: error.message
      });
    }
  }
  
  /**
   * Set up integration connectors
   */
  private async setupIntegrations(integrationIds: string[]): Promise<void> {
    try {
      // Connect all requested integrations
      for (const id of integrationIds) {
        const [type, connectorId] = id.split(':');
        if (!type || !connectorId) {
          this.logger.warn(`Invalid integration ID format: ${id}`);
          continue;
        }
        
        const integrationType = type as any;
        const connector = this.integrationRegistry.getConnector(integrationType, connectorId);
        
        if (connector) {
          if (!connector.isConnected()) {
            this.logger.info(`Connecting integration: ${id}`);
            await connector.connect();
          }
        } else {
          this.logger.warn(`Integration not found: ${id}`);
        }
      }
    } catch (error: any) {
      this.logger.error('Error setting up integrations', { error: error.message });
    }
  }
  
  /**
   * Get the meeting result from the state repository or storage
   * Wrapper method to handle private/public method access
   */
  private async getMeetingResult(meetingId: string): Promise<MeetingAnalysisResult | null> {
    try {
      // First check if there's a stored result in the state manager
      const result = await this.getStateData<MeetingAnalysisResult>(`meeting_result:${meetingId}`);
      if (result) {
        return result;
      }
      
      // If direct repository method is available, use it
      // This implementation will vary based on the actual repository API
      const results = await this.queryMeetingResults([meetingId]);
      return results.length > 0 ? results[0] : null;
    } catch (error) {
      this.logger.warn(`Error getting meeting result for ${meetingId}`, { error });
      return null;
    }
  }
  
  /**
   * Query meeting results by meeting IDs
   * This is a wrapper method for any repository-specific implementation
   */
  private async queryMeetingResults(meetingIds: string[]): Promise<MeetingAnalysisResult[]> {
    // This implementation would depend on the actual repository interface
    // For now, we'll return an empty array and rely on direct state access
    this.logger.warn(`Repository method for querying meetings by IDs not implemented`);
    return [];
  }
  
  /**
   * Search for meetings by topics
   * Wrapper method to handle search capabilities
   */
  private async searchMeetingsByTopics(
    topics: string[],
    limit: number = 5
  ): Promise<MeetingSearchResult[]> {
    try {
      // Create a search query based on topics
      const searchParams: MeetingSearchParams = {
        topics,
        limit
      };
      
      const searchResults = await this.searchMeetings(searchParams);
      
      // Transform results to the expected format
      return searchResults.map(result => ({
        meetingId: result.meetingId,
        score: result.relevance,
        meeting: result as unknown as MeetingAnalysisResult
      }));
    } catch (error) {
      this.logger.warn('Error searching meetings by topics', { error });
      return [];
    }
  }
  
  /**
   * Search meetings using repository capabilities
   * This is a wrapper method for any repository-specific implementation
   */
  private async searchMeetings(params: MeetingSearchParams): Promise<MeetingSearchResponse[]> {
    // This implementation would depend on the actual repository interface
    // For now, we'll return an empty array and rely on direct state access
    this.logger.warn(`Repository method for searching meetings not implemented`);
    return [];
  }
  
  /**
   * Convert a MeetingAnalysisResult to a RelatedMeetingInfo
   */
  private convertToRelatedMeetingInfo(
    meetingResult: MeetingAnalysisResult,
    relationType: RelatedMeetingInfo['relationType'],
    relevance: number
  ): RelatedMeetingInfo {
    return {
      meetingId: meetingResult.meetingId,
      title: meetingResult.title,
      timestamp: meetingResult.timestamp,
      duration: meetingResult.duration,
      participants: meetingResult.participants.map(p => ({
        id: p.id,
        name: p.name
      })),
      topics: meetingResult.topics?.map(t => ({
        name: t.name,
        relevance: t.relevance
      })),
      relevance,
      relationType
    };
  }

  /**
   * Get an analysis session by meeting ID
   */
  async getAnalysisSessionForMeeting(meetingId: string): Promise<AnalysisSession | null> {
    try {
      // Load the meeting to session mapping
      const sessionMapping = await this.loadMeetingSessionMapping(meetingId);
      
      if (!sessionMapping || !sessionMapping.sessionId) {
        this.logger.warn(`No valid mapping found for meeting ${meetingId}`);
        return null;
      }
      
      // Get the analysis session using the session ID from the mapping
      return await this.getAnalysisSession(sessionMapping.sessionId);
    } catch (error) {
      this.logger.error(`Error getting analysis session for meeting ${meetingId}`, { error });
      return null;
    }
  }

  /**
   * Load the meeting session mapping from the state
   */
  private async loadMeetingSessionMapping(meetingId: string): Promise<MeetingSessionMapping | null> {
    const meetingKey = `meeting:${meetingId}`;
    try {
      const exists = await this.persistentState.hasState(meetingKey);
      
      if (!exists) {
        return null;
      }
      
      // Get raw state data
      const stateData = await this.persistentState.loadState(meetingKey);
      
      // Handle both object and string formats
      let mapping: MeetingSessionMapping;
      if (typeof stateData === 'string') {
        try {
          // Try to parse if it's a string
          const parsed = JSON.parse(stateData);
          mapping = parsed.data || parsed;
        } catch (parseError) {
          this.logger.error(`Failed to parse meeting mapping for ${meetingId}`, { error: parseError });
          return null;
        }
      } else {
        mapping = stateData as MeetingSessionMapping;
      }
      
      return mapping;
    } catch (error) {
      this.logger.error(`Error loading meeting session mapping for ${meetingId}`, { error });
      return null;
    }
  }

  /**
   * Get an analysis session by session ID
   */
  async getAnalysisSession(sessionId: string): Promise<AnalysisSession | null> {
    try {
      const sessionKey = `analysis_session:${sessionId}`;
      const analysisSession = await this.persistentState.loadState<AnalysisSession>(sessionKey);
      
      if (!analysisSession) {
        this.logger.warn(`Analysis session not found for ${sessionId}`);
        return null;
      }
      
      return analysisSession;
    } catch (error) {
      this.logger.error(`Error loading analysis session ${sessionId}`, { error });
      return null;
    }
  }
} 