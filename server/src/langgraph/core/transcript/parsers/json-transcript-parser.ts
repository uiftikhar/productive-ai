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
 * Options for JSON transcript parser
 */
export interface JsonTranscriptParserOptions {
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Custom mapping for JSON fields
   */
  fieldMapping?: {
    /**
     * Field name for utterance entries
     */
    entriesField?: string;
    
    /**
     * Field name for speaker ID
     */
    speakerIdField?: string;
    
    /**
     * Field name for speaker name
     */
    speakerNameField?: string;
    
    /**
     * Field name for utterance content
     */
    contentField?: string;
    
    /**
     * Field name for timestamp
     */
    timestampField?: string;
    
    /**
     * Field name for duration
     */
    durationField?: string;
  };
}

/**
 * Parser for JSON format transcripts
 * Handles various JSON transcript formats with configurable field mappings
 */
export class JsonTranscriptParser implements TranscriptParser {
  private logger?: Logger;
  private fieldMapping: Required<NonNullable<JsonTranscriptParserOptions['fieldMapping']>>;
  
  /**
   * Create a new JSON transcript parser
   */
  constructor(options: JsonTranscriptParserOptions = {}) {
    this.logger = options.logger;
    
    // Default field mapping
    this.fieldMapping = {
      entriesField: 'entries',
      speakerIdField: 'speakerId',
      speakerNameField: 'speakerName',
      contentField: 'text',
      timestampField: 'timestamp',
      durationField: 'duration',
      ...options.fieldMapping
    };
  }
  
  /**
   * Check if this parser can handle a specific format
   */
  canHandle(format: TranscriptFormat): boolean {
    return format === TranscriptFormat.JSON;
  }
  
  /**
   * Detect if content is in JSON format
   */
  detectFormat(content: string): boolean {
    try {
      // Check if content is valid JSON
      const json = JSON.parse(content);
      
      // JSON should be an object
      if (typeof json !== 'object' || json === null) {
        return false;
      }
      
      // Check for array-like structure 
      const entries = this.findEntriesArray(json);
      
      // Should have at least one entry with expected fields
      return Boolean(entries && Array.isArray(entries) && entries.length > 0);
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Parse a JSON transcript
   */
  async parse(input: TranscriptInput): Promise<RawTranscript> {
    try {
      this.logger?.debug('Parsing JSON transcript', {
        contentLength: input.content.length,
        meetingId: input.meetingId
      });
      
      // Parse JSON content
      const json = JSON.parse(input.content);
      
      // Extract metadata
      const metadata = { ...this.extractMetadata(json), ...input.metadata };
      
      // Find entries array
      const rawEntries = this.findEntriesArray(json);
      if (!rawEntries || !Array.isArray(rawEntries) || rawEntries.length === 0) {
        throw new Error('No transcript entries found in JSON');
      }
      
      // Parse entries
      const entries = this.parseEntries(rawEntries);
      
      // Generate meeting ID if not provided
      const meetingId = input.meetingId || metadata.meetingId || `meeting-${Date.now()}`;
      
      return {
        meetingId,
        entries,
        sourceFormat: TranscriptFormat.JSON,
        metadata: {
          ...metadata,
          parsedAt: Date.now()
        }
      };
    } catch (error) {
      this.logger?.error('Error parsing JSON transcript', {
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      
      throw new Error(`Failed to parse JSON transcript: ${(error as Error).message}`);
    }
  }
  
  /**
   * Find the array of transcript entries in the JSON structure
   */
  private findEntriesArray(json: any): any[] | null {
    // Try using the configured entries field
    if (json[this.fieldMapping.entriesField] && Array.isArray(json[this.fieldMapping.entriesField])) {
      return json[this.fieldMapping.entriesField];
    }
    
    // Try common field names for transcript entries
    const commonFields = ['entries', 'utterances', 'turns', 'messages', 'transcript'];
    for (const field of commonFields) {
      if (json[field] && Array.isArray(json[field])) {
        return json[field];
      }
    }
    
    // Check if the JSON itself is an array of entries
    if (Array.isArray(json) && json.length > 0 && this.looksLikeTranscriptEntry(json[0])) {
      return json;
    }
    
    return null;
  }
  
  /**
   * Check if an object looks like a transcript entry
   */
  private looksLikeTranscriptEntry(obj: any): boolean {
    // Check for common transcript entry fields
    const hasContent = obj[this.fieldMapping.contentField] || 
                      obj.text || 
                      obj.content || 
                      obj.message;
                      
    const hasSpeaker = obj[this.fieldMapping.speakerIdField] || 
                       obj[this.fieldMapping.speakerNameField] || 
                       obj.speaker || 
                       obj.user;
    
    return Boolean(hasContent && hasSpeaker);
  }
  
  /**
   * Extract metadata from the JSON structure
   */
  private extractMetadata(json: any): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    // Extract common metadata fields
    const metadataFields = [
      'meetingId', 'meeting_id', 'id', 
      'title', 'description', 'date', 
      'createdAt', 'created_at'
    ];
    
    for (const field of metadataFields) {
      if (json[field] !== undefined) {
        metadata[field] = json[field];
      }
    }
    
    // Try to find a metadata object
    if (json.metadata && typeof json.metadata === 'object') {
      Object.assign(metadata, json.metadata);
    }
    
    return metadata;
  }
  
  /**
   * Parse raw entries into transcript entries
   */
  private parseEntries(rawEntries: any[]): TranscriptEntry[] {
    const entries: TranscriptEntry[] = [];
    const speakerIds = new Map<string, string>();
    let speakerCounter = 1;
    
    for (let i = 0; i < rawEntries.length; i++) {
      const rawEntry = rawEntries[i];
      
      // Get fields using mapping or common alternatives
      const content = this.getField(rawEntry, this.fieldMapping.contentField, ['text', 'content', 'message']);
      if (!content) continue; // Skip entries without content
      
      // Get speaker information
      const speakerId = this.getField(rawEntry, this.fieldMapping.speakerIdField, ['speaker_id', 'user_id', 'speaker', 'user']);
      const speakerName = this.getField(rawEntry, this.fieldMapping.speakerNameField, ['speaker_name', 'user_name', 'name']);
      
      // Get timestamp and duration
      let timestamp = this.getNumericField(rawEntry, this.fieldMapping.timestampField, ['start_time', 'time']);
      const duration = this.getNumericField(rawEntry, this.fieldMapping.durationField, ['length', 'duration_ms']);
      
      // Default timestamp based on entry index if not provided
      if (timestamp === undefined) {
        timestamp = i * 10; // Assume 10 seconds per entry if no timestamp provided
      }
      
      // Generate consistent speaker ID if not provided
      let normalizedSpeakerId: string;
      const speakerKey = speakerId || speakerName || `unknown_speaker_${i}`;
      
      if (speakerIds.has(speakerKey)) {
        const existingSpeakerId = speakerIds.get(speakerKey);
        normalizedSpeakerId = existingSpeakerId !== undefined ? existingSpeakerId : `speaker_${speakerCounter++}`;
      } else {
        normalizedSpeakerId = speakerId || `speaker_${speakerCounter++}`;
        speakerIds.set(speakerKey, normalizedSpeakerId);
      }
      
      // Create transcript entry
      entries.push({
        id: rawEntry.id || uuidv4(),
        speakerId: normalizedSpeakerId,
        speakerName: speakerName || undefined,
        content,
        timestamp,
        duration: duration !== undefined ? duration : undefined,
        metadata: {
          rawIndex: i,
          ...this.extractEntryMetadata(rawEntry)
        }
      });
    }
    
    return entries;
  }
  
  /**
   * Extract entry-specific metadata
   */
  private extractEntryMetadata(entry: any): Record<string, any> {
    const metadata: Record<string, any> = {};
    const skipFields = [
      this.fieldMapping.contentField,
      this.fieldMapping.speakerIdField,
      this.fieldMapping.speakerNameField,
      this.fieldMapping.timestampField,
      this.fieldMapping.durationField,
      'id'
    ];
    
    // Copy all non-standard fields to metadata
    for (const [key, value] of Object.entries(entry)) {
      if (!skipFields.includes(key)) {
        metadata[key] = value;
      }
    }
    
    return metadata;
  }
  
  /**
   * Get a field value from an object, trying multiple possible field names
   */
  private getField(obj: any, primaryField: string, alternateFields: string[] = []): string | undefined {
    // Try primary field first
    if (obj[primaryField] !== undefined) {
      return String(obj[primaryField]);
    }
    
    // Try alternate fields
    for (const field of alternateFields) {
      if (obj[field] !== undefined) {
        return String(obj[field]);
      }
    }
    
    // Field not found
    return undefined;
  }
  
  /**
   * Get a numeric field value from an object, trying multiple possible field names
   */
  private getNumericField(obj: any, primaryField: string, alternateFields: string[] = []): number | undefined {
    // Try primary field first
    if (obj[primaryField] !== undefined) {
      return Number(obj[primaryField]);
    }
    
    // Try alternate fields
    for (const field of alternateFields) {
      if (obj[field] !== undefined) {
        return Number(obj[field]);
      }
    }
    
    // Field not found
    return undefined;
  }
} 