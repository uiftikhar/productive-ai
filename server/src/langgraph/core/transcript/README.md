# Transcript Processing Framework

A robust, extensible framework for processing meeting transcripts in various formats. The framework can parse and normalize transcripts from different sources into a unified format, identify speakers, and provide structured data for analysis.

## Features

- **Multi-format support**: Process transcripts in various formats (plain text, JSON, VTT/SRT, Zoom)
- **Format auto-detection**: Automatically determine transcript format from content
- **Speaker identification**: Normalize speaker identities across transcripts
- **Custom parsers**: Extend with custom parsers for additional formats
- **Comprehensive metadata**: Track and enrich transcript data with metadata

## Architecture

The framework consists of the following core components:

1. **EnhancedTranscriptProcessor**: The main processor that orchestrates the parsing and enhancement of transcripts
2. **TranscriptParser implementations**: Format-specific parsers for different transcript formats
3. **SpeakerIdentificationService**: Service for identifying and normalizing speaker identities
4. **Factory function**: A convenience function to create fully configured processor instances

## Supported Formats

- **Plain Text** (`TranscriptFormat.PLAIN_TEXT`): Simple text with speaker name prefixes
- **JSON** (`TranscriptFormat.JSON`): Structured JSON with configurable field mappings
- **VTT/SRT** (`TranscriptFormat.VTT`): Web Video Text Tracks format and SubRip Text format
- **Zoom** (`TranscriptFormat.ZOOM`): Zoom meeting transcript format
- **Auto-detect** (`TranscriptFormat.AUTO_DETECT`): Automatically detect the format

## Usage

### Basic Usage

```typescript
import { createTranscriptProcessor, TranscriptFormat } from './transcript';

// Create a processor with default options
const processor = createTranscriptProcessor();

// Process a transcript
const result = await processor.process({
  content: "John: Hello\nJane: Hi John",
  format: TranscriptFormat.PLAIN_TEXT,
  meetingId: "meeting-123"
});

// Access the processed data
console.log(`Meeting ID: ${result.meetingId}`);
console.log(`Duration: ${result.duration} seconds`);
console.log(`Speaker count: ${result.speakers.size}`);

// Access normalized entries
for (const entry of result.entries) {
  const speaker = result.speakers.get(entry.normalizedSpeakerId);
  console.log(`[${entry.timestamp}s] ${speaker?.name}: ${entry.content}`);
}
```

### With Speaker Identification

```typescript
import { createTranscriptProcessor, TranscriptFormat } from './transcript';

// Create processor with known participants for better speaker identification
const processor = createTranscriptProcessor({
  speakerIdentificationOptions: {
    knownParticipants: [
      { id: 'john', name: 'John Smith', aliases: ['John', 'Johnny'] },
      { id: 'jane', name: 'Jane Doe', aliases: ['Jane'] }
    ],
    useFuzzyMatching: true
  }
});

// Process a transcript with auto-detection
const result = await processor.process({
  content: transcriptContent,
  format: TranscriptFormat.AUTO_DETECT
});
```

### Custom Configuration

```typescript
import { 
  EnhancedTranscriptProcessor,
  TextTranscriptParser,
  JsonTranscriptParser,
  SpeakerIdentificationService
} from './transcript';

// Create components with custom configuration
const speakerService = new SpeakerIdentificationService({
  similarityThreshold: 0.7
});

const processor = new EnhancedTranscriptProcessor({
  speakerIdentificationService: speakerService,
  defaultFormat: TranscriptFormat.PLAIN_TEXT
});

// Register only the parsers you need
processor.registerParser(new TextTranscriptParser());
processor.registerParser(new JsonTranscriptParser({
  fieldMapping: {
    entriesField: 'utterances',
    speakerIdField: 'userId',
    contentField: 'message'
  }
}));
```

## Extending with Custom Parsers

You can extend the framework with custom parsers for additional transcript formats:

```typescript
import { 
  TranscriptParser,
  TranscriptFormat,
  TranscriptInput,
  RawTranscript
} from './transcript';

// Define a new format
enum CustomTranscriptFormat {
  MY_FORMAT = 'my_format'
}

// Extend TranscriptFormat to include your custom format
declare module './transcript' {
  export enum TranscriptFormat {
    MY_FORMAT = 'my_format'
  }
}

// Implement a custom parser
class MyCustomParser implements TranscriptParser {
  canHandle(format: TranscriptFormat): boolean {
    return format === CustomTranscriptFormat.MY_FORMAT;
  }
  
  detectFormat(content: string): boolean {
    // Implement format detection logic
    return content.includes('MY-FORMAT-IDENTIFIER');
  }
  
  async parse(input: TranscriptInput): Promise<RawTranscript> {
    // Implement parsing logic
    const entries = /* parse the transcript */;
    
    return {
      meetingId: input.meetingId || `meeting-${Date.now()}`,
      entries,
      sourceFormat: CustomTranscriptFormat.MY_FORMAT,
      metadata: { ...input.metadata }
    };
  }
}

// Register the custom parser
const processor = createTranscriptProcessor();
processor.registerParser(new MyCustomParser());
```

## API Reference

### EnhancedTranscriptProcessor

The main processor class that orchestrates transcript processing.

```typescript
class EnhancedTranscriptProcessor {
  constructor(options?: EnhancedTranscriptProcessorOptions);
  registerParser(parser: TranscriptParser): void;
  process(input: TranscriptInput): Promise<ProcessedTranscript>;
}
```

### TranscriptInput

Input for transcript processing.

```typescript
interface TranscriptInput {
  content: string;
  format?: TranscriptFormat;
  metadata?: Record<string, any>;
  meetingId?: string;
}
```

### ProcessedTranscript

Result of transcript processing with enhanced information.

```typescript
interface ProcessedTranscript {
  meetingId: string;
  entries: EnhancedTranscriptEntry[];
  speakers: SpeakerMap;
  sourceFormat: TranscriptFormat;
  processedAt: number;
  duration: number;
  metadata: Record<string, any>;
}
```

## Examples

See the [transcript-processor-example.ts](./examples/transcript-processor-example.ts) file for comprehensive usage examples.

## License

This framework is part of the Productive AI project and is subject to its licensing terms. 