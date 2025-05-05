/**
 * Content Segment Identification Utility
 *
 * Identifies different types of segments in a transcript based on content patterns.
 */

import { TranscriptSegment, TranscriptSegmentType } from './adaptive-chunking';

/**
 * Identifies different content segments in a transcript
 * based on linguistic patterns and structure
 *
 * @param transcript The transcript text to analyze
 * @returns Array of transcript segments with type and importance
 */
export function identifyContentSegments(
  transcript: string,
): TranscriptSegment[] {
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

    if (speakerMatch && speakerMatch[1] && currentSegment.speakers) {
      if (!currentSegment.speakers.includes(speakerMatch[1])) {
        currentSegment.speakers.push(speakerMatch[1]);
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
        });
      }

      // Start new segment
      currentType = detectedType;

      // Define importance based on content type
      let segmentImportance = 0.5; // Default importance

      // Use if/else instead of switch to avoid TypeScript type issues
      if (currentType === TranscriptSegmentType.ACTION_ITEMS || 
          currentType === TranscriptSegmentType.DECISIONS) {
        segmentImportance = 1.0; // Highest importance
      } else if (currentType === TranscriptSegmentType.TOPIC_TRANSITION) {
        segmentImportance = 0.9;
      } else if (currentType === TranscriptSegmentType.INTRODUCTION || 
                 currentType === TranscriptSegmentType.CONCLUSION) {
        segmentImportance = 0.8;
      } else if (currentType === TranscriptSegmentType.Q_AND_A) {
        segmentImportance = 0.7;
      } else if (currentType === TranscriptSegmentType.MAIN_DISCUSSION) {
        segmentImportance = 0.8;
      } else {
        // GENERAL and any other types
        segmentImportance = 0.5;
      }

      currentSegment = {
        type: currentType,
        text: '',
        startIndex: currentIndex - lineLength - 1,
        endIndex: 0,
        importance: segmentImportance,
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
