import { Logger } from '../../../shared/logger/logger.interface';
import { SupervisorService } from '../supervisor/supervisor.service';
import { IntentParserService } from './intent-parser.service';
import { ResponseFormatterService } from './response-formatter.service';

/**
 * User message interface
 */
export interface UserMessage {
  /**
   * Unique message ID
   */
  id: string;
  
  /**
   * Message content from user
   */
  content: string;
  
  /**
   * Optional attachments (files, etc.)
   */
  attachments?: {
    /**
     * Type of attachment
     */
    type: string;
    
    /**
     * Attachment data (could be file path, base64 content, etc.)
     */
    data: any;
    
    /**
     * Metadata about the attachment
     */
    metadata?: Record<string, any>;
  }[];
  
  /**
   * Timestamp when message was sent
   */
  timestamp: number;
}

/**
 * Chat session interface
 */
export interface ChatSession {
  /**
   * Unique session ID
   */
  id: string;
  
  /**
   * User ID associated with the session
   */
  userId: string;
  
  /**
   * Session metadata
   */
  metadata?: Record<string, any>;
  
  /**
   * Current meeting ID (if any)
   */
  currentMeetingId?: string;

  timestamp?: number;
}

/**
 * Response returned to the user
 */
export interface ChatResponse {
  /**
   * Unique response ID
   */
  id: string;
  
  /**
   * Text content of the response
   */
  content: string;
  
  /**
   * Response type (text, visualization, error, etc.)
   */
  type: 'text' | 'visualization' | 'error' | 'loading' | 'analysis' | 'action';
  
  /**
   * Optional attachments in the response
   */
  attachments?: {
    /**
     * Type of attachment
     */
    type: string;
    
    /**
     * URL or data for the attachment
     */
    data: any;
    
    /**
     * Metadata about the attachment
     */
    metadata?: Record<string, any>;
  }[];
  
  /**
   * Timestamp when response was generated
   */
  timestamp: number;
  
  /**
   * Error information (if applicable)
   */
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Options for the chat agent interface
 */
export interface ChatAgentInterfaceOptions {
  /**
   * Supervisor service instance
   */
  supervisorService: SupervisorService;
  
  /**
   * Intent parser service
   */
  intentParser: IntentParserService;
  
  /**
   * Response formatter service
   */
  responseFormatter: ResponseFormatterService;
  
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Default timeout for operations in ms
   */
  defaultTimeoutMs?: number;
}

/**
 * Error types specific to chat interactions
 */
export enum ChatErrorType {
  INTENT_PARSING_ERROR = 'intent_parsing_error',
  TRANSCRIPT_PROCESSING_ERROR = 'transcript_processing_error',
  ANALYSIS_ERROR = 'analysis_error',
  SESSION_ERROR = 'session_error',
  TIMEOUT_ERROR = 'timeout_error',
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * Core chat agent interface
 * Handles interactions between users and the supervisor
 */
export class ChatAgentInterface {
  private supervisorService: SupervisorService;
  private intentParser: IntentParserService;
  private responseFormatter: ResponseFormatterService;
  private logger?: Logger;
  private defaultTimeoutMs: number;
  
  /**
   * Create a new chat agent interface
   */
  constructor(options: ChatAgentInterfaceOptions) {
    this.supervisorService = options.supervisorService;
    this.intentParser = options.intentParser;
    this.responseFormatter = options.responseFormatter;
    this.logger = options.logger;
    this.defaultTimeoutMs = options.defaultTimeoutMs || 30000; // 30 second default
  }
  
  /**
   * Handle a user message
   * 
   * @param session - Current chat session
   * @param message - User message to process
   * @returns Chat response
   */
  async handleUserMessage(session: ChatSession, message: UserMessage): Promise<ChatResponse> {
    try {
      this.logger?.debug(`Processing message ${message.id} for session ${session.id}`, {
        sessionId: session.id,
        messageId: message.id
      });
      
      // Parse the user's intent
      const intent = await this.intentParser.parseIntent(message.content, message.attachments);
      
      // Route based on intent
      switch (intent.type) {
        case 'upload_transcript':
          return this.uploadTranscript(session, intent.parameters.transcript, intent.parameters.meetingId);
          
        case 'query_analysis':
          return this.queryAnalysis(session, intent.parameters.query);
          
        case 'visualization_request':
          return this.getVisualization(session, intent.parameters.visualizationType, intent.parameters.options);
          
        case 'refresh_analysis':
          return this.refreshAnalysis(session);
          
        case 'clarification_request':
          return this.handleClarification(session, intent.parameters.topic);
          
        default:
          // Unknown intent, provide general help
          return this.generateHelpResponse(session, message);
      }
    } catch (error) {
      // Handle and log errors
      return this.handleError(session, error, message);
    }
  }
  
  /**
   * Upload and process a transcript
   * 
   * @param session - Current chat session
   * @param transcript - Meeting transcript to process
   * @param meetingId - Optional meeting ID
   * @returns Chat response
   */
  async uploadTranscript(session: ChatSession, transcript: string, meetingId?: string): Promise<ChatResponse> {
    this.logger?.info(`Processing transcript upload for session ${session.id}`, {
      sessionId: session.id,
      transcriptLength: transcript.length,
      meetingId
    });
    
    try {
      // Create a loading response to indicate processing has started
      const loadingResponse = this.createLoadingResponse("Processing transcript...");
      
      // Process the transcript with timeout protection
      const result = await this.withTimeout(
        this.supervisorService.processTranscript(transcript, meetingId || `meeting-${Date.now()}`),
        this.defaultTimeoutMs,
        'Transcript processing timed out'
      );
      
      // Update the session with the current meeting ID
      session.currentMeetingId = result.meetingId;
      
      // Format the response
      return this.responseFormatter.formatTranscriptProcessingResult(result);
    } catch (error: any) {
      this.logger?.error(`Error processing transcript for session ${session.id}`, {
        sessionId: session.id,
        error: error.message,
        stack: error.stack
      });
      
      return this.handleError(session, error, null, ChatErrorType.TRANSCRIPT_PROCESSING_ERROR);
    }
  }
  
  /**
   * Query analysis results
   * 
   * @param session - Current chat session
   * @param query - User query about the analysis
   * @returns Chat response
   */
  async queryAnalysis(session: ChatSession, query: string): Promise<ChatResponse> {
    if (!session.currentMeetingId) {
      return this.createErrorResponse(
        'No meeting transcript has been uploaded. Please upload a transcript first.',
        ChatErrorType.SESSION_ERROR
      );
    }
    
    this.logger?.info(`Processing analysis query for session ${session.id}`, {
      sessionId: session.id,
      meetingId: session.currentMeetingId,
      query
    });
    
    try {
      // Get the analysis result for the query
      const result = await this.withTimeout(
        this.supervisorService.queryAnalysis(session.currentMeetingId, query),
        this.defaultTimeoutMs,
        'Analysis query timed out'
      );
      
      // Format the result
      return this.responseFormatter.formatAnalysisQueryResult(result, query);
    } catch (error: any) {
      this.logger?.error(`Error querying analysis for session ${session.id}`, {
        sessionId: session.id,
        meetingId: session.currentMeetingId,
        query,
        error: error.message,
        stack: error.stack
      });
      
      return this.handleError(session, error, null, ChatErrorType.ANALYSIS_ERROR);
    }
  }
  
  /**
   * Get visualization for the current analysis
   * 
   * @param session - Current chat session
   * @param visualizationType - Type of visualization requested
   * @param options - Visualization options
   * @returns Chat response with visualization
   */
  async getVisualization(
    session: ChatSession,
    visualizationType: string,
    options?: Record<string, any>
  ): Promise<ChatResponse> {
    if (!session.currentMeetingId) {
      return this.createErrorResponse(
        'No meeting transcript has been uploaded. Please upload a transcript first.',
        ChatErrorType.SESSION_ERROR
      );
    }
    
    this.logger?.info(`Generating visualization for session ${session.id}`, {
      sessionId: session.id,
      meetingId: session.currentMeetingId,
      visualizationType,
      options
    });
    
    try {
      // Get the visualization
      const visualization = await this.withTimeout(
        this.supervisorService.generateVisualization(session.currentMeetingId, visualizationType, options),
        this.defaultTimeoutMs,
        'Visualization generation timed out'
      );
      
      // Format the visualization response
      return this.responseFormatter.formatVisualization(visualization, visualizationType);
    } catch (error: any) {
      this.logger?.error(`Error generating visualization for session ${session.id}`, {
        sessionId: session.id,
        meetingId: session.currentMeetingId,
        visualizationType,
        error: error.message,
        stack: error.stack
      });
      
      return this.handleError(session, error, null, ChatErrorType.ANALYSIS_ERROR);
    }
  }
  
  /**
   * Refresh the analysis for the current meeting
   * 
   * @param session - Current chat session
   * @returns Chat response
   */
  async refreshAnalysis(session: ChatSession): Promise<ChatResponse> {
    if (!session.currentMeetingId) {
      return this.createErrorResponse(
        'No meeting transcript has been uploaded. Please upload a transcript first.',
        ChatErrorType.SESSION_ERROR
      );
    }
    
    this.logger?.info(`Refreshing analysis for session ${session.id}`, {
      sessionId: session.id,
      meetingId: session.currentMeetingId
    });
    
    try {
      // Create a loading response
      const loadingResponse = this.createLoadingResponse("Refreshing analysis...");
      
      // Refresh the analysis
      const result = await this.withTimeout(
        this.supervisorService.refreshAnalysis(session.currentMeetingId),
        this.defaultTimeoutMs,
        'Analysis refresh timed out'
      );
      
      // Format the response
      return this.responseFormatter.formatAnalysisRefreshResult(result);
    } catch (error: any) {
      this.logger?.error(`Error refreshing analysis for session ${session.id}`, {
        sessionId: session.id,
        meetingId: session.currentMeetingId,
        error: error.message,
        stack: error.stack
      });
      
      return this.handleError(session, error, null, ChatErrorType.ANALYSIS_ERROR);
    }
  }
  
  /**
   * Handle clarification requests
   * 
   * @param session - Current chat session
   * @param topic - Topic to clarify
   * @returns Chat response
   */
  async handleClarification(session: ChatSession, topic: string): Promise<ChatResponse> {
    this.logger?.info(`Processing clarification request for session ${session.id}`, {
      sessionId: session.id,
      topic
    });
    
    try {
      // Generate clarification response
      const clarification = await this.supervisorService.getClarification(topic, session.currentMeetingId);
      
      // Format the response
      return this.responseFormatter.formatClarification(clarification, topic);
    } catch (error: any) {
      this.logger?.error(`Error processing clarification for session ${session.id}`, {
        sessionId: session.id,
        topic,
        error: error.message,
        stack: error.stack
      });
      
      return this.handleError(session, error, null, ChatErrorType.UNKNOWN_ERROR);
    }
  }
  
  /**
   * Generate help response for unknown intents
   * 
   * @param session - Current chat session
   * @param message - Original user message
   * @returns Chat response with help information
   */
  private generateHelpResponse(session: ChatSession, message: UserMessage): ChatResponse {
    this.logger?.info(`Generating help response for session ${session.id}`, {
      sessionId: session.id,
      messageContent: message.content
    });
    
    return {
      id: `resp-${Date.now()}`,
      content: 'I can help you analyze meeting transcripts. You can upload a transcript, ask questions about it, or request visualizations. How can I assist you today?',
      type: 'text',
      timestamp: Date.now()
    };
  }
  
  /**
   * Create a loading response
   * 
   * @param message - Loading message
   * @returns Loading chat response
   */
  private createLoadingResponse(message: string): ChatResponse {
    return {
      id: `loading-${Date.now()}`,
      content: message,
      type: 'loading',
      timestamp: Date.now()
    };
  }
  
  /**
   * Create an error response
   * 
   * @param errorMessage - Error message to display
   * @param errorType - Type of error
   * @param details - Additional error details
   * @returns Error chat response
   */
  private createErrorResponse(
    errorMessage: string,
    errorType: ChatErrorType = ChatErrorType.UNKNOWN_ERROR,
    details?: any
  ): ChatResponse {
    return {
      id: `error-${Date.now()}`,
      content: errorMessage,
      type: 'error',
      timestamp: Date.now(),
      error: {
        code: errorType,
        message: errorMessage,
        details
      }
    };
  }
  
  /**
   * Handle errors and generate appropriate responses
   * 
   * @param session - Current chat session
   * @param error - Error that occurred
   * @param message - Original user message
   * @param errorType - Type of error
   * @returns Error chat response
   */
  private handleError(
    session: ChatSession,
    error: any,
    message?: UserMessage | null,
    errorType: ChatErrorType = ChatErrorType.UNKNOWN_ERROR
  ): ChatResponse {
    // Log the error
    this.logger?.error(`Error in chat agent: ${error.message}`, {
      sessionId: session.id,
      errorType,
      error: error.message,
      stack: error.stack,
      messageId: message?.id
    });
    
    // Handle specific error types
    if (error.timeout) {
      return this.createErrorResponse(
        'The operation took too long to complete. Please try again or try a simpler request.',
        ChatErrorType.TIMEOUT_ERROR
      );
    }
    
    // Create user-friendly error message
    const userMessage = this.getUserFriendlyErrorMessage(error, errorType);
    
    return this.createErrorResponse(userMessage, errorType, {
      originalError: error.message
    });
  }
  
  /**
   * Get user-friendly error message based on error type
   * 
   * @param error - Original error
   * @param errorType - Type of error
   * @returns User-friendly error message
   */
  private getUserFriendlyErrorMessage(error: any, errorType: ChatErrorType): string {
    switch (errorType) {
      case ChatErrorType.INTENT_PARSING_ERROR:
        return "I'm not sure what you're asking for. Could you please rephrase your request?";
        
      case ChatErrorType.TRANSCRIPT_PROCESSING_ERROR:
        return "There was a problem processing your transcript. Please check the format and try again.";
        
      case ChatErrorType.ANALYSIS_ERROR:
        return "I encountered an issue while analyzing the meeting. Please try again or upload a different transcript.";
        
      case ChatErrorType.SESSION_ERROR:
        return "There's a problem with your session. Please refresh and try again.";
        
      case ChatErrorType.TIMEOUT_ERROR:
        return "The operation took too long to complete. Please try again or simplify your request.";
        
      case ChatErrorType.UNKNOWN_ERROR:
      default:
        return "Something went wrong. Please try again later.";
    }
  }
  
  /**
   * Execute a promise with a timeout
   * 
   * @param promise - Promise to execute
   * @param timeoutMs - Timeout in milliseconds
   * @param timeoutMessage - Message if timeout occurs
   * @returns Promise result or throws timeout error
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const error = new Error(timeoutMessage) as Error & { timeout: boolean };
        error.timeout = true;
        reject(error);
      }, timeoutMs);
      
      promise
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
} 