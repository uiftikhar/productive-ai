import { ChatAgentInterface, ChatSession, UserMessage, ChatErrorType, ChatResponse } from '../chat-agent-interface';
import { IntentParserService, Intent, IntentType } from '../intent-parser.service';
import { ResponseFormatterService, AnalysisResult } from '../response-formatter.service';
import { SupervisorService } from '../../supervisor/supervisor.service';

// Mock services
class MockIntentParser extends IntentParserService {
  mockIntent: Intent = {
    type: IntentType.QUERY_ANALYSIS,
    confidence: 0.9,
    parameters: {
      query: 'Who attended the meeting?'
    },
    originalMessage: 'Who attended the meeting?'
  };
  
  async parseIntent(message: string): Promise<Intent> {
    return this.mockIntent;
  }
}

class MockResponseFormatter extends ResponseFormatterService {
  formatAnalysisQueryResult(result: any, query: string): ChatResponse {
    return {
      id: 'test-response',
      content: 'This is a test response',
      type: 'text',
      timestamp: Date.now()
    };
  }
  
  formatTranscriptProcessingResult(result: AnalysisResult): ChatResponse {
    return {
      id: 'test-transcript-response',
      content: 'Transcript processed successfully',
      type: 'analysis',
      timestamp: Date.now()
    };
  }
}

class MockSupervisorService extends SupervisorService {
  async processTranscript(transcript: string, meetingId?: string): Promise<AnalysisResult> {
    return {
      meetingId: meetingId || 'test-meeting',
      timestamp: Date.now(),
      summary: {
        short: 'Test summary'
      }
    };
  }
  
  async queryAnalysis(meetingId: string, query: string): Promise<any> {
    return {
      participants: [
        { id: 'p1', name: 'John Doe' },
        { id: 'p2', name: 'Jane Smith' }
      ]
    };
  }
}

describe('ChatAgentInterface', () => {
  let chatAgent: ChatAgentInterface;
  let intentParser: MockIntentParser;
  let responseFormatter: MockResponseFormatter;
  let supervisorService: MockSupervisorService;
  let session: ChatSession;
  
  beforeEach(() => {
    intentParser = new MockIntentParser();
    responseFormatter = new MockResponseFormatter();
    supervisorService = new MockSupervisorService();
    
    chatAgent = new ChatAgentInterface({
      intentParser,
      responseFormatter,
      supervisorService
    });
    
    session = {
      id: 'test-session',
      userId: 'test-user'
    };
  });
  
  describe('handleUserMessage', () => {
    it('should handle query analysis intent', async () => {
      intentParser.mockIntent = {
        type: IntentType.QUERY_ANALYSIS,
        confidence: 0.9,
        parameters: {
          query: 'Who attended the meeting?'
        },
        originalMessage: 'Who attended the meeting?'
      };
      
      const userMessage: UserMessage = {
        id: 'msg1',
        content: 'Who attended the meeting?',
        timestamp: Date.now()
      };
      
      session.currentMeetingId = 'test-meeting';
      
      const response = await chatAgent.handleUserMessage(session, userMessage);
      
      expect(response.type).toBe('text');
      expect(response.content).toBe('This is a test response');
    });
    
    it('should handle upload transcript intent', async () => {
      intentParser.mockIntent = {
        type: IntentType.UPLOAD_TRANSCRIPT,
        confidence: 0.9,
        parameters: {
          transcript: 'This is a test transcript',
          meetingId: 'test-meeting'
        },
        originalMessage: 'Analyze this transcript: This is a test transcript'
      };
      
      const userMessage: UserMessage = {
        id: 'msg2',
        content: 'Analyze this transcript: This is a test transcript',
        timestamp: Date.now()
      };
      
      const response = await chatAgent.handleUserMessage(session, userMessage);
      
      expect(response.type).toBe('analysis');
      expect(response.content).toBe('Transcript processed successfully');
      expect(session.currentMeetingId).toBe('test-meeting');
    });
    
    it('should return error response when no meeting is loaded for query', async () => {
      intentParser.mockIntent = {
        type: IntentType.QUERY_ANALYSIS,
        confidence: 0.9,
        parameters: {
          query: 'What was discussed?'
        },
        originalMessage: 'What was discussed?'
      };
      
      const userMessage: UserMessage = {
        id: 'msg3',
        content: 'What was discussed?',
        timestamp: Date.now()
      };
      
      // Ensure no meeting ID is set
      session.currentMeetingId = undefined;
      
      const response = await chatAgent.handleUserMessage(session, userMessage);
      
      expect(response.type).toBe('error');
      expect(response.error?.code).toBe(ChatErrorType.SESSION_ERROR);
    });
  });
  
  describe('uploadTranscript', () => {
    it('should process transcript and update session', async () => {
      const response = await chatAgent.uploadTranscript(session, 'This is a test transcript', 'new-meeting');
      
      expect(response.type).toBe('analysis');
      expect(session.currentMeetingId).toBe('new-meeting');
    });
    
    it('should handle errors during transcript processing', async () => {
      // Mock an error in the supervisor service
      jest.spyOn(supervisorService, 'processTranscript').mockImplementation(() => {
        throw new Error('Processing failed');
      });
      
      const response = await chatAgent.uploadTranscript(session, 'This is a test transcript');
      
      expect(response.type).toBe('error');
      expect(response.error?.code).toBe(ChatErrorType.TRANSCRIPT_PROCESSING_ERROR);
    });
  });
  
  describe('queryAnalysis', () => {
    it('should query analysis for current meeting', async () => {
      session.currentMeetingId = 'test-meeting';
      
      const response = await chatAgent.queryAnalysis(session, 'Who attended?');
      
      expect(response.type).toBe('text');
    });
    
    it('should handle errors during analysis query', async () => {
      session.currentMeetingId = 'test-meeting';
      
      // Mock an error in the supervisor service
      jest.spyOn(supervisorService, 'queryAnalysis').mockImplementation(() => {
        throw new Error('Query failed');
      });
      
      const response = await chatAgent.queryAnalysis(session, 'Who attended?');
      
      expect(response.type).toBe('error');
      expect(response.error?.code).toBe(ChatErrorType.ANALYSIS_ERROR);
    });
  });
}); 