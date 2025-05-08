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
 * Options for VTT transcript parser
 */
export interface VttTranscriptParserOptions {
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Whether to merge adjacent captions from the same speaker
   */
  mergeAdjacentCaptions?: boolean;
  
  /**
   * Time window in seconds to merge captions that are close together
   */
  mergeTimeWindowSeconds?: number;
  
  /**
   * Pattern to extract speaker names from caption content
   */
  speakerPattern?: RegExp;
}

/**
 * Caption entry structure
 */
interface CaptionEntry {
  /**
   * Entry ID or sequence number
   */
  id: string;
  
  /**
   * Start time in seconds
   */
  startTime: number;
  
  /**
   * End time in seconds
   */
  endTime: number;
  
  /**
   * Caption text content
   */
  content: string;
  
  /**
   * Speaker ID if detected
   */
  speakerId?: string;
  
  /**
   * Speaker name if detected
   */
  speakerName?: string;
}

/**
 * Parser for VTT/SRT format transcripts
 * Handles WebVTT and SRT subtitle formats with proper timing information
 */
export class VttTranscriptParser implements TranscriptParser {
  private logger?: Logger;
  private mergeAdjacentCaptions: boolean;
  private mergeTimeWindowSeconds: number;
  private speakerPattern: RegExp;
  
  // Regular expression for VTT timestamp format: 00:00:00.000 --> 00:00:00.000
  private static readonly VTT_TIMESTAMP_PATTERN = 
    /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
  
  // Regular expression for SRT timestamp format: 00:00:00,000 --> 00:00:00,000
  private static readonly SRT_TIMESTAMP_PATTERN = 
    /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/;
  
  // Regular expression for VTT cue settings
  private static readonly VTT_CUE_SETTINGS_PATTERN = 
    /\s+(align|line|position|size|vertical):[^\s]+/g;
  
  /**
   * Create a new VTT transcript parser
   */
  constructor(options: VttTranscriptParserOptions = {}) {
    this.logger = options.logger;
    this.mergeAdjacentCaptions = options.mergeAdjacentCaptions !== false;
    this.mergeTimeWindowSeconds = options.mergeTimeWindowSeconds || 1.0;
    
    // Default pattern to extract speaker names: "Speaker: Text" or "Speaker - Text"
    this.speakerPattern = options.speakerPattern || 
      /^(?<speaker>[A-Za-z0-9\s\.']+?)(?:\s*)?[:|-](?:\s*)(?<content>.+)$/;
  }
  
  /**
   * Check if this parser can handle a specific format
   */
  canHandle(format: TranscriptFormat): boolean {
    return format === TranscriptFormat.VTT || format === TranscriptFormat.SRT;
  }
  
  /**
   * Detect if content is in VTT/SRT format
   */
  detectFormat(content: string): boolean {
    // Check for VTT header
    if (content.trim().startsWith('WEBVTT')) {
      return true;
    }
    
    // Check for typical SRT/VTT structure: numeric ID followed by timestamp range
    const lines = content.split('\n').map(line => line.trim());
    
    // Look for timestamp patterns
    for (let i = 0; i < lines.length; i++) {
      if (VttTranscriptParser.VTT_TIMESTAMP_PATTERN.test(lines[i]) || 
          VttTranscriptParser.SRT_TIMESTAMP_PATTERN.test(lines[i])) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Parse a VTT/SRT transcript
   */
  async parse(input: TranscriptInput): Promise<RawTranscript> {
    try {
      this.logger?.debug('Parsing VTT/SRT transcript', {
        contentLength: input.content.length,
        meetingId: input.meetingId
      });
      
      // Determine format and parse accordingly
      let captions: CaptionEntry[];
      if (this.isVttFormat(input.content)) {
        captions = this.parseVtt(input.content);
      } else {
        captions = this.parseSrt(input.content);
      }
      
      // Extract speakers from caption content
      captions = this.extractSpeakersFromCaptions(captions);
      
      // Merge adjacent captions from the same speaker if enabled
      if (this.mergeAdjacentCaptions) {
        captions = this.mergeAdjacentCaptionsFromSameSpeaker(captions);
      }
      
      // Convert captions to transcript entries
      const entries = this.captionsToEntries(captions);
      
      // Generate meeting ID if not provided
      const meetingId = input.meetingId || `meeting-${Date.now()}`;
      
      return {
        meetingId,
        entries,
        sourceFormat: TranscriptFormat.VTT,
        metadata: {
          ...input.metadata,
          captionCount: captions.length,
          parsedAt: Date.now()
        }
      };
    } catch (error) {
      this.logger?.error('Error parsing VTT/SRT transcript', {
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      
      throw new Error(`Failed to parse VTT/SRT transcript: ${(error as Error).message}`);
    }
  }
  
  /**
   * Check if content is in VTT format
   */
  private isVttFormat(content: string): boolean {
    return content.trim().startsWith('WEBVTT') || 
           VttTranscriptParser.VTT_TIMESTAMP_PATTERN.test(content);
  }
  
  /**
   * Parse VTT format transcript
   */
  private parseVtt(content: string): CaptionEntry[] {
    const lines = content.split('\n').map(line => line.trim());
    const captions: CaptionEntry[] = [];
    
    let i = 0;
    
    // Skip header
    if (lines[0] === 'WEBVTT') {
      i = 1;
      
      // Skip header metadata
      while (i < lines.length && lines[i] !== '') {
        i++;
      }
      
      // Skip empty line after header
      if (i < lines.length && lines[i] === '') {
        i++;
      }
    }
    
    // Parse cues
    while (i < lines.length) {
      // Skip empty lines
      if (lines[i] === '') {
        i++;
        continue;
      }
      
      // Parse cue ID (optional)
      let cueId = `cue_${captions.length + 1}`;
      if (/^\d+$/.test(lines[i])) {
        cueId = lines[i];
        i++;
      }
      
      // Parse timestamp
      if (i >= lines.length) break;
      
      const timestampMatch = VttTranscriptParser.VTT_TIMESTAMP_PATTERN.exec(lines[i]);
      if (!timestampMatch) {
        i++;
        continue;
      }
      
      const { startTime, endTime } = this.parseTimestamp(lines[i]);
      i++;
      
      // Collect cue text (may span multiple lines)
      let cueText = '';
      while (i < lines.length && lines[i] !== '' && 
             !VttTranscriptParser.VTT_TIMESTAMP_PATTERN.test(lines[i]) &&
             !/^\d+$/.test(lines[i])) {
        
        // Remove VTT cue settings
        const line = lines[i].replace(VttTranscriptParser.VTT_CUE_SETTINGS_PATTERN, '');
        cueText += (cueText ? '\n' : '') + line;
        i++;
      }
      
      captions.push({
        id: cueId,
        startTime,
        endTime,
        content: cueText.trim()
      });
    }
    
    return captions;
  }
  
  /**
   * Parse SRT format transcript
   */
  private parseSrt(content: string): CaptionEntry[] {
    const lines = content.split('\n').map(line => line.trim());
    const captions: CaptionEntry[] = [];
    
    let i = 0;
    
    // Parse cues
    while (i < lines.length) {
      // Skip empty lines
      if (lines[i] === '') {
        i++;
        continue;
      }
      
      // Parse cue ID (required in SRT)
      if (!/^\d+$/.test(lines[i])) {
        i++;
        continue;
      }
      
      const cueId = lines[i];
      i++;
      
      // Parse timestamp
      if (i >= lines.length) break;
      
      const timestampMatch = VttTranscriptParser.SRT_TIMESTAMP_PATTERN.exec(lines[i]);
      if (!timestampMatch) {
        i++;
        continue;
      }
      
      const { startTime, endTime } = this.parseTimestamp(lines[i]);
      i++;
      
      // Collect cue text (may span multiple lines)
      let cueText = '';
      while (i < lines.length && lines[i] !== '' && !/^\d+$/.test(lines[i])) {
        cueText += (cueText ? '\n' : '') + lines[i];
        i++;
      }
      
      captions.push({
        id: cueId,
        startTime,
        endTime,
        content: cueText.trim()
      });
    }
    
    return captions;
  }
  
  /**
   * Parse a timestamp line into start and end times
   */
  private parseTimestamp(line: string): { startTime: number, endTime: number } {
    // Try VTT format first
    let match = VttTranscriptParser.VTT_TIMESTAMP_PATTERN.exec(line);
    if (!match) {
      // Try SRT format
      match = VttTranscriptParser.SRT_TIMESTAMP_PATTERN.exec(line);
      if (!match) {
        throw new Error(`Invalid timestamp format: ${line}`);
      }
    }
    
    // Extract parts
    const startTime = this.timestampToSeconds(match[1] + ':' + match[2] + ':' + match[3] + '.' + match[4]);
    const endTime = this.timestampToSeconds(match[5] + ':' + match[6] + ':' + match[7] + '.' + match[8]);
    
    return { startTime, endTime };
  }
  
  /**
   * Convert a timestamp string to seconds
   */
  private timestampToSeconds(timestamp: string): number {
    // Handle both VTT (00:00:00.000) and SRT (00:00:00,000) formats
    const normalizedTimestamp = timestamp.replace(',', '.');
    
    const parts = normalizedTimestamp.split(':');
    if (parts.length !== 3) {
      throw new Error(`Invalid timestamp format: ${timestamp}`);
    }
    
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    
    // Handle seconds with milliseconds
    const secondsParts = parts[2].split('.');
    const seconds = parseInt(secondsParts[0], 10);
    const milliseconds = secondsParts.length > 1 ? parseInt(secondsParts[1], 10) : 0;
    
    return hours * 3600 + minutes * 60 + seconds + (milliseconds / 1000);
  }
  
  /**
   * Extract speakers from caption content
   */
  private extractSpeakersFromCaptions(captions: CaptionEntry[]): CaptionEntry[] {
    const speakerIds = new Map<string, string>();
    let speakerCounter = 1;
    
    return captions.map(caption => {
      // Check if content matches speaker pattern
      const match = this.speakerPattern.exec(caption.content);
      if (match?.groups) {
        const { speaker, content } = match.groups;
        
        // Get or create speaker ID
        let speakerId;
        if (speakerIds.has(speaker)) {
          speakerId = speakerIds.get(speaker);
        } else {
          speakerId = `speaker_${speakerCounter++}`;
          speakerIds.set(speaker, speakerId!);
        }
        
        return {
          ...caption,
          speakerId: speakerId!,
          speakerName: speaker.trim(),
          content: content.trim()
        };
      }
      
      return caption;
    });
  }
  
  /**
   * Merge adjacent captions from the same speaker
   */
  private mergeAdjacentCaptionsFromSameSpeaker(captions: CaptionEntry[]): CaptionEntry[] {
    if (captions.length <= 1) {
      return captions;
    }
    
    const result: CaptionEntry[] = [];
    let current = captions[0];
    
    for (let i = 1; i < captions.length; i++) {
      const next = captions[i];
      
      // Check if captions are from the same speaker and close enough in time
      if (current.speakerId && 
          current.speakerId === next.speakerId && 
          next.startTime - current.endTime <= this.mergeTimeWindowSeconds) {
        // Merge captions
        current = {
          id: current.id,
          startTime: current.startTime,
          endTime: next.endTime,
          content: current.content + ' ' + next.content,
          speakerId: current.speakerId,
          speakerName: current.speakerName
        };
      } else {
        // Not mergeable, add current to result and continue with next
        result.push(current);
        current = next;
      }
    }
    
    // Add the last caption
    result.push(current);
    
    return result;
  }
  
  /**
   * Convert caption entries to transcript entries
   */
  private captionsToEntries(captions: CaptionEntry[]): TranscriptEntry[] {
    return captions.map(caption => {
      return {
        id: uuidv4(),
        speakerId: caption.speakerId || `unknown_${caption.id}`,
        speakerName: caption.speakerName,
        content: caption.content,
        timestamp: caption.startTime,
        duration: caption.endTime - caption.startTime,
        metadata: {
          captionId: caption.id,
          endTime: caption.endTime
        }
      };
    });
  }
} 