import { 
  createTranscriptProcessor, 
  TranscriptFormat,
  ProcessedTranscript
} from '../index';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';

/**
 * Sample text transcript
 */
const TEXT_TRANSCRIPT = `
[00:00:10] John Smith: Hello everyone, thanks for joining today's meeting.
[00:00:18] Jane Doe: Hi John, happy to be here.
[00:00:25] Bob Johnson: Can everyone hear me okay?
[00:00:30] John Smith: Yes, we can hear you fine Bob.
[00:00:45] Jane Doe: Let's get started with the agenda.
`;

/**
 * Sample JSON transcript
 */
const JSON_TRANSCRIPT = JSON.stringify({
  meetingId: "meeting-123",
  title: "Project Planning Meeting",
  date: "2023-05-15",
  entries: [
    { speakerId: "1", speakerName: "John Smith", text: "Hello everyone, welcome to our planning meeting.", timestamp: 10 },
    { speakerId: "2", speakerName: "Jane Doe", text: "Thanks John, I've prepared some slides to share.", timestamp: 20 },
    { speakerId: "3", speakerName: "Bob Johnson", text: "I have some questions about the timeline.", timestamp: 35 },
    { speakerId: "1", speakerName: "John Smith", text: "Sure Bob, we'll get to that after Jane's presentation.", timestamp: 45 }
  ]
});

/**
 * Sample VTT transcript
 */
const VTT_TRANSCRIPT = `WEBVTT

00:00:10.000 --> 00:00:17.000
John Smith: Hello everyone, thanks for joining today's meeting.

00:00:18.000 --> 00:00:24.000
Jane Doe: Hi John, happy to be here.

00:00:25.000 --> 00:00:29.000
Bob Johnson: Can everyone hear me okay?

00:00:30.000 --> 00:00:44.000
John Smith: Yes, we can hear you fine Bob.

00:00:45.000 --> 00:00:55.000
Jane Doe: Let's get started with the agenda.
`;

/**
 * Sample Zoom transcript
 */
const ZOOM_TRANSCRIPT = `Meeting: Project Discussion
Date: May 15, 2023
Recording started: 09:00 AM

00:00:10 John Smith (Host): Hello everyone, thanks for joining today's meeting.
00:00:18 Jane Doe: Hi John, happy to be here.
00:00:25 Bob Johnson: Can everyone hear me okay?
00:00:30 John Smith (Host): Yes, we can hear you fine Bob.
00:00:45 Jane Doe: Let's get started with the agenda.
`;

/**
 * Process a transcript using the enhanced transcript processor
 * 
 * @param name Name of the transcript for display purposes
 * @param content Raw transcript content
 * @param format Format of the transcript
 */
async function processTranscript(
  name: string,
  content: string,
  format: TranscriptFormat
): Promise<void> {
  console.log(`\n\n--- Processing ${name} ---`);
  
  try {
    // Create a processor with known participants for better speaker identification
    const processor = createTranscriptProcessor({
      logger: new ConsoleLogger(),
      speakerIdentificationOptions: {
        knownParticipants: [
          { id: 'john', name: 'John Smith', aliases: ['John', 'Johnny'] },
          { id: 'jane', name: 'Jane Doe', aliases: ['Jane'] },
          { id: 'bob', name: 'Bob Johnson', aliases: ['Bob', 'Robert'] }
        ],
        useFuzzyMatching: true
      }
    });
    
    // Process the transcript
    const result = await processor.process({
      content,
      format,
      meetingId: `demo-${Date.now()}`,
      metadata: {
        source: name,
        processingTime: new Date().toISOString()
      }
    });
    
    // Display processed results
    displayProcessedTranscript(result);
    
  } catch (error) {
    console.error(`Error processing ${name}:`, error);
  }
}

/**
 * Display the processed transcript in a user-friendly format
 * 
 * @param transcript Processed transcript to display
 */
function displayProcessedTranscript(transcript: ProcessedTranscript): void {
  console.log(`Meeting ID: ${transcript.meetingId}`);
  console.log(`Format: ${transcript.sourceFormat}`);
  console.log(`Duration: ${formatTimestamp(transcript.duration)}`);
  console.log(`Processed at: ${new Date(transcript.processedAt).toLocaleString()}`);
  
  // Display speaker information
  console.log(`\nSpeakers (${transcript.speakers.size}):`);
  for (const speaker of transcript.speakers.values()) {
    console.log(`  - ${speaker.name} (ID: ${speaker.id}, Confidence: ${Math.round(speaker.confidence * 100)}%)`);
    if (speaker.alternativeIds?.length) {
      console.log(`    Alternative IDs: ${speaker.alternativeIds.join(', ')}`);
    }
  }
  
  // Display entries
  console.log(`\nTranscript (${transcript.entries.length} entries):`);
  transcript.entries.forEach((entry, i) => {
    const speaker = transcript.speakers.get(entry.normalizedSpeakerId);
    const speakerName = speaker ? speaker.name : entry.speakerName || entry.speakerId;
    
    console.log(`  [${formatTimestamp(entry.timestamp)}] ${speakerName}: ${entry.content}`);
  });
  
  // Display metadata
  console.log(`\nMetadata:`);
  console.log(`  Source format: ${transcript.sourceFormat}`);
  for (const [key, value] of Object.entries(transcript.metadata)) {
    if (key !== 'parsedAt' && key !== 'processingTimestamp') {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
  }
}

/**
 * Format a timestamp in seconds to a human-readable format (MM:SS)
 * 
 * @param seconds Timestamp in seconds
 * @returns Formatted timestamp
 */
function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Main function to run all examples
 */
async function main(): Promise<void> {
  console.log("Transcript Processing Framework - Examples\n");
  
  // Process transcripts in different formats
  await processTranscript("TEXT_TRANSCRIPT", TEXT_TRANSCRIPT, TranscriptFormat.PLAIN_TEXT);
  await processTranscript("JSON_TRANSCRIPT", JSON_TRANSCRIPT, TranscriptFormat.JSON);
  await processTranscript("VTT_TRANSCRIPT", VTT_TRANSCRIPT, TranscriptFormat.VTT);
  await processTranscript("ZOOM_TRANSCRIPT", ZOOM_TRANSCRIPT, TranscriptFormat.ZOOM);
  
  // Demonstrate auto-detection
  console.log("\n\n--- Testing Format Auto-Detection ---");
  
  const processor = createTranscriptProcessor({
    logger: new ConsoleLogger(),
  });
  
  const formats = [
    { name: "TEXT_TRANSCRIPT", content: TEXT_TRANSCRIPT },
    { name: "JSON_TRANSCRIPT", content: JSON_TRANSCRIPT },
    { name: "VTT_TRANSCRIPT", content: VTT_TRANSCRIPT },
    { name: "ZOOM_TRANSCRIPT", content: ZOOM_TRANSCRIPT }
  ];
  
  for (const format of formats) {
    try {
      const result = await processor.process({
        content: format.content,
        format: TranscriptFormat.AUTO_DETECT,
        meetingId: `auto-${Date.now()}`
      });
      
      console.log(`${format.name} detected as: ${result.sourceFormat}`);
    } catch (error) {
      console.error(`Error auto-detecting ${format.name}:`, error);
    }
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error("Error running example:", error);
    process.exit(1);
  });
}

// Export for testing
export { processTranscript, displayProcessedTranscript, formatTimestamp, main }; 