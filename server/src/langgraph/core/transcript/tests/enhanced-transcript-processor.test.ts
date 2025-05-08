import { 
  EnhancedTranscriptProcessor,
  TranscriptFormat,
  createTranscriptProcessor
} from '../index';
import { TextTranscriptParser } from '../parsers/text-transcript-parser';
import { JsonTranscriptParser } from '../parsers/json-transcript-parser';
import { VttTranscriptParser } from '../parsers/vtt-transcript-parser';
import { ZoomTranscriptParser } from '../parsers/zoom-transcript-parser';
import { SpeakerIdentificationService } from '../speaker-identification.service';
import { MockLogger } from '../../../../shared/logger/mock-logger';

describe('EnhancedTranscriptProcessor', () => {
  let logger: MockLogger;
  
  beforeEach(() => {
    logger = new MockLogger();
  });
  
  describe('constructor', () => {
    it('should create a processor with default options', () => {
      const processor = new EnhancedTranscriptProcessor();
      expect(processor).toBeDefined();
    });
    
    it('should create a processor with logger', () => {
      const processor = new EnhancedTranscriptProcessor({ logger });
      expect(processor).toBeDefined();
    });
    
    it('should create a processor with speaker identification service', () => {
      const speakerIdentificationService = new SpeakerIdentificationService();
      const processor = new EnhancedTranscriptProcessor({ 
        logger, 
        speakerIdentificationService 
      });
      expect(processor).toBeDefined();
    });
  });
  
  describe('registerParser', () => {
    it('should register a parser', () => {
      const processor = new EnhancedTranscriptProcessor({ logger });
      const parser = new TextTranscriptParser({ logger });
      
      processor.registerParser(parser);
      
      // Test registration worked by processing a text transcript
      return expect(processor.process({
        content: 'John: Hello\nJane: Hi',
        format: TranscriptFormat.PLAIN_TEXT
      })).resolves.toBeDefined();
    });
  });
  
  describe('process', () => {
    it('should throw error if no parser is available for format', async () => {
      const processor = new EnhancedTranscriptProcessor({ logger });
      
      await expect(processor.process({
        content: 'John: Hello\nJane: Hi',
        format: TranscriptFormat.PLAIN_TEXT
      })).rejects.toThrow(/No parser available/);
    });
    
    it('should process a text transcript', async () => {
      const processor = new EnhancedTranscriptProcessor({ logger });
      processor.registerParser(new TextTranscriptParser({ logger }));
      
      const result = await processor.process({
        content: 'John: Hello there\nJane: Hi John',
        format: TranscriptFormat.PLAIN_TEXT
      });
      
      expect(result).toBeDefined();
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].speakerName).toBe('John');
      expect(result.entries[0].content).toBe('Hello there');
      expect(result.entries[1].speakerName).toBe('Jane');
      expect(result.entries[1].content).toBe('Hi John');
    });
    
    it('should auto-detect format when not specified', async () => {
      const processor = new EnhancedTranscriptProcessor({ logger });
      processor.registerParser(new TextTranscriptParser({ logger }));
      processor.registerParser(new JsonTranscriptParser({ logger }));
      
      // Should detect as text
      const textResult = await processor.process({
        content: 'John: Hello there\nJane: Hi John',
        format: TranscriptFormat.AUTO_DETECT
      });
      
      expect(textResult.sourceFormat).toBe(TranscriptFormat.PLAIN_TEXT);
      
      // Should detect as JSON
      const jsonResult = await processor.process({
        content: JSON.stringify({
          entries: [
            { speakerId: "1", speakerName: "John", text: "Hello there" },
            { speakerId: "2", speakerName: "Jane", text: "Hi John" }
          ]
        }),
        format: TranscriptFormat.AUTO_DETECT
      });
      
      expect(jsonResult.sourceFormat).toBe(TranscriptFormat.JSON);
    });
  });
  
  describe('createTranscriptProcessor', () => {
    it('should create a fully configured processor', async () => {
      const processor = createTranscriptProcessor({
        logger,
        speakerIdentificationOptions: {
          knownParticipants: [
            { id: 'john', name: 'John Smith', aliases: ['Johnny'] },
            { id: 'jane', name: 'Jane Doe' }
          ]
        }
      });
      
      // Test text format
      const textResult = await processor.process({
        content: 'John: Hello there\nJane: Hi John',
        format: TranscriptFormat.PLAIN_TEXT
      });
      
      expect(textResult.entries).toHaveLength(2);
      
      // Test JSON format
      const jsonResult = await processor.process({
        content: JSON.stringify({
          entries: [
            { speakerId: "1", speakerName: "John", text: "Hello there" },
            { speakerId: "2", speakerName: "Jane", text: "Hi John" }
          ]
        }),
        format: TranscriptFormat.JSON
      });
      
      expect(jsonResult.entries).toHaveLength(2);
    });
  });
});

describe('TextTranscriptParser', () => {
  let logger: MockLogger;
  let parser: TextTranscriptParser;
  
  beforeEach(() => {
    logger = new MockLogger();
    parser = new TextTranscriptParser({ logger });
  });
  
  describe('detectFormat', () => {
    it('should detect text format correctly', () => {
      expect(parser.detectFormat('John: Hello\nJane: Hi')).toBe(true);
      expect(parser.detectFormat('This is just plain text without speaker indicators')).toBe(false);
    });
  });
  
  describe('parse', () => {
    it('should parse a simple text transcript', async () => {
      const result = await parser.parse({
        content: 'John: Hello there\nJane: Hi John',
        meetingId: 'test-meeting'
      });
      
      expect(result.meetingId).toBe('test-meeting');
      expect(result.entries).toHaveLength(2);
      expect(result.sourceFormat).toBe(TranscriptFormat.PLAIN_TEXT);
      
      expect(result.entries[0].speakerName).toBe('John');
      expect(result.entries[0].content).toBe('Hello there');
      expect(result.entries[1].speakerName).toBe('Jane');
      expect(result.entries[1].content).toBe('Hi John');
    });
    
    it('should parse a transcript with timestamps', async () => {
      const result = await parser.parse({
        content: '[00:00:10] John: Hello there\n[00:00:20] Jane: Hi John',
        meetingId: 'test-meeting'
      });
      
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].timestamp).toBe(10);
      expect(result.entries[1].timestamp).toBe(20);
    });
    
    it('should handle multi-line entries', async () => {
      const result = await parser.parse({
        content: 'John: Hello there\nThis is a continuation\nJane: Hi John',
        meetingId: 'test-meeting'
      });
      
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].content).toBe('Hello there This is a continuation');
    });
  });
});

describe('JsonTranscriptParser', () => {
  let logger: MockLogger;
  let parser: JsonTranscriptParser;
  
  beforeEach(() => {
    logger = new MockLogger();
    parser = new JsonTranscriptParser({ logger });
  });
  
  describe('detectFormat', () => {
    it('should detect JSON format correctly', () => {
      expect(parser.detectFormat(JSON.stringify({
        entries: [
          { speakerId: "1", speakerName: "John", text: "Hello" }
        ]
      }))).toBe(true);
      
      expect(parser.detectFormat('This is not JSON')).toBe(false);
    });
  });
  
  describe('parse', () => {
    it('should parse a simple JSON transcript', async () => {
      const result = await parser.parse({
        content: JSON.stringify({
          entries: [
            { speakerId: "1", speakerName: "John", text: "Hello there" },
            { speakerId: "2", speakerName: "Jane", text: "Hi John" }
          ]
        }),
        meetingId: 'test-meeting'
      });
      
      expect(result.meetingId).toBe('test-meeting');
      expect(result.entries).toHaveLength(2);
      expect(result.sourceFormat).toBe(TranscriptFormat.JSON);
      
      expect(result.entries[0].speakerId).toBe("1");
      expect(result.entries[0].speakerName).toBe("John");
      expect(result.entries[0].content).toBe("Hello there");
    });
    
    it('should handle different field names with the mapping', async () => {
      const parser = new JsonTranscriptParser({ 
        logger,
        fieldMapping: {
          entriesField: 'utterances',
          speakerIdField: 'userId',
          speakerNameField: 'userName',
          contentField: 'message',
          timestampField: 'time',
          durationField: 'length'
        }
      });
      
      const result = await parser.parse({
        content: JSON.stringify({
          utterances: [
            { userId: "1", userName: "John", message: "Hello there", time: 10, length: 2 },
            { userId: "2", userName: "Jane", message: "Hi John", time: 20, length: 1 }
          ]
        }),
        meetingId: 'test-meeting'
      });
      
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].speakerId).toBe("1");
      expect(result.entries[0].speakerName).toBe("John");
      expect(result.entries[0].content).toBe("Hello there");
      expect(result.entries[0].timestamp).toBe(10);
      expect(result.entries[0].duration).toBe(2);
    });
  });
});

describe('SpeakerIdentificationService', () => {
  let logger: MockLogger;
  let service: SpeakerIdentificationService;
  
  beforeEach(() => {
    logger = new MockLogger();
    service = new SpeakerIdentificationService({
      logger,
      knownParticipants: [
        { id: 'john', name: 'John Smith', aliases: ['Johnny', 'John S.'] },
        { id: 'jane', name: 'Jane Doe', aliases: ['Janey'] }
      ]
    });
  });
  
  describe('identifySpeakers', () => {
    it('should identify speakers in a transcript', async () => {
      const speakerMap = await service.identifySpeakers({
        meetingId: 'test-meeting',
        entries: [
          { id: '1', speakerId: 'spk1', speakerName: 'John Smith', content: 'Hello', timestamp: 0 },
          { id: '2', speakerId: 'spk2', speakerName: 'Jane', content: 'Hi', timestamp: 10 }
        ],
        sourceFormat: TranscriptFormat.PLAIN_TEXT
      });
      
      expect(speakerMap.size).toBe(2);
      
      const johnIdentity = Array.from(speakerMap.values())
        .find(s => s.name === 'John Smith');
      expect(johnIdentity).toBeDefined();
      expect(johnIdentity?.id).toBe('john');
      
      // Jane should have been matched by fuzzy name matching
      const janeIdentity = Array.from(speakerMap.values())
        .find(s => s.name === 'Jane Doe');
      expect(janeIdentity).toBeDefined();
      expect(janeIdentity?.id).toBe('jane');
    });
    
    it('should merge similar speakers', async () => {
      const speakerMap = await service.mergeSpeakerIdentities(new Map([
        ['spk1', { id: 'spk1', name: 'John', confidence: 1.0, alternativeIds: [] }],
        ['spk2', { id: 'spk2', name: 'Johnny', confidence: 1.0, alternativeIds: [] }]
      ]));
      
      // Should merge John and Johnny as the same person
      expect(speakerMap.size).toBe(1);
    });
  });
});

describe('Integration: Full Transcript Processing', () => {
  let processor: EnhancedTranscriptProcessor;
  let logger: MockLogger;
  
  beforeEach(() => {
    logger = new MockLogger();
    processor = createTranscriptProcessor({
      logger,
      speakerIdentificationOptions: {
        knownParticipants: [
          { id: 'john', name: 'John Smith', aliases: ['Johnny', 'John S.'] },
          { id: 'jane', name: 'Jane Doe', aliases: ['Janey'] }
        ]
      }
    });
  });
  
  it('should process a text transcript and enhance it', async () => {
    const result = await processor.process({
      content: `
        [00:00:10] John: Hello everyone, thanks for joining today's meeting
        [00:00:15] Jane: Hi John, happy to be here
        [00:00:20] John: Let's discuss the project timeline
        [00:00:30] Jane: I think we need more time for testing
      `,
      meetingId: 'test-meeting'
    });
    
    expect(result.meetingId).toBe('test-meeting');
    expect(result.entries).toHaveLength(4);
    expect(result.sourceFormat).toBe(TranscriptFormat.PLAIN_TEXT);
    expect(result.duration).toBeGreaterThan(0);
    expect(result.speakers.size).toBe(2);
    
    // Speakers should be identified and normalized
    const speakerIds = [...result.speakers.values()].map(s => s.id);
    expect(speakerIds).toContain('john');
    expect(speakerIds).toContain('jane');
    
    // Enhanced entries should have normalized content
    expect(result.entries[0].normalizedContent).toBeDefined();
    expect(result.entries[0].normalizedSpeakerId).toBeDefined();
    expect(result.entries[0].index).toBe(0);
  });
  
  it('should handle a JSON transcript with the same enhancement', async () => {
    const result = await processor.process({
      content: JSON.stringify({
        entries: [
          { speakerId: "1", speakerName: "John Smith", text: "Hello everyone", timestamp: 10 },
          { speakerId: "2", speakerName: "Jane", text: "Hi John", timestamp: 15 },
          { speakerId: "1", speakerName: "John Smith", text: "Let's discuss the project", timestamp: 20 },
          { speakerId: "2", speakerName: "Jane", text: "I think we need more time", timestamp: 30 }
        ]
      }),
      meetingId: 'test-meeting'
    });
    
    expect(result.meetingId).toBe('test-meeting');
    expect(result.entries).toHaveLength(4);
    expect(result.sourceFormat).toBe(TranscriptFormat.JSON);
    
    // Same expectations for speaker identification and normalization
    const speakerIds = [...result.speakers.values()].map(s => s.id);
    expect(speakerIds).toContain('john');
    expect(speakerIds).toContain('jane');
  });
}); 