import { 
  TranscriptFormat, 
  TranscriptInput,
  RawTranscript, 
  TranscriptEntry,
  TranscriptParser
} from '../enhanced-transcript-processor';
import { Logger } from '../../../../shared/logger/logger.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * Options for text transcript parser
 */
export interface TextTranscriptParserOptions {
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Regular expression for speaker patterns
   * Default matches patterns like:
   * - "John Doe: Hello"
   * - "John Doe - Hello"
   * - "John: Hello"
   */
  speakerPattern?: RegExp;
  
  /**
   * Regular expression for timestamp patterns
   * Default matches patterns like:
   * - "[10:30] John: Hello"
   * - "[00:10:30] John: Hello"
   * - "10:30 - John: Hello"
   * - "(10:30:45) John: Hello"
   */
  timestampPattern?: RegExp;
}

/**
 * Parser for plain text transcripts
 * Handles common text transcript formats with speaker names and timestamps
 */
export class TextTranscriptParser implements TranscriptParser {
  private logger?: Logger;
  private speakerPattern: RegExp;
  private timestampPattern: RegExp;
  
  /**
   * Create a new text transcript parser
   */
  constructor(options: TextTranscriptParserOptions = {}) {
    this.logger = options.logger;
    
    // Default speaker pattern matches "Name: text" or "Name - text"
    this.speakerPattern = options.speakerPattern || 
      /^(?:\s*)?(?<speaker>[A-Za-z0-9\s\.']+?)(?:\s*)?[:|-](?:\s*)(?<content>.+)$/;
    
    // Default timestamp pattern matches common timestamp formats
    this.timestampPattern = options.timestampPattern || 
      /(?:^|\s)(?<timestamp>\[?(?:(?<hours>\d{1,2}):)?(?<minutes>\d{1,2})(?::(?<seconds>\d{1,2}))?\]?)(?:\s*-)?/;
  }
  
  /**
   * Check if this parser can handle a specific format
   */
  canHandle(format: TranscriptFormat): boolean {
    return format === TranscriptFormat.PLAIN_TEXT;
  }
  
  /**
   * Detect if content is in plain text format
   */
  detectFormat(content: string): boolean {
    // Plain text should have multiple lines
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    if (lines.length < 2) {
      return false;
    }
    
    // Check if at least 40% of non-empty lines match our speaker pattern
    const speakerMatches = lines.filter(line => this.speakerPattern.test(line)).length;
    const matchRatio = speakerMatches / lines.length;
    
    return matchRatio >= 0.4;
  }
  
  /**
   * Parse a text transcript
   */
  async parse(input: TranscriptInput): Promise<RawTranscript> {
    this.logger?.debug('Parsing text transcript', {
      contentLength: input.content.length,
      meetingId: input.meetingId
    });
    
    const lines = input.content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (lines.length === 0) {
      throw new Error('Transcript is empty');
    }
    
    const entries: TranscriptEntry[] = [];
    let currentTimestamp = 0;
    let speakerCounter = 1;
    
    // Track speakers to assign consistent IDs
    const speakerIds = new Map<string, string>();
    
    // Parse each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Extract timestamp if present
      let processedLine = line;
      const timestampMatch = this.timestampPattern.exec(line);
      if (timestampMatch?.groups?.timestamp) {
        const { hours, minutes, seconds } = timestampMatch.groups;
        currentTimestamp = this.convertToSeconds(
          parseInt(hours || '0'), 
          parseInt(minutes || '0'), 
          parseInt(seconds || '0')
        );
        
        // Remove timestamp part from the line for speaker matching
        processedLine = line.replace(timestampMatch[0], '').trim();
      }
      
      // Extract speaker and content
      const speakerMatch = this.speakerPattern.exec(processedLine);
      if (speakerMatch?.groups) {
        const { speaker, content } = speakerMatch.groups;
        
        // Get or create speaker ID
        let speakerId;
        if (speakerIds.has(speaker)) {
          speakerId = speakerIds.get(speaker);
        } else {
          speakerId = `speaker_${speakerCounter++}`;
          speakerIds.set(speaker, speakerId!);
        }
        
        // Create transcript entry
        entries.push({
          id: uuidv4(),
          speakerId: speakerId!,
          speakerName: speaker.trim(),
          content: content.trim(),
          timestamp: currentTimestamp,
          metadata: {
            lineNumber: i + 1
          }
        });
        
        // Increment timestamp if no explicit timestamp was provided
        // assuming ~10 seconds per utterance
        if (!timestampMatch) {
          currentTimestamp += 10;
        }
      } else {
        // Line doesn't match expected format
        this.logger?.warn(`Line ${i + 1} doesn't match expected format: ${line}`);
        
        // If the previous line had a speaker, append this line to that entry
        if (entries.length > 0) {
          const lastEntry = entries[entries.length - 1];
          lastEntry.content += ' ' + line.trim();
        }
      }
    }
    
    // Generate meeting ID if not provided
    const meetingId = input.meetingId || `meeting-${Date.now()}`;
    
    return {
      meetingId,
      entries,
      sourceFormat: TranscriptFormat.PLAIN_TEXT,
      metadata: {
        ...input.metadata,
        speakerCount: speakerIds.size,
        lineCount: lines.length,
        parsedAt: Date.now()
      }
    };
  }
  
  /**
   * Convert hours, minutes, and seconds to total seconds
   */
  private convertToSeconds(hours: number, minutes: number, seconds: number): number {
    return hours * 3600 + minutes * 60 + seconds;
  }
} 