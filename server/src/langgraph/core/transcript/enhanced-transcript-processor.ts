import { Logger } from '../../../shared/logger/logger.interface';

/**
 * Supported transcript formats
 */
export enum TranscriptFormat {
  PLAIN_TEXT = 'plain_text',
  JSON = 'json',
  VTT = 'vtt',
  SRT = 'srt',
  ZOOM = 'zoom',
  TEAMS = 'teams',
  AUTO_DETECT = 'auto_detect'
}

/**
 * Input for transcript processing
 */
export interface TranscriptInput {
  /**
   * Raw transcript content
   */
  content: string;
  
  /**
   * Format of the transcript
   */
  format?: TranscriptFormat;
  
  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
  
  /**
   * Meeting ID (if known)
   */
  meetingId?: string;
}

/**
 * Raw transcript structure after parsing
 */
export interface RawTranscript {
  /**
   * Meeting ID
   */
  meetingId: string;
  
  /**
   * Entries in the transcript
   */
  entries: TranscriptEntry[];
  
  /**
   * Format the transcript was parsed from
   */
  sourceFormat: TranscriptFormat;
  
  /**
   * Additional metadata from the input or parsing
   */
  metadata?: Record<string, any>;
}

/**
 * A single transcript entry/utterance
 */
export interface TranscriptEntry {
  /**
   * Entry ID
   */
  id: string;
  
  /**
   * Speaker identifier
   */
  speakerId: string;
  
  /**
   * Speaker name (if available)
   */
  speakerName?: string;
  
  /**
   * Utterance content
   */
  content: string;
  
  /**
   * Timestamp in seconds from start of transcript
   */
  timestamp: number;
  
  /**
   * Duration of utterance in seconds (if available)
   */
  duration?: number;
  
  /**
   * Additional metadata for the entry
   */
  metadata?: Record<string, any>;
}

/**
 * Speaker identity information
 */
export interface SpeakerIdentity {
  /**
   * Speaker ID
   */
  id: string;
  
  /**
   * Speaker name
   */
  name: string;
  
  /**
   * Alternative identifiers for this speaker
   */
  alternativeIds?: string[];
  
  /**
   * Confidence score for identity (0-1)
   */
  confidence: number;
  
  /**
   * Additional speaker metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Mapping of speaker IDs to their identities
 */
export type SpeakerMap = Map<string, SpeakerIdentity>;

/**
 * Processed transcript with enhanced information
 */
export interface ProcessedTranscript {
  /**
   * Meeting ID
   */
  meetingId: string;
  
  /**
   * Enhanced transcript entries
   */
  entries: EnhancedTranscriptEntry[];
  
  /**
   * Speaker identities
   */
  speakers: SpeakerMap;
  
  /**
   * Source format the transcript was parsed from
   */
  sourceFormat: TranscriptFormat;
  
  /**
   * Processing timestamp
   */
  processedAt: number;
  
  /**
   * Duration of the meeting in seconds
   */
  duration: number;
  
  /**
   * Additional metadata
   */
  metadata: Record<string, any>;
}

/**
 * Enhanced transcript entry with additional information
 */
export interface EnhancedTranscriptEntry extends TranscriptEntry {
  /**
   * Normalized speaker ID
   */
  normalizedSpeakerId: string;
  
  /**
   * Entry index in the transcript
   */
  index: number;
  
  /**
   * Normalized content with corrections
   */
  normalizedContent?: string;
  
  /**
   * Related entries (e.g., replies, references)
   */
  relatedEntryIds?: string[];
}

/**
 * Interface for transcript parser implementations
 */
export interface TranscriptParser {
  /**
   * Parse a transcript input
   */
  parse(input: TranscriptInput): Promise<RawTranscript>;
  
  /**
   * Check if the parser can handle a specific format
   */
  canHandle(format: TranscriptFormat): boolean;
  
  /**
   * Detect if content matches this parser's format
   */
  detectFormat(content: string): boolean;
}

/**
 * Options for enhanced transcript processor
 */
export interface EnhancedTranscriptProcessorOptions {
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Default format to use if not specified or auto-detection fails
   */
  defaultFormat?: TranscriptFormat;
  
  /**
   * Speaker identification service
   */
  speakerIdentificationService?: any;
}

/**
 * Enhanced transcript processor with multi-format support
 * Processes transcripts from various formats into a unified structure
 */
export class EnhancedTranscriptProcessor {
  private logger?: Logger;
  private parsers: Map<TranscriptFormat, TranscriptParser> = new Map();
  private defaultFormat: TranscriptFormat;
  private speakerIdentificationService?: any;
  
  /**
   * Create a new enhanced transcript processor
   */
  constructor(options: EnhancedTranscriptProcessorOptions = {}) {
    this.logger = options.logger;
    this.defaultFormat = options.defaultFormat || TranscriptFormat.PLAIN_TEXT;
    this.speakerIdentificationService = options.speakerIdentificationService;
  }
  
  /**
   * Register a parser for a specific format
   * 
   * @param parser - Parser implementation
   */
  registerParser(parser: TranscriptParser): void {
    for (const format of Object.values(TranscriptFormat)) {
      if (parser.canHandle(format as TranscriptFormat)) {
        this.parsers.set(format as TranscriptFormat, parser);
      }
    }
  }
  
  /**
   * Process a transcript input into an enhanced transcript
   * 
   * @param input - Transcript input to process
   * @returns Processed transcript
   */
  async process(input: TranscriptInput): Promise<ProcessedTranscript> {
    try {
      this.logger?.info('Processing transcript', {
        format: input.format,
        meetingId: input.meetingId,
        contentLength: input.content.length
      });
      
      // Detect format if not specified or auto-detect is requested
      const format = this.detectFormat(input);
      
      // Get appropriate parser
      const parser = this.getParserForFormat(format);
      if (!parser) {
        throw new Error(`No parser available for format: ${format}`);
      }
      
      // Parse the transcript
      const rawTranscript = await parser.parse({
        ...input,
        format
      });
      
      // Enhance the transcript
      return await this.enhanceTranscript(rawTranscript);
    } catch (error) {
      this.logger?.error('Error processing transcript', {
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      
      throw new Error(`Failed to process transcript: ${(error as Error).message}`);
    }
  }
  
  /**
   * Detect the format of a transcript input
   * 
   * @param input - Transcript input to detect format for
   * @returns Detected format
   */
  private detectFormat(input: TranscriptInput): TranscriptFormat {
    // Use specified format if provided and not auto-detect
    if (input.format && input.format !== TranscriptFormat.AUTO_DETECT) {
      return input.format;
    }
    
    // Try to auto-detect format
    for (const [format, parser] of this.parsers.entries()) {
      if (format !== TranscriptFormat.AUTO_DETECT && parser.detectFormat(input.content)) {
        this.logger?.debug(`Auto-detected transcript format: ${format}`);
        return format;
      }
    }
    
    // Fall back to default format
    this.logger?.debug(`Could not auto-detect format, using default: ${this.defaultFormat}`);
    return this.defaultFormat;
  }
  
  /**
   * Get parser for a specific format
   * 
   * @param format - Format to get parser for
   * @returns Parser implementation or undefined if not available
   */
  private getParserForFormat(format: TranscriptFormat): TranscriptParser | undefined {
    return this.parsers.get(format);
  }
  
  /**
   * Enhance a raw transcript with additional information
   * 
   * @param rawTranscript - Raw transcript to enhance
   * @returns Enhanced and processed transcript
   */
  private async enhanceTranscript(rawTranscript: RawTranscript): Promise<ProcessedTranscript> {
    // Calculate total duration based on timestamps
    const duration = this.calculateDuration(rawTranscript.entries);
    
    // Process speaker identification
    const speakerMap = await this.identifySpeakers(rawTranscript);
    
    // Enhance entries with additional information
    const enhancedEntries = this.enhanceEntries(rawTranscript.entries, speakerMap);
    
    // Create metadata if not present
    const metadata = rawTranscript.metadata || {};
    
    // Add processing metadata
    metadata.processingTimestamp = Date.now();
    metadata.enhancementVersion = '1.0';
    
    return {
      meetingId: rawTranscript.meetingId,
      entries: enhancedEntries,
      speakers: speakerMap,
      sourceFormat: rawTranscript.sourceFormat,
      processedAt: Date.now(),
      duration,
      metadata
    };
  }
  
  /**
   * Calculate the total duration of a transcript
   * 
   * @param entries - Transcript entries
   * @returns Duration in seconds
   */
  private calculateDuration(entries: TranscriptEntry[]): number {
    if (entries.length === 0) {
      return 0;
    }
    
    // Sort entries by timestamp to ensure correct calculation
    const sortedEntries = [...entries].sort((a, b) => a.timestamp - b.timestamp);
    
    const lastEntry = sortedEntries[sortedEntries.length - 1];
    const lastDuration = lastEntry.duration || 0;
    
    // Duration is the timestamp of the last entry plus its duration
    return lastEntry.timestamp + lastDuration;
  }
  
  /**
   * Identify speakers in the transcript
   * 
   * @param rawTranscript - Raw transcript
   * @returns Speaker map
   */
  private async identifySpeakers(rawTranscript: RawTranscript): Promise<SpeakerMap> {
    // Create a basic speaker map if no speaker identification service is available
    if (!this.speakerIdentificationService) {
      return this.createBasicSpeakerMap(rawTranscript.entries);
    }
    
    try {
      // Use the speaker identification service
      return await this.speakerIdentificationService.identifySpeakers(rawTranscript);
    } catch (error) {
      this.logger?.warn('Error using speaker identification service, falling back to basic mapping', {
        error: (error as Error).message
      });
      
      // Fall back to basic mapping
      return this.createBasicSpeakerMap(rawTranscript.entries);
    }
  }
  
  /**
   * Create a basic speaker map from transcript entries
   * 
   * @param entries - Transcript entries
   * @returns Basic speaker map
   */
  private createBasicSpeakerMap(entries: TranscriptEntry[]): SpeakerMap {
    const speakerMap = new Map<string, SpeakerIdentity>();
    
    // Collect unique speakers and their names
    const speakerNames = new Map<string, string>();
    for (const entry of entries) {
      if (entry.speakerName && !speakerNames.has(entry.speakerId)) {
        speakerNames.set(entry.speakerId, entry.speakerName);
      }
    }
    
    // Create speaker identities
    for (const [speakerId, speakerName] of speakerNames.entries()) {
      speakerMap.set(speakerId, {
        id: speakerId,
        name: speakerName || `Speaker ${speakerId}`,
        confidence: 1.0,  // High confidence for exact matches
        alternativeIds: []
      });
    }
    
    return speakerMap;
  }
  
  /**
   * Enhance transcript entries with additional information
   * 
   * @param entries - Raw transcript entries
   * @param speakerMap - Speaker map for normalization
   * @returns Enhanced transcript entries
   */
  private enhanceEntries(
    entries: TranscriptEntry[],
    speakerMap: SpeakerMap
  ): EnhancedTranscriptEntry[] {
    return entries.map((entry, index) => {
      // Get normalized speaker ID from speaker map if available
      const speakerIdentity = speakerMap.get(entry.speakerId);
      const normalizedSpeakerId = speakerIdentity?.id || entry.speakerId;
      
      // Create enhanced entry
      return {
        ...entry,
        normalizedSpeakerId,
        index,
        // Normalize content (could implement more sophisticated processing here)
        normalizedContent: this.normalizeContent(entry.content)
      };
    });
  }
  
  /**
   * Normalize content by removing extra whitespace and fixing common issues
   * 
   * @param content - Raw content to normalize
   * @returns Normalized content
   */
  private normalizeContent(content: string): string {
    if (!content) return '';
    
    return content
      // Trim whitespace
      .trim()
      // Replace multiple spaces with a single space
      .replace(/\s+/g, ' ')
      // Fix common OCR/transcription artifacts
      .replace(/\b(\w+)\.\.\.(\w+)\b/g, '$1... $2') // Fix ellipsis without space
      .replace(/([.!?])\s*(\w)/g, '$1 $2'); // Ensure space after sentence endings
  }
} 