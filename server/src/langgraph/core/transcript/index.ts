// Enhanced transcript processor and core types
export * from './enhanced-transcript-processor';
export * from './speaker-identification.service';

// Format-specific parsers
export * from './parsers/text-transcript-parser';
export * from './parsers/json-transcript-parser';
export * from './parsers/vtt-transcript-parser';
export * from './parsers/zoom-transcript-parser';

// Factory function to create a fully configured transcript processor with all parsers
import { 
  EnhancedTranscriptProcessor,
  TranscriptFormat,
  TranscriptInput,
  RawTranscript,
  TranscriptEntry,
  ProcessedTranscript,
  EnhancedTranscriptProcessorOptions,
  SpeakerIdentity,
  SpeakerMap
} from './enhanced-transcript-processor';
import { TextTranscriptParser } from './parsers/text-transcript-parser';
import { JsonTranscriptParser } from './parsers/json-transcript-parser';
import { VttTranscriptParser } from './parsers/vtt-transcript-parser';
import { ZoomTranscriptParser } from './parsers/zoom-transcript-parser';
import { SpeakerIdentificationService, SpeakerIdentificationOptions } from './speaker-identification.service';

/**
 * Options for creating a transcript processor
 */
export interface CreateTranscriptProcessorOptions extends EnhancedTranscriptProcessorOptions {
  /**
   * Options for speaker identification
   */
  speakerIdentificationOptions?: SpeakerIdentificationOptions;
}

/**
 * Create a fully configured transcript processor with all parsers registered
 * 
 * @param options Options for creating the processor
 * @returns Configured transcript processor
 */
export function createTranscriptProcessor(
  options: CreateTranscriptProcessorOptions = {}
): EnhancedTranscriptProcessor {
  // Create a speaker identification service if needed
  const speakerIdentificationService = options.speakerIdentificationOptions ? 
    new SpeakerIdentificationService(options.speakerIdentificationOptions) : 
    options.speakerIdentificationService;
  
  // Create processor with options
  const processor = new EnhancedTranscriptProcessor({
    ...options,
    speakerIdentificationService
  });
  
  // Register all parsers
  processor.registerParser(new TextTranscriptParser({ logger: options.logger }));
  processor.registerParser(new JsonTranscriptParser({ logger: options.logger }));
  processor.registerParser(new VttTranscriptParser({ logger: options.logger }));
  processor.registerParser(new ZoomTranscriptParser({ logger: options.logger }));
  
  return processor;
}

// Export all types and classes
export {
  EnhancedTranscriptProcessor,
  TranscriptFormat,
  TranscriptInput,
  RawTranscript,
  TranscriptEntry,
  ProcessedTranscript,
  SpeakerIdentity,
  SpeakerMap,
  SpeakerIdentificationService,
  SpeakerIdentificationOptions,
  TextTranscriptParser,
  JsonTranscriptParser,
  VttTranscriptParser,
  ZoomTranscriptParser
}; 