import { IntentParserService, IntentType, MessageAttachment } from '../intent-parser.service';

describe('IntentParserService', () => {
  let intentParser: IntentParserService;
  
  beforeEach(() => {
    intentParser = new IntentParserService({
      confidenceThreshold: 0.5
    });
  });
  
  describe('parseIntent', () => {
    it('should detect transcript upload from message', async () => {
      const message = 'Please analyze this meeting transcript:\n\n10:00 - John: Hello everyone\n10:01 - Jane: Hi John\n10:02 - Alice: Let\'s get started';
      
      const intent = await intentParser.parseIntent(message);
      
      expect(intent.type).toBe(IntentType.UPLOAD_TRANSCRIPT);
      expect(intent.confidence).toBeGreaterThanOrEqual(0.7);
      expect(intent.parameters.transcript).toBeTruthy();
    });
    
    it('should detect transcript upload from attachments', async () => {
      const message = 'Please analyze this meeting transcript';
      const attachments: MessageAttachment[] = [
        {
          type: 'file',
          data: 'transcript content',
          metadata: {
            filename: 'meeting.txt',
            mimeType: 'text/plain'
          }
        }
      ];
      
      const intent = await intentParser.parseIntent(message, attachments);
      
      expect(intent.type).toBe(IntentType.UPLOAD_TRANSCRIPT);
      expect(intent.confidence).toBeGreaterThanOrEqual(0.8);
      expect(intent.parameters.transcript).toBe('transcript content');
    });
    
    it('should detect query analysis from question', async () => {
      const message = 'Who participated in the meeting?';
      
      const intent = await intentParser.parseIntent(message);
      
      expect(intent.type).toBe(IntentType.QUERY_ANALYSIS);
      expect(intent.confidence).toBeGreaterThanOrEqual(0.6);
      expect(intent.parameters.query).toBe(message);
    });
    
    it('should detect visualization request', async () => {
      const message = 'Show me a visualization of the participant contributions';
      
      const intent = await intentParser.parseIntent(message);
      
      expect(intent.type).toBe(IntentType.VISUALIZATION_REQUEST);
      expect(intent.confidence).toBeGreaterThanOrEqual(0.7);
      expect(intent.parameters.visualizationType).toBe('participant_breakdown');
    });
    
    it('should detect refresh request', async () => {
      const message = 'Please refresh the analysis';
      
      const intent = await intentParser.parseIntent(message);
      
      expect(intent.type).toBe(IntentType.REFRESH_ANALYSIS);
      expect(intent.confidence).toBeGreaterThanOrEqual(0.6);
    });
    
    it('should detect clarification request', async () => {
      const message = 'What is a story point?';
      
      const intent = await intentParser.parseIntent(message);
      
      expect(intent.type).toBe(IntentType.CLARIFICATION_REQUEST);
      expect(intent.confidence).toBeGreaterThanOrEqual(0.7);
      expect(intent.parameters.topic).toBe('a story point');
    });
    
    it('should extract visualization type correctly', async () => {
      const tests = [
        { message: 'Show me a breakdown of who spoke', expected: 'participant_breakdown' },
        { message: 'Can I see the topic distribution?', expected: 'topic_distribution' },
        { message: 'Generate a sentiment analysis visualization', expected: 'sentiment_analysis' },
        { message: 'Show me a timeline of the discussion', expected: 'timeline' },
        { message: 'Give me a word cloud of key terms', expected: 'word_cloud' }
      ];
      
      for (const test of tests) {
        const intent = await intentParser.parseIntent(test.message);
        expect(intent.type).toBe(IntentType.VISUALIZATION_REQUEST);
        expect(intent.parameters.visualizationType).toBe(test.expected);
      }
    });
    
    it('should extract meeting ID when provided', async () => {
      const message = 'Analyze transcript for meeting ID: MEET-12345';
      
      const intent = await intentParser.parseIntent(message);
      
      expect(intent.type).toBe(IntentType.UPLOAD_TRANSCRIPT);
      expect(intent.parameters.meetingId).toBe('MEET-12345');
    });
    
    it('should return unknown intent with low confidence for ambiguous messages', async () => {
      const message = 'hello';
      
      const intent = await intentParser.parseIntent(message);
      
      expect(intent.type).toBe(IntentType.UNKNOWN);
      expect(intent.confidence).toBeLessThan(0.5);
    });
    
    it('should extract visualization options from message', async () => {
      const message = 'Show me a bar chart of participant contributions for John and Jane';
      
      const intent = await intentParser.parseIntent(message);
      
      expect(intent.type).toBe(IntentType.VISUALIZATION_REQUEST);
      expect(intent.parameters.options.format).toBe('bar');
      expect(intent.parameters.options.participants).toContain('John');
      expect(intent.parameters.options.participants).toContain('Jane');
    });
    
    it('should extract time range from visualization request', async () => {
      const message = 'Show me participant activity from 10:15 to 11:30';
      
      const intent = await intentParser.parseIntent(message);
      
      expect(intent.type).toBe(IntentType.VISUALIZATION_REQUEST);
      expect(intent.parameters.options.timeRange.start).toBe('10:15');
      expect(intent.parameters.options.timeRange.end).toBe('11:30');
    });
    
    it('should handle errors gracefully', async () => {
      // Mock a method to throw an error
      const originalMethod = intentParser['detectIntentFromText'];
      intentParser['detectIntentFromText'] = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      
      const intent = await intentParser.parseIntent('test message');
      
      expect(intent.type).toBe(IntentType.UNKNOWN);
      expect(intent.confidence).toBeLessThan(0.5);
      
      // Restore the original method
      intentParser['detectIntentFromText'] = originalMethod;
    });
  });
}); 