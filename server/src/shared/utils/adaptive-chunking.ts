/**
 * Adaptive Chunking Utilities
 *
 * Implements advanced adaptive chunking algorithms for transcript processing
 * with content-aware boundary detection and dynamic size adjustment.
 */

import { splitTranscript } from './split-transcript';

/**
 * Segment type in a transcript
 */
export enum TranscriptSegmentType {
  INTRODUCTION = 'introduction',
  MAIN_DISCUSSION = 'main_discussion',
  TOPIC_TRANSITION = 'topic_transition',
  ACTION_ITEMS = 'action_items',
  DECISIONS = 'decisions',
  CONCLUSION = 'conclusion',
  Q_AND_A = 'q_and_a',
  GENERAL = 'general',
}

/**
 * Result of transcript segment detection
 */
export interface TranscriptSegment {
  type: TranscriptSegmentType;
  text: string;
  startIndex: number;
  endIndex: number;
  importance: number; // 0-1 scale
  speakers?: string[];
  keywords?: string[];
}

/**
 * Configuration for adaptive chunking
 */
export interface AdaptiveChunkingConfig {
  baseChunkSize: number;
  minChunkSize: number;
  maxChunkSize: number;
  overlapSize: number;
  importantContentMultiplier: number;
  preserveParagraphs: boolean;
  preserveSpeakerTurns: boolean;
  chunkImportantContentSeparately: boolean;
  contentTypes: {
    [key in TranscriptSegmentType]?: {
      importance: number;
      chunkSizeMultiplier: number;
    };
  };
}

/**
 * Default configuration for the adaptive chunking algorithm
 */
const DEFAULT_CONFIG: AdaptiveChunkingConfig = {
  baseChunkSize: 2000,
  minChunkSize: 800,
  maxChunkSize: 3500,
  overlapSize: 200,
  importantContentMultiplier: 0.6,
  preserveParagraphs: true,
  preserveSpeakerTurns: true,
  chunkImportantContentSeparately: true,
  contentTypes: {
    [TranscriptSegmentType.INTRODUCTION]: {
      importance: 0.7,
      chunkSizeMultiplier: 0.8,
    },
    [TranscriptSegmentType.MAIN_DISCUSSION]: {
      importance: 0.8,
      chunkSizeMultiplier: 1.0,
    },
    [TranscriptSegmentType.TOPIC_TRANSITION]: {
      importance: 0.9,
      chunkSizeMultiplier: 0.7,
    },
    [TranscriptSegmentType.ACTION_ITEMS]: {
      importance: 1.0,
      chunkSizeMultiplier: 0.6,
    },
    [TranscriptSegmentType.DECISIONS]: {
      importance: 1.0,
      chunkSizeMultiplier: 0.6,
    },
    [TranscriptSegmentType.CONCLUSION]: {
      importance: 0.8,
      chunkSizeMultiplier: 0.8,
    },
    [TranscriptSegmentType.Q_AND_A]: {
      importance: 0.7,
      chunkSizeMultiplier: 0.9,
    },
    [TranscriptSegmentType.GENERAL]: {
      importance: 0.5,
      chunkSizeMultiplier: 1.0,
    },
  },
};

/**
 * Adaptive transcript chunking with content-aware boundary detection
 *
 * This algorithm:
 * 1. Segments the transcript by content type
 * 2. Adjusts chunk sizes based on content importance
 * 3. Preserves natural boundaries like paragraph breaks and speaker turns
 * 4. Ensures high-value content receives more focused processing
 * 5. Maintains context through intelligent overlapping
 *
 * @param transcript Full transcript text to process
 * @param config Optional configuration parameters
 * @returns Array of optimally chunked transcript segments
 */
export function chunkTranscriptAdaptively(
  transcript: string,
  config: Partial<AdaptiveChunkingConfig> = {},
): string[] {
  // Merge provided config with defaults
  const fullConfig: AdaptiveChunkingConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    contentTypes: {
      ...DEFAULT_CONFIG.contentTypes,
      ...(config.contentTypes || {}),
    },
  };

  // Step 1: Identify content segments and their types
  const segments = identifyContentSegments(transcript);

  // Step 2: Process each segment with appropriate chunking parameters
  const processedChunks: string[] = [];

  // First chunk start with the identified segments
  segments.forEach((segment) => {
    // Get content type configuration
    const typeConfig =
      fullConfig.contentTypes[segment.type] ||
      fullConfig.contentTypes[TranscriptSegmentType.GENERAL]!;

    // Calculate adjusted chunk size based on content importance
    const adjustedSize = Math.min(
      fullConfig.maxChunkSize,
      Math.max(
        fullConfig.minChunkSize,
        Math.floor(fullConfig.baseChunkSize * typeConfig.chunkSizeMultiplier),
      ),
    );

    // Determine if segment should be isolated or combined
    if (
      fullConfig.chunkImportantContentSeparately &&
      segment.importance > 0.8
    ) {
      // For highly important content, use independent chunking to ensure focus
      const segmentChunks = splitTranscript(
        segment.text,
        adjustedSize,
        fullConfig.overlapSize,
      );
      processedChunks.push(...segmentChunks);
    } else {
      // For regular content, use the base transcript splitter
      const segmentText = segment.text;

      // Only create a new chunk if text is substantial
      if (segmentText.length > 100) {
        const segmentChunks = splitTranscript(
          segmentText,
          adjustedSize,
          fullConfig.overlapSize,
        );
        processedChunks.push(...segmentChunks);
      }
    }
  });

  // Step 3: Merge small adjacent chunks if they're below the minimum threshold
  return mergeSmallChunks(processedChunks, fullConfig.minChunkSize);
}

/**
 * Identifies different content segments in a transcript
 * based on linguistic patterns and structure
 */
function identifyContentSegments(transcript: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = transcript.split('\n');

  // Pattern matching for different content types
  const patterns = {
    introduction: [
      /welcome/i,
      /agenda/i,
      /today we'll/i,
      /introductions?/i,
      /let's get started/i,
      /begin the meeting/i,
      /kick off/i,
    ],
    actionItems: [
      /action items?/i,
      /takeaways?/i,
      /assignments?/i,
      /to-?dos?/i,
      /tasks?/i,
      /will do/i,
      /should do/i,
      /need to/i,
      /going to/i,
    ],
    decisions: [
      /decisions?/i,
      /decided/i,
      /agreed/i,
      /consensus/i,
      /vote/i,
      /approved/i,
      /finalized/i,
      /conclusion/i,
      /resolved/i,
    ],
    topicTransition: [
      /moving on/i,
      /next topic/i,
      /next item/i,
      /next on the agenda/i,
      /let's discuss/i,
      /turning to/i,
      /shifting to/i,
      /changing gears/i,
    ],
    conclusion: [
      /in summary/i,
      /to summarize/i,
      /wrapping up/i,
      /concluding/i,
      /final thoughts/i,
      /closing/i,
      /meeting adjourned/i,
      /thank you all/i,
    ],
    qAndA: [
      /\bq:|\bq&a\b|questions?|any concerns/i,
      /\?.*\b(yes|no|maybe|perhaps)\b/i,
      /does anyone/i,
      /can anyone/i,
    ],
  };

  // Process the transcript line by line to identify segments
  let currentType = TranscriptSegmentType.GENERAL;
  let currentSegment: TranscriptSegment = {
    type: currentType,
    text: '',
    startIndex: 0,
    endIndex: 0,
    importance: 0.5,
    speakers: [],
  };

  let paragraphBuffer = '';
  let currentIndex = 0;

  // First pass: identify segment types
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLength = line.length;
    currentIndex += lineLength + 1; // +1 for the newline

    // Extract potential speaker
    const speakerMatch =
      line.match(/^([A-Z][a-z]+(?: [A-Z][a-z]+)?):/) ||
      line.match(/^\[([^\]]+)\]/) ||
      line.match(/^<([^>]+)>/);

    if (speakerMatch && speakerMatch[1]) {
      if (!currentSegment.speakers?.includes(speakerMatch[1])) {
        currentSegment.speakers?.push(speakerMatch[1]);
      }
    }

    // Check for content type indicators
    let detectedType: TranscriptSegmentType | null = null;

    // First 10% of transcript likely introduction
    if (currentIndex < transcript.length * 0.1) {
      if (patterns.introduction.some((pattern) => pattern.test(line))) {
        detectedType = TranscriptSegmentType.INTRODUCTION;
      }
    }
    // Last 10% of transcript likely conclusion
    else if (currentIndex > transcript.length * 0.9) {
      if (patterns.conclusion.some((pattern) => pattern.test(line))) {
        detectedType = TranscriptSegmentType.CONCLUSION;
      }
    }

    // Check for action items
    if (patterns.actionItems.some((pattern) => pattern.test(line))) {
      detectedType = TranscriptSegmentType.ACTION_ITEMS;
    }
    // Check for decisions
    else if (patterns.decisions.some((pattern) => pattern.test(line))) {
      detectedType = TranscriptSegmentType.DECISIONS;
    }
    // Check for topic transitions
    else if (patterns.topicTransition.some((pattern) => pattern.test(line))) {
      detectedType = TranscriptSegmentType.TOPIC_TRANSITION;
    }
    // Check for Q&A sections
    else if (patterns.qAndA.some((pattern) => pattern.test(line))) {
      detectedType = TranscriptSegmentType.Q_AND_A;
    }

    // If we've detected a type change
    if (detectedType && detectedType !== currentType) {
      // Save current segment if it has content
      if (currentSegment.text.trim().length > 0) {
        currentSegment.endIndex = currentIndex - lineLength - 1;
        segments.push({
          ...currentSegment,
          speakers: currentSegment.speakers,
        });
      }

      // Start new segment
      currentType = detectedType;

      // Get importance from config, defaulting to 0.5 if not found
      const segmentImportance =
        DEFAULT_CONFIG.contentTypes[currentType]?.importance ?? 0.5;

      // Modify the TranscriptSegment creation to avoid type issues
      const newSegment: TranscriptSegment = {
        type: TranscriptSegmentType.GENERAL, // Start with GENERAL
        text: '',
        startIndex: currentIndex - lineLength - 1,
        endIndex: 0,
        importance: segmentImportance,
        speakers: [],
      };
      
      // Then assign the actual type
      newSegment.type = currentType;
      
      // Use the properly typed segment
      currentSegment = {
        ...newSegment,
        speakers: [],
      };
    }

    // Add current line to segment
    currentSegment.text += line + '\n';

    // If we have a paragraph break or substantial speaker change, consider ending segment
    if (line.trim() === '' && paragraphBuffer.trim().length > 0) {
      paragraphBuffer = '';
    } else {
      paragraphBuffer += line + '\n';
    }
  }

  // Add the final segment
  if (currentSegment.text.trim().length > 0) {
    currentSegment.endIndex = currentIndex;
    segments.push({
      ...currentSegment,
      speakers: currentSegment.speakers,
    });
  }

  // If we didn't identify any segments, create a default one
  if (segments.length === 0) {
    segments.push({
      type: TranscriptSegmentType.GENERAL,
      text: transcript,
      startIndex: 0,
      endIndex: transcript.length,
      importance: 0.5,
      speakers: [],
    });
  }

  // Ensure segments cover the entire transcript
  fillSegmentGaps(segments, transcript);

  return segments;
}

/**
 * Ensures there are no gaps between segments
 */
function fillSegmentGaps(
  segments: TranscriptSegment[],
  transcript: string,
): void {
  segments.sort((a, b) => a.startIndex - b.startIndex);

  for (let i = 0; i < segments.length - 1; i++) {
    const currentSegment = segments[i];
    const nextSegment = segments[i + 1];

    // Check if there's a gap
    if (currentSegment.endIndex < nextSegment.startIndex) {
      // Extract the gap text
      const gapText = transcript.substring(
        currentSegment.endIndex,
        nextSegment.startIndex,
      );

      // Only create a new segment if the gap has meaningful content
      if (gapText.trim().length > 0) {
        segments.splice(i + 1, 0, {
          type: TranscriptSegmentType.GENERAL,
          text: gapText,
          startIndex: currentSegment.endIndex,
          endIndex: nextSegment.startIndex,
          importance: 0.5,
          speakers: [],
        });
        i++; // Skip the newly inserted segment
      } else {
        // If it's just whitespace, extend the previous segment
        currentSegment.endIndex = nextSegment.startIndex;
      }
    }
  }
}

/**
 * Merge small adjacent chunks to ensure minimum chunk size
 */
function mergeSmallChunks(chunks: string[], minSize: number): string[] {
  if (chunks.length <= 1) return chunks;

  const result: string[] = [];
  let currentChunk = chunks[0];

  for (let i = 1; i < chunks.length; i++) {
    const nextChunk = chunks[i];
    const combinedSize = countTokens(currentChunk) + countTokens(nextChunk);

    // If the combined size is still reasonable, merge them
    if (combinedSize < minSize * 1.5) {
      currentChunk = currentChunk + '\n\n' + nextChunk;
    } else {
      // Current chunk is big enough, add it to results
      result.push(currentChunk);
      currentChunk = nextChunk;
    }
  }

  // Add the last chunk
  if (currentChunk) {
    result.push(currentChunk);
  }

  return result;
}

/**
 * Approximate token count for sizing purposes
 */
function countTokens(text: string): number {
  return text.split(/\s+/).length;
}
