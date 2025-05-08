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
 * Options for Zoom transcript parser
 */
export interface ZoomTranscriptParserOptions {
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Whether to normalize Zoom user names (remove (Host), etc.)
   */
  normalizeNames?: boolean;
}

/**
 * Parser for Zoom transcript format
 * Handles transcript files exported from Zoom cloud recordings
 */
export class ZoomTranscriptParser implements TranscriptParser {
  private logger?: Logger;
  private normalizeNames: boolean;
  
  // Pattern for timestamp format in Zoom transcripts: 00:00:00
  private static readonly TIMESTAMP_PATTERN = /(\d{2}):(\d{2}):(\d{2})/;
  
  // Pattern for speaker line: "Name: Content"
  private static readonly SPEAKER_LINE_PATTERN = 
    /^([^:]+):\s+(.+)$/;
  
  // Pattern for timestamp+speaker line: "00:00:00 Name: Content"
  private static readonly TIMESTAMP_SPEAKER_LINE_PATTERN = 
    /^(\d{2}:\d{2}:\d{2})\s+([^:]+):\s+(.+)$/;
  
  /**
   * Create a new Zoom transcript parser
   */
  constructor(options: ZoomTranscriptParserOptions = {}) {
    this.logger = options.logger;
    this.normalizeNames = options.normalizeNames !== false;
  }
  
  /**
   * Check if this parser can handle a specific format
   */
  canHandle(format: TranscriptFormat): boolean {
    return format === TranscriptFormat.ZOOM;
  }
  
  /**
   * Detect if content is in Zoom format
   */
  detectFormat(content: string): boolean {
    // Check for Zoom header patterns
    if (content.includes('Recording started:') || 
        content.includes('Transcript of Zoom Meeting') ||
        content.includes('Zoom meeting ID:')) {
      return true;
    }
    
    // Check for timestamp + speaker patterns that are common in Zoom transcripts
    const lines = content.split('\n');
    let timestampSpeakerLinesCount = 0;
    
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      if (this.isTimestampSpeakerLine(lines[i])) {
        timestampSpeakerLinesCount++;
      }
    }
    
    // If at least 3 lines match the pattern, it's likely a Zoom transcript
    return timestampSpeakerLinesCount >= 3;
  }
  
  /**
   * Parse a Zoom transcript
   */
  async parse(input: TranscriptInput): Promise<RawTranscript> {
    try {
      this.logger?.debug('Parsing Zoom transcript', {
        contentLength: input.content.length,
        meetingId: input.meetingId
      });
      
      const lines = input.content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      // Extract metadata from the beginning of the transcript
      const metadata = this.extractMetadata(lines);
      
      const entries: TranscriptEntry[] = [];
      const speakerIds = new Map<string, string>();
      let speakerCounter = 1;
      let currentTimestamp = 0;
      
      // Parse each line for transcript entries
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip metadata lines (usually at the beginning)
        if (line.startsWith('Recording') || 
            line.startsWith('Transcript') || 
            line.startsWith('Meeting:') || 
            line.startsWith('Date:') ||
            line.startsWith('Zoom meeting ID:')) {
          continue;
        }
        
        // Try to parse as timestamp+speaker line
        if (this.isTimestampSpeakerLine(line)) {
          const parsedLine = this.parseTimestampSpeakerLine(line);
          if (parsedLine) {
            const { timestamp, speakerName, content } = parsedLine;
            
            // Update current timestamp
            currentTimestamp = timestamp;
            
            // Normalize speaker name if enabled
            const normalizedName = this.normalizeNames ? 
              this.normalizeSpeakerName(speakerName) : speakerName;
            
            // Get or create speaker ID
            let speakerId;
            if (speakerIds.has(normalizedName)) {
              speakerId = speakerIds.get(normalizedName);
            } else {
              speakerId = `speaker_${speakerCounter++}`;
              speakerIds.set(normalizedName, speakerId!);
            }
            
            // Create entry
            entries.push({
              id: uuidv4(),
              speakerId: speakerId!,
              speakerName: normalizedName,
              content,
              timestamp,
              metadata: {
                lineNumber: i + 1,
                originalName: speakerName
              }
            });
          }
          continue;
        }
        
        // Try to parse as timestamp-only line (to update current time)
        if (this.isTimestampLine(line)) {
          const timestampMatch = ZoomTranscriptParser.TIMESTAMP_PATTERN.exec(line);
          if (timestampMatch) {
            currentTimestamp = this.parseTimestamp(timestampMatch[0]);
          }
          continue;
        }
        
        // Try to parse as speaker-only line
        const speakerLine = this.parseSpeakerLine(line);
        if (speakerLine) {
          const { speakerName, content } = speakerLine;
          
          // Normalize speaker name if enabled
          const normalizedName = this.normalizeNames ? 
            this.normalizeSpeakerName(speakerName) : speakerName;
          
          // Get or create speaker ID
          let speakerId;
          if (speakerIds.has(normalizedName)) {
            speakerId = speakerIds.get(normalizedName);
          } else {
            speakerId = `speaker_${speakerCounter++}`;
            speakerIds.set(normalizedName, speakerId!);
          }
          
          // Create entry
          entries.push({
            id: uuidv4(),
            speakerId: speakerId!,
            speakerName: normalizedName,
            content,
            timestamp: currentTimestamp,
            metadata: {
              lineNumber: i + 1,
              originalName: speakerName
            }
          });
          
          // Increment timestamp slightly for entries without explicit times
          currentTimestamp += 1;
          continue;
        }
        
        // If content couldn't be parsed as a new entry but there are previous entries,
        // it might be a continuation of the last entry
        if (entries.length > 0) {
          const lastEntry = entries[entries.length - 1];
          lastEntry.content += ' ' + line;
        }
      }
      
      // Generate meeting ID if not provided
      const meetingId = input.meetingId || metadata.meetingId || `meeting-${Date.now()}`;
      
      return {
        meetingId,
        entries,
        sourceFormat: TranscriptFormat.ZOOM,
        metadata: {
          ...metadata,
          parsedAt: Date.now()
        }
      };
    } catch (error) {
      this.logger?.error('Error parsing Zoom transcript', {
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      
      throw new Error(`Failed to parse Zoom transcript: ${(error as Error).message}`);
    }
  }
  
  /**
   * Check if line is a timestamp-only line
   */
  private isTimestampLine(line: string): boolean {
    return ZoomTranscriptParser.TIMESTAMP_PATTERN.test(line) && 
           !line.includes(':') || 
           line.indexOf(':') === 5; // Only the timestamp contains ':'
  }
  
  /**
   * Check if line is a timestamp+speaker line
   */
  private isTimestampSpeakerLine(line: string): boolean {
    return ZoomTranscriptParser.TIMESTAMP_SPEAKER_LINE_PATTERN.test(line);
  }
  
  /**
   * Parse timestamp string to seconds
   */
  private parseTimestamp(timestampStr: string): number {
    const parts = timestampStr.split(':');
    if (parts.length !== 3) {
      throw new Error(`Invalid timestamp format: ${timestampStr}`);
    }
    
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    
    return hours * 3600 + minutes * 60 + seconds;
  }
  
  /**
   * Parse a line with timestamp+speaker pattern
   */
  private parseTimestampSpeakerLine(line: string): { timestamp: number, speakerName: string, content: string } | null {
    const match = ZoomTranscriptParser.TIMESTAMP_SPEAKER_LINE_PATTERN.exec(line);
    if (!match) {
      return null;
    }
    
    const timestamp = this.parseTimestamp(match[1]);
    const speakerName = match[2].trim();
    const content = match[3].trim();
    
    return { timestamp, speakerName, content };
  }
  
  /**
   * Parse a line with speaker-only pattern
   */
  private parseSpeakerLine(line: string): { speakerName: string, content: string } | null {
    const match = ZoomTranscriptParser.SPEAKER_LINE_PATTERN.exec(line);
    if (!match) {
      return null;
    }
    
    const speakerName = match[1].trim();
    const content = match[2].trim();
    
    return { speakerName, content };
  }
  
  /**
   * Normalize Zoom user names by removing special tags
   */
  private normalizeSpeakerName(name: string): string {
    return name
      // Remove Zoom role tags
      .replace(/\s*\(Host\)/, '')
      .replace(/\s*\(Co-Host\)/, '')
      .replace(/\s*\(Organizer\)/, '')
      .replace(/\s*\(Participant\)/, '')
      .replace(/\s*\(Guest\)/, '')
      // Remove trailing indicators
      .replace(/\s*\(\d+\)$/, '')
      .trim();
  }
  
  /**
   * Extract metadata from transcript lines
   */
  private extractMetadata(lines: string[]): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    for (const line of lines.slice(0, 20)) { // Check first 20 lines for metadata
      if (line.startsWith('Recording started:')) {
        const dateStr = line.replace('Recording started:', '').trim();
        metadata.recordingStarted = dateStr;
      } else if (line.startsWith('Meeting:')) {
        metadata.meetingName = line.replace('Meeting:', '').trim();
      } else if (line.startsWith('Date:')) {
        metadata.meetingDate = line.replace('Date:', '').trim();
      } else if (line.startsWith('Zoom meeting ID:')) {
        metadata.meetingId = line.replace('Zoom meeting ID:', '').trim();
      } else if (line.startsWith('Transcript of Zoom Meeting')) {
        metadata.title = line.trim();
      }
    }
    
    return metadata;
  }
} 